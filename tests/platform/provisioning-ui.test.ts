import test from 'node:test';
import assert from 'node:assert/strict';
import { ProvisioningController, sendProvisioningAttempt } from '../../lib/platform/provisioning-controller.ts';
import { InvitationError } from '../../lib/platform/invitation-controller.ts';
import type { Session } from '@supabase/supabase-js';
const actor='11111111-1111-4111-8111-111111111111', owner='22222222-2222-4222-8222-222222222222', result='33333333-3333-4333-8333-333333333333';
const input={ownerUserId:owner,name:' Fictional studio ',slug:'FICTIONAL-STUDIO',timezone:'UTC',locale:'en-us',countryCode:'us',currency:'usd',reason:' Reviewed fiction '};
function controller(){const c=new ProvisioningController(()=> 'fictional-request-0001');c.bind(actor);c.prepare(input);return c;}
const session={user:{id:actor},access_token:'fictional-token'} as Session;
test('provisioning canonicalizes and freezes the complete review without trusting tenant roles',()=>{
  const c=controller(),a=c.attempt!;assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.body));
  assert.deepEqual(a.body,{ownerUserId:owner,name:'Fictional studio',slug:'fictional-studio',timezone:'UTC',locale:'en-US',countryCode:'US',currency:'USD',reason:'Reviewed fiction'});
  c.bind(actor);assert.equal(c.attempt,a);assert.throws(()=>c.prepare(input));
});
test('invalid owners, names, addresses, locale, timezone and reason cannot become a review',()=>{
  for(const patch of [{ownerUserId:'email@example.test'},{name:''},{slug:'invalid address'},{timezone:'invalid/zone'},{locale:'en_XX'},{reason:''},{currency:'dollars'}]){
    const c=new ProvisioningController(()=> 'fictional-request-0001');c.bind(actor);assert.throws(()=>c.prepare({...input,...patch}));assert.equal(c.attempt,null);
  }
});
test('duplicate submits send once and successful reviews never resend',async()=>{
  const c=controller();let resolve!:(id:string)=>void,sends=0;const pending=new Promise<string>(r=>resolve=r);const send=async()=>{sends++;return pending;};
  const first=c.submit(send);await c.submit(send);resolve(result);await first;await c.submit(send);assert.equal(sends,1);assert.equal(c.result,result);
});
for(const kind of ['unknown','auth','mfa','denied','rate'] as const)test(`${kind} preserves the original key/body across same-account retry`,async()=>{
  const c=controller(),a=c.attempt;await c.submit(async()=>{throw new InvitationError(kind);});assert.equal(c.failure,kind);assert.equal(c.attempt,a);c.bind(actor);
  await c.submit(async sent=>{assert.equal(sent,a);return result;});assert.equal(c.phase,'success');
});
test('conflicts never silently get a fresh key or retry',async()=>{
  const c=controller(),a=c.attempt;await c.submit(async()=>{throw new InvitationError('conflict');});await c.submit(async()=>assert.fail('conflict cannot resend'));assert.equal(c.attempt,a);assert.equal(c.phase,'conflict');
});
test('account changes ignore late results and errors',async()=>{
  for(const fail of [false,true]){const c=controller();let settle!:(id:string)=>void;const wait=new Promise<string>((resolve,reject)=>{settle=fail?()=>reject(new InvitationError('auth')):resolve;});const running=c.submit(()=>wait);c.bind(owner);settle(result);await running;assert.equal(c.result,null);assert.equal(c.failure,null);assert.equal(c.attempt,null);assert.equal(c.busy,false);}
});
test('transport pins actor, exact body/key and no-cache same-origin endpoint',async()=>{
  const a=controller().attempt!;const request:typeof fetch=async(url,init)=>{assert.equal(url,'/api/platform/organizations');assert.equal(init?.method,'POST');assert.equal(init?.cache,'no-store');assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer fictional-token');assert.equal(new Headers(init?.headers).get('idempotency-key'),a.key);assert.deepEqual(JSON.parse(String(init?.body)),a.body);return Response.json({organizationId:result,requestId:a.key},{status:201});};
  assert.equal(await sendProvisioningAttempt(a,session,request),result);await assert.rejects(()=>sendProvisioningAttempt(a,{...session,user:{...session.user,id:owner}},async()=>assert.fail('wrong actor must not send')),{kind:'auth'});
});
test('transport requires a valid result and exact echoed request identity',async()=>{
  const a=controller().attempt!;for(const body of [{organizationId:result,requestId:'wrong-key'},{organizationId:'not-a-uuid',requestId:a.key},{organizationId:result}])await assert.rejects(()=>sendProvisioningAttempt(a,session,async()=>Response.json(body)),{kind:'unknown'});
});
test('bounded server failures map without disclosing raw details',async()=>{
  const a=controller().attempt!;for(const [status,error,kind] of [[401,'secret','auth'],[403,'Recent authentication is required','mfa'],[403,'Stronger authentication is required','mfa'],[403,'secret','denied'],[400,'secret','denied'],[409,'secret','conflict'],[429,'secret','rate'],[500,'secret','unknown']] as const)await assert.rejects(()=>sendProvisioningAttempt(a,session,async()=>Response.json({error},{status})),{kind,message:kind});
});
