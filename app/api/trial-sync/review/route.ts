import {NextRequest,NextResponse} from 'next/server';
import {readHostedWorkspaceConfig} from '@/lib/platform/hosted-workspace-config';
import {readPlatformJson,PlatformHttpError} from '@/lib/platform/server';
import {transport} from '@/scripts/trial-sync/hosted.cjs';
import {mappingScope,readReview,presentReview,resolveReview} from '@/scripts/trial-sync/resolution.cjs';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export async function POST(request:NextRequest){
 const env=process.env,config=readHostedWorkspaceConfig(env,request.headers.get('host'));
 const denied=(status:number,error:string)=>NextResponse.json({error},{status,headers});
 if(!config)return denied(404,'Review is unavailable.');
 if(request.headers.get('origin')!==config.appOrigin)return denied(403,'Review is unavailable.');
 const authorization=request.headers.get('authorization');
 if(!authorization||!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization))return denied(401,'Sign in again to review synchronization.');
 try{
  const body=await readPlatformJson(request);
  if(Object.keys(body).some(k=>!['operation','mappingId','sequence','reviewHash','take'].includes(k))||!['review','resolve'].includes(String(body.operation))||typeof body.mappingId!=='string')return denied(400,'Invalid review request.');
  const binding={organizationId:env.ROSELAND_TRIAL_SYNC_ORGANIZATION_ID,integrationId:env.ROSELAND_TRIAL_SYNC_INTEGRATION_ID,netlifySiteId:env.ROSELAND_TRIAL_SYNC_NETLIFY_SITE_ID,legacyOrigin:env.ROSELAND_TRIAL_SYNC_LEGACY_ORIGIN};
  const deadline=Date.now()+45000;
  const userRpc=async(name:string,args:unknown)=>{
   const remaining=deadline-Date.now();if(remaining<100)throw new PlatformHttpError(504,'The comparison timed out. Refresh before trying again.');
   const response=await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:config.anonymousKey,Authorization:authorization,'Content-Type':'application/json'},body:JSON.stringify(args),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(Math.min(10000,remaining))});
   if(!response.ok)throw new PlatformHttpError(response.status===409?409:403,response.status===409?'The comparison changed or is being checked. Refresh and review it again.':'Confirm your sign-in and authenticator in Account security, then try again.');
   return response.json();
  };
  let allowed:string[]=[];try{allowed=mappingScope(env.ROSELAND_TRIAL_SYNC_MAPPING_IDS);}catch{/* Read-only review remains available while the pilot is unconfigured. */}
  const writeReady=env.ROSELAND_TRIAL_SYNC_ENABLED==='true'&&env.ROSELAND_TRIAL_SYNC_WRITE_ENABLED==='true'&&allowed.includes(body.mappingId);
  if(body.operation==='review')return NextResponse.json(presentReview(await readReview({userRpc,binding,mappingId:body.mappingId}),writeReady),{headers});
  if(!writeReady)return denied(409,'Writes are paused for this schedule. You can still review both copies.');
  const bridgeSecret=env.ROSELAND_TRIAL_SYNC_BRIDGE_SECRET;
  if(!bridgeSecret||bridgeSecret.length<32||!binding.legacyOrigin)return denied(503,'The legacy connection is unavailable.');
  const connections=transport({supabaseUrl:config.supabaseUrl,secret:env.SUPABASE_SECRET_KEY??env.SUPABASE_SERVICE_ROLE_KEY!,legacyOrigin:binding.legacyOrigin,bridgeSecret,deadline});
  const result=await resolveReview({...connections,userRpc,binding,mappingId:body.mappingId,sequence:body.sequence,reviewHash:body.reviewHash,take:body.take});
  return NextResponse.json(result,{headers});
 }catch(error){
  if(error instanceof PlatformHttpError)return denied(error.status,error.message);
  if(error&&typeof error==='object'&&'status' in error&&[400,403,409,503].includes(Number(error.status))&&error instanceof Error)return denied(Number(error.status),error.message);
  return denied(502,'The result could not be confirmed. Refresh the comparison before trying again.');
 }
}
