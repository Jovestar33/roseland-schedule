const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const view = require('../../netlify/lib/public-view');
const secret = 'synthetic-secret';
const data = { meta: { town: 'Town', callsheet: { emergency: 'PRIVATE' }, wx: { maxF: 80, hidden: 'PRIVATE' } }, rows: [
  { action: 'Shoot', timeIn: '9:00 AM', dur: '0', notes: 'Visible notes', contactPhone: 'PRIVATE', unknown: 'PRIVATE', subLocations: [{ loc: 'Visible location', secret: 'PRIVATE' }] },
  { contactName: 'PRIVATE', notes: 'PRIVATE hidden row' },
], privateTopLevel: 'PRIVATE' };
function handler() {
  const context = { exports: {}, console, process: { env: { SCHEDULE_APP_PASSWORD: 'synthetic-password', SCHEDULE_AUTH_SECRET: secret } },
    require: name => name === '@netlify/blobs' ? { connectLambda() {}, getStore: () => ({ get: async () => data }) }
      : name === '../lib/public-view' ? view : require(name),
  };
  vm.runInNewContext(fs.readFileSync('netlify/functions/load.js', 'utf8'), context);
  return query => context.exports.handler({ httpMethod: 'GET', queryStringParameters: { name: 'A', ...query } });
}
test('name-only and public=1 requests cannot bypass sharing authorization', async () => {
  const load = handler();
  assert.equal((await load({ public: '1' })).statusCode, 403);
  assert.equal((await load({})).statusCode, 403);
});
test('signed viewers receive only displayed fields; editors retain full documents', async () => {
  const load = handler(); const response = await load({ viewToken: view.makeViewToken('A', secret) });
  assert.equal(response.statusCode, 200); assert.ok(!response.body.includes('PRIVATE'));
  assert.equal(JSON.parse(response.body).rows[0].notes, 'Visible notes');
  assert.equal(JSON.parse(response.body).rows[0].dur, '0');
  const editorToken = crypto.createHmac('sha256', secret).update('editor:synthetic-password').digest('hex');
  assert.deepEqual(JSON.parse((await load({ editorToken })).body), data);
});
test('view links are scoped, expire, and reject legacy or altered tokens', () => {
  const token = view.makeViewToken('A', secret);
  assert.equal(view.isAuthorizedView('A', token, secret), true);
  assert.equal(view.isAuthorizedView('B', token, secret), false);
  assert.equal(view.isAuthorizedView('A', token + 'x', secret), false);
  assert.equal(view.isAuthorizedView('A', 'a'.repeat(64), secret), false);
  const realNow = Date.now;
  try { Date.now = () => realNow() + 31 * 86400 * 1000; assert.equal(view.isAuthorizedView('A', token, secret), false); }
  finally { Date.now = realNow; }
});
