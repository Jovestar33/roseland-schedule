-- Manual distribution only. No background job or send-on-save trigger.
create table private.schedule_email_groups (
 id uuid primary key,organization_id uuid not null references public.organizations(id),
 production_id uuid not null references public.productions(id),creator_id uuid not null references auth.users(id),
 name text not null,recipients jsonb not null,version bigint not null default 1,
 archived_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index schedule_email_groups_production on private.schedule_email_groups(production_id);
create index schedule_email_groups_org on private.schedule_email_groups(organization_id);
create index schedule_email_groups_creator on private.schedule_email_groups(creator_id);
create table private.schedule_email_batches (
 id uuid primary key,schedule_id uuid not null references public.schedules(id),
 organization_id uuid not null references public.organizations(id),creator_id uuid not null references auth.users(id),
 source_version bigint not null,edition integer not null,name text not null,document jsonb not null,documents text not null check(documents in ('schedule','call_sheet','both')),
 include_contacts boolean not null,full_details boolean not null,recipient_manifest jsonb not null,
 created_at timestamptz not null default now()
);
create index schedule_email_batches_schedule on private.schedule_email_batches(schedule_id,created_at desc);
create index schedule_email_batches_org on private.schedule_email_batches(organization_id);
create index schedule_email_batches_creator on private.schedule_email_batches(creator_id,created_at desc);
alter table private.schedule_email_groups enable row level security;
alter table private.schedule_email_batches enable row level security;
revoke all on private.schedule_email_groups,private.schedule_email_batches from public,anon,authenticated,service_role;
alter table private.call_sheet_links add column delivery_id uuid references private.schedule_email_batches(id),add column documents text not null default 'call_sheet' check(documents in ('schedule','call_sheet','both'));
create index call_sheet_links_delivery on private.call_sheet_links(delivery_id);

create function private.validate_email_group_members(members jsonb) returns jsonb language plpgsql set search_path='' as $$
declare member jsonb;result jsonb:='[]';address text;seen text[]:=array[]::text[];
begin
 if jsonb_typeof(members) is distinct from 'array' or jsonb_array_length(members)<1 or jsonb_array_length(members)>100 then raise sqlstate 'PT400' using message='Choose between 1 and 100 recipients';end if;
 for member in select value from jsonb_array_elements(members) loop
  if jsonb_typeof(member) is distinct from 'object' or jsonb_typeof(member->'name') is distinct from 'string' or jsonb_typeof(member->'email') is distinct from 'string' or length(member->>'name')>160 or exists(select 1 from jsonb_object_keys(member)k where k not in ('name','email'))then raise sqlstate 'PT400' using message='Invalid recipient';end if;
  address:=lower(btrim(member->>'email'));
  if length(address)>254 or address!~'^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\.[^[:space:]<>@,;]+$' then raise sqlstate 'PT400' using message='Invalid recipient email';end if;
  if address=any(seen) then raise sqlstate 'PT400' using message='Duplicate recipient email';end if;
  seen:=array_append(seen,address);result:=result||jsonb_build_array(jsonb_build_object('name',btrim(member->>'name'),'email',address));
 end loop;
 return (select jsonb_agg(value order by value->>'email')from jsonb_array_elements(result));
end;$$;
revoke all on function private.validate_email_group_members(jsonb) from public,anon,authenticated,service_role;

create function public.list_schedule_email_groups(target_schedule_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;
begin
 s:=private.require_call_sheet_publisher(target_schedule_id);
 return (select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'recipients',g.recipients,'version',g.version)order by lower(g.name),g.id),'[]')from private.schedule_email_groups g where g.production_id=s.production_id and g.organization_id=s.organization_id and g.archived_at is null);
