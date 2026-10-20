const test=require('node:test');
const assert=require('node:assert/strict');
const {document}=require('../../scripts/trial-sync/core.cjs');
test('only corroborated generated solar minute overflow is canonicalized, without mutating source',()=>{
 for(const [raw,fixed] of [['5:60 AM','6:00 AM'],['11:60 AM','12:00 PM'],['11:60 PM','12:00 AM'],['12:60 AM','1:00 AM']]){
  const d={meta:{wx:{sunrise:raw}},rows:[{action:'🌅 Sunrise',sunLocked:true,timeIn:raw,cast:'Keep cast'}],savedAt:10};
  const before=structuredClone(d),result=document(d);
  assert.equal(result.meta.wx.sunrise,fixed);assert.equal(result.rows[0].timeIn,fixed);assert.equal(result.rows[0].cast,'Keep cast');assert.deepEqual(d,before);assert.deepEqual(document(result),result);
  for(const row of [{...d.rows[0],sunLocked:false},{...d.rows[0],action:'Shoot'},{...d.rows[0],timeIn:'4:60 AM'}])assert.deepEqual(document({...d,rows:[row]}).rows,[row]);
 }
});
test('unknown fields, entered call times and valid solar times are not stripped or rewritten',()=>{
 const d={meta:{wx:{sunrise:'5:60 AM'}},rows:[{action:'Shoot',timeIn:'5:60 AM',cast:'  name\nname  ',unknown:'retained for validation'}]};
 assert.deepEqual(document(d),d);
});
