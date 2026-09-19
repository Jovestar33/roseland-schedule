const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react');

// Render the actual presentation with named hook-state fixtures. Effects and IO
// are excluded: these tests do not simulate successful authentication or mail.
function render(file,state,props){
 const tagState=context=>root=>ts.visitNode(root,function visit(node){
  if(ts.isVariableDeclaration(node)&&ts.isArrayBindingPattern(node.name)&&ts.isCallExpression(node.initializer)&&node.initializer.expression.getText()==='useState'){
   const key=node.name.elements[0].name.text,initial=node.initializer.arguments[0]??ts.factory.createIdentifier('undefined');
   const arg=ts.factory.createObjectLiteralExpression([ts.factory.createPropertyAssignment('key',ts.factory.createStringLiteral(key)),ts.factory.createPropertyAssignment('initial',initial)]);
   return ts.factory.updateVariableDeclaration(node,node.name,node.exclamationToken,node.type,ts.factory.updateCallExpression(node.initializer,node.initializer.expression,node.initializer.typeArguments,[arg]));
  }
  return ts.visitEachChild(node,visit,context);
 });
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},transformers:{before:[tagState]}}).outputText;
 const client={auth:{}},identity={actor:'fixture-actor',generation:1};
 const mocks={react:{...React,useState:({key,initial})=>[Object.hasOwn(state,key)?state[key]:typeof initial==='function'?initial():initial,()=>{}],useRef:value=>({current:value}),useEffect:()=>{},useLayoutEffect:()=>{},useCallback:f=>f},
  '@supabase/supabase-js':{createClient:()=>client},
  '@/lib/platform/account-session':{accountSessionStorage:()=>({}),FICTIONAL_TERMS:'fictional',FICTIONAL_PRIVACY:'fictional'},
  '@/lib/platform/workspace-navigation':{WorkspaceIdentity:class{constructor(){Object.assign(this,identity);}},workspaceHref:()=>'/review'},
  '@/lib/platform/workspace-repository':{createWorkspaceRepository:()=>({})},
  '@/lib/store/scheduleStore':{useScheduleStore:{getState:()=>({})}},
  '@/components/local/LocalWorkspaceContext':{LocalWorkspaceContext:{Provider:({children})=>children}}};
 const mod={exports:{}};
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})', {filename:file})(name=>mocks[name]??(name==='react/jsx-runtime'?require(name):name.endsWith('.css')?{default:{}}:{default:()=>null}),mod,mod.exports);
 return mod.exports.default(props);
}
function nodes(tree,visible=true,result=[]){
 if(Array.isArray(tree)){tree.forEach(n=>nodes(n,visible,result));return result;}
 if(!tree||typeof tree!=='object')return result;
 const shown=visible&&!tree.props?.hidden;
 result.push({node:tree,shown});nodes(tree.props?.children,shown,result);return result;
}
const config={accountOnboarding:true,supabaseUrl:'http://127.0.0.1:56521',anonymousKey:'fictional'};
const session={user:{id:'fixture-actor',email:'fixture@example.test'},access_token:'fixture-not-a-token'};
const org={id:'fictional-org',role:'member',name:'Fictional Studio'};
const base={session,accountReady:true,mfaReady:true,mfaStage:'ready',directoryState:'ready',scope:org,visited:[org],location:{screen:'schedule',organization:org.id,schedule:'fictional-draft'},message:'Sign in again with the same account. Retained drafts and requests are still in this workspace.'};
const workspace=state=>nodes(render('app/local-workspace/LocalWorkspaceClient.tsx',{...base,...state},{config,review:true}));
test('expired session has one sign-in task and no visible workspace controls, retaining mounted draft panels',()=>{
 const all=workspace({authNeeded:true,showSettings:true});
 assert.equal(all.filter(({node,shown})=>shown&&node.type==='form').length,1);
 assert.equal(all.filter(({node,shown})=>shown&&node.type==='nav').length,0);
 const messages=all.filter(({node,shown})=>shown&&node.props?.role==='status');
 assert.equal(messages.length,1);assert.match(messages[0].node.props.children,/Your session has expired/);
 assert.ok(all.some(({node,shown})=>!shown&&node.props?.panelId===undefined&&node.props?.value?.panelId==='schedule'));
 const normal=workspace({authNeeded:false,message:'Signed in'});
 assert.ok(normal.some(({node,shown})=>shown&&node.props?.value?.panelId==='schedule'));
});
test('account subtask hides sign-in even after expiry and preserves its entered values and route',()=>{
 const all=workspace({authNeeded:true,accountTask:true,email:'retained@example.test',password:'unsent-fixture'});
 const form=all.find(({node})=>node.props?.['aria-label']==='Workspace sign in');assert.equal(form.shown,false);
 const password=all.find(({node})=>node.type==='input'&&node.props.type==='password');assert.equal(password.node.props.value,'unsent-fixture');
 assert.ok(all.some(({node})=>node.props?.value?.panelId==='schedule'&&node.props.value.organization.id===org.id));
});
test('invitation error/loading presentation keeps one form, original required fields and cancel protection',()=>{
 const props={config,review:true,session:null,authNeeded:false,onReady:()=>{},requireAuth:()=>{},onInvitation:()=>{}};
 const all=nodes(render('components/local/LocalAccountAccess.tsx',{mode:'signup',message:'Request unavailable.',busy:true,email:'retained@example.test',invitation:'retained-id'},props));
 assert.equal(all.filter(({node,shown})=>shown&&node.type==='form').length,1);
 const inputs=all.filter(({node,shown})=>shown&&node.type==='input');
 assert.ok(inputs.some(({node})=>node.props.value==='retained-id'&&node.props.required));
 assert.ok(all.some(({node,shown})=>shown&&node.props?.role==='status'&&node.props.children==='Request unavailable.'));
 const buttons=all.filter(({node,shown})=>shown&&node.type==='button');
 assert.ok(buttons.some(({node})=>node.props.children==='Sending…'&&node.props.disabled));
 assert.ok(buttons.some(({node})=>node.props.children==='Back to sign in'&&node.props.disabled));
});
test('expired child notice is suppressed while callback errors remain visible and callback excludes invitation form',()=>{
 const props={config,review:true,session,authNeeded:true,onReady:()=>{},requireAuth:()=>{},onInvitation:()=>{}};
 let all=nodes(render('components/local/LocalAccountAccess.tsx',{message:'You have been inactive for one hour.',policy:{accepted:false,termsVersion:'fictional',privacyVersion:'fictional'}},props));
 assert.equal(all.filter(({node,shown})=>shown&&node.props?.role==='status').length,0);
 assert.equal(all.filter(({node,shown})=>shown&&node.type==='form').length,0);
 all=nodes(render('components/local/LocalAccountAccess.tsx',{mode:'signup',callback:{type:'recovery'},message:'This email link is unavailable.'},props));
 assert.ok(all.some(({node,shown})=>shown&&node.props?.role==='status'));
 assert.equal(all.filter(({node,shown})=>shown&&node.type==='form').length,0);
 assert.ok(all.some(({node,shown})=>shown&&node.type==='button'&&node.props.children==='Close email action'));
});

