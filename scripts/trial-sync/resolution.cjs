'use strict';
const {randomUUID}=require('node:crypto');
const {hash}=require('./core.cjs');
const {differences}=require('./report.cjs');
const {runClaim}=require('./hosted.cjs');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const conflicts=['content-conflict','initial-conflict','uncertain'];
const fail=(status,message)=>Object.assign(Error(message),{status});
function mappingScope(raw){
 let ids;try{ids=JSON.parse(raw);}catch{throw fail(503,'Synchronization is not configured.');}
 if(!Array.isArray(ids)||!ids.length||ids.length>10000||ids.some(x=>typeof x!=='string'||!uuid.test(x))||new Set(ids).size!==ids.length)throw fail(503,'Synchronization is not configured.');
 return ids;
}
function validReview(r,binding,mappingId){
 if(r?.integrationId!==binding.integrationId||r.organizationId!==binding.organizationId||r.netlifySiteId!==binding.netlifySiteId||r.legacyOrigin!==binding.legacyOrigin||r.mapping?.id!==mappingId||!uuid.test(r.mapping?.supabaseId)||typeof r.mapping?.netlifyKey!=='string'||!Number.isSafeInteger(r.sequence)||r.sequence<0||!r.entry||typeof r.entry!=='object')throw fail(409,'The connection changed. Refresh the comparison.');
 return r;
}
async function readReview({userRpc,binding,mappingId}){
 if(!uuid.test(mappingId))throw fail(400,'Select a connected schedule.');
 return validReview(await userRpc('read_trial_sync_review',{target_mapping_id:mappingId}),binding,mappingId);
}
function presentReview(r,writeReady){
 const e=r.entry,observed=e.observed;
 return {name:r.mapping.netlifyKey,mappingId:r.mapping.id,sequence:r.sequence,reviewHash:observed?hash(observed):null,status:e.status,checkedAt:e.checkedAt??null,
  resolvable:!!(writeReady&&r.enabled&&conflicts.includes(e.status)&&observed),
  differences:observed?differences(e.base??null,observed.netlify.document,observed.supabase.document):[],
  copies:observed?{common:e.base??null,netlify:observed.netlify.document,supabase:observed.supabase.document}:null};
}
async function resolveReview({userRpc,rpc,bridge,binding,mappingId,sequence,reviewHash,take,now=Date.now}){
 if(!['netlify','supabase'].includes(take)||!Number.isSafeInteger(sequence)||sequence<0||! /^[a-f0-9]{64}$/.test(reviewHash))throw fail(400,'Review both copies before choosing one.');
 const r=await readReview({userRpc,binding,mappingId});
 if(!r.enabled)throw fail(409,'Synchronization is paused. Resume it before resolving this schedule.');
 if(r.sequence!==sequence||!conflicts.includes(r.entry.status)||!r.entry.observed||hash(r.entry.observed)!==reviewHash)throw fail(409,'The comparison changed. Review the latest copies before choosing one.');
 const claim=randomUUID();
 const job=await userRpc('begin_trial_sync_resolution',{target_mapping_id:mappingId,claim_id:claim,expected_sequence:sequence,take_copy:take});
 validReview({...job,integrationId:r.integrationId},binding,mappingId);
 if(job.state!=='claimed'||job.sequence!==sequence||hash(job.entry.observed)!==reviewHash||!Number.isFinite(Date.parse(job.leaseUntil))||Date.parse(job.leaseUntil)<=now())throw fail(409,'The comparison changed. Refresh before trying again.');
 const authorize=async()=>{const fresh=await readReview({userRpc,binding,mappingId});if(!fresh.enabled)throw fail(409,'Synchronization was paused. Refresh status before continuing.');};
 let entry;
 try{entry=await runClaim({rpc,bridge,job,claim,organizationId:binding.organizationId,now,resolution:{take,reviewHash},authorize});}
 catch{throw fail(409,'The save could not be confirmed. Refresh the comparison before making another choice.');}
 await authorize();
 return {status:entry.status,resolved:['synced','unchanged'].includes(entry.status)};
}
module.exports={mappingScope,readReview,presentReview,resolveReview};
