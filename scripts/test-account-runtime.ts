// Fictional loopback Auth/mail/account acceptance. Never accepts credentials.
import { execFileSync, spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { parseAccountCallback, FICTIONAL_TERMS, FICTIONAL_PRIVACY } from '../lib/platform/account-session.ts';

function ensure(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const args=process.argv.slice(2),dir=args[args.indexOf('--workdir')+1];
ensure(args.includes('--workdir')&&dir,'Specify disposable --workdir');
ensure(!existsSync(resolve(dir,'supabase/.temp/project-ref')),'Linked project refused');
const config=readFileSync(resolve(dir,'supabase/config.toml'),'utf8'),project=config.match(/^project_id\s*=\s*"([\w-]+)"/m)?.[1];
ensure(project?.startsWith('roseland-b08-'),'Owned B08 project required');
const container=`supabase_db_${project}`;
const info=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
ensure(info.Name===`/${container}`&&info.Config.Image.includes('supabase/postgres'),'Local database required');
const status=JSON.parse(execFileSync(resolve('node_modules/.bin/supabase'),['status','--workdir',resolve(dir),'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const base=new URL(status.API_URL),port=config.match(/\[api\][\s\S]*?\nport\s*=\s*(\d+)/)?.[1];
ensure(base.protocol==='http:'&&base.hostname==='127.0.0.1'&&base.port===port,'Only configured loopback API');
const smtpPort=config.match(/\[local_smtp\][\s\S]*?\nport\s*=\s*(\d+)/)?.[1];ensure(smtpPort,'Local mail sink required');
const mailOrigin=`http://127.0.0.1:${smtpPort}`,origin='http://127.0.0.1:3435';
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(base.origin,status.SERVICE_ROLE_KEY,options);
const client=()=>createClient(base.origin,status.ANON_KEY,options);
const sql=(statement:string)=>{try{return execFileSync('docker',['exec','-i',container,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:statement,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}catch(error){const diagnostic=String((error as {stderr?:unknown}).stderr??'').split('\n').find(line=>line.startsWith('ERROR:'))??'details withheld';throw new Error('Fictional fixture SQL failed: '+diagnostic);}};
const results:string[]=[],failures:string[]=[];
function pass(message:string){results.push(message);console.log('PASS '+message);}
const password=()=>`Fictional1!${randomBytes(20).toString('hex')}`;
const email=(label:string)=>`b08-${label}-${randomUUID()}@example.test`;
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
let app:ReturnType<typeof spawn>|null=null,dropMail=false;
const proxy=createServer((incoming,outgoing)=>{
 const drop=dropMail&&incoming.url==='/api/platform/local-account/mail';if(drop)dropMail=false;
 const upstream=httpRequest({hostname:'127.0.0.1',port:3434,path:incoming.url,method:incoming.method,headers:incoming.headers},response=>{
  if(drop){response.resume();response.on('end',()=>{outgoing.writeHead(502);outgoing.end('Uncertain test reply');});return;}
  outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);
 });upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end();});incoming.pipe(upstream);
});
async function identity(label:string){const address=email(label),pw=password();const r=await admin.auth.admin.createUser({email:address,password:pw,email_confirm:true,app_metadata:{b08_terms:FICTIONAL_TERMS,b08_privacy:FICTIONAL_PRIVACY}});ensure(!r.error&&r.data.user,'Synthetic account create failed');const c=client();const login=await c.auth.signInWithPassword({email:address,password:pw});ensure(login.data.session,'Synthetic account sign in failed: '+(login.error?.code??'unknown'));return{email:address,password:pw,id:r.data.user.id,c};}
async function requestMail(action:string,address:string,invitationId?:string,accepted=true){return fetch(origin+'/api/platform/local-account/mail',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({action,email:address,...(action==='signup'?{invitationId,accepted}:{})}),redirect:'error'});}
async function message(address:string,type:'invite'|'recovery'){
 const mailbox=address;
 for(let attempt=0;attempt<50;attempt++){
  const listing=await fetch(`${mailOrigin}/api/v1/messages?limit=1000`);ensure(listing.ok,'Mail sink unavailable');
  const values=await listing.json();
  for(const entry of values.messages.filter((item:{To:{Address:string}[]})=>item.To.some(to=>to.Address===mailbox))){
   const response=await fetch(`${mailOrigin}/api/v1/message/${entry.ID}`),body=await response.json();
   const html=body.HTML??'';const match=html.match(/href="([^"]+)"/);
   if(!match)continue;const url=new URL(match[1].replaceAll('&amp;','&'));
   ensure(url.origin===origin&&url.pathname==='/local-workspace','Unexpected mail redirect');
   const callback=parseAccountCallback(url.hash);if(callback?.type===type)return{url:url.href,callback};
  }
  await delay(100);
 }throw new Error('Expected local mail not captured');
}
function totp(secret:string){let bits='';for(const char of secret.replace(/=+$/,'').toUpperCase())bits+='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char).toString(2).padStart(5,'0');const key=Buffer.from(bits.match(/.{8}/g)!.map(x=>parseInt(x,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const digest=createHmac('sha1',key).update(counter).digest(),offset=digest.at(-1)!&15;return((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');}
try{
 const settings=await(await fetch(base.origin+'/auth/v1/settings',{headers:{apikey:status.ANON_KEY}})).json();
 ensure(settings.disable_signup===true&&settings.mailer_autoconfirm===false,'B08 requires disabled public signup and email verification');
 const publicSignup=await client().auth.signUp({email:email('uninvited'),password:password()});ensure(publicSignup.error,'Public signup succeeded');pass('provider public signup disabled; verification enabled');
 ensure(!['.env','.env.local','.env.production','.env.production.local'].some(file=>existsSync(resolve(file))),'Environment-file-free checkout required');
 await new Promise<void>((resolve,reject)=>{proxy.once('error',reject);proxy.listen(3435,'127.0.0.1',resolve);});
 app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3434'],{stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',ROSELAND_LOCAL_WORKSPACE:'supabase',ROSELAND_LOCAL_ACCOUNTS:'supabase',ROSELAND_LOCAL_SUPABASE_URL:base.origin,ROSELAND_LOCAL_SUPABASE_ANON_KEY:status.ANON_KEY,ROSELAND_LOCAL_ACCOUNT_SERVICE_KEY:status.SERVICE_ROLE_KEY,SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',SUPABASE_URL:base.origin,SUPABASE_PUBLISHABLE_KEY:status.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY}});
 let ready=false;app.stdout!.on('data',chunk=>{if(chunk.toString().includes('Ready in'))ready=true;});app.stderr!.on('data',()=>{});
 for(let i=0;i<200&&!ready&&app.exitCode===null;i++)await delay(100);ensure(ready,'Built local app unavailable');
 const page=await fetch(origin+'/local-workspace');ensure(page.status===200,'Workspace route unavailable');ensure(!(await page.text()).includes(status.SERVICE_ROLE_KEY),'Server key leaked in HTML');
 const foreign=await fetch(origin+'/api/platform/local-account/mail',{method:'POST',headers:{origin:'https://untrusted.example','content-type':'application/json'},body:'{}'});ensure(foreign.status===403,'Foreign origin accepted');
 const hostile=await fetch(origin+'/api/platform/local-account/mail',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({action:'recovery',email:email('hostile'),redirectTo:'https://untrusted.example'})});ensure(hostile.status===400,'Hostile redirect input accepted');pass('local route gates, no-store output, secret exclusion and hostile origin/redirect rejection');
 sql('delete from private.account_mail_limits;');
 sql('update private.account_policy_versions set enforce_acceptance=true;');
 const owner=await identity('owner'),outsider=await identity('outsider'),org=randomUUID(),prod=randomUUID();
 sql(`insert into public.organizations(id,name,slug)values('${org}','B08 Fictional Studio','b08-${org}');insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)values('${org}','${owner.id}','owner','active',now());insert into public.productions(id,organization_id,name,slug)values('${prod}','${org}','B08 Fictional Production','b08');`);
 function invitation(address:string){const id=randomUUID();sql(`insert into public.organization_invitations(id,organization_id,email,organization_role,production_id,production_role,expires_at,created_by)values('${id}','${org}','${address}','member','${prod}','viewer',now()+interval '1 day','${owner.id}');`);return id;}
 const day=randomUUID(),schedule=randomUUID();
 sql(`insert into public.production_days(id,organization_id,production_id,position,created_by,updated_by)values('${day}','${org}','${prod}',0,'${owner.id}','${owner.id}');insert into public.schedules(id,organization_id,production_id,production_day_id,display_name,slug,document,created_by,updated_by)values('${schedule}','${org}','${prod}','${day}','Fictional B08 draft test','b08','{"meta":{"town":"B08"},"rows":[{"action":"Shoot","dur":"00:00","notes":"Fictional baseline"}]}','${owner.id}','${owner.id}');`);
 const recipient=email('recipient');let invite=invitation(recipient);
 const unknown=await requestMail('signup',email('missing'),randomUUID());const wrong=await requestMail('signup',email('wrong'),invite);
 const began=Date.now(),signup=await requestMail('signup',recipient,invite);const elapsed=Date.now()-began;
 ensure(signup.status===202,'Eligible signup route failed');const generic=await signup.text();ensure(unknown.status===202&&wrong.status===202&&await unknown.text()===generic&&await wrong.text()===generic,'Account enumeration response difference');ensure(elapsed>=750,'Generic response floor absent');
 ensure(signup.headers.get('cache-control')?.includes('no-store'),'Mail response cached');
 const link=await message(recipient,'invite');ensure(link.callback.invitationId===invite,'Invitation link identity lost');
 let recipientClient=client();ensure((await recipientClient.auth.signInWithPassword({email:recipient,password:password()})).error,'Unverified signup signed in');
 const duplicate=await requestMail('signup',recipient,invite);ensure(duplicate.status===202&&await duplicate.text()===generic,'Duplicate signup response exposed account state');
 ensure(sql(`select count(*) from auth.users where email='${recipient}';`)==='1','Duplicate signup created another account');
 // Use the latest local message in case the provider legitimately resent an unverified invite.
 const latest=await message(recipient,'invite'),contender=client();
 const contenders=[recipientClient,contender],verification=await Promise.all(contenders.map(c=>c.auth.verifyOtp({token_hash:latest.callback.tokenHash,type:'invite'})));
 const admissions=await Promise.all(contenders.map(c=>c.rpc('get_account_session_deadline')));const winner=verification.findIndex((r,i)=>!!r.data.session&&!admissions[i].error);ensure(winner>=0,'No concurrent verification succeeded');if(verification.filter(r=>!!r.data.session).length!==1){const finding='Concurrent invitation verification issued '+verification.filter(r=>!!r.data.session).length+' sessions; '+admissions.filter(r=>!r.error).length+' admitted by application before password setup';failures.push(finding);console.log('FAIL '+finding);}ensure(verification.filter(r=>r.data.session).every(r=>r.data.user?.id===verification[winner].data.user?.id),'Verification race crossed account identity');
 recipientClient=contenders[winner];const verified=verification[winner];ensure(verified.data.session&&verified.data.user?.email_confirmed_at,'Email verification failed');const userId=verified.data.user.id;
 ensure((await client().auth.verifyOtp({token_hash:latest.callback.tokenHash,type:'invite'})).error,'Verification token reused');
 ensure(sql(`select count(*) from public.organization_memberships where user_id='${userId}';`)==='0','Signup auto-granted membership');
 ensure((await recipientClient.rpc('get_account_policy_status')).data?.accepted===true,'Signup policy acceptance not recorded');
 ensure((await outsider.c.rpc('preview_my_invitation',{invitation_id:invite})).data===null,'Wrong account saw invitation details');
 const preview=await recipientClient.rpc('preview_my_invitation',{invitation_id:invite});ensure(preview.data?.organizationName==='B08 Fictional Studio'&&preview.data?.productionRole==='viewer','Verified preview mismatch');
 sql(`update public.organization_invitations set created_at=now()-interval '2 days',expires_at=now()-interval '1 second' where id='${invite}';`);
 ensure((await recipientClient.rpc('preview_my_invitation',{invitation_id:invite})).data===null,'Expired invitation disclosed');
 sql(`update public.organization_invitations set expires_at=now()+interval '1 day' where id='${invite}';select set_config('request.jwt.claims',json_build_object('sub','${owner.id}','role','authenticated')::text,false);update public.productions set deleted_at=now() where id='${prod}';`);
 ensure((await recipientClient.rpc('preview_my_invitation',{invitation_id:invite})).data===null,'Deleted parent invitation disclosed');
 sql(`select set_config('request.jwt.claims',json_build_object('sub','${owner.id}','role','authenticated')::text,false);update public.productions set deleted_at=null where id='${prod}';`);
 ensure((await recipientClient.rpc('preview_my_invitation',{invitation_id:invite})).data,'Restored parent did not restore invitation review');
 sql(`insert into public.organization_memberships(organization_id,user_id,role,status)values('${org}','${userId}','member','suspended');`);
 ensure((await recipientClient.rpc('preview_my_invitation',{invitation_id:invite})).data===null,'Suspended recipient saw invitation');
 sql(`delete from public.organization_memberships where organization_id='${org}' and user_id='${userId}';`);
 // Parent deletion/suspension correctly revoke old invitations; use a newly issued fixture for acceptance.
 invite=invitation(recipient);
 ensure((await recipientClient.rpc('preview_my_invitation',{invitation_id:invite})).data,'Fresh invitation did not restore review');
 ensure((await client().rpc('preview_my_invitation',{invitation_id:invite})).error,'Anonymous invitation preview');pass('real local signup mail, verified identity, sequential callback replay denial, generic wrong-account response, no automatic membership and immutable policy receipt');
 ensure((await recipientClient.auth.updateUser({password:'short'})).error,'Weak password accepted');
 const initialPassword=password();ensure(!(await recipientClient.auth.updateUser({password:initialPassword})).error,'Initial password setup failed');
 ensure((await recipientClient.rpc('get_account_policy_status')).status===401,'Setup session remained usable after password change');
 ensure((await recipientClient.auth.signInWithPassword({email:recipient,password:initialPassword})).data.session,'New-password sign in failed');
 const accept=await recipientClient.rpc('accept_organization_invitation',{invitation_id:invite});ensure(!accept.error,'Invitation acceptance failed');
 // Discard the real acknowledgement, then recover only the recipient receipt.
 const receipt=await recipientClient.rpc('get_my_invitation_acceptance',{invitation_id:invite});ensure(receipt.data?.organizationId===org,'Accepted response recovery failed');
 ensure((await recipientClient.rpc('accept_organization_invitation',{invitation_id:invite})).error,'Accepted invitation reused');
 ensure((await outsider.c.rpc('get_my_invitation_acceptance',{invitation_id:invite})).data===null,'Acceptance receipt disclosed');
 ensure((await recipientClient.rpc('get_account_policy_status')).data.accepted===true,'Invitation required repeat policy acceptance');pass('explicit invitation acceptance, recipient-only response recovery, replay denial and no repeated consent');
 const token=(await recipientClient.auth.getSession()).data.session!.access_token,sid=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).session_id;
 const activity=await recipientClient.rpc('record_account_activity');ensure(!activity.error,'Activity admission failed');
 sql(`update auth.sessions set created_at=now()-interval '15 hours' where id='${sid}';`);
 ensure(!(await recipientClient.rpc('get_account_session_deadline')).error,'Fixed absolute timeout introduced');
 sql(`update private.account_session_activity set last_activity_at=now()-interval '61 minutes' where session_id='${sid}';`);
 ensure((await recipientClient.rpc('get_account_policy_status')).status===401,'Expired idle access token accepted');
 const background=await recipientClient.auth.refreshSession();ensure(background.data.session,'Expected provider refresh for still-existing idle session');
 ensure((await recipientClient.rpc('record_account_activity')).status===401,'Refresh revived idle app session');
 ensure((await recipientClient.rpc('get_account_session_deadline')).status===401,'Expired session renewed its deadline');pass('no fixed absolute sign-out; rolling idle denial survives background refresh and cannot self-renew');
 await recipientClient.auth.signInWithPassword({email:recipient,password:initialPassword});
 const parallel=client();await parallel.auth.signInWithPassword({email:recipient,password:initialPassword});
 sql('delete from private.account_mail_limits;');
 const reset=await requestMail('recovery',recipient);const missingReset=await requestMail('recovery',email('unknown'));ensure(reset.status===202&&missingReset.status===202&&await reset.text()===await missingReset.text(),'Reset enumeration response difference');
 const recovery=await message(recipient,'recovery'),recoveryClient=client(),recoveryOther=client();
 const recoveryReplies=await Promise.all([recoveryClient,recoveryOther].map(c=>c.auth.verifyOtp({token_hash:recovery.callback.tokenHash,type:'recovery'})));
 ensure(recoveryReplies.some(r=>!!r.data.session),'Recovery verification failed');
 const recoveryAdmissions=await Promise.all([recoveryClient,recoveryOther].map(c=>c.rpc('get_account_session_deadline')));
 if(recoveryReplies.filter(r=>r.data.session).length>1){const finding='Concurrent recovery verification issued multiple sessions; '+recoveryAdmissions.filter(r=>!r.error).length+' admitted by application before reset';failures.push(finding);console.log('FAIL '+finding);}
 if(!recoveryReplies[0].data.session){const s=recoveryReplies[1].data.session!;ensure(!(await recoveryClient.auth.setSession({access_token:s.access_token,refresh_token:s.refresh_token})).error,'Recovery session unavailable');}

 const newPassword=password();
 const resetSession=(await recoveryClient.auth.getSession()).data.session!;
 // Consume the provider response privately and discard its success body: the
 // recovery caller must be able to determine outcome with fresh sign-in.
 const passwordReply=await fetch(base.origin+'/auth/v1/user',{method:'PUT',headers:{apikey:status.ANON_KEY,authorization:`Bearer ${resetSession.access_token}`,'content-type':'application/json'},body:JSON.stringify({password:newPassword})});
 ensure(passwordReply.ok,'Recovery password change failed');await passwordReply.arrayBuffer();
 for(const c of [recipientClient,parallel,recoveryClient,recoveryOther])ensure((await c.rpc('get_account_policy_status')).status===401,'Pre-reset or recovery token remained admitted');
 ensure((await parallel.auth.refreshSession()).error,'Old refresh token remained usable');
 ensure((await client().auth.signInWithPassword({email:recipient,password:initialPassword})).error,'Old password still works');
 ensure((await recipientClient.auth.signInWithPassword({email:recipient,password:newPassword})).data.session,'Fresh reset-password sign in failed');
 ensure((await client().auth.verifyOtp({token_hash:recovery.callback.tokenHash,type:'recovery'})).error,'Recovery link replay');pass('real recovery mail, old/recovery issued-token denial, refresh denial, password replacement and fresh sign-in');
 const factors=await recipientClient.auth.mfa.enroll({factorType:'totp',friendlyName:'B08 fictional account'});ensure(factors.data?.type==='totp','Factor enrollment failed');
 const factor=factors.data;ensure(!(await recipientClient.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)})).error,'Genuine factor verification failed');
 await delay(1100);await requestMail('recovery',recipient);const mfaLink=await message(recipient,'recovery'),mfaRecovery=client();
 ensure((await mfaRecovery.auth.verifyOtp({token_hash:mfaLink.callback.tokenHash,type:'recovery'})).data.session,'MFA account recovery link failed');
 const mfaPassword=password();ensure((await mfaRecovery.auth.updateUser({password:mfaPassword})).error,'Recovery bypassed existing MFA');
 ensure(!(await mfaRecovery.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)})).error,'Recovery step-up failed');
 ensure(!(await mfaRecovery.auth.updateUser({password:mfaPassword})).error,'MFA-authorized recovery failed');pass('password recovery cannot bypass an enrolled factor; genuine step-up permits reset');
 await recipientClient.auth.signInWithPassword({email:recipient,password:mfaPassword});
 sql("update private.account_policy_versions set terms_version='fictional-terms-v2';");
 ensure((await recipientClient.from('schedules').select('id')).status===428,'Direct table access bypassed policy gate');
 ensure((await recipientClient.rpc('preview_my_invitation',{invitation_id:invite})).status===428,'RPC bypassed policy gate');
 const currentSession=(await recipientClient.auth.getSession()).data.session!;
 const currentClaims=JSON.parse(Buffer.from(currentSession.access_token.split('.')[1],'base64url').toString());
 ensure((await admin.rpc('require_service_actor_session',{actor:userId,session_id:currentClaims.session_id,expires_at:currentClaims.exp})).status===428,'Service actor bypassed policy gate');
 const staleNotice=await requestMail('signup',email('stale-notice'),randomUUID());ensure(staleNotice.status===409,'Stale signup notices were not explicit');
 ensure((await recipientClient.rpc('get_account_policy_status')).data.accepted===false,'Material change did not require review');
 ensure((await recipientClient.rpc('accept_account_policies',{terms_version:FICTIONAL_TERMS,privacy_version:FICTIONAL_PRIVACY})).status===409,'Stale terms accepted');
 ensure((await recipientClient.rpc('accept_account_policies',{terms_version:'fictional-terms-v2',privacy_version:FICTIONAL_PRIVACY})).data.accepted,'Current terms acceptance failed');
 ensure((await recipientClient.from('schedules').select('id')).status===200,'Current consent did not restore admission');
 const acceptedAt=sql(`select accepted_at from private.account_policy_acceptances where user_id='${userId}' and terms_version='fictional-terms-v2';`);
 await recipientClient.rpc('accept_account_policies',{terms_version:'fictional-terms-v2',privacy_version:FICTIONAL_PRIVACY});
 ensure(sql(`select accepted_at from private.account_policy_acceptances where user_id='${userId}' and terms_version='fictional-terms-v2';`)===acceptedAt,'Consent replay changed timestamp');
 sql("update private.account_policy_versions set terms_version='fictional-terms-v1';");pass('material terms version change, stale rejection and exact timestamp-preserving replay');
 const revoked=email('revoked'),revokedId=invitation(revoked);sql(`update public.organization_invitations set status='revoked',revoked_at=now(),revoked_by='${owner.id}' where id='${revokedId}';`);
 const denied=await requestMail('signup',revoked,revokedId);ensure(denied.status===202,'Revoked generic response mismatch');ensure(sql(`select count(*) from auth.users where email='${revoked}';`)==='0','Revoked invite created account');
 sql('delete from private.account_mail_limits;');const rateEmail=email('rate');await Promise.all(Array.from({length:8},()=>requestMail('recovery',rateEmail)));
 ensure(sql(`select attempts from private.account_mail_limits where bucket='email:'||encode(extensions.digest('${rateEmail}','sha256'),'hex');`)==='5','Concurrent rate bound violated');pass('revoked invitation signup denial and concurrent per-address abuse limit');
 sql('delete from private.account_mail_limits;');const uncertain=email('uncertain'),uncertainId=invitation(uncertain);dropMail=true;
 ensure((await requestMail('signup',uncertain,uncertainId)).status===502,'Committed response drop not exercised');await message(uncertain,'invite');
 ensure(sql(`select count(*) from auth.users where email='${uncertain}';`)==='1','Uncertain signup did not create exactly one account');pass('dropped signup acknowledgement retains a delivered recoverable email and exactly one account');
 const expiredUser=await identity('expired-link');sql('delete from private.account_mail_limits;');
 await requestMail('recovery',expiredUser.email);const expiredLink=await message(expiredUser.email,'recovery');
 sql(`update auth.users set recovery_sent_at=now()-interval '2 hours' where id='${expiredUser.id}';`);
 ensure((await client().auth.verifyOtp({token_hash:expiredLink.callback.tokenHash,type:'recovery'})).error,'Expired recovery token verified');pass('genuine expired recovery token denied');
 sql(`update auth.users set banned_until=now()+interval '1 hour' where id='${outsider.id}';`);
 ensure((await outsider.c.rpc('get_account_session_deadline')).status===401,'Banned account session admitted');
 sql(`update auth.users set banned_until=null where id='${outsider.id}';`);pass('disabled account denied despite previously issued session');
 writeFileSync('/private/tmp/roseland-b08-runtime-results.json',JSON.stringify({project,checks:results,failures},null,2));
 if(failures.length)process.exitCode=1;
 if(args.includes('--serve')){
  const browserEmail=email('browser'),browserInvitation=invitation(browserEmail);
  writeFileSync('/private/tmp/roseland-b08-browser-fixtures.json',JSON.stringify({origin,mailOrigin,owner:{email:owner.email,password:owner.password},outsider:{email:outsider.email,password:outsider.password},recipient:{email:recipient,password:mfaPassword,factor:factor.totp.secret},browser:{email:browserEmail,invitation:browserInvitation},organization:org,production:prod,schedule}),{mode:0o600});
  console.log('READY fictional browser fixtures saved privately; commands: drop-mail, expire-owner, stop');
  const input=createInterface({input:process.stdin});await new Promise<void>(resolve=>{input.on('line',line=>{if(line==='drop-mail'){dropMail=true;console.log('CONTROL next mail response will drop');}if(line==='expire-owner'){sql(`update auth.sessions set not_after=now()-interval '1 second' where user_id='${owner.id}';`);console.log('CONTROL fictional owner expired');}if(line==='stop'){input.close();resolve();}});});
 }
}finally{sql('update private.account_policy_versions set enforce_acceptance=false;');app?.kill('SIGTERM');proxy.close();}
