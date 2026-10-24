const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');

// Real components/effects, with a tiny deterministic DOM and clock. No browser,
// network, or saved state is used. This exercises lifecycle rather than CSS text.
function harness(kind,{open=false,reduced=false,visible=true,exitDuration=200}={}){
 let props={enabled:true,open,title:'Fixture drawer',onClose:()=>{closed++;props={...props,open:false};},children:'Draft stays here',exitDuration},closed=0;
 let hooks=[],cursor=0,effects=[],pending=false,tree,clock=0,timerId=0,native=null;
 const timers=new Map(),listeners=new Map();
 const doc={activeElement:null,body:{},querySelector:()=>native,addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn)};
 class Element{constructor(name){this.name=name;this.isConnected=true;this.tabIndex=0;this.parentElement={};this.children=[];this.open=false;this.focuses=0;}matches(){return false;}closest(){return null;}getClientRects(){return [{}];}contains(n){return n===this||this.children.includes(n);}querySelectorAll(){return this.children;}focus(){this.focuses++;doc.activeElement=this;}showModal(){this.open=true;doc.activeElement=this;}close(){this.open=false;}}
 const opener=new Element('opener'),surface=new Element(kind),first=new Element('first'),last=new Element('last');surface.children=[first,last];doc.activeElement=opener;
 const react={...React,useContext:()=>visible,useId:()=>{cursor++;return 'fixture-title';},useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return [hooks[i],value=>{const next=typeof value==='function'?value(hooks[i]):value;if(next!==hooks[i]){hooks[i]=next;pending=true;}}];},useRef(initial){const i=cursor++;return hooks[i]??(hooks[i]={current:initial});},useEffect(fn,deps){const i=cursor++,old=hooks[i];if(!old||deps.some((x,k)=>x!==old.deps[k]))effects.push(()=>{old?.cleanup?.();hooks[i]={deps,cleanup:fn()};});}};
 const timer=(fn,delay)=>{const id=++timerId;timers.set(id,{fn,at:clock+delay});return id;};
 const mocks={react,'react-dom':{createPortal:n=>n},'lucide-react':{X:()=>null},'./review-tools.module.css':{default:{panel:'panel',compact:'compact',header:'header',body:'body',footer:'footer'}}};
 const file=kind==='modal'?'components/modals/Modal.tsx':'components/local/ReviewToolPanel.tsx';
 const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const mod={exports:{}};vm.runInNewContext('(function(require,module,exports){'+output+'\n})',{document:doc,window:{matchMedia:()=>({matches:reduced})},HTMLElement:Element,getComputedStyle:()=>({visibility:'visible',zIndex:'100'}),setTimeout:timer,clearTimeout:id=>timers.delete(id)})(name=>mocks[name]||require(name),mod,mod.exports);
 function visit(node,fn){if(!node||typeof node!=='object')return;fn(node);React.Children.toArray(node.props?.children).forEach(n=>visit(n,fn));}
 function render(){let count=0;do{assert.ok(count++<30,'bounded hook updates');pending=false;cursor=0;tree=mod.exports.default(props);visit(tree,node=>{if(node.props?.ref&&typeof node.props.ref==='object')node.props.ref.current=surface;});const next=effects;effects=[];next.forEach(f=>f());}while(pending);return tree;}
 function update(value){props={...props,...value};render();}
 function advance(ms){clock+=ms;for(const [id,value] of [...timers])if(value.at<=clock){timers.delete(id);value.fn();}render();}
 function text(node){return typeof node==='string'?node:React.Children.toArray(node?.props?.children).map(text).join('');}
 function closeButton(){let button;visit(tree,node=>{if(node.type==='button'&&node.props['aria-label']?.startsWith('Close'))button=node;});return button;}
 function key(key,shiftKey=false){let prevented=false;const e={key,shiftKey,defaultPrevented:false,preventDefault(){prevented=true;this.defaultPrevented=true;},stopImmediatePropagation(){}};for(const fn of listeners.get('keydown')??[])fn(e);render();return prevented;}
 function focusOutside(){doc.activeElement=opener;for(const fn of listeners.get('focusin')??[])fn({target:opener});render();}
 render();return{update,advance,key,focusOutside,opener,surface,first,last,doc,get tree(){return tree;},get closed(){return closed;},get pendingTimers(){return timers.size;},get text(){return text(tree);},requestClose(afterClose){let provider;visit(tree,node=>{if(node.type===mod.exports.ModalCloseContext?.Provider)provider=node;});assert.ok(provider,'shared child-close context is present');provider.props.value(afterClose);render();},close(){closeButton().props.onClick();render();},escape(){if(kind==='panel'){let prevented=false;tree.props.onCancel({preventDefault(){prevented=true;}});render();return prevented;}return key('Escape');},setNative(value){native=value;},setVisible(value){visible=value;render();},unmount(){for(const h of hooks)h?.cleanup?.();}};
}

