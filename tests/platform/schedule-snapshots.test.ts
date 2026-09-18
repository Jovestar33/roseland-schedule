import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {captureSnapshotAttempt,retainSnapshotRequest,readSnapshotRequest,clearSnapshotRequest,createSnapshotRepository,snapshotRestoreMatches,SnapshotTimer,SNAPSHOT_INTERVAL_MS,type SnapshotAttempt} from '../../lib/platform/schedule-snapshots.ts';
import {documentFixture} from '../fixtures/document-fixtures.ts';
const actor='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',schedule='33333333-3333-4333-8333-333333333333',id='44444444-4444-4444-8444-444444444444',request='55555555-5555-4555-8555-555555555555';
function attempt():SnapshotAttempt{return {actor,organization:org,schedule,id,request,version:0,operation:'capture',name:'Fictional take',document:documentFixture(2),sourceVersion:4,automatic:false,templateUses:[],confirmedPurge:false};}
function storage(){const values=new Map<string,string>();return{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);},removeItem:(k:string)=>{values.delete(k);}};}
test('snapshot capture freezes the complete draft without cleaning or truncating it',()=>{
 const input=attempt(),captured=captureSnapshotAttempt(input),before=structuredClone(captured.document);
 input.document!.rows![0].notes='Later edit';input.name='Later name';
 assert.deepEqual(captured.document,before);assert.equal(captured.name,'Fictional take');assert.equal(captured.sourceVersion,4);assert.ok(Object.isFrozen(captured.document!.rows![0]));
});
test('snapshot request recovery is actor, organization, schedule and exact-request bound',()=>{
 const st=storage(),a=attempt();retainSnapshotRequest(st,{attempt:a,started:true});
 assert.deepEqual(readSnapshotRequest(st,actor,org,schedule)?.attempt,captureSnapshotAttempt(a));
 assert.equal(readSnapshotRequest(st,org,org,schedule),null);assert.equal(readSnapshotRequest(st,actor,org,id),null);
 clearSnapshotRequest(st,a);assert.equal(readSnapshotRequest(st,actor,org,schedule),null);
 assert.throws(()=>retainSnapshotRequest({getItem:()=>null,setItem:()=>{},removeItem:()=>{}},{attempt:a,started:true}),/No new request was sent/);
});
test('automatic capture observes the five-minute dirty interval and cannot cross document or account identity',()=>{
 const timer=new SnapshotTimer(),a=actor+':'+schedule+':1',b=org+':'+schedule+':1';timer.bind(a,0);
 assert.equal(timer.due(a,SNAPSHOT_INTERVAL_MS-1,true,true),false);
 assert.equal(timer.due(a,SNAPSHOT_INTERVAL_MS,false,true),false);
 assert.equal(timer.due(a,SNAPSHOT_INTERVAL_MS,true,false),false);
 assert.equal(timer.due(a,SNAPSHOT_INTERVAL_MS,true,true),true);
 timer.bind(b,SNAPSHOT_INTERVAL_MS);timer.captured(a,SNAPSHOT_INTERVAL_MS*4);
 assert.equal(timer.due(a,SNAPSHOT_INTERVAL_MS*5,true,true),false);
 assert.equal(timer.due(b,SNAPSHOT_INTERVAL_MS*2,true,true),true);
 timer.captured(b,SNAPSHOT_INTERVAL_MS*2);assert.equal(timer.due(b,SNAPSHOT_INTERVAL_MS*2+1,true,true),false);
 timer.bind(null,SNAPSHOT_INTERVAL_MS*3);assert.equal(timer.due(b,SNAPSHOT_INTERVAL_MS*5,true,true),false);
});
test('permanent snapshot deletion requires a reviewed explicit confirmation',()=>{
 assert.throws(()=>captureSnapshotAttempt({...attempt(),version:3,operation:'purge',document:null,confirmedPurge:false}),/confirm permanent deletion/);
 assert.equal(captureSnapshotAttempt({...attempt(),version:3,operation:'purge',document:null,confirmedPurge:true}).confirmedPurge,true);
});
function harness(reply:(name:string,args:Record<string,unknown>)=>unknown){let signed=actor;const calls:string[]=[];const client={auth:{getSession:async()=>({data:{session:{user:{id:signed},access_token:'fictional'}},error:null})},rpc:(name:string,args:Record<string,unknown>)=>{calls.push(name);return{setHeader:()=>Promise.resolve({data:reply(name,args),error:null})};}} as unknown as SupabaseClient;return{repo:createSnapshotRepository(client),calls,sign:(s:string)=>{signed=s;}};}
const row=(n:number)=>({id:`00000000-0000-4000-8000-${n.toString().padStart(12,'0')}`,organization_id:org,schedule_id:schedule,name:'Imported '+n,kind:'imported',version:1,captured_at:'2026-09-17T12:00:00Z',deleted_at:null,row_count:1,can_name:true,can_trash:false,can_purge:false});
test('snapshot inventory preserves complete collections across pages above the old 25-item cap',async()=>{
 const all=Array.from({length:137},(_,i)=>row(i+1));
 const h=harness((name,args)=>{assert.equal(name,'list_schedule_snapshots');return all.filter(r=>!args.after_id||r.id>String(args.after_id)).slice(0,100);});
 const result=await h.repo.list(actor,org,schedule);assert.equal(result.length,137);assert.deepEqual(result,all);assert.equal(h.calls.length,2);
});
test('snapshot transport rejects another account and mismatched schedule responses',async()=>{
 const h=harness(()=>({...row(1),id,document:documentFixture(1)}));h.sign(org);
 await assert.rejects(h.repo.send(attempt()),{kind:'unauthenticated'});assert.equal(h.calls.length,0);
 h.sign(actor);await assert.rejects(h.repo.read(actor,org,id,id),{kind:'invalid'});
});
test('an interrupted capture retains its identity across reload and confirms without another write',async()=>{
 const a=attempt(),st=storage();let writes=0;const receipt={confirmed:true,request_id:a.request,id:a.id,operation:a.operation,version:1};
 const client={auth:{getSession:async()=>({data:{session:{user:{id:actor},access_token:'fictional'}},error:null})},rpc:(name:string)=>({setHeader:async()=>{if(name==='mutate_schedule_snapshot'){writes++;throw Error('Fictional acknowledgement lost');}return{data:receipt,error:null};}})} as unknown as SupabaseClient;
 retainSnapshotRequest(st,{attempt:a,started:true});await assert.rejects(createSnapshotRepository(client).send(a),/acknowledgement lost/);
 const recovered=readSnapshotRequest(st,actor,org,schedule)!;assert.equal(recovered.attempt.request,a.request);assert.deepEqual(await createSnapshotRepository(client).probe(recovered.attempt),receipt);assert.equal(writes,1);clearSnapshotRequest(st,recovered.attempt);assert.equal(readSnapshotRequest(st,actor,org,schedule),null);
});

test('a late snapshot restore never replaces a newer draft or another account/document',()=>{const reviewed={actor,organization:org,id:schedule,sourceVersion:4,documentSession:8,editRevision:12,navigation:1};assert.equal(snapshotRestoreMatches(reviewed,{...reviewed}),true);for(const changed of [{editRevision:13},{documentSession:9},{actor:org},{sourceVersion:5},{navigation:2}])assert.equal(snapshotRestoreMatches(reviewed,{...reviewed,...changed}),false);});
