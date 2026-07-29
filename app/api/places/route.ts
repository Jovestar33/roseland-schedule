import { NextRequest, NextResponse } from 'next/server';

function getKey(): string | null {
  return process.env.GOOGLE_PLACES_KEY?.trim() || null;
}

function unavailable(requestId: string, status = 502) {
  return NextResponse.json(
    { error: 'places-unavailable', requestId },
    { status },
  );
}

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const placeId = req.nextUrl.searchParams.get('placeId');
  if (!placeId || !/^[A-Za-z0-9_-]{1,300}$/.test(placeId)) {
    return NextResponse.json(
      { error: 'invalid-request', requestId },
      { status: 400 },
    );
  }

  const key = getKey();
  if (!key) {
    console.error(`[places:${requestId}] GOOGLE_PLACES_KEY is unavailable`);
    return unavailable(requestId, 503);
  }

  try {
    const headers: Record<string, string> = {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'location,formattedAddress,addressComponents',
    };
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, { headers });
    if (!res.ok) {
      console.error(`[places:${requestId}] geocode upstream status ${res.status}`);
      return unavailable(requestId);
    }

    const data = await res.json() as {
      location?: { latitude?: number; longitude?: number };
      formattedAddress?: string;
      addressComponents?: unknown[];
    };
    return NextResponse.json({
      location: data.location,
      formattedAddress: data.formattedAddress,
      addressComponents: data.addressComponents,
    });
  } catch (err) {
    console.error(`[places:${requestId}] geocode request failed`, err);
    return unavailable(requestId);
  }
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const key = getKey();
  if (!key) {
    console.error(`[places:${requestId}] GOOGLE_PLACES_KEY is unavailable`);
    return unavailable(requestId, 503);
  }

  try {
    const body = await req.json() as { input?: string };
    const input = body.input?.trim();
    if (!input || input.length > 200) {
      return NextResponse.json(
        { error: 'invalid-request', requestId },
        { status: 400 },
      );
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
    };
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers,
      body: JSON.stringify({ input, languageCode: 'en' }),
    });
    if (!res.ok) {
      console.error(`[places:${requestId}] autocomplete upstream status ${res.status}`);
      return unavailable(requestId);
    }

    const data = await res.json() as { suggestions?: unknown[] };
    return NextResponse.json({ suggestions: data.suggestions ?? [] });
  } catch (err) {
    console.error(`[places:${requestId}] autocomplete request failed`, err);
    return unavailable(requestId);
  }
}