end;$$;
create function public.save_schedule_email_group(target_schedule_id uuid,target_group_id uuid,group_name text,members jsonb,expected_version bigint,archive_group boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;g private.schedule_email_groups;normalized jsonb;
begin
 s:=private.require_call_sheet_publisher(target_schedule_id);
 if target_group_id is null or archive_group is null then raise sqlstate 'PT400' using message='Invalid group';end if;
 if not archive_group then
  if group_name is null or length(btrim(group_name))<1 or length(group_name)>100 then raise sqlstate 'PT400' using message='Enter a group name';end if;
  normalized:=private.validate_email_group_members(members);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('email-group:'||target_group_id::text,0));
 select * into g from private.schedule_email_groups where id=target_group_id for update;
 if found then
  if g.production_id<>s.production_id or g.organization_id<>s.organization_id then raise sqlstate 'PT404' using message='Group unavailable';end if;
  if archive_group and g.archived_at is not null then return jsonb_build_object('id',g.id,'version',g.version);end if;
  if not archive_group and g.archived_at is null and g.name=btrim(group_name) and g.recipients=normalized and (expected_version is null or g.version=expected_version+1) then return jsonb_build_object('id',g.id,'version',g.version);end if;
  if g.archived_at is not null or g.version is distinct from expected_version then raise sqlstate 'PT409' using message='Group changed; refresh before saving';end if;
  update private.schedule_email_groups set name=case when archive_group then name else btrim(group_name)end,recipients=case when archive_group then recipients else normalized end,archived_at=case when archive_group then now()else null end,version=version+1,updated_at=now()where id=g.id returning * into g;
 else
  if expected_version is not null or archive_group then raise sqlstate 'PT409' using message='Group changed; refresh before saving';end if;
  insert into private.schedule_email_groups(id,organization_id,production_id,creator_id,name,recipients)values(target_group_id,s.organization_id,s.production_id,auth.uid(),btrim(group_name),normalized)returning * into g;
 end if;
 insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)values(s.organization_id,auth.uid(),case when archive_group then 'email_group.archive'else 'email_group.save'end,'email_group',g.id,jsonb_build_object('production',s.production_id,'version',g.version,'recipient_count',jsonb_array_length(g.recipients)));
 return jsonb_build_object('id',g.id,'version',g.version);
end;$$;

create function public.prepare_schedule_email_batch(target_schedule_id uuid,request_id uuid,expected_version bigint,document_selection text,recipient_requests jsonb,include_contacts boolean,full_details boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;b private.schedule_email_batches;item jsonb;manifest jsonb;members jsonb;published jsonb;next_edition integer;
begin
 s:=private.require_call_sheet_publisher(target_schedule_id);
 if request_id is null or document_selection is null or document_selection not in ('schedule','call_sheet','both')or include_contacts is null or full_details is null or (document_selection in ('schedule','both')and not full_details)then raise sqlstate 'PT400' using message='Invalid document selection';end if;
 if jsonb_typeof(recipient_requests) is distinct from 'array' or jsonb_array_length(recipient_requests)<1 or jsonb_array_length(recipient_requests)>100 then raise sqlstate 'PT400' using message='Choose between 1 and 100 recipients';end if;
 for item in select value from jsonb_array_elements(recipient_requests)loop
  if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'id','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or coalesce(item->>'hash','')!~'^[a-f0-9]{64}$' or exists(select 1 from jsonb_object_keys(item)k where k not in ('id','hash','name','email'))then raise sqlstate 'PT400' using message='Invalid recipient request';end if;
 end loop;
 members:=private.validate_email_group_members((select jsonb_agg(value-array['id','hash'])from jsonb_array_elements(recipient_requests)));
 manifest:=(select jsonb_agg(jsonb_build_object('id',value->>'id','hash',value->>'hash','name',btrim(value->>'name'),'email',lower(btrim(value->>'email')))order by lower(btrim(value->>'email')))from jsonb_array_elements(recipient_requests));
 if (select count(distinct value->>'id')from jsonb_array_elements(manifest))<>jsonb_array_length(manifest) or (select count(distinct value->>'hash')from jsonb_array_elements(manifest))<>jsonb_array_length(manifest) then raise sqlstate 'PT400' using message='Duplicate recipient request';end if;
 select * into b from private.schedule_email_batches where id=request_id;
 if found then
  if b.schedule_id<>s.id or b.creator_id<>auth.uid() or b.source_version is distinct from expected_version or b.documents<>document_selection or b.recipient_manifest<>manifest or b.include_contacts<>include_contacts or b.full_details<>full_details then raise sqlstate 'PT409' using message='Send request changed';end if;
 else
  if s.document_version is distinct from expected_version then raise sqlstate 'PT409' using message='Save and review the latest schedule first';end if;
  if(select count(*)from private.schedule_email_batches where creator_id=auth.uid() and created_at>now()-interval '1 minute')>=5 then raise sqlstate 'PT429' using message='Please wait before another send';end if;
  -- Group deliveries keep their own immutable copy. They must never change
  -- the current call-sheet edition or the privacy scope of existing links.
  select coalesce(max(edition),0)+1 into next_edition from private.schedule_email_batches where schedule_id=s.id;
  published:=s.document-'savedAt';
  published:=jsonb_set(published,'{meta,productionContacts}',coalesce((select jsonb_agg((c-array['directoryScope','directoryLabel'])-case when include_contacts then array[]::text[] else array['phone','email'] end) from jsonb_array_elements(coalesce(published->'meta'->'productionContacts','[]'))c),'[]'));
  published:=jsonb_set(published,'{rows}',coalesce((select jsonb_agg((r-array['status','done'])-case when full_details then array[]::text[] else array['desc'] end-case when include_contacts then array[]::text[] else array['contactName','contactTitle','contactPhone','contactEmail'] end)from jsonb_array_elements(published->'rows')r),'[]'));
  insert into private.schedule_email_batches(id,schedule_id,organization_id,creator_id,source_version,edition,name,document,documents,include_contacts,full_details,recipient_manifest)values(request_id,s.id,s.organization_id,auth.uid(),expected_version,next_edition,s.display_name,published,document_selection,include_contacts,full_details,manifest)returning * into b;
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)values(s.organization_id,auth.uid(),'schedule_email.prepare','schedule_email',b.id,jsonb_build_object('schedule',s.id,'source_version',b.source_version,'documents',b.documents,'recipient_count',jsonb_array_length(manifest)));
  for item in select value from jsonb_array_elements(manifest)loop
   insert into private.call_sheet_links(id,schedule_id,organization_id,creator_id,token_hash,recipient,delivery_id,documents)values((item->>'id')::uuid,s.id,s.organization_id,auth.uid(),item->>'hash',item->>'email',b.id,b.documents);
  end loop;
 end if;
 return jsonb_build_object('id',b.id,'edition',b.edition,'documents',b.documents,'recipients',(select jsonb_agg(jsonb_build_object('id',l.id,'email',l.recipient,'state',case when l.email_state='sending' then 'uncertain'else l.email_state end)order by l.recipient)from private.call_sheet_links l where l.delivery_id=b.id));
