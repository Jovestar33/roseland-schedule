import type { GeoResult, PlaceSuggestion } from '../googlePlaces.ts';
import type { WeatherData } from '../types.ts';

export interface DocumentProviders {
  kind?: 'live' | 'fictional';
  search(query: string): Promise<PlaceSuggestion[]>;
  geocode(id: string, fallbackName?: string): Promise<GeoResult | null>;
  weather(date: string, lat: number, lng: number, town: string): Promise<WeatherData | null>;
}
const places = [
  { id: 'fictional-harbor', name: 'Fictional Harbor Studio', address: '100 Example Lane, Fictional Harbor', lat: 35.7, lng: -78.6 },
  { id: 'fictional-woodland', name: 'Fictional Woodland Stage', address: '200 Sample Road, Fictional Woodland', lat: 0, lng: 0 },
  { id: 'fictional-sun-only', name: 'Fictional Sun-only Location', address: '300 Example Avenue, Fictional Town', lat: 12, lng: 12 },
  { id: 'fictional-unavailable', name: 'Fictional Unavailable Forecast', address: '400 Sample Street, Fictional Town', lat: 13, lng: 13 },
];
/** No network: opt-in local rehearsal only, never a production provider fallback. */
export const fictionalDocumentProviders: DocumentProviders = {
  async search(query) {
    const q = query.toLocaleLowerCase().trim();
    return q ? places.filter(p => `${p.name} ${p.address}`.toLocaleLowerCase().includes(q)).map(p => ({placeId:p.id,main:p.name,sec:p.address,label:`${p.name}, ${p.address}`})) : [];
  },
  async geocode(id) { const p = places.find(p => p.id === id); return p ? {lat:p.lat,lng:p.lng,address:`${p.name}, ${p.address}`} : null; },
  async weather(date, lat, lng, town) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180 || lat===13) return null;
    const sun = { sunrise:'6:30 AM',sunset:'7:15 PM',fetchedAt:'Fictional forecast',town };
    return lat===12 ? {...sun,noForecast:true} : {...sun,maxC:24,minC:12,maxF:75,minF:54,prec:35,code:2,cond:'Partly Cloudy'};
  },
};
