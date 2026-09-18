"""Read-only boundary inventory for the explicitly owned B13 source database."""
import hashlib,json,subprocess
from pathlib import Path
root=Path('/private/tmp/roseland-b13-source');assert not(root/'supabase/.temp/project-ref').exists()
def query(q):return json.loads(subprocess.check_output(['docker','exec','-i','supabase_db_roseland-b13-source','psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],input=q,text=True))
functions=query("""select json_agg(x)from(select n.nspname as schema,p.proname as name,pg_get_function_identity_arguments(p.oid)as arguments,p.prosecdef as security_definer,p.proconfig as settings,has_function_privilege('anon',p.oid,'execute')as anon,has_function_privilege('authenticated',p.oid,'execute')as authenticated,has_function_privilege('service_role',p.oid,'execute')as service,encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')as sha256 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private')and p.prokind='f'and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')order by n.nspname,p.proname,p.oid)x;""")
tables=query("""select json_agg(x)from(select n.nspname as schema,c.relname as name,c.relrowsecurity as rls,has_table_privilege('anon',c.oid,'select')as anon_select,has_table_privilege('authenticated',c.oid,'select')as authenticated_select,has_table_privilege('service_role',c.oid,'select')as service_select from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private')and c.relkind='r'order by 1,2)x;""")
def group(name):
 for category,parts in [('sharing',['client']),('templates',['template']),('snapshots',['snapshot']),('migration',['migration','related','capture']),('presentation',['presentation']),('accounts',['account','mfa','totp','session','profile','auth','policy_version']),('administration',['invitation','workflow','bootstrap','provision','membership','member','organization','operator']),('schedules',['schedule','production','phase','day','transfer','placement','permission','context','metadata'])]:
  if any(k in name for k in parts):return category
 return 'foundation'
for x in functions+tables:x['boundary_group']=group(x['name'])
files=[]
paths={p for p in Path('public').rglob('*') if p.is_file()}|set(Path('app').rglob('route.ts'))|set(Path('app').rglob('page.tsx'))|set(Path('netlify').rglob('*.js'))|set(Path('netlify').rglob('*.mjs'))|set(Path('netlify').rglob('*.cjs'))|{Path('middleware.ts'),Path('netlify.toml'),Path('app/manifest.ts')}
for p in sorted(paths):files.append({'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'boundary':'legacy functions: fictional unit baseline; no hosted execution'if str(p).startswith('netlify/')else 'Next app/API: source inspection plus built HTTP/genuine Auth where enabled'})
unsafe=[f for f in functions if f['security_definer'] and f['settings']!=['search_path=""']]
private_api=[f for f in functions if f['schema']=='private'and(f['anon']or f['authenticated'])]
assert not unsafe,unsafe
assert not private_api,private_api
assert all(t['rls'] or (t['schema']=='private' and not any(t[k] for k in ('anon_select','authenticated_select','service_select')))for t in tables),[t for t in tables if not t['rls']]
report={'base':'cf4b0ee','functions':functions,'tables':tables,'files':files,'checks':{'security_definer_empty_search_path':True,'no_private_function_execution_for_anon_or_authenticated':True,'all_exposed_tables_rls_private_acl_exceptions_explicit':True},'private_acl_only_tables':[t['name']for t in tables if not t['rls']],'unavailable_services':['Storage','Realtime','Edge Functions'],'GraphQL':'pg_graphql extension not enabled: explicitly unavailable, not evidence of working GraphQL tenant filtering; hosted enablement requires admission delta review','limits':['Per-boundary inventory is not a claim that every parameter combination was executed','B08 same-token concurrent-session exception retained; provider investigation excluded','Exceptional factor-loss execution and operational organization purge absent/pending']}
Path('evidence/b13-review/boundaries.json').write_text(json.dumps(report,indent=2)+'\n');print('Inventoried',len(functions),'functions,',len(tables),'tables,',len(files),'route/asset/service files; structural privilege checks passed.')
