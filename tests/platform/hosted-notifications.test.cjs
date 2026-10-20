const {test}=require('node:test'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
const {sourceLoader}=require('../editor/source-loader.cjs');
const {readHostedWorkspaceConfig}=require('../../lib/platform/hosted-workspace-config.ts');
const origin='https://schedules.example.com',id='00000000-0000-4000-8000-000000000001';
const env={ROSELAND_HOSTED_APP:'supabase',VERCEL:'1',VERCEL_ENV:'production',ROSELAND_HOSTED_NOTIFICATIONS:'smtp',ROSELAND_APP_ORIGIN:origin,
 ROSELAND_SUPABASE_PROJECT_REF:'abcdefghijklmnopqrst',SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_SECRET_KEY:'sb_secret_fixture'};
function req(body={},headers={}){return new NextRequest(origin+'/api/platform/membership-notifications',{method:'POST',headers:{host:'schedules.example.com',origin,'content-type':'application/json',...headers},body:JSON.stringify({organizationId:id,eventId:id,...body})});}
async function fixture(work){const previous={...process.env};Object.assign(process.env,env);const calls=[];
 let notice={state:'claimed',email:'recipient@example.test',organization:'Studio',status:'active',revision:2,kind:'deletion_requested',version:2,cancel_before:'2026-11-20'},accepted=true,auth=true,recorded=true;
 const server=sourceLoader({'server-only':{}})('lib/platform/server.ts');
 const module=sourceLoader({'server-only':{},'./hosted-workspace-config':{readHostedWorkspaceConfig},'./server':{...server,
  authenticatePlatformRequest:async()=>{calls.push({name:'auth'});if(!auth)throw new server.PlatformHttpError(401,'Authentication required');return {actor:{userId:id},config:{}};},
  callPlatformJsonRpc:async(config,name,args)=>{calls.push({name,args});return name.startsWith('claim_')?notice:recorded;}},
  './hosted-notification-mail':{readNotificationMailConfig:()=>({}),sendHostedNotification:async(config,message)=>{calls.push({name:'mail',message});if(accepted instanceof Error)throw accepted;return accepted;}}})('lib/platform/hosted-notifications.ts');
 try{await work(module.postHostedNotification,{calls,notice:value=>notice={...notice,...value},accepted:value=>accepted=value,auth:value=>auth=value,recorded:value=>recorded=value});}
 finally{for(const key of Object.keys(env)){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
}
test('hosted notices reject origin, gate, extra recipient and oversized body before authorization or sending',async()=>fixture(async(post,s)=>{
 assert.equal((await post(req({}, {origin:''}),'membership')).status,403);
 assert.equal((await post(req({}, {origin:'https://other.example'}),'membership')).status,403);
 assert.equal((await post(req({email:'attacker@example.test'}),'membership')).status,400);
 assert.equal((await post(req({extra:'x'.repeat(17000)}),'membership')).status,413);
 delete process.env.ROSELAND_HOSTED_NOTIFICATIONS;assert.equal((await post(req(),'membership')).status,404);assert.equal(s.calls.length,0);
}));
test('authorization precedes claim; database recipient alone is passed to mail',async()=>fixture(async(post,s)=>{
 s.auth(false);assert.equal((await post(req(),'membership')).status,401);assert.deepEqual(s.calls.map(c=>c.name),['auth']);
 s.auth(true);s.calls.length=0;assert.equal((await post(req(),'membership')).status,200);
 assert.deepEqual(s.calls.map(c=>c.name),['auth','claim_membership_notification','mail','finish_membership_notification']);
 assert.equal(s.calls[2].message.recipient,'recipient@example.test');assert.equal(s.calls[3].args.p_delivered,true);
 assert.equal(s.calls[1].args.p_claim_id,s.calls[3].args.p_claim_id);
}));
test('already accepted and in-flight claims never resend; failed SMTP stays retryable',async()=>fixture(async(post,s)=>{
 for(const state of ['delivered','sending']){s.calls.length=0;s.notice({state});assert.equal((await (await post(req(),'membership')).json()).state,state);assert.equal(s.calls.some(c=>c.name==='mail'),false);}
 s.notice({state:'claimed'});s.accepted(new Error('private SMTP failure'));s.calls.length=0;
 const response=await post(req(),'membership');assert.deepEqual(await response.json(),{state:'failed'});assert.equal(s.calls.at(-1).args.p_delivered,false);
 s.accepted(true);s.recorded(false);assert.equal((await (await post(req(),'membership')).json()).state,'sending');
}));
test('organization notices retain scoped recipient and lifecycle event; malformed claims do not send',async()=>fixture(async(post,s)=>{
 assert.equal((await post(req({recipientId:id}),'organization')).status,200);
 assert.equal(s.calls[1].name,'claim_organization_lifecycle_notice');assert.equal(s.calls.at(-1).name,'finish_organization_lifecycle_notice');assert.equal(s.calls.at(-1).args.p_recipient_id,id);
 assert.match(s.calls.find(c=>c.name==='mail').message.text,/not erased automatically/);
 s.calls.length=0;s.notice({kind:'unexpected'});assert.equal((await (await post(req({recipientId:id}),'organization')).json()).state,'failed');assert.equal(s.calls.some(c=>c.name==='mail'),false);
}));
const smtpEnv={ROSELAND_HOSTED_NOTIFICATIONS:'smtp',ROSELAND_SMTP_HOST:'smtppro.zoho.com',ROSELAND_SMTP_PORT:'465',ROSELAND_SMTP_USERNAME:'john@roseland-pictures.com',ROSELAND_SMTP_PASSWORD:'fictional-test-secret',ROSELAND_SMTP_FROM:'action@roseland-pictures.com'};
function smtpFixture(){let options,message,closed=false,accepted=['person@example.test'];const api=sourceLoader({'server-only':{},nodemailer:{default:{createTransport:config=>{options=config;return {sendMail:async value=>{message=value;return {accepted,rejected:[]};},close:()=>closed=true};}}}})('lib/platform/hosted-notification-mail.ts');return {...api,read:()=>({options,message,closed}),accepted:value=>accepted=value};}
test('SMTP config fixes approved identity and rejects missing credentials, untrusted hosts and cleartext ports',()=>{
 const s=smtpFixture();assert.equal(s.readNotificationMailConfig(smtpEnv).port,465);
 for(const patch of [{ROSELAND_SMTP_PORT:'25'},{ROSELAND_SMTP_HOST:'localhost'},{ROSELAND_SMTP_FROM:'other@example.test'},{ROSELAND_SMTP_USERNAME:'other@example.test'},{ROSELAND_SMTP_PASSWORD:''}])assert.throws(()=>s.readNotificationMailConfig({...smtpEnv,...patch}));
});
test('SMTP enforces TLS, disables attachment sources and records only recipient acceptance',async()=>{
 const s=smtpFixture(),message={recipient:'person@example.test',event:id,subject:'Membership changed',text:'Notice'};
 for(const port of ['465','587']){assert.equal(await s.sendHostedNotification(s.readNotificationMailConfig({...smtpEnv,ROSELAND_SMTP_PORT:port}),message),true);const state=s.read();assert.equal(state.options.secure,port==='465');assert.equal(state.options.requireTLS,true);assert.equal(state.options.tls.rejectUnauthorized,true);assert.equal(state.options.disableFileAccess,true);assert.equal(state.options.disableUrlAccess,true);assert.equal(state.closed,true);assert.deepEqual(state.message.envelope.to,['person@example.test']);}
 s.accepted([]);assert.equal(await s.sendHostedNotification(s.readNotificationMailConfig(smtpEnv),message),false);
 await assert.rejects(s.sendHostedNotification(s.readNotificationMailConfig(smtpEnv),{...message,recipient:'one@example.test,two@example.test'}));
});
