const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function harness(){
 const slots=[],effects=[],requests=[];let index=0,queued=[],tree;
 const props={actor:'actor',organization:'org',enabled:true,embedded:true,request:null,onState(){},getDraft(){return null;},captureOpen(){},onCopy(){},client:{}};
 const react={useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(value){const i=index++;return slots[i]??(slots[i]={current:value});},useEffect(fn,deps){const i=index++,old=effects[i];if(!old||deps.some((v,n)=>v!==old.deps[n])){old?.cleanup?.();effects[i]={deps};queued.push(()=>effects[i].cleanup=fn());}}};
 const repo={inbox(){return new Promise((resolve,reject)=>requests.push({resolve,reject}));}};
 const jsx=(type,props)=>({type,props});
 const mocks={react,'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/platform/schedule-transfers':{createTransferRepository:()=>repo},'@/lib/platform/schedule-library':{createScheduleLibraryRepository:()=>({})},'@/lib/platform/schedule-lifecycle-repository':{createLifecycleRepository:()=>({})},'@/lib/rowNormalizer':{makeMeta:()=>({})}};
 const source=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../components/local/LocalScheduleTransfers.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};vm.runInNewContext('(function(require,module,exports){'+source+'\n})',{Error,console})(name=>mocks[name]??{default:{}},mod,mod.exports);
 function render(){index=0;tree=mod.exports.default(props);const run=queued;queued=[];run.forEach(fn=>fn());}
 function nodes(node,result=[]){if(Array.isArray(node))node.forEach(n=>nodes(n,result));else if(node&&typeof node==='object'&&!node.props?.hidden){result.push(node);nodes(node.props?.children,result);}return result;}
 function text(node){if(node==null||typeof node==='boolean'||node?.props?.hidden)return '';if(Array.isArray(node))return node.map(text).join('');if(typeof node==='object')return text(node.props?.children);return String(node);}
 return{render,requests,text:()=>text(tree),refresh:()=>nodes(tree).find(n=>n.type==='button'&&n.props.children==='↻ Refresh').props.onClick(),flush:async()=>{await new Promise(resolve=>setImmediate(resolve));render();}};
}
test('move-request loading never reports an empty queue before the read succeeds',async()=>{
 const h=harness();h.render();assert.match(h.text(),/Loading requests/);assert.doesNotMatch(h.text(),/No move requests/);
 h.requests[0].resolve([]);await h.flush();assert.match(h.text(),/No move requests/);assert.doesNotMatch(h.text(),/Loading requests/);
});
test('failed move-request reads show a useful error and a successful retry clears it',async()=>{
 const h=harness();h.render();h.requests[0].reject(new Error('Internal provider error'));await h.flush();
 assert.match(h.text(),/Couldn’t load move requests/);assert.doesNotMatch(h.text(),/No move requests|Internal provider error/);
 h.refresh();h.requests[1].resolve([]);await h.flush();assert.match(h.text(),/No move requests/);assert.doesNotMatch(h.text(),/Couldn’t load|Internal provider error/);
});
