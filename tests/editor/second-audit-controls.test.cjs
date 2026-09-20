const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  return typeof tree === 'string' ? tree : text(tree?.props?.children ?? []);
}
function key(name, prevented = false) {
  return {key:name, defaultPrevented:prevented, preventDefault(){this.defaultPrevented=true;}};
}

// Execute actual components and hooks; substitute only framework scheduling,
// DOM focus targets, and provider/store boundaries. No browser, network or DB.
function fixture(file, component, props = {}, options = {}) {
  const hooks = [], effects = [];
  let cursor = 0, changed = false, tree, focusCount = 0;
  const context = {readOnly:false, local:true, provider:null, visible:true, ...options};
  const react = {
    ...React,
    useState(initial) {
      const i=cursor++;
      if (!(i in hooks)) hooks[i]=typeof initial==='function'?initial():initial;
      return [hooks[i], value=>{const next=typeof value==='function'?value(hooks[i]):value;if(next!==hooks[i]){hooks[i]=next;changed=true;}}];
    },
    useRef(value){const i=cursor++;return hooks[i]??(hooks[i]={current:value});},
    useId(){const i=cursor++;return hooks[i]??(hooks[i]='audit-menu-'+i);},
    useContext(ctx){return ctx === modalVisibility ? context.visible : context.readOnly;},
    useEffect(fn,deps){
      const i=cursor++, old=hooks[i];
      if(!old||deps.some((v,k)=>v!==old.deps[k])) effects.push(()=>{old?.cleanup?.();hooks[i]={deps,cleanup:fn()};});
    },
  };
  const modalVisibility = {};
  const mockNode = () => ({focus(){focusCount++;},contains:()=>false,querySelector:()=>({focus(){focusCount++;}}),getBoundingClientRect:()=>({bottom:20,right:100})});
  const schedule={rows:[],meta:{callsheet:{},date:'',projectName:'',phase:'',dayNumber:null,totalDays:null},scheduleName:'Fictional',getScheduleData:()=>({}),updateMeta(){throw Error('Unexpected store mutation');}};
  const mocks={
    react,
    'react-dom':{createPortal:()=>null},
    '@/lib/store/scheduleStore':{useScheduleStore:select=>select(schedule)},
    '@/lib/store/cmsStore':{useCmsStore:select=>select({config:{}})},
    '@/components/schedule/LocalEditorContext':{useLocalEditor:()=>context.local},
    '@/components/local/DocumentProvidersContext':{useDocumentProviders:()=>context.provider},
    '@/lib/document-tools':{documentContacts:()=>[]},
    '@/lib/call-sheet':require('./source-loader.cjs').sourceLoader()('lib/call-sheet.ts'),
    '@/lib/print':{printDocument(){throw Error('Unexpected print');},printSchedule(){throw Error('Unexpected print');}},
    './DocumentPrintFurniture':{default:()=>null},
    '@/lib/date-label':require('./source-loader.cjs').sourceLoader()('lib/date-label.ts'),
    './Modal':{default:()=>null,ModalVisibilityContext:modalVisibility},
    '@/components/modals/Modal':{ModalVisibilityContext:modalVisibility},
    '@/components/modals/ContactSheetModal':{default:()=>null},
    '@/components/modals/CallSheetModal':{default:()=>null},
    '@/components/schedule/PlacesAutocomplete':{default:function PlacesAutocomplete(){}},
  };
  const extra=file.includes('CallSheetModal')?'\nexport {Field, LocationField, Notes, CallSheetDocument};':'';
  const code=ts.transpileModule(fs.readFileSync(file,'utf8')+extra,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const mod={exports:{}};
  vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(name=>mocks[name]??require(name),mod,mod.exports);
  function render(){
    let iterations=0;
    do {
      assert.ok(iterations++<12,'bounded render');cursor=0;changed=false;tree=mod.exports[component](props);
      for(const n of nodes(tree)) if(n.props?.ref && typeof n.props.ref==='object') n.props.ref.current=mockNode();
      effects.splice(0).forEach(run=>run());
    } while(changed);
    return tree;
  }
  render();
  return {render,context,get tree(){return tree;},get focusCount(){return focusCount;},find:predicate=>nodes(tree).find(predicate),all:()=>nodes(tree),dispose(){for(const h of hooks)h?.cleanup?.();}};
}
const callFile='components/modals/CallSheetModal.tsx';
const fields=[['LocationField','Basecamp','basecamp'],['LocationField','Crew Parking','parking'],['LocationField','Nearest Hospital','hospital'],['Field','Emergency Contact','emergency'],['Notes','Safety Notes','safetyNotes'],['Notes','Special Instructions','specialInstructions'],['Notes','Meal Notes','mealNotes'],['Notes','General Notes','notes']];

test('the actual Call Sheet renders all eight tested field types and carries the read-only boundary',()=>{
  const f=fixture(callFile,'default',{open:true,readOnly:true,onClose:()=>{}});
  assert.equal(f.tree.props.value,true);
  const content=f.find(n=>n.type?.name==='CallSheetDocument');
  const shared=fixture(callFile,'CallSheetDocument',content.props);
  const actual=shared.all().filter(n=>['Field','LocationField','Notes'].includes(n.type?.name));
  assert.deepEqual(actual.map(n=>[n.type.name,n.props.label,n.props.fieldKey]),fields);
});

test('Call Sheet uses native triggers for all eight fields; Escape discards drafts before a later blur and returns focus',()=>{
  for(const [component,label,fieldKey] of fields){
    const commits=[], f=fixture(callFile,component,{label,fieldKey,value:'Original',onCommit:(...v)=>commits.push(v)});
    const trigger=f.find(n=>n.type==='button');assert.equal(trigger.props.type,'button');assert.equal(trigger.props['aria-label'],'Edit '+label);
    trigger.props.onClick();f.render();
    const field=f.find(n=>n.type==='input'||n.type==='textarea'||n.type?.name==='PlacesAutocomplete');
    if(component==='LocationField') field.props.onChange('Unsubmitted'); else field.props.onChange({target:{value:'Unsubmitted'}});
    f.render();
    const editor=f.find(n=>component==='LocationField'?n.props?.className==='csh-loc-wrap':n.type==='input'||n.type==='textarea');
    const focusBeforeCancel=f.focusCount;
    const event=key('Escape');editor.props.onKeyDown(event);assert.equal(event.defaultPrevented,true,'parent modal must not also close');
    if(component==='LocationField')editor.props.onBlur({currentTarget:{contains:()=>false},relatedTarget:null});else editor.props.onBlur();
    f.render();assert.deepEqual(commits,[]);assert.equal(text(f.find(n=>n.type==='button')),'Original');assert.equal(f.focusCount,focusBeforeCancel+1);
  }
});

test('Call Sheet Enter commits single-line edits, Tab/blur commits notes, and multiline Enter stays a newline',()=>{
  for(const [component,label,fieldKey] of fields){
    const commits=[],f=fixture(callFile,component,{label,fieldKey,value:'Before',onCommit:(...v)=>commits.push(v)});
    f.find(n=>n.type==='button').props.onClick();f.render();
    const field=f.find(n=>n.type==='input'||n.type==='textarea'||n.type?.name==='PlacesAutocomplete');
    if(component==='LocationField')field.props.onChange('After');else field.props.onChange({target:{value:'After'}});
    f.render();const edit=f.find(n=>component==='LocationField'?n.props?.className==='csh-loc-wrap':n.type==='input'||n.type==='textarea');
    const event=key('Enter');edit.props.onKeyDown(event);
    if(component==='Notes'){assert.equal(event.defaultPrevented,false);assert.deepEqual(commits,[]);edit.props.onBlur();}
    else assert.equal(event.defaultPrevented,true);
    f.render();assert.deepEqual(commits,[[fieldKey,'After']]);assert.equal(f.find(n=>n.type==='input'||n.type==='textarea'),undefined);
  }
});

test('Location autocomplete owns handled Enter and cancelled late selections cannot commit',()=>{
  const commits=[],f=fixture(callFile,'LocationField',{label:'Basecamp',fieldKey:'basecamp',value:'Before',onCommit:(...v)=>commits.push(v)});
  f.find(n=>n.type==='button').props.onClick();f.render();
  const editor=f.find(n=>n.props?.className==='csh-loc-wrap'),autocomplete=f.find(n=>n.type?.name==='PlacesAutocomplete');
  editor.props.onKeyDown(key('Enter',true));f.render();assert.deepEqual(commits,[]);assert.ok(f.find(n=>n.props?.className==='csh-loc-wrap'));
  editor.props.onKeyDown(key('Escape'));f.render();autocomplete.props.onSelect('Late address');f.render();assert.deepEqual(commits,[]);
});

test('Call Sheet maps require legacy or explicit live providers; read-only fields remain non-editable',()=>{
  for(const options of [{local:false,expected:1},{local:true,provider:{kind:'live'},expected:1},{local:true,provider:{kind:'fictional'},expected:0},{local:true,provider:{},expected:0},{local:true,provider:null,expected:0}]){
    const f=fixture(callFile,'LocationField',{label:'Basecamp',fieldKey:'basecamp',value:'Fictional A & B #2',onCommit:()=>{}},options);
    const links=f.all().filter(n=>n.type==='a');assert.equal(links.length,options.expected);
    if(links.length){assert.equal(links[0].props.href,'https://www.google.com/maps/dir/?api=1&destination=Fictional%20A%20%26%20B%20%232');assert.equal(links[0].props.rel,'noopener noreferrer');}
  }
  const empty=fixture(callFile,'LocationField',{label:'Basecamp',fieldKey:'basecamp',value:'',onCommit:()=>{}},{provider:{kind:'live'}});
  assert.equal(empty.all().filter(n=>n.type==='a').length,0);
  for(const [component,label,fieldKey] of fields){
    const f=fixture(callFile,component,{label,fieldKey,value:'Visible authorized value',onCommit(){throw Error('Read-only mutation');}},{readOnly:true});
    assert.equal(f.all().filter(n=>['button','input','textarea','a'].includes(n.type)).length,0);
    assert.match(text(f.tree),/Visible authorized value/);
  }
});

test('Share Escape closes from opener or menu focus, restores opener, and preserves option order/outside/scroll dismissal',()=>{
  const oldDocument=global.document,oldWindow=global.window,listeners=new Map(),windowListeners=new Map();
  global.document={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
  global.window={innerWidth:1200,addEventListener:(name,fn)=>windowListeners.set(name,fn),removeEventListener:(name,fn)=>{if(windowListeners.get(name)===fn)windowListeners.delete(name);}};
  let f;
  try{
    f=fixture('components/toolbar/ShareDropdown.tsx','default');
    const opener=()=>f.find(n=>n.type==='button'&&n.props.title==='Share');
    assert.equal(opener().props['aria-expanded'],false);
    for(const target of ['opener','menu option']){
      opener().props.onClick();f.render();assert.equal(opener().props['aria-expanded'],true);
      const menu=f.find(n=>n.props?.className==='tbar-drop');assert.equal(menu.props.id,opener().props['aria-controls']);
      assert.deepEqual(nodes(menu).filter(n=>n.type==='button').map(text),['🖨 Print / PDF','⬇ Export JSON','📋 Contact Sheet','📄 Call Sheet']);
      const before=f.focusCount,event={...key('Escape'),target};listeners.get('keydown')(event);f.render();
      assert.equal(event.defaultPrevented,true);assert.equal(opener().props['aria-expanded'],false);assert.equal(f.focusCount,before+1);assert.equal(listeners.has('keydown'),false);
    }
    opener().props.onClick();f.render();listeners.get('keydown')(key('Escape',true));f.render();assert.equal(opener().props['aria-expanded'],true);
    listeners.get('mousedown')({target:{}});f.render();assert.equal(opener().props['aria-expanded'],false);
    opener().props.onClick();f.render();windowListeners.get('scroll')();f.render();assert.equal(opener().props['aria-expanded'],false);
    opener().props.onClick();f.render();f.context.visible=false;f.render();assert.equal(opener().props['aria-expanded'],false);
  }finally{f?.dispose();global.document=oldDocument;global.window=oldWindow;}
});
