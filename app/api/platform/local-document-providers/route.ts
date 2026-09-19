import {NextRequest,NextResponse} from 'next/server';
import {readLocalWorkspaceConfig} from '@/lib/platform/local-workspace-config';
import {readPlatformJson,PlatformHttpError} from '@/lib/platform/server';
import {createPlacesBudget} from '@/lib/security/places-proxy';
import {parseProviderQuery,requestDocumentProvider} from '@/lib/security/document-provider-upstream';
export const runtime='nodejs';export const dynamic='force-dynamic';
const budget=createPlacesBudget(120);
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const denied=(status:number)=>NextResponse.json({error:'Location or weather service unavailable.'},{status,headers});
export async function POST(request:NextRequest){
  const config=readLocalWorkspaceConfig(process.env,request.headers.get('host'));
  if(!config?.liveDocumentProviders)return denied(404);
  if(request.headers.get('origin')!==`http://${request.headers.get('host')}`)return denied(403);
  const authorization=request.headers.get('authorization');
  if(!authorization||!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization))return denied(401);
  try{
    const body=await readPlatformJson(request),query=parseProviderQuery(body);
    if(!query||typeof body.schedule!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.schedule))return denied(400);
    const rpc=async(name:string,args:Record<string,unknown>)=>fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`,{
      method:'POST',headers:{apikey:config.anonymousKey,Authorization:authorization,'Content-Type':'application/json'},
      body:JSON.stringify(args),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(5000),
    });
    const session=await rpc('require_active_schedule_session',{});if(!session.ok)return denied(401);
    const permission=await rpc('schedule_visible',{target_schedule_id:body.schedule,action:'edit'});
    if(!permission.ok||await permission.json()!==true)return denied(403);
    if(!budget())return denied(429);
    const result=await requestDocumentProvider(query,process.env.GOOGLE_PLACES_KEY?.trim()||'');
    return NextResponse.json(result,{headers});
  }catch(error){return denied(error instanceof PlatformHttpError?error.status:502);}
}
