-- B08 local account contract. Deployment/configuration remain separate gates.
-- Auth signup must be disabled; the gated server uses admin invitations only
-- after matching a pending organization invitation. No automatic membership.
create table private.account_policy_versions (
  id boolean primary key default true check(id),
  terms_version text not null,
  privacy_version text not null
);
insert into private.account_policy_versions values(true,'fictional-terms-v1','fictional-privacy-v1');
create table private.account_policy_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default clock_timestamp(),
  source text not null check(source in ('signup','review')),
  primary key(user_id,terms_version,privacy_version)
);
create table private.account_session_activity (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_activity_at timestamptz not null
);
create table private.account_mail_limits (
  bucket text primary key,
  window_start timestamptz not null,
  attempts integer not null check(attempts>0)
);
revoke all on private.account_policy_versions,private.account_policy_acceptances,
  private.account_session_activity,private.account_mail_limits from public,anon,authenticated,service_role;

create function private.capture_signup_policy() returns trigger
language plpgsql security definer set search_path='' as $$
declare p private.account_policy_versions;
begin
 select * into p from private.account_policy_versions where id;
 -- Server-owned app metadata is immutable to ordinary users. Never trust user metadata.
 if new.raw_app_meta_data->>'b08_terms'=p.terms_version
   and new.raw_app_meta_data->>'b08_privacy'=p.privacy_version then
   insert into private.account_policy_acceptances values(new.id,p.terms_version,p.privacy_version,clock_timestamp(),'signup')
   on conflict do nothing;
 end if;
 return new;
end;$$;
revoke all on function private.capture_signup_policy() from public,anon,authenticated,service_role;
create trigger account_signup_policy after insert or update of raw_app_meta_data on auth.users
for each row execute function private.capture_signup_policy();

create function public.get_account_policy_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('termsVersion',p.terms_version,'privacyVersion',p.privacy_version,
  'accepted',exists(select 1 from private.account_policy_acceptances a where a.user_id=auth.uid()
   and a.terms_version=p.terms_version and a.privacy_version=p.privacy_version))
 from private.account_policy_versions p where id;
