const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
function descendants(n){if(!n||typeof n!=='object')return [];return [n,...[n.props?.children].flat(Infinity).flatMap(descendants)];}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
function harness(provider){
 let si=0,ri=0,ei=0,value='',timer=0;const state=[],refs=[],effects=[],queued=[],timers=new Map(),selected=[];
 const field={getBoundingClientRect:()=>({left:10,top:600,bottom:640,width:200})},document={activeElement:field,getElementById:()=>null,body:{}};
 const hooks={...React,useId:()=> 'location-list',useCallback:fn=>fn,useState(initial){const i=si++;if(!(i in state))state[i]=initial;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v];},useRef(initial){const i=ri++;return refs[i]??(refs[i]={current:initial});},useEffect(fn,deps){const i=ei++,old=effects[i];if(!old||deps.some((x,j)=>x!==old.deps[j])){effects[i]={deps};queued.push(()=>{old?.cleanup?.();effects[i].cleanup=fn();});}}};
 const mocks={react:hooks,'react-dom':{createPortal:n=>n},'@/lib/observe-textarea-size':{observeTextareaSize:()=>()=>{}},'./LocalEditorContext':{useLocalEditor:()=>true},'@/components/local/DocumentProvidersContext':{useDocumentProviders:()=>provider},'@/lib/googlePlaces':{}};
 const mod={exports:{}},code=ts.transpileModule(fs.readFileSync('components/schedule/PlacesAutocomplete.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{document,window:{innerWidth:390,innerHeight:700,addEventListener(){},removeEventListener(){}},setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id)})(name=>mocks[name]??require(name),mod,mod.exports);
 function render(){si=ri=ei=0;const tree=mod.exports.default({value,onChange:v=>value=v,onSelect:(...args)=>selected.push(args)});const input=descendants(tree).find(n=>n.type==='input');input.props.ref(field);while(queued.length)queued.shift()();return {tree,input};}
 render();render();
 return {render,document,selected,change(v){render().input.props.onChange({target:{value:v}});render();},external(v){value=v;render();},run(){const fn=[...timers.values()].at(-1);timers.clear();return fn?.();},timers};
}
test('late Places results do not reopen a dropdown after focus leaves',async()=>{
 const d=deferred(),h=harness({kind:'live',search:()=>d.promise});h.change('Town');const pending=h.run();h.document.activeElement=null;h.render().input.props.onBlur();d.resolve([{placeId:'1',main:'Town',label:'Town'}]);await pending;assert.equal(h.render().input.props['aria-expanded'],false);
});
test('Escape cancels a pending location search before it reaches the provider',()=>{
 let requests=0;const h=harness({kind:'live',search:async()=>{requests++;return [];}});h.change('Town');h.render().input.props.onKeyDown({key:'Escape'});h.run();assert.equal(requests,0);assert.equal(h.render().input.props['aria-expanded'],false);
});
test('Undo or another external value change prevents late address details from overwriting it',async()=>{
 const geo=deferred(),h=harness({kind:'live',search:async()=>[{placeId:'1',main:'Town',label:'Town'}],geocode:()=>geo.promise});h.change('Town');await h.run();h.render().input.props.onKeyDown({key:'Enter',preventDefault(){}});h.render();h.external('Restored location');geo.resolve({lat:1,lng:2,address:'Old lookup address'});await geo.promise;await Promise.resolve();assert.deepEqual(h.selected,[]);assert.equal(h.render().input.props.value,'Restored location');
});
