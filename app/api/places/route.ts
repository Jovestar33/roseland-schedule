import { NextRequest, NextResponse } from 'next/server';
import {placesEditorAuthorized,createPlacesBudget} from '../../../lib/security/places-proxy';
const budget=createPlacesBudget();
const privateHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
function denied(requestId:string,status:number){return NextResponse.json({error:'places-unavailable',requestId},{status,headers:privateHeaders});}
function admission(req:NextRequest,requestId:string){
 if(!placesEditorAuthorized(req.headers.get('authorization'),process.env))return denied(requestId,401);
 const origin=req.headers.get('origin');
 const host=req.headers.get('host');
 const expected=req.nextUrl.hostname==='localhost'&&host&&/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)?`${req.nextUrl.protocol}//${host}`:req.nextUrl.origin;
 if(origin!==null&&origin!==expected)return denied(requestId,403);
 if(!budget())return denied(requestId,429);
 return null;
}
async function boundedBody(req:NextRequest):Promise<string|null>{
 if(Number(req.headers.get('content-length'))>16384)return null;
 const reader=req.body?.getReader();if(!reader)return '';let bytes=0;const chunks:Uint8Array[]=[];
 while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>16384){await reader.cancel();return null;}chunks.push(next.value);}
 return Buffer.concat(chunks).toString('utf8');
}

function getKey(): string | null {
  return process.env.GOOGLE_PLACES_KEY?.trim() || null;
}

function unavailable(requestId: string, status = 502) {
  return NextResponse.json(
    { error: 'places-unavailable', requestId },
    { status, headers:privateHeaders },
  );
}

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const blocked=admission(req,requestId);if(blocked)return blocked;
  const placeId = req.nextUrl.searchParams.get('placeId');
  if (!placeId || !/^[A-Za-z0-9_-]{1,300}$/.test(placeId)) {
    return NextResponse.json(
      { error: 'invalid-request', requestId },
      { status: 400, headers:privateHeaders },
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
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, { headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000) });
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
    },{headers:privateHeaders});
  } catch (err) {
    console.error(`[places:${requestId}] geocode request failed`);
    return unavailable(requestId);
  }
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const blocked=admission(req,requestId);if(blocked)return blocked;
  const key = getKey();
  if (!key) {
    console.error(`[places:${requestId}] GOOGLE_PLACES_KEY is unavailable`);
    return unavailable(requestId, 503);
  }

  try {
    if(!/^application\/json(?:;|$)/i.test(req.headers.get('content-type')??''))return denied(requestId,415);
    const raw=await boundedBody(req);if(raw===null)return denied(requestId,413);
    let body:unknown;try{body=JSON.parse(raw);}catch{return denied(requestId,400);}
    const input=body&&typeof body==='object'&&!Array.isArray(body)&&typeof (body as {input?:unknown}).input==='string'?(body as {input:string}).input.trim():'';
    if (!input || input.length > 200) {
      return NextResponse.json(
        { error: 'invalid-request', requestId },
        { status: 400, headers:privateHeaders },
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
      cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error(`[places:${requestId}] autocomplete upstream status ${res.status}`);
      return unavailable(requestId);
    }

    const data = await res.json() as { suggestions?: unknown[] };
    return NextResponse.json({ suggestions: data.suggestions ?? [] },{headers:privateHeaders});
  } catch (err) {
    console.error(`[places:${requestId}] autocomplete request failed`);
    return unavailable(requestId);
  }
}
