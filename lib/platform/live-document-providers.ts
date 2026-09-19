import type { DocumentProviders } from './document-providers.ts';
import type { GeoResult, PlaceSuggestion } from '../googlePlaces.ts';
import type { WeatherData } from '../types.ts';

/** Session and schedule context go only to the same-origin authenticated proxy. */
export function createLiveDocumentProviders(context:()=>Promise<{token:string;schedule:string}>, request:typeof fetch=fetch):DocumentProviders {
  async function call<T>(payload:Record<string,unknown>):Promise<T> {
    const {token,schedule}=await context();
    const response=await request('/api/platform/local-document-providers',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
      body:JSON.stringify({...payload,schedule}),cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
      signal:AbortSignal.timeout(35000),
    });
    if(!response.ok)throw new Error('Location or weather service unavailable.');
    return await response.json() as T;
  }
  return {
    kind:'live',
    search:query=>call<PlaceSuggestion[]>({operation:'search',query}),
    async geocode(id,fallbackName=''){
      const result=await call<GeoResult|null>({operation:'geocode',id});
      if(!result)return null;
      const included=result.address.split(',').some(part=>part.trim().toLocaleLowerCase()===fallbackName.trim().toLocaleLowerCase());
      return {...result,address:[included?'':fallbackName,result.address].filter(Boolean).join(', ')};
    },
    async weather(date,lat,lng,town){const result=await call<WeatherData|null>({operation:'weather',date,lat,lng});return result?{...result,town}:null;},
  };
}
