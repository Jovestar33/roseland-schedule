// Genuine fictional Auth -> shared local workspace -> existing Data API policies.
// Never accepts credentials or an arbitrary URL; discovers only the named local
// CLI project and refuses any non-loopback request. Synthetic fixtures remain in
// the disposable database; passwords/tokens exist only in memory.
import { execFileSync, spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { createInterface } from 'node:readline';
import { InvitationController } from '../lib/platform/invitation-controller.ts';
import { createInvitationRepository, sendInvitationAttempt } from '../lib/platform/invitation-repository.ts';
import { createWorkspaceRepository } from '../lib/platform/workspace-repository.ts';
import { createSessionScheduleRepository } from '../lib/platform/session-schedule-repository.ts';
import { createAcceptanceRepository } from '../lib/platform/acceptance-repository.ts';
import { AcceptanceController, type AcceptanceAttempt } from '../lib/platform/acceptance-controller.ts';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
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
const proxyOrigin='http://127.0.0.1:3361';
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
const origin='http://127.0.0.1:3363';
const browserMode=args.includes('--serve');
ensure(!['.env','.env.local','.env.production','.env.production.local'].some(file=>existsSync(resolve(file))), 'UI tests require an environment-file-free checkout');
let fault:{path:string;mode:'hold'|'drop'}|null=null;
const held:(()=>void)[]=[];
let app:ReturnType<typeof spawn>|null=null;
function proxyRequest(incoming:import('node:http').IncomingMessage,outgoing:import('node:http').ServerResponse,target:URL){
  const mode=fault && incoming.url?.startsWith(fault.path) && incoming.method!=='OPTIONS'?fault.mode:null;
  if(mode)fault=null;
  const upstream=httpRequest({hostname:target.hostname,port:target.port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,host:incoming.headers.host??target.host}},response=>{
    if(mode){
      const chunks:Buffer[]=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>{
        if(mode==='drop'){outgoing.destroy();return;}
        held.push(()=>{outgoing.writeHead(response.statusCode??502,response.headers);outgoing.end(Buffer.concat(chunks));});
        console.log('CONTROL response held');
      });return;
    }
    outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);
  });
  upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end();});incoming.pipe(upstream);
}
const proxy=createServer((incoming,outgoing)=>proxyRequest(incoming,outgoing,base));
const uiProxy=createServer((incoming,outgoing)=>proxyRequest(incoming,outgoing,new URL('http://127.0.0.1:3362')));
await new Promise<void>((resolve,reject)=>{proxy.once('error',reject);proxy.listen(3361,'127.0.0.1',resolve);});
await new Promise<void>((resolve,reject)=>{uiProxy.once('error',reject);uiProxy.listen(3363,'127.0.0.1',resolve);});
function pass(message:string){console.log('PASS: '+message);}
async function denied(operation:()=>Promise<unknown>,kind:string){try{await operation();throw new Error('Allowed unexpected operation');}catch(error){ensure((error as {kind?:string}).kind===kind,'Unexpected denial kind');}}
function totp(secret:string){const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const char of secret.toUpperCase().replace(/=+$/,'')){const i=alphabet.indexOf(char);ensure(i>=0,'Invalid fictional factor');bits+=i.toString(2).padStart(5,'0');}const bytes=Buffer.from(bits.match(/.{8}/g)!.map(value=>parseInt(value,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const hash=createHmac('sha1',bytes).update(counter).digest(),offset=hash[hash.length-1]&15;return ((hash.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');}
try{
  const owner=await identity('workspace-owner'),admin=await identity('workspace-admin'),viewer=await identity('workspace-viewer'),outside=await identity('workspace-outside'),recipient=await identity('workspace-recipient');
  type Identity=typeof owner;
  function fixture(label:string){const [org,prod,day,schedule]=Array.from({length:4},()=>randomUUID());sql(`begin;
    insert into public.organizations(id,name,slug) values('${org}','Fictional ${label} studio','workspace-${org}');
    insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('${org}','${owner.id}','owner','active',now()),('${org}','${admin.id}','admin','active',now()),('${org}','${viewer.id}','member','active',now());
    insert into public.productions(id,organization_id,name,slug) values('${prod}','${org}','Fictional ${label} production','fictional');
    insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at) values('${org}','${prod}','${viewer.id}','viewer','active',now());
    insert into public.production_days(id,organization_id,production_id,position,created_by,updated_by) values('${day}','${org}','${prod}',0,'${owner.id}','${owner.id}');
    insert into public.schedules(id,organization_id,production_id,production_day_id,display_name,slug,document,created_by,updated_by) values('${schedule}','${org}','${prod}','${day}','Fictional ${label} day','fictional','{"meta":{"town":"${label}"},"rows":[{"action":"Shoot","dur":"00:00","notes":"Fictional ${label} note"}]}','${owner.id}','${owner.id}');commit;`);return {org,prod,day,schedule};}
  const a=fixture('Harbour'),b=fixture('Woodland');
  function invite(who:Identity,productionRole='viewer'){const invitation=randomUUID();sql(`insert into public.organization_invitations(id,organization_id,email,organization_role,production_id,production_role,expires_at,created_by) values('${invitation}','${a.org}','${who.email}','member','${a.prod}','${productionRole}',now()+interval '1 day','${owner.id}');`);return invitation;}
  const ownerRepo=createWorkspaceRepository(owner.c),adminRepo=createWorkspaceRepository(admin.c),viewerRepo=createWorkspaceRepository(viewer.c),outsideRepo=createWorkspaceRepository(outside.c),recipientRepo=createWorkspaceRepository(recipient.c);
  ensure((await ownerRepo.organizations(owner.id)).items.length===2,'Owner directory mismatch');
  ensure((await adminRepo.scope(admin.id,a.org))?.role==='admin','Admin navigation role missing');
  ensure((await viewerRepo.scope(viewer.id,a.org))?.role==='member','Viewer navigation role wrong');
  ensure((await outsideRepo.organizations(outside.id)).items.length===0 && await outsideRepo.scope(outside.id,a.org)===null,'Unauthorized organization exposed');
  ensure((await ownerRepo.schedules(owner.id,a.org)).map(row=>row.id).join()===a.schedule && (await ownerRepo.schedules(owner.id,b.org)).map(row=>row.id).join()===b.schedule,'Schedule directory crossed tenant');
  ensure((await outsideRepo.schedules(outside.id,a.org)).length===0,'Outsider listed schedule');
  ensure(await ownerRepo.canEdit(owner.id,a.prod) && await adminRepo.canEdit(admin.id,a.prod) && !await viewerRepo.canEdit(viewer.id,a.prod),'Existing edit permissions changed');
  pass('actual Owner/Admin/Member roles, own organization directory, tenant-filtered schedules and production edit permission');
  ensure((await recipientRepo.schedules(recipient.id,a.org)).length===0,'Recipient accessed schedule before accepting');
  const invitation=invite(recipient),acceptance=new AcceptanceController();acceptance.bind(recipient.id);acceptance.prepare(invitation);
  await acceptance.execute(createAcceptanceRepository(recipient.c));ensure(acceptance.receipt?.organizationId===a.org,'Acceptance failed');
  ensure((await recipientRepo.scope(recipient.id,a.org))?.role==='member' && (await recipientRepo.schedules(recipient.id,a.org))[0]?.id===a.schedule,'Accepted recipient cannot navigate to schedule');
  ensure(!await recipientRepo.canEdit(recipient.id,a.prod),'Viewer invitation gained edit access');
  const read=createSessionScheduleRepository(recipient.c),record=await read.read(a.schedule);await denied(()=>read.update(record.id,record.document_version,record.document,record.document_schema_version),'unavailable');
  const edit=createSessionScheduleRepository(owner.c),before=await edit.read(a.schedule),saved=await edit.update(before.id,before.document_version,{...before.document,meta:{...before.document.meta,town:'Harbour verified'}},1);ensure(saved.document_version===before.document_version+1,'Owner save failed');
  pass('acceptance grants authorized schedule navigation and read-only view; existing RPC rejects viewer write and accepts owner write');
  const expire=(who:Identity)=>sql(`update auth.sessions set not_after=now()-interval '1 second' where user_id='${who.id}';`);
  expire(recipient);
  for(const action of [()=>recipientRepo.organizations(recipient.id),()=>recipientRepo.scope(recipient.id,a.org),()=>recipientRepo.schedules(recipient.id,a.org),()=>recipientRepo.canEdit(recipient.id,a.prod)])await denied(action,'unauthenticated');
  ensure(!(await recipient.c.auth.signInWithPassword({email:recipient.email,password:recipient.password})).error,'Same-account sign-in failed');
  ensure((await recipientRepo.scope(recipient.id,a.org))?.role==='member','Same-account directory recovery failed');
  sql(`delete from auth.sessions where user_id='${recipient.id}';`);await denied(()=>recipientRepo.schedules(recipient.id,a.org),'unauthenticated');
  ensure(!(await recipient.c.auth.signInWithPassword({email:recipient.email,password:recipient.password})).error,'Revoked account reauthentication failed');
  pass('genuine expired/revoked sessions reject directory, list and permission calls; same-account password reauthentication restores authorized reads');
  // A new recipient remains unjoined for the browser's complete acceptance -> schedule journey.
  const browserRecipient=browserMode?await identity('workspace-browser-recipient'):null;
  const browserInvitation=browserRecipient?invite(browserRecipient):null;
  const serverKey=status.SERVICE_ROLE_KEY;ensure(typeof serverKey==='string','Local workflow server key missing');
  app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3362'],{stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',ROSELAND_LOCAL_WORKSPACE:'supabase',ROSELAND_LOCAL_SUPABASE_URL:base.origin,ROSELAND_LOCAL_SUPABASE_ANON_KEY:key,SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',SUPABASE_URL:base.origin,SUPABASE_PUBLISHABLE_KEY:key,SUPABASE_SERVICE_ROLE_KEY:serverKey}});
  let ready=false;app.stdout!.on('data',chunk=>{if(chunk.toString().includes('Ready in'))ready=true;});
  app.stderr!.on('data',()=>{});const deadline=Date.now()+20000;while(!ready && app.exitCode===null && Date.now()<deadline)await delay(100);ensure(ready,'Owned built app did not start');
  const page=await fetch(origin+'/local-workspace');ensure(page.status===200,'Enabled workspace unavailable');const html=await page.text();ensure(!html.includes(serverKey),'Server credential appeared in page');
  for(const route of ['/local-invitations','/local-schedule','/local-accept-invitation','/platform/setup'])ensure((await fetch(origin+route)).status===404,'Workspace enabled unrelated standalone gate');
  const foreign=await new Promise<number>(resolve=>{const req=httpRequest({hostname:'127.0.0.1',port:3362,path:'/local-workspace',headers:{host:'untrusted.example'}},res=>{res.resume();resolve(res.statusCode??0);});req.end();});ensure(foreign===404,'Foreign host exposed workspace');
  pass('built workspace enabled only on loopback; standalone gates remain 404; server key absent from HTML');
  const enrollment=await admin.c.auth.mfa.enroll({factorType:'totp',friendlyName:'Fictional workspace runtime'});
  ensure(!enrollment.error && enrollment.data.type==='totp','Admin MFA enrollment failed');
  ensure(!(await admin.c.auth.mfa.challengeAndVerify({factorId:enrollment.data.id,code:totp(enrollment.data.totp.secret)})).error,'Admin MFA verification failed');
  const adminSession=(await admin.c.auth.getSession()).data.session!;
  const appFetch:typeof fetch=(input,init)=>{const url=new URL(String(input),origin);ensure(url.origin===origin,'Only owned workspace HTTP requests allowed');return fetch(url,{...init,headers:{...init?.headers,origin},redirect:'error'});};
  for(const mode of ['hold','drop'] as const){
    const operation=new InvitationController(()=>randomUUID());operation.bind(admin.id);
    operation.prepare('create',a.org,{organizationId:a.org,email:`workspace-runtime-${randomUUID()}@example.test`,organizationRole:'member',productionId:null,productionRole:null,expiresInDays:7});
    const original=operation.attempt;fault={path:'/api/platform/invitations',mode};
    const submission=operation.submit(attempt=>sendInvitationAttempt(attempt,adminSession,appFetch));
    if(mode==='hold'){
      const limit=Date.now()+10000;while(!held.length && Date.now()<limit)await delay(50);
      ensure(held.length===1,'Expected held application response');
      ensure(operation.phase==='pending' && (await adminRepo.scope(admin.id,b.org))?.role==='admin','Pending request prevented unrelated authorized scope read');
      for(const release of held.splice(0))release();
    }
    await submission;
    if(mode==='drop'){ensure(operation.phase==='unknown','Dropped response was not uncertain');await operation.check(attempt=>createInvitationRepository(admin.c).result(attempt));}
    ensure(String(operation.phase)==='success' && operation.attempt===original,'Request identity or result lost during transport recovery');
    ensure(sql(`select count(*) from public.audit_events where request_id='${original!.key}' and action='organization.invitation.created';`)==='1','Transport recovery duplicated invitation audit');
  }
  pass('genuine Admin MFA reaches built invitation route with unchanged issuer checks; held response and lost-response lookup retain one immutable request and one creation audit');

  if(browserMode){
    console.log('BROWSER_FIXTURE '+JSON.stringify({url:origin+'/local-workspace',owner:{id:owner.id,email:owner.email,password:owner.password},admin:{id:admin.id,email:admin.email,password:admin.password},viewer:{id:viewer.id,email:viewer.email,password:viewer.password},outside:{id:outside.id,email:outside.email,password:outside.password},recipient:{id:browserRecipient!.id,email:browserRecipient!.email,password:browserRecipient!.password,invitation:browserInvitation},a,b}));
    await new Promise<void>(resolve=>{const input=createInterface({input:process.stdin});input.on('line',line=>{
      if(line==='stop'){input.close();resolve();return;}
      try{
        if(line==='hold-create')fault={path:'/api/platform/invitations',mode:'hold'};
        else if(line==='drop-create')fault={path:'/api/platform/invitations',mode:'drop'};
        else if(line==='release'){for(const release of held.splice(0))release();}
        else if(line==='expire-owner')expire(owner);
        else if(line==='revoke-owner')sql(`delete from auth.sessions where user_id='${owner.id}';`);
        else if(line.startsWith('totp ')){console.log('FICTIONAL_CODE '+totp(line.slice(5).trim()));return;}
        else if(line==='results'){console.log('RESULTS '+sql(`select display_name||':v'||document_version from public.schedules where id in ('${a.schedule}','${b.schedule}') order by display_name;`));console.log('INVITATION_RESULTS '+sql(`select i.id::text||':'||i.status||':created_audits='||(select count(*) from public.audit_events e where e.resource_id=i.id and e.action='organization.invitation.created') from public.organization_invitations i where i.organization_id='${a.org}' order by i.created_at;`));}
        else {console.log('CONTROL unknown');return;}console.log('CONTROL '+line);
      }catch{console.log('CONTROL failed');}
    });input.on('close',resolve);});
  }
}finally{
  for(const release of held.splice(0))release();
  if(app && app.exitCode===null){const stopped=new Promise(resolve=>app!.once('exit',resolve));app.kill('SIGTERM');await stopped;}
  await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));
  await new Promise<void>(resolve=>proxy.close(()=>resolve()));
  await new Promise<void>(resolve=>uiProxy.close(()=>resolve()));
}
