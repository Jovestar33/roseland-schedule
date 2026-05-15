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

const PROJECT_NAME = 'Main to Main Trail';
const PHASE        = 'Drive In / Drive Out';

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };

  try {
    connectLambda(event);
    const { editorToken } = JSON.parse(event.body || '{}');

    if (!isAuthorizedEditor(editorToken)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized editor access' }) };
    }

    const store = getStore('schedules');
    const { blobs } = await store.list();

    const migrated = [];
    const skipped  = [];
    const errors   = [];

    for (const blob of blobs) {
      const name = blob.key;
      try {
        const raw = await store.get(name);
        if (raw === null || raw === undefined) { errors.push(name); continue; }

        const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const meta = data.meta || {};

        // Skip schedules that already have a project name set.
        if (meta.projectName && meta.projectName.trim() !== '') {
          skipped.push(name);
          continue;
        }

        // Patch only projectName and phase — preserve savedAt and all other fields exactly.
        const patched = {
          ...data,
          meta: { ...meta, projectName: PROJECT_NAME, phase: PHASE },
        };

        await store.set(name, JSON.stringify(patched), { metadata: { savedAt: patched.savedAt } });
        migrated.push(name);
      } catch (err) {
        console.error(`migrate-project-meta: error on "${name}":`, err);
        errors.push(name);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, migrated, skipped, errors }),
    };
  } catch (err) {
    console.error('migrate-project-meta error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, code: err.code || null }),
    };
  }
};
