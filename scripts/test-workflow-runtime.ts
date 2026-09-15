// Genuine local MFA -> verified actor binding -> service workflow -> PostgreSQL.
// Never accepts credentials or an arbitrary URL; discovers only the named local
// CLI project and refuses any non-loopback request. Synthetic fixtures remain in
// the disposable database; passwords/tokens exist only in memory.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseVerifiedJwtClaims } from '../lib/platform/contracts.ts';
import { serviceApiHeaders } from '../lib/platform/service-headers.ts';

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
type Reply = { status: number; data: unknown };
async function api(token: string, path: string, method = 'GET', body?: unknown, extra: Record<string,string> = {}, apiKey = key): Promise<Reply> {
  try {
    const response = await guardedFetch(base.origin+'/rest/v1/'+path, {method,headers:{apikey:apiKey,...(token ? {authorization:`Bearer ${token}`} : {}),
      'content-type':'application/json',...extra},body:body === undefined ? undefined : JSON.stringify(body)});
    return {status:response.status,data:method === 'HEAD' || response.status === 204 ? null : await response.json()};
  } catch { return {status:0,data:null}; }
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

const vulnerable=process.argv.includes('--expect-vulnerable');
type Actor={id:string;token:string;headers:Record<string,string>;aal:string;authenticatedAt:string};
type Kind='provision'|'invite'|'revoke';
const rpcNames={provision:'provision_customer_organization',invite:'create_organization_invitation',revoke:'revoke_organization_invitation'};
const actions={provision:'organization.provisioned',invite:'organization.invitation.created',revoke:'organization.invitation.revoked'};
async function actor(label:string):Promise<Actor> {
  const user=await identity(label);
  const factor=await user.c.auth.mfa.enroll({factorType:'totp',friendlyName:'Fictional workflow check'});
  ensure(!factor.error && factor.data.type==='totp','Fictional MFA enrollment failed');
  const result=await user.c.auth.mfa.challengeAndVerify({factorId:factor.data.id,code:totp(factor.data.totp.secret)});
  ensure(!result.error && !(await user.c.auth.getUser()).error,'Genuine MFA session verification failed');
  const token=(await user.c.auth.getSession()).data.session!.access_token;
  const verified=parseVerifiedJwtClaims(token,user.id,base.origin+'/auth/v1',Math.floor(Date.now()/1000),900);
  return {id:user.id,token,aal:verified.aal,authenticatedAt:verified.authenticatedAt,headers:{
    'x-actor-user-id':user.id,'x-actor-session-id':verified.sessionId,'x-actor-session-exp':String(verified.expiresAt)}};
}
const serviceKey=status.SERVICE_ROLE_KEY;
ensure(typeof serviceKey==='string','Local service fixture key unavailable');
async function invoke(kind:Kind,payload:Record<string,unknown>,who:Actor) {
  const name=kind==='invite' && 'p_expires_in_days' in payload?'create_organization_invitation_with_days':rpcNames[kind];
  return api('','rpc/'+name,'POST',{
    ...payload,p_actor_user_id:who.id,p_actor_aal:who.aal,p_actor_authenticated_at:who.authenticatedAt,
  },{...serviceApiHeaders(serviceKey),...who.headers},serviceKey);
}
async function waitSecond(blocker:number,first:number) {
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){
    if(sql(`select exists(select 1 from pg_stat_activity where ${blocker}=any(pg_blocking_pids(pid)) and pid<>${first} and wait_event_type='Lock');`)==='t')return;
    await delay(50);
  }
  throw new Error('Expected the second real database lock wait');
}
function state() {
  return sql(`select jsonb_build_object('organizations',(select count(*) from public.organizations),
    'memberships',(select count(*) from public.organization_memberships),'invitations',(select jsonb_agg(to_jsonb(i) order by id) from public.organization_invitations i),
    'audits',(select count(*) from public.audit_events),'requests',(select count(*) from private.workflow_requests))::text;`);
}
function changedStatus(reply:Reply,label:string){ensure(reply.status===(vulnerable?200:409),label+' did not produce the expected payload-replay result');}
function note(message:string){console.log((vulnerable?'REPRODUCED/BASELINE: ':'PASS: ')+message);}

