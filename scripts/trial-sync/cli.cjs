#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {openJournal,atomic}=require('./journal.cjs');
const {netlifyAdapter,supabaseAdapter,createNetlifyStores}=require('./adapters.cjs');
const {report,html}=require('./report.cjs');
const {cycle,summary,interval,watch}=require('./worker.cjs');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateConfig(c){
 if(!c||Object.keys(c).sort().join(',')!=='actorId,format,mappings,netlifySiteId,organizationId,supabaseUrl'||c.format!==1||!uuid.test(c.organizationId)||!uuid.test(c.actorId)||!uuid.test(c.netlifySiteId)||typeof c.supabaseUrl!=='string'||!Array.isArray(c.mappings)||!c.mappings.length)throw Error('Invalid sync configuration');
 const ids=new Set(),keys=new Set(),targets=new Set();
 for(const m of c.mappings){if(!m||Object.keys(m).sort().join(',')!=='id,netlifyKey,supabaseId'||!uuid.test(m.id)||!uuid.test(m.supabaseId)||typeof m.netlifyKey!=='string'||!m.netlifyKey.trim()||m.netlifyKey.length>1000||ids.has(m.id)||keys.has(m.netlifyKey)||targets.has(m.supabaseId))throw Error('Invalid or duplicate stable mapping');ids.add(m.id);keys.add(m.netlifyKey);targets.add(m.supabaseId);}
 return c;
}
async function privateJSON(file){const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077))throw Error('Private regular file required (chmod 600)');return JSON.parse(await fs.readFile(file,'utf8'));}
async function adaptersFor(c){
 const secret=await privateJSON(process.env.ROSELAND_SYNC_CREDENTIALS||'');
 if(![secret.netlifyToken,secret.supabaseApiKey,secret.supabaseAccessToken].every(x=>typeof x==='string'&&x.length>10))throw Error('Missing credentials');
 return {netlify:netlifyAdapter(createNetlifyStores(c,secret.netlifyToken)),supabase:supabaseAdapter({url:c.supabaseUrl,apiKey:secret.supabaseApiKey,accessToken:secret.supabaseAccessToken,organizationId:c.organizationId,actorId:c.actorId})};
}
function healthSummary(h,now=Date.now()){
 const updated=Date.parse(h.updatedAt),deadline=Date.parse(h.nextCheckAt);
 const fresh=Number.isFinite(updated)&&now>=updated&&now<Math.max(updated+90000,Number.isFinite(deadline)?deadline+90000:updated+90000);
 return {state:h.state,freshSnapshot:fresh,liveProcessVerified:false,updatedAt:h.updatedAt,lastCompletedAt:h.lastCompletedAt,lastSuccessfulAt:h.lastSuccessfulAt,nextCheckAt:h.nextCheckAt,error:h.error||null,counts:h.counts||null};
}
async function main(args){
 const [command,configFile,journalRoot,...rest]=args;
 if(command==='status'){
  if(!configFile||journalRoot)throw Error('Use status PRIVATE_JOURNAL');
  const h=healthSummary(await privateJSON(path.join(configFile,'health.json')));console.log(JSON.stringify(h,null,2));
  if(!h.freshSnapshot||h.state!=='waiting')process.exitCode=2;return;
 }
 if(!['plan','run','resolve','watch'].includes(command)||!configFile||!journalRoot){console.log('Usage: node scripts/trial-sync/cli.cjs plan|run CONFIG.json PRIVATE_JOURNAL\n       node scripts/trial-sync/cli.cjs watch CONFIG.json PRIVATE_JOURNAL [INTERVAL_SECONDS]\n       node scripts/trial-sync/cli.cjs status PRIVATE_JOURNAL\n       node scripts/trial-sync/cli.cjs resolve CONFIG.json PRIVATE_JOURNAL MAPPING_ID netlify|supabase REVIEW_HASH\nSet ROSELAND_SYNC_CREDENTIALS to a private JSON file with netlifyToken, supabaseApiKey, supabaseAccessToken. Watch runs in the foreground; Ctrl-C stops safely.');return;}
 if(command==='resolve'?rest.length!==3:command==='watch'?rest.length>1:rest.length!==0)throw Error('Invalid command arguments');
 const seconds=command==='watch'?interval(rest[0]):null;
 const c=validateConfig(JSON.parse(await fs.readFile(configFile,'utf8'))),{mappings,...environment}=c;
 const j=await openJournal(journalRoot,environment);
 const stop=new AbortController(),requestStop=()=>stop.abort();
 const publish=async(result,health)=>{
  const r=result||report(j.state,c,{netlifyUnmapped:[],supabaseUnmapped:[],complete:false});
  const next={...r,worker:health};await j.report(next);await atomic(path.join(j.root,'report.html'),html(next),{text:true});await atomic(path.join(j.root,'health.json'),health);
 };
 try{
  if(command==='watch'){
   process.on('SIGINT',requestStop);process.on('SIGTERM',requestStop);
   await watch({journal:j,config:c,adaptersFactory:()=>adaptersFor(c),publish,signal:stop.signal,intervalSeconds:seconds,onStatus:h=>{
    // No document, remote payload or credential is printed.
    if(h.state!=='checking')console.log(JSON.stringify({state:h.state,at:h.updatedAt,error:h.error||null,counts:h.counts||null,report:path.join(j.root,'report.html')}));
   }});
  }else{
   const r=await cycle({journal:j,config:c,adapters:await adaptersFor(c),command,resolution:command==='resolve'?{id:rest[0],take:rest[1],reviewHash:rest[2]}:undefined});
   const counts=summary(r);
   await publish(r,{format:1,mode:command,state:'batch-complete',updatedAt:new Date().toISOString(),lastCompletedAt:r.generatedAt,counts});
   console.log(JSON.stringify({report:path.join(j.root,'report.html'),statuses:r.entries.map(e=>({id:e.id,status:e.status})),unmapped:{netlify:r.inventory.netlifyUnmapped.length,supabase:r.inventory.supabaseUnmapped.length}},null,2));
   if(counts.review||counts.unavailable||counts.unmapped)process.exitCode=2;
  }
 }finally{process.removeListener('SIGINT',requestStop);process.removeListener('SIGTERM',requestStop);await j.release();}
}
if(require.main===module)main(process.argv.slice(2)).catch(()=>{console.error('Sync stopped. No force retry was attempted. Check the private journal and configuration; credentials and remote error payloads are intentionally not logged.');process.exitCode=1;});
module.exports={validateConfig,privateJSON,healthSummary,main};
