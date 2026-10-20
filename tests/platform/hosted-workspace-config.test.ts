import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readHostedWorkspaceConfig} from '../../lib/platform/hosted-workspace-config.ts';
import {readLocalWorkspaceConfig} from '../../lib/platform/local-workspace-config.ts';
const project='abcdefghijklmnopqrst';
const env={ROSELAND_HOSTED_APP:'supabase',VERCEL:'1',VERCEL_ENV:'production',
  SUPABASE_PLATFORM_WORKFLOWS_ENABLED:'true',ROSELAND_APP_ORIGIN:'https://schedules.example.com',
  ROSELAND_SUPABASE_PROJECT_REF:project,SUPABASE_URL:`https://${project}.supabase.co`,
  SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',SUPABASE_SECRET_KEY:'sb_secret_fixture'};
const host='schedules.example.com';
test('hosted configuration returns only public fields and does not open the local review gate',()=>{
  const result=readHostedWorkspaceConfig(env,host);
  assert.deepEqual(result,{appOrigin:`https://${host}`,projectRef:project,supabaseUrl:env.SUPABASE_URL,
    anonymousKey:env.SUPABASE_PUBLISHABLE_KEY,accountOnboarding:true,liveDocumentProviders:true});
  assert.ok(!JSON.stringify(result).includes(env.SUPABASE_SECRET_KEY));
  assert.equal(readLocalWorkspaceConfig({...env,ROSELAND_LOCAL_WORKSPACE:'supabase'},host),null);
});
test('hosted configuration fails closed for missing flags, previews and local test settings',()=>{
  for(const [name,value] of Object.entries(env)) {
    assert.equal(readHostedWorkspaceConfig({...env,[name]:undefined},host),null,name);
    assert.ok(value);
  }
  for(const extra of [{VERCEL_ENV:'preview'},{VERCEL_ENV:'development'},{NETLIFY:'true'},
    {ROSELAND_LOCAL_ACCOUNTS:'supabase'},{ROSELAND_LOCAL_SUPABASE_URL:'http://127.0.0.1:56521'}])
    assert.equal(readHostedWorkspaceConfig({...env,...extra},host),null);
});
test('hosted configuration binds exact canonical origin and exact Supabase project',()=>{
  for(const h of [null,'attacker.example',host+'.attacker.example',host+':443','localhost:3532'])
    assert.equal(readHostedWorkspaceConfig(env,h),null);
  for(const origin of ['http://schedules.example.com','https://user@schedules.example.com',
    'https://schedules.example.com/path','https://schedules.example.com?x=1','https://schedules.example.com#x',
    'https://schedules.example.com:8443',' https://schedules.example.com'])
    assert.equal(readHostedWorkspaceConfig({...env,ROSELAND_APP_ORIGIN:origin},host),null);
  for(const url of ['http://127.0.0.1:56521','https://other.supabase.co',env.SUPABASE_URL+'/rest/v1',
    env.SUPABASE_URL+'.attacker.example',env.SUPABASE_URL+'?x=1'])
    assert.equal(readHostedWorkspaceConfig({...env,SUPABASE_URL:url},host),null);
});
test('rejects privileged browser keys and keys belonging to another project',()=>{
  for(const key of ['sb_secret_fixture','e30.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.fixture',''])
    assert.equal(readHostedWorkspaceConfig({...env,SUPABASE_PUBLISHABLE_KEY:key},host),null);
  const jwt=(claims:Record<string,string>)=>`e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;
  const legacy={...env,SUPABASE_SECRET_KEY:undefined,SUPABASE_SERVICE_ROLE_KEY:jwt({role:'service_role',iss:'supabase',ref:project})};
  assert.ok(readHostedWorkspaceConfig(legacy,host));
  for(const claims of [{role:'anon',iss:'supabase',ref:project},{role:'service_role',iss:'supabase-demo',ref:project},
    {role:'service_role',iss:'supabase',ref:'wrongproject'}])
    assert.equal(readHostedWorkspaceConfig({...legacy,SUPABASE_SERVICE_ROLE_KEY:jwt(claims)},host),null);
  assert.equal(readHostedWorkspaceConfig({...env,SUPABASE_SECRET_KEY:env.SUPABASE_PUBLISHABLE_KEY},host),null);
});
