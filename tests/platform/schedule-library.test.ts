import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {createScheduleLibraryRepository,filterLibrary,libraryGroup,type LibraryRecord} from '../../lib/platform/schedule-library.ts';
import {ScheduleLifecycleController,acknowledgementMatches} from '../../lib/platform/schedule-lifecycle-controller.ts';
import type {StoredSchedule} from '../../lib/platform/schedule-repository.ts';
const actor='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',prod='33333333-3333-4333-8333-333333333333';
const id=(n:number)=>`44444444-4444-4444-8444-${String(n).padStart(12,'0')}`;
const row=(n:number)=>({id:id(n),organization_id:org,production_id:prod,production_day_id:null,phase_id:null,effective_phase_id:null,display_name:'Fixture '+n,production_name:'Production',status:'draft',document_version:1,library_position:n,updated_at:'2026-09-17',deleted_at:null,schedule_date:null} as LibraryRecord);
function harness(pages:LibraryRecord[][]){let calls=0;const sdk={auth:{getSession:async()=>({data:{session:{user:{id:actor},access_token:'fictional'}}})},rpc:(_name:string,args:{after_id:string|null})=>{const page=pages[calls++];assert.equal(args.after_id,calls===1?null:pages[calls-2].at(-1)!.id);return {setHeader:()=>Promise.resolve({data:page,error:null})};}} as unknown as SupabaseClient;return {repo:createScheduleLibraryRepository(sdk),calls:()=>calls};}
test('library search includes a matching record beyond two complete pages',async()=>{const rows=Array.from({length:201},(_,i)=>row(i));rows[200].display_name='Last page needle';const h=harness([rows.slice(0,100),rows.slice(100,200),rows.slice(200)]);const all=await h.repo.inventory(actor,org);assert.equal(h.calls(),3);assert.deepEqual(filterLibrary(all,'needle','active','','','','name').map(r=>r.id),[id(200)]);});
test('library pagination refuses repeated IDs and another tenant instead of returning partial results',async()=>{for(const bad of [{...row(99)},{...row(100),organization_id:prod}]){const h=harness([Array.from({length:100},(_,i)=>row(i)),[bad]]);await assert.rejects(()=>h.repo.inventory(actor,org));}});
test('Unassigned creation acknowledgement binds production and optional phase',()=>{const c=new ScheduleLifecycleController();c.bind(actor);assert.throws(()=>c.prepareCreate(org,id(1),null,'New','new'));c.prepareCreate(org,id(1),null,'New','new',undefined,{productionId:prod,phaseId:id(2)});const saved={id:id(1),organization_id:org,production_id:prod,production_day_id:null,phase_id:id(2),display_name:'New',slug:'new',document:c.attempt!.document,document_version:1,document_schema_version:1,updated_by:actor,status:'draft',deleted_at:null,archived_from_status:null} as StoredSchedule;assert.ok(acknowledgementMatches(c.attempt!,saved));for(const wrong of [{...saved,production_id:org},{...saved,phase_id:null},{...saved,production_day_id:id(3)}])assert.equal(acknowledgementMatches(c.attempt!,wrong),false);});
test('hub moves bind both saved versions and refuse unversioned or unauthorized destinations',async()=>{
 let calls=0;const target={id:prod,name:'Alpha',create:true,organize:true,version:3,position:1,phases:[],days:[]},adjacent={...target,id:id(8),name:'Beta',version:7,position:2};
 const sdk={auth:{getSession:async()=>({data:{session:{user:{id:actor},access_token:'fictional'}}})},rpc:(name:string,args:unknown)=>{calls++;assert.equal(name,'move_production_hub');assert.deepEqual(args,{target_production_id:prod,adjacent_production_id:id(8),expected_target_version:3,expected_adjacent_version:7});return {setHeader:()=>Promise.resolve({data:[],error:null})};}} as unknown as SupabaseClient;
 const repo=createScheduleLibraryRepository(sdk);await repo.moveHubs(actor,target,adjacent);assert.equal(calls,1);
 for(const invalid of [{...adjacent,version:undefined},{...adjacent,organize:false},target])await assert.rejects(()=>repo.moveHubs(actor,target,invalid));assert.equal(calls,1);
});

test('phase ordering combines dayless and day-assigned siblings but refuses other phases',async()=>{
 const phase=id(70),first={...row(1),phase_id:phase,effective_phase_id:phase},second={...row(2),production_day_id:id(71),effective_phase_id:phase};
 assert.equal(libraryGroup(first),libraryGroup(second));assert.notEqual(libraryGroup(first),libraryGroup(row(3)));
 let calls=0;const sdk={auth:{getSession:async()=>({data:{session:{user:{id:actor},access_token:'fictional'}}})},rpc:(name:string,args:unknown)=>{calls++;assert.equal(name,'order_schedule_phase_group');assert.deepEqual(args,{target_production_id:prod,target_phase_id:phase,ordered_ids:[second.id,first.id],expected_versions:[1,1]});return {setHeader:()=>Promise.resolve({data:[],error:null})};}} as unknown as SupabaseClient;
 const repo=createScheduleLibraryRepository(sdk);await repo.order(actor,[second,first]);await assert.rejects(()=>repo.order(actor,[first,row(3)]));assert.equal(calls,1);
});
