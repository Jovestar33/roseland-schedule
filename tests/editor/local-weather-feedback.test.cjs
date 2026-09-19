const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{sourceLoader}=require('./source-loader.cjs');

// Drive the real component handlers with the real schedule store; only hooks,
// effects and the external weather provider are controlled here.
function harness(provider){
 const load=sourceLoader(),store=load('lib/store/scheduleStore.ts').useScheduleStore;
 const fixture=load('tests/fixtures/document-fixtures.ts').documentFixture(3);
 store.getState().loadSchedule('Fictional weather test',fixture);
 let stateIndex=0,refIndex=0,effectDeps,queuedEffect,cleanup;const values=[],refs=[];
 const hook=selector=>selector(store.getState());hook.getState=store.getState;
 const mockReact={...React,useState(initial){const i=stateIndex++;if(!(i in values))values[i]=initial;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial});},useEffect(fn,deps){if(!effectDeps||deps.some((d,i)=>d!==effectDeps[i])){effectDeps=deps;queuedEffect=fn;}}};
 const mocks={react:mockReact,'@/lib/store/scheduleStore':{useScheduleStore:hook},'./DocumentProvidersContext':{useDocumentProviders:()=>provider},'@/components/schedule/WxStrip':{default:()=>null}};
 const file='components/local/LocalWeatherControls.tsx',mod={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(name=>mocks[name]??require(name),mod,mod.exports);
 let props={enabled:true,scope:'fictional-a'};
 function render(patch={}){props={...props,...patch};stateIndex=0;refIndex=0;return mod.exports.default(props);}
 function status(tree){return tree.props.children[1].props.children.find(n=>n&&n.props?.role==='status')?.props.children??'';}
 function flushEffect(){if(queuedEffect){cleanup?.();const fn=queuedEffect;queuedEffect=null;cleanup=fn();}}
 return {store,fixture,render,status,flushEffect};
}
test('clear feedback does not claim weather is cleared after Undo, and rows/metadata recover',()=>{
 const h=harness({kind:'fictional'}),before=h.store.getState().getScheduleData();
 h.render().props.children[0].props.onClear();assert.match(h.status(h.render()),/cleared/);assert.equal(h.store.getState().meta.wx,null);
 h.store.getState().undo();assert.equal(h.status(h.render()),'');assert.deepEqual(h.store.getState().meta,before.meta);assert.deepEqual(h.store.getState().rows,before.rows);
 h.store.getState().redo();assert.equal(h.store.getState().meta.wx,null);
});
test('refresh loading and no-forecast result describe current weather, with complete Undo',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r),h=harness({kind:'fictional',weather:()=>pending});
 const before=h.store.getState().getScheduleData();h.render().props.children[0].props.onRefresh();
 assert.match(h.status(h.render()),/Loading/);assert.equal(h.render().props.children[0].props.readOnly,true);
 const wx={sunrise:'5:45 AM',sunset:'8:15 PM',noForecast:true};resolve(wx);await pending;await Promise.resolve();
 assert.match(h.status(h.render()),/no forecast/);assert.equal(h.render().props.children[0].props.readOnly,false);assert.deepEqual(h.store.getState().meta.wx,wx);
 h.store.getState().undo();assert.equal(h.status(h.render()),'');assert.deepEqual(h.store.getState().meta,before.meta);assert.deepEqual(h.store.getState().rows,before.rows);
});
test('failed refresh preserves saved weather and feedback is not carried into another scope',async()=>{
 const h=harness({kind:'fictional',weather:async()=>{throw Error('Controlled unavailable forecast');}}),before=h.store.getState().getScheduleData();
 h.render().props.children[0].props.onRefresh();await Promise.resolve();await Promise.resolve();
 assert.match(h.status(h.render()),/unavailable/);assert.deepEqual(h.store.getState().meta,before.meta);
 assert.equal(h.status(h.render({scope:'fictional-b'})),'');
});
test('late weather cannot write into another document scope or revoked edit context',async()=>{
 for(const patch of [{scope:'fictional-b'},{enabled:false}]){
  let resolve;const pending=new Promise(r=>resolve=r),h=harness({kind:'fictional',weather:()=>pending}),before=h.store.getState().getScheduleData();
  h.render().props.children[0].props.onRefresh();h.render(patch);resolve({sunrise:'1:00 AM',sunset:'2:00 AM'});await pending;await Promise.resolve();
  assert.deepEqual(h.store.getState().meta,before.meta);assert.deepEqual(h.store.getState().rows,before.rows);
 }
});

test('cancelling an active refresh clears its loading feedback and ignores the late result',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r),h=harness({kind:'fictional',weather:()=>pending});
 h.render();h.flushEffect();const before=h.store.getState().getScheduleData();
 h.render().props.children[0].props.onRefresh();assert.match(h.status(h.render()),/Loading/);
 h.render({enabled:false});h.flushEffect();assert.equal(h.status(h.render()),'');
 resolve({sunrise:'1:00 AM',sunset:'2:00 AM'});await pending;await Promise.resolve();
 assert.deepEqual(h.store.getState().meta,before.meta);assert.deepEqual(h.store.getState().rows,before.rows);
});
