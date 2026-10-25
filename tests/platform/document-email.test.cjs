const {test}=require('node:test'),assert=require('node:assert/strict');
const {sourceLoader}=require('../editor/source-loader.cjs');
const {normalizeEmailMembers,documentEmail,deliveryStateLabel}=sourceLoader()('lib/platform/document-email.ts');
test('recipient groups normalize addresses and refuse duplicate or malformed recipients',()=>{
 assert.deepEqual(normalizeEmailMembers([{name:' Z ',email:'Z@EXAMPLE.TEST '},{name:'A',email:' a@example.test'}]),[{name:'A',email:'a@example.test'},{name:'Z',email:'z@example.test'}]);
 for(const members of [[],Array(101).fill({name:'A',email:'a@example.test'}),[{name:'A',email:'a@example.test'},{name:'B',email:'A@example.test'}],[{name:'A',email:'a@example.test\nBcc: other@example.test'}],[{name:'A',email:'a@example.test,b@example.test'}]])assert.throws(()=>normalizeEmailMembers(members));
});
test('document emails describe the chosen documents and private printable link',()=>{
 for(const documents of ['schedule','call_sheet','both']){
  const mail=documentEmail({name:'Example shoot',edition:2,documents,url:'https://schedules.example.test/call-sheet#example'});
  assert.match(mail.subject,/^Example shoot — .* \| Roseland Pictures$/);assert.match(mail.text,/Version 2 ·/);
  assert.match(mail.text,/No sign-in required/);assert.match(mail.text,/print or save a PDF/);assert.match(mail.text,/Confirm received/);
  assert.equal((mail.text.match(/https:\/\//g)||[]).length,1);
  assert.match(mail.text,/^Hello,/);assert.match(mail.text,/Thank you,\nRoseland Pictures\nProduction Team/);
  assert.match(mail.text,/questions or need to flag a change/);
  assert.doesNotMatch(mail.text,/attached|latest version|delivery guaranteed/i);
  if(documents==='schedule')assert.match(mail.subject,/— Schedule \|/);
  if(documents==='call_sheet')assert.match(mail.subject,/— Call sheet \|/);
  if(documents==='both')assert.match(mail.text,/View schedule and call sheet/);
 }
});
test('mail handoff never masquerades as receipt or guarantees delivery',()=>{
 assert.equal(deliveryStateLabel('accepted'),'Sent to mail server');
 assert.equal(deliveryStateLabel('not_sent'),'Not sent');
 for(const state of ['sending','uncertain','unknown'])assert.equal(deliveryStateLabel(state),'Check delivery');
});

test('preview does not invent an edition before a send is prepared',()=>{
 const mail=documentEmail({name:'Example shoot',documents:'both',url:'[Document link]'});
 assert.doesNotMatch(mail.text,/Version undefined|Version 1/);
 assert.match(mail.text,/No sign-in required/);
});
