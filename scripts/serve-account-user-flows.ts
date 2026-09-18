// Bounded B08 browser fixture launcher. No token-race or provider investigation.
// Uses only the preserved fictional local B08 stack; no schema migration.
import {execFileSync,spawn} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const workdir='/private/tmp/roseland-b08-20260917',project='roseland-b08-20260917';
if(existsSync(resolve(workdir,'supabase/.temp/project-ref'))||process.env.NETLIFY||process.env.VERCEL)throw Error('Unlinked local rehearsal required');
for(const name of ['.env','.env.local','.env.production','.env.production.local','.env.development','.env.development.local'])if(existsSync(name))throw Error('Environment-free checkout required');
const config=readFileSync(resolve(workdir,'supabase/config.toml'),'utf8');
if(!config.includes(`project_id = "${project}"`))throw Error('Unexpected local project');
const status=JSON.parse(execFileSync(resolve('node_modules/.bin/supabase'),['status','--workdir',workdir,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
if(status.API_URL!=='http://127.0.0.1:56121')throw Error('Unexpected API');
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,options);
const sql=(s:string)=>execFileSync('docker',['exec','-i',`supabase_db_${project}`,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const settings=await(await fetch(status.API_URL+'/auth/v1/settings',{headers:{apikey:status.ANON_KEY}})).json();
if(settings.disable_signup!==true||settings.mailer_autoconfirm!==false)throw Error('Expected invitation-only verified email configuration');
const previous=sql('select enforce_acceptance from private.account_policy_versions;');
if(sql('select terms_version||\'/\'||privacy_version from private.account_policy_versions;')!=='fictional-terms-v1/fictional-privacy-v1')throw Error('Unexpected test notices');
let app:ReturnType<typeof spawn>|undefined,cleaned=false;
function cleanup(){if(cleaned)return;cleaned=true;sql(`update private.account_policy_versions set enforce_acceptance=${previous==='t'?'true':'false'};`);app?.kill('SIGTERM');}
try{
 sql('update private.account_policy_versions set enforce_acceptance=true;');
 if(process.argv.includes('--resume')){
  const fixture=JSON.parse(readFileSync('/private/tmp/roseland-b08-user-flow-fixtures.json','utf8'));
  if(fixture.project!==project||!/^[a-f0-9-]{36}$/.test(fixture.owner.id)||sql(`select count(*) from auth.users where id='${fixture.owner.id}';`)!=='1')throw Error('Owned flow fixture unavailable');
 }else{
 const email=`b08-flow-owner-${randomUUID()}@example.test`,password=`Fictional1!${randomBytes(20).toString('hex')}`;
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{b08_terms:'fictional-terms-v1',b08_privacy:'fictional-privacy-v1'}});
 if(created.error||!created.data.user)throw Error('Synthetic control account unavailable');
 const owner=created.data.user.id,organization=randomUUID(),production=randomUUID(),schedule=randomUUID(),invitation=randomUUID(),recipient=`b08-flow-invited-${randomUUID()}@example.test`;
 sql(`insert into public.organizations(id,name,slug)values('${organization}','B08 User Flow Studio','flow-${organization}');insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)values('${organization}','${owner}','owner','active',now());insert into public.productions(id,organization_id,name,slug)values('${production}','${organization}','B08 User Flow Production','flow');insert into public.schedules(id,organization_id,production_id,display_name,slug,document,created_by,updated_by)values('${schedule}','${organization}','${production}','Fictional B08 user-flow draft','flow','{"meta":{"town":"Fictional flow baseline"},"rows":[{"action":"Shoot","dur":"00:15","notes":"Fictional data only"}]}','${owner}','${owner}');insert into public.organization_invitations(id,organization_id,email,organization_role,production_id,production_role,expires_at,created_by)values('${invitation}','${organization}','${recipient}','member','${production}','editor',now()+interval '1 day','${owner}');`);
 writeFileSync('/private/tmp/roseland-b08-user-flow-fixtures.json',JSON.stringify({project,origin:'http://127.0.0.1:3435',mailOrigin:'http://127.0.0.1:56124',owner:{id:owner,email,password},recipient,invitation,organization,production,schedule}),{mode:0o600});
 }
 app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3435'],{stdio:'inherit',env:{PATH:process.env.PATH,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',ROSELAND_LOCAL_WORKSPACE:'supabase',ROSELAND_LOCAL_ACCOUNTS:'supabase',ROSELAND_LOCAL_SUPABASE_URL:status.API_URL,ROSELAND_LOCAL_SUPABASE_ANON_KEY:status.ANON_KEY,ROSELAND_LOCAL_ACCOUNT_SERVICE_KEY:status.SERVICE_ROLE_KEY,SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',SUPABASE_URL:status.API_URL,SUPABASE_PUBLISHABLE_KEY:status.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY}});
 process.on('SIGINT',cleanup);process.on('SIGTERM',cleanup);app.on('exit',code=>{cleanup();process.exitCode=code??0;});
 console.log('READY: private fictional user-flow fixtures saved. No provider-race tests run.');
}catch(error){cleanup();throw error;}
