const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('deployed Request/Response entrypoints preserve native strong-read context across saving, listing, templates and snapshots', async () => {
  const originalFetch = global.fetch;
  const names = ['NETLIFY_BLOBS_CONTEXT', 'SCHEDULE_APP_PASSWORD', 'SCHEDULE_AUTH_SECRET'];
  const originalEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const entries = new Map();
  const reads = [];
  let version = 0;
  const nativeContext = Buffer.from(JSON.stringify({
    siteID: 'synthetic-site', token: 'synthetic-token',
    edgeURL: 'https://cached.invalid', uncachedEdgeURL: 'https://fresh.invalid',
  })).toString('base64');
  process.env.NETLIFY_BLOBS_CONTEXT = nativeContext;
  process.env.SCHEDULE_APP_PASSWORD = 'synthetic-password';
  process.env.SCHEDULE_AUTH_SECRET = 'synthetic-secret';
  const editorToken = crypto.createHmac('sha256', 'synthetic-secret').update('editor:synthetic-password').digest('hex');
  // Use the real SDK and exported function entrypoints; only network transport
  // is synthetic. In particular, do not mock connectLambda or getStore.
  global.fetch = async (input, options) => {
    const url = new URL(input);
    assert.ok(['cached.invalid', 'fresh.invalid'].includes(url.hostname));
    const method = options.method.toUpperCase();
    const existing = entries.get(url.pathname);
    if (method === 'GET') {
      reads.push(url.pathname);
      assert.equal(url.hostname, 'fresh.invalid', 'version reads must use the uncached endpoint');
      if (url.pathname.split('/').filter(Boolean).length === 2) {
        return new Response(JSON.stringify({ blobs: [...entries.keys()].filter(key => key.startsWith(url.pathname + '/')).map(key => ({ key: key.slice(url.pathname.length + 1) })) }));
      }
      return existing ? new Response(existing.body, { headers: { etag: existing.etag } }) : new Response(null, { status: 404 });
    }
    assert.equal(method, 'PUT');
    const headers = new Headers(options.headers);
    if ((headers.get('if-none-match') === '*' && existing) ||
        (headers.has('if-match') && headers.get('if-match') !== existing?.etag)) return new Response(null, { status: 412 });
    const etag = `v${++version}`;
    entries.set(url.pathname, { body: options.body, etag });
    return new Response(null, { headers: { etag } });
  };
  try {
    const { default: save } = await import('../../netlify/functions/save.mjs');
    const { default: load } = await import('../../netlify/functions/load.mjs');
    const { default: templates } = await import('../../netlify/functions/templates.mjs');
    const { default: snapshots } = await import('../../netlify/functions/snapshots.mjs');
    const post = (handler, body) => handler(new Request('https://staging.invalid/function', {
      method: 'POST', body: JSON.stringify({ editorToken, ...body }),
    }));
    const first = await post(save, { name: 'Fixture', createOnly: true, data: { rows: [] } });
    assert.equal(first.status, 200);
    const { savedAt } = await first.json();
    const list = await load(new Request(`https://staging.invalid/load?editorToken=${editorToken}`));
    assert.equal(list.status, 200);
    assert.deepEqual((await list.json()).schedules, ['Fixture']);
    const read = await load(new Request(`https://staging.invalid/load?name=Fixture&editorToken=${editorToken}`));
    assert.equal(read.status, 200);
    assert.equal((await read.json()).savedAt, savedAt);
    const update = await post(save, { name: 'Fixture', expectedSavedAt: savedAt, data: { rows: [{ action: 'Updated' }] } });
    assert.equal(update.status, 200);
    assert.equal((await post(save, { name: 'Fixture', expectedSavedAt: savedAt, data: { rows: [] } })).status, 409);
    assert.equal((await post(save, { name: 'Fixture', createOnly: true, data: { rows: [] } })).status, 409);
    assert.equal((await post(templates, { action: 'save', name: 'Fixture', rows: [{ action: 'Template' }] })).status, 200);
    const templateRead = await templates(new Request(`https://staging.invalid/templates?editorToken=${editorToken}`));
    assert.equal(templateRead.status, 200);
    assert.equal((await templateRead.json()).templates.Fixture.rows[0].action, 'Template');
    const snapshotWrite = await post(snapshots, { name: 'Fixture', snapshot: { id: 'initial', label: 'Initial', savedAt: 1, data: { rows: [] } } });
    assert.equal(snapshotWrite.status, 200);
    const snapshotRead = await snapshots(new Request(`https://staging.invalid/snapshots?name=Fixture&editorToken=${editorToken}`));
    assert.equal(snapshotRead.status, 200);
    assert.equal((await snapshotRead.json()).snapshots[0].id, 'initial');
    assert.ok(reads.length >= 7);
    assert.equal(process.env.NETLIFY_BLOBS_CONTEXT, nativeContext);
    assert.equal((await save(new Request('https://staging.invalid/save', { method: 'OPTIONS' }))).status, 200);
    assert.equal((await save(new Request('https://staging.invalid/save'))).status, 405);
  } finally {
    global.fetch = originalFetch;
    for (const name of names) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  }
});
