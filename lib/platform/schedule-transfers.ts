import type { SupabaseClient } from '@supabase/supabase-js';
import {createScheduleLibraryRepository} from './schedule-library.ts';
import {parseInvitationId} from './contracts.ts';
import {ScheduleRepositoryError,type StoredSchedule} from './schedule-repository.ts';
export interface TransferDestination {id:string;name:string;direct:boolean}
export interface TransferRequest {id:string;schedule_id:string;source:string;destination:string;destination_id:string;status:string;expires_at:string;outgoing:boolean;reviewable:boolean}
export interface TransferReview {schedule:StoredSchedule;policy:string;destination_id?:string;id?:string}
export interface TransferAttempt {actor:string;organization:string;kind:'copy'|'move'|'request'|'approve';id:string;source:string;destination:string;day:string|null;phase:string|null;version:number;policy:string;name:string;slug:string;document:StoredSchedule['document']}
export function captureTransfer(value:TransferAttempt):TransferAttempt {
 const freeze=(v:unknown)=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}};
 const copy=structuredClone(value);freeze(copy);return copy;
}
export function createTransferRepository(client:SupabaseClient){
 const {rpc}=createScheduleLibraryRepository(client);
 function review(value:unknown):TransferReview{const v=value as TransferReview;if(!v?.schedule||!v.policy||typeof v.policy!=='string'||!Number.isSafeInteger(v.schedule.document_version)||!v.schedule.document?.meta||!Array.isArray(v.schedule.document.rows))throw new ScheduleRepositoryError('failed');parseInvitationId(v.schedule.id);return v;}
 return {rpc,
  async destinations(actor:string,id:string):Promise<TransferDestination[]>{const v=await rpc(actor,'schedule_transfer_destinations',{target_schedule_id:id});if(!Array.isArray(v)||v.some(p=>!p||typeof p.name!=='string'||typeof p.direct!=='boolean'||!parseInvitationId(p.id)))throw new ScheduleRepositoryError('failed');return v;},
  async review(actor:string,id:string,destination:string,copy=false){return review(await rpc(actor,copy?'review_schedule_copy':'review_schedule_transfer',{target_schedule_id:id,target_production_id:destination}));},
  async preview(actor:string,id:string){return review(await rpc(actor,'preview_schedule_transfer',{request_id:id}));},
  async inbox(actor:string,organization:string):Promise<TransferRequest[]>{const v=await rpc(actor,'list_schedule_transfers',{target_organization_id:organization});if(!Array.isArray(v))throw new ScheduleRepositoryError('failed');return v;},
  async close(actor:string,id:string,decision:'cancelled'|'declined'){await rpc(actor,'close_schedule_transfer',{request_id:id,decision});},
  async send(a:TransferAttempt){
   const shared={target_schedule_id:a.source,target_production_id:a.destination,expected_version:a.version,expected_policy:a.policy};
   const result=a.kind==='copy'?await rpc(a.actor,'copy_schedule_to_production',{target_schedule_id:a.id,source_schedule_id:a.source,source_version:a.version,source_policy:a.policy,target_production_id:a.destination,target_day_id:a.day,target_phase_id:a.phase,next_display_name:a.name,next_slug:a.slug,next_document:a.document,schema_version:1}):a.kind==='request'?await rpc(a.actor,'request_schedule_transfer',{...shared,request_id:a.id}):await rpc(a.actor,'move_schedule',{...shared,request_id:a.id,target_day_id:a.day,target_phase_id:a.phase,approve_request:a.kind==='approve'});
   if(!result||result.id!==a.id||(a.kind==='copy'?result.status!=='confirmed'||result.version!==1:a.kind==='request'?!['pending','approved','cancelled','declined'].includes(result.status):result.status!=='approved'||result.schedule_id!==a.source||result.version!==a.version+1))throw new ScheduleRepositoryError('failed');
   return result as {id:string;status:string;version?:number};
  }
 };
}
