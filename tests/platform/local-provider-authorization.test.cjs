const test=require('node:test'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
const {sourceLoader}=require('../editor/source-loader.cjs');
const {readLocalWorkspaceConfig}=require('../../lib/platform/local-workspace-config.ts');
const {parseProviderQuery}=require('../../lib/security/document-provider-upstream.ts');
const anon=['header',Buffer.from(JSON.stringify({role:'anon',iss:'supabase'})).toString('base64url'),'signature'].join('.');
const env={ROSELAND_LOCAL_WORKSPACE:'supabase',ROSELAND_LOCAL_DOCUMENT_PROVIDERS:'live',SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',ROSELAND_LOCAL_SUPABASE_URL:'http://127.0.0.1:56521',ROSELAND_LOCAL_SUPABASE_ANON_KEY:anon,SUPABASE_URL:'http://127.0.0.1:56521',SUPABASE_PUBLISHABLE_KEY:anon,SUPABASE_SERVICE_ROLE_KEY:'fictional-service-key'};
const schedule='00000000-0000-4000-8000-000000000001';
function req(headers={},body={operation:'search',query:'Raleigh Union Station',schedule}){return new NextRequest('http://127.0.0.1:3488/api/platform/local-document-providers',{method:'POST',headers:{host:'127.0.0.1:3488',origin:'http://127.0.0.1:3488',authorization:'Bearer header.payload.signature','content-type':'application/json',...headers},body:JSON.stringify(body)});}
async function run(fn){const previous={...process.env},oldFetch=global.fetch;Object.assign(process.env,env);let providerCalls=0;const rpc=[];let active=true,allowed=true;
  global.fetch=async(url,init)=>{rpc.push({url,init});return String(url).endsWith('require_active_schedule_session')?new Response(null,{status:active?204:401}):Response.json(allowed);};
  const route=sourceLoader({'@/lib/platform/local-workspace-config':{readLocalWorkspaceConfig},'@/lib/platform/server':{readPlatformJson:r=>r.json(),PlatformHttpError:class extends Error{}},'@/lib/security/places-proxy':{createPlacesBudget:()=>()=>true},'@/lib/security/document-provider-upstream':{parseProviderQuery,requestDocumentProvider:async()=>{providerCalls++;return [];}}})('app/api/platform/local-document-providers/route.ts');
  try{await fn(route,{rpc,calls:()=>providerCalls,session:value=>{active=value;},permission:value=>{allowed=value;}});}finally{global.fetch=oldFetch;for(const key of Object.keys(env)){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}}
}
test('local providers require active session and effective schedule editing permission',async()=>run(async(route,state)=>{
  state.session(false);assert.equal((await route.POST(req())).status,401);assert.equal(state.calls(),0);
  state.session(true);state.permission(false);assert.equal((await route.POST(req())).status,403);assert.equal(state.calls(),0);
  state.permission(true);const response=await route.POST(req());assert.equal(response.status,200);assert.equal(state.calls(),1);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.equal(new Headers(state.rpc[0].init.headers).get('apikey'),anon,'no service role used for admission');
}));
test('foreign origin, missing auth, malformed data and disabled live mode cannot reach providers',async()=>run(async(route,state)=>{
  assert.equal((await route.POST(req({origin:'https://outside.invalid'}))).status,403);
  assert.equal((await route.POST(req({authorization:''}))).status,401);
  assert.equal((await route.POST(req({}, {operation:'search',query:'x',schedule:'bad'}))).status,400);
  delete process.env.ROSELAND_LOCAL_DOCUMENT_PROVIDERS;assert.equal((await route.POST(req())).status,404);assert.equal(state.calls(),0);assert.equal(state.rpc.length,0);
}));
