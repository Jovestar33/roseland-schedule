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
      force = false,
      createOnly = false
    } = JSON.parse(event.body || '{}');

    if (!name) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing name' }) };
    if (!isAuthorizedEditor(editorToken)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized editor access' }) };
    }

    const store = getStore({
      name: 'schedules',
      // SDK 10 conditional writes misreport non-412 errors as successful writes.
      // Reject failed PUTs at the transport boundary until upstream #741 is fixed.
      fetch: async (url, options) => {
        const response = await fetch(url, options);
        if (options?.method?.toUpperCase() === 'PUT' && !response.ok && response.status !== 412) {
          throw new Error(`Schedule storage write failed: HTTP ${response.status}`);
        }
        return response;
      },
    });

    if (deleted || data === null) {
      const DELETE_PASSWORD = process.env.SCHEDULE_DELETE_PASSWORD;
      if (!DELETE_PASSWORD || deletePassword !== DELETE_PASSWORD) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid delete password' }) };
      }
      await store.delete(name);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, name, deleted: true, savedAt: Date.now() }) };
    }

    const currentRaw = createOnly ? null : await store.get(name);
    let currentData = null;
    if (currentRaw !== null && currentRaw !== undefined) {
      currentData = typeof currentRaw === 'string' ? JSON.parse(currentRaw) : currentRaw;
    }

    if (!force && currentData) {
      const currentSavedAt = Number(currentData.savedAt || 0);
      const expectedSavedAtNum = Number(expectedSavedAt || 0);
      // Three-way savedAt comparison — hash dropped because Netlify Blobs eventual
      // consistency makes hash comparison unreliable across rapid successive reads.
      //   currentSavedAt > expectedSavedAt → real concurrent change → 409
      //   currentSavedAt <= expectedSavedAt → stale read or no change → allow write
      if (expectedSavedAtNum > 0 && currentSavedAt > expectedSavedAtNum) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            error: 'Remote schedule changed since this copy was opened',
            conflict: true,
            name,
            remoteSavedAt: currentSavedAt,
            remoteData: currentData
          })
        };
      }
    }

    const savedAt = Date.now();
    const payload = { ...(data || {}), savedAt };
    const written = await store.set(name, JSON.stringify(payload), {
      metadata: { savedAt },
      ...(createOnly ? { onlyIfNew: true } : {}),
    });
    if (createOnly && !written.modified) {
      return { statusCode: 409, headers, body: JSON.stringify({
        code: 'NAME_EXISTS', error: 'A schedule with that name already exists. Choose a different name.',
      }) };
    }

    // townCache / dateCache are populated lazily by LibraryPage (which falls back
    // to the loaded schedule data). We no longer write them here because doing a
    // read-modify-write on rp_library_index_v1 in the same Lambda as an archive
    // PUT can race and silently clobber tsarchived / phaseOrder fields.

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
