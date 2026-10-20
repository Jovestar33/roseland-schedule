import type {Session} from '@supabase/supabase-js';
import {InvitationError} from './invitation-controller.ts';
export interface PlatformOrganization {id:string;name:string;slug:string;timezone:string;created_at:string;status:'active'|'pending_deletion'|'awaiting_deletion'|'deleted';recovery_deadline:string|null;can_open:boolean}
export interface ConsoleResult {authorized:boolean;actorId:string;organizations?:PlatformOrganization[]}
export async function readPlatformConsole(session:Session,view:'access'|'organizations',options:{search?:string;after?:string}={},request:typeof fetch=fetch):Promise<ConsoleResult>{
 const params=new URLSearchParams({view});if(options.search)params.set('search',options.search);if(options.after)params.set('after',options.after);
 let response:Response;
 try{response=await request('/api/platform/console?'+params,{headers:{authorization:`Bearer ${session.access_token}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new InvitationError('unknown');}
 const body=await response.json().catch(()=>null);
 if(!response.ok)throw new InvitationError(response.status===401?'auth':response.status===403&&['Recent authentication is required','Stronger authentication is required'].includes(body?.error)?'mfa':response.status===403?'denied':'unknown');
 const result=body?.result;
 if(!result||result.actorId!==session.user.id||typeof result.authorized!=='boolean')throw new InvitationError('unknown');
 if(view==='organizations'&&(!result.authorized||!Array.isArray(result.organizations)||result.organizations.length>26||result.organizations.some((o:PlatformOrganization)=>!o||typeof o.id!=='string'||typeof o.name!=='string'||typeof o.slug!=='string'||typeof o.timezone!=='string'||typeof o.created_at!=='string'||typeof o.can_open!=='boolean'||!['active','pending_deletion','awaiting_deletion','deleted'].includes(o.status))))throw new InvitationError('unknown');
 return result;
}
