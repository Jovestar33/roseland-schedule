-- Disambiguate policy record from production alias; covered by account DB tests.
-- Qualify mail-admission parameters after genuine runtime exposed ambiguity.
create or replace function public.admit_local_account_mail(action text,email text,invitation_id uuid,ip_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare k text; cap integer; row_limit private.account_mail_limits; policy_values private.account_policy_versions; eligible boolean;
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
 select * into policy_values from private.account_policy_versions where id;
 eligible:=action='recovery' or exists(select 1 from public.organization_invitations i
  join public.organizations o on o.id=i.organization_id and o.deleted_at is null
  where i.id=admit_local_account_mail.invitation_id and i.email_normalized=lower(btrim(admit_local_account_mail.email)) and i.status='pending' and i.expires_at>clock_timestamp()
  and (i.production_id is null or exists(select 1 from public.productions p where p.id=i.production_id and p.organization_id=i.organization_id and p.deleted_at is null)));
 return jsonb_build_object('allowed',eligible,'termsVersion',policy_values.terms_version,'privacyVersion',policy_values.privacy_version);
end;$$;
notify pgrst, 'reload schema';
