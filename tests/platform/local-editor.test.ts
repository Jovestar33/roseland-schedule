import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLocalEditorConfig } from '../../lib/platform/local-editor-config.ts';
import { createSessionScheduleRepository } from '../../lib/platform/session-schedule-repository.ts';
import { LocalEditorController } from '../../lib/platform/local-editor-controller.ts';
import type { StoredSchedule } from '../../lib/platform/schedule-repository.ts';
import type { ScheduleData } from '../../lib/types.ts';

const anon = `e30.${Buffer.from(JSON.stringify({role:'anon',iss:'supabase'})).toString('base64url')}.fixture`;
const env = { ROSELAND_LOCAL_EDITOR:'supabase', ROSELAND_LOCAL_SUPABASE_URL:'http://127.0.0.1:57321', ROSELAND_LOCAL_SUPABASE_ANON_KEY:anon };
test('local backend requires explicit flag, loopback host and anonymous local key', () => {
  assert.equal(readLocalEditorConfig({}, '127.0.0.1:3287'), null);
  assert.ok(readLocalEditorConfig(env, '127.0.0.1:3287'));
  for (const host of [null, 'example.com', 'localhost.example:3287', '127.0.0.1.evil:3287']) assert.equal(readLocalEditorConfig(env,host),null);
  for (const url of ['https://hosted.supabase.co','http://127.0.0.1:57321/path','http://user@localhost:57321','http://localhost:57321?x=1']) {
    assert.equal(readLocalEditorConfig({...env,ROSELAND_LOCAL_SUPABASE_URL:url},'localhost:3287'),null);
  }
  for (const overrides of [{NETLIFY:'true'},{VERCEL:'1'},{ROSELAND_LOCAL_SUPABASE_ANON_KEY:'sb_secret_bad'},
    {ROSELAND_LOCAL_SUPABASE_ANON_KEY:`e30.${Buffer.from('{"role":"service_role","iss":"supabase"}').toString('base64url')}.fixture`}]) {
    assert.equal(readLocalEditorConfig({...env,...overrides},'localhost:3287'),null);
  }
});
test('list rejects invalid cursors, malformed/duplicate summaries and maps expired sessions', async () => {
  let data: unknown = [];
  let error: {code:string} | null = null;
  const repo = createSessionScheduleRepository({rpc:async()=>({data,error})});
  await assert.rejects(repo.list('bad'),{kind:'invalid'});
  await assert.rejects(repo.list(null,101),{kind:'invalid'});
  data = [{}]; await assert.rejects(repo.list(),{kind:'failed'});
  const row = {id:'aaaaaaaa-0000-4000-8000-000000000001',display_name:'Fixture',status:'draft',document_version:1,updated_at:'2026-09-15T00:00:00Z'};
  data = [row,row]; await assert.rejects(repo.list(),{kind:'failed'});
  data = [row]; assert.deepEqual(await repo.list(),data);
  error = {code:'PGRST303'}; await assert.rejects(repo.list(),{kind:'unauthenticated'});
});
function deferred<T>() { let resolve!: (value:T)=>void; let reject!: (error:Error)=>void; const promise = new Promise<T>((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }
function harness() {
  const response = deferred<StoredSchedule>();
  const document = {meta:{},rows:[],savedAt:1} as unknown as ScheduleData;
  let dirty = true;
  let loads = 0;
  let writes = 0;
  const state = {documentSession:1,editRevision:1,getScheduleData:()=>structuredClone(document),markClean:()=>{dirty=false;}};
  const record = {id:'aaaaaaaa-0000-4000-8000-000000000001',organization_id:'bbbbbbbb-0000-4000-8000-000000000001',production_id:'cccccccc-0000-4000-8000-000000000001',production_day_id:'dddddddd-0000-4000-8000-000000000001',display_name:'Fiction',slug:'fiction',status:'draft',deleted_at:null,archived_from_status:null,updated_at:'2026-09-16T00:00:00Z',updated_by:'eeeeeeee-0000-4000-8000-000000000001',document_version:3,document_schema_version:1,document} as StoredSchedule;
  const controller: LocalEditorController = new LocalEditorController({read:async()=>response.promise,send:async(attempt)=>{writes++; assert.equal(attempt.before.document_version,controller.record!.document_version);return response.promise;},probe:async()=>({state:'retryable',saved:null,currentVersion:3})},
    {getState:()=>state,load:()=>{loads++;state.documentSession++;state.editRevision++;dirty=false;}});
  controller.bind(record.updated_by); controller.record=record;
  return {controller,response,state,record,isDirty:()=>dirty,loads:()=>loads,writes:()=>writes};
}
test('pending save advances version while preserving newer unsaved edits and prevents parallel save', async () => {
  const h = harness(); const pending=h.controller.save();
  h.state.editRevision++;
  assert.equal(await h.controller.save(),false);
  h.response.resolve({...h.record,document_version:4});
  assert.equal(await pending,true); assert.equal(h.controller.record!.document_version,4); assert.equal(h.isDirty(),true); assert.equal(h.writes(),1);
});
test('acknowledged current revision becomes clean; failed/conflicting save retains edits and baseline', async () => {
  const h=harness(); const pending=h.controller.save();h.response.resolve({...h.record,document_version:4});await pending;assert.equal(h.isDirty(),false);
  const failure=harness();const rejected=failure.controller.save();failure.response.reject(new Error('conflict'));
  await assert.rejects(rejected,/conflict/);assert.equal(failure.isDirty(),true);assert.equal(failure.controller.record!.document_version,3);
});
test('late save and load cannot cross a session boundary or overwrite edits made during loading', async () => {
  for (const operation of ['save','open'] as const) {
    const h=harness();const pending=operation==='save'?h.controller.save():h.controller.open(h.record.id);
    h.controller.invalidate();h.response.resolve({...h.record,document_version:4});
    assert.equal(await pending,false);assert.equal(h.controller.record,null);assert.equal(h.loads(),0);assert.equal(h.isDirty(),true);
  }
  const h=harness();const pending=h.controller.open(h.record.id);h.state.editRevision++;h.response.resolve(h.record);
  assert.equal(await pending,false);assert.equal(h.loads(),0);
});

test('Template recovery releases only a freshly verified unchanged baseline and preserves newer edits', async()=>{
 const h=harness();(h.state as typeof h.state & {templateUses:unknown[]}).templateUses=[{id:h.record.id,version:1,policy:'policy'}];
 const pending=h.controller.save();h.response.reject(new Error('lost reply'));await assert.rejects(pending);h.state.editRevision++;
 assert.equal(await h.controller.resumeTemplateEditing(),false);await h.controller.recover();
 assert.equal(await h.controller.resumeTemplateEditing(),true);assert.equal(h.controller.attempt,null);assert.equal(h.isDirty(),true);assert.equal(h.state.editRevision,2);assert.equal(h.controller.record!.document_version,3);
});

test('Template re-review cannot release an uncertain attempt when a later save or account switch wins', async()=>{
 for(const mode of ['changed','switched'] as const){
  const h=harness(),gate=deferred<any>();
  const c=new LocalEditorController({read:async()=>h.record,send:async()=>{throw Error('lost');},probe:async()=>gate.promise},{getState:()=>({...h.state,templateUses:[{id:h.record.id,version:1,policy:'policy'}]}),load:()=>{throw Error('No draft reload');}});
  c.bind(h.record.updated_by);c.record=h.record;await assert.rejects(c.save());c.result={state:'retryable',saved:null,currentVersion:3};
  const pending=c.resumeTemplateEditing();if(mode==='switched')c.invalidate();
  gate.resolve({state:mode==='changed'?'different':'retryable',saved:null,currentVersion:mode==='changed'?4:3});
  assert.equal(await pending,false);if(mode==='changed')assert.ok(c.attempt);else assert.equal(c.record,null);assert.equal(h.isDirty(),true);
 }
});
