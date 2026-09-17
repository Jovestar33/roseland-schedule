import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createWorkspaceRepository } from '../../lib/platform/workspace-repository.ts';
import { WorkspaceIdentity, parseWorkspaceLocation, workspaceHref } from '../../lib/platform/workspace-navigation.ts';
import { readLocalWorkspaceConfig } from '../../lib/platform/local-workspace-config.ts';
const actor='11111111-1111-4111-8111-111111111111',org='22222222-2222-4222-8222-222222222222',prod='33333333-3333-4333-8333-333333333333';
test('workspace gate requires independent opt-in, matching loopback config and server workflows',()=>{
  const key=`e30.${Buffer.from('{"role":"anon","iss":"supabase-demo"}').toString('base64url')}.fixture`;
  const env={ROSELAND_LOCAL_WORKSPACE:'supabase',SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',ROSELAND_LOCAL_SUPABASE_URL:'http://127.0.0.1:62321',ROSELAND_LOCAL_SUPABASE_ANON_KEY:key,SUPABASE_URL:'http://127.0.0.1:62321',SUPABASE_PUBLISHABLE_KEY:key,SUPABASE_SECRET_KEY:'fictional-server-key'};
  assert.deepEqual(readLocalWorkspaceConfig(env,'127.0.0.1:3362'),{supabaseUrl:env.SUPABASE_URL,anonymousKey:key});
  for(const patch of [{ROSELAND_LOCAL_WORKSPACE:undefined},{SUPABASE_PLATFORM_WORKFLOWS_ENABLED:undefined},{SUPABASE_SECRET_KEY:undefined},{SUPABASE_URL:'http://127.0.0.1:9999'},{SUPABASE_PUBLISHABLE_KEY:'different'},{NETLIFY:'true'},{VERCEL:'1'},{ROSELAND_LOCAL_SUPABASE_URL:'https://example.supabase.co'}])assert.equal(readLocalWorkspaceConfig({...env,...patch},'localhost:3362'),null);
  assert.equal(readLocalWorkspaceConfig(env,'untrusted.example'),null);
});
test('navigation serializes only known screens and UUID organization identifiers',()=>{
  for(const screen of ['schedule','invitations','acceptance','lifecycle','provisioning'] as const){const location={screen,organization:org};assert.deepEqual(parseWorkspaceLocation(workspaceHref(location).split('?')[1]),location);}
  assert.deepEqual(parseWorkspaceLocation('?screen=https://other.example&org=//other.example'),{screen:'schedule',organization:null});
  assert.deepEqual(parseWorkspaceLocation('?screen=acceptance&org='+org+'&next=https://other.example'),{screen:'acceptance',organization:org});
});
test('session expiry and same-account reauthentication keep identity; sign-out invalidates outstanding work',()=>{
  const identity=new WorkspaceIdentity();assert.equal(identity.bind(actor),true);const generation=identity.capture();
  assert.equal(identity.bind(null),false);assert.equal(identity.actor,actor);assert.equal(identity.bind(actor),false);assert.ok(identity.current(generation));
  identity.clear();assert.equal(identity.actor,null);assert.equal(identity.current(generation),false);identity.bind(actor);assert.equal(identity.current(generation),false);
});
test('an account switch invalidates a pending directory result',async()=>{
  const identity=new WorkspaceIdentity();identity.bind(actor);const generation=identity.capture();let finish!:(value:string[])=>void;
  const pending=new Promise<string[]>(resolve=>{finish=resolve;}).then(result=>identity.current(generation)?result:[]);
  identity.bind(org);finish(['previous tenant']);assert.deepEqual(await pending,[]);
});
function harness(data:unknown=[]){
  const calls:{name:string;steps:[string,...unknown[]][]}[]=[];
  let currentActor=actor,status=200,error:object|null=null;
  const sdk={auth:{getSession:async()=>({data:{session:{user:{id:currentActor},access_token:'fictional-captured-token'}},error:null})},
    from(name:string){return query(name);},rpc(name:string,args:unknown){return query(name,args);}};
  function query(name:string,args?:unknown){const call={name,steps:[] as [string,...unknown[]][]};calls.push(call);if(args)call.steps.push(['args',args]);
    const q:Record<string,unknown>={then(resolve:(value:unknown)=>unknown,reject:(reason:unknown)=>unknown){return Promise.resolve({data,error,status}).then(resolve,reject);}};
    for(const method of ['select','eq','is','order','limit','gt','setHeader'])q[method]=(...values:unknown[])=>{call.steps.push([method,...values]);return q;};return q;}
  return {repo:createWorkspaceRepository(sdk as unknown as SupabaseClient),calls,setActor(value:string){currentActor=value;},fail(value:number){status=value;error={code:'fixture'};}};
}
test('organization directory pins actor, active membership, undeleted parents and cursor',async()=>{
  const h=harness([{organization_id:org,role:'owner',organizations:{name:'Fictional organization'}}]);
  assert.deepEqual(await h.repo.organizations(actor,prod),{items:[{id:org,name:'Fictional organization',role:'owner'}],more:false});
  for(const step of [['eq','user_id',actor],['eq','status','active'],['is','organizations.deleted_at',null],['gt','organization_id',prod],['setHeader','Authorization','Bearer fictional-captured-token']])assert.ok(h.calls[0].steps.some(value=>JSON.stringify(value)===JSON.stringify(step)));
  await h.repo.scope(actor,org);assert.ok(h.calls[1].steps.some(value=>value[0]==='eq'&&value[1]==='organization_id'&&value[2]===org));
});
test('schedule listing fixes organization and permission check fixes production',async()=>{
  const h=harness();assert.deepEqual(await h.repo.schedules(actor,org,prod),[]);
  for(const step of [['eq','organization_id',org],['is','deleted_at',null],['gt','id',prod],['limit',50],['setHeader','Authorization','Bearer fictional-captured-token']])assert.ok(h.calls[0].steps.some(value=>JSON.stringify(value)===JSON.stringify(step)));
  const p=harness(false);assert.equal(await p.repo.canEdit(actor,prod),false);assert.deepEqual(p.calls[0].steps[0],['args',{action:'edit',target_production_id:prod,target_schedule_id:null}]);
});
test('a mismatched account sends no directory or permission queries',async()=>{
  const h=harness();h.setActor(org);
  for(const operation of [()=>h.repo.organizations(actor),()=>h.repo.scope(actor,org),()=>h.repo.schedules(actor,org),()=>h.repo.canEdit(actor,prod)])await assert.rejects(operation,{kind:'unauthenticated'});
  assert.equal(h.calls.length,0);
});
test('directory distinguishes session expiry from forbidden or malformed responses',async()=>{
  for(const [status,kind] of [[401,'unauthenticated'],[403,'unavailable'],[500,'failed']] as const){const h=harness();h.fail(status);await assert.rejects(()=>h.repo.organizations(actor),{kind});}
  const h=harness([{organization_id:org,role:'superuser',organizations:{name:'Fictional'}}]);await assert.rejects(()=>h.repo.organizations(actor),{kind:'failed'});
});
