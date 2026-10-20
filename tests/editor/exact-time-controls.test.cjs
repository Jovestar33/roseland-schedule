const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {sourceLoader}=require('./source-loader.cjs');
const time=sourceLoader()('lib/time.ts');
function render(file,row){
 const jsx=(type,props)=>({type,props});
 const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};
 const mocks={'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/time':time,'@/lib/store/scheduleStore':{useScheduleStore:fn=>fn({rows:[row],updateRow(){},pushUndo(){}})}};
 vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(name=>mocks[name],mod,mod.exports);
 return mod.exports.default({index:0,row});
}
function nodes(n,type){if(!n||typeof n!=='object')return [];if(Array.isArray(n))return n.flatMap(x=>nodes(x,type));return [...(n.type===type?[n]:[]),...nodes(n.props.children,type)];}
test('locking exact-minute times preserves a selected option instead of a blank control',()=>{
 for(const [file,key] of [['TimeInCell','timeIn'],['TimeOutCell','fixedOutTime']]){
  for(const value of ['11:05 AM','12:00 PM']){
   const row={action:'Shoot',timeIn:'11:05 AM',dur:'00:20',fixedIn:true,fixedOut:true,fixedOutTime:'11:25 AM',[key]:value};
   const tree=render('components/schedule/'+file+'.tsx',row);
   const select=nodes(tree,'select')[0];
   assert.equal(select.props.value,value);
   assert.equal(nodes(select,'option').filter(n=>n.props.value===value).length,1);
   assert.ok(select.props['aria-label']);
  }
 }
});
