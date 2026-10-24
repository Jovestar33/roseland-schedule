const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
function fixture(fetcher,hash){let printRequest;const dispatched=[];
 const hooks=[],events=new Map();let cursor=0,effects=[],pending=false,tree;const location={hash};
 const react={...React,useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return[hooks[i],value=>{const next=typeof value==='function'?value(hooks[i]):value;if(next!==hooks[i]){hooks[i]=next;pending=true;}}];},useRef(value){const i=cursor++;return hooks[i]??(hooks[i]={current:value});},useEffect(fn){const i=cursor++;if(!hooks[i]){hooks[i]={};effects.push(fn);}}};
 const mocks={react,'@/lib/print':{printSchedule:async(name,data,authorize)=>{printRequest={name,data,authorize};}},'@/lib/rowNormalizer':{makeMeta:v=>v,makeRow:v=>v},'@/lib/platform/document-email':{documentLabels:{both:'Schedule & call sheet',schedule:'Schedule',call_sheet:'Call sheet'}},'@/components/modals/CallSheetModal':{IssuedCallSheet:()=>null},'@/components/schedule/LocalEditorContext':{LocalEditorContext:{Provider:()=>null}}};
 const code=ts.transpileModule(fs.readFileSync('components/view/CallSheetRecipient.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{Event,fetch:fetcher,window:{location,dispatchEvent:event=>dispatched.push(event.type),addEventListener:(n,fn)=>events.set(n,fn),removeEventListener:n=>events.delete(n)}})(name=>mocks[name]??(name==='react/jsx-runtime'?require(name):{default:()=>null}),mod,mod.exports);
 function render(){let n=0;do{assert.ok(n++<20);pending=false;cursor=0;tree=mod.exports.default();const next=effects;effects=[];next.forEach(fn=>fn());}while(pending);return tree;}
 async function flush(){for(let n=0;n<4;n++){await new Promise(setImmediate);render();}return tree;}
 render();return{flush,get tree(){return tree;},get printRequest(){return printRequest;},dispatched,changeHash(hash){location.hash=hash;events.get('hashchange')();render();}};
}
function nodes(n){return Array.isArray(n)?n.flatMap(nodes):n?.props?[n,...nodes(n.props.children)]:[];}
function text(n){return Array.isArray(n)?n.map(text).join(' '):typeof n==='string'?n:n?.props?text(n.props.children):'';}
function shown(f){return nodes(f.tree).find(n=>n.props.value?.document)?.props.value.name;}
const response=(name,status=200)=>({ok:status===200,status,json:async()=>status===200?{name,edition:1,created_at:'2026-10-24T12:00:00Z',document:{meta:{},rows:[]}}:{error:'This document link is unavailable.'}});
test('opening another recipient link discards late results from the previous link',async()=>{
 let resolveOld;const old=new Promise(resolve=>resolveOld=resolve),calls=[];
 const f=fixture(async(_,init)=>{const token=JSON.parse(init.body).token;calls.push(token);return token[0]==='a'?old:response('Second schedule');},'#'+'a'.repeat(64));
 f.changeHash('#'+'b'.repeat(64));await f.flush();assert.equal(shown(f),'Second schedule');resolveOld(response('First schedule'));await f.flush();assert.equal(shown(f),'Second schedule');assert.equal(calls.length,2);
});
test('an invalid replacement link clears the old documents and has no inert retry action',async()=>{
 let calls=0;const f=fixture(async()=>{calls++;return response('First schedule');},'#'+'a'.repeat(64));await f.flush();assert.equal(shown(f),'First schedule');
 f.changeHash('#incomplete');await f.flush();assert.equal(shown(f),undefined);assert.match(text(f.tree),/This link is incomplete/);assert.equal(nodes(f.tree).find(n=>n.type==='button'&&n.props.children==='Refresh').props.disabled,true);assert.equal(calls,1);
});
test('a revoked old link response cannot clear the replacement documents',async()=>{
 let resolveOld;const old=new Promise(resolve=>resolveOld=resolve);const f=fixture(async(_,init)=>JSON.parse(init.body).token[0]==='a'?old:response('New link'), '#'+ 'a'.repeat(64));
 f.changeHash('#'+'b'.repeat(64));await f.flush();resolveOld(response('',403));await f.flush();assert.equal(shown(f),'New link');assert.doesNotMatch(text(f.tree),/unavailable/);
});

test('a schedule print preview cannot authorize against a replacement recipient link',async()=>{
 const calls=[],f=fixture(async(_,init)=>{const token=JSON.parse(init.body).token;calls.push(token);return {ok:true,status:200,json:async()=>({name:token[0]==='a'?'First schedule':'Second schedule',documents:'schedule',edition:1,document:{meta:{},rows:[]}})};},'#'+'a'.repeat(64));await f.flush();
 nodes(f.tree).find(n=>n.type==='button'&&n.props.children==='Print / PDF').props.onClick();await f.flush();const old=f.printRequest;assert.equal(old.name,'First schedule');assert.equal(await old.authorize(),true);await f.flush();
 const closes=f.dispatched.length;f.changeHash('#'+'b'.repeat(64));await f.flush();assert.ok(f.dispatched.length>closes);const before=calls.length;assert.equal(await old.authorize(),false);assert.equal(calls.length,before);
});
test('recipient identity is checked again after delayed print authorization finishes',async()=>{
 let pause=false,finish;const f=fixture(async(_,init)=>{const t=JSON.parse(init.body).token;if(pause&&t[0]==='a')return new Promise(resolve=>finish=()=>resolve(response('Old response')));return {ok:true,status:200,json:async()=>({name:'Schedule',documents:'schedule',edition:1,document:{meta:{},rows:[]}})};},'#'+'a'.repeat(64));await f.flush();
 nodes(f.tree).find(n=>n.type==='button'&&n.props.children==='Print / PDF').props.onClick();await f.flush();pause=true;const result=f.printRequest.authorize();f.changeHash('#'+'b'.repeat(64));await f.flush();finish();assert.equal(await result,false);
});
