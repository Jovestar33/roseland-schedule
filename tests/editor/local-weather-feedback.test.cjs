const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{sourceLoader}=require('./source-loader.cjs');

// Drive the real component handlers with the real schedule store; only hooks,
// effects and the external weather provider are controlled here.
function harness(provider){
 const load=sourceLoader(),store=load('lib/store/scheduleStore.ts').useScheduleStore;
 const fixture=load('tests/fixtures/document-fixtures.ts').documentFixture(3);
 store.getState().loadSchedule('Fictional weather test',fixture);
 let stateIndex=0,refIndex=0,effectDeps,queuedEffect,cleanup;const values=[],refs=[],toasts=[];
 const hook=selector=>selector(store.getState());hook.getState=store.getState;
 const mockReact={...React,useState(initial){const i=stateIndex++;if(!(i in values))values[i]=initial;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial});},useEffect(fn,deps){if(!effectDeps||deps.some((d,i)=>d!==effectDeps[i])){effectDeps=deps;queuedEffect=fn;}}};
 const mocks={react:mockReact,'@/components/ui/ToastProvider':{useToast:()=>({addToast:(message,type)=>toasts.push({message,type})})},'@/lib/store/scheduleStore':{useScheduleStore:hook},'./DocumentProvidersContext':{useDocumentProviders:()=>provider},'@/components/schedule/WxStrip':{default:()=>null}};
 const file='components/local/LocalWeatherControls.tsx',mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(name=>mocks[name]??require(name),mod,mod.exports);
 let props={enabled:true,scope:'fictional-a'};
 function render(patch={}){props={...props,...patch};stateIndex=0;refIndex=0;return mod.exports.default(props);}
 function flushEffect(){if(queuedEffect){cleanup?.();const fn=queuedEffect;queuedEffect=null;cleanup=fn();}}
 return {store,fixture,render,toasts,flushEffect};
}
test('saved weather has no added footer, and Clear leaves a direct Refresh button with complete Undo',()=>{
 const h=harness({kind:'fictional'}),before=h.store.getState().getScheduleData();
 assert.equal(h.render().props.children[1],false);
 h.render().props.children[0].props.onClear();
 const empty=h.render().props.children[1];assert.equal(empty.type,'button');assert.equal(empty.props.children,'Refresh weather');assert.equal(empty.props.disabled,false);
 assert.equal(h.store.getState().meta.wx,null);assert.deepEqual(h.toasts,[]);
 h.store.getState().undo();assert.equal(h.render().props.children[1],false);assert.deepEqual(h.store.getState().meta,before.meta);assert.deepEqual(h.store.getState().rows,before.rows);
 h.store.getState().redo();assert.equal(h.store.getState().meta.wx,null);assert.deepEqual(h.toasts,[]);
});
test('refresh disables controls and preserves honest unavailable weather without persistent chatter',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r),h=harness({kind:'fictional',weather:()=>pending});
 const before=h.store.getState().getScheduleData();h.render().props.children[0].props.onRefresh();
 assert.equal(h.render().props.children[0].props.readOnly,true);assert.equal(h.render().props.children[1],false);
 const wx={sunrise:'5:45 AM',sunset:'8:15 PM',noForecast:true};resolve(wx);await pending;await Promise.resolve();
 assert.equal(h.render().props.children[0].props.readOnly,false);assert.deepEqual(h.store.getState().meta.wx,wx);assert.deepEqual(h.toasts,[]);
 h.store.getState().undo();assert.deepEqual(h.store.getState().meta,before.meta);assert.deepEqual(h.store.getState().rows,before.rows);
});
test('null and rejected weather show a relevant error toast and leave saved data unchanged',async()=>{
 for(const weather of [async()=>null,async()=>{throw Error('Controlled unavailable forecast');}]){
  const h=harness({kind:'fictional',weather}),before=h.store.getState().getScheduleData();
  h.render().props.children[0].props.onRefresh();await Promise.resolve();await Promise.resolve();
  assert.deepEqual(h.toasts,[{message:'Weather could not be refreshed. Your schedule is unchanged.',type:'error'}]);
  assert.deepEqual(h.store.getState().meta,before.meta);assert.deepEqual(h.store.getState().rows,before.rows);assert.equal(h.render().props.children[1],false);
 }
});
test('late weather and errors cannot affect another scope or revoked edit context',async()=>{
 for(const patch of [{scope:'fictional-b'},{enabled:false}])for(const fail of [false,true]){
  let resolve,reject;const pending=new Promise((r,j)=>{resolve=r;reject=j;}),h=harness({kind:'fictional',weather:()=>pending}),before=h.store.getState().getScheduleData();
  h.render().props.children[0].props.onRefresh();h.render(patch);
  if(fail)reject(Error('Late failure'));else resolve({sunrise:'1:00 AM',sunset:'2:00 AM'});
  await pending.catch(()=>{});await Promise.resolve();
  assert.deepEqual(h.store.getState().meta,before.meta);assert.deepEqual(h.store.getState().rows,before.rows);assert.deepEqual(h.toasts,[]);
 }
});
test('cancelling an active refresh resets loading and ignores the late result',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r),h=harness({kind:'fictional',weather:()=>pending});
 h.render();h.flushEffect();const before=h.store.getState().getScheduleData();
 h.render().props.children[0].props.onRefresh();assert.equal(h.render().props.children[0].props.readOnly,true);
 h.render({enabled:false});h.flushEffect();h.render({enabled:true});h.flushEffect();assert.equal(h.render().props.children[0].props.readOnly,false);
 resolve({sunrise:'1:00 AM',sunset:'2:00 AM'});await pending;await Promise.resolve();
 assert.deepEqual(h.store.getState().meta,before.meta);assert.deepEqual(h.store.getState().rows,before.rows);assert.deepEqual(h.toasts,[]);
});
test('empty weather Refresh reports pending state and respects missing coordinates and read-only access',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r),h=harness({kind:'fictional',weather:()=>pending});
 h.render().props.children[0].props.onClear();h.render().props.children[1].props.onClick();
 let button=h.render().props.children[1];assert.equal(button.props.children,'Refreshing…');assert.equal(button.props.disabled,true);assert.equal(button.props['aria-busy'],true);
 resolve(null);await pending;await Promise.resolve();button=h.render().props.children[1];assert.equal(button.props.disabled,false);
 assert.equal(h.render({enabled:false}).props.children[1].props.disabled,true);
 h.store.getState().updateMeta({lat:null});assert.equal(h.render({enabled:true}).props.children[1].props.disabled,true);
});
