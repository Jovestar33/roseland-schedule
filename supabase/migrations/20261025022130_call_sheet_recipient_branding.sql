-- Keep recipient branding issuer-scoped after the existing link authorization.
-- CREATE OR REPLACE preserves the existing service-role-only function grants.
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
 return jsonb_build_object('name',e.name,'document',case when l.documents='schedule' then e.document #- '{meta,callsheet}' else e.document end,'documents',l.documents,'edition',e.edition,'created_at',e.created_at,'include_contacts',e.include_contacts,'full_details',e.full_details,'acknowledged',l.acknowledged_edition=e.edition,'recipient',l.recipient<>'',
  -- Only the issuing schedule's resolved light logo is public. No organization
  -- identifier, colors, labels, or other presentation settings cross this boundary.
  'logo_on_light',coalesce((select coalesce(nullif(p.config->>'logoOnLight',''),nullif(nullif(p.config->>'logo',''),'/logo-header.png')) from private.organization_presentation p where p.organization_id=s.organization_id),'/logo-call-sheet.png'));
end;$$;
