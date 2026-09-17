import {validateTemplateUse,type TemplateUse} from './schedule-templates.ts';
import {sameJson} from './schedule-lifecycle-controller.ts';
import {validateFileDocument} from './schedule-files.ts';
import type {StoredSchedule} from './schedule-repository.ts';
export interface DraftBackup {templateUses?:TemplateUse[];actor:string;organization:string;source:string;before:StoredSchedule;document:StoredSchedule['document'];undo:unknown[];redo:unknown[];savedAt:number}
export interface DraftStorage {setItem(key:string,value:string):void;getItem(key:string):string|null}
function key(actor:string,org:string,id:string){return 'roseland-source-draft:'+actor+':'+org+':'+id;}
/** Navigation is permitted only after exact durable readback succeeds. */
export function retainSourceDraft(storage:DraftStorage,value:DraftBackup){
 validateFileDocument(value.document);if(value.before.id!==value.source||value.before.organization_id!==value.organization)throw Error('Draft identity changed.');
 const encoded=JSON.stringify(value);storage.setItem(key(value.actor,value.organization,value.source),encoded);
 if(storage.getItem(key(value.actor,value.organization,value.source))!==encoded)throw Error('Source draft could not be verified. The copy is saved; keep editing here.');
}
export function readSourceDraft(storage:DraftStorage,actor:string,organization:string,source:string):DraftBackup|null{
 const raw=storage.getItem(key(actor,organization,source));if(!raw)return null;const v=JSON.parse(raw) as DraftBackup;
 if(v.actor!==actor||v.organization!==organization||v.source!==source||v.before?.id!==source||v.before.organization_id!==organization||!Array.isArray(v.undo)||!Array.isArray(v.redo)||!Number.isSafeInteger(v.before.document_version))throw Error('Stored draft is not valid for this account and schedule.');
 validateFileDocument(v.document);for(const entry of [...v.undo,...v.redo]){const snap=entry as {rows:unknown;meta:unknown;templateUses?:TemplateUse[]};validateFileDocument({rows:snap.rows,meta:snap.meta});for(const use of snap.templateUses??[])validateTemplateUse(use);}
 for(const use of v.templateUses??[])validateTemplateUse(use);
 if(!sameJson(JSON.parse(raw),v))throw Error('Draft verification failed.');return v;
}
