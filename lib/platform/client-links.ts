import type {SupabaseClient} from '@supabase/supabase-js';
import {parseInvitationId} from './contracts.ts';
export type ClientLink={id:string;kind:'client'|'legacy';created_at:string;expires_at:string|null;revoked_at:string|null;can_revoke:boolean};
export type LinkReview={schedule_id:string;version:number;can_create:boolean;links:ClientLink[]};
export type ClientLinkAttempt=Readonly<{actor:string;schedule:string;request:string;version:number;token:string;hash:string}>;
export async function captureClientLink(actor:string,schedule:string,version:number):Promise<ClientLinkAttempt>{
 [actor,schedule].forEach(parseInvitationId);if(!Number.isSafeInteger(version)||version<1)throw Error('Review the saved schedule.');
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
 return Object.freeze({actor,schedule,version,request:crypto.randomUUID(),token,hash});
}
export function createClientLinksRepository(client:SupabaseClient){
 async function rpc(actor:string,name:string,args:Record<string,unknown>){const session=(await client.auth.getSession()).data.session;if(session?.user.id!==actor)throw Error('Sign in with the same account. Your pending link is retained.');const r=await client.rpc(name,args).setHeader('Authorization',`Bearer ${session.access_token}`);if(r.error)throw Error(r.status===409?'Saved schedule changed. Refresh and review before creating a new link.':r.status===423?'This organization is read-only.':r.status===429?'Please try again later.':'Sharing is unavailable. Refresh permissions or sign in again.');return r.data;}
 return {
 async read(actor:string,schedule:string,after:string|null=null):Promise<LinkReview>{const r=await rpc(actor,'list_schedule_client_links',{target_schedule_id:schedule,after_id:after});if(r?.schedule_id!==schedule||!Number.isSafeInteger(r.version)||typeof r.can_create!=='boolean'||!Array.isArray(r.links))throw Error('Sharing could not be verified.');return r;},
 async create(a:ClientLinkAttempt){const r=await rpc(a.actor,'create_schedule_client_link',{target_schedule_id:a.schedule,request_id:a.request,token_hash:a.hash,expected_version:a.version});if(r?.id!==a.request||typeof r.expires_at!=='string'||typeof r.revoked!=='boolean')throw Error('Link result is unknown. Retry the same request.');return r as {id:string;expires_at:string;revoked:boolean};},
 async revoke(actor:string,schedule:string,link:ClientLink){const r=await rpc(actor,'revoke_schedule_client_link',{target_schedule_id:schedule,target_link_id:link.id,link_kind:link.kind});if(r?.id!==link.id||r.revoked!==true)throw Error('Revocation is unconfirmed. Retry.');}
 };
}
