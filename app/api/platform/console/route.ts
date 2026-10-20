import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { parseInvitationId } from '@/lib/platform/contracts';
import { authenticatePlatformRequest, callPlatformJsonRpc, platformError, platformJson, PlatformHttpError } from '@/lib/platform/server';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
 const requestId=randomUUID();
 try {
  const view=request.nextUrl.searchParams.get('view')??'access';
  if(!['access','organizations'].includes(view))throw new PlatformHttpError(400,'Invalid console request');
  const search=request.nextUrl.searchParams.get('search')??'';
  if(search.length>100)throw new PlatformHttpError(400,'Invalid console request');
  const after=request.nextUrl.searchParams.get('after');
  const afterId=after?parseInvitationId(after):null;
  // Discovery reveals only this actor's designation; organization metadata needs recent MFA.
  const {actor,config}=await authenticatePlatformRequest(request,view==='access'?Number.MAX_SAFE_INTEGER:15*60);
  const result=await callPlatformJsonRpc(config,'read_platform_console',{
   p_actor_user_id:actor.userId,p_actor_aal:actor.aal,p_actor_authenticated_at:actor.authenticatedAt,
   p_view:view,p_after_id:afterId,p_search:search,
  });
  return platformJson({result,requestId},200,requestId);
 }catch(error){return platformError(error,requestId);}
}
