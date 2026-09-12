const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const blobs = require('@netlify/blobs');
const { sourceLoader } = require('./source-loader.cjs');

// Real function and SDK; replace only the provider transport with a synthetic
// atomic object store. Nothing in this test can access Netlify or live data.
function setup({ failWrite = false } = {}) {
  const entries = new Map(), writes = [], etags = new Map();
  let version = 0;
  const editorToken = crypto.createHmac('sha256', 'test-secret').update('editor:test-password').digest('hex');
  const context = {
    exports: {}, console: { error() {} },
    process: { env: { SCHEDULE_APP_PASSWORD: 'test-password', SCHEDULE_AUTH_SECRET: 'test-secret' } },
    require: name => name === '@netlify/blobs' ? {
      connectLambda() {},
      getStore: options => blobs.getStore({ ...options, siteID: 'synthetic', token: 'synthetic', edgeURL: 'https://synthetic.invalid', uncachedEdgeURL: 'https://synthetic.invalid' }),
    } : require(name),
    fetch: async (url, options) => {
      assert.equal(new URL(url).hostname, 'synthetic.invalid');
      const key = new URL(url).pathname;
      if (options.method.toLowerCase() === 'get') {
        return entries.has(key) ? new Response(entries.get(key), { headers: { etag: etags.get(key) } }) : new Response(null, { status: 404 });
      }
      assert.equal(options.method.toLowerCase(), 'put');
      writes.push(options);
      if (failWrite) return new Response(null, { status: 503 });
      if (options.headers['if-none-match'] === '*' && entries.has(key)) return new Response(null, { status: 412 });
      if (options.headers['if-match'] && options.headers['if-match'] !== etags.get(key)) return new Response(null, { status: 412 });
      entries.set(key, options.body);
      etags.set(key, `version-${++version}`);
      return new Response(null, { status: 200, headers: { etag: etags.get(key) } });
    },
  };
  vm.runInNewContext(fs.readFileSync('netlify/functions/save.js', 'utf8'), context);
  const save = (args = {}) => context.exports.handler({ httpMethod: 'POST', body: JSON.stringify({
    name: 'Schedule', data: { meta: { town: 'Original' }, rows: [] }, editorToken, ...args,
  }) });
  return { save, entries, writes };
}
test('Save As refuses an existing name even with force and preserves its contents', async () => {
  const h = setup(); assert.equal((await h.save({ createOnly: true })).statusCode, 200);
  const before = [...h.entries.values()][0];
  const response = await h.save({ createOnly: true, force: true, data: { meta: { town: 'Replacement' } } });
  assert.equal(response.statusCode, 409);
  assert.equal(JSON.parse(response.body).code, 'NAME_EXISTS');
  assert.equal([...h.entries.values()][0], before);
  assert.equal(h.writes[1].headers['if-none-match'], '*');
});
test('two simultaneous Save As requests for one name produce exactly one winner', async () => {
  const h = setup();
  const results = await Promise.all(['First', 'Second'].map(town => h.save({ createOnly: true, data: { meta: { town } } })));
  assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
  const winner = results.findIndex(r => r.statusCode === 200);
  assert.equal(JSON.parse([...h.entries.values()][0]).meta.town, ['First', 'Second'][winner]);
});
test('a provider outage must not be reported as a successful conditional save', async () => {
  const h = setup({ failWrite: true });
  const result = await h.save({ createOnly: true });
  assert.equal(result.statusCode, 500);
  assert.match(JSON.parse(result.body).error, /storage write failed/);
  assert.equal(h.entries.size, 0);
});
test('normal saves retain timestamp conflict protection and allow intended updates', async () => {
  const h = setup(); const first = await h.save({ createOnly: true });
  const savedAt = JSON.parse(first.body).savedAt;
  assert.equal((await h.save({ expectedSavedAt: savedAt - 1 })).statusCode, 409);
  assert.equal((await h.save({ expectedSavedAt: savedAt, data: { rows: [], meta: { town: 'Edited' } } })).statusCode, 200);
  assert.equal(JSON.parse([...h.entries.values()][0]).meta.town, 'Edited');
});
test('create-only requests still require an authorized editor', async () => {
  const h = setup();
  assert.equal((await h.save({ createOnly: true, editorToken: 'invalid' })).statusCode, 403);
  assert.equal(h.writes.length, 0);
});
test('save API distinguishes a name collision from a remote-version conflict', async () => {
  const originalFetch = global.fetch;
  try {
    const { postSave } = sourceLoader()('lib/api/save.ts');
    global.fetch = async (_url, options) => {
      assert.equal(JSON.parse(options.body).createOnly, true);
      return new Response(JSON.stringify({ code: 'NAME_EXISTS', error: 'Choose another name' }), { status: 409 });
    };
    await assert.rejects(postSave('Duplicate', {}, 'synthetic', { createOnly: true }), error => {
      assert.equal(error.nameExists, true); assert.equal(error.conflict, false); return true;
    });
  } finally { global.fetch = originalFetch; }
});

test('two ordinary saves of the same baseline cannot overwrite each other', async () => {
  const h = setup(); const first = await h.save({ createOnly: true });
  const expectedSavedAt = JSON.parse(first.body).savedAt;
  const results = await Promise.all(['First edit', 'Second edit'].map(town => h.save({ expectedSavedAt, data: { meta: { town }, rows: [] } })));
  assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
  assert.ok(h.writes.slice(1).every(write => write.headers['if-match']));
  const conflict = JSON.parse(results.find(r => r.statusCode === 409).body);
  assert.equal(conflict.remoteSavedAt, JSON.parse(results.find(r => r.statusCode === 200).body).savedAt);
});
test('baseline-free ordinary save cannot replace an existing schedule', async () => {
  const h = setup(); await h.save({ createOnly: true });
  const before = [...h.entries.values()][0];
  assert.equal((await h.save()).statusCode, 409);
  assert.equal([...h.entries.values()][0], before);
});
test('a stale update cannot resurrect a deleted document', async () => {
  const h = setup(); const first = await h.save({ createOnly: true });
  h.entries.clear();
  assert.equal((await h.save({ expectedSavedAt: JSON.parse(first.body).savedAt })).statusCode, 409);
  assert.equal(h.entries.size, 0);
});
