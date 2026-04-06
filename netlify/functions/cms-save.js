const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // ── PIN check (server-side, never exposed to client) ──
  const correctPin = process.env.CMS_PIN;
  if (!correctPin) {
    console.error('CMS_PIN environment variable is not set');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'CMS not configured — set CMS_PIN in Netlify environment variables' }) };
  }
  if (!body.pin || body.pin.trim() !== correctPin.trim()) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // ── Verify-only mode (used by PIN prompt to authenticate before opening CMS) ──
  if (body.verify) {
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  // ── Save CMS config ──
  try {
    const store = getStore({
      name: 'cms',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_TOKEN,
    });

    const config = {
      actions: body.actions || [],
      colors:  body.colors  || {},
      labels:  body.labels  || {},
      logo:    body.logo    || null,
      savedAt: Date.now(),
    };
    // Never store the PIN in the blob
    await store.set('rp_cms_config', JSON.stringify(config), { metadata: { savedAt: config.savedAt } });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('CMS save error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
