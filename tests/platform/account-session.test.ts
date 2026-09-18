import test from 'node:test';
import assert from 'node:assert/strict';
import { accountSessionStorage, parseAccountCallback } from '../../lib/platform/account-session.ts';
function storage():Storage { const values=new Map<string,string>();return {get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>{values.set(k,v);},removeItem:k=>{values.delete(k);},clear:()=>values.clear()}; }
test('email callbacks accept only explicit operation and hash; reject duplicates and redirect injection',()=>{
 const hash='a'.repeat(56),invite='12345678-1234-1234-1234-123456789abc';
 assert.equal(parseAccountCallback(`#b08=invite&token_hash=${hash}&invitation=${invite}`)?.invitationId,invite);
 assert.equal(parseAccountCallback(`#b08=recovery&token_hash=${hash}`)?.type,'recovery');
 for(const s of [`#b08=login&token_hash=${hash}`,`#b08=recovery&token_hash=${hash}&redirect_to=https://bad.test`,`#b08=recovery&b08=invite&token_hash=${hash}`,'#b08=recovery&token_hash=bad',`#b08=invite&token_hash=${hash}&invitation=bad`])assert.equal(parseAccountCallback(s),null);
});
test('Remember me persists authentication only and never changes draft journals',()=>{
 const local=storage(),tab=storage();local.setItem('draft-journal','keep');
 const one=accountSessionStorage('a',{local,tab});one.setItem('auth','one');
 assert.equal(local.getItem('a:auth'),null);assert.equal(tab.getItem('a:auth'),'one');
 one.setRemember(true);assert.equal(local.getItem('a:auth'),'one');assert.equal(tab.getItem('a:auth'),null);
 const reopened=accountSessionStorage('a',{local,tab:storage()});assert.equal(reopened.getItem('auth'),'one');
 reopened.setItem('auth','refreshed');assert.equal(local.getItem('a:auth'),'refreshed');
 reopened.removeItem('auth');assert.equal(local.getItem('a:auth'),null);assert.equal(local.getItem('draft-journal'),'keep');
});
test('unremembered auth does not survive a new tab; origin namespaces and accounts do not share a key',()=>{
 const local=storage(),tab=storage();const a=accountSessionStorage('a',{local,tab});a.setItem('auth','account-a');
 assert.equal(accountSessionStorage('a',{local,tab:storage()}).getItem('auth'),null);
 assert.equal(accountSessionStorage('b',{local,tab}).getItem('auth'),null);
 a.setRemember(true);a.setItem('auth','account-b');assert.equal(a.getItem('auth'),'account-b');a.setRemember(false);assert.equal(local.getItem('a:auth'),null);assert.equal(tab.getItem('a:auth'),'account-b');
});