test('shared Modal starts absent and retains content through child-driven exit',()=>{const h=harness('modal');assert.equal(h.tree,null);h.update({open:true});assert.ok(h.tree);h.update({open:false});assert.ok(h.tree);assert.equal(h.tree.props['data-closing'],true);h.advance(199);assert.ok(h.tree);h.advance(1);assert.equal(h.tree,null);assert.equal(h.closed,0);assert.equal(h.doc.activeElement,h.opener);});
test('shared Modal Escape exits once and returns focus to its opener',()=>{const h=harness('modal',{open:true});assert.equal(h.escape(),true);assert.equal(h.closed,0);assert.equal(h.tree.props['data-closing'],true);h.advance(200);assert.equal(h.closed,1);assert.equal(h.tree,null);assert.equal(h.doc.activeElement,h.opener);h.advance(200);assert.equal(h.closed,1);});
test('shared Modal reopening cancels an in-progress child-driven exit',()=>{const h=harness('modal',{open:true});h.update({open:false});h.advance(50);h.update({open:true});assert.equal(h.tree.props['data-closing'],undefined);h.advance(300);assert.ok(h.tree);assert.equal(h.closed,0);});
test('shared Modal reduced motion closes immediately without a timer',()=>{const h=harness('modal',{open:true,reduced:true});h.close();assert.equal(h.closed,1);assert.equal(h.tree,null);assert.equal(h.pendingTimers,0);});
test('shared Modal permission visibility hides immediately and cancels pending close callbacks',()=>{const h=harness('modal',{open:true});h.close();h.setVisible(false);assert.equal(h.tree,null);h.advance(300);assert.equal(h.closed,0);h.setVisible(true);assert.ok(h.tree);assert.equal(h.tree.props['data-closing'],undefined);});
test('shared Modal keeps keyboard focus within the top custom modal',()=>{const h=harness('modal',{open:true});h.doc.activeElement=h.last;assert.equal(h.key('Tab'),true);assert.equal(h.doc.activeElement,h.first);h.doc.activeElement=h.first;assert.equal(h.key('Tab',true),true);assert.equal(h.doc.activeElement,h.last);h.focusOutside();assert.equal(h.doc.activeElement,h.surface);});
test('shared Modal yields Escape, Tab and focus to a nested native modal dialog',()=>{const h=harness('modal',{open:true});const native={};h.surface.children.push(native);h.setNative(native);h.doc.activeElement=h.last;assert.equal(h.key('Escape'),false);assert.equal(h.key('Tab'),false);h.focusOutside();assert.equal(h.doc.activeElement,h.opener);h.advance(300);assert.equal(h.closed,0);h.setNative(null);assert.equal(h.escape(),true);h.advance(200);assert.equal(h.closed,1);});
test('shared Modal unmount cancels an unfinished animation callback',()=>{const h=harness('modal',{open:true});h.close();h.unmount();h.advance(300);assert.equal(h.closed,0);});

