#!/usr/bin/env python3
"""Exercise fictional related-store imports in an unlinked local stack; always roll back."""
import argparse
import copy
import json
from pathlib import Path
import re
import subprocess
import uuid
from related_contract import plan, identity
from related_fixtures import fixtures


def literal(value): return "'"+str(value).replace("'","''")+"'"
def encoded(value): return literal(json.dumps(value,ensure_ascii=False,separators=(',',':')))+'::jsonb'


def run():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workdir',required=True);parser.add_argument('--report',required=True)
    args=parser.parse_args();root=Path(args.workdir).resolve()
    assert not (root/'supabase/.temp/project-ref').exists(),'Linked projects refused'
    config=(root/'supabase/config.toml').read_text();project=re.search(r'^project_id\s*=\s*"([\w-]+)"',config,re.M).group(1)
    container='supabase_db_'+project
    info=json.loads(subprocess.check_output(['docker','inspect',container],text=True))[0]
    assert info['Name']=='/'+container and 'supabase/postgres' in info['Config']['Image'],'Local database required'
    ids={name:str(uuid.uuid5(uuid.NAMESPACE_URL,'roseland-related-fixture/'+name)) for name in ['owner','org','production','alpha','bravo','day-alpha','day-bravo','run']}
    org,owner,prod=ids['org'],ids['owner'],ids['production']
    base,latest=fixtures();refs={k:ids[k] for k in ['alpha','bravo']}
    first=plan(org,'synthetic-only',base,refs);last=plan(org,'synthetic-only',latest,refs)
    before_ids={r['id'] for r in first['records']};after_ids={r['id'] for r in last['records']}
    for r in first['records']:r['target_version']=1
    for r in last['records']:r['target_version']=2 if r['id'] in before_ids else 1
    # Fictional reviewed removal is explicit. Production disappearance/retention
    # must not be inferred from an incomplete inventory or automatic cleanup.
    removed=[copy.deepcopy(r) for r in first['records'] if r['id'] not in after_ids]
    assert len(removed)==1 and removed[0]['item']=='old'
    removed[0].update(revision=2,tombstone=True,target_version=2)
    last['records']+=removed
    sql=[f'''begin; set local statement_timeout='30s';
      insert into auth.users(id,email,role,aud,email_confirmed_at) values('{owner}','related-fixture@example.test','authenticated','authenticated',now());
      insert into public.organizations(id,name,slug) values('{org}','Related fictional tenant','related-fixture');
      insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('{org}','{owner}','owner','active',now());
      insert into public.productions(id,organization_id,name,slug) values('{prod}','{org}','Fictional related production','related');
      do $$begin perform set_config('related.org','{org}',true);perform set_config('related.run','{ids['run']}',true);end;$$;''']
    for n,key in enumerate(['alpha','bravo']):
        sql.append(f"insert into public.production_days(id,organization_id,production_id,position,created_by,updated_by) values('{ids['day-'+key]}','{org}','{prod}',{n},'{owner}','{owner}');")
        sql.append(f"insert into public.schedules(id,organization_id,production_id,production_day_id,display_name,slug,created_by,updated_by) values('{ids[key]}','{org}','{prod}','{ids['day-'+key]}','{key}','{key}','{owner}','{owner}');")
    sql.append(Path(__file__).with_name('related_rehearsal.sql').read_text())
    def step(name,fn,p):
        args=encoded(p['records'])
        if fn!='related_reconcile':args+=','+encoded(p['documents'])
        sql.append(f"select jsonb_build_object('step',{literal(name)},'result',pg_temp.{fn}({args}));")
    step('dry-run','related_reconcile',first)
    step('initial-import','related_import',first);step('initial-rerun','related_import',first)
    step('initial-reconciliation','related_reconcile',first)
    step('latest-before-catchup','related_reconcile',last)
    # Fail later in a batch: earlier CMS record should be rolled back as well.
    later=next(r['id'] for r in last['records'] if r['store']=='schedule-templates')
    sql.append(f"create function pg_temp.fail_related_history() returns trigger language plpgsql as $$begin if new.record_id='{later}'::uuid then raise exception 'fictional history failure'; end if;return new;end;$$;")
    sql.append('create trigger related_failure before insert on private.migration_record_versions for each row execute function pg_temp.fail_related_history();')
    step('history-failure-rollback','related_refuses',last)
    sql.append('drop trigger related_failure on private.migration_record_versions;')
    step('delta-catchup','related_import',last);step('delta-rerun','related_import',last)
    step('final-reconciliation','related_reconcile',last)
    step('stale-source-refused','related_refuses',first)
    duplicate=copy.deepcopy(last);duplicate['records'].append(duplicate['records'][0])
    step('duplicate-refused','related_refuses',duplicate);step('duplicate-reconciliation','related_reconcile',duplicate)
    invalid=copy.deepcopy(last);invalid['documents'][-1]={'meta':{},'rows':[{'dur':'00:99'}]}
    step('invalid-document-refused','related_refuses',invalid)
    drift_ids={store:next(r['id'] for r in last['records'] if r['store']==store and r['item']=='') for store in sorted({b['store'] for b in latest})}
    for store,drift in drift_ids.items():
        sql.append('savepoint drift;')
        sql.append(f"update private.migration_records set payload='{{\"syntheticDrift\":true}}' where id='{drift}';")
        step(store+'-drift-detected','related_reconcile',last);step(store+'-drift-refused','related_refuses',last)
        sql.append('rollback to savepoint drift;')
    step('final-after-negative-cases','related_reconcile',last)
    sql.append('rollback;')
    result=subprocess.run(['docker','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],input='\n'.join(sql),text=True,capture_output=True,timeout=60)
    if result.returncode:raise RuntimeError('Synthetic related rehearsal failed: '+result.stderr)
    steps=[json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
    data={r['step']:r['result'] for r in steps}
    assert data['initial-import']=={'inserted':9,'updated':0,'skipped':0}
    assert data['initial-rerun']=={'inserted':0,'updated':0,'skipped':9}
    assert len(data['latest-before-catchup']['missing'])==2 and len(data['latest-before-catchup']['mismatched'])==9
    assert data['delta-catchup']=={'inserted':2,'updated':9,'skipped':0}
    assert data['delta-rerun']=={'inserted':0,'updated':0,'skipped':11}
    assert data['final-reconciliation']['catalogue_verified']
    assert data['final-after-negative-cases']==data['final-reconciliation']
    for store,drift in drift_ids.items():
        assert data[store+'-drift-detected']['mismatched']==[drift]
        assert data[store+'-drift-refused']=={'rejected':True,'records_history_unchanged':True}
    assert data['duplicate-reconciliation']['duplicates']==[last['records'][0]['id']]
    for name in ['history-failure-rollback','stale-source-refused','duplicate-refused','invalid-document-refused']:
        assert data[name]=={'rejected':True,'records_history_unchanged':True}
    report={'scope':'fictional private related-store catalogue; transaction rolled back','source_stores':sorted({b['store'] for b in latest}),
            'source_blobs':4,'active_records':10,'explicit_tombstones':1,'steps':steps,'catalogue_verified':True,
            'application_parity':False,'migration_complete':False,'remaining_decisions':last['decisions'],
            'next_contracts':'approved application access/projection and lifecycle contracts; then local account/editor integration'}
    Path(args.report).write_text(json.dumps(report,indent=2)+'\n')
    print('PASS: four related stores; collection/leaf payloads, tenant references and all history verified')
    print('PASS: initial/rerun/delta/tombstone; duplicate, invalid, stale and drift refusal; mid-batch history failure rolls back')
    print('PASS: fictional fixtures rolled back; runtime parity and unresolved application policies remain open')
    print('Report: '+str(Path(args.report).resolve()))

if __name__=='__main__':run()
