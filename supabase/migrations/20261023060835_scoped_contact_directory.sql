-- Shared people are separate from schedule-specific call-sheet snapshots.
-- No directory is added to legacy synchronization or anonymous client links.
create table private.contact_directory (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 production_id uuid,
 phase_id uuid,
 contact jsonb not null,
 version bigint not null default 1 check(version>0),
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 check(phase_id is null or production_id is not null),
 foreign key(organization_id,production_id) references public.productions(organization_id,id) on delete restrict,
 foreign key(organization_id,production_id,phase_id) references public.phases(organization_id,production_id,id) on delete restrict
);
create index contact_directory_scope on private.contact_directory(organization_id,production_id,phase_id) where archived_at is null;
alter table private.contact_directory enable row level security;
revoke all on private.contact_directory from public,anon,authenticated,service_role;

create function public.schedule_contact_directory(target_schedule_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;effective_phase uuid;org_name text;prod_name text;phase_name text;entries jsonb;scopes jsonb;org_manage boolean;prod_manage boolean;
begin
 perform public.require_active_schedule_session();
 select * into s from public.schedules where id=target_schedule_id and deleted_at is null;
 if not found or not public.schedule_visible(s.id,'read') then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
 effective_phase:=coalesce((select phase_id from public.production_days where id=s.production_day_id and deleted_at is null),s.phase_id);
 select name into org_name from public.organizations where id=s.organization_id;
 select name into prod_name from public.productions where id=s.production_id and deleted_at is null;
 select name into phase_name from public.phases where id=effective_phase and production_id=s.production_id and deleted_at is null;
 if phase_name is null then effective_phase:=null;end if;
 org_manage:=public.is_org_admin(s.organization_id) and private.schedule_actor_can(auth.uid(),'edit',s.organization_id);
 prod_manage:=public.schedule_capability('organize',s.production_id);
 scopes:=jsonb_build_array(jsonb_build_object('scope','organization','label',org_name,'canManage',org_manage),jsonb_build_object('scope','production','label',prod_name,'canManage',prod_manage));
 if effective_phase is not null then scopes:=scopes||jsonb_build_array(jsonb_build_object('scope','phase','label',phase_name,'canManage',prod_manage));end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'scope',case when c.phase_id is not null then 'phase' when c.production_id is not null then 'production' else 'organization' end,
  'label',case when c.phase_id is not null then phase_name when c.production_id is not null then prod_name else org_name end,
  'version',c.version,'contact',c.contact,'canManage',case when c.production_id is null then org_manage else prod_manage end) order by lower(c.contact->>'name'),c.id),'[]') into entries
 from private.contact_directory c where c.organization_id=s.organization_id and c.archived_at is null
  and (c.production_id is null or c.production_id=s.production_id and public.schedule_capability('read',s.production_id) and (c.phase_id is null or c.phase_id=effective_phase));
 return jsonb_build_object('entries',entries,'scopes',scopes);
end; $$;

