const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react');
const {sourceLoader}=require('./source-loader.cjs');
const members=[{name:'Alex',email:'alex@example.test'},{name:'Jordan',email:'jordan@example.test'}];
function nodes(n){return Array.isArray(n)?n.flatMap(nodes):n?.props?[n,...nodes(n.props.children),...nodes(n.props.footer)]:[];}
function text(n){return Array.isArray(n)?n.map(text).join(''):typeof n==='string'||typeof n==='number'?String(n):n?.props?text(n.props.children):'';}
function fixture(savedGroups=[]){
 const hooks=[],effects=[];let cursor=0,pending=false,tree,open=true,access,scope='schedule-1',id=0,fetchHandler,serverStates={};const calls=[];
 const saved=()=>({id:scope,display_name:'Example',document_version:4,document:{meta:{},rows:[]}});
 const initial={members,review:true,source:saved()};
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'actor'},access_token:'test-token'}}})},rpc:async(fn,args)=>{calls.push({fn,args});if(fn==='list_schedule_email_groups')return{data:savedGroups};if(fn==='list_schedule_email_batches')return{data:[]};if(fn==='schedule_contact_directory')return{data:{entries:[]}};if(fn==='prepare_schedule_email_batch')return{data:{id:args.request_id,edition:1,recipients:args.recipient_requests.map(r=>({id:r.id,state:serverStates[r.id]??'not_sent'}))}};throw Error('Unexpected RPC '+fn);}};
 function updateAccess(){access={actor:'actor',schedule:scope,enabled:true,client,getSource:saved,hasDraft:()=>false};}updateAccess();
 const react={...React,useState(arg){const i=cursor++;if(!(i in hooks))hooks[i]=arg?.__state?(Object.hasOwn(initial,arg.key)?initial[arg.key]:typeof arg.initial==='function'?arg.initial():arg.initial):typeof arg==='function'?arg():arg;return[hooks[i],value=>{const next=typeof value==='function'?value(hooks[i]):value;if(next!==hooks[i]){hooks[i]=next;pending=true;}}];},useRef(v){const i=cursor++;return hooks[i]??(hooks[i]={current:v});},useEffect(fn,deps){const i=cursor++,old=hooks[i];if(!old||deps.some((v,k)=>v!==old.deps[k]))effects.push(()=>{old?.cleanup?.();hooks[i]={deps,cleanup:fn()};});}};
 const tag=context=>node=>ts.visitNode(node,function visit(n){if(ts.isVariableDeclaration(n)&&ts.isArrayBindingPattern(n.name)&&n.initializer&&ts.isCallExpression(n.initializer)&&n.initializer.expression.getText()==='useState'){return ts.factory.updateVariableDeclaration(n,n.name,n.exclamationToken,n.type,ts.factory.updateCallExpression(n.initializer,n.initializer.expression,n.initializer.typeArguments,[ts.factory.createObjectLiteralExpression([ts.factory.createPropertyAssignment('__state',ts.factory.createTrue()),ts.factory.createPropertyAssignment('key',ts.factory.createStringLiteral(n.name.elements[0].name.text)),ts.factory.createPropertyAssignment('initial',n.initializer.arguments[0])])]))}return ts.visitEachChild(n,visit,context)});
 const code=ts.transpileModule(fs.readFileSync('components/local/ScheduleEmail.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022},transformers:{before:[tag]}}).outputText;
 const mocks={react,'@/components/modals/Modal':{default:()=>null},'./CallSheetPublishingContext':{useCallSheetPublishing:()=>access},'@/lib/platform/document-email':sourceLoader()('lib/platform/document-email.ts'),'@/lib/platform/client-links':{captureClientLink:async()=>({request:'recipient-'+(++id),hash:'hash-'+id,token:'token-'+id})}};
 const mod={exports:{}};vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{crypto:require('node:crypto').webcrypto,AbortSignal,fetch:async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return fetchHandler(url,init);}})(name=>mocks[name]??require(name),mod,mod.exports);
 function render(){let n=0;do{assert.ok(n++<30);cursor=0;pending=false;tree=mod.exports.default({open,onClose(){open=false;}});effects.splice(0).forEach(fn=>fn());}while(pending);return tree;}
 async function flush(){for(let n=0;n<6;n++){await new Promise(setImmediate);render();}}
 render();return{flush,render,get tree(){return tree;},calls,states:serverStates,setFetch(fn){fetchHandler=fn;},button(label){return nodes(tree).find(n=>n.type==='button'&&text(n)===label);},async prepare(){await flush(); // Opening loads source and intentionally keeps the preseeded review after setting identity.
 // Drive the real group/preview controls instead of depending on preseeded source state.
 assert.equal(nodes(tree).filter(n=>n.type==='select').length,0);assert.equal(nodes(tree).filter(n=>n.type==='legend'&&text(n)==='New recipient group').length,1);
 // Add recipients through the actual form controls.
 for(const person of members){const labels=nodes(tree).filter(n=>n.type==='label');const name=labels.find(n=>text(n)==='Name'),email=labels.find(n=>text(n)==='Email');nodes(name).find(n=>n.type==='input').props.onChange({target:{value:person.name}});nodes(email).find(n=>n.type==='input').props.onChange({target:{value:person.email}});render();this.button('Add recipient').props.onClick();render();}
 this.button('Preview email').props.onClick();render();},reopen(){open=false;render();open=true;render();},switchScope(next){scope=next;updateAccess();render();}};
}
const accepted=()=>({ok:true,status:200,json:async()=>({state:'accepted'})});
test('stop remaining completes only the current email; continuing reuses the same attempt without resending it',async()=>{
 const f=fixture();await f.prepare();let finish;f.setFetch(async(_,init)=>new Promise(resolve=>{finish=()=>{f.states[JSON.parse(init.body).link]='accepted';resolve(accepted());};}));
 const send=f.button('Send to 2 people');assert.ok(send);send.props.onClick();send.props.onClick();await f.flush();assert.equal(f.calls.filter(c=>c.fn==='prepare_schedule_email_batch').length,1);assert.equal(f.calls.filter(c=>c.url).length,1);
 f.button('Stop remaining').props.onClick();finish();await f.flush();assert.ok(f.button('Continue this send'));assert.equal(f.calls.filter(c=>c.url).length,1);
 f.setFetch(async(_,init)=>{f.states[JSON.parse(init.body).link]='accepted';return accepted();});f.button('Continue this send').props.onClick();await f.flush();
 const requests=f.calls.filter(c=>c.fn==='prepare_schedule_email_batch');assert.equal(requests[0].args.request_id,requests[1].args.request_id);assert.equal(f.calls.filter(c=>c.url).length,2);assert.notEqual(f.calls.filter(c=>c.url)[0].body.link,f.calls.filter(c=>c.url)[1].body.link);assert.equal(f.button('Continue this send'),undefined);
});
test('an uncertain delivery is never retried by closing and reopening the email panel',async()=>{
 const f=fixture();await f.prepare();f.setFetch(async()=>{throw Error('Connection lost after request');});f.button('Send to 2 people').props.onClick();await f.flush();assert.equal(f.calls.filter(c=>c.url).length,2);assert.match(text(f.tree),/Check delivery/);f.reopen();await f.flush();assert.equal(f.calls.filter(c=>c.url).length,2);assert.equal(f.button('Continue this send'),undefined);
});
test('changing schedules during an email stops the remaining recipients and discards old presentation state',async()=>{
 const f=fixture();await f.prepare();let finish;f.setFetch(async()=>new Promise(resolve=>finish=()=>resolve(accepted())));f.button('Send to 2 people').props.onClick();await f.flush();assert.equal(f.calls.filter(c=>c.url).length,1);f.switchScope('schedule-2');finish();await f.flush();assert.equal(f.calls.filter(c=>c.url).length,1);assert.doesNotMatch(text(f.tree),/Sending results/);
});

