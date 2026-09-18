-- A missing trusted actor assurance must be false, never SQL NULL in a permission predicate.
create or replace function public.mfa_organization_access(target_organization_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.request_actor() is not null and
 (not private.organization_requires_mfa(private.request_actor(),target_organization_id)
  or coalesce(private.request_actor_aal(private.request_actor())='aal2',false));
$$;
notify pgrst,'reload schema';
