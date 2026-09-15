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
import { createSessionScheduleRepository } from '../lib/platform/session-schedule-repository.ts';

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

try {
  const a = await identity('session-owner');
  const b = await identity('session-outsider');
  const viewer = await identity('session-viewer');
  const [org, prod, day, first, second, deleted] = Array.from({ length: 6 }, () => randomUUID());
  sql(`begin;
    insert into public.organizations(id,name,slug) values ('${org}','Local editor fiction','local-${org}');
    insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
      ('${org}','${a.id}','owner','active',now()),('${org}','${viewer.id}','member','active',now());
    insert into public.productions(id,organization_id,name,slug) values ('${prod}','${org}','Fictional production','fiction');
    insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at) values ('${org}','${prod}','${viewer.id}','viewer','active',now());
    insert into public.production_days(id,organization_id,production_id,position,created_by,updated_by) values ('${day}','${org}','${prod}',0,'${a.id}','${a.id}');
    insert into public.schedules(id,organization_id,production_id,production_day_id,display_name,slug,document,created_by,updated_by) values
      ('${first}','${org}','${prod}','${day}','Fictional harbour day','harbour','{"meta":{},"rows":[]}','${a.id}','${a.id}'),
      ('${second}','${org}','${prod}','${day}','Fictional woodland day','woodland','{"meta":{},"rows":[]}','${a.id}','${a.id}'),
      ('${deleted}','${org}','${prod}','${day}','Fictional removed day','removed','{"meta":{},"rows":[]}','${a.id}','${a.id}');
    commit;`);
  await createScheduleRepository(a.c).mutate(deleted,1,'delete');
  const repo = createSessionScheduleRepository(a.c);
  const outside = createSessionScheduleRepository(b.c);
  const readOnly = createSessionScheduleRepository(viewer.c);
  const all = await repo.list();
  ensure(all.length === 2 && all.every(row => row.id !== deleted), 'List leaked deleted/unrelated schedules');
  const page = await repo.list(null, 1);
  const next = await repo.list(page[0].id, 1);
  ensure(page[0].id === all[0].id && next[0].id === all[1].id && (await repo.list(next[0].id,1)).length === 0, 'Cursor pagination mismatch');
  ensure((await outside.list()).length === 0 && (await readOnly.list()).length === 2, 'List tenant/viewer boundary failed');
  pass('real-session listing is paginated, tenant-scoped and excludes deleted schedules');
  const document = { meta: { town: 'Fictional harbour', callsheet: { notes: 'Recovery fixture' }, wx: { sunrise: '6:00 AM' } },
    rows: [{ action: 'Shoot', timeIn: '9:00 AM', dur: '00:00', notes: 'Fictional note', contactName: 'Example Contact', subLocations: [{ id: 'fiction', loc: 'Fictional lane', done: false }] }] };
  ensure((await repo.read(first)).document_version === 1, 'Read failed');
  const saved = await repo.update(first, 1, document, 1);
  ensure(JSON.stringify((await repo.read(first)).document) === JSON.stringify(saved.document) && saved.document_version === 2, 'Save/reload round trip failed');
  await denied(() => repo.update(first,1,document,1), 'conflict', 409);
  await denied(() => readOnly.update(first,2,document,1), 'unavailable', 404);
  await denied(() => outside.read(first), 'unavailable', 404);
  await denied(() => repo.update(first,2,{meta:{},rows:[{dur:'99:99'}]},1), 'invalid', 400);
  pass('session read/save/reload preserves optional fields; stale, invalid and unauthorized saves rejected');
  sql(`begin; select set_config('request.jwt.claim.sub','${a.id}',true); update public.production_days set deleted_at=now() where id='${day}'; commit;`);
  ensure((await repo.list()).length === 0, 'Deleted parent leaked through list');
  await denied(() => repo.read(first), 'unavailable', 404);
  sql(`begin; select set_config('request.jwt.claim.sub','${a.id}',true); update public.production_days set deleted_at=null where id='${day}';
    update public.organization_memberships set status='suspended' where organization_id='${org}' and user_id='${viewer.id}'; commit;`);
  ensure((await readOnly.list()).length === 0, 'Suspended member leaked through list');
  await denied(() => readOnly.read(first), 'unavailable', 404);
  pass('list/read enforce inactive parents and current membership');
  const session = (await a.c.auth.getSession()).data.session!;
  const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url').toString());
  ensure(/^[0-9a-f-]{36}$/.test(claims.session_id), 'Missing genuine session ID');
  sql(`update auth.sessions set not_after=now()-interval '1 second' where id='${claims.session_id}';`);
  await denied(() => repo.list(), 'unauthenticated', 401);
  await denied(() => repo.read(first), 'unauthenticated', 401);
  await denied(() => repo.update(first,2,document,1), 'unauthenticated', 401);
  sql(`update auth.sessions set not_after=null where id='${claims.session_id}';`);
  ensure((await repo.read(first)).document_version === 2, 'Expired session changed document');
  // Retain the real signed access token across sign-out to test revocation,
  // instead of relying on the SDK clearing its own in-memory session.
  const retained = createClient(base.origin,key,{global:{fetch:guardedFetch,headers:{Authorization:`Bearer ${session.access_token}`}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const revoked = createSessionScheduleRepository(retained);
  ensure(!(await a.c.auth.signOut({scope:'local'})).error, 'Local sign-out failed');
  await denied(() => revoked.list(), 'unauthenticated', 401);
  await denied(() => revoked.read(first), 'unauthenticated', 401);
  await denied(() => revoked.update(first,2,document,1), 'unauthenticated', 401);
  ensure(sql(`select document_version from public.schedules where id='${first}';`) === '2', 'Revoked session changed document');
  pass('expired database sessions and retained tokens after genuine sign-out cannot list/read/save');
  if (args.includes('--browser-fixture')) {
    // Public, deliberately fictional credentials, accepted only by this disposable local Auth service.
    const email = `walkthrough-${randomUUID()}@example.test`;
    const browser = client();
    const signup = await browser.auth.signUp({email,password:'Fictional-local-rehearsal-2026!'});
    ensure(!signup.error && signup.data.user, 'Walkthrough signup failed');
    const userId = signup.data.user.id;
    ensure(/^[0-9a-f-]{36}$/.test(userId), 'Unexpected fixture user');
    sql(`insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values ('${org}','${userId}','owner','active',now());`);
    console.log(`Fictional browser account: ${email}`);
    console.log(`Fictional browser schedule: ${first}`);
  }
} finally {
  await Promise.all(clients.map(c => c.auth.signOut({scope:'local'})));
}
