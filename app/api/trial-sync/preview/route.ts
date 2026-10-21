import {NextRequest,NextResponse} from 'next/server';
import {readHostedWorkspaceConfig} from '@/lib/platform/hosted-workspace-config';
import {readPlatformJson,PlatformHttpError} from '@/lib/platform/server';
import {previewCopies} from '@/scripts/trial-sync/preview.cjs';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export async function POST(request:NextRequest){
 const env=process.env,config=readHostedWorkspaceConfig(env,request.headers.get('host'));
 const denied=(status:number,error:string)=>NextResponse.json({error},{status,headers});
 if(!config)return denied(404,'Comparison is unavailable.');
 if(request.headers.get('origin')!==config.appOrigin)return denied(403,'Comparison is unavailable.');
 const authorization=request.headers.get('authorization');
 if(!authorization||!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization))return denied(401,'Sign in again to compare schedules.');
 try{
  const body=await readPlatformJson(request);
  if(Object.keys(body).some(k=>!['organizationId','offset','mappingsHash'].includes(k))||body.organizationId!==env.ROSELAND_TRIAL_SYNC_ORGANIZATION_ID||(body.offset!==undefined&&(typeof body.offset!=='number'||!Number.isSafeInteger(body.offset)||body.offset<0))||(body.mappingsHash!==undefined&&(typeof body.mappingsHash!=='string'||!/^[a-f0-9]{64}$/.test(body.mappingsHash))))return denied(400,'Invalid comparison request.');
  const binding={organizationId:env.ROSELAND_TRIAL_SYNC_ORGANIZATION_ID,integrationId:env.ROSELAND_TRIAL_SYNC_INTEGRATION_ID,netlifySiteId:env.ROSELAND_TRIAL_SYNC_NETLIFY_SITE_ID,legacyOrigin:env.ROSELAND_TRIAL_SYNC_LEGACY_ORIGIN};
  const secret=env.ROSELAND_TRIAL_SYNC_BRIDGE_SECRET;
  if(!secret||secret.length<32||secret.trim()!==secret)return denied(503,'The legacy connection is not configured.');
  const deadline=Date.now()+45000;
  async function post(url:string,requestHeaders:Record<string,string>,payload:unknown){
   const remaining=deadline-Date.now();if(remaining<100)throw new PlatformHttpError(504,'Comparison timed out. Try again.');
   const response=await fetch(url,{method:'POST',headers:{...requestHeaders,'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(Math.min(10000,remaining))});
   if(!response.ok)throw new PlatformHttpError(response.status===401||response.status===403?403:502,'Comparison is unavailable. Check your sign-in and the legacy connection.');
   return response.json();
  }
  const rpc=(name:string,args:unknown)=>post(`${config.supabaseUrl}/rest/v1/rpc/${name}`,{apikey:config.anonymousKey,Authorization:authorization},args);
  const bridge=(args:unknown)=>post(`${binding.legacyOrigin}/.netlify/functions/trial-sync`,{Authorization:`Bearer ${secret}`},args);
  // The existing status RPC verifies current-session, organization Owner and MFA
  // before the preview module is permitted to make a legacy request.
  const result=await previewCopies({rpc,bridge,binding,offset:typeof body.offset==='number'?body.offset:0,expectedMappingsHash:body.mappingsHash});
  return NextResponse.json(result,{headers});
 }catch(error){
  if(error instanceof PlatformHttpError)return denied(error.status,error.message);
  return denied(502,'The comparison could not finish. No schedules were changed.');
 }
}
