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

function defaultLibrary() {
  return { version: 1, folders: [], scheduleFolderMap: {}, updatedAt: Date.now() };
}

function cleanLibrary(input) {
  const base = { ...defaultLibrary(), ...(input || {}) };
  const folders = Array.isArray(base.folders) ? base.folders : [];
  const seen = new Set();
  base.folders = folders
    .map((f) => ({
      id: String(f && f.id ? f.id : '').trim(),
      name: String(f && f.name ? f.name : '').trim(),
      createdAt: Number(f && f.createdAt ? f.createdAt : Date.now()),
      updatedAt: Number(f && f.updatedAt ? f.updatedAt : Date.now()),
    }))
    .filter((f) => {
      if (!f.id || !f.name || seen.has(f.id)) return false;
      seen.add(f.id);
      return true;
    });
  base.scheduleFolderMap = base.scheduleFolderMap && typeof base.scheduleFolderMap === 'object' ? base.scheduleFolderMap : {};
  const validFolderIds = new Set(base.folders.map((f) => f.id));
  Object.keys(base.scheduleFolderMap).forEach((scheduleName) => {
    if (!validFolderIds.has(base.scheduleFolderMap[scheduleName])) delete base.scheduleFolderMap[scheduleName];
  });
  base.version = 1;
  base.updatedAt = Number(base.updatedAt || Date.now());
  return base;
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (!['GET', 'POST'].includes(event.httpMethod)) return { statusCode: 405, headers, body: 'Method not allowed' };

  try {
    connectLambda(event);
    const editorToken = event.httpMethod === 'GET'
      ? event.queryStringParameters?.editorToken
      : JSON.parse(event.body || '{}').editorToken;

    if (!isAuthorizedEditor(editorToken)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized editor access' }) };
    }

    // Do NOT use consistency:'strong' here — connectLambda does not supply
    // uncachedEdgeURL, so @netlify/blobs v8 throws BlobsConsistencyError on
    // every read AND write when strong consistency is requested.
    // Archive/phaseOrder stale-read protection is handled client-side via
    // pendingMutationsRef and pendingPhaseOrderRef in LibraryPage.
    const store = getStore('schedule-library');
    const key = 'rp_library_index_v1';

    if (event.httpMethod === 'GET') {
      const raw = await store.get(key);
      const library = raw === null || raw === undefined ? defaultLibrary() : cleanLibrary(typeof raw === 'string' ? JSON.parse(raw) : raw);
      console.log('[Library GET] ok — phaseOrder keys:', Object.keys(library.phaseOrder || {}), 'tsarchived count:', (library.tsarchived || []).length);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, library }) };
    }

    const body = JSON.parse(event.body || '{}');
    const incoming = body.library || {};
    console.log('[Library POST] received — phaseOrder keys:', Object.keys(incoming.phaseOrder || {}),
      'tsarchived count:', (incoming.tsarchived || []).length,
      'folders:', (incoming.folders || []).length,
      'hasToken:', !!body.editorToken);
    const library = cleanLibrary({ ...incoming, updatedAt: Date.now() });
    console.log('[Library POST] cleaned — phaseOrder keys:', Object.keys(library.phaseOrder || {}));
    await store.set(key, JSON.stringify(library), { metadata: { updatedAt: library.updatedAt } });
    console.log('[Library POST] blob write succeeded');
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, library }) };
  } catch (err) {
    console.error('[Library] handler error:', err.name, err.message, err.code || '', err.status || '');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, code: err.code || null, status: err.status || null }),
    };
  }
};
