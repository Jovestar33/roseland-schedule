const test = require('node:test');
const assert = require('node:assert/strict');
const { sourceLoader } = require('./source-loader.cjs');
const load = sourceLoader();
const { makeRow, makeMeta } = load('lib/rowNormalizer.ts');
const { layoutSchedulePrint, renderSchedulePrint, wrapPrintText } = load('lib/schedule-print-layout.ts');
const measure = (text, bold, size) => Array.from(text).length * size * (bold ? .6 : .55);
const fixture = () => ({meta:makeMeta({town:'Fictional studio'}),rows:[makeRow({action:'Shoot',timeIn:'9:00 AM',dur:'01:00',loc:'South entrance',keyInstruction:'North entrance is locked. Use the south entrance.',notes:Array.from({length:50},(_,i)=>`Detail ${i+1}: keep every line.`).join('\n'),desc:'Short description'})],savedAt:1});
test('compact print keeps key instructions inline and appends complete notes with matching page references',()=>{
 const data=fixture(),before=JSON.stringify(data),layout=layoutSchedulePrint(data,'Test','compact','letter',measure);
 assert.equal(layout.totalDuration,'01:00'); assert.equal(layout.schedulePages,1); assert.ok(layout.notesPages>0);
 const schedule=layout.pages.filter(p=>p.kind==='schedule').flatMap(p=>p.rows).flatMap(r=>r.cells[4]);
 assert.equal(schedule.filter(l=>l.bold).map(l=>l.text).join(''),'KEY: '+data.rows[0].keyInstruction);
 assert.equal(schedule.filter(l=>!l.bold&&!l.ref).length,3);
 const complete=layout.pages.flatMap(p=>p.notes).filter(n=>n.ref==='N1').flatMap(n=>n.lines).join('\n');
 assert.equal(complete,data.rows[0].notes);
 assert.equal(layout.references.N1,layout.schedulePages+1);
 const html=renderSchedulePrint(layout);assert.match(html,/href="#N1"/);assert.match(html,/id="N1"/);assert.match(html,/Full notes: N1, page 2/);
 assert.equal(JSON.stringify(data),before,'print must not edit the saved document');
});
test('all-details layout splits very long rows across pages without discarding key instructions or notes',()=>{
 const data=fixture();data.rows[0].keyInstruction=Array.from({length:100},(_,i)=>`Essential ${i}`).join('\n');
 const layout=layoutSchedulePrint(data,'Test','inline','a4',measure);
 assert.equal(layout.notesPages,0);assert.ok(layout.schedulePages>1);
 const cells=layout.pages.flatMap(p=>p.rows).flatMap(r=>r.cells[4]);
 assert.equal(cells.filter(l=>l.bold).map(l=>l.text).join('\n'),'KEY: '+data.rows[0].keyInstruction);
 assert.equal(cells.filter(l=>!l.bold).map(l=>l.text).join('\n'),data.rows[0].notes);
});
test('short and empty notes create no appendix; descriptions use their own complete appendix reference',()=>{
 const data=fixture();data.rows[0].notes='Short note';
 assert.equal(layoutSchedulePrint(data,'Test','compact','letter',measure).notesPages,0);
 data.rows[0].notes='';data.rows[0].desc='Description\nline two\nline three\nline four';
 const layout=layoutSchedulePrint(data,'Test','compact','letter',measure);
 assert.ok(layout.references.D1);assert.equal(layout.references.N1,undefined);
 assert.equal(layout.pages.flatMap(p=>p.notes).flatMap(n=>n.lines).join('\n'),data.rows[0].desc);
});
test('wrapping preserves spaces, blank lines, Unicode and unbroken long tokens',()=>{
 for(const text of ['many  spaces here','x'.repeat(600),'é中😀'.repeat(20)]) assert.equal(wrapPrintText(text,60,t=>Array.from(t).length*6).join(''),text);
 assert.deepEqual(wrapPrintText('one\n\nthree\n',100,t=>t.length*6),['one','','three','']);
});
test('user text is escaped and cannot inject markup into the printable document',()=>{
 const data=fixture();data.rows[0].keyInstruction='<img src=x onerror=alert(1)>';
 const html=renderSchedulePrint(layoutSchedulePrint(data,'<script>alert(1)</script>','compact','letter',measure));
 assert.doesNotMatch(html,/<script>|<img/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img/);
});
test('key instructions survive store edits, undo/redo and JSON serialization round trips',()=>{
 const store=sourceLoader()('lib/store/scheduleStore.ts').useScheduleStore;
 const data=fixture();store.getState().loadSchedule('Instruction',data);
 store.getState().pushUndo();store.getState().updateRow(0,{keyInstruction:'Updated key instruction'});
 store.getState().undo();assert.equal(store.getState().rows[0].keyInstruction,data.rows[0].keyInstruction);
 store.getState().redo();assert.equal(store.getState().rows[0].keyInstruction,'Updated key instruction');
 const saved=JSON.parse(JSON.stringify(store.getState().getScheduleData()));
 store.getState().loadSchedule('Reloaded',saved);assert.equal(store.getState().rows[0].keyInstruction,'Updated key instruction');
});
