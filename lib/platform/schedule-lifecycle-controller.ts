import { ScheduleRepositoryError, type ScheduleLifecycle, type StoredSchedule } from './schedule-repository.ts';
import { parseInvitationId } from './contracts.ts';
export type LifecycleKind = 'create' | ScheduleLifecycle;
export interface ScheduleHistory {
  schedule_id:string; organization_id:string; production_id:string; version:number;
  document_schema_version:number; document:StoredSchedule['document']; metadata:Record<string,unknown>|null;
  created_at:string; created_by:string|null; checksum:string; metadata_checksum:string|null;
}
export interface LifecycleAttempt {
  readonly actor:string; readonly organization:string; readonly id:string; readonly kind:LifecycleKind;
  readonly expectedVersion:number; readonly dayId:string|null; readonly productionId?:string; readonly phaseId?:string|null; readonly name:string; readonly slug:string;
  readonly before:StoredSchedule|null; readonly payload:Readonly<Record<string,unknown>>;
  readonly document:StoredSchedule['document'];
}
export interface LifecycleResult { state:'matched'|'retryable'|'different'|'unavailable'; current:StoredSchedule|null; matchedVersion:number|null }
export interface LifecycleTransport { send(attempt:LifecycleAttempt):Promise<StoredSchedule>; probe(attempt:LifecycleAttempt):Promise<LifecycleResult> }
export function sameJson(a:unknown,b:unknown):boolean {
  const sorted=(v:unknown):unknown=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,sorted(x)])):v;
  return JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
}
function freeze<T>(value:T):T { if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value; }
function version(value:number){if(!Number.isSafeInteger(value)||value<1||value>=Number.MAX_SAFE_INTEGER)throw new ScheduleRepositoryError('invalid');}
function namePair(name:string,slug:string){if(!name||name!==name.trim()||name.length>160||slug.length>160||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new ScheduleRepositoryError('invalid');}
/** The saved identity/version is the retry boundary. There is no new idempotency ledger. */
export class ScheduleLifecycleController {
  actor:string|null=null; attempt:LifecycleAttempt|null=null; result:LifecycleResult|null=null;
  phase:'review'|'pending'|'uncertain'|'blocked'|'conflict'|'success'='review';
  failure:ScheduleRepositoryError['kind']|null=null; busy=false; private generation=0;
  bind(actor:string|null){if(actor!==this.actor){this.clear();this.actor=actor;}}
  clear(){this.generation++;this.attempt=null;this.result=null;this.phase='review';this.failure=null;this.busy=false;}
  prepareCreate(organization:string,id:string,dayId:string|null,name:string,slug:string,document:StoredSchedule['document']={meta:{},rows:[]} as unknown as StoredSchedule['document'],placement?:{productionId:string;phaseId:string|null}){
    if(!this.actor||this.attempt||(!dayId&&!placement))throw new ScheduleRepositoryError('invalid');namePair(name,slug);
    this.attempt=freeze({actor:this.actor,organization:parseInvitationId(organization),id:parseInvitationId(id),dayId:dayId===null?null:parseInvitationId(dayId),...(placement?{productionId:parseInvitationId(placement.productionId),phaseId:placement.phaseId===null?null:parseInvitationId(placement.phaseId)}:{}),kind:'create',expectedVersion:0,name,slug,before:null,payload:{},document:structuredClone(document)});
  }
  prepare(before:StoredSchedule,kind:ScheduleLifecycle,payload:Record<string,unknown>={},source?:ScheduleHistory){
    if(!this.actor||this.attempt)throw new ScheduleRepositoryError('invalid');version(before.document_version);
    if(!['rename','archive','unarchive','delete','restore','restore_version'].includes(kind))throw new ScheduleRepositoryError('invalid');
    if((kind==='restore')!==!!before.deleted_at)throw new ScheduleRepositoryError('invalid');
    if(kind==='rename'){if(Object.keys(payload).sort().join()!=='display_name,slug'||typeof payload.display_name!=='string'||typeof payload.slug!=='string')throw new ScheduleRepositoryError('invalid');namePair(payload.display_name,payload.slug);}
    else if(kind==='restore_version'){if(Object.keys(payload).join()!=='version'||!source||source.schedule_id!==before.id||source.organization_id!==before.organization_id||source.version!==payload.version)throw new ScheduleRepositoryError('invalid');version(source.version);}
    else if(Object.keys(payload).length)throw new ScheduleRepositoryError('invalid');
    if((kind==='archive'&&before.status==='archived')||(kind==='unarchive'&&(before.status!=='archived'||!before.archived_from_status)))throw new ScheduleRepositoryError('invalid');
    this.attempt=freeze(structuredClone({actor:this.actor,organization:parseInvitationId(before.organization_id),id:parseInvitationId(before.id),dayId:before.production_day_id===null?null:parseInvitationId(before.production_day_id),kind,expectedVersion:before.document_version,name:before.display_name,slug:before.slug,before,payload,document:kind==='restore_version'?source!.document:before.document}));
  }
  async execute(repository:LifecycleTransport,checkOnly=false){
    if(!this.attempt||this.busy||(!checkOnly&&['success','conflict'].includes(this.phase)))return;
    const attempt=this.attempt,generation=this.generation,wasReview=this.phase==='review';
    this.busy=true;this.failure=null;
    try{
      if(checkOnly||!wasReview){
        const result=await repository.probe(attempt);if(generation!==this.generation)return;this.result=result;
        if(result.state==='matched'){this.phase='success';return;}
        if(result.state==='different'){this.phase='conflict';this.failure='conflict';return;}
        if(checkOnly){this.phase=wasReview?'review':'uncertain';return;}
        if(result.state==='unavailable'&&attempt.kind!=='create'){this.phase='blocked';this.failure='unavailable';return;}
      }
      this.phase='pending';const record=await repository.send(attempt);if(generation!==this.generation)return;
      this.result={state:'matched',current:record,matchedVersion:record.document_version};this.phase='success';
    }catch(error){if(generation!==this.generation)return;this.failure=error instanceof ScheduleRepositoryError?error.kind:'failed';this.phase=this.failure==='conflict'?'conflict':this.failure==='failed'?'uncertain':'blocked';}
    finally{if(generation===this.generation)this.busy=false;}
  }
}
/** A matching immutable version is evidence of saved state, not a causal request receipt. */
export function historyMatches(attempt:LifecycleAttempt,history:ScheduleHistory):boolean {
  const m=history.metadata,b=attempt.before;
  if(!m||(attempt.productionId&&history.production_id!==attempt.productionId)||(attempt.phaseId!==undefined&&attempt.dayId===null&&m.phase_id!==attempt.phaseId)||(b&&history.production_id!==b.production_id)||history.schedule_id!==attempt.id||history.organization_id!==attempt.organization||history.version!==attempt.expectedVersion+1||history.created_by!==attempt.actor||history.document_schema_version!==1||!sameJson(history.document,attempt.document))return false;
  const name=attempt.kind==='rename'?attempt.payload.display_name:attempt.name,slug=attempt.kind==='rename'?attempt.payload.slug:attempt.slug;
  const status=attempt.kind==='create'?'draft':attempt.kind==='archive'?'archived':attempt.kind==='unarchive'?b?.archived_from_status:b?.status;
  const prior=attempt.kind==='archive'?b?.status:attempt.kind==='unarchive'||attempt.kind==='create'?null:b?.archived_from_status;
  if(b&&(m.phase_id??null)!==(b.phase_id??null))return false;
  if(m.display_name!==name||m.slug!==slug||m.production_day_id!==attempt.dayId||m.status!==status||m.archived_from_status!==prior)return false;
  if(attempt.kind==='delete')return typeof m.deleted_at==='string'&&Number.isFinite(Date.parse(m.deleted_at));
  return m.deleted_at===null;
}

export function acknowledgementMatches(attempt:LifecycleAttempt,record:StoredSchedule):boolean {
  return historyMatches(attempt,{schedule_id:record.id,organization_id:record.organization_id,production_id:record.production_id,version:record.document_version,document_schema_version:record.document_schema_version,document:record.document,created_by:record.updated_by,created_at:record.updated_at,checksum:'',metadata_checksum:null,metadata:{phase_id:record.phase_id??null,display_name:record.display_name,slug:record.slug,production_day_id:record.production_day_id,status:record.status,archived_from_status:record.archived_from_status,deleted_at:record.deleted_at}});
}
