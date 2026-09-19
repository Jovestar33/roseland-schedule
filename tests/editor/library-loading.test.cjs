const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject};}
function harness(){
 const slots=[],effects=[],requests=[];let index=0,queued=[],tree,props={actor:'actor',organization:'org',enabled:true,onState(){},onOpen(){},onInspect(){},onTransfer(){},selected:null,client:{}};
 const react={useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}];},useRef(value){const i=index++;return slots[i]??(slots[i]={current:value});},useMemo(fn){index++;return fn();},useEffect(fn,deps){const i=index++,old=effects[i];if(!old||deps.some((v,n)=>v!==old.deps[n])){old?.cleanup?.();effects[i]={deps};queued.push(()=>effects[i].cleanup=fn());}}};
 const repo={inventory(){const d=deferred();requests.push(d);return d.promise;},destinations:async()=>[{id:'production',name:'Fictional production',create:true,organize:true,phases:[],days:[]}]};
 const jsx=(type,props)=>({type,props});
 const mocks={react,'react/jsx-runtime':{jsx,jsxs:jsx},'@hello-pangea/dnd':{},'@/lib/platform/schedule-library':{createScheduleLibraryRepository:()=>repo,filterLibrary:rows=>rows,libraryGroup:()=>''},'@/lib/platform/schedule-lifecycle-repository':{createLifecycleRepository:()=>({})},'@/lib/platform/schedule-lifecycle-controller':{ScheduleLifecycleController:class{bind(){} }},'@/lib/platform/schedule-files':{suggestedSlug:x=>x}};
 const source=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../components/local/LocalScheduleLibrary.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};vm.runInNewContext('(function(require,module,exports){'+source+'\n})',{Error,localStorage:{getItem:()=>null},crypto:{randomUUID:()=>''},console})(name=>mocks[name]??{default:{}},mod,mod.exports);
 function render(patch={}){props={...props,...patch};index=0;tree=mod.exports.default(props);const run=queued;queued=[];run.forEach(f=>f());return tree;}
 function text(node){if(node==null||typeof node==='boolean')return '';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return text(node.props?.children);}
 return{render,requests,text:()=>text(tree),flush:async()=>{await new Promise(resolve=>setImmediate(resolve));render();}};
}
test('readiness pause during library load starts a replacement read and rejects stale results',async()=>{
 const h=harness();h.render();assert.equal(h.requests.length,1);h.render({enabled:false});h.render({enabled:true});
 assert.equal(h.requests.length,2,'resumed access must not lose its load behind the previous request');
 h.requests[0].resolve([{id:'stale',production_id:'production',display_name:'Stale'}]);await h.flush();assert.ok(!h.text().includes('1 visible schedules'));
 h.requests[1].resolve([]);await h.flush();assert.ok(h.text().includes('0 visible schedules'));assert.ok(!h.text().includes('Loading complete library'));
});
test('failed library load reports an error instead of claiming it is still loading',async()=>{
 const h=harness();h.render();h.requests[0].reject(new Error('Fictional connection unavailable'));await h.flush();
 assert.ok(h.text().includes('Fictional connection unavailable'));assert.ok(!h.text().includes('Loading complete library'));
});
