'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const stores=['schedules','schedule-library','schedule-snapshots','schedule-templates','cms','production-index'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const {canonical}=require('./core.cjs');
async function captureLive({bridge,siteId,origin,folder,now=()=>new Date().toISOString()}){
 // Incomplete attempts are retained privately for diagnosis but never produce a
 // completed manifest. This is a double-read observation, not an atomic freeze.
 await fs.mkdir(folder,{mode:0o700});await fs.chmod(folder,0o700);
 const start=now(),inventory={},entries=[];
 async function list(store){const r=await bridge({operation:'inventory',store});if(r?.siteId!==siteId||r.store!==store||!Array.isArray(r.keys)||r.keys.some(x=>typeof x!=='string')||new Set(r.keys).size!==r.keys.length)throw Error('Invalid source inventory');return [...r.keys].sort();}
 async function read(store,key){const r=await bridge({operation:'raw',store,key});if(r?.siteId!==siteId||r.store!==store||r.key!==key||typeof r.etag!=='string'||!r.etag||typeof r.bytes!=='string'||!r.metadata||typeof r.metadata!=='object'||Array.isArray(r.metadata))throw Error('Invalid source object');const bytes=Buffer.from(r.bytes,'base64');if(bytes.toString('base64')!==r.bytes)throw Error('Invalid source bytes');return{bytes,etag:r.etag,metadata:r.metadata};}
 for(const store of stores){inventory[store]=await list(store);for(const key of inventory[store]){const r=await read(store,key),file=String(entries.length).padStart(6,'0')+'.blob';await fs.writeFile(path.join(folder,file),r.bytes,{mode:0o600,flag:'wx'});entries.push({store,key,file,etag:r.etag,metadata:r.metadata,sha256:digest(r.bytes),length:r.bytes.length});}}
 for(const store of stores)if(canonical(await list(store))!==canonical(inventory[store]))throw Error('Source inventory changed; capture not complete');
 for(const item of entries){const current=await read(item.store,item.key);if(current.etag!==item.etag||digest(current.bytes)!==item.sha256||canonical(current.metadata)!==canonical(item.metadata))throw Error('Source changed; capture not complete');}
 // Recheck inventory after content verification to catch creations/deletions.
 for(const store of stores)if(canonical(await list(store))!==canonical(inventory[store]))throw Error('Source inventory changed; capture not complete');
 const manifest={format:'roseland.live-blobs-capture.v1',siteId,origin,startedAt:start,completedAt:now(),atomic:false,verification:'inventory-content-inventory-double-read',inventory,entries};
 manifest.sha256=digest(canonical(manifest));await fs.writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});return manifest;
}
module.exports={captureLive,stores};
