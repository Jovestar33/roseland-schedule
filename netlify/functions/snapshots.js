const { connectLambda, getStore } = require('@netlify/blobs');
const crypto = require('crypto');

function makeEditorToken(password, secret) {
  return crypto.createHmac('sha256', secret).update(`editor:${password}`).digest('hex');
}

function isAuthorizedEditor(token) {
  const APP_PASSWORD = process.env.SCHEDULE_APP_PASSWORD;
  const AUTH_SECRET = process.env.SCHEDULE_AUTH_SECRET;
  if (!APP_PASSWORD || !AUTH_SECRET || !token) return false;
  return token === makeEditorToken(APP_PASSWORD, AUTH_SECRET);
}

function keyForName(name) {
  return 'snapshots_' + crypto.createHash('sha256').update(String(name || '')).digest('hex');
}

function normalizeSnapshots(snaps) {
  return (Array.isArray(snaps) ? snaps : [])
    .filter((s) => s && s.data)
    .map((s) => ({
      id: String(s.id || crypto.randomUUID()),
      savedAt: Number(s.savedAt || Date.now()),
      label: String(s.label || 'Snapshot'),
      data: s.data,
    }))
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))
    .slice(0, 10);
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (!['GET', 'POST'].includes(event.httpMethod)) return { statusCode: 405, headers, body: 'Method not allowed' };

  try {
    connectLambda(event);
    const body = event.httpMethod === 'POST' ? JSON.parse(event.body || '{}') : {};
    const editorToken = event.httpMethod === 'GET' ? event.queryStringParameters?.editorToken : body.editorToken;
    const name = event.httpMethod === 'GET' ? event.queryStringParameters?.name : body.name;

    if (!isAuthorizedEditor(editorToken)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized editor access' }) };
    }
    if (!name) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing schedule name' }) };
    }

    const store = getStore('schedule-snapshots');
    const key = keyForName(name);
    const raw = await store.get(key);
    let record = raw === null || raw === undefined ? { name, snapshots: [] } : (typeof raw === 'string' ? JSON.parse(raw) : raw);
    record.name = name;
    record.snapshots = normalizeSnapshots(record.snapshots);

    if (event.httpMethod === 'GET') {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, name, snapshots: record.snapshots }) };
    }

    const action = body.action || 'add';
    if (action === 'add') {
      const snapshot = body.snapshot || {};
      record.snapshots = normalizeSnapshots([snapshot, ...record.snapshots]);
    } else if (action === 'delete') {
      const snapshotId = String(body.snapshotId || '');
      record.snapshots = normalizeSnapshots(record.snapshots.filter((s) => s.id !== snapshotId));
    } else if (action === 'replace') {
      record.snapshots = normalizeSnapshots(body.snapshots || []);
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown snapshot action' }) };
    }

    record.updatedAt = Date.now();
    await store.set(key, JSON.stringify(record), { metadata: { name, updatedAt: record.updatedAt } });
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, name, snapshots: record.snapshots }) };
  } catch (err) {
    console.error('Snapshots error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, code: err.code || null, status: err.status || null }),
    };
  }
};
