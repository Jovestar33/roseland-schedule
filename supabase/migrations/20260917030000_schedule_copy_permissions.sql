-- Keep membership strength when accepting another production invitation.
create or replace function public.accept_organization_invitation(invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_email text;
  invitation public.organization_invitations%rowtype;
  locked_invitation public.organization_invitations%rowtype;
begin
  if caller_user_id is null then
    raise exception 'invitation unavailable';
  end if;

  select lower(btrim(coalesce(u.email, ''))) into caller_email
  from auth.users u
  where u.id = caller_user_id
    and u.email_confirmed_at is not null;

  if caller_email is null or caller_email = '' then
    raise exception 'invitation unavailable';
  end if;

  select * into invitation
  from public.organization_invitations i
  where i.id = invitation_id;

  if not found
    or invitation.status <> 'pending'
    or invitation.expires_at <= timezone('utc', now())
    or invitation.email_normalized <> caller_email
    or not exists (
      select 1 from public.organizations o
      where o.id = invitation.organization_id and o.deleted_at is null
    )
    or (
      invitation.production_id is not null
      and not exists (
        select 1 from public.productions p
        where p.id = invitation.production_id
          and p.organization_id = invitation.organization_id
          and p.deleted_at is null
      )
    ) then
    raise exception 'invitation unavailable';
  end if;

  -- Hold active parents through acceptance. Do not hold the invitation while
  -- waiting for memberships: suspension locks a membership before invalidating
  -- invitations. Upserts below obtain row locks even for concurrently created rows.
  perform 1 from public.organizations o
  where o.id = invitation.organization_id and o.deleted_at is null for share;
  if not found then raise exception 'invitation unavailable'; end if;
  if invitation.production_id is not null then
    perform 1 from public.productions p
    where p.id = invitation.production_id
      and p.organization_id = invitation.organization_id
      and p.deleted_at is null for share;
    if not found then raise exception 'invitation unavailable'; end if;
  end if;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    role,
    status,
    invited_by,
    joined_at
  )
  values (
    invitation.organization_id,
    caller_user_id,
    invitation.organization_role,
    'active',
    invitation.created_by,
    timezone('utc', now())
  )
  on conflict (organization_id, user_id) do update
  set role = case
      when public.organization_memberships.role = 'owner' then 'owner'::public.organization_role
      when public.organization_memberships.role = 'admin'
        and excluded.role = 'member' then 'admin'::public.organization_role
      else excluded.role
    end,
    status = 'active',
    invited_by = excluded.invited_by,
    joined_at = coalesce(public.organization_memberships.joined_at, excluded.joined_at),
    updated_at = timezone('utc', now())
  where public.organization_memberships.status <> 'suspended';
  if not found then raise exception 'invitation unavailable'; end if;

  if invitation.production_id is not null then
    insert into public.production_memberships (
      organization_id,
      production_id,
      user_id,
      role,
      status,
      invited_by,
      joined_at
    )
    values (
      invitation.organization_id,
      invitation.production_id,
      caller_user_id,
      invitation.production_role,
      'active',
      invitation.created_by,
      timezone('utc', now())
    )
    on conflict (production_id, user_id) do update
    set role = case
        when public.production_memberships.role = 'organizer' then 'organizer'::public.production_role
        when public.production_memberships.role = 'editor' and excluded.role <> 'organizer' then 'editor'::public.production_role
        else excluded.role
      end,
      status = 'active',
      invited_by = excluded.invited_by,
      joined_at = coalesce(public.production_memberships.joined_at, excluded.joined_at),
      updated_at = timezone('utc', now())
    where public.production_memberships.status <> 'suspended';
    if not found then raise exception 'invitation unavailable'; end if;
  end if;

  -- Recheck the whole invitation after obtaining membership locks. A concurrent
  -- accept/revoke/expiry or edit invalidates this attempt and rolls its upserts back.
  select * into locked_invitation from public.organization_invitations i
  where i.id = invitation_id for update;
  if not found or locked_invitation is distinct from invitation
    or locked_invitation.status <> 'pending'
    or locked_invitation.expires_at <= clock_timestamp() then
    raise exception 'invitation unavailable';
  end if;

  update public.organization_invitations
  set status = 'accepted',
      accepted_at = timezone('utc', now()),
      accepted_by = caller_user_id
  where id = invitation.id;

  insert into public.audit_events (
    organization_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    invitation.organization_id,
    caller_user_id,
    'organization.invitation.accepted',
    'organization_invitation',
    invitation.id,
    jsonb_build_object('production_id', invitation.production_id)
  );

  return invitation.organization_id;
