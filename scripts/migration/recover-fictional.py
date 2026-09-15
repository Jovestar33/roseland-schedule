#!/usr/bin/env python3
"""Restore trusted fictional rehearsal artifacts to a new isolated local database.

No arbitrary destination database, live export, Auth credentials or hosted URL.
The destination remains frozen and disconnected from Supabase services.
"""
import argparse
import hashlib
import json
from pathlib import Path
from recovery_contract import verify_checkpoint, replay, require, digest, reconcile
from recovery_runtime import LocalRecovery


def recover(runtime, directory, generation, resume=False):
    root = Path(directory)
    manifest = json.loads((root/'manifest.json').read_text())
    require(set(manifest) == {'format','files','sha256'}, 'Unexpected recovery manifest')
    require(manifest['format'] == 'fictional-recovery-files-v1', 'Unsupported artifact scope')
    require(digest({k:v for k,v in manifest.items() if k != 'sha256'}) == manifest['sha256'], 'Manifest hash mismatch')
    require(set(manifest['files']) == {'schema.sql','checkpoint.json','journal-1.json','journal-2.json','journal-3.json'}, 'Incomplete recovery file inventory')
    for name, expected in manifest['files'].items():
        require(hashlib.sha256((root/name).read_bytes()).hexdigest() == expected, 'Artifact checksum mismatch: '+name)
    schema = (root/'schema.sql').read_text()
    state = verify_checkpoint(json.loads((root/'checkpoint.json').read_text()))
    require(hashlib.sha256(schema.encode()).hexdigest() == state['schema_sha256'], 'Schema/checkpoint mismatch')
    # Verify the entire chain before creating or writing any destination.
    stages = [(state, state['sha256'])]
    for name in ['journal-1.json','journal-2.json','journal-3.json']:
        delta = json.loads((root/name).read_text()); state = replay(state, delta); stages.append((state,delta['sha256']))
    database = 'roseland_recovery_' + state['run_id'].replace('-','') + '_' + str(generation)
    if resume:
        runtime.guard_database(database, state['run_id'])
    else:
        database = runtime.create_database(state['run_id'], schema, generation)
    applied = runtime.sql('select coalesce(applied_hash,\'\') from private.recovery_control;', database)
    known = ['', *[packet for _,packet in stages]]
    require(applied in known, 'Unknown recovery position; inspect rather than overwrite')
    start = max(0, known.index(applied)-1)  # Revalidate the last acknowledgement on a retry.
    for index in range(start, len(stages)):
        after, packet = stages[index]
        runtime.apply(database, stages[index-1][0] if index else None, after, packet)
    actual = runtime.capture({k:state[k] for k in state if k not in ('tables','sha256')},database,scoped=False)
    result = reconcile(state,actual['tables']); require(result['verified'], 'Recovery reconciliation failed')
    return {'database':database,'checkpoint_sha256':state['sha256'],'reconciliation':result,'integrity':runtime.integrity(database),
            'writer':'frozen','application_parity':False,'migration_complete':False}


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workdir',required=True); parser.add_argument('--artifacts',required=True)
    parser.add_argument('--generation',type=int,required=True); parser.add_argument('--resume',action='store_true')
    args=parser.parse_args()
    result=recover(LocalRecovery(args.workdir),args.artifacts,args.generation,args.resume)
    print(json.dumps(result,indent=2))
