import { createLifecycleRepository } from '../lib/platform/schedule-lifecycle-repository.ts';
import { ScheduleLifecycleController } from '../lib/platform/schedule-lifecycle-controller.ts';
import { documentFixture } from '../tests/fixtures/document-fixtures.ts';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const args = process.argv.slice(2);
const workdir = args[args.indexOf('--workdir') + 1];
ensure(args.includes('--workdir') && workdir, 'Specify a disposable local --workdir');
ensure(!existsSync(resolve(workdir, 'supabase/.temp/project-ref')), 'Linked projects are not disposable runtime targets');
const config = readFileSync(resolve(workdir, 'supabase/config.toml'), 'utf8');
const project = config.match(/^project_id\s*=\s*"([\w-]+)"/m)?.[1];
ensure(project, 'Local project ID is required');
const container = `supabase_db_${project}`;
const info = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0];
ensure(info.Name === `/${container}` && info.Config.Image.includes('supabase/postgres'), 'Expected local Supabase container');
function localStatus() {
  try {
    return JSON.parse(execFileSync(resolve('node_modules/.bin/supabase'), ['status', '--workdir', resolve(workdir), '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch { throw new Error('Local runtime status unavailable'); } // Never print key-bearing CLI output.
}
const status = localStatus();
const base = new URL(status.API_URL);
const configuredPort = config.match(/\[api\][\s\S]*?\nport\s*=\s*(\d+)/)?.[1];
ensure(base.protocol === 'http:' && ['127.0.0.1','localhost'].includes(base.hostname)
  && base.port === configuredPort && !base.username && !base.password, 'Only the configured loopback API is permitted');
const key = status.ANON_KEY;
ensure(typeof key === 'string' && key.length > 0, 'Local anonymous API key unavailable');

const guardedFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  ensure(url.origin === base.origin, 'Non-local request refused');
  const response = await fetch(url, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
  return response;
};
const clients: SupabaseClient[] = [];
function client() {
  const value = createClient(base.origin, key, { global: { fetch: guardedFetch }, auth: {
    persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
  } });
  clients.push(value);
  return value;
}
function sql(statement: string): string {
  // Admin SQL sets up fictional actors/data only. Exercised schedule calls use
  // genuine password sessions and the existing session admission/RLS contract.
  try {
    return execFileSync('docker', ['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'], {
      input: statement, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], timeout: 15000,
    }).trim();
  } catch { throw new Error('Local fixture SQL failed'); }
}
async function identity(label: string) {
  const c = client();
  const email = `auth-${label}-${randomUUID()}@example.test`;
  const password = `Local-${randomBytes(24).toString('hex')}-9aA`;
  const signup = await c.auth.signUp({ email, password });
  ensure(!signup.error && signup.data.user, 'Local synthetic signup failed');
  const id = signup.data.user.id;
  ensure(/^[0-9a-f-]{36}$/.test(id), 'Unexpected synthetic user ID');
  await c.auth.signOut();
  const login = await c.auth.signInWithPassword({ email, password });
  ensure(!login.error && login.data.session && login.data.user.id === id, 'Password login failed');
  const verified = await c.auth.getUser();
  ensure(!verified.error && verified.data.user.id === id, 'Auth could not verify the login-issued session');
  return { c, id, email, password };
}

ensure(project==='roseland-b03-20260917','Only the new named B03 fixture stack is allowed');
let passed=0;
function check(value:unknown,label:string){ensure(value,label);passed++;console.log('PASS '+label);}
async function denied(operation:()=>PromiseLike<{error:unknown}>,label:string){const r=await operation();check(!!r.error,label);}
try {
 const owner=await identity('b03-owner'),admin=await identity('b03-admin'),organizer=await identity('b03-organizer'),editor=await identity('b03-editor'),viewer=await identity('b03-viewer'),outsider=await identity('b03-outsider');
 const org=randomUUID(),prod=randomUUID(),day=randomUUID(),schedule=randomUUID();
 sql(`begin; insert into public.organizations(id,name,slug) values('${org}','B03 Fictional Studio','b03-${org}');
 insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
 ('${org}','${owner.id}','owner','active',now()),('${org}','${admin.id}','admin','active',now()),
 ('${org}','${organizer.id}','member','active',now()),('${org}','${editor.id}','member','active',now()),('${org}','${viewer.id}','member','active',now());
 insert into public.productions(id,organization_id,name,slug) values('${prod}','${org}','B03 Fictional Production','b03-${prod}');
 insert into public.production_days(id,organization_id,production_id,position,created_by,updated_by) values('${day}','${org}','${prod}',0,'${owner.id}','${owner.id}');
 insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at) values
 ('${org}','${prod}','${organizer.id}','organizer','active',now()),('${org}','${prod}','${editor.id}','editor','active',now()),('${org}','${prod}','${viewer.id}','viewer','active',now()); commit;`);
 const createArgs={target_schedule_id:schedule,target_day_id:day,next_display_name:'Fictional rehearsal',next_slug:'fictional-rehearsal',next_document:documentFixture(),schema_version:1};
 await denied(()=>editor.c.rpc('create_schedule',createArgs),'Editor cannot create');
 const created=await organizer.c.rpc('create_schedule',createArgs);ensure(!created.error,JSON.stringify(created.error));check(created.data.document_version===1,'Organizer creates without permission setup');
 const updateArgs={target_schedule_id:schedule,expected_version:1,next_document:documentFixture(2),schema_version:1};
 await denied(()=>viewer.c.rpc('update_schedule_document',updateArgs),'Viewer cannot save');
 const updated=await editor.c.rpc('update_schedule_document',updateArgs);ensure(!updated.error,JSON.stringify(updated.error));check(updated.data.document_version===2,'Editor saves existing document');
 await denied(()=>editor.c.rpc('mutate_schedule',{target_schedule_id:schedule,expected_version:2,operation:'rename',payload:{display_name:'No',slug:'no'}}),'Editor cannot rename');
 await denied(()=>editor.c.rpc('mutate_schedule',{target_schedule_id:schedule,expected_version:2,operation:'archive',payload:{}}),'Editor cannot archive');
 const restore=await editor.c.rpc('mutate_schedule',{target_schedule_id:schedule,expected_version:2,operation:'restore_version',payload:{version:1}});ensure(!restore.error,JSON.stringify(restore.error));check(restore.data.document_version===3,'Editor restores document version');
 const del=await organizer.c.rpc('mutate_schedule',{target_schedule_id:schedule,expected_version:3,operation:'delete',payload:{}});ensure(!del.error,JSON.stringify(del.error));check(!!del.data.deleted_at,'Organizer soft deletes');
 check((await editor.c.from('schedules').select('id').eq('id',schedule)).data?.length===0,'Editor cannot list Trash');
 const trash=await organizer.c.rpc('read_deleted_schedule',{target_schedule_id:schedule});ensure(!trash.error,JSON.stringify(trash.error));check(trash.data.id===schedule,'Organizer reads recoverable Trash');
 const recovered=await organizer.c.rpc('mutate_schedule',{target_schedule_id:schedule,expected_version:4,operation:'restore',payload:{}});ensure(!recovered.error,JSON.stringify(recovered.error));check(recovered.data.document_version===5&&!recovered.data.deleted_at,'Organizer restores identity and history');
 const policy={target_id:randomUUID(),target_organization_id:org,target_production_id:prod,target_schedule_id:schedule,subject_role:'admin',subject_user_id:null,denied_actions:['read'],expected_revision:0};
 const restriction=await owner.c.rpc('set_schedule_restriction',policy);ensure(!restriction.error,JSON.stringify(restriction.error));check(restriction.data.revision===1,'Super Admin sets individual schedule bounds on Admin');
 check((await admin.c.from('schedules').select('id').eq('id',schedule)).data?.length===0,'Admin cannot discover restricted schedule');
 check((await admin.c.from('schedule_versions').select('version').eq('schedule_id',schedule)).data?.length===0,'Admin cannot read restricted history');
 await denied(()=>admin.c.rpc('update_schedule_document',{...updateArgs,expected_version:5}),'Admin cannot bypass restriction via definer save RPC');
 await denied(()=>admin.c.rpc('set_schedule_restriction',{...policy,expected_revision:1,denied_actions:[]}),'Admin cannot remove Super Admin bound');
 const settings=await admin.c.rpc('read_schedule_permissions',{target_organization_id:org,target_production_id:prod,target_schedule_id:schedule});ensure(!settings.error,JSON.stringify(settings.error));check(settings.data.effective.read===false&&settings.data.effective.permissions===true,'Policy administration does not grant document access');
 await denied(()=>outsider.c.rpc('read_schedule_permissions',{target_organization_id:org}),'Outside actor cannot inspect policy');
 const editPolicy={...policy,target_id:randomUUID(),subject_role:'editor',target_production_id:null,target_schedule_id:null,denied_actions:['edit']};
 const ep=await admin.c.rpc('set_schedule_restriction',editPolicy);ensure(!ep.error,JSON.stringify(ep.error));check(ep.data.revision===1,'Admin restricts Editor within owner bounds');
 await denied(()=>editor.c.rpc('update_schedule_document',{...updateArgs,expected_version:5}),'Inherited organization restriction blocks save');
 await denied(()=>admin.c.rpc('set_schedule_restriction',{...editPolicy,expected_revision:0,denied_actions:['read']}),'Stale policy revision is rejected');
 const clear=await admin.c.rpc('set_schedule_restriction',{...editPolicy,expected_revision:1,denied_actions:[]});ensure(!clear.error,JSON.stringify(clear.error));check(clear.data.removed===true,'Explicit policy clears to inherited Standard');
 const assigned=await owner.c.rpc('assign_production_role',{target_production_id:prod,target_user_id:viewer.id,next_role:'organizer'});ensure(!assigned.error,JSON.stringify(assigned.error));check((await viewer.c.rpc('schedule_capability',{action:'create',target_production_id:prod})).data===true,'Leadership explicitly assigns Organizer');
 check((await editor.c.rpc('schedule_capability',{action:'create',target_production_id:prod})).data===false,'Existing Editor is not automatically promoted');

 const retained={...policy,target_id:randomUUID(),subject_role:null,subject_user_id:editor.id,denied_actions:['read','export']};
 const retain=await owner.c.rpc('set_schedule_restriction',retained);ensure(!retain.error,JSON.stringify(retain.error));
 const stamp=await organizer.c.rpc('schedule_copy_policy',{target_schedule_id:schedule});ensure(!stamp.error,JSON.stringify(stamp.error));
 const copyId=randomUUID(),copyArgs={...createArgs,target_schedule_id:copyId,next_slug:'copy-'+copyId,next_display_name:'Independent fictional copy',source_schedule_id:schedule,source_version:5,source_policy:stamp.data};
 const copied=await organizer.c.rpc('copy_schedule',copyArgs);ensure(!copied.error,JSON.stringify(copied.error));
 check(copied.data.document_version===1&&copied.data.id!==schedule,'Copy creates one independent identity');
 check(sql(`select count(*) from public.schedule_restrictions where schedule_id='${copyId}'`)==='2','Copy atomically retains both explicit source restrictions');
 check((await editor.c.from('schedules').select('id').eq('id',copyId)).data?.length===0,'Copied individual restriction denies original subject');
 check((await admin.c.from('schedules').select('id').eq('id',copyId)).data?.length===0,'Copied Super Admin restriction still binds Admin');
 check(sql(`select document_version from public.schedules where id='${schedule}'`)==='5','Copy leaves source version unchanged');
 const noHistory={...policy,target_id:randomUUID(),target_schedule_id:copyId,subject_role:'organizer',denied_actions:['history']};
 const noHist=await owner.c.rpc('set_schedule_restriction',noHistory);ensure(!noHist.error,JSON.stringify(noHist.error));
 check((await organizer.c.from('schedule_versions').select('version').eq('schedule_id',copyId)).data?.length===0,'Copy history restriction is effective');
 const {schema_version:_schema,...receiptArgs}=copyArgs;
 check((await organizer.c.rpc('check_schedule_copy',receiptArgs)).data===true,'Lost copy acknowledgement has exact receipt without history access');
 check((await organizer.c.rpc('check_schedule_copy',{...receiptArgs,next_display_name:'Other'})).data===false,'Receipt rejects mismatched captured copy');
 check((await admin.c.rpc('check_schedule_copy',receiptArgs)).data===false,'Receipt reveals nothing to restricted noncreator');
 const transport=createLifecycleRepository(organizer.c),operation=new ScheduleLifecycleController(),lostId=randomUUID(),binding={id:schedule,version:5,policy:stamp.data};
 operation.bind(organizer.id);operation.prepareCreate(org,lostId,day,'Lost response copy','lost-'+lostId,createArgs.next_document);
 await operation.execute({...transport,send:async attempt=>{await transport.send(attempt,binding);throw Error('Fictional response loss');},probe:attempt=>transport.probe(attempt,binding)});
 check(operation.phase==='uncertain','Real copy with discarded acknowledgement retains an uncertain request');
 const deniedHistory=await owner.c.rpc('set_schedule_restriction',{...noHistory,target_id:randomUUID(),target_schedule_id:lostId});ensure(!deniedHistory.error,JSON.stringify(deniedHistory.error));
 await operation.execute({...transport,send:attempt=>transport.send(attempt,binding),probe:attempt=>transport.probe(attempt,binding)});
 check(String(operation.phase)==='success'&&operation.result?.matchedVersion===1,'Retry recovers exact copy without history or duplicate creation');
 check(sql(`select count(*) from public.schedule_versions where schedule_id='${lostId}'`)==='1','Copy recovery creates no extra document or version');


 const staleId=randomUUID();await denied(()=>organizer.c.rpc('copy_schedule',{...copyArgs,target_schedule_id:staleId,next_slug:'stale-'+staleId,source_policy:'stale'}),'Stale copy policy cannot be submitted');
 check(sql(`select count(*) from public.schedules where id='${staleId}'`)==='0','Rejected copy leaves no partial schedule');
 const hierarchy=await owner.c.rpc('schedule_permission_directory',{target_organization_id:org});ensure(!hierarchy.error,JSON.stringify(hierarchy.error));check(hierarchy.data.members.length===5&&hierarchy.data.schedules.length===3,'Permission Settings returns scoped fictional choices');
 const destDeny={...policy,target_id:randomUUID(),target_schedule_id:null,subject_role:'organizer',denied_actions:['edit']};
 const destRestriction=await owner.c.rpc('set_schedule_restriction',destDeny);ensure(!destRestriction.error,JSON.stringify(destRestriction.error));
 const freshStamp=await organizer.c.rpc('schedule_copy_policy',{target_schedule_id:schedule});ensure(!freshStamp.error,JSON.stringify(freshStamp.error));
 const blockedCopy=randomUUID();await denied(()=>organizer.c.rpc('copy_schedule',{...copyArgs,target_schedule_id:blockedCopy,next_slug:'blocked-'+blockedCopy,source_policy:freshStamp.data}),'Destination bounds block an uneditable copy');
 check(sql(`select count(*) from public.schedules where id='${blockedCopy}'`)==='0','Failed policy combination rolls back document and history');
 const cleared=await owner.c.rpc('set_schedule_restriction',{...destDeny,expected_revision:1,denied_actions:[]});ensure(!cleared.error,JSON.stringify(cleared.error));
 const prodRestriction=await owner.c.rpc('set_schedule_restriction',{...policy,target_id:randomUUID(),target_schedule_id:null,subject_role:'organizer',denied_actions:['organize']});ensure(!prodRestriction.error,JSON.stringify(prodRestriction.error));
 await denied(()=>organizer.c.rpc('mutate_schedule',{target_schedule_id:schedule,expected_version:5,operation:'archive',payload:{}}),'Inherited production bound blocks Organizer archive');
 check(sql(`select count(*) from public.schedule_versions where schedule_id='${schedule}'`)==='5','Denied mutations append no history');

 // Hold a new restriction uncommitted. The genuine API save waits for admission,
 // then sees the committed bound; it must not use its earlier request snapshot.
 const heldId=randomUUID();
 const hold=spawn('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{stdio:['pipe','pipe','pipe']});
 let heldOutput='';const policyHeld=new Promise<void>((resolve,reject)=>{hold.stdout.on('data',chunk=>{heldOutput+=chunk.toString();if(heldOutput.includes('B03_POLICY_HELD'))resolve();});hold.on('error',reject);hold.on('exit',code=>{if(code!==0)reject(Error('Fictional lock setup failed'));});});
 hold.stdin.end(`begin;select pg_advisory_xact_lock(hashtextextended('schedule-policy:${org}',0));
 insert into public.schedule_restrictions(id,organization_id,production_id,schedule_id,subject_user_id,denied_actions,authority,created_by)
 values('${heldId}','${org}','${prod}','${schedule}','${organizer.id}',array['edit'],'owner','${owner.id}');
 select 'B03_POLICY_HELD';select pg_sleep(1);commit;`);
 await policyHeld;
 await denied(()=>organizer.c.rpc('update_schedule_document',{...updateArgs,expected_version:5}),'Save waiting for admission honors newly committed restriction');
 check(sql(`select document_version from public.schedules where id='${schedule}'`)==='5','Blocked concurrent save changes neither version nor history');
 const removedHeld=await owner.c.rpc('set_schedule_restriction',{...policy,target_id:heldId,subject_role:null,subject_user_id:organizer.id,denied_actions:[],expected_revision:1});ensure(!removedHeld.error,JSON.stringify(removedHeld.error));
 // A genuinely admitted write may finish before the later policy change.
 sql(`create function private.b03_hold_write() returns trigger language plpgsql set search_path='' as $$begin if new.id='${schedule}'::uuid then perform pg_sleep(1.5);end if;return new;end;$$;
 create trigger b03_hold_write after update on public.schedules for each row execute function private.b03_hold_write();`);
 try {
  const committing=Promise.resolve(organizer.c.rpc('update_schedule_document',{...updateArgs,expected_version:5}));
  let admitted=false;for(let i=0;i<30;i++){if(sql("select count(*) from pg_stat_activity where wait_event='PgSleep' and query like '%update_schedule_document%'")!=='0'){admitted=true;break;}await new Promise(resolve=>setTimeout(resolve,50));}
  ensure(admitted,'Could not observe admitted fictional save');
  const afterId=randomUUID();const restricting=owner.c.rpc('set_schedule_restriction',{...policy,target_id:afterId,subject_role:null,subject_user_id:organizer.id,denied_actions:['edit']});
  const [saveResult,policyResult]=await Promise.all([committing,restricting]);ensure(!saveResult.error,JSON.stringify(saveResult.error));ensure(!policyResult.error,JSON.stringify(policyResult.error));
  check(saveResult.data.document_version===6,'Admitted save commits exactly once before later restriction');
  await denied(()=>organizer.c.rpc('update_schedule_document',{...updateArgs,expected_version:6}),'Next save is denied after policy tightening');
 } finally {sql('drop trigger b03_hold_write on public.schedules;drop function private.b03_hold_write();');}
 if(args.includes('--serve')){
  const fixture={project,org,prod,schedule,owner:{email:owner.email,password:owner.password},organizer:{email:organizer.email,password:organizer.password},editor:{email:editor.email,password:editor.password},admin:{email:admin.email,password:admin.password}};
  writeFileSync('/private/tmp/roseland-b03-browser-fixtures.json',JSON.stringify(fixture),{mode:0o600});
  console.log('Fictional browser fixture saved privately in /private/tmp/roseland-b03-browser-fixtures.json');
 }
 console.log(JSON.stringify({passed,scope:'B03 genuine fictional Auth and RLS foundation',project}));
} finally {for(const c of clients)await c.auth.signOut();}