end;
$$;

create function private.schedule_policy_stamp(org uuid,prod uuid,sched uuid)
returns text language sql stable security definer set search_path='' as $$
 select encode(extensions.digest(convert_to(coalesce(jsonb_agg(to_jsonb(r) order by id),'[]')::text,'UTF8'),'sha256'),'hex')
 from public.schedule_restrictions r where r.organization_id=org and (r.production_id is null or r.production_id=prod) and (r.schedule_id is null or r.schedule_id=sched);
$$;
create function public.schedule_copy_policy(target_schedule_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare s public.schedules;
begin
 select * into s from public.schedules where id=target_schedule_id;
 if not found or not private.schedule_actor_can(auth.uid(),'create',s.organization_id,s.production_id,s.id) or s.deleted_at is not null then raise sqlstate 'PT404' using message='Copy unavailable'; end if;
 return private.schedule_policy_stamp(s.organization_id,s.production_id,s.id);
end; $$;
create function public.copy_schedule(target_schedule_id uuid,source_schedule_id uuid,source_version bigint,source_policy text,
 target_day_id uuid,next_display_name text,next_slug text,next_document jsonb,schema_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare source public.schedules; d public.production_days; result jsonb;
begin
 select * into source from public.schedules where id=source_schedule_id;
 if not found then raise sqlstate 'PT404' using message='Copy unavailable'; end if;
 select * into d from public.production_days where id=target_day_id;
 if not found or d.organization_id<>source.organization_id then raise sqlstate 'PT404' using message='Copy unavailable'; end if;
 perform private.lock_schedule_permissions(source.organization_id,source.production_id);
 perform private.lock_schedule_permissions(d.organization_id,d.production_id);
 select * into source from public.schedules where id=source_schedule_id for share;
 if source.deleted_at is not null or not private.schedule_actor_can(auth.uid(),'create',source.organization_id,source.production_id,source.id)
  or not private.schedule_actor_can(auth.uid(),'create',d.organization_id,d.production_id,null) then raise sqlstate 'PT404' using message='Copy unavailable'; end if;
 if source_version is distinct from source.document_version or source_policy is distinct from private.schedule_policy_stamp(source.organization_id,source.production_id,source.id) then raise sqlstate 'PT409' using message='Source or permissions changed; review again'; end if;
 result:=public.create_schedule(target_schedule_id,target_day_id,next_display_name,next_slug,next_document,schema_version);
 insert into public.schedule_restrictions(organization_id,production_id,schedule_id,subject_role,subject_user_id,denied_actions,authority,created_by)
 select organization_id,d.production_id,target_schedule_id,subject_role,subject_user_id,denied_actions,authority,created_by
 from public.schedule_restrictions where schedule_id=source.id;
 if not private.schedule_actor_can(auth.uid(),'edit',d.organization_id,d.production_id,target_schedule_id) then raise sqlstate 'PT404' using message='Copy cannot preserve editable access'; end if;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)
 values(source.organization_id,auth.uid(),'schedule.copy','schedule',target_schedule_id,jsonb_build_object('source_id',source.id,'source_version',source.document_version));
 return result;
end; $$;

-- Scope names for permission administration, independently of document access.
create function public.schedule_permission_directory(target_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.schedule_actor_can(auth.uid(),'permissions',target_organization_id,null,null) then raise sqlstate 'PT404' using message='Permissions unavailable'; end if;
 return jsonb_build_object(
  'productions',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by p.name,p.id),'[]') from public.productions p where p.organization_id=target_organization_id and p.deleted_at is null and private.schedule_actor_can(auth.uid(),'permissions',target_organization_id,p.id,null)),
  'schedules',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.display_name,'production',s.production_id) order by s.display_name,s.id),'[]') from public.schedules s where s.organization_id=target_organization_id and private.schedule_actor_can(auth.uid(),'permissions',target_organization_id,s.production_id,s.id)),
  'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(nullif(p.display_name,''),u.email),'role',m.role) order by u.email),'[]') from public.organization_memberships m join auth.users u on u.id=m.user_id left join public.profiles p on p.user_id=m.user_id where m.organization_id=target_organization_id and m.status='active'));
