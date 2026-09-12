const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { sourceLoader } = require('./source-loader.cjs');
const localTemplate = { rows: [{ action: 'Local' }], savedAt: 1 };
const remoteTemplate = { rows: [{ action: 'Remote' }], savedAt: 2 };

test('template recovery preserves collisions and is idempotent', async () => {
  let data = { Shared: remoteTemplate }, version = 1;
  const context = { exports: {}, console, process: { env: { SCHEDULE_APP_PASSWORD: 'test', SCHEDULE_AUTH_SECRET: 'test' } },
    require: name => name === '@netlify/blobs' ? { connectLambda() {}, getStore: () => ({
      getWithMetadata: async () => ({ data: structuredClone(data), etag: String(version) }),
      set: async (_key, value, options) => {
        if (options.onlyIfMatch !== String(version)) return { modified: false };
        data = JSON.parse(value); version++; return { modified: true };
      },
    }) } : require(name),
  };
  vm.runInNewContext(fs.readFileSync('netlify/lib/templates-handler.cjs', 'utf8'), context);
  const editorToken = crypto.createHmac('sha256', 'test').update('editor:test').digest('hex');
  const request = () => context.exports.createHandler(context.require('@netlify/blobs').getStore)({ httpMethod: 'POST', body: JSON.stringify({ editorToken, action: 'replace', templates: { Shared: localTemplate } }) });
  assert.equal((await request()).statusCode, 200);
  assert.deepEqual(data.Shared, remoteTemplate);
  assert.deepEqual(data['Shared (recovered 1)'], localTemplate);
  assert.equal((await request()).statusCode, 200);
  assert.equal(Object.keys(data).length, 2);
  assert.equal(version, 2);
});
for (const scenario of ['failure', 'incomplete', 'changed locally', 'success']) {
  test(`local template copies survive ${scenario} unless fully acknowledged and unchanged`, async () => {
    const originalFetch = global.fetch, originalStorage = global.localStorage;
    let local = { Local: localTemplate }, removed = false;
    const api = sourceLoader({ '../templates': { getTemplates: () => local } })('lib/api/templates.ts');
    global.localStorage = { removeItem() { removed = true; } };
    global.fetch = async (_url, options) => {
      if (!options.method) return new Response(JSON.stringify({ templates: { Remote: remoteTemplate } }));
      if (scenario === 'failure') return new Response(null, { status: 503 });
      if (scenario === 'changed locally') local = { ...local, New: remoteTemplate };
      return new Response(JSON.stringify({ templates: scenario === 'incomplete' ? {} : { Local: localTemplate, Remote: remoteTemplate } }));
    };
    try {
      if (['failure', 'incomplete'].includes(scenario)) await assert.rejects(api.loadTemplatesWithRecovery('synthetic'));
      else await api.loadTemplatesWithRecovery('synthetic');
      assert.equal(removed, scenario === 'success');
    } finally { global.fetch = originalFetch; global.localStorage = originalStorage; }
  });
}
