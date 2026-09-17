import type { SupabaseClient } from '@supabase/supabase-js';
import { parseInvitationId } from './contracts.ts';
import { ScheduleRepositoryError } from './schedule-repository.ts';
export interface LibraryRecord {
 id:string;organization_id:string;production_id:string;production_day_id:string|null;phase_id:string|null;effective_phase_id:string|null;
 display_name:string;slug:string;status:'draft'|'published'|'archived';deleted_at:string|null;document_version:number;updated_at:string;library_position:number;
 schedule_date:string|null;town:string|null;production_name:string;phase_name:string|null;day_number:number|null;calendar_date:string|null;
 can_edit:boolean;can_organize:boolean;can_trash:boolean;can_transfer:boolean;can_copy:boolean;
}
export interface ProductionDestination {id:string;name:string;create:boolean;organize:boolean;phases:{id:string;name:string}[];days:{id:string;phase:string|null;date:string|null;number:number|null;position:number}[]}
export type LibraryFilter='active'|'archived'|'all'|'trash';
export type LibrarySort='manual'|'name'|'date'|'updated';
export function libraryGroup(row:LibraryRecord){return row.production_id+':'+(row.production_day_id===null?'unassigned':row.effective_phase_id??'no-phase');}
export function filterLibrary(rows:LibraryRecord[],query:string,status:LibraryFilter,production:string,dateFrom:string,dateTo:string,sort:LibrarySort){
 const term=query.trim().toLocaleLowerCase();return rows.filter(r=>(status==='trash'?!!r.deleted_at:!r.deleted_at&&(status==='all'||(status==='archived'?r.status==='archived':r.status!=='archived')))&&(!production||r.production_id===production)&&(!dateFrom||!!r.schedule_date&&r.schedule_date>=dateFrom)&&(!dateTo||!!r.schedule_date&&r.schedule_date<=dateTo)&&(!term||[r.display_name,r.production_name,r.phase_name,r.town].some(v=>v?.toLocaleLowerCase().includes(term))))
 .sort((a,b)=>sort==='name'?a.display_name.localeCompare(b.display_name)||a.id.localeCompare(b.id):sort==='date'?(a.schedule_date??'9999').localeCompare(b.schedule_date??'9999')||a.id.localeCompare(b.id):sort==='updated'?b.updated_at.localeCompare(a.updated_at)||a.id.localeCompare(b.id):a.library_position-b.library_position||(a.day_number??Infinity)-(b.day_number??Infinity)||b.updated_at.localeCompare(a.updated_at)||a.id.localeCompare(b.id));
}
export function createScheduleLibraryRepository(client:SupabaseClient){
 async function rpc(actor:string,name:string,args:Record<string,unknown>){const session=await client.auth.getSession();if(session.error||session.data.session?.user.id!==actor)throw new ScheduleRepositoryError('unauthenticated');const r=await client.rpc(name,args).setHeader('Authorization',`Bearer ${session.data.session.access_token}`);if(r.error)throw new ScheduleRepositoryError(r.status===401||r.error.code==='PT401'?'unauthenticated':r.error.code==='PT409'?'conflict':r.error.code==='PT404'?'unavailable':'failed');return r.data;}
 return {rpc,
  async inventory(actor:string,organization:string){const rows:LibraryRecord[]=[];let after:string|null=null;
   for(;;){const page=await rpc(actor,'list_schedule_library',{target_organization_id:parseInvitationId(organization),after_id:after});if(!Array.isArray(page)||page.length>100)throw new ScheduleRepositoryError('failed');
    for(const value of page){if(!value||value.organization_id!==organization||typeof value.display_name!=='string'||typeof value.production_name!=='string'||!Number.isSafeInteger(value.document_version)||value.document_version<1||!Number.isSafeInteger(value.library_position)||!['draft','published','archived'].includes(value.status))throw new ScheduleRepositoryError('failed');parseInvitationId(value.production_id);const id=parseInvitationId(value.id);if(after&&id<=after)throw new ScheduleRepositoryError('failed');after=id;rows.push(value);}
    if(rows.length>10000)throw Error('This library exceeds 10,000 schedules. No partial search results were shown.');if(page.length<100)return rows;
   }
  },
  async destinations(actor:string,organization:string):Promise<ProductionDestination[]>{const r=await rpc(actor,'schedule_creation_destinations',{target_organization_id:parseInvitationId(organization)});if(!r||!Array.isArray(r.productions))throw new ScheduleRepositoryError('failed');for(const p of r.productions){parseInvitationId(p.id);if(typeof p.name!=='string'||!Array.isArray(p.days)||!Array.isArray(p.phases)||typeof p.create!=='boolean'||typeof p.organize!=='boolean')throw new ScheduleRepositoryError('failed');}return r.productions;},
  async order(actor:string,rows:LibraryRecord[]){if(!rows.length||rows.some(r=>libraryGroup(r)!==libraryGroup(rows[0])))throw new ScheduleRepositoryError('invalid');return rpc(actor,'order_schedule_library',{target_production_id:rows[0].production_id,target_phase_id:rows[0].effective_phase_id,unassigned:rows[0].production_day_id===null,ordered_ids:rows.map(r=>r.id),expected_versions:rows.map(r=>r.document_version)});},
  async place(actor:string,row:LibraryRecord,day:string|null,phase:string|null){return rpc(actor,'place_schedule',{target_schedule_id:row.id,expected_version:row.document_version,target_day_id:day,target_phase_id:phase});}
 };
}
