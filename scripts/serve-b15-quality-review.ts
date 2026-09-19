import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
const config=JSON.parse(readFileSync('/private/tmp/roseland-b14-destination-g2-live-status.json','utf8'));
if(config.API_URL!=='http://127.0.0.1:56521')throw Error('Owned fictional destination required');
const keyLine=readFileSync('/Users/johnsammon/roseland-schedule/.env.local','utf8').split(/\r?\n/).find(line=>/^GOOGLE_PLACES_KEY=/.test(line));
const placesKey=keyLine?.slice('GOOGLE_PLACES_KEY='.length).trim().replace(/^([\"'])(.*)\1$/,'$2');
if(!placesKey)throw Error('Existing Places key unavailable');
const port=3492,project='roseland-b14-destination-g2';
const app=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{stdio:'inherit',env:{PATH:process.env.PATH,NODE_ENV:'production',ROSELAND_LOCAL_DOCUMENT_PROVIDERS:'live',GOOGLE_PLACES_KEY:placesKey,NEXT_TELEMETRY_DISABLED:'1',ROSELAND_LOCAL_WORKSPACE:'supabase',ROSELAND_LOCAL_ACCOUNTS:'supabase',ROSELAND_LOCAL_MEMBERSHIP_NOTIFICATIONS:'mailpit',ROSELAND_LOCAL_MAILPIT_URL:'http://127.0.0.1:56524',ROSELAND_LOCAL_SUPABASE_URL:config.API_URL,ROSELAND_LOCAL_SUPABASE_ANON_KEY:config.ANON_KEY,ROSELAND_LOCAL_ACCOUNT_SERVICE_KEY:config.SERVICE_ROLE_KEY,SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',SUPABASE_URL:config.API_URL,SUPABASE_PUBLISHABLE_KEY:config.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:config.SERVICE_ROLE_KEY}});
writeFileSync('/private/tmp/roseland-b15-quality-process.json',JSON.stringify({launcher:process.pid,server:app.pid,port,project,build:readFileSync('.next/BUILD_ID','utf8').trim()}),{mode:0o600});
let stopped=false;function stop(){if(!stopped){stopped=true;app.kill('SIGTERM');}}
process.on('SIGTERM',stop);process.on('SIGINT',stop);app.on('exit',code=>{stop();process.exitCode=code??0;});
