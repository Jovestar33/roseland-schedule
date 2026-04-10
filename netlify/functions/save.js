const { connectLambda, getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method not allowed' };
  }

  try {
    connectLambda(event);
    const { name, data, deleted } = JSON.parse(event.body);

    if (!name) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing name' }) };
    }

    const store = getStore('schedules');

    if (deleted || data === null) {
      await store.delete(name);
    } else {
      await store.set(name, JSON.stringify(data), {
        metadata: { savedAt: Date.now() }
      });
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, name }) };
  } catch (err) {
    console.error('Save error:', err);
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
