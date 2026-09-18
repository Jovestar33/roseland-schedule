// B10-B lifecycle notices to all Super Admins.
import {readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHmac,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const f=JSON.parse(readFileSync('/private/tmp/roseland-b10b-fixtures.json','utf8'));
const dir='/private/tmp/roseland-b08-20260917';
if(f.project!=='roseland-b08-20260917'||existsSync(dir+'/supabase/.temp/project-ref'))throw Error('Owned local fixture required');
const s=JSON.parse(execFileSync(resolve('node_modules/.bin/supabase'),['status','--workdir',dir,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
if(s.API_URL!=='http://127.0.0.1:56121')throw Error('Local Auth required');
const c=createClient(s.API_URL,s.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
function check(v:unknown,m:string){if(!v)throw Error(m);console.log('PASS '+m);}
const a=f.owner;check(!(await c.auth.signInWithPassword({email:a.email,password:a.password})).error,'Genuine fixture password sign-in');
const origin='http://127.0.0.1:3435';
async function send(event:string,recipient:string){return fetch(origin+'/api/platform/local-organization-notifications',{method:'POST',headers:{origin,'content-type':'application/json',authorization:'Bearer '+(await c.auth.getSession()).data.session!.access_token},body:JSON.stringify({organizationId:f.organization,eventId:event,recipientId:recipient}),redirect:'error'});}
check((await send(f.requestEvent,a.id)).status===403,'Lifecycle delivery requires genuine MFA');
function code(secret:string){let bits='';for(const char of secret)bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g)!.map(x=>parseInt(x,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const h=createHmac('sha1',key).update(counter).digest(),o=h.at(-1)!&15;return((h.readUInt32BE(o)&0x7fffffff)%1000000).toString().padStart(6,'0');}
check(!(await c.auth.mfa.challengeAndVerify({factorId:a.factor.id,code:code(a.factor.secret)})).error,'Genuine MFA for lifecycle delivery');
async function rpc(client:typeof c,name:string,args:Record<string,unknown>){const r=await client.rpc(name,args);if(r.error)throw Error(name+': '+r.error.message);return r.data;}
function sql(q:string){return execFileSync('docker',['exec','-i','supabase_db_roseland-b08-20260917','psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{encoding:'utf8',input:q,stdio:['pipe','pipe','pipe']}).trim();}
const args={target_organization_id:f.organization},before=await rpc(c,'read_organization_lifecycle',args),event=randomUUID();
check(before.state==='active','Notification fixture starts active');
const requested=await rpc(c,'request_organization_deletion',{...args,request_id:event,expected_version:before.version,confirmed:true});
const recipients=sql(`select recipient_id from private.administration_notification_outbox where event_id='${event}' order by recipient_id;`).split('\n');
check(recipients.length===f.ownerCount,'Request creates one notice per Super Admin');
const mail='supabase_inbucket_roseland-b08-20260917';
try{execFileSync('docker',['stop',mail],{stdio:'pipe'});const failed=await send(event,a.id);check(failed.ok&&(await failed.json()).state==='failed','Mail outage records failed lifecycle delivery while organization stays frozen');}finally{execFileSync('docker',['start',mail],{stdio:'pipe'});}
for(const recipient of recipients){const r=await send(event,recipient);if(!r.ok||(await r.json()).state!=='delivered')throw Error('Local lifecycle delivery failed');}
check(sql(`select count(*) from private.administration_notification_outbox where event_id='${event}' and delivery_state='delivered';`)===String(recipients.length),'All Super Admin request notices delivered after retry');
const repeat=await send(event,a.id);check(repeat.ok&&(await repeat.json()).state==='delivered'&&sql(`select attempts from private.administration_notification_outbox where event_id='${event}' and recipient_id='${a.id}';`)==='2','Confirmed retry does not resend notice');
check((await rpc(c,'read_organization_lifecycle',args)).state==='pending_deletion','Mail delivery does not cancel read-only state');
const inviteEmail=`b10b-frozen-${randomUUID()}@example.test`;const invite=await fetch(origin+'/api/platform/invitations',{method:'POST',headers:{origin,'content-type':'application/json','idempotency-key':randomUUID(),authorization:'Bearer '+(await c.auth.getSession()).data.session!.access_token},body:JSON.stringify({organizationId:f.organization,email:inviteEmail,organizationRole:'member',productionId:null,productionRole:null,expiresInDays:7}),redirect:'error'});
check(!invite.ok&&sql(`select count(*) from public.organization_invitations where email='${inviteEmail}';`)==='0','Existing service invitation route cannot write into pending organization');
const peer=createClient(s.API_URL,s.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
check(!(await peer.auth.signInWithPassword({email:f.peer.email,password:f.peer.password})).error&&!(await peer.auth.mfa.challengeAndVerify({factorId:f.peer.factor.id,code:code(f.peer.factor.secret)})).error,'Different Super Admin signs in with genuine MFA');
const cancelEvent=randomUUID(),cancelled=await rpc(peer,'cancel_organization_deletion',{...args,request_id:cancelEvent,expected_version:requested.version});
for(const recipient of recipients){const r=await send(cancelEvent,recipient);if(!r.ok||(await r.json()).state!=='delivered')throw Error('Cancellation notice delivery failed');}
check(sql(`select count(*) from private.administration_notification_outbox where event_id='${cancelEvent}' and delivery_state='delivered';`)===String(recipients.length),'All Super Admin cancellation notices delivered');
const messages=await(await fetch('http://127.0.0.1:56124/api/v1/messages')).json();check(messages.messages.some((m:{Subject:string})=>m.Subject==='Organization deletion requested')&&messages.messages.some((m:{Subject:string})=>m.Subject==='Organization deletion cancelled'),'Mail sink contains both lifecycle notice types');
check((await rpc(c,'read_organization_lifecycle',args)).state==='active','Organization remains active after cancellation notice delivery');
check((await c.rpc('claim_organization_lifecycle_notice',{p_actor_user_id:a.id,p_organization_id:f.organization,p_event_id:event,p_recipient_id:a.id,p_claim_id:randomUUID()})).error!==null,'Browser role cannot call service delivery claim directly');
console.log('PASS 15 focused B10-B HTTP/notification assertions.');
await c.auth.signOut({scope:'local'});await peer.auth.signOut({scope:'local'});
