import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createScheduleFileRepository} from '../../lib/platform/schedule-file-repository.ts';
import type {SupabaseClient} from '@supabase/supabase-js';
const actor=randomUUID(),organization=randomUUID(),production=randomUUID(),day=randomUUID();
function client(create=true){
 let reads=0;
 const api={auth:{getSession:async()=>({data:{session:{user:{id:actor},access_token:'fictional'}}})},
  rpc:()=>({setHeader:async()=>({data:{productions:[{id:production,name:'Fictional',create,organize:create,phases:[],days:[{id:day,phase:null,date:null,number:1,position:0}]}]},error:null})}),
  from:()=>{reads++;const q:any={select:()=>q,order:()=>q,limit:()=>q,setHeader:()=>q,eq:()=>q,is:()=>q,then:(resolve:any)=>resolve({data:[],error:null})};return q;}};
 return {repo:createScheduleFileRepository(api as unknown as SupabaseClient),reads:()=>reads};
}
test('file import supports an authorized production without creating a day',async()=>{
 const c=client();await c.repo.preflight(actor,organization,null,[],{productionId:production,phaseId:null});assert.equal(c.reads(),1);
});
test('file import rejects revoked production permission and foreign day or phase before reading inventory',async()=>{
 for(const [create,placementDay,phase] of [[false,null,null],[true,randomUUID(),null],[true,null,randomUUID()]] as const){
  const c=client(create);await assert.rejects(c.repo.preflight(actor,organization,placementDay,[],{productionId:production,phaseId:phase}));assert.equal(c.reads(),0);
 }
});
