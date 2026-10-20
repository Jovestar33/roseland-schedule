import type { SupabaseClient } from '@supabase/supabase-js';
import { parseInvitationId } from './contracts.ts';
import { ScheduleRepositoryError } from './schedule-repository.ts';
export type ProductionChange={id:string;organization:string;name:string;version:number|null};
export function createProductionDetailsRepository(client:SupabaseClient){
 return {async save(actor:string,change:ProductionChange){
  const id=parseInvitationId(change.id),org=parseInvitationId(change.organization),name=change.name.trim();
  if(!name||name.length>160||change.version!==null&&(!Number.isSafeInteger(change.version)||change.version<1))throw new ScheduleRepositoryError('invalid');
  const session=await client.auth.getSession();
  if(session.error||session.data.session?.user.id!==actor)throw new ScheduleRepositoryError('unauthenticated');
  const bearer='Bearer '+session.data.session.access_token;
  const read=()=>client.from('productions').select('id,organization_id,name,version,created_by').eq('id',id).eq('organization_id',org).is('deleted_at',null).setHeader('Authorization',bearer).maybeSingle();
  const before=await read();if(before.error)throw new ScheduleRepositoryError('unavailable');
  // An uncertain response is retried with the same ID, name and expected version.
  if(before.data?.name===name&&before.data.version===(change.version===null?1:change.version+1)&&(change.version!==null||before.data.created_by===actor))return;
  if(change.version===null&&before.data||change.version!==null&&before.data?.version!==change.version)throw new ScheduleRepositoryError('conflict');
  let result;
  if(change.version===null){
   const settings=await client.from('organizations').select('default_timezone,default_locale').eq('id',org).setHeader('Authorization',bearer).single();
   if(settings.error||!settings.data)throw new ScheduleRepositoryError('unavailable');
   result=await client.from('productions').insert({id,organization_id:org,name,slug:'production-'+id,created_by:actor,timezone:settings.data.default_timezone,locale:settings.data.default_locale}).setHeader('Authorization',bearer);
   if(result.error)throw new ScheduleRepositoryError('unavailable');
   const confirmed=await read();
   if(confirmed.error||confirmed.data?.name!==name||confirmed.data?.created_by!==actor||confirmed.data?.version!==1)throw new ScheduleRepositoryError('conflict');
   return;
  }else result=await client.from('productions').update({name}).eq('id',id).eq('organization_id',org).eq('version',change.version).is('deleted_at',null).select('id').setHeader('Authorization',bearer).maybeSingle();
  if(result.error||!result.data)throw new ScheduleRepositoryError(result.error?.code==='42501'?'unavailable':'conflict');
 }};
}
