const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
const {sourceLoader}=require('./source-loader.cjs');
const navigation=sourceLoader()('lib/platform/workspace-navigation.ts');
const organization={id:'11111111-1111-4111-8111-111111111111',name:'Fictional North',role:'member',access_state:'ready'};
const schedule='22222222-2222-4222-8222-222222222222';
const session={user:{id:'fictional-actor'},access_token:'fictional-not-a-token'};
const settle=()=>new Promise(resolve=>setImmediate(resolve));

// Exercise the actual workspace callbacks/effects with controllable read IO.
// The DOM journeys separately verify the editor's discard dialog and rendering.
function harness({selected=null,busy=false}={}){
 const location={screen:'schedule',organization:organization.id,...(selected?{schedule:selected}:{})};
 const identity=new navigation.WorkspaceIdentity();identity.bind(session.user.id);
 const state={session,identity,location,scope:organization,visited:[organization],organizations:[organization],accountReady:true,mfaReady:true,mfaStage:'ready',directoryState:'ready',panels:{schedule:{dirty:false,busy}}};
 const refs={locationRef:{current:location},sessionRef:{current:session}},effects=[],events={},historyCalls=[],pending=[];
 const browser={location:{search:new URL(navigation.workspaceHref(location), 'http://localhost').search},addEventListener:(name,fn)=>{events[name]=fn;},removeEventListener:()=>{},setInterval:()=>1,clearInterval:()=>{}};
 const history={};for(const method of ['pushState','replaceState'])history[method]=(_s,_t,url)=>{historyCalls.push({method,url});browser.location.search=new URL(url,'http://localhost').search;};
 const repository={organizations:async()=>({items:[organization],more:false}),scope:()=>new Promise(resolve=>pending.push(resolve))};
 const tagHooks=context=>root=>ts.visitNode(root,function visit(node){
  if(ts.isVariableDeclaration(node)&&node.initializer&&ts.isCallExpression(node.initializer)&&['useState','useRef'].includes(node.initializer.expression.getText())){
   const name=ts.isArrayBindingPattern(node.name)?node.name.elements[0].name.text:node.name.text;
   const arg=ts.factory.createObjectLiteralExpression([ts.factory.createPropertyAssignment('name',ts.factory.createStringLiteral(name)),ts.factory.createPropertyAssignment('initial',node.initializer.arguments[0]??ts.factory.createIdentifier('undefined'))]);
   return ts.factory.updateVariableDeclaration(node,node.name,node.exclamationToken,node.type,ts.factory.updateCallExpression(node.initializer,node.initializer.expression,node.initializer.typeArguments,[arg]));
  }return ts.visitEachChild(node,visit,context);
 });
 const mocks={react:{...React,useState:({name,initial})=>{if(!Object.hasOwn(state,name))state[name]=typeof initial==='function'?initial():initial;return[state[name],v=>{state[name]=typeof v==='function'?v(state[name]):v;}];},useRef:({name,initial})=>refs[name]??(refs[name]={current:initial}),useEffect:fn=>effects.push(fn),useCallback:fn=>fn},
  '@supabase/supabase-js':{createClient:()=>({auth:{}})},
  '@/lib/platform/account-session':{accountSessionStorage:()=>({})},
  '@/lib/platform/workspace-navigation':navigation,
  '@/lib/platform/workspace-repository':{createWorkspaceRepository:()=>repository},
  '@/lib/store/scheduleStore':{useScheduleStore:{getState:()=>({})}},
  '@/components/local/LocalWorkspaceContext':{LocalWorkspaceContext:{Provider:'FixtureProvider'}}};
 const source=ts.transpileModule(fs.readFileSync('app/local-workspace/LocalWorkspaceClient.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},transformers:{before:[tagHooks]}}).outputText;
 const mod={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+source+'\n})',{window:browser,history,document:{visibilityState:'visible'},URL,URLSearchParams,console})(name=>mocks[name]??(name==='react/jsx-runtime'?require(name):name.endsWith('.css')?{default:{}}:{default:()=>null}),mod,mod.exports);
 const tree=mod.exports.default({config:{supabaseUrl:'http://localhost',anonymousKey:'fictional'},review:true});
 let panel;function walk(node){if(Array.isArray(node)){node.forEach(walk);return;}if(!node||typeof node!=='object')return;if(node.props?.value?.panelId==='schedule')panel=node.props.value;walk(node.props?.children);}walk(tree);
 assert.ok(panel);
 return {state,refs,historyCalls,pending,panel,refresh(){effects.find(fn=>fn.toString().includes('15000'))();events.focus();},pop(next){effects.find(fn=>fn.toString().includes('popstate'))();browser.location.search=new URL(navigation.workspaceHref(next),'http://localhost').search;events.popstate();}};
}
test('an older background scope read cannot replace a newer editor selection',async()=>{
 const h=harness();h.refresh();await settle();assert.equal(h.pending.length,1);
 h.panel.onScheduleSelection(organization.id,schedule);
 h.pending.shift()(organization);await settle();
 assert.equal(h.refs.locationRef.current.schedule,schedule);
 assert.equal(h.historyCalls.length,1);assert.equal(h.historyCalls[0].method,'pushState');
 assert.equal(h.state.scheduleRequest,null);
});
test('Back to Library sends an editor close request without mislabeling the current draft',()=>{
 const h=harness({selected:schedule});h.pop({screen:'schedule',organization:organization.id});
 assert.equal(h.state.scheduleRequest.target,'library');assert.equal(h.state.scheduleRequest.history,true);
 assert.equal(h.refs.locationRef.current.schedule,schedule);
 assert.match(h.historyCalls.at(-1).url,new RegExp(schedule));
 h.panel.onScheduleSelection(organization.id,null,true);
 assert.equal(h.historyCalls.at(-1).method,'replaceState');assert.equal(h.refs.locationRef.current.schedule,undefined);
});
test('Back while a save is busy retains the schedule address and sends no close request',()=>{
 const h=harness({selected:schedule,busy:true});h.pop({screen:'schedule',organization:organization.id});
 assert.equal(h.state.scheduleRequest,null);assert.match(h.state.message,/Finish the current operation/);
 assert.equal(h.refs.locationRef.current.schedule,schedule);assert.match(h.historyCalls.at(-1).url,new RegExp(schedule));
});
test('Forward from Library is an editor open request and preserves forward history',()=>{
 const h=harness();h.pop({screen:'schedule',organization:organization.id,schedule});
 assert.equal(h.state.scheduleRequest.id,schedule);assert.equal(h.state.scheduleRequest.history,true);
 h.panel.onScheduleSelection(organization.id,schedule,true);
 assert.equal(h.historyCalls.at(-1).method,'replaceState');assert.equal(h.refs.locationRef.current.schedule,schedule);
});
