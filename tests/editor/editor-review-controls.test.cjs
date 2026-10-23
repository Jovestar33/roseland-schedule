const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
const {sourceLoader}=require('./source-loader.cjs');
const load=sourceLoader(),time=load('lib/time.ts'),{makeRow,makeMeta}=load('lib/rowNormalizer.ts');
function nodes(n){if(Array.isArray(n))return n.flatMap(nodes);if(!n||typeof n!=='object')return [];return [n,...nodes(n.props?.children)];}
function harness(component,rows){
 const store=load('lib/store/scheduleStore.ts').useScheduleStore;
 store.getState().loadSchedule('Review fixture',{savedAt:0,meta:makeMeta(),rows:rows.map(makeRow)});
 let cursor=0,contactOpened=0;const hooks=[];
 const react={...React,useState(v){const i=cursor++;if(!(i in hooks))hooks[i]=v;return[hooks[i],v=>hooks[i]=typeof v==='function'?v(hooks[i]):v];},useRef(v){const i=cursor++;return hooks[i]??(hooks[i]={current:v});},useLayoutEffect(){}};
 const mocks={react,'@/lib/time':time,'@/lib/store/scheduleStore':{useScheduleStore:Object.assign(fn=>fn(store.getState()),{getState:store.getState})},'./PlacesAutocomplete':{default:function PlacesAutocomplete(){}},'@/components/modals/Modal':{default:function Modal(){}},'./LocalEditorContext':{useLocalEditor:()=>true},'@/components/local/DocumentProvidersContext':{useDocumentProviders:()=>null},'@/lib/observe-textarea-size':{observeTextareaSize:()=>()=>{}}};
 const mod={exports:{}};const source=ts.transpileModule(fs.readFileSync('components/schedule/'+component+'.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInThisContext('(function(require,module,exports){'+source+'\n})')(n=>mocks[n]??require(n),mod,mod.exports);
 let tree;function render(index=0){cursor=0;tree=mod.exports.default({index,row:store.getState().rows[index],onOpenContact:()=>contactOpened++});return tree;}
 render();return{store,render,find:fn=>nodes(tree).find(fn),get contactOpened(){return contactOpened;}};
}
const row={action:'Shoot',timeIn:'9:00 AM',dur:'00:30',loc:'Museum',locName:'Museum',locAddress:'10 Main Street',locLat:35,locLng:-78,subLocations:[{id:'lobby',loc:'Lobby',name:'Lobby',address:'10 Main Street, East entrance',locLat:35,locLng:-78}]};
function field(h,name){return h.find(n=>n.props?.ariaLabel===name);}
function openAddress(h){h.find(n=>n.props?.['aria-label']==='Show full address').props.onClick();h.render();}
test('renaming main and sub-locations preserves separately entered addresses and coordinates',()=>{
 const h=harness('LocationCell',[row]);field(h,'Location name').props.onChange('Museum exterior');field(h,'Sub-location name').props.onChange('East lobby');
 const r=h.store.getState().rows[0];assert.equal(r.locAddress,row.locAddress);assert.equal(r.locLat,35);assert.equal(r.loc,'Museum exterior');assert.equal(r.subLocations[0].address,row.subLocations[0].address);assert.equal(r.subLocations[0].locLat,35);
 openAddress(h);field(h,'Full address').props.onChange('12 Main Street');assert.equal(h.store.getState().rows[0].locName,'Museum exterior');assert.equal(h.store.getState().rows[0].locLat,null);
});
test('Places selection fills address, but a later manual address edit wins over delayed lookup',()=>{
 const h=harness('LocationCell',[row]);let f=field(h,'Location name');f.props.onSelectionStart();f.props.onChange('Library');f.props.onSelect('20 Main Street',{lat:36,lng:-79});h.render();assert.equal(h.store.getState().rows[0].locAddress,'20 Main Street');assert.ok(field(h,'Full address'));
 f=field(h,'Location name');f.props.onSelectionStart();f.props.onChange('Library loading bay');field(h,'Full address').props.onChange('Manual delivery entrance');f.props.onSelect('Late provider address',{lat:38,lng:-80});assert.equal(h.store.getState().rows[0].locAddress,'Manual delivery entrance');assert.equal(h.store.getState().rows[0].locLat,null);
});
test('delayed main and sub-location selections follow row identity after reordering',()=>{
 const h=harness('LocationCell',[row,{action:'Shoot',dur:'00:15',loc:'Other'}]);const main=field(h,'Location name'),sub=field(h,'Sub-location name');main.props.onSelectionStart();sub.props.onSelectionStart();h.store.getState().reorderRows(0,1);main.props.onSelect('Updated museum address',{lat:1,lng:2});sub.props.onSelect('Updated lobby address',{lat:3,lng:4});assert.equal(h.store.getState().rows[1].locAddress,'Updated museum address');assert.equal(h.store.getState().rows[1].subLocations[0].address,'Updated lobby address');assert.equal(h.store.getState().rows[0].loc,'Other');
});
test('all 33 quarter-hour durations remain visible; locked-time limits disable choices and reject edits',()=>{
 assert.equal(time.DURATIONS.length,33);assert.deepEqual(time.DURATIONS.map(time.durm),Array.from({length:33},(_,i)=>i*15));
 const h=harness('DurationCell',[row,{action:'Shoot',dur:'00:15',fixedIn:true,timeIn:'10:00 AM'}]);const select=h.find(n=>n.type==='select'),options=nodes(select).filter(n=>n.type==='option');assert.equal(options.length,35);assert.equal(options.find(n=>n.props.value==='08:00').props.disabled,true);assert.equal(options.find(n=>n.props.value==='01:00').props.disabled,false);select.props.onChange({target:{value:'08:00'}});assert.equal(h.store.getState().rows[0].dur,'00:30');select.props.onChange({target:{value:'00:45'}});assert.equal(h.store.getState().rows[0].dur,'00:45');h.store.getState().undo();assert.equal(h.store.getState().rows[0].dur,'00:30');
});
test('Done is reversible, preserves timing, and contact opens independently',()=>{
 const h=harness('DoneContactCell',[row]);h.find(n=>n.props?.['aria-label']==='Mark action done').props.onChange({target:{checked:true}});assert.equal(h.store.getState().rows[0].done,true);assert.equal(h.store.getState().rows[0].timeIn,'9:00 AM');assert.equal(h.store.getState().rows[0].dur,'00:30');h.store.getState().undo();assert.equal(h.store.getState().rows[0].done,false);h.find(n=>n.props?.['aria-label']==='Add contact').props.onClick();assert.equal(h.contactOpened,1);
});
test('both time locks expose an icon, accessible state, and reversible toggle',()=>{
 for(const [component,key] of [['TimeInCell','fixedIn'],['TimeOutCell','fixedOut']]){const h=harness(component,[row]);let button=h.find(n=>n.type==='button');assert.equal(button.props['aria-pressed'],false);assert.ok(button.props.children);button.props.onClick();assert.equal(h.store.getState().rows[0][key],true);h.render();button=h.find(n=>n.type==='button');assert.equal(button.props['aria-pressed'],true);button.props.onClick();assert.equal(h.store.getState().rows[0][key],false);}
});
