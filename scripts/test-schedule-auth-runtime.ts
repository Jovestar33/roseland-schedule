// Genuine local Auth -> user-session SDK -> PostgREST RPC -> PostgreSQL/RLS.
// Never accepts credentials or an arbitrary URL; discovers only the named local
// CLI project and refuses any non-loopback request. Synthetic fixtures remain in
// the disposable database; passwords/tokens exist only in memory.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createScheduleRepository, ScheduleRepositoryError } from '../lib/platform/schedule-repository.ts';

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

let failureTrigger: string | undefined;
try {
  const a = await identity('owner-a');
  const b = await identity('owner-b');
  const viewer = await identity('viewer-a');
  pass('three synthetic identities signed up and then authenticated with password-grant sessions');
  const wrong = await client().auth.signInWithPassword({ email: a.email, password: 'Wrong-local-password-9aA' });
  ensure(wrong.error && !wrong.data.session, 'Wrong password unexpectedly created a session');
  pass('wrong password rejected by local Auth');
  const [orgA,orgB,prodA,prodB,dayA,dayB,scheduleA,scheduleB] = Array.from({length:8},()=>randomUUID());
  sql(`begin;
    insert into public.organizations(id,name,slug) values ('${orgA}','Auth fixture A','auth-${orgA}'),('${orgB}','Auth fixture B','auth-${orgB}');
    insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
      ('${orgA}','${a.id}','owner','active',now()),('${orgB}','${b.id}','owner','active',now()),('${orgA}','${viewer.id}','member','active',now());
    insert into public.productions(id,organization_id,name,slug) values ('${prodA}','${orgA}','Fictional A','a'),('${prodB}','${orgB}','Fictional B','b');
    insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at) values ('${orgA}','${prodA}','${viewer.id}','viewer','active',now());
    insert into public.production_days(id,organization_id,production_id,position,created_by,updated_by) values
      ('${dayA}','${orgA}','${prodA}',0,'${a.id}','${a.id}'),('${dayB}','${orgB}','${prodB}',0,'${b.id}','${b.id}');
    insert into public.schedules(id,organization_id,production_id,production_day_id,display_name,slug,document,created_by,updated_by) values
      ('${scheduleA}','${orgA}','${prodA}','${dayA}','Auth fixture A','a','{"meta":{},"rows":[]}','${a.id}','${a.id}'),
      ('${scheduleB}','${orgB}','${prodB}','${dayB}','Auth fixture B','b','{"meta":{},"rows":[]}','${b.id}','${b.id}');
    commit;`);
  const repo = createScheduleRepository(a.c);
  const foreign = createScheduleRepository(b.c);
  const readOnly = createScheduleRepository(viewer.c);
  ensure((await repo.read(scheduleA)).document_version === 1, 'Authorized read failed');
  ensure((await foreign.read(scheduleB)).id === scheduleB, 'Second tenant session not working');
  ensure((await readOnly.read(scheduleA)).id === scheduleA, 'Viewer read failed');
  pass('owner and viewer reads traverse SDK, local API and RLS');
  const document = { meta: { town: 'Fictional town', callsheet: { notes: 'Test only' } }, rows: [{ action: 'Shoot', dur: '00:00', contactName: 'Test Contact' }] };
  const saved = await repo.update(scheduleA,1,document,1);
  ensure(saved.document_version === 2 && saved.updated_by === a.id, 'Authenticated update/actor attribution failed');
  ensure(JSON.stringify((await repo.read(scheduleA)).document) === JSON.stringify(saved.document), 'Fresh API read differs from acknowledgement');
  const history = await a.c.from('schedule_versions').select('version,document,created_by,checksum').eq('schedule_id',scheduleA).order('version');
  ensure(!history.error && history.data?.length === 2 && history.data[1].created_by === a.id
    && JSON.stringify(history.data[1].document) === JSON.stringify(saved.document), 'History does not match saved document/actor');
  ensure(sql(`select v.checksum=encode(extensions.digest(convert_to(s.document::text,'UTF8'),'sha256'),'hex') from public.schedules s join public.schedule_versions v on v.schedule_id=s.id and v.version=s.document_version where s.id='${scheduleA}';`) === 't','History checksum mismatch');
  pass('authorized update persists with matching actor, version, document and immutable history');
  await denied(()=>foreign.read(scheduleA),'unavailable',404);
  await denied(()=>foreign.update(scheduleA,2,document,1),'unavailable',404);
  await denied(()=>readOnly.update(scheduleA,2,document,1),'unavailable',404);
  const hidden = await b.c.from('schedule_versions').select('version').eq('schedule_id',scheduleA);
  ensure(!hidden.error && hidden.data?.length === 0,'Other tenant can see history');
  pass('wrong-organization read/update/history and viewer update are denied');
  await denied(()=>repo.update(scheduleA,1,document,1),'conflict',409);
  await denied(()=>repo.update(scheduleA,2,{meta:{},rows:[{dur:'00:99'}]},1),'invalid',400);
  const bypass = await a.c.from('schedules').update({ document }).eq('id',scheduleA);
  ensure(bypass.error?.code === '42501','Direct REST update bypassed the required-version contract');
  pass('stale write returns HTTP 409; invalid input and direct-write bypass rejected');
  const before = await repo.read(scheduleA);
  failureTrigger = `auth_history_${randomBytes(8).toString('hex')}`;
  sql(`create function private.${failureTrigger}() returns trigger language plpgsql as $$begin if new.schedule_id='${scheduleA}'::uuid then raise exception 'Synthetic history failure'; end if; return new; end;$$;
    create trigger ${failureTrigger} before insert on public.schedule_versions for each row execute function private.${failureTrigger}();`);
  await denied(()=>repo.update(scheduleA,2,{meta:{town:'Must roll back'},rows:[]},1),'failed',400);
  const after = await repo.read(scheduleA);
  const afterHistory = await a.c.from('schedule_versions').select('version').eq('schedule_id',scheduleA);
  ensure(JSON.stringify(after)===JSON.stringify(before) && !afterHistory.error && afterHistory.data?.length===2, 'Failed history insert left partial state');
  sql(`drop trigger ${failureTrigger} on public.schedule_versions; drop function private.${failureTrigger}();`);
  failureTrigger = undefined;
  pass('history failure through real RPC rolls back document, summary, version and history');
  // Permissions must be current even while the previously issued JWT remains valid.
  sql(`update public.organization_memberships set status='suspended' where organization_id='${orgA}' and user_id='${a.id}';`);
  ensure(!(await a.c.auth.getUser()).error, 'Expected login session to remain valid during permission test');
  await denied(()=>repo.read(scheduleA),'unavailable',404);
  await denied(()=>repo.update(scheduleA,2,document,1),'unavailable',404);
  pass('membership suspension denies a still-valid login session');
  console.log('PASS: genuine local Auth/API/database verification complete; no simulated JWT claims or hosted requests');
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : 'Local authentication integration failed'}`);
  process.exitCode = 1;
} finally {
  if (failureTrigger) {
    try { sql(`drop trigger if exists ${failureTrigger} on public.schedule_versions; drop function if exists private.${failureTrigger}();`); }
    catch { console.error('Fixture trigger cleanup failed; discard the disposable stack before reuse'); process.exitCode = 1; }
  }
  for (const c of clients) await c.auth.signOut().catch(()=>{});
}
