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

// Returns shape diagnostics without exposing schedule content.
// Accepts raw (string or object) — mirrors the same pattern as load.js.
function shapeOf(raw) {
  const typeofRaw = typeof raw;
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { data = null; }
  }
  const isPlainObject = data !== null && typeof data === 'object' && !Array.isArray(data);
  const topKeys = isPlainObject ? Object.keys(data).sort().join(',') : '(not an object)';
  const rowCount = isPlainObject && Array.isArray(data.rows) ? data.rows.length : -1;
  const metaKeys = isPlainObject && data.meta && typeof data.meta === 'object'
    ? Object.keys(data.meta).sort().join(',')
    : '(none)';
  const hasSavedAt = isPlainObject && typeof data.savedAt === 'number';
  return { typeofRaw, isPlainObject, topKeys, rowCount, metaKeys, hasSavedAt, parsed: data };
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

    console.log('[Rename] request — oldName:', JSON.stringify(oldName),
      'newName:', JSON.stringify(newName), 'hasToken:', !!editorToken);

    if (!isAuthorizedEditor(editorToken)) {
      console.log('[Rename] rejected — invalid editor token');
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized editor access' }) };
    }

    const trimOld = (oldName || '').trim();
    const trimNew = (newName || '').trim();

    console.log('[Rename] trimmed — oldName:', JSON.stringify(trimOld),
      'newName:', JSON.stringify(trimNew),
      'oldLen:', trimOld.length, 'newLen:', trimNew.length);

    if (!trimOld) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing oldName' }) };
    }
    if (!trimNew) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'New name cannot be blank' }) };
    }
    if (trimOld === trimNew) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'New name is the same as the current name' }) };
    }

    const schedStore = getStore('schedules');

    // Step 1 — Read and validate old schedule blob.
    // We validate shape here, before any write. This is the primary data-integrity
    // gate: if the old blob is unreadable or has an unexpected shape we abort immediately,
    // before touching anything.
    const oldRaw = await schedStore.get(trimOld);
    if (oldRaw === null || oldRaw === undefined) {
      console.log('[Rename] old schedule blob not found — key:', JSON.stringify(trimOld));
      return { statusCode: 404, headers, body: JSON.stringify({ error: `Schedule "${trimOld}" not found` }) };
    }
    const oldShape = shapeOf(oldRaw);
    console.log('[Rename] old blob read OK — key:', JSON.stringify(trimOld),
      '| typeofRaw:', oldShape.typeofRaw,
      '| isPlainObject:', oldShape.isPlainObject,
      '| topKeys:', oldShape.topKeys,
      '| rows:', oldShape.rowCount,
      '| metaKeys:', oldShape.metaKeys,
      '| hasSavedAt:', oldShape.hasSavedAt);

    if (!oldShape.isPlainObject) {
      console.error('[Rename] old blob shape unexpected — aborting before any write');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: `Rename aborted: old schedule blob has unexpected shape. typeofRaw=${oldShape.typeofRaw} topKeys=${oldShape.topKeys}`,
        }),
      };
    }

    // Step 2 — Reject if new name already taken.
    const existingRaw = await schedStore.get(trimNew);
    if (existingRaw !== null && existingRaw !== undefined) {
      console.log('[Rename] newName already exists:', JSON.stringify(trimNew));
      return { statusCode: 409, headers, body: JSON.stringify({ error: `A schedule named "${trimNew}" already exists` }) };
    }
    console.log('[Rename] newName is available:', JSON.stringify(trimNew));

    // Step 3 — Write new schedule blob.
    //
    // PAYLOAD STRATEGY: Copy the raw string bytes from the old blob directly — the
    // exact same bytes that load.js will read. This is safer than parsing and
    // re-serializing (which could reorder keys or change formatting). The schedule
    // name lives only as the blob key; there is no name field inside the blob content.
    //
    // READBACK STRATEGY: Netlify Blobs CDN reads are eventually consistent.
    // Immediate readback after store.set returns null even after multiple retries with
    // delays up to 1.75 s — the propagation window is unpredictable. Using an immediate
    // readback as a hard gate therefore blocks every rename. We do NOT do a blocking
    // readback. Instead:
    //   a) We validated the old blob's shape before writing (above).
    //   b) We copy raw bytes exactly — no parse→re-serialize cycle.
    //   c) The old blob is only deleted after every subsequent step succeeds (steps 4-5).
    //   d) The client-side pending rename guard protects the Library UI from stale
    //      CDN reads during the propagation window.
    //
    // If the write itself throws, the error propagates to the outer catch and the
    // old blob is never touched.
    const newPayload = typeof oldRaw === 'string' ? oldRaw : JSON.stringify(oldShape.parsed);
    await schedStore.set(trimNew, newPayload, { metadata: { savedAt: oldShape.parsed.savedAt ?? 0 } });
    console.log('[Rename] new schedule blob written — key:', JSON.stringify(trimNew),
      '| payload length:', newPayload.length, 'chars');

    // Step 4 — Migrate snapshot blob: copy from sha256(oldName) to sha256(newName).
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
        console.log('[Rename] snapshot migrated — newKey:', newSnapKey.slice(0, 20), '…');
      } else {
        console.log('[Rename] no snapshot found for old key — skipping migration');
      }
    } catch (snapErr) {
      // Rollback new schedule blob. Old blob still intact.
      console.error('[Rename] snapshot migration failed:', snapErr.message, '— rolling back new blob');
      try { await schedStore.delete(trimNew); } catch {}
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `Rename failed during snapshot migration: ${snapErr.message}` }),
      };
    }

    // Step 5 — Read, update, and write library metadata.
    const libStore = getStore('schedule-library');
    const libKey = 'rp_library_index_v1';
    let library;
    try {
      const libRaw = await libStore.get(libKey);
      library = libRaw === null || libRaw === undefined
        ? defaultLibrary()
        : (typeof libRaw === 'string' ? JSON.parse(libRaw) : libRaw);
      console.log('[Rename] library read — tsarchived count:', (library.tsarchived || []).length);
    } catch (libReadErr) {
      // Rollback new blobs. Old blob still intact.
      console.error('[Rename] library read failed:', libReadErr.message, '— rolling back');
      try { await schedStore.delete(trimNew); } catch {}
      if (snapshotMigrated) { try { await snapStore.delete(newSnapKey); } catch {} }
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `Rename failed reading library metadata: ${libReadErr.message}` }),
      };
    }

    // Replace all references to oldName with newName.
    // All array replacements use .map() (not filter+push) to preserve position.
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
      console.log('[Rename] library metadata saved');
    } catch (libWriteErr) {
      // Rollback new blobs. Old blob still intact.
      console.error('[Rename] library write failed:', libWriteErr.message, '— rolling back');
      try { await schedStore.delete(trimNew); } catch {}
      if (snapshotMigrated) { try { await snapStore.delete(newSnapKey); } catch {} }
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `Rename failed saving library metadata: ${libWriteErr.message}` }),
      };
    }

    // Step 6 — Delete old schedule blob.
    // Only reached after: new blob written, snapshot migrated, library updated.
    // Best-effort: failure here is non-fatal (stale orphan blob, not data loss).
    try {
      await schedStore.delete(trimOld);
      console.log('[Rename] old schedule blob deleted:', JSON.stringify(trimOld));
    } catch (delErr) {
      console.warn('[Rename] old schedule blob delete failed (non-fatal):', delErr.message);
    }

    // Step 7 — Delete old snapshot blob (best-effort; non-fatal).
    if (snapshotMigrated) {
      try {
        await snapStore.delete(oldSnapKey);
        console.log('[Rename] old snapshot blob deleted');
      } catch (delErr) {
        console.warn('[Rename] old snapshot blob delete failed (non-fatal):', delErr.message);
      }
    }

    console.log('[Rename] complete success:', JSON.stringify(trimOld), '→', JSON.stringify(trimNew),
      '| rows:', oldShape.rowCount, '| metaKeys:', oldShape.metaKeys);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, newName: trimNew, library }) };
  } catch (err) {
    console.error('[Rename] handler error:', err.name, err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
