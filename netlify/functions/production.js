const { connectLambda, getStore } = require('@netlify/blobs');
const crypto = require('crypto');

function makeEditorToken(password, secret) {
  return crypto.createHmac('sha256', secret).update(`editor:${password}`).digest('hex');
}
function isAuthorizedEditor(token) {
  const APP_PASSWORD = process.env.SCHEDULE_APP_PASSWORD;
  const AUTH_SECRET  = process.env.SCHEDULE_AUTH_SECRET;
  if (!APP_PASSWORD || !AUTH_SECRET || !token) return false;
  return token === makeEditorToken(APP_PASSWORD, AUTH_SECRET);
}

const KEY = 'rp_production_v1';

function defaultIndex() {
  return { version: 1, productions: [], days: [], updatedAt: Date.now() };
}

function sanitize(incoming) {
  return {
    version: 1,
    productions: Array.isArray(incoming.productions) ? incoming.productions : [],
    days:        Array.isArray(incoming.days)        ? incoming.days        : [],
    updatedAt:   Date.now(),
  };
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
  if (!['GET', 'POST'].includes(event.httpMethod)) {
    return { statusCode: 405, headers, body: 'Method not allowed' };
  }

  try {
    connectLambda(event);

    const token = event.httpMethod === 'GET'
      ? event.queryStringParameters?.editorToken
      : JSON.parse(event.body || '{}').editorToken;

    if (!isAuthorizedEditor(token)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const store = getStore('production-index');

    if (event.httpMethod === 'GET') {
      const raw = await store.get(KEY);
      const index = (raw === null || raw === undefined)
        ? defaultIndex()
        : sanitize(typeof raw === 'string' ? JSON.parse(raw) : raw);
      console.log('[Production GET] ok — productions:', index.productions.length, 'days:', index.days.length);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, index }) };
    }

    const body    = JSON.parse(event.body || '{}');
    const index   = sanitize(body.index || {});
    await store.set(KEY, JSON.stringify(index), { metadata: { updatedAt: index.updatedAt } });
    console.log('[Production POST] saved — productions:', index.productions.length, 'days:', index.days.length);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, index }) };
  } catch (err) {
    console.error('[Production] error:', err.name, err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
