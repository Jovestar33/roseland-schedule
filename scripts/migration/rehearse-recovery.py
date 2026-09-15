#!/usr/bin/env python3
"""Persistent fictional checkpoints and isolated database rollback/replay rehearsal.

Never connects to Netlify or a hosted database. Retains its new fictional fixture,
frozen recovery databases and on-disk artifacts for inspection/retry.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import uuid
from recovery_contract import HEADER, TABLE_KEYS, checkpoint, journal, replay, reconcile, require, digest
from recovery_runtime import LocalRecovery, literal, encoded
from related_contract import plan
from related_fixtures import fixtures


def save(path, value):
    content = value if isinstance(value,str) else json.dumps(value,indent=2,sort_keys=True)+'\n'
    temporary=path.with_name(path.name+'.partial')
    with temporary.open('x',encoding='utf8') as stream:
        temporary.chmod(0o600); stream.write(content); stream.flush(); os.fsync(stream.fileno())
    # Publish only complete content, without replacing an existing checkpoint.
    os.link(temporary,path); temporary.unlink()
    directory=os.open(path.parent,os.O_RDONLY)
    try: os.fsync(directory)
    finally: os.close(directory)


def run():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workdir',required=True); parser.add_argument('--output-dir',required=True)
    args=parser.parse_args(); output=Path(args.output_dir).resolve(); output.mkdir(mode=0o700)
    runtime=LocalRecovery(args.workdir)
    run_id=str(uuid.uuid4()); ns=uuid.UUID(run_id)
    ids={name:str(uuid.uuid5(ns,name)) for name in ['owner','org','production','phase','alpha','bravo','charlie','day-alpha','day-bravo','day-charlie']}
    owner,org,prod,phase=[ids[k] for k in ['owner','org','production','phase']]
    schema=runtime.schema(); save(output/'schema.sql',schema)
    commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
    header={'format':'fictional-recovery-v1','run_id':run_id,'organization_id':org,'owner_id':owner,
            'code_commit':commit,'schema_sha256':hashlib.sha256(schema.encode()).hexdigest()}
    def actor_sql():
        return "select set_config('request.jwt.claims',"+literal(json.dumps({'sub':owner,'role':'authenticated'})) + ",true);"
    def transaction(body,database='postgres'):
        return runtime.sql("begin; set local statement_timeout='30s';"+actor_sql()+body+'commit;',database)
    base_blobs,latest_blobs=fixtures(); refs={k:ids[k] for k in ['alpha','bravo']}
    base_plan=plan(org,'fictional-recovery',base_blobs,refs); latest_plan=plan(org,'fictional-recovery',latest_blobs,refs)
    after_ids={r['id'] for r in latest_plan['records']}
    for record in base_plan['records']:
        if record['id'] not in after_ids:
            removed=copy.deepcopy(record); removed.update(revision=2,tombstone=True); latest_plan['records'].append(removed)
    helper=Path(__file__).with_name('related_rehearsal.sql').read_text()
    def related_sql(value):
        return "select set_config('related.run',"+literal(run_id)+",true);"+helper+\
               'select pg_temp.related_import('+encoded(value['records'])+','+encoded(value['documents'])+');'
    doc={'meta':{'town':'Fictional recovery town','callsheet':{'notes':'Pre-cutover call sheet'}},
         'rows':[{'action':'Shoot','dur':'00:00','contactName':'Fictional Contact','subLocations':[{'id':'gate','loc':'Fictional gate'}]}], 'savedAt':100}
    setup=f"""insert into auth.users(id,email,role,aud,email_confirmed_at) values
      ('{owner}','recovery-{run_id}@example.test','authenticated','authenticated',now());
      insert into public.organizations(id,name,slug) values('{org}','Fictional recovery tenant','recovery-{run_id}');
      insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values('{org}','{owner}','owner','active',now());
      insert into public.productions(id,organization_id,name,slug) values('{prod}','{org}','Fictional recovery production','recovery');
      insert into public.phases(id,organization_id,production_id,name,position,created_by,updated_by) values('{phase}','{org}','{prod}','Fictional shoot',0,'{owner}','{owner}');"""
    for position,name in enumerate(['alpha','bravo']):
        setup+=f"insert into public.production_days(id,organization_id,production_id,phase_id,position,created_by,updated_by) values('{ids['day-'+name]}','{org}','{prod}','{phase}',{position},'{owner}','{owner}');"
        setup+=f"select public.create_schedule('{ids[name]}','{ids['day-'+name]}','Fictional {name}','{name}',{encoded(doc)},1);"
    transaction(setup+related_sql(base_plan))
    base=runtime.capture(header); save(output/'checkpoint.json',base)
    # After simulated cutover the target is the only mutable data source; the
    # baseline file is immutable. Two separately committed journal intervals.
    changed=copy.deepcopy(doc); changed['meta']['callsheet']['notes']='Accepted target edit after cutover'; changed['rows'][0]['notes']='Keep this newer target note'; changed['savedAt']=200
    new_doc=copy.deepcopy(changed); new_doc['meta']['town']='Fictional new target day'
    transaction(f"""select public.update_schedule_document('{ids['alpha']}',1,{encoded(changed)},1);
      select public.mutate_schedule('{ids['alpha']}',2,'rename','{{"display_name":"Fictional alpha renamed","slug":"alpha-renamed"}}');
      select public.mutate_schedule('{ids['bravo']}',1,'archive','{{}}');
      insert into public.production_days(id,organization_id,production_id,phase_id,position,created_by,updated_by)
        values('{ids['day-charlie']}','{org}','{prod}','{phase}',2,'{owner}','{owner}');
      select public.create_schedule('{ids['charlie']}','{ids['day-charlie']}','Fictional charlie','charlie',{encoded(new_doc)},1);
      select public.update_schedule_document('{ids['charlie']}',1,{encoded(changed)},1);""")
    middle=runtime.capture(header); delta1=journal(base,middle); save(output/'journal-1.json',delta1)
    transaction(related_sql(latest_plan))
    transaction(f"update public.organization_memberships set status='suspended' where organization_id='{org}' and user_id='{owner}';")
    final=runtime.capture(header); delta2=journal(middle,final); save(output/'journal-2.json',delta2); save(output/'frozen-target.json',final)
    require(replay(replay(base,delta1),delta2)==final,'Journal chain lost target edits')
    def denied_writer(database):
        transaction(f"""set local role authenticated; do $$begin
          perform public.update_schedule_document('{ids['alpha']}',3,{encoded(changed)},1);
          raise exception 'Frozen writer unexpectedly succeeded';
          exception when sqlstate 'PT404' then null;end;$$;""",database)
    denied_writer('postgres')
    database=runtime.create_database(run_id,schema)
    empty=runtime.capture(header,database,scoped=False)
    tests=[]
    def passed(name): tests.append({'check':name,'passed':True}); print('PASS: '+name)
    def refuses(name,action,expected,reason):
        marker=runtime.sql('select row_to_json(c) from private.recovery_control c;',database)
        rejected=False
        try: action()
        except (RuntimeError,ValueError) as error:
            require(reason in str(error),'Rejected for the wrong reason: '+str(error)); rejected=True
        require(rejected,'Expected rejection: '+name)
        require(runtime.capture(header,database,scoped=False)==expected,'Failed operation left partial state')
        require(runtime.sql('select row_to_json(c) from private.recovery_control c;',database)==marker,'Failed operation changed retry/authority marker')
        runtime.integrity(database); passed(name)
    refuses('mid-checkpoint failure rolls back rows and trigger changes',lambda:runtime.apply(database,None,base,base['sha256'],fail_after=7),empty,'Injected mid-restore failure')
    incomplete=copy.deepcopy(base['tables']); incomplete['public.schedule_versions']=[]
    invalid_checkpoint=checkpoint(header,incomplete)
    refuses('missing history rejects the whole restore before acknowledgement',lambda:runtime.apply(database,None,invalid_checkpoint,invalid_checkpoint['sha256']),empty,'Recovery history/reference integrity failed')
    runtime.apply(database,None,base,base['sha256']); runtime.apply(database,None,base,base['sha256'])
    passed('checkpoint restores exact IDs, fields, histories and idempotent retry')
    refuses('out-of-order journal rejected without mutation',lambda:runtime.apply(database,middle,final,delta2['sha256']),base,'Recovery checkpoint precondition mismatch')
    refuses('partial schedule/history replay rolls back atomically',lambda:runtime.apply(database,base,middle,delta1['sha256'],fail_after=7),base,'Injected mid-restore failure')
    runtime.apply(database,base,middle,delta1['sha256']); runtime.apply(database,base,middle,delta1['sha256'])
    passed('schedule journal replay and lost-acknowledgement retry preserve all versions')
    refuses('partial related-store replay rolls back earlier records/history',lambda:runtime.apply(database,middle,final,delta2['sha256'],fail_after=12),middle,'Injected mid-restore failure')
    runtime.apply(database,middle,final,delta2['sha256']); runtime.apply(database,middle,final,delta2['sha256'])
    passed('related snapshots/templates/library/CMS and explicit tombstone restored with all histories')
    refuses('stale checkpoint cannot roll target data backward',lambda:runtime.apply(database,None,base,base['sha256']),final,'Recovery checkpoint precondition mismatch')
    denied_writer(database); denied_writer('postgres')
    primary_reconciliation=reconcile(final,runtime.capture(header,database,scoped=False)['tables'])
    require(primary_reconciliation['verified'],'Reconciliation incomplete')
    integrity=runtime.integrity(database)
    require(runtime.sql(f"select count(*) from public.organization_memberships where organization_id='{org}' and status='active';")=='0','Old writer not frozen')
    # Explicit local rehearsal activation only after exact recovery; this does
    # not switch a hosted endpoint or connect an Auth service to the recovery DB.
    transaction(f"""lock table private.recovery_control in exclusive mode;
      do $$begin if not exists(select 1 from private.recovery_control where mode='frozen' and applied_hash='{delta2['sha256']}') then raise exception 'Recovery gate not ready';end if;end;$$;
      update public.organization_memberships set status='active' where organization_id='{org}' and user_id='{owner}';
      update private.recovery_control set mode='active';""",database)
    after_recovery=copy.deepcopy(changed); after_recovery['rows'][0]['notes']='Accepted edit on recovered authoritative database'
    transaction(f"select public.update_schedule_document('{ids['alpha']}',3,{encoded(after_recovery)},1);",database)
    recovered=runtime.capture(header,database,scoped=False)
    refuses('active recovery writer blocks replay and retains its newer edit',lambda:runtime.apply(database,middle,final,delta2['sha256']),recovered,'Recovery writer is active')
    denied_writer('postgres')
    require(runtime.capture(header)==final,'Old source changed after freeze')
    passed('one ordinary writer: old source denied, recovered writer saved a new immutable version')
    transaction(f"update public.organization_memberships set status='suspended' where organization_id='{org}' and user_id='{owner}'; update private.recovery_control set mode='frozen';",database)
    denied_writer(database)
    # Capture the authoritative final state only after its write freeze commits.
    recovered=runtime.capture(header,database,scoped=False)
    delta3=journal(final,recovered); save(output/'journal-3.json',delta3); save(output/'recovered-edits.json',recovered)
    refuses('frozen target drift still refuses stale replay and preserves newer edits',lambda:runtime.apply(database,middle,final,delta2['sha256']),recovered,'Recovery checkpoint precondition mismatch')
    file_names=['schema.sql','checkpoint.json','journal-1.json','journal-2.json','journal-3.json']
    manifest={'format':'fictional-recovery-files-v1','files':{name:hashlib.sha256((output/name).read_bytes()).hexdigest() for name in file_names}}
    manifest['sha256']=digest(manifest); save(output/'manifest.json',manifest)
    module_spec=importlib.util.spec_from_file_location('recover_fictional',Path(__file__).with_name('recover-fictional.py'))
    module=importlib.util.module_from_spec(module_spec); module_spec.loader.exec_module(module)
    # A fresh database built only from persisted files proves recoverability;
    # resume uses the durable marker and does not duplicate history.
    second=module.recover(runtime,output,2); resumed=module.recover(runtime,output,2,True)
    require(second==resumed,'Resume changed recovered result')
    denied_writer(second['database'])
    passed('independent file-only rebuild restores every newer edit; resumed replay is identical')
    report={'scope':'fictional local SQL recovery; no connected Auth/API service or hosted changes',
      'code_checkpoint':commit,'run_id':run_id,'organization_id':org,'source_database':'postgres',
      'recovery_databases':[database,second['database']],'tests':tests,'post_cutover_reconciliation':primary_reconciliation,
      'latest_recovery':second,'integrity':integrity,'artifacts_sha256':manifest['sha256'],
      'writer_state':'all rehearsal fixture writers frozen at completion; original unrelated tenants untouched',
      'application_parity':False,'migration_complete':False,
      'excluded':['Auth credentials/sessions and real account lifecycle','membership/permission recovery beyond the explicit fictional owner freeze',
        'hosted configuration/Storage/Realtime','Netlify reverse export or endpoint cutover','actual paired runtime parity',
        'real related-store ownership/retention policies','global F01-F05 security/account/projection gaps']}
    save(output/'report.json',report)
    print('Recovery artifacts: '+str(output)); print('PASS: all newer fictional data and histories recoverable; real migration gates remain open')


if __name__=='__main__': run()
