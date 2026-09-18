import type {SupabaseClient} from '@supabase/supabase-js';
import {parseInvitationId} from './contracts.ts';
import {ScheduleRepositoryError} from './schedule-repository.ts';
import {createScheduleLibraryRepository} from './schedule-library.ts';
import type {SnapshotPolicy} from './schedule-snapshots.ts';
import {journalWrite,journalEntries,journalClear,type RequestJournalStorage} from './request-journal.ts';
export type SnapshotExtraAttempt={kind:'policy';actor:string;organization:string;request:string;version:number;retention:number|null;trash:'editor'|'organizer'|'admin'}|{kind:'copy';actor:string;organization:string;request:string;schedule:string;snapshot:string;version:number;id:string;sourceVersion:number;policy:string;production:string;day:string|null;phase:string|null;name:string;slug:string};
export interface RetainedSnapshotExtra {attempt:SnapshotExtraAttempt;started:boolean}
function invalid():never{throw new ScheduleRepositoryError('invalid');}
export function captureSnapshotExtra(value:SnapshotExtraAttempt):SnapshotExtraAttempt{
 const a=structuredClone(value);[a.actor,a.organization,a.request].forEach(parseInvitationId);
 if(!Number.isSafeInteger(a.version)||a.version<0||a.version>=Number.MAX_SAFE_INTEGER)invalid();
 if(a.kind==='policy'){if(!['editor','organizer','admin'].includes(a.trash)||(a.retention!==null&&(!Number.isInteger(a.retention)||a.retention<1||a.retention>36500)))invalid();}
 else if(a.kind==='copy'){[a.schedule,a.snapshot,a.id,a.production].forEach(parseInvitationId);if(a.day)parseInvitationId(a.day);if(a.phase)parseInvitationId(a.phase);if(a.version<1||!Number.isSafeInteger(a.sourceVersion)||a.sourceVersion<1||!a.policy||!a.name.trim()||!a.slug.trim())invalid();}
 else invalid();return Object.freeze(a);
}
const key=(actor:string,org:string)=>`roseland-snapshot-extra:${actor}:${org}`;
export function retainSnapshotExtra(s:RequestJournalStorage,v:RetainedSnapshotExtra){captureSnapshotExtra(v.attempt);journalWrite(s,key(v.attempt.actor,v.attempt.organization),v.attempt.request,JSON.stringify(v));}
export function readSnapshotExtra(s:RequestJournalStorage,actor:string,org:string):RetainedSnapshotExtra|null{const v=journalEntries(s,key(actor,org))[0];if(!v)return null;const parsed=JSON.parse(v.raw) as RetainedSnapshotExtra;if(parsed.attempt?.actor!==actor||parsed.attempt.organization!==org||typeof parsed.started!=='boolean')invalid();return{attempt:captureSnapshotExtra(parsed.attempt),started:parsed.started};}
export function clearSnapshotExtra(s:RequestJournalStorage,a:SnapshotExtraAttempt){journalClear(s,key(a.actor,a.organization),a.request,raw=>{const p=JSON.parse(raw);return p.attempt?.request===a.request&&p.attempt.actor===a.actor&&p.attempt.organization===a.organization;});}
export function createSnapshotExtras(client:SupabaseClient){const {rpc,destinations}=createScheduleLibraryRepository(client);return{
 destinations,
 async policy(actor:string,org:string):Promise<SnapshotPolicy>{const p=await rpc(actor,'read_snapshot_policy',{target_organization_id:org});if(p?.organization_id!==org||!Number.isSafeInteger(p.version)||p.version<0||typeof p.can_manage!=='boolean'||!['editor','organizer','admin'].includes(p.trash_min_role)||(p.retention_days!==null&&(!Number.isInteger(p.retention_days)||p.retention_days<1)))invalid();return p;},
 async reviewCopy(actor:string,snapshot:string,production:string){const r=await rpc(actor,'review_snapshot_copy',{target_snapshot_id:snapshot,target_production_id:production});if(r?.snapshot_id!==snapshot||!Number.isSafeInteger(r.snapshot_version)||r.snapshot_version<1||!r.schedule?.id||!Number.isSafeInteger(r.schedule.document_version)||!r.policy)invalid();return r as {snapshot_id:string;snapshot_version:number;schedule:{id:string;document_version:number};policy:string};},
 async send(a:SnapshotExtraAttempt){const r=a.kind==='policy'?await rpc(a.actor,'save_snapshot_policy',{target_organization_id:a.organization,request_id:a.request,expected_version:a.version,retention_days:a.retention,trash_min_role:a.trash}):await rpc(a.actor,'copy_schedule_snapshot',{request_id:a.request,target_snapshot_id:a.snapshot,expected_version:a.version,target_schedule_id:a.id,source_version:a.sourceVersion,source_policy:a.policy,target_production_id:a.production,target_day_id:a.day,target_phase_id:a.phase,next_display_name:a.name,next_slug:a.slug});
 if(r?.request_id!==a.request||(a.kind==='policy'?r.confirmed!==true||r.organization_id!==a.organization||r.version!==a.version+1:r.id!==a.id||r.snapshot_id!==a.snapshot||r.status!=='confirmed'||r.version!==1))invalid();return r;
 },
 async probe(a:SnapshotExtraAttempt){if(a.kind==='policy')return null;const r=await rpc(a.actor,'check_snapshot_copy',{request_id:a.request,target_schedule_id:a.id});if(r?.confirmed===false)return null;if(r?.request_id!==a.request||r.id!==a.id||r.snapshot_id!==a.snapshot||r.status!=='confirmed'||r.version!==1)invalid();return r;}
};}
