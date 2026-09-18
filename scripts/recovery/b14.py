"""Fictional, owned-loopback, same-schema connected recovery rehearsal.

Full-state generations with ordered predecessor journals, not WAL/PITR. Secret
artifacts remain mode 0600 beneath a mode 0700 temporary directory. No hosted IO.
"""
import argparse, hashlib, json, os, re, subprocess, time, importlib.util
_spec=importlib.util.spec_from_file_location("structure",__file__.replace("b14.py","b14-structure.py"));_structure=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_structure)
from pathlib import Path
from sys import path as search_path
search_path.insert(0,str(Path(__file__).resolve().parents[1]/'migration'))
from recovery_contract import canonical, digest, require, InvalidRecovery
ROOT=Path('/private/tmp/roseland-b14-artifacts'); ROOT.mkdir(mode=0o700,exist_ok=True); os.chmod(ROOT,0o700)
ALLOWED={'roseland-b13-source','roseland-b14-destination-g1','roseland-b14-destination-g2'}
APPEND_ONLY={'public.schedule_versions','public.audit_events','private.migration_record_versions'}
def run(args,inp=None):
 r=subprocess.run(args,input=inp,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if r.returncode: raise RuntimeError(f'{args[0]} failed: '+r.stderr.decode()[-1800:])
 return r.stdout

def db(project):
 require(project in ALLOWED,'Unknown project');p=Path('/private/tmp')/project/'supabase';require(not(p/'.temp/project-ref').exists(),'Linked project refused');require(f'project_id = "{project}"' in(p/'config.toml').read_text(),'Project mismatch');return 'supabase_db_'+project

def sql(project,q,database='postgres'):
 return run(['docker','exec','-i',db(project),'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],q.encode()).decode().strip()
def js(project,q,database='postgres'):return json.loads(sql(project,q,database))
def save(p,data):
 with p.open('xb')as f:os.chmod(p,0o600);f.write(data)
def jwrite(p,data):save(p,(canonical(data)+'\n').encode())
def load(p):return json.loads(p.read_text())
def table_state(project,database='postgres'):
 names=js(project,"select coalesce(json_agg(n.nspname||'.'||c.relname order by 1),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not like 'pg_%' and n.nspname<>'information_schema'",database)
 result={}
 for name in sorted(names):
  require(re.fullmatch(r'[a-z_]+\.[a-z_0-9]+',name),'Unexpected identifier')
  result[name]=js(project,f"select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from {name} t",database)
 return result

def metadata(project,database='postgres'):
 q="""select jsonb_build_object(
 'extensions',(select jsonb_agg(jsonb_build_array(extname,extversion,n.nspname) order by extname)from pg_extension e join pg_namespace n on n.oid=e.extnamespace),
 'roles',(select jsonb_agg(to_jsonb(r)-'oid' order by rolname)from pg_authid r),
 'memberships',(select jsonb_agg(jsonb_build_array(a.rolname,b.rolname,c.rolname,m.admin_option,m.inherit_option,m.set_option) order by a.rolname,b.rolname)from pg_auth_members m join pg_roles a on a.oid=m.roleid join pg_roles b on b.oid=m.member join pg_roles c on c.oid=m.grantor),
 'relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'rls',c.relrowsecurity,'force',c.relforcerowsecurity)order by n.nspname,c.relname)from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%'and n.nspname<>'information_schema'),
 'schemas',(select jsonb_agg(jsonb_build_array(nspname,pg_get_userbyid(nspowner),nspacl)order by nspname)from pg_namespace where nspname not like 'pg_%'and nspname<>'information_schema'),
 'defaultAcl',(select jsonb_agg(jsonb_build_array(pg_get_userbyid(defaclrole),coalesce(n.nspname,''),defaclobjtype,defaclacl)order by r.rolname,n.nspname,defaclobjtype)from pg_default_acl d join pg_roles r on r.oid=d.defaclrole left join pg_namespace n on n.oid=d.defaclnamespace),
 'policies',(select jsonb_agg(to_jsonb(p)order by schemaname,tablename,policyname)from pg_policies p),
 'functions',(select jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_userbyid(p.proowner),p.proacl,p.proconfig,md5(pg_get_functiondef(p.oid)))order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not like 'pg_%'and n.nspname<>'information_schema'and p.prokind='f'),
 'sequences',(select jsonb_agg(to_jsonb(s)order by schemaname,sequencename)from pg_sequences s where schemaname not like 'pg_%'))"""
 value=js(project,q,database)
 # PostgreSQL may serialize equivalent ACL entries in a different order and omit
 # an explicit owner-only default. Compare effective privileges, never omit ACLs.
 for r in value['relations']:
  acl=r['acl']
  if r['kind'] in ['r','v','m','f','p'] and acl is None:acl=[r['owner']+'=arwdDxtm/'+r['owner']]
  r['acl']=sorted(acl)if acl is not None else None
 for r in value['schemas']:
  r[2]=sorted(r[2]if r[2]is not None else [r[1]+'=UC/'+r[1]])
 for r in value['functions']:
  r[4]=sorted(r[4])if r[4]is not None else None
 for r in value['defaultAcl']or[]:r[3]=sorted(r[3])
 return value

def supplemental(project):
 # pg_dump omits extension-owned alterations and bootstrap schema ACLs.
 rows=js(project,"set search_path=''; select coalesce(jsonb_agg(jsonb_build_object('signature',format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),'config',p.proconfig,'securityDefiner',p.prosecdef)),'[]')from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not like 'pg_%'and p.proconfig is not null")
 statements=[]
 for r in rows:
  statements.append(f"alter function {r['signature']} security "+('definer'if r['securityDefiner']else'invoker')+';')
  for setting in r['config']:
   k,v=setting.split('=',1);require(re.fullmatch(r'[a-z_.]+',k),'Unknown setting');v=v.replace("'","''")
   statements+= [f"select pg_catalog.set_config('{k}','{v}',false);",f"alter function {r['signature']} set {k} from current;"]
 grants=js(project,"select coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee)end,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'option',a.is_grantable)),'[]')from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner)))a where n.nspname not like 'pg_%'and n.nspname<>'information_schema'")
 for r in grants:
  ident=lambda v:'"'+v.replace('"','""')+'"'
  who='PUBLIC'if r['grantee']=='PUBLIC'else ident(r['grantee'])
  statements+= [f"set role {ident(r['grantor'])};",f"grant {r['privilege']} on schema {ident(r['schema'])} to {who}"+(' with grant option'if r['option']else'')+';',"reset role;"]
 return ('\n'.join(statements)+'\n').encode()

def freeze(project):
 for service in ['rest','auth','kong']:
  run(['docker','stop','supabase_'+service+'_'+project])
 # No external writer survives the owned service stop. Terminate any residual owned service transactions.
 sql(project,"select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and usename in ('authenticator','supabase_auth_admin');")
 require(sql(project,"select count(*) from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and usename in ('authenticator','supabase_auth_admin')")=='0','Drain incomplete')

def capture(project,name,previous=None):
 db(project);require(bool(re.fullmatch(r'[a-z][a-z0-9-]*',name)),'Invalid generation name');target=ROOT/name;target.mkdir(mode=0o700,exist_ok=False)
 # Require all internet-facing services stopped for a consistent multi-artifact snapshot.
 for svc in ['rest','auth','kong']:
  require(run(['docker','inspect','-f','{{.State.Running}}','supabase_'+svc+'_'+project]).strip()==b'false','Capture requires drained frozen services')
 users=js(project,"select coalesce(json_agg(email),'[]')from auth.users")
 require(all(re.fullmatch(r'b1[34]-[a-z-]+[a-f0-9-]+@example.test',email) for email in users),'Only dedicated fictional B13/B14 identities allowed')
 tables=table_state(project);meta=metadata(project)
 jwrite(target/'structure.json',js(project,_structure.QUERY))
 config=Path('/private/tmp')/project/'supabase/config.toml';save(target/'config.toml',config.read_bytes())
 templates=Path('/private/tmp')/project/'supabase/account-templates'
 for p in templates.rglob('*'):
  if p.is_file():save(target/('template-'+p.name),p.read_bytes())
 services={s:json.loads(run(['docker','inspect','supabase_'+s+'_'+project]))[0] for s in ['db','auth','rest','kong','inbucket']}
 jwrite(target/'services.json',services)
 status=load(Path('/private/tmp')/(project+'-live-status.json'))
 require(all(k in status for k in ['API_URL','ANON_KEY','SERVICE_ROLE_KEY']),'Capture live service credentials before freeze')
 jwrite(target/'status.json',status)
 save(target/'database.sql',run(['docker','exec',db(project),'pg_dump','-U','supabase_admin','-d','postgres','--format=plain']))
 save(target/'supplement.sql',supplemental(project))
 save(target/'roles.sql',run(['docker','exec',db(project),'pg_dumpall','-U','supabase_admin','--roles-only']))
 settings=js(project,"select coalesce(jsonb_agg(jsonb_build_object('role',r.rolname,'database',d.datname,'settings',s.setconfig)order by r.rolname,d.datname),'[]')from pg_db_role_setting s join pg_roles r on r.oid=s.setrole left join pg_database d on d.oid=s.setdatabase")
 jwrite(target/'settings.json',settings);jwrite(target/'tables.json',tables);jwrite(target/'metadata.json',meta)
 entries={p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(target.iterdir())}
 manifest={'format':'b14-connected-full-state-v1','project':project,'name':name,'previous':previous,'code':run(['git','rev-parse','HEAD']).decode().strip(),'entries':entries,'dataDigest':digest(tables),'metadataDigest':digest(meta),'created':time.time()}
 manifest['sha256']=digest(manifest);jwrite(target/'manifest.json',manifest)
 if previous:
  before=verify(previous);old=load(ROOT/previous/'tables.json');changes=[]
  for table in sorted(set(old)|set(tables)):
   if table in APPEND_ONLY:require(all(r in tables.get(table,[])for r in old.get(table,[])),'Immutable history rewritten')
   if old.get(table)!=tables.get(table):changes.append({'table':table,'before':digest(old.get(table)),'after':digest(tables.get(table)),'beforeCount':len(old.get(table,[])),'afterCount':len(tables.get(table,[]))})
  journal={'format':'b14-full-state-journal-v1','before':before['sha256'],'after':manifest['sha256'],'changes':changes};journal['sha256']=digest(journal);jwrite(target/'journal.json',journal)
 return manifest

def verify(name):
 require(bool(re.fullmatch(r'[a-z][a-z0-9-]*',name)),'Invalid generation name')
 p=ROOT/name;v=load(p/'manifest.json');require(v['sha256']==digest({k:x for k,x in v.items()if k!='sha256'}),'Manifest hash mismatch')
 for n,h in v['entries'].items():require((p/n).is_file()and hashlib.sha256((p/n).read_bytes()).hexdigest()==h,'Missing or changed '+n)
 require('database.sql'in v['entries']and 'roles.sql'in v['entries']and 'settings.json'in v['entries']and 'services.json'in v['entries'],'Incomplete recovery boundary')
 settings=load(p/'settings.json');require(any('pgrst.db_pre_request=public.check_application_session'in s['settings']for s in settings),'Required admission hook missing')
 return v

def journal_chain(names):
 before=None
 for name in names:
  m=verify(name)
  if before:
   j=load(ROOT/name/'journal.json');require(j['sha256']==digest({k:v for k,v in j.items()if k!='sha256'}),'Journal digest mismatch');require(j['before']==before['sha256']and j['after']==m['sha256']and m['previous']==before['name'],'Wrong/reordered predecessor')
  else:require(m['previous'] is None,'Baseline required')
  if before:
   old=load(ROOT/before['name']/'tables.json');new=load(ROOT/name/'tables.json');expected=[]
   for table in sorted(set(old)|set(new)):
    if table in APPEND_ONLY:require(all(r in new.get(table,[])for r in old.get(table,[])),'Immutable history rewritten')
    if old.get(table)!=new.get(table):expected.append({'table':table,'before':digest(old.get(table)),'after':digest(new.get(table)),'beforeCount':len(old.get(table,[])),'afterCount':len(new.get(table,[]))})
   require(j['changes']==expected,'Journal changes incomplete or mismatched')
  before=m
 return before

def role_sql(project,name):
 # Fresh same-image stacks have standard roles. Restore every captured role attribute/password.
 text=(ROOT/name/'roles.sql').read_text()
 text=re.sub(r'^CREATE ROLE ([^;]+);$',r'DO $$ BEGIN CREATE ROLE \1; EXCEPTION WHEN duplicate_object THEN NULL; END $$;',text,flags=re.M)
 sql(project,text)

def restore(project,names,fail=False):
 require(project in {'roseland-b14-destination-g1','roseland-b14-destination-g2'},'Restore target must be a dedicated destination, never the source')
 m=journal_chain(names);name=names[-1];db(project)
 state_path=ROOT/(project+'-receipt.json')
 if state_path.exists():
  receipt=load(state_path);current=table_state(project)
  require(digest(current)==receipt['dataDigest'],'Destination contains newer state; restore refused')
  require(receipt['manifest']==m['sha256'],'Destination already restored from another generation')
  return {'retry':'exact receipt recovered','durationSeconds':0}
 freeze(project);begin=time.monotonic();role_sql(project,name)
 require(sql(project,"select count(*)from pg_database where datname='b14_stage'")=='0','Stage already exists; preserve and inspect failed generation')
 sql(project,"create database b14_stage template template0;")
 payload=(ROOT/name/'database.sql').read_bytes()
 if (ROOT/name/'supplement.sql').exists():payload+=b'\n'+(ROOT/name/'supplement.sql').read_bytes()
 if fail:payload+=b"\nDO $$ BEGIN RAISE EXCEPTION 'B14 injected partial-load failure'; END $$;\n"
 r=subprocess.run(['docker','exec','-i',db(project),'psql','-Xq','-1','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d','b14_stage'],input=payload,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 save(ROOT/(project+('-injected'if fail else '')+'-restore-'+str(int(time.time()))+'.log'),r.stdout+r.stderr)
 if r.returncode:
  count=sql(project,"select count(*)from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('auth','private','public')and c.relkind='r'",'b14_stage')
  failed='failed_'+str(int(time.time()));sql(project,f'alter database b14_stage rename to {failed};')
  if fail:require(b'B14 injected partial-load failure' in r.stderr,'Restore failed before planned injection');require(count=='0','Partial restore did not roll back');return {'injectedFailure':True,'atomicRollback':True,'retainedDatabase':failed}
  raise RuntimeError('Restore failed; private diagnostic retained')
 got=table_state(project,'b14_stage');want=load(ROOT/name/'tables.json');require(got==want,'Restored row reconciliation failed')
 if (ROOT/name/'structure.json').exists():require(_structure.logical(js(project,_structure.QUERY,'b14_stage'))==_structure.logical(load(ROOT/name/'structure.json')),'Column/constraint/index/trigger structure mismatch')
 meta=metadata(project,'b14_stage');require(meta==load(ROOT/name/'metadata.json'),'Restored metadata/ACL/ownership reconciliation failed')
 # Preserve the pristine baseline DB for inspection; only an isolated destination may promote.
 sql(project,"select pg_terminate_backend(pid)from pg_stat_activity where datname='postgres'and pid<>pg_backend_pid();")
 # Rename from template1, never delete an existing database.
 sql(project,'alter database postgres rename to b14_pristine;','template1');sql(project,'alter database b14_stage rename to postgres;','template1')
 for item in load(ROOT/name/'settings.json'):
  for setting in item['settings']:
   key,value=setting.split('=',1);require(re.fullmatch(r'[a-z_.]+',key),'Unexpected role setting')
   role=item['role'].replace('"','""');suffix=' in database postgres'if item['database']else''
   sql(project,f'''begin; select pg_catalog.set_config('{key}','{value.replace("'","''")}',false); alter role "{role}"{suffix} set {key} from current; commit;''')
 receipt={'manifest':m['sha256'],'dataDigest':digest(want),'metadataDigest':digest(meta),'durationSeconds':round(time.monotonic()-begin,3),'state':'reconciled-frozen'};jwrite(state_path,receipt)
 return receipt

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('action',choices=['freeze','capture','restore']);p.add_argument('project');p.add_argument('names',nargs='*');p.add_argument('--fail',action='store_true');a=p.parse_args()
 if a.action=='freeze':freeze(a.project);print('Frozen and drained '+a.project)
 elif a.action=='capture':m=capture(a.project,a.names[0],a.names[1]if len(a.names)>1 else None);print(json.dumps({k:m[k]for k in ['name','sha256','dataDigest','metadataDigest']}))
 else:print(json.dumps(restore(a.project,a.names,a.fail)))
