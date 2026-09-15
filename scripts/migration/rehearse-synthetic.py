#!/usr/bin/env python3
"""Synthetic-only, local database migration rehearsal; always rolls back.

No export/network client, credentials, live input files, or hosted URLs accepted.
This limited experiment is not a production importer or a cutover approval.
"""
import argparse
import copy
import json
from pathlib import Path
import re
import subprocess
import uuid

NAMESPACE = uuid.UUID('549bbce8-9b26-5e4e-8a19-e4bc80e74d3a')


def stable_id(kind, key):
    # The checksum/revision is deliberately NOT part of permanent identity.
    return str(uuid.uuid5(NAMESPACE, kind + '/' + key))


def schedule(key, position):
    return dict(key=key, id=stable_id('schedules', key), day_id=stable_id('days', key),
                position=position, date=f'2026-09-{20 + position}', revision=1,
                name=f'Fictional rehearsal {key}', slug=f'rehearsal-{key}',
                document={'meta': {'town': f'Fictional town {key}'},
                          'rows': [{'action': 'Shoot', 'desc': 'Synthetic rehearsal only', 'dur': '00:00',
                                    'contactName': 'Test Person', 'subLocations': [{'id': 'gate', 'loc': 'Test gate'}]}],
                          'savedAt': 100 + position})


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def encoded(value):
    return literal(json.dumps(value, ensure_ascii=False, separators=(',', ':'))) + '::jsonb'


