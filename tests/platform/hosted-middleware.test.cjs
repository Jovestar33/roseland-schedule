const {test}=require('node:test'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');const {sourceLoader}=require('../editor/source-loader.cjs');
test('hosted routes use workspace auth and do not expose legacy or test pages',()=>{
 const old={ROSELAND_HOSTED_APP:process.env.ROSELAND_HOSTED_APP,VERCEL:process.env.VERCEL};
 process.env.ROSELAND_HOSTED_APP='supabase';process.env.VERCEL='1';
 try{const {middleware}=sourceLoader({})('middleware.ts');
  const run=path=>middleware(new NextRequest('https://schedules.example.com'+path));
  assert.equal(new URL(run('/').headers.get('location')).pathname,'/workspace');
  assert.equal(new URL(run('/login?s=Legacy').headers.get('location')).pathname,'/workspace');
  for(const path of ['/workspace?s=Legacy','/call-sheet','/api/call-sheet/read','/api/call-sheet/email','/client','/api/platform/account/mail','/api/trial-sync/tick','/api/trial-sync/preview','/api/trial-sync/review']){const response=run(path);assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);assert.match(response.headers.get('cache-control'),/no-store/);}
  for(const path of ['/review','/api/call-sheet/other','/call-sheet/extra','/schedule/Legacy','/local-workspace','/platform/setup','/view','/api/trial-sync/other','/api/trial-sync/tick/extra','/api/trial-sync/preview/extra','/api/trial-sync/review/extra'])assert.equal(run(path).status,404);
 }finally{for(const key of Object.keys(old)){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}
});
