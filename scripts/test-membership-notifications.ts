// B10-A local mail-sink delivery failure and retry.
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHmac,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const f=JSON.parse(readFileSync('/private/tmp/roseland-b10-fixtures.json','utf8'));
const dir='/private/tmp/roseland-b08-20260917';
if(f.project!=='roseland-b08-20260917'||existsSync(dir+'/supabase/.temp/project-ref'))throw Error('Owned local fixture required');
const s=JSON.parse(execFileSync(resolve('node_modules/.bin/supabase'),['status','--workdir',dir,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
if(s.API_URL!=='http://127.0.0.1:56121')throw Error('Local Auth required');
const c=createClient(s.API_URL,s.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
function check(v:unknown,m:string){if(!v)throw Error(m);console.log('PASS '+m);}
const a=f.owner;check(!(await c.auth.signInWithPassword({email:a.email,password:a.password})).error,'Genuine fixture password sign-in');
const origin='http://127.0.0.1:3435';
async function send(event=f.suspendEvent){return fetch(origin+'/api/platform/local-membership-notifications',{method:'POST',headers:{origin,'content-type':'application/json',authorization:'Bearer '+(await c.auth.getSession()).data.session!.access_token},body:JSON.stringify({organizationId:f.organization,eventId:event}),redirect:'error'});}
check((await send()).status===403,'Notice delivery requires MFA');
let bits='';for(const char of a.factor.secret)bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g)!.map(x=>parseInt(x,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),offset=h.at(-1)!&15,code=((h.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');
check(!(await c.auth.mfa.challengeAndVerify({factorId:a.factor.id,code})).error,'Genuine MFA for local delivery');
const mailContainer='supabase_inbucket_roseland-b08-20260917';
try{
 execFileSync('docker',['stop',mailContainer],{stdio:'pipe'});
 const failed=await send();check(failed.ok&&(await failed.json()).state==='failed','Unavailable local mail is recorded as failed');
}finally{execFileSync('docker',['start',mailContainer],{stdio:'pipe'});}
const first=await send();check(first.ok&&(await first.json()).state==='delivered','Failed local notification retries successfully');
const repeat=await send();check(repeat.ok&&(await repeat.json()).state==='delivered','Confirmed delivery retry is already delivered');
const restored=await send(f.restoreEvent);check(restored.ok&&(await restored.json()).state==='delivered','Reinstatement notice delivered');
const messages=await(await fetch('http://127.0.0.1:56124/api/v1/messages')).json();
const delivered=messages.messages.filter((m:{To:{Address:string}[];Subject:string})=>m.To?.some(t=>t.Address===f.memberEmail)&&m.Subject.startsWith('Organization membership'));
check(delivered.length===2,'Mail sink contains exactly suspension and reinstatement notices for fixture');
function sql(q:string){return execFileSync('docker',['exec','-i','supabase_db_roseland-b08-20260917','psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{encoding:'utf8',input:q,stdio:['pipe','pipe','pipe']}).trim();}
check(sql(`select status from public.organization_memberships where id='${f.membership}';`)==='active','Delivery failure/retry does not change membership');
check(sql(`select attempts from private.administration_notification_outbox where event_id='${f.suspendEvent}';`)==='2','One failed and one successful claim; confirmed retry does not resend');
check((await c.rpc('claim_membership_notification',{p_actor_user_id:a.id,p_organization_id:f.organization,p_event_id:f.suspendEvent,p_claim_id:randomUUID()})).error!==null,'Browser role cannot call service-only delivery claim');
console.log('PASS 11 focused B10-A notification assertions.');
await c.auth.signOut({scope:'local'});
