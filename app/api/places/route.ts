import { NextRequest, NextResponse } from 'next/server';

const GKEY = process.env.GOOGLE_PLACES_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY || 'AIzaSyCW5tTOZLTvsjrV0XpE_-RcCL-pT7k0HHE';

export async function POST(req: NextRequest) {
  const keySource = process.env.GOOGLE_PLACES_KEY
    ? 'GOOGLE_PLACES_KEY'
    : process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY
    ? 'NEXT_PUBLIC_GOOGLE_PLACES_KEY'
    : 'hardcoded-fallback';
  console.log('[places] POST autocomplete — key source:', keySource, '— key prefix:', GKEY.slice(0, 12));

  try {
    const body = await req.json();
    console.log('[places] input:', body.input);
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GKEY },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    console.log('[places] status:', res.status, '— suggestions:', (data as { suggestions?: unknown[] }).suggestions?.length ?? 0);
    if (!res.ok) console.error('[places] error body:', JSON.stringify(data));
    return NextResponse.json(data);
  } catch (err) {
    console.error('[places] fetch error:', err);
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }
}

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get('placeId');
  const fields  = req.nextUrl.searchParams.get('fields') || 'location,formattedAddress,addressComponents';
  if (!placeId) return NextResponse.json({}, { status: 400 });
  console.log('[places] GET geocode — placeId:', placeId);
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?fields=${fields}&key=${GKEY}`
    );
    const data = await res.json();
    console.log('[places] geocode status:', res.status);
    if (!res.ok) console.error('[places] geocode error:', JSON.stringify(data));
    return NextResponse.json(data);
  } catch (err) {
    console.error('[places] geocode fetch error:', err);
    return NextResponse.json({}, { status: 200 });
  }
}
