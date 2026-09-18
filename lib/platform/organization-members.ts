import type {SupabaseClient} from '@supabase/supabase-js';
import {parseInvitationId} from './contracts.ts';
export type OrganizationMember={id:string;user_id:string;name:string;role:'owner'|'admin'|'member';status:'active'|'suspended'|'invited';revision:number;can_manage:boolean;notification_id:string|null;notification_state:string|null;pending_notifications:{event_id:string;next_status:string;membership_revision:number;delivery_state:string}[]};
export type MembershipAttempt={actor:string;organization:string;member:string;revision:number;request:string;status:'active'|'suspended';confirmed:boolean;reason:string};
export function captureMembershipAttempt(a:MembershipAttempt):MembershipAttempt{
 [a.actor,a.organization,a.member,a.request].forEach(parseInvitationId);
 if(!Number.isSafeInteger(a.revision)||a.revision<1||a.revision>=Number.MAX_SAFE_INTEGER||!['active','suspended'].includes(a.status)||a.confirmed!==true||!a.reason.trim()||a.reason.trim().length>500)throw Error('Confirm the member and enter a reason');
 return Object.freeze({...a,reason:a.reason.trim()});
}
type MembershipErrorKind='mfa'|'conflict'|'denied'|'auth'|'unknown';
export class MembershipError extends Error{kind:MembershipErrorKind;constructor(kind:MembershipErrorKind){super(kind);this.kind=kind;}}
export function createMembershipRepository(client:SupabaseClient){
 async function token(actor:string){const s=await client.auth.getSession();if(s.data.session?.user.id!==actor)throw new MembershipError('auth');return s.data.session.access_token;}
 async function rpc(actor:string,name:string,args:Record<string,unknown>){
  const accessToken=await token(actor);
  const r=await client.rpc(name,args).setHeader('Authorization',`Bearer ${accessToken}`);
  if(r.error)throw new MembershipError(r.error.message?.startsWith('mfa_')?'mfa':r.status===401?'auth':r.status===409?'conflict':r.status===404?'denied':'unknown');return r.data;
 }
 return {
  async list(actor:string,org:string,after:string|null=null):Promise<OrganizationMember[]>{
   const r=await rpc(actor,'list_organization_members',{target_organization_id:org,after_id:after});
   if(!Array.isArray(r)||r.some(m=>!m||!Number.isSafeInteger(m.revision)||typeof m.can_manage!=='boolean'||typeof m.name!=='string'||!['active','suspended','invited'].includes(m.status)))throw new MembershipError('unknown');return r;
  },
  async save(a:MembershipAttempt){
   const r=await rpc(a.actor,'set_organization_member_status',{target_organization_id:a.organization,target_membership_id:a.member,expected_revision:a.revision,request_id:a.request,next_status:a.status,confirmed:a.confirmed,reason:a.reason});
   if(r?.confirmed!==true||r.request_id!==a.request||r.organization_id!==a.organization||r.membership_id!==a.member||r.status!==a.status||!Number.isSafeInteger(r.revision)||typeof r.changed!=='boolean'||r.revision!==a.revision+(r.changed?1:0))throw new MembershipError('unknown');return r as {notification_id:string|null};
  },
  async notify(actor:string,org:string,event:string){
   const r=await fetch('/api/platform/local-membership-notifications',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${await token(actor)}`},body:JSON.stringify({organizationId:org,eventId:event})});
   if(!r.ok)throw new MembershipError(r.status===401?'auth':'unknown');
   const data=await r.json();if(!['delivered','failed','sending'].includes(data.state))throw new MembershipError('unknown');return data.state as string;
  }
 };
}
