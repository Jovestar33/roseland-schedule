// B10-B organization lifecycle acceptance. Only the preserved, unlinked fictional local stack.
import {execFileSync,spawn} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
const dir='/private/tmp/roseland-b08-20260917',project='roseland-b08-20260917';
function ensure(v:unknown,m:string):asserts v{if(!v)throw Error(m);}
ensure(!existsSync(resolve(dir,'supabase/.temp/project-ref')),'Linked project refused');
ensure(readFileSync(resolve(dir,'supabase/config.toml'),'utf8').includes(`project_id = "${project}"`),'Unexpected project');
const status=JSON.parse(execFileSync(resolve('node_modules/.bin/supabase'),['status','--workdir',dir,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
ensure(status.API_URL==='http://127.0.0.1:56121','Only owned loopback API allowed');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input:RequestInfo|URL,init?:RequestInit)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);ensure(u.origin===status.API_URL,'External request refused');return fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15000)});}}};
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,options),client=()=>createClient(status.API_URL,status.ANON_KEY,options);
function sql(s:string){try{return execFileSync('docker',['exec','-i',`supabase_db_${project}`,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}catch(error){const detail=String((error as {stderr?:Buffer}).stderr??'');throw Error(detail.includes('At least one active Organization Super Admin must remain')?'Last holder protected':detail.includes('organization_read_only')?'Organization read only':'Fictional local SQL failed');}}
function totp(secret:string){let bits='';for(const c of secret.toUpperCase().replace(/=+$/,''))bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g)!.map(v=>parseInt(v,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),o=h.at(-1)!&15;return((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,'0');}
let count=0;function check(v:unknown,m:string){ensure(v,m);console.log('PASS '+m);count++;}
async function identity(label:string){const email=`b10b-${label}-${randomUUID()}@example.test`,password=`Fictional1!${randomBytes(18).toString('hex')}`;
 const r=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{b08_terms:'fictional-terms-v1',b08_privacy:'fictional-privacy-v1'}});ensure(r.data.user&&!r.error,'Fictional user creation failed');const c=client();ensure(!(await c.auth.signInWithPassword({email,password})).error,'Fictional login failed');return {id:r.data.user.id,email,password,c};}
async function ok(c:SupabaseClient,name:string,args:Record<string,unknown>={}){const r=await c.rpc(name,args);ensure(!r.error,`${name}: ${r.error?.code} ${r.error?.message}`);return r.data;}
async function enroll(u:Awaited<ReturnType<typeof identity>>){const r=await u.c.auth.mfa.enroll({factorType:'totp',friendlyName:'B10-B fictional factor'});ensure(r.data&&!r.error,'Enrollment failed');const factor=r.data;

 ensure(!(await u.c.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)})).error,'Verification failed');return {id:factor.id,secret:factor.totp.secret};}
const fixture=JSON.parse(readFileSync('/private/tmp/roseland-b10b-fixtures.json','utf8'));
ensure(fixture.project===project,'Preserved fictional fixture required');
async function existing(a:{id:string;email:string;password:string;factor:{id:string;secret:string}}){const c=client();ensure(!(await c.auth.signInWithPassword({email:a.email,password:a.password})).error,'Fixture sign-in failed');ensure(!(await c.auth.mfa.challengeAndVerify({factorId:a.factor.id,code:totp(a.factor.secret)})).error,'Fixture MFA failed');return {...a,c};}
const owner=await existing(fixture.owner),peer=await existing(fixture.peer),org=fixture.organization,orgArg={target_organization_id:org};
const before=await ok(owner.c,'read_organization_lifecycle',orgArg);ensure(before.state==='active','Active fixture required');
const request=await ok(owner.c,'request_organization_deletion',{...orgArg,request_id:randomUUID(),expected_version:before.version,confirmed:true});
const hold=spawn('docker',['exec','-i',`supabase_db_${project}`,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{stdio:['pipe','pipe','pipe']});
let output='';const locked=new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Local lock fixture timed out')),5000);hold.stdout.on('data',data=>{output+=data.toString();if(output.includes('LOCKED')){clearTimeout(timeout);resolve();}});hold.on('error',reject);});
const ended=new Promise<void>((resolve,reject)=>hold.on('exit',code=>code===0?resolve():reject(Error('Local lock fixture failed'))));
hold.stdin.end(`begin; select pg_advisory_xact_lock(hashtextextended('schedule-policy:'||'${org}',0)); update private.organization_lifecycle set requested_at=statement_timestamp()-interval '30 days'+interval '1 second',cancel_before=statement_timestamp()+interval '1 second' where organization_id='${org}'; select 'LOCKED'; select pg_sleep(1.6); commit;`);
await locked;const started=Date.now();const cancel=await peer.c.rpc('cancel_organization_deletion',{...orgArg,request_id:randomUUID(),expected_version:request.version});await ended;
check(Date.now()-started>=700,'Cancellation waits behind the organization policy lock');
check(cancel.status===409,'Cancellation rechecks deadline after waiting and rejects expired window');
check((await ok(owner.c,'read_organization_lifecycle',orgArg)).state==='awaiting_purge','Serialized expiry remains frozen awaiting purge');
check(sql(`select count(*) from public.schedules where id='${fixture.schedule}';`)==='1','No purge occurs at serialized expiry');
sql(`update private.organization_lifecycle set requested_at=statement_timestamp(),cancel_before=statement_timestamp()+interval '30 days' where organization_id='${org}';`);
const restored=await ok(peer.c,'cancel_organization_deletion',{...orgArg,request_id:randomUUID(),expected_version:request.version});check((await ok(owner.c,'read_organization_lifecycle',orgArg)).state==='active','Fictional deadline reset permits ordinary authorized cancellation');
fixture.version=restored.version;writeFileSync('/private/tmp/roseland-b10b-fixtures.json',JSON.stringify(fixture),{mode:0o600});
console.log(`PASS ${count} focused B10-B serialized deadline checks.`);