def run():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workdir', required=True)
    parser.add_argument('--report', required=True)
    args = parser.parse_args()
    root = Path(args.workdir).resolve()
    assert not (root / 'supabase/.temp/project-ref').exists(), 'Linked projects refused'
    config = (root / 'supabase/config.toml').read_text()
    project = re.search(r'^project_id\s*=\s*"([\w-]+)"', config, re.M).group(1)
    container = 'supabase_db_' + project
    info = json.loads(subprocess.check_output(['docker', 'inspect', container], text=True))[0]
    assert info['Name'] == '/' + container and 'supabase/postgres' in info['Config']['Image'], 'Local database required'
    base = [schedule('alpha', 0), schedule('bravo', 1)]
    latest = copy.deepcopy(base)
    latest[0]['revision'] = 2
    latest[0]['document']['rows'][0]['desc'] = 'Synthetic edit arriving after initial copy'
    latest[0]['document']['savedAt'] = 200
    latest.append(schedule('charlie', 2))
    # Related stores are inventoried, deliberately NOT falsely counted as migrated.
    related = {
        'schedule-snapshots': {'alpha': [{'id': 'snapshot-1', 'timestamp': 90, 'data': base[0]['document']}]},
        'schedule-library': {'library': {'folders': ['Fictional production'], 'scheduleToFolder': {'alpha': 'Fictional production'}}},
        'schedule-templates': {'templates': {'Fictional template': base[0]['document']}},
        'cms': {'rp_cms_config': {'title': 'Fictional rehearsal'}},
    }
    owner, org, prod, phase = [stable_id('fixture', x) for x in ['owner', 'org', 'production', 'phase']]
    sql = [f'''begin; set local statement_timeout='30s';
    insert into auth.users(id,email,role,aud,email_confirmed_at) values('{owner}','migration-rehearsal@example.test','authenticated','authenticated',now());
    insert into public.organizations(id,name,slug) values('{org}','Synthetic migration rehearsal','synthetic-migration-rehearsal');
    insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('{org}','{owner}','owner','active',now());
    insert into public.productions(id,organization_id,name,slug) values('{prod}','{org}','Fictional production','fictional');
    insert into public.phases(id,organization_id,production_id,name,position,created_by,updated_by) values('{phase}','{org}','{prod}','Fictional phase',0,'{owner}','{owner}');
    do $$begin
      perform set_config('request.jwt.claims','{{"sub":"{owner}","role":"authenticated"}}',true);
      perform set_config('rehearsal.org','{org}',true);
      perform set_config('rehearsal.production','{prod}',true);
      perform set_config('rehearsal.phase','{phase}',true);
    end;$$;
    ''', Path(__file__).with_name('rehearsal.sql').read_text()]

    def step(name, expression):
        sql.append(f"select jsonb_build_object('step',{literal(name)},'result',({expression}));")

    def imp(value): return 'pg_temp.rehearsal_import(' + encoded(value) + ')'
    def rec(value, boundary): return 'pg_temp.rehearsal_reconcile(' + encoded(value) + ',' + literal(boundary) + ')'
    def reject(value): return 'pg_temp.rehearsal_expect_rejection(' + encoded(value) + ')'

    step('dry-run', rec(base, 'synthetic revision set 1, before import'))
    step('initial-import', imp(base))
    step('identical-rerun', imp(base))
    step('initial-reconciliation', rec(base, 'synthetic revision set 1'))
    step('latest-before-catchup', rec(latest, 'synthetic revision set 2, source edits arrived'))
    step('delta-catchup', imp(latest))
    step('delta-rerun', imp(latest))
    step('final-reconciliation', rec(latest, 'synthetic writes frozen at revision set 2'))
    step('stale-export-refused', reject(base))
    step('duplicate-source-refused', reject(latest + [latest[0]]))
    step('duplicate-source-reconciliation', rec(latest + [latest[0]], 'injected duplicate source record'))
    bad = copy.deepcopy(latest)
    bad[0]['revision'] += 1
    bad[0]['document']['meta']['town'] = 'Should roll back'
    bad[-1]['document']['rows'][0]['dur'] = '00:99'
    step('malformed-batch-refused', reject(bad))
    sql.append('savepoint target_drift;')
    sql.append(f"do $$begin perform public.update_schedule_document('{base[0]['id']}',2,'{{\"meta\":{{}},\"rows\":[]}}',1); end;$$;")
    step('target-drift-reconciliation', rec(latest, 'injected independent target edit'))
    step('target-drift-refused', reject(latest))
    sql.append('rollback to savepoint target_drift;')
    sql.append('savepoint midbatch_failure;')
    sql.append(f"do $$begin perform public.update_schedule_document('{base[1]['id']}',1,'{{\"meta\":{{}},\"rows\":[]}}',1); end;$$;")
    partial = copy.deepcopy(latest)
    partial[0]['revision'] = 3
    partial[0]['document']['meta']['town'] = 'Must roll back when second record conflicts'
    step('midbatch-failure-refused', reject(partial))
    sql.append('rollback to savepoint midbatch_failure;')
    step('verified-after-negative-tests', rec(latest, 'synthetic writes frozen at revision set 2'))
    sql.append('rollback;')
    result = subprocess.run(['docker','exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],
                            input='\n'.join(sql), text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError('Synthetic database rehearsal failed: ' + result.stderr)
    steps = [json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
    by_name = {s['step']: s['result'] for s in steps}
    assert by_name['initial-import'] == {'inserted': 2, 'updated': 0, 'skipped': 0}
    assert by_name['identical-rerun'] == {'inserted': 0, 'updated': 0, 'skipped': 2}
    stale = by_name['latest-before-catchup']
    assert stale['missing'] == ['charlie'] and stale['mismatched'] == ['alpha'] and not stale['schedule_copy_verified']
    assert by_name['delta-catchup'] == {'inserted': 1, 'updated': 1, 'skipped': 1}
    assert by_name['delta-rerun'] == {'inserted': 0, 'updated': 0, 'skipped': 3}
    final = by_name['final-reconciliation']
    assert final['schedule_copy_verified'] and not final['migration_complete']
    assert by_name['target-drift-reconciliation']['mismatched'] == ['alpha']
    assert sorted(by_name['duplicate-source-reconciliation']['duplicates']) == sorted(['alpha',base[0]['id']])
    assert by_name['verified-after-negative-tests'] == final
    for name in ['stale-export-refused','duplicate-source-refused','malformed-batch-refused','target-drift-refused','midbatch-failure-refused']:
        assert by_name[name] == {'rejected': True, 'rows_history_mappings_unchanged': True}
    inventory = [{'store': 'schedules', 'records': len(latest), 'coverage': 'current document, mapped revision and current target history verified'}]
    for store, objects in related.items():
        inventory.append({'store': store, 'records': len(objects), 'coverage': 'inventoried only; runtime import/reconciliation unresolved'})
    report = {'scope': 'synthetic local rehearsal; entire transaction rolled back',
              'identity': 'UUIDv5(namespace, entity/store + source key); source revision/checksum stored separately',
              'inventory': inventory, 'steps': steps, 'migration_complete': False,
              'failed_records_in_negative_cases': [
                  {'source_key':'charlie','reason':'malformed duration; whole batch refused'},
                  {'source_key':'alpha','reason':'target divergence; overwrite refused'},
                  {'source_key':'bravo','reason':'second-record target divergence; prior first-record update rolled back'}],
              'netlify_availability_required': True, 'authoritative_writer': 'Netlify until separately approved cutover',
              'post_cutover_netlify_behavior': 'decision required; preserve availability, no inferred independent dual writes'}
    Path(args.report).write_text(json.dumps(report, indent=2) + '\n')
    print('PASS: deterministic mapping; identical reruns; delta catch-up; per-schedule revision/content/history reconciliation')
    print('PASS: stale copy, duplicate, malformed batch and target divergence detected; failed imports leave state unchanged')
    print('PASS: all fixtures rolled back; related-store and hosted acceptance gates remain explicitly incomplete')
    print('Report: ' + str(Path(args.report).resolve()))


if __name__ == '__main__':
    run()
