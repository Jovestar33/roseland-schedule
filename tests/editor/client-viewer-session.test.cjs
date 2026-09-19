const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
function fixture(fetcher,hash='',search=''){
 const hooks=[],events=new Map();let cursor=0,effects=[],pending=false,tree;const location={pathname:'/local-client',hash,search};
 const mockReact={...React,useState(initial){const i=cursor++;if(!(i in hooks))hooks[i]=typeof initial==='function'?initial():initial;return [hooks[i],value=>{const n=typeof value==='function'?value(hooks[i]):value;if(n!==hooks[i]){hooks[i]=n;pending=true;}}];},useRef(value){const i=cursor++;return hooks[i]??(hooks[i]={current:value});},useEffect(fn,deps){const i=cursor++;if(!hooks[i]){hooks[i]={deps};effects.push(fn);}}};
 const code=ts.transpileModule(fs.readFileSync('components/view/LocalClientViewer.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{URLSearchParams,fetch:fetcher,window:{location,addEventListener:(n,f)=>events.set(n,f),removeEventListener:()=>{}},history:{replaceState:(_,__,url)=>{const v=new URL(url,'http://localhost');location.search=v.search;location.hash=v.hash;}},setInterval:()=>1,clearInterval:()=>{}})(name=>name==='react'?mockReact:name==='react/jsx-runtime'?require(name):{default:()=>null},mod,mod.exports);
 function render(){let i=0;do{assert.ok(i++<20);pending=false;cursor=0;tree=mod.exports.default({});const e=effects;effects=[];e.forEach(f=>f());}while(pending);return tree;}
 async function flush(){for(let n=0;n<4;n++){await new Promise(setImmediate);render();}return tree;}
 render();return {flush,get tree(){return tree;},location,changeHash(hash){location.hash=hash;events.get('hashchange')();render();}};
}
const response=(value,status=200)=>({ok:status>=200&&status<300,status,json:async()=>value});
function text(n){return Array.isArray(n)?n.map(text).join(' '):typeof n==='string'?n:n?.props?text(n.props.children):'';}
function view(n){if(Array.isArray(n)){for(const v of n){const r=view(v);if(r)return r;}}else if(n?.props){if(n.props.data)return n.props.name;return view(n.props.children);}return null;}
test('new link exchanges then confirms cookie; reload uses only its selector',async()=>{
 const calls=[],id='1'.repeat(32);const f=fixture(async(url,init)=>{calls.push({url,body:init.body});return response(url.endsWith(id)?{name:'A',document:{}}:{recipient:id});},'#'+'a'.repeat(64));await f.flush();assert.equal(view(f.tree),'A');assert.equal(f.location.hash,'');assert.equal(f.location.search,'?recipient='+id);assert.equal(calls.length,2);
 const reload=[];const r=fixture(async(url,init)=>{reload.push({url,body:init.body});return response({name:'A',document:{}});},'','?recipient='+id);await r.flush();assert.equal(view(r.tree),'A');assert.equal(reload.length,1);assert.equal(reload[0].body,undefined);
});
test('blocked cookie confirmation does not display the exchanged document or silently persist a bearer',async()=>{
 const f=fixture(async url=>response(url.endsWith('/local-client-view')?{recipient:'1'.repeat(32)}:{},url.endsWith('/local-client-view')?200:428),'#'+'a'.repeat(64));await f.flush();assert.equal(view(f.tree),null);assert.match(text(f.tree),/needs cookies/);assert.equal(f.location.search,'');
});
test('changing the fragment ignores a late previous exchange and shows only the new share',async()=>{
 let resolveA;const old=new Promise(r=>resolveA=r),idA='1'.repeat(32),idB='2'.repeat(32);
 const f=fixture(async(url,init)=>{if(init.body){const {token}=JSON.parse(init.body);return token[0]==='a'?old:response({recipient:idB});}return response({name:url.endsWith(idB)?'B':'A',document:{}});},'#'+'a'.repeat(64));
 f.changeHash('#'+'b'.repeat(64));await f.flush();resolveA(response({recipient:idA}));await f.flush();assert.equal(view(f.tree),'B');assert.equal(f.location.search,'?recipient='+idB);
});
test('invalid new token never falls back to the previous valid recipient',async()=>{
 const calls=[],id='1'.repeat(32);const f=fixture(async(url,init)=>{calls.push(url);return init.body?response({},404):response({name:'A',document:{}});},'','?recipient='+id);await f.flush();assert.equal(view(f.tree),'A');f.changeHash('#invalid');await f.flush();assert.equal(view(f.tree),null);assert.match(text(f.tree),/unavailable/);assert.equal(calls.filter(x=>x.endsWith(id)).length,1);
});
