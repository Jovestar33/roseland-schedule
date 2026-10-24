create table private.call_sheet_editions(
 id uuid primary key, schedule_id uuid not null references public.schedules(id) on delete restrict,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 edition integer not null check(edition>0),source_version bigint not null,
 name text not null,document jsonb not null,include_contacts boolean not null,full_details boolean not null,
 creator_id uuid not null references auth.users(id) on delete restrict,created_at timestamptz not null default now(),
 unique(schedule_id,edition)
);
create table private.call_sheet_links(
 id uuid primary key,schedule_id uuid not null references public.schedules(id) on delete restrict,
 organization_id uuid not null references public.organizations(id) on delete restrict,
 creator_id uuid not null references auth.users(id) on delete restrict,token_hash text not null unique check(token_hash~'^[a-f0-9]{64}$'),
 recipient text not null default '',created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 days',revoked_at timestamptz,
 acknowledged_edition integer,acknowledged_at timestamptz,
 email_edition integer,email_state text not null default 'not_sent' check(email_state in ('not_sent','sending','accepted','uncertain')),email_claim uuid
);
create index call_sheet_editions_org on private.call_sheet_editions(organization_id);
create index call_sheet_editions_creator on private.call_sheet_editions(creator_id);
create index call_sheet_links_schedule on private.call_sheet_links(schedule_id);
create index call_sheet_links_org on private.call_sheet_links(organization_id);
create index call_sheet_links_creator on private.call_sheet_links(creator_id);
alter table private.call_sheet_editions enable row level security;
alter table private.call_sheet_links enable row level security;
revoke all on private.call_sheet_editions,private.call_sheet_links from public,anon,authenticated,service_role;

create function private.require_call_sheet_publisher(target_schedule_id uuid) returns public.schedules
language plpgsql security definer set search_path='' as $$
declare s public.schedules;
begin
 perform public.require_active_schedule_session();select * into s from public.schedules where id=target_schedule_id;
 if not found then raise sqlstate 'PT404' using message='Call sheet unavailable';end if;
 perform private.lock_schedule_permissions(s.organization_id,s.production_id);perform private.require_organization_writable(s.organization_id);
 select * into s from public.schedules where id=target_schedule_id for update;
 if not private.client_sponsor_allowed(auth.uid(),s) or not public.schedule_visible(s.id,'edit') or not public.mfa_organization_access(s.organization_id) then raise sqlstate 'PT404' using message='Call sheet unavailable';end if;
 return s;
end;$$;
revoke all on function private.require_call_sheet_publisher(uuid) from public,anon,authenticated,service_role;

