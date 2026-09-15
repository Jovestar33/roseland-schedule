import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts/migration'))
from related_contract import plan, identity, Invalid
from related_fixtures import fixtures
ORG='62000000-0000-4000-a000-000000000001'
REFS={'alpha':'66000000-0000-4000-a000-000000000001','bravo':'66000000-0000-4000-a000-000000000002'}

class Contract(unittest.TestCase):
    def setUp(self): self.base,self.latest=fixtures()
    def run_plan(self,blobs=None): return plan(ORG,'synthetic',self.base if blobs is None else blobs,REFS)
    def test_all_stores_and_leaf_records_preserved(self):
        before=copy.deepcopy(self.base);result=self.run_plan()
        self.assertEqual(len(result['records']),9);self.assertEqual(self.base,before)
        self.assertEqual({r['store']:r['payload'] for r in result['records'] if not r['item']},{b['store']:b['value'] for b in self.base})
    def test_identity_stable_across_content_change(self):
        a={r['id'] for r in self.run_plan()['records']};b={r['id'] for r in self.run_plan(self.latest)['records']}
        self.assertEqual(len(a & b),8)
    def test_tenants_have_distinct_ids(self):
        self.assertNotEqual(identity(ORG,'e','cms','key',''),identity('other','e','cms','key',''))
    def test_duplicate_blob(self):
        with self.assertRaises(Invalid): self.run_plan(self.base+[self.base[0]])
    def test_duplicate_snapshot(self):
        self.base[0]['value']['snapshots'].append(self.base[0]['value']['snapshots'][0])
        with self.assertRaises(Invalid): self.run_plan()
    def test_snapshot_key_ownership(self):
        self.base[0]['value']['name']='bravo'
        with self.assertRaises(Invalid): self.run_plan()
    def test_unknown_fields_not_stripped(self):
        self.base[2]['value']['futureData']='retain or reject'
        with self.assertRaises(Invalid): self.run_plan()
    def test_missing_store_is_blocked(self):
        with self.assertRaises(Invalid): self.run_plan(self.base[:-1])
    def test_orphan_schedule(self):
        self.base[2]['value']['townCache']['ghost']='Unknown'
        with self.assertRaises(Invalid): self.run_plan()
    def test_orphan_folder(self):
        self.base[2]['value']['scheduleFolderMap']['alpha']='missing'
        with self.assertRaises(Invalid): self.run_plan()
    def test_duplicate_phase_order(self):
        self.base[2]['value']['phaseOrder']['production']['other']=['alpha']
        with self.assertRaises(Invalid): self.run_plan()
    def test_css_injection(self):
        self.base[3]['value']['actionStyles']['aShoot']['bg']='red;}body{display:none'
        with self.assertRaises(Invalid): self.run_plan()
    def test_secret_fields_rejected(self):
        self.base[3]['value']['pin']='fictional-not-a-credential'
        with self.assertRaises(Invalid): self.run_plan()
    def test_unsafe_logo_rejected(self):
        self.base[3]['value']['logo']='javascript:alert(1)'
        with self.assertRaises(Invalid): self.run_plan()
    def test_browser_template_ownership_not_inferred(self):
        self.base[1]['store']='browser-templates'
        with self.assertRaises(Invalid): self.run_plan()
    def test_snapshot_count_is_not_silently_capped(self):
        sample=self.base[0]['value']['snapshots'][0]
        self.base[0]['value']['snapshots']=[dict(sample,id=str(i)) for i in range(30)]
        self.assertEqual(len([r for r in self.run_plan()['records'] if r['store']=='schedule-snapshots' and r['item']]),30)

if __name__=='__main__': unittest.main()
