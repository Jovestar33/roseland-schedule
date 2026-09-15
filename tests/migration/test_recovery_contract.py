import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/migration'))
from recovery_contract import TABLE_KEYS, checkpoint, journal, replay, reconcile, verify_checkpoint, digest, InvalidRecovery
from recovery_runtime import LocalRecovery

RUN='aaaaaaaa-0000-4000-8000-000000000001'
ORG='aaaaaaaa-0000-4000-8000-000000000002'
OWNER='aaaaaaaa-0000-4000-8000-000000000003'


class RecoveryContract(unittest.TestCase):
    def setUp(self):
        self.header={'format':'fictional-recovery-v1','run_id':RUN,'organization_id':ORG,'owner_id':OWNER,'code_commit':'a'*40,'schema_sha256':'b'*64}
        self.tables={table:[] for table in TABLE_KEYS}
        self.tables['auth.users']=[{'id':OWNER,'email':f'recovery-{RUN}@example.test'}]
        self.tables['public.organizations']=[{'id':ORG}]
        self.tables['public.schedules']=[{'id':'schedule-a','organization_id':ORG,'document_version':1,'document':{'meta':{},'rows':[]}}]
        self.tables['public.schedule_versions']=[{'id':'version-a-1','organization_id':ORG,'version':1,'document':{'meta':{},'rows':[]}}]
        self.base=checkpoint(self.header,self.tables)
        self.new=copy.deepcopy(self.tables)
        self.new['public.schedules'][0].update(document_version=2,document={'meta':{'callsheet':{'notes':'New target note'}},'rows':[{'dur':'00:00','subLocations':[{'loc':'Gate'}]}]})
        self.new['public.schedule_versions'].append({'id':'version-a-2','organization_id':ORG,'version':2,'document':copy.deepcopy(self.new['public.schedules'][0]['document'])})
        self.new['private.migration_records']=[{'id':'cms-a','organization_id':ORG,'payload':{'labels':{'title':'Changed CMS'}}}]
        self.final=checkpoint(self.header,self.new)

    def test_round_trip_preserves_new_target_edits_and_history(self):
        delta=journal(self.base,self.final)
        self.assertEqual(replay(self.base,delta),self.final)
        self.assertEqual(len(delta['changes']),3)
        self.assertTrue(reconcile(self.final,self.new)['verified'])

    def test_checkpoint_order_is_canonical(self):
        self.new['public.schedule_versions'].reverse()
        self.assertEqual(checkpoint(self.header,self.new),self.final)

    def test_tampered_checkpoint_rejected(self):
        bad=copy.deepcopy(self.base);bad['tables']['public.schedules'][0]['document_version']=99
        with self.assertRaises(InvalidRecovery): verify_checkpoint(bad)

    def test_auth_secrets_and_other_accounts_rejected(self):
        for field,value in [('encrypted_password','secret'),('refresh_token','secret'),('email','actual@example.com')]:
            bad=copy.deepcopy(self.tables);bad['auth.users'][0][field]=value
            with self.assertRaises(InvalidRecovery): checkpoint(self.header,bad)

    def test_incomplete_or_unknown_table_inventory_rejected(self):
        for name in ['missing','unknown']:
            bad=copy.deepcopy(self.tables)
            if name=='missing': del bad['private.migration_records']
            else: bad['auth.sessions']=[]
            with self.assertRaises(InvalidRecovery): checkpoint(self.header,bad)

    def test_duplicate_and_cross_tenant_records_rejected(self):
        bad=copy.deepcopy(self.tables);bad['public.schedules'].append(bad['public.schedules'][0])
        with self.assertRaises(InvalidRecovery): checkpoint(self.header,bad)
        bad=copy.deepcopy(self.tables);bad['public.schedules'][0]['organization_id']=OWNER
        with self.assertRaises(InvalidRecovery): checkpoint(self.header,bad)

    def test_hard_deletion_and_immutable_history_rewrites_rejected(self):
        for name in ['missing','history']:
            bad=copy.deepcopy(self.new)
            if name=='missing': bad['public.schedules']=[]
            else: bad['public.schedule_versions'][0]['document']={'tampered':True}
            with self.assertRaises(InvalidRecovery): journal(self.base,checkpoint(self.header,bad))

    def test_wrong_predecessor_and_foreign_run_refused(self):
        delta=journal(self.base,self.final)
        with self.assertRaises(InvalidRecovery): replay(self.final,delta)
        delta['run_id']=ORG;delta['sha256']=digest({k:v for k,v in delta.items() if k!='sha256'})
        with self.assertRaises(InvalidRecovery): replay(self.base,delta)

    def test_incomplete_journal_fails_even_with_recomputed_transport_hash(self):
        delta=journal(self.base,self.final);delta['changes'].pop()
        delta['sha256']=digest({k:v for k,v in delta.items() if k!='sha256'})
        with self.assertRaises(InvalidRecovery): replay(self.base,delta)

    def test_duplicate_changes_and_bad_preconditions_refused(self):
        for kind in ['duplicate','precondition']:
            delta=journal(self.base,self.final)
            if kind=='duplicate':delta['changes'].append(delta['changes'][0])
            else:delta['changes'][0]['expected_sha256']='c'*64
            delta['sha256']=digest({k:v for k,v in delta.items() if k!='sha256'})
            with self.assertRaises(InvalidRecovery): replay(self.base,delta)

    def test_count_equality_cannot_hide_mismatched_data(self):
        bad=copy.deepcopy(self.new);bad['public.schedules'][0]['document']={'meta':{},'rows':[]}
        result=reconcile(self.final,bad)
        self.assertFalse(result['verified']);self.assertEqual(len(result['mismatched']),1)
        self.assertEqual(result['missing'],[])

    def test_missing_unexpected_and_duplicate_records_are_explicit(self):
        bad=copy.deepcopy(self.new);bad['public.schedules']=[]
        bad['public.organizations'].append({'id':'unexpected'})
        bad['public.schedule_versions'].append(bad['public.schedule_versions'][0])
        result=reconcile(self.final,bad)
        self.assertFalse(result['verified']);self.assertEqual(len(result['missing']),1)
        self.assertEqual(len(result['unexpected']),1);self.assertEqual(len(result['duplicates']),1)

    def test_restore_cannot_target_source_or_another_run(self):
        runtime=LocalRecovery.__new__(LocalRecovery)
        calls=[];runtime.sql=lambda *args: calls.append(args)
        for database in ['postgres','template1','roseland_recovery_'+ORG.replace('-','')+'_1']:
            with self.assertRaises(InvalidRecovery):runtime.guard_database(database,RUN)
        self.assertEqual(calls,[])

    def test_existing_recovery_database_is_never_replaced(self):
        runtime=LocalRecovery.__new__(LocalRecovery)
        calls=[]
        def exists(statement):calls.append(statement);return '1'
        runtime.sql=exists
        with self.assertRaises(InvalidRecovery):runtime.create_database(RUN,'unused schema',1)
        self.assertEqual(len(calls),1)
        self.assertTrue(calls[0].startswith('select count(*)'))


if __name__=='__main__':unittest.main()
