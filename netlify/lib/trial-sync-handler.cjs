'use strict';
const {authorized}=require('../../scripts/trial-sync/hosted.cjs');
const {netlifyAdapter}=require('../../scripts/trial-sync/adapters.cjs');
const stores=new Set(['schedules','schedule-library','schedule-snapshots','schedule-templates','cms','production-index']);
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
function createHandler(getStore,env=process.env){return async (request,context)=>{
 if(env.ROSELAND_TRIAL_SYNC_BRIDGE_ENABLED!=='true'||context?.deploy?.context!=='production'||context?.deploy?.published!==true||context?.site?.id!==env.SITE_ID||new URL(request.url).origin!==env.ROSELAND_TRIAL_SYNC_LEGACY_ORIGIN||env.SITE_ID!==env.ROSELAND_TRIAL_SYNC_NETLIFY_SITE_ID)return json({state:'disabled'},404);
 if(!authorized(request.headers.get('authorization'),env.ROSELAND_TRIAL_SYNC_BRIDGE_SECRET))return json({state:'unavailable'},401);
 if(request.method!=='POST')return json({state:'unavailable'},405);
 try{
  // Bound streaming input before parsing it. Reject extra fields so a write can
  // never become an implicit rename, creation, deletion, or library mutation.
  const reader=request.body?.getReader();if(!reader)return json({state:'invalid'},400);
  const chunks=[];let length=0;for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>2400000){await reader.cancel();return json({state:'too-large'},413);}chunks.push(Buffer.from(part.value));}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!body||typeof body!=='object'||Array.isArray(body))return json({state:'invalid'},400);
  const allowed={inventory:['operation','store'],raw:['operation','store','key'],read:['operation','key'],write:['operation','key','expected','document']}[body.operation];
  if(!allowed||Object.keys(body).some(k=>!allowed.includes(k)))return json({state:'invalid'},400);
  const guardedFetch=async(url,options)=>{const response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(10000)});if(options?.method?.toUpperCase()==='PUT'&&!response.ok&&response.status!==412)throw Error('Uncertain write');return response;};
  const store=name=>getStore({name,consistency:'strong',fetch:guardedFetch});
  if(body.operation==='inventory'){
   if(!stores.has(body.store))return json({state:'invalid'},400);
   const keys=[];for await(const page of store(body.store).list({paginate:true})){for(const item of page.blobs){if(typeof item.key!=='string'||keys.includes(item.key))throw Error('Invalid inventory');keys.push(item.key);}}
   return json({siteId:env.SITE_ID,store:body.store,keys:keys.sort()});
  }
  if(typeof body.key!=='string'||!body.key||body.key.length>1000)return json({state:'invalid'},400);
  if(body.operation==='raw'){
   if(!stores.has(body.store))return json({state:'invalid'},400);
   const value=await store(body.store).getWithMetadata(body.key,{type:'arrayBuffer',consistency:'strong'});
   if(!value)return json({state:'missing'},404);if(!value.etag)throw Error('Missing version');
   const bytes=Buffer.from(value.data);if(bytes.length>4000000)return json({state:'backup-too-large'},413);
   return json({siteId:env.SITE_ID,store:body.store,key:body.key,etag:value.etag,metadata:value.metadata||{},bytes:bytes.toString('base64')});
  }
  const keys=JSON.parse(env.ROSELAND_TRIAL_SYNC_KEYS||'[]');
  if(!Array.isArray(keys)||!keys.every(k=>typeof k==='string')||!keys.includes(body.key))return json({state:'unmapped'},403);
  const adapter=netlifyAdapter({store:store('schedules'),library:store('schedule-library')}),mapping={netlifyKey:body.key};
  if(body.operation==='read')return json(await adapter.read(mapping));
  if(!body.expected||typeof body.expected.version!=='string'||!body.expected.version)return json({state:'invalid'},400);
  return json(await adapter.write(mapping,body.expected,body.document));
 }catch(error){return json({state:error?.code==='CONFLICT'?'conflict':'unavailable'},error?.code==='CONFLICT'?409:503);}
};}
module.exports={createHandler};
