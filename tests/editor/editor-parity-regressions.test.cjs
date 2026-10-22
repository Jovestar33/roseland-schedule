const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
const {sourceLoader}=require('./source-loader.cjs');
function component(file,mocks){const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(name=>mocks[name]??require(name),mod,mod.exports);return mod.exports.default;}
function elements(node,predicate){if(!node||typeof node!=='object')return [];return [...(predicate(node)?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(child=>elements(child,predicate))];}
test('arrow controls skip sun markers and cannot displace the call-time anchor',()=>{
 const calls=[],rows=[{sunLocked:true},{action:'Crew Call',dur:'00:15'},{action:'Shoot',dur:'01:00'},{sunLocked:true},{action:'Wrap',dur:'00:15'},{sunLocked:true}];
 const state={rows,pushUndo(){calls.push('undo')},reorderRows(...args){calls.push(args)}};
 const Row=component('components/schedule/RowControls.tsx',{'@/lib/store/scheduleStore':{useScheduleStore:select=>select(state)},'@/components/ui/ToastProvider':{useToast:()=>({addToast:message=>calls.push(message)})}});
 const buttons=index=>elements(Row({index}),el=>el.type==='button');
 assert.deepEqual(buttons(1).map(b=>b.props.disabled),[true,true]);
 assert.deepEqual(buttons(2).map(b=>b.props.disabled),[true,false]);
 buttons(2)[1].props.onClick();assert.deepEqual(calls,['undo',[2,4]]);calls.length=0;
 assert.deepEqual(buttons(4).map(b=>b.props.disabled),[false,true]);buttons(4)[0].props.onClick();assert.deepEqual(calls,['undo',[4,2]]);
 calls.length=0;rows[2].dur='';buttons(4)[0].props.onClick();assert.equal(calls.length,1);assert.match(calls[0],/Duration/);
});
test('location details merge into the same sub-location after concurrent edits and row movement',()=>{
 const load=sourceLoader(),store=load('lib/store/scheduleStore.ts').useScheduleStore,normal=load('lib/rowNormalizer.ts');
 const row=normal.makeRow({action:'Shoot',dur:'01:00',subLocations:[{id:'a',loc:'Old',name:'Old',desc:'Original'}]});
 store.getState().loadSchedule('Fictional', {meta:normal.makeMeta({}),rows:[row,normal.makeRow({action:'Wrap',dur:'00:00'})]});
 const hook=selector=>selector(store.getState());hook.getState=store.getState;
 const Location=component('components/schedule/LocationCell.tsx',{react:{...React,useState:x=>[x,()=>{}],useLayoutEffect(){},useRef:x=>({current:x})},'@/lib/observe-textarea-size':{},'@/lib/store/scheduleStore':{useScheduleStore:hook},'@/components/local/DocumentProvidersContext':{useDocumentProviders:()=>({kind:'live'})},'./LocalEditorContext':{useLocalEditor:()=>true},'./PlacesAutocomplete':{default:'Places'}});
 const tree=Location({index:0,row:store.getState().rows[0]});const sub=elements(tree,n=>n.type==='Places'&&n.props.placeholder==='Sub-location…')[0];
 sub.props.onChange('New place');store.getState().updateRow(0,{notes:'Concurrent note'});store.getState().reorderRows(0,1);
 sub.props.onSelect('Public address',{lat:0,lng:0});
 const saved=store.getState().rows[1];assert.equal(saved.notes,'Concurrent note');assert.equal(saved.subLocations[0].name,'New place');assert.equal(saved.subLocations[0].desc,'Original');assert.equal(saved.subLocations[0].address,'Public address');assert.equal(saved.subLocations[0].locLat,0);
});
test('changing weather coordinates or date removes stale weather and sun rows, and Undo restores both',()=>{
 const load=sourceLoader(),store=load('lib/store/scheduleStore.ts').useScheduleStore,fixture=load('tests/fixtures/document-fixtures.ts').documentFixture(3);
 store.getState().loadSchedule('Fictional weather',fixture);store.getState().insertSunRows('7:00 AM','6:00 PM');
 const before=store.getState().getScheduleData();store.getState().pushUndo();store.getState().updateMeta({lat:null,lng:null,town:'New town'});
 assert.equal(store.getState().meta.wx,null);assert.ok(store.getState().rows.every(row=>!row.sunLocked));store.getState().undo();
 assert.deepEqual(store.getState().meta,before.meta);assert.deepEqual(store.getState().rows,before.rows);
 store.getState().updateMeta({prod:'New producer'});assert.deepEqual(store.getState().meta.wx,before.meta.wx);
});
test('in-range weather failures and missing measurements never become a false future forecast',async()=>{
 const {fetchWeather}=sourceLoader()('lib/weather.ts'),date=new Date().toISOString().slice(0,10);
 for(const request of [async()=>{throw Error('offline')},async()=>Response.json({error:true},{status:503}),async()=>Response.json({daily:{time:[date],sunrise:[date+'T07:00'],sunset:[date+'T18:00'],temperature_2m_max:[null],temperature_2m_min:[10],precipitation_probability_max:[0],weathercode:[0]}})])assert.equal(await fetchWeather(date,35,-78,'Town',request),null);
});
test('far-future sun fallback refuses an unknown destination timezone',async()=>{
 const {fetchWeather}=sourceLoader()('lib/weather.ts');assert.equal(await fetchWeather('2099-10-22',35,-78,'Town',async()=>{throw Error('offline')}),null);
});
test('multi-digit production days type naturally, reject reversed totals, and undo cleanly',()=>{
 const load=sourceLoader(),store=load('lib/store/scheduleStore.ts').useScheduleStore,fixture=load('tests/fixtures/document-fixtures.ts').documentFixture(1);
 store.getState().loadSchedule('Day input',fixture);const before=store.getState().meta;
 let stateIndex=0,refIndex=0;const values=[],refs=[];
 const hook=selector=>selector(store.getState());hook.getState=store.getState;
 const Header=component('components/schedule/HeaderIdentityLine.tsx',{react:{...React,useState(initial){const i=stateIndex++;if(!(i in values))values[i]=initial;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},useRef(initial){const i=refIndex++;return refs[i]??(refs[i]={current:initial});},useEffect(){}},'@/lib/store/scheduleStore':{useScheduleStore:hook},'./ComboInput':{default:'ComboInput'},'./LocalEditorContext':{useLocalEditor:()=>true}});
 function render(){stateIndex=refIndex=0;return Header({});}
 const find=label=>elements(render(),n=>n.props?.['aria-label']===label)[0];
 find('Edit production day').props.onClick();
 for(const value of ['1','12','12/','12/1','12/15']){find('Production day').props.onChange({target:{value}});assert.equal(find('Production day').props.value,value);}
 find('Production day').props.onKeyDown({key:'Enter',preventDefault(){}});
 assert.equal(store.getState().meta.dayNumber,12);assert.equal(store.getState().meta.totalDays,15);
 store.getState().undo();assert.deepEqual(store.getState().meta,before);
 find('Edit production day').props.onClick();find('Production day').props.onChange({target:{value:'15/12'}});find('Production day').props.onKeyDown({key:'Enter',preventDefault(){}});
 assert.ok(find('Production day'));assert.deepEqual(store.getState().meta,before);
 find('Production day').props.onKeyDown({key:'Escape',preventDefault(){}});assert.ok(find('Edit production day'));
});

test('focus-only checkpoints neither consume an Undo step nor discard Redo',()=>{
 const load=sourceLoader(),{useScheduleStore:store,hasUndoChanges}=load('lib/store/scheduleStore.ts'),fixture=load('tests/fixtures/document-fixtures.ts').documentFixture(1);
 store.getState().loadSchedule('Focus undo',fixture);store.getState().pushUndo();assert.equal(hasUndoChanges(store.getState()),false);
 store.getState().updateMeta({town:'Changed town'});store.getState().pushUndo();store.getState().pushUndo();
 assert.equal(store.getState().undoStack.length,2);store.getState().undo();assert.equal(store.getState().meta.town,fixture.meta.town);
 store.getState().pushUndo();assert.equal(store.getState().redoStack.length,1);store.getState().redo();assert.equal(store.getState().meta.town,'Changed town');
 store.getState().undo();store.getState().pushUndo();store.getState().updateRow(0,{notes:'New branch'});assert.equal(store.getState().redoStack.length,0);
});
