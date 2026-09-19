import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRecipientSession,readRecipientSession} from '../../lib/platform/client-recipient-session.ts';
const secret='fictional-server-key-with-at-least-thirty-two-characters',origin='http://127.0.0.1:3512',now=1900000000;
const grant={hash:'a'.repeat(64),legacy:null,legacyExpires:null};
test('recipient cookie is opaque, origin/selector bound, and has a fixed non-sliding lifetime',()=>{
 const a=createRecipientSession(grant,secret,origin,now),b=createRecipientSession(grant,secret,origin,now);
 assert.notEqual(a.session.recipient,b.session.recipient);assert.notEqual(a.cookie,b.cookie);assert.equal(a.cookie.includes(grant.hash),false);
 const read=readRecipientSession(a.cookie,a.session.recipient,secret,origin,now+500);assert.equal(read?.expires,now+30*86400);
 assert.equal(readRecipientSession(a.cookie,b.session.recipient,secret,origin,now),null);
 assert.equal(readRecipientSession(a.cookie,a.session.recipient,secret,origin+'0',now),null);
 assert.equal(readRecipientSession(a.cookie,a.session.recipient,secret+'rotated',origin,now),null);
 assert.equal(readRecipientSession(a.cookie,a.session.recipient,secret,origin,now+30*86400),null);
});
test('tampered and malformed cookies cannot authorize a recipient',()=>{
 const a=createRecipientSession(grant,secret,origin,now);
 const bytes=Buffer.from(a.cookie,'base64url');bytes[35]^=1;
 for(const value of [undefined,'',bytes.toString('base64url'),'a'.repeat(1401),'../anything'])assert.equal(readRecipientSession(value,a.session.recipient,secret,origin,now),null);
 assert.throws(()=>createRecipientSession(grant,'short',origin,now));
});
test('legacy binding and expiration survive exchange without extension',()=>{
 const a=createRecipientSession({...grant,legacy:'fictional',legacyExpires:now+60},secret,origin,now);
 assert.equal(a.session.expires,now+60);assert.equal(readRecipientSession(a.cookie,a.session.recipient,secret,origin,now+59)?.legacy,'fictional');
 assert.equal(readRecipientSession(a.cookie,a.session.recipient,secret,origin,now+60),null);
 assert.throws(()=>createRecipientSession({...grant,legacy:'fictional',legacyExpires:now},secret,origin,now));
});
