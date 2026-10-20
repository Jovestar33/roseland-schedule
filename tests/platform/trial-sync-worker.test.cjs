const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {watch,cycle,interval}=require('../../scripts/trial-sync/worker.cjs');
const {openJournal}=require('../../scripts/trial-sync/journal.cjs');
const {healthSummary}=require('../../scripts/trial-sync/cli.cjs');
const {html}=require('../../scripts/trial-sync/report.cjs');
const m={id:'10000000-0000-4000-8000-000000000001',netlifyKey:'Fictional schedule',supabaseId:'20000000-0000-4000-8000-000000000001'};
const config={organizationId:'local-fictional',mappings:[m]};
const doc={meta:{town:'Fictional'},rows:[{desc:'Original',notes:'Keep'}]};
function setup(){
 const cells=Object.fromEntries(['netlify','supabase'].map(s=>[s,{version:'1',document:structuredClone(doc),guard:{name:'Fictional'}}]));
 const writes=[],health=[],waits=[],controller=new AbortController();let clock=0,checks=0;
 const journal={state:{entries:{}},checkpoint:async()=>{}};
 const adapters=Object.fromEntries(['netlify','supabase'].map(side=>[side,{verify:async()=>{checks++;},list:async()=>[side==='netlify'?m.netlifyKey:m.supabaseId],read:async()=>structuredClone(cells[side]),write:async(_,expected,next)=>{assert.equal(cells[side].version,expected.version);writes.push(side);cells[side]={...cells[side],version:String(+cells[side].version+1),document:structuredClone(next)};return structuredClone(cells[side]);}}]));
 return{cells,adapters,journal,writes,health,waits,controller,checks:()=>checks,edit(side,desc){cells[side].document.rows[0].desc=desc;cells[side].version=String(+cells[side].version+1);},async run({factory=async()=>adapters,afterWait=()=>controller.abort(),publish=async(r,h)=>health.push(structuredClone(h))}={}){return watch({journal,config,adaptersFactory:factory,publish,signal:controller.signal,intervalSeconds:15,now:()=>clock,wait:async ms=>{waits.push(ms);clock+=ms;await afterWait(waits.length);}});}};
}
test('foreground worker propagates both directions, does not echo, and stops cleanly',async()=>{
 const h=setup();await h.run({afterWait:n=>{if(n===1)h.edit('netlify','From legacy');if(n===2)h.edit('supabase','From new app');if(n===4)h.controller.abort();}});
 assert.deepEqual(h.writes,['supabase','netlify']);assert.equal(h.checks(),4);assert.deepEqual(h.cells.netlify.document,h.cells.supabase.document);assert.equal(h.health.at(-1).state,'stopped');assert.equal(h.health.at(-1).nextCheckAt,null);
});
test('simultaneous conflicting edits remain untouched over repeated checks',async()=>{
 const h=setup();await h.run({afterWait:n=>{if(n===1){h.edit('netlify','Left');h.edit('supabase','Right');}if(n===3)h.controller.abort();}});
 assert.equal(h.writes.length,0);assert.ok(h.health.some(x=>x.state==='needs-review'));assert.equal(h.journal.state.entries[m.id].observed.supabase.document.rows[0].desc,'Right');
});
test('expired session stops all writes, backs off and reloads renewed credentials',async()=>{
 const h=setup();let factoryCalls=0;
 await h.run({factory:async()=>{factoryCalls++;if(factoryCalls<3)throw Object.assign(Error('remote secrets must not appear'),{code:'AUTH_REQUIRED'});return h.adapters;},afterWait:n=>{if(n===3)h.controller.abort();}});
 assert.deepEqual(h.waits,[30000,60000,15000]);assert.equal(factoryCalls,3);assert.equal(h.writes.length,0);assert.equal(h.health.find(x=>x.state==='attention').error,'AUTH_REQUIRED');assert.ok(!JSON.stringify(h.health).includes('remote secrets'));assert.ok(h.health.some(x=>x.state==='waiting'));
});
test('unknown/storage failure stops instead of repeatedly retrying writes',async()=>{
 const h=setup();await assert.rejects(h.run({factory:async()=>{throw Error('Disk/config issue');}}),/Disk\/config/);assert.equal(h.waits.length,0);assert.equal(h.health.at(-1).state,'stopped-error');assert.equal(h.health.at(-1).error,'CHECK_FAILED');
});
test('failure to persist health stops before adapter access',async()=>{
 const h=setup();let opened=false;await assert.rejects(h.run({factory:async()=>{opened=true;return h.adapters;},publish:async()=>{throw Error('Disk full');}}),/Disk full/);assert.equal(opened,false);
});
test('graceful abort during write finishes readback and durable intent before exit',async()=>{
 const h=setup();await cycle({journal:h.journal,config,adapters:h.adapters});h.edit('netlify','Changed');const write=h.adapters.supabase.write;h.adapters.supabase.write=async(...args)=>{h.controller.abort();return write(...args);};await h.run();assert.equal(h.writes.length,1);assert.equal(h.journal.state.entries[m.id].pending,null);assert.equal(h.journal.state.entries[m.id].status,'synced');assert.equal(h.health.at(-1).state,'stopped');assert.equal(h.waits.length,0);
});
test('missing index with retained checkpoints cannot reset the common baseline',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'trial-index-'));try{const j=await openJournal(root,{env:'fictional'});j.state.entries.x={base:doc};await j.checkpoint(j.state);await j.release();await fs.unlink(path.join(root,'state.json'));await assert.rejects(openJournal(root,{env:'fictional'}),/Missing journal index/);}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('status cannot claim a saved heartbeat proves a live worker, and expires stale snapshots',()=>{
 const h={state:'waiting',updatedAt:'2026-10-20T10:00:00Z',nextCheckAt:'2026-10-20T10:00:30Z',intervalSeconds:30};assert.equal(healthSummary(h,Date.parse('2026-10-20T10:00:31Z')).freshSnapshot,true);assert.equal(healthSummary(h,Date.parse('2026-10-20T10:10:00Z')).freshSnapshot,false);assert.equal(healthSummary(h).liveProcessVerified,false);
});
test('report shows stopped/auth state even when last schedule copies were current',()=>{
 const r={generatedAt:new Date().toISOString(),worker:{state:'attention',error:'AUTH_REQUIRED',updatedAt:new Date().toISOString()},inventory:{netlifyUnmapped:[],supabaseUnmapped:[]},entries:[]};assert.match(html(r),/Sync interrupted/);assert.match(html(r),/stale report does not prove/);assert.match(html(r),/AUTH_REQUIRED/);
});
test('invalid tight polling intervals are rejected',()=>{for(const n of [0,1,14,15.5,3601,'wat'])assert.throws(()=>interval(n));assert.equal(interval(),30);assert.equal(interval(60),60);});
test('unchanged polling retains health without appending full recovery documents',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'trial-quiet-'));try{
  let j=await openJournal(root,{env:'fictional'});const h=setup();h.journal=j;
  await cycle({journal:j,config,adapters:h.adapters});const initial=(await fs.readdir(path.join(root,'checkpoints'))).length;
  for(let i=0;i<5;i++)await cycle({journal:j,config,adapters:h.adapters});
  assert.equal((await fs.readdir(path.join(root,'checkpoints'))).length,initial);
  await j.release();j=await openJournal(root,{env:'fictional'});assert.equal(j.state.entries[m.id].status,'synced');assert.ok(j.state.entries[m.id].checkedAt);assert.deepEqual(j.state.entries[m.id].base,doc);await j.release();
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('real legacy save handler rejects a stale editor after a sync write',async()=>{
 const crypto=require('node:crypto'),{netlifyAdapter}=require('../../scripts/trial-sync/adapters.cjs');
 const original={password:process.env.SCHEDULE_APP_PASSWORD,secret:process.env.SCHEDULE_AUTH_SECRET};
 process.env.SCHEDULE_APP_PASSWORD='fictional-only-password';process.env.SCHEDULE_AUTH_SECRET='fictional-only-secret';
 let cell={data:{...structuredClone(doc),savedAt:10},etag:'1',metadata:{}},revision=1;
 const store={getWithMetadata:async()=>structuredClone(cell),get:async()=>structuredClone(cell.data),set:async(k,data,options)=>{if(options.onlyIfMatch!==cell.etag)return{modified:false};cell={data:JSON.parse(data),etag:String(++revision),metadata:options.metadata};return{modified:true,etag:cell.etag};}};
 try{
  const a=netlifyAdapter({store,library:{get:async()=>({})}}),before=await a.read(m),next=structuredClone(doc);next.rows[0].notes='New-app change';await a.write(m,before,next);
  const handler=require('../../netlify/lib/save-handler.cjs').createHandler(()=>store);
  const token=crypto.createHmac('sha256',process.env.SCHEDULE_AUTH_SECRET).update('editor:'+process.env.SCHEDULE_APP_PASSWORD).digest('hex');
  const result=await handler({httpMethod:'POST',body:JSON.stringify({name:m.netlifyKey,data:doc,expectedSavedAt:10,editorToken:token})});
  assert.equal(result.statusCode,409);assert.equal(cell.data.rows[0].notes,'New-app change');assert.equal(JSON.parse(result.body).remoteData.rows[0].notes,'New-app change');
 }finally{for(const [key,val]of [['SCHEDULE_APP_PASSWORD',original.password],['SCHEDULE_AUTH_SECRET',original.secret]]){if(val===undefined)delete process.env[key];else process.env[key]=val;}}
});
