const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
const {sourceLoader}=require('./source-loader.cjs');
function fixture(config={}){
 const states={record:{version:0,config,can_manage:true},draft:structuredClone(config),open:true,tab:'logo'},refs=[],readers=[];
 let cursor=0,tree;
 const workspace={client:{},session:{user:{id:'actor-a'}},organization:{id:'org-a',name:'Example'},active:true,authNeeded:false,requireAuth(){}};
 const tag=context=>root=>ts.visitNode(root,function visit(n){
  if(ts.isVariableDeclaration(n)&&ts.isArrayBindingPattern(n.name)&&ts.isCallExpression(n.initializer)&&n.initializer.expression.getText()==='useState'){
   const key=n.name.elements[0].name.text,initial=n.initializer.arguments[0]??ts.factory.createIdentifier('undefined');
   return ts.factory.updateVariableDeclaration(n,n.name,n.exclamationToken,n.type,ts.factory.updateCallExpression(n.initializer,n.initializer.expression,n.initializer.typeArguments,[ts.factory.createObjectLiteralExpression([ts.factory.createPropertyAssignment('key',ts.factory.createStringLiteral(key)),ts.factory.createPropertyAssignment('initial',initial)])]));
  }return ts.visitEachChild(n,visit,context);
 });
 const actual=sourceLoader(),mocks={
  react:{...React,useState:({key,initial})=>{if(!Object.hasOwn(states,key))states[key]=typeof initial==='function'?initial():initial;return[states[key],v=>{states[key]=typeof v==='function'?v(states[key]):v;}];},useRef:v=>{const i=cursor++;return refs[i]??(refs[i]={current:v});},useEffect(){}},
  './LocalWorkspaceContext':{useLocalWorkspace:()=>workspace,useWorkspacePanelState(){}},
  '@/components/modals/Modal':{default:'modal'},
  '@/lib/store/cmsStore':{useCmsStore:{getState:()=>({setConfig(){}})}},
  '@/lib/branding':actual('lib/branding.ts'),
  '@/lib/constants':actual('lib/constants.ts'),
  '@/lib/platform/organization-presentation':{createPresentationRepository:()=>({}),PRESENTATION_LABELS:[]},
  '@/lib/platform/request-journal':{},
  '@/lib/platform/schedule-repository':{},
  './administration-controls.module.css':{default:{}},
  'react/jsx-runtime':require('react/jsx-runtime')
 };
 class Reader{constructor(){readers.push(this);}readAsDataURL(){}finish(data){this.result=data;this.onload();}}
 const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../components/local/LocalOrganizationSettings.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX},transformers:{before:[tag]}}).outputText,mod={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{FileReader:Reader,Error,JSON,Object,crypto:global.crypto})(n=>{assert.ok(mocks[n],n);return mocks[n];},mod,mod.exports);
 function render(){cursor=0;tree=mod.exports.default();}
 function nodes(n,out=[]){if(Array.isArray(n))n.forEach(v=>nodes(v,out));else if(n&&typeof n==='object'){out.push(n);nodes(n.props?.children,out);nodes(n.props?.footer,out);}return out;}
 render();return{states,workspace,readers,render,upload(index=0,file={size:100,type:'image/png'}){return nodes(tree).filter(n=>n.type==='input'&&n.props.type==='file')[index].props.onChange({target:{files:[file],value:'file'}});},cancel(){nodes(tree).find(n=>n.type==='button'&&n.props.children==='Cancel').props.onClick();render();},useDefault(index=0){nodes(tree).filter(n=>n.type==='button'&&['Use default logo','Use shared logo'].includes(n.props.children))[index].props.onClick();render();}};
}
test('uploading a light logo preserves the shared logo, dark logo and other current draft fields',async()=>{
 const h=fixture({logo:'shared',logoOnDark:'dark',labels:{appTitle:'Initial'}}),pending=h.upload();
 h.states.draft={...h.states.draft,labels:{appTitle:'Edited while reading'}};h.render();
 h.readers[0].finish('data:image/png;base64,TGlnaHQ=');await pending;
 assert.equal(h.states.draft.logoOnLight,'data:image/png;base64,TGlnaHQ=');assert.equal(h.states.draft.logo,'shared');assert.equal(h.states.draft.logoOnDark,'dark');assert.equal(h.states.draft.labels.appTitle,'Edited while reading');
});
test('cancel restores saved appearance and a late upload cannot bring the discarded draft back',async()=>{
 const original={logo:'shared'},h=fixture(original),pending=h.upload();h.cancel();h.readers[0].finish('data:image/png;base64,SGk=');await pending;
 assert.deepEqual(h.states.draft,original);assert.equal(h.states.open,false);
});
test('logo reads cannot cross an account or organization change and newest upload wins',async()=>{
 for(const change of [h=>h.workspace.session.user.id='actor-b',h=>h.workspace.organization.id='org-b']){
  const h=fixture(),pending=h.upload();change(h);h.render();h.readers[0].finish('data:image/png;base64,SGk=');await pending;assert.deepEqual(h.states.draft,{});
 }
 const h=fixture(),first=h.upload(),second=h.upload();h.readers[1].finish('data:image/png;base64,TmV3');await second;h.readers[0].finish('data:image/png;base64,T2xk');await first;assert.equal(h.states.draft.logoOnLight,'data:image/png;base64,TmV3');
});
test('invalid files and combined logo size leave the saved draft intact with useful feedback',async()=>{
 for(const file of [{size:2000001,type:'image/png'},{size:100,type:'text/html'}]){const h=fixture();await h.upload(0,file);assert.equal(h.readers.length,0);assert.deepEqual(h.states.draft,{});assert.ok(h.states.message);}
 const old={logoOnDark:'data:image/png;base64,'+'A'.repeat(1600000)},h=fixture(old),pending=h.upload();h.readers[0].finish('data:image/png;base64,'+'A'.repeat(1600000));await pending;assert.deepEqual(h.states.draft,old);assert.match(h.states.message,/too large together/);
});

for(const order of [[0,1],[1,0]])test(`independent light and dark uploads both survive completion order ${order.join('-')}`,async()=>{
 const h=fixture(),pending=[h.upload(0),h.upload(1)],values=['data:image/png;base64,TGlnaHQ=','data:image/png;base64,RGFyaw=='];
 // Resolve both without an intervening render, as can happen with batched reads.
 for(const index of order)h.readers[index].finish(values[index]);
 await Promise.all(pending);
 assert.equal(h.states.draft.logoOnLight,values[0]);assert.equal(h.states.draft.logoOnDark,values[1]);
});
test('reverting one logo ignores its pending upload but preserves the other surface upload',async()=>{
 const h=fixture({logoOnLight:'old-light'}),light=h.upload(0),dark=h.upload(1);h.useDefault();
 h.readers[0].finish('data:image/png;base64,TGlnaHQ=');h.readers[1].finish('data:image/png;base64,RGFyaw==');await Promise.all([light,dark]);
 assert.equal(h.states.draft.logoOnLight,null);assert.equal(h.states.draft.logoOnDark,'data:image/png;base64,RGFyaw==');
});
test('cancelling both pending logo uploads restores only the saved settings',async()=>{
 const original={logo:'shared'},h=fixture(original),light=h.upload(0),dark=h.upload(1);h.cancel();
 h.readers[0].finish('data:image/png;base64,TGlnaHQ=');h.readers[1].finish('data:image/png;base64,RGFyaw==');await Promise.all([light,dark]);assert.deepEqual(h.states.draft,original);
});
