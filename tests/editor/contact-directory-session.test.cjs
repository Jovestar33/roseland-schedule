const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
// Execute the editor's actual memo expression. The IO is stubbed; identity and
// current-session checks are the production code, including its dependencies.
function harness(){
 const path='app/local-schedule/LocalScheduleClient.tsx',source=ts.createSourceFile(path,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let initializer;function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='contactDirectory')initializer=n.initializer;ts.forEachChild(n,visit);}visit(source);assert.ok(initializer);
 const js=ts.transpileModule('result = '+initializer.getText(source),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 let memo,dependencies;const document={documentSession:1},context={result:null,client:{},controller:{record:{id:'schedule-1'}},documentSession:1,session:{user:{id:'actor-1'},access_token:'token-1'},active:true,recordInScope:true,ready:true,permission:{read:true,allowed:true},activeRef:{current:true},accountRef:{current:'actor-1'},sessionRef:{current:{access_token:'token-1'}},permissionRef:{current:{read:true}},useScheduleStore:{getState:()=>document},createContactDirectoryRepository:io=>io,useMemo(fn,deps){if(!dependencies||deps.some((d,i)=>!Object.is(d,dependencies[i]))){memo=fn();dependencies=deps;}return memo;}};
 vm.createContext(context);return {context,document,render(){vm.runInContext(js,context);return context.result;}};
}
test('unchanged permission and window-focus refreshes retain the contact form session',()=>{
 const h=harness(),first=h.render();assert.ok(first.current());
 for(let i=0;i<4;i++){h.context.permission={read:true,allowed:true};h.context.permissionRef.current=h.context.permission;assert.equal(h.render(),first);}
 // Editing rights are separately enforced by readOnly; a change does not erase
 // typed details while read access remains available.
 h.context.permission={read:true,allowed:false};h.context.permissionRef.current=h.context.permission;assert.equal(h.render(),first);
});
test('account, document and access changes still invalidate the contact session',()=>{
 const h=harness(),first=h.render();h.context.permission={read:false};h.context.permissionRef.current=h.context.permission;
 assert.equal(h.render(),null);assert.equal(first.current(),false);
 h.context.permission={read:true};h.context.permissionRef.current=h.context.permission;const restored=h.render();assert.notEqual(restored,first);assert.ok(restored.current());
 h.document.documentSession=2;h.context.documentSession=2;const nextDocument=h.render();assert.notEqual(nextDocument,restored);assert.equal(restored.current(),false);
 h.context.session={user:{id:'actor-2'},access_token:'token-2'};h.context.accountRef.current='actor-2';h.context.sessionRef.current=h.context.session;
 assert.notEqual(h.render(),nextDocument);assert.equal(nextDocument.current(),false);
 h.context.active=false;h.context.activeRef.current=false;assert.equal(h.render(),null);
});
