// B10-A scoped membership acceptance. Only the preserved, unlinked fictional local stack.
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
function sql(s:string){try{return execFileSync('docker',['exec','-i',`supabase_db_${project}`,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}catch(error){const detail=String((error as {stderr?:Buffer}).stderr??'');throw Error(detail.includes('At least one active Organization Super Admin must remain')?'Last holder protected':'Fictional local SQL failed');}}
function totp(secret:string){let bits='';for(const c of secret.toUpperCase().replace(/=+$/,''))bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g)!.map(v=>parseInt(v,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),o=h.at(-1)!&15;return((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,'0');}
let count=0;function check(v:unknown,m:string){ensure(v,m);console.log('PASS '+m);count++;}
async function identity(label:string){const email=`b10-${label}-${randomUUID()}@example.test`,password=`Fictional1!${randomBytes(18).toString('hex')}`;
 const r=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{b08_terms:'fictional-terms-v1',b08_privacy:'fictional-privacy-v1'}});ensure(r.data.user&&!r.error,'Fictional user creation failed');const c=client();ensure(!(await c.auth.signInWithPassword({email,password})).error,'Fictional login failed');return {id:r.data.user.id,email,password,c};}
async function ok(c:SupabaseClient,name:string,args:Record<string,unknown>={}){const r=await c.rpc(name,args);ensure(!r.error,`${name}: ${r.error?.code} ${r.error?.message}`);return r.data;}
async function enroll(u:Awaited<ReturnType<typeof identity>>){const r=await u.c.auth.mfa.enroll({factorType:'totp',friendlyName:'B10 fictional factor'});ensure(r.data&&!r.error,'Enrollment failed');const factor=r.data;
 const bad=await u.c.auth.mfa.challengeAndVerify({factorId:factor.id,code:'not-a-code'});check(!!bad.error,'Incorrect authenticator code leaves enrollment incomplete');
 ensure(!(await u.c.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)})).error,'Verification failed');return {id:factor.id,secret:factor.totp.secret};}
const owner=await identity('owner'),peer=await identity('peer-owner'),leader=await identity('admin'),member=await identity('member'),invited=await identity('invited');
const org=randomUUID(),other=randomUUID(),prod=randomUUID(),blockedProd=randomUUID(),schedule=randomUUID(),invitation=randomUUID();
const ids={owner:randomUUID(),peer:randomUUID(),admin:randomUUID(),member:randomUUID(),invited:randomUUID()};
sql(`insert into public.organizations(id,name,slug)values('${org}','Fictional B10 Studio','b10-${org}'),('${other}','Fictional B10 Other','b10-${other}');
insert into public.organization_memberships(id,organization_id,user_id,role,status,joined_at)values('${ids.owner}','${org}','${owner.id}','owner','active',now()),('${ids.peer}','${org}','${peer.id}','owner','active',now()),('${ids.admin}','${org}','${leader.id}','admin','active',now()),('${ids.member}','${org}','${member.id}','member','active',now()),('${ids.invited}','${org}','${invited.id}','member','invited',null);
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)values('${other}','${member.id}','member','active',now());
insert into public.productions(id,organization_id,name,slug)values('${prod}','${org}','B10 production','b10'),('${blockedProd}','${org}','B10 independent restriction','b10-blocked');
insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at)values('${org}','${prod}','${member.id}','editor','active',now()),('${org}','${blockedProd}','${member.id}','viewer','suspended',now());
insert into public.schedules(id,organization_id,production_id,display_name,slug,document,created_by,updated_by)values('${schedule}','${org}','${prod}','Fictional B10 preserved schedule','b10','{"meta":{"town":"B10 baseline"},"rows":[{"action":"Shoot","dur":"00:15","notes":"Preserved fictional baseline"}]}','${owner.id}','${owner.id}');
insert into public.schedule_restrictions(organization_id,production_id,schedule_id,subject_user_id,denied_actions,authority,created_by)values('${org}','${prod}','${schedule}','${member.id}',array['edit'],'owner','${owner.id}');
insert into public.organization_invitations(id,organization_id,email,organization_role,created_by,expires_at)values('${invitation}','${org}','${member.email}','member','${owner.id}',now()+interval '7 days');`);
const baseline=sql(`select jsonb_build_object('production',(select jsonb_agg(to_jsonb(m) order by id) from public.production_memberships m where organization_id='${org}'),'restrictions',(select jsonb_agg(to_jsonb(r) order by id) from public.schedule_restrictions r where organization_id='${org}'),'schedule',(select to_jsonb(s) from public.schedules s where id='${schedule}'),'other',(select to_jsonb(m) from public.organization_memberships m where organization_id='${other}' and user_id='${member.id}'));`);
const args=(id:string,revision:number,next_status='suspended')=>({target_organization_id:org,target_membership_id:id,expected_revision:revision,request_id:randomUUID(),next_status,confirmed:true,reason:'Fictional scoped membership check'});
check((await leader.c.rpc('set_organization_member_status',args(ids.member,1))).error?.message==='mfa_recent_required','Membership change requires recent genuine MFA');
const ownerFactor=await enroll(owner),peerFactor=await enroll(peer),adminFactor=await enroll(leader);
const list=await ok(owner.c,'list_organization_members',{target_organization_id:org});check(list.length===5&&list.find((m:{id:string})=>m.id===ids.member).can_manage,'Leadership can list scoped member controls');
check((await member.c.rpc('list_organization_members',{target_organization_id:org})).status===404,'Ordinary member cannot list administration directory');
check((await leader.c.rpc('set_organization_member_status',args(ids.owner,1))).status===404,'Admin cannot suspend Organization Super Admin');
check((await leader.c.rpc('set_organization_member_status',args(ids.admin,1))).status===404,'Self-targeting is excluded');
check((await owner.c.rpc('set_organization_member_status',args(ids.invited,1,'active'))).status===404,'Invited membership cannot be activated by reinstatement');
check((await owner.c.rpc('set_organization_member_status',{...args(ids.member,1),confirmed:false})).status===400,'Named-member confirmation required');
sql(`update public.organization_memberships set role='admin',status='active',joined_at=now() where id='${ids.invited}';`);
check((await leader.c.rpc('set_organization_member_status',args(ids.invited,2))).status===404,'Admin cannot suspend peer Admin');
await ok(owner.c,'set_organization_member_status',args(ids.invited,2));
check((await leader.c.rpc('set_organization_member_status',args(ids.invited,3,'active'))).status===404,'Admin cannot reinstate peer Admin');
await ok(owner.c,'set_organization_member_status',args(ids.invited,3,'active'));

