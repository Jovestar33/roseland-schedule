const {test}=require('node:test'),assert=require('node:assert/strict');
const {authorized,runHosted,transport}=require('../../scripts/trial-sync/hosted.cjs');
const {createHandler}=require('../../netlify/lib/trial-sync-handler.cjs');
const testHandler=(store,env)=>request=>createHandler(store,env)(request,{site:{id:env.SITE_ID},deploy:{context:'production',published:true}});
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const document={meta:{town:'Fictional'},rows:[]};
const args={integrationId:id(1),organizationId:id(2),netlifySiteId:id(3),legacyOrigin:'https://fictional.netlify.app',deadline:60000,now:()=>1000,maxMappings:1};
function setup(){
 const state={entry:{base:structuredClone(document),guards:{netlify:{source:'legacy'},supabase:{production:id(7),day:null,phase:null,name:'Fictional',slug:'fictional',status:'draft',position:0,placement:{projectName:null,phase:null,dayNumber:null,totalDays:null}}},pending:null,status:'synced'},sequence:0,left:structuredClone(document),right:structuredClone(document),version:1,events:[],failCheckpoint:false,lostAck:false,claims:0};
 const row=()=>({id:id(5),organization_id:id(2),deleted_at:null,document_schema_version:1,document_version:state.version,document:state.right,production_id:id(7),production_day_id:null,phase_id:null,display_name:'Fictional',slug:'fictional',status:'draft',library_position:0});
 const rpc=async(name,body)=>{state.events.push(name);if(name==='claim_trial_sync_mapping'){state.claims++;return{state:'claimed',mapping:{id:id(4),supabaseId:id(5),netlifyKey:'Fictional'},organizationId:id(2),legacyOrigin:args.legacyOrigin,netlifySiteId:id(3),entry:structuredClone(state.entry),sequence:state.sequence,leaseUntil:new Date(121000).toISOString()};}
 if(name==='checkpoint_trial_sync'){assert.equal(body.expected_sequence,state.sequence);if(state.failCheckpoint&&body.next_state.pending)throw Error('Checkpoint unavailable');state.entry=structuredClone(body.next_state);return ++state.sequence;}
 if(name==='read_trial_sync_schedule')return row();
 if(name==='write_trial_sync_schedule'){assert.ok(state.entry.pending,'durable intent precedes write');assert.equal(body.expected_version,state.version);state.right=body.next_document;state.version++;if(state.lostAck)throw Error('Lost acknowledgement');return row();}throw Error('Unexpected RPC');};
 const bridge=async body=>{if(body.operation==='write')throw Error('Unexpected reverse write');return{version:'legacy-2',document:state.left,guard:{source:'legacy'}};};
 return{state,rpc,bridge};
}
test('cron authorization fails closed and compares complete bearer secrets',()=>{const s='x'.repeat(40);assert.equal(authorized('Bearer '+s,s),true);for(const h of [null,'Bearer '+s+'x',s,'bearer '+s])assert.equal(authorized(h,s),false);assert.equal(authorized('Bearer short','short'),false);});
test('hosted worker persists intent before writing and acknowledges the next sequence',async()=>{const h=setup();h.state.left.meta.town='Edited legacy';assert.deepEqual(await runHosted({...args,...h}),{checked:1,current:1,review:0,unavailable:0});assert.equal(h.state.right.meta.town,'Edited legacy');assert.equal(h.state.entry.pending,null);});
test('failed durable checkpoint prevents a backend write',async()=>{const h=setup();h.state.left.meta.town='Edited';h.state.failCheckpoint=true;await assert.rejects(runHosted({...args,...h}));assert.equal(h.state.events.includes('write_trial_sync_schedule'),false);assert.equal(h.state.right.meta.town,'Fictional');});
test('simultaneous edits remain a visible conflict without a write',async()=>{const h=setup();h.state.left.meta.town='Left';h.state.right.meta.town='Right';assert.equal((await runHosted({...args,...h})).review,1);assert.equal(h.state.entry.status,'content-conflict');assert.equal(h.state.events.includes('write_trial_sync_schedule'),false);});
test('lost acknowledgement is recovered from persisted intent on a new invocation',async()=>{const h=setup();h.state.left.meta.town='Edited';h.state.lostAck=true;assert.equal((await runHosted({...args,...h})).review,1);assert.ok(h.state.entry.pending);h.state.lostAck=false;assert.equal((await runHosted({...args,...h})).current,1);assert.equal(h.state.events.filter(x=>x==='write_trial_sync_schedule').length,1);assert.equal(h.state.entry.pending,null);});
test('wrong tenant/site or expired claim is never used',async()=>{for(const patch of [{organizationId:id(9)},{netlifySiteId:id(9)},{legacyOrigin:'https://other.netlify.app'},{leaseUntil:new Date(0).toISOString()}]){const h=setup(),rpc=h.rpc;h.rpc=async(n,b)=>({...await rpc(n,b),...patch});await assert.rejects(runHosted({...args,...h}),e=>e.code==='TARGET_IDENTITY_OR_STATE');assert.deepEqual(h.state.events,['claim_trial_sync_mapping']);}});
test('network transport never follows redirects or prints provider errors',async()=>{let call;const t=transport({supabaseUrl:'https://fictional.supabase.co',secret:'secret',legacyOrigin:args.legacyOrigin,bridgeSecret:'private',deadline:60000,now:()=>1000,fetchImpl:async(u,o)=>{call={u:String(u),o};return{ok:false,status:409,json:async()=>({message:'sensitive provider error'})};}});await assert.rejects(t.rpc('test',{}),e=>e.code==='CONFLICT'&&!e.message.includes('sensitive'));assert.equal(call.o.redirect,'error');assert.equal(call.o.headers.apikey,'secret');await assert.rejects(t.bridge({operation:'read'}));assert.equal(call.u,args.legacyOrigin+'/.netlify/functions/trial-sync');});
const secret='test-only-secret-'.repeat(3),env={NETLIFY:'true',SITE_ID:id(3),ROSELAND_TRIAL_SYNC_NETLIFY_SITE_ID:id(3),ROSELAND_TRIAL_SYNC_LEGACY_ORIGIN:args.legacyOrigin,ROSELAND_TRIAL_SYNC_BRIDGE_ENABLED:'true',ROSELAND_TRIAL_SYNC_BRIDGE_SECRET:secret,ROSELAND_TRIAL_SYNC_KEYS:'["Fictional"]'};
const request=(body,token=secret)=>new Request(args.legacyOrigin+'/.netlify/functions/trial-sync',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(body)});
test('legacy bridge rejects disabled/wrong credentials/site before reading stores',async()=>{for(const patch of [{ROSELAND_TRIAL_SYNC_BRIDGE_ENABLED:'false'},{SITE_ID:id(9)}])assert.equal((await testHandler(()=>{throw Error('Must not access');},{...env,...patch})(request({operation:'read',key:'Fictional'}))).status,404);assert.equal((await testHandler(()=>{throw Error('Must not access');},env)(request({operation:'read',key:'Fictional'},'wrong'))).status,401);});
test('legacy bridge refuses unmapped writes, rename/delete and extra arguments',async()=>{const handler=testHandler(()=>{throw Error('Must not access');},env);for(const body of [{operation:'write',key:'Other',document},{operation:'delete',key:'Fictional'},{operation:'write',key:'Fictional',newName:'Renamed',document}])assert.ok([400,403].includes((await handler(request(body))).status));});
test('legacy bridge preserves exact backup bytes and metadata',async()=>{const handler=testHandler(()=>({getWithMetadata:async()=>({data:Buffer.from(' {"hello": "world"}\n'),etag:'etag',metadata:{custom:true}})}),env);const response=await handler(request({operation:'raw',store:'cms',key:'rp_cms_config'}));assert.equal(response.status,200);const value=await response.json();assert.equal(Buffer.from(value.bytes,'base64').toString(),' {"hello": "world"}\n');assert.deepEqual(value.metadata,{custom:true});assert.equal(value.siteId,id(3));});

