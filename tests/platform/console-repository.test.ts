import test from 'node:test';
import assert from 'node:assert/strict';
import type {Session} from '@supabase/supabase-js';
import {readPlatformConsole} from '../../lib/platform/console-repository.ts';
const session={user:{id:'fixture-actor'},access_token:'fixture-token'} as Session;
test('console transport binds responses to the actor and uses no-store server endpoint',async()=>{
 const result=await readPlatformConsole(session,'access',{},async(url,init)=>{
  assert.equal(url,'/api/platform/console?view=access');assert.equal(init?.cache,'no-store');assert.equal(init?.redirect,'error');assert.equal(new Headers(init?.headers).get('authorization'),'Bearer fixture-token');
  return Response.json({result:{actorId:session.user.id,authorized:false}});
 });assert.equal(result.authorized,false);
 await assert.rejects(()=>readPlatformConsole(session,'access',{},async()=>Response.json({result:{actorId:'other-actor',authorized:true}})),{kind:'unknown'});
});
test('console rejects unverified organization responses and safely maps errors',async()=>{
 for(const result of [{actorId:session.user.id,authorized:false,organizations:[]},{actorId:session.user.id,authorized:true,organizations:[{id:'incomplete'}]}])await assert.rejects(()=>readPlatformConsole(session,'organizations',{},async()=>Response.json({result})),{kind:'unknown'});
 for(const [status,error,kind] of [[401,'hidden','auth'],[403,'Platform access unavailable','denied'],[403,'Recent authentication is required','mfa'],[500,'hidden','unknown']] as const)
  await assert.rejects(()=>readPlatformConsole(session,'organizations',{},async()=>Response.json({error},{status})),{kind});
});
test('console search and pagination are encoded without altering their values',async()=>{
 await readPlatformConsole(session,'organizations',{search:'A & B',after:'cursor'},async(url)=>{
  const parsed=new URL(String(url),'https://example.test');assert.equal(parsed.searchParams.get('search'),'A & B');assert.equal(parsed.searchParams.get('after'),'cursor');
  return Response.json({result:{actorId:session.user.id,authorized:true,organizations:[]}});
 });
});
