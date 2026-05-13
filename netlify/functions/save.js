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

function comparableScheduleData(data) {
  return { meta: (data && data.meta) || {}, rows: Array.isArray(data && data.rows) ? data.rows : [] };
}
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}
function scheduleHash(data) {
  try { return stableStringify(comparableScheduleData(data)); }
  catch (_) { return ''; }
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };

  try {
    connectLambda(event);
    const {
      name,
      data,
      deleted,
      editorToken,
      deletePassword,
      expectedSavedAt = 0,
      expectedHash = '',
      force = false
    } = JSON.parse(event.body || '{}');

    if (!name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing name' }) };
    if (!isAuthorizedEditor(editorToken)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized editor access' }) };
    }

    const store = getStore('schedules');

    if (deleted || data === null) {
      const DELETE_PASSWORD = process.env.SCHEDULE_DELETE_PASSWORD;
      if (!DELETE_PASSWORD || deletePassword !== DELETE_PASSWORD) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid delete password' }) };
      }
      await store.delete(name);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, name, deleted: true, savedAt: Date.now() }) };
    }

    const currentRaw = await store.get(name);
    let currentData = null;
    if (currentRaw !== null && currentRaw !== undefined) {
      currentData = typeof currentRaw === 'string' ? JSON.parse(currentRaw) : currentRaw;
    }

    if (!force && currentData) {
      const currentSavedAt = Number(currentData.savedAt || 0);
      const currentHash = scheduleHash(currentData);
      const hasBaseline = Boolean(Number(expectedSavedAt || 0) || expectedHash);
      const changedSinceBaseline = hasBaseline && (
        (expectedHash && currentHash && currentHash !== expectedHash) ||
        (Number(expectedSavedAt || 0) && currentSavedAt && currentSavedAt > Number(expectedSavedAt || 0))
      );

      if (changedSinceBaseline) {
        const hashMatch = !expectedHash || !currentHash || currentHash === expectedHash;
        console.log('[Save] Conflict 409 —', name, {
          expectedSavedAt: Number(expectedSavedAt || 0),
          currentSavedAt,
          timeConflict: currentSavedAt > Number(expectedSavedAt || 0),
          hashConflict: !hashMatch,
          expectedHashPrefix: (expectedHash || '').slice(0, 16),
          currentHashPrefix: currentHash.slice(0, 16),
        });
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            error: 'Remote schedule changed since this copy was opened',
            conflict: true,
            name,
            remoteSavedAt: currentSavedAt,
            remoteHash: currentHash,
            remoteData: currentData
          })
        };
      }
    }

    const savedAt = Date.now();
    const payload = { ...(data || {}), savedAt };
    await store.set(name, JSON.stringify(payload), { metadata: { savedAt } });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, name, savedAt, hash: scheduleHash(payload) }) };
  } catch (err) {
    console.error('Save error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, code: err.code || null, status: err.status || null })
    };
  }
};
