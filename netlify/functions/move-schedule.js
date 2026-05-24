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
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, headers, body: 'Method not allowed' };

  try {
    connectLambda(event);
    const { scheduleName, newProjectName, newPhase, editorToken } =
      JSON.parse(event.body || '{}');

    console.log('[Move] request — scheduleName:', JSON.stringify(scheduleName),
      'newProjectName:', JSON.stringify(newProjectName),
      'newPhase:', JSON.stringify(newPhase),
      'hasToken:', !!editorToken);

    if (!isAuthorizedEditor(editorToken)) {
      console.log('[Move] rejected — invalid editor token');
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized editor access' }) };
    }

    const trimName     = (scheduleName     || '').trim();
    const trimNewProd  = (newProjectName   || '').trim();
    const trimNewPhase = (newPhase         || '').trim();

    if (!trimName) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing scheduleName' }) };
    }

    const schedStore = getStore('schedules');

    // ── Step 1: Read and validate schedule blob ──────────────────────────────

    const raw = await schedStore.get(trimName);
    if (raw === null || raw === undefined) {
      console.log('[Move] schedule not found:', JSON.stringify(trimName));
      return { statusCode: 404, headers, body: JSON.stringify({ error: `Schedule "${trimName}" not found` }) };
    }

    let schedule;
    try {
      schedule = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Schedule data could not be parsed' }) };
    }
    if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Schedule has unexpected shape' }) };
    }

    // Derive current and destination location keys
    const oldProd     = ((schedule.meta && schedule.meta.projectName) || '').trim();
    const oldPhase    = ((schedule.meta && schedule.meta.phase)       || '').trim();
    const oldProdKey  = oldProd.toLowerCase();
    const oldPhaseKey = oldPhase.toLowerCase();
    const newProdKey  = trimNewProd.toLowerCase();
    const newPhaseKey = trimNewPhase.toLowerCase();

    console.log('[Move] current location: prod=', JSON.stringify(oldProd),
      'phase=', JSON.stringify(oldPhase));
    console.log('[Move] destination:      prod=', JSON.stringify(trimNewProd),
      'phase=', JSON.stringify(trimNewPhase));

    // Detect no-op: destination matches current location
    if (oldProdKey === newProdKey && oldPhaseKey === newPhaseKey) {
      console.log('[Move] no-op — destination matches current location');
      const libStore = getStore('schedule-library');
      const libKey   = 'rp_library_index_v1';
      let library    = defaultLibrary();
      try {
        const libRaw = await libStore.get(libKey);
        if (libRaw !== null && libRaw !== undefined) {
          library = typeof libRaw === 'string' ? JSON.parse(libRaw) : libRaw;
        }
      } catch {}
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, noOp: true, library }) };
    }

    // ── Step 2: Write updated schedule blob with new projectName / phase ─────
    //
    // This is the first of two writes. If it succeeds and the library write
    // below fails, the schedule blob already reflects the new location. The
    // Library metadata may be temporarily stale, but buildTree() reads from
    // the blob directly, so the schedule will appear in the correct group on
    // the next Refresh after CDN propagation. The phaseOrder position may be
    // at the bottom of the destination phase until the next Library write
    // succeeds — an acceptable degraded state.

    const savedAt = Date.now();
    const updatedSchedule = {
      ...schedule,
      meta: {
        ...(schedule.meta || {}),
        projectName: trimNewProd,
        phase: trimNewPhase,
      },
      savedAt,
    };

    await schedStore.set(trimName, JSON.stringify(updatedSchedule), { metadata: { savedAt } });
    console.log('[Move] schedule blob updated — savedAt:', savedAt);

    // ── Steps 3–4: Read and update Library metadata ──────────────────────────

    const libStore = getStore('schedule-library');
    const libKey   = 'rp_library_index_v1';
    let library;

    try {
      const libRaw = await libStore.get(libKey);
      library = libRaw === null || libRaw === undefined
        ? defaultLibrary()
        : (typeof libRaw === 'string' ? JSON.parse(libRaw) : libRaw);
      console.log('[Move] library read — phaseOrder keys:',
        Object.keys(library.phaseOrder || {}).join(', ') || '(none)');
    } catch (libReadErr) {
      // Schedule blob is already updated. Return a soft success so the client
      // can apply its optimistic local update. Library will self-correct when
      // the next Refresh or library write succeeds.
      console.error('[Move] library read failed:', libReadErr.message,
        '— returning partial success');
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          ok: true, savedAt, library: null,
          warning: 'Schedule updated but library ordering could not be read',
        }),
      };
    }

    // Remove schedule from old phaseOrder entry
    if (library.phaseOrder
        && library.phaseOrder[oldProdKey]
        && library.phaseOrder[oldProdKey][oldPhaseKey]) {
      library.phaseOrder[oldProdKey][oldPhaseKey] =
        library.phaseOrder[oldProdKey][oldPhaseKey].filter((n) => n !== trimName);
      console.log('[Move] removed from old phaseOrder:', oldProdKey, '/', oldPhaseKey);
    }

    // Append schedule to destination phaseOrder entry
    if (!library.phaseOrder) library.phaseOrder = {};
    if (!library.phaseOrder[newProdKey]) library.phaseOrder[newProdKey] = {};
    if (!library.phaseOrder[newProdKey][newPhaseKey]) library.phaseOrder[newProdKey][newPhaseKey] = [];
    if (!library.phaseOrder[newProdKey][newPhaseKey].includes(trimName)) {
      library.phaseOrder[newProdKey][newPhaseKey] =
        [...library.phaseOrder[newProdKey][newPhaseKey], trimName];
      console.log('[Move] appended to destination phaseOrder:', newProdKey, '/', newPhaseKey);
    }

    library.updatedAt = Date.now();

    try {
      await libStore.set(libKey, JSON.stringify(library), { metadata: { updatedAt: library.updatedAt } });
      console.log('[Move] library metadata saved');
    } catch (libWriteErr) {
      console.error('[Move] library write failed:', libWriteErr.message,
        '— returning partial success');
      return {
        statusCode: 200, headers,
        body: JSON.stringify({
          ok: true, savedAt, library: null,
          warning: 'Schedule updated but library ordering could not be saved',
        }),
      };
    }

    console.log('[Move] complete — schedule:', JSON.stringify(trimName),
      'moved from', JSON.stringify(oldProd), '/', JSON.stringify(oldPhase),
      'to', JSON.stringify(trimNewProd), '/', JSON.stringify(trimNewPhase));
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, library, savedAt }) };

  } catch (err) {
    console.error('[Move] handler error:', err.name, err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
