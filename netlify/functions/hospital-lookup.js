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

function getPlacesKey() {
  return process.env.GOOGLE_PLACES_KEY || 'AIzaSyCW5tTOZLTvsjrV0XpE_-RcCL-pT7k0HHE';
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: 'Method not allowed' };

  try {
    const { town, state, editorToken } = event.queryStringParameters || {};

    if (!isAuthorizedEditor(editorToken)) {
      return { statusCode: 403, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    if (!town) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing town' }) };
    }

    const query = `hospital emergency near ${town}${state ? ` ${state}` : ''}`;
    const key = getPlacesKey();

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    });

    const json = await res.json();
    const place = json.places?.[0];

    if (!place) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, result: null }) };
    }

    const result = {
      name: place.displayName?.text ?? '',
      address: place.formattedAddress ?? '',
      phone: place.nationalPhoneNumber ?? '',
    };

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, result }) };
  } catch (err) {
    console.error('hospital-lookup error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
