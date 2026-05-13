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

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (!['GET', 'POST'].includes(event.httpMethod)) return { statusCode: 405, headers, body: 'Method not allowed' };

  try {
    connectLambda(event);
    const body = event.httpMethod === 'POST' ? JSON.parse(event.body || '{}') : {};
    const editorToken = event.httpMethod === 'GET' ? event.queryStringParameters?.editorToken : body.editorToken;

    if (!isAuthorizedEditor(editorToken)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const store = getStore('schedule-templates');
    const raw = await store.get('templates');
    let templates = raw === null || raw === undefined
      ? {}
      : (typeof raw === 'string' ? JSON.parse(raw) : raw);

    if (event.httpMethod === 'GET') {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, templates }) };
    }

    const { action, name, rows } = body;

    if (action === 'save') {
      if (!name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing name' }) };
      templates[name] = { rows: (rows || []).filter((r) => !r.sunLocked), savedAt: Date.now() };
    } else if (action === 'delete') {
      if (!name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing name' }) };
      delete templates[name];
    } else if (action === 'replace') {
      // Used for one-time localStorage migration
      templates = body.templates || {};
    } else {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
    }

    await store.set('templates', JSON.stringify(templates));
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, templates }) };
  } catch (err) {
    console.error('Templates error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
