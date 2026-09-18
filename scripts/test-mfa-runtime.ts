// B09-A ordinary MFA acceptance. Only the preserved, unlinked fictional local stack.
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
const dir='/private/tmp/roseland-b08-20260917',project='roseland-b08-20260917';
function ensure(v:unknown,m:string):asserts v{if(!v)throw Error(m);}
ensure(!existsSync(resolve(dir,'supabase/.temp/project-ref')),'Linked project refused');
ensure(readFileSync(resolve(dir,'supabase/config.toml'),'utf8').includes(`project_id = "${project}"`),'Unexpected project');
const status=JSON.parse(execFileSync(resolve('node_modules/.bin/supabase'),['status','--workdir',dir,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
ensure(status.API_URL==='http://127.0.0.1:56121','Only owned loopback API allowed');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input:RequestInfo|URL,init?:RequestInit)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);ensure(u.origin===status.API_URL,'External request refused');return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});}}};
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,options),client=()=>createClient(status.API_URL,status.ANON_KEY,options);
function sql(s:string){try{return execFileSync('docker',['exec','-i',`supabase_db_${project}`,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}catch{throw Error('Fictional local SQL failed');}}
function totp(secret:string){let bits='';for(const c of secret.toUpperCase().replace(/=+$/,''))bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g)!.map(v=>parseInt(v,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),o=h.at(-1)!&15;return((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,'0');}
let count=0;function check(v:unknown,m:string){ensure(v,m);console.log('PASS '+m);count++;}
async function identity(label:string){const email=`b09-${label}-${randomUUID()}@example.test`,password=`Fictional1!${randomBytes(18).toString('hex')}`;
 const r=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{b08_terms:'fictional-terms-v1',b08_privacy:'fictional-privacy-v1'}});ensure(r.data.user&&!r.error,'Fictional user creation failed');const c=client();ensure(!(await c.auth.signInWithPassword({email,password})).error,'Fictional login failed');return {id:r.data.user.id,email,password,c};}
async function ok(c:SupabaseClient,name:string,args:Record<string,unknown>={}){const r=await c.rpc(name,args);ensure(!r.error,`${name}: ${r.error?.code} ${r.error?.message}`);return r.data;}
async function enroll(u:Awaited<ReturnType<typeof identity>>){const r=await u.c.auth.mfa.enroll({factorType:'totp',friendlyName:'B09 fictional factor'});ensure(r.data&&!r.error,'Enrollment failed');const factor=r.data;
 const bad=await u.c.auth.mfa.challengeAndVerify({factorId:factor.id,code:'not-a-code'});check(!!bad.error,'Incorrect authenticator code leaves enrollment incomplete');
 ensure(!(await u.c.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)})).error,'Verification failed');return {id:factor.id,secret:factor.totp.secret};}
