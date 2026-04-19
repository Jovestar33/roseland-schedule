const { connectLambda, getStore } = require('@netlify/blobs');
const crypto = require('crypto');

function makeEditorToken(password, secret) {
  return crypto.createHmac('sha256', secret).update(`editor:${password}`).digest('hex');
}

function makeViewToken(name, secret) {
  return crypto.createHmac('sha256', secret).update(`view:${name}`).digest('hex');
}

function isAuthorizedEditor(token) {
  const APP_PASSWORD = process.env.SCHEDULE_APP_PASSWORD;
  const AUTH_SECRET = process.env.SCHEDULE_AUTH_SECRET;
  if (!APP_PASSWORD || !AUTH_SECRET || !token) return false;
  return token === makeEditorToken(APP_PASSWORD, AUTH_SECRET);
}

function isAuthorizedView(name, token) {
  const AUTH_SECRET = process.env.SCHEDULE_AUTH_SECRET;
  if (!AUTH_SECRET || !name || !token) return false;
  return token === makeViewToken(name, AUTH_SECRET);
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: 'Method not allowed' };

  try {
    connectLambda(event);
    const store = getStore('schedules');

    const name = event.queryStringParameters?.name;
    const editorToken = event.queryStringParameters?.editorToken;
    const viewToken = event.queryStringParameters?.viewToken || event.queryStringParameters?.vt;

    if (!name) {
      if (!isAuthorizedEditor(editorToken)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized editor access' }) };
      }
      const { blobs } = await store.list();
      return { statusCode: 200, headers, body: JSON.stringify({ schedules: blobs.map((b) => b.key) }) };
    }

    if (!isAuthorizedEditor(editorToken) && !isAuthorizedView(name, viewToken)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized access' }) };
    }

    const raw = await store.get(name);
    if (raw === null || raw === undefined) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    }

    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    console.error('Load error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, code: err.code || null, status: err.status || null })
    };
  }
};
