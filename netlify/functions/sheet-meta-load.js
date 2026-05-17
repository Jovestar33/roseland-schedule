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

function defaultSheetMeta() {
  return {
    distributionList: [],
    clientReps: [],
    emergencyContact: { name: '', phone: '', backupPhone: '' },
    additionalCrew: [],
    dietaryRestrictions: [],
  };
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: 'Method not allowed' };

  try {
    connectLambda(event);
    const name = event.queryStringParameters?.name;
    const editorToken = event.queryStringParameters?.editorToken;
    const isPublic = event.queryStringParameters?.public === '1';

    if (!name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing name' }) };
    if (!isPublic && !isAuthorizedEditor(editorToken)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const store = getStore('sheet-meta');
    const raw = await store.get(name);
    const data = raw
      ? { ...defaultSheetMeta(), ...(typeof raw === 'string' ? JSON.parse(raw) : raw) }
      : defaultSheetMeta();

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, data }) };
  } catch (err) {
    console.error('sheet-meta-load error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