const owner=await identity('owner'),ordinary=await identity('editor'),leader=await identity('admin'),outsider=await identity('outsider'),platform=await identity('platform'),browser=await identity('browser');
const org=randomUUID(),other=randomUUID(),prod=randomUUID(),otherProd=randomUUID(),schedule=randomUUID();
sql(`insert into public.organizations(id,name,slug)values('${org}','Fictional B09 Studio','b09-${org}'),('${other}','Fictional B09 Other Studio','b09-${other}');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)values('${org}','${owner.id}','owner','active',now()),('${org}','${leader.id}','admin','active',now()),('${org}','${ordinary.id}','member','active',now()),('${other}','${ordinary.id}','member','active',now()),('${org}','${browser.id}','owner','active',now());
insert into public.productions(id,organization_id,name,slug)values('${prod}','${org}','B09 production','b09'),('${otherProd}','${other}','Other production','other');
insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at)values('${org}','${prod}','${ordinary.id}','editor','active',now()),('${other}','${otherProd}','${ordinary.id}','viewer','active',now());
insert into public.schedules(id,organization_id,production_id,display_name,slug,document,created_by,updated_by)values('${schedule}','${org}','${prod}','Fictional B09 retained draft','b09','{"meta":{"town":"B09 baseline"},"rows":[{"action":"Shoot","dur":"00:15","notes":"Fictional baseline"}]}','${owner.id}','${owner.id}');
insert into private.platform_operators(user_id,role,designation_reason)values('${platform.id}','superadmin','B09 fictional admission fixture');`);
const orgArgs={target_organization_id:org};
check((await ok(owner.c,'list_my_organization_access',orgArgs))[0].access_state==='mfa_required','Owner sees only own organization enrollment status');
check((await owner.c.rpc('read_schedule',{target_schedule_id:schedule})).error!==null,'Unenrolled owner cannot read schedule RPC');
check((await owner.c.from('schedules').select('id').eq('id',schedule)).data?.length===0,'Direct table RLS denies unenrolled owner');
check((await owner.c.rpc('read_organization_presentation',orgArgs)).error?.message==='mfa_required','Presentation read cannot bypass owner MFA');
check((await owner.c.rpc('read_snapshot_policy',orgArgs)).error?.message==='mfa_required','Snapshot policy read cannot bypass owner MFA');
check((await ok(platform.c,'get_my_mfa_status')).required===true,'Platform Super Admin requires MFA');
check((await platform.c.from('profiles').select('user_id')).error?.message==='mfa_required','Platform account protected Data API admission denied at AAL1');
check(!!(await ok(ordinary.c,'read_schedule',{target_schedule_id:schedule})),'Optional unenrolled editor retains ordinary read');
check((await ok(leader.c,'read_organization_mfa_policy',orgArgs)).can_manage,'Ordinary Admin can review security policy');
const request={...orgArgs,request_id:randomUUID(),expected_version:0,required_roles:['editor']};
check((await leader.c.rpc('save_organization_mfa_policy',request)).error?.message==='mfa_recent_required','Security policy change retains recent MFA gate');
const factor=await enroll(owner);check((await ok(owner.c,'get_my_mfa_status')).aal==='aal2','Genuine first TOTP enrollment upgrades session');
const saved=await ok(owner.c,'save_organization_mfa_policy',request);check(saved.version===1,'Owner saves organization role requirement');
check((await ok(owner.c,'save_organization_mfa_policy',request)).version===1,'Exact policy retry confirms same version');
check((await owner.c.rpc('save_organization_mfa_policy',{...request,required_roles:['viewer']})).status===409,'Changed payload cannot reuse policy request identity');
check((await owner.c.rpc('save_organization_mfa_policy',{...request,request_id:randomUUID()})).status===409,'Stale policy version requires review');
check(sql(`select count(*) from public.audit_events where organization_id='${org}' and action='organization.mfa_policy.update';`)==='1','Exact retry creates one policy audit');
check((await ok(ordinary.c,'list_my_organization_access',orgArgs))[0].access_state==='mfa_required','Policy change affects existing editor session without refresh');
check((await ordinary.c.rpc('read_schedule',{target_schedule_id:schedule})).error!==null,'Existing editor session loses protected RPC access');
check((await ordinary.c.from('schedules').select('id').eq('id',schedule)).data?.length===0,'Existing editor session loses direct schedule access');
check((await ok(ordinary.c,'list_my_organization_access',{target_organization_id:other}))[0].access_state==='ready','Unrelated organization remains available before enrollment');
check((await ok(ordinary.c,'read_organization_presentation',{target_organization_id:other})).version===0,'Unrelated organization ordinary RPC remains available');
check((await outsider.c.rpc('read_organization_mfa_policy',orgArgs)).status===404,'Outsider cannot read tenant security policy');
check((await outsider.c.rpc('save_organization_mfa_policy',{...request,request_id:randomUUID(),expected_version:1})).error!==null,'Outsider cannot change tenant security policy');
// Caller-supplied headers must not upgrade a browser token.
check((await ordinary.c.from('schedules').select('id').eq('id',schedule).setHeader('x-actor-aal','aal2').setHeader('x-actor-user-id',owner.id)).data?.length===0,'Browser actor headers cannot bypass MFA');
const adminFactor=await enroll(leader);check((await ok(leader.c,'save_organization_mfa_policy',{...request,request_id:randomUUID(),expected_version:1,required_roles:[]})).version===2,'Verified Admin can update optional role policy');
check((await ok(ordinary.c,'list_my_organization_access',orgArgs))[0].access_state==='ready','Removing optional policy requirement restores ordinary admission');
sql(`update public.organization_memberships set role='owner' where organization_id='${org}' and user_id='${ordinary.id}';`);
check((await ok(ordinary.c,'list_my_organization_access',orgArgs))[0].access_state==='mfa_required','Live role promotion requires enrollment immediately');
sql(`update public.organization_memberships set role='member' where organization_id='${org}' and user_id='${ordinary.id}';`);
await owner.c.auth.signOut({scope:'local'});ensure(!(await owner.c.auth.signInWithPassword({email:owner.email,password:owner.password})).error,'Relogin failed');
check((await owner.c.rpc('read_schedule',{target_schedule_id:schedule})).error?.message==='mfa_required','Enrolled account requires challenge on fresh login');
check((await ok(owner.c,'get_my_mfa_status')).enrolled,'Factor status remains available before challenge');
ensure(!(await owner.c.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.secret)})).error,'Rechallenge failed');
check(!!(await ok(owner.c,'read_schedule',{target_schedule_id:schedule})),'Same-account challenge restores retained workspace access');
const before=await ok(owner.c,'read_schedule',{target_schedule_id:schedule});
const row=Array.isArray(before)?before[0]:before;
check(!!row,'Ordinary schedule read works after step-up');
// Privilege checks verify the new table/API boundary without a broad provider investigation.
check(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('account_requires_mfa','organization_requires_mfa','request_actor_aal','request_actor','require_organization_mfa','require_recent_totp') and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'));")==='0','Private MFA helpers are not client-callable');
writeFileSync('/private/tmp/roseland-b09-fixtures.json',JSON.stringify({project,origin:'http://127.0.0.1:3435',organization:org,production:prod,schedule,browser:{id:browser.id,email:browser.email,password:browser.password},owner:{id:owner.id,email:owner.email,password:owner.password,factor},admin:{id:leader.id,email:leader.email,password:leader.password,factor:adminFactor}}),{mode:0o600});
console.log(`PASS ${count} focused B09-A assertions; private browser fixture saved.`);
