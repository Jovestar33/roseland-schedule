#!/usr/bin/env python3
"""Source-pinned, private-password hosted mirror import. No credentials are saved."""
import datetime,getpass,hashlib,importlib.util,json,os,pathlib,re,subprocess,sys,warnings
from urllib.parse import quote

ROOT=pathlib.Path(__file__).resolve().parents[2]
PROJECT='dapvzbzyozlthmhjlekj'
RECOVERY=pathlib.Path.home()/'roseland-schedule/.netlify/trial-launch-recovery'

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def load_backup():
 spec=importlib.util.spec_from_file_location('trial_backup',ROOT/'scripts/hosting/backup-hosted.py')
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
def validate_review(review):
 if review.get('format')!='roseland.reviewed-live-import.v1' or review.get('project')!=PROJECT or review.get('rehearsalPassed') is not True:raise RuntimeError('Reviewed rehearsal required')
 for name,digest in review['sources'].items():
  p=(ROOT/name).resolve()
  if not p.is_relative_to(ROOT.resolve()) or sha(p)!=digest:raise RuntimeError('Reviewed source changed; refresh the launch helper')
 plan=pathlib.Path(review['plan'])
 if sha(plan)!=review['planFileSha256']:raise RuntimeError('Reviewed import plan changed')
 if review['migrationPlan']['appliedCount']!=56 or review['migrationPlan']['pendingCount']!=4:raise RuntimeError('Unexpected migration boundary')
 return json.loads(plan.read_text())
def validate_bridge_secret(secret):
 if not secret:raise RuntimeError('No Netlify bridge secret entered. Paste its saved VALUE at the hidden prompt, then press Return')
 if secret=='ROSELAND_TRIAL_SYNC_BRIDGE_SECRET':raise RuntimeError('You entered the variable NAME. Enter its saved secret VALUE instead')
 if any(c.isspace() for c in secret):raise RuntimeError('The bridge secret contains whitespace. Copy only its exact saved VALUE, without spaces or a newline')
 if any(ord(c)<33 or ord(c)>126 for c in secret):raise RuntimeError('The bridge secret contains unsupported characters. Copy its exact saved VALUE using plain text')
 if not 32<=len(secret)<=512:raise RuntimeError('The bridge secret must be 32 to 512 characters. Use the saved Netlify bridge secret VALUE, not a database password or the variable name')
 return secret

def cli(backup,dry):
 url='postgresql://postgres.'+PROJECT+'@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full&sslrootcert='+quote(str(backup.CA_FILE),safe='')
 return [str(ROOT/'node_modules/.bin/supabase'),'db','push','--db-url',url,'--workdir',str(ROOT)]+(['--dry-run']if dry else ['--yes'])
