import type { SupabaseClient } from '@supabase/supabase-js';
import { parseInvitationId } from './contracts.ts';
import { ScheduleRepositoryError } from './schedule-repository.ts';
import type { ScheduleSummary } from './session-schedule-repository.ts';
export interface WorkspaceOrganization { id:string; name:string; role:'owner'|'admin'|'member';mfa_required?:boolean;access_state?:'ready'|'mfa_required' }
export function createWorkspaceRepository(client:SupabaseClient){
  async function token(actor:string){const r=await client.auth.getSession();if(r.error||r.data.session?.user.id!==actor)throw new ScheduleRepositoryError('unauthenticated');return r.data.session.access_token;}
  function fail(error:{code?:string}|null,status:number){if(error)throw new ScheduleRepositoryError(status===401?'unauthenticated':status===403?'unavailable':'failed');}
  async function organizations(actor:string,after?:string,id?:string){
    const bearer=await token(actor);
    const r=await client.rpc('list_my_organization_access',{after_id:after??null,target_organization_id:id??null}).setHeader('Authorization',`Bearer ${bearer}`);fail(r.error,r.status);
    if(!Array.isArray(r.data))throw new ScheduleRepositoryError('failed');
    const items=r.data.map(row=>{if(!['owner','admin','member'].includes(row.role)||typeof row.name!=='string'||row.name.length>160||typeof row.mfa_required!=='boolean'||!['ready','mfa_required'].includes(row.access_state))throw new ScheduleRepositoryError('failed');return {...row,id:parseInvitationId(row.id)} as WorkspaceOrganization;});
    return {items:items.slice(0,25),more:items.length>25};
  }
  return {organizations,async scope(actor:string,id:string){return (await organizations(actor,undefined,id)).items[0]??null;},
    async schedules(actor:string,organization:string,after:string|null=null):Promise<ScheduleSummary[]>{
      const bearer=await token(actor);let q=client.from('schedules').select('id,display_name,status,document_version,updated_at').eq('organization_id',parseInvitationId(organization)).is('deleted_at',null).order('id').limit(50).setHeader('Authorization',`Bearer ${bearer}`);
      if(after)q=q.gt('id',parseInvitationId(after));const r=await q;fail(r.error,r.status);
      return (r.data??[]).map(row=>{if(typeof row.display_name!=='string'||!['draft','published','archived'].includes(row.status)||!Number.isSafeInteger(row.document_version)||row.document_version<1||!Number.isFinite(Date.parse(row.updated_at)))throw new ScheduleRepositoryError('failed');return {...row,id:parseInvitationId(row.id)} as ScheduleSummary;});
    },
    async canEdit(actor:string,production:string,schedule?:string,action='edit'){const bearer=await token(actor);const r=await client.rpc('schedule_capability',{action,target_production_id:parseInvitationId(production),target_schedule_id:schedule?parseInvitationId(schedule):null}).setHeader('Authorization',`Bearer ${bearer}`);fail(r.error,r.status);if(typeof r.data!=='boolean')throw new ScheduleRepositoryError('failed');return r.data;},
  };
}
