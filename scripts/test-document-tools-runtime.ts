import { documentFixture, emptyDocumentFixture } from '../tests/fixtures/document-fixtures.ts';
import { recalcRows } from '../lib/time.ts';
import { contactsCsv, documentContacts } from '../lib/document-tools.ts';
// B02: genuine fictional Auth -> full document round trip -> unchanged SQL/RLS.
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
await new Promise<void>((resolve,reject)=>{proxy.once('error',reject);proxy.listen(3401,'127.0.0.1',resolve);});
function pass(message:string){console.log('PASS: '+message);}
async function denied(op:()=>Promise<unknown>,kind:string){try{await op();throw new Error('Unexpected authorization');}catch(e){ensure(e instanceof ScheduleRepositoryError&&e.kind===kind,'Expected '+kind);}}

try {
 const owner=await identity('documents-owner'),editor=await identity('documents-editor'),viewer=await identity('documents-viewer'),outside=await identity('documents-outsider');
 const a={org:randomUUID(),prod:randomUUID(),day:randomUUID()},b={org:randomUUID(),prod:randomUUID(),day:randomUUID()};
 for(const [index,x] of [a,b].entries())sql(`begin;insert into public.organizations(id,name,slug) values('${x.org}','B02 fictional ${index?'Woodland':'Harbor'} studio','b02-${x.org}');
 insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('${x.org}','${owner.id}','owner','active',now());
 insert into public.productions(id,organization_id,name,slug) values('${x.prod}','${x.org}','Fictional production','fictional');
 insert into public.production_days(id,organization_id,production_id,position,created_by,updated_by) values('${x.day}','${x.org}','${x.prod}',0,'${owner.id}','${owner.id}');commit;`);
 sql(`insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('${a.org}','${editor.id}','member','active',now()),('${a.org}','${viewer.id}','member','active',now());
 insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at) values('${a.org}','${a.prod}','${editor.id}','editor','active',now()),('${a.org}','${a.prod}','${viewer.id}','viewer','active',now());`);
 const raw=createScheduleRepository(owner.c),editRepo=createSessionScheduleRepository(editor.c),readRepo=createSessionScheduleRepository(viewer.c),outsideRepo=createSessionScheduleRepository(outside.c);
 const records:StoredSchedule[]=[];
 for(const [name,doc,scope] of [['B02 ordinary fictional day',documentFixture(),a],['B02 long fictional day',documentFixture(32),a],['B02 empty fictional day',emptyDocumentFixture(),a],['B02 Woodland fictional day',documentFixture(),b]] as const) {
  const record=await raw.create(randomUUID(),scope.day,name,'b02-'+randomUUID(),doc,1);records.push(record);
  ensure(sameJson((await raw.read(record.id)).document,doc),'Created fixture lost fields');
 }
 const edited=structuredClone(records[0].document);edited.meta!.callsheet!.notes+='\nRuntime exact saved ending';
 const saved=await editRepo.update(records[0].id,1,edited,1);
 ensure(saved.document_version===2&&sameJson((await editRepo.read(saved.id)).document,edited),'Full field authenticated round trip failed');
 ensure(sameJson((await readRepo.read(saved.id)).document,edited),'Viewer read changed document');
 await denied(()=>readRepo.update(saved.id,2,documentFixture(),1),'unavailable');
 await denied(()=>outsideRepo.read(saved.id),'unavailable');
 await denied(()=>readRepo.read(records[3].id),'unavailable');
 pass('B02 full optional/long/nested/contact/callsheet/weather fields survive genuine editor save/reload; viewer writes and cross-tenant reads denied');
 const artifact=resolve('evidence/b02-documents');mkdirSync(artifact+'/runs',{recursive:true});
 const manifestName=artifact+'/runs/'+new Date().toISOString().replace(/[:.]/g,'-')+'-manifest.json';
 writeFileSync(manifestName,JSON.stringify({project,api:base.origin,app:origin,actors:{owner:owner.id,editor:editor.id,viewer:viewer.id,outside:outside.id},a,b,records:records.map(r=>({id:r.id,name:r.display_name,organization:r.organization_id})),fictional:true},null,2));
 writeFileSync(artifact+'/long-fixture.json',JSON.stringify(documentFixture(32),null,2));
 writeFileSync(artifact+'/expected-contacts.csv',contactsCsv(documentContacts(recalcRows(documentFixture(32).rows))));
 const serviceKey=status.SERVICE_ROLE_KEY;ensure(typeof serviceKey==='string','Local workflow key missing');
 app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3402'],{stdio:['ignore','pipe','ignore'],env:{PATH:process.env.PATH,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',ROSELAND_LOCAL_WORKSPACE:'supabase',ROSELAND_LOCAL_SUPABASE_URL:browserApi,ROSELAND_LOCAL_SUPABASE_ANON_KEY:key,SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',SUPABASE_URL:browserApi,SUPABASE_PUBLISHABLE_KEY:key,SUPABASE_SERVICE_ROLE_KEY:serviceKey}});
 let ready=false;app.stdout!.on('data',chunk=>{if(chunk.toString().includes('Ready in'))ready=true;});const deadline=Date.now()+20000;while(!ready&&app.exitCode===null&&Date.now()<deadline)await delay(100);ensure(ready,'Built B02 app not ready');
 const page=await fetch(origin+'/local-workspace');const html=await page.text();ensure(page.status===200&&!html.includes(serviceKey),'Workspace gate or secret boundary failed');
 pass('B02 built local workspace serves without exposing server workflow key');
 if(browserMode){console.log('BROWSER_FIXTURE '+JSON.stringify({url:origin+'/local-workspace',owner:{email:owner.email,password:owner.password},editor:{email:editor.email,password:editor.password},viewer:{email:viewer.email,password:viewer.password},a,b}));
  await new Promise<void>(resolve=>{const input=createInterface({input:process.stdin});input.on('line',line=>{if(line==='stop'){input.close();resolve();}else if(line==='expire'){sql(`update auth.sessions set not_after=now()-interval '1 second' where user_id='${owner.id}';`);console.log('CONTROL expired');}else if(line==='results'){console.log('DOCUMENT_CHECK '+JSON.stringify(records.map(r=>({id:r.id,version:sql(`select document_version from public.schedules where id='${r.id}';`)}))));}});input.on('close',resolve);});
 }
}finally{
 for(const release of held.splice(0))release();if(app&&app.exitCode===null){const stopped=new Promise(resolve=>app!.once('exit',resolve));app.kill('SIGTERM');await stopped;}
 await Promise.all(clients.map(c=>c.auth.signOut({scope:'local'})));await new Promise<void>(resolve=>proxy.close(()=>resolve()));
}
