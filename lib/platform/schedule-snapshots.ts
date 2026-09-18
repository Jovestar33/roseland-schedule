import type {SupabaseClient} from '@supabase/supabase-js';
import type {StoredSchedule} from './schedule-repository.ts';
import {ScheduleRepositoryError} from './schedule-repository.ts';
import {parseInvitationId} from './contracts.ts';
import {validateFileDocument} from './schedule-files.ts';
import {createScheduleLibraryRepository} from './schedule-library.ts';
import {validateTemplateUse,type TemplateUse} from './schedule-templates.ts';
import {journalEntries,journalWrite,journalClear,type RequestJournalStorage} from './request-journal.ts';

export const SNAPSHOT_INTERVAL_MS=5*60*1000;
export type SnapshotKind='named'|'automatic'|'imported';
export type SnapshotOperation='capture'|'name'|'trash'|'restore_trash'|'purge'|'restore_content';
export interface ScheduleSnapshot {id:string;organization_id:string;schedule_id:string;name:string|null;kind:SnapshotKind;version:number;captured_at:string;deleted_at:string|null;row_count:number;can_name:boolean;can_trash:boolean;can_purge:boolean;document?:StoredSchedule['document'];original_id?:string|null;original_order?:number|null}
export interface SnapshotAttempt {actor:string;organization:string;schedule:string;id:string;request:string;version:number;operation:SnapshotOperation;name:string|null;document:StoredSchedule['document']|null;sourceVersion:number|null;automatic:boolean;templateUses:TemplateUse[];confirmedPurge:boolean;previewLabel?:string}
export interface SnapshotReceipt {confirmed:true;request_id:string;id:string;operation:SnapshotOperation;version:number;schedule_version?:number}
export interface SnapshotPolicy {organization_id:string;version:number;retention_days:number|null;trash_min_role:'editor'|'organizer'|'admin';can_manage:boolean}
function invalid():never{throw new ScheduleRepositoryError('invalid');}
export function captureSnapshotAttempt(value:SnapshotAttempt):SnapshotAttempt{
 const v=structuredClone(value);if(v.previewLabel!==undefined&&typeof v.previewLabel!=='string')invalid();[v.actor,v.organization,v.schedule,v.id,v.request].forEach(parseInvitationId);
 if(!['capture','name','trash','restore_trash','purge','restore_content'].includes(v.operation)||!Number.isSafeInteger(v.version)||v.version<0||v.version>=Number.MAX_SAFE_INTEGER||(v.operation==='capture'?v.version!==0:v.version===0)||typeof v.automatic!=='boolean'||typeof v.confirmedPurge!=='boolean')invalid();
 if((v.operation==='capture'&&!v.automatic)||v.operation==='name'){
  if(!v.name?.trim()||v.name.trim().length>150||/[\x00-\x1f\x7f]/.test(v.name))throw Error('Choose a snapshot name of 1 to 150 characters.');v.name=v.name.trim();
 }
 if(v.operation==='capture'&&v.automatic&&v.name!==null)invalid();
 if(v.operation==='capture'){validateFileDocument(v.document);if(!Number.isSafeInteger(v.sourceVersion)||(v.sourceVersion!<1||v.sourceVersion!>=Number.MAX_SAFE_INTEGER))invalid();}
 if(v.operation==='restore_content'&&(!Number.isSafeInteger(v.sourceVersion)||(v.sourceVersion!<1||v.sourceVersion!>=Number.MAX_SAFE_INTEGER)))invalid();
 if(v.operation==='purge'&&!v.confirmedPurge)throw Error('Review and confirm permanent deletion of this trashed snapshot.');
 if(!Array.isArray(v.templateUses)||v.templateUses.length>100)invalid();v.templateUses.forEach(validateTemplateUse);
 const freeze=(x:unknown)=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}};freeze(v);return v;
}
function snapshot(value:unknown):ScheduleSnapshot{
 const v=value as ScheduleSnapshot;if(!v)invalid();[v.id,v.organization_id,v.schedule_id].forEach(parseInvitationId);
 if(!['named','automatic','imported'].includes(v.kind)||!(v.name===null||typeof v.name==='string')||!Number.isSafeInteger(v.version)||v.version<1||!Number.isInteger(v.row_count)||v.row_count<0||!Number.isFinite(Date.parse(v.captured_at))||!(v.deleted_at===null||Number.isFinite(Date.parse(v.deleted_at)))||![v.can_name,v.can_trash,v.can_purge].every(x=>typeof x==='boolean'))invalid();
 if(v.document)validateFileDocument(v.document);return v;
}
export function snapshotReceipt(value:unknown,a:SnapshotAttempt):SnapshotReceipt{
 const v=value as SnapshotReceipt;if(!v||v.confirmed!==true||v.request_id!==a.request||v.id!==a.id||v.operation!==a.operation||v.version!==a.version+1)invalid();
 if(a.operation==='restore_content'&&v.schedule_version!==a.sourceVersion!+1)invalid();return v;
}
export function createSnapshotRepository(client:SupabaseClient){const {rpc}=createScheduleLibraryRepository(client);return{
 async list(actor:string,organization:string,schedule:string,trash=false){const result:ScheduleSnapshot[]=[];let after:string|null=null;
  for(;;){const page=await rpc(actor,'list_schedule_snapshots',{target_schedule_id:parseInvitationId(schedule),include_deleted:trash,after_id:after});if(!Array.isArray(page)||page.length>100)invalid();
   for(const entry of page){const s=snapshot(entry);if(s.organization_id!==organization||s.schedule_id!==schedule||(after&&s.id<=after))invalid();result.push(s);after=s.id;}
   if(page.length<100)return result;
  }
 },
 async read(actor:string,organization:string,schedule:string,id:string){const s=snapshot(await rpc(actor,'read_schedule_snapshot',{target_snapshot_id:parseInvitationId(id)}));if(s.organization_id!==organization||s.schedule_id!==schedule||s.id!==id||!s.document)invalid();return s;},
 async send(a:SnapshotAttempt){return snapshotReceipt(await rpc(a.actor,'mutate_schedule_snapshot',{request_id:a.request,target_snapshot_id:a.id,target_schedule_id:a.schedule,expected_version:a.version,operation:a.operation,next_name:a.name,next_document:a.document,source_version:a.sourceVersion,automatic:a.automatic,template_uses:a.templateUses,confirmed_purge:a.confirmedPurge}),a);},
 async probe(a:SnapshotAttempt){const r=await rpc(a.actor,'check_schedule_snapshot_request',{request_id:a.request,target_schedule_id:a.schedule});return r?.confirmed===false?null:snapshotReceipt(r,a);},
 async expire(actor:string,schedule:string){return rpc(actor,'expire_schedule_snapshots',{target_schedule_id:parseInvitationId(schedule)});},
};}
export interface RetainedSnapshotRequest {attempt:SnapshotAttempt;started:boolean}
const key=(actor:string,org:string,schedule:string)=>`roseland-snapshot-request:${actor}:${org}:${schedule}`;
export function retainSnapshotRequest(storage:RequestJournalStorage,value:RetainedSnapshotRequest){const a=value.attempt;journalWrite(storage,key(a.actor,a.organization,a.schedule),a.request,JSON.stringify(value),raw=>{const v=JSON.parse(raw);return v.attempt?.request===a.request&&v.attempt.actor===a.actor&&v.attempt.organization===a.organization&&v.attempt.schedule===a.schedule;});}
export function readSnapshotRequest(storage:RequestJournalStorage,actor:string,org:string,schedule:string):RetainedSnapshotRequest|null{const entry=journalEntries(storage,key(actor,org,schedule))[0];if(!entry)return null;const v=JSON.parse(entry.raw) as RetainedSnapshotRequest;if(v.attempt?.actor!==actor||v.attempt.organization!==org||v.attempt.schedule!==schedule||typeof v.started!=='boolean')invalid();return{attempt:captureSnapshotAttempt(v.attempt),started:v.started};}
export function clearSnapshotRequest(storage:RequestJournalStorage,a:SnapshotAttempt){journalClear(storage,key(a.actor,a.organization,a.schedule),a.request,raw=>{const v=JSON.parse(raw);return v.attempt?.request===a.request&&v.attempt.actor===a.actor&&v.attempt.schedule===a.schedule;});}

/** Only the active actor/document owns this timer. Capturing does not clean a draft. */
export class SnapshotTimer {
 private identity:string|null=null;private startedAt=0;
 bind(identity:string|null,now:number){if(identity!==this.identity){this.identity=identity;this.startedAt=now;}}
 due(identity:string,now:number,dirty:boolean,enabled:boolean){return enabled&&dirty&&identity===this.identity&&now-this.startedAt>=SNAPSHOT_INTERVAL_MS;}
 captured(identity:string,now:number){if(identity===this.identity)this.startedAt=now;}
}

export interface SnapshotRestoreContext {actor:string;organization:string;id:string;sourceVersion:number;documentSession:number;editRevision:number;navigation:number}
/** A saved restore may replace the visible draft only if it is still the reviewed draft. */
export function snapshotRestoreMatches(review:SnapshotRestoreContext,current:SnapshotRestoreContext){return review.actor===current.actor&&review.organization===current.organization&&review.id===current.id&&review.sourceVersion===current.sourceVersion&&review.documentSession===current.documentSession&&review.editRevision===current.editRevision&&review.navigation===current.navigation;}
