// Key is already public in the deployed index.html — env var allows override
const GKEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY || 'AIzaSyCW5tTOZLTvsjrV0XpE_-RcCL-pT7k0HHE';

export interface PlaceSuggestion {
  label: string;
  main: string;
  sec: string;
  placeId: string;
}

export async function searchPlaces(q: string): Promise<PlaceSuggestion[]> {
  if (!GKEY || !q.trim()) return [];
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GKEY },
      body: JSON.stringify({ input: q, languageCode: 'en' }),
    });
    const data = await res.json() as { suggestions?: Array<{ placePrediction?: { text?: { text?: string }; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }; placeId?: string } }> };
    if (data.suggestions?.length) {
      return data.suggestions
        .filter(s => s.placePrediction)
        .map(s => {
          const p = s.placePrediction!;
          const main = p.structuredFormat?.mainText?.text || p.text?.text || q;
          const sec = p.structuredFormat?.secondaryText?.text || '';
          return { label: p.text?.text || main, main, sec, placeId: p.placeId! };
        });
    }
  } catch { /* ignore */ }
  return [];
}

export interface GeoResult {
  lat: number;
  lng: number;
  address: string;
}

function formatAddress(
  details: { addressComponents?: Array<{ types?: string[]; longText?: string; long_name?: string; longName?: string; shortText?: string; short_name?: string; shortName?: string }>; formattedAddress?: string },
  fallbackName: string
): string {
  const comps = details.addressComponents || [];
  const get = (type: string, short = false): string => {
    const c = comps.find(x => (x.types ?? []).includes(type));
    if (!c) return '';
    return short
      ? c.shortText || c.short_name || c.shortName || c.longText || c.long_name || ''
      : c.longText || c.long_name || c.longName || c.shortText || c.short_name || '';
  };
  const street = [get('street_number'), get('route')].filter(Boolean).join(' ');
  const locality = get('locality') || get('postal_town');
  const admin = get('administrative_area_level_1', true);
  const postal = get('postal_code');
  const addr = [street, locality, admin, postal].filter(Boolean).join(', ');
  return [fallbackName, addr].filter(Boolean).join(', ') || details.formattedAddress || fallbackName;
}

export async function geocodePlace(placeId: string, fallbackName = ''): Promise<GeoResult | null> {
  if (!GKEY) return null;
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?fields=location,formattedAddress,addressComponents&key=${GKEY}`
    );
    const data = await res.json() as { location?: { latitude?: number; longitude?: number }; formattedAddress?: string; addressComponents?: Array<{ types?: string[]; longText?: string; long_name?: string; longName?: string; shortText?: string; short_name?: string; shortName?: string }> };
    if (data.location?.latitude !== undefined) {
      return {
        lat: data.location.latitude,
        lng: data.location.longitude!,
        address: formatAddress(data, fallbackName),
      };
    }
  } catch { /* ignore */ }
  return null;
}
