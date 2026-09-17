-- Organization-wide presentation writes belong to organization leadership only.
create table private.organization_presentation (
 organization_id uuid primary key references public.organizations(id) on delete restrict,
 version bigint not null check(version>0), config jsonb not null,
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
create table private.organization_presentation_receipts (
 request_id uuid primary key, organization_id uuid not null references public.organizations(id) on delete restrict,
 actor_id uuid not null references auth.users(id), fingerprint text not null, version bigint not null,
 created_at timestamptz not null default now()
);
alter table private.organization_presentation enable row level security;
alter table private.organization_presentation_receipts enable row level security;
revoke all on private.organization_presentation,private.organization_presentation_receipts from public,anon,authenticated,service_role;

create function private.validate_organization_presentation(cfg jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare item record; entry jsonb; names text[]:='{}';
 colors text[]:=array['--pink','--pink-dark','--pink-light','--black','--row-even','--row-hover','--g100'];
 styles text[]:=array['aShoot','aLunch','aDinner','aWrap','aDayOff','aDrive','aMove','aCrewCall','aBreakfast','aBreak','aSetup','aOther'];
 labels text[]:=array['appTitle','hdrTitle','colAction','colLocation','colDesc','colNotes','colTimeIn','colDuration','colTimeOut','colDone','metaTown','metaDate','metaCall','metaProd','metaDir','metaDp','btnAddRow'];
begin
 if cfg is null or jsonb_typeof(cfg)<>'object' or octet_length(cfg::text)>3000000 or (cfg-array['actions','actionStyles','colors','labels','logo'])<>'{}' then raise sqlstate 'PT400' using message='Invalid organization configuration'; end if;
 for item in select * from jsonb_each(cfg) loop
  if item.key='actions' then
   if jsonb_typeof(item.value)<>'array' or jsonb_array_length(item.value)>100 then raise sqlstate 'PT400' using message='Invalid actions'; end if;
   for entry in select value from jsonb_array_elements(item.value) loop
    if jsonb_typeof(entry)<>'object' or (entry-array['name','color'])<>'{}' or jsonb_typeof(entry->'name') is distinct from 'string' or length(btrim(entry->>'name')) not between 1 and 100 or entry->>'name' ~ '[[:cntrl:]]' or lower(btrim(entry->>'name')) in ('other','sunrise','sunset') or lower(btrim(entry->>'name'))=any(names) or jsonb_typeof(entry->'color') is distinct from 'string' or not (entry->>'color'='' or entry->>'color'=any(styles)) then raise sqlstate 'PT400' using message='Invalid action name or style'; end if;
    names:=array_append(names,lower(btrim(entry->>'name')));
   end loop;
  elsif item.key in ('colors','actionStyles','labels') then
   if jsonb_typeof(item.value)<>'object' then raise sqlstate 'PT400' using message='Invalid presentation map'; end if;
   for entry in select jsonb_build_object('key',key,'value',value) from jsonb_each(item.value) loop
    if item.key='colors' then
     if not (entry->>'key'=any(colors)) or jsonb_typeof(entry->'value')<>'string' or entry->>'value' !~ '^#[0-9a-fA-F]{6}$' then raise sqlstate 'PT400' using message='Invalid palette color'; end if;
    elsif item.key='labels' then
     if not (entry->>'key'=any(labels)) or jsonb_typeof(entry->'value')<>'string' or length(entry->>'value')>160 or entry->>'value' ~ '[[:cntrl:]]' then raise sqlstate 'PT400' using message='Invalid label'; end if;
    else
     if not (entry->>'key'=any(styles)) or jsonb_typeof(entry->'value')<>'object' or (entry->'value'-array['bg','text'])<>'{}' or jsonb_typeof(entry->'value'->'bg') is distinct from 'string' or jsonb_typeof(entry->'value'->'text') is distinct from 'string' or entry->'value'->>'bg' !~ '^#[0-9a-fA-F]{6}$' or entry->'value'->>'text' !~ '^#[0-9a-fA-F]{6}$' then raise sqlstate 'PT400' using message='Invalid action colors'; end if;
    end if;
   end loop;
  elsif item.key='logo' and item.value<>'null'::jsonb then
   if jsonb_typeof(item.value)<>'string' or length(cfg->>'logo')>2800000 or cfg->>'logo' !~ '^data:image/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$' then raise sqlstate 'PT400' using message='Use an embedded PNG, JPEG, WebP or SVG logo'; end if;
  end if;
 end loop;
end; $$;

create function public.read_organization_presentation(target_organization_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare member_role text; p private.organization_presentation;
begin
 perform public.require_active_schedule_session();
 select m.role::text into member_role from public.organization_memberships m join public.organizations o on o.id=m.organization_id where m.organization_id=target_organization_id and m.user_id=auth.uid() and m.status='active' and o.deleted_at is null;
 if member_role is null then raise sqlstate 'PT404' using message='Organization settings unavailable'; end if;
 select * into p from private.organization_presentation where organization_id=target_organization_id;
 return jsonb_build_object('organization_id',target_organization_id,'version',coalesce(p.version,0),'config',coalesce(p.config,'{}'::jsonb),'can_manage',member_role in ('owner','admin'));
end; $$;
create function public.save_organization_presentation(target_organization_id uuid,request_id uuid,expected_version bigint,next_config jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare fp text; receipt private.organization_presentation_receipts; current_version bigint;
begin
 perform public.require_active_schedule_session();
 perform private.lock_schedule_permissions(target_organization_id);
 if not exists(select 1 from public.organization_memberships where organization_id=target_organization_id and user_id=auth.uid() and status='active' and role in ('owner','admin')) then raise sqlstate 'PT404' using message='Organization settings write unavailable'; end if;
 if request_id is null or expected_version is null or expected_version<0 or expected_version>=9007199254740991 then raise sqlstate 'PT400' using message='Invalid request or version'; end if;
 perform private.validate_organization_presentation(next_config);
 fp:=private.workflow_fingerprint(jsonb_build_object('organization',target_organization_id,'version',expected_version,'config',next_config));
 select * into receipt from private.organization_presentation_receipts where organization_presentation_receipts.request_id=save_organization_presentation.request_id;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.organization_id<>target_organization_id or receipt.fingerprint<>fp then raise sqlstate 'PT409' using message='Request already used'; end if;
  return jsonb_build_object('confirmed',true,'organization_id',target_organization_id,'request_id',request_id,'version',receipt.version);
 end if;
 select version into current_version from private.organization_presentation where organization_id=target_organization_id;
 if coalesce(current_version,0)<>expected_version then raise sqlstate 'PT409' using message='Settings changed; review the current version'; end if;
 insert into private.organization_presentation values(target_organization_id,expected_version+1,next_config,auth.uid(),now()) on conflict(organization_id) do update set version=excluded.version,config=excluded.config,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 insert into private.organization_presentation_receipts(request_id,organization_id,actor_id,fingerprint,version) values(request_id,target_organization_id,auth.uid(),fp,expected_version+1);
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata) values(target_organization_id,auth.uid(),'organization.presentation.update','organization',target_organization_id,jsonb_build_object('version',expected_version+1));
 return jsonb_build_object('confirmed',true,'organization_id',target_organization_id,'request_id',request_id,'version',expected_version+1);
end; $$;
revoke execute on function private.validate_organization_presentation(jsonb) from public,anon,authenticated,service_role;
revoke execute on function public.read_organization_presentation(uuid),public.save_organization_presentation(uuid,uuid,bigint,jsonb) from public,anon,service_role;
grant execute on function public.read_organization_presentation(uuid),public.save_organization_presentation(uuid,uuid,bigint,jsonb) to authenticated;