test('ReviewToolPanel retains native drawer until child-driven exit completes',()=>{const h=harness('panel',{open:true});assert.equal(h.surface.open,true);h.update({open:false});assert.equal(h.surface.open,true);assert.equal(h.tree.props['data-closing'],true);h.advance(199);assert.equal(h.surface.open,true);h.advance(1);assert.equal(h.surface.open,false);assert.equal(h.closed,0);assert.equal(h.doc.activeElement,h.opener);});
test('ReviewToolPanel reopening cancels external close and keeps its draft',()=>{const h=harness('panel',{open:true});h.update({open:false});h.advance(50);h.update({open:true});h.advance(300);assert.equal(h.surface.open,true);assert.equal(h.closed,0);assert.equal(h.tree.props['data-closing'],undefined);assert.match(h.text,/Draft stays here/);});
test('ReviewToolPanel Escape runs exactly one exit rather than delaying twice',()=>{const h=harness('panel',{open:true});assert.equal(h.escape(),true);h.advance(199);assert.equal(h.surface.open,true);assert.equal(h.closed,0);h.advance(1);assert.equal(h.surface.open,false);assert.equal(h.closed,1);assert.equal(h.pendingTimers,0);});
test('ReviewToolPanel reduced motion and compact dialogs close without motion',()=>{for(const options of [{reduced:true},{compact:true}]){const h=harness('panel',{open:true,reduced:options.reduced});if(options.compact)h.update({compact:true});h.close();assert.equal(h.closed,1);assert.equal(h.surface.open,false);assert.equal(h.pendingTimers,0);}});
test('ReviewToolPanel disabling during an exit prevents a late close callback',()=>{const h=harness('panel',{open:true});h.close();h.update({enabled:false});h.advance(300);assert.equal(h.closed,0);});


test('shared Modal child navigation waits for exit and runs once after onClose',()=>{
 const h=harness('modal',{open:true}),events=[];h.requestClose(()=>events.push('navigate'));h.requestClose(()=>events.push('duplicate'));assert.equal(h.closed,0);assert.deepEqual(events,[]);h.advance(199);assert.deepEqual(events,[]);h.advance(1);assert.equal(h.closed,1);assert.deepEqual(events,['navigate']);h.advance(300);assert.deepEqual(events,['navigate']);
});
test('shared Modal child navigation respects close guards and reduced motion',()=>{
 const guarded=harness('modal',{open:true});let navigated=0;guarded.update({beforeClose:()=>false});guarded.requestClose(()=>navigated++);guarded.advance(300);assert.equal(navigated,0);assert.equal(guarded.closed,0);assert.equal(guarded.pendingTimers,0);guarded.unmount();
 const reduced=harness('modal',{open:true,reduced:true});reduced.requestClose(()=>navigated++);assert.equal(navigated,1);assert.equal(reduced.closed,1);assert.equal(reduced.pendingTimers,0);
});
test('visibility loss cancels pending child navigation instead of opening a stale schedule',()=>{
 const h=harness('modal',{open:true});let navigated=0;h.requestClose(()=>navigated++);h.setVisible(false);h.advance(300);assert.equal(navigated,0);assert.equal(h.closed,0);
});

