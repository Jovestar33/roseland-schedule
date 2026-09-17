// Explicit local-only launcher. Never load .env files or forward hosted keys.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readLocalEditorConfig } from '../lib/platform/local-editor-config.ts';
const args = process.argv.slice(2);
const index = args.indexOf('--workdir');
if (index < 0 || !args[index+1]) throw new Error('Specify an unlinked disposable local --workdir');
const workdir = resolve(args[index+1]);
if (existsSync(resolve(workdir,'supabase/.temp/project-ref')) || process.env.NETLIFY || process.env.VERCEL) throw new Error('Local unlinked runtime required');
// Next automatically reads environment files: refuse rather than accidentally load one.
for (const file of ['.env','.env.local','.env.production','.env.production.local','.env.development','.env.development.local']) {
  if (existsSync(file)) throw new Error('Use a worktree without environment files');
}
const localConfig = readFileSync(resolve(workdir,'supabase/config.toml'),'utf8');
const apiPort = localConfig.match(/\[api\][\s\S]*?\nport\s*=\s*(\d+)/)?.[1];
let status;
try { status = JSON.parse(execFileSync(resolve('node_modules/.bin/supabase'),['status','--workdir',workdir,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']})); }
catch { throw new Error('Local runtime unavailable'); }
const env: NodeJS.ProcessEnv = { NODE_ENV:args.includes('--dev')?'development':'production', PATH:process.env.PATH, NEXT_TELEMETRY_DISABLED:'1', ROSELAND_LOCAL_EDITOR:'supabase',
  ROSELAND_LOCAL_SUPABASE_URL:status.API_URL, ROSELAND_LOCAL_SUPABASE_ANON_KEY:status.ANON_KEY };
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? args[portIndex+1] : '3287';
if (!port || !/^[1-9][0-9]{3,4}$/.test(port) || Number(port)>65535) throw new Error('Invalid local port');
const config = readLocalEditorConfig(env,`127.0.0.1:${port}`);
if (!config || new URL(config.supabaseUrl).port !== apiPort) throw new Error('Local API configuration mismatch');
if(args.includes('--workspace'))Object.assign(env,{ROSELAND_LOCAL_WORKSPACE:'supabase',SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',SUPABASE_URL:config.supabaseUrl,SUPABASE_PUBLISHABLE_KEY:config.anonymousKey,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY});
const child = spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),args.includes('--dev')?'dev':'start','--hostname','127.0.0.1','--port',port],{env,stdio:'inherit'});
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
child.on('exit',code=>{process.exitCode=code??1;});
