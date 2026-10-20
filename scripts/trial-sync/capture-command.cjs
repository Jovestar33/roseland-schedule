'use strict';
// A read-only, site-bound capture command. The credential arrives on stdin, never
// argv or disk. Only inventory/raw operations are admitted by this transport.
const fs=require('node:fs/promises'),path=require('node:path');
const {captureLive,stores}=require('./capture-live.cjs');
const {canonical,hash}=require('./core.cjs');
const SITE='53a070b7-1da9-4a24-a2d8-6560a013d427';
const ORIGIN='https://roselandschedule.netlify.app';
function captureTransport(secret,fetchImpl=fetch){
 if(typeof secret!=='string'||!/^\S{32,512}$/.test(secret)||/[^\x21-\x7e]/.test(secret))throw Error('Invalid credential format');
 return async body=>{
  if(!body||!['inventory','raw'].includes(body.operation)||!stores.includes(body.store)||Object.keys(body).some(k=>!['operation','store','key'].includes(k)))throw Error('Read-only capture operation required');
  if(body.operation==='raw'&&(typeof body.key!=='string'||!body.key||body.key.length>1000))throw Error('Invalid source key');
  let response;
  try{response=await fetchImpl(ORIGIN+'/.netlify/functions/trial-sync',{method:'POST',headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{throw Error('Capture connection failed; no source write was attempted');}
  if(!response.ok)throw Error('Capture endpoint returned HTTP '+response.status+'; check the bridge configuration');
  const parts=[];let size=0;const reader=response.body.getReader();
  for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>6500000){await reader.cancel();throw Error('Capture response exceeded size limit');}parts.push(Buffer.from(p.value));}
  let value;try{value=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw Error('Invalid capture response');}
  if(value.siteId!==SITE||value.store!==body.store)throw Error('Source identity mismatch');
  return value;
 };
}
async function verifyCapture(folder){
 const dir=await fs.lstat(folder);if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077))throw Error('Private capture directory required');
 async function read(name){
  if(typeof name!=='string'||!(name==='manifest.json'||/^\d{6}[.]blob$/.test(name)))throw Error('Invalid capture filename');
  const p=path.join(folder,name),s=await fs.lstat(p);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077))throw Error('Private regular capture file required');
  return fs.readFile(p);
 }
 const m=JSON.parse(await read('manifest.json'));
 if(m.format!=='roseland.live-blobs-capture.v1'||m.siteId!==SITE||m.origin!==ORIGIN||m.atomic!==false||m.verification!=='inventory-content-inventory-double-read'||m.sha256!==hash(Object.fromEntries(Object.entries(m).filter(([k])=>k!=='sha256'))))throw Error('Capture manifest verification failed');
 if(!m.inventory||canonical(Object.keys(m.inventory).sort())!==canonical([...stores].sort())||!Array.isArray(m.entries))throw Error('Incomplete capture inventory');
 const seen=new Set(),files=new Set(['manifest.json']);
 for(const e of m.entries){
  const key=canonical([e.store,e.key]);if(seen.has(key)||files.has(e.file)||!stores.includes(e.store)||typeof e.key!=='string'||!Array.isArray(m.inventory[e.store])||!m.inventory[e.store].includes(e.key)||typeof e.etag!=='string'||!e.etag)throw Error('Invalid capture entry');seen.add(key);files.add(e.file);
  const b=await read(e.file);if(b.length!==e.length||require('node:crypto').createHash('sha256').update(b).digest('hex')!==e.sha256)throw Error('Capture bytes failed checksum');
 }
 for(const store of stores){const keys=m.inventory[store];if(!Array.isArray(keys)||new Set(keys).size!==keys.length||keys.some(key=>!seen.has(canonical([store,key]))))throw Error('Capture inventory mismatch');}
 if(canonical((await fs.readdir(folder)).sort())!==canonical([...files].sort()))throw Error('Uninventoried capture files');
 return m;
}
async function main(){
 if(process.argv.length!==3)throw Error('Private destination folder required');
 let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>514)throw Error('Invalid credential input');}
 const folder=path.resolve(process.argv[2]),secret=input.replace(/\r?\n$/,'');input='';
 const m=await captureLive({bridge:captureTransport(secret),siteId:SITE,origin:ORIGIN,folder});
 await verifyCapture(folder);
 console.log('Read-only legacy backup complete; private files and checksums verified.');
 console.log('Objects retained: '+m.entries.length+'. Stores: '+stores.length+'.');
 console.log('Private recovery folder: '+folder);
 console.log('No schedule edits or imports were made. This is a stable double-read capture, not a frozen snapshot.');
}
if(require.main===module)main().catch(e=>{console.error('Capture stopped: '+e.message);process.exitCode=1;});
module.exports={captureTransport,verifyCapture,SITE,ORIGIN};
