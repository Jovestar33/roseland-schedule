const {test}=require('node:test'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
const {sourceLoader}=require('../editor/source-loader.cjs');
const {readHostedWorkspaceConfig}=require('../../lib/platform/hosted-workspace-config.ts');
const env={ROSELAND_HOSTED_APP:'supabase',VERCEL:'1',VERCEL_ENV:'production',ROSELAND_HOSTED_ACCOUNT_MAIL:'supabase',
 ROSELAND_APP_ORIGIN:'https://schedules.example.com',ROSELAND_SUPABASE_PROJECT_REF:'abcdefghijklmnopqrst',SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',
 SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_SECRET_KEY:'sb_secret_fixture'};
const invitation='00000000-0000-4000-8000-000000000001';
function req(body,headers={}){return new NextRequest(env.ROSELAND_APP_ORIGIN+'/api/platform/account/mail',{method:'POST',headers:{host:'schedules.example.com',origin:env.ROSELAND_APP_ORIGIN,'content-type':'application/json',...headers},body:JSON.stringify(body)});}
async function run(work){const previous={...process.env},oldFetch=global.fetch;Object.assign(process.env,env);const calls=[];let allowed=false,enforced=false,signupDisabled=true;
 const client={rpc:async(name,args)=>{calls.push({name,args});return name==='get_local_account_policy_configuration'?{data:{enabled:enforced},error:null}:{data:{allowed},error:null};},
 auth:{admin:{inviteUserByEmail:async(email,options)=>{calls.push({name:'invite',email,options});return {error:null};}},resetPasswordForEmail:async(email,options)=>{calls.push({name:'recovery',email,options});return {error:null};}}};
 global.fetch=async()=>Response.json({disable_signup:signupDisabled,mailer_autoconfirm:false});
 const route=sourceLoader({'@/lib/platform/hosted-workspace-config':{readHostedWorkspaceConfig},'@supabase/supabase-js':{createClient:()=>client}})('app/api/platform/account/mail/route.ts');
 try{await work(route,{calls,allow:value=>allowed=value,enforce:value=>enforced=value,signupDisabled:value=>signupDisabled=value});}
 finally{global.fetch=oldFetch;for(const key of Object.keys(env)){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
}
test('hosted email is denied before provider access for wrong origin, bad body or missing gate',async()=>run(async(route,s)=>{
 const body={action:'signup',email:'person@example.test',invitationId:invitation};
 assert.equal((await route.POST(req(body,{origin:'https://outside.example'}))).status,403);
 assert.equal((await route.POST(req({...body,redirectTo:'https://outside.example'}))).status,400);
 assert.equal((await route.POST(req({...body,email:'x'.repeat(3000)}))).status,413);
 delete process.env.ROSELAND_HOSTED_ACCOUNT_MAIL;assert.equal((await route.POST(req(body))).status,404);
 assert.equal(s.calls.length,0);
}));
test('invitation admission determines mail delivery and never manufactures policy acceptance',async()=>run(async(route,s)=>{
 const body={action:'signup',email:'person@example.test',invitationId:invitation};
 assert.equal((await route.POST(req(body))).status,202);assert.equal(s.calls.some(x=>x.name==='invite'),false);
 s.allow(true);assert.equal((await route.POST(req(body))).status,202);
 assert.deepEqual(s.calls.find(x=>x.name==='invite'),{name:'invite',email:body.email,options:{redirectTo:'https://schedules.example.com/workspace',data:{b08_invitation:invitation}}});
 const admission=s.calls.find(x=>x.name==='admit_local_account_mail');assert.equal(admission.args.invitation_id,invitation);assert.match(admission.args.ip_hash,/^[a-f0-9]{64}$/);
}));
test('policy enforcement or provider public-signup misconfiguration blocks hosted mail',async()=>run(async(route,s)=>{
 s.allow(true);s.enforce(true);assert.equal((await route.POST(req({action:'recovery',email:'person@example.test'}))).status,503);
 s.enforce(false);s.signupDisabled(false);assert.equal((await route.POST(req({action:'recovery',email:'person@example.test'}))).status,503);
 assert.equal(s.calls.some(x=>['invite','recovery'].includes(x.name)),false);
}));
