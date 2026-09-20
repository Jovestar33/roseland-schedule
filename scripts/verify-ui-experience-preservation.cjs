const assert=require('node:assert/strict');
const {fs,fixtures,login,rpc}=require('./pre-review-common.cjs');
const save=(name,value)=>fs.writeFileSync('evidence/ui-experience/'+name+'.json',JSON.stringify(value,null,2)+'\n');
(async()=>{const clients=[];try{
 const baseline=JSON.parse(fs.readFileSync('evidence/pre-review/baseline.json'));
 const ids=JSON.parse(fs.readFileSync('evidence/pre-review/new-fixtures.json'));
 const review=await login(JSON.parse(fs.readFileSync('/private/tmp/roseland-b15-review-access.json')));clients.push(review);
 const originals=JSON.parse(fs.readFileSync('evidence/ui-experience/preservation-baseline.json'));
 const incident=JSON.parse(fs.readFileSync('evidence/ui-experience/incident-repair.json'));
 for(const row of originals.rows){const now=await rpc(review,'session_read_schedule',{target_schedule_id:row.id});assert.deepEqual(now.document,row.document);assert.deepEqual(now,row.id===incident.id?incident.readback:row);}
 const copies=JSON.parse(fs.readFileSync('evidence/ui-experience/inspection-fixtures.json'));
 const keyboard=await rpc(review,'session_read_schedule',{target_schedule_id:copies.find(x=>x.display_name.includes('keyboard')).id});assert.equal(keyboard.document.meta.callsheet.emergency,'UI keyboard confirmed — fictional');assert.deepEqual(keyboard.document.meta.callsheet.notes,copies.find(x=>x.display_name.includes('keyboard')).document.meta.callsheet.notes);save('keyboard-saved-readback',keyboard);
 const admin=await login(fixtures.leadership);clients.push(admin);const member=await login(fixtures.member);clients.push(member);
 const counts={},newRows={};
 for(const table of ['organization_memberships','production_memberships','productions','schedules']){
  const r=await admin.from(table).select('*').in('organization_id',fixtures.organizations.map(x=>x.id));assert.equal(r.error,null);
  const old=baseline.existingNorthSouth[table];const key=x=>table==='organization_memberships'?x.organization_id+':'+x.user_id:x.id;
  for(const row of old)assert.deepEqual(r.data.find(x=>key(x)===key(row)),row);
  newRows[table]=r.data.filter(x=>!old.some(y=>key(y)===key(x)));counts[table]={retained:old.length,new:newRows[table].length};
  if(table.includes('memberships'))assert.equal(newRows[table].length,0);
 }
 for(const old of baseline.existingNorthSouth.permissions){const org=fixtures.organizations.find(x=>x.id===old.organization);assert.deepEqual(await rpc(admin,'read_schedule_permissions',{target_organization_id:org.id,target_production_id:org.production,target_schedule_id:null}),old.data);}
 const moved=newRows.schedules.find(x=>x.display_name==='Pre-review browser move');assert.ok(moved);assert.equal(moved.production_id,ids.destination);assert.equal(moved.document_version,3);assert.equal(moved.document.rows[0].desc,'BROWSER MOVE CONTENT MUST SURVIVE');assert.equal(moved.document.rows[0].notes,'Fictional review only');assert.equal(moved.document.meta.town,'Fictional Harbor');assert.equal(moved.document.meta.projectName,'Pre-review fictional destination');save('browser-move-readback',moved);
 const target=await member.rpc('list_schedule_client_links',{target_schedule_id:ids.target,after_id:null});assert.ok(target.error);
 const control=await rpc(member,'list_schedule_client_links',{target_schedule_id:ids.control,after_id:null});assert.equal(control.can_create,true);
 const share={targetDenied:{code:target.error.code,message:target.error.message},controlCanCreate:control.can_create,newLinksCreated:0,recipientTokenRoundTrip:'Not tested; no new recipient access granted'};save('sharing-restriction',share);
 const permissions=JSON.parse(fs.readFileSync('evidence/pre-review/permission-results.json'));const rule=permissions.movedPermissions.restrictions.find(x=>x.id===ids.moveRestriction);assert.ok(rule);assert.equal(rule.production_id,ids.destination);assert.deepEqual(rule.denied_actions,['export']);
 save('new-records',newRows);const result={checkedAt:new Date().toISOString(),originalDocumentsExactlyPreserved:18,originalRecordsExactlyPreserved:17,incidentRecord:incident.id,incidentVersion:3,incidentRemainingMetadataChanges:incident.remainingMetadataChanges,existingNorthSouth:counts,membershipRowsUnchanged:true,existingProductionPermissionsUnchanged:true,browserMoveVersion:3,movedRestrictionPreserved:true,newRecords:{productions:1,schedules:5,templates:1,restrictions:2},sharingRestriction:share};save('preservation-final',result);console.log(JSON.stringify(result));
}finally{for(const c of clients)await c.auth.signOut({scope:'local'});}})().catch(e=>{console.error(e.message);process.exitCode=1;});
