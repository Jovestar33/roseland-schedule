// Genuine local Auth -> user-session SDK -> PostgREST RPC -> PostgreSQL/RLS.
// Never accepts credentials or an arbitrary URL; discovers only the named local
// CLI project and refuses any non-loopback request. Synthetic fixtures remain in
// the disposable database; passwords/tokens exist only in memory.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createScheduleRepository, ScheduleRepositoryError } from '../lib/platform/schedule-repository.ts';
import { parseVerifiedJwtClaims } from '../lib/platform/contracts.ts';
import { serviceApiHeaders } from '../lib/platform/service-headers.ts';

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
const requests: { path: string; status: number }[] = [];
const guardedFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  ensure(url.origin === base.origin, 'Non-local request refused');
  const response = await fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
  requests.push({ path: url.pathname, status: response.status });
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
  // Admin SQL is used solely for generated fixture setup and history-failure
  // injection. All exercised reads/writes use actual login-issued user sessions.
  try {
    return execFileSync('docker', ['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'], {
      input: statement, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], timeout: 15000,
    }).trim();
  } catch { throw new Error('Local fixture SQL failed'); }
}
function pass(message: string) { console.log(`PASS: ${message}`); }
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
async function denied(action: () => Promise<unknown>, kind: string, http: number) {
  const start = requests.length;
  let error: unknown;
  try { await action(); } catch (caught) { error = caught; }
  ensure(error instanceof ScheduleRepositoryError && error.kind === kind, `Expected bounded ${kind} outcome`);
  ensure(requests.slice(start).some(r => r.status === http && r.path.startsWith('/rest/v1/')), `Expected HTTP ${http} from actual RPC`);
}

