const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),SSR=require('react-dom/server');
const {sourceLoader}=require('./source-loader.cjs');
test('read-only schedules retain description-only, note-only and location-only rows while omitting empty rows',()=>{
 const load=sourceLoader(),{makeMeta,makeRow}=load('lib/rowNormalizer.ts'),mod={exports:{}};
 const mocks={'@/components/schedule/CollapsibleText':{default:({value})=>React.createElement('span',null,value)},'@/components/schedule/LocalEditorContext':{useLocalEditor:()=>true},'@/lib/store/cmsStore':{useCmsStore:fn=>fn({config:{}}),useCmsActionClassMap:()=>({})},'@/lib/weather':{wxIcon:()=>''},'@/lib/time':load('lib/time.ts')};
 const code=ts.transpileModule(fs.readFileSync('components/view/ScheduleReadView.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(name=>mocks[name]??require(name),mod,mod.exports);
 const html=SSR.renderToStaticMarkup(React.createElement(mod.exports.default,{data:{meta:makeMeta({}),rows:[{desc:'Description without an action'},{notes:'Notes without an action'},{locName:'Location without an action'},{subLocations:[{id:'sub',name:'Additional location'}]},{}].map(row=>makeRow({action:'',...row}))}}));
 for(const value of ['Description without an action','Notes without an action','Location without an action','Additional location'])assert.ok(html.includes(value),value);
 assert.equal((html.match(/class="rn"/g)||[]).length,4);
});
