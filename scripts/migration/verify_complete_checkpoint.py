"""Read-only verification of the retained B12 checkpoint after application reads."""
import json, subprocess
from pathlib import Path
from capture_contract import build_plan, canonical, digest
stack=Path('/private/tmp/roseland-b08-20260917')
assert not (stack/'supabase/.temp/project-ref').exists()
assert 'project_id = "roseland-b08-20260917"' in (stack/'supabase/config.toml').read_text()
root=Path(json.loads(Path('/private/tmp/roseland-b12-current.json').read_text())['root'])
report=json.loads((root/'report.json').read_text());receipts=json.loads((root/'checkpoints.json').read_text())
assert report['application_readback'] is True
base=build_plan(receipts[0]['capture']);latest=build_plan(receipts[1]['capture'],base)
assert base==json.loads((root/'base-plan.json').read_text())
assert latest==json.loads((root/'latest-plan.json').read_text())
assert receipts[-1]['target_state']==json.loads((root/'final-state.json').read_text())
org=report['organization'];helpers=(Path(__file__).parent/'complete_import.sql').read_text()
def sql(query):
 return subprocess.check_output(['docker','exec','-i','supabase_db_roseland-b08-20260917','psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],input=helpers+query,text=True).strip()
assert json.loads(sql("select pg_temp.capture_state('"+org+"');"))==receipts[-1]['target_state']
assert sql("select bool_and(not has_table_privilege(r,'private.migration_capture_runs',p))from unnest(array['anon','authenticated','service_role'])r cross join unnest(array['SELECT','INSERT','UPDATE','DELETE'])p;")=='t'
# These blocks are rollback-only trigger probes, not changes to retained rows.
for operation in ['update private.migration_capture_runs set source_epoch=source_epoch','delete from private.migration_capture_runs']:
 statement="do $test$ declare refused boolean:=false;begin begin "+operation+" where organization_id='"+org+"';exception when others then if sqlerrm not like '%immutable%' and sqlerrm not like '%append-only%' then raise;end if;refused:=true;end;if not refused then raise exception 'Checkpoint mutation allowed';end if;end $test$;"
 sql('begin;'+statement+'rollback;')
report['checkpoint_checks']=['Original base and latest captures reconstruct identical plans including private browser dispositions','Application reads left captured organization state unchanged','Anon authenticated and service roles have no checkpoint table privileges','Checkpoint update and delete both refused by immutable-history trigger']
report['checkpoint_digest']=digest(receipts);report['checkpoint_verified']=True
(root/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS 4 retained-checkpoint checks')
