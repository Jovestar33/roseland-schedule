const test=require('node:test'),assert=require('node:assert/strict');
const {sourceLoader}=require('./source-loader.cjs');const load=sourceLoader();
const {recalcRows,rowConflictInfo,rowGapInfo,computeTimeOut}=load('lib/time.ts');
const {makeRow,makeMeta}=load('lib/rowNormalizer.ts');
const store=load('lib/store/scheduleStore.ts').useScheduleStore;
function setup(rows){store.getState().loadSchedule('Lock check',{savedAt:0,meta:makeMeta(),rows:rows.map(makeRow)});}
test('start-only lock stays fixed while duration changes finish and downstream times',()=>{
 setup([{action:'Crew Call',timeIn:'9:00 AM',dur:'00:15'},{action:'Shoot',timeIn:'10:00 AM',fixedIn:true,dur:'00:30'},{action:'Move',dur:'00:15'}]);
 store.getState().updateRow(1,{dur:'08:00'});const rows=store.getState().rows;
 assert.equal(rows[1].timeIn,'10:00 AM');assert.equal(computeTimeOut(rows[1]),'6:00 PM');assert.equal(rows[2].timeIn,'6:00 PM');
 store.getState().updateRow(0,{dur:'02:00'});assert.equal(store.getState().rows[1].timeIn,'10:00 AM');assert.equal(rowGapInfo(store.getState().rows,1).kind,'overlap');
});
test('finish-only lock preserves duration through upstream changes, reload and reordering',()=>{
 setup([{action:'Crew Call',timeIn:'9:00 AM',dur:'00:15'},{action:'Shoot',fixedOut:true,fixedOutTime:'10:00 AM',dur:'00:30'},{action:'Move',dur:'00:15'}]);
 store.getState().updateRow(0,{dur:'01:15'});let rows=store.getState().rows;
 assert.equal(rows[1].timeIn,'10:15 AM');assert.equal(rows[1].dur,'00:30');assert.equal(computeTimeOut(rows[1]),'10:00 AM');assert.equal(rows[2].timeIn,'10:00 AM');assert.ok(rowConflictInfo(rows,1));
 const saved=JSON.parse(JSON.stringify(store.getState().getScheduleData()));store.getState().loadSchedule('Lock check',saved);assert.equal(store.getState().rows[1].dur,'00:30');
 store.getState().reorderRows(1,2);rows=store.getState().rows;assert.equal(rows[2].fixedOutTime,'10:00 AM');assert.equal(rows[2].dur,'00:30');
});
test('both locks preserve the requested duration, including zero and custom, and warn until reconciled',()=>{
 for(const dur of ['00:00','00:20','08:00','09:37']){
  const rows=recalcRows([makeRow({action:'Shoot',timeIn:'9:00 AM',fixedIn:true,fixedOut:true,fixedOutTime:'10:00 AM',dur})]);
  assert.equal(rows[0].dur,dur);assert.equal(rows[0].timeIn,'9:00 AM');assert.equal(rows[0].fixedOutTime,'10:00 AM');assert.equal(rowConflictInfo(rows,0).kind,'fixedOutMismatch');
 }
 assert.equal(rowConflictInfo([makeRow({action:'Shoot',timeIn:'9:00 AM',fixedIn:true,fixedOut:true,fixedOutTime:'10:00 AM',dur:'01:00'})],0),null);
});
test('unlocking finish resumes the natural cascade and undo restores the pinned conflict',()=>{
 setup([{action:'Shoot',timeIn:'9:00 AM',dur:'02:00',fixedOut:true,fixedOutTime:'10:00 AM'},{action:'Move',dur:'00:15'}]);
 store.getState().pushUndo();store.getState().updateRow(0,{fixedOut:false,fixedOutTime:''});assert.equal(store.getState().rows[1].timeIn,'11:00 AM');assert.equal(store.getState().rows[0].dur,'02:00');
 store.getState().undo();assert.equal(store.getState().rows[0].fixedOutTime,'10:00 AM');assert.equal(store.getState().rows[1].timeIn,'10:00 AM');assert.equal(store.getState().rows[0].dur,'02:00');assert.ok(rowConflictInfo(store.getState().rows,0));
});
