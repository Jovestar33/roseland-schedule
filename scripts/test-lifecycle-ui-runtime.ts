// Genuine fictional Auth -> versioned lifecycle UI transport -> existing SQL/RLS.
// Never accepts credentials or an arbitrary URL; discovers only the named local
// CLI project and refuses any non-loopback request. Synthetic fixtures remain in
// the disposable database; passwords/tokens exist only in memory.
import { execFileSync, spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { createInterface } from 'node:readline';
import { ScheduleLifecycleController, type LifecycleAttempt } from '../lib/platform/schedule-lifecycle-controller.ts';
import { createLifecycleRepository } from '../lib/platform/schedule-lifecycle-repository.ts';
import { createScheduleRepository, type StoredSchedule, type ScheduleLifecycle } from '../lib/platform/schedule-repository.ts';
import { createSessionScheduleRepository } from '../lib/platform/session-schedule-repository.ts';
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
const proxyOrigin='http://127.0.0.1:3371';
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
const origin='http://127.0.0.1:3372';
const browserMode=args.includes('--serve');
ensure(!['.env','.env.local','.env.production','.env.production.local'].some(file=>existsSync(resolve(file))), 'UI tests require an environment-file-free checkout');
const configuredIssuer=config.match(/^jwt_issuer\s*=\s*"([^"]+)"/m)?.[1];
const browserApi=configuredIssuer===proxyOrigin+'/auth/v1'?proxyOrigin:base.origin;
ensure(!browserMode||browserApi===proxyOrigin,'Interactive fault testing requires this disposable Auth project to use the loopback proxy issuer http://127.0.0.1:3371/auth/v1');
let fault:'hold'|'drop'|'unavailable'|null=null,app:ReturnType<typeof spawn>|null=null;
const held:(()=>void)[]=[];
const proxy=createServer((incoming,outgoing)=>{
  const path=incoming.url?.split('?')[0],mode=incoming.method==='POST'&&['/rest/v1/rpc/create_schedule','/rest/v1/rpc/mutate_schedule'].includes(path??'')?fault:null;
  if(mode)fault=null;
  if(mode==='unavailable'){incoming.resume();outgoing.writeHead(503,{'content-type':'application/json','access-control-allow-origin':'*'});outgoing.end(JSON.stringify({message:'Fictional pre-send outage'}));return;}
  const upstream=httpRequest({hostname:base.hostname,port:base.port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,host:base.host}},response=>{
    if(mode){const chunks:Buffer[]=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>{if(mode==='drop'){outgoing.destroy();return;}held.push(()=>{outgoing.writeHead(response.statusCode??502,response.headers);outgoing.end(Buffer.concat(chunks));});console.log('CONTROL lifecycle response held');});return;}
    outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);
  });upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end();});incoming.pipe(upstream);
});
await new Promise<void>((resolve,reject)=>{proxy.once('error',reject);proxy.listen(3371,'127.0.0.1',resolve);});
function pass(message:string){console.log('PASS: '+message);}
async function denied(operation:()=>Promise<unknown>,kind:string){try{await operation();throw new Error('Unexpected authorization');}catch(error){ensure((error as {kind?:string}).kind===kind,'Unexpected denial kind: '+kind);}}
try{
  const owner=await identity('lifecycle-owner'),editor=await identity('lifecycle-editor'),viewer=await identity('lifecycle-viewer'),outside=await identity('lifecycle-outside');
  const repository=createLifecycleRepository(owner.c),editRepository=createLifecycleRepository(editor.c),viewRepository=createLifecycleRepository(viewer.c),outsideRepository=createLifecycleRepository(outside.c),raw=createScheduleRepository(owner.c),editorDocs=createSessionScheduleRepository(editor.c),ownerDocs=createSessionScheduleRepository(owner.c);
  function fixture(label:string){const [org,prod,day]=Array.from({length:3},()=>randomUUID());sql(`begin;
    insert into public.organizations(id,name,slug) values('${org}','Fictional ${label} studio','lifecycle-${org}');
    insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('${org}','${owner.id}','owner','active',now());
    insert into public.productions(id,organization_id,name,slug) values('${prod}','${org}','Fictional ${label} production','fictional');
    insert into public.production_days(id,organization_id,production_id,position,created_by,updated_by) values('${day}','${org}','${prod}',0,'${owner.id}','${owner.id}');commit;`);return {org,prod,day};}
  const a=fixture('Harbour'),b=fixture('Woodland');
  sql(`insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('${a.org}','${editor.id}','member','active',now()),('${a.org}','${viewer.id}','member','active',now()),('${b.org}','${outside.id}','owner','active',now());
    insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at) values('${a.org}','${a.prod}','${editor.id}','editor','active',now()),('${a.org}','${a.prod}','${viewer.id}','viewer','active',now());`);
  function makeCreate(name:string,slug='fixture-'+randomUUID(),scope=a,who=owner){const c=new ScheduleLifecycleController();c.bind(who.id);c.prepareCreate(scope.org,randomUUID(),scope.day,name,slug);return c;}
  async function create(name:string,slug?:string,scope=a){const c=makeCreate(name,slug,scope);await c.execute(repository);ensure(c.phase==='success'&&c.result?.current,'Fictional lifecycle create failed');return c.result.current;}
  async function change(record:StoredSchedule,kind:ScheduleLifecycle,payload:Record<string,unknown>={},sourceVersion?:number){const c=new ScheduleLifecycleController();c.bind(owner.id);const source=sourceVersion?await repository.historical(owner.id,record.organization_id,record.id,sourceVersion):null;c.prepare(record,kind,payload,source??undefined);await c.execute(repository);ensure(c.phase==='success'&&c.result?.current,'Fictional lifecycle '+kind+' failed');return c.result.current;}
  const destinations=await repository.days(owner.id,a.org);ensure(destinations.items[0]?.id===a.day&&destinations.items[0].editable,'Owner destination not available');
  ensure((await editRepository.days(editor.id,a.org)).items[0]?.editable===true && (await viewRepository.days(viewer.id,a.org)).items[0]?.editable===false && (await outsideRepository.days(outside.id,a.org)).items.length===0,'Destination permission boundary failed');
  let item=await create('Lifecycle initial','lifecycle-initial');const original=await repository.historical(owner.id,a.org,item.id,1);
  ensure((await repository.list(owner.id,a.org,'active')).items.some(row=>row.id===item.id),'Created schedule missing from active discovery');
  await denied(()=>outsideRepository.read(outside.id,a.org,item.id),'unavailable');
  const badCreate=makeCreate('Viewer forbidden',undefined,a,viewer);await badCreate.execute(viewRepository);ensure(badCreate.failure==='unavailable','Viewer created a schedule');
  item=await change(item,'rename',{display_name:'Lifecycle renamed',slug:'lifecycle-renamed'});
  item=await change(item,'archive');ensure((await repository.list(owner.id,a.org,'archived')).items.some(row=>row.id===item.id),'Archived discovery missed record');
  item=await change(item,'unarchive');ensure(item.status==='draft'&&item.archived_from_status===null,'Unarchive lost prior status');
  item=await ownerDocs.update(item.id,item.document_version,{meta:{town:'Fictional changed document'},rows:[{notes:'Changed fictional notes'}]},1);
  item=await change(item,'restore_version',{version:1},1);ensure(JSON.stringify(item.document)===JSON.stringify(original!.document),'Document restore did not reproduce source');
  const editorDelete=new ScheduleLifecycleController();editorDelete.bind(editor.id);editorDelete.prepare(item,'delete');await editorDelete.execute(editRepository);ensure(editorDelete.failure==='unavailable','Assigned editor soft-deleted schedule');
  item=await change(item,'delete');ensure((await repository.list(owner.id,a.org,'deleted')).items.some(row=>row.id===item.id),'Deleted discovery missed record');
  ensure((await editRepository.list(editor.id,a.org,'deleted')).items.length===0,'Editor saw admin-only deleted record');await denied(()=>editRepository.read(editor.id,a.org,item.id),'unavailable');
  item=await change(item,'restore');ensure(item.document_version===8&&!item.deleted_at&&item.display_name==='Lifecycle renamed','Recovery lost identity/metadata/version');
  ensure(JSON.stringify(await repository.historical(owner.id,a.org,item.id,1))===JSON.stringify(original),'An immutable old history entry changed');
  ensure((await repository.history(owner.id,a.org,item.id)).items.length===8,'History count mismatch');
  const immutable=await owner.c.from('schedule_versions').update({label:'forbidden rewrite'}).eq('schedule_id',item.id);ensure(!!immutable.error,'History rewrite unexpectedly allowed');
  pass('genuine owner lifecycle create/reopen/rename/archive/unarchive/delete/undelete/document restore, discovery and immutable history; viewer/editor/tenant boundaries hold');

  const colliding=await create('Address collision','already-used');
  const collision=new ScheduleLifecycleController();collision.bind(owner.id);collision.prepare(item,'rename',{display_name:'Collision attempt',slug:colliding.slug});await collision.execute(repository);ensure(collision.phase==='conflict'&&collision.attempt?.expectedVersion===8,'Rename collision did not retain exact version');ensure((await raw.read(item.id)).document_version===8,'Collision mutated schedule');
  const deleted=await change(colliding,'delete');let replacement=await create('Replacement occupant','already-used');
  const recovery=new ScheduleLifecycleController();recovery.bind(owner.id);recovery.prepare(deleted,'restore');await recovery.execute(repository);ensure(recovery.phase==='conflict','Undelete ignored address collision');
  replacement=await change(replacement,'rename',{display_name:'Moved replacement address',slug:'replacement-moved'});await change(deleted,'restore');
  const stale=new ScheduleLifecycleController();stale.bind(owner.id);stale.prepare(item,'restore_version',{version:1},original!);
  const newer=await editorDocs.update(item.id,item.document_version,{meta:{town:'Fictional concurrent editor'},rows:[]},1);await stale.execute(repository);ensure(stale.phase==='conflict'&&stale.attempt?.expectedVersion===8&&(await raw.read(item.id)).document_version===newer.document_version,'Stale restore silently advanced version');
  pass('rename and undelete address collisions remain unchanged; stale restore versus a genuine newer editor save preserves the reviewed expected version');

  for(const mode of ['drop','unavailable'] as const){const c=makeCreate('Uncertain creation');const attempt=c.attempt;fault=mode;await c.execute(repository);ensure(c.phase==='uncertain','Create transport failure not retained');await c.execute(repository);ensure(String(c.phase)==='success'&&c.attempt===attempt&&c.result?.current?.document_version===1,'Create retry did not retain its identity');}
  for(const kind of ['rename','archive','unarchive','delete','restore','restore_version'] as ScheduleLifecycle[]){
    let target=await create('Uncertain '+kind);if(kind==='unarchive')target=await change(target,'archive');if(kind==='restore')target=await change(target,'delete');
    const c=new ScheduleLifecycleController();c.bind(owner.id);const source=kind==='restore_version'?await repository.historical(owner.id,a.org,target.id,1):null;
    c.prepare(target,kind,kind==='rename'?{display_name:'Recovered rename',slug:'recovered-'+randomUUID()}:kind==='restore_version'?{version:1}:{},source??undefined);
    const attempt=c.attempt;fault='drop';await c.execute(repository);ensure(c.phase==='uncertain','Mutation transport failure not retained: '+kind);await c.execute(repository);
    ensure(String(c.phase)==='success'&&c.attempt===attempt&&c.result?.matchedVersion===target.document_version+1,'Mutation reconciliation failed: '+kind);
    ensure(sql(`select count(*) from public.audit_events where resource_id='${target.id}' and action='schedule.${kind}' and metadata->>'from_version'='${target.document_version}';`)==='1','Mutation retry duplicated audit: '+kind);
  }
  const outageTarget=await create('Mutation pre-send outage'),outage=new ScheduleLifecycleController();outage.bind(owner.id);outage.prepare(outageTarget,'archive');fault='unavailable';await outage.execute(repository);ensure(outage.phase==='uncertain','Pre-send mutation outage not uncertain');await outage.execute(repository);ensure(String(outage.phase)==='success'&&outage.result?.matchedVersion===2,'Pre-send mutation retry failed');
  pass('actual dropped creation and all six mutation responses recover by matching immutable history; pre-send outages retry the original identity/version once');

  const heldTarget=await create('Held lifecycle response'),heldOperation=new ScheduleLifecycleController();heldOperation.bind(owner.id);heldOperation.prepare(heldTarget,'archive');fault='hold';const pending=heldOperation.execute(repository);
  const deadline=Date.now()+10000;while(!held.length&&Date.now()<deadline)await delay(50);ensure(held.length===1&&heldOperation.phase==='pending','Lifecycle response not held');
  const committed=await raw.read(heldTarget.id);await editorDocs.update(committed.id,committed.document_version,{meta:{town:'Newer after committed archive'},rows:[]},1);
  for(const release of held.splice(0))release();await pending;await heldOperation.execute(repository,true);
  ensure(heldOperation.result?.matchedVersion===2&&heldOperation.result.current?.document_version===3,'Reconciliation lost matching old history or newer current version');
  pass('held committed response followed by a genuine newer editor save reconciles matching version 2 and current version 3 without replaying the operation');

  const raced=await create('Concurrent lifecycle review');
  const contenders=[new ScheduleLifecycleController(),new ScheduleLifecycleController()];
  contenders[0].bind(owner.id);contenders[1].bind(editor.id);
  for(const contender of contenders)contender.prepare(raced,'archive');
  await Promise.all([contenders[0].execute(repository),contenders[1].execute(editRepository)]);
  ensure(contenders.filter(c=>c.phase==='success').length===1&&contenders.filter(c=>c.phase==='conflict').length===1,'Concurrent reviewed versions did not produce one winner');
  ensure((await raw.read(raced.id)).document_version===2&&sql(`select count(*) from public.audit_events where resource_id='${raced.id}' and action='schedule.archive';`)==='1','Concurrent lifecycle produced duplicate history/audit');
  pass('simultaneous genuine owner/editor archive requests produce one version/audit and one retained stale-version conflict (HTTP concurrency, not a measured lock-wait test)');

  const paging=fixture('Pagination');
  sql(`insert into public.production_days(id,organization_id,production_id,position,created_by,updated_by)
    select gen_random_uuid(),'${paging.org}','${paging.prod}',n,'${owner.id}','${owner.id}' from generate_series(1,26) n;`);
  const dayPage=await repository.days(owner.id,paging.org),dayTail=await repository.days(owner.id,paging.org,dayPage.cursor);
  ensure(dayPage.items.length===25&&dayPage.more&&dayTail.items.length===2&&!dayTail.more&&new Set([...dayPage.items,...dayTail.items].map(d=>d.id)).size===27,'Day cursor omitted or repeated a destination');
  let historicalTarget:StoredSchedule|null=null;
  for(let i=0;i<27;i++)historicalTarget=await create('Pagination '+i,undefined,paging);
  const firstPage=await repository.list(owner.id,paging.org,'active'),lastPage=await repository.list(owner.id,paging.org,'active',firstPage.items.at(-1)!.id);
  ensure(firstPage.items.length===25&&firstPage.more&&lastPage.items.length===2&&!lastPage.more&&new Set([...firstPage.items,...lastPage.items].map(d=>d.id)).size===27,'Schedule cursor omitted or repeated a record');
  for(let i=0;i<26;i++)historicalTarget=await ownerDocs.update(historicalTarget!.id,historicalTarget!.document_version,{meta:{town:'Fictional history '+i},rows:[]},1);
  const recent=await repository.history(owner.id,paging.org,historicalTarget!.id),older=await repository.history(owner.id,paging.org,historicalTarget!.id,recent.items.at(-1)!.version);
  ensure(recent.items.length===25&&recent.more&&older.items.length===2&&!older.more&&[...recent.items,...older.items].every((v,i)=>v.version===27-i),'History cursor order or boundary failed');
  ensure((await outsideRepository.days(outside.id,paging.org)).items.length===0&&(await outsideRepository.list(outside.id,paging.org,'active')).items.length===0,'Pagination disclosed another tenant');
  pass('real 25+2 day, schedule and descending history pages have no gaps/duplicates and preserve tenant visibility');

  const inactive=fixture('Inactive parent'),orphan=await change(await create('Deleted under inactive day',undefined,inactive),'delete');
  sql(`begin;select set_config('request.jwt.claim.sub','${owner.id}',true);update public.production_days set deleted_at=now() where id='${inactive.day}';commit;`);
  const blockedRecovery=new ScheduleLifecycleController();blockedRecovery.bind(owner.id);blockedRecovery.prepare(orphan,'restore');await blockedRecovery.execute(repository);
  ensure(blockedRecovery.failure==='unavailable'&&sql(`select document_version::text||':'||(deleted_at is not null)::text from public.schedules where id='${orphan.id}';`)==='2:true','Inactive parent recovery changed a schedule');
  ensure((await repository.days(owner.id,inactive.org)).items.length===0,'Inactive day offered as destination');
  pass('recovery under a deleted parent is denied without implicit parent restoration or a new schedule version');

  const expirationTarget=await create('Session recovery lifecycle'),reauth=new ScheduleLifecycleController();reauth.bind(owner.id);reauth.prepare(expirationTarget,'archive');const reviewed=reauth.attempt;
  sql(`update auth.sessions set not_after=now()-interval '1 second' where user_id='${owner.id}';`);await reauth.execute(repository);ensure(reauth.failure==='unauthenticated','Expired session changed lifecycle');
  ensure(!(await owner.c.auth.signInWithPassword({email:owner.email,password:owner.password})).error,'Owner reauthentication failed');reauth.bind(owner.id);await reauth.execute(repository);ensure(reauth.phase==='success'&&reauth.attempt===reviewed,'Same-account recovery lost reviewed request');
  sql(`delete from auth.sessions where user_id='${owner.id}';`);await denied(()=>repository.list(owner.id,a.org,'active'),'unauthenticated');ensure(!(await owner.c.auth.signInWithPassword({email:owner.email,password:owner.password})).error,'Revoked session reauthentication failed');
  pass('expired/revoked genuine sessions deny lifecycle and discovery; same-account reauthentication retains the original operation');

  const browserBase=await create('Browser Harbour day','browser-harbour');const browserRecord=await ownerDocs.update(browserBase.id,1,{meta:{town:'Fictional browser original'},rows:[{action:'Shoot',dur:'00:00',notes:'Original fictional note'}]},1);
  const browserCollision=await create('Browser address occupant','browser-collision'),recoverable=await change(await create('Recoverable fictional day','recoverable-fiction'),'delete');
  await create('Browser Woodland day','browser-woodland',b);
  const serviceKey=status.SERVICE_ROLE_KEY;ensure(typeof serviceKey==='string','Local server workflow key missing');
  app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3372'],{stdio:['ignore','pipe','ignore'],env:{PATH:process.env.PATH,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',ROSELAND_LOCAL_WORKSPACE:'supabase',ROSELAND_LOCAL_SUPABASE_URL:browserApi,ROSELAND_LOCAL_SUPABASE_ANON_KEY:key,SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',SUPABASE_URL:browserApi,SUPABASE_PUBLISHABLE_KEY:key,SUPABASE_SERVICE_ROLE_KEY:serviceKey}});
  let ready=false;app.stdout!.on('data',chunk=>{if(chunk.toString().includes('Ready in'))ready=true;});const readyDeadline=Date.now()+20000;while(!ready&&app.exitCode===null&&Date.now()<readyDeadline)await delay(100);ensure(ready,'Built lifecycle app did not start');
  const page=await fetch(origin+'/local-workspace?screen=lifecycle&org='+a.org);ensure(page.status===200&&!(await page.text()).includes(serviceKey),'Workspace route or server-key boundary failed');
  for(const path of ['/local-schedule','/local-invitations','/local-accept-invitation','/platform/setup'])ensure((await fetch(origin+path)).status===404,'Unrelated local gate enabled');
  const foreign=await new Promise<number>(resolve=>{const r=httpRequest({hostname:'127.0.0.1',port:3372,path:'/local-workspace',headers:{host:'untrusted.example'}},response=>{response.resume();resolve(response.statusCode??0);});r.end();});ensure(foreign===404,'Foreign Host exposed workspace');
  pass('built lifecycle workspace retains loopback, secret and standalone-route gates');
  if(browserMode){
    console.log('BROWSER_FIXTURE '+JSON.stringify({url:origin+'/local-workspace',owner:{id:owner.id,email:owner.email,password:owner.password},editor:{id:editor.id,email:editor.email,password:editor.password},viewer:{id:viewer.id,email:viewer.email,password:viewer.password},outside:{id:outside.id,email:outside.email,password:outside.password},a,b,browserSchedule:browserRecord.id,collisionSchedule:browserCollision.id,recoverable:recoverable.id}));
    await new Promise<void>(resolve=>{const input=createInterface({input:process.stdin});input.on('line',async line=>{
      if(line==='stop'){input.close();resolve();return;}
      try{if(['hold','drop','unavailable'].includes(line))fault=line as typeof fault;else if(line==='release'){for(const release of held.splice(0))release();}
        else if(line==='expire')sql(`update auth.sessions set not_after=now()-interval '1 second' where user_id='${owner.id}';`);
        else if(line==='revoke')sql(`delete from auth.sessions where user_id='${owner.id}';`);
        else if(line==='concurrent'){const current=await editorDocs.read(browserRecord.id);await editorDocs.update(current.id,current.document_version,{...current.document,meta:{...current.document.meta,town:'Concurrent fictional editor update'}},1);}
        else if(line==='results'){console.log('RESULTS '+sql(`select id::text||':'||display_name||':v'||document_version||':'||status||':deleted='||(deleted_at is not null)::text from public.schedules where organization_id='${a.org}' and (id='${browserRecord.id}' or display_name like 'UI %' or id='${recoverable.id}') order by id;`));}
        else {console.log('CONTROL unknown');return;}console.log('CONTROL '+line);
      }catch{console.log('CONTROL failed');}
    });input.on('close',resolve);});
  }
}finally{
  for(const release of held.splice(0))release();if(app&&app.exitCode===null){const stopped=new Promise(resolve=>app!.once('exit',resolve));app.kill('SIGTERM');await stopped;}
  await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));await new Promise<void>(resolve=>proxy.close(()=>resolve()));
}
