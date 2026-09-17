import { createScheduleFileRepository } from '../lib/platform/schedule-file-repository.ts';
import { ScheduleFileImport, parseScheduleFile, documentHash } from '../lib/platform/schedule-files.ts';
import { documentFixture, emptyDocumentFixture } from '../tests/fixtures/document-fixtures.ts';
import { recalcRows } from '../lib/time.ts';
import { contactsCsv, documentContacts } from '../lib/document-tools.ts';
// B04: genuine fictional Auth -> full document round trip -> unchanged SQL/RLS.
// Never accepts credentials or an arbitrary URL; discovers only the named local
// CLI project and refuses any non-loopback request. Synthetic fixtures remain in
// the disposable database. Tokens are not printed; --serve emits generated
// fixture passwords only to its interactive terminal, never to an artifact.
import { execFileSync, spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { createInterface } from 'node:readline';
import { sameJson } from '../lib/platform/schedule-lifecycle-controller.ts';
import { createScheduleRepository, ScheduleRepositoryError, type StoredSchedule } from '../lib/platform/schedule-repository.ts';
import { createSessionScheduleRepository } from '../lib/platform/session-schedule-repository.ts';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
const proxyOrigin='http://127.0.0.1:3401';
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
  // Admin SQL sets up fictional actors/data only. Exercised schedule calls use
  // genuine password sessions and the existing session admission/RLS contract.
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
const origin='http://127.0.0.1:3402',browserMode=args.includes('--serve');
ensure(!['.env','.env.local','.env.production','.env.production.local'].some(file=>existsSync(resolve(file))), 'Environment-file-free checkout required');
const issuer=config.match(/^jwt_issuer\s*=\s*"([^"]+)"/m)?.[1];
const browserApi=issuer===proxyOrigin+'/auth/v1'?proxyOrigin:base.origin;
ensure(!browserMode||browserApi===proxyOrigin,'Browser fault injection requires disposable proxy issuer http://127.0.0.1:3401/auth/v1');
let app:ReturnType<typeof spawn>|null=null,fault:'hold'|'drop'|'unavailable'|'malformed'|null=null;
let holdRead=false;
const held:(()=>void)[]=[],writes:{path:string;body:string;mode:string|null}[]=[];
const proxy=createServer((incoming,outgoing)=>{
 const isSave=incoming.method==='POST'&&incoming.url==='/rest/v1/rpc/create_schedule';
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
await new Promise<void>((resolve,reject)=>{proxy.once('error',reject);proxy.listen(3401,'127.0.0.1',resolve);});
function pass(message:string){console.log('PASS: '+message);}
async function denied(op:()=>Promise<unknown>,kind:string){try{await op();throw new Error('Unexpected authorization');}catch(e){ensure(e instanceof ScheduleRepositoryError&&e.kind===kind,'Expected '+kind);}}

try {
 const owner=await identity('files-owner'),editor=await identity('files-editor'),viewer=await identity('files-viewer'),outside=await identity('files-outsider');
 const a={org:randomUUID(),prod:randomUUID(),day:randomUUID()},b={org:randomUUID(),prod:randomUUID(),day:randomUUID()};
 for(const [index,x] of [a,b].entries())sql(`begin;insert into public.organizations(id,name,slug) values('${x.org}','B04 fictional ${index?'Woodland':'Harbor'} studio','b04-${x.org}');
 insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('${x.org}','${owner.id}','owner','active',now());
 insert into public.productions(id,organization_id,name,slug) values('${x.prod}','${x.org}','Fictional production','fictional');
 insert into public.production_days(id,organization_id,production_id,position,created_by,updated_by) values('${x.day}','${x.org}','${x.prod}',0,'${owner.id}','${owner.id}');commit;`);
 sql(`insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('${a.org}','${editor.id}','member','active',now()),('${a.org}','${viewer.id}','member','active',now());
 insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at) values('${a.org}','${a.prod}','${editor.id}','editor','active',now()),('${a.org}','${a.prod}','${viewer.id}','viewer','active',now());`);
 const raw=createScheduleRepository(owner.c),editRepo=createSessionScheduleRepository(editor.c),readRepo=createSessionScheduleRepository(viewer.c),outsideRepo=createSessionScheduleRepository(outside.c);
 const records:StoredSchedule[]=[];
 for(const [name,doc,scope] of [['B04 ordinary fictional day',documentFixture(),a],['B04 long fictional day',documentFixture(32),a],['B04 empty fictional day',emptyDocumentFixture(),a],['B04 Woodland fictional day',documentFixture(),b]] as const) {
  const record=await raw.create(randomUUID(),scope.day,name,'b04-'+randomUUID(),doc,1);records.push(record);
  ensure(sameJson((await raw.read(record.id)).document,doc),'Created fixture lost fields');
 }
 const edited=structuredClone(records[0].document);edited.meta!.callsheet!.notes+='\nRuntime exact saved ending';
 const saved=await editRepo.update(records[0].id,1,edited,1);
 ensure(saved.document_version===2&&sameJson((await editRepo.read(saved.id)).document,edited),'Full field authenticated round trip failed');
 ensure(sameJson((await readRepo.read(saved.id)).document,edited),'Viewer read changed document');
 await denied(()=>readRepo.update(saved.id,2,documentFixture(),1),'unavailable');
 await denied(()=>outsideRepo.read(saved.id),'unavailable');
 await denied(()=>readRepo.read(records[3].id),'unavailable');
 pass('B04 full optional/long/nested/contact/callsheet/weather fields survive genuine editor save/reload; viewer writes and cross-tenant reads denied');
 const artifact=resolve('evidence/b04-files');mkdirSync(artifact+'/runs',{recursive:true});
 const manifestName=artifact+'/runs/'+new Date().toISOString().replace(/[:.]/g,'-')+'-manifest.json';
 writeFileSync(manifestName,JSON.stringify({project,api:base.origin,app:origin,actors:{owner:owner.id,editor:editor.id,viewer:viewer.id,outside:outside.id},a,b,records:records.map(r=>({id:r.id,name:r.display_name,organization:r.organization_id})),fictional:true},null,2));
 const files=createScheduleFileRepository(owner.c),viewFiles=createScheduleFileRepository(viewer.c);
 const sourceBefore=await raw.read(records[0].id);
 for(let i=0;i<50;i++) records.push(await raw.create(randomUUID(),a.day,`B04 pagination ${i+1}`,`page-${i+1}`,emptyDocumentFixture(),1));
 const archived=await raw.mutate(records[2].id,1,'archive');
 const deleted=await raw.mutate(archived.id,archived.document_version,'delete');
 const exported=await files.exportAll(owner.id);
 ensure(exported.schedules.length===54,'All-authorized export pagination incomplete');
 ensure(exported.schedules.some(e=>e.source?.id===records[3].id)&&exported.schedules.some(e=>e.source?.id===deleted.id&&!!e.source.deletedAt),'Cross-org/readable deleted export incomplete');
 const parsed=await parseScheduleFile(JSON.stringify(exported),'');
 ensure(parsed.length===54&&await documentHash(parsed[0].data)===parsed[0].sha256,'Export hash round trip failed');
 const viewerExport=await viewFiles.exportAll(viewer.id);ensure(viewerExport.schedules.length===52&&!viewerExport.schedules.some(e=>e.source?.organization===b.org||e.source?.deletedAt),'Viewer export isolation failed');
 const outsideFiles=createScheduleFileRepository(outside.c);ensure((await outsideFiles.exportAll(outside.id)).schedules.length===0,'Outsider export leak');
 pass('B04 genuine Auth all-authorized export paginates 54 records, includes readable deleted/cross-org records, and excludes viewer/outsider denied records');
 const currentDraft=structuredClone(sourceBefore.document);currentDraft.meta!.callsheet!.notes+='\nB04 unsaved fictional draft';
 const copy=new ScheduleFileImport(owner.id,a.org,a.day,[{name:'B04 runtime copy',slug:'b04-runtime-copy',data:currentDraft}]);
 await files.preflight(owner.id,a.org,a.day,[{name:'B04 runtime copy',slug:'b04-runtime-copy',data:currentDraft}]);
 currentDraft.meta!.callsheet!.notes+='\nNewer edits remain local';
 await copy.execute(files.lifecycle,()=>true);ensure(copy.complete,'Copy failed');
 const copied=await raw.read(copy.items[0].attempt!.id);ensure(sameJson(copied.document,copy.items[0].attempt!.document)&&!sameJson(copied.document,currentDraft),'Current draft capture changed');
 ensure(sameJson(await raw.read(sourceBefore.id),sourceBefore),'Source changed while copying');
 let duplicate=false;try{await files.preflight(owner.id,a.org,a.day,[{name:copied.display_name,slug:'unique-slug',data:copied.document}]);}catch{duplicate=true;}ensure(duplicate,'Duplicate name preflight allowed');
 const deniedImport=new ScheduleFileImport(viewer.id,a.org,a.day,[{name:'Denied viewer copy',slug:'denied-viewer-copy',data:currentDraft}]);await deniedImport.execute(viewFiles.lifecycle,()=>true);ensure(deniedImport.items[0].failure==='unavailable','Viewer create allowed');
 const cross=new ScheduleFileImport(viewer.id,b.org,b.day,[{name:'Denied cross tenant',slug:'denied-cross-tenant',data:currentDraft}]);await cross.execute(viewFiles.lifecycle,()=>true);ensure(cross.items[0].failure==='unavailable','Cross tenant create allowed');
 const batch=new ScheduleFileImport(owner.id,a.org,a.day,[1,2,3].map(i=>({name:'B04 recovered '+i,slug:'b04-recovered-'+i,data:parsed[0].data})));
 let lost=true;const sends:string[]=[];
 const losing={probe:files.lifecycle.probe,async send(attempt:Parameters<typeof files.lifecycle.send>[0]){sends.push(attempt.id);const r=await files.lifecycle.send(attempt);if(attempt.name==='B04 recovered 2'&&lost){lost=false;throw new ScheduleRepositoryError('failed');}return r;}};
 await batch.execute(losing,()=>true);ensure(batch.items[0].phase==='success'&&batch.items[1].phase==='uncertain'&&batch.items[2].phase==='review','Partial failure was not retained');
 await batch.execute(losing,()=>true);ensure(batch.complete&&sends.length===3&&new Set(sends).size===3,'Unknown creation duplicated during recovery');
 for(const c of batch.items)ensure(sameJson((await raw.read(c.attempt!.id)).document,c.attempt!.document),'Imported full document differs');
 pass('B04 genuine Auth current-draft copy/source preservation, duplicate preflight, denied viewer/cross-tenant creation and partial lost-ack recovery passed');
 const importSample={format:'roseland-schedules',version:1,schedules:[{name:'B04 browser import one',data:documentFixture()},{name:'B04 browser import two',data:documentFixture()}]};
 writeFileSync(artifact+'/runtime-export.json',JSON.stringify(exported,null,2));
 writeFileSync(artifact+'/browser-import.json',JSON.stringify(importSample,null,2));
 writeFileSync(artifact+'/browser-invalid.json','{"format":"roseland-schedules","version":1,"schedules":[{"name":"Partial"}]}');
 writeFileSync(artifact+'/runtime-results.json',JSON.stringify({fictional:true,allReadable:54,viewerReadable:52,outsideReadable:0,copy:copy.receipt(),recovered:batch.receipt(),sourceUnchanged:true,hashRoundTrip:true,duplicateNameDenied:true,viewerAndTenantCreateDenied:true},null,2));
 writeFileSync(manifestName,JSON.stringify({project,api:base.origin,app:origin,actors:{owner:owner.id,editor:editor.id,viewer:viewer.id,outside:outside.id},a,b,records:records.map(r=>({id:r.id,name:r.display_name,organization:r.organization_id})),created:copy.receipt().concat(batch.receipt()),fictional:true},null,2));
 const serviceKey=status.SERVICE_ROLE_KEY;ensure(typeof serviceKey==='string','Local workflow key missing');
 app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3402'],{stdio:['ignore','pipe','ignore'],env:{PATH:process.env.PATH,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',ROSELAND_LOCAL_WORKSPACE:'supabase',ROSELAND_LOCAL_SUPABASE_URL:browserApi,ROSELAND_LOCAL_SUPABASE_ANON_KEY:key,SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',SUPABASE_URL:browserApi,SUPABASE_PUBLISHABLE_KEY:key,SUPABASE_SERVICE_ROLE_KEY:serviceKey}});
 let ready=false;app.stdout!.on('data',chunk=>{if(chunk.toString().includes('Ready in'))ready=true;});const deadline=Date.now()+20000;while(!ready&&app.exitCode===null&&Date.now()<deadline)await delay(100);ensure(ready,'Built B04 app not ready');
 const page=await fetch(origin+'/local-workspace');const html=await page.text();ensure(page.status===200&&!html.includes(serviceKey),'Workspace gate or secret boundary failed');
 pass('B04 built local workspace serves without exposing server workflow key');
 if(browserMode){console.log('BROWSER_FIXTURE '+JSON.stringify({url:origin+'/local-workspace',owner:{email:owner.email,password:owner.password},editor:{email:editor.email,password:editor.password},viewer:{email:viewer.email,password:viewer.password},a,b}));
  await new Promise<void>(resolve=>{const input=createInterface({input:process.stdin});input.on('line',line=>{if(line==='stop'){input.close();resolve();}else if(line==='drop-create'){fault='drop';console.log('CONTROL next create acknowledgement will be lost');}else if(line==='fail-create'){fault='unavailable';console.log('CONTROL next create will fail before send');}else if(line==='hold-create'){fault='hold';console.log('CONTROL next create response will be held');}else if(line==='release'){for(const release of held.splice(0))release();console.log('CONTROL released');}else if(line==='expire'){sql(`update auth.sessions set not_after=now()-interval '1 second' where user_id='${owner.id}';`);console.log('CONTROL expired');}else if(line==='results'){console.log('DOCUMENT_CHECK '+JSON.stringify(records.map(r=>({id:r.id,version:sql(`select document_version from public.schedules where id='${r.id}';`)}))));}});input.on('close',resolve);});
 }
}finally{
 for(const release of held.splice(0))release();if(app&&app.exitCode===null){const stopped=new Promise(resolve=>app!.once('exit',resolve));app.kill('SIGTERM');await stopped;}
 await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));await new Promise<void>(resolve=>proxy.close(()=>resolve()));
}
