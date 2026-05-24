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

function snapshotKeyForName(name) {
  return 'snapshots_' + crypto.createHash('sha256').update(String(name || '')).digest('hex');
}

function defaultLibrary() {
  return { version: 1, folders: [], scheduleFolderMap: {}, updatedAt: Date.now() };
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };

  try {
    connectLambda(event);
    const { name, editorToken, deletePassword } = JSON.parse(event.body || '{}');

    console.log('[DeleteSchedule] request — name:', name,
      'hasToken:', !!editorToken, 'hasPassword:', !!deletePassword);

    if (!name || typeof name !== 'string' || !name.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing or invalid schedule name' }) };
    }

    if (!isAuthorizedEditor(editorToken)) {
      console.log('[DeleteSchedule] rejected — invalid editor token');
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized editor access' }) };
    }

    const DELETE_PASSWORD = process.env.SCHEDULE_DELETE_PASSWORD;
    if (!DELETE_PASSWORD || deletePassword !== DELETE_PASSWORD) {
      console.log('[DeleteSchedule] rejected — invalid delete password');
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid delete password' }) };
    }

    const scheduleName = name.trim();

    // 1. Delete the schedule blob
    const schedStore = getStore('schedules');
    try {
      await schedStore.delete(scheduleName);
      console.log('[DeleteSchedule] schedule blob deleted:', scheduleName);
    } catch (err) {
      console.error('[DeleteSchedule] schedule blob delete failed:', err.message);
      throw new Error(`Schedule blob delete failed: ${err.message}`);
    }

    // 2. Delete associated snapshot blob (best-effort — a missing snapshot is not an error)
    const snapStore = getStore('schedule-snapshots');
    try {
      await snapStore.delete(snapshotKeyForName(scheduleName));
      console.log('[DeleteSchedule] snapshot blob deleted for:', scheduleName);
    } catch (err) {
      console.warn('[DeleteSchedule] snapshot blob delete non-fatal:', err.message);
    }

    // 3. Read, clean, and write library metadata
    const libStore = getStore('schedule-library');
    const libKey = 'rp_library_index_v1';

    let library;
    try {
      const raw = await libStore.get(libKey);
      library = raw === null || raw === undefined
        ? defaultLibrary()
        : (typeof raw === 'string' ? JSON.parse(raw) : raw);
      console.log('[DeleteSchedule] library meta read — tsarchived count:',
        (library.tsarchived || []).length);
    } catch (err) {
      console.error('[DeleteSchedule] library meta read failed:', err.message);
      // Schedule is already deleted — return partial success
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          name: scheduleName,
          library: null,
          warning: 'Schedule deleted but library metadata could not be read for cleanup',
        }),
      };
    }

    // Remove from tsarchived
    if (Array.isArray(library.tsarchived)) {
      library.tsarchived = library.tsarchived.filter((n) => n !== scheduleName);
    }

    // Remove from phaseOrder
    if (library.phaseOrder && typeof library.phaseOrder === 'object') {
      for (const pk of Object.keys(library.phaseOrder)) {
        if (library.phaseOrder[pk] && typeof library.phaseOrder[pk] === 'object') {
          for (const phk of Object.keys(library.phaseOrder[pk])) {
            library.phaseOrder[pk][phk] = (library.phaseOrder[pk][phk] || [])
              .filter((n) => n !== scheduleName);
          }
        }
      }
    }

    // Remove from scheduleFolderMap
    if (library.scheduleFolderMap && typeof library.scheduleFolderMap === 'object') {
      delete library.scheduleFolderMap[scheduleName];
    }

    // Remove from townCache
    if (library.townCache && typeof library.townCache === 'object') {
      delete library.townCache[scheduleName];
    }

    // Remove from dateCache
    if (library.dateCache && typeof library.dateCache === 'object') {
      delete library.dateCache[scheduleName];
    }

    library.updatedAt = Date.now();

    try {
      await libStore.set(libKey, JSON.stringify(library), { metadata: { updatedAt: library.updatedAt } });
      console.log('[DeleteSchedule] library metadata cleaned and saved');
    } catch (err) {
      console.error('[DeleteSchedule] library metadata save failed:', err.message);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          name: scheduleName,
          library: null,
          warning: 'Schedule deleted but library metadata save failed',
        }),
      };
    }

    console.log('[DeleteSchedule] complete success:', scheduleName);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, name: scheduleName, library }) };
  } catch (err) {
    console.error('[DeleteSchedule] handler error:', err.name, err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
