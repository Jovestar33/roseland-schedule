const {test,afterEach}=require('node:test'),assert=require('node:assert/strict');
const {NextRequest}=require('next/server');
const {sourceLoader}=require('../editor/source-loader.cjs');
const previous={fetch:global.fetch,secret:process.env.SUPABASE_SECRET_KEY};
afterEach(()=>{global.fetch=previous.fetch;if(previous.secret===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=previous.secret;});
const origin='https://schedules.example.com';
function setup(){
 process.env.SUPABASE_SECRET_KEY='sb_secret_fictional_hosted_cookie_test_key';
 let calls=[],result={name:'Fictional shared schedule',document:{rows:[],meta:{}}},configured=true;
 global.fetch=async(url,init)=>{calls.push({url,init});return Response.json(result);};
 const load=sourceLoader({'./service-headers.ts':require('../../lib/platform/service-headers.ts'),'./legacy-client-token.ts':require('../../lib/platform/legacy-client-token.ts'),'./client-recipient-session.ts':require('../../lib/platform/client-recipient-session.ts'),'./hosted-workspace-config.ts':{readHostedWorkspaceConfig:(_,host)=>configured&&host==='schedules.example.com'?{appOrigin:origin,supabaseUrl:'https://abcdefghijklmnopqrst.supabase.co'}:null},'./local-workspace-config.ts':{readLocalWorkspaceConfig:()=>{throw Error('Hosted request used local configuration');}},'./server.ts':{readPlatformJson:r=>r.json()}});
 return {...load('lib/platform/client-recipient-response.ts'),calls,revoke:()=>result=null,disable:()=>configured=false};
}
function req(suffix='',cookie,body,sentOrigin=origin){return new NextRequest(origin+'/api/platform/client-view'+suffix,{method:'POST',headers:{host:'schedules.example.com',origin:sentOrigin,'sec-fetch-site':'same-origin','content-type':'application/json',...(cookie?{cookie}:{})},...(body?{body:JSON.stringify(body)}:{})});}
async function exchange(api){const response=await api.exchangeClientRecipient(req('',null,{token:'a'.repeat(64)}),'hosted');assert.equal(response.status,200);const {recipient}=await response.json(),setCookie=response.headers.get('set-cookie');return {recipient,setCookie,cookie:setCookie.split(';')[0]};}
test('hosted shared links use secure scoped cookies and recheck the grant on every read',async()=>{
 const api=setup(),a=await exchange(api);assert.match(a.setCookie,/; Secure/);assert.match(a.setCookie,/HttpOnly/);assert.match(a.setCookie,/SameSite=strict/i);assert.ok(a.setCookie.includes('/api/platform/client-view/'+a.recipient));assert.ok(!a.setCookie.includes('local-client'));
 assert.equal((await api.readClientRecipient(req('/'+a.recipient,a.cookie),a.recipient,'hosted')).status,200);assert.equal(api.calls.length,2);assert.deepEqual(api.calls[0],api.calls[1]);
 api.revoke();const denied=await api.readClientRecipient(req('/'+a.recipient,a.cookie),a.recipient,'hosted');assert.equal(denied.status,404);assert.match(denied.headers.get('set-cookie'),/1970/);
});
test('hosted client routes reject wrong origins and missing configuration before backend access',async()=>{
 const api=setup();assert.equal((await api.exchangeClientRecipient(req('',null,{token:'a'.repeat(64)},'https://outside.example'),'hosted')).status,403);
 api.disable();assert.equal((await api.exchangeClientRecipient(req('',null,{token:'a'.repeat(64)}),'hosted')).status,403);assert.equal(api.calls.length,0);
});
