import {NextRequest,NextResponse} from 'next/server';
import {readHostedWorkspaceConfig} from '@/lib/platform/hosted-workspace-config';
import {authorized,transport,runHosted} from '@/scripts/trial-sync/hosted.cjs';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:NextRequest){
 const env=process.env,config=readHostedWorkspaceConfig(env,request.headers.get('host'));
 if(!config||env.ROSELAND_TRIAL_SYNC_ENABLED!=='true')return NextResponse.json({state:'disabled'},{status:404});
 if(!authorized(request.headers.get('authorization'),env.CRON_SECRET))return NextResponse.json({state:'unavailable'},{status:401});
 const {ROSELAND_TRIAL_SYNC_INTEGRATION_ID:integrationId,ROSELAND_TRIAL_SYNC_ORGANIZATION_ID:organizationId,ROSELAND_TRIAL_SYNC_NETLIFY_SITE_ID:netlifySiteId,ROSELAND_TRIAL_SYNC_LEGACY_ORIGIN:legacyOrigin,ROSELAND_TRIAL_SYNC_BRIDGE_SECRET:bridgeSecret}=env;
 if(!integrationId||!organizationId||!netlifySiteId||!legacyOrigin||!bridgeSecret||bridgeSecret.length<32)return NextResponse.json({state:'unconfigured'},{status:503});
 try{
  const deadline=Date.now()+45000;
  const result=await runHosted({...transport({supabaseUrl:config.supabaseUrl,secret:env.SUPABASE_SECRET_KEY??env.SUPABASE_SERVICE_ROLE_KEY!,legacyOrigin,bridgeSecret,deadline}),integrationId,organizationId,netlifySiteId,legacyOrigin,deadline});
  return NextResponse.json({state:result.review||result.unavailable?'attention':'checked',...result},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({state:'attention'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
