import importlib.util,json,shutil,subprocess,time
from pathlib import Path
s=importlib.util.spec_from_file_location('b14',Path(__file__).with_name('b14.py'));b=importlib.util.module_from_spec(s);s.loader.exec_module(b)
checks=[];stamp=str(int(time.time()))
def refused(fn,label):
 try:fn()
 except (b.InvalidRecovery,FileNotFoundError):checks.append(label);return
 raise AssertionError(label)
chain=['baseline','latest','latest-complete','latest-qualified','latest-final']
refused(lambda:b.journal_chain(list(reversed(chain))),'Reordered generations rejected')
refused(lambda:b.journal_chain(['baseline','latest-final']),'Wrong journal predecessor rejected')
src=b.ROOT/'latest-final'
for name,missing in [('missing-config','services.json'),('missing-grants','roles.sql')]:
 name=name+'-'+stamp;dst=b.ROOT/name;shutil.copytree(src,dst);(dst/missing).rename(dst/(missing+'.withheld'));refused(lambda:b.verify(name),'Missing '+missing+' rejects activation input')
# A fully rehashed malformed fixture must still satisfy semantic hook validation.
hookname='missing-hook-'+stamp;dst=b.ROOT/hookname;shutil.copytree(src,dst);settings=b.load(dst/'settings.json')
for item in settings:item['settings']=[x for x in item['settings']if not x.startswith('pgrst.db_pre_request=')]
(dst/'settings.json').write_text(b.canonical(settings));m=b.load(dst/'manifest.json');m['entries']['settings.json']=b.hashlib.sha256((dst/'settings.json').read_bytes()).hexdigest();m['sha256']=b.digest({k:v for k,v in m.items()if k!='sha256'});(dst/'manifest.json').write_text(b.canonical(m));refused(lambda:b.verify(hookname),'Semantically missing session admission hook rejected')
project='roseland-b14-destination-g1';retry=b.restore(project,chain);assert retry['retry']=='exact receipt recovered';checks.append('Exact restore lost-ack retry returns existing receipt without replay')
# Deliberately remove a known required grant only on the frozen restore target.
b.sql(project,'set role postgres;revoke execute on function public.read_schedule(uuid) from authenticated;')
r=subprocess.run(['python3','-B','scripts/recovery/b14-services.py',project,'latest-final'],capture_output=True,text=True)
assert r.returncode and 'Grants or schema changed' in r.stderr;checks.append('Missing effective application grant blocks activation')
b.sql(project,'set role postgres;grant execute on function public.read_schedule(uuid) to authenticated;')
assert b.digest(b.metadata(project))==b.load(b.ROOT/(project+'-receipt.json'))['metadataDigest']
Path('evidence/b14-restore/gates.json').write_text(json.dumps({'checks':checks,'failedArtifactsRetained':True},indent=2)+'\n');print('PASS '+str(len(checks))+' recovery refusal/retry gates')
