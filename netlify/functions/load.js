const { getStore } = require('@netlify/blobs');

exports.handler = async (event, context) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: 'Method not allowed' };

  try {
    const store = getStore({
      name: 'schedules',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_TOKEN,
    });

    const name = event.queryStringParameters?.name;

    if (!name) {
      const { blobs } = await store.list();
      return { statusCode: 200, headers, body: JSON.stringify({ schedules: blobs.map(b => b.key) }) };
    }

    const raw = await store.get(name);
    if (raw === null || raw === undefined) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    }

    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    console.error('Load error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
