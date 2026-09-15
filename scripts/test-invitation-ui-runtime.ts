// Genuine local MFA -> verified actor binding -> service workflow -> PostgreSQL.
// Never accepts credentials or an arbitrary URL; discovers only the named local
// CLI project and refuses any non-loopback request. Synthetic fixtures remain in
// the disposable database; passwords/tokens exist only in memory.
import { execFileSync, spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { createInterface } from 'node:readline';
import { createInvitationRepository, sendInvitationAttempt } from '../lib/platform/invitation-repository.ts';
import { InvitationController } from '../lib/platform/invitation-controller.ts';
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
ensure(typeof serviceKey==='string','Local fixture service key unavailable');
const origin='http://127.0.0.1:3345';
const browserMode=args.includes('--serve');
ensure(!['.env','.env.local','.env.production','.env.production.local'].some(file=>existsSync(resolve(file))), 'UI tests require an environment-file-free checkout');
let app: ReturnType<typeof spawn> | null=null;
let proxy: ReturnType<typeof createServer> | null=null;
let fault: 'drop'|'unavailable'|'conflict'|null=null;
const seedPrefix='ui-rate-'+randomUUID();
function seedRate(actor:string,organization:string){
  const count=Number(sql(`select count(*) from public.audit_events where actor_user_id='${actor}' and organization_id='${organization}' and action='organization.invitation.created' and created_at>now()-interval '10 minutes';`));
  sql(`insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,request_id)
    select '${organization}','${actor}','organization.invitation.created','fictional_ui_rate',gen_random_uuid(),'${seedPrefix}-'||generate_series::text from generate_series(1,${Math.max(0,25-count)});`);
}
function clearRate(){sql(`delete from public.audit_events where request_id like '${seedPrefix}-%';`);}
async function mfa(user: Awaited<ReturnType<typeof identity>>){
  const factor=await user.c.auth.mfa.enroll({factorType:'totp',friendlyName:'Fictional UI runtime'});
  ensure(!factor.error && factor.data.type==='totp','Synthetic MFA enrollment failed');
  const verified=await user.c.auth.mfa.challengeAndVerify({factorId:factor.data.id,code:totp(factor.data.totp.secret)});
  ensure(!verified.error && !(await user.c.auth.getUser()).error,'Genuine MFA verification failed');
  return {id:factor.data.id,secret:factor.data.totp.secret};
}
const appFetch:typeof fetch=(input,init)=>{
  const url=new URL(String(input),origin);ensure(url.origin===origin,'Only owned loopback UI requests allowed');
  return fetch(url,{...init,headers:{...init?.headers,origin},redirect:'error'});
};
function pass(message:string){console.log('PASS: '+message);}

try {
  const owner=await identity('ui-owner'),admin=await identity('ui-admin'),viewer=await identity('ui-viewer'),outsider=await identity('ui-outsider'),browser=await identity('ui-browser');
  const ownerFactor=await mfa(owner),adminFactor=await mfa(admin);await mfa(viewer);await mfa(outsider);
  const [org,other,browserOrg,prod]=Array.from({length:4},()=>randomUUID());
  sql(`begin;
    insert into public.organizations(id,name,slug) values('${org}','Fictional Studio','ui-${org}'),('${other}','Fictional Other Studio','ui-${other}'),('${browserOrg}','Harbour Studio — fictional','ui-${browserOrg}');
    insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
      ('${org}','${owner.id}','owner','active',now()),('${org}','${admin.id}','admin','active',now()),('${org}','${viewer.id}','member','active',now()),
      ('${other}','${outsider.id}','owner','active',now()),('${browserOrg}','${browser.id}','owner','active',now()),('${browserOrg}','${admin.id}','admin','active',now());
    insert into public.productions(id,organization_id,name,slug) values('${prod}','${browserOrg}','Harbour documentary','harbour');
    insert into public.organization_invitations(organization_id,email,organization_role,expires_at,created_by)
      values('${browserOrg}','camera@example.test','member',now()+interval '7 days','${browser.id}'),
      ('${browserOrg}','producer@example.test','admin',now()+interval '7 days','${browser.id}'),
      ('${browserOrg}','owner@example.test','owner',now()+interval '7 days','${browser.id}');
    insert into public.organization_invitations(organization_id,email,organization_role,expires_at,created_by)
      select '${org}','page-'||generate_series::text||'@example.test','member',now()+interval '7 days','${owner.id}' from generate_series(1,26);
    insert into public.productions(organization_id,name,slug)
      select '${org}','Fictional production '||generate_series::text,'page-'||generate_series::text from generate_series(1,26);commit;`);
  const repo=createInvitationRepository(owner.c);
  ensure((await repo.organizations(owner.id)).items.every(item=>item.id===org && item.role==='owner'),'Owner organization scope failed');
  ensure((await createInvitationRepository(viewer.c).organizations(viewer.id)).items.length===0,'Viewer gained management selection');
  ensure((await createInvitationRepository(outsider.c).pending(org)).items.length===0,'Outsider read another tenant invitation');
  const first=await repo.pending(org),second=await repo.pending(org,first.items.at(-1)!.id);
  ensure(first.items.length===25 && first.more && second.items.length===1 && !second.more && !first.items.some(a=>second.items.some(b=>a.id===b.id)),'Pending invitation pagination failed');
  const prods=await repo.productions(org);ensure(prods.items.length===25 && prods.more && (await repo.productions(org,prods.items.at(-1)!.id)).items.length===1,'Production pagination failed');
  pass('actual RLS: owner/admin scope, viewer/tenant denial and complete 25+1 invitation/production pagination');

  app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3346'],{
    stdio:['ignore','pipe','ignore'],env:{PATH:process.env.PATH,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',
      ROSELAND_LOCAL_ADMIN:'supabase',ROSELAND_LOCAL_SUPABASE_URL:base.origin,ROSELAND_LOCAL_SUPABASE_ANON_KEY:key,
      SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',SUPABASE_URL:base.origin,SUPABASE_PUBLISHABLE_KEY:key,SUPABASE_SERVICE_ROLE_KEY:serviceKey},
  });
  let appReady=false;app.stdout!.on('data',chunk=>{if(chunk.toString().includes('Ready in'))appReady=true;});
  const deadline=Date.now()+20000;while(!appReady && app.exitCode===null && Date.now()<deadline)await delay(100);
  ensure(appReady,'Owned built application did not start');
  proxy=createServer((incoming,outgoing)=>{
    const mode=incoming.method==='POST' && incoming.url?.startsWith('/api/platform/invitations')?fault:null;
    if(mode)fault=null;
    if(mode==='unavailable'||mode==='conflict'){
      incoming.resume();outgoing.writeHead(mode==='conflict'?409:503,{'content-type':'application/json'});
      outgoing.end(JSON.stringify({error:mode==='conflict'?'Workflow request conflict':'Fictional transport outage'}));return;
    }
    const upstream=httpRequest({hostname:'127.0.0.1',port:3346,path:incoming.url,method:incoming.method,headers:incoming.headers},response=>{
      if(mode==='drop'){
        response.resume();response.once('end',()=>outgoing.destroy());return;
      }
      outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);
    });
    upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end();});incoming.pipe(upstream);
  });
  await new Promise<void>((resolve,reject)=>{proxy!.once('error',reject);proxy!.listen(3345,'127.0.0.1',resolve);});
  ensure((await fetch(origin+'/local-invitations')).status===200,'Enabled UI route unavailable');
  ensure((await fetch(origin+'/platform/setup')).status===404 && (await fetch(origin+'/local-schedule')).status===404,'Existing setup/editor defaults changed');
  const foreignHost=await new Promise<number>(resolve=>{
    const request=httpRequest({hostname:'127.0.0.1',port:3346,path:'/local-invitations',headers:{host:'untrusted.example'}},response=>{response.resume();resolve(response.statusCode??0);});request.end();
  });
  ensure(foreignHost===404,'Non-loopback Host exposed local UI configuration');
  pass('built route is enabled only locally; foreign Host and unchanged setup/editor guards return 404');

  const send=async(attempt: Parameters<typeof sendInvitationAttempt>[0],who=owner)=>sendInvitationAttempt(attempt,(await who.c.auth.getSession()).data.session,appFetch);
  function prepare(who=owner,role='member'){
    const controller=new InvitationController(()=>randomUUID());controller.bind(who.id);
    controller.prepare('create',org,{organizationId:org,email:'request-'+randomUUID()+'@example.test',organizationRole:role,expiresInDays:7});return controller;
  }
  for(const who of [viewer,outsider,admin]){
    const controller=prepare(who,who===admin?'owner':'member');await controller.submit(value=>send(value,who));
    ensure(controller.failure==='denied','Built route failed role/tenant denial');
  }
  pass('built API refuses viewer, another tenant and admin granting owner; drafts/keys remain');
  const lost=prepare();fault='drop';await lost.submit(value=>send(value));ensure(lost.phase==='unknown','Lost committed response did not remain uncertain');
  const lostKey=lost.attempt!.key;await lost.check(value=>repo.result(value));ensure(String(lost.phase)==='success' && lost.attempt!.key===lostKey,'Audit lookup did not confirm matching committed result');
  ensure(sql(`select count(*) from public.audit_events where request_id='${lostKey}';`)==='1','Lost-response lookup duplicated a mutation');
  const retry=prepare();fault='drop';await retry.submit(value=>send(value));await retry.submit(value=>send(value));
  ensure(retry.phase==='success' && sql(`select count(*) from public.audit_events where request_id='${retry.attempt!.key}';`)==='1','Lost-response retry duplicated a mutation');
  const unavailable=prepare();fault='unavailable';await unavailable.submit(value=>send(value));await unavailable.check(value=>repo.result(value));
  ensure(unavailable.phase==='unknown' && !unavailable.result,'Absent result was treated as a failed mutation');await unavailable.submit(value=>send(value));ensure(String(unavailable.phase)==='success','Same request could not recover from unavailable transport');
  pass('actual committed-response loss and pre-send outage preserve immutable requests; lookup or same-key retry produces one result');
  const conflict=new InvitationController(()=>lostKey);conflict.bind(owner.id);conflict.prepare('create',org,{organizationId:org,email:'changed-'+randomUUID()+'@example.test'});
  await conflict.submit(value=>send(value));await conflict.check(value=>repo.result(value));
  ensure(conflict.phase==='conflict' && conflict.result?.matches===false,'Changed input falsely acknowledged an old operation');
  pass('actual changed-input 409 retains review state and shows mismatched prior result');
  const rate=prepare();const rateKey=rate.attempt!.key;seedRate(owner.id,org);await rate.submit(value=>send(value));
  ensure(rate.failure==='rate' && rate.attempt!.key===rateKey,'Rate denial discarded request');clearRate();await rate.submit(value=>send(value));ensure(rate.phase==='success','Retry after rate limit failed');
  pass('actual rate denial preserves draft/key and retries after the fictional rate seed is removed');
  const expiry=prepare();const expiryAttempt=expiry.attempt;
  sql(`update auth.sessions set not_after=now()-interval '1 second' where user_id='${owner.id}';`);
  await expiry.submit(value=>send(value));ensure(expiry.failure==='auth','Expired session reached mutation');
  const login=await owner.c.auth.signInWithPassword({email:owner.email,password:owner.password});ensure(!login.error,'Same-account password reauthentication failed');
  await delay(31000-Date.now()%30000);
  const verified=await owner.c.auth.mfa.challengeAndVerify({factorId:ownerFactor.id,code:totp(ownerFactor.secret)});ensure(!verified.error,'Same-account MFA rechallenge failed');
  expiry.bind(owner.id);await expiry.submit(value=>send(value));ensure(expiry.phase==='success' && expiry.attempt===expiryAttempt,'Reauthentication changed the original business request');
  pass('actual expiry, password reauthentication and MFA rechallenge preserve the original request and complete it once');

  if(browserMode){
    // Ephemeral synthetic browser credentials are returned only to the active
    // test driver. They are never written to a file or committed artifact.
    console.log('BROWSER_FIXTURE '+JSON.stringify({url:origin+'/local-invitations',organization:browserOrg,owner:{email:browser.email,password:browser.password,id:browser.id},admin:{email:admin.email,password:admin.password,id:admin.id},viewer:{email:viewer.email,password:viewer.password}}));
    await new Promise<void>(resolve=>{
      const input=createInterface({input:process.stdin});input.on('line',line=>{
        if(line==='stop'){input.close();resolve();return;}
        try {
          if(line==='drop')fault='drop';else if(line==='unavailable')fault='unavailable';else if(line==='conflict')fault='conflict';
          else if(line==='rate')seedRate(browser.id,browserOrg);else if(line==='clear-rate')clearRate();
          else if(line==='expire')sql(`update auth.sessions set not_after=now()-interval '1 second' where user_id='${browser.id}';`);
          else if(line==='admin-code'){console.log('CODE '+totp(adminFactor.secret));return;}
          else if(line.startsWith('code ')){console.log('CODE '+totp(line.slice(5).trim()));return;}
          else {console.log('CONTROL unknown');return;}
          console.log('CONTROL '+line);
        }catch {console.log('CONTROL failed');}
      });input.on('close',resolve);
    });
  }
} finally {
  if(proxy)await new Promise<void>(resolve=>proxy!.close(()=>resolve()));
  if(app && app.exitCode===null){const stopped=new Promise(resolve=>app!.once('exit',resolve));app.kill('SIGTERM');await stopped;}
  await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));
}
