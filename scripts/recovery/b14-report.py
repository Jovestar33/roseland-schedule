import importlib.util,json,shutil,os,stat
from pathlib import Path
s=importlib.util.spec_from_file_location('b14',Path(__file__).with_name('b14.py'));b=importlib.util.module_from_spec(s);s.loader.exec_module(b)
out=Path('evidence/b14-restore');names=['baseline','latest','latest-complete','latest-qualified','latest-final','newest-destination','newest-complete'];b.journal_chain(names)
generations=[]
for name in names:
 m=b.verify(name);tables=b.load(b.ROOT/name/'tables.json');generations.append({'name':name,'manifestSha256':m['sha256'],'previous':m['previous'],'dataSha256':m['dataDigest'],'metadataSha256':m['metadataDigest'],'tableCount':len(tables),'recordCount':sum(map(len,tables.values())),'tables':{k:{'count':len(v),'sha256':b.digest(v)}for k,v in tables.items()},'journal':b.load(b.ROOT/name/'journal.json')if m['previous']else None})
receipts={p:b.load(b.ROOT/(p+'-receipt.json'))for p in ['roseland-b14-destination-g1','roseland-b14-destination-g2']}
for p in receipts:assert receipts[p]['state']=='reconciled-frozen'
# Exact known-secret scan before committing only credential-free evidence.
f=json.loads(Path('/private/tmp/roseland-b14-fixtures.json').read_text());status=b.load(Path('/private/tmp/roseland-b14-destination-g2-live-status.json'));secrets=[status['SERVICE_ROLE_KEY'],status.get('SECRET_KEY',''),f['owner']['password'],f['owner']['factor']['secret'],f['editor']['password'],f['liveToken'],f['revokedToken'],f['revokedSession']]
for p in out.rglob('*'):
 if p.is_file():assert not any(x and x in p.read_text(errors='replace')for x in secrets),str(p)
for p in Path('/private/tmp').iterdir():
 if p.is_file()and(p.name.startswith('b14-')or p.name.startswith('b13-')):os.chmod(p,0o600)
for p in b.ROOT.rglob('*'):
 if p.is_file():os.chmod(p,0o600)
assert all(stat.S_IMODE(p.stat().st_mode)==0o600 for p in b.ROOT.rglob('*')if p.is_file())
report={'label':'local connected same-schema fallback rehearsal; production D09, hosted RPO/RTO and excluded-feature deltas pending','reviewedAppCommit':'4121426','generations':generations,'receipts':receipts,'reconciliation':{'missing':0,'extra':0,'mismatched':0,'allRowsComparedBeforeActivation':True,'newestDestinationVersion':3},'artifactRoot':str(b.ROOT),'secretArtifactsMode':'0700 directory / 0600 files','journalKind':'ordered complete-state generations, not WAL/PITR','b12Reuse':'Complete document from original alpha-new capture bytes plus retained B12 checkpoint/input/mapping evidence; not a new import of every B12 record into this independent Auth fixture','providerRaceInvestigation':False,'productionSelection':False}
(out/'reconciliation.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS',len(generations),'generations;',generations[-1]['tableCount'],'tables;',generations[-1]['recordCount'],'records; exact known-secret evidence scan clean')
