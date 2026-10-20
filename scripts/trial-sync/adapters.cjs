'use strict';
const {document,hash,same}=require('./core.cjs');
function failure(code){return Object.assign(Error(code),{code});}
function placement(d){return Object.fromEntries(['projectName','phase','dayNumber','totalDays'].map(k=>[k,d.meta[k]??null]));}
function netlifyAdapter({store,library}){
 async function guard(d){
  const raw=await library.get('rp_library_index_v1',{type:'json',consistency:'strong'});
  const structure=structuredClone(raw||{});for(const k of ['updatedAt','townCache','dateCache'])delete structure[k];
  return {library:hash(structure),placement:placement(d)};
 }
 return {
  async list(){const out=[];for await(const page of store.list({paginate:true})){for(const b of page.blobs){if(typeof b.key!=='string'||out.includes(b.key))throw failure('INVALID_INVENTORY');out.push(b.key);}}return out;},
  async read(m){const value=await store.getWithMetadata(m.netlifyKey,{type:'json',consistency:'strong'});if(!value)throw failure('MISSING_NETLIFY');if(!value.etag)throw failure('MISSING_VERSION');const d=document(value.data);return{version:value.etag,document:d,guard:await guard(d),transport:{savedAt:value.data.savedAt??0,metadata:value.metadata||{}}};},
  async write(m,expected,next){
   if(!same(expected.guard,await guard(expected.document)))throw failure('CONFLICT');
   if(!same(placement(next),placement(expected.document)))throw failure('STRUCTURE_REVIEW_REQUIRED');
   const savedAt=Math.max(Date.now(),Number(expected.transport.savedAt||0)+1);
   if(!Number.isSafeInteger(savedAt))throw failure('INVALID_SAVED_AT');
   const result=await store.set(m.netlifyKey,JSON.stringify({...document(next),savedAt}),{onlyIfMatch:expected.version,metadata:{...expected.transport.metadata,savedAt}});
   if(!result.modified)throw failure('CONFLICT');if(!result.etag)throw failure('WRITE_UNCERTAIN');
   return{version:result.etag,document:document(next),guard:expected.guard,transport:{savedAt,metadata:{...expected.transport.metadata,savedAt}}};
  }
 };
}
function supabaseAdapter({url,apiKey,accessToken,organizationId,actorId,fetchImpl=fetch}){
 const base=new URL(url);if((base.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(base.hostname))||base.username||base.password||base.search||base.hash||base.pathname!=='/')throw Error('Supabase origin required (HTTPS outside loopback)');
 async function request(path,body){
  let r;try{r=await fetchImpl(new URL(path,base),{method:body===undefined?'GET':'POST',headers:{apikey:apiKey,Authorization:'Bearer '+accessToken,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw failure('NETWORK_UNCERTAIN');}
  if(r.ok&&r.status===204)return null;
  let data;try{data=await r.json();}catch{throw failure('INVALID_RESPONSE');}
  if(!r.ok)throw failure(data?.code==='PT409'?'CONFLICT':r.status===401?'AUTH_REQUIRED':'SUPABASE_UNAVAILABLE');return data;
 }
 const rpc=(name,args)=>request('/rest/v1/rpc/'+name,args);
 function decode(row,m){
  if(row?.id!==m.supabaseId||row.organization_id!==organizationId||row.deleted_at!==null||row.document_schema_version!==1||!Number.isSafeInteger(row.document_version)||row.document_version<1)throw failure('TARGET_IDENTITY_OR_STATE');
  const d=document(row.document);
  return{version:String(row.document_version),document:d,guard:{production:row.production_id,day:row.production_day_id,phase:row.phase_id??null,name:row.display_name,slug:row.slug,status:row.status,position:row.library_position,placement:placement(d)}};
 }
 return {
  async verify(){const u=await request('/auth/v1/user');if(u.id!==actorId)throw failure('ACTOR_MISMATCH');await rpc('require_active_schedule_session',{});},
  async list(){const all=[];let after=null;for(;;){const rows=await rpc('list_schedule_library',{target_organization_id:organizationId,after_id:after});if(!Array.isArray(rows)||rows.length>100)throw failure('INVALID_INVENTORY');for(const r of rows){if(r.organization_id!==organizationId||typeof r.id!=='string'||r.id<=(after||''))throw failure('INVALID_INVENTORY');after=r.id;all.push(r.id);}if(rows.length<100)return all;}},
  async read(m){return decode(await rpc('session_read_schedule',{target_schedule_id:m.supabaseId}),m);},
  async write(m,expected,next){
   if(!same(placement(next),placement(expected.document)))throw failure('STRUCTURE_REVIEW_REQUIRED');
   const r=decode(await rpc('session_update_schedule_document',{target_schedule_id:m.supabaseId,expected_version:Number(expected.version),next_document:{...document(next),savedAt:Date.now()},schema_version:1}),m);
   if(Number(r.version)!==Number(expected.version)+1)throw failure('WRITE_UNCERTAIN');return r;
  }
 };
}
function createNetlifyStores(config,token,localAPI){
 if(process.env.NETLIFY_BLOBS_CONTEXT||globalThis.netlifyBlobsContext)throw Error('Run sync outside an inherited Netlify Blobs context');
 if(localAPI&&!['127.0.0.1','localhost'].includes(new URL(localAPI).hostname))throw Error('Rehearsal endpoint must be loopback');
 const {getStore}=require('@netlify/blobs');
 // SDK 10 can misreport non-412 transport failures as successful conditional PUTs.
 const guardedFetch=async(url,options)=>{const r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});if(options?.method?.toUpperCase()==='PUT'&&!r.ok&&r.status!==412)throw failure('NETLIFY_WRITE_UNCERTAIN');return r;};
 return{store:getStore({name:'schedules',consistency:'strong',siteID:config.netlifySiteId,token,fetch:guardedFetch,...(localAPI?{apiURL:localAPI}:{})}),library:getStore({name:'schedule-library',consistency:'strong',siteID:config.netlifySiteId,token,fetch:guardedFetch,...(localAPI?{apiURL:localAPI}:{})})};
}
module.exports={failure,placement,netlifyAdapter,supabaseAdapter,createNetlifyStores};
