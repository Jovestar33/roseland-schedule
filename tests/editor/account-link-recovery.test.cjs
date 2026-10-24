const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');

// Actual component handlers and state transitions; no network, credentials or mail.
function fixture({type='recovery',outcomes=[],signOutError=null,session=null}={}){
 const state={callback:{type,tokenHash:'preview-only',invitationId:type==='invite'?'invitation-preview':null},policy:session?{accepted:true,enforced:false}:null};
 let tree,refIndex=0,refs=[],verifications=0,securityChecks=0,callbackSignOuts=0,workspaceChanges=0,mailRequests=0;
 const callbackClient={auth:{verifyOtp:async()=>{const value=outcomes[verifications++];if(value instanceof Error)throw value;return value;},signOut:async()=>{callbackSignOuts++;if(signOutError instanceof Error)throw signOutError;return{error:signOutError};},mfa:{listFactors:async()=>{securityChecks++;return{data:{totp:[{id:'existing-factor',status:'verified'}]},error:null};}}}};
 const react={...React,useEffect(){},useLayoutEffect(){},useState({key,initial}){if(!Object.hasOwn(state,key))state[key]=typeof initial==='function'?initial():initial;return[state[key],value=>{state[key]=typeof value==='function'?value(state[key]):value;}];},useRef(initial){const i=refIndex++;return refs[i]??=( {current:initial} );}};
 const tag=context=>root=>ts.visitNode(root,function visit(n){
  if(ts.isVariableDeclaration(n)&&ts.isArrayBindingPattern(n.name)&&n.initializer&&ts.isCallExpression(n.initializer)&&n.initializer.expression.getText()==='useState'){
   const key=n.name.elements[0].name.text;
   return ts.factory.updateVariableDeclaration(n,n.name,n.exclamationToken,n.type,ts.factory.updateCallExpression(n.initializer,n.initializer.expression,n.initializer.typeArguments,[ts.factory.createObjectLiteralExpression([ts.factory.createPropertyAssignment('key',ts.factory.createStringLiteral(key)),ts.factory.createPropertyAssignment('initial',n.initializer.arguments[0]??ts.factory.createIdentifier('undefined'))])]));
  }return ts.visitEachChild(n,visit,context);
 });
 const code=ts.transpileModule(fs.readFileSync('components/local/LocalAccountAccess.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true},transformers:{before:[tag]}}).outputText;
 const mocks={react,'@supabase/supabase-js':{createClient:()=>callbackClient},'@/lib/platform/account-session':{accountPolicyAllowsEntry:()=>true}};
 const mod={exports:{}};vm.runInThisContext('(function(require,module,exports,fetch){'+code+'\n})')(name=>mocks[name]??require(name),mod,mod.exports,async()=>{mailRequests++;return{ok:true,json:async()=>({message:'Fixture email requested'})};});
 const props={review:true,config:{hosted:true,supabaseUrl:'http://example.test',anonymousKey:'fixture-only'},client:{auth:{signOut(){throw Error('Must not sign out workspace');}}},session,authNeeded:false,onReady(){workspaceChanges++;},requireAuth(){workspaceChanges++;},policyRevision:0,onInvitation(){workspaceChanges++;}};
 function render(){refIndex=0;tree=mod.exports.default(props);}
 function nodes(n=tree){if(!n||typeof n!=='object'||n.props?.hidden)return[];return[n,...React.Children.toArray(n.props?.children).flatMap(child=>nodes(child))];}
 const text=n=>typeof n==='string'?n:React.Children.toArray(n?.props?.children).map(text).join(' ');
 const buttons=()=>nodes().filter(n=>n.type==='button').map(n=>text(n));
 render();return{state,buttons,text:()=>text(tree),nodes,async click(label){const button=nodes().find(n=>n.type==='button'&&text(n)===label);assert.ok(button,`Missing ${label}; available: ${buttons()}`);assert.notEqual(button.props.disabled,true);button.props.onClick();await new Promise(setImmediate);render();},counts:()=>({verifications,securityChecks,callbackSignOuts,workspaceChanges,mailRequests})};
}
const rejected=(status=403,code='otp_expired')=>({error:{status,code,message:'Token has expired or is invalid'},data:{session:null,user:null}});
const verified={error:null,data:{session:{user:{id:'fixture'}},user:{id:'fixture',email:'fixture@example.test'}}};

test('expired reset link replaces Continue with a new-link form and does not send mail or change workspace',async()=>{
 const f=fixture({outcomes:[rejected()]});await f.click('Continue');
 assert.match(f.text(),/Link unavailable/);assert.match(f.text(),/reset link has expired/);
 assert.doesNotMatch(f.text(),/Continue to choose a new password/);assert.ok(!f.buttons().includes('Continue'));
 assert.equal(f.nodes().filter(n=>n.type==='input'&&n.props.type==='password').length,0);
 await f.click('Request a new reset link');
 assert.equal(f.state.callback,null);assert.equal(f.state.mode,'recovery');assert.equal(f.state.callbackFailure,null);
 assert.ok(f.buttons().includes('Send reset link'));assert.ok(f.buttons().includes('Back to sign in'));
 assert.deepEqual(f.counts(),{verifications:1,securityChecks:0,callbackSignOuts:1,workspaceChanges:0,mailRequests:0});
});
test('expired invitation directs user to its sender and back, without offering another token verification',async()=>{
 const f=fixture({type:'invite',outcomes:[rejected()]});await f.click('Continue');
 assert.match(f.text(),/Ask the sender for a new invitation/);assert.ok(!f.buttons().includes('Continue'));assert.ok(!f.buttons().includes('Request a new reset link'));
 await f.click('Back to sign in');assert.equal(f.state.callback,null);assert.equal(f.state.mode,null);assert.ok(f.buttons().includes('Have an invitation?'));assert.equal(f.counts().workspaceChanges,0);
});
test('terminal link inside a signed-in workspace uses contextual Back without signing out workspace',async()=>{
 const session={user:{id:'fixture'},access_token:'fixture-only'};
 const f=fixture({type:'invite',session,outcomes:[rejected()]});await f.click('Continue');assert.ok(f.buttons().includes('Back'));assert.ok(!f.buttons().includes('Back to sign in'));await f.click('Back');assert.equal(f.counts().workspaceChanges,0);
});
for(const [name,outcome] of [
 ['returned network error',{error:{status:0,name:'AuthRetryableFetchError'},data:{session:null}}],
 ['thrown network error',new Error('offline')],
 ['server error',{error:{status:503,name:'AuthRetryableFetchError'},data:{session:null}}],
])test(`${name} stays retryable and a successful retry still checks MFA`,async()=>{
 const f=fixture({outcomes:[outcome,verified]});await f.click('Continue');assert.match(f.text(),/Check your connection and try again/);assert.ok(f.buttons().includes('Try again'));assert.doesNotMatch(f.text(),/has expired/);await f.click('Try again');
 assert.equal(f.state.callbackFailure,null);assert.equal(f.state.callbackEmail,'fixture@example.test');assert.equal(f.state.factor,'existing-factor');assert.equal(f.state.factorChecked,true);
 assert.ok(f.buttons().includes('Update password'));assert.ok(f.nodes().some(n=>n.type==='input'&&n.props.autoComplete==='one-time-code'&&n.props.required));assert.equal(f.counts().securityChecks,1);
});
test('rate limit explains waiting without mislabeling the link as expired',async()=>{
 const f=fixture({outcomes:[{error:{status:429,code:'over_request_rate_limit'},data:{session:null}}]});await f.click('Continue');assert.match(f.text(),/wait a moment/);assert.ok(f.buttons().includes('Try again'));assert.doesNotMatch(f.text(),/has expired/);
});
test('older server rejection without an error code also ends invalid-link verification',async()=>{
 const f=fixture({outcomes:[rejected(400,undefined)]});await f.click('Continue');assert.equal(f.state.callbackFailure,'unavailable');assert.ok(f.buttons().includes('Request a new reset link'));
});
test('verification response without a session cannot expose the password form',async()=>{
 const f=fixture({outcomes:[{error:null,data:{session:null,user:{email:'fixture@example.test'}}}]});await f.click('Continue');assert.equal(f.state.callbackFailure,'unavailable');assert.equal(f.state.factorChecked,false);assert.ok(!f.buttons().includes('Update password'));
});
for(const signOutError of [{message:'not confirmed'},new Error('offline')])test(`failed callback cleanup (${signOutError instanceof Error?'thrown':'returned'}) preserves the step for retry`,async()=>{
 const f=fixture({outcomes:[rejected()],signOutError});await f.click('Continue');await f.click('Request a new reset link');assert.ok(f.state.callback);assert.equal(f.state.mode,null);assert.match(f.text(),/couldn’t close this step/);assert.ok(f.buttons().includes('Request a new reset link'));assert.equal(f.counts().workspaceChanges,0);
});
