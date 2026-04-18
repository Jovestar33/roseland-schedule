const { connectLambda, getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method not allowed' };
  }

  try {
    connectLambda(event);

    const body = JSON.parse(event.body || '{}');
    const submittedPin = String(body.pin || '').trim();
    const verifyOnly = !!body.verify;
    const requiredPin = process.env.SCHEDULE_DELETE_PASSWORD;

    if (!requiredPin) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Missing CMS/delete password env var' }),
      };
    }

    if (!submittedPin || submittedPin !== requiredPin) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ ok: false, error: 'Invalid CMS passcode' }),
      };
    }

    if (verifyOnly) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, verified: true }),
      };
    }

    const cleanBody = { ...body };
    delete cleanBody.pin;
    delete cleanBody.verify;

    const store = getStore('cms');
    await store.set('rp_cms_config', JSON.stringify(cleanBody));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('CMS save error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: err.message,
        code: err.code || null,
        status: err.status || null,
      }),
    };
  }
};
