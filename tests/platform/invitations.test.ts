import test from 'node:test';
import assert from 'node:assert/strict';
import { InvitationController, InvitationError, type InvitationAttempt } from '../../lib/platform/invitation-controller.ts';
import { sendInvitationAttempt } from '../../lib/platform/invitation-repository.ts';
import { readLocalAdminConfig } from '../../lib/platform/local-admin-config.ts';
import type { Session } from '@supabase/supabase-js';

const actor='11111111-1111-4111-8111-111111111111', organization='22222222-2222-4222-8222-222222222222', resource='33333333-3333-4333-8333-333333333333';
const body={organizationId:organization,email:' Fiction@Example.Test ',expiresInDays:7};
function harness(){let keys=0;const controller=new InvitationController(()=>`fixture-key-${++keys}`);controller.bind(actor);controller.prepare('create',organization,body);return controller;}
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:Error)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}

test('local admin needs its own flag, matching local server configuration and loopback host',()=>{
  const anon=`e30.${Buffer.from('{"role":"anon","iss":"supabase-demo"}').toString('base64url')}.fixture`;
  const env={ROSELAND_LOCAL_ADMIN:'supabase',ROSELAND_LOCAL_SUPABASE_URL:'http://127.0.0.1:59321',ROSELAND_LOCAL_SUPABASE_ANON_KEY:anon,
    SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',SUPABASE_URL:'http://127.0.0.1:59321',SUPABASE_PUBLISHABLE_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:'fictional-local-service'};
  assert.ok(readLocalAdminConfig(env,'127.0.0.1:3345'));
  for(const patch of [{ROSELAND_LOCAL_ADMIN:undefined},{NETLIFY:'true'},{VERCEL:'1'},{SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'false'},
    {SUPABASE_URL:'https://example.supabase.co'},{SUPABASE_PUBLISHABLE_KEY:'different'},{SUPABASE_SERVICE_ROLE_KEY:undefined}])assert.equal(readLocalAdminConfig({...env,...patch},'127.0.0.1:3345'),null);
  for(const host of [null,'example.com','localhost.evil:3345'])assert.equal(readLocalAdminConfig(env,host),null);
});
test('review snapshots normalize and freeze business input before any transport',()=>{
  const controller=harness();assert.equal(controller.phase,'review');assert.equal(controller.attempt!.body.email,'fiction@example.test');
  assert.ok(Object.isFrozen(controller.attempt));assert.ok(Object.isFrozen(controller.attempt!.body));
  assert.throws(()=>{(controller.attempt!.body as Record<string,unknown>).email='changed@example.test';});
  assert.throws(()=>controller.prepare('create',organization,body));
});
test('double submit produces one in-flight request and one acknowledged result',async()=>{
  const controller=harness(),d=deferred<string>();let calls=0;
  const one=controller.submit(async()=>{calls++;return d.promise;});
  await controller.submit(async()=>{calls++;return resource;});assert.equal(calls,1);assert.equal(controller.phase,'pending');
  d.resolve(resource);await one;assert.equal(controller.phase,'success');
  await controller.submit(async()=>{calls++;return resource;});assert.equal(calls,1);
});
for(const failure of ['unknown','auth','mfa','rate','denied'] as const)test(`${failure} retains the exact key/body through same-account retry`,async()=>{
  const controller=harness();const original=controller.attempt;
  await controller.submit(async()=>{throw new InvitationError(failure);});controller.bind(actor);
  assert.equal(controller.attempt,original);assert.equal(controller.failure,failure);
  await controller.submit(async attempt=>{assert.equal(attempt,original);return resource;});assert.equal(controller.phase,'success');
});
test('changed-input conflict remains blocked even when a prior result is found',async()=>{
  const controller=harness();const original=controller.attempt;
  await controller.submit(async()=>{throw new InvitationError('conflict');});
  await controller.check(async()=>({id:resource,matches:true,description:'Prior result'}));
  assert.equal(controller.phase,'conflict');assert.equal(controller.attempt,original);
  await controller.submit(async()=>assert.fail('A conflict must not be blindly retried'));
});
test('uncertain transport can resolve only a matching completed result',async()=>{
  const controller=harness();await controller.submit(async()=>{throw new InvitationError('unknown');});
  await controller.check(async()=>null);assert.equal(controller.phase,'unknown');
  await controller.check(async()=>({id:resource,matches:false,description:'Mismatch'}));assert.equal(controller.phase,'unknown');
  await controller.check(async()=>({id:resource,matches:true,description:'Created'}));assert.equal(controller.phase,'success');
});
test('late request and result-check responses cannot cross an account boundary',async()=>{
  for(const operation of ['submit','check']){
    const controller=harness();const d=deferred<unknown>();
    const pending=operation==='submit'?controller.submit(()=>d.promise as Promise<string>):controller.check(()=>d.promise as Promise<null>);
    controller.bind(resource);d.resolve(operation==='submit'?resource:null);await pending;
    assert.equal(controller.attempt,null);assert.equal(controller.result,null);assert.equal(controller.actor,resource);assert.equal(controller.busy,false);
  }
});
test('revocation cannot acknowledge a different invitation ID',async()=>{
  const controller=new InvitationController(()=> 'revoke-key');controller.bind(actor);controller.prepare('revoke',organization,{reason:'Reviewed'},resource);
  await controller.submit(async()=>organization);assert.equal(controller.phase,'unknown');assert.equal(controller.result,null);
});
test('transport sends immutable key/body with current matching actor and bounded failures',async()=>{
  const attempt=harness().attempt!;const session={user:{id:actor},access_token:'fictional-session'} as Session;
  const calls:{url:unknown;init?:RequestInit}[]=[];
  const request=(async(url,init)=>{calls.push({url,init});return Response.json({invitationId:resource},{status:201});}) as typeof fetch;
  assert.equal(await sendInvitationAttempt(attempt,session,request),resource);
  assert.equal(calls[0].url,'/api/platform/invitations');assert.equal((calls[0].init?.headers as Record<string,string>)['idempotency-key'],attempt.key);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)),attempt.body);
  await assert.rejects(sendInvitationAttempt(attempt,{...session,user:{id:resource}} as Session,request),{kind:'auth'});assert.equal(calls.length,1);
  for(const [status,kind,message] of [[401,'auth',''],[403,'mfa','Recent authentication is required'],[403,'denied','private detail'],[409,'conflict',''],[429,'rate',''],[502,'unknown','']] as const){
    await assert.rejects(sendInvitationAttempt(attempt,session,(async()=>Response.json({error:message},{status})) as typeof fetch),{kind});
  }
});
