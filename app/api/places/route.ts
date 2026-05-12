import { NextRequest, NextResponse } from 'next/server';

const GKEY = process.env.GOOGLE_PLACES_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY || 'AIzaSyCW5tTOZLTvsjrV0XpE_-RcCL-pT7k0HHE';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GKEY },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }
}

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get('placeId');
  const fields  = req.nextUrl.searchParams.get('fields') || 'location,formattedAddress,addressComponents';
  if (!placeId) return NextResponse.json({}, { status: 400 });
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?fields=${fields}&key=${GKEY}`
    );
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({}, { status: 200 });
  }
}
