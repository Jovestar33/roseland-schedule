import 'server-only';
import {randomUUID} from 'node:crypto';
import type {NextRequest} from 'next/server';
import {parseInvitationId} from './contracts';
import {readHostedWorkspaceConfig} from './hosted-workspace-config';
import {readNotificationMailConfig,sendHostedNotification} from './hosted-notification-mail';
import {authenticatePlatformRequest,callPlatformJsonRpc,PlatformHttpError,platformError,platformJson,readPlatformJson} from './server';

type Notice={state:string;email?:string;organization?:string;status?:string;revision?:number;kind?:string;version?:number;cancel_before?:string};
export async function postHostedNotification(request:NextRequest,kind:'membership'|'organization'){
 const requestId=randomUUID();
 try{
  const hosted=readHostedWorkspaceConfig(process.env,request.headers.get('host'));
  if(!hosted||process.env.ROSELAND_HOSTED_NOTIFICATIONS!=='smtp')throw new PlatformHttpError(404,'Not found');
  if(request.headers.get('origin')!==hosted.appOrigin)throw new PlatformHttpError(403,'Request unavailable');
  const mail=readNotificationMailConfig();
  const body=await readPlatformJson(request),keys=kind==='membership'?['organizationId','eventId']:['organizationId','eventId','recipientId'];
  if(Object.keys(body).some(key=>!keys.includes(key)))throw new PlatformHttpError(400,'Invalid request');
  const org=parseInvitationId(body.organizationId),event=parseInvitationId(body.eventId),recipient=kind==='organization'?parseInvitationId(body.recipientId):null;
  const {actor,config}=await authenticatePlatformRequest(request,30*60),claim=randomUUID();
  const recipientArgs=recipient?{p_recipient_id:recipient}:{};
  const result=await callPlatformJsonRpc(config,kind==='membership'?'claim_membership_notification':'claim_organization_lifecycle_notice',{
   p_actor_user_id:actor.userId,p_organization_id:org,p_event_id:event,p_claim_id:claim,...recipientArgs}) as Notice;
  if(result?.state==='delivered'||result?.state==='sending')return platformJson({state:result.state},200,requestId);
  if(result?.state!=='claimed')throw new PlatformHttpError(502,'Delivery unavailable');
  let accepted=false;
  try{
   if(typeof result.email!=='string'||typeof result.organization!=='string')throw Error('Invalid notice');
   if(kind==='membership'&&!['active','suspended'].includes(result.status??''))throw Error('Invalid membership notice');
   if(kind==='organization'&&!['deletion_requested','deletion_cancelled'].includes(result.kind??''))throw Error('Invalid organization notice');
   const subject=kind==='membership'?'Organization membership '+(result.status==='active'?'reinstated':'suspended'):'Organization deletion '+(result.kind==='deletion_requested'?'requested':'cancelled');
   const text=kind==='membership'
    ?`Your membership in ${result.organization} was changed to ${result.status}. Your role and independent restrictions are retained. Membership revision: ${result.revision}.`
    :`Organization: ${result.organization}. A deletion request was ${result.kind==='deletion_requested'?'made':'cancelled'}. Cancellation deadline for that request: ${result.cancel_before}. While pending, authorized read/export remain available and ordinary writes pause. After the deadline, deletion awaits a separately approved purge; data is not erased automatically. Change ${result.version}.`;
   accepted=await sendHostedNotification(mail,{recipient:result.email,event,subject,text:`${text} A newer change may supersede this notice. Event: ${event}. Open Roseland Schedule: ${hosted.appOrigin}/workspace`});
  }catch{/* Do not expose SMTP credentials/errors. Keep the notice retryable. */}
  const recorded=await callPlatformJsonRpc(config,kind==='membership'?'finish_membership_notification':'finish_organization_lifecycle_notice',{
   p_actor_user_id:actor.userId,p_event_id:event,p_claim_id:claim,p_delivered:accepted,...recipientArgs});
  return platformJson({state:recorded===true?(accepted?'delivered':'failed'):'sending'},200,requestId);
 }catch(error){return platformError(error,requestId);}
}
