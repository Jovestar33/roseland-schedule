import { enrollLocalTestMfa } from './local-test-mfa.ts';
// Genuine local Auth -> user-session SDK -> PostgREST RPC -> PostgreSQL/RLS.
// Never accepts credentials or an arbitrary URL; discovers only the named local
// CLI project and refuses any non-loopback request. Synthetic fixtures remain in
// the disposable database; passwords/tokens exist only in memory.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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
// Only generated identities are changed or removed. This script refuses hosted endpoints.
const created: string[] = [];
async function actor(label: string) {
  const result = await identity(label); created.push(result.id);
  const token = (await result.c.auth.getSession()).data.session!.access_token;
  const sid = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).session_id;
  ensure(/^[a-f0-9-]{36}$/.test(sid), 'Genuine session ID required');
  return {...result,sid,token};
}
function age(a: {id:string;sid:string}, interval: string) {
  ensure(/^[0-9]+ (minutes|days)$/.test(interval), 'Bounded test interval required');
  sql(`insert into private.account_session_activity(session_id,user_id,last_activity_at)
    values('${a.sid}','${a.id}',clock_timestamp()-interval '${interval}')
    on conflict(session_id) do update set last_activity_at=excluded.last_activity_at;`);
}
async function deadline(a: {c:SupabaseClient}) { return a.c.rpc('get_account_session_deadline'); }
async function configure(a: {c:SupabaseClient}, remember: boolean) { return a.c.rpc('set_account_session_remembered',{remember}); }
try {
  const normal = await actor('session-normal');
  let clock = await deadline(normal);
  ensure(!clock.error && Math.abs(Date.parse(clock.data)-Date.now()-3600000)<10000,'Default deadline is one hour');
  ensure(!(await configure(normal,false)).error,'Unchecked session registers');
  age(normal,'61 minutes');
  ensure((await deadline(normal)).status===401,'Unchecked session expires after one hour');
  ensure((await configure(normal,true)).status===401,'Expired ordinary session cannot be promoted');
  pass('Unchecked sessions expire after one hour and cannot be revived');

  const remembered = await actor('session-remembered');
  clock=await configure(remembered,true);
  ensure(!clock.error && Math.abs(Date.parse(clock.data)-Date.now()-7*86400000)<10000,'Remembered deadline is seven days');
  ensure(!(await configure(remembered,true)).error,'Same preference retry is idempotent');
  ensure((await configure(remembered,false)).status===409,'Cannot rewrite existing preference');
  age(remembered,'6 days');
  const before=await deadline(remembered);
  ensure(!before.error,'Remembered session admitted after six days');
  ensure(!(await remembered.c.auth.refreshSession()).error,'Genuine refresh succeeds');
  const after=await deadline(remembered);
  ensure(before.data===after.data,'Refresh and deadline reads do not count as activity');
  ensure(!(await remembered.c.rpc('record_account_activity')).error,'Actual activity accepted');
  clock=await deadline(remembered);
  ensure(Math.abs(Date.parse(clock.data)-Date.now()-7*86400000)<10000,'Activity extends remembered session by seven days');
  pass('Remembered session survives return visits; refresh does not extend the idle window');

  const otherSession=client();
  ensure(!(await otherSession.auth.signInWithPassword({email:remembered.email,password:remembered.password})).error,'Second device signs in');
  const independent=await otherSession.rpc('get_account_session_deadline');
  ensure(Math.abs(Date.parse(independent.data)-Date.now()-3600000)<10000,'Preference does not carry to another session');
  age(remembered,'8 days');
  ensure((await deadline(remembered)).status===401,'Seven-day inactivity denied');
  ensure((await remembered.c.rpc('record_account_activity')).status===401,'Activity cannot revive expired remembered session');
  ensure((await configure(remembered,true)).status===401,'Idempotent retry cannot revive expired session');
  pass('Expired remembered sessions fail closed; other sessions keep independent preferences');

  const late=await actor('session-late');
  sql(`update auth.sessions set created_at=clock_timestamp()-interval '6 minutes' where id='${late.sid}';`);
  ensure((await configure(late,true)).status===403,'Old session cannot opt into longer window');
  const banned=await actor('session-banned'); await configure(banned,true);
  sql(`update auth.users set banned_until=clock_timestamp()+interval '1 day' where id='${banned.id}';`);
  ensure((await deadline(banned)).status===401,'Banned user denied even with remembered session');
  const revoked=await actor('session-revoked'); await configure(revoked,true);
  ensure(!(await revoked.c.auth.signOut({scope:'local'})).error,'Sign out succeeds');
  ensure((await revoked.c.rpc('get_account_session_deadline').setHeader('Authorization',`Bearer ${revoked.token}`)).status===401,'Signed-out token denied');
  const changed=await actor('session-password'); await configure(changed,true);
  ensure(!(await changed.c.auth.updateUser({password:`Changed-${randomBytes(24).toString('hex')}-9aA`})).error,'Password change succeeds');
  ensure((await deadline(changed)).status===401,'Password reset expires remembered sessions');
  pass('Fresh configuration, ban, sign-out and password-change protections remain enforced');

  const mfa=await actor('session-mfa'); await configure(mfa,true);
  await enrollLocalTestMfa(mfa.c,base.origin);
  const verifiedToken=(await mfa.c.auth.getSession()).data.session!.access_token;
  const verifiedClaims=JSON.parse(Buffer.from(verifiedToken.split('.')[1],'base64url').toString());
  ensure(verifiedClaims.aal==='aal2','Actual TOTP verified');
  const renewed=await mfa.c.auth.refreshSession();
  ensure(!renewed.error && JSON.parse(Buffer.from(renewed.data.session!.access_token.split('.')[1],'base64url').toString()).aal==='aal2','Refresh retains genuine MFA assurance');
  ensure(!(await deadline(mfa)).error,'Verified remembered session admitted');
  const fresh=client();
  ensure(!(await fresh.auth.signInWithPassword({email:mfa.email,password:mfa.password})).error,'Fresh MFA password sign-in succeeds');
  ensure(!(await fresh.rpc('set_account_session_remembered',{remember:true})).error,'Preference can be set before TOTP');
  const policy=await fresh.rpc('get_account_policy_status');
  ensure(!policy.error,'Policy bootstrap is available');
  ensure(!(await fresh.rpc('accept_account_policies',{terms_version:policy.data.termsVersion,privacy_version:policy.data.privacyVersion})).error,'Test policies accepted');
  const blocked=await fresh.from('organizations').select('id');
  ensure(blocked.status===403 && blocked.error?.message==='mfa_required','Fresh login still requires MFA');
  pass('Genuine TOTP retained; fresh password login still requires MFA for protected data');
  console.log('All remembered-session runtime checks passed. No hosted requests or records.');
} finally {
  for(const id of created) sql(`delete from auth.users where id='${id}';`);
  for(const c of clients)c.auth.stopAutoRefresh();
}
