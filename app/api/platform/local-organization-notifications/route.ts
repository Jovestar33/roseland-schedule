import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server';
import {parseInvitationId} from '@/lib/platform/contracts';
import {readLocalWorkspaceConfig} from '@/lib/platform/local-workspace-config';
import {authenticatePlatformRequest,callPlatformJsonRpc,PlatformHttpError,platformError,platformJson,readPlatformJson} from '@/lib/platform/server';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
 const requestId=randomUUID();
 try{
  if(!readLocalWorkspaceConfig(process.env,request.headers.get('host'))||process.env.ROSELAND_LOCAL_MEMBERSHIP_NOTIFICATIONS!=='mailpit')throw new PlatformHttpError(404,'Not found');
  const mail=new URL(process.env.ROSELAND_LOCAL_MAILPIT_URL??'');
  if(mail.protocol!=='http:'||!['127.0.0.1','localhost'].includes(mail.hostname)||!mail.port||mail.username||mail.password||mail.pathname!=='/'||mail.search||mail.hash)throw new PlatformHttpError(503,'Local mail unavailable');
  const body=await readPlatformJson(request),org=parseInvitationId(body.organizationId),event=parseInvitationId(body.eventId),recipient=parseInvitationId(body.recipientId);
  const {actor,config}=await authenticatePlatformRequest(request,30*60),claim=randomUUID();
  const result=await callPlatformJsonRpc(config,'claim_organization_lifecycle_notice',{p_actor_user_id:actor.userId,p_organization_id:org,p_event_id:event,p_recipient_id:recipient,p_claim_id:claim}) as {state:string;email?:string;organization?:string;kind?:string;version?:number;cancel_before?:string};
  if(result?.state==='delivered'||result?.state==='sending')return platformJson({state:result.state},200,requestId);
  if(result?.state!=='claimed')throw new PlatformHttpError(502,'Delivery unavailable');
  let delivered=false;
  try{
   if(typeof result.email!=='string'||! /^[^\s@]+@example\.test$/.test(result.email))throw Error('Fictional recipient required');
   const response=await fetch(mail.origin+'/api/v1/send',{method:'POST',headers:{'content-type':'application/json'},redirect:'error',signal:AbortSignal.timeout(10000),body:JSON.stringify({From:{Email:'membership@example.test',Name:'Roseland local rehearsal'},To:[{Email:result.email}],Subject:'Organization deletion '+(result.kind==='deletion_requested'?'requested':'cancelled'),Text:`Organization: ${result.organization}. A deletion ${result.kind==='deletion_requested'?'request was made':'request was cancelled'}. Cancellation deadline for that request: ${result.cancel_before}. While pending, existing authorized read/export remain available and ordinary writes pause. After the deadline this local workflow awaits a separately approved purge; it does not erase data automatically. A newer lifecycle change may supersede this notice. Change ${result.version}; event ${event}.`,Headers:{'X-Roseland-Event':event}})});
   delivered=response.ok;
  }catch{/* Preserve membership outcome and make failed local delivery retryable. */}
  const recorded=await callPlatformJsonRpc(config,'finish_organization_lifecycle_notice',{p_actor_user_id:actor.userId,p_event_id:event,p_recipient_id:recipient,p_claim_id:claim,p_delivered:delivered});
  return platformJson({state:recorded===true?(delivered?'delivered':'failed'):'sending'},200,requestId);
 }catch(error){return platformError(error,requestId);}
}
