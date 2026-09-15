// Genuine fictional Auth -> local acceptance UI/SDK -> Data API -> PostgreSQL.
// Never accepts credentials or an arbitrary URL; discovers only the named local
// CLI project and refuses any non-loopback request. Synthetic fixtures remain in
// the disposable database; passwords/tokens exist only in memory.
import { execFileSync, spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { createInterface } from 'node:readline';
import { createAcceptanceRepository } from '../lib/platform/acceptance-repository.ts';
import { AcceptanceController, type AcceptanceAttempt } from '../lib/platform/acceptance-controller.ts';
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
const proxyOrigin='http://127.0.0.1:3351';
const guardedFetch: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  ensure(url.origin === base.origin, 'Non-local request refused');
  const response = await fetch(proxyOrigin+url.pathname+url.search, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000) });
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
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const origin='http://127.0.0.1:3352';
const browserMode=args.includes('--serve');
ensure(!['.env','.env.local','.env.production','.env.production.local'].some(file=>existsSync(resolve(file))), 'UI tests require an environment-file-free checkout');
let fault:'drop'|'unavailable'|null=null;
let app:ReturnType<typeof spawn>|null=null;
const proxy=createServer((incoming,outgoing)=>{
  const mode=incoming.method==='POST' && incoming.url?.startsWith('/rest/v1/rpc/accept_organization_invitation')?fault:null;
  if(mode)fault=null;
  if(mode==='unavailable'){incoming.resume();outgoing.writeHead(503,{'content-type':'application/json','access-control-allow-origin':'*'});outgoing.end(JSON.stringify({message:'Fictional transport outage'}));return;}
  const upstream=httpRequest({hostname:base.hostname,port:base.port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,host:base.host}},response=>{
    if(mode==='drop'){response.resume();response.once('end',()=>outgoing.destroy());return;}
    outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);
  });
  upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end();});incoming.pipe(upstream);
});
await new Promise<void>((resolve,reject)=>{proxy.once('error',reject);proxy.listen(3351,'127.0.0.1',resolve);});
function pass(message:string){console.log('PASS: '+message);}
try {
  const owner=await identity('accept-owner'),recipient=await identity('accept-recipient'),wrong=await identity('accept-wrong'),unverified=await identity('accept-unverified'),browser=await identity('accept-browser');
  type Identity=typeof owner;
  function fixture(who:Identity,mode='pending',organizationRole='member',productionRole='viewer'){
    const [org,prod,invitation]=Array.from({length:3},()=>randomUUID());
    sql(`begin;
      insert into public.organizations(id,name,slug) values('${org}','Fictional acceptance studio','accept-${org}');
      insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('${org}','${owner.id}','owner','active',now());
      insert into public.productions(id,organization_id,name,slug) values('${prod}','${org}','Fictional acceptance production','accept');
      insert into public.organization_invitations(id,organization_id,email,organization_role,production_id,production_role,created_at,expires_at,created_by,status,revoked_at,revoked_by)
      values('${invitation}','${org}','${who.email}','${organizationRole}','${prod}','${productionRole}',now()-interval '2 days',${mode==='elapsed'?"now()-interval '1 day'":"now()+interval '1 day'"},'${owner.id}','${mode==='revoked'?'revoked':mode==='expired'?'expired':'pending'}',${mode==='revoked'?'now()':'null'},${mode==='revoked'?`'${owner.id}'`:'null'});commit;`);
    return {org,prod,invitation};
  }
  const repository=createAcceptanceRepository(recipient.c);
  function attempt(who:Identity,id:string):AcceptanceAttempt{return Object.freeze({actor:who.id,invitationId:id});}
  function controller(who:Identity,id:string){const c=new AcceptanceController();c.bind(who.id);c.prepare(id);return c;}
  function audit(id:string){return Number(sql(`select count(*) from public.audit_events where resource_id='${id}' and action='organization.invitation.accepted';`));}
  function noGrant(f:ReturnType<typeof fixture>,who:Identity){
    ensure(sql(`select count(*) from public.organization_memberships where organization_id='${f.org}' and user_id='${who.id}';`)==='0','Denied acceptance left organization grant');
    ensure(sql(`select count(*) from public.production_memberships where production_id='${f.prod}' and user_id='${who.id}';`)==='0' && audit(f.invitation)===0,'Denied acceptance left production/audit');
  }
  const match=fixture(recipient);const matchAttempt=attempt(recipient,match.invitation);
  const wrongController=controller(wrong,match.invitation);await wrongController.execute(createAcceptanceRepository(wrong.c));
  ensure(wrongController.failure==='unavailable','Wrong verified account accepted invitation');noGrant(match,wrong);
  ensure(await createAcceptanceRepository(wrong.c).receipt(attempt(wrong,match.invitation))===null,'Wrong account inspected receipt');
  const hidden=await recipient.c.from('organization_invitations').select('id').eq('id',match.invitation);ensure(!hidden.error && hidden.data?.length===0,'Recipient gained admin invitation listing');
  ensure(await repository.receipt(matchAttempt)===null,'Pending invitation falsely confirmed');
  ensure(await repository.accept(matchAttempt)===match.org,'Matching verified acceptance failed');
  const received=await repository.receipt(matchAttempt);ensure(received?.invitationId===match.invitation && received.organizationId===match.org,'Own accepted receipt missing');
  const reused=controller(recipient,match.invitation);await reused.execute(repository);ensure(reused.failure==='unavailable','Single-use acceptance replay changed behavior');
  await reused.execute(repository,true);ensure(reused.phase==='success' && audit(match.invitation)===1,'Own replay status recovery duplicated grant');
  ensure(await createAcceptanceRepository(owner.c).receipt(attempt(owner,match.invitation))===null,'Owner used recipient receipt for another actor');
  pass('verified matching account accepts once; wrong account denied; recipient list remains hidden; reused RPC denied and own status recovers without duplicate audit');
  for(const mode of ['elapsed','expired','revoked']){
    const f=fixture(recipient,mode),c=controller(recipient,f.invitation);await c.execute(repository);ensure(c.failure==='unavailable','Terminal invitation accepted: '+mode);noGrant(f,recipient);
    ensure(await repository.receipt(attempt(recipient,f.invitation))===null,'Terminal invitation exposed receipt');
  }
  const u=fixture(unverified);sql(`update auth.users set email_confirmed_at=null where id='${unverified.id}';`);
  const uc=controller(unverified,u.invitation);await uc.execute(createAcceptanceRepository(unverified.c));ensure(uc.failure==='unavailable','Unverified email accepted');noGrant(u,unverified);
  pass('elapsed, expired, revoked and unverified-email invitations fail unchanged with no grant/audit');
  for(const mode of ['organization-suspended','production-suspended','organization-deleted','production-deleted']){
    const f=fixture(recipient);
    if(mode.includes('suspended')){
      sql(`insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('${f.org}','${recipient.id}','admin','${mode==='organization-suspended'?'suspended':'active'}',now());`);
      if(mode==='production-suspended')sql(`insert into public.production_memberships(organization_id,production_id,user_id,role,status) values('${f.org}','${f.prod}','${recipient.id}','editor','suspended');`);
    }else sql(`begin;select set_config('request.jwt.claims','{"sub":"${owner.id}","role":"authenticated"}',true);update public.${mode==='organization-deleted'?'organizations':'productions'} set deleted_at=now() where id='${mode==='organization-deleted'?f.org:f.prod}';commit;`);
    const before=sql(`select coalesce(string_agg(role::text||'/'||status::text,','),'') from public.organization_memberships where organization_id='${f.org}' and user_id='${recipient.id}';`);
    const c=controller(recipient,f.invitation);await c.execute(repository);ensure(c.failure==='unavailable' && audit(f.invitation)===0,'Inactive boundary accepted: '+mode);
    ensure(sql(`select coalesce(string_agg(role::text||'/'||status::text,','),'') from public.organization_memberships where organization_id='${f.org}' and user_id='${recipient.id}';`)===before,'Denied acceptance changed membership');
    ensure(await repository.receipt(attempt(recipient,f.invitation))===null,'Inactive boundary exposed receipt');
  }
  // A receipt must disappear after access is suspended or its parent is deleted.
  sql(`update public.organization_memberships set status='suspended' where organization_id='${match.org}' and user_id='${recipient.id}';`);
  ensure(await repository.receipt(matchAttempt)===null,'Suspended former recipient obtained active receipt');
  pass('suspended organization/production and deleted parents refuse acceptance without changing roles; post-acceptance suspension hides receipt');
  const strong=fixture(owner);await createAcceptanceRepository(owner.c).accept(attempt(owner,strong.invitation));
  ensure(sql(`select role from public.organization_memberships where organization_id='${strong.org}' and user_id='${owner.id}';`)==='owner','Member invite demoted owner');
  const low=fixture(recipient);await repository.accept(attempt(recipient,low.invitation));
  ensure(sql(`select role::text||'/'||(select role::text from public.production_memberships where production_id='${low.prod}' and user_id='${recipient.id}') from public.organization_memberships where organization_id='${low.org}' and user_id='${recipient.id}';`)==='member/viewer','Acceptance escalated invited roles');
  pass('existing stronger owner role preserved; member/viewer invitation grants exactly bounded roles');
  for(const mode of ['drop-check','drop-retry','unavailable']){
    const f=fixture(recipient),c=controller(recipient,f.invitation),snapshot=c.attempt;fault=mode==='unavailable'?'unavailable':'drop';
    await c.execute(repository);ensure(c.phase==='uncertain','Transport failure not retained: '+mode);
    if(mode==='unavailable'){await c.execute(repository,true);ensure(c.phase==='uncertain' && !c.receipt,'Absent result falsely confirmed');}
    await c.execute(repository,mode==='drop-check');ensure(String(c.phase)==='success' && c.attempt===snapshot && audit(f.invitation)===1,'Uncertain acceptance did not recover once');
  }
  pass('actual committed-response loss via owned proxy resolves by receipt or same-ID retry; pre-send outage remains uncertain until successful retry; each has one audit');
  const concurrent=fixture(recipient),left=controller(recipient,concurrent.invitation),right=controller(recipient,concurrent.invitation);
  await Promise.all([left.execute(repository),right.execute(repository)]);
  ensure([left,right].filter(value=>value.phase==='success').length===1 && [left,right].filter(value=>value.failure==='unavailable').length===1 && audit(concurrent.invitation)===1,'Concurrent acceptance duplicated or bypassed single-use behavior');
  const loser=left.phase==='success'?right:left;await loser.execute(repository,true);ensure(loser.phase==='success','Concurrent loser could not confirm own existing receipt');
  pass('two simultaneous acceptance controllers produce one grant/audit; the denied contender confirms its own receipt');
  const expiry=fixture(recipient),c=controller(recipient,expiry.invitation),snapshot=c.attempt;
  sql(`update auth.sessions set not_after=now()-interval '1 second' where user_id='${recipient.id}';`);
  await c.execute(repository);ensure(c.failure==='auth','Expired session accepted');noGrant(expiry,recipient);
  await c.execute(repository,true);ensure(c.failure==='auth','Expired session read receipt');
  ensure(!(await recipient.c.auth.signInWithPassword({email:recipient.email,password:recipient.password})).error,'Same-account reauthentication failed');
  c.bind(recipient.id);await c.execute(repository);ensure(c.phase==='success' && c.attempt===snapshot && audit(expiry.invitation)===1,'Reauthentication failed to preserve request');
  pass('actual expired session denies acceptance and receipt; same-account password reauthentication preserves ID and completes once');

  app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3352'],{stdio:['ignore','pipe','ignore'],env:{PATH:process.env.PATH,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',ROSELAND_LOCAL_ACCEPTANCE:'supabase',ROSELAND_LOCAL_SUPABASE_URL:proxyOrigin,ROSELAND_LOCAL_SUPABASE_ANON_KEY:key}});
  let ready=false;app.stdout!.on('data',chunk=>{if(chunk.toString().includes('Ready in'))ready=true;});
  const deadline=Date.now()+20000;while(!ready && app.exitCode===null && Date.now()<deadline)await delay(100);ensure(ready,'Owned built app did not start');
  ensure((await fetch(origin+'/local-accept-invitation')).status===200,'Enabled acceptance route unavailable');
  for(const route of ['/local-invitations','/local-schedule','/platform/setup'])ensure((await fetch(origin+route)).status===404,'Unrelated local gate enabled');
  const foreign=await new Promise<number>(resolve=>{const req=httpRequest({hostname:'127.0.0.1',port:3352,path:'/local-accept-invitation',headers:{host:'untrusted.example'}},res=>{res.resume();resolve(res.statusCode??0);});req.end();});
  ensure(foreign===404,'Foreign host exposed acceptance config');
  pass('built loopback acceptance route enabled; foreign Host and unchanged management/editor/setup routes return 404');
  if(browserMode){
    const normal=fixture(browser),lost=fixture(browser),expired=fixture(browser,'elapsed'),revoked=fixture(browser,'revoked'),sessionExpiry=fixture(browser),outage=fixture(browser);
    console.log('BROWSER_FIXTURE '+JSON.stringify({url:origin+'/local-accept-invitation',account:{email:browser.email,password:browser.password,id:browser.id},wrong:{email:wrong.email,password:wrong.password},normal,lost,expired,revoked,sessionExpiry,outage}));
    await new Promise<void>(resolve=>{const input=createInterface({input:process.stdin});input.on('line',line=>{
      if(line==='stop'){input.close();resolve();return;}
      try{if(line==='drop')fault='drop';else if(line==='unavailable')fault='unavailable';else if(line==='expire')sql(`update auth.sessions set not_after=now()-interval '1 second' where user_id='${browser.id}';`);else {console.log('CONTROL unknown');return;}console.log('CONTROL '+line);}catch{console.log('CONTROL failed');}
    });input.on('close',resolve);});
  }
} finally {
  if(app && app.exitCode===null){const stopped=new Promise(resolve=>app!.once('exit',resolve));app.kill('SIGTERM');await stopped;}
  await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));
  await new Promise<void>(resolve=>proxy.close(()=>resolve()));
}
