const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
const {sourceLoader}=require('./source-loader.cjs');
function nodes(n){if(Array.isArray(n))return n.flatMap(nodes);if(!n||typeof n!=='object')return [];return[n,...nodes(n.props?.children)];}
function harness(access=null){
 const load=sourceLoader(),store=load('lib/store/scheduleStore.ts').useScheduleStore,time=load('lib/time.ts');store.getState().loadSchedule('Contacts',{meta:{},rows:[]});
 let cursor=0,tree;const hooks=[];const react={...React,useEffect(){},useRef(v){const i=cursor++;if(!(i in hooks))hooks[i]={current:v};return hooks[i];},useState(v){const i=cursor++;if(!(i in hooks))hooks[i]=typeof v==='function'?v():v;return[hooks[i],v=>hooks[i]=typeof v==='function'?v(hooks[i]):v];}};
 const mock={react,'./ContactDirectoryContext':{useContactDirectory:()=>access},'@/lib/platform/contact-directory':load('lib/platform/contact-directory.ts'),'@/lib/time':time,'@/lib/store/scheduleStore':{useScheduleStore:Object.assign(fn=>fn(store.getState()),{getState:store.getState})}};
 const mod={exports:{}};const js=ts.transpileModule(fs.readFileSync('components/local/ProductionContacts.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInThisContext('(function(require,module,exports){'+js+'\n})')(n=>mock[n]??require(n),mod,mod.exports);
 const render=(readOnly=false)=>{cursor=0;tree=mod.exports.default({readOnly});return tree;};render();
 return{store,render,find:f=>nodes(tree).find(f),field(label){return nodes(nodes(tree).find(n=>n.type==='label'&&nodes(n).some(x=>x===n)&&n.props.children[0]===label)).find(n=>n.type==='input'||n.type==='select');}};
}
function button(h,label){return h.find(n=>n.type==='button'&&n.props.children===label);}
test('contact form applies typed details, supports cancel, edit, remove and undo',()=>{
 const h=harness();button(h,'Add contact').props.onClick();h.render();h.field('Name').props.onChange({target:{value:' Alex '}});h.render();h.field('Role / title').props.onChange({target:{value:' Camera '}});h.render();h.field('Call time (optional)').props.onChange({target:{value:'08:15'}});h.render();h.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();
 const first=h.store.getState().meta.productionContacts[0];assert.equal(first.type,'crew');assert.equal(first.name,'Alex');assert.equal(first.role,'Camera');assert.equal(first.callTime,'8:15 AM');
 let groups=h.find(n=>n.props?.contacts&&n.props.onEdit);groups.props.onEdit(first);h.render();h.field('Name').props.onChange({target:{value:'Cancelled'}});h.render();button(h,'Cancel').props.onClick();h.render();assert.equal(h.store.getState().meta.productionContacts[0].name,'Alex');
 groups=h.find(n=>n.props?.contacts&&n.props.onEdit);groups.props.onRemove(first.id);assert.equal(h.store.getState().meta.productionContacts.length,0);h.store.getState().undo();assert.deepEqual(h.store.getState().meta.productionContacts,[first]);
});
test('permission loss disables and guards an already-open contact form',()=>{
 const h=harness();button(h,'Add contact').props.onClick();h.render();h.field('Name').props.onChange({target:{value:'Example'}});h.render(true);assert.equal(button(h,'Apply contact').props.disabled,true);h.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});assert.equal(h.store.getState().meta.productionContacts,undefined);assert.equal(h.find(n=>n.type==='fieldset').props.disabled,true);
});

test('shared selection copies only chosen contact and keeps daily edits out of shared saves',async()=>{
 const entry={id:'shared-1',scope:'production',label:'Test production',version:1,canManage:true,contact:{id:'shared-1',type:'crew',name:'Alex',role:'Camera',phone:'555',email:'alex@example.test'}};
 const calls=[],access={schedule:'schedule-1',current:()=>true,repository:{list:async()=>({entries:[entry],scopes:[{scope:'production',label:'Test production',canManage:true}]}),save:async(...args)=>{calls.push(args);return {...entry,contact:args[2],version:2};}}};
 const h=harness(access);button(h,'Choose from shared contacts').props.onClick();await new Promise(setImmediate);h.render();assert.equal(h.store.getState().meta.productionContacts,undefined);
 button(h,'Add to schedule').props.onClick();h.render();let c=h.store.getState().meta.productionContacts[0];assert.equal(c.directoryScope,'production');assert.equal(c.callTime,'');assert.equal(c.directoryLabel,'Test production');
 h.store.getState().updateMeta({productionContacts:[{...c,phone:'old',callTime:'9:30 AM',notes:'Day only'}]});h.render();button(h,'Use latest contact details').props.onClick();h.render();assert.equal(h.store.getState().meta.productionContacts[0].callTime,'9:30 AM');
 button(h,'Edit shared contact').props.onClick();h.render();assert.equal(h.field('Call time (optional)'),undefined);h.field('Name').props.onChange({target:{value:'Alex Smith'}});h.render();await h.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});h.render();assert.equal(calls.length,1);assert.equal(calls[0][2].callTime,undefined);assert.equal(calls[0][2].notes,undefined);assert.equal(h.store.getState().meta.productionContacts[0].name,'Alex');
});
