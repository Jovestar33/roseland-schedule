"""Stop only owned B13/B14 batch services; preserve all volumes and B11 preview."""
import json,os,signal,subprocess,time,urllib.request
from pathlib import Path
projects=['roseland-b13-source','roseland-b14-destination-g1','roseland-b14-destination-g2'];apps=[('/private/tmp/roseland-b13-process.json',3455),('/private/tmp/roseland-b14-destination-g1-process.json',3465),('/private/tmp/roseland-b14-destination-g2-process.json',3475)];stopped=[]
for filename,port in apps:
 record=json.loads(Path(filename).read_text());assert record['port']==port
 server=record['server'];r=subprocess.run(['ps','-p',str(server),'-o','command='],capture_output=True,text=True)
 if r.returncode==0:
  # Next changes its process title; verify the recorded process is listening on
  # this explicitly owned test port rather than relying on a reused PID alone.
  listening=subprocess.run(['lsof','-nP','-a','-p',str(server),'-iTCP:'+str(port),'-sTCP:LISTEN'],capture_output=True,text=True)
  assert listening.returncode==0,'Recorded server no longer owns test port'
  os.kill(record['launcher'],signal.SIGTERM);stopped.append({'appPort':port,'launcher':record['launcher']})
names=subprocess.check_output(['docker','ps','--format','{{.Names}}'],text=True).splitlines()
for project in projects:
 owned=[n for n in names if n.endswith('_'+project)]
 # DB is stopped last. No rm/prune or volume deletion is used.
 owned.sort(key=lambda n:n.startswith('supabase_db_'))
 if owned:subprocess.run(['docker','stop',*owned],check=True,stdout=subprocess.DEVNULL)
 stopped.extend(owned)
remaining=subprocess.check_output(['docker','ps','--format','{{.Names}}'],text=True).splitlines();assert not any(any(n.endswith('_'+p)for p in projects)for n in remaining)
for _,port in apps:
 r=subprocess.run(['lsof','-nP','-iTCP:'+str(port),'-sTCP:LISTEN'],capture_output=True,text=True);assert r.returncode!=0,'Batch port remains open'
assert all('supabase_'+s+'_roseland-b11-review-19acbce'in remaining for s in ['db','auth','rest','kong','inbucket'])
with urllib.request.urlopen('http://127.0.0.1:3445/local-workspace',timeout=10)as r:assert r.status==200
report={'stopped':stopped,'batchPortsClosed':True,'volumesRetained':True,'b11PreviewRunning':True,'b11PreviewHttpStatus':200,'b11PreviewBuild':'19acbce','productionChanged':False}
Path('evidence/b14-restore/cleanup.json').write_text(json.dumps(report,indent=2)+'\n');print('PASS batch services stopped; B11 preview remains running; all volumes retained')
