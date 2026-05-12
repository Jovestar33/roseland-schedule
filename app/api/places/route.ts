import { NextRequest, NextResponse } from 'next/server';

// Key is resolved at request time so a newly-set env var is picked up after redeploy.
function getKey() {
  return process.env.GOOGLE_PLACES_KEY
    || process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
    || 'AIzaSyCW5tTOZLTvsjrV0XpE_-RcCL-pT7k0HHE';
}
function keySource() {
  return process.env.GOOGLE_PLACES_KEY
    ? 'GOOGLE_PLACES_KEY'
    : process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
    ? 'NEXT_PUBLIC_GOOGLE_PLACES_KEY'
    : 'hardcoded-fallback';
}

// Health-check: GET /api/places (no placeId param)
export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get('placeId');

  if (!placeId) {
    const key = getKey();
    return NextResponse.json({
      ok: true,
      keySource: keySource(),
      keyPrefix: key.slice(0, 12),
      node: process.version,
    });
  }

  const fields = req.nextUrl.searchParams.get('fields') || 'location,formattedAddress,addressComponents';
  const key    = getKey();
  const origin = req.headers.get('origin') || req.headers.get('referer') || '';
  console.log('[places] GET geocode — placeId:', placeId, '— origin:', origin);

  try {
    const headers: Record<string, string> = {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fields,
    };
    if (origin) headers['Referer'] = origin;

    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, { headers });
    const text = await res.text();
    console.log('[places] geocode status:', res.status, '— body:', text.slice(0, 300));
    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json({ error: 'bad-json', raw: text.slice(0, 500) }, { status: 502 });
    }
  } catch (err) {
    console.error('[places] geocode fetch error:', err);
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const key    = getKey();
  const origin = req.headers.get('origin') || req.headers.get('referer') || '';
  console.log('[places] POST — keySource:', keySource(), '— keyPrefix:', key.slice(0, 12), '— origin:', origin);

  try {
    const body = await req.json() as { input?: string };
    console.log('[places] input:', body.input);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
    };
    // Forward the caller's origin as Referer so HTTP-referrer API key restrictions match
    if (origin) headers['Referer'] = origin;

    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const text = await res.text();
    console.log('[places] Google status:', res.status, '— body preview:', text.slice(0, 400));

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      console.error('[places] JSON parse error — raw:', text.slice(0, 500));
      return NextResponse.json({ suggestions: [] });
    }

    const d = data as { suggestions?: unknown[]; error?: unknown };
    if (d.error) console.error('[places] Google error:', JSON.stringify(d.error));

    return NextResponse.json(data);
  } catch (err) {
    console.error('[places] outer error:', err);
    return NextResponse.json({ suggestions: [] });
  }
}
