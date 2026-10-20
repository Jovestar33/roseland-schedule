'use strict';
const {randomUUID,timingSafeEqual,createHash}=require('node:crypto');
const {apply,document}=require('./core.cjs');
const {failure,placement}=require('./adapters.cjs');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function authorized(header,secret){
 if(typeof secret!=='string'||secret.length<32||typeof header!=='string')return false;
 const digest=x=>createHash('sha256').update(x).digest();
 return timingSafeEqual(digest(header),digest('Bearer '+secret));
}
function decode(row,m,org){
 if(row?.id!==m.supabaseId||row.organization_id!==org||row.deleted_at!==null||row.document_schema_version!==1||!Number.isSafeInteger(row.document_version)||row.document_version<1)throw failure('TARGET_IDENTITY_OR_STATE');
 const d=document(row.document);
 return{version:String(row.document_version),document:d,guard:{production:row.production_id,day:row.production_day_id,phase:row.phase_id??null,name:row.display_name,slug:row.slug,status:row.status,position:row.library_position,placement:placement(d)}};
}
function transport({supabaseUrl,secret,legacyOrigin,bridgeSecret,fetchImpl=fetch,deadline,now=Date.now}){
 const database=new URL(supabaseUrl),legacy=new URL(legacyOrigin);
 if(database.protocol!=='https:'||!database.hostname.endsWith('.supabase.co')||database.origin!==supabaseUrl||legacy.protocol!=='https:'||!legacy.hostname.endsWith('.netlify.app')||legacy.origin!==legacyOrigin)throw Error('Invalid sync origins');
 async function request(url,headers,body){
  const remaining=deadline-now();if(remaining<100)throw failure('NETWORK_UNCERTAIN');
  let response;try{response=await fetchImpl(url,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(Math.min(10000,remaining))});}catch{throw failure('NETWORK_UNCERTAIN');}
  let value;try{value=await response.json();}catch{throw failure('INVALID_RESPONSE');}
  if(!response.ok)throw failure(response.status===409||value?.code==='PT409'?'CONFLICT':response.status===401||response.status===403?'AUTH_REQUIRED':'SUPABASE_UNAVAILABLE');
  return value;
 }
 return {rpc:(name,body)=>request(new URL('/rest/v1/rpc/'+name,database),{apikey:secret},body),
  bridge:body=>request(new URL('/.netlify/functions/trial-sync',legacy),{Authorization:'Bearer '+bridgeSecret},body)};
}
async function runHosted({rpc,bridge,integrationId,legacyOrigin,netlifySiteId,organizationId,deadline,now=Date.now,maxMappings=100}){
 if(![integrationId,netlifySiteId,organizationId].every(x=>uuid.test(x)))throw Error('Invalid sync binding');
 const totals={checked:0,current:0,review:0,unavailable:0};
 while(now()<deadline-15000&&totals.checked<maxMappings){
  const claim=randomUUID(),job=await rpc('claim_trial_sync_mapping',{target_integration_id:integrationId,claim_id:claim});
  if(job?.state==='idle')break;
  if(job?.state!=='claimed'||job.organizationId!==organizationId||job.legacyOrigin!==legacyOrigin||job.netlifySiteId!==netlifySiteId||!uuid.test(job.mapping?.id)||!uuid.test(job.mapping?.supabaseId)||typeof job.mapping?.netlifyKey!=='string'||!Number.isSafeInteger(job.sequence)||job.sequence<0||!job.entry||typeof job.entry!=='object'||Date.parse(job.leaseUntil)<=now())throw failure('TARGET_IDENTITY_OR_STATE');
  const m=job.mapping,ids={target_mapping_id:m.id,claim_id:claim};let sequence=job.sequence;
  const state={entries:{[m.id]:structuredClone(job.entry)}};
  const checkpoint=async()=>{const next=await rpc('checkpoint_trial_sync',{...ids,expected_sequence:sequence,next_state:state.entries[m.id],release_claim:false});if(next!==sequence+1)throw failure('INVALID_RESPONSE');sequence=next;};
  const adapters={
   netlify:{read:()=>bridge({operation:'read',key:m.netlifyKey}),write:(_m,expected,next)=>bridge({operation:'write',key:m.netlifyKey,expected,document:next})},
   supabase:{read:async()=>decode(await rpc('read_trial_sync_schedule',ids),m,organizationId),write:async(_m,expected,next)=>decode(await rpc('write_trial_sync_schedule',{...ids,expected_version:Number(expected.version),expected_guard:expected.guard,next_document:{...document(next),savedAt:now()}}),m,organizationId)}
  };
  // Never release a lease after an uncertain checkpoint: its saved pending intent
  // must remain available for the next worker after lease expiry.
  const entry=await apply(state,m,adapters,checkpoint);
  const released=await rpc('checkpoint_trial_sync',{...ids,expected_sequence:sequence,next_state:entry,release_claim:true});
  if(released!==sequence+1)throw failure('INVALID_RESPONSE');
  totals.checked++;if(['synced','unchanged'].includes(entry.status))totals.current++;else if(entry.status==='unavailable')totals.unavailable++;else totals.review++;
 }
 return totals;
}
module.exports={authorized,decode,transport,runHosted};
