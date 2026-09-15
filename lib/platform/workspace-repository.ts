import type { SupabaseClient } from '@supabase/supabase-js';
import { parseInvitationId } from './contracts.ts';
import { ScheduleRepositoryError } from './schedule-repository.ts';
import type { ScheduleSummary } from './session-schedule-repository.ts';
export interface WorkspaceOrganization { id:string; name:string; role:'owner'|'admin'|'member' }
export function createWorkspaceRepository(client:SupabaseClient){
  async function token(actor:string){const r=await client.auth.getSession();if(r.error||r.data.session?.user.id!==actor)throw new ScheduleRepositoryError('unauthenticated');return r.data.session.access_token;}
  function fail(error:{code?:string}|null,status:number){if(error)throw new ScheduleRepositoryError(status===401?'unauthenticated':status===403?'unavailable':'failed');}
  async function organizations(actor:string,after?:string,id?:string){
    const bearer=await token(actor);
    let q=client.from('organization_memberships').select('organization_id,role,organizations!inner(name,deleted_at)').eq('user_id',parseInvitationId(actor)).eq('status','active').is('organizations.deleted_at',null).order('organization_id').limit(26).setHeader('Authorization',`Bearer ${bearer}`);
    if(after)q=q.gt('organization_id',parseInvitationId(after));if(id)q=q.eq('organization_id',parseInvitationId(id));
    const r=await q;fail(r.error,r.status);
    const items=(r.data??[]).map(row=>{const org=row.organizations as unknown as {name:unknown};if(!['owner','admin','member'].includes(row.role)||typeof org.name!=='string'||org.name.length>160)throw new ScheduleRepositoryError('failed');return {id:parseInvitationId(row.organization_id),name:org.name,role:row.role} as WorkspaceOrganization;});
    return {items:items.slice(0,25),more:items.length>25};
  }
  return {organizations,async scope(actor:string,id:string){return (await organizations(actor,undefined,id)).items[0]??null;},
    async schedules(actor:string,organization:string,after:string|null=null):Promise<ScheduleSummary[]>{
      const bearer=await token(actor);let q=client.from('schedules').select('id,display_name,status,document_version,updated_at').eq('organization_id',parseInvitationId(organization)).is('deleted_at',null).order('id').limit(50).setHeader('Authorization',`Bearer ${bearer}`);
      if(after)q=q.gt('id',parseInvitationId(after));const r=await q;fail(r.error,r.status);
      return (r.data??[]).map(row=>{if(typeof row.display_name!=='string'||!['draft','published','archived'].includes(row.status)||!Number.isSafeInteger(row.document_version)||row.document_version<1||!Number.isFinite(Date.parse(row.updated_at)))throw new ScheduleRepositoryError('failed');return {...row,id:parseInvitationId(row.id)} as ScheduleSummary;});
    },
    async canEdit(actor:string,production:string){const bearer=await token(actor);const r=await client.rpc('can_edit_production',{target_production_id:parseInvitationId(production)}).setHeader('Authorization',`Bearer ${bearer}`);fail(r.error,r.status);if(typeof r.data!=='boolean')throw new ScheduleRepositoryError('failed');return r.data;},
  };
}
