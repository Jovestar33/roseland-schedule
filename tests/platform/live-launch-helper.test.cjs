const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
test('private launch review rejects changed sources and plans before credentials or network access',()=>{
 const code=`import pathlib,tempfile,hashlib,json
ns={'__file__':str(pathlib.Path('scripts/hosting/launch-trial-import.py').resolve()),'__name__':'launch_test'}
exec(compile(pathlib.Path(ns['__file__']).read_text(),ns['__file__'],'exec'),ns)
with tempfile.TemporaryDirectory() as tmp:
 root=pathlib.Path(tmp);ns['ROOT']=root;source=root/'source.sql';source.write_text('reviewed');plan=root/'plan.json';plan.write_text('{}')
 review={'format':'roseland.reviewed-live-import.v1','project':ns['PROJECT'],'rehearsalPassed':True,'sources':{'source.sql':ns['sha'](source)},'plan':str(plan),'planFileSha256':ns['sha'](plan),'migrationPlan':{'appliedCount':56,'pendingCount':4}}
 assert ns['validate_review'](review)=={}
 source.write_text('changed')
 try:ns['validate_review'](review);raise AssertionError('changed source accepted')
 except RuntimeError:pass
 source.write_text('reviewed');plan.write_text('{"changed":true}')
 try:ns['validate_review'](review);raise AssertionError('changed plan accepted')
 except RuntimeError:pass
`;
 const result=spawnSync('python3',['-c',code],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});

test('bridge input rejects common paste mistakes without exposing or changing the secret',()=>{
 const code=`import pathlib
ns={'__file__':str(pathlib.Path('scripts/hosting/launch-trial-import.py').resolve()),'__name__':'launch_test'}
exec(compile(pathlib.Path(ns['__file__']).read_text(),ns['__file__'],'exec'),ns)
f=ns['validate_bridge_secret']
for value in ['x'*32,'x'*512,'A!9_'*16]:assert f(value)==value
for value in ['', 'ROSELAND_TRIAL_SYNC_BRIDGE_SECRET','x'*31,'x'*513,' '+ 'x'*32,'x'*32+'\\n','x'*32+'é']:
 try:f(value);raise AssertionError('invalid credential accepted')
 except RuntimeError as e:
  assert not value or value not in str(e), 'credential exposed in error'
`;
 const result=spawnSync('python3',['-c',code],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
});
