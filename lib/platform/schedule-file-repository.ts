import { createScheduleLibraryRepository } from './schedule-library.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createLifecycleRepository, type LifecycleDay } from './schedule-lifecycle-repository.ts';
import { ScheduleRepositoryError, type StoredSchedule } from './schedule-repository.ts';
import { parseInvitationId } from './contracts.ts';
import { encodeScheduleFile, unchangedInventory, FILE_COUNT, type CreateSelection } from './schedule-files.ts';
type Inventory = Pick<StoredSchedule,'id'|'organization_id'|'production_id'|'display_name'|'slug'|'document_version'|'deleted_at'>;
export function createScheduleFileRepository(client:SupabaseClient) {
  const lifecycle=createLifecycleRepository(client);
  async function bearer(actor:string){const r=await client.auth.getSession();if(r.error||r.data.session?.user.id!==actor)throw new ScheduleRepositoryError('unauthenticated');return r.data.session.access_token;}
  async function inventory(actor:string,production?:string){
    const rows:Inventory[]=[];let after='';
    for(;;){const token=await bearer(actor);let q=client.from('schedules').select('id,organization_id,production_id,display_name,slug,document_version,deleted_at').order('id').limit(50).setHeader('Authorization',`Bearer ${token}`);if(production)q=q.eq('production_id',parseInvitationId(production)).is('deleted_at',null);if(after)q=q.gt('id',after);const r=await q;if(r.error)throw new ScheduleRepositoryError(r.status===401?'unauthenticated':'failed');const page=r.data??[];
      for(const row of page){parseInvitationId(row.id);parseInvitationId(row.organization_id);if(row.id<=after||!Number.isSafeInteger(row.document_version)||row.document_version<1||typeof row.display_name!=='string'||typeof row.slug!=='string')throw new ScheduleRepositoryError('failed');after=row.id;rows.push(row);}
      if(rows.length>FILE_COUNT)throw new Error('More than 500 readable schedules. No partial operation was produced.');if(page.length<50)return rows;
    }
  }
  async function destinations(actor:string,organization:string){const result:LifecycleDay[]=[];let after:string|undefined;for(;;){const page=await lifecycle.days(actor,organization,after);result.push(...page.items.filter(d=>d.editable));if(!page.more)return result;if(!page.cursor||page.cursor===after)throw new ScheduleRepositoryError('failed');after=page.cursor;}}
  const library=createScheduleLibraryRepository(client);
  const productions=async(actor:string,organization:string)=>(await library.destinations(actor,organization)).filter(p=>p.create);
  return {lifecycle,inventory,destinations,productions,
    async copyPolicy(actor:string,id:string){const token=await bearer(actor);const r=await client.rpc('schedule_copy_policy',{target_schedule_id:parseInvitationId(id)}).setHeader('Authorization',`Bearer ${token}`);if(r.error||typeof r.data!=='string'||!/^[a-f0-9]{64}$/.test(r.data))throw new ScheduleRepositoryError(r.status===401?'unauthenticated':'unavailable');return r.data;},
    async exportAll(actor:string){
      const before=await inventory(actor),records:StoredSchedule[]=[];
      for(const row of before){const token=await bearer(actor);const permission=await client.rpc('schedule_capability',{action:'export',target_production_id:row.production_id,target_schedule_id:row.id}).setHeader('Authorization',`Bearer ${token}`);if(permission.error||permission.data!==true)throw new Error('A readable schedule cannot be exported under current permissions. No partial file was produced.');const r=await lifecycle.read(actor,row.organization_id,row.id);if(r.document_version!==row.document_version)throw new Error('A schedule changed during export. Retry; no partial file was produced.');records.push(r);}
      unchangedInventory(before,await inventory(actor));for(const row of before){const token=await bearer(actor);const permission=await client.rpc('schedule_capability',{action:'export',target_production_id:row.production_id,target_schedule_id:row.id}).setHeader('Authorization',`Bearer ${token}`);if(permission.error||permission.data!==true)throw new Error('Export permissions changed. No file was produced.');}return encodeScheduleFile(records);
    },
    async preflight(actor:string,organization:string,dayId:string|null,entries:CreateSelection[],placement?:{productionId:string;phaseId:string|null}){
      let productionId:string;
      if(placement){
        const production=(await productions(actor,organization)).find(p=>p.id===placement.productionId);
        if(!production)throw new Error('Choose a production where you can create schedules.');
        if(dayId&&!production.days.some(d=>d.id===dayId))throw new Error('Choose a day in the selected production.');
        if(placement.phaseId&&!production.phases.some(p=>p.id===placement.phaseId))throw new Error('Choose a phase in the selected production.');
        productionId=production.id;
      }else{
        const day=(await destinations(actor,organization)).find(d=>d.id===dayId);if(!day)throw new Error('Choose an existing day you can edit.');
        productionId=day.productionId;
      }
      const existing=await inventory(actor,productionId);
      if(entries.some(e=>existing.some(r=>r.display_name.toLowerCase()===e.name.toLowerCase()||r.slug===e.slug)))throw new Error('A name or slug already exists in that production. Edit the review; nothing was created.');
    },
  };
}
