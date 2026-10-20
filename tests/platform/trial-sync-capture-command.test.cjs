const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {captureTransport,verifyCapture,SITE,ORIGIN}=require('../../scripts/trial-sync/capture-command.cjs');
const {captureLive,stores}=require('../../scripts/trial-sync/capture-live.cjs');
const {hash}=require('../../scripts/trial-sync/core.cjs');
const secret='fictional-test-value-that-is-not-a-real-key';
test('capture transport pins source, redacts provider errors and refuses every write',async()=>{
 let calls=0;const bridge=captureTransport(secret,async(url,options)=>{calls++;assert.equal(url,ORIGIN+'/.netlify/functions/trial-sync');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+secret);return new Response(JSON.stringify({siteId:SITE,store:'schedules',keys:[]}));});
 assert.deepEqual((await bridge({operation:'inventory',store:'schedules'})).keys,[]);
 await assert.rejects(bridge({operation:'write',store:'schedules',key:'one'}),/Read-only/);
 await assert.rejects(bridge({operation:'raw',store:'schedules',key:'one',document:{}}),/Read-only/);assert.equal(calls,1);
 const failed=captureTransport(secret,async()=>new Response(secret,{status:401}));await assert.rejects(failed({operation:'inventory',store:'schedules'}),e=>e.message.includes('401')&&!e.message.includes(secret));
 assert.throws(()=>captureTransport(secret+'\n'),/credential/);
});
test('capture transport refuses wrong source and oversized responses',async()=>{
 await assert.rejects(captureTransport(secret,async()=>new Response(JSON.stringify({siteId:'other',store:'schedules'})))({operation:'inventory',store:'schedules'}),/identity/);
 await assert.rejects(captureTransport(secret,async()=>new Response(' '.repeat(6500001)))({operation:'inventory',store:'schedules'}),/size limit/);
});
async function fixture(run){const root=await fs.mkdtemp(path.join(os.tmpdir(),'capture-verify-'));try{
 const folder=path.join(root,'capture');await captureLive({siteId:SITE,origin:ORIGIN,folder,bridge:async b=>b.operation==='inventory'?{siteId:SITE,store:b.store,keys:b.store==='schedules'?['Town']:[]}:{siteId:SITE,store:b.store,key:b.key,etag:'one',metadata:{},bytes:Buffer.from('{"meta":{},"rows":[]}').toString('base64')}});await run(folder);
 }finally{await fs.rm(root,{recursive:true,force:true});}}
test('backup verification checks exact bytes and privacy independently',()=>fixture(async folder=>{
 assert.equal((await verifyCapture(folder)).entries.length,1);
 await fs.chmod(path.join(folder,'000000.blob'),0o644);await assert.rejects(verifyCapture(folder),/Private regular/);await fs.chmod(path.join(folder,'000000.blob'),0o600);
 await fs.writeFile(path.join(folder,'000000.blob'),'changed');await assert.rejects(verifyCapture(folder),/checksum/);
}));
test('backup verification rejects omitted inventory, duplicate files and extra files',()=>fixture(async folder=>{
 const p=path.join(folder,'manifest.json'),original=await fs.readFile(p,'utf8'),m=JSON.parse(original);m.inventory.schedules.push('missing');delete m.sha256;m.sha256=hash(m);await fs.writeFile(p,JSON.stringify(m));await assert.rejects(verifyCapture(folder),/inventory mismatch/);
 await fs.writeFile(p,original);await fs.writeFile(path.join(folder,'extra'),'private',{mode:0o600});await assert.rejects(verifyCapture(folder),/Uninventoried/);
}));
