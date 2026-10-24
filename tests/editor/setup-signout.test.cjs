const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
function fixture(outcome){
 const values=[];let slot=0,tree;
 const react={...React,useMemo:fn=>fn(),useEffect(){},useState(initial){const i=slot++;if(!(i in values))values[i]=i===0?'ready':i===3?'fixture@example.test':typeof initial==='function'?initial():initial;return [values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];}};
 const supabase={auth:{signOut:async()=>{if(outcome==='throw')throw Error('offline');return{error:outcome==='error'?{message:'not confirmed'}:null};}}};
 const mocks={react,'@supabase/supabase-js':{createClient:()=>supabase},'next/image':{__esModule:true,default:()=>null},'./setup.module.css':{default:{}}};
 const code=ts.transpileModule(fs.readFileSync('app/platform/setup/AuthSetupClient.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const mod={exports:{}};vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(name=>mocks[name]||require(name),mod,mod.exports);
 function render(){slot=0;tree=mod.exports.default({supabaseUrl:'http://example.test',publishableKey:'fixture-only',projectRef:'fixture-project'});}
 const text=n=>typeof n==='string'?n:React.Children.toArray(n?.props?.children).map(text).join(' ');
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...React.Children.toArray(n.props?.children).flatMap(nodes)];
 render();return{render,text:()=>text(tree),buttons:()=>nodes(tree).filter(n=>n.type==='button'),async signOut(){await nodes(tree).find(n=>n.type==='button'&&text(n)==='Sign out of setup').props.onClick();render();}};
}
for(const outcome of ['error','throw'])test(`setup sign-out ${outcome} stays in its current account and offers retry`,async()=>{const f=fixture(outcome);await f.signOut();assert.match(f.text(),/couldn’t sign you out/);assert.match(f.text(),/fixture@example.test/);assert.ok(f.buttons().some(b=>b.props.disabled===false));assert.doesNotMatch(f.text(),/Development account email/);});
test('confirmed setup sign-out clears the account and returns to sign-in',async()=>{const f=fixture('success');await f.signOut();assert.match(f.text(),/Development account email/);assert.doesNotMatch(f.text(),/fixture@example.test/);});
