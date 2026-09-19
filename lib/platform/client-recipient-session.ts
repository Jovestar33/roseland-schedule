import {createCipheriv,createDecipheriv,hkdfSync,randomBytes} from 'node:crypto';
export const CLIENT_COOKIE='roseland_client';
export const CLIENT_SESSION_PATH='/api/platform/local-client-view';
const lifetime=30*86400;
export type RecipientGrant={hash:string;legacy:string|null;legacyExpires:number|null};
export type RecipientSession=RecipientGrant&{recipient:string;issued:number;expires:number};
export function validRecipient(value:unknown):value is string{return typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);}
function key(secret:string){if(secret.length<32)throw Error('Recipient session unavailable');return Buffer.from(hkdfSync('sha256',secret,'roseland-client-session-v1','recipient-cookie',32));}
function aad(origin:string,recipient:string){return Buffer.from(`v1:${origin}:${recipient}`);}
export function createRecipientSession(grant:RecipientGrant,secret:string,origin:string,now=Math.floor(Date.now()/1000)){
 const session:RecipientSession={...grant,recipient:randomBytes(16).toString('hex'),issued:now,expires:Math.min(now+lifetime,grant.legacyExpires??Infinity)};
 if(session.expires<=now)throw Error('Recipient session unavailable');
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(secret),nonce);cipher.setAAD(aad(origin,session.recipient));
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(session),'utf8'),cipher.final()]);
 return {session,cookie:Buffer.concat([nonce,cipher.getAuthTag(),encrypted]).toString('base64url')};
}
export function readRecipientSession(cookie:unknown,recipient:unknown,secret:string,origin:string,now=Math.floor(Date.now()/1000)):RecipientSession|null{
 if(!validRecipient(recipient)||typeof cookie!=='string'||cookie.length>1400||! /^[A-Za-z0-9_-]+$/.test(cookie))return null;
 try{
  const raw=Buffer.from(cookie,'base64url');if(raw.length<29)return null;
  const cipher=createDecipheriv('aes-256-gcm',key(secret),raw.subarray(0,12));cipher.setAuthTag(raw.subarray(12,28));cipher.setAAD(aad(origin,recipient));
  const value=JSON.parse(Buffer.concat([cipher.update(raw.subarray(28)),cipher.final()]).toString('utf8')) as RecipientSession;
  if(value.recipient!==recipient||! /^[a-f0-9]{64}$/.test(value.hash)||!Number.isSafeInteger(value.issued)||!Number.isSafeInteger(value.expires)||value.issued>now||value.expires<=now||value.expires>value.issued+lifetime)return null;
  if(value.legacy!==null&&(typeof value.legacy!=='string'||!value.legacy||value.legacy.length>200||!Number.isSafeInteger(value.legacyExpires)||value.legacyExpires!<=now))return null;
  if(value.legacy===null&&value.legacyExpires!==null)return null;
  return value;
 }catch{return null;}
}
