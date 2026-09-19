import {fetchWeather} from '../weather.ts';
import type {GeoResult,PlaceSuggestion} from '../googlePlaces.ts';

export type ProviderQuery={operation:'search';query:string}|{operation:'geocode';id:string}|{operation:'weather';date:string;lat:number;lng:number};
export function parseProviderQuery(body:Record<string,unknown>):ProviderQuery|null {
  if(body.operation==='search'&&typeof body.query==='string'&&body.query.trim()&&body.query.length<=200)return {operation:'search',query:body.query.trim()};
  if(body.operation==='geocode'&&typeof body.id==='string'&&/^[A-Za-z0-9_-]{1,300}$/.test(body.id))return {operation:'geocode',id:body.id};
  if(body.operation==='weather'&&typeof body.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(body.date)&&Number.isFinite(Date.parse(body.date))&&new Date(body.date).toISOString().slice(0,10)===body.date&&typeof body.lat==='number'&&Number.isFinite(body.lat)&&Math.abs(body.lat)<=90&&typeof body.lng==='number'&&Number.isFinite(body.lng)&&Math.abs(body.lng)<=180)return {operation:'weather',date:body.date,lat:body.lat,lng:body.lng};
  return null;
}
/** Reconstruct requests from validated provider fields; never forward app headers/body. */
export async function requestDocumentProvider(query:ProviderQuery,key:string,request:typeof fetch=fetch) {
  const options={cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'} as const;
  if(query.operation==='weather'){
    const weatherFetch:typeof fetch=(input)=>{
      const url=new URL(String(input));
      if(url.protocol!=='https:'||!['api.open-meteo.com','historical-forecast-api.open-meteo.com'].includes(url.hostname)||url.pathname!=='/v1/forecast')throw new Error('Unexpected weather destination');
      return request(url,{...options,signal:AbortSignal.timeout(5000)});
    };
    return fetchWeather(query.date,query.lat,query.lng,undefined,weatherFetch);
  }
  if(!key)throw new Error('Places not configured');
  if(query.operation==='search'){
    const response=await request('https://places.googleapis.com/v1/places:autocomplete',{
      ...options,method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,
        'X-Goog-FieldMask':'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat'},
      body:JSON.stringify({input:query.query,languageCode:'en'}),signal:AbortSignal.timeout(10000),
    });
    if(!response.ok)throw new Error('Places unavailable');
    const data=await response.json() as {suggestions?:Array<{placePrediction?:{placeId?:string;text?:{text?:string};structuredFormat?:{mainText?:{text?:string};secondaryText?:{text?:string}}}}>};
    return (data.suggestions??[]).flatMap(({placePrediction:p}):PlaceSuggestion[]=>{
      if(!p?.placeId||!/^[A-Za-z0-9_-]{1,300}$/.test(p.placeId))return [];
      const main=p.structuredFormat?.mainText?.text||p.text?.text||query.query;
      return [{placeId:p.placeId,main,sec:p.structuredFormat?.secondaryText?.text||'',label:p.text?.text||main}];
    });
  }
  const response=await request(`https://places.googleapis.com/v1/places/${query.id}`,{
    ...options,headers:{'X-Goog-Api-Key':key,'X-Goog-FieldMask':'location,formattedAddress'},signal:AbortSignal.timeout(10000),
  });
  if(!response.ok)throw new Error('Places unavailable');
  const data=await response.json() as {location?:{latitude?:number;longitude?:number};formattedAddress?:string};
  const lat=data.location?.latitude,lng=data.location?.longitude;
  if(typeof lat!=='number'||!Number.isFinite(lat)||Math.abs(lat)>90||typeof lng!=='number'||!Number.isFinite(lng)||Math.abs(lng)>180)return null;
  return {lat,lng,address:data.formattedAddress||''} satisfies GeoResult;
}