test('preview and superseded legacy deployments cannot use the bridge',async()=>{const handler=createHandler(()=>{throw Error('No store access');},env);for(const deploy of [{context:'deploy-preview',published:true},{context:'production',published:false}])assert.equal((await handler(request({operation:'inventory',store:'schedules'}),{site:{id:env.SITE_ID},deploy})).status,404);});

test('hosted read-only acceptance checks checkpoint comparisons without writing either schedule',async()=>{
 for(const side of ['left','right','both']){
  const h=setup();if(side!=='right')h.state.left.meta.town='Legacy edit';if(side!=='left')h.state.right.meta.town='New app edit';
  const before={left:structuredClone(h.state.left),right:structuredClone(h.state.right)};
  const result=await runHosted({...args,...h,inspectOnly:true});
  assert.equal(result.checked,1);assert.equal(result.review,1);
  assert.deepEqual(h.state.left,before.left);assert.deepEqual(h.state.right,before.right);
  assert.equal(h.state.events.includes('write_trial_sync_schedule'),false);
  assert.equal(h.state.entry.pending,null);
  assert.equal(h.state.entry.status,side==='left'?'to-supabase':side==='right'?'to-netlify':'content-conflict');
 }
});

test('actual hosted worker preserves new-app contacts on a legacy write, including lost acknowledgement',async()=>{
 const h=setup();const people=[{id:'crew-1',type:'crew',name:'Example',role:'Camera',phone:'',email:'',callTime:'8:00 AM'}];
 h.state.right.meta.productionContacts=people;h.state.right.meta.callsheet={hospitalPhone:'555-0100',advanceSchedule:'Next day'};
 h.state.left.meta.town='Updated in legacy';h.state.lostAck=true;
 await runHosted({...args,...h});assert.deepEqual(h.state.right.meta.productionContacts,people);assert.equal(h.state.right.meta.callsheet.advanceSchedule,'Next day');
 h.state.lostAck=false;assert.equal((await runHosted({...args,...h})).current,1);assert.deepEqual(h.state.right.meta.productionContacts,people);
 assert.equal(h.state.events.filter(x=>x==='write_trial_sync_schedule').length,1);
});
test('actual hosted worker sends only shared fields to legacy and leaves exclusive contact edits untouched',async()=>{
 const h=setup();h.state.right.meta.productionContacts=[];h.state.right.meta.callsheet={productionOffice:'New office'};
 assert.equal((await runHosted({...args,...h})).current,1);assert.equal(h.state.events.includes('write_trial_sync_schedule'),false);
 h.state.right.meta.town='New app change';let version='legacy-2',writes=0;
 h.bridge=async body=>{if(body.operation==='write'){writes++;assert.equal(body.document.meta.productionContacts,undefined);assert.equal(body.document.meta.callsheet,undefined);h.state.left=structuredClone(body.document);version='legacy-3';}return{version,document:structuredClone(h.state.left),guard:{source:'legacy'}};};
 assert.equal((await runHosted({...args,...h})).current,1);assert.equal(writes,1);assert.equal(h.state.right.meta.callsheet.productionOffice,'New office');
});
test('a concurrent new-app contact edit prevents a stale legacy overwrite',async()=>{
 const h=setup();h.state.left.meta.town='Changed legacy';const rpc=h.rpc;let raced=false;
 h.rpc=async(name,body)=>{if(name==='write_trial_sync_schedule'&&!raced){raced=true;h.state.right.meta.productionContacts=[{id:'new',type:'crew',name:'Latest',role:'Director',phone:'',email:'',callTime:''}];h.state.version++;throw Object.assign(new Error('Version changed'),{code:'CONFLICT'});}return rpc(name,body);};
 await runHosted({...args,...h});assert.equal(h.state.right.meta.productionContacts[0].name,'Latest');assert.equal(h.state.right.meta.town,'Fictional');
});

test('choosing the legacy copy in a conflict preserves new-app-only contact details',async()=>{
 const h=setup();const {runClaim}=require('../../scripts/trial-sync/hosted.cjs'),{hash}=require('../../scripts/trial-sync/core.cjs');
 h.state.left.meta.town='Legacy choice';h.state.right.meta.town='New app choice';h.state.right.meta.productionContacts=[];h.state.right.meta.callsheet={hospitalPhone:'555-0199'};
 await runHosted({...args,...h});assert.equal(h.state.entry.status,'content-conflict');
 const job=await h.rpc('claim_trial_sync_mapping',{});
 const result=await runClaim({...h,job,claim:id(11),organizationId:args.organizationId,now:args.now,resolution:{take:'netlify',reviewHash:hash(h.state.entry.observed)}});
 assert.equal(result.status,'synced');assert.equal(h.state.right.meta.town,'Legacy choice');assert.deepEqual(h.state.right.meta.productionContacts,[]);assert.equal(h.state.right.meta.callsheet.hospitalPhone,'555-0199');
});
