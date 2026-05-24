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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shapeOf(raw) {
  const typeofRaw = typeof raw;
  // Handle string → parse; handle non-plain-object types gracefully
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { data = null; }
  }
  const topKeys = data && typeof data === 'object' && !Array.isArray(data)
    ? Object.keys(data).sort().join(',')
    : '(not an object)';
  const rowCount = Array.isArray(data && data.rows) ? data.rows.length : -1;
  const metaKeys = data && data.meta && typeof data.meta === 'object'
    ? Object.keys(data.meta).sort().join(',')
    : '(none)';
  const hasSavedAt = typeof (data && data.savedAt) === 'number';
  return { typeofRaw, topKeys, rowCount, metaKeys, hasSavedAt, parsed: data };
}

// Retry readback with increasing delays to tolerate Netlify Blobs CDN propagation lag.
// store.get() uses the edge URL set by connectLambda, but CDN-layer reads can still
// return null immediately after a write even within the same Lambda invocation.
// Attempts: immediate → +250ms → +500ms → +1000ms (total budget ≤ 1.75s)
async function readWithRetry(store, key, label) {
  const delays = [0, 250, 500, 1000];
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) {
      console.log('[Rename] readback', label, '— attempt', i + 1, 'waiting', delays[i], 'ms');
      await sleep(delays[i]);
    }
    const raw = await store.get(key);
    if (raw !== null && raw !== undefined) {
      console.log('[Rename] readback', label, '— attempt', i + 1, 'succeeded');
      return raw;
    }
    console.log('[Rename] readback', label, '— attempt', i + 1, 'returned null');
  }
  return null;
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
    const { oldName, newName, editorToken } = JSON.parse(event.body || '{}');

    console.log('[Rename] request — oldName:', oldName, 'newName:', newName, 'hasToken:', !!editorToken);

    if (!isAuthorizedEditor(editorToken)) {
      console.log('[Rename] rejected — invalid editor token');
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized editor access' }) };
    }

    const trimOld = (oldName || '').trim();
    const trimNew = (newName || '').trim();

    if (!trimOld) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing oldName' }) };
    }
    if (!trimNew) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'New name cannot be blank' }) };
    }
    if (trimOld === trimNew) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'New name is the same as the current name' }) };
    }

    console.log('[Rename] validation passed — proceeding with rename');

    const schedStore = getStore('schedules');

    // Step 1 — Read old schedule blob
    const oldRaw = await schedStore.get(trimOld);
    if (oldRaw === null || oldRaw === undefined) {
      console.log('[Rename] old schedule blob not found:', trimOld);
      return { statusCode: 404, headers, body: JSON.stringify({ error: `Schedule "${trimOld}" not found` }) };
    }
    const oldShape = shapeOf(oldRaw);
    console.log('[Rename] old schedule blob read OK:', trimOld,
      '| typeof raw:', oldShape.typeofRaw,
      '| top keys:', oldShape.topKeys,
      '| rows:', oldShape.rowCount,
      '| meta keys:', oldShape.metaKeys,
      '| hasSavedAt:', oldShape.hasSavedAt);
    const oldData = oldShape.parsed;

    // Step 2 — Reject if new name already taken
    const existingRaw = await schedStore.get(trimNew);
    if (existingRaw !== null && existingRaw !== undefined) {
      console.log('[Rename] newName already exists:', trimNew);
      return { statusCode: 409, headers, body: JSON.stringify({ error: `A schedule named "${trimNew}" already exists` }) };
    }
    console.log('[Rename] newName is available:', trimNew);

    // Step 3 — Write new schedule blob.
    // The payload is byte-for-byte identical to the original — the schedule name
    // lives only as the blob key, not inside the blob content.
    const newPayload = JSON.stringify(oldData);
    await schedStore.set(trimNew, newPayload, { metadata: { savedAt: oldData.savedAt ?? 0 } });
    console.log('[Rename] new schedule blob written:', trimNew, '| payload length:', newPayload.length, 'chars');

    // Step 3b — Readback validation with retry.
    // store.get() reads through the Netlify Blobs CDN edge layer. Even within the
    // same Lambda invocation the CDN can return null immediately after a write while
    // the write propagates. We retry up to 4 times (0 + 250 + 500 + 1000 ms) before
    // treating a null as a genuine failure. The old blob is never deleted unless this
    // validation passes.
    const newRaw = await readWithRetry(schedStore, trimNew, trimNew);
    if (newRaw === null || newRaw === undefined) {
      console.error('[Rename] readback failed after all retries for:', trimNew,
        '— write likely did not persist; old schedule preserved');
      try { await schedStore.delete(trimNew); } catch {}
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Rename failed: new schedule blob not readable after write — old schedule preserved' }),
      };
    }
    const newShape = shapeOf(newRaw);
    console.log('[Rename] new schedule readback OK:', trimNew,
      '| typeof raw:', newShape.typeofRaw,
      '| top keys:', newShape.topKeys,
      '| rows:', newShape.rowCount,
      '| meta keys:', newShape.metaKeys,
      '| hasSavedAt:', newShape.hasSavedAt);

    // Validate rows count matches (only when old schedule had rows)
    if (oldShape.rowCount > 0 && newShape.rowCount !== oldShape.rowCount) {
      console.error('[Rename] readback rows mismatch — expected:', oldShape.rowCount,
        'got:', newShape.rowCount, '— aborting; old schedule preserved');
      try { await schedStore.delete(trimNew); } catch {}
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Rename failed: row count mismatch after write — old schedule preserved' }),
      };
    }
    // Validate meta present if old schedule had meta
    if (oldShape.metaKeys !== '(none)' && newShape.metaKeys === '(none)') {
      console.error('[Rename] readback meta missing — old had meta keys:', oldShape.metaKeys,
        '— aborting; old schedule preserved');
      try { await schedStore.delete(trimNew); } catch {}
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Rename failed: meta missing after write — old schedule preserved' }),
      };
    }
    console.log('[Rename] readback validation passed');

    // Step 4 — Migrate snapshot blob: copy from sha256(oldName) to sha256(newName)
    let snapshotMigrated = false;
    const snapStore = getStore('schedule-snapshots');
    const oldSnapKey = snapshotKeyForName(trimOld);
    const newSnapKey = snapshotKeyForName(trimNew);
    try {
      const snapRaw = await snapStore.get(oldSnapKey);
      if (snapRaw !== null && snapRaw !== undefined) {
        const snapRecord = typeof snapRaw === 'string' ? JSON.parse(snapRaw) : snapRaw;
        snapRecord.name = trimNew;
        snapRecord.updatedAt = Date.now();
        await snapStore.set(newSnapKey, JSON.stringify(snapRecord), {
          metadata: { name: trimNew, updatedAt: snapRecord.updatedAt },
        });
        snapshotMigrated = true;
        console.log('[Rename] snapshot blob migrated to:', trimNew);
      } else {
        console.log('[Rename] no snapshot blob for:', trimOld, '— skipping snapshot migration');
      }
    } catch (snapErr) {
      // Snapshot migration failed — roll back new schedule blob and abort.
      // Old schedule blob has NOT been deleted yet, so data is fully preserved.
      console.error('[Rename] snapshot migration failed:', snapErr.message, '— rolling back');
      try { await schedStore.delete(trimNew); } catch {}
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `Rename failed during snapshot migration: ${snapErr.message}` }),
      };
    }

    // Step 5 — Read, update, and write library metadata
    const libStore = getStore('schedule-library');
    const libKey = 'rp_library_index_v1';
    let library;
    try {
      const libRaw = await libStore.get(libKey);
      library = libRaw === null || libRaw === undefined
        ? defaultLibrary()
        : (typeof libRaw === 'string' ? JSON.parse(libRaw) : libRaw);
      console.log('[Rename] library meta read — tsarchived count:', (library.tsarchived || []).length);
    } catch (libReadErr) {
      // Library read failed — roll back and abort. Old blob still intact.
      console.error('[Rename] library meta read failed:', libReadErr.message, '— rolling back');
      try { await schedStore.delete(trimNew); } catch {}
      if (snapshotMigrated) { try { await snapStore.delete(newSnapKey); } catch {} }
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `Rename failed reading library metadata: ${libReadErr.message}` }),
      };
    }

    // Replace all references to oldName with newName in library metadata.
    // All array replacements use .map() — not filter+push — to preserve position.

    if (Array.isArray(library.tsarchived)) {
      library.tsarchived = library.tsarchived.map((n) => (n === trimOld ? trimNew : n));
    }

    if (library.phaseOrder && typeof library.phaseOrder === 'object') {
      for (const pk of Object.keys(library.phaseOrder)) {
        if (library.phaseOrder[pk] && typeof library.phaseOrder[pk] === 'object') {
          for (const phk of Object.keys(library.phaseOrder[pk])) {
            library.phaseOrder[pk][phk] = (library.phaseOrder[pk][phk] || [])
              .map((n) => (n === trimOld ? trimNew : n));
          }
        }
      }
    }

    if (library.scheduleFolderMap && typeof library.scheduleFolderMap === 'object') {
      if (trimOld in library.scheduleFolderMap) {
        library.scheduleFolderMap[trimNew] = library.scheduleFolderMap[trimOld];
        delete library.scheduleFolderMap[trimOld];
      }
    }

    if (library.townCache && typeof library.townCache === 'object') {
      if (trimOld in library.townCache) {
        library.townCache[trimNew] = library.townCache[trimOld];
        delete library.townCache[trimOld];
      }
    }

    if (library.dateCache && typeof library.dateCache === 'object') {
      if (trimOld in library.dateCache) {
        library.dateCache[trimNew] = library.dateCache[trimOld];
        delete library.dateCache[trimOld];
      }
    }

    library.updatedAt = Date.now();

    try {
      await libStore.set(libKey, JSON.stringify(library), { metadata: { updatedAt: library.updatedAt } });
      console.log('[Rename] library metadata updated and saved');
    } catch (libWriteErr) {
      // Library write failed — roll back new blobs and abort. Old blob still intact.
      console.error('[Rename] library metadata save failed:', libWriteErr.message, '— rolling back');
      try { await schedStore.delete(trimNew); } catch {}
      if (snapshotMigrated) { try { await snapStore.delete(newSnapKey); } catch {} }
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `Rename failed saving library metadata: ${libWriteErr.message}` }),
      };
    }

    // Step 6 — Delete old schedule blob.
    // Only reached after new blob write, readback validation, snapshot migration,
    // and library metadata update have all succeeded.
    try {
      await schedStore.delete(trimOld);
      console.log('[Rename] old schedule blob deleted:', trimOld);
    } catch (delErr) {
      console.warn('[Rename] old schedule blob delete failed (non-fatal):', delErr.message);
    }

    // Step 7 — Delete old snapshot blob (best-effort; non-fatal).
    if (snapshotMigrated) {
      try {
        await snapStore.delete(oldSnapKey);
        console.log('[Rename] old snapshot blob deleted for:', trimOld);
      } catch (delErr) {
        console.warn('[Rename] old snapshot blob delete failed (non-fatal):', delErr.message);
      }
    }

    console.log('[Rename] complete success:', trimOld, '→', trimNew,
      '| rows preserved:', newShape.rowCount,
      '| meta keys:', newShape.metaKeys,
      '| top keys:', newShape.topKeys);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, newName: trimNew, library }) };
  } catch (err) {
    console.error('[Rename] handler error:', err.name, err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
