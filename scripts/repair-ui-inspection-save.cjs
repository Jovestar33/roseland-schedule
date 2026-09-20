// Repair only the identified accidental save, using normal authenticated CAS.
const assert=require('node:assert/strict');
const {fs,login,rpc}=require('./pre-review-common.cjs');
(async()=>{const incident=JSON.parse(fs.readFileSync('evidence/ui-experience/unintended-save-readback.json'));const c=await login(JSON.parse(fs.readFileSync('/private/tmp/roseland-b15-review-access.json')));try{
 const current=await rpc(c,'session_read_schedule',{target_schedule_id:incident.old.id});assert.deepEqual(current,incident.fresh,'Abort if another change occurred since diagnosis');assert.equal(current.document_version,2);assert.deepEqual(current.document.meta,incident.old.document.meta);
 const repaired=await rpc(c,'update_schedule_document',{target_schedule_id:current.id,expected_version:current.document_version,next_document:incident.old.document,schema_version:1});
 const readback=await rpc(c,'session_read_schedule',{target_schedule_id:current.id});assert.deepEqual(readback.document,incident.old.document);assert.equal(readback.document_version,3);
 fs.writeFileSync('evidence/ui-experience/incident-repair.json',JSON.stringify({reason:'Native print helper matched editor Save while a different owned tab print preview was backgrounded. Helper removed; native output now requires exact chrome://print identity before any Save.',id:current.id,originalVersion:1,unintendedVersion:2,repairedVersion:3,documentExactlyRestored:true,remainingMetadataChanges:Object.keys(incident.old).filter(k=>JSON.stringify(incident.old[k])!==JSON.stringify(readback[k])),readback},null,2));
 console.log('Original document restored exactly at version 3; audit/version and derived town metadata retained.');
 }finally{await c.auth.signOut({scope:'local'});}})().catch(e=>{console.error(e.message);process.exitCode=1;});
