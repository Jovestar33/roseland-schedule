const test=require('node:test');
const assert=require('node:assert/strict');
const {sourceLoader}=require('./source-loader.cjs');
const load=sourceLoader();
const {parseCustomDuration,maxDurationForRow,allowedDurationsForRow}=load('lib/time.ts');
const {makeRow,makeMeta}=load('lib/rowNormalizer.ts');
test('custom durations accept exact whole minutes or HH:MM and reject malformed values',()=>{
 for(const [input,expected] of [['20','00:20'],[' 7 ','00:07'],['1:20','01:20'],['125','02:05'],['0','00:00'],['00:00','00:00']]) assert.equal(parseCustomDuration(input),expected);
 for(const input of ['','-5','1.5','1:75','1:5','abc','1h','Infinity','999999999999999999999']) assert.equal(parseCustomDuration(input),null);
});
test('fixed anchors describe available time without removing duration choices',()=>{
 const rows=[makeRow({action:'Shoot',timeIn:'9:00 AM',dur:'00:20'}),makeRow({action:'Shoot',timeIn:'9:30 AM',fixedIn:true,dur:'00:15'})];
 assert.equal(maxDurationForRow(rows,0),30);
 assert.ok(allowedDurationsForRow(rows,0).includes('00:30'));
 assert.ok(allowedDurationsForRow(rows,0).includes('08:00'));
 rows[0].fixedOut=true; rows[0].fixedOutTime='9:25 AM';
 assert.equal(maxDurationForRow(rows,0),25);
});
test('custom durations cascade exact times and survive save data and undo',()=>{
 const store=load('lib/store/scheduleStore.ts').useScheduleStore;
 store.getState().loadSchedule('Test',{savedAt:0,meta:makeMeta(),rows:[makeRow({action:'Crew Call',timeIn:'9:00 AM',dur:'00:00'}),makeRow({action:'Shoot',dur:'00:45'}),makeRow({action:'Shoot',dur:'00:15'})]});
 store.getState().pushUndo();store.getState().updateRow(1,{dur:parseCustomDuration('20')});
 assert.equal(store.getState().rows[2].timeIn,'9:20 AM');
 const saved=JSON.parse(JSON.stringify(store.getState().getScheduleData()));
 assert.equal(saved.rows[1].dur,'00:20');
 store.getState().undo();assert.equal(store.getState().rows[1].dur,'00:45');
 store.getState().loadSchedule('Test',saved);assert.equal(store.getState().rows[1].dur,'00:20');
});
