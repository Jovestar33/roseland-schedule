const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');

function harness(allowed){
  const draft={meta:{town:'Unsaved town'},rows:[{notes:'New draft notes'}],savedAt:1};
  let reads=0,clicks=0,authorization=0,blob;
  const jsx=(type,props)=>({type,props});
  const state={scheduleName:'Fictional draft',getScheduleData:()=>{reads++;return draft;}};
  const mocks={
    react:{useRef:()=>({current:null}),useState:(initial)=>[initial===false?true:initial,()=>{}],useEffect:()=>{},useContext:()=>true},
    'react/jsx-runtime':{jsx,jsxs:jsx},
    '@/lib/store/scheduleStore':{useScheduleStore:selector=>selector(state)},
    '@/lib/print':{},
    '@/components/schedule/LocalEditorContext':{useLocalEditor:()=>true},
    '@/components/modals/Modal':{ModalVisibilityContext:{}},
    '@/components/modals/ContactSheetModal':{default:()=>null},
    '@/components/modals/CallSheetModal':{default:()=>null},
  };
  const source=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../components/toolbar/ShareDropdown.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const mod={exports:{}};
  vm.runInNewContext('(function(require,module,exports){'+source+'\n})',{
    Blob,Date,document:{createElement:()=>({click:()=>clicks++})},URL:{createObjectURL:value=>{blob=value;return 'blob:fixture';},revokeObjectURL:()=>{}},
  })(name=>{assert.ok(mocks[name],name);return mocks[name];},mod,mod.exports);
  const tree=mod.exports.default({authorizeOutput:async()=>{authorization++;return allowed;}});
  function find(node){if(!node||typeof node!=='object')return null;if(node.type==='button'&&String(node.props.children).includes('Export JSON'))return node;for(const child of [node.props?.children].flat(Infinity)){const result=find(child);if(result)return result;}return null;}
  return {button:find(tree),draft,read:()=>reads,clicks:()=>clicks,authorization:()=>authorization,blob:()=>blob};
}
test('local Share exports the current unsaved document only after output authorization',async()=>{
  const h=harness(true);assert.ok(h.button);await h.button.props.onClick();
  assert.equal(h.authorization(),1);assert.equal(h.clicks(),1);assert.equal(h.read(),1);
  assert.deepEqual(JSON.parse(await h.blob().text()),h.draft);
});
test('denied local draft export neither reads nor downloads document content',async()=>{
  const h=harness(false);assert.ok(h.button);await h.button.props.onClick();
  assert.equal(h.authorization(),1);assert.equal(h.clicks(),0);assert.equal(h.read(),0);assert.equal(h.blob(),undefined);
});
