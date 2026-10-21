'use strict';
const {hash,document,same}=require('./core.cjs');
const {decode}=require('./hosted.cjs');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(status,message)=>Object.assign(Error(message),{status});
// This path has no write adapter, worker claim, checkpoint or activation RPC.
// It deliberately uses the caller's ordinary session for every database read.
async function previewCopies({rpc,bridge,binding,offset=0,expectedMappingsHash}){
 const {organizationId,integrationId,netlifySiteId,legacyOrigin}=binding;
 if(![organizationId,integrationId,netlifySiteId].every(x=>uuid.test(x))||!/^https:\/\/[a-z0-9-]+[.]netlify[.]app$/.test(legacyOrigin))throw fail(503,'Comparison is not configured.');
 if(!Number.isSafeInteger(offset)||offset<0||offset>10000)throw fail(400,'Invalid comparison request.');
 const authorize=async()=>{
  const s=await rpc('read_trial_sync_status',{target_organization_id:organizationId});
  if(!s?.configured||s.id!==integrationId||s.legacy_origin!==legacyOrigin||!Array.isArray(s.mappings)||s.mappings.length>10000)throw fail(403,'Comparison is unavailable.');
  const mappings=s.mappings.map(m=>({id:m.id,schedule_id:m.schedule_id,legacy_key:m.legacy_key})).sort((a,b)=>a.id.localeCompare(b.id));
  if(mappings.some(m=>!uuid.test(m.id)||!uuid.test(m.schedule_id)||typeof m.legacy_key!=='string'||!m.legacy_key||m.legacy_key.length>1000)||['id','schedule_id','legacy_key'].some(k=>new Set(mappings.map(m=>m[k])).size!==mappings.length))throw fail(502,'Comparison setup could not be verified.');
  return {mappings,mappingsHash:hash({integrationId,organizationId,legacyOrigin,revision:s.revision,mappings})};
 };
 const {mappings,mappingsHash}=await authorize();
 if(offset>mappings.length||offset>0&&!expectedMappingsHash||expectedMappingsHash&&expectedMappingsHash!==mappingsHash)throw fail(409,'The schedule connections changed. Start a new comparison.');
 const inventory=await bridge({operation:'inventory',store:'schedules'});
 if(inventory?.siteId!==netlifySiteId||inventory.store!=='schedules'||!Array.isArray(inventory.keys)||inventory.keys.length>10000||inventory.keys.some(k=>typeof k!=='string'||!k||k.length>1000)||new Set(inventory.keys).size!==inventory.keys.length)throw fail(502,'The legacy inventory could not be verified.');
 const target=[];let after=null;
 for(;;){
  const rows=await rpc('list_schedule_library',{target_organization_id:organizationId,after_id:after});
  if(!Array.isArray(rows)||rows.length>100||rows.some(r=>r.organization_id!==organizationId||!uuid.test(r.id)))throw fail(502,'The new-app inventory could not be verified.');
  for(const r of rows){if(after&&r.id<=after)throw fail(502,'The new-app inventory could not be verified.');after=r.id;if(r.deleted_at===null)target.push(r);}
  if(target.length>10000)throw fail(502,'Too many schedules to compare.');
  if(rows.length<100)break;
 }
 const differences={legacyUnmapped:inventory.keys.filter(k=>!mappings.some(m=>m.legacy_key===k)),legacyMissing:mappings.filter(m=>!inventory.keys.includes(m.legacy_key)).map(m=>m.legacy_key),targetUnmapped:target.filter(r=>!mappings.some(m=>m.schedule_id===r.id)).map(r=>({id:r.id,name:r.display_name})),targetMissing:mappings.filter(m=>!target.some(r=>r.id===m.schedule_id)).map(m=>m.legacy_key)};
 const rows=await Promise.all(mappings.slice(offset,offset+3).map(async m=>{
  const row={id:m.id,name:m.legacy_key,scheduleId:m.schedule_id};
  try{
   const read=async()=>{
    const [raw,value]=await Promise.all([bridge({operation:'raw',store:'schedules',key:m.legacy_key}),rpc('session_read_schedule',{target_schedule_id:m.schedule_id})]);
    if(raw?.siteId!==netlifySiteId||raw.store!=='schedules'||raw.key!==m.legacy_key||typeof raw.etag!=='string'||!raw.etag||typeof raw.bytes!=='string'||raw.bytes.length>5400000||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw.bytes))throw Error('Invalid source');
    const left=document(JSON.parse(Buffer.from(raw.bytes,'base64').toString('utf8'))),right=decode(value,{supabaseId:m.schedule_id},organizationId);
    return {left,right,etag:raw.etag};
   };
   // A second read detects edits during the comparison. This is an observation,
   // not a frozen snapshot or permission to replace either saved document.
   const first=await read(),second=await read();
   if(first.etag!==second.etag||first.right.version!==second.right.version||!same(first,second))return {...row,state:'changed-during-check'};
   return {...row,state:same(second.left,second.right.document)?'matching':'different',legacyVersion:second.etag,targetVersion:second.right.version,checkedAt:new Date().toISOString()};
  }catch{return {...row,state:'unavailable'};}
 }));
 // Do not release legacy observations after session revocation or a scope change.
 if((await authorize()).mappingsHash!==mappingsHash)throw fail(409,'The schedule connections changed. Start a new comparison.');
 return {mode:'read-only',mappingsHash,total:mappings.length,nextOffset:offset+rows.length<mappings.length?offset+rows.length:null,rows,inventory:differences,checkedAt:new Date().toISOString()};
}
module.exports={previewCopies};
