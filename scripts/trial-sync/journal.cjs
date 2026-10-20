'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {hash}=require('./core.cjs');
const healthKeys=['checkedAt','syncedAt','status','error'];
function recoveryEntry(entry){const out=structuredClone(entry);for(const key of healthKeys)delete out[key];return out;}
function entryHealth(entry){return Object.fromEntries(healthKeys.filter(k=>entry[k]!==undefined).map(k=>[k,entry[k]]));}
async function privateDirectory(root){
 await fs.mkdir(root,{recursive:true,mode:0o700});const s=await fs.lstat(root);
 if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077))throw Error('Journal directory must be private (chmod 700), and not a symlink');
}
async function syncDirectory(root){const d=await fs.open(root,'r');try{await d.sync();}finally{await d.close();}}
async function privateRead(file){const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077))throw Error('Private regular journal file required');return JSON.parse(await fs.readFile(file,'utf8'));}
async function atomic(file,value,{text=false}={}){
 const tmp=file+'.'+randomUUID()+'.tmp';let h;
 try{h=await fs.open(tmp,'wx',0o600);await h.writeFile(text?value:JSON.stringify(value,null,2)+'\n');await h.sync();await h.close();h=null;await fs.rename(tmp,file);await syncDirectory(path.dirname(file));}
 finally{if(h)await h.close();await fs.unlink(tmp).catch(()=>{});}
}
async function openJournal(root,binding){
 root=path.resolve(root);await privateDirectory(root);
 const lock=path.join(root,'worker.lock');let lockHandle;
 try{lockHandle=await fs.open(lock,'wx',0o600);}catch{throw Error('Journal is locked. Stop the other worker; inspect any crash before removing worker.lock.');}
 await lockHandle.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));await lockHandle.sync();
 const release=async()=>{await lockHandle.close();await fs.unlink(lock);};
 try{
  const file=path.join(root,'state.json'),archiveRoot=path.join(root,'checkpoints');await privateDirectory(archiveRoot);let state,refs={};
  try{
   state=await privateRead(file);
   if(state.storage==='entry-checkpoints-v1'){
    refs=state.entries;state.entries={};
    for(const [id,ref]of Object.entries(refs)){
     if(!ref||typeof ref.file!=='string'||!/^\d+-[a-f0-9-]+\.json$/.test(ref.file))throw Error('Invalid checkpoint reference');
     const archived=await privateRead(path.join(archiveRoot,ref.file));if(hash(archived.entries?.[id])!==ref.hash)throw Error('Checkpoint integrity failure');state.entries[id]={...archived.entries[id],...(ref.health||{})};
    }
    delete state.storage;
   }
  }catch(e){if(e.code!=='ENOENT')throw e;
   // A missing referenced checkpoint is data corruption, never a fresh journal.
   if(state)throw Error('Missing recovery checkpoint');
   if((await fs.readdir(archiveRoot)).length)throw Error('Missing journal index with retained checkpoints; restore the index before continuing');
   state={format:1,binding:hash(binding),sequence:0,entries:{}};
  }
  if(state.format!==1||state.binding!==hash(binding))throw Error('Journal belongs to a different environment or mapping. Do not reuse it.');
  if(!state.entries||!Number.isSafeInteger(state.sequence))throw Error('Invalid journal');
  return {state,release,async checkpoint(next){
   for(const id of Object.keys(refs))if(!(id in next.entries))throw Error('Cannot silently remove a mapped journal entry');
   next.sequence++;
   const recovery=Object.fromEntries(Object.entries(next.entries).map(([id,e])=>[id,recoveryEntry(e)]));
   const changed=Object.fromEntries(Object.entries(recovery).filter(([id,e])=>refs[id]?.hash!==hash(e)));
   const nextRefs={...refs};
   if(Object.keys(changed).length){
    const name=String(next.sequence).padStart(10,'0')+'-'+randomUUID()+'.json';
    // Only changed schedules are appended, avoiding a full-library copy for each row.
    const h=await fs.open(path.join(archiveRoot,name),'wx',0o600);try{await h.writeFile(JSON.stringify({format:1,entries:changed})+'\n');await h.sync();}finally{await h.close();}
    await syncDirectory(archiveRoot);
    for(const [id,e]of Object.entries(changed))nextRefs[id]={file:name,hash:hash(e)};
   }
   // Poll timestamps and status live in the replaceable index; immutable recovery
   // documents are appended only when their actual content or versions change.
   for(const [id,e]of Object.entries(next.entries))nextRefs[id]={...nextRefs[id],health:entryHealth(e)};
   await atomic(file,{...next,storage:'entry-checkpoints-v1',entries:nextRefs});refs=nextRefs;
  },async report(value){await atomic(path.join(root,'report.json'),value);},root};
 }catch(e){await release();throw e;}
}
module.exports={openJournal,atomic};
