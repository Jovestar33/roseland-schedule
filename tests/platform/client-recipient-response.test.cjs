const {test,afterEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),{NextRequest}=require('next/server');
const originalFetch=global.fetch,oldSecret=process.env.SUPABASE_SERVICE_ROLE_KEY;
afterEach(()=>{global.fetch=originalFetch;if(oldSecret===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldSecret;});
function setup(){
 process.env.SUPABASE_SERVICE_ROLE_KEY='fictional-server-secret-for-cookie-tests-12345';let calls=[];let result={name:'Fictional client view',document:{rows:[],meta:{}}},status=200;
 global.fetch=async(url,init)=>{calls.push({url,init});return Response.json(result,{status});};
 const cache=new Map();function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(name=>name==='./local-workspace-config.ts'?{readLocalWorkspaceConfig:()=>({supabaseUrl:'http://127.0.0.1:56521'})}:name==='./server.ts'?{readPlatformJson:r=>r.json()}:name.startsWith('.')?load(path.resolve(path.dirname(file),name)):require(name),mod,mod.exports);return mod.exports;}
 const api=load('lib/platform/client-recipient-response.ts');return {...api,calls,setResult(value,nextStatus=200){result=value;status=nextStatus;}};
}
function request(suffix='',cookie,origin='http://127.0.0.1:3512',body){return new NextRequest('http://127.0.0.1:3512/api/platform/local-client-view'+suffix,{method:'POST',headers:{host:'127.0.0.1:3512',origin,'sec-fetch-site':'same-origin',...(cookie?{cookie}:{}),'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
async function exchange(api,token='a'.repeat(64)){const res=await api.exchangeClientRecipient(request('',undefined,undefined,{token}));assert.equal(res.status,200);const {recipient}=await res.json(),setCookie=res.headers.get('set-cookie');return {recipient,setCookie,cookie:setCookie.split(';')[0]};}
test('exchange proves grant then reload checks original grant with an HttpOnly narrowly scoped cookie',async()=>{
 const api=setup(),a=await exchange(api);assert.match(a.setCookie,/HttpOnly/i);assert.match(a.setCookie,/SameSite=strict/i);assert.ok(a.setCookie.includes('/local-client-view/'+a.recipient));assert.equal(a.setCookie.includes('Domain='),false);
 const response=await api.readClientRecipient(request('/'+a.recipient,a.cookie),a.recipient);assert.equal(response.status,200);assert.equal(api.calls.length,2);assert.deepEqual(JSON.parse(api.calls[0].init.body),JSON.parse(api.calls[1].init.body));assert.equal(response.headers.get('set-cookie'),null);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('referrer-policy'),'no-referrer');
});
test('separate shared schedules never substitute cookies or overwrite their paths',async()=>{
 const api=setup(),a=await exchange(api),b=await exchange(api,'b'.repeat(64));assert.notEqual(a.recipient,b.recipient);assert.notEqual(a.setCookie,b.setCookie);
 const before=api.calls.length;assert.equal((await api.readClientRecipient(request('/'+b.recipient,a.cookie),b.recipient)).status,404);assert.equal(api.calls.length,before);
 assert.equal((await api.readClientRecipient(request('/'+a.recipient,a.cookie),a.recipient)).status,200);
});
test('revocation, expiry or sponsor denial is rechecked and clears the recipient cookie',async()=>{
 const api=setup(),a=await exchange(api);api.setResult(null);
 const response=await api.readClientRecipient(request('/'+a.recipient,a.cookie),a.recipient);assert.equal(response.status,404);assert.match(response.headers.get('set-cookie'),/1970/);assert.equal(api.calls.length,2);
});
test('missing cookies are explicit; unavailable/rate-limited backend never loses a valid cookie',async()=>{
 const api=setup(),a=await exchange(api);const missing=await api.readClientRecipient(request('/'+a.recipient),a.recipient);assert.equal(missing.status,428);assert.equal((await missing.json()).code,'cookies_required');
 for(const [body,status,want] of [[{error:'offline'},503,503],[{limited:true},200,429]]){api.setResult(body,status);const res=await api.readClientRecipient(request('/'+a.recipient,a.cookie),a.recipient);assert.equal(res.status,want);assert.equal(res.headers.get('set-cookie'),null);}
});
test('cross-origin exchange/read and invalid explicit tokens cannot use prior cookies',async()=>{
 const api=setup(),a=await exchange(api),count=api.calls.length;
 assert.equal((await api.exchangeClientRecipient(request('',a.cookie,'https://outside.example',{token:'a'.repeat(64)}))).status,403);
 assert.equal((await api.readClientRecipient(request('/'+a.recipient,a.cookie,'https://outside.example'),a.recipient)).status,403);
 assert.equal((await api.exchangeClientRecipient(request('',a.cookie,undefined,{token:'bad'}))).status,404);assert.equal(api.calls.length,count);
});
