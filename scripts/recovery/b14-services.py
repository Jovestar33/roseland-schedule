"""Reconstitute only owned fictional API services from private captured config."""
import importlib.util,json,re,subprocess,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('b14',Path(__file__).with_name('b14.py'));b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
project,name=sys.argv[1:3];b.db(project);m=b.verify(name);root=b.ROOT/name
receipt=b.load(b.ROOT/(project+'-receipt.json'));b.require(receipt['manifest']==m['sha256'],'Wrong reconciled generation')
b.require(b.digest(b.table_state(project))==receipt['dataDigest'],'Post-reconcile writes: activation refused')
b.require(b.digest(b.metadata(project))==receipt['metadataDigest'],'Grants or schema changed: activation refused')
currentSettings=b.js(project,"select coalesce(jsonb_agg(jsonb_build_object('role',r.rolname,'database',d.datname,'settings',s.setconfig)),'[]')from pg_db_role_setting s join pg_roles r on r.oid=s.setrole left join pg_database d on d.oid=s.setdatabase where d.datname=current_database()or s.setdatabase=0")
def settingsKey(rows):return sorted((r['role'],r['database']or'',tuple(sorted(r['settings'])))for r in rows if r['database']in[None,'postgres'])
b.require(settingsKey(currentSettings)==settingsKey(b.load(root/'settings.json')),'Role/database configuration mismatch')
if (root/'structure.json').exists():b.require(b._structure.logical(b.js(project,b._structure.QUERY))==b._structure.logical(b.load(root/'structure.json')),'Logical structure mismatch')
services=b.load(root/'services.json');source=m['project'];sourceport=563 if source=='roseland-b13-source'else 564;destport=564 if project.endswith('g1')else 565;srcapp=3455 if source=='roseland-b13-source'else 3465;dstapp=3465 if project.endswith('g1')else 3475
status=b.load(root/'status.json');b.require(all(status.get(k)for k in ['API_URL','ANON_KEY','SERVICE_ROLE_KEY']),'Missing API key configuration')
for svc,keys in {'auth':['GOTRUE_JWT_KEYS','GOTRUE_JWT_SECRET','GOTRUE_DB_DATABASE_URL'],'rest':['PGRST_JWT_SECRET','PGRST_DB_URI']}.items():
 env=dict(x.split('=',1)for x in services[svc]['Config']['Env']);b.require(all(env.get(k)for k in keys),'Missing required service auth configuration')
hook=b.sql(project,"select setconfig::text from pg_db_role_setting where setdatabase=(select oid from pg_database where datname='postgres')and setrole=(select oid from pg_roles where rolname='authenticator')")
b.require('pgrst.db_pre_request=public.check_application_session'in hook,'Missing session admission hook')
def mapped(s):
 return s.replace(source,project).replace(':'+str(sourceport)+'21',':'+str(destport)+'21').replace(':'+str(sourceport)+'22',':'+str(destport)+'22').replace(':'+str(sourceport)+'24',':'+str(destport)+'24').replace(':'+str(srcapp),':'+str(dstapp))
report=[]
for svc in ['auth','rest','kong']:
 old='supabase_'+svc+'_'+project;current=json.loads(b.run(['docker','inspect',old]))[0];b.require(not current['State']['Running'],'Destination must remain frozen')
 src=services[svc];b.require(src['Config']['Image']==current['Config']['Image'],'Service image mismatch')
 network=next(iter(current['NetworkSettings']['Networks']));stamp=str(int(time.time()));oldname=old+'_b14_pristine_'+stamp;b.run(['docker','rename',old,oldname]);envfile=b.ROOT/(project+'-'+svc+'-'+stamp+'.env');b.save(envfile,('\n'.join(mapped(x)for x in src['Config']['Env'])+'\n').encode())
 args=['docker','create','--name',old,'--network',network,'--env-file',str(envfile)]
 for port,bindings in (current['HostConfig']['PortBindings']or{}).items():
  for binding in bindings or[]:args+=['-p','127.0.0.1:'+binding['HostPort']+':'+port]
 for mount in current['Mounts']:
  b.require(mount['Type']=='bind','Unexpected service volume');args+=['--mount',f"type=bind,source={mount['Source']},target={mount['Destination']}"+(',readonly'if not mount['RW']else'')]
 entry=src['Config']['Entrypoint']or[]
 if entry:args+=['--entrypoint',entry[0]]
 args+=[src['Config']['Image']]+[mapped(x)for x in entry[1:]]+[mapped(x)for x in(src['Config']['Cmd']or[])]
 b.run(args);actual=json.loads(b.run(['docker','inspect',old]))[0]
 b.require(actual['Config']['Env']==[mapped(x)for x in src['Config']['Env']],'Service environment reconciliation failed')
 b.require(actual['Config']['Cmd']==[mapped(x)for x in (entry[1:]+(src['Config']['Cmd']or[]))],'Entrypoint/command reconciliation failed')
 report.append({'service':svc,'image':src['Config']['Image'],'environmentHash':b.digest(actual['Config']['Env']),'sourceHash':b.digest(src['Config']['Env']),'mappedOrigins':True})
# Credentials for an app launcher/readback; keys stay exactly captured, endpoints explicitly remapped.
status={k:mapped(v)if isinstance(v,str)else v for k,v in status.items()};statuspath=Path('/private/tmp')/(project+'-live-status.json')
if statuspath.exists():b.require(b.load(statuspath)==status,'Service access configuration changed unexpectedly')
else:b.jwrite(statuspath,status)
b.jwrite(b.ROOT/(project+'-activation-'+str(int(time.time()))+'.json'),{'generation':m['sha256'],'services':report,'gates':['rows','schema/roles/grants','hook','secret config','image match'],'approvedAt':time.time()})
b.run(['docker','start']+['supabase_'+s+'_'+project for s in ['auth','rest','kong']]);print(json.dumps({'activated':project,'gatesPassed':True,'services':report}))
