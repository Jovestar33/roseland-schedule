// Genuine local MFA -> verified actor binding -> service workflow -> PostgreSQL.
// Never accepts credentials or an arbitrary URL; discovers only the named local
// CLI project and refuses any non-loopback request. Synthetic fixtures remain in
// the disposable database; passwords/tokens exist only in memory.
import { execFileSync, spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { createInterface } from 'node:readline';
import { ProvisioningController, sendProvisioningAttempt } from '../lib/platform/provisioning-controller.ts';
import { createWorkspaceRepository } from '../lib/platform/workspace-repository.ts';

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const args = process.argv.slice(2);
if(args.includes('--next-port')){
  ensure(!['.env','.env.local','.env.production','.env.production.local'].some(file=>existsSync(resolve(file))),
    'Built HTTP tests require a checkout without application environment files');
}
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
  const response = await fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
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
  // Admin SQL sets up fictional actors/data and controlled audit/lock failures.
  // Exercised workflow calls use verified genuine MFA actor-session bindings.
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
const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve,milliseconds));
function totp(secret:string) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
  for(const char of secret.toUpperCase().replace(/=+$/,'')){const value=alphabet.indexOf(char);ensure(value>=0,'Invalid local MFA fixture');bits+=value.toString(2).padStart(5,'0');}
  const bytes=Buffer.from(bits.match(/.{8}/g)!.map(value=>parseInt(value,2)));
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const hmac=createHmac('sha1',bytes).update(counter).digest();const offset=hmac[hmac.length-1]&15;
  return ((hmac.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
}

const serviceKey=status.SERVICE_ROLE_KEY;
ensure(typeof serviceKey==='string','Local server workflow key unavailable');
const origin='http://127.0.0.1:3383';
const browserMode=args.includes('--serve');
ensure(!['.env','.env.local','.env.production','.env.production.local'].some(file=>existsSync(resolve(file))), 'UI tests require an environment-file-free checkout');
let app:ReturnType<typeof spawn>|null=null;
let fault:'hold'|'drop'|'unavailable'|null=null;
const held:(()=>void)[]=[];
const proxy=createServer((incoming,outgoing)=>{
  const mode=incoming.method==='POST'&&incoming.url==='/api/platform/organizations'?fault:null;if(mode)fault=null;
  if(mode==='unavailable'){incoming.resume();outgoing.writeHead(503,{'content-type':'application/json'});outgoing.end('{"error":"Fictional pre-send outage"}');return;}
  const upstream=httpRequest({hostname:'127.0.0.1',port:3382,path:incoming.url,method:incoming.method,headers:incoming.headers},response=>{
    if(mode){const chunks:Buffer[]=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>{
      // Drop the successful acknowledgement after upstream commit, returning an
      // ambiguous gateway failure rather than permitting browser TCP retries.
      if(mode==='drop'){outgoing.writeHead(503,{'content-type':'application/json'});outgoing.end('{"error":"Fictional lost acknowledgement"}');return;}
      held.push(()=>{outgoing.writeHead(response.statusCode??502,response.headers);outgoing.end(Buffer.concat(chunks));});console.log('CONTROL held');
    });return;}outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);
  });upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end();});incoming.pipe(upstream);
});
await new Promise<void>((resolve,reject)=>{proxy.once('error',reject);proxy.listen(3383,'127.0.0.1',resolve);});
const appFetch:typeof fetch=(input,init)=>{const url=new URL(String(input),origin);ensure(url.origin===origin,'Only owned local application requests allowed');return fetch(url,{...init,headers:{...init?.headers,origin},redirect:'error'});};
function pass(message:string){console.log('PASS: '+message);}
type Identity=Awaited<ReturnType<typeof identity>>;
async function enroll(user:Identity){const r=await user.c.auth.mfa.enroll({factorType:'totp',friendlyName:'Fictional provisioning'});ensure(!r.error&&r.data.type==='totp','Fictional MFA enrollment failed');const f={id:r.data.id,secret:r.data.totp.secret};await verify(user,f);return f;}
async function verify(user:Identity,factor:{id:string;secret:string}){
  let r=await user.c.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.secret)});
  if(r.error){await delay(31000-Date.now()%30000);r=await user.c.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.secret)});}
  ensure(!r.error&&!(await user.c.auth.getUser()).error,'Genuine MFA verification failed');
}
function prepare(user:Identity,ownerId=user.id){const c=new ProvisioningController(()=>randomUUID());c.bind(user.id);c.prepare({ownerUserId:ownerId,name:'Fictional provisioned studio',slug:'provision-'+randomUUID(),timezone:'UTC',locale:'en-US',countryCode:'US',currency:'USD',reason:'Fictional reviewed provisioning'});return c;}
async function submit(c:ProvisioningController,user:Identity){await c.submit(async attempt=>sendProvisioningAttempt(attempt,(await user.c.auth.getSession()).data.session,appFetch));}
function count(key:string){return Number(sql(`select count(*) from public.audit_events where action='organization.provisioned' and request_id='${key}';`));}
try {
  const operator=await identity('provision-operator'),owner=await identity('provision-owner'),admin=await identity('provision-admin'),recipient=await identity('provision-recipient'),outside=await identity('provision-outsider'),unverified=await identity('provision-unverified');
  const operatorFactor=await enroll(operator);await enroll(owner);await enroll(admin);await enroll(outside);
  const org=randomUUID(),other=randomUUID();
  sql(`begin;insert into private.platform_operators(user_id,role,designation_reason) values('${operator.id}','superadmin','Fictional local provisioning runtime');
    insert into public.organizations(id,name,slug) values('${org}','Fictional owner studio','fixture-${org}'),('${other}','Fictional outside studio','fixture-${other}');
    insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('${org}','${owner.id}','owner','active',now()),('${org}','${admin.id}','admin','active',now()),('${other}','${outside.id}','owner','active',now());
    update auth.users set email_confirmed_at=null where id='${unverified.id}';commit;`);
  app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3382'],{stdio:['ignore','pipe','ignore'],env:{PATH:process.env.PATH,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',ROSELAND_LOCAL_WORKSPACE:'supabase',ROSELAND_LOCAL_SUPABASE_URL:base.origin,ROSELAND_LOCAL_SUPABASE_ANON_KEY:key,SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',SUPABASE_URL:base.origin,SUPABASE_PUBLISHABLE_KEY:key,SUPABASE_SERVICE_ROLE_KEY:serviceKey}});
  let ready=false;app.stdout!.on('data',chunk=>{if(chunk.toString().includes('Ready in'))ready=true;});const deadline=Date.now()+20000;while(!ready&&app.exitCode===null&&Date.now()<deadline)await delay(100);ensure(ready,'Built workspace not ready');
  const page=await fetch(origin+'/local-workspace?screen=provisioning');ensure(page.status===200&&!(await page.text()).includes(serviceKey),'Workspace gate or secret boundary failed');
  const foreign=await new Promise<number>(resolve=>{const r=httpRequest({hostname:'127.0.0.1',port:3383,path:'/local-workspace',headers:{host:'untrusted.example'}},response=>{response.resume();resolve(response.statusCode??0);});r.end();});ensure(foreign===404,'Foreign Host exposed local workspace');
  for(const route of ['/platform/setup','/local-invitations','/local-schedule'])ensure((await fetch(origin+route)).status===404,'Independent gate changed');
  for(const user of [owner,admin,outside]){const c=prepare(user);await submit(c,user);ensure(c.failure==='denied'&&count(c.attempt!.key)===0,'Organization role acquired provisioning access');}
  for(const id of [unverified.id,randomUUID()]){const c=prepare(operator,id);await submit(c,operator);ensure(c.failure==='denied'&&count(c.attempt!.key)===0,'Unverified/missing owner was provisioned');}
  const invalid=await appFetch('/api/platform/organizations',{method:'POST',headers:{authorization:'Bearer '+(await operator.c.auth.getSession()).data.session!.access_token,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({ownerUserId:recipient.id,name:'Invalid',slug:'bad slug',reason:'fictional'})});ensure(invalid.status===400,'Invalid input not rejected');
  pass('genuine MFA Owner/Admin/other-tenant actors cannot provision; unverified/missing owners and invalid inputs leave no provisioning audit; loopback/secret/gates hold');

  const self=prepare(operator);await submit(self,operator);ensure(self.result&&self.phase==='success'&&count(self.attempt!.key)===1,'Operator self-owned provisioning failed');
  ensure((await createWorkspaceRepository(operator.c).scope(operator.id,self.result))?.role==='owner','New owner cannot discover organization');
  const forOther=prepare(operator,recipient.id);await submit(forOther,operator);ensure(forOther.result&&count(forOther.attempt!.key)===1,'Recipient provisioning failed');
  ensure(await createWorkspaceRepository(operator.c).scope(operator.id,forOther.result)===null,'Operator acquired recipient membership');
  ensure((await createWorkspaceRepository(recipient.c).scope(recipient.id,forOther.result))?.role==='owner','Verified recipient cannot discover own organization');
  ensure(await createWorkspaceRepository(outside.c).scope(outside.id,forOther.result)===null,'Other tenant gained discovery');
  const a=self.attempt!,token=(await operator.c.auth.getSession()).data.session!;
  const replay=await sendProvisioningAttempt(a,token,appFetch);ensure(replay===self.result&&count(a.key)===1,'Identical retry duplicated provisioning');
  const changed=new ProvisioningController(()=>a.key);changed.bind(operator.id);changed.prepare({...a.body,name:'Changed fictional input'});await submit(changed,operator);ensure(changed.phase==='conflict'&&count(a.key)===1,'Changed-input retry bypassed fingerprint');
  pass('restricted operator provisions atomically; exact retry returns one result/audit, changed input conflicts; discovery requires own membership even for the operator');

  for(const mode of ['drop','unavailable'] as const){const c=prepare(operator),attempt=c.attempt;fault=mode;await submit(c,operator);ensure(c.phase==='unknown','Transport failure was not retained');await submit(c,operator);ensure(String(c.phase)==='success'&&c.attempt===attempt&&count(attempt!.key)===1,'Unknown retry duplicated or changed request');}
  const heldController=prepare(operator),same=heldController.attempt!;fault='hold';const pending=submit(heldController,operator);const until=Date.now()+10000;while(!held.length&&Date.now()<until)await delay(50);ensure(held.length===1,'Response not held');await submit(heldController,operator);for(const release of held.splice(0))release();await pending;ensure(count(same.key)===1,'Duplicate UI submit changed count');
  const concurrent=prepare(operator),attempt=concurrent.attempt!;const ids=await Promise.all([sendProvisioningAttempt(attempt,token,appFetch),sendProvisioningAttempt(attempt,token,appFetch)]);ensure(ids[0]===ids[1]&&count(attempt.key)===1,'Concurrent server retries duplicated organization');
  pass('lost committed acknowledgement, pre-send outage, held duplicate submit and concurrent identical requests retain one canonical request/result/audit');

  const expired=prepare(operator),original=expired.attempt;sql(`update auth.sessions set not_after=now()-interval '1 second' where user_id='${operator.id}';`);await submit(expired,operator);ensure(expired.failure==='auth'&&count(original!.key)===0,'Expired genuine session provisioned');
  ensure(!(await operator.c.auth.signInWithPassword({email:operator.email,password:operator.password})).error,'Reauthentication failed');await verify(operator,operatorFactor);expired.bind(operator.id);await submit(expired,operator);ensure(expired.phase==='success'&&expired.attempt===original&&count(original!.key)===1,'Reauthentication lost review');
  const revoked=prepare(operator);sql(`delete from auth.sessions where user_id='${operator.id}';`);await submit(revoked,operator);ensure(revoked.failure==='auth','Revoked session provisioned');
  ensure(!(await operator.c.auth.signInWithPassword({email:operator.email,password:operator.password})).error,'Revocation recovery login failed');await verify(operator,operatorFactor);
  const seed='provision-rate-'+randomUUID();sql(`insert into public.audit_events(actor_user_id,action,resource_type,resource_id,request_id) select '${operator.id}','organization.provisioned','fictional_rate',gen_random_uuid(),'${seed}-'||n::text from generate_series(1,10)n;`);
  const rate=prepare(operator),rateAttempt=rate.attempt;await submit(rate,operator);ensure(rate.failure==='rate'&&count(rateAttempt!.key)===0,'Rate cap did not deny');sql(`delete from public.audit_events where request_id like '${seed}-%';`);await submit(rate,operator);ensure(rate.phase==='success'&&rate.attempt===rateAttempt&&count(rateAttempt!.key)===1,'Rate retry lost identity');
  sql(`update private.platform_operators set active=false,disabled_at=now() where user_id='${operator.id}';`);const suspended=prepare(operator);await submit(suspended,operator);ensure(suspended.failure==='denied','Inactive operator provisioned');
  pass('genuine session expiry/revocation, same-account MFA recovery, existing rate cap and inactive-operator denial preserve original retry state');

  if(browserMode){
    const browser=await identity('provision-browser'),browserFactor=await enroll(browser);
    sql(`insert into private.platform_operators(user_id,role,designation_reason) values('${browser.id}','superadmin','Fictional browser fixture');`);
    console.log('BROWSER_FIXTURE '+JSON.stringify({url:origin+'/local-workspace?screen=provisioning',operator:{id:browser.id,email:browser.email,password:browser.password},recipient:{id:recipient.id,email:recipient.email,password:recipient.password},ordinary:{id:owner.id,email:owner.email,password:owner.password},ordinaryOrganization:org}));
    await new Promise<void>(resolve=>{const input=createInterface({input:process.stdin});input.on('line',line=>{
      if(line==='stop'){input.close();resolve();return;}
      try{if(['hold','drop','unavailable'].includes(line))fault=line as typeof fault;
        else if(line==='release'){for(const release of held.splice(0))release();}
        else if(line==='code')console.log('FICTIONAL_CODE '+totp(browserFactor.secret));
        else if(line==='expire')sql(`update auth.sessions set not_after=now()-interval '1 second' where user_id='${browser.id}';`);
        else if(line==='results')console.log('RESULTS '+sql(`select json_build_object('id',resource_id,'request',request_id,'count',count(*)) from public.audit_events where actor_user_id='${browser.id}' and action='organization.provisioned' group by resource_id,request_id;`));
        else {console.log('CONTROL unknown');return;}console.log('CONTROL '+line);
      }catch{console.log('CONTROL failed');}
    });input.on('close',resolve);});
  }
} finally {
  for(const release of held.splice(0))release();if(app&&app.exitCode===null){const stopped=new Promise(resolve=>app!.once('exit',resolve));app.kill('SIGTERM');await stopped;}
  await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));await new Promise<void>(resolve=>proxy.close(()=>resolve()));
}