$$;
create function public.accept_account_policies(terms_version text,privacy_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p private.account_policy_versions; actor uuid:=auth.uid();
begin
 perform public.require_active_schedule_session();
 select * into p from private.account_policy_versions where id for share;
 if actor is null or terms_version is distinct from p.terms_version or privacy_version is distinct from p.privacy_version then
  raise sqlstate 'PT409' using message='Review current policies';
 end if;
 insert into private.account_policy_acceptances values(actor,p.terms_version,p.privacy_version,clock_timestamp(),'review')
 on conflict do nothing;
 return public.get_account_policy_status();
end;$$;

create function public.preview_my_invitation(invitation_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('invitationId',i.id,'organizationName',o.name,'productionName',p.name,
  'organizationRole',i.organization_role,'productionRole',i.production_role,'expiresAt',i.expires_at)
 from public.organization_invitations i
 join public.organizations o on o.id=i.organization_id and o.deleted_at is null
 join auth.users u on u.id=auth.uid() and u.email_confirmed_at is not null
  and lower(btrim(u.email))=i.email_normalized and coalesce(u.banned_until,'-infinity')<=clock_timestamp()
 left join public.productions p on p.id=i.production_id and p.organization_id=i.organization_id and p.deleted_at is null
 where i.id=invitation_id and i.status='pending' and i.expires_at>clock_timestamp()
  and (i.production_id is null or p.id is not null)
  and not exists(select 1 from public.organization_memberships m where m.organization_id=i.organization_id and m.user_id=u.id and m.status<>'active')
  and not exists(select 1 from public.production_memberships m where m.production_id=i.production_id and m.user_id=u.id and m.status<>'active');
$$;

create or replace function private.require_request_session(actor uuid,session_id uuid,expires_at bigint)
returns void language plpgsql security definer set search_path='' as $$
declare session_end timestamptz; created timestamptz; activity timestamptz; exists_session boolean;
begin
 if actor is null or session_id is null or expires_at is null or expires_at<=extract(epoch from clock_timestamp()) then
  raise sqlstate 'PT401' using message='Active session required';
 end if;
 if current_setting('transaction_read_only')='on' then
  select s.not_after,s.created_at into session_end,created from auth.sessions s where s.id=session_id and s.user_id=actor;
 else
  select s.not_after,s.created_at into session_end,created from auth.sessions s where s.id=session_id and s.user_id=actor for share;
 end if;
 exists_session:=found;
 select a.last_activity_at into activity from private.account_session_activity a where a.session_id=require_request_session.session_id and a.user_id=actor;
 if not exists_session or session_end<=clock_timestamp() or expires_at<=extract(epoch from clock_timestamp())
   or coalesce(activity,created)<=clock_timestamp()-interval '60 minutes'
   or not exists(select 1 from auth.users u where u.id=actor and coalesce(u.banned_until,'-infinity')<=clock_timestamp()) then
  raise sqlstate 'PT401' using message='Active session required';
 end if;
end;$$;

-- A dedicated activity signal, never called by background fetch/refresh. The
-- server supplies time, and an expired session cannot renew itself. Like all
-- browser input, this signal is not proof against a compromised client.
create function public.record_account_activity() returns timestamptz
language plpgsql security definer set search_path='' as $$
declare sid uuid:=(auth.jwt()->>'session_id')::uuid; stamp timestamptz;
begin
 perform public.require_active_schedule_session();
 perform pg_advisory_xact_lock(hashtextextended('account-activity:'||sid::text,0));
 perform public.require_active_schedule_session();
 stamp:=clock_timestamp();
 insert into private.account_session_activity values(sid,auth.uid(),stamp)
 on conflict(session_id) do update set last_activity_at=excluded.last_activity_at;
 return stamp;
end;$$;
create function public.get_account_session_deadline() returns timestamptz
language plpgsql stable security definer set search_path='' as $$
declare result timestamptz;
begin
 perform public.require_active_schedule_session();
 select coalesce(a.last_activity_at,s.created_at)+interval '60 minutes' into result
 from auth.sessions s left join private.account_session_activity a on a.session_id=s.id
 where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=auth.uid();
 return result;
end;$$;

-- Atomic with the password mutation, including a lost Auth acknowledgement.
-- not_after is also checked by Auth on refresh and by application admission.
-- Existing shared session locks retain the admitted-transaction boundary.
create function private.expire_sessions_after_password_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.encrypted_password is distinct from old.encrypted_password then
  update auth.sessions set not_after=least(coalesce(not_after,'infinity'),clock_timestamp()) where user_id=new.id;
  insert into public.audit_events(actor_user_id,action,resource_type,resource_id)
    values(new.id,'account.password.sessions_expired','account',new.id);
 end if;
 return new;
end;$$;
revoke all on function private.expire_sessions_after_password_change() from public,anon,authenticated,service_role;
create trigger account_password_session_expiry after update of encrypted_password on auth.users
for each row execute function private.expire_sessions_after_password_change();

-- Service-only mail admission. Hash-only rate keys, no email/IP in response or
-- ledger; all attempts count before provider delivery, including uncertain ones.
create function public.admit_local_account_mail(action text,email text,invitation_id uuid,ip_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare k text; cap integer; row_limit private.account_mail_limits; p private.account_policy_versions; eligible boolean;
begin
 if action is null or email is null or ip_hash is null or action not in ('signup','recovery') or char_length(email) not between 3 and 320 or ip_hash !~ '^[a-f0-9]{64}$' then
  raise sqlstate 'PT400' using message='Request unavailable';
 end if;
 for k in select x from unnest(array['email:'||encode(extensions.digest(lower(btrim(email)),'sha256'),'hex'),'ip:'||ip_hash]) x order by x loop
  perform pg_advisory_xact_lock(hashtextextended('account-mail:'||k,0));
  cap:=case when k like 'email:%' then 5 else 20 end;
  select * into row_limit from private.account_mail_limits where bucket=k;
  if found and row_limit.window_start>clock_timestamp()-interval '10 minutes' and row_limit.attempts>=cap then
   return jsonb_build_object('allowed',false);
  end if;
  insert into private.account_mail_limits values(k,clock_timestamp(),1)
   on conflict(bucket) do update set attempts=case when account_mail_limits.window_start<=clock_timestamp()-interval '10 minutes' then 1 else account_mail_limits.attempts+1 end,
    window_start=case when account_mail_limits.window_start<=clock_timestamp()-interval '10 minutes' then clock_timestamp() else account_mail_limits.window_start end;
 end loop;
 select * into p from private.account_policy_versions where id;
 eligible:=action='recovery' or exists(select 1 from public.organization_invitations i
  join public.organizations o on o.id=i.organization_id and o.deleted_at is null
  where i.id=invitation_id and i.email_normalized=lower(btrim(email)) and i.status='pending' and i.expires_at>clock_timestamp()
  and (i.production_id is null or exists(select 1 from public.productions p where p.id=i.production_id and p.organization_id=i.organization_id and p.deleted_at is null)));
 return jsonb_build_object('allowed',eligible,'termsVersion',p.terms_version,'privacyVersion',p.privacy_version);
end;$$;
revoke all on function public.admit_local_account_mail(text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.admit_local_account_mail(text,text,uuid,text) to service_role;
revoke all on function public.get_account_policy_status(),public.accept_account_policies(text,text),public.preview_my_invitation(uuid),
 public.record_account_activity(),public.get_account_session_deadline() from public,anon,service_role;
grant execute on function public.get_account_policy_status(),public.accept_account_policies(text,text),public.preview_my_invitation(uuid),
 public.record_account_activity(),public.get_account_session_deadline() to authenticated;
notify pgrst,'reload schema';
