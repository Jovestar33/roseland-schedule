"""Lossless validation/planning of shared Blob stores; no network or writes.

Unknown fields are reported rather than stripped. Browser-only data is outside
this contract. Mapping ownership is the explicit migration destination tenant,
not a decision to expose all records to that tenant's application users.
"""
import hashlib
import json
import re
import uuid

NS = uuid.UUID('4f4e80da-f5c1-5c96-b4d1-14df62d49026')
STORES = {'schedule-snapshots', 'schedule-templates', 'schedule-library', 'cms'}


class Invalid(ValueError):
    pass


def check(ok, message):
    if not ok:
        raise Invalid(message)


def obj(value, fields=None, required=()):
    check(type(value) is dict, 'Expected object')
    if fields is not None:
        check(set(value) <= set(fields), 'Unknown fields: ' + ', '.join(sorted(set(value)-set(fields))))
    check(set(required) <= set(value), 'Missing required fields')
    return value


def text(value, maximum=10000, empty=False):
    check(type(value) is str and (empty or bool(value.strip())) and len(value) <= maximum, 'Invalid text')


def number(value):
    check(type(value) is int and 0 <= value <= 9007199254740991, 'Expected nonnegative safe integer')


def strings(value):
    obj(value)
    for key, val in value.items():
        text(key); text(val, empty=True)


def document(value):
    # Full nested document validation also runs in the database transaction.
    obj(value, ['meta','rows','savedAt'], ['meta','rows'])
    obj(value['meta']); check(type(value['rows']) is list and len(value['rows']) <= 5000, 'Invalid rows')
    check(len(json.dumps(value, ensure_ascii=False).encode()) <= 2097152, 'Oversized document')


def identity(org, environment, store, key, item):
    return str(uuid.uuid5(NS, json.dumps([org,environment,store,key,item], separators=(',', ':'))))


