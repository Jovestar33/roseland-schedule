"""Complete synthetic capture/planning contract. No provider/real-source client.

Original bytes are retained. Unsupported data blocks the plan; ownership and
normalization are explicit per-capture choices, never inferred from a browser.
"""
import base64
import hashlib
import json
from pathlib import Path
import uuid
from related_contract import plan as related_plan, identity, Invalid, check, obj, document

STORES={'schedules','schedule-snapshots','schedule-templates','schedule-library','cms','browser','legacy-aliases'}
BROWSER={'rp_tpls','rp_crew_names','rp_scheds','rp_sched_queue','rp_sched_snaps','rp_sync_meta','rp_sched_deleted','rp_library_meta_v1','rp_notif_dismissed','rp_notif_fired'}
def canonical(v):return json.dumps(v,sort_keys=True,ensure_ascii=False,separators=(',',':'),allow_nan=False)
def digest(v):return hashlib.sha256(canonical(v).encode()).hexdigest()
def sid(org,env,kind,key):return identity(org,env,kind,key,'')

def strict_json(raw):
 def pairs(items):
  result={}
  for key,value in items:
   check(key not in result,'Duplicate JSON key');result[key]=value
  return result
 def constant(value):raise Invalid('Non-JSON number: '+value)
 return json.loads(raw,object_pairs_hook=pairs,parse_constant=constant)

def capture(root, during_capture=None):
 root=Path(root).resolve(); raw_manifest=(root/'manifest.json').read_bytes();m=strict_json(raw_manifest)
 obj(m,['format','synthetic','environment','organization','actor','boundary','inventory','mapping'],['format','synthetic','environment','organization','actor','boundary','inventory','mapping'])
 check(m['format']=='roseland.synthetic-source.v1' and m['synthetic'] is True,'Only explicit synthetic source manifests supported')
 obj(m['boundary'],['frozen','epoch'],['frozen','epoch'])
 check(m['boundary'].get('frozen') is True and type(m['boundary'].get('epoch')) is int and m['boundary']['epoch']>0,'A frozen revision boundary is required')
 uuid.UUID(m['organization']);uuid.UUID(m['actor']);check(type(m['inventory']) is list,'Inventory required')
 before={};entries=[];seen=set()
 for entry in m['inventory']:
  obj(entry,['store','key','revision','file'],['store','key','revision','file']);key=(entry['store'],entry['key']);check(entry['store'] in STORES and key not in seen,'Unknown or duplicate store/key');seen.add(key)
  check(type(entry['revision']) is int and entry['revision']>0,'Source revision required')
  path=(root/entry['file']).resolve();check(path.parent==root and path.name!='manifest.json','Source files must be direct fixture children')
  raw=path.read_bytes();check(len(raw)<=20_000_000,'Oversized capture item');before[str(path)]=raw
  entries.append({**entry,'sha256':hashlib.sha256(raw).hexdigest(),'bytes':base64.b64encode(raw).decode()})
 check({x[0] for x in seen}==STORES,'Incomplete store inventory')
 check({p.name for p in root.iterdir() if p.is_file()}=={'manifest.json'}|{e['file'] for e in m['inventory']},'Uninventoried source file')
 if during_capture:during_capture()
 check({p.name for p in root.iterdir() if p.is_file()}=={'manifest.json'}|{e['file'] for e in m['inventory']},'Source inventory changed during capture')
 check((root/'manifest.json').read_bytes()==raw_manifest and all(Path(p).read_bytes()==v for p,v in before.items()),'Source changed during non-atomic capture')
 result={'format':'roseland.complete-capture.v1','manifest_bytes':base64.b64encode(raw_manifest).decode(),'manifest':m,'entries':entries}
 result['sha256']=digest(result);return result