end;$$;

create function public.list_schedule_email_batches(target_schedule_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;
begin
 s:=private.require_call_sheet_publisher(target_schedule_id);
 return(select coalesce(jsonb_agg(to_jsonb(x)order by x.created_at desc),'[]')from(select b.id,b.created_at,b.documents,b.source_version,b.edition,(select jsonb_agg(jsonb_build_object('id',l.id,'email',l.recipient,'state',case when l.email_state='sending' then 'uncertain'else l.email_state end,'received',l.acknowledged_edition=b.edition,'revoked',l.revoked_at is not null)order by l.recipient)from private.call_sheet_links l where l.delivery_id=b.id)recipients from private.schedule_email_batches b where b.schedule_id=s.id and (b.creator_id=auth.uid()or private.schedule_actor_can(auth.uid(),'organize',s.organization_id,s.production_id,s.id))order by b.created_at desc limit 50)x);
end;$$;
revoke all on function public.list_schedule_email_groups(uuid),public.save_schedule_email_group(uuid,uuid,text,jsonb,bigint,boolean),public.prepare_schedule_email_batch(uuid,uuid,bigint,text,jsonb,boolean,boolean),public.list_schedule_email_batches(uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_schedule_email_groups(uuid),public.save_schedule_email_group(uuid,uuid,text,jsonb,bigint,boolean),public.prepare_schedule_email_batch(uuid,uuid,bigint,text,jsonb,boolean,boolean),public.list_schedule_email_batches(uuid) to authenticated;

create or replace function public.read_call_sheet_recipient(token_hash text,acknowledge_edition integer default null)returns jsonb language plpgsql security definer set search_path='' as $$
declare l private.call_sheet_links;s public.schedules;e private.call_sheet_editions;hits integer;t timestamptz:=clock_timestamp();
begin
 update private.client_view_rate set hits=case when window_at<t-interval '1 minute' then 1 else client_view_rate.hits+1 end,window_at=case when window_at<t-interval '1 minute' then t else window_at end where id returning client_view_rate.hits into hits;
 if hits>240 then return jsonb_build_object('limited',true);end if;
 select * into l from private.call_sheet_links where call_sheet_links.token_hash=read_call_sheet_recipient.token_hash and revoked_at is null and expires_at>t;
 if not found then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended('schedule-policy:'||l.organization_id::text,0));
 select * into l from private.call_sheet_links where id=l.id and revoked_at is null and expires_at>clock_timestamp() for update;
 if not found then return null;end if;
 select * into s from public.schedules where id=l.schedule_id;
 if not found or not private.client_sponsor_allowed(l.creator_id,s) then return null;end if;
 if l.delivery_id is null then
  select * into e from private.call_sheet_editions where schedule_id=s.id order by edition desc limit 1;
 else
  select b.name,b.document,b.edition,b.created_at,b.include_contacts,b.full_details into e.name,e.document,e.edition,e.created_at,e.include_contacts,e.full_details from private.schedule_email_batches b where b.id=l.delivery_id and b.schedule_id=s.id;
 end if;
 if not found then return null;end if;
 if acknowledge_edition is not null then
  if acknowledge_edition<>e.edition then raise sqlstate 'PT409' using message='A newer version is available';end if;
  update private.call_sheet_links set acknowledged_edition=e.edition,acknowledged_at=now()where id=l.id returning * into l;
 end if;
 return jsonb_build_object('name',e.name,'document',case when l.documents='schedule' then e.document #- '{meta,callsheet}' else e.document end,'documents',l.documents,'edition',e.edition,'created_at',e.created_at,'include_contacts',e.include_contacts,'full_details',e.full_details,'acknowledged',l.acknowledged_edition=e.edition,'recipient',l.recipient<>'');
end;$$;
create or replace function public.claim_call_sheet_email(target_link_id uuid,token_hash text,expected_edition integer,claim_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare l private.call_sheet_links;s public.schedules;e private.call_sheet_editions;
begin
 select * into l from private.call_sheet_links where id=target_link_id;
 if not found then raise sqlstate 'PT404' using message='Link unavailable';end if;
 s:=private.require_call_sheet_publisher(l.schedule_id);
 select * into l from private.call_sheet_links where id=target_link_id for update;
 if l.creator_id<>auth.uid() or l.revoked_at is not null or l.expires_at<=now() or l.token_hash is distinct from token_hash or l.recipient='' or claim_id is null then raise sqlstate 'PT404' using message='Email unavailable';end if;
 if l.delivery_id is null then
  select * into e from private.call_sheet_editions where schedule_id=s.id order by edition desc limit 1;
 else
  select b.name,b.document,b.edition,b.created_at,b.include_contacts,b.full_details into e.name,e.document,e.edition,e.created_at,e.include_contacts,e.full_details from private.schedule_email_batches b where b.id=l.delivery_id and b.schedule_id=s.id;
 end if;
 if not found or e.edition is distinct from expected_edition then raise sqlstate 'PT409' using message='A newer version is available';end if;
 if l.email_edition=e.edition then return jsonb_build_object('state',l.email_state);end if;
 update private.call_sheet_links set email_edition=e.edition,email_state='sending',email_claim=claim_id where id=l.id;
 return jsonb_build_object('state','claimed','recipient',l.recipient,'name',e.name,'documents',l.documents,'edition',e.edition);
end;$$;

create or replace function public.list_call_sheet_editions(target_schedule_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;editions jsonb;links jsonb;
begin
 perform public.require_active_schedule_session();select * into s from public.schedules where id=target_schedule_id;
 if not found or not public.schedule_visible(s.id,'read') then raise sqlstate 'PT404' using message='Call sheet unavailable';end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by edition desc),'[]') into editions from(select id,edition,source_version,created_at,include_contacts,full_details from private.call_sheet_editions where schedule_id=s.id order by edition desc limit 100)e;
 select coalesce(jsonb_agg(to_jsonb(l) order by created_at desc),'[]') into links from(select id,recipient,created_at,expires_at,revoked_at,acknowledged_edition,acknowledged_at,email_state,email_edition from private.call_sheet_links where schedule_id=s.id and delivery_id is null and (creator_id=auth.uid() or private.schedule_actor_can(auth.uid(),'organize',s.organization_id,s.production_id,s.id))order by created_at desc limit 100)l;
 return jsonb_build_object('editions',editions,'links',links,'can_issue',private.organization_writable(s.organization_id) and private.client_sponsor_allowed(auth.uid(),s) and public.schedule_visible(s.id,'edit'),'version',s.document_version);
end;$$;

notify pgrst,'reload schema';
