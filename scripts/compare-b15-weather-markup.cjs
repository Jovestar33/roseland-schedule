const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {sourceLoader}=require('../tests/editor/source-loader.cjs');
const legacy='/private/tmp/roseland-parity-legacy-62eb261/components/schedule/WxStrip.tsx';
const fixture=JSON.parse(fs.readFileSync('evidence/b15-workflow-completion/matched-weather-fictional.json','utf8'));
let meta=fixture.meta;
function component(file){
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,mod={exports:{}};
 const mocks={'@/lib/store/scheduleStore':{useScheduleStore:fn=>fn({meta})},'@/lib/weather':sourceLoader()('lib/weather.ts'),'@/components/local/DocumentProvidersContext':{useDocumentProviders:()=>({kind:'live'})},'./LocalEditorContext':{useLocalEditor:()=>({})}};
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(name=>mocks[name]??require(name),mod,mod.exports);return mod.exports.default;
}
const previous=component(legacy),current=component('components/schedule/WxStrip.tsx');
const cases={saved:fixture.meta.wx,sunOnly:{sunrise:'6:30 AM',sunset:'7:15 PM',fetchedAt:'Fictional forecast',noForecast:true},zeroValues:{...fixture.meta.wx,maxF:0,minF:0,prec:0,code:0,cond:'Clear'},empty:null};
const results={};
for(const [name,wx] of Object.entries(cases)){
 meta={...fixture.meta,wx};const props={onRefresh(){},onClear(){}};
 const a=renderToStaticMarkup(React.createElement(previous,props)),b=renderToStaticMarkup(React.createElement(current,props));assert.equal(b,a,name);
 results[name]={legacyMarkupEqual:true,text:b.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()};
}
fs.writeFileSync('evidence/b15-weather-parity/weather-markup-comparison.json',JSON.stringify(results,null,2));console.log('Four saved/zero/sun-only/empty render cases match pinned legacy markup.');
