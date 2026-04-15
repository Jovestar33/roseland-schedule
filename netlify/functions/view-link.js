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
    const name = event.queryStringParameters?.name;
    const editorToken = event.queryStringParameters?.editorToken;
    const AUTH_SECRET = process.env.SCHEDULE_AUTH_SECRET;

    if (!name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing name' }) };
    if (!AUTH_SECRET) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing auth secret' }) };

    if (!isAuthorizedEditor(editorToken)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized editor access' }) };
    }

    const viewToken = makeViewToken(name, AUTH_SECRET);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, name, viewToken }) };
  } catch (err) {
    console.error('View link error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
