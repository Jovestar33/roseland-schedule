const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {previewCopies}=require('../../scripts/trial-sync/preview.cjs');
const {createHandler}=require('../../netlify/lib/trial-sync-handler.cjs');
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const binding={integrationId:id(1),organizationId:id(2),netlifySiteId:id(3),legacyOrigin:'https://fictional.netlify.app'};
const doc={meta:{town:'Fictional',contact:{phone:'private-contact'}},rows:[]};
function fixture(count=1){
 const events=[],state={left:structuredClone(doc),right:structuredClone(doc),reads:0,authorized:true};
 const mappings=Array.from({length:count},(_,n)=>({id:id(10+n),schedule_id:id(20+n),legacy_key:'Fictional '+n}));
 const status={configured:true,id:binding.integrationId,revision:1,legacy_origin:binding.legacyOrigin,enabled:false,mappings};
 const rpc=async(name,body)=>{
  events.push(name);
  if(name==='read_trial_sync_status'){if(!state.authorized)throw Error('Revoked');return status;}
  if(name==='list_schedule_library')return mappings.map(m=>({id:m.schedule_id,organization_id:binding.organizationId,deleted_at:null,display_name:m.legacy_key}));
  if(name==='session_read_schedule')return {id:body.target_schedule_id,organization_id:binding.organizationId,deleted_at:null,document_schema_version:1,document_version:1,document:state.right,production_id:id(8),production_day_id:null,phase_id:null,display_name:'Fictional',slug:'fictional',status:'draft',library_position:0};
  throw Error('Forbidden RPC: '+name);
 };
 const bridge=async body=>{
  events.push(body.operation);if(body.operation==='inventory')return {siteId:binding.netlifySiteId,store:'schedules',keys:mappings.map(m=>m.legacy_key)};
  assert.equal(body.operation,'raw');state.reads++;
  return {siteId:binding.netlifySiteId,store:'schedules',key:body.key,etag:'v1',bytes:Buffer.from(JSON.stringify(state.left)).toString('base64')};
 };
 return {binding,state,events,mappings,status,rpc,bridge};
}
test('paused integration can compare matching copies without any mutation or content disclosure',async()=>{
 const f=fixture(),result=await previewCopies(f);
 assert.equal(result.rows[0].state,'matching');assert.equal(result.nextOffset,null);
 assert.equal(JSON.stringify(result).includes('private-contact'),false);
 assert.deepEqual(new Set(f.events),new Set(['read_trial_sync_status','list_schedule_library','inventory','raw','session_read_schedule']));
 assert.equal(f.state.reads,2);assert.equal(f.status.enabled,false);
});
test('all fields and row ordering affect comparison; transport savedAt does not',async()=>{
 const f=fixture();f.state.left.savedAt=4;f.state.right.savedAt=9;
 assert.equal((await previewCopies(f)).rows[0].state,'matching');
 f.state.left.meta.contact.phone='new-private-contact';assert.equal((await previewCopies(f)).rows[0].state,'different');
});
test('permission denial and tenant/source mismatch stop before any legacy request',async()=>{
 for(const change of [f=>f.state.authorized=false,f=>f.status.id=id(99),f=>f.status.legacy_origin='https://other.netlify.app']){
  const f=fixture();change(f);await assert.rejects(previewCopies(f));assert.equal(f.events.includes('inventory'),false);
 }
 const f=fixture(),rpc=f.rpc;f.rpc=async(n,b)=>{const r=await rpc(n,b);return n==='session_read_schedule'?{...r,organization_id:id(99)}:r;};
 assert.equal((await previewCopies(f)).rows[0].state,'unavailable');
});
test('revoked access after reads does not release the comparison result',async()=>{
 const f=fixture(),bridge=f.bridge;f.bridge=async body=>{const r=await bridge(body);if(f.state.reads===2)f.state.authorized=false;return r;};await assert.rejects(previewCopies(f));
});
test('changed source version is reported rather than called matching',async()=>{
 const f=fixture(),bridge=f.bridge;f.bridge=async b=>{const r=await bridge(b);return b.operation==='raw'?{...r,etag:'v'+f.state.reads}:r;};
 assert.equal((await previewCopies(f)).rows[0].state,'changed-during-check');
});
test('batches require the same reviewed mapping set and reject stale continuations',async()=>{
 const f=fixture(4),first=await previewCopies(f);assert.equal(first.nextOffset,3);assert.equal(first.rows.length,3);
 assert.equal((await previewCopies({...f,offset:3,expectedMappingsHash:first.mappingsHash})).rows.length,1);
 f.status.revision++;await assert.rejects(previewCopies({...f,offset:3,expectedMappingsHash:first.mappingsHash}));
 await assert.rejects(previewCopies({...f,offset:3}));
});
test('inventory reports missing and unconnected schedules without creating them',async()=>{
 const f=fixture(),rpc=f.rpc,bridge=f.bridge;
 f.bridge=async b=>b.operation==='inventory'?{siteId:binding.netlifySiteId,store:'schedules',keys:['Added later']}:bridge(b);
 f.rpc=async(n,b)=>n==='list_schedule_library'?[{id:id(98),organization_id:binding.organizationId,deleted_at:null,display_name:'New app only'}]:rpc(n,b);
 const r=await previewCopies(f);assert.deepEqual(r.inventory.legacyUnmapped,['Added later']);assert.equal(r.inventory.targetMissing.length,1);assert.equal(r.inventory.targetUnmapped.length,1);
});
test('wrong legacy site and malformed inventory fail closed',async()=>{
 for(const inventory of [{siteId:id(99),store:'schedules',keys:[]},{siteId:binding.netlifySiteId,store:'schedules',keys:['Duplicate','Duplicate']}]){
  const f=fixture();f.bridge=async()=>inventory;await assert.rejects(previewCopies(f));
 }
});
test('real legacy bridge permits preview raw reads while the write allowlist remains empty',async()=>{
 const secret='test-only-secret-'.repeat(3),env={NETLIFY:'true',SITE_ID:binding.netlifySiteId,ROSELAND_TRIAL_SYNC_NETLIFY_SITE_ID:binding.netlifySiteId,ROSELAND_TRIAL_SYNC_LEGACY_ORIGIN:binding.legacyOrigin,ROSELAND_TRIAL_SYNC_BRIDGE_ENABLED:'true',ROSELAND_TRIAL_SYNC_BRIDGE_SECRET:secret,ROSELAND_TRIAL_SYNC_KEYS:'[]'};
 const handler=createHandler(()=>({list:async function*(){yield {blobs:[{key:'Fictional 0'}]};},getWithMetadata:async()=>({data:Buffer.from(JSON.stringify(doc)),etag:'v1',metadata:{}})}),env);
 const call=async body=>handler(new Request(binding.legacyOrigin+'/.netlify/functions/trial-sync',{method:'POST',headers:{Authorization:'Bearer '+secret},body:JSON.stringify(body)}),{site:{id:env.SITE_ID},deploy:{context:'production',published:true}});
 const f=fixture();f.bridge=async body=>{const r=await call(body);assert.equal(r.status,200);return r.json();};assert.equal((await previewCopies(f)).rows[0].state,'matching');
 assert.equal((await call({operation:'write',key:'Fictional 0',expected:{version:'v1'},document:doc})).status,403);
});
function loadRoute(f){
 const env={ROSELAND_TRIAL_SYNC_ORGANIZATION_ID:binding.organizationId,ROSELAND_TRIAL_SYNC_INTEGRATION_ID:binding.integrationId,ROSELAND_TRIAL_SYNC_NETLIFY_SITE_ID:binding.netlifySiteId,ROSELAND_TRIAL_SYNC_LEGACY_ORIGIN:binding.legacyOrigin,ROSELAND_TRIAL_SYNC_BRIDGE_SECRET:'test-only-bridge-'.repeat(3)};
 const config={appOrigin:'https://fictional.vercel.app',supabaseUrl:'https://fictional.supabase.co',anonymousKey:'sb_publishable_test'};
 class PlatformHttpError extends Error{constructor(status,message){super(message);this.status=status;}}
 const calls=[];const mocks={'next/server':{NextResponse:{json:(v,o={})=>new Response(JSON.stringify(v),{status:o.status??200,headers:o.headers})}},'@/lib/platform/hosted-workspace-config':{readHostedWorkspaceConfig:()=>config},'@/lib/platform/server':{PlatformHttpError,readPlatformJson:r=>r.json()},'@/scripts/trial-sync/preview.cjs':{previewCopies}};
 const mod={exports:{}};const js=ts.transpileModule(fs.readFileSync('app/api/trial-sync/preview/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{process:{env},Date,AbortSignal,fetch:async(url,options)=>{calls.push({url,options});const b=JSON.parse(options.body);let value;if(url.startsWith(config.supabaseUrl)){assert.equal(options.headers.apikey,config.anonymousKey);value=await f.rpc(url.split('/').pop(),b);}else{assert.equal(url,binding.legacyOrigin+'/.netlify/functions/trial-sync');value=await f.bridge(b);}return new Response(JSON.stringify(value));}})(n=>mocks[n],mod,mod.exports);
 return {post:mod.exports.POST,calls,config,env};
}
test('HTTP comparison rejects anonymous/cross-origin/wrong-organization requests before reading data',async()=>{
 const f=fixture(),h=loadRoute(f),request=(headers,body)=>new Request('https://fictional.vercel.app/api/trial-sync/preview',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 const headers={origin:h.config.appOrigin,authorization:'Bearer aaa.bbb.ccc'};
 for(const [head,body,status] of [[{origin:h.config.appOrigin},{organizationId:binding.organizationId},401],[{...headers,origin:'https://evil.test'},{organizationId:binding.organizationId},403],[headers,{organizationId:id(99)},400]])assert.equal((await h.post(request(head,body))).status,status);
 assert.equal(h.calls.length,0);
 const r=await h.post(request(headers,{organizationId:binding.organizationId}));assert.equal(r.status,200);assert.equal((await r.json()).rows[0].state,'matching');
 assert.ok(h.calls.every(c=>c.options.redirect==='error'&&c.options.cache==='no-store'));

});
