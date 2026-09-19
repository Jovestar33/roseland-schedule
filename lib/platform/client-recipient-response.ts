import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {readLocalWorkspaceConfig} from './local-workspace-config.ts';
import {readPlatformJson} from './server.ts';
import {serviceApiHeaders} from './service-headers.ts';
import {legacyClientExpiry} from './legacy-client-token.ts';
import {CLIENT_COOKIE,CLIENT_SESSION_PATH,createRecipientSession,readRecipientSession,validRecipient,type RecipientGrant} from './client-recipient-session.ts';
const headers={'cache-control':'private, no-store, max-age=0','referrer-policy':'no-referrer','x-content-type-options':'nosniff','x-robots-tag':'noindex, nofollow','vary':'Origin, Cookie'};
const unavailable=(status=404,code='unavailable')=>NextResponse.json({error:'Shared schedule unavailable.',code},{status,headers});
function context(request:NextRequest){
 const config=readLocalWorkspaceConfig(process.env,request.headers.get('host'));if(!config)return null;
 const origin=`${request.nextUrl.protocol}//${request.headers.get('host')}`,sentOrigin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
 if((sentOrigin&&sentOrigin!==origin)||(site&&site!=='same-origin'&&site!=='none'))return null;
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY??process.env.SUPABASE_SECRET_KEY??'';
 if(secret.length<32)return null;
 return {config,origin,secret};
}
function options(request:NextRequest,recipient:string,expires:number){return {httpOnly:true,sameSite:'strict' as const,secure:request.nextUrl.protocol==='https:',path:`${CLIENT_SESSION_PATH}/${recipient}`,expires:new Date(expires*1000)};}
async function readGrant(config:{supabaseUrl:string},secret:string,grant:RecipientGrant){
 const response=await fetch(`${config.supabaseUrl}/rest/v1/rpc/read_schedule_client_view`,{method:'POST',headers:{...serviceApiHeaders(secret),'content-type':'application/json'},body:JSON.stringify({token_hash:grant.hash,legacy_name:grant.legacy,legacy_expires:grant.legacyExpires}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)return {response:unavailable(response.status>=500?503:404),denied:response.status<500};
 const result=await response.json();if(result?.limited)return {response:unavailable(429),denied:false};
 if(!result?.document||typeof result.name!=='string')return {response:unavailable(),denied:true};
 return {response:NextResponse.json(result,{headers}),denied:false};
}
export async function exchangeClientRecipient(request:NextRequest){
 const ctx=context(request);if(!ctx)return unavailable(403);
 try{
  const body=await readPlatformJson(request),token=body.token;let legacy:string|null=null,legacyExpires:number|null=null;
  if(body.legacyName!==undefined){legacy=typeof body.legacyName==='string'?body.legacyName:null;legacyExpires=legacyClientExpiry(legacy,token,process.env.ROSELAND_LOCAL_LEGACY_VIEW_SECRET);if(!legacyExpires)return unavailable();}
  else if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))return unavailable();
  const grant={hash:createHash('sha256').update(token as string).digest('hex'),legacy,legacyExpires};
  const checked=await readGrant(ctx.config,ctx.secret,grant);if(!checked.response.ok)return checked.response;
  const {session,cookie}=createRecipientSession(grant,ctx.secret,ctx.origin);
  const response=NextResponse.json({recipient:session.recipient},{headers});
  response.cookies.set(CLIENT_COOKIE,cookie,options(request,session.recipient,session.expires));return response;
 }catch{return unavailable(503);}
}
export async function readClientRecipient(request:NextRequest,recipient:string){
 const ctx=context(request);if(!ctx||!validRecipient(recipient))return unavailable(403);
 const cookie=request.cookies.get(CLIENT_COOKIE)?.value;
 if(!cookie)return unavailable(428,'cookies_required');
 const session=readRecipientSession(cookie,recipient,ctx.secret,ctx.origin);
 if(!session){const response=unavailable();response.cookies.set(CLIENT_COOKIE,'',options(request,recipient,0));return response;}
 try{
  const result=await readGrant(ctx.config,ctx.secret,session);
  if(result.denied)result.response.cookies.set(CLIENT_COOKIE,'',options(request,recipient,0));
  return result.response;
 }catch{return unavailable(503);}
}