create function public.issue_call_sheet(target_schedule_id uuid,request_id uuid,expected_version bigint,include_contacts boolean,full_details boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;e private.call_sheet_editions;next_edition integer;published jsonb;
begin
 s:=private.require_call_sheet_publisher(target_schedule_id);
 if request_id is null or include_contacts is null or full_details is null then raise sqlstate 'PT400' using message='Invalid call sheet';end if;
 select * into e from private.call_sheet_editions where id=request_id;
 if found then
  if e.schedule_id<>s.id or e.creator_id<>auth.uid() or e.source_version is distinct from expected_version or e.include_contacts<>include_contacts or e.full_details<>full_details then raise sqlstate 'PT409' using message='Issue request changed';end if;
 else
  if s.document_version is distinct from expected_version then raise sqlstate 'PT409' using message='Save and review the latest schedule first';end if;
  if (select count(*) from private.call_sheet_editions where creator_id=auth.uid() and created_at>now()-interval '1 minute')>=10 then raise sqlstate 'PT429' using message='Please try again later';end if;
  select coalesce(max(edition),0)+1 into next_edition from private.call_sheet_editions where schedule_id=s.id;
  -- Immutable copy. Issue is an explicit sharing boundary: contacts are optional,
  -- on-set/emergency details are deliberately included in every call sheet.
  published:=s.document-'savedAt';
  published:=jsonb_set(published,'{meta,productionContacts}',coalesce((select jsonb_agg((c-array['directoryScope','directoryLabel'])-case when include_contacts then array[]::text[] else array['phone','email'] end) from jsonb_array_elements(coalesce(published->'meta'->'productionContacts','[]'))c),'[]'));
  published:=jsonb_set(published,'{rows}',coalesce((select jsonb_agg((r-array['status','done'])-case when full_details then array[]::text[] else array['desc'] end-case when include_contacts then array[]::text[] else array['contactName','contactTitle','contactPhone','contactEmail'] end)from jsonb_array_elements(published->'rows')r),'[]'));
  insert into private.call_sheet_editions(id,schedule_id,organization_id,edition,source_version,name,document,include_contacts,full_details,creator_id)values(request_id,s.id,s.organization_id,next_edition,s.document_version,s.display_name,published,include_contacts,full_details,auth.uid())returning * into e;
  insert into public.audit_events(organization_id,actor_user_id,action,resource_type,resource_id,metadata)values(s.organization_id,auth.uid(),'call_sheet.issue','call_sheet',e.id,jsonb_build_object('schedule',s.id,'edition',e.edition,'source_version',e.source_version));
 end if;
 return jsonb_build_object('id',e.id,'edition',e.edition,'source_version',e.source_version,'created_at',e.created_at);
end;$$;
create function public.list_call_sheet_editions(target_schedule_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;editions jsonb;links jsonb;
begin
 perform public.require_active_schedule_session();select * into s from public.schedules where id=target_schedule_id;
 if not found or not public.schedule_visible(s.id,'read') then raise sqlstate 'PT404' using message='Call sheet unavailable';end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by edition desc),'[]') into editions from(select id,edition,source_version,created_at,include_contacts,full_details from private.call_sheet_editions where schedule_id=s.id order by edition desc limit 100)e;
 select coalesce(jsonb_agg(to_jsonb(l) order by created_at desc),'[]') into links from(select id,recipient,created_at,expires_at,revoked_at,acknowledged_edition,acknowledged_at,email_state,email_edition from private.call_sheet_links where schedule_id=s.id and (creator_id=auth.uid() or private.schedule_actor_can(auth.uid(),'organize',s.organization_id,s.production_id,s.id))order by created_at desc limit 100)l;
 return jsonb_build_object('editions',editions,'links',links,'can_issue',private.organization_writable(s.organization_id) and private.client_sponsor_allowed(auth.uid(),s) and public.schedule_visible(s.id,'edit'),'version',s.document_version);
end;$$;
create function public.read_issued_call_sheet(target_schedule_id uuid,target_edition integer) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.require_active_schedule_session();if not public.schedule_visible(target_schedule_id,'export') then raise sqlstate 'PT404' using message='Call sheet unavailable';end if;
 return (select jsonb_build_object('name',name,'document',document,'edition',edition,'created_at',created_at,'include_contacts',include_contacts,'full_details',full_details)from private.call_sheet_editions where schedule_id=target_schedule_id and edition=target_edition);