def plan(org, environment, blobs, schedules):
    uuid.UUID(org); text(environment,160); obj(schedules)
    try: json.dumps(blobs,allow_nan=False)
    except (TypeError,ValueError): raise Invalid('Non-JSON source value')
    check(type(blobs) is list, 'Expected complete Blob inventory')
    seen=set(); records=[]; docs=[]
    for blob in blobs:
        obj(blob,['store','key','revision','value'],['store','key','revision','value'])
        store,key,revision,value=(blob[k] for k in ['store','key','revision','value'])
        check(type(store) is str and store in STORES,'Unsupported source store'); text(key,1024); number(revision); check(revision>0,'Missing source revision')
        check((store,key) not in seen,'Duplicate source blob'); seen.add((store,key))
        refs={}; leaves=[]
        def reference(name):
            text(name,1024); check(name in schedules,'Unresolved schedule: '+name)
            uuid.UUID(schedules[name]); refs[name]=schedules[name]
        if store=='schedule-snapshots':
            obj(value,['name','snapshots','updatedAt'],['name','snapshots','updatedAt']); reference(value['name']); number(value['updatedAt'])
            check(key=='snapshots_'+hashlib.sha256(value['name'].encode()).hexdigest(),'Snapshot collection key/name mismatch')
            check(type(value['snapshots']) is list,'Invalid snapshots'); ids=set()
            # Do not reuse legacy normalizeSnapshots: it silently caps/drops data.
            for snap in value['snapshots']:
                obj(snap,['id','savedAt','label','data'],['id','savedAt','label','data']); text(snap['id'],1024)
                check(snap['id'] not in ids,'Duplicate snapshot ID'); ids.add(snap['id'])
                number(snap['savedAt']); text(snap['label'],10000,True); document(snap['data']); docs.append(snap['data'])
                leaves.append((snap['id'],snap))
        elif store=='schedule-templates':
            check(key=='templates','Unknown template store key'); obj(value)
            for name, template in value.items():
                text(name,1024); obj(template,['rows','savedAt'],['rows','savedAt']); number(template['savedAt'])
                doc={'meta':{},'rows':template['rows']}; document(doc); docs.append(doc); leaves.append((name,template))
        elif store=='schedule-library':
            check(key=='rp_library_index_v1','Unknown library store key')
            obj(value,['version','folders','scheduleFolderMap','updatedAt','phaseOrder','productionDisplayNames','phaseDisplayNames','tsarchived','townCache','dateCache'],['version','folders','scheduleFolderMap','updatedAt'])
            check(value['version']==1 and type(value['version']) is int,'Unsupported library version'); number(value['updatedAt'])
            check(type(value['folders']) is list,'Invalid folders'); folders=set()
            for folder in value['folders']:
                obj(folder,['id','name','createdAt','updatedAt'],['id','name','createdAt','updatedAt'])
                text(folder['id'],1024); text(folder['name']); number(folder['createdAt']); number(folder['updatedAt'])
                check(folder['id'] not in folders,'Duplicate folder ID'); folders.add(folder['id'])
                leaves.append(('folder/'+folder['id'],folder))
            obj(value['scheduleFolderMap'])
            for name, folder in value['scheduleFolderMap'].items():
                reference(name); text(folder,1024); check(folder in folders,'Orphan folder reference')
            obj(value.get('phaseOrder',{}))
            ordered=set()
            for prod, phases in value.get('phaseOrder',{}).items():
                text(prod); obj(phases)
                for phase,names in phases.items():
                    text(phase); check(type(names) is list,'Invalid phase order')
                    for name in names:
                        reference(name); check(name not in ordered,'Duplicate phase-order schedule'); ordered.add(name)
            strings(value.get('productionDisplayNames',{})); obj(value.get('phaseDisplayNames',{}))
            for prod,names in value.get('phaseDisplayNames',{}).items(): text(prod); strings(names)
            archived=value.get('tsarchived',[]); check(type(archived) is list,'Invalid archive list')
            for name in archived: reference(name)
            check(len(set(archived))==len(archived),'Duplicate archive entry')
            for field in ['townCache','dateCache']:
                strings(value.get(field,{}))
                for name in value.get(field,{}): reference(name)
        else:
            check(key=='rp_cms_config','Unknown CMS key')
            obj(value,['actions','actionStyles','colors','labels','logo'])
            check(type(value.get('actions',[])) is list,'Invalid CMS actions')
            names=set()
            for action in value.get('actions',[]):
                obj(action,['name','color'],['name','color']); text(action['name']); text(action['color'],120,True)
                check(action['name'] not in names,'Duplicate action'); names.add(action['name'])
                check(re.fullmatch(r'[a-zA-Z_][\w-]*|',action['color']) is not None,'Unsafe action class')
            obj(value.get('actionStyles',{}))
            for cls,style in value.get('actionStyles',{}).items():
                check(re.fullmatch(r'[a-zA-Z_][\w-]*',cls) is not None,'Unsafe style class')
                obj(style,['bg','text'],['bg','text'])
                for color in style.values():
                    text(color,160); check(not re.search(r'[{};<>]|url\s*\(|expression\s*\(',color,re.I),'Unsafe CSS value')
            strings(value.get('colors',{})); strings(value.get('labels',{}))
            for prop,color in value.get('colors',{}).items():
                check(re.fullmatch(r'--[a-zA-Z0-9_-]+',prop) is not None,'Invalid custom property')
                check(not re.search(r'[{};<>]|url\s*\(|expression\s*\(',color,re.I),'Unsafe CSS value')
            if value.get('logo') is not None:
                text(value['logo'],2097152,True)
                check(value['logo']=='' or value['logo'].startswith(('https://','data:image/png;base64,','data:image/jpeg;base64,','data:image/webp;base64,')),'Unsupported logo source')
        check(len(json.dumps(value,ensure_ascii=False).encode())<=16777216,'Oversized source blob')
        for item,payload in [('',value)]+leaves:
            records.append(dict(id=identity(org,environment,store,key,item),org=org,environment=environment,store=store,key=key,
                                item=item,revision=revision,payload=payload,refs=dict(refs),tombstone=False))
    check(set(store for store,key in seen)==STORES,'Incomplete related-store inventory')
    return {'records':sorted(records,key=lambda r:(r['store'],r['key'],r['item'])), 'documents':docs,
            'source_blobs':len(blobs), 'application_parity':False,
            'decisions':['browser-only template/suggestion ownership','application template/CMS sharing permissions',
                         'snapshot removal and retention','library folder/phase normalization and Move To semantics']}
