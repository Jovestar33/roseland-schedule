const { connectLambda, getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: 'Method not allowed' };
  }

  try {
    connectLambda(event);
    const store = getStore('cms');

    const raw = await store.get('rp_cms_config');
    if (raw === null || raw === undefined) {
      return { statusCode: 200, headers, body: JSON.stringify({}) };
    }

    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    delete data.pin;

    return { statusCode: 200, headers, body: JSON.stringify(data) };
  } catch (err) {
    console.error('CMS load error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: err.message,
        code: err.code || null,
        status: err.status || null
      })
    };
  }
};
