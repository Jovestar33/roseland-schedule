import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProviderQuery,requestDocumentProvider} from '../../lib/security/document-provider-upstream.ts';
import {createLiveDocumentProviders} from '../../lib/platform/live-document-providers.ts';

test('provider inputs reject invalid dates, coordinates and injected place paths',()=>{
  for(const value of [{operation:'weather',date:'2026-02-30',lat:0,lng:0},{operation:'weather',date:'2026-09-19',lat:NaN,lng:0},{operation:'weather',date:'2026-09-19',lat:0,lng:181},{operation:'geocode',id:'../secrets'},{operation:'search',query:'x'.repeat(201)}])assert.equal(parseProviderQuery(value),null);
  assert.deepEqual(parseProviderQuery({operation:'weather',date:'2026-09-19',lat:0,lng:0,token:'private',schedule:'private'}),{operation:'weather',date:'2026-09-19',lat:0,lng:0});
});
test('Places upstream receives only search and provider credential, never local context',async()=>{
  const query=parseProviderQuery({operation:'search',query:'Raleigh Union Station',schedule:'private-schedule',token:'private-session'})!;
  let calls=0;
  const result=await requestDocumentProvider(query,'fictional-provider-key',async(input,init)=>{
    calls++;assert.equal(input,'https://places.googleapis.com/v1/places:autocomplete');
    assert.deepEqual(JSON.parse(init!.body as string),{input:'Raleigh Union Station',languageCode:'en'});
    assert.equal(new Headers(init!.headers).get('Authorization'),null);
    assert.equal(new Headers(init!.headers).get('X-Goog-Api-Key'),'fictional-provider-key');
    assert.equal(init!.redirect,'error');assert.equal(init!.referrerPolicy,'no-referrer');
    return Response.json({suggestions:[{placePrediction:{placeId:'public-place',text:{text:'Public station'},structuredFormat:{mainText:{text:'Station'},secondaryText:{text:'Raleigh'}}}}]});
  });
  assert.equal(calls,1);assert.deepEqual(result,[{placeId:'public-place',label:'Public station',main:'Station',sec:'Raleigh'}]);
});
test('place details preserve zero coordinates and reject malformed provider output',async()=>{
  assert.deepEqual(await requestDocumentProvider({operation:'geocode',id:'public-place'},'fictional-provider-key',async()=>Response.json({location:{latitude:0,longitude:0},formattedAddress:'Public address'})),{lat:0,lng:0,address:'Public address'});
  assert.equal(await requestDocumentProvider({operation:'geocode',id:'public-place'},'fictional-provider-key',async()=>Response.json({location:{latitude:999,longitude:0}})),null);
});
test('weather requests never receive Google key or application context',async()=>{
  const date=new Date().toISOString().slice(0,10);let calls=0;
  const result=await requestDocumentProvider({operation:'weather',date,lat:35.777,lng:-78.646},'fictional-provider-key',async(input,init)=>{
    calls++;const url=new URL(String(input));assert.equal(url.hostname,'api.open-meteo.com');assert.equal(url.searchParams.get('latitude'),'35.777');assert.equal(url.searchParams.get('start_date'),date);assert.equal(init?.headers,undefined);assert.equal(init?.body,undefined);assert.equal(init?.referrerPolicy,'no-referrer');
    return Response.json({daily:{time:[date],sunrise:[date+'T06:45'],sunset:[date+'T19:15'],temperature_2m_max:[25],temperature_2m_min:[15],precipitation_probability_max:[10],weathercode:[1]}});
  });
  assert.equal(calls,1);assert.equal((result as {maxF:number}).maxF,77);
});
test('client sends auth only to local proxy and keeps town text out of weather payload',async()=>{
  const provider=createLiveDocumentProviders(async()=>({token:'local-session',schedule:'local-schedule'}),async(input,init)=>{
    assert.equal(input,'/api/platform/local-document-providers');
    assert.deepEqual(JSON.parse(init!.body as string),{operation:'weather',date:'2026-09-19',lat:35,lng:-78,schedule:'local-schedule'});
    assert.equal(new Headers(init!.headers).get('Authorization'),'Bearer local-session');
    return Response.json({sunrise:'6:45 AM',sunset:'7:15 PM'});
  });
  assert.equal((await provider.weather('2026-09-19',35,-78,'Private town label'))?.town,'Private town label');
});

test('selected place name stays in the address without sending it to the details provider',async()=>{const provider=createLiveDocumentProviders(async()=>({token:'local-session',schedule:'local-schedule'}),async(input,init)=>{assert.deepEqual(JSON.parse(init!.body as string),{operation:'geocode',id:'public-place',schedule:'local-schedule'});return Response.json({lat:35,lng:-78,address:'510 W Martin St, Raleigh, NC'});});assert.equal((await provider.geocode('public-place','Raleigh Union Station'))?.address,'Raleigh Union Station, 510 W Martin St, Raleigh, NC');});
