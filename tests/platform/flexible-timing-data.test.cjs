const test=require('node:test'),assert=require('node:assert/strict');
const {sourceLoader}=require('../editor/source-loader.cjs'),load=sourceLoader();
const {validateFileDocument,encodeScheduleFile,parseScheduleFile}=load('lib/platform/schedule-files.ts');
const {split,restore}=require('../../scripts/trial-sync/vercel-details.cjs');
const {classify,apply}=require('../../scripts/trial-sync/core.cjs');
const doc={meta:{town:'Test',timing:{mode:'flexible',between:'backward'}},rows:[{action:'Shoot',desc:'Old',timeIn:'11:00 PM',timeInDay:-1,dur:'02:00',fixedOut:true,fixedOutTime:'1:00 AM',fixedOutDay:0}]};
test('file validation accepts both directions and days but rejects unknown settings, decimals and overflows',()=>{
 validateFileDocument(doc);validateFileDocument({...doc,meta:{timing:{mode:'flexible',between:'forward'}}});
 for(const timing of [null,{}, {mode:'flexible'}, {mode:'automatic',between:'forward'},{mode:'flexible',between:'sideways'},{mode:'flexible',between:'forward',extra:true}])assert.throws(()=>validateFileDocument({...doc,meta:{timing}}));
 for(const day of [null,'1',0.5,1000001,NaN,Infinity])assert.throws(()=>validateFileDocument({...doc,rows:[{...doc.rows[0],timeInDay:day}]}));
 validateFileDocument({meta:{},rows:[]});
});
test('JSON export/import, snapshots and Vercel-only details retain all timing metadata',async()=>{
 const source={...doc,meta:{...doc.meta,productionContacts:[],callsheet:{hospitalPhone:'555-0100'}}};
 const file=await encodeScheduleFile([{id:'fixture',display_name:'Timing test',slug:'timing-test',document:source,document_version:1,organization_id:'org',production_id:'prod',production_day_id:null,status:'draft',deleted_at:null}]);
 const [entry]=await parseScheduleFile(JSON.stringify(file),'fallback');assert.deepEqual(entry.data,source);
 const parts=split(source);assert.deepEqual(parts.document.meta.timing,doc.meta.timing);assert.deepEqual(parts.document.rows,doc.rows);assert.deepEqual(restore(parts.document,parts.extensions),source);
});
function pair(value){return {version:'1',document:structuredClone(value),guard:{}};}
const state=()=>({entries:{test:{base:structuredClone(doc),guards:{netlify:{},supabase:{}},pending:null}}});
test('legacy timing, duration, ordering, missing metadata and day changes require conflict review',async()=>{
 for(const change of [d=>d.rows[0].dur='01:00',d=>d.rows[0].timeIn='10:00 PM',d=>d.rows[0].fixedOutDay=1,d=>delete d.meta.timing,d=>d.rows.push({action:'Move',dur:'00:15'})]){
  const s=state(),left=pair(doc),right=pair(doc);change(left.document);let writes=0;const adapters={netlify:{read:async()=>left,write:async()=>writes++},supabase:{read:async()=>right,write:async()=>writes++}};
  await apply(s,{id:'test'},adapters,async()=>{});assert.equal(s.entries.test.status,'content-conflict');assert.equal(writes,0);
 }
});
test('new-app timing edits sync outward; legacy description edits still sync inward',()=>{
 const s=state().entries.test,left=pair(doc),right=pair(doc);right.document.rows[0].dur='01:00';assert.equal(classify(s,left,right),'to-netlify');
 right.document=structuredClone(doc);left.document.rows[0].desc='New description';assert.equal(classify(s,left,right),'to-supabase');
});
test('completed sync writes and rereads retain fixed pins and day offsets in both directions',async()=>{
 for(const from of ['supabase','netlify']){
  const s=state(),copies={netlify:pair(doc),supabase:pair(doc)},to=from==='supabase'?'netlify':'supabase';
  if(from==='supabase'){copies[from].document.rows[0].fixedOutDay=1;copies[from].document.rows[0].timeInDay=0;}else copies[from].document.rows[0].desc='Approved location wording';
  const expected=structuredClone(copies[from].document);let writes=0;
  const adapters=Object.fromEntries(['supabase','netlify'].map(name=>[name,{read:async()=>structuredClone(copies[name]),write:async(_mapping,before,value)=>{assert.equal(name,to);assert.deepEqual(before,copies[name]);writes++;copies[name]={...copies[name],version:'2',document:structuredClone(value)};return structuredClone(copies[name]);}}]));
  await apply(s,{id:'test'},adapters,async()=>{});assert.equal(s.entries.test.status,'synced');assert.equal(writes,1);assert.deepEqual(copies[to].document,expected);assert.deepEqual(s.entries.test.base,expected);
 }
});
