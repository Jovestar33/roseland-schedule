const test=require('node:test'),assert=require('node:assert/strict');
const {split,restore}=require('../../scripts/trial-sync/vercel-details.cjs');
const {decode,runClaim}=require('../../scripts/trial-sync/hosted.cjs');
const {apply}=require('../../scripts/trial-sync/core.cjs');
const contacts=[{id:'person-1',type:'crew',name:'Crew person',role:'Camera',email:'crew@example.test',phone:'',callTime:'8:00 AM'}];
const base={meta:{town:'Town'},rows:[{desc:'Original'}]};
test('new-app contacts and logistics are isolated from legacy documents and restored without mutating either copy',()=>{
 const full={...base,meta:{...base.meta,productionContacts:contacts,callsheet:{parking:'Lot A',hospitalPhone:'555-0100'}}};
 const before=structuredClone(full),parts=split(full);
 assert.deepEqual(full,before);assert.deepEqual(parts.document.meta,{town:'Town',callsheet:{parking:'Lot A'}});
 const changed=structuredClone(parts.document);changed.rows[0].desc='Legacy change';
 const merged=restore(changed,parts.extensions);assert.deepEqual(merged.meta.productionContacts,contacts);assert.equal(merged.meta.callsheet.hospitalPhone,'555-0100');assert.equal(merged.rows[0].desc,'Legacy change');
 assert.equal(changed.meta.productionContacts,undefined);
});
test('legacy-to-new writes preserve current exclusive data and new-to-legacy writes omit it',async()=>{
 for(const direction of ['legacy','new']){
  let left={version:'1',document:structuredClone(base),guard:{}},right={version:'1',document:{...structuredClone(base),meta:{...base.meta,productionContacts:contacts}},guard:{}};
  if(direction==='legacy')left.document.rows[0].desc='Changed';else right.document.rows[0].desc='Changed';
  let netlifyWrites=0,supabaseWrites=0;
  const adapters={netlify:{read:async()=>structuredClone(left),write:async(m,e,d)=>{netlifyWrites++;assert.equal(d.meta.productionContacts,undefined);return left={...left,version:'2',document:d};}},supabase:{read:async()=>({...structuredClone(right),...split(right.document)}),write:async(m,e,d)=>{supabaseWrites++;right={...right,version:'2',document:restore(d,e.extensions)};return {...structuredClone(right),...split(right.document)};}}};
  const state={entries:{test:{base,guards:{netlify:{},supabase:{}},pending:null}}};
  await apply(state,{id:'test'},adapters,async()=>{});
  assert.equal(state.entries.test.status,'synced');assert.deepEqual(right.document.meta.productionContacts,contacts);
  assert.equal(netlifyWrites,direction==='new'?1:0);assert.equal(supabaseWrites,direction==='legacy'?1:0);
 }
});
test('contact-only edits do not create conflicts or writes to the legacy app',async()=>{
 const state={entries:{test:{base,guards:{netlify:{},supabase:{}},pending:null}}};
 const adapters={netlify:{read:async()=>({version:'1',document:base,guard:{}})},supabase:{read:async()=>({version:'2',...split({...base,meta:{...base.meta,productionContacts:contacts}}),guard:{}})}};
 await apply(state,{id:'test'},adapters,async()=>{});assert.equal(state.entries.test.status,'synced');
});
