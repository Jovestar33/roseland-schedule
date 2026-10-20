'use strict';
const {inspect,apply}=require('./core.cjs');
const {report}=require('./report.cjs');
const ready=new Set(['synced','unchanged','establish','converged','to-netlify','to-supabase']);
const safeErrors=new Set(['AUTH_REQUIRED','ACTOR_MISMATCH','NETWORK_UNCERTAIN','SUPABASE_UNAVAILABLE','INVALID_RESPONSE','INVALID_INVENTORY','MISSING_VERSION','MISSING_NETLIFY','TARGET_IDENTITY_OR_STATE','CONFLICT','NETLIFY_WRITE_UNCERTAIN']);
const errorCode=e=>safeErrors.has(e?.code)?e.code:'CHECK_FAILED';
function bindMappings(j,config){
 const mappings=config.mappings,old=j.state.mappings||[];
 for(const previous of old){const current=mappings.find(m=>m.id===previous.id);if(!current||JSON.stringify(current)!==JSON.stringify(previous))throw Error('Existing mapping changed; reconcile identities explicitly');}
 j.state.mappings=structuredClone(mappings);
}
async function cycle({journal:j,config:c,adapters:a,command='run',resolution,signal}){
 await a.supabase.verify();
 bindMappings(j,c);await j.checkpoint(j.state);
 const [left,right]=await Promise.all([a.netlify.list(),a.supabase.list()]);
 const inventory={netlifyUnmapped:left.filter(x=>!c.mappings.some(m=>m.netlifyKey===x)),supabaseUnmapped:right.filter(x=>!c.mappings.some(m=>m.supabaseId===x))};
 const selected=resolution?c.mappings.filter(m=>m.id===resolution.id):c.mappings;
 if(!selected.length)throw Error('Mapping not found');
 for(const m of selected){
  // A graceful stop finishes any in-flight write/readback and its checkpoint,
  // then stops before starting another schedule. Never abandon a receipt.
  if(signal?.aborted)break;
  if(command==='plan')await inspect(j.state,m,a,j.checkpoint);
  else await apply(j.state,m,a,j.checkpoint,resolution?{resolution:{take:resolution.take,reviewHash:resolution.reviewHash}}:{});
 }
 return report(j.state,c,inventory);
}
function summary(r){
 const counts={total:r.entries.length,current:0,ready:0,review:0,unavailable:0,unmapped:r.inventory.netlifyUnmapped.length+r.inventory.supabaseUnmapped.length};
 for(const e of r.entries){if(['synced','unchanged'].includes(e.status))counts.current++;else if(ready.has(e.status))counts.ready++;else if(e.status==='unavailable')counts.unavailable++;else counts.review++;}
 return counts;
}
function delay(ms,signal){return new Promise(resolve=>{
 if(signal?.aborted){resolve();return;}
 const finish=()=>{clearTimeout(timer);signal?.removeEventListener('abort',finish);resolve();};
 const timer=setTimeout(finish,ms);signal?.addEventListener('abort',finish,{once:true});
 });}
function interval(value=30){const n=Number(value);if(!Number.isInteger(n)||n<15||n>3600)throw Error('Interval must be 15–3600 whole seconds');return n;}
// No scheduler or credential persistence is installed. The owner explicitly runs
// this foreground process. One journal lock is held for its entire lifetime.
async function watch({journal,config,adaptersFactory,publish,signal,intervalSeconds=30,wait=delay,now=()=>Date.now(),onStatus=()=>{}}){
 intervalSeconds=interval(intervalSeconds);
 const startedAt=new Date(now()).toISOString();
 let result=null,failures=0,cycleCount=0,lastCompletedAt=null,lastSuccessfulAt=null,previousState=null;
 const status=(state,extra={})=>({format:1,mode:'watch',state,pid:process.pid,startedAt,updatedAt:new Date(now()).toISOString(),intervalSeconds,cycleCount,consecutiveFailures:failures,lastCompletedAt,lastSuccessfulAt,nextCheckAt:null,...extra});
 async function emit(health){await publish(result,health);if(health.state!==previousState){onStatus(health);previousState=health.state;}}
 await emit(status('starting'));
 try{
  while(!signal?.aborted){
   cycleCount++;
   await emit(status('checking'));
   let failure=null;
   try{
    // Reload only credentials each time: a renewed operator session can recover
    // without rebinding environment, mapping identities or journal ownership.
    const adapters=await adaptersFactory();
    result=await cycle({journal,config,adapters,signal});
    lastCompletedAt=new Date(now()).toISOString();
    if(result.entries.some(e=>e.status==='unavailable'))failure='SCHEDULE_UNAVAILABLE';
   }catch(e){
    // Storage/checkpoint/config errors must stop the worker. Only explicitly
    // classified provider failures can be retried with the same retained state.
    if(!safeErrors.has(e?.code))throw e;
    failure=errorCode(e);
   }
   failures=failure?failures+1:0;
   const counts=result?summary(result):null;
   if(!failure&&!signal?.aborted&&counts&&!counts.review&&!counts.unmapped&&!counts.ready)lastSuccessfulAt=lastCompletedAt;
   const waitMs=Math.min(intervalSeconds*1000*2**Math.min(failures,5),Math.max(intervalSeconds*1000,300000));
   await emit(status(signal?.aborted?'stopped':failure?'attention':counts.review||counts.unmapped||counts.ready?'needs-review':'waiting',{
    counts,error:failure,nextCheckAt:signal?.aborted?null:new Date(now()+waitMs).toISOString(),
   }));
   if(!signal?.aborted)await wait(waitMs,signal);
  }
 }catch(e){await emit(status('stopped-error',{error:errorCode(e)}));throw e;}
 await emit(status('stopped',{counts:result?summary(result):null}));
 return result;
}
module.exports={cycle,bindMappings,summary,interval,watch,errorCode,delay};
