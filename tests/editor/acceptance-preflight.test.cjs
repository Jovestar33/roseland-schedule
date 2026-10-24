const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
function harness(){
 let values=[],refs=[],slot=0,refSlot=0,tree,accepts=0,resolve,reject;
 const actor='00000000-0000-4000-8000-000000000001';
 const session={user:{id:actor,email:'fixture@example.test'},access_token:'fixture-token'};
 const attempt={actor,invitationId:'00000000-0000-4000-8000-000000000002'};
 const request=new Promise((a,b)=>{resolve=a;reject=b;});
 const controller={attempt,phase:'review',failure:null,receipt:null,execute:async()=>{accepts++;controller.phase='success';}};
 const workspace={active:true,authNeeded:false,review:true,session,client:{rpc:()=>({setHeader:()=>request})},requireAuth(){},openOrganization(){}};
 let authRef=0;
 const react={...React,useEffect(){},useState(initial){const i=slot++;if(!(i in values)){values[i]=typeof initial==='function'?initial():initial;}return [values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},useRef(initial){const i=refSlot++;if(!(i in refs)){refs[i]={current:initial};if(initial===null&&authRef++===0)refs[i].current=actor;else if(initial===null&&authRef===2)refs[i].current=session;}return refs[i];}};
 // Identify state slots from the actual declaration, rather than relying on incidental order.
 const source=fs.readFileSync('app/local-accept-invitation/LocalAcceptanceClient.tsx','utf8');
 const transform=context=>node=>ts.visitNode(node,function visit(n){if(ts.isVariableDeclaration(n)&&ts.isArrayBindingPattern(n.name)&&n.initializer&&ts.isCallExpression(n.initializer)&&n.initializer.expression.getText()==='useState'&&n.name.elements[0]?.name?.text==='session')return ts.factory.updateVariableDeclaration(n,n.name,n.exclamationToken,n.type,ts.factory.updateCallExpression(n.initializer,n.initializer.expression,n.initializer.typeArguments,[ts.factory.createIdentifier('__fixtureSession')]));return ts.visitEachChild(n,visit,context);});
 const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},transformers:{before:[transform]}}).outputText;
 const mocks={react,'@supabase/supabase-js':{createClient:()=>workspace.client},'@/components/local/LocalWorkspaceContext':{useLocalWorkspace:()=>workspace,useWorkspacePanelState(){}},'@/lib/platform/acceptance-controller':{AcceptanceController:function(){return controller;}},'@/lib/platform/acceptance-repository':{createAcceptanceRepository:()=>({})},'../local-invitations/invitations.module.css':{default:{}}};
 const mod={exports:{}};vm.runInThisContext('(function(require,module,exports,__fixtureSession){'+code+'\n})')(name=>mocks[name]||require(name),mod,mod.exports,session);
 function render(){slot=0;refSlot=0;tree=mod.exports.default({config:{accountOnboarding:true}});return tree;}
 function nodes(n=tree){return !n||typeof n!=='object'?[]:[n,...React.Children.toArray(n.props?.children).flatMap(x=>nodes(x))];}
 function text(n=tree){return typeof n==='string'?n:React.Children.toArray(n?.props?.children).map(x=>text(x)).join(' ');}
 const submit=()=>nodes().find(n=>n.type==='button'&&text(n)==='Accept invitation').props.onClick();
 render();return{workspace,render,text,submit,resolve,reject,get accepts(){return accepts;},async flush(){await new Promise(setImmediate);render();}};
}
test('acceptance preflight rejection produces retry feedback and does not submit access',async()=>{
 const h=harness();h.submit();h.reject(new Error('offline'));await h.flush();assert.equal(h.accepts,0);assert.match(h.text(),/couldn’t check this invitation/);
});
test('late acceptance preflight cannot continue after the active screen changes',async()=>{
 const h=harness();h.submit();h.workspace.active=false;h.render();h.resolve({data:{organizationName:'Fixture'},error:null});await h.flush();assert.equal(h.accepts,0);assert.doesNotMatch(h.text(),/Invitation accepted/);
});
test('late acceptance preflight cannot continue after session replacement',async()=>{
 const h=harness();h.submit();h.workspace.session={...h.workspace.session,access_token:'replacement-token'};h.render();h.resolve({data:{organizationName:'Fixture'},error:null});await h.flush();assert.equal(h.accepts,0);
});
test('matching active preflight proceeds with the reviewed invitation',async()=>{
 const h=harness();h.submit();h.resolve({data:{organizationName:'Fixture'},error:null});await h.flush();assert.equal(h.accepts,1);
});