try {
  const owner=await actor('workflow-owner');const peer=await actor('workflow-peer');const recipient=await identity('workflow-recipient');
  const [org,otherOrg,production]=[randomUUID(),randomUUID(),randomUUID()];
  sql(`begin;
    insert into private.platform_operators(user_id,role,designation_reason) values('${owner.id}','superadmin','Fictional workflow test'),('${peer.id}','superadmin','Fictional workflow test');
    insert into public.organizations(id,name,slug) values('${org}','Fictional workflow tenant','workflow-${org}'),('${otherOrg}','Fictional second tenant','workflow-${otherOrg}');
    insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
      ('${org}','${owner.id}','owner','active',now()),('${org}','${peer.id}','owner','active',now()),
      ('${otherOrg}','${owner.id}','owner','active',now()),('${otherOrg}','${peer.id}','owner','active',now());
    insert into public.productions(id,organization_id,name,slug) values('${production}','${org}','Fictional workflow production','workflow'); commit;`);
  const expiry=new Date(Date.now()+7*86400000).toISOString();
  function payload(kind:Kind,tenant=org):Record<string,unknown> {
    const p_request_id=randomUUID();
    if(kind==='provision')return {p_request_id,p_owner_user_id:recipient.id,p_organization_name:'Fictional customer',p_organization_slug:'workflow-'+randomUUID(),
      p_organization_timezone:'UTC',p_organization_locale:'en-US',p_organization_country_code:'US',p_organization_currency:'USD',p_operator_reason:'Fictional reviewed provisioning'};
    if(kind==='invite')return {p_request_id,p_organization_id:tenant,p_email:`invited-${randomUUID()}@example.test`,p_organization_role:'member',p_production_id:null,p_production_role:null,p_expires_at:expiry};
    const id=randomUUID();
    sql(`insert into public.organization_invitations(id,organization_id,email,organization_role,expires_at,created_by) values('${id}','${tenant}','pending-${id}@example.test','member',now()+interval '7 days','${owner.id}');`);
    return {p_request_id,p_invitation_id:id,p_reason:'Fictional revocation'};
  }
  function changed(kind:Kind,value:Record<string,unknown>) {
    return {...value,...(kind==='provision'?{p_organization_name:'Changed fictional customer'}:kind==='invite'?{p_email:`changed-${randomUUID()}@example.test`}:{p_reason:'Changed fictional reason'})};
  }
  for(const kind of ['provision','invite','revoke'] as Kind[]){
    const value=payload(kind);const first=await invoke(kind,value,owner);
    ensure(first.status===200 && typeof first.data==='string','Initial genuine workflow failed: '+kind);
    const before=state();const repeat=await invoke(kind,value,owner);
    ensure(repeat.status===200 && repeat.data===first.data && state()===before,'Identical replay changed state: '+kind);
    const alternate=payload(kind,otherOrg);
    const variants=kind==='provision' ? [
      {p_owner_user_id:peer.id},{p_organization_name:'Changed name'},{p_organization_slug:'changed-'+randomUUID()},
      {p_organization_timezone:'America/New_York'},{p_organization_locale:'en-GB'},{p_organization_country_code:'GB'},
      {p_organization_currency:'GBP'},{p_operator_reason:'Changed reason'},
    ] : kind==='invite' ? [
      {p_organization_id:otherOrg},{p_email:`different-${randomUUID()}@example.test`},{p_organization_role:'admin'},
      {p_production_id:production,p_production_role:'viewer'},{p_expires_at:new Date(Date.now()+8*86400000).toISOString()},
    ] : [{p_invitation_id:alternate.p_invitation_id},{p_reason:'Changed reason'}];
    const unchanged=state();
    for(const variant of variants){changedStatus(await invoke(kind,{...value,...variant},owner),kind);ensure(state()===unchanged,'Changed replay mutated state');}
    const anotherActor=await invoke(kind,value,peer);
    ensure(anotherActor.status===400 && state()===unchanged,'Another actor reused request key');
    note(kind+': identical replay retains one result; '+variants.length+' changed-input cases '+(vulnerable?'incorrectly acknowledged':'conflict without mutation')+'; other actor denied');

    for(const change of [false,true]){
      const a=payload(kind),b=change?changed(kind,a):a;
      const barrier=await lock('lock table public.audit_events in share mode;');
      try {
        const pendingA=invoke(kind,a,owner);const firstPid=await waitBlocked(barrier.pid);
        const pendingB=invoke(kind,b,owner);await waitBlocked(firstPid);
        await barrier.finish(true);
        const [one,two]=await Promise.all([pendingA,pendingB]);
        ensure(one.status===200,'Concurrent first workflow failed');
        if(change)changedStatus(two,'Concurrent '+kind);else ensure(two.status===200 && two.data===one.data,'Concurrent duplicate did not share result');
        ensure(sql(`select count(*) from public.audit_events where request_id='${a.p_request_id}';`)==='1','Concurrent replay duplicated audit');
        ensure(sql(`select count(*) from private.workflow_requests where action='${actions[kind]}' and request_id='${a.p_request_id}';`)==='1','Concurrent replay duplicated request marker');
        note(kind+': observed same-key lock wait; '+(change?'different payload '+(vulnerable?'incorrectly acknowledged':'conflicts'):'identical payload returns same resource'));
      } finally {await barrier.finish(false);}
    }
  }

  // Force both different-key requests past the old rate count before either
  // audit can commit. Fixed code makes the second wait on the bucket holder.
  for(const kind of ['provision','invite','revoke'] as Kind[]){
    const limit=kind==='provision'?10:kind==='invite'?25:50;
    const scope=`actor_user_id='${owner.id}' and action='${actions[kind]}'${kind==='provision'?'':` and organization_id='${org}'`}`;
    const existing=Number(sql(`select count(*) from public.audit_events where ${scope};`));
    ensure(existing<limit,'Unexpected fictional rate setup');
    sql(`insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,request_id)
      select '${org}','${owner.id}','${actions[kind]}','fictional_rate_seed',gen_random_uuid(),'seed-'||gen_random_uuid()::text from generate_series(1,${limit-1-existing});`);
    const a=payload(kind),b=payload(kind);const before=state();
    const barrier=await lock('lock table public.audit_events in share mode;');
    try {
      const pendingA=invoke(kind,a,owner);const firstPid=await waitBlocked(barrier.pid);
      const pendingB=invoke(kind,b,owner);
      if(vulnerable)await waitSecond(barrier.pid,firstPid);else await waitBlocked(firstPid);
      await barrier.finish(true);
      const [one,two]=await Promise.all([pendingA,pendingB]);
      ensure(one.status===200,'First rate-boundary workflow failed');
      if(vulnerable)ensure(two.status===200,'Expected legacy rate overshoot');
      else ensure(two.status===400 && (two.data as {message?:string}).message==='workflow rate limit exceeded','Second workflow escaped the rate cap');
      ensure(Number(sql(`select count(*) from public.audit_events where ${scope};`))===limit+(vulnerable?1:0),'Unexpected final rate accounting');
      ensure(sql(`select count(*) from private.workflow_requests where action='${actions[kind]}' and request_id='${b.p_request_id}';`)===(vulnerable?'1':'0'),'Rejected rate request retained a marker');
      if(!vulnerable){
        const untouched=kind==='provision'
          ? sql(`select not exists(select 1 from public.organizations where slug='${b.p_organization_slug}');`)
          : kind==='invite'
          ? sql(`select not exists(select 1 from public.organization_invitations where email='${b.p_email}');`)
          : sql(`select status='pending' and revoked_at is null from public.organization_invitations where id='${b.p_invitation_id}';`);
        ensure(untouched==='t','Rejected rate request left a business mutation');
      }
      const beforeReplay=state();ensure((await invoke(kind,a,owner)).data===one.data && state()===beforeReplay,'Identical retry consumed another rate slot');
      ensure(before!==state(),'Rate fixture did not exercise a real mutation');
      note(kind+': different-key concurrent boundary '+(vulnerable?'exceeded cap by one':'admits exactly one, denies one without a marker')+'; replay at cap succeeds');
    } finally {await barrier.finish(false);}
    ensure((await invoke(kind,payload(kind),peer)).status===200,'Rate buckets incorrectly combine distinct actors');
    if(kind!=='provision')ensure((await invoke(kind,payload(kind,otherOrg),owner)).status===200,'Rate buckets incorrectly combine distinct tenants');
  }

  if(!vulnerable){
    const days=payload('invite',otherOrg);delete days.p_expires_at;days.p_expires_in_days=7;
    const first=await invoke('invite',days,peer);ensure(first.status===200,'Days-based invitation endpoint failed');
    ensure((await api('','rpc/create_organization_invitation_with_days','POST',{
      ...days,p_actor_user_id:peer.id,p_actor_aal:peer.aal,p_actor_authenticated_at:peer.authenticatedAt,
    },serviceApiHeaders(serviceKey),serviceKey)).status===401,'Days endpoint accepted missing actor-session binding');
    sql(`update auth.sessions set not_after=now()-interval '1 second' where id='${peer.headers['x-actor-session-id']}';`);
    ensure((await invoke('invite',days,peer)).status===401,'Days endpoint accepted expired actor session');
    sql(`update auth.sessions set not_after=null where id='${peer.headers['x-actor-session-id']}';`);
    const before=state();await delay(30);
    ensure((await invoke('invite',days,peer)).data===first.data && state()===before,'Days-based identical retry changed original expiry/state');
    changedStatus(await invoke('invite',{...days,p_expires_in_days:8},peer),'Changed expiry days');
    const normalized={...days,p_email:' '+String(days.p_email).toUpperCase()+' '};
    ensure((await invoke('invite',normalized,peer)).data===first.data,'Equivalent normalized recipient conflicted');
    for(const invalid of [null,0,31])ensure((await invoke('invite',{...days,p_request_id:randomUUID(),p_expires_in_days:invalid},peer)).status===400,'Invalid expiry days accepted');
    note('days-based HTTP input: unchanged retries preserve expiry, changed days conflict, normalized email matches, invalid days rejected');

    for(const kind of ['provision','invite','revoke'] as Kind[]){
      const value=payload(kind,otherOrg);const trigger='workflow_failure_'+randomUUID().replaceAll('-','');
      const before=state();
      sql(`create function private.${trigger}() returns trigger language plpgsql set search_path='' as $$begin
        if new.request_id='${value.p_request_id}' then raise exception 'Fictional audit failure'; end if;return new;end;$$;
        create trigger ${trigger} before insert on public.audit_events for each row execute function private.${trigger}();`);
      try {
        ensure((await invoke(kind,value,peer)).status===400,'Expected injected audit failure');
        ensure(state()===before,'Audit failure did not roll back workflow state and request marker');
      } finally {sql(`drop trigger ${trigger} on public.audit_events;drop function private.${trigger}();`);}
      ensure((await invoke(kind,value,peer)).status===200,'Failed request could not be retried after rollback');
      note(kind+': injected audit failure rolls back resource/membership/state and idempotency marker; retry succeeds');
    }

    if(args.includes('--next-port')){
      const port=Number(args[args.indexOf('--next-port')+1]);
      ensure(Number.isInteger(port) && port>=1024 && port<=65535 && port!==Number(base.port),'Invalid local application port');
      const origin='http://127.0.0.1:'+port;
      const app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{
        cwd:process.cwd(),stdio:['ignore','pipe','ignore'],env:{PATH:process.env.PATH,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',
          SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',SUPABASE_URL:base.origin,SUPABASE_PUBLISHABLE_KEY:key,SUPABASE_SERVICE_ROLE_KEY:serviceKey},
      });
      let ownedServerReady=false;
      app.stdout.on('data',chunk=>{if(chunk.toString().includes('Ready in'))ownedServerReady=true;});
      const stopped=new Promise(resolve=>app.once('exit',resolve));
      try {
        let ready=false;const deadline=Date.now()+20000;
        while(Date.now()<deadline && app.exitCode===null){
          if(ownedServerReady){try {ready=(await fetch(origin+'/login',{redirect:'error',signal:AbortSignal.timeout(1000)})).status===200;}catch{}}
          if(ready)break;await delay(100);
        }
        ensure(ready,'Built local application did not become ready');
        async function post(path:string,body:Record<string,unknown>,requestId:string){
          const response=await fetch(origin+path,{method:'POST',redirect:'error',headers:{
            authorization:'Bearer '+peer.token,origin,'content-type':'application/json','idempotency-key':requestId,
          },body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
          return {status:response.status,data:await response.json()};
        }
        const cases=[
          {path:'/api/platform/organizations',status:201,field:'organizationId',body:{ownerUserId:recipient.id,name:'Fictional HTTP customer',slug:'http-'+randomUUID(),reason:'Fictional HTTP test'},change:{name:'Different customer'}},
          {path:'/api/platform/invitations',status:201,field:'invitationId',body:{organizationId:otherOrg,email:'http-'+randomUUID()+'@example.test',expiresInDays:30},change:{expiresInDays:29}},
          {path:'/api/platform/invitations/'+payload('revoke',otherOrg).p_invitation_id+'/revoke',status:200,field:'invitationId',body:{reason:'Fictional HTTP revocation'},change:{reason:'Changed reason'}},
        ];
        for(const item of cases){
          const requestId=randomUUID();const first=await post(item.path,item.body,requestId);
          ensure(first.status===item.status && typeof first.data[item.field]==='string','Built HTTP workflow failed: '+item.path+' (HTTP '+first.status+', outcome '+String(first.data.error)+')');
          const before=state();await delay(30);const repeat=await post(item.path,item.body,requestId);
          ensure(repeat.status===item.status && repeat.data[item.field]===first.data[item.field] && state()===before,'Built HTTP retry changed original result/state');
          const conflict=await post(item.path,{...item.body,...item.change},requestId);
          ensure(conflict.status===409 && conflict.data.error==='Request key conflict; review the original result before retrying' && state()===before,'Built HTTP changed-payload handling failed');
          ensure(sql(`select actor_user_id from private.workflow_requests where request_id='${requestId}';`)===peer.id,'Built HTTP workflow lost verified actor binding');
        }
        sql(`update auth.sessions set not_after=now()-interval '1 second' where id='${peer.headers['x-actor-session-id']}';`);
        const before=state();
        ensure((await post('/api/platform/invitations',{organizationId:otherOrg,email:'expired-'+randomUUID()+'@example.test'},randomUUID())).status===401 && state()===before,'Built HTTP request bypassed session expiry');
        note('built Next HTTP routes: all three genuine MFA workflows, delayed identical retries, changed-input 409s, verified actor attribution and expired-session 401 pass');
      } finally {app.kill('SIGTERM');await stopped;}
    }
  }
} finally {await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));}
