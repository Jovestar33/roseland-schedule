// Bounded B10-A membership browser fixture launcher. No token-race or provider investigation.
// Uses only the preserved fictional local B08 stack; no schema migration.
import {execFileSync,spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const workdir='/private/tmp/roseland-b08-20260917',project='roseland-b08-20260917';
if(existsSync(resolve(workdir,'supabase/.temp/project-ref'))||process.env.NETLIFY||process.env.VERCEL)throw Error('Unlinked local rehearsal required');
for(const name of ['.env','.env.local','.env.production','.env.production.local','.env.development','.env.development.local'])if(existsSync(name))throw Error('Environment-free checkout required');
const config=readFileSync(resolve(workdir,'supabase/config.toml'),'utf8');
if(!config.includes(`project_id = "${project}"`))throw Error('Unexpected local project');
const status=JSON.parse(execFileSync(resolve('node_modules/.bin/supabase'),['status','--workdir',workdir,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
if(status.API_URL!=='http://127.0.0.1:56121')throw Error('Unexpected API');
const settings=await(await fetch(status.API_URL+'/auth/v1/settings',{headers:{apikey:status.ANON_KEY}})).json();
if(settings.disable_signup!==true||settings.mailer_autoconfirm!==false)throw Error('Expected invitation-only verified email configuration');
ensureFixture();
function ensureFixture(){const f=JSON.parse(readFileSync('/private/tmp/roseland-b10-fixtures.json','utf8'));if(f.project!==project)throw Error('B10 fictional fixture required');}
let app:ReturnType<typeof spawn>|undefined,cleaned=false;
function cleanup(){if(cleaned)return;cleaned=true;app?.kill('SIGTERM');}
try{
 app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3435'],{stdio:'inherit',env:{PATH:process.env.PATH,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',ROSELAND_LOCAL_MEMBERSHIP_NOTIFICATIONS:'mailpit',ROSELAND_LOCAL_MAILPIT_URL:'http://127.0.0.1:56124',ROSELAND_LOCAL_WORKSPACE:'supabase',ROSELAND_LOCAL_ACCOUNTS:'supabase',ROSELAND_LOCAL_SUPABASE_URL:status.API_URL,ROSELAND_LOCAL_SUPABASE_ANON_KEY:status.ANON_KEY,ROSELAND_LOCAL_ACCOUNT_SERVICE_KEY:status.SERVICE_ROLE_KEY,SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',SUPABASE_URL:status.API_URL,SUPABASE_PUBLISHABLE_KEY:status.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY}});
 process.on('SIGINT',cleanup);process.on('SIGTERM',cleanup);app.on('exit',code=>{cleanup();process.exitCode=code??0;});
 console.log('READY: fictional B10-A workspace. No provider-race tests run.');
}catch(error){cleanup();throw error;}
