import test from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {captureMembershipAttempt,createMembershipRepository,MembershipError} from '../../lib/platform/organization-members.ts';
const a={actor:'10000000-0000-4000-8000-000000000001',organization:'10000000-0000-4000-8000-000000000002',member:'10000000-0000-4000-8000-000000000003',request:'10000000-0000-4000-8000-000000000004',revision:2,status:'active' as const,confirmed:true,reason:'  Restore retained role  '};
function fixture(actor=a.actor,response:unknown={data:{confirmed:true,request_id:a.request,organization_id:a.organization,membership_id:a.member,status:a.status,revision:3,changed:true,notification_id:a.request},error:null}){
 const calls:{name:string;args:Record<string,unknown>;header?:string}[]=[];
 const client={auth:{getSession:async()=>({data:{session:{user:{id:actor},access_token:'actor-token'}}})},rpc:(name:string,args:Record<string,unknown>)=>{const call={name,args,header:''};calls.push(call);return {setHeader:(_name:string,value:string)=>{call.header=value;return Promise.resolve(response);}};}} as unknown as SupabaseClient;
 return {repo:createMembershipRepository(client),calls};
}
test('membership attempt freezes target, revision and reason for exact retry',()=>{const draft={...a},saved=captureMembershipAttempt(draft);draft.reason='Different';draft.revision=5;assert.equal(saved.reason,'Restore retained role');assert.equal(saved.revision,2);assert.ok(Object.isFrozen(saved));assert.throws(()=>captureMembershipAttempt({...a,confirmed:false}));});
test('actor switch sends no membership mutation',async()=>{const {repo,calls}=fixture('10000000-0000-4000-8000-000000000009');await assert.rejects(repo.save(a),(e)=>e instanceof MembershipError&&e.kind==='auth');assert.equal(calls.length,0);});
test('membership retry sends the identical actor-bound versioned request',async()=>{const {repo,calls}=fixture();await repo.save(a);await repo.save(a);assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0].header,'Bearer actor-token');assert.equal(calls[0].args.expected_revision,2);});
test('mismatched receipt is unconfirmed, preserving caller request',async()=>{const {repo}=fixture(a.actor,{data:{confirmed:true,request_id:a.request,organization_id:a.organization,membership_id:a.member,status:'suspended',revision:3,changed:true},error:null});await assert.rejects(repo.save(a),(e)=>e instanceof MembershipError&&e.kind==='unknown');});
test('recent MFA and stale revisions remain distinct from unknown outcomes',async()=>{for(const [response,kind] of [[{error:{message:'mfa_recent_required'},status:403},'mfa'],[{error:{message:'Membership changed'},status:409},'conflict']] as const){await assert.rejects(fixture(a.actor,response).repo.save(a),(e)=>e instanceof MembershipError&&e.kind===kind);}});
