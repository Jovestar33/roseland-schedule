import type {SupabaseClient} from '@supabase/supabase-js';
import {parseInvitationId} from './contracts.ts';
export const MFA_ROLES=['admin','organizer','editor','viewer'] as const;
export type MfaRole=typeof MFA_ROLES[number];
export type MfaPolicy={organization_id:string;version:number;required_roles:MfaRole[];can_manage:boolean};
export type MfaAttempt={actor:string;organization:string;request:string;version:number;roles:MfaRole[]};
export function captureMfaAttempt(a:MfaAttempt):MfaAttempt{
 [a.actor,a.organization,a.request].forEach(parseInvitationId);
 if(!Number.isSafeInteger(a.version)||a.version<0||!Array.isArray(a.roles)||a.roles.some(r=>!MFA_ROLES.includes(r)))throw Error('Invalid security policy');
 return Object.freeze({...a,roles:Object.freeze([...new Set(a.roles)].sort()) as unknown as MfaRole[]});
}
export class MfaPolicyError extends Error{constructor(public kind:'mfa'|'conflict'|'denied'|'auth'|'unknown'){super(kind);}}
export function createMfaPolicyRepository(client:SupabaseClient){
 async function rpc(actor:string,name:string,args:Record<string,unknown>){
  const s=await client.auth.getSession();if(s.data.session?.user.id!==actor)throw new MfaPolicyError('auth');
  const r=await client.rpc(name,args).setHeader('Authorization',`Bearer ${s.data.session.access_token}`);
  if(r.error)throw new MfaPolicyError(r.error.message?.startsWith('mfa_')?'mfa':r.status===401?'auth':r.status===409?'conflict':r.status===404?'denied':'unknown');return r.data;
 }
 return {async read(actor:string,org:string):Promise<MfaPolicy>{const r=await rpc(actor,'read_organization_mfa_policy',{target_organization_id:org});
  if(r?.organization_id!==org||!Number.isSafeInteger(r.version)||!Array.isArray(r.required_roles)||r.required_roles.some((v:MfaRole)=>!MFA_ROLES.includes(v))||typeof r.can_manage!=='boolean')throw new MfaPolicyError('unknown');return r;},
 async save(a:MfaAttempt){const r=await rpc(a.actor,'save_organization_mfa_policy',{target_organization_id:a.organization,request_id:a.request,expected_version:a.version,required_roles:a.roles});
  if(r?.confirmed!==true||r.request_id!==a.request||r.organization_id!==a.organization||r.version!==a.version+1)throw new MfaPolicyError('unknown');return r;}};
}
