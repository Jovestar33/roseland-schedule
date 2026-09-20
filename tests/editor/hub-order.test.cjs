const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {sourceLoader}=require('./source-loader.cjs');
const {orderProductions,moveProduction}=sourceLoader()('lib/production-order.ts');
test('hub moves preserve every hub, respect boundaries, and survive library reload with new hubs',()=>{
 const input=['alpha','beta','gamma']; const moved=moveProduction(input,'gamma',-1);
 assert.deepEqual(moved,['alpha','gamma','beta']);assert.deepEqual(input,['alpha','beta','gamma']);
 assert.deepEqual(orderProductions(['beta','new','gamma','alpha'],v=>v,moved),['alpha','gamma','beta','new']);
 assert.deepEqual(moveProduction(input,'alpha',-1),input);assert.deepEqual(moveProduction(input,'gamma',1),input);
 assert.deepEqual(moveProduction(moved,'gamma',1),input);
});
test('legacy hub order saves and reads back through authenticated library API',async()=>{
 let blob;const mod={exports:{}};const secret='fixture-secret',password='fixture-password';
 const context={exports:mod.exports,require:name=>name==='@netlify/blobs'?{connectLambda(){},getStore:()=>({get:async()=>blob,set:async(_key,value)=>{blob=value;}})}:require(name),process:{env:{SCHEDULE_APP_PASSWORD:password,SCHEDULE_AUTH_SECRET:secret}},console:{log(){},error(){}}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../netlify/functions/library.js'),'utf8'),context);
 const token=crypto.createHmac('sha256',secret).update(`editor:${password}`).digest('hex');
 const incoming={version:1,folders:[],scheduleFolderMap:{},productionOrder:['gamma','alpha','gamma',17],phaseOrder:{alpha:{shoot:['Day 1']}},tsarchived:['Day 2']};
 const denied=await mod.exports.handler({httpMethod:'POST',body:JSON.stringify({library:incoming})});assert.equal(denied.statusCode,403);assert.equal(blob,undefined);
 const save=await mod.exports.handler({httpMethod:'POST',body:JSON.stringify({editorToken:token,library:incoming})});assert.equal(save.statusCode,200);
 const reload=await mod.exports.handler({httpMethod:'GET',queryStringParameters:{editorToken:token}});const saved=JSON.parse(reload.body).library;
 assert.deepEqual(saved.productionOrder,['gamma','alpha']);assert.deepEqual(saved.phaseOrder,incoming.phaseOrder);assert.deepEqual(saved.tsarchived,incoming.tsarchived);
});