test('unavailable organization and MFA checks form one recovery task and preserve mounted disabled drafts',()=>{
 const all=workspace({mfaReady:false,mfaStage:'unavailable',directoryState:'error',showSettings:true,message:'Organizations could not be refreshed. Your drafts are retained.'});
 const visible=all.filter(v=>v.shown);
 assert.equal(visible.filter(({node})=>node.props?.role==='status').length,1);
 assert.ok(visible.some(({node})=>node.type==='h1'&&node.props.children==='Unable to check your access'));
 assert.equal(visible.filter(({node})=>node.type==='button'&&node.props.children==='Try again').length,1);
 assert.ok(all.some(({node,shown})=>!shown&&node.props?.value?.panelId==='schedule'&&!node.props.value.active&&node.props.value.authNeeded));
 assert.ok(visible.some(({node})=>node.type==='span'&&node.props.children===org.name));
});
test('checking has no competing retry, and directory-only failure also disables retained panels',()=>{
 let all=workspace({mfaReady:false,mfaStage:'checking',directoryState:'loading'});
 assert.ok(all.some(({node,shown})=>shown&&node.type==='button'&&node.props.children==='Checking…'&&node.props.disabled));
 assert.equal(all.filter(({node,shown})=>shown&&node.type==='form').length,0);
 all=workspace({directoryState:'error'});
 assert.ok(all.some(({node,shown})=>!shown&&node.props?.value?.panelId==='schedule'&&!node.props.value.active));
});

test('password maintenance stays hidden outside account settings while account checks remain available',()=>{
 const all=nodes(render('components/local/LocalAccountAccess.tsx',{}, {config,review:true,showMaintenance:false,session,authNeeded:false,onReady:()=>{},requireAuth:()=>{},onInvitation:()=>{}}));
 assert.ok(all.some(({node,shown})=>!shown&&node.type==='button'&&node.props.children==='Reset password'));
 assert.ok(all.some(({node,shown})=>shown&&node.type==='button'&&node.props.children==='Retry account checks'));
});
