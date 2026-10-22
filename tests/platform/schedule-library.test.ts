import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {createScheduleLibraryRepository,filterLibrary,libraryGroup,reorderLibraryItems,type LibraryRecord} from '../../lib/platform/schedule-library.ts';
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

test('phase hub moves bind the production and both phase versions',async()=>{
 const target={id:id(80),name:'Prep',position:1,version:3},adjacent={id:id(81),name:'Shoot',position:2,version:8};
 const production={id:prod,name:'Production',create:true,organize:true,phases:[target,adjacent],days:[]};let calls=0;
 const sdk={auth:{getSession:async()=>({data:{session:{user:{id:actor},access_token:'fictional'}}})},rpc:(name:string,args:unknown)=>{calls++;assert.equal(name,'move_library_phase');assert.deepEqual(args,{target_production_id:prod,target_phase_id:target.id,adjacent_phase_id:adjacent.id,expected_target_version:3,expected_adjacent_version:8});return {setHeader:()=>Promise.resolve({data:[],error:null})};}} as unknown as SupabaseClient;
 const repo=createScheduleLibraryRepository(sdk);await repo.movePhases(actor,production,target,adjacent);await assert.rejects(()=>repo.movePhases(actor,production,target,{...adjacent,version:undefined}));assert.equal(calls,1);
});

test('phase ordering combines dayless and day-assigned siblings but refuses other phases',async()=>{
 const phase=id(70),first={...row(1),phase_id:phase,effective_phase_id:phase},second={...row(2),production_day_id:id(71),effective_phase_id:phase};
 assert.equal(libraryGroup(first),libraryGroup(second));assert.notEqual(libraryGroup(first),libraryGroup(row(3)));
 let calls=0;const sdk={auth:{getSession:async()=>({data:{session:{user:{id:actor},access_token:'fictional'}}})},rpc:(name:string,args:unknown)=>{calls++;assert.equal(name,'order_schedule_phase_group');assert.deepEqual(args,{target_production_id:prod,target_phase_id:phase,ordered_ids:[second.id,first.id],expected_versions:[1,1]});return {setHeader:()=>Promise.resolve({data:[],error:null})};}} as unknown as SupabaseClient;
 const repo=createScheduleLibraryRepository(sdk);await repo.order(actor,[second,first]);await assert.rejects(()=>repo.order(actor,[first,row(3)]));assert.equal(calls,1);
});


test('drag and arrow ordering preserve identities and versions without mutating the current view',()=>{
 const items=[1,2,3].map(n=>({...row(n),can_organize:true}));
 const reordered=reorderLibraryItems(items,id(1),0,2)!;
 assert.deepEqual(reordered.map(r=>r.id),[id(2),id(3),id(1)]);
 assert.deepEqual(items.map(r=>r.id),[id(1),id(2),id(3)]);
 assert.equal(reordered[2],items[0]);
 assert.deepEqual(reorderLibraryItems(reordered,id(1),2,0),items);
});
test('no-op, stale, out-of-range and incomplete authority drags cannot prepare an order write',()=>{
 const items=[1,2,3].map(n=>({...row(n),can_organize:true}));
 for(const [idValue,from,to] of [[id(1),0,0],[id(2),0,1],[id(1),0,-1],[id(1),0,3],[id(1),0,1.5]] as [string,number,number][])assert.equal(reorderLibraryItems(items,idValue,from,to),null);
 for(const changed of [{can_organize:false},{deleted_at:'2026-10-22'},{status:'archived' as const},{phase_id:id(8)}])assert.equal(reorderLibraryItems([items[0],{...items[1],...changed}],id(1),0,1),null);
 assert.equal(reorderLibraryItems([items[0],items[0]],id(1),0,1),null);
});
test('both date directions leave undated schedules last and preserve collection boundaries',()=>{
 const rows=[{...row(1),schedule_date:'2026-10-01'},{...row(2),schedule_date:'2026-11-01'},row(3),{...row(4),status:'archived' as const},{...row(5),deleted_at:'2026-10-22'}];
 assert.deepEqual(filterLibrary(rows,'','active','','','','date').map(r=>r.id),[id(1),id(2),id(3)]);
 assert.deepEqual(filterLibrary(rows,'','active','','','','date-desc').map(r=>r.id),[id(2),id(1),id(3)]);
 assert.deepEqual(filterLibrary(rows,'','archived','','','','manual').map(r=>r.id),[id(4)]);
 assert.deepEqual(filterLibrary(rows,'','trash','','','','manual').map(r=>r.id),[id(5)]);
});