check((await owner.c.rpc('set_organization_member_status',{...args(ids.member,1),target_organization_id:other})).status===404,'Wrong-organization target denied');
check(!!(await ok(member.c,'read_schedule',{target_schedule_id:schedule})),'Member has baseline schedule read');
const suspend=args(ids.member,1);const suspended=await ok(leader.c,'set_organization_member_status',suspend);
check(suspended.status==='suspended'&&suspended.role==='member'&&suspended.revision===2,'Admin suspends lower-role membership with role retained');
check((await member.c.rpc('read_schedule',{target_schedule_id:schedule})).error!==null,'Existing member session loses subsequent organization access');
check((await member.c.from('schedules').select('id').eq('id',schedule)).data?.length===0,'Direct schedule RLS denies suspended member');
check((await ok(member.c,'read_organization_presentation',{target_organization_id:other})).version===0,'Unrelated organization remains available');
check(sql(`select status from public.organization_invitations where id='${invitation}';`)==='expired','Suspension invalidates pending invitations');
check((await member.c.rpc('accept_organization_invitation',{invitation_id:invitation})).error!==null,'Invitation cannot reactivate suspended membership');
check(JSON.stringify(await ok(leader.c,'set_organization_member_status',suspend))===JSON.stringify(suspended),'Exact retry returns original membership receipt');
check((await leader.c.rpc('set_organization_member_status',{...suspend,next_status:'active'})).status===409,'Changed request payload cannot reuse receipt');
check((await leader.c.rpc('set_organization_member_status',args(ids.member,1,'active'))).status===409,'Stale revision requires review');
check(sql(`select count(*) from private.administration_notification_outbox where membership_id='${ids.member}';`)==='1','Exact retry creates one notification intent');
check(sql(`select count(*) from public.audit_events where resource_id='${ids.member}' and action='organization.member.suspended';`)==='1','Exact retry creates one membership audit');
const restore=args(ids.member,2,'active'),restored=await ok(leader.c,'set_organization_member_status',restore);
check(restored.status==='active'&&restored.role==='member'&&restored.revision===3,'Admin reinstates lower role without granting privileges');
check(!!(await ok(member.c,'read_schedule',{target_schedule_id:schedule})),'Reinstatement restores ordinary allowed read');
check((await ok(member.c,'schedule_capability',{action:'edit',target_production_id:prod,target_schedule_id:schedule}))===false,'Retained schedule edit restriction remains effective');
check(sql(`select status from public.organization_invitations where id='${invitation}';`)==='expired','Reinstatement does not recreate expired invitations');
const after=sql(`select jsonb_build_object('production',(select jsonb_agg(to_jsonb(m) order by id) from public.production_memberships m where organization_id='${org}'),'restrictions',(select jsonb_agg(to_jsonb(r) order by id) from public.schedule_restrictions r where organization_id='${org}'),'schedule',(select to_jsonb(s) from public.schedules s where id='${schedule}'),'other',(select to_jsonb(m) from public.organization_memberships m where organization_id='${other}' and user_id='${member.id}'));`);
check(after===baseline,'Production restrictions, schedule/document, restrictions and unrelated membership are byte-identical');
const noop=await ok(leader.c,'set_organization_member_status',args(ids.member,3,'active'));check(noop.changed===false&&noop.revision===3&&noop.notification_id===null,'Already-active explicit request is unchanged with no notice');
const adminSuspended=await ok(owner.c,'set_organization_member_status',args(ids.admin,1));check(adminSuspended.role==='admin','Super Admin can suspend Admin and retain role');
check((await leader.c.rpc('set_organization_member_status',suspend)).error!==null,'Suspended actor cannot recover an old receipt');
check((await ok(owner.c,'set_organization_member_status',args(ids.admin,2,'active'))).role==='admin','Super Admin can reinstate Admin with retained role');
// Independent permissions restriction applies to both transitions.
sql(`insert into public.schedule_restrictions(organization_id,subject_user_id,denied_actions,authority,created_by)values('${org}','${leader.id}',array['permissions'],'owner','${owner.id}');`);
check((await leader.c.rpc('set_organization_member_status',args(ids.member,3))).status===404,'Restricted Admin cannot suspend');
sql(`delete from public.schedule_restrictions where organization_id='${org}' and subject_user_id='${leader.id}';`);
await ok(owner.c,'set_organization_member_status',args(ids.member,3));
check((await leader.c.rpc('set_organization_member_status',args(ids.owner,1,'active'))).status===404,'Admin cannot reinstate Super Admin');
sql(`update auth.users set banned_until=now()+interval '1 day' where id='${member.id}';`);
const ban=sql(`select banned_until from auth.users where id='${member.id}';`);
await ok(leader.c,'set_organization_member_status',args(ids.member,4,'active'));
check(sql(`select banned_until from auth.users where id='${member.id}';`)===ban,'Reinstatement preserves independent global ban');
check((await member.c.rpc('read_schedule',{target_schedule_id:schedule})).error!==null,'Global ban remains effective after organization reinstatement');
sql(`update auth.users set banned_until=null where id='${member.id}';`);
// Two authorized peer requests race; organization lock serializes before membership locks.
const competing=await Promise.all([owner.c.rpc('set_organization_member_status',args(ids.peer,1)),peer.c.rpc('set_organization_member_status',args(ids.owner,1))]);
check(competing.filter(r=>!r.error).length===1&&competing.every(r=>!r.error||r.status===404),'Competing peer suspensions yield one success and one current-authority denial');
check(sql(`select count(*) from public.organization_memberships where organization_id='${org}' and role='owner' and status='active';`)==='1','At least one active Super Admin survives');
const winner=competing[0].error?peer:owner,loser=competing[0].error?owner:peer,winnerId=competing[0].error?ids.peer:ids.owner,loserId=competing[0].error?ids.owner:ids.peer;
for(const change of ["status='suspended'","role='member'"]){let denied=false;try{sql(`update public.organization_memberships set ${change} where id='${winnerId}';`);}catch(e){denied=e instanceof Error&&e.message==='Last holder protected';}check(denied,'Database guard denies final-holder '+change);}
let deniedDelete=false;try{sql(`delete from public.organization_memberships where id='${winnerId}';`);}catch(e){deniedDelete=e instanceof Error&&e.message==='Last holder protected';}check(deniedDelete,'Database guard denies final-holder deletion');
await ok(winner.c,'set_organization_member_status',args(loserId,2,'active'));
check(sql(`select count(*) from public.organization_memberships where organization_id='${org}' and role='owner' and status='active';`)==='2','Peer reinstatement restores prior Super Admin role');
writeFileSync('/private/tmp/roseland-b10-fixtures.json',JSON.stringify({project,organization:org,schedule,membership:ids.member,suspendEvent:suspend.request_id,restoreEvent:restore.request_id,owner:{id:owner.id,email:owner.email,password:owner.password,factor:ownerFactor},admin:{id:leader.id,email:leader.email,password:leader.password,factor:adminFactor},memberEmail:member.email}),{mode:0o600});
console.log(`PASS ${count} focused B10-A assertions; private browser fixture saved.`);
