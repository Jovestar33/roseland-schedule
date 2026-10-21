import {NextRequest,NextResponse} from 'next/server';
import {readHostedWorkspaceConfig} from '@/lib/platform/hosted-workspace-config';
import {authorized,transport,runHosted,checkHostedInventory} from '@/scripts/trial-sync/hosted.cjs';
import {mappingScope} from '@/scripts/trial-sync/resolution.cjs';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:NextRequest){
 const env=process.env;
 if(env.ROSELAND_TRIAL_SYNC_ENABLED!=='true')return NextResponse.json({state:'disabled'},{status:404});
 if(!authorized(request.headers.get('authorization'),env.CRON_SECRET))return NextResponse.json({state:'unavailable'},{status:401});
 // Vercel invokes cron at this deployment's generated hostname. Admit that
 // exact system-provided host only here, after machine authentication. Browser
 // routes keep their canonical-host restriction; preview runtimes still fail.
 const host=request.headers.get('host');
 const deploymentHost=env.VERCEL_URL;
 const canonicalHost=host===deploymentHost&&/^[a-z0-9-]+\.vercel\.app$/.test(deploymentHost??'')
  ? URL.parse(env.ROSELAND_APP_ORIGIN??'')?.host??null : host;
 const config=readHostedWorkspaceConfig(env,canonicalHost);
 if(!config)return NextResponse.json({state:'disabled'},{status:404});
 const {ROSELAND_TRIAL_SYNC_INTEGRATION_ID:integrationId,ROSELAND_TRIAL_SYNC_ORGANIZATION_ID:organizationId,ROSELAND_TRIAL_SYNC_NETLIFY_SITE_ID:netlifySiteId,ROSELAND_TRIAL_SYNC_LEGACY_ORIGIN:legacyOrigin,ROSELAND_TRIAL_SYNC_BRIDGE_SECRET:bridgeSecret}=env;
 if(!integrationId||!organizationId||!netlifySiteId||!legacyOrigin||!bridgeSecret||bridgeSecret.length<32)return NextResponse.json({state:'unconfigured'},{status:503});
 try{
  const mappingIds=mappingScope(env.ROSELAND_TRIAL_SYNC_MAPPING_IDS);
  const deadline=Date.now()+45000;
  const connections=transport({supabaseUrl:config.supabaseUrl,secret:env.SUPABASE_SECRET_KEY??env.SUPABASE_SERVICE_ROLE_KEY!,legacyOrigin,bridgeSecret,deadline});
  const binding={...connections,integrationId,organizationId,netlifySiteId,legacyOrigin,deadline};
  const inventoryAttention=await checkHostedInventory(binding);
  const inspectOnly=env.ROSELAND_TRIAL_SYNC_WRITE_ENABLED!=='true';
  const result=await runHosted({...binding,inspectOnly,mappingIds});
  return NextResponse.json({state:result.review||result.unavailable||inventoryAttention?'attention':'checked',mode:inspectOnly?'read-only':'synchronize',...result,inventoryAttention},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({state:'attention'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
