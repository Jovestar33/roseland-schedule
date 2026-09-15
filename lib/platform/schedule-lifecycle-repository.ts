import type { SupabaseClient } from '@supabase/supabase-js';
import { createScheduleRepository, ScheduleRepositoryError, type StoredSchedule } from './schedule-repository.ts';
import { parseInvitationId } from './contracts.ts';
import { historyMatches, acknowledgementMatches, type LifecycleAttempt, type LifecycleResult, type ScheduleHistory } from './schedule-lifecycle-controller.ts';
export type LifecycleFilter='active'|'archived'|'deleted';
export interface LifecycleSummary {id:string;display_name:string;slug:string;status:StoredSchedule['status'];deleted_at:string|null;document_version:number;production_id:string}
export interface LifecycleDay {id:string;productionId:string;label:string;editable:boolean}
export type HistorySummary=Omit<ScheduleHistory,'document'>;
const PAGE=25;
export function createLifecycleRepository(client:SupabaseClient){
  async function bearer(actor:string){const r=await client.auth.getSession();if(r.error||r.data.session?.user.id!==actor)throw new ScheduleRepositoryError('unauthenticated');return r.data.session.access_token;}
  function fail(error:unknown,status:number){if(error)throw new ScheduleRepositoryError(status===401?'unauthenticated':status===403?'unavailable':'failed');}
  async function adapter(actor:string){const token=await bearer(actor);return createScheduleRepository({rpc:(name,args)=>client.rpc(name,args).setHeader('Authorization',`Bearer ${token}`)});}
  async function read(actor:string,organization:string,id:string):Promise<StoredSchedule>{
    const repo=await adapter(actor);let record:StoredSchedule;
    try{record=await repo.read(id);}catch(error){if(!(error instanceof ScheduleRepositoryError)||error.kind!=='unavailable')throw error;record=await repo.readDeleted(id);}
    if(record.organization_id!==organization)throw new ScheduleRepositoryError('unavailable');return record;
  }
  function historyRow(value:unknown,withDocument:boolean):ScheduleHistory{
    const row=value as ScheduleHistory;
    if(!row||![row.schedule_id,row.organization_id,row.production_id].every(id=>typeof id==='string'&&!!parseInvitationId(id))||!Number.isSafeInteger(row.version)||row.version<1||row.document_schema_version!==1||!Number.isFinite(Date.parse(row.created_at))||!(row.created_by===null||typeof row.created_by==='string'&&!!parseInvitationId(row.created_by))||!/^([a-f0-9]{64})$/.test(row.checksum)||!(row.metadata_checksum===null||/^[a-f0-9]{64}$/.test(row.metadata_checksum))||!(row.metadata===null||typeof row.metadata==='object'&&!Array.isArray(row.metadata))||(withDocument&&(!row.document||!Array.isArray(row.document.rows)||!row.document.meta)))throw new ScheduleRepositoryError('failed');return row;
  }
  async function history(actor:string,organization:string,id:string,before?:number){
    const token=await bearer(actor);let q=client.from('schedule_versions').select('schedule_id,organization_id,production_id,version,document_schema_version,metadata,created_at,created_by,checksum,metadata_checksum').eq('organization_id',parseInvitationId(organization)).eq('schedule_id',parseInvitationId(id)).order('version',{ascending:false}).limit(PAGE+1).setHeader('Authorization',`Bearer ${token}`);
    if(before!==undefined){if(!Number.isSafeInteger(before)||before<1)throw new ScheduleRepositoryError('invalid');q=q.lt('version',before);}const r=await q;fail(r.error,r.status);const rows=(r.data??[]).map(row=>historyRow(row,false));return {items:rows.slice(0,PAGE) as HistorySummary[],more:rows.length>PAGE};
  }
  async function historical(actor:string,organization:string,id:string,version:number):Promise<ScheduleHistory|null>{
    if(!Number.isSafeInteger(version)||version<1)throw new ScheduleRepositoryError('invalid');const token=await bearer(actor);
    const r=await client.from('schedule_versions').select('schedule_id,organization_id,production_id,version,document_schema_version,document,metadata,created_at,created_by,checksum,metadata_checksum').eq('organization_id',parseInvitationId(organization)).eq('schedule_id',parseInvitationId(id)).eq('version',version).maybeSingle().setHeader('Authorization',`Bearer ${token}`);fail(r.error,r.status);return r.data?historyRow(r.data,true):null;
  }
  async function days(actor:string,organization:string,after?:string){
    const token=await bearer(actor);let q=client.from('production_days').select('id,production_id,calendar_date,day_number,position,phase_id,productions!inner(name,deleted_at),phases(deleted_at)').eq('organization_id',parseInvitationId(organization)).is('deleted_at',null).is('productions.deleted_at',null).order('id').limit(PAGE+1).setHeader('Authorization',`Bearer ${token}`);if(after)q=q.gt('id',parseInvitationId(after));const r=await q;fail(r.error,r.status);
    const rows=r.data??[],visible=rows.slice(0,PAGE);const permissions=new Map<string,boolean>();
    await Promise.all([...new Set(visible.map(row=>String(row.production_id)))].map(async production=>{const p=await client.rpc('can_edit_production',{target_production_id:parseInvitationId(production)}).setHeader('Authorization',`Bearer ${token}`);fail(p.error,p.status);if(typeof p.data!=='boolean')throw new ScheduleRepositoryError('failed');permissions.set(production,p.data);}));
    const items=visible.flatMap(row=>{const p=row.productions as unknown as {name:unknown},phase=row.phases as unknown as {deleted_at:string|null}|null;if(row.phase_id&&(!phase||phase.deleted_at))return [];if(typeof p.name!=='string')throw new ScheduleRepositoryError('failed');return [{id:parseInvitationId(row.id),productionId:parseInvitationId(row.production_id),label:`${p.name} · Day ${row.day_number??Number(row.position)+1}${row.calendar_date?' · '+row.calendar_date:''}`,editable:permissions.get(row.production_id)===true}];});return {items,more:rows.length>PAGE,cursor:visible.at(-1)?.id as string|undefined};
  }
  return {read,history,historical,days,
    async list(actor:string,organization:string,filter:LifecycleFilter,after?:string){
      if(!['active','archived','deleted'].includes(filter))throw new ScheduleRepositoryError('invalid');const token=await bearer(actor);
      let q=client.from('schedules').select('id,display_name,slug,status,deleted_at,document_version,production_id').eq('organization_id',parseInvitationId(organization)).order('id').limit(PAGE+1).setHeader('Authorization',`Bearer ${token}`);
      q=filter==='deleted'?q.not('deleted_at','is',null):q.is('deleted_at',null);if(filter==='archived')q=q.eq('status','archived');else if(filter==='active')q=q.neq('status','archived');if(after)q=q.gt('id',parseInvitationId(after));const r=await q;fail(r.error,r.status);
      const items=(r.data??[]).map(row=>{if(typeof row.display_name!=='string'||typeof row.slug!=='string'||!Number.isSafeInteger(row.document_version)||row.document_version<1||!['draft','published','archived'].includes(row.status))throw new ScheduleRepositoryError('failed');return {...row,id:parseInvitationId(row.id),production_id:parseInvitationId(row.production_id)} as LifecycleSummary;});return {items:items.slice(0,PAGE),more:items.length>PAGE};
    },
    async canEdit(actor:string,production:string){const token=await bearer(actor);const r=await client.rpc('can_edit_production',{target_production_id:parseInvitationId(production)}).setHeader('Authorization',`Bearer ${token}`);fail(r.error,r.status);if(typeof r.data!=='boolean')throw new ScheduleRepositoryError('failed');return r.data;},
    async send(attempt:LifecycleAttempt){
      const repo=await adapter(attempt.actor);
      if(attempt.kind==='create'){
        const token=await bearer(attempt.actor),day=await client.from('production_days').select('id').eq('id',attempt.dayId).eq('organization_id',attempt.organization).is('deleted_at',null).maybeSingle().setHeader('Authorization',`Bearer ${token}`);fail(day.error,day.status);if(!day.data)throw new ScheduleRepositoryError('unavailable');
      }
      if(attempt.kind!=='create'){const current=await read(attempt.actor,attempt.organization,attempt.id);if(current.document_version!==attempt.expectedVersion)throw new ScheduleRepositoryError('conflict');}
      const record=attempt.kind==='create'?await repo.create(attempt.id,attempt.dayId,attempt.name,attempt.slug,attempt.document,1):await repo.mutate(attempt.id,attempt.expectedVersion,attempt.kind,{...attempt.payload});
      if(!acknowledgementMatches(attempt,record))throw new ScheduleRepositoryError('failed');return record;
    },
    async probe(attempt:LifecycleAttempt):Promise<LifecycleResult>{
      let current:StoredSchedule;try{current=await read(attempt.actor,attempt.organization,attempt.id);}catch(error){if(error instanceof ScheduleRepositoryError&&error.kind==='unavailable')return {state:'unavailable',current:null,matchedVersion:null};throw error;}
      const target=attempt.expectedVersion+1,version=await historical(attempt.actor,attempt.organization,attempt.id,target);
      if(version&&historyMatches(attempt,version)){if(current.document_version<target)current=await read(attempt.actor,attempt.organization,attempt.id);return {state:'matched',current,matchedVersion:target};}
      return {state:current.document_version===attempt.expectedVersion?'retryable':'different',current,matchedVersion:null};
    },
  };
}