def main(review_path):
 if not sys.stdin.isatty():raise RuntimeError('Run this helper in macOS Terminal for hidden credential entry')
 os.umask(0o077);review=json.loads(pathlib.Path(review_path).read_text());plan=validate_review(review)
 backup=load_backup();backup.prepare_certificate()
 print('Roseland Pictures: reviewed hosted mirror import')
 print('63 real schedules; preserve all original source records. Synchronization stays OFF.')
 print('First enter the Netlify bridge secret; then the saved Supabase DATABASE password.')
 print('Typing and pasting are invisible. Press Return after each secret.')
 with warnings.catch_warnings():
  warnings.simplefilter('error',getpass.GetPassWarning)
  bridge=validate_bridge_secret(getpass.getpass('Netlify bridge secret VALUE (hidden): '))
  print('Bridge secret format accepted; its value has not been displayed or saved.')
  password=getpass.getpass('Supabase database password (hidden): ')
 if not password:raise RuntimeError('No database password entered')
 env=dict(os.environ,PGPASSWORD=password,SUPABASE_DB_PASSWORD=password)
 folder=RECOVERY/('trial-import-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
 folder.mkdir(mode=0o700)
 def scrub(text):
  for value in [password,quote(password,safe=''),bridge]:
   if value:text=text.replace(value,'[redacted]')
  return text
 def source_check():
  r=subprocess.run(['/usr/local/bin/node','--experimental-strip-types','--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',str(ROOT/'scripts/migration/verify-live-source.cjs'),review['plan']],input=bridge+'\n',text=True,capture_output=True,timeout=600)
  if r.returncode:raise RuntimeError('Source verification stopped: '+scrub(r.stderr).strip())
  result=json.loads(r.stdout)
  if result.get('verified') is not True or result.get('objects')!=141:raise RuntimeError('Source verification incomplete')
  return result
 def query(sql,writable=False,timeout=60):
  command=backup.remote_command('psql','--no-password','-X','-q','-A','-t','-v','ON_ERROR_STOP=1')
  if writable:command=[x.replace('default_transaction_read_only=on','default_transaction_read_only=off') for x in command]
  r=subprocess.run(command,input=sql,env=env,capture_output=True,text=True,timeout=timeout)
  if r.returncode:
   # Never print SQL context, which may include private schedule contents.
   error=next((x for x in r.stderr.splitlines() if x.startswith('ERROR:')),'Database request failed; inspect private launch status')
   raise RuntimeError(scrub(error))
  return json.loads(r.stdout)
 identity_sql="""select json_build_object('organization',exists(select 1 from public.organizations where id='820f7fc4-e364-4aae-a29a-65f7d84eef61' and name='Roseland Pictures' and deleted_at is null),'owner',exists(select 1 from public.organization_memberships where organization_id='820f7fc4-e364-4aae-a29a-65f7d84eef61' and user_id='71280ab3-541c-4e7f-95f3-f646ac2d701b' and role='owner' and status='active'),'versions',(select json_agg(version order by version)from supabase_migrations.schema_migrations),'schedules',(select count(*)from public.schedules),'productions',(select count(*)from public.productions));"""
 try:
  print('Checking that the reviewed legacy source has not changed…',flush=True)
  source_check();identity=query(identity_sql);before=review['appliedVersions'];after=before+[m['version'] for m in review['migrationPlan']['pending']]
  if identity.get('organization')is not True or identity.get('owner')is not True or identity.get('versions')!=before or identity.get('schedules')!=0 or identity.get('productions')!=0:raise RuntimeError('Hosted destination differs from the reviewed empty baseline; stop and reconcile')
  print('Creating a fresh private database backup before any changes…',flush=True)
  with (folder/'database.dump').open('xb') as out:
   r=subprocess.run(backup.remote_command('pg_dump','--no-password','--format=custom'),env=env,stdout=out,stderr=subprocess.PIPE,timeout=600)
  if r.returncode:raise RuntimeError('Fresh database backup failed; nothing applied')
  with (folder/'roles.sql').open('x') as out:
   r=subprocess.run(backup.remote_command('pg_dumpall','--no-password','--roles-only','--no-role-passwords'),env=env,stdout=out,stderr=subprocess.PIPE,timeout=90)
  if r.returncode:raise RuntimeError('Role backup failed; nothing applied')
  with (folder/'database.dump').open('rb') as source:
   r=subprocess.run(['docker','exec','-i',backup.CONTAINER,'pg_restore','--list'],stdin=source,capture_output=True,timeout=90)
  listing=r.stdout.decode(errors='replace')
  if r.returncode or not all(x in listing for x in ['TABLE DATA public organizations','TABLE DATA auth users','TABLE DATA supabase_migrations schema_migrations']):raise RuntimeError('Backup verification failed')
  (folder/'archive-list.txt').write_text(listing)
  (folder/'backup-verification.json').write_text(json.dumps({'identity':identity,'files':{name:sha(folder/name) for name in ['database.dump','roles.sql','archive-list.txt']},'restoreTested':False},indent=2))
  r=subprocess.run(cli(backup,True),env=env,capture_output=True,text=True,timeout=180)
  output=scrub(r.stdout+r.stderr);(folder/'migration-dry-run.log').write_text(output)
  found=sorted(set(re.findall(r'\b\d{14}_[A-Za-z0-9_]+\.sql\b',output)))
  if r.returncode or found!=sorted(m['file'] for m in review['migrationPlan']['pending']):raise RuntimeError('CLI dry-run differs from the four rehearsed migrations')
  validate_review(review)
  if query(identity_sql)!=identity:raise RuntimeError('Hosted baseline changed during preparation')
  print('Applying the four rehearsed forward migrations…',flush=True)
  r=subprocess.run(cli(backup,False),env=env,capture_output=True,text=True,timeout=600)
  (folder/'migration-apply.log').write_text(scrub(r.stdout+r.stderr))
  if r.returncode:raise RuntimeError('Migration stopped; some schema updates may have committed. Do not reset or rerun blindly')
  identity=query(identity_sql)
  if identity.get('versions')!=after or identity.get('organization')is not True or identity.get('owner')is not True or identity.get('schedules')!=0:raise RuntimeError('Post-migration identity verification failed')
  source_check();validate_review(review)
  print('Importing schedules, history and recovery records in one transaction…',flush=True)
  sql='begin; set local statement_timeout=180000;\n'+(ROOT/'scripts/migration/live_import.sql').read_text()+"\nselect pg_temp.import_live_trial(convert_from(decode('"+json.dumps(plan,ensure_ascii=False).encode().hex()+"','hex'),'UTF8')::jsonb);\ncommit;"
  result=query(sql,writable=True,timeout=240)
  if result.get('state')!='imported' or result.get('schedules')!=63 or result.get('snapshots')!=1158 or result.get('objects')!=141 or result.get('sync_enabled')is not False:raise RuntimeError('Import receipt needs inspection; do not rerun')
  result['verifiedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();result['planSha256']=plan['sha256'];result['project']=PROJECT
  (folder/'hosted-import-result.json').write_text(json.dumps(result,indent=2))
  print('Hosted mirror import complete: 63 schedules, 1,158 linked revisions, all 141 original records preserved.')
  print('The other 48 historical revisions remain preserved in the immutable source archive.')
  print('Synchronization is OFF. Deployment, authenticated checks and activation remain pending.')
  print('Private recovery folder: '+str(folder))
 except subprocess.TimeoutExpired:
  raise RuntimeError('Operation timed out; its outcome must be inspected before retrying. Do not reset the database')from None
 finally:
  env.pop('PGPASSWORD',None);env.pop('SUPABASE_DB_PASSWORD',None);password='';bridge=''
if __name__=='__main__':
 try:
  if len(sys.argv)!=2:raise RuntimeError('Private reviewed-manifest path required')
  main(sys.argv[1])
 except(Exception,KeyboardInterrupt)as e:
  print('Launch stopped: '+str(e),file=sys.stderr);sys.exit(1)
