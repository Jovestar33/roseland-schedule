const crypto = require('crypto');

function makeEditorToken(password, secret) {
  return crypto.createHmac('sha256', secret).update(`editor:${password}`).digest('hex');
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };

  try {
    const { password } = JSON.parse(event.body || '{}');
    const APP_PASSWORD = process.env.SCHEDULE_APP_PASSWORD;
    const AUTH_SECRET = process.env.SCHEDULE_AUTH_SECRET;

    if (!APP_PASSWORD || !AUTH_SECRET) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing auth env vars' }) };
    }

    if (!password || password !== APP_PASSWORD) {
      return { statusCode: 403, headers, body: JSON.stringify({ ok: false, error: 'Invalid password' }) };
    }

    const token = makeEditorToken(APP_PASSWORD, AUTH_SECRET);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, token }) };
  } catch (err) {
    console.error('Auth error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
