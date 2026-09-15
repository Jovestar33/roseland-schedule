import test from 'node:test';
import assert from 'node:assert/strict';
import { AcceptanceController, AcceptanceError, type AcceptanceRepository, type AcceptanceReceipt } from '../../lib/platform/acceptance-controller.ts';
import { createAcceptanceRepository } from '../../lib/platform/acceptance-repository.ts';
import { readLocalAcceptanceConfig } from '../../lib/platform/local-acceptance-config.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
const actor='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222',org='33333333-3333-4333-8333-333333333333';
const receipt={invitationId:id,organizationId:org,acceptedAt:'2026-09-15T07:00:00Z'};
function harness(){const c=new AcceptanceController();c.bind(actor);c.prepare(id);return c;}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
const repo:AcceptanceRepository={accept:async()=>org,receipt:async()=>null};
test('acceptance uses an independent local gate and never exposes hosted config',()=>{
  const key=`e30.${Buffer.from('{"role":"anon","iss":"supabase-demo"}').toString('base64url')}.fixture`;
  const env={ROSELAND_LOCAL_ACCEPTANCE:'supabase',ROSELAND_LOCAL_SUPABASE_URL:'http://127.0.0.1:61321',ROSELAND_LOCAL_SUPABASE_ANON_KEY:key};
  assert.deepEqual(readLocalAcceptanceConfig(env,'127.0.0.1:3352'),{supabaseUrl:env.ROSELAND_LOCAL_SUPABASE_URL,anonymousKey:key});
  for(const patch of [{ROSELAND_LOCAL_ACCEPTANCE:undefined},{NETLIFY:'true'},{VERCEL:'1'},{ROSELAND_LOCAL_SUPABASE_URL:'https://example.supabase.co'},{ROSELAND_LOCAL_SUPABASE_ANON_KEY:'sb_secret_fixture'}])assert.equal(readLocalAcceptanceConfig({...env,...patch},'127.0.0.1:3352'),null);
  assert.equal(readLocalAcceptanceConfig(env,'untrusted.example'),null);
});
test('review binds an immutable invitation to one account',()=>{
  const c=harness();assert.ok(Object.isFrozen(c.attempt));assert.throws(()=>c.prepare(org));
  c.bind(actor);assert.equal(c.attempt?.invitationId,id);c.bind(org);assert.equal(c.attempt,null);
  assert.throws(()=>c.prepare('not-an-id'));
});
test('double confirmation sends only one request and never repeats success',async()=>{
  const c=harness(),d=deferred<string>();let sends=0;
  const r={...repo,accept:async()=>{sends++;return d.promise;}};
  const one=c.execute(r);await c.execute(r);assert.equal(sends,1);d.resolve(org);await one;
  assert.equal(c.phase,'success');await c.execute(r);assert.equal(sends,1);
});
for(const kind of ['auth','unavailable','unknown'] as const)test(`${kind} retains exact request and recovers same account`,async()=>{
  const c=harness(),attempt=c.attempt;
  await c.execute({...repo,accept:async()=>{throw new AcceptanceError(kind);}});c.bind(actor);
  assert.equal(c.failure,kind);assert.equal(c.attempt,attempt);await c.execute(repo);assert.equal(c.phase,'success');assert.equal(c.attempt,attempt);
});
test('lost-response retry checks receipt before any second acceptance',async()=>{
  const c=harness();await c.execute({...repo,accept:async()=>{throw new AcceptanceError('unknown');}});
  await c.execute({accept:async()=>assert.fail('Must not repeat a confirmed acceptance'),receipt:async()=>receipt});
  assert.equal(c.phase,'success');assert.deepEqual(c.receipt,receipt);
});
test('absent, malformed and mismatched receipts never confirm acceptance',async()=>{
  const c=harness();await c.execute(repo,true);assert.equal(c.phase,'review');assert.equal(c.receipt,null);
  await c.execute({...repo,accept:async()=>{throw new AcceptanceError('unknown');}});
  await c.execute(repo,true);assert.equal(c.phase,'uncertain');
  for(const value of [{...receipt,invitationId:org},{...receipt,acceptedAt:'bad'},{...receipt,organizationId:'bad'}]){
    await c.execute({...repo,receipt:async()=>value},true);assert.equal(c.phase,'uncertain');assert.equal(c.receipt,null);
  }
});
test('late accept or receipt cannot cross account boundaries',async()=>{
  for(const checkOnly of [false,true]){
    const c=harness(),d=deferred<unknown>();
    const operation=c.execute({accept:()=>d.promise as Promise<string>,receipt:()=>d.promise as Promise<AcceptanceReceipt>},checkOnly);
    c.bind(org);d.resolve(checkOnly?receipt:org);await operation;
    assert.equal(c.attempt,null);assert.equal(c.receipt,null);assert.equal(c.busy,false);
  }
});
test('account change while checking a retry never starts acceptance',async()=>{
  const c=harness();await c.execute({...repo,accept:async()=>{throw new AcceptanceError('unknown');}});
  const d=deferred<AcceptanceReceipt|null>();const operation=c.execute({accept:async()=>assert.fail('Changed account must not send'),receipt:()=>d.promise});
  c.bind(org);d.resolve(null);await operation;assert.equal(c.receipt,null);
});
test('repository pins the captured actor token and rejects another account',async()=>{
  let sessionActor=actor;const calls:{name:string;headers:Record<string,string>}[]=[];
  const sdk={auth:{getSession:async()=>({data:{session:{user:{id:sessionActor},access_token:'fictional-token'}},error:null})},rpc(name:string){
    const call={name,headers:{} as Record<string,string>};calls.push(call);
    return {setHeader(header:string,value:string){call.headers[header]=value;return Promise.resolve({data:name==='accept_organization_invitation'?org:receipt,error:null,status:200});}};
  }} as unknown as SupabaseClient;
  const r=createAcceptanceRepository(sdk),attempt=harness().attempt!;
  assert.equal(await r.accept(attempt),org);assert.deepEqual(await r.receipt(attempt),receipt);
  assert.ok(calls.every(c=>c.headers.Authorization==='Bearer fictional-token'));
  sessionActor=org;await assert.rejects(r.accept(attempt),{kind:'auth'});assert.equal(calls.length,2);
});
