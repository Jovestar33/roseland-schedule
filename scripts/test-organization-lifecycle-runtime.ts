// B10-B organization lifecycle acceptance. Only the preserved, unlinked fictional local stack.
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
function sql(s:string){try{return execFileSync('docker',['exec','-i',`supabase_db_${project}`,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}catch(error){const detail=String((error as {stderr?:Buffer}).stderr??'');throw Error(detail.includes('At least one active Organization Super Admin must remain')?'Last holder protected':detail.includes('organization_read_only')?'Organization read only':'Fictional local SQL failed');}}
function totp(secret:string){let bits='';for(const c of secret.toUpperCase().replace(/=+$/,''))bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g)!.map(v=>parseInt(v,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),o=h.at(-1)!&15;return((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,'0');}
let count=0;function check(v:unknown,m:string){ensure(v,m);console.log('PASS '+m);count++;}
async function identity(label:string){const email=`b10b-${label}-${randomUUID()}@example.test`,password=`Fictional1!${randomBytes(18).toString('hex')}`;
 const r=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{b08_terms:'fictional-terms-v1',b08_privacy:'fictional-privacy-v1'}});ensure(r.data.user&&!r.error,'Fictional user creation failed');const c=client();ensure(!(await c.auth.signInWithPassword({email,password})).error,'Fictional login failed');return {id:r.data.user.id,email,password,c};}
async function ok(c:SupabaseClient,name:string,args:Record<string,unknown>={}){const r=await c.rpc(name,args);ensure(!r.error,`${name}: ${r.error?.code} ${r.error?.message}`);return r.data;}
async function enroll(u:Awaited<ReturnType<typeof identity>>){const r=await u.c.auth.mfa.enroll({factorType:'totp',friendlyName:'B10-B fictional factor'});ensure(r.data&&!r.error,'Enrollment failed');const factor=r.data;

 ensure(!(await u.c.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)})).error,'Verification failed');return {id:factor.id,secret:factor.totp.secret};}
