#!/usr/bin/env node
'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {inspect,apply}=require('./core.cjs'),{openJournal,atomic}=require('./journal.cjs'),{netlifyAdapter,supabaseAdapter,createNetlifyStores}=require('./adapters.cjs'),{report,html}=require('./report.cjs');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validateConfig(c){
 if(!c||Object.keys(c).sort().join(',')!=='actorId,format,mappings,netlifySiteId,organizationId,supabaseUrl'||c.format!==1||!uuid.test(c.organizationId)||!uuid.test(c.actorId)||!uuid.test(c.netlifySiteId)||typeof c.supabaseUrl!=='string'||!Array.isArray(c.mappings)||!c.mappings.length)throw Error('Invalid sync configuration');
 const ids=new Set(),keys=new Set(),targets=new Set();
 for(const m of c.mappings){if(!m||Object.keys(m).sort().join(',')!=='id,netlifyKey,supabaseId'||!uuid.test(m.id)||!uuid.test(m.supabaseId)||typeof m.netlifyKey!=='string'||!m.netlifyKey.trim()||m.netlifyKey.length>1000||ids.has(m.id)||keys.has(m.netlifyKey)||targets.has(m.supabaseId))throw Error('Invalid or duplicate stable mapping');ids.add(m.id);keys.add(m.netlifyKey);targets.add(m.supabaseId);}
 return c;
}
async function privateJSON(file){const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077))throw Error('Credentials must be in a private regular file (chmod 600)');return JSON.parse(await fs.readFile(file,'utf8'));}
async function main(args){
 const [command,configFile,journalRoot,...rest]=args;
 if(!['plan','run','resolve'].includes(command)||!configFile||!journalRoot){console.log('Usage: node scripts/trial-sync/cli.cjs plan|run CONFIG.json PRIVATE_JOURNAL\n       node scripts/trial-sync/cli.cjs resolve CONFIG.json PRIVATE_JOURNAL MAPPING_ID netlify|supabase REVIEW_HASH\nSet ROSELAND_SYNC_CREDENTIALS to a private JSON file with netlifyToken, supabaseApiKey, supabaseAccessToken.');return;}
 if(command==='resolve'?rest.length!==3:rest.length!==0)throw Error('Invalid command arguments');
 const c=validateConfig(JSON.parse(await fs.readFile(configFile,'utf8'))),secret=await privateJSON(process.env.ROSELAND_SYNC_CREDENTIALS||'');
 if(![secret.netlifyToken,secret.supabaseApiKey,secret.supabaseAccessToken].every(x=>typeof x==='string'&&x.length>10))throw Error('Missing credentials');
 // Do not accept service-role credentials for tenant writes. The adapter verifies
 // the real user/session and the RPC applies current organization permissions.
 const a={netlify:netlifyAdapter(createNetlifyStores(c,secret.netlifyToken)),supabase:supabaseAdapter({url:c.supabaseUrl,apiKey:secret.supabaseApiKey,accessToken:secret.supabaseAccessToken,organizationId:c.organizationId,actorId:c.actorId})};
 await a.supabase.verify();
 const {mappings,...environment}=c;
 const j=await openJournal(journalRoot,environment);try{
  // Appending reviewed identity mappings is allowed; existing identities cannot
  // be silently rebound, removed, or reused with a stale common baseline.
  const old=j.state.mappings||[];
  for(const previous of old){const current=mappings.find(m=>m.id===previous.id);if(!current||JSON.stringify(current)!==JSON.stringify(previous))throw Error('Existing mapping changed; reconcile identities explicitly');}
  j.state.mappings=structuredClone(mappings);await j.checkpoint(j.state);
  const [left,right]=await Promise.all([a.netlify.list(),a.supabase.list()]);
  const inventory={netlifyUnmapped:left.filter(x=>!c.mappings.some(m=>m.netlifyKey===x)),supabaseUnmapped:right.filter(x=>!c.mappings.some(m=>m.supabaseId===x))};
  const selected=command==='resolve'?c.mappings.filter(m=>m.id===rest[0]):c.mappings;if(!selected.length)throw Error('Mapping not found');
  for(const m of selected){
   if(command==='plan')await inspect(j.state,m,a,j.checkpoint);
   else await apply(j.state,m,a,j.checkpoint,command==='resolve'?{resolution:{take:rest[1],reviewHash:rest[2]}}:{});
  }
  const result=report(j.state,c,inventory);await j.report(result);
  // Report is passive, escaped HTML with no scripts, remote assets or credentials.
  await atomic(path.join(j.root,'report.html'),html(result),{text:true});
  console.log(JSON.stringify({report:path.join(j.root,'report.html'),statuses:result.entries.map(e=>({id:e.id,status:e.status})),unmapped:{netlify:inventory.netlifyUnmapped.length,supabase:inventory.supabaseUnmapped.length}},null,2));
  if(result.entries.some(e=>!['synced','unchanged','establish','converged','to-netlify','to-supabase'].includes(e.status))||inventory.netlifyUnmapped.length||inventory.supabaseUnmapped.length)process.exitCode=2;
 }finally{await j.release();}
}
if(require.main===module)main(process.argv.slice(2)).catch(()=>{console.error('Sync stopped. No force retry was attempted. Check the private journal and configuration; credentials and remote error payloads are intentionally not logged.');process.exitCode=1;});
module.exports={validateConfig,privateJSON,main};