function contactAssignmentAction(closeModal,onBack,onOpen,embedded=true){
 const person={key:'person',contact:{id:'person',name:'Alex Example',type:'crew',role:'Camera'},scope:'production',production:'Example production',used_in:[{id:'schedule-1',name:'Assigned schedule',production_id:'production-1'}]};
 const values={selected:person,profileTab:'schedules',data:{entries:[person],productions:[{id:'production-1',name:'Example production',phases:[]}],can_create_organization:false}};
 const react={...React,useContext:()=>closeModal,useState:arg=>[arg?.__preview?(Object.hasOwn(values,arg.key)?values[arg.key]:typeof arg.initial==='function'?arg.initial():arg.initial):typeof arg==='function'?arg():arg,()=>{}],useRef:value=>({current:value}),useEffect(){},useCallback:fn=>fn};
 const tag=context=>node=>ts.visitNode(node,function visit(n){if(ts.isVariableDeclaration(n)&&ts.isArrayBindingPattern(n.name)&&n.initializer&&ts.isCallExpression(n.initializer)&&n.initializer.expression.getText()==='useState')return ts.factory.updateVariableDeclaration(n,n.name,n.exclamationToken,n.type,ts.factory.updateCallExpression(n.initializer,n.initializer.expression,n.initializer.typeArguments,[ts.factory.createObjectLiteralExpression([ts.factory.createPropertyAssignment('__preview',ts.factory.createTrue()),ts.factory.createPropertyAssignment('key',ts.factory.createStringLiteral(n.name.elements[0].name.text)),ts.factory.createPropertyAssignment('initial',n.initializer.arguments[0])]) ]));return ts.visitEachChild(n,visit,context)});
 const code=ts.transpileModule(fs.readFileSync('components/local/CentralContacts.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},transformers:{before:[tag]}}).outputText;
 const mocks={react,'@/components/modals/Modal':{ModalCloseContext:{}},'./LocalWorkspaceContext':{useLocalWorkspace:()=>({organization:{id:'org'},session:{user:{id:'actor'}},active:true,openSchedule:onOpen})},'./ProductionContacts':{contactTypeLabels:{crew:'Crew'}}};
 const mod={exports:{}};vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(name=>mocks[name]??require(name),mod,mod.exports);const tree=mod.exports.default({onBack,embedded});
 const nodes=n=>Array.isArray(n)?n.flatMap(nodes):n?.props?[n,...nodes(n.props.children)]:[];const text=n=>Array.isArray(n)?n.map(text).join(''):typeof n==='string'?n:n?.props?text(n.props.children):'';
 return nodes(tree).find(n=>n.type==='button'&&text(n).startsWith('Assigned schedule')).props.onClick;
}
test('actual Contacts schedule assignment uses the shared exit before navigation',()=>{
 const h=harness('modal',{open:true}),events=[];const open=contactAssignmentAction(callback=>h.requestClose(callback),()=>events.push('back'),(org,id)=>events.push([org,id]));
 open();assert.deepEqual(events,[]);assert.equal(h.tree.props['data-closing'],true);h.advance(199);assert.deepEqual(events,[]);h.advance(1);assert.equal(h.closed,1);assert.deepEqual(events,[['org','schedule-1']]);
});
test('nonembedded Contacts keeps its direct Back and navigation behavior',()=>{
 const events=[];contactAssignmentAction(()=>{throw Error('Nonembedded contacts must not use an ancestor modal');},()=>events.push('back'),()=>events.push('navigate'),false)();assert.deepEqual(events,['back','navigate']);
});

// Compose each actual Tools panel with the actual shared Modal lifecycle above.
function toolsFixture(kind){
 let hooks=[],cursor=0,effects=[],pending=false,tree,closed=0,switched=0;
 const noop=()=>{},source={id:'schedule',production_id:'production'},draft={documentSession:1,dirty:false,templateUses:[]};
 const props={actor:'actor',organization:'org',schedule:'schedule',enabled:true,client:{},review:true,embedded:true,canWrite:false,canCopy:false,canWriteCurrent:false,getSource:()=>source,canApply:()=>false,onApply:()=>false,onState:noop,requireAuth:noop,beforeRestore:noop,onRestored:async()=>false,captureOpen:noop,onCopy:async()=>false,onClose:()=>closed++,[kind==='templates'?'onRecovery':'onTemplates']:()=>switched++};
 const react={...React,useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return[hooks[i],v=>{const next=typeof v==='function'?v(hooks[i]):v;if(next!==hooks[i]){hooks[i]=next;pending=true;}}];},useRef(initial){const i=cursor++;return hooks[i]??=( {current:initial} );},useEffect(fn,deps){const i=cursor++,previous=hooks[i];if(!previous||deps.some((v,k)=>v!==previous.deps[k]))effects.push(()=>{previous?.cleanup?.();hooks[i]={deps,cleanup:fn()};});}};
 const repo={productions:async()=>[],inventory:async()=>[],expire:async()=>{},list:async()=>[]},extras={policy:async()=>({retention_days:null,trash_min_role:'organizer'}),destinations:async()=>[]};
 const store=fn=>fn(draft);store.getState=()=>draft;
 const mocks={react,'@/components/modals/Modal':{default:'modal',ModalVisibilityContext:{Provider:'visibility'}},'./ScheduleToolsTabs':{default:'tools-tabs'},'@/lib/store/scheduleStore':{useScheduleStore:store},'@/lib/platform/schedule-repository':{ScheduleRepositoryError:class extends Error{}},'@/lib/platform/schedule-library':{createScheduleLibraryRepository:()=>({})},'@/lib/platform/schedule-lifecycle-repository':{createLifecycleRepository:()=>({})},'@/lib/platform/schedule-templates':{createTemplateRepository:()=>repo,readTemplateRequest:()=>null},'@/lib/platform/schedule-snapshots':{createSnapshotRepository:()=>repo,readSnapshotRequest:()=>null,SnapshotTimer:class{bind(){}due(){return false;}}},'@/lib/platform/schedule-snapshot-extras':{createSnapshotExtras:()=>extras,readSnapshotExtra:()=>null}};
 const file=`components/local/LocalSchedule${kind==='templates'?'Templates':'Snapshots'}.tsx`,code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{localStorage:{},Date,setInterval:()=>1,clearInterval:noop})(name=>mocks[name]??(name==='react/jsx-runtime'?require(name):{default:{}}),mod,mod.exports);
 function render(){let tries=0;do{assert.ok(tries++<30);pending=false;cursor=0;tree=mod.exports.default(props);const current=effects;effects=[];current.forEach(f=>f());}while(pending);}
 function nodes(n=tree){if(!n||typeof n!=='object')return[];return[n,...React.Children.toArray(n.props?.children).flatMap(child=>nodes(child))];}
 render();return{props,render,get modal(){return nodes().find(n=>n.type==='modal').props;},get visible(){return nodes().find(n=>n.type==='visibility').props.value;},get closed(){return closed;},get switched(){return switched;},async open(){props.openRequest=(props.openRequest||0)+1;props.animateEntry=false;render();await new Promise(setImmediate);render();},switchTab(){const tabs=nodes().find(n=>n.type==='tools-tabs');tabs.props[kind==='templates'?'onRecovery':'onTemplates']();render();},closeFooter(){this.modal.footer.props.onClick();render();},unmount(){hooks.forEach(h=>h?.cleanup?.());}};
}
for(const kind of ['templates','snapshots']){
 test(`${kind} tab switch hides its outgoing portal immediately without a late close`,async()=>{
  const tool=toolsFixture(kind);await tool.open();const modal=harness('modal',{open:true});modal.update(tool.modal);assert.equal(tool.visible,true);
  tool.switchTab();assert.equal(tool.modal.open,false);assert.equal(tool.visible,false);assert.equal(tool.switched,1);modal.setVisible(tool.visible);modal.update(tool.modal);assert.equal(modal.tree,null);assert.equal(modal.pendingTimers,0);modal.advance(300);assert.equal(tool.closed,0);tool.unmount();modal.unmount();
 });
 for(const close of ['header','Escape','footer'])test(`${kind} ${close} still animates after returning from another Tools tab`,async()=>{
  const tool=toolsFixture(kind);await tool.open();tool.switchTab();await tool.open();assert.equal(tool.props.animateEntry,false);assert.equal(tool.visible,true);assert.equal(tool.modal.exitDuration,200);
  const modal=harness('modal',{open:true});modal.update(tool.modal);
  if(close==='header')modal.close();else if(close==='Escape')modal.escape();else{tool.closeFooter();modal.update(tool.modal);}
  assert.equal(modal.tree.props['data-closing'],true);modal.advance(199);assert.ok(modal.tree);modal.advance(1);tool.render();modal.update(tool.modal);assert.equal(modal.tree,null);assert.equal(tool.closed,1);assert.equal(modal.pendingTimers,0);tool.unmount();modal.unmount();
 });
}
