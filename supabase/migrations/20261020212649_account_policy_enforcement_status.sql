-- Expose the existing enforcement switch without changing policy settings,
-- acceptance records, grants, or the meaning of the accepted field.
create or replace function public.get_account_policy_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('termsVersion',p.terms_version,'privacyVersion',p.privacy_version,
  'enforced',p.enforce_acceptance,
  'accepted',exists(select 1 from private.account_policy_acceptances a where a.user_id=auth.uid()
   and a.terms_version=p.terms_version and a.privacy_version=p.privacy_version))
 from private.account_policy_versions p where id;
$$;
revoke all on function public.get_account_policy_status() from public,anon;
grant execute on function public.get_account_policy_status() to authenticated;
notify pgrst,'reload schema';
