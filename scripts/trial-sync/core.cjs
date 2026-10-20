'use strict';
const {createHash}=require('node:crypto');
const copy=x=>structuredClone(x);
function canonical(x){
 if(x===null||typeof x!=='object')return JSON.stringify(x);
 if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
 return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
}
const hash=x=>createHash('sha256').update(canonical(x)).digest('hex');
function document(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!value.meta||typeof value.meta!=='object'||Array.isArray(value.meta)||!Array.isArray(value.rows))throw Error('Invalid schedule document');
 const d=copy(value);delete d.savedAt;return d;
}
function snapshot(value){
 if(!value||typeof value.version!=='string'||!value.version||!value.guard||typeof value.guard!=='object')throw Error('Invalid adapter snapshot');
 return {...copy(value),document:document(value.document)};
}
function same(a,b){return hash(a)===hash(b);}
function sameSnapshot(a,b){return a.version===b.version&&same(a.document,b.document)&&same(a.guard,b.guard);}
function classify(entry,left,right){
 if(!entry.base)return same(left.document,right.document)?'establish':'initial-conflict';
 if(!same(entry.guards.netlify,left.guard)||!same(entry.guards.supabase,right.guard))return 'structure-conflict';
 if(same(left.document,right.document))return same(left.document,entry.base)?'unchanged':'converged';
 const l=!same(left.document,entry.base),r=!same(right.document,entry.base);
 return l&&r?'content-conflict':l?'to-supabase':'to-netlify';
}
async function observe(adapters,mapping){
 const [l,r]=await Promise.all([adapters.netlify.read(mapping),adapters.supabase.read(mapping)]);
 return {netlify:snapshot(l),supabase:snapshot(r)};
}
// Checkpoints must be durable before this function is allowed to issue a write.
async function inspect(state,mapping,adapters,checkpoint){
 const e=state.entries[mapping.id]??={base:null,guards:null,pending:null,status:'uninitialized'};
 try{
  const pair=await observe(adapters,mapping);
  e.observed=pair;e.checkedAt=new Date().toISOString();delete e.error;
  if(e.pending){
   const p=e.pending,dest=pair[p.destination];
   if(same(dest.document,p.document)&&same(dest.guard,p.before[p.destination].guard)){
    e.base=copy(p.document);e.guards={netlify:copy(p.before.netlify.guard),supabase:copy(p.before.supabase.guard)};
    e.pending=null;e.status='recovered';await checkpoint(state);
   }else{
    // A dropped acknowledgement could hide a successful save followed by another edit.
    // Never replay an uncertain operation, even when the current content looks old.
    e.status='uncertain';await checkpoint(state);return e;
   }
  }
  e.status=classify(e,pair.netlify,pair.supabase);await checkpoint(state);return e;
 }catch(error){e.status='unavailable';e.checkedAt=new Date().toISOString();e.error=error.code||'READ_FAILED';await checkpoint(state);return e;}
}
function acceptBaseline(e,pair){e.base=copy(pair.netlify.document);e.guards={netlify:copy(pair.netlify.guard),supabase:copy(pair.supabase.guard)};e.status='synced';e.syncedAt=new Date().toISOString();delete e.error;}
async function apply(state,mapping,adapters,checkpoint,options={}){
 const e=await inspect(state,mapping,adapters,checkpoint);
 if(!e.observed)return e;
 if(e.pending){
  if(!options.resolution)return e;
  if(e.status!=='uncertain'||options.resolution.reviewHash!==hash(e.observed))throw Error('Uncertain operation changed; review a fresh report');
  if(!same(e.pending.before.netlify.guard,e.observed.netlify.guard)||!same(e.pending.before.supabase.guard,e.observed.supabase.guard))throw Error('Structural changes require separate reconciliation');
  if(!['netlify','supabase'].includes(options.resolution.take))throw Error('Invalid resolution');
  // Explicit operator resolution closes an uncertain intent. The archived
  // checkpoint retains its exact payload and both versions before it is cleared.
  e.resolvedUncertainty={intent:e.pending,resolution:options.resolution,at:new Date().toISOString()};
  e.pending=null;e.status='content-conflict';await checkpoint(state);
 }
 if(['establish','converged','unchanged'].includes(e.status)){
  acceptBaseline(e,e.observed);await checkpoint(state);return e;
 }
 let destination=e.status==='to-supabase'?'supabase':e.status==='to-netlify'?'netlify':null;
 if(options.resolution){
  // A resolution is tied to an exact reviewed report; it cannot approve newer edits.
  if(!['content-conflict','initial-conflict'].includes(e.status))throw Error('Only document conflicts can be resolved here');
  if(options.resolution.reviewHash!==hash(e.observed))throw Error('Conflict changed; generate and review a fresh report');
  if(!['netlify','supabase'].includes(options.resolution.take))throw Error('Invalid resolution');
  destination=options.resolution.take==='netlify'?'supabase':'netlify';
 }
 if(!destination)return e;
 const before=copy(e.observed),source=destination==='netlify'?'supabase':'netlify';
 // Re-read BOTH sides after the decision. The destination adapter must additionally
 // perform an atomic conditional write; this read alone is not a concurrency guard.
 let latest;try{latest=await observe(adapters,mapping);}catch(error){e.status='unavailable';e.error=error.code||'READ_FAILED';await checkpoint(state);return e;}
 if(!sameSnapshot(before.netlify,latest.netlify)||!sameSnapshot(before.supabase,latest.supabase)){
  e.status='changed-before-write';e.observed=latest;await checkpoint(state);return e;
 }
 const intent={id:require('node:crypto').randomUUID(),destination,document:copy(before[source].document),before,resolution:options.resolution||null,preparedAt:new Date().toISOString()};
 e.pending=intent;e.status='pending';await checkpoint(state);
 try{
  const acknowledged=snapshot(await adapters[destination].write(mapping,before[destination],intent.document,intent.id));
  if(!same(acknowledged.document,intent.document)||!same(acknowledged.guard,before[destination].guard)||acknowledged.version===before[destination].version)throw Error('Invalid write acknowledgement');
  e.base=copy(intent.document);e.guards={netlify:copy(before.netlify.guard),supabase:copy(before.supabase.guard)};
  e.pending=null;e.status='synced';e.syncedAt=new Date().toISOString();e.lastOperation=intent.id;
  e.observed[destination]=copy(acknowledged);await checkpoint(state);
  // Read back both stores so the report shows current copies, not pre-write data.
  await inspect(state,mapping,adapters,checkpoint);
  if(e.status==='unchanged'){e.status='synced';await checkpoint(state);}
 }catch(error){
  if(error.code==='CONFLICT'){e.pending=null;e.status='changed-before-write';}
  else e.status='uncertain';
  e.error=error.code||'WRITE_UNCERTAIN';await checkpoint(state);
 }
 return e;
}
module.exports={canonical,hash,document,snapshot,same,sameSnapshot,classify,observe,inspect,apply};
