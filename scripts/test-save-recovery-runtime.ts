// B01: genuine fictional Auth -> ordinary save recovery -> unchanged SQL/RLS.
// Never accepts credentials or an arbitrary URL; discovers only the named local
// CLI project and refuses any non-loopback request. Synthetic fixtures remain in
// the disposable database. Tokens are not printed; --serve emits generated
// fixture passwords only to its interactive terminal, never to an artifact.
import { execFileSync, spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { createInterface } from 'node:readline';
import { LocalEditorController } from '../lib/platform/local-editor-controller.ts';
import { createSaveRecoveryRepository, type SaveRecoveryRepository } from '../lib/platform/schedule-save-recovery.ts';
import { sameJson } from '../lib/platform/schedule-lifecycle-controller.ts';
import type { ScheduleData } from '../lib/types.ts';
import { createScheduleRepository, ScheduleRepositoryError, type StoredSchedule } from '../lib/platform/schedule-repository.ts';
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
const proxyOrigin='http://127.0.0.1:3391';
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
const origin='http://127.0.0.1:3392',browserMode=args.includes('--serve');
ensure(!['.env','.env.local','.env.production','.env.production.local'].some(file=>existsSync(resolve(file))), 'Environment-file-free checkout required');
const issuer=config.match(/^jwt_issuer\s*=\s*"([^"]+)"/m)?.[1];
const browserApi=issuer===proxyOrigin+'/auth/v1'?proxyOrigin:base.origin;
ensure(!browserMode||browserApi===proxyOrigin,'Browser fault injection requires disposable proxy issuer http://127.0.0.1:3391/auth/v1');
let app:ReturnType<typeof spawn>|null=null,fault:'hold'|'drop'|'unavailable'|'malformed'|null=null;
let holdRead=false;
const held:(()=>void)[]=[],writes:{path:string;body:string;mode:string|null}[]=[];
const proxy=createServer((incoming,outgoing)=>{
 const isSave=incoming.method==='POST'&&incoming.url==='/rest/v1/rpc/session_update_schedule_document';
 const isHeldRead=holdRead&&incoming.method==='POST'&&incoming.url==='/rest/v1/rpc/session_read_schedule';
 const mode=isSave?fault:isHeldRead?'hold':null;if(isSave&&mode)fault=null;if(isHeldRead)holdRead=false;
 const chunks:Buffer[]=[];incoming.on('data',chunk=>chunks.push(chunk));incoming.on('end',()=>{
  const body=Buffer.concat(chunks);if(isSave)writes.push({path:incoming.url!,body:body.toString(),mode});
  const fail=()=>{outgoing.writeHead(503,{'content-type':'application/json','access-control-allow-origin':'*'});outgoing.end('{"message":"Fictional ambiguous save failure"}');};
  if(mode==='unavailable'){fail();return;}
  const upstream=httpRequest({hostname:base.hostname,port:base.port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,host:base.host}},response=>{
   if(mode){const received:Buffer[]=[];response.on('data',chunk=>received.push(chunk));response.on('end',()=>{
    if(mode==='drop'){fail();return;}
    if(mode==='malformed'){const data=JSON.parse(Buffer.concat(received).toString());data.document.meta.town='Mismatched acknowledgement';outgoing.writeHead(200,{'content-type':'application/json','access-control-allow-origin':'*'});outgoing.end(JSON.stringify(data));return;}
    held.push(()=>{outgoing.writeHead(response.statusCode??502,response.headers);outgoing.end(Buffer.concat(received));});console.log('CONTROL '+(isSave?'save':'read')+' response held');
   });return;}
   outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);
  });upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end();});upstream.end(body);
 });
});
await new Promise<void>((resolve,reject)=>{proxy.once('error',reject);proxy.listen(3391,'127.0.0.1',resolve);});
function pass(message:string){console.log('PASS: '+message);}
async function denied(op:()=>Promise<unknown>,kind:string){try{await op();throw new Error('Unexpected authorization');}catch(e){ensure(e instanceof ScheduleRepositoryError&&e.kind===kind,'Expected '+kind);}}
type Identity=Awaited<ReturnType<typeof identity>>;
function controller(user:Identity,record:StoredSchedule){
 let actor=user.id,doc=structuredClone(record.document) as ScheduleData,dirty=true,loads=0;
 const state={documentSession:1,editRevision:1,getScheduleData:()=>doc,markClean:()=>{dirty=false;}};
 const repo:SaveRecoveryRepository=createSaveRecoveryRepository(user.c,()=>actor);
 const c=new LocalEditorController(repo,{getState:()=>state,load:r=>{loads++;doc=structuredClone(r.document) as ScheduleData;state.documentSession++;state.editRevision++;dirty=false;}});c.bind(actor);c.record=record;
 return {c,repo,state,edit(town:string){doc={...doc,meta:{...doc.meta,town}};state.editRevision++;dirty=true;},setDocument(next:ScheduleData){doc=next;state.editRevision++;dirty=true;},dirty:()=>dirty,loads:()=>loads,doc:()=>doc,changeActor(next:string){actor=next;c.bind(next);}};
}
function counts(id:string){return sql(`select document_version||':'||(select count(*) from public.schedule_versions where schedule_id=s.id) from public.schedules s where id='${id}';`);}
async function waitHeld(){const deadline=Date.now()+10000;while(!held.length&&Date.now()<deadline)await delay(50);ensure(held.length===1,'Expected one held save response');}
try{
 const owner=await identity('save-owner'),editor=await identity('save-editor'),viewer=await identity('save-viewer'),outside=await identity('save-outsider');
 const a={org:randomUUID(),prod:randomUUID(),day:randomUUID()},b={org:randomUUID(),prod:randomUUID(),day:randomUUID()};
 for(const [index,x] of [a,b].entries())sql(`begin;insert into public.organizations(id,name,slug) values('${x.org}','B01 fictional ${index?'Woodland':'Harbor'} studio','b01-${x.org}');
 insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('${x.org}','${owner.id}','owner','active',now());
 insert into public.productions(id,organization_id,name,slug) values('${x.prod}','${x.org}','Fictional production','fictional');
 insert into public.production_days(id,organization_id,production_id,position,created_by,updated_by) values('${x.day}','${x.org}','${x.prod}',0,'${owner.id}','${owner.id}');commit;`);
 sql(`insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('${a.org}','${editor.id}','member','active',now()),('${a.org}','${viewer.id}','member','active',now());
 insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at) values('${a.org}','${a.prod}','${editor.id}','editor','active',now()),('${a.org}','${a.prod}','${viewer.id}','viewer','active',now());`);
 const raw=createScheduleRepository(owner.c),edits=createSessionScheduleRepository(editor.c);
 const create=(name:string,scope=a)=>raw.create(randomUUID(),scope.day,name,'b01-'+randomUUID(),{meta:{town:'Fictional original',date:'2026-10-20',callsheet:{notes:'Fictional crew notes'}},rows:[{action:'Shoot',dur:'00:00',notes:'Fictional original note',contactName:'Example Contact',contactTitle:'Producer',contactEmail:'example@example.test',contactPhone:'+1 202 555 0142',subLocations:[{id:'one',loc:'Fictional lane',done:false}]}]},1);
 let record=await create('Held ordinary save'),h=controller(owner,record);h.edit('Held attempted town');fault='hold';const pending=h.c.save();await waitHeld();ensure(await h.c.save()===false,'Duplicate save dispatched');h.edit('Newer draft');h.edit('Held attempted town');for(const release of held.splice(0))release();ensure(await pending&&h.dirty()&&h.c.record?.document_version===2&&counts(record.id)==='2:2','Held save corrupted baseline/draft/history');
 pass('B01-01 genuine held ordinary save sends once, advances one version and preserves newer edit/undo revision');
 for(const mode of ['drop','malformed'] as const){record=await create('Uncertain '+mode);h=controller(owner,record);h.edit('Attempt '+mode);fault=mode;await denied(()=>h.c.save(),'failed');const attempt=h.c.attempt!,beforeWrites=writes.length;h.edit('Later local edit');await h.c.recover();ensure(!h.c.attempt&&h.c.result?.state==='matched'&&h.c.record?.document_version===2&&h.dirty()&&h.loads()===0&&h.doc().meta.town==='Later local edit'&&writes.length===beforeWrites&&counts(record.id)==='2:2'&&attempt.document.meta?.town==='Attempt '+mode,'Uncertain committed result not recovered exactly');}
 pass('B01-02/05 lost and malformed committed acknowledgements confirm immutable history without resend or replacing newer draft');
 record=await create('Pre-send outage');h=controller(owner,record);h.edit('Exact attempted payload');fault='unavailable';await denied(()=>h.c.save(),'failed');const exact=h.c.attempt!;await h.c.recover();ensure(h.c.result?.state==='retryable'&&counts(record.id)==='1:1','Outage not retryable');h.edit('Unsent newer draft');await h.c.recover(true);ensure(!h.c.attempt&&h.dirty()&&h.doc().meta.town==='Unsent newer draft'&&sameJson((await raw.read(record.id)).document,exact.document)&&counts(record.id)==='2:2','Retry substituted draft or duplicated history');
 pass('B01-03 pre-send failure checks baseline then retries the exact frozen document/version while retaining newer draft');
 record=await create('Other writer first');h=controller(owner,record);h.edit('Stale local attempt');await edits.update(record.id,1,{...record.document,meta:{town:'Other writer first'}},1);await denied(()=>h.c.save(),'conflict');await h.c.recover();ensure(h.c.result?.state==='different'&&h.c.record?.document_version===1&&counts(record.id)==='2:2','Conflict adopted newer baseline');
 record=await create('Other writer after commit');h=controller(owner,record);h.edit('Committed then lost');fault='drop';await denied(()=>h.c.save(),'failed');await edits.update(record.id,2,{...record.document,meta:{town:'Newer server data'}},1);await h.c.recover();ensure(h.c.result?.state==='matched'&&h.c.result.currentVersion===3&&h.c.record?.document_version===2&&!!h.c.attempt&&h.dirty()&&await h.c.save()===false&&await h.c.recover(true)===false,'Later version was adopted or overwritten');
 record=await create('Other writer races retry');h=controller(owner,record);h.edit('Retry candidate');fault='unavailable';await denied(()=>h.c.save(),'failed');await h.c.recover();const originalProbe=h.repo.probe;h.repo.probe=async attempt=>{const result=await originalProbe(attempt);await edits.update(record.id,1,{...record.document,meta:{town:'Racing writer'}},1);return result;};await denied(()=>h.c.recover(true),'conflict');ensure(h.c.attempt?.before.document_version===1&&counts(record.id)==='2:2','Retry race ignored SQL version');
 pass('B01-04 other-writer first/after-commit/between-probe-and-retry cases retain drafts and never overwrite or adopt newer server baseline');
 record=await create('Session recovery');h=controller(owner,record);h.edit('Retained expired attempt');sql(`update auth.sessions set not_after=now()-interval '1 second' where user_id='${owner.id}';`);await denied(()=>h.c.save(),'unauthenticated');const expiredAttempt=h.c.attempt;await denied(()=>h.c.recover(),'unauthenticated');ensure(!(await owner.c.auth.signInWithPassword({email:owner.email,password:owner.password})).error,'Same-account login failed');h.c.bind(owner.id);await h.c.recover();await h.c.recover(true);ensure(!h.c.attempt&&counts(record.id)==='2:2'&&expiredAttempt?.before.document_version===1,'Same-account exact recovery failed');
 record=await create('Revoked and suspended recovery');h=controller(owner,record);h.edit('Revoked retained attempt');fault='drop';await denied(()=>h.c.save(),'failed');sql(`delete from auth.sessions where user_id='${owner.id}';`);await denied(()=>h.c.recover(),'unauthenticated');ensure(!(await owner.c.auth.signInWithPassword({email:owner.email,password:owner.password})).error,'Revoked login failed');
 sql(`begin;select set_config('request.jwt.claim.sub','${owner.id}',true);update public.organization_memberships set status='suspended' where organization_id='${a.org}' and user_id='${owner.id}';commit;`);await h.c.recover();ensure(h.c.result?.state==='unavailable'&&h.c.attempt&&counts(record.id)==='2:2','Removed authority leaked result');
 sql(`begin;select set_config('request.jwt.claim.sub','${owner.id}',true);update public.organization_memberships set status='active' where organization_id='${a.org}' and user_id='${owner.id}';commit;`);await h.c.recover();ensure(!h.c.attempt&&String(h.c.result?.state)==='matched','Restored fictional authority could not confirm saved state');
 for(const user of [viewer,outside]){const deniedController=controller(user,await create('Role denial'));deniedController.edit('Forbidden');await denied(()=>deniedController.c.save(),'unavailable');ensure(counts(deniedController.c.record!.id)==='1:1','Unauthorized save mutated state');}
 pass('B01-06 genuine session expiry/revocation, password reauthentication, membership suspension and viewer/outsider saves enforce current Auth/RLS without losing attempt');
 record=await create('Late account result');h=controller(owner,record);h.edit('Old account send');fault='hold';const old=h.c.save();await waitHeld();h.changeActor(outside.id);for(const release of held.splice(0))release();ensure(await old===false&&!h.c.attempt&&!h.c.record,'Late old actor result survived account binding');
 pass('B01-07 a held admitted write may commit, but changed actor clears attempt and rejects its late acknowledgement');
 record=await create('Large optional fixture');h=controller(owner,record);const large={meta:{town:'Large fictional fixture',date:'2026-10-20',lat:35,lng:-78,callsheet:{notes:'Fictional\nmultiline'},wx:{sunrise:'6:00 AM',sunset:'7:00 PM'}},rows:Array.from({length:300},(_,i)=>({action:'Shoot',timeIn:'9:00 AM',dur:i%2?'00:15':'00:00',fixedIn:i===0,notes:'Optional full text '.repeat(60),contactName:'Fictional Crew',contactTitle:'Camera',contactEmail:'crew@example.test',contactPhone:'+1 202 555 0182',subLocations:[{id:'sub-'+i,loc:'Fictional workshop',done:false}]})),savedAt:12345} as unknown as ScheduleData;h.setDocument(large);fault='drop';await denied(()=>h.c.save(),'failed');const immutable=h.c.attempt!;await h.c.recover();ensure(!h.c.attempt&&sameJson((await raw.read(record.id)).document,immutable.document)&&counts(record.id)==='2:2','Large optional document changed');
 pass('B01-09 300-row optional/contact/callsheet/sub-location/zero/fixed/weather payload is preserved exactly through lost acknowledgement recovery');
 const browserRecord=await create('B01 Harbor day'),woodland=await create('B01 Woodland day',b);
 const serviceKey=status.SERVICE_ROLE_KEY;ensure(typeof serviceKey==='string','Local server workflow key missing');
 app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3392'],{stdio:['ignore','pipe','ignore'],env:{PATH:process.env.PATH,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',ROSELAND_LOCAL_WORKSPACE:'supabase',ROSELAND_LOCAL_SUPABASE_URL:browserApi,ROSELAND_LOCAL_SUPABASE_ANON_KEY:key,SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',SUPABASE_URL:browserApi,SUPABASE_PUBLISHABLE_KEY:key,SUPABASE_SERVICE_ROLE_KEY:serviceKey}});
 let ready=false;app.stdout!.on('data',chunk=>{if(chunk.toString().includes('Ready in'))ready=true;});const deadline=Date.now()+20000;while(!ready&&app.exitCode===null&&Date.now()<deadline)await delay(100);ensure(ready,'Built B01 app not ready');
 const page=await fetch(origin+'/local-workspace');const html=await page.text();ensure(page.status===200&&!html.includes(serviceKey),'Workspace gate or secret boundary failed');for(const route of ['/local-schedule','/local-invitations','/local-accept-invitation','/platform/setup'])ensure((await fetch(origin+route)).status===404,'Independent local gate enabled');
 const foreign=await new Promise<number>(resolve=>{const r=httpRequest({hostname:'127.0.0.1',port:3392,path:'/local-workspace',headers:{host:'untrusted.example'}},response=>{response.resume();resolve(response.statusCode??0);});r.end();});ensure(foreign===404,'Foreign Host exposed local workspace');
 pass('B01-10 built workspace stays loopback-only, independent routes disabled, service key absent and default legacy routes untouched');
 if(browserMode){
 console.log('BROWSER_FIXTURE '+JSON.stringify({url:origin+'/local-workspace',owner:{id:owner.id,email:owner.email,password:owner.password},editor:{id:editor.id,email:editor.email,password:editor.password},viewer:{id:viewer.id,email:viewer.email,password:viewer.password},outside:{id:outside.id,email:outside.email,password:outside.password},a,b,browserSchedule:browserRecord.id,woodland:woodland.id}));
 await new Promise<void>(resolve=>{const input=createInterface({input:process.stdin});input.on('line',async line=>{if(line==='stop'){input.close();resolve();return;}try{
 if(['hold','drop','unavailable','malformed'].includes(line))fault=line as typeof fault;
 else if(line==='hold-check')holdRead=true;
 else if(line==='release'){for(const release of held.splice(0))release();}
 else if(line==='expire')sql(`update auth.sessions set not_after=now()-interval '1 second' where user_id='${owner.id}';`);
 else if(line==='revoke')sql(`delete from auth.sessions where user_id='${owner.id}';`);
 else if(line==='concurrent'){const r=await edits.read(browserRecord.id);await edits.update(r.id,r.document_version,{...r.document,meta:{...r.document.meta,town:'Concurrent fictional writer'}},1);}
 else if(line==='results'){console.log('SAVE_REQUEST_COUNTS '+JSON.stringify(writes.filter(w=>JSON.parse(w.body).target_schedule_id===browserRecord.id).map(w=>({mode:w.mode,version:JSON.parse(w.body).expected_version}))));console.log('RESULTS '+sql(`select document_version||':'||(select count(*) from public.schedule_versions where schedule_id=s.id)||':'||(document->'meta'->>'town') from public.schedules s where id='${browserRecord.id}';`));}
 else if(line==='suspend')sql(`begin;select set_config('request.jwt.claim.sub','${owner.id}',true);update public.organization_memberships set status='suspended' where organization_id='${a.org}' and user_id='${owner.id}';commit;`);
 else if(line==='restore-access')sql(`begin;select set_config('request.jwt.claim.sub','${owner.id}',true);update public.organization_memberships set status='active' where organization_id='${a.org}' and user_id='${owner.id}';commit;`);
 else {console.log('CONTROL unknown');return;}console.log('CONTROL '+line);
 }catch{console.log('CONTROL failed');}});input.on('close',resolve);});
 }
}finally{
 for(const release of held.splice(0))release();if(app&&app.exitCode===null){const stopped=new Promise(resolve=>app!.once('exit',resolve));app.kill('SIGTERM');await stopped;}
 await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));await new Promise<void>(resolve=>proxy.close(()=>resolve()));
}
