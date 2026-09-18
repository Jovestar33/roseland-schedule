// Existing sensitive workflow: retained exact request after ordinary MFA challenge.
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHmac,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const f=JSON.parse(readFileSync('/private/tmp/roseland-b09-fixtures.json','utf8'));
const dir='/private/tmp/roseland-b08-20260917';
if(f.project!=='roseland-b08-20260917'||f.origin!=='http://127.0.0.1:3435'||existsSync(dir+'/supabase/.temp/project-ref'))throw Error('Owned local fixture required');
const s=JSON.parse(execFileSync(resolve('node_modules/.bin/supabase'),['status','--workdir',dir,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
if(s.API_URL!=='http://127.0.0.1:56121')throw Error('Local Auth required');
const c=createClient(s.API_URL,s.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
function check(v:unknown,m:string){if(!v)throw Error(m);console.log('PASS '+m);}
const a=f.owner;check(!(await c.auth.signInWithPassword({email:a.email,password:a.password})).error,'Genuine fixture password sign-in');
const request=randomUUID(),body=JSON.stringify({organizationId:f.organization,email:`b09-invite-${request}@example.test`,organizationRole:'member',productionId:f.production,productionRole:'viewer',expiresInDays:7});
async function send(){return fetch(f.origin+'/api/platform/invitations',{method:'POST',headers:{origin:f.origin,'content-type':'application/json','idempotency-key':request,authorization:'Bearer '+(await c.auth.getSession()).data.session!.access_token},body,redirect:'error'});}
check((await send()).status===403,'Existing sensitive invitation denied before MFA');
let bits='';for(const char of a.factor.secret)bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g)!.map(x=>parseInt(x,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),offset=h.at(-1)!&15,code=((h.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
check(!(await c.auth.mfa.challengeAndVerify({factorId:a.factor.id,code})).error,'Genuine ordinary MFA challenge');
const first=await send(),firstBody=await first.json();check(first.status===201,'Retained exact sensitive request succeeds after MFA');
const repeated=await send(),repeatBody=await repeated.json();check(repeated.status===201&&repeatBody.invitationId===firstBody.invitationId,'Lost-acknowledgment retry returns same invitation');
// Trusted context without assurance must fail closed; browser-supplied headers were covered separately.
const result=execFileSync('docker',['exec','-i','supabase_db_roseland-b08-20260917','psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{encoding:'utf8',input:`begin; select set_config('request.jwt.claims','{"role":"service_role"}',true) is not null; select set_config('request.headers','{"x-actor-user-id":"${a.id}"}',true) is not null; select public.mfa_organization_access('${f.organization}'); rollback;`,stdio:['pipe','pipe','pipe']});
check(result.trim().split('\n').at(-1)==='f','Missing trusted service assurance is false, not null');
await c.auth.signOut({scope:'local'});