const fixture=JSON.parse(readFileSync('/private/tmp/roseland-b10-fixtures.json','utf8'));
ensure(fixture.project===project,'Preserved fictional fixture required');
async function existing(a:{id:string;email:string;password:string;factor:{id:string;secret:string}}){const c=client();ensure(!(await c.auth.signInWithPassword({email:a.email,password:a.password})).error,'Fixture sign-in failed');ensure(!(await c.auth.mfa.challengeAndVerify({factorId:a.factor.id,code:totp(a.factor.secret)})).error,'Fixture MFA failed');return {...a,c};}
const owner=await existing(fixture.owner),leader=await existing(fixture.admin),peer=await identity('canceller'),reader=await identity('reader'),suspended=await identity('suspended');
const org=fixture.organization,schedule=fixture.schedule,prod=sql(`select production_id from public.schedules where id='${schedule}';`),other=randomUUID(),otherProd=randomUUID(),invitation=randomUUID(),snapshot=randomUUID(),template=randomUUID();
const resume=await ok(owner.c,'read_organization_lifecycle',{target_organization_id:org});if(resume.state==='pending_deletion')await ok(owner.c,'cancel_organization_deletion',{target_organization_id:org,request_id:randomUUID(),expected_version:resume.version});
sql(`insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)values('${org}','${peer.id}','owner','active',now()),('${org}','${reader.id}','member','active',now()),('${org}','${suspended.id}','member','suspended',now());
insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at)values('${org}','${prod}','${reader.id}','editor','active',now()),('${org}','${prod}','${suspended.id}','editor','active',now());
insert into public.organizations(id,name,slug)values('${other}','Fictional B10-B Other','b10b-${other}');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)values('${other}','${owner.id}','owner','active',now()),('${other}','${reader.id}','member','active',now());
insert into public.productions(id,organization_id,name,slug)values('${otherProd}','${other}','B10-B destination','b10b');
insert into public.schedule_restrictions(organization_id,subject_user_id,denied_actions,authority,created_by)values('${org}','${reader.id}',array['export'],'owner','${owner.id}'),('${org}','${peer.id}',array['permissions'],'owner','${owner.id}');
insert into public.organization_invitations(id,organization_id,email,organization_role,created_by,expires_at)values('${invitation}','${org}','${reader.email}','member','${owner.id}',now()+interval '7 days');
insert into private.schedule_snapshots(id,organization_id,schedule_id,kind,document,created_by,updated_by,captured_at)select '${snapshot}','${org}',id,'automatic',document,'${owner.id}','${owner.id}',now()-interval '2 days' from public.schedules where id='${schedule}';`);
const peerFactor=await enroll(peer),orgArg={target_organization_id:org};
const initial=await ok(owner.c,'read_organization_lifecycle',orgArg);check(initial.state==='active','Preserved organization begins active');
const source=await ok(owner.c,'read_schedule',{target_schedule_id:schedule}),document=(Array.isArray(source)?source[0]:source).document,sourceVersion=Number(sql(`select document_version from public.schedules where id='${schedule}';`));
await ok(owner.c,'mutate_schedule_template',{request_id:randomUUID(),target_template_id:template,target_production_id:prod,expected_version:0,operation:'create',next_name:'Fictional B10-B template '+template,next_rows:document.rows,source_schedule_id:schedule,source_version:sourceVersion});
await ok(owner.c,'save_snapshot_policy',{...orgArg,request_id:randomUUID(),expected_version:(await ok(owner.c,'read_snapshot_policy',orgArg)).version,retention_days:1,trash_min_role:'organizer'});
function preservation(){return sql(`select jsonb_build_object('members',(select jsonb_agg(to_jsonb(x) order by id) from public.organization_memberships x where organization_id='${org}'),'production_members',(select jsonb_agg(to_jsonb(x) order by id) from public.production_memberships x where organization_id='${org}'),'restrictions',(select jsonb_agg(to_jsonb(x) order by id) from public.schedule_restrictions x where organization_id='${org}'),'schedules',(select jsonb_agg(to_jsonb(x) order by id) from public.schedules x where organization_id='${org}'),'history',(select jsonb_agg(to_jsonb(x) order by id) from public.schedule_versions x where organization_id='${org}'),'snapshots',(select jsonb_agg(to_jsonb(x) order by id) from private.schedule_snapshots x where organization_id='${org}'),'invitations',(select jsonb_agg(to_jsonb(x) order by id) from public.organization_invitations x where organization_id='${org}'));`);}
const baseline=preservation(),request={...orgArg,request_id:randomUUID(),expected_version:initial.version,confirmed:true};
check((await leader.c.rpc('request_organization_deletion',request)).status===404,'Admin cannot request organization deletion');
check((await owner.c.rpc('request_organization_deletion',{...request,confirmed:false})).status===400,'Explicit organization confirmation required');
check((await owner.c.from('organizations').update({deleted_at:new Date().toISOString()}).eq('id',org)).error!==null,'Broad settings policy cannot directly change deletion field');
const requested=await ok(owner.c,'request_organization_deletion',request);check(requested.version===initial.version+1,'Super Admin requests versioned deletion window');
const pending=await ok(owner.c,'read_organization_lifecycle',orgArg),deadline=pending.cancel_before;
check(pending.state==='pending_deletion'&&pending.read_only&&pending.can_cancel,'Request immediately enters read-only window');
check(sql(`select extract(epoch from cancel_before-requested_at)::bigint from private.organization_lifecycle where organization_id='${org}';`)==='2592000','Database sets exactly 30 days');
check(JSON.stringify(await ok(owner.c,'request_organization_deletion',request))===JSON.stringify(requested)&&(await ok(owner.c,'read_organization_lifecycle',orgArg)).cancel_before===deadline,'Exact retry does not extend the window');
check((await peer.c.rpc('request_organization_deletion',request)).status===409,'Receipt is actor-bound');
check((await owner.c.rpc('request_organization_deletion',{...request,request_id:randomUUID()})).status===409,'Stale lifecycle revision conflicts');
check((await ok(reader.c,'read_organization_lifecycle',orgArg)).cancel_before===null,'Ordinary reader gets read-only status without cancellation authority/deadline');
check(!!(await ok(reader.c,'read_schedule',{target_schedule_id:schedule})),'Existing allowed read stays available');
check((await ok(owner.c,'schedule_capability',{action:'export',target_production_id:prod,target_schedule_id:schedule}))===true,'Existing owner export remains allowed');
check((await ok(reader.c,'schedule_capability',{action:'export',target_production_id:prod,target_schedule_id:schedule}))===false,'Independent export denial stays effective');
check((await suspended.c.rpc('read_schedule',{target_schedule_id:schedule})).error!==null,'Suspended member remains denied');
check((await ok(reader.c,'read_organization_presentation',{target_organization_id:other})).version===0,'Other organization remains available');
check(!!(await ok(owner.c,'get_my_mfa_status')),'Account security stays available');
check(!!(await ok(owner.c,'review_schedule_template_export',{target_template_id:template,target_schedule_id:schedule})),'Read/export-only template review works while writes pause');
check((await owner.c.rpc('review_schedule_template_apply',{target_template_id:template,target_schedule_id:schedule})).error!==null,'Template Apply remains denied while read-only');
async function frozen(name:string,args:Record<string,unknown>,label:string){const r=await owner.c.rpc(name,args);check([423,404].includes(r.status),label+' (HTTP '+r.status+')');}
await frozen('update_schedule_document',{target_schedule_id:schedule,expected_version:sourceVersion,next_document:document,schema_version:1},'Schedule save paused');
await frozen('mutate_schedule',{target_schedule_id:schedule,expected_version:sourceVersion,operation:'archive',payload:{}},'Schedule lifecycle writes paused');
await frozen('create_schedule_in_production',{target_schedule_id:randomUUID(),target_production_id:prod,target_day_id:null,target_phase_id:null,next_display_name:'Blocked',next_slug:'blocked',next_document:document,schema_version:1},'Schedule creation/import destination paused');
await frozen('copy_schedule_to_production',{target_schedule_id:randomUUID(),source_schedule_id:schedule,source_version:sourceVersion,source_policy:'test',target_production_id:otherProd,target_day_id:null,target_phase_id:null,next_display_name:'Blocked copy',next_slug:'blocked-copy',next_document:document,schema_version:1},'Cross-organization copy checks frozen source');
await frozen('request_schedule_transfer',{request_id:randomUUID(),target_schedule_id:schedule,target_production_id:otherProd,expected_version:sourceVersion,expected_policy:'test'},'Transfer request checks frozen source');
await frozen('mutate_schedule_snapshot',{request_id:randomUUID(),target_snapshot_id:randomUUID(),target_schedule_id:schedule,expected_version:0,operation:'capture',next_name:null,next_document:document,source_version:sourceVersion,automatic:true},'Automatic snapshot capture paused');
await frozen('mutate_schedule_snapshot',{request_id:randomUUID(),target_snapshot_id:snapshot,target_schedule_id:schedule,expected_version:1,operation:'purge',confirmed_purge:true},'Snapshot purge paused');
await frozen('expire_schedule_snapshots',{target_schedule_id:schedule},'Automatic snapshot retention paused');
check((await ok(owner.c,'list_schedule_snapshots',{target_schedule_id:schedule})).length>0,'Snapshot history read remains available');
await frozen('mutate_schedule_template',{request_id:randomUUID(),target_template_id:template,target_production_id:prod,expected_version:1,operation:'rename',next_name:'Blocked'},'Template writes paused');
await frozen('save_organization_presentation',{...orgArg,request_id:randomUUID(),expected_version:0,next_config:{}},'Organization presentation writes paused');
await frozen('assign_production_role',{target_production_id:prod,target_user_id:reader.id,next_role:'viewer'},'Role assignment paused');
await frozen('set_schedule_restriction',{target_id:randomUUID(),...orgArg,target_production_id:null,target_schedule_id:null,subject_role:'everyone',subject_user_id:null,denied_actions:['edit'],expected_revision:0},'Permission restriction writes paused');
await frozen('set_organization_member_status',{...orgArg,target_membership_id:fixture.membership,expected_revision:1,request_id:randomUUID(),next_status:'suspended',confirmed:true,reason:'Must stay frozen'},'Ordinary membership status writes paused');
check((await reader.c.rpc('accept_organization_invitation',{invitation_id:invitation})).status===423,'Invitation acceptance paused without membership changes');
const hierarchy=(await owner.c.from('productions').update({name:'Blocked hierarchy'}).eq('id',prod).select('id'));check((!hierarchy.error&&hierarchy.data?.length===0)||(!!hierarchy.error&&['PT423','42501'].includes(hierarchy.error.code)),'Direct hierarchy write denied or filtered by RLS');
const serviceWrite=(await admin.from('schedules').update({display_name:'Blocked trusted update'}).eq('id',schedule));check(!!serviceWrite.error&&['PT423','42501'].includes(serviceWrite.error.code),'Service Data API write cannot bypass freeze');
let directGuard=false;try{sql(`update public.productions set name=name where id='${prod}';`);}catch(e){directGuard=e instanceof Error&&e.message==='Organization read only';}check(directGuard,'Privileged direct SQL also hits the shared frozen-write guard');
const coverage=sql("select count(*) from pg_trigger where tgname='a_organization_writable' and tgenabled='O' and (tgtype & 28)=28;");check(coverage==='23','Shared INSERT/UPDATE/DELETE guard installed across all 23 inventoried write tables including related imports');
check(preservation()===baseline,'Read-only operations preserve schedules/history, snapshots, roles, restrictions and invitations');
const ownerCount=sql(`select count(*) from public.organization_memberships where organization_id='${org}' and role='owner' and status in ('active','suspended');`);
check(sql(`select count(*) from private.administration_notification_outbox where event_id='${request.request_id}';`)===ownerCount,'Request queues exactly one notice for every Super Admin');
const cancel={...orgArg,request_id:randomUUID(),expected_version:requested.version};
check((await leader.c.rpc('cancel_organization_deletion',cancel)).status===404,'Ordinary Admin cannot cancel');
const cancelled=await ok(peer.c,'cancel_organization_deletion',cancel);check(cancelled.version===requested.version+1,'Different active Super Admin cancels despite retained ordinary permission restriction');
check((await ok(owner.c,'read_organization_lifecycle',orgArg)).state==='active'&&preservation()===baseline,'Cancellation restores active organization without reinstating or changing permissions/data');
check(JSON.stringify(await ok(peer.c,'cancel_organization_deletion',cancel))===JSON.stringify(cancelled),'Exact cancellation retry returns original receipt');
check((await ok(owner.c,'schedule_capability',{action:'edit',target_production_id:prod,target_schedule_id:schedule}))===true,'Ordinary authorized editing resumes after cancellation');
// A controlled deadline uses real database time; there is no runtime clock override/backdoor.
const request2={...request,request_id:randomUUID(),expected_version:cancelled.version};const r2=await ok(owner.c,'request_organization_deletion',request2);
sql(`update private.organization_lifecycle set requested_at=statement_timestamp()-interval '30 days',cancel_before=statement_timestamp() where organization_id='${org}';`);
check((await ok(owner.c,'read_organization_lifecycle',orgArg)).state==='awaiting_purge','At/past deadline derives awaiting purge');
check((await peer.c.rpc('cancel_organization_deletion',{...cancel,request_id:randomUUID(),expected_version:r2.version})).status===409,'Cancellation at or after deadline denied');
check(preservation()===baseline&&sql(`select deleted_at is null from public.organizations where id='${org}';`)==='t','Deadline performs no physical or soft deletion');
// Restore only the fictional lifecycle deadline for browser acceptance; no product clock control exists.
sql(`update private.organization_lifecycle set requested_at=statement_timestamp(),cancel_before=statement_timestamp()+interval '30 days' where organization_id='${org}';`);
const restored=await ok(peer.c,'cancel_organization_deletion',{...cancel,request_id:randomUUID(),expected_version:r2.version});
writeFileSync('/private/tmp/roseland-b10b-fixtures.json',JSON.stringify({project,organization:org,schedule,production:prod,template,snapshot,version:restored.version,requestEvent:request.request_id,cancelEvent:cancel.request_id,owner:fixture.owner,admin:fixture.admin,peer:{id:peer.id,email:peer.email,password:peer.password,factor:peerFactor},ownerCount:Number(ownerCount)}),{mode:0o600});
console.log(`PASS ${count} focused B10-B assertions; private fixture saved.`);
