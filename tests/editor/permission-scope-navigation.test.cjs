const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function harness(role='owner'){
 const values=[],refs=[];let slot=0,refSlot=0;
 const calls=[];const directory={productions:[{id:'production-1',name:'Production One'}],schedules:[{id:'schedule-1',name:'Day One',production:'production-1'}],members:[]};
 const workspace={session:{access_token:'test-only'},active:true,authNeeded:false,organization:{id:'organization-1',role},client:{rpc(name,args){calls.push({name,args});return{setHeader:async()=>({data:name==='schedule_permission_directory'?directory:{restrictions:[],effective:{read:true}},error:null})};}}};
 const mocks={react:{...React,useState(initial){const i=slot++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return[values[i],v=>{values[i]=typeof v==='function'?v(values[i]):v;}];},useRef(initial){const i=refSlot++;return refs[i]??(refs[i]={current:initial});}},'./LocalWorkspaceContext':{useLocalWorkspace:()=>workspace,useWorkspacePanelState:()=>{}},'@/app/local-workspace/workspace.module.css':{default:{}}};
 const output=ts.transpileModule(fs.readFileSync('components/local/LocalSchedulePermissions.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const module={exports:{}};vm.runInThisContext('(function(require,module,exports){'+output+'\n})')(name=>mocks[name]||require(name),module,module.exports);
 let tree;function render(){slot=0;refSlot=0;tree=module.exports.default();return tree;}
 function nodes(node=tree){if(!node||typeof node!=='object')return[];return[node,...React.Children.toArray(node.props?.children).flatMap(x=>nodes(x))];}
 const text=node=>typeof node==='string'?node:typeof node==='number'?String(node):React.Children.toArray(node?.props?.children).map(text).join('');
 const find=(type,label)=>nodes().find(n=>n.type===type&&text(n)===label);
 render();return{render,nodes,find,calls,async open(){tree.props.onToggle({currentTarget:{open:true}});await settle();render();}};
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
