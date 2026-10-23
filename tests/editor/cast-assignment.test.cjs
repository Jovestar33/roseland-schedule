const test=require('node:test'),assert=require('node:assert/strict');
const {sourceLoader}=require('./source-loader.cjs');
const {toggleCastName,hasCastName}=sourceLoader()('lib/cast-assignment.ts');
test('selecting cast preserves imported notes, prevents duplicates, and removes only the exact selected name',()=>{
 const original='Legacy instructions: call Taylor before arrival.\nTaylor Reed (stunt double)';
 const selected=toggleCastName(original,'Taylor Reed',true);assert.equal(selected,original+'\nTaylor Reed');assert.equal(toggleCastName(selected,'Taylor Reed',true),selected);assert.equal(toggleCastName(selected,'Taylor Reed',false),original);assert.equal(hasCastName(selected,'Taylor Reed'),true);assert.equal(hasCastName(original,'Taylor Reed'),false);
});

const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
function nodes(n){if(Array.isArray(n))return n.flatMap(nodes);if(!n||typeof n!=='object')return[];return[n,...nodes(n.props?.children)];}
test('actual cast picker selects directory names, preserves existing notes, and supports undo',()=>{
 const load=sourceLoader(),store=load('lib/store/scheduleStore.ts').useScheduleStore;store.getState().loadSchedule('Cast',{meta:{productionContacts:[{id:'p',type:'cast',name:'Taylor Reed',role:'Presenter'}]},rows:[{desc:'Scene',cast:'Keep imported scene note'}]});
 const mocks={react:React,'@/lib/store/scheduleStore':{useScheduleStore:Object.assign(fn=>fn(store.getState()),{getState:store.getState})},'@/lib/cast-assignment':{hasCastName,toggleCastName},'./AutoResizeTextarea':{default:()=>null},'./cast-assignment.module.css':{default:{}}};
 const mod={exports:{}};const js=ts.transpileModule(fs.readFileSync('components/schedule/CastAssignment.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;vm.runInThisContext('(function(require,module,exports){'+js+'\n})')(n=>mocks[n]??require(n),mod,mod.exports);
 let tree=mod.exports.default({index:0,row:store.getState().rows[0]});nodes(tree).find(n=>n.type==='input').props.onChange({target:{checked:true}});assert.equal(store.getState().rows[0].cast,'Keep imported scene note\nTaylor Reed');store.getState().undo();assert.equal(store.getState().rows[0].cast,'Keep imported scene note');
});
