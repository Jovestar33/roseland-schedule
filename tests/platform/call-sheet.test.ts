import test from 'node:test';
import assert from 'node:assert/strict';
import { callSheetCall, callSheetLines, callSheetWeather } from '../../lib/call-sheet.ts';
import { documentFixture } from '../fixtures/document-fixtures.ts';
const row = (changes = {}) => ({...documentFixture(1).rows[0], ...changes});
test('explicit crew call wins over earlier prep and sun rows without reordering work', () => {
 const rows=[row({action:'Sunrise',sunLocked:true,timeIn:'6:00 AM'}),row({action:'Prep',timeIn:'7:00 AM'}),row({timeIn:'9:00 AM'})];
 assert.deepEqual(callSheetCall(rows),{label:'Crew Call',time:'9:00 AM'});
 assert.deepEqual(callSheetLines(rows).map(r=>r.timeIn),['6:00 AM','7:00 AM','9:00 AM']);
 assert.deepEqual(callSheetCall([row({action:'Other',otherText:' crew call ',timeIn:'8:00 AM'})]),{label:'Crew Call',time:'8:00 AM'});
});
test('fallback states the first activity honestly; missing explicit call remains missing', () => {
 assert.deepEqual(callSheetCall([row({action:'Prep',timeIn:'11:45 PM'})]),{label:'First scheduled activity',time:'11:45 PM'});
 assert.deepEqual(callSheetCall([row({action:'Prep',timeIn:'7:00 AM'}),row({timeIn:''})]),{label:'Crew Call',time:''});
 assert.deepEqual(callSheetCall([row({sunLocked:true})]),{label:'Call time',time:''});
});
test('work brief retains untimed descriptions, notes, separate addresses and nested details',()=>{
 const source=row({action:'',timeIn:'',desc:'Zoë\nComplete description',notes:'Keep complete',locName:'Studio',locAddress:'123 Long Road',loc:'Studio'});
 const [line]=callSheetLines([source]);
 assert.equal(line.description,source.desc);assert.equal(line.notes,source.notes);
 assert.deepEqual(line.locations[0],{name:'Studio',address:'123 Long Road',description:''});
 assert.deepEqual(line.locations[1],{name:'Annex 1',address:'200 Sample Road',description:'SUB-1 Fictional nested description END-SUB-1'});
 assert.equal(callSheetLines([row({desc:'Long '.repeat(1000)})])[0].long,true);
});
test('weather preserves supplied zero precipitation, partial temperatures and daylight without inference',()=>{
 assert.deepEqual(callSheetWeather({prec:0,minF:0,sunrise:'6:30 AM'}),['Low 0°F','Precipitation 0%','Sunrise 6:30 AM']);
 assert.deepEqual(callSheetWeather(null),[]);
 assert.deepEqual(callSheetWeather({noForecast:true,sunset:'7:15 PM'}),['Sunset 7:15 PM']);
});
