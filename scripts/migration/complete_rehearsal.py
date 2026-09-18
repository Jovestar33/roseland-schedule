"""B12 all-store synthetic rehearsal, restricted to the owned 561xx test stack.
Never reads a provider or the isolated 562xx review database. Each run creates a
new fictional organization and retains its original inputs/checkpoints in /tmp.
"""
import base64, copy, hashlib, json, os, subprocess, tempfile, uuid
from pathlib import Path
from capture_contract import capture, build_plan, canonical, digest, BROWSER, Invalid, strict_json
from related_fixtures import fixtures
ROOT=Path(__file__).resolve().parents[2]
STACK=Path('/private/tmp/roseland-b08-20260917');PROJECT='roseland-b08-20260917'
assert not (STACK/'supabase/.temp/project-ref').exists()
assert 'project_id = "'+PROJECT+'"' in (STACK/'supabase/config.toml').read_text()
private=json.loads(Path('/private/tmp/roseland-b11-fixtures.json').read_text());assert private['project']==PROJECT
actor=private['owner']['id'];org=str(uuid.uuid4());env='b12-fictional-'+org
out=Path(tempfile.mkdtemp(prefix='roseland-b12-',dir='/private/tmp'));os.chmod(out,0o700)
checks=[];failures=[]
def check(v,label):
 assert v,label
 checks.append(label);print('PASS '+label,flush=True)
def q(v):return "'"+str(v).replace("'","''")+"'"
def j(v):return q(canonical(v))+'::jsonb'
claims=json.loads(Path('/private/tmp/roseland-b12-auth-claims.json').read_text());assert claims['sub']==actor and claims['aal']=='aal2'
helpers=(ROOT/'scripts/migration/complete_import.sql').read_text()
def sql(query, helper=True):
 r=subprocess.run(['docker','exec','-i','supabase_db_'+PROJECT,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],input=(helpers if helper else '')+'do $auth$ begin perform set_config('+q('request.jwt.claims')+','+q(canonical(claims))+',false);end $auth$;'+query,text=True,capture_output=True)
 if r.returncode:raise RuntimeError(r.stderr.strip())
 return r.stdout.strip()
def result(query):return json.loads(sql(query).splitlines()[-1])
def state():return result('select pg_temp.capture_state('+q(org)+'::uuid);')
def imported(p, fail=None):return result('begin;select pg_temp.import_capture('+j(p)+','+('null' if fail is None else q(fail))+');commit;')
def refused(fn,label,contains=None):
 try:fn()
 except (Invalid,ValueError,RuntimeError,KeyError,TypeError) as error:
  if contains:assert contains in str(error),(label,str(error))
  failures.append({'check':label,'error':str(error)});check(True,label);return
 raise AssertionError('Did not reject: '+label)
