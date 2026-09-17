import {journalEntries,journalWrite,journalClear,type RequestJournalStorage} from './request-journal.ts';
import type {SupabaseClient} from '@supabase/supabase-js';
import type {BrowserTemplate} from './browser-templates.ts';
import type {ScheduleRow} from '../types.ts';
import {createScheduleLibraryRepository} from './schedule-library.ts';
import {parseInvitationId} from './contracts.ts';
import {ScheduleRepositoryError} from './schedule-repository.ts';
import {validateFileDocument} from './schedule-files.ts';
export interface TemplateUse {id:string;version:number;policy:string}
export interface TemplateRecord {id:string;organization_id:string;production_id:string;production_name?:string;name:string;version:number;deleted_at:string|null;published_at:string|null;can_manage:boolean;can_trash:boolean;can_publish:boolean;rows?:ScheduleRow[];row_count?:number}
export interface TemplateProduction {id:string;name:string;can_manage:boolean}
export interface TemplateApplyReview {template:TemplateRecord & {rows:ScheduleRow[]};policy:string;target_id:string;target_version:number}
export type TemplateOperation='import'|'create'|'replace'|'rename'|'trash'|'restore'|'publish'|'unpublish';
export interface TemplateAttempt {browserSource?:BrowserTemplate;ownershipConfirmed?:boolean;previewName?:string;previewRows?:ScheduleRow[];actor:string;organization:string;production:string;id:string;request:string;version:number;operation:TemplateOperation;name:string|null;rows:ScheduleRow[]|null;source:string|null;sourceVersion:number|null}
export interface TemplateReceipt {request_id:string;id:string;version:number;operation:TemplateOperation;confirmed:true}
function invalid():never{throw new ScheduleRepositoryError('failed');}
export function validateTemplateUse(v:TemplateUse){parseInvitationId(v.id);if(!Number.isSafeInteger(v.version)||v.version<1||typeof v.policy!=='string'||!v.policy)invalid();}
function record(value:unknown):TemplateRecord{const v=value as TemplateRecord;if(!v)invalid();[v.id,v.organization_id,v.production_id].forEach(parseInvitationId);if(typeof v.name!=='string'||!Number.isSafeInteger(v.version)||v.version<1||typeof v.can_manage!=='boolean'||typeof v.can_trash!=='boolean'||typeof v.can_publish!=='boolean'||![v.deleted_at,v.published_at].every(x=>x===null||typeof x==='string'&&Number.isFinite(Date.parse(x))))invalid();if(v.rows)validateFileDocument({meta:{},rows:v.rows});return v;}
export function templateDraftRows(rows:ScheduleRow[]){validateFileDocument({meta:{},rows});return structuredClone(rows.filter(row=>!row.sunLocked));}
export function captureTemplateAttempt(value:TemplateAttempt):TemplateAttempt{
 const v=structuredClone(value);[v.actor,v.organization,v.production,v.id,v.request].forEach(parseInvitationId);
 if(!['import','create','replace','rename','trash','restore','publish','unpublish'].includes(v.operation)||!Number.isSafeInteger(v.version)||v.version<0||(['create','import'].includes(v.operation)?v.version!==0:v.version===0))invalid();
 if(['import','create','replace','rename','restore'].includes(v.operation)&&(!v.name||!v.name.trim()||v.name.trim().length>150||/[\x00-\x1f\x7f]/.test(v.name)))throw Error('Choose a template name of 1 to 150 characters.');
 if(['create','replace'].includes(v.operation)){if(!v.rows||!v.source||!Number.isSafeInteger(v.sourceVersion)||v.sourceVersion!<1)invalid();parseInvitationId(v.source);validateFileDocument({meta:{},rows:v.rows});}
 if(v.operation==='import'){if(!v.browserSource||v.ownershipConfirmed!==true||!Number.isSafeInteger(v.browserSource.savedAt)||v.browserSource.savedAt<0||typeof v.browserSource.name!=='string'||!v.browserSource.name.trim())invalid();validateFileDocument({meta:{},rows:v.browserSource.rows});}
 if(v.previewRows)validateFileDocument({meta:{},rows:v.previewRows});
 const freeze=(x:unknown)=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}};freeze(v);return v;
}
export function templateReceipt(value:unknown,a:TemplateAttempt):TemplateReceipt{const v=value as TemplateReceipt;if(!v||v.confirmed!==true||v.request_id!==a.request||v.id!==a.id||v.operation!==a.operation||v.version!==a.version+1)invalid();return v;}
export function createTemplateRepository(client:SupabaseClient){
 const {rpc}=createScheduleLibraryRepository(client);
 return {
  async productions(actor:string,organization:string):Promise<TemplateProduction[]>{const list=await rpc(actor,'schedule_template_productions',{target_organization_id:parseInvitationId(organization)});if(!Array.isArray(list))invalid();for(const p of list){parseInvitationId(p.id);if(typeof p.name!=='string'||typeof p.can_manage!=='boolean')invalid();}return list;},
  async inventory(actor:string,organization:string,production:string,trash=false,shared=false){const rows:TemplateRecord[]=[];let after:string|null=null;
   for(;;){const page=await rpc(actor,shared?'list_organization_templates':'list_schedule_templates',shared?{target_organization_id:parseInvitationId(organization),after_id:after}:{target_production_id:parseInvitationId(production),include_deleted:trash,after_id:after});if(!Array.isArray(page)||page.length>100)invalid();for(const item of page){const v=record(item);if(v.organization_id!==organization||(!shared&&v.production_id!==production)||after&&v.id<=after||!Number.isInteger(v.row_count)||v.row_count!<0)invalid();after=v.id;rows.push(v);}if(rows.length>10000)throw Error('More than 10,000 templates are available. No partial list was shown.');if(page.length<100)return rows;}
  },
  async read(actor:string,id:string,organization:string){const v=record(await rpc(actor,'read_schedule_template',{target_template_id:parseInvitationId(id)}));if(v.id!==id||v.organization_id!==organization||!Array.isArray(v.rows))invalid();return v as TemplateRecord&{rows:ScheduleRow[]};},
  async reviewApply(actor:string,id:string,target:string,organization:string):Promise<TemplateApplyReview>{const v=await rpc(actor,'review_schedule_template_apply',{target_template_id:parseInvitationId(id),target_schedule_id:parseInvitationId(target)});const t=record(v?.template);if(t.id!==id||t.organization_id!==organization||!Array.isArray(t.rows)||v.target_id!==target||!Number.isSafeInteger(v.target_version)||v.target_version<1||typeof v.policy!=='string'||!v.policy)invalid();return v;},
  async send(a:TemplateAttempt){if(a.operation==='import')return templateReceipt(await rpc(a.actor,'import_browser_schedule_template',{request_id:a.request,target_template_id:a.id,target_production_id:a.production,next_name:a.name,source_name:a.browserSource!.name,source_rows:a.browserSource!.rows,source_saved_at:a.browserSource!.savedAt,ownership_confirmed:a.ownershipConfirmed}),a);const publication=['publish','unpublish'].includes(a.operation);return templateReceipt(await rpc(a.actor,publication?'publish_schedule_template':'mutate_schedule_template',publication?{request_id:a.request,target_template_id:a.id,target_production_id:a.production,expected_version:a.version,publish:a.operation==='publish'}:{request_id:a.request,target_template_id:a.id,target_production_id:a.production,expected_version:a.version,operation:a.operation,next_name:a.name,next_rows:a.rows,source_schedule_id:a.source,source_version:a.sourceVersion}),a);},
  async probe(a:TemplateAttempt){const v=await rpc(a.actor,'check_schedule_template_request',{request_id:a.request,target_production_id:a.production});if(v?.confirmed===false)return null;return templateReceipt(v,a);},
 };
}
export type TemplateRequestStorage = RequestJournalStorage;
export interface RetainedTemplateRequest {attempt:TemplateAttempt;started:boolean}
const requestKey=(actor:string,org:string)=>`roseland-template-request:${actor}:${org}`;
export function retainTemplateRequest(storage:TemplateRequestStorage,value:RetainedTemplateRequest){const a=value.attempt;journalWrite(storage,requestKey(a.actor,a.organization),a.request,JSON.stringify(value),raw=>{const v=JSON.parse(raw);return v.attempt?.request===a.request&&v.attempt.actor===a.actor&&v.attempt.organization===a.organization;});}
export function readTemplateRequest(storage:TemplateRequestStorage,actor:string,org:string):RetainedTemplateRequest|null{const entry=journalEntries(storage,requestKey(actor,org))[0];if(!entry)return null;const value=JSON.parse(entry.raw) as RetainedTemplateRequest;if(value.attempt?.actor!==actor||value.attempt.organization!==org||typeof value.started!=='boolean')throw Error('Retained template request does not match this account and organization.');return {attempt:captureTemplateAttempt(value.attempt),started:value.started};}
export function clearTemplateRequest(storage:TemplateRequestStorage,a:TemplateAttempt){journalClear(storage,requestKey(a.actor,a.organization),a.request,raw=>{const v=JSON.parse(raw);return v.attempt?.request===a.request&&v.attempt.actor===a.actor&&v.attempt.organization===a.organization;});}