function option(f,label){const node=nodes(f.tree).find(n=>n.type==='label'&&text(n)===label);return node&&nodes(node).find(n=>n.type==='input');}
function chooseDocument(f,label){option(f,label).props.onChange();f.render();}
const contactsLabel='Include phone numbers and email addresses on the call sheet';
test('schedule-only sending excludes private contacts even when the call-sheet preference was checked',async()=>{
 const f=fixture();await f.prepare();f.button('Back').props.onClick();f.render();
 option(f,contactsLabel).props.onChange({target:{checked:true}});f.render();chooseDocument(f,'Schedule');
 assert.equal(option(f,contactsLabel),undefined);assert.equal(option(f,'Include full shooting descriptions'),undefined);
 f.button('Preview email').props.onClick();f.render();assert.match(text(f.tree),/Personal phone numbers and emails are omitted/);
 let finish;f.setFetch(async(_,init)=>new Promise(resolve=>{finish=()=>{f.states[JSON.parse(init.body).link]='accepted';resolve(accepted());};}));f.button('Send to 2 people').props.onClick();await f.flush();
 f.button('Stop remaining').props.onClick();finish();await f.flush();f.setFetch(async()=>accepted());f.button('Continue this send').props.onClick();await f.flush();
 const prepared=f.calls.filter(c=>c.fn==='prepare_schedule_email_batch');assert.equal(prepared.length,2);for(const call of prepared){assert.equal(call.args.document_selection,'schedule');assert.equal(call.args.include_contacts,false);assert.equal(call.args.full_details,true);}
});
test('switching document types retains the explicit call-sheet preferences without applying them to schedule-only',async()=>{
 const f=fixture();await f.prepare();f.button('Back').props.onClick();f.render();
 option(f,contactsLabel).props.onChange({target:{checked:true}});f.render();chooseDocument(f,'Call sheet');option(f,'Include full shooting descriptions').props.onChange({target:{checked:true}});f.render();
 chooseDocument(f,'Schedule');assert.equal(option(f,contactsLabel),undefined);chooseDocument(f,'Schedule & call sheet');assert.equal(option(f,contactsLabel).props.checked,true);chooseDocument(f,'Call sheet');assert.equal(option(f,'Include full shooting descriptions').props.checked,true);
 f.button('Preview email').props.onClick();f.render();assert.match(text(f.tree),/included on the call sheet/);f.setFetch(async()=>accepted());f.button('Send to 2 people').props.onClick();await f.flush();const prepared=f.calls.find(c=>c.fn==='prepare_schedule_email_batch');assert.equal(prepared.args.document_selection,'call_sheet');assert.equal(prepared.args.include_contacts,true);assert.equal(prepared.args.full_details,true);
});

