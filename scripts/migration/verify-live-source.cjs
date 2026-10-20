'use strict';
const fs=require('node:fs/promises'),crypto=require('node:crypto');
const {captureTransport,SITE,ORIGIN}=require('../trial-sync/capture-command.cjs');
const {stores}=require('../trial-sync/capture-live.cjs');
const {canonical,hash}=require('../trial-sync/core.cjs');
async function verifyLive(plan,bridge){
 if(plan.format!=='roseland.live-trial-import.v1'||plan.site_id!==SITE||plan.origin!==ORIGIN||plan.sha256!==hash(Object.fromEntries(Object.entries(plan).filter(([k])=>k!=='sha256'))))throw Error('Import plan integrity failed');
 async function inventory(){for(const store of stores){const r=await bridge({operation:'inventory',store});if(r.siteId!==SITE||r.store!==store||!Array.isArray(r.keys)||canonical([...r.keys].sort())!==canonical([...plan.capture_manifest.inventory[store]].sort()))throw Error('Legacy inventory changed; recapture and review before import');}}
 await inventory();
 for(const e of plan.objects){const r=await bridge({operation:'raw',store:e.store,key:e.key});if(r.siteId!==SITE||r.store!==e.store||r.key!==e.key||typeof r.bytes!=='string')throw Error('Legacy response identity mismatch');const bytes=Buffer.from(r.bytes,'base64');if(bytes.toString('base64')!==r.bytes||r.etag!==e.etag||bytes.length!==e.length||crypto.createHash('sha256').update(bytes).digest('hex')!==e.sha256||canonical(r.metadata)!==canonical(e.metadata))throw Error('Legacy data changed; recapture and review before import');}
 await inventory();return {verified:true,objects:plan.objects.length,atomic:false};
}
if(require.main===module)(async()=>{if(process.argv.length!==3)throw Error('Private plan file required');const p=JSON.parse(await fs.readFile(process.argv[2],'utf8'));let secret='';for await(const chunk of process.stdin){secret+=chunk;if(secret.length>514)throw Error('Invalid credential input');}secret=secret.replace(/\r?\n$/,'');console.log(JSON.stringify(await verifyLive(p,captureTransport(secret))));})().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={verifyLive};
