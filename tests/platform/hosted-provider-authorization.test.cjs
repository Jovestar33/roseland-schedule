const test=require('node:test'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
const {sourceLoader}=require('../editor/source-loader.cjs');
const {readHostedWorkspaceConfig}=require('../../lib/platform/hosted-workspace-config.ts');
const {parseProviderQuery}=require('../../lib/security/document-provider-upstream.ts');
const anon='sb_publishable_fixture';
const env={ROSELAND_HOSTED_APP:'supabase',VERCEL:'1',VERCEL_ENV:'production',
  ROSELAND_APP_ORIGIN:'https://schedules.example.com',ROSELAND_SUPABASE_PROJECT_REF:'abcdefghijklmnopqrst',
  SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',
  SUPABASE_PUBLISHABLE_KEY:anon,SUPABASE_SECRET_KEY:'sb_secret_fixture'};
const schedule='00000000-0000-4000-8000-000000000001';
function req(headers={},body={operation:'search',query:'Raleigh Union Station',schedule}){return new NextRequest('https://schedules.example.com/api/platform/document-providers',{method:'POST',headers:{host:'schedules.example.com',origin:'https://schedules.example.com',authorization:'Bearer header.payload.signature','content-type':'application/json',...headers},body:JSON.stringify(body)});}
async function run(fn){const previous={...process.env},oldFetch=global.fetch;Object.assign(process.env,env);let providerCalls=0;const rpc=[];let active=true,allowed=true;
  global.fetch=async(url,init)=>{rpc.push({url,init});return String(url).endsWith('require_active_schedule_session')?new Response(null,{status:active?204:401}):Response.json(allowed);};
  const route=sourceLoader({'@/lib/platform/hosted-workspace-config':{readHostedWorkspaceConfig},'@/lib/platform/server':{readPlatformJson:r=>r.json(),PlatformHttpError:class extends Error{}},'@/lib/security/places-proxy':{createPlacesBudget:()=>()=>true},'@/lib/security/document-provider-upstream':{parseProviderQuery,requestDocumentProvider:async()=>{providerCalls++;return [];}}})('app/api/platform/document-providers/route.ts');
  try{await fn(route,{rpc,calls:()=>providerCalls,session:value=>{active=value;},permission:value=>{allowed=value;}});}finally{global.fetch=oldFetch;for(const key of Object.keys(env)){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
}
test('hosted providers require active session and effective schedule editing permission',async()=>run(async(route,state)=>{
  state.session(false);assert.equal((await route.POST(req())).status,401);assert.equal(state.calls(),0);
  state.session(true);state.permission(false);assert.equal((await route.POST(req())).status,403);assert.equal(state.calls(),0);
  state.permission(true);const response=await route.POST(req());assert.equal(response.status,200);assert.equal(state.calls(),1);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(new Headers(state.rpc[0].init.headers).get('apikey'),anon,'no service role used for admission');
}));
test('foreign origin, missing auth, malformed data and disabled hosted mode cannot reach providers',async()=>run(async(route,state)=>{
  assert.equal((await route.POST(req({origin:'https://outside.invalid'}))).status,403);
  assert.equal((await route.POST(req({authorization:''}))).status,401);
  assert.equal((await route.POST(req({}, {operation:'search',query:'x',schedule:'bad'}))).status,400);
  delete process.env.ROSELAND_HOSTED_APP;assert.equal((await route.POST(req())).status,404);assert.equal(state.calls(),0);assert.equal(state.rpc.length,0);
}));

test('preview deployment and mismatched host cannot invoke hosted providers',async()=>run(async(route,state)=>{
 assert.equal((await route.POST(req({host:'other.example.com'}))).status,404);
 process.env.VERCEL_ENV='preview';assert.equal((await route.POST(req())).status,404);
 assert.equal(state.calls(),0);assert.equal(state.rpc.length,0);
}));