end; $$;
revoke all on function private.schedule_policy_stamp(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.schedule_copy_policy(uuid),public.copy_schedule(uuid,uuid,bigint,text,uuid,text,text,jsonb,integer),public.schedule_permission_directory(uuid) from public,anon,service_role;
grant execute on function public.schedule_copy_policy(uuid),public.copy_schedule(uuid,uuid,bigint,text,uuid,text,text,jsonb,integer),public.schedule_permission_directory(uuid) to authenticated;

create or replace function public.update_schedule_document(
  target_schedule_id uuid, expected_version bigint, next_document jsonb, schema_version integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_schedule public.schedules;
  parent_day public.production_days;
  actor uuid := auth.uid();
  saved public.schedules;
begin
  if actor is null then raise sqlstate 'PT401' using message = 'Authentication required'; end if;
  if expected_version is null or expected_version < 1 or expected_version >= 9007199254740991 then
    raise sqlstate 'PT400' using message = 'Expected version is required';
  end if;
  -- Do not expose existence, document or version to unauthorized callers.
  select * into current_schedule from public.schedules s where s.id = target_schedule_id;
  if not found or current_schedule.deleted_at is not null
    or not public.can_edit_production(current_schedule.production_id) then
    raise sqlstate 'PT404' using message = 'Schedule unavailable';
  end if;
  perform private.lock_schedule_permissions(current_schedule.organization_id,current_schedule.production_id);
  if not public.schedule_visible(current_schedule.id,'edit') then raise sqlstate 'PT404' using message='Schedule unavailable'; end if;
  -- Lock current authorization/parents against deletion and role changes. SHARE
  -- (not KEY SHARE) conflicts with non-key status/role updates. Order is consistent
  -- with invitation acceptance: organization, production, then memberships.
  perform 1 from public.organizations where id = current_schedule.organization_id and deleted_at is null for share;
  if not found then raise sqlstate 'PT404' using message = 'Schedule unavailable'; end if;
  perform 1 from public.productions where id = current_schedule.production_id and deleted_at is null for share;
  if not found then raise sqlstate 'PT404' using message = 'Schedule unavailable'; end if;
  perform 1 from public.organization_memberships where organization_id = current_schedule.organization_id and user_id = actor for share;
  perform 1 from public.production_memberships where production_id = current_schedule.production_id and user_id = actor for share;
  if not public.can_edit_production(current_schedule.production_id) then
    raise sqlstate 'PT404' using message = 'Schedule unavailable';
  end if;
  -- Lock the day before inspecting/locking its optional phase, so reparenting
  -- cannot change the phase being authorized beneath this transaction.
  select * into parent_day from public.production_days where id = current_schedule.production_day_id and deleted_at is null for share;
  if not found then raise sqlstate 'PT404' using message = 'Schedule unavailable'; end if;
  if parent_day.phase_id is not null then
    perform 1 from public.phases where id = parent_day.phase_id and deleted_at is null for share;
    if not found then raise sqlstate 'PT404' using message = 'Schedule unavailable'; end if;
  end if;
  perform private.validate_schedule_document(next_document, schema_version);
  -- One conditional UPDATE serializes competing writers; the existing trigger
  -- increments the version, attributes the actor and inserts immutable history.
  -- History failure rolls back the update. No force/last-write-wins escape exists.
  update public.schedules s
    set document = next_document, document_schema_version = schema_version,
      town = nullif(btrim(next_document->'meta'->>'town'), '')
    where s.id = target_schedule_id and s.document_version = expected_version
      and s.deleted_at is null and s.production_day_id = current_schedule.production_day_id
    returning s.* into saved;
  if not found then raise sqlstate 'PT409' using message = 'Schedule changed; reload before saving'; end if;
  return to_jsonb(saved);
end;
$$;