test('saved recipient groups remain selectable while creating or editing a group',async()=>{
 const f=fixture([{id:'crew',name:'Core crew',recipients:members,version:1},{id:'client',name:'Client team',recipients:[{name:'Client Example',email:'client@example.test'}],version:1}]);await f.flush();
 const chooser=()=>nodes(f.tree).find(n=>n.type==='select');
 assert.match(text(f.tree),/Saved recipient group/);assert.ok(chooser());
 chooser().props.onChange({target:{value:'crew'}});f.render();assert.ok(f.button('Edit group'));assert.match(text(f.tree),/Recipients · 2/);
 f.button('New group').props.onClick();f.render();assert.ok(chooser());assert.match(text(f.tree),/New recipient group/);
 chooser().props.onChange({target:{value:'client'}});f.render();assert.doesNotMatch(text(f.tree),/New recipient group/);assert.match(text(f.tree),/Recipients · 1/);assert.match(text(f.tree),/client@example.test/);assert.doesNotMatch(text(f.tree),/alex@example.test/);
 f.button('Edit group').props.onClick();f.render();assert.ok(chooser());
 chooser().props.onChange({target:{value:'crew'}});f.render();f.button('Preview email').props.onClick();f.render();assert.ok(f.button('Send to 2 people'));
 assert.equal(f.calls.filter(c=>c.url||c.fn==='save_schedule_email_group'||c.fn==='prepare_schedule_email_batch').length,0);
});