def build_plan(c, previous=None):
 check(c.get('format')=='roseland.complete-capture.v1' and c.get('sha256')==digest({k:v for k,v in c.items() if k!='sha256'}),'Capture integrity failed')
 m=c['manifest'];check(strict_json(base64.b64decode(c['manifest_bytes']))==m,'Manifest bytes mismatch')
 check(m['synthetic'] is True and m['boundary']['frozen'] is True,'Synthetic frozen capture required')
 org,env,actor=m['organization'],m['environment'],m['actor'];mapping=m['mapping'];obj(mapping,['schedules','productions','phases','folders','templates','browser_templates','browser_dispositions','reviewed_removals'],['schedules','productions','phases','folders','templates','browser_templates','browser_dispositions','reviewed_removals'])
 values={};blobs=[]
 check([(e['store'],e['key'],e['revision'],e['file'])for e in c['entries']]==[(e['store'],e['key'],e['revision'],e['file'])for e in m['inventory']],'Capture inventory mismatch')
 for e in c['entries']:
  raw=base64.b64decode(e['bytes'],validate=True);check(hashlib.sha256(raw).hexdigest()==e['sha256'],'Source bytes mismatch');value=strict_json(raw);key=(e['store'],e['key']);check(key not in values and e['store'] in STORES,'Duplicate or unknown input');values[key]=value
  if e['store'] in STORES-{'schedules','browser','legacy-aliases'}:blobs.append({'store':e['store'],'key':e['key'],'revision':e['revision'],'value':value})
 check({k[0]for k in values}==STORES,'Incomplete source')
 source_schedules={key:value for (store,key),value in values.items() if store=='schedules'};check(set(source_schedules)==set(mapping['schedules']),'Missing or unmapped schedule')
 refs={};identities=set()
 for key,r in mapping['schedules'].items():
  obj(r,['identity','name','slug','production','phase','aliases'],['identity','name','slug','production','phase','aliases']);check(r['identity'] not in identities,'Duplicate stable schedule identity');identities.add(r['identity']);target=sid(org,env,'schedules',r['identity'])
  for name in [key]+r['aliases']:
   check(name not in refs,'Duplicate rename/alias mapping');refs[name]=target
 library=values.get(('schedule-library','rp_library_index_v1'));cms=values.get(('cms','rp_cms_config'));check(library is not None and cms is not None,'Canonical library/CMS required')
 related=related_plan(org,env,blobs,refs)
 # The target accepts known presentation keys; legitimate unsupported values must be reviewed.
 check(set(cms.get('colors',{}))<={'--pink','--pink-dark','--pink-light','--black','--row-even','--row-hover','--g100'},'Unsupported CMS palette mapping')
 check(set(cms.get('labels',{}))<={'appTitle','hdrTitle','colAction','colLocation','colDesc','colNotes','colTimeIn','colDuration','colTimeOut','colDone','metaTown','metaDate','metaCall','metaProd','metaDir','metaDp','btnAddRow'},'Unsupported CMS label mapping')
 check('logo' not in cms or (bool(cms['logo']) and cms['logo'].startswith(('data:image/png;base64,','data:image/jpeg;base64,','data:image/webp;base64,','data:image/svg+xml;base64,'))),'Unsupported CMS logo needs explicit embedded-asset review')
 productions=[];phases=[]
 for key,p in mapping['productions'].items():
  obj(p,['name','slug'],['name','slug']);productions.append({'id':sid(org,env,'productions',key),'key':key,**p})
 for key,p in mapping['phases'].items():
  obj(p,['production','name','position'],['production','name','position']);check(p['production'] in mapping['productions'],'Orphan phase');phases.append({'id':sid(org,env,'phases',key),'key':key,'production_id':sid(org,env,'productions',p['production']),**p})
 check(set(mapping['folders'])=={f['id']for f in library['folders']},'Every folder needs reviewed production mapping')
 schedules=[]
 for key,doc in source_schedules.items():
  document(doc);r=mapping['schedules'][key];check(r['production'] in mapping['productions'] and (r['phase'] is None or r['phase'] in mapping['phases']),'Orphan schedule placement')
  if r['phase'] is not None:check(mapping['phases'][r['phase']]['production']==r['production'],'Cross-production phase')
  if key in library['scheduleFolderMap']:check(mapping['folders'][library['scheduleFolderMap'][key]]==r['production'],'Folder/production mapping conflict')
  ordered=library.get('phaseOrder',{}).get(r['production'],{}).get(r['phase'],'[]');check(type(ordered)is list and key in ordered,'Unresolved manual order')
  e=next(e for e in c['entries']if e['store']=='schedules' and e['key']==key)
  schedules.append({'id':refs[key],'key':key,'revision':e['revision'],'raw_sha256':e['sha256'],'name':r['name'],'slug':r['slug'],'production_id':sid(org,env,'productions',r['production']),'phase_id':sid(org,env,'phases',r['phase'])if r['phase'] else None,'position':ordered.index(key),'status':'archived' if key in library.get('tsarchived',[])else 'draft','document':doc})
 templates=[];shared=values[('schedule-templates','templates')];check(set(shared)==set(mapping['templates']),'Every shared template needs reviewed destination/source mapping')
 for name,value in shared.items():
  r=mapping['templates'][name];obj(r,['production','source'],['production','source']);check(r['production'] in mapping['productions'] and r['source'] in refs,'Template scope unresolved')
  templates.append({'id':sid(org,env,'app-template',name),'name':name,'production_id':sid(org,env,'productions',r['production']),'rows':value['rows'],'source':refs[r['source']],'origin':None})
 browser=values.get(('browser','reviewed-browser'));check(type(browser)is dict and set(browser)==BROWSER,'Complete supported browser-key inventory required')
 check(set(mapping['browser_dispositions'])==BROWSER,'Each browser key needs an explicit disposition')
 for key,disposition in mapping['browser_dispositions'].items():
  check(disposition in ('import_reviewed_templates','retain_private_original','derived_cache'),'Unknown browser disposition')
  if key=='rp_tpls':check(disposition=='import_reviewed_templates','Browser templates require reviewed ownership')
  elif key=='rp_crew_names':check(disposition=='retain_private_original','Private suggestions cannot be tenant-published')
  else:check(disposition=='derived_cache','Browser cache must not override authoritative source data')
 check(not browser['rp_sched_queue'] and not browser['rp_sched_deleted'],'Unreconciled browser queue/deletion blocks capture')
 check(not browser['rp_scheds'] and not browser['rp_sched_snaps'],'Nonempty browser schedule/snapshot caches require explicit reconciliation')
 check(set(browser['rp_tpls'])==set(mapping['browser_templates']),'Unreviewed browser template')
 for name,value in browser['rp_tpls'].items():
  obj(value,['rows','savedAt'],['rows','savedAt']);document({'meta':{},'rows':value['rows']});r=mapping['browser_templates'][name]
  obj(r,['production','owner','confirmed','name'],['production','owner','confirmed','name']);check(r['owner']==actor and r['confirmed'] is True and r['production'] in mapping['productions'],'Browser template ownership must be explicit')
  check(not any(row.get('action') in ('Sunrise','Sunset')for row in value['rows']),'Generated sun rows need explicit conversion; source retained')
  templates.append({'id':sid(org,env,'browser-template',name),'name':r['name'],'production_id':sid(org,env,'productions',r['production']),'rows':value['rows'],'source':None,'origin':{'name':name,'savedAt':value['savedAt'],'fingerprint':digest(value)}})
 check(len({(t['production_id'],t['name'].strip().lower())for t in templates})==len(templates),'Template name collision')
 aliases=values.get(('legacy-aliases','aliases'));check(type(aliases)is list,'Legacy alias inventory required');names=set();alias_rows=[]
 for a in aliases:
  obj(a,['name','schedule'],['name','schedule']);check(a['name'] not in names and a['schedule'] in refs,'Duplicate/orphan legacy alias');names.add(a['name']);alias_rows.append({'id':sid(org,env,'client-alias',a['name']),'name':a['name'],'schedule_id':refs[a['schedule']]})
 removed=[]
 for item in mapping['reviewed_removals']:
  obj(item,['store','key','item'],['store','key','item']);check(item['store']=='schedule-snapshots' and bool(item['item']),'Only explicitly reviewed snapshot source removal is supported; retain target copy')
  removed.append(identity(org,env,item['store'],item['key'],item['item']))
 result={'previous_hash':previous['capture']['sha256'] if previous else None,'reviewed_removals':removed,'org':org,'actor':actor,'environment':env,'epoch':m['boundary']['epoch'],'capture':c,'productions':productions,'phases':phases,'schedules':schedules,'related':related,'templates':templates,'presentation':cms,'aliases':alias_rows,'browser_dispositions':mapping['browser_dispositions']}

 if previous:
  check((org,env,actor)==(previous['org'],previous['environment'],previous['actor']),'Capture destination/actor changed')
  check(result['epoch']>previous['epoch'],'Source boundary must advance')
  for kind in ('productions','phases','schedules','templates','aliases'):
   old={x['id']:x for x in previous[kind]};new={x['id']:x for x in result[kind]}
   check(set(old)<=set(new),'Unreviewed '+kind+' disappearance')
   for ident,a in old.items():
    b=new[ident]
    for field in ('production_id','phase_id','source','schedule_id'):
     check(a.get(field)==b.get(field),'Changed placement/provenance requires explicit review')
    if kind=='schedules':
     check(b['revision']>=a['revision'],'Stale schedule source revision')
     check(b['revision']>a['revision'] or b['raw_sha256']==a['raw_sha256'],'Changed schedule without revision')
  old={(x['store'],x['key']):x for x in previous['capture']['entries'] if x['store']!='schedules'}
  new={(x['store'],x['key']):x for x in c['entries'] if x['store']!='schedules'}
  check(set(old)<=set(new),'Unreviewed source blob disappearance')
  for key,a in old.items():
   b=new[key];check(b['revision']>=a['revision'],'Stale source revision')
   check(b['revision']>a['revision'] or b['sha256']==a['sha256'],'Changed source bytes without revision')
 return result
