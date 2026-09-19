const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
// Run the real component effects with controlled read responses. No credentials,
// enrollment, provider grants or account changes are performed by this harness.
function fixture(){
 let hooks=[],cursor=0,pending=[],effects=[],tree,ready=[],stage=[],batches=[];
 let props={review:true,managedRecovery:true,session:{user:{id:'fixture'},access_token:'not-a-token'},authNeeded:false,organization:'org-a',revision:0,recentRequired:false,onReady:v=>ready.push(v),onStageChange:v=>stage.push(v),onVerified:()=>{}};
 let batch;
 function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
 const client={rpc(name){if(name==='get_my_mfa_status'){batch={status:deferred(),orgs:deferred(),factors:deferred()};batches.push(batch);}return {setHeader:()=>batch[name==='get_my_mfa_status'?'status':'orgs'].promise};},auth:{mfa:{listFactors:()=>batch.factors.promise}}};props.client=client;
 const react={...React,useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return [hooks[i],value=>{const next=typeof value==='function'?value(hooks[i]):value;if(next!==hooks[i]){hooks[i]=next;pending.push(true);}}];},useRef(value){const i=cursor++;return hooks[i]??(hooks[i]={current:value});},useEffect(fn,deps){const i=cursor++;const previous=hooks[i];if(!previous||deps.some((d,k)=>d!==previous.deps[k]))effects.push(()=>{previous?.cleanup?.();hooks[i]={deps,cleanup:fn()};});}};
 const code=ts.transpileModule(fs.readFileSync('components/local/LocalMfaAccess.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(name=>name==='react'?react:require(name),mod,mod.exports);
 function render(){let n=0;do{assert.ok(n++<20,'bounded render');pending=[];cursor=0;tree=mod.exports.default(props);const run=effects;effects=[];run.forEach(f=>f());}while(pending.length);return tree;}
 async function flush(){await new Promise(setImmediate);render();await new Promise(setImmediate);return render();}
 function reply(b,{error=false,required=false,verified=false}={}){b.status.resolve({data:{required,aal:'aal1'},error:error?{}:null});b.orgs.resolve({data:[{id:props.organization,mfa_required:false}],error:null});b.factors.resolve({data:{totp:verified?[{id:'fictional-factor',status:'verified'}]:[]},error:null});}
 render();return {ready,stage,batches,render,flush,reply,get tree(){return tree;},update(value){props={...props,...value};render();}};
}
function text(tree){if(Array.isArray(tree))return tree.map(text).join(' ');return typeof tree==='string'?tree:tree?.props?text(tree.props.children):'';}
test('initial unavailable checks never become an authenticator task; explicit retry can recover',async()=>{
 const f=fixture();f.reply(f.batches[0],{error:true});await f.flush();assert.equal(f.stage.at(-1),'unavailable');assert.equal(f.ready.at(-1),false);assert.equal(f.tree,null);
 f.update({revision:1});assert.equal(f.stage.at(-1),'checking');f.reply(f.batches[1]);await f.flush();assert.equal(f.stage.at(-1),'ready');assert.equal(f.ready.at(-1),true);
});
test('failed background check revokes ready state; repeated failure remains unavailable',async()=>{
 const f=fixture();f.reply(f.batches[0]);await f.flush();assert.equal(f.ready.at(-1),true);
 f.update({revision:1});f.reply(f.batches[1],{error:true});await f.flush();assert.equal(f.ready.at(-1),false);assert.equal(f.stage.at(-1),'unavailable');
 f.update({revision:2});f.reply(f.batches[2],{error:true});await f.flush();assert.equal(f.stage.at(-1),'unavailable');
});
test('only a successful required-factor check shows a code challenge',async()=>{
 const f=fixture();f.reply(f.batches[0],{required:true,verified:true});await f.flush();assert.equal(f.stage.at(-1),'code');assert.equal(f.ready.at(-1),false);assert.match(text(f.tree),/Verify your authenticator/);assert.doesNotMatch(text(f.tree),/local batch|Retry MFA checks/);
});
test('required access without a factor shows setup, not a code prompt',async()=>{
 const f=fixture();f.reply(f.batches[0],{required:true});await f.flush();assert.equal(f.stage.at(-1),'enroll');assert.match(text(f.tree),/Set up two-step verification/);assert.doesNotMatch(text(f.tree),/Authenticator code/);
});
test('late success for an old organization cannot restore access after new-context failure',async()=>{
 const f=fixture();f.update({organization:'org-b'});f.reply(f.batches[1],{error:true});await f.flush();f.reply(f.batches[0]);await f.flush();assert.equal(f.stage.at(-1),'unavailable');assert.equal(f.ready.at(-1),false);
});
test('expired session invalidates pending checks and excludes the authenticator task',async()=>{
 const f=fixture();f.update({authNeeded:true});f.reply(f.batches[0],{required:true,verified:true});await f.flush();assert.equal(f.tree,null);assert.equal(f.ready.at(-1),false);assert.notEqual(f.stage.at(-1),'code');
});

test('successful retry clears unavailable copy before showing a required challenge',async()=>{
 const f=fixture();f.reply(f.batches[0],{error:true});await f.flush();f.update({revision:1});f.reply(f.batches[1],{required:true,verified:true});await f.flush();assert.equal(f.stage.at(-1),'code');assert.doesNotMatch(text(f.tree),/temporarily unavailable/);
});
