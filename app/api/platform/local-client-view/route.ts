import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {readLocalWorkspaceConfig} from '@/lib/platform/local-workspace-config';
import {readPlatformJson} from '@/lib/platform/server';
import {serviceApiHeaders} from '@/lib/platform/service-headers';
import {legacyClientExpiry} from '@/lib/platform/legacy-client-token';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'cache-control':'private, no-store, max-age=0','referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow','vary':'Origin'};
function unavailable(status=404){return NextResponse.json({error:'Shared schedule unavailable.'},{status,headers});}
export async function POST(request:NextRequest){
 const config=readLocalWorkspaceConfig(process.env,request.headers.get('host'));if(!config)return unavailable();
 const origin=request.headers.get('origin');if(origin&&origin!==`http://${request.headers.get('host')}`)return unavailable(403);
 try{
  const body=await readPlatformJson(request);const token=body.token;let legacy:string|null=null,expiry:number|null=null;
  if(body.legacyName!==undefined){legacy=typeof body.legacyName==='string'?body.legacyName:null;expiry=legacyClientExpiry(legacy,token,process.env.ROSELAND_LOCAL_LEGACY_VIEW_SECRET);if(!expiry)return unavailable();}
  else if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))return unavailable();
  const response=await fetch(`${config.supabaseUrl}/rest/v1/rpc/read_schedule_client_view`,{method:'POST',headers:{...serviceApiHeaders(process.env.SUPABASE_SERVICE_ROLE_KEY??process.env.SUPABASE_SECRET_KEY??''),'content-type':'application/json'},body:JSON.stringify({token_hash:createHash('sha256').update(token as string).digest('hex'),legacy_name:legacy,legacy_expires:expiry}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)return unavailable();const result=await response.json();if(result?.limited)return unavailable(429);if(!result?.document||typeof result.name!=='string')return unavailable();return NextResponse.json(result,{headers});
 }catch{return unavailable();}
}