end;$$;
create function public.create_call_sheet_link(target_schedule_id uuid,request_id uuid,token_hash text,recipient_email text,expected_edition integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.schedules;l private.call_sheet_links;latest integer;
begin
 s:=private.require_call_sheet_publisher(target_schedule_id);
 if request_id is null or token_hash is null or token_hash!~'^[a-f0-9]{64}$' or recipient_email is null or length(recipient_email)>254 or (recipient_email<>'' and recipient_email!~'^[^[:space:]<>@,;]+@[^[:space:]<>@,;]+\.[^[:space:]<>@,;]+$')then raise sqlstate 'PT400' using message='Invalid recipient';end if;
 select * into l from private.call_sheet_links where id=request_id;
 if found then
  if l.schedule_id<>s.id or l.creator_id<>auth.uid() or l.token_hash<>token_hash or l.recipient<>lower(btrim(recipient_email)) then raise sqlstate 'PT409' using message='Link request changed';end if;
 else
  select max(edition) into latest from private.call_sheet_editions where schedule_id=s.id;
  if latest is null or latest is distinct from expected_edition then raise sqlstate 'PT409' using message='Review the latest issued version';end if;
  if(select count(*)from private.call_sheet_links where creator_id=auth.uid() and created_at>now()-interval '1 minute')>=30 then raise sqlstate 'PT429' using message='Please try again later';end if;
  insert into private.call_sheet_links(id,schedule_id,organization_id,creator_id,token_hash,recipient)values(request_id,s.id,s.organization_id,auth.uid(),token_hash,lower(btrim(recipient_email)))returning * into l;
 end if;
 return jsonb_build_object('id',l.id,'expires_at',l.expires_at,'revoked',l.revoked_at is not null);
end;$$;
create function public.revoke_call_sheet_link(target_schedule_id uuid,target_link_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.schedules;
begin
 s:=private.require_call_sheet_publisher(target_schedule_id);
 update private.call_sheet_links set revoked_at=coalesce(revoked_at,now())where id=target_link_id and schedule_id=s.id and (creator_id=auth.uid() or private.schedule_actor_can(auth.uid(),'organize',s.organization_id,s.production_id,s.id));
 if not found then raise sqlstate 'PT404' using message='Link unavailable';end if;
end;$$;
-- Service-only exchange: token stays in the URL fragment, outside request URLs.
create function public.read_call_sheet_recipient(token_hash text,acknowledge_edition integer default null)returns jsonb language plpgsql security definer set search_path='' as $$
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
 select * into e from private.call_sheet_editions where schedule_id=s.id order by edition desc limit 1;
 if not found then return null;end if;
 if acknowledge_edition is not null then
  if acknowledge_edition<>e.edition then raise sqlstate 'PT409' using message='A newer version is available';end if;
  update private.call_sheet_links set acknowledged_edition=e.edition,acknowledged_at=now()where id=l.id returning * into l;
 end if;
 return jsonb_build_object('name',e.name,'document',e.document,'edition',e.edition,'created_at',e.created_at,'include_contacts',e.include_contacts,'full_details',e.full_details,'acknowledged',l.acknowledged_edition=e.edition,'recipient',l.recipient<>'');
end;$$;
create function public.claim_call_sheet_email(target_link_id uuid,token_hash text,expected_edition integer,claim_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$
declare l private.call_sheet_links;s public.schedules;e private.call_sheet_editions;
begin
 select * into l from private.call_sheet_links where id=target_link_id;
 if not found then raise sqlstate 'PT404' using message='Link unavailable';end if;
 s:=private.require_call_sheet_publisher(l.schedule_id);
 select * into l from private.call_sheet_links where id=target_link_id for update;
 if l.creator_id<>auth.uid() or l.revoked_at is not null or l.expires_at<=now() or l.token_hash is distinct from token_hash or l.recipient='' or claim_id is null then raise sqlstate 'PT404' using message='Email unavailable';end if;
 select * into e from private.call_sheet_editions where schedule_id=s.id order by edition desc limit 1;
 if not found or e.edition is distinct from expected_edition then raise sqlstate 'PT409' using message='A newer version is available';end if;
 if l.email_edition=e.edition then return jsonb_build_object('state',l.email_state);end if;
 update private.call_sheet_links set email_edition=e.edition,email_state='sending',email_claim=claim_id where id=l.id;
 return jsonb_build_object('state','claimed','recipient',l.recipient,'name',e.name,'edition',e.edition);
end;$$;
create function public.finish_call_sheet_email(target_link_id uuid,claim_id uuid,accepted boolean)returns void language plpgsql security definer set search_path='' as $$
begin
 update private.call_sheet_links set email_state=case when accepted then 'accepted' else 'uncertain' end where id=target_link_id and email_claim=claim_id and email_state='sending';
end;$$;
revoke all on function public.issue_call_sheet(uuid,uuid,bigint,boolean,boolean),public.list_call_sheet_editions(uuid),public.read_issued_call_sheet(uuid,integer),public.create_call_sheet_link(uuid,uuid,text,text,integer),public.revoke_call_sheet_link(uuid,uuid),public.read_call_sheet_recipient(text,integer),public.claim_call_sheet_email(uuid,text,integer,uuid),public.finish_call_sheet_email(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.issue_call_sheet(uuid,uuid,bigint,boolean,boolean),public.list_call_sheet_editions(uuid),public.read_issued_call_sheet(uuid,integer),public.create_call_sheet_link(uuid,uuid,text,text,integer),public.revoke_call_sheet_link(uuid,uuid),public.claim_call_sheet_email(uuid,text,integer,uuid) to authenticated;
grant execute on function public.read_call_sheet_recipient(text,integer),public.finish_call_sheet_email(uuid,uuid,boolean) to service_role;
notify pgrst,'reload schema';