def write_source(path,latest=False):
 path.mkdir();base,delta=fixtures();blobs=delta if latest else base
 for b in blobs:
  if b['store']=='cms':b['value'].pop('logo',None);b['value']['colors']={'--pink':'#334455'};b['value']['labels']={'hdrTitle':'Latest fictional title' if latest else 'Fictional title'}
 library=blobs[2]['value'];names=['alpha-new','bravo','charlie']if latest else ['alpha','bravo']
 if latest:
  library['scheduleFolderMap']={'alpha-new':'folder-1','bravo':'folder-1','charlie':'folder-1'}
  library['phaseOrder']['production']['shoot']=['bravo','alpha-new','charlie']
  library['townCache']={'alpha-new':'Latest fictional town'};library['dateCache']={'alpha-new':'2026-09-20'}
 doc=copy.deepcopy(base[0]['value']['snapshots'][0]['data'])
 mapping={'schedules':{},'productions':{'production':{'name':'Latest fictional production' if latest else 'Fictional production','slug':'fictional'}},'phases':{'shoot':{'production':'production','name':'Shoot','position':1}},'folders':{'folder-1':'production'},'templates':{},'browser_templates':{},'browser_dispositions':{k:'import_reviewed_templates'if k=='rp_tpls'else 'retain_private_original'if k=='rp_crew_names'else 'derived_cache'for k in BROWSER},'reviewed_removals':[]}
 for name in names:
  d=copy.deepcopy(doc);d['meta']['town']='Latest fictional town'if latest and name=='alpha-new'else 'Fictional '+name;d['rows'][0]['notes']='Original note'if not latest else 'Latest source note'
  blobs.append({'store':'schedules','key':name,'revision':2 if latest else 1,'value':d})
  mapping['schedules'][name]={'identity':'alpha'if name=='alpha-new'else name,'name':name,'slug':name,'production':'production','phase':'shoot','aliases':['alpha']if name=='alpha-new'else []}
 for name in blobs[1]['value']:mapping['templates'][name]={'production':'production','source':'alpha'}
 browser={k:{}for k in BROWSER};browser['rp_tpls']={'Private call':{'rows':[{'action':'Shoot','notes':'Latest private template'if latest else 'Private template'}],'savedAt':200 if latest else 100}};browser['rp_crew_names']=['Fictional private person']
 mapping['browser_templates']={'Private call':{'production':'production','owner':actor,'confirmed':True,'name':'Reviewed private call'}}
 aliases=[{'name':env+' old alpha','schedule':'alpha'},{'name':env+' bravo','schedule':'bravo'}]
 if latest:aliases.append({'name':env+' renamed alpha','schedule':'alpha-new'});mapping['reviewed_removals']=[{'store':'schedule-snapshots','key':blobs[0]['key'],'item':'old'}]
 blobs += [{'store':'browser','key':'reviewed-browser','revision':2 if latest else 1,'value':browser},{'store':'legacy-aliases','key':'aliases','revision':2 if latest else 1,'value':aliases}]
 inventory=[]
 for n,b in enumerate(blobs):
  filename=str(n)+'.json';(path/filename).write_text(json.dumps(b['value'],indent=2)+'\n');inventory.append({k:b[k]for k in ('store','key','revision')}|{'file':filename})
 manifest={'format':'roseland.synthetic-source.v1','synthetic':True,'environment':env,'organization':org,'actor':actor,'boundary':{'frozen':True,'epoch':2 if latest else 1},'inventory':inventory,'mapping':mapping}
 (path/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 return manifest
basepath=out/'base';latestpath=out/'latest';write_source(basepath);write_source(latestpath,True)
bc=capture(basepath);bp=build_plan(bc);lc=capture(latestpath);lp=build_plan(lc,bp)
for name,value in [('base-capture',bc),('base-plan',bp),('latest-capture',lc),('latest-plan',lp)]: (out/(name+'.json')).write_text(json.dumps(value,indent=2)+'\n')
check(len({e['store']for e in bc['entries']})==7,'All seven stores captured with original bytes')
def negative(label,mutate,transition=False):
 c=copy.deepcopy(lc if transition else bc);mutate(c);c['manifest_bytes']=base64.b64encode(json.dumps(c['manifest']).encode()).decode();c['sha256']=digest({k:v for k,v in c.items()if k!='sha256'});refused(lambda:build_plan(c,bp if transition else None),label)
def change(c,store,fn):
 e=next(x for x in c['entries']if x['store']==store);v=json.loads(base64.b64decode(e['bytes']));fn(v);raw=json.dumps(v).encode();e['bytes']=base64.b64encode(raw).decode();e['sha256']=hashlib.sha256(raw).hexdigest()
negative('Unknown schedule field rejected',lambda c:change(c,'schedules',lambda v:v.update(unknown=1)))
negative('Unsupported CMS palette rejected',lambda c:change(c,'cms',lambda v:v['colors'].update({'--unknown':'#ffffff'})))
negative('Duplicate source entry rejected',lambda c:(c['entries'].append(c['entries'][0]),c['manifest']['inventory'].append(c['manifest']['inventory'][0])))
negative('Missing store rejected',lambda c:(c['entries'].__setitem__(slice(None),[e for e in c['entries']if e['store']!='cms']),c['manifest']['inventory'].__setitem__(slice(None),[e for e in c['manifest']['inventory']if e['store']!='cms'])))
negative('Orphan alias rejected',lambda c:change(c,'legacy-aliases',lambda v:v.append({'name':'orphan','schedule':'missing'})))
negative('Unconfirmed browser owner rejected',lambda c:c['manifest']['mapping']['browser_templates']['Private call'].update(confirmed=False))
negative('Pending browser queue rejected',lambda c:change(c,'browser',lambda v:v.update(rp_sched_queue=['pending'])))
negative('Unreconciled browser cache rejected',lambda c:change(c,'browser',lambda v:v.update(rp_scheds={'alpha':{'newer':True}})))
negative('Duplicate rename identity rejected',lambda c:c['manifest']['mapping']['schedules']['bravo'].update(identity='alpha'))
negative('Non-frozen source rejected',lambda c:c['manifest']['boundary'].update(frozen=False))
negative('Changed source without revision rejected',lambda c:([e.update(revision=1)for e in c['entries']],[e.update(revision=1)for e in c['manifest']['inventory']]),True)
refused(lambda:strict_json('{"a":1,"a":2}'),'Duplicate JSON object key rejected')
refused(lambda:strict_json('{invalid}'),'Malformed JSON rejected')
refused(lambda:strict_json('{"a":NaN}'),'Non-JSON number rejected')
original=(basepath/'0.json').read_bytes()
refused(lambda:capture(basepath,lambda:(basepath/'0.json').write_bytes(original+b' ')),'Non-atomic capture mutation detected');(basepath/'0.json').write_bytes(original)
(basepath/'unlisted').write_text('extra');refused(lambda:capture(basepath),'Uninventoried file rejected');(basepath/'unlisted').unlink()
sql('begin;insert into public.organizations(id,name,slug)values('+q(org)+",'B12 fictional capture',"+q(env)+');insert into public.organization_memberships(organization_id,user_id,role,status,joined_at)values('+q(org)+','+q(actor)+",'owner','active',now());commit;",False)
try:
 first=imported(bp);check(first['status']=='imported','Initial all-store import committed');before=state();check(imported(bp)['status']=='already_imported'and state()==before,'Initial retry leaves all target rows/history unchanged')
 for fail in ['after_schedules','after_projections']:
  refused(lambda:imported(lp,fail),'Atomic refusal '+fail,'Injected');check(state()==before,'Complete rollback '+fail)
 # A real target edit inside a rollback-only transaction must block the import.
 query='begin;select set_config('+q('request.jwt.claim.sub')+','+q(actor)+',true);update public.schedules set document=jsonb_set(document,\'{meta,town}\',\'"Target edit"\')where id='+q(bp['schedules'][0]['id'])+';select pg_temp.import_capture('+j(lp)+');rollback;'
 refused(lambda:sql(query),'Newer target edit refused','Newer or changed target');check(state()==before,'Target conflict rollback preserves checkpoint')
 wrong=copy.deepcopy(lp);wrong['previous_hash']='0'*64;refused(lambda:imported(wrong),'Wrong parent checkpoint refused','Capture parent changed')
 wrong=copy.deepcopy(lp);wrong['reviewed_removals']=[];refused(lambda:imported(wrong),'Unreviewed snapshot disappearance refused','Unreviewed source disappearance');check(state()==before,'Unreviewed removal rolls back preceding writes')
 wrong=copy.deepcopy(lp);wrong['schedules'][0]['document']['rows'][0]['unknown']='bad';refused(lambda:imported(wrong),'Malformed nested document refused','Invalid schedule document');check(state()==before,'Malformed document refusal leaves target unchanged')
 wrong=copy.deepcopy(lp);wrong['epoch']=1;refused(lambda:imported(wrong),'Stale source boundary refused','Stale or conflicting source boundary')
 wrong=copy.deepcopy(lp)
 for r in wrong['related']['records']:
  if r['store']=='schedule-snapshots'and r['item']=='keep':r['payload']['label']='Changed historical snapshot'
  if r['store']=='schedule-snapshots'and r['item']=='':
   for snap in r['payload']['snapshots']:
    if snap['id']=='keep':snap['label']='Changed historical snapshot'
 refused(lambda:imported(wrong),'Changed historical snapshot refused','Changed imported snapshot content');check(state()==before,'Historical snapshot refusal atomic')
 second=imported(lp);check(second['status']=='imported','Latest all-store delta committed');final=state();check(imported(lp)['status']=='already_imported'and state()==final,'Latest retry leaves all target rows/history unchanged')
 (out/'final-state.json').write_text(json.dumps(final,indent=2)+'\n')
 records=[]
 def reconcile(kind,expected,actual,fields):
  em={x['id']:x for x in expected};am={x['id']:x for x in actual};check(set(em)==set(am),kind+' exact identity inventory')
  for ident,e in em.items():
   a=am[ident];ev={k:e[k]for k in fields};av={k:a[k]for k in fields};check(ev==av,kind+' '+ident+' projection')
   records.append({'kind':kind,'id':ident,'source_sha256':digest(ev),'target_sha256':digest(av),'source_revision':e.get('revision',lp['epoch']),'raw_source_sha256':e.get('raw_sha256'),'target_version':a.get('document_version',a.get('version')),'verified':True})
 expected=[dict(s,display_name=s['name'],library_position=s['position'])for s in lp['schedules']]
 reconcile('schedules',expected,final['public.schedules'],['document','display_name','slug','production_id','phase_id','status','library_position'])
 reconcile('productions',lp['productions'],final['public.productions'],['name','slug'])
 reconcile('phases',lp['phases'],final['public.phases'],['name','production_id','position'])
 reconcile('templates',lp['templates'],final['private.schedule_templates'],['name','rows','production_id'])
 expected=[dict(a,legacy_name=a['name'],creator_id=actor)for a in lp['aliases']]
 reconcile('aliases',expected,final['private.schedule_client_aliases'],['legacy_name','schedule_id','creator_id'])
 check(final['private.organization_presentation'][0]['config']==lp['presentation'],'CMS exact application configuration')
 expected={r['id']:dict(r)for r in lp['related']['records']}
 for old in bp['related']['records']:
  if old['id']not in expected:expected[old['id']]=dict(old,tombstone=True,revision=2)
 actual={r['id']:r for r in final['private.migration_records']};check(set(expected)==set(actual),'Related catalogue exact inventory including retained tombstone')
 for ident,e in expected.items():
  a=actual[ident];check((e['payload'],e['refs'],e['revision'],e['tombstone'])==(a['payload'],a['schedule_refs'],a['source_revision'],a['tombstone']),'Related record '+ident+' revision/content/references')
  history=[h for h in final['private.migration_record_versions']if h['record_id']==ident];check(len(history)==a['version'],'Related history '+ident+' complete')
  records.append({'kind':e['store'],'key':e['key'],'item':e['item'],'id':ident,'source_revision':e['revision'],'target_version':a['version'],'source_sha256':digest(e['payload']),'target_sha256':digest(a['payload']),'database_fingerprint':a['fingerprint'],'tombstone':a['tombstone'],'verified':True})
 check(sql('select bool_and(fingerprint=private.migration_fingerprint(snapshot)) from private.migration_record_versions where organization_id='+q(org)+';',False)=='t','Every related historical fingerprint verified')
 snapshots={r['id']:r for r in final['private.schedule_snapshots']};expected_snaps={i:r for i,r in expected.items()if r['store']=='schedule-snapshots'and r['item']}
 check(set(snapshots)==set(expected_snaps),'Snapshot projection retains reviewed source removal')
 for ident,e in expected_snaps.items():check(snapshots[ident]['original_payload']==e['payload']and snapshots[ident]['document']==e['payload']['data'],'Snapshot '+ident+' original bytes/document retained')
 for t in lp['templates']:
  if t['source']:check(any(s['template_id']==t['id']and s['schedule_id']==t['source']for s in final['private.schedule_template_sources']),'Shared template provenance '+t['id'])
  else:check(any(s['template_id']==t['id']and s['actor_id']==actor and s['source_fingerprint']==t['origin']['fingerprint']for s in final['private.schedule_template_browser_origins']),'Browser template ownership '+t['id'])
 check(capture(basepath)==bc and capture(latestpath)==lc,'Original fixture bytes unchanged after rehearsal')
 checkpoint=result('select jsonb_agg(to_jsonb(r)order by source_epoch)from private.migration_capture_runs r where organization_id='+q(org)+';')
 check(len(checkpoint)==2 and checkpoint[-1]['target_state']==final,'Two immutable capture receipts and final recovery checkpoint retained')
 (out/'checkpoints.json').write_text(json.dumps(checkpoint,indent=2)+'\n')
 report={'format':'b12.synthetic.acceptance.v1','organization':org,'environment':env,'private_checkpoint':str(out),'checks':checks,'expected_refusals':failures,'records':records,'capture_hashes':[bc['sha256'],lc['sha256']],'browser_dispositions':lp['browser_dispositions'],'missing':[],'unexpected':[],'mismatched':[],'sql_reconciliation':True,'application_readback':False,'actual_source_migration':False}
 (out/'report.json').write_text(json.dumps(report,indent=2)+'\n');Path('/private/tmp/roseland-b12-current.json').write_text(json.dumps({'root':str(out),'organization':org})+'\n');print('CHECKPOINT '+str(out),flush=True)
except Exception as error:
 (out/'failure.json').write_text(json.dumps({'error':str(error),'checks':checks,'expected_refusals':failures},indent=2)+'\n');print('FAILED CHECKPOINT '+str(out),flush=True);raise
