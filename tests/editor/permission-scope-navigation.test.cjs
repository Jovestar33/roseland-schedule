const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(role='owner',options={}){
 const values=[],refs=[];let slot=0,refSlot=0,panel={};
 const calls=[];const directory={productions:[{id:'production-1',name:'Production One'}],schedules:[{id:'schedule-1',name:'Day One',production:'production-1'}],members:[{id:'member-1',name:'Example Member',role:'member'}]};
 const workspace={session:{access_token:'test-only'},active:true,authNeeded:false,readOnly:!!options.readOnly,organization:{id:'organization-1',name:'Example Organization',role},client:{rpc(name,args){calls.push({name,args});return{setHeader:async()=>({data:name==='schedule_permission_directory'?directory:{restrictions:[],effective:{read:true,permissions:options.canManage!==false}},error:name==='assign_production_role'&&options.failAssignment?{code:'test_failure'}:null})};}}};
 const mocks={react:{...React,useState(initial){const i=slot++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},useRef(initial){const i=refSlot++;return refs[i]??(refs[i]={current:initial});}},'./LocalWorkspaceContext':{useLocalWorkspace:()=>workspace,useWorkspacePanelState:(dirty,busy)=>{panel={dirty,busy};}},'@/app/local-workspace/workspace.module.css':{default:{}}};
 const output=ts.transpileModule(fs.readFileSync('components/local/LocalSchedulePermissions.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const module={exports:{}};vm.runInThisContext('(function(require,module,exports){'+output+'\n})')(name=>mocks[name]||require(name),module,module.exports);
 let tree;function render(){slot=0;refSlot=0;tree=module.exports.default();return tree;}
 function nodes(node=tree){if(!node||typeof node!=='object')return[];return[node,...React.Children.toArray(node.props?.children).flatMap(x=>nodes(x))];}
 const text=node=>typeof node==='string'?node:typeof node==='number'?String(node):React.Children.toArray(node?.props?.children).map(text).join('');
 const find=(type,label)=>nodes().find(n=>n.type===type&&text(n)===label);
 render();return{render,nodes,find,calls,get panel(){return panel;},async open(){tree.props.onToggle({currentTarget:{open:true}});await settle();render();}};
}
test('scope selection cannot expose a save form until its production and schedule are selected',async()=>{
 const h=harness();await h.open();
 h.find('button','Schedule').props.onClick();h.render();assert.equal(h.nodes().filter(n=>n.type==='form').length,0);
 const production=h.nodes().find(n=>n.type==='select');production.props.onChange({target:{value:'production-1'}});await settle();h.render();
 assert.equal(h.find('button','Save permissions'),undefined);
 const schedule=h.nodes().filter(n=>n.type==='select')[1];schedule.props.onChange({target:{value:'schedule-1'}});await settle();h.render();
 assert.ok(h.find('button','Save permissions'));
 assert.deepEqual(h.calls.at(-1).args,{target_organization_id:'organization-1',target_production_id:'production-1',target_schedule_id:'schedule-1'});
 h.nodes().find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});h.render();
 assert.equal(h.find('button','Organization').props.disabled,true,'unfinished permission draft prevents changing its target');
 h.find('button','Discard permission draft').props.onClick();h.render();h.find('button','Organization').props.onClick();await settle();h.render();
 assert.deepEqual(h.calls.at(-1).args,{target_organization_id:'organization-1',target_production_id:null,target_schedule_id:null});
});
test('Admin scope navigation preserves restricted role choices',async()=>{
 const h=harness('admin');await h.open();const roles=h.nodes().filter(n=>n.type==='option').map(n=>n.props.value);
 assert.ok(roles.includes('role:editor'));assert.ok(!roles.includes('role:owner'));assert.ok(!roles.includes('role:admin'));assert.ok(!roles.includes('role:everyone'));
});

async function chooseProduction(h){
 await h.open();h.find('button','Production').props.onClick();h.render();
 h.nodes().find(n=>n.type==='select').props.onChange({target:{value:'production-1'}});await settle();h.render();
}
function chooseMember(h){
 h.nodes().find(n=>n.type==='select'&&n.props.required).props.onChange({target:{value:'member-1'}});h.render();
}
test('production role draft protects its scope and can be cancelled without assigning access',async()=>{
 const h=harness();await chooseProduction(h);chooseMember(h);
 assert.equal(h.panel.dirty,true);
 assert.equal(h.find('button','Schedule').props.disabled,true);
 assert.equal(h.nodes().find(n=>n.type==='select').props.disabled,true);
 assert.equal(h.nodes().find(n=>n.type==='fieldset').props.disabled,true);
 h.find('button','Cancel role draft').props.onClick();h.render();
 assert.equal(h.panel.dirty,false);assert.equal(h.find('button','Schedule').props.disabled,false);
 assert.equal(h.nodes().find(n=>n.type==='fieldset').props.disabled,false);
 assert.equal(h.calls.some(c=>c.name==='assign_production_role'),false);
});
test('failed role assignment retains the exact draft; a successful assignment clears it',async()=>{
 for(const failAssignment of [true,false]){
  const h=harness('owner',{failAssignment});await chooseProduction(h);chooseMember(h);
  const form=h.nodes().filter(n=>n.type==='form').at(-1);form.props.onSubmit({preventDefault(){}});await settle();h.render();
  assert.deepEqual(h.calls.at(-1),{name:'assign_production_role',args:{target_production_id:'production-1',target_user_id:'member-1',next_role:'organizer'}});
  assert.equal(h.panel.dirty,failAssignment);
  assert.equal(h.nodes().find(n=>n.type==='select'&&n.props.required).props.value,failAssignment?'member-1':'');
 }
});
test('read-only or restricted management access leaves review available while disabling mutation controls',async()=>{
 for(const options of [{readOnly:true},{canManage:false}]){
  const h=harness('owner',options);await chooseProduction(h);
  assert.equal(h.nodes().find(n=>n.type==='fieldset').props.disabled,true);
  assert.equal(h.find('button','Assign role').props.disabled,true);
  assert.equal(h.nodes().find(n=>n.type==='select'&&n.props.required).props.disabled,true);
  assert.equal(h.find('button','New restriction').props.disabled,true);
  assert.equal(h.find('button','Schedule').props.disabled,false);
  assert.equal(h.find('button','Refresh permissions').props.disabled,false);
 }
});
