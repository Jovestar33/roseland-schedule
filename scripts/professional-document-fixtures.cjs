// Bound to the existing fictional loopback; originals are only read.
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const {fs,login,rpc,fixtures}=require('./pre-review-common.cjs');
const root='evidence/professional-documents/';
(async()=>{const clients=[];try{
 const review=await login(JSON.parse(fs.readFileSync('/private/tmp/roseland-b15-review-access.json')));clients.push(review);
 const ids=[...JSON.parse(fs.readFileSync('evidence/ui-experience/preservation-baseline.json')).rows,...JSON.parse(fs.readFileSync('evidence/ui-experience/inspection-fixtures.json'))].map(r=>r.id);
 if(process.argv[2]==='capture'){
  assert.ok(!fs.existsSync(root+'baseline.json'),'Do not overwrite baseline');
  const records=[];for(const id of ids)records.push(await rpc(review,'session_read_schedule',{target_schedule_id:id}));
  fs.writeFileSync(root+'baseline.json',JSON.stringify({capturedAt:new Date().toISOString(),records},null,2)+'\n');
  const source=records.find(r=>r.display_name==='B15 ordinary fictional day');
  const id=randomUUID(),doc=structuredClone(source.document);
  await rpc(review,'create_schedule_in_production',{target_schedule_id:id,target_production_id:source.production_id,target_day_id:null,target_phase_id:null,next_display_name:'Professional document keyboard — fictional',next_slug:'professional-document-'+id,next_document:doc,schema_version:1});
  fs.writeFileSync(root+'edit-copy.json',JSON.stringify(await rpc(review,'session_read_schedule',{target_schedule_id:id}),null,2)+'\n');
  console.log('Captured 20 existing records and created one new isolated keyboard copy.');
 }else if(process.argv[2]==='verify'){
  const baseline=JSON.parse(fs.readFileSync(root+'baseline.json'));
  for(const before of baseline.records)assert.deepEqual(await rpc(review,'session_read_schedule',{target_schedule_id:before.id}),before);
  const copyBefore=JSON.parse(fs.readFileSync(root+'edit-copy.json'));
  const copyAfter=await rpc(review,'session_read_schedule',{target_schedule_id:copyBefore.id});
  assert.equal(copyAfter.document.meta.callsheet.emergency,'Professional keyboard verified — fictional');
  assert.equal(copyAfter.document.meta.callsheet.notes,copyBefore.document.meta.callsheet.notes);
  fs.writeFileSync(root+'edit-readback.json',JSON.stringify(copyAfter,null,2)+'\n');
  const admin=await login(fixtures.leadership);clients.push(admin);
  const prior=JSON.parse(fs.readFileSync('evidence/pre-review/baseline.json')).existingNorthSouth;
  const result={checkedAt:new Date().toISOString(),originalRecordsExactlyUnchanged:baseline.records.length,priorIncidentUnchanged:true,existingNorthSouth:{}};
  for(const table of ['schedules','productions','organization_memberships','production_memberships']){
   const now=await admin.from(table).select('*').in('organization_id',fixtures.organizations.map(x=>x.id));assert.equal(now.error,null);
   const key=r=>table==='organization_memberships'?r.organization_id+':'+r.user_id:r.id;
   for(const r of prior[table])assert.deepEqual(now.data.find(x=>key(x)===key(r)),r);
   result.existingNorthSouth[table]=prior[table].length;
  }
  fs.writeFileSync(root+'preservation-final.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 }else throw Error('Specify capture or verify');
}finally{for(const c of clients)await c.auth.signOut({scope:'local'});}})().catch(e=>{console.error(e.message);process.exitCode=1;});
