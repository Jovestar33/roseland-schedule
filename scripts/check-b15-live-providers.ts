import {readFileSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const config=JSON.parse(readFileSync('/private/tmp/roseland-b14-destination-g2-live-status.json','utf8'));
const access=JSON.parse(readFileSync('/private/tmp/roseland-b15-review-access.json','utf8'));
if(config.API_URL!=='http://127.0.0.1:56521')throw Error('Owned fictional loopback required');
const client=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const login=await client.auth.signInWithPassword({email:access.email,password:access.password});
if(login.error||!login.data.session)throw Error('Local sign-in failed');
const token=login.data.session.access_token,schedule='86f6b47d-0df9-405b-92d6-9aeeeb0e2ddf';
const base='http://127.0.0.1:3488';
async function call(body:Record<string,unknown>,authorization:string|null=token,origin=base){
  return fetch(base+'/api/platform/local-document-providers',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(authorization?{Authorization:'Bearer '+authorization}:{})},body:JSON.stringify({...body,schedule}),redirect:'error',signal:AbortSignal.timeout(35000)});
}
const query={operation:'search',query:'Raleigh Union Station'};
const unauthenticated=(await call(query,null)).status,foreignOrigin=(await call(query,token,'https://outside.invalid')).status;
if(unauthenticated!==401||foreignOrigin!==403)throw Error('Provider admission check failed');
const search=await call(query);if(!search.ok)throw Error('Public Places query failed: '+search.status);
const suggestions=await search.json() as Array<{main:string;placeId:string}>;
const place=suggestions.find(p=>p.main==='Raleigh Union Station');if(!place)throw Error('Public station missing');
const details=await call({operation:'geocode',id:place.placeId});if(!details.ok)throw Error('Public details failed');
const geo=await details.json();
const date=new Date().toISOString().slice(0,10),forecast=await call({operation:'weather',date,lat:geo.lat,lng:geo.lng});
if(!forecast.ok)throw Error('Public weather query failed');const weather=await forecast.json();
if(!weather||weather.noForecast||!Number.isFinite(weather.maxF)||!weather.sunrise||!weather.sunset)throw Error('Live forecast not confirmed');
const result={observedAt:new Date().toISOString(),fixtureSchedule:schedule,query:query.query,date,unauthenticated,foreignOrigin,suggestionCount:suggestions.length,placeId:place.placeId,publicLocation:geo,weather,cacheControl:forecast.headers.get('cache-control'),credentialsRecorded:false,actualScheduleWrites:false};
writeFileSync('evidence/b15-parity-remediation/live-provider-check.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({places:'passed',details:'passed',weather:'passed',unauthenticated,foreignOrigin}));
