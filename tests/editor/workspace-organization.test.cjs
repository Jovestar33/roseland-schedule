const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const file='components/local/WorkspaceOrganizationContext.tsx';
const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const mod={exports:{}};vm.runInThisContext('(function(require,module,exports){'+code+'\n})')(name=>name.endsWith('.css')?{default:{}}:require(name),mod,mod.exports);
const component=mod.exports.default,one={id:'org-a',name:'Fictional Studio A',role:'member'},two={id:'org-b',name:'Fictional Studio B',role:'member'};
const props={organizations:[one],current:one,state:'ready',more:false,disabled:false,onChange:()=>{},onRetry:()=>{},onMore:()=>{}};
const render=extra=>renderToStaticMarkup(React.createElement(component,{...props,...extra}));
test('only resolved single-organization access is presented as static identity',()=>{
 assert.match(render({}),/Fictional Studio A/);assert.doesNotMatch(render({}),/<select/);
 for(const state of ['loading','error']){const html=render({state});assert.doesNotMatch(html,/Fictional Studio A|<select/);assert.match(html,/role="status"/);}
 assert.match(render({organizations:[],current:null}),/No organization access yet/);
});
test('multiple and paginated memberships retain a labeled switcher and current scope',()=>{
 const html=render({organizations:[one,two]});assert.match(html,/aria-label="Switch organization"/);assert.match(html,/value="org-a" selected/);assert.match(html,/Fictional Studio B/);
 assert.match(render({more:true}),/<select/);assert.match(render({more:true}),/More organizations/);
 assert.match(render({organizations:[two],current:one}),/value="org-a" selected/);
 assert.match(render({organizations:[one,two],disabled:true}),/<select[^>]*disabled/);
});
test('switch selection forwards the organization identity without mutating memberships',()=>{
 let chosen=null;const tree=component({...props,organizations:[one,two],onChange:id=>{chosen=id;}});
 const select=tree.props.children[0].props.children[1];select.props.onChange({target:{value:'org-b'}});
 assert.equal(chosen,'org-b');assert.equal(one.id,'org-a');assert.equal(props.current,one);
});
