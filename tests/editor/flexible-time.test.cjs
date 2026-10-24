const test=require('node:test'),assert=require('node:assert/strict');
const {sourceLoader}=require('./source-loader.cjs'),load=sourceLoader();
const {solveFlexibleTimes:solve,startMinutes:start,finishMinutes:end,clockAt,clockMinutes}=load('lib/flexible-time.ts');
const {makeRow,makeMeta}=load('lib/rowNormalizer.ts'),{recalcRows,displayTimeIn,displayTimeOut,mDur}=load('lib/time.ts');
const store=load('lib/store/scheduleStore.ts').useScheduleStore;
const flexible={mode:'flexible',between:'backward'};
const rows=v=>v.map(x=>makeRow({action:'Shoot',...x}));
const setup=v=>store.getState().loadSchedule('Timing test',{meta:{...makeMeta(),timing:flexible},rows:rows(v),savedAt:0});
const expectStarts=(result,values)=>assert.deepEqual(result.rows.map(r=>r.timeIn),values);
test('lunch first plans earlier work backward and the afternoon forward without a call time',()=>{
 const source=rows([{dur:'00:30'},{dur:'01:00'},{action:'Lunch',dur:'00:45',fixedIn:true,timeIn:'12:00 PM'},{dur:'02:00'}]),copy=structuredClone(source),result=solve(source);
 expectStarts(result,['10:30 AM','11:00 AM','12:00 PM','12:45 PM']);assert.deepEqual(source,copy);assert.equal(result.gaps.length,0);assert.equal(result.unresolved.length,0);
});
test('location hard out pins the exact finish; changing earlier work moves the call',()=>{
 setup([{dur:'00:20'},{dur:'01:37',fixedOut:true,fixedOutTime:'11:00 AM'},{dur:'00:15'}]);expectStarts({rows:store.getState().rows},['9:03 AM','9:23 AM','11:00 AM']);
 store.getState().updateRow(0,{dur:'01:00'});expectStarts({rows:store.getState().rows},['8:23 AM','9:23 AM','11:00 AM']);assert.equal(store.getState().rows[1].dur,'01:37');
});
test('wrap first, zero-duration markers and blank placeholders work without a start',()=>{
 const result=solve(rows([{action:'',dur:''},{dur:'02:00'},{dur:'00:15'},{action:'Wrap',dur:'00:00',fixedOut:true,fixedOutTime:'6:00 PM'},{action:'',dur:''}]));
 expectStarts(result,['','3:45 PM','5:45 PM','6:00 PM','']);assert.deepEqual(result.unresolved,[]);
});
test('no anchors means no invented or stale times',()=>{const result=solve(rows([{dur:'00:30',timeIn:'8:00 AM'},{dur:'01:00'}]));expectStarts(result,['','']);assert.equal(result.anchors,0);assert.equal(result.unresolved.length,2);});
test('two anchors expose the same slack in either planning direction',()=>{
 const source=rows([{dur:'00:30',fixedIn:true,timeIn:'9:00 AM'},{dur:'01:00'},{dur:'00:30'},{dur:'00:45',fixedIn:true,timeIn:'12:00 PM'}]);
 const back=solve(source),forward=solve(source,'forward');expectStarts(back,['9:00 AM','10:30 AM','11:30 AM','12:00 PM']);expectStarts(forward,['9:00 AM','9:30 AM','10:30 AM','12:00 PM']);assert.equal(back.gaps[0].minutes,60);assert.equal(back.gaps[0].index,1);assert.equal(forward.gaps[0].minutes,60);assert.equal(forward.gaps[0].index,3);
});
test('overlaps never compress durations, and conflicting fixed endpoints are both retained',()=>{
 const source=rows([{dur:'02:00',fixedIn:true,timeIn:'9:00 AM'},{dur:'01:00'},{dur:'00:30',fixedIn:true,timeIn:'11:00 AM'}]);
 for(const direction of ['forward','backward']){const result=solve(source,direction);assert.equal(result.gaps[0].minutes,-60);assert.deepEqual(result.rows.map(r=>r.dur),source.map(r=>r.dur));}
 const both=solve(rows([{dur:'02:00',fixedIn:true,timeIn:'9:00 AM',fixedOut:true,fixedOutTime:'10:00 AM'}]));assert.equal(both.conflicts.length,1);assert.equal(both.rows[0].timeIn,'9:00 AM');assert.equal(both.rows[0].fixedOutTime,'10:00 AM');assert.equal(both.rows[0].dur,'02:00');
});
test('unknown durations stop calculation without suppressing the far side of another anchor',()=>{
 for(const direction of ['forward','backward']){const r=solve(rows([{dur:'00:30',fixedIn:true,timeIn:'9:00 AM'},{dur:''},{dur:'00:30'},{dur:'00:00',fixedIn:true,timeIn:'12:00 PM'}]),direction);assert.equal(r.rows[2].timeIn,'11:30 AM');assert.ok(r.unresolved.includes(1));assert.equal(r.gaps.length,0);}
 const r=solve(rows([{dur:'00:30'},{dur:''},{dur:'00:30',fixedIn:true,timeIn:'12:00 PM'}]));assert.equal(r.rows[0].timeIn,'');assert.equal(r.rows[1].timeIn,'');
});
test('midnight, noon, previous and following days have explicit day offsets',()=>{
 assert.equal(clockMinutes('12:00 AM'),0);assert.equal(clockMinutes('12:00 PM'),720);
 const r=solve(rows([{dur:'02:00'},{dur:'00:30',fixedOut:true,fixedOutTime:'12:30 AM'}]));assert.equal(start(r.rows[0]),-120);assert.equal(displayTimeIn(r.rows[0]),'10:00 PM (-1 day)');assert.equal(displayTimeOut(r.rows[0]),'12:00 AM');
 const n=solve(rows([{dur:'02:00',fixedIn:true,timeIn:'11:00 PM'},{dur:'00:30'},{dur:'00:00',fixedIn:true,timeIn:'2:00 AM',timeInDay:1}]));assert.equal(n.gaps[0].minutes,30);assert.equal(displayTimeIn(n.rows[1]),'1:30 AM (+1 day)');assert.equal(end(n.rows[2]),1560);
});
test('empty finish flag never becomes an implicit anchor',()=>{const r=solve(rows([{dur:'00:30',timeIn:'9:00 AM',fixedOut:true,fixedOutTime:''}]));assert.equal(r.anchors,0);assert.equal(r.rows[0].timeIn,'');});
test('sun markers are untouched and never consume time',()=>{const sun=makeRow({sunLocked:true,action:'🌅 Sunrise',timeIn:'6:15 AM',dur:'00:00'});const r=solve([makeRow({action:'Prep',dur:'01:00'}),sun,makeRow({action:'Shoot',dur:'01:00',fixedIn:true,timeIn:'8:00 AM'})]);assert.equal(r.rows[0].timeIn,'7:00 AM');assert.deepEqual(r.rows[1],sun);});
test('insert into either gap, undo/redo, reorder first row and save/reload preserve timing',()=>{
 for(const direction of ['forward','backward']){
 setup([{action:'A',dur:'00:30',fixedIn:true,timeIn:'9:00 AM'},{action:'B',dur:'01:00'},{action:'Lunch',dur:'00:30',fixedIn:true,timeIn:'12:00 PM'}]);store.getState().updateMeta({timing:{...flexible,between:direction}});
 const before=JSON.stringify(store.getState().getScheduleData().rows),gap=solve(store.getState().rows,direction).gaps[0];store.getState().pushUndo();store.getState().addRowAfter(gap.index-1,{action:'Move',dur:mDur(gap.minutes)});assert.equal(solve(store.getState().rows,direction).gaps.length,0);
 store.getState().undo();assert.equal(JSON.stringify(store.getState().rows),before);store.getState().redo();assert.equal(solve(store.getState().rows,direction).gaps.length,0);
 store.getState().reorderRows(0,1);const doc=JSON.parse(JSON.stringify(store.getState().getScheduleData()));store.getState().loadSchedule('Reload',doc);assert.deepEqual(store.getState().rows,doc.rows);assert.deepEqual(store.getState().meta.timing,{...flexible,between:direction});
 }
});
test('older schedules open without time changes, and text, weather and Undo retain their exact saved times',()=>{
 const source=rows([{action:'Crew Call',timeIn:'9:00 AM',dur:'00:30'},{timeIn:'10:17 AM',dur:'01:00'}]);
 store.getState().loadSchedule('Legacy',{meta:makeMeta(),rows:source,savedAt:0},true);
 assert.deepEqual(store.getState().rows,source);assert.equal(store.getState().meta.timing,undefined);assert.equal(store.getState().dirty,false);
 store.getState().updateRow(1,{desc:'Description only'});assert.equal(store.getState().rows[1].timeIn,'10:17 AM');assert.equal(store.getState().meta.timing,undefined);
 store.getState().insertSunRows('6:00 AM','6:00 PM');assert.equal(store.getState().rows.find(r=>r.action==='Shoot').timeIn,'10:17 AM');store.getState().clearSunRows();
 const before=structuredClone(store.getState().rows);store.getState().pushUndo();store.getState().updateRow(0,{dur:'01:00'});
 assert.equal(store.getState().rows[0].fixedIn,false);assert.equal(store.getState().rows[0].timeIn,'9:00 AM');assert.equal(store.getState().rows[1].timeIn,'10:00 AM');assert.equal(store.getState().meta.timing.mode,'flexible');
 store.getState().undo();assert.deepEqual(store.getState().rows,before);assert.equal(store.getState().meta.timing,undefined);
});
test('older call time stays flexible when a later fixed finish is chosen',()=>{
 store.getState().loadSchedule('Existing',{meta:makeMeta(),rows:rows([{action:'Crew Call',timeIn:'9:00 AM',dur:'00:30'},{timeIn:'9:30 AM',dur:'01:00'}]),savedAt:0},true);
 store.getState().updateRow(1,{fixedOut:true,fixedOutTime:'12:00 PM'});assert.equal(store.getState().rows[0].timeIn,'10:30 AM');assert.equal(store.getState().rows[0].fixedIn,false);
});
test('unanchored insertion, deletion and reordering retain the plan starting point',()=>{
 const initial=rows([{action:'Prep',timeIn:'9:00 AM',dur:'00:30'},{action:'Shoot',timeIn:'9:30 AM',dur:'01:00'}]);
 for(const operation of ['insert','delete','reorder']){
 store.getState().loadSchedule('Existing',{meta:makeMeta(),rows:initial,savedAt:0},true);
 if(operation==='insert')store.getState().addRowAfter(-1,{action:'Move',dur:'00:15'});
 if(operation==='delete')store.getState().deleteRow(0);
 if(operation==='reorder')store.getState().reorderRows(0,1);
 assert.equal(store.getState().rows[0].timeIn,'9:00 AM');assert.ok(store.getState().rows.every(r=>!r.fixedIn));
 }
});
test('opening an already flexible schedule preserves saved values even if they need review',()=>{
 const source=rows([{timeIn:'8:00 AM',dur:'01:00'},{timeIn:'11:00 AM',dur:'01:00',fixedOut:true,fixedOutTime:'12:00 PM'}]);store.getState().loadSchedule('Review',{meta:{...makeMeta(),timing:flexible},rows:source,savedAt:0},true);assert.deepEqual(store.getState().rows,source);assert.equal(store.getState().dirty,false);
});
test('deterministic randomized scenarios preserve every duration and pin across 1200 schedules',()=>{
 let seed=89211;const next=max=>{seed=(seed*1664525+1013904223)>>>0;return seed%max;};
 for(let n=0;n<1200;n++){
  const count=1+next(30),pin=next(count),finish=!!next(2),absolute=next(6000)-2000;
  const durations=Array.from({length:count},()=>next(480));const input=rows(durations.map(d=>({dur:d===0?'00:00':mDur(d)})));
  Object.assign(input[pin],finish?{fixedOut:true,fixedOutTime:clockAt(absolute),fixedOutDay:Math.floor(absolute/1440)}:{fixedIn:true,timeIn:clockAt(absolute),timeInDay:Math.floor(absolute/1440)});
  const result=solve(input);let cursor=absolute-(finish?durations[pin]:0)-durations.slice(0,pin).reduce((a,b)=>a+b,0);
  result.rows.forEach((r,i)=>{assert.equal(start(r),cursor);assert.equal(r.dur,input[i].dur);assert.equal(end(r),cursor+durations[i]);cursor+=durations[i];});
  assert.equal(result.gaps.length,0);assert.equal(result.conflicts.length,0);assert.deepEqual(solve(result.rows).rows,result.rows);
 }
});
test('multiple anchors preserve independent segments and expose exact slack in 800 schedules',()=>{
 let seed=4919;const next=max=>{seed=(seed*1664525+1013904223)>>>0;return seed%max;};
 for(let n=0;n<800;n++){
  const count=5+next(20),middle=1+next(count-2),ds=Array.from({length:count},()=>next(240)),base=next(4000)-1000,slack1=next(301)-150,slack2=next(301)-150;
  const input=rows(ds.map(d=>({dur:d===0?'00:00':mDur(d)}))),positions=[0,middle,count-1],pins=[base,base+ds.slice(0,middle).reduce((a,b)=>a+b,0)+slack1,base+ds.slice(0,count-1).reduce((a,b)=>a+b,0)+slack1+slack2];
  positions.forEach((i,k)=>Object.assign(input[i],{fixedIn:true,timeIn:clockAt(pins[k]),timeInDay:Math.floor(pins[k]/1440)}));
  for(const direction of ['forward','backward']){
   const result=solve(input,direction);positions.forEach((i,k)=>assert.equal(start(result.rows[i]),pins[k]));
   assert.deepEqual(result.rows.map(r=>r.dur),input.map(r=>r.dur));assert.equal(result.unresolved.length,0);assert.equal(result.conflicts.length,0);
   assert.deepEqual(result.gaps.map(g=>g.minutes),[slack1,slack2].filter(Boolean));assert.deepEqual(solve(result.rows,direction).rows,result.rows);
   for(let k=1;k<positions.length;k++){const a=positions[k-1],b=positions[k];for(let i=a+1;i<b;i++){const expected=direction==='forward'?pins[k-1]+ds.slice(a,i).reduce((x,y)=>x+y,0):pins[k]-ds.slice(i,b).reduce((x,y)=>x+y,0);assert.equal(start(result.rows[i]),expected);}}
  }
 }
});
test('warnings inspect saved clocks without silently recalculating, including unknown times',()=>{
 const {timingAnalysis}=load('lib/flexible-time.ts'),{rowConflictInfo}=load('lib/time.ts');
 const source=rows([{timeIn:'9:00 AM',dur:'01:00',fixedOut:true,fixedOutTime:'11:00 AM'},{dur:'00:30'}]),before=JSON.stringify(source);
 assert.equal(timingAnalysis(source).conflicts.length,1);assert.equal(timingAnalysis(source).unresolved.length,1);assert.equal(rowConflictInfo(source,0,flexible).kind,'fixedOutMismatch');assert.equal(JSON.stringify(source),before);
 const backwards=rows([{timeIn:'11:00 PM',dur:'',fixedOut:true,fixedOutTime:'1:00 AM'}]);assert.equal(timingAnalysis(backwards).conflicts[0].kind,'negative');
});
test('clearing and releasing anchors never changes durations and Undo restores the fixed time',()=>{
 const source=rows([{action:'Prep',dur:'00:30'},{dur:'01:00',fixedOut:true,fixedOutTime:'12:00 PM'}]);store.getState().loadSchedule('Pins',{meta:{...makeMeta(),timing:flexible},rows:solve(source).rows,savedAt:0},true);
 const before=structuredClone(store.getState().rows);store.getState().pushUndo();store.getState().updateRow(1,{fixedOut:false,fixedOutTime:'',fixedOutDay:0});assert.deepEqual(store.getState().rows.map(r=>r.dur),before.map(r=>r.dur));assert.equal(store.getState().rows[0].timeIn,'10:30 AM');store.getState().undo();assert.deepEqual(store.getState().rows,before);
});
test('printed schedules and call sheets retain overnight day labels without changing the source',()=>{
 const {layoutSchedulePrint,renderSchedulePrint}=load('lib/schedule-print-layout.ts');
 const {callSheetLines,callSheetOverview}=load('lib/call-sheet.ts');
 const data={meta:{...makeMeta(),timing:flexible},rows:solve(rows([{dur:'02:00'},{action:'Wrap',dur:'00:30',fixedOut:true,fixedOutTime:'1:00 AM',fixedOutDay:1}])).rows,savedAt:0},before=JSON.stringify(data);
 const layout=layoutSchedulePrint(data,'Night shoot','inline','letter',s=>s.length*6);const html=renderSchedulePrint(layout);assert.match(html,/\(\+1 day\)/);assert.match(html,/10:30 PM/);assert.match(html,/1:00 AM/);
 const sheet={lines:callSheetLines(data.rows),overview:callSheetOverview(data.rows)};assert.match(JSON.stringify(sheet),/\(\+1 day\)/);assert.equal(sheet.overview.estimatedWrap,'1:00 AM (+1 day)');assert.equal(JSON.stringify(data),before);
});
