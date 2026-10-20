const {test}=require('node:test'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');const {sourceLoader}=require('../editor/source-loader.cjs');
test('hosted routes use workspace auth and do not expose legacy or test pages',()=>{
 const old={ROSELAND_HOSTED_APP:process.env.ROSELAND_HOSTED_APP,VERCEL:process.env.VERCEL};
 process.env.ROSELAND_HOSTED_APP='supabase';process.env.VERCEL='1';
 try{const {middleware}=sourceLoader({})('middleware.ts');
  const run=path=>middleware(new NextRequest('https://schedules.example.com'+path));
  assert.equal(new URL(run('/').headers.get('location')).pathname,'/workspace');
  assert.equal(new URL(run('/login?s=Legacy').headers.get('location')).pathname,'/workspace');
  for(const path of ['/workspace?s=Legacy','/client','/api/platform/account/mail']){const response=run(path);assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);assert.match(response.headers.get('cache-control'),/no-store/);}
  for(const path of ['/review','/schedule/Legacy','/local-workspace','/platform/setup','/view'])assert.equal(run(path).status,404);
 }finally{for(const key of Object.keys(old)){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];}}
});
