import test from 'node:test';
import assert from 'node:assert/strict';
import { ScheduleLifecycleController, historyMatches, acknowledgementMatches, type ScheduleHistory, type LifecycleTransport } from '../../lib/platform/schedule-lifecycle-controller.ts';
import { ScheduleRepositoryError, type StoredSchedule, type ScheduleLifecycle } from '../../lib/platform/schedule-repository.ts';
import { createLifecycleRepository } from '../../lib/platform/schedule-lifecycle-repository.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
const actor='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',prod='33333333-3333-4333-8333-333333333333',day='44444444-4444-4444-8444-444444444444',id='55555555-5555-4555-8555-555555555555';
const record={id,organization_id:org,production_id:prod,production_day_id:day,display_name:'Fictional day',slug:'fictional-day',status:'draft',archived_from_status:null,deleted_at:null,document_schema_version:1,document_version:3,document:{meta:{town:'Fictional'},rows:[]},updated_at:'2026-09-15T08:00:00Z',updated_by:actor} as unknown as StoredSchedule;
const saved={...record,document_version:4,status:'archived',archived_from_status:'draft'} as StoredSchedule;
function history(value:StoredSchedule):ScheduleHistory{return {schedule_id:value.id,organization_id:value.organization_id,production_id:value.production_id,version:value.document_version,document_schema_version:1,document:value.document,metadata:{display_name:value.display_name,slug:value.slug,production_day_id:value.production_day_id,status:value.status,archived_from_status:value.archived_from_status,deleted_at:value.deleted_at},created_by:value.updated_by,created_at:value.updated_at,checksum:'a'.repeat(64),metadata_checksum:'b'.repeat(64)};}
function controller(){const c=new ScheduleLifecycleController();c.bind(actor);c.prepare(record,'archive');return c;}
const repository:LifecycleTransport={send:async()=>saved,probe:async()=>({state:'retryable',current:record,matchedVersion:null})};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
test('creation retains a deeply immutable ID, destination and empty document',()=>{
  const c=new ScheduleLifecycleController();c.bind(actor);c.prepareCreate(org,id,day,'Fictional day','fictional-day');const attempt=c.attempt!;
  assert.ok(Object.isFrozen(attempt)&&Object.isFrozen(attempt.document.meta));assert.equal(attempt.expectedVersion,0);assert.deepEqual(attempt.document,{meta:{},rows:[]});assert.throws(()=>c.prepareCreate(org,prod,day,'Other','other'));
  c.bind(actor);assert.equal(c.attempt,attempt);assert.throws(()=>{attempt.document.rows!.push({} as never);});
});
test('lifecycle review snapshots the saved version and payload independently of future edits',()=>{
  const before=structuredClone(record),payload={display_name:'Renamed fiction',slug:'renamed-fiction'},c=new ScheduleLifecycleController();c.bind(actor);c.prepare(before,'rename',payload);payload.slug='changed';before.document_version=99;before.document.meta!.town='New editor data';
  assert.equal(c.attempt?.expectedVersion,3);assert.equal(c.attempt?.payload.slug,'renamed-fiction');assert.equal(c.attempt?.document.meta?.town,'Fictional');assert.ok(Object.isFrozen(c.attempt?.before?.document));
});
test('invalid transitions, extra payload and unrelated history cannot be reviewed',()=>{
  for(const [kind,payload,before,source] of [['unarchive',{},record,undefined],['archive',{extra:true},record,undefined],['restore',{},record,undefined],['rename',{display_name:' Name ',slug:'bad_slug'},record,undefined],['restore_version',{version:1},record,{...history(record),schedule_id:org,version:1}]] as const){const c=new ScheduleLifecycleController();c.bind(actor);assert.throws(()=>c.prepare(before,kind,payload,source as ScheduleHistory|undefined));}
});
test('duplicate confirmation sends once; successful requests never resend',async()=>{
  const c=controller(),d=deferred<StoredSchedule>();let sends=0;const r={...repository,send:async()=>{sends++;return d.promise;}};
  const pending=c.execute(r);await c.execute(r);d.resolve(saved);await pending;await c.execute(r);assert.equal(sends,1);assert.equal(c.phase,'success');
});
for(const kind of ['invalid','unauthenticated','unavailable','failed'] as const)test(`${kind} preserves the original review and expected version`,async()=>{
  const c=controller(),attempt=c.attempt;await c.execute({...repository,send:async()=>{throw new ScheduleRepositoryError(kind);}});assert.equal(c.attempt,attempt);assert.equal(c.failure,kind);c.bind(actor);await c.execute(repository);assert.equal(c.phase,'success');assert.equal(c.attempt,attempt);
});
test('lost response reconciles an immutable stored version without resending, even after later edits',async()=>{
  const c=controller();await c.execute({...repository,send:async()=>{throw new ScheduleRepositoryError('failed');}});
  await c.execute({send:async()=>assert.fail('Must not resend a matching committed result'),probe:async()=>({state:'matched',current:{...saved,document_version:7},matchedVersion:4})});assert.equal(c.phase,'success');assert.equal(c.result?.matchedVersion,4);assert.equal(c.result?.current?.document_version,7);
});
test('a different saved version conflicts and never adopts a newer expected version',async()=>{
  const c=controller();await c.execute({...repository,send:async()=>{throw new ScheduleRepositoryError('failed');}});
  let sends=0;const r={send:async()=>{sends++;return saved;},probe:async()=>({state:'different' as const,current:{...record,document_version:8},matchedVersion:null})};await c.execute(r);await c.execute(r);assert.equal(sends,0);assert.equal(c.phase,'conflict');assert.equal(c.attempt?.expectedVersion,3);
});
test('absence never proves failure; create retry retains UUID and mutation stays blocked when invisible',async()=>{
  const probe=async()=>({state:'unavailable' as const,current:null,matchedVersion:null}),c=new ScheduleLifecycleController();c.bind(actor);c.prepareCreate(org,id,day,'Fictional day','fictional-day');const attempt=c.attempt;await c.execute({probe,send:async()=>{throw new ScheduleRepositoryError('failed');}});let seen='';await c.execute({probe,send:async value=>{seen=value.id;return {...record,document_version:1};}});assert.equal(seen,id);assert.equal(c.attempt,attempt);
  const mutation=controller();await mutation.execute({...repository,send:async()=>{throw new ScheduleRepositoryError('failed');}});await mutation.execute({probe,send:async()=>assert.fail('Invisible mutation is not retried')});assert.equal(mutation.phase,'blocked');assert.equal(mutation.failure,'unavailable');
});
test('late writes and reconciliation cannot cross an account boundary',async()=>{
  for(const checkOnly of [false,true]){const c=controller(),d=deferred<unknown>();const pending=c.execute({send:()=>d.promise as Promise<StoredSchedule>,probe:()=>d.promise as ReturnType<LifecycleTransport['probe']>},checkOnly);c.bind(org);d.resolve(checkOnly?{state:'matched',current:saved,matchedVersion:4}:saved);await pending;assert.equal(c.attempt,null);assert.equal(c.result,null);assert.equal(c.busy,false);}
});
test('account change during retry reconciliation cannot start a mutation',async()=>{
  const c=controller();await c.execute({...repository,send:async()=>{throw new ScheduleRepositoryError('failed');}});const d=deferred<Awaited<ReturnType<LifecycleTransport['probe']>>>();const pending=c.execute({send:async()=>assert.fail('Changed actor must not send'),probe:()=>d.promise});c.bind(org);d.resolve({state:'retryable',current:record,matchedVersion:null});await pending;assert.equal(c.result,null);
});
test('history matching binds actor, document, metadata, identity and exact next version',()=>{
  const attempt=controller().attempt!,h=history(saved);assert.ok(historyMatches(attempt,h));assert.ok(acknowledgementMatches(attempt,saved));
  for(const value of [{...h,created_by:org},{...h,version:5},{...h,metadata:null},{...h,production_id:org},{...h,metadata:{...h.metadata,slug:'different'}}]){
    assert.equal(historyMatches(attempt,value),false);
  }
  assert.equal(historyMatches(attempt,{...h,document:{...h.document,rows:[{notes:'Different'}] as never}}),false);
});
for(const kind of ['rename','unarchive','delete','restore','restore_version'] as ScheduleLifecycle[])test(`stored ${kind} result preserves its documented metadata boundary`,()=>{
  const before={...record,...(kind==='restore'?{deleted_at:'2026-09-15T07:00:00Z'}:{}),...(kind==='unarchive'?{status:'archived' as const,archived_from_status:'draft' as const}:{})};const source={...history(record),version:1,document:{...record.document,rows:[{notes:'Older document'}] as never}};
  const c=new ScheduleLifecycleController();c.bind(actor);c.prepare(before,kind,kind==='rename'?{display_name:'Renamed',slug:'renamed'}:kind==='restore_version'?{version:1}:{},source);
  const after={...before,document_version:4,...(kind==='rename'?{display_name:'Renamed',slug:'renamed'}:{}),...(kind==='unarchive'?{status:'draft' as const,archived_from_status:null}:{}),...(kind==='delete'?{deleted_at:'2026-09-15T08:01:00Z'}:{}),...(kind==='restore'?{deleted_at:null}:{}),...(kind==='restore_version'?{document:source.document}:{})};assert.ok(acknowledgementMatches(c.attempt!,after));
});
function sdkHarness(){let currentActor=actor;const calls:{name:string;args:unknown;steps:[string,...unknown[]][]}[]=[];let handler:(name:string,args:unknown)=>unknown=(name)=>name==='read_schedule'?record:[];
  function query(name:string,args?:unknown){const call={name,args,steps:[] as [string,...unknown[]][]};calls.push(call);const q:Record<string,unknown>={then(resolve:(x:unknown)=>unknown,reject:(x:unknown)=>unknown){return Promise.resolve({data:call.steps.some(s=>s[0]==='maybeSingle')?null:handler(name,args),error:null,status:200}).then(resolve,reject);}};for(const method of ['select','eq','is','not','neq','order','limit','gt','lt','maybeSingle','setHeader'])q[method]=(...values:unknown[])=>{call.steps.push([method,...values]);return q;};return q;}
  const sdk={auth:{getSession:async()=>({data:{session:{user:{id:currentActor},access_token:'fictional-captured-token'}},error:null})},rpc:query,from:query} as unknown as SupabaseClient;
  return {repo:createLifecycleRepository(sdk),calls,actor(value:string){currentActor=value;},respond(value:typeof handler){handler=value;}};
}
test('lifecycle discovery fixes tenant, collection and cursor; history fixes tenant, ID and version',async()=>{
  const h=sdkHarness();await h.repo.list(actor,org,'deleted',id);await h.repo.history(actor,org,id,3);await h.repo.historical(actor,org,id,1);
  for(const call of h.calls){assert.ok(call.steps.some(s=>s[0]==='eq'&&s[1]==='organization_id'&&s[2]===org));assert.ok(call.steps.some(s=>s[0]==='setHeader'&&s[2]==='Bearer fictional-captured-token'));}
  assert.ok(h.calls[0].steps.some(s=>s[0]==='not'&&s[1]==='deleted_at'));assert.ok(h.calls[1].steps.some(s=>s[0]==='lt'&&s[1]==='version'&&s[2]===3));
});
test('another current account cannot dispatch an old actor lifecycle request',async()=>{
  const h=sdkHarness();h.actor(org);await assert.rejects(()=>h.repo.send(controller().attempt!),{kind:'unauthenticated'});await assert.rejects(()=>h.repo.list(actor,org,'active'),{kind:'unauthenticated'});assert.equal(h.calls.length,0);
});
test('mutation pins the reviewed version/token and rejects a mismatched acknowledgement',async()=>{
  const h=sdkHarness();h.respond(name=>name==='read_schedule'?record:saved);assert.equal((await h.repo.send(controller().attempt!)).document_version,4);const sent=h.calls.find(call=>call.name==='mutate_schedule')!;assert.deepEqual(sent.args,{target_schedule_id:id,expected_version:3,operation:'archive',payload:{}});assert.ok(sent.steps.some(s=>s[0]==='setHeader'&&s[2]==='Bearer fictional-captured-token'));
  h.respond(name=>name==='read_schedule'?record:({...saved,slug:'wrong'}));await assert.rejects(()=>h.repo.send(controller().attempt!),{kind:'failed'});
});

test('a mismatched tenant or stale preflight never dispatches a lifecycle mutation',async()=>{
  for(const value of [{...record,organization_id:prod},{...record,document_version:5}]){const h=sdkHarness();h.respond(()=>value);await assert.rejects(()=>h.repo.send(controller().attempt!),{kind:value.organization_id!==org?'unavailable':'conflict'});assert.equal(h.calls.some(call=>call.name==='mutate_schedule'),false);}
});
