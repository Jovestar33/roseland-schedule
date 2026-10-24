const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function harness(){
 const slots=[],effects=[],calls={parse:0,preflight:0,send:0};let index=0,queued=[],tree;
 const entries=[{name:'Original schedule',slug:'original-schedule',data:{meta:{},rows:[]}}];
 const props={actor:'actor',organization:'org',enabled:true,copyEnabled:true,embedded:true,getSource:()=>null,getDraft:()=>({meta:{},rows:[]}),onState(){},requireAuth(){},client:{},name:'Example'};
 const react={useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(value){const i=index++;return slots[i]??(slots[i]={current:value});},useEffect(fn,deps){const i=index++,old=effects[i];if(!old||deps.some((v,n)=>v!==old.deps[n])){old?.cleanup?.();effects[i]={deps};queued.push(()=>effects[i].cleanup=fn());}}};
 class ScheduleFileImport{constructor(actor,organization,day,entries,_,placement){Object.assign(this,{actor,organization,day,entries,placement,items:[],started:false,complete:false});}receipt(){return this.entries.map((e,i)=>({id:'item-'+i,name:e.name,state:'review'}));}async execute(){calls.send++;}}
 class ScheduleRepositoryError extends Error{}
 const repo={productions:async()=>[{id:'prod',name:'Production',days:[]}],preflight:async()=>{calls.preflight++;}};
 const jsx=(type,props)=>({type,props});
 const mocks={react,'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/platform/schedule-repository':{ScheduleRepositoryError},'@/lib/platform/schedule-file-repository':{createScheduleFileRepository:()=>repo},'@/lib/platform/schedule-files':{FILE_BYTES:20_000_000,parseScheduleFile:async contents=>{calls.parse++;const next=structuredClone(entries),name=JSON.parse(contents).name;if(name)next[0].name=name;return next;},suggestedSlug:x=>x,ScheduleFileImport}};
 const source=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../components/local/LocalScheduleFiles.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const mod={exports:{}};vm.runInNewContext('(function(require,module,exports){'+source+'\n})',{Error,console})(name=>mocks[name]??{default:new Proxy({},{get:(_,key)=>key})},mod,mod.exports);
 function render(patch={}){Object.assign(props,patch);index=0;tree=mod.exports.default(props);const run=queued;queued=[];run.forEach(fn=>fn());}
 function nodes(node,result=[]){if(Array.isArray(node))node.forEach(n=>nodes(n,result));else if(node&&typeof node==='object'&&!node.props?.hidden){result.push(node);nodes(node.props?.children,result);}return result;}
 function text(node){if(node==null||typeof node==='boolean'||node?.props?.hidden)return '';if(Array.isArray(node))return node.map(text).join('');if(typeof node==='object')return text(node.props?.children);return String(node);}
 function click(label){const n=nodes(tree).find(n=>n.type==='button'&&text(n)===label);assert.ok(n,'button '+label);assert.ok(!n.props.disabled,'enabled '+label);n.props.onClick();render();}
 return {calls,render,click,text:()=>text(tree),nodes:()=>nodes(tree),flush:async()=>{await new Promise(resolve=>setImmediate(resolve));render();},upload(file={size:100,name:'example.json',text:async()=>'{"example":true}'}){const input=nodes(tree).find(n=>n.type==='input'&&n.props.type==='file');input.props.onChange({target:{files:[file],value:'example.json'}});render();}};
}
test('import review Back preserves edited names and never imports until explicit confirmation',async()=>{
 const h=harness();h.render();h.upload();await h.flush();
 const input=h.nodes().find(n=>n.type==='input'&&n.props.value==='Original schedule');input.props.onChange({target:{value:'Revised schedule'}});h.render();
 h.click('Continue to review');await h.flush();assert.equal(h.calls.preflight,1);assert.equal(h.calls.send,0);assert.match(h.text(),/Ready to import/);assert.doesNotMatch(h.text(),/Choose JSON backup/);
 h.click('Back');assert.ok(h.nodes().some(n=>n.type==='input'&&n.props.value==='Revised schedule'));assert.equal(h.calls.send,0);
 h.click('Cancel');assert.match(h.text(),/Choose JSON backup/);assert.equal(h.calls.send,0);
});
test('oversized files are rejected before parsing or preparing any import',async()=>{
 const h=harness();h.render();h.upload({size:20_000_001,name:'large.json',text:async()=>{throw Error('must not read');}});await h.flush();
 assert.match(h.text(),/smaller than 20 MB/);assert.equal(h.calls.parse,0);assert.equal(h.calls.preflight,0);assert.equal(h.calls.send,0);
});
test('a file read finishing after organization changes cannot populate the new organization review',async()=>{
 const h=harness();let finish;h.render();h.upload({size:100,name:'example.json',text:()=>new Promise(resolve=>finish=resolve)});h.render({organization:'other-org'});finish('{}');await h.flush();
 assert.doesNotMatch(h.text(),/Review imported schedules/);assert.equal(h.calls.preflight,0);assert.equal(h.calls.send,0);
});

for(const [name,away,back] of [
 ['organization',{organization:'other-org'},{organization:'org'}],
 ['account',{actor:'other-actor'},{actor:'actor'}],
 ['access',{enabled:false},{enabled:true}],
])test(`stalled file reads release the busy guard across ${name} transitions and cannot replace a newer review`,async()=>{
 const h=harness();let finish;h.render();h.upload({size:100,name:'old.json',text:()=>new Promise(resolve=>finish=resolve)});
 h.render(away);h.render(back);h.render();
 const input=h.nodes().find(n=>n.type==='input'&&n.props.type==='file');assert.equal(input.props.disabled,false);
 h.upload({size:100,name:'new.json',text:async()=>'{"name":"New review"}'});await h.flush();
 assert.ok(h.nodes().some(n=>n.type==='input'&&n.props.value==='New review'));
 finish('{"name":"Old review"}');await h.flush();
 assert.ok(h.nodes().some(n=>n.type==='input'&&n.props.value==='New review'));
 assert.ok(!h.nodes().some(n=>n.type==='input'&&n.props.value==='Old review'));assert.equal(h.calls.send,0);
});
test('completion of an invalidated file read cannot unlock a newer in-flight read',async()=>{
 const h=harness();let oldFinish,newFinish,thirdRead=0;h.render();h.upload({size:100,name:'old.json',text:()=>new Promise(resolve=>oldFinish=resolve)});
 h.render({organization:'other-org'});h.render();h.upload({size:100,name:'new.json',text:()=>new Promise(resolve=>newFinish=resolve)});
 oldFinish('{"name":"Old review"}');await h.flush();
 const input=h.nodes().find(n=>n.type==='input'&&n.props.type==='file');assert.equal(input.props.disabled,true);
 h.upload({size:100,name:'third.json',text:async()=>{thirdRead++;return '{}';}});assert.equal(thirdRead,0);
 newFinish('{"name":"New review"}');await h.flush();assert.ok(h.nodes().some(n=>n.type==='input'&&n.props.value==='New review'));
});
