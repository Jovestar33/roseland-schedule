const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {migrationPlan}=require('../../scripts/hosting/migration-plan.cjs');
test('plans forward-only migrations without changing source files',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'migration-plan-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'20260101000000_first.sql'),'select 1;');
 fs.writeFileSync(path.join(dir,'20260102000000_second.sql'),'select 2;');
 const plan=migrationPlan(dir,[{version:'20260101000000',name:'first'}]);
 assert.equal(plan.pendingCount,1);assert.equal(plan.appliedCount,1);assert.equal(plan.readOnly,true);
 assert.equal(plan.pending[0].file,'20260102000000_second.sql');assert.match(plan.pending[0].sha256,/^[a-f0-9]{64}$/);
 assert.equal(fs.readFileSync(path.join(dir,'20260102000000_second.sql'),'utf8'),'select 2;');
 assert.throws(()=>migrationPlan(dir,[{version:'20260102000000',name:'second'}]),/History gap/);
 assert.throws(()=>migrationPlan(dir,[{version:'20260101000000',name:'wrong'}]),/does not match/);
 assert.throws(()=>migrationPlan(dir,[{version:'20250101000000',name:'unknown'}]),/does not match/);
 assert.throws(()=>migrationPlan(dir,[{version:'20260101000000',name:'first'},{version:'20260101000000',name:'first'}]),/duplicate/);
 assert.throws(()=>migrationPlan(dir,null),/ledger/);
});
