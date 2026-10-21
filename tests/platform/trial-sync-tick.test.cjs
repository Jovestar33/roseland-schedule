const {test}=require('node:test'),assert=require('node:assert/strict');
const {sourceLoader}=require('../editor/source-loader.cjs');
const {readHostedWorkspaceConfig}=require('../../lib/platform/hosted-workspace-config.ts');
const {authorized}=require('../../scripts/trial-sync/hosted.cjs');
const base={ROSELAND_HOSTED_APP:'supabase',VERCEL:'1',VERCEL_ENV:'production',
 SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',ROSELAND_APP_ORIGIN:'https://schedules.example.com',
 ROSELAND_SUPABASE_PROJECT_REF:'abcdefghijklmnopqrst',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',
 SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_SECRET_KEY:'sb_secret_fixture',
 VERCEL_URL:'schedule-fixture-team.vercel.app',ROSELAND_TRIAL_SYNC_ENABLED:'true',
 CRON_SECRET:'fictional-cron-secret-32-characters-long',ROSELAND_TRIAL_SYNC_INTEGRATION_ID:'integration',
 ROSELAND_TRIAL_SYNC_ORGANIZATION_ID:'organization',ROSELAND_TRIAL_SYNC_NETLIFY_SITE_ID:'site',
 ROSELAND_TRIAL_SYNC_LEGACY_ORIGIN:'https://schedule.netlify.app',
 ROSELAND_TRIAL_SYNC_BRIDGE_SECRET:'fictional-bridge-secret-32-characters-long',
 ROSELAND_TRIAL_SYNC_MAPPING_IDS:'["dc83a6e3-a7a1-44dc-b18c-116b032bd698"]',ROSELAND_TRIAL_SYNC_WRITE_ENABLED:'true'};
async function request(host,override={},auth=`Bearer ${base.CRON_SECRET}`){
 const old={...process.env},calls=[];
 Object.assign(process.env,base,override);
 try{
  const {GET}=sourceLoader({'@/lib/platform/hosted-workspace-config':{readHostedWorkspaceConfig},
   '@/scripts/trial-sync/resolution.cjs':require('../../scripts/trial-sync/resolution.cjs'),
   '@/scripts/trial-sync/hosted.cjs':{authorized,transport:()=>{calls.push('transport');return{};},
    checkHostedInventory:async()=>0,runHosted:async args=>{calls.push(args);return{checked:1};}}})('app/api/trial-sync/tick/route.ts');
  const result=await GET(new Request('https://'+host+'/api/trial-sync/tick',{headers:{host,...(auth?{authorization:auth}:{})}}));
  return {status:result.status,body:await result.json(),calls};
 }finally{for(const k of Object.keys(process.env))if(!(k in old))delete process.env[k];Object.assign(process.env,old);}
}
test('authenticated production cron accepts only canonical or exact current deployment host',async()=>{
 for(const host of ['schedules.example.com',base.VERCEL_URL]){
  const r=await request(host);assert.equal(r.status,200);assert.equal(r.body.mode,'synchronize');
  assert.deepEqual(r.calls[1].mappingIds,['dc83a6e3-a7a1-44dc-b18c-116b032bd698']);
 }
 for(const host of ['other.vercel.app',base.VERCEL_URL+'.attacker.example',base.VERCEL_URL+':443']){
  const r=await request(host);assert.equal(r.status,404);assert.deepEqual(r.calls,[]);
 }
 assert.equal(readHostedWorkspaceConfig(base,base.VERCEL_URL),null,'browser routes remain canonical-only');
});
test('cron rejects missing/wrong credential, preview runtime, and malformed configuration before transport',async()=>{
 for(const auth of [null,'Bearer wrong']){const r=await request(base.VERCEL_URL,{},auth);assert.equal(r.status,401);assert.deepEqual(r.calls,[]);}
 for(const extra of [{VERCEL_ENV:'preview'},{ROSELAND_APP_ORIGIN:'bad URL'},{ROSELAND_LOCAL_WORKSPACE:'supabase'},{VERCEL_URL:'other.vercel.app'}]){
  const r=await request(base.VERCEL_URL,extra);assert.equal(r.status,404);assert.deepEqual(r.calls,[]);
 }
 const disabled=await request(base.VERCEL_URL,{ROSELAND_TRIAL_SYNC_ENABLED:'false'});assert.equal(disabled.status,404);assert.deepEqual(disabled.calls,[]);
});