create function public.save_directory_contact(target_schedule_id uuid,target_scope text,target_contact_id uuid,next_contact jsonb,expected_version bigint,archive_contact boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;prod uuid;phase uuid;locked_org uuid;locked_prod uuid;label text;before private.contact_directory;saved private.contact_directory;
begin
 perform public.require_active_schedule_session();
 select * into s from public.schedules where id=target_schedule_id and deleted_at is null;
 if not found then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
 locked_org:=s.organization_id;locked_prod:=s.production_id;
 perform private.lock_schedule_permissions(locked_org,locked_prod);
 -- Recheck and lock placement after the organization lock; concurrent moves cannot change scope.
 select * into s from public.schedules where id=target_schedule_id and deleted_at is null for share;
 if not found or s.organization_id<>locked_org or s.production_id<>locked_prod or not public.schedule_visible(s.id,'edit') then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
 if target_scope='organization' then
  if not public.is_org_admin(s.organization_id) or not private.schedule_actor_can(auth.uid(),'edit',s.organization_id) then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
  select name into label from public.organizations where id=s.organization_id;
 elsif target_scope in ('production','phase') then
  if not public.schedule_capability('organize',s.production_id) then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
  prod:=s.production_id;
  if target_scope='phase' then
   phase:=coalesce((select phase_id from public.production_days where id=s.production_day_id and deleted_at is null),s.phase_id);
   select name into label from public.phases where id=phase and production_id=prod and deleted_at is null for share;
   if not found then raise sqlstate 'PT404' using message='Phase unavailable';end if;
  else select name into label from public.productions where id=prod;end if;
 else raise sqlstate 'PT400' using message='Invalid contact scope';end if;
 if target_contact_id is null or expected_version is not null and expected_version<1 or archive_contact is null then raise sqlstate 'PT400' using message='Invalid contact';end if;
 if not archive_contact then
  if jsonb_typeof(next_contact) is distinct from 'object' then raise sqlstate 'PT400' using message='Invalid contact';end if;
  if next_contact->>'id' is distinct from target_contact_id::text or not coalesce(next_contact->>'type'=any(array['crew','cast','location','other']),false)
   or coalesce(length(btrim(next_contact->>'name')),0) not between 1 and 160
   or exists(select 1 from unnest(array['id','type','name','role','phone','email']) k where jsonb_typeof(next_contact->k) is distinct from 'string')
   or exists(select 1 from jsonb_each(next_contact) e where e.key<>all(array['id','type','name','role','phone','email','department']) or jsonb_typeof(e.value)<>'string' or length(e.value #>> '{}')>500)
   then raise sqlstate 'PT400' using message='Invalid contact';end if;
 end if;
 select * into before from private.contact_directory where id=target_contact_id for update;
 if found and (before.organization_id<>s.organization_id or before.production_id is distinct from prod or before.phase_id is distinct from phase) then raise sqlstate 'PT404' using message='Contacts unavailable';end if;
 -- Stable ID/payload/version makes a retry after a lost response safe.
 if before.id is not null and before.version=coalesce(expected_version,0)+1 and
  ((archive_contact and before.archived_at is not null) or (not archive_contact and before.archived_at is null and before.contact=next_contact))
  and (expected_version is not null or before.created_by=auth.uid()) then saved:=before;
 else
  if before.id is null and expected_version is not null or before.id is not null and (expected_version is null or before.version<>expected_version or before.archived_at is not null)
   or archive_contact and before.id is null then raise sqlstate 'PT409' using message='Contact changed';end if;
  if before.id is null then
   if (select count(*) from private.contact_directory where organization_id=s.organization_id and archived_at is null)>=5000 then raise sqlstate 'PT400' using message='Contact limit reached';end if;
   insert into private.contact_directory(id,organization_id,production_id,phase_id,contact,created_by) values(target_contact_id,s.organization_id,prod,phase,next_contact,auth.uid()) returning * into saved;
  else
   update private.contact_directory set contact=case when archive_contact then contact else next_contact end,archived_at=case when archive_contact then now() else null end,version=version+1,updated_at=now() where id=target_contact_id returning * into saved;
  end if;
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
   values(s.organization_id,auth.uid(),case when archive_contact then 'contact.archive' when expected_version is null then 'contact.create' else 'contact.update' end,'contact_directory',saved.id,jsonb_build_object('scope',target_scope,'version',saved.version));
 end if;
 return jsonb_build_object('id',saved.id,'scope',target_scope,'label',label,'version',saved.version,'contact',saved.contact,'canManage',true,'archived',saved.archived_at is not null);
end; $$;
revoke all on function public.schedule_contact_directory(uuid),public.save_directory_contact(uuid,text,uuid,jsonb,bigint,boolean) from public,anon,service_role;
grant execute on function public.schedule_contact_directory(uuid),public.save_directory_contact(uuid,text,uuid,jsonb,bigint,boolean) to authenticated;