type Reply = { status: number; data: unknown };
async function api(token: string, path: string, method = 'GET', body?: unknown, extra: Record<string,string> = {}, apiKey = key): Promise<Reply> {
  try {
    const response = await guardedFetch(base.origin+'/rest/v1/'+path, {method,headers:{apikey:apiKey,...(token ? {authorization:`Bearer ${token}`} : {}),
      'content-type':'application/json',...extra},body:body === undefined ? undefined : JSON.stringify(body)});
    return {status:response.status,data:method === 'HEAD' || response.status === 204 ? null : await response.json()};
  } catch { return {status:0,data:null}; }
}
function claimsOf(token: string) { return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()) as {sub:string;session_id:string;exp:number}; }
async function graphql(token: string) {
  const response=await guardedFetch(base.origin+'/graphql/v1',{method:'POST',headers:{apikey:key,authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify({query:'{ __typename }'})});
  return {status:response.status,data:await response.json()};
}
async function login(email: string, password: string) {
  const c=client();const result=await c.auth.signInWithPassword({email,password});
  ensure(!result.error && result.data.session,'Genuine password session unavailable');
  const token=result.data.session.access_token; const claims=claimsOf(token);
  ensure(/^[a-f0-9-]{36}$/.test(claims.session_id),'Missing genuine session ID');
  return {c,token,claims};
}
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve,milliseconds));
async function lock(statement: string) {
  const child=spawn('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{stdio:['pipe','pipe','pipe']});
  let buffer='';let finished=false;
  const exit = new Promise<number|null>(resolve=>child.once('exit',resolve));
  child.stderr.on('data',()=>{}); // Bounded errors below; never echo SQL/connection state.
  const pid=await new Promise<number>((resolve,reject)=>{
    const timer=setTimeout(()=>{child.stdin.end('rollback;\n');reject(new Error('Local lock setup timed out'));},15000);
    child.once('exit',()=>{clearTimeout(timer);reject(new Error('Local lock setup failed'));});
    child.stdout.on('data',chunk=>{
      buffer+=chunk.toString();const match=buffer.match(/READY\|(\d+)/);
      if(match){clearTimeout(timer);resolve(Number(match[1]));}
    });
    child.stdin.write("begin; set local statement_timeout='25s'; "+statement+" select 'READY|'||pg_backend_pid();\n");
  });
  return {pid,async finish(commit:boolean){if(finished)return;finished=true;child.stdin.end((commit?'commit;':'rollback;')+'\n');ensure(await exit===0,'Local lock transaction failed');}};
}
async function waitBlocked(blocker:number, role?:string): Promise<number> {
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){
    const value=sql(`select pid from pg_stat_activity where ${blocker}=any(pg_blocking_pids(pid)) and wait_event_type='Lock' ${role?`and usename='${role}'`:''} limit 1;`);
    if(/^\d+$/.test(value))return Number(value);
    await delay(50);
  }
  throw new Error('Expected a real database lock wait');
}
function totp(secret:string) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
  for(const char of secret.toUpperCase().replace(/=+$/,'')){const value=alphabet.indexOf(char);ensure(value>=0,'Invalid local MFA fixture');bits+=value.toString(2).padStart(5,'0');}
  const bytes=Buffer.from(bits.match(/.{8}/g)!.map(value=>parseInt(value,2)));
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const hmac=createHmac('sha1',bytes).update(counter).digest();const offset=hmac[hmac.length-1]&15;
  return ((hmac.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}

try {
  const owner=await identity('admission-owner'); const outsider=await identity('admission-outsider'); const viewer=await identity('admission-viewer');
  const [org,prod,day,scheduleId]=Array.from({length:4},()=>randomUUID());
  sql(`begin;
    insert into public.organizations(id,name,slug) values('${org}','Fictional session admission','session-${org}');
    insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
      ('${org}','${owner.id}','owner','active',now()),('${org}','${viewer.id}','member','active',now());
    insert into public.productions(id,organization_id,name,slug) values('${prod}','${org}','Fictional session production','session');
    insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at) values('${org}','${prod}','${viewer.id}','viewer','active',now());
    insert into public.production_days(id,organization_id,production_id,position,created_by,updated_by) values('${day}','${org}','${prod}',0,'${owner.id}','${owner.id}');
    insert into public.schedules(id,organization_id,production_id,production_day_id,display_name,slug,created_by,updated_by) values
      ('${scheduleId}','${org}','${prod}','${day}','Fictional session schedule','session','${owner.id}','${owner.id}'); commit;`);
  const token=(await owner.c.auth.getSession()).data.session!.access_token;
  const actor=claimsOf(token);
  const tables=['profiles','organizations','organization_memberships','productions','production_memberships','phases','production_days','schedules','schedule_versions','organization_invitations','audit_events'];
  const routes: Array<[string,Record<string,unknown>]>=[
    ['is_active_org_member',{target_organization_id:org}],['is_org_admin',{target_organization_id:org}],
    ['can_access_production',{target_production_id:prod}],['can_edit_production',{target_production_id:prod}],
    ['accept_organization_invitation',{invitation_id:randomUUID()}],['get_my_invitation_acceptance',{invitation_id:randomUUID()}],['read_schedule',{target_schedule_id:scheduleId}],
    ['read_deleted_schedule',{target_schedule_id:scheduleId}],['create_schedule',{target_schedule_id:randomUUID(),target_day_id:day,next_display_name:'Never created',next_slug:'never-created',next_document:{meta:{},rows:[]},schema_version:1}],
    ['mutate_schedule',{target_schedule_id:scheduleId,expected_version:1,operation:'archive',payload:{}}],
    ['update_schedule_document',{target_schedule_id:scheduleId,expected_version:1,next_document:{meta:{},rows:[]},schema_version:1}],
    ['session_list_schedules',{}],['session_read_schedule',{target_schedule_id:scheduleId}],
    ['session_update_schedule_document',{target_schedule_id:scheduleId,expected_version:1,next_document:{meta:{},rows:[]},schema_version:1}],
    ['require_active_schedule_session',{}],['check_application_session',{}],
  ];
  const exposed=sql(`select string_agg(p.proname,',' order by p.proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prorettype<>'trigger'::regtype and has_function_privilege('authenticated',p.oid,'EXECUTE');`);
  ensure(exposed===routes.map(([name])=>name).sort().join(','),'Authenticated function inventory changed; extend admission coverage');
  const graph=await graphql(token);
  const graphqlEnabled=sql("select exists(select 1 from pg_extension where extname='pg_graphql');")==='t';
  ensure(graph.status===200 && (graphqlEnabled ? typeof graph.data.data?.__typename==='string' : Array.isArray(graph.data.errors)),
    'Valid session did not reach the existing GraphQL gateway');
  ensure((await api(token,'rpc/graphql','POST',{query:'{ __typename }'},{'content-profile':'graphql_public'})).status===200,'Valid alternate-schema RPC failed');
  for(const table of tables)ensure((await api(token,table+'?select=*&limit=1')).status===200,'Valid table GET failed: '+table);
  ensure((await api(token,'profiles?user_id=eq.'+owner.id,'PATCH',{display_name:'Fictional session owner'})).status===204,'Valid profile update failed');
  const foreignToken=(await outsider.c.auth.getSession()).data.session!.access_token;
  const hidden=await api(foreignToken,'schedules?id=eq.'+scheduleId);
  ensure(hidden.status===200 && Array.isArray(hidden.data) && hidden.data.length===0,'Cross-tenant RLS boundary failed');
  await denied(()=>createScheduleRepository(viewer.c).update(scheduleId,1,{meta:{},rows:[]},1),'unavailable',404);
  pass('11 direct table GETs and normal profile update work; tenant/viewer rules remain enforced');
  async function assertBlocked(retained:string,label:string) {
    for(const table of tables)for(const method of ['GET','HEAD','POST','PATCH','DELETE']) {
      ensure((await api(retained,table,method,['POST','PATCH'].includes(method)?{}:undefined)).status===401,label+' leaked through '+method+' '+table);
    }
    for(const [name,payload] of routes)ensure((await api(retained,'rpc/'+name,'POST',payload)).status===401,label+' bypassed RPC '+name);
    ensure((await api(retained,'profiles?user_id=eq.'+owner.id,'PATCH',{display_name:'Must not persist'})).status===401,label+' profile write bypass');
    ensure((await api(retained,'schedules?id=eq.'+scheduleId,'HEAD')).status===401,label+' HEAD bypass');
    ensure((await api(retained,'rpc/read_schedule?target_schedule_id='+scheduleId)).status===401,label+' GET RPC bypass');
    ensure((await api(retained,'rpc/get_my_invitation_acceptance?invitation_id='+randomUUID())).status===401,label+' receipt GET bypass');
    ensure((await graphql(retained)).status===401,label+' GraphQL gateway bypass');
    ensure((await api(retained,'rpc/graphql','POST',{query:'{ __typename }'},{'content-profile':'graphql_public'})).status===401,label+' alternate-schema RPC bypass');
  }
  sql(`update auth.sessions set not_after=now()-interval '1 second' where id='${actor.session_id}';`);
  await assertBlocked(token,'Expired session');
  sql(`update auth.sessions set not_after=null where id='${actor.session_id}';`);
  ensure(!(await owner.c.auth.signOut({scope:'local'})).error,'Genuine sign-out failed');
  await assertBlocked(token,'Revoked session');
  ensure(sql(`select document_version from public.schedules where id='${scheduleId}';`)==='1','Blocked endpoints mutated schedule');
  pass('expired sessions and retained tokens after real sign-out denied on all 16 authenticated RPCs, all 11 table routes across five HTTP methods, and GET RPC');
  pass('GraphQL gateway and alternate graphql_public RPC also reject expired/revoked sessions; extension '+(graphqlEnabled?'enabled':'not enabled (route admission only)'));

  const [raceDay,raceSchedule]=[randomUUID(),randomUUID()];
  sql(`insert into public.production_days(id,organization_id,production_id,position,created_by,updated_by) values('${raceDay}','${org}','${prod}',1,'${owner.id}','${owner.id}');`);
  let version=1;
  sql(`insert into public.schedules(id,organization_id,production_id,production_day_id,display_name,slug,created_by,updated_by) values('${raceSchedule}','${org}','${prod}','${raceDay}','Fictional race schedule','race','${owner.id}','${owner.id}');`);
  const update=(sessionToken:string)=>api(sessionToken,'rpc/update_schedule_document','POST',{
    target_schedule_id:raceSchedule,expected_version:version,next_document:{meta:{town:'Fictional admitted write'},rows:[]},schema_version:1});
  for(const kind of ['revoke-commit','revoke-rollback','expiry-commit','expiry-rollback','clock-expiry-while-waiting']){
    const session=await login(owner.email,owner.password);const sid=session.claims.session_id;
    if(kind==='clock-expiry-while-waiting')sql(`update auth.sessions set not_after=now()+interval '2 seconds' where id='${sid}';`);
    const statement=kind.startsWith('revoke')?`delete from auth.sessions where id='${sid}';`
      :kind.startsWith('expiry')?`update auth.sessions set not_after=now()-interval '1 second' where id='${sid}';`
      :`select id from auth.sessions where id='${sid}' for update;`;
    const blocker=await lock(statement);
    try {
      const pending=update(session.token);await waitBlocked(blocker.pid);
      if(kind==='clock-expiry-while-waiting')while(sql(`select not_after<=clock_timestamp() from auth.sessions where id='${sid}';`)!=='t')await delay(50);
      await blocker.finish(!kind.endsWith('rollback'));
      const reply=await pending; const succeeds=kind.endsWith('rollback');
      ensure(reply.status===(succeeds?200:401),'Unexpected race result: '+kind);
      if(succeeds)version++;
      ensure(sql(`select document_version::text||'/'||(select count(*) from public.schedule_versions v where v.schedule_id=s.id)::text from public.schedules s where id='${raceSchedule}';`)===`${version}/${version}`,'Race corrupted version/history');
      pass(kind+': genuine session, observed lock wait, expected admission and unchanged/atomic history');
    } finally {await blocker.finish(false);}
  }
  // The Data API holds its session lock while waiting for the schedule row.
  // Real Auth sign-out must then wait for the admitted write to finish.
  const writer=await login(owner.email,owner.password);
  const rowLock=await lock(`select id from public.schedules where id='${raceSchedule}' for update;`);
  try {
    const pending=update(writer.token);const apiPid=await waitBlocked(rowLock.pid);
    const signingOut=writer.c.auth.signOut({scope:'local'});
    await waitBlocked(apiPid,'supabase_auth_admin');
    await rowLock.finish(true);
    ensure((await pending).status===200,'Admitted write failed');version++;
    ensure(!(await signingOut).error,'Genuine concurrent sign-out failed');
    ensure((await update(writer.token)).status===401,'Write after completed sign-out succeeded');
    pass('write-first: genuine Auth sign-out waits for the admitted atomic write, then rejects retained token');
  } finally {await rowLock.finish(false);}
  // Read-only admission has snapshot semantics, deliberately no FOR SHARE.
  const reader=await login(owner.email,owner.password);
  const readBlocker=await lock(`delete from auth.sessions where id='${reader.claims.session_id}';`);
  try {
    ensure((await api(reader.token,'schedules?id=eq.'+raceSchedule)).status===200,'Previously committed session could not admit read');
    await readBlocker.finish(true);
    ensure((await api(reader.token,'schedules?id=eq.'+raceSchedule)).status===401,'New read after revocation succeeded');
    pass('read admission: in-flight revocation does not cancel earlier reads; committed revocation blocks new reads');
  } finally {await readBlocker.finish(false);}

  // Genuine local MFA upgrades this fictional owner's session. No shared or
  // actual credential/factor is read, changed, written to disk or printed.
  const admin=await login(owner.email,owner.password);
  const enrolled=await admin.c.auth.mfa.enroll({factorType:'totp',friendlyName:'Fictional admission check'});
  ensure(!enrolled.error && enrolled.data.type==='totp','Fictional MFA enrollment failed');
  const mfa=await admin.c.auth.mfa.challengeAndVerify({factorId:enrolled.data.id,code:totp(enrolled.data.totp.secret)});
  ensure(!mfa.error,'Fictional MFA verification failed');
  const adminToken=(await admin.c.auth.getSession()).data.session!.access_token;
  ensure(!(await admin.c.auth.getUser()).error,'MFA session verification failed');
  const verified=parseVerifiedJwtClaims(adminToken,owner.id,base.origin+'/auth/v1',Math.floor(Date.now()/1000),1800);
  const actorHeaders={'x-actor-user-id':verified.userId,'x-actor-session-id':verified.sessionId,'x-actor-session-exp':String(verified.expiresAt)};
  const serviceKey=status.SERVICE_ROLE_KEY;ensure(typeof serviceKey==='string','Local trusted workflow key unavailable');
  const invitation={p_actor_user_id:owner.id,p_organization_id:org,p_email:`invited-${randomUUID()}@example.test`,p_organization_role:'member',p_production_id:null,p_production_role:null,
    p_expires_at:new Date(Date.now()+86400000).toISOString(),p_actor_aal:verified.aal,p_actor_authenticated_at:verified.authenticatedAt,p_request_id:randomUUID()};
  // Exercise the same key-format handling as the server transport.
  const service=(name:string,payload:unknown,headers:Record<string,string>=actorHeaders)=>api('','rpc/'+name,'POST',payload,{...serviceApiHeaders(serviceKey),...headers},serviceKey);
  ensure((await service('create_organization_invitation',invitation,{})).status===401,'Service workflow accepted missing actor-session binding');
  ensure((await service('create_organization_invitation',invitation,{...actorHeaders,'x-actor-user-id':outsider.id})).status===401,'Service workflow accepted another actor session');
  const created=await service('create_organization_invitation',invitation);
  ensure(created.status===200 && typeof created.data==='string','Valid genuine AAL2 workflow failed (HTTP '+created.status+', code '+String((created.data as {code?:string})?.code)+')');
  const revocation={p_actor_user_id:owner.id,p_invitation_id:created.data,p_reason:'Fictional test complete',p_actor_aal:verified.aal,p_actor_authenticated_at:verified.authenticatedAt,p_request_id:randomUUID()};
  ensure((await service('revoke_organization_invitation',revocation,{})).status===401,'Revocation accepted missing binding');
  const revoked=await service('revoke_organization_invitation',revocation);
  ensure(revoked.status===200,'Valid bound invitation revocation failed');
  sql(`insert into private.platform_operators(user_id,role,designation_reason) values('${owner.id}','superadmin','Fictional session test');`);
  const provision={p_actor_user_id:owner.id,p_owner_user_id:owner.id,p_organization_name:'Fictional admission customer',p_organization_slug:'admission-'+randomUUID(),
    p_organization_timezone:'UTC',p_organization_locale:'en-US',p_organization_country_code:'US',p_organization_currency:'USD',p_operator_reason:'Fictional test',
    p_actor_aal:verified.aal,p_actor_authenticated_at:verified.authenticatedAt,p_request_id:randomUUID()};
  ensure((await service('provision_customer_organization',provision,{})).status===401,'Provisioning accepted missing binding');
  ensure((await service('provision_customer_organization',provision)).status===200,'Valid bound provisioning failed');
  const adminLock=await lock(`update auth.sessions set not_after=now()-interval '1 second' where id='${verified.sessionId}';`);
  try {
    const before=sql(`select count(*) from public.organization_invitations where organization_id='${org}';`);
    const pending=service('create_organization_invitation',{...invitation,p_email:`race-${randomUUID()}@example.test`,p_request_id:randomUUID()});
    await waitBlocked(adminLock.pid);await adminLock.finish(true);
    ensure((await pending).status===401,'Admin workflow admitted after concurrent actor expiry');
    ensure(sql(`select count(*) from public.organization_invitations where organization_id='${org}';`)===before,'Denied admin race created an invitation');
    pass('service workflow: observed session lock wait, concurrent expiry rejects invitation without mutation');
  } finally {await adminLock.finish(false);}
  sql(`update auth.sessions set not_after=null where id='${verified.sessionId}';`);
  ensure(!(await admin.c.auth.signOut({scope:'local'})).error,'MFA sign-out failed');
  for(const [name,payload] of [['create_organization_invitation',invitation],['revoke_organization_invitation',revocation],['provision_customer_organization',provision]] as const) {
    ensure((await service(name,{...payload,p_request_id:randomUUID()})).status===401,'Revoked actor session entered '+name);
  }
  pass('all three genuine AAL2 admin workflows admit valid sessions, reject missing binding and reject retained actor binding after sign-out');
} finally {await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));}
