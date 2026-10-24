import 'server-only';
import {documentEmail} from './document-email';
import {createHash,randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {readHostedWorkspaceConfig} from './hosted-workspace-config';
import {readPlatformJson} from './server';
import {serviceApiHeaders} from './service-headers';
import {readNotificationMailConfig,sendHostedNotification} from './hosted-notification-mail';
const headers={'cache-control':'private, no-store, max-age=0','referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow'};
const response=(body:unknown,status=200)=>NextResponse.json(body,{status,headers});
function context(request:NextRequest){
 const config=readHostedWorkspaceConfig(process.env,request.headers.get('host')),secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!config||!secret||request.headers.get('origin')!==config.appOrigin)return null;
 return{config,secret};
}
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
async function serviceRpc(ctx:NonNullable<ReturnType<typeof context>>,name:string,args:object){
 return fetch(`${ctx.config.supabaseUrl}/rest/v1/rpc/${name}`,{method:'POST',headers:{...serviceApiHeaders(ctx.secret),'content-type':'application/json'},body:JSON.stringify(args),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
}
export async function readCallSheet(request:NextRequest){
 const ctx=context(request);if(!ctx)return response({error:'Call sheet unavailable.'},403);
 try{const body=await readPlatformJson(request);if(Object.keys(body).some(k=>!['token','acknowledge'].includes(k))||typeof body.token!=='string'||! /^[a-f0-9]{64}$/.test(body.token)||body.acknowledge!==undefined&&(!Number.isSafeInteger(body.acknowledge)||Number(body.acknowledge)<1))return response({error:'Call sheet unavailable.'},404);
 const r=await serviceRpc(ctx,'read_call_sheet_recipient',{token_hash:hash(body.token),acknowledge_edition:body.acknowledge??null});if(!r.ok)return response({error:r.status===409?'A revised call sheet is available. Refresh before confirming.':'Call sheet unavailable.'},r.status===409?409:404);
 const data=await r.json();if(data?.limited)return response({error:'Please try again shortly.'},429);if(!data?.document)return response({error:'This link has expired or is no longer available. Ask the production team for a new link.'},404);return response(data);
 }catch{return response({error:'The call sheet could not be loaded. Please try again.'},503);}
}
export async function emailCallSheet(request:NextRequest){
 const ctx=context(request);if(!ctx)return response({error:'Email unavailable.'},403);
 try{const body=await readPlatformJson(request),authorization=request.headers.get('authorization');
 if(!authorization?.match(/^Bearer [^\s]+$/)||typeof body.token!=='string'||! /^[a-f0-9]{64}$/.test(body.token)||typeof body.link!=='string'||! /^[0-9a-f-]{36}$/i.test(body.link)||!Number.isSafeInteger(body.edition)||Number(body.edition)<1||Object.keys(body).some(k=>!['token','link','edition'].includes(k)))return response({error:'Review the issued call sheet before sending.'},400);
 const mail=readNotificationMailConfig(),claim=randomUUID();
 // The user-session RPC verifies the real session, role, issuer, token hash,
 // latest edition and single-send claim before returning a recipient address.
 const r=await fetch(`${ctx.config.supabaseUrl}/rest/v1/rpc/claim_call_sheet_email`,{method:'POST',headers:{apikey:ctx.config.anonymousKey,authorization,'content-type':'application/json'},body:JSON.stringify({target_link_id:body.link,token_hash:hash(body.token),expected_edition:body.edition,claim_id:claim}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)return response({error:r.status===409?'A newer version is available. Refresh before sending.':'Email could not be authorized. Sign in again or refresh the call sheet.'},r.status===409?409:403);
 const job=await r.json();if(job?.state!=='claimed')return response({state:job?.state??'uncertain'});
 let accepted=false;
 try{accepted=await sendHostedNotification(mail,{recipient:job.recipient,event:`call-sheet-${body.link}-v${job.edition}`,...documentEmail({name:job.name,edition:job.edition,documents:job.documents,url:`${ctx.config.appOrigin}/call-sheet#${body.token}`})});}catch{/* An SMTP timeout does not prove that no email was sent. */}
 const finished=await serviceRpc(ctx,'finish_call_sheet_email',{target_link_id:body.link,claim_id:claim,accepted});return response({state:accepted&&finished.ok?'accepted':'uncertain'});
 }catch{return response({error:'Email could not be confirmed. Refresh its status before sending again.'},503);}
}
