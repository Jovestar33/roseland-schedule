const {test}=require('node:test'),assert=require('node:assert/strict');
const {sourceLoader}=require('../editor/source-loader.cjs');
function harness(fail=false){const calls=[];const route=sourceLoader({'next/server':{},'@/lib/platform/contracts':sourceLoader()('lib/platform/contracts.ts'),'@/lib/platform/server':{
 PlatformHttpError:class extends Error{constructor(status,message){super(message);this.status=status;}},
 authenticatePlatformRequest:async(_request,age)=>{calls.push({kind:'auth',age});if(fail)throw Error('denied');return{actor:{userId:'actor',aal:'aal2',authenticatedAt:'verified-time'},config:{fixture:true}};},
 callPlatformJsonRpc:async(config,name,payload)=>{calls.push({kind:'rpc',config,name,payload});return{authorized:true,actorId:'actor'};},
 platformJson:(body,status)=>({body,status}),platformError:error=>({status:error.status||403}),
}})('app/api/platform/console/route.ts');return{calls,route};}
test('console request uses verified actor data, bounded input, and recent auth for organization metadata',async()=>{
 const h=harness();const request={nextUrl:new URL('https://example.test/api/platform/console?view=organizations&search=Studio'),headers:new Headers({'x-actor-user-id':'forged'})};
 const result=await h.route.GET(request);assert.equal(result.status,200);assert.equal(h.calls[0].age,900);
 assert.deepEqual(h.calls[1].payload,{p_actor_user_id:'actor',p_actor_aal:'aal2',p_actor_authenticated_at:'verified-time',p_view:'organizations',p_after_id:null,p_search:'Studio'});
});
test('invalid console input and denied authentication never dispatch a metadata RPC',async()=>{
 for(const query of ['view=unknown','view=organizations&after=bad','search='+('a'.repeat(101))]){const h=harness();const result=await h.route.GET({nextUrl:new URL('https://example.test/api/platform/console?'+query)});assert.ok(result.status>=400);assert.equal(h.calls.length,0);}
 const h=harness(true);await h.route.GET({nextUrl:new URL('https://example.test/api/platform/console')});assert.equal(h.calls.length,1);assert.equal(h.calls[0].kind,'auth');
});
