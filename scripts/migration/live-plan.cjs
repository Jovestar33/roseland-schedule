'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {verifyCapture,SITE,ORIGIN}=require('../trial-sync/capture-command.cjs');
const {document,hash}=require('../trial-sync/core.cjs');
const {placement}=require('../trial-sync/adapters.cjs');
const {validateFileDocument,suggestedSlug,validateFileName}=require('../../lib/platform/schedule-files.ts');
const ORG='820f7fc4-e364-4aae-a29a-65f7d84eef61',OWNER='71280ab3-541c-4e7f-95f3-f646ac2d701b';
function id(kind,key){const bytes=crypto.createHash('sha256').update(JSON.stringify([ORG,SITE,kind,key])).digest().subarray(0,16);bytes[6]=(bytes[6]&15)|80;bytes[8]=(bytes[8]&63)|128;const h=bytes.toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
function normalized(raw){const d={...document(raw),...(raw.savedAt===undefined?{}:{savedAt:raw.savedAt})};validateFileDocument(d);return d;}
function buildPlan(manifest,objects){
 if(manifest.siteId!==SITE||manifest.origin!==ORIGIN)throw Error('Wrong source');
 const get=(store,key)=>{const item=objects.find(o=>o.store===store&&o.key===key);if(!item)throw Error('Missing '+store);return item.value;};
 const library=get('schedule-library','rp_library_index_v1'),index=get('production-index','rp_production_v1'),cms=get('cms','rp_cms_config');
 const source=objects.filter(o=>o.store==='schedules'),names=new Set(source.map(o=>o.key));
 if(!source.length||source.length>500||new Set(source.map(o=>o.key.toLowerCase())).size!==source.length)throw Error('Empty, excessive or colliding schedule names');
 const norm=x=>typeof x==='string'?x.trim().toLowerCase():'';
 const groups=new Map(),changes=[];
 for(const o of source){const d=normalized(o.value),prod=norm(d.meta.projectName),phase=norm(d.meta.phase);if(!prod||!phase)throw Error('Explicit production/phase required');
  if(hash(d)!==hash(o.value))changes.push({store:o.store,key:o.key,before:hash(o.value),after:hash(d),reason:'Corroborated generated solar minute overflow',original:o.value,normalized:d});
  if(!groups.has(prod))groups.set(prod,new Map());if(!groups.get(prod).has(phase))groups.get(prod).set(phase,[]);groups.get(prod).get(phase).push({o,d});
 }
 const productions=[],phases=[],schedules=[],days=[];
 const structure=structuredClone(library);for(const k of ['updatedAt','townCache','dateCache'])delete structure[k];
 const libraryHash=hash(structure);
 for(const [prod,phaseMap] of [...groups].sort(([a],[b])=>a.localeCompare(b))){
  const latest=[...phaseMap.values()].flat().sort((a,b)=>(b.d.savedAt||0)-(a.d.savedAt||0))[0];
  const indexed=(index.productions||[]).filter(p=>p.prodKey===prod);if(indexed.length>1)throw Error('Ambiguous production index');
  const status={'in-production':'active',planning:'planning',completed:'completed',archived:'archived'}[indexed[0]?.status||'planning'];if(!status)throw Error('Unknown production status');
  productions.push({id:id('production',prod),key:prod,name:library.productionDisplayNames?.[prod]||latest.d.meta.projectName.trim(),slug:suggestedSlug(prod),status});
  let phasePosition=0;
  for(const [phase,items] of [...phaseMap].sort(([a],[b])=>a.localeCompare(b))){
   const latestPhase=[...items].sort((a,b)=>(b.d.savedAt||0)-(a.d.savedAt||0))[0];
   phases.push({id:id('phase',prod+'/'+phase),production_id:id('production',prod),key:phase,name:library.phaseDisplayNames?.[prod]?.[phase]||latestPhase.d.meta.phase.trim(),position:phasePosition++});
   const order=library.phaseOrder?.[prod]?.[phase]||[];const positions=new Map(order.map((name,i)=>[name,i]));
   items.sort((a,b)=>(positions.get(a.o.key)??Infinity)-(positions.get(b.o.key)??Infinity)||(a.d.meta.dayNumber??Infinity)-(b.d.meta.dayNumber??Infinity)||(b.d.savedAt||0)-(a.d.savedAt||0));
   let position=0;for(const {o,d} of items){const slug=suggestedSlug(o.key);validateFileName(o.key,slug);
    schedules.push({id:id('schedule',o.key),key:o.key,name:o.key,slug,production_id:id('production',prod),phase_id:id('phase',prod+'/'+phase),day_id:null,position:++position,status:library.tsarchived?.includes(o.key)?'archived':'draft',document:d,source_sha256:o.sha256,source_etag:o.etag,netlify_guard:{library:libraryHash,placement:placement(d)}});
   }
 }
 }
 const slugCounts=new Map();for(const s of schedules){const key=s.production_id+'/'+s.slug;slugCounts.set(key,(slugCounts.get(key)||0)+1);}
 for(const s of schedules)if(slugCounts.get(s.production_id+'/'+s.slug)>1)s.slug=s.slug.slice(0,150).replace(/-$/,'')+'-'+s.id.slice(0,8);
 if(new Set(schedules.map(s=>s.production_id+'/'+s.slug)).size!==schedules.length)throw Error('Unresolved slug collision');
 // Preserve indexed shoot days only where a current schedule is explicitly linked.
 for(const day of index.days||[]){const schedule=schedules.find(s=>s.key===day.linkedScheduleName),prod=(index.productions||[]).find(p=>p.id===day.productionId);if(!schedule||!prod||schedule.production_id!==id('production',prod.prodKey)||schedule.day_id)throw Error('Unresolved production day');
  const status={tbc:'planned',confirmed:'confirmed',completed:'completed',cancelled:'cancelled'}[day.status];if(!status||day.type!=='shoot'||!Number.isInteger(day.sortOrder))throw Error('Unsupported production day');
  days.push({id:id('day',day.id),production_id:schedule.production_id,phase_id:schedule.phase_id,position:day.sortOrder,date:schedule.document.meta.date||null,status,type:'shoot'});schedule.day_id=id('day',day.id);schedule.phase_id=null;
 }
 const related=[],unattached=[];let snapshotCount=0;
 for(const o of objects.filter(o=>o.store==='schedule-snapshots')){
  const c=o.value;if(o.key!=='snapshots_'+crypto.createHash('sha256').update(c.name).digest('hex')||!Array.isArray(c.snapshots))throw Error('Snapshot identity mismatch');
  const schedule=schedules.find(s=>s.key===c.name),seen=new Set();
  for(const snap of c.snapshots){if(hash(normalized(snap.data))!==hash(snap.data))throw Error('Historical time normalization requires explicit review');if(typeof snap.id!=='string'||!snap.id||!Number.isSafeInteger(snap.savedAt)||snap.savedAt<0||typeof snap.label!=='string')throw Error('Invalid snapshot');seen.add(snap.id);snapshotCount++;}
  if(!schedule){unattached.push({key:o.key,name:c.name,count:c.snapshots.length});continue;}
  for(const [position,snap] of c.snapshots.entries())related.push({id:id('snapshot',o.key+'/'+position+'/'+snap.id),source_key:o.key,original_order:position+1,schedule_id:schedule.id,payload:snap});
 }
 const shared=get('schedule-templates','templates');if(productions.length!==1&&Object.keys(shared).length)throw Error('Shared template production requires explicit assignment');
 const templates=Object.entries(shared).map(([name,t])=>{validateFileDocument({meta:{},rows:t.rows});return{id:id('template',name),name,production_id:productions[0].id,rows:t.rows,source_key:'templates',source_name:name};});
 const presentation=structuredClone(cms);
 for(const [key,value] of Object.entries(presentation.colors||{}))if(typeof value==='string'&&/^#[a-fA-F0-9]{3}$/.test(value))presentation.colors[key]='#'+[...value.slice(1)].map(x=>x+x).join('');
 if(hash(presentation)!==hash(cms))changes.push({store:'cms',key:'rp_cms_config',before:hash(cms),after:hash(presentation),reason:'Equivalent expanded hexadecimal color',original:cms,normalized:presentation});
 const plan={format:'roseland.live-trial-import.v1',organization_id:ORG,owner_id:OWNER,site_id:SITE,origin:ORIGIN,run_id:id('capture',manifest.sha256),integration_id:id('integration',SITE),capture_hash:manifest.sha256,capture_manifest:manifest,productions,phases,days,schedules,related,templates,presentation,unattached_snapshots:unattached,normalizations:changes,objects:objects.map(({value,...o})=>o),counts:{schedules:schedules.length,snapshots:snapshotCount,attached_snapshots:related.length,unattached_snapshots:unattached.reduce((a,c)=>a+c.count,0),objects:objects.length},notes:['Import generation 1 is a catalogue counter, not a numeric source ETag.','Original bytes, metadata and ETags remain immutable; missing current schedule names are not recreated.','Only initial mapped schedule documents synchronize; hierarchy/rename/deletion/shared stores require review.','Source is a stable double-read, not an atomic frozen snapshot. Revalidate before import.']};
 plan.sha256=hash(plan);return plan;
}
async function planCapture(folder){const manifest=await verifyCapture(folder),objects=[];for(const e of manifest.entries){const raw=await fs.readFile(path.join(folder,e.file));objects.push({...e,raw_base64:raw.toString('base64'),value:JSON.parse(raw.toString('utf8'))});}return buildPlan(manifest,objects);}
if(require.main===module)(async()=>{if(process.argv.length!==4)throw Error('Capture folder and private output path required');const plan=await planCapture(process.argv[2]);await fs.writeFile(process.argv[3],JSON.stringify(plan),{flag:'wx',mode:0o600});console.log(JSON.stringify({counts:plan.counts,normalizations:plan.normalizations.length,sha256:plan.sha256}));})().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={planCapture,buildPlan,id,ORG,OWNER};
