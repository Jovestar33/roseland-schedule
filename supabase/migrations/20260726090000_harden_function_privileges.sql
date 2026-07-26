-- PostgreSQL grants function execution to PUBLIC by default, and older hosted
-- Data API automation can also grant anon/authenticated directly. Establish a
-- deny-by-default baseline, then expose only the reviewed application RPCs.

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

revoke all on function public.set_updated_at()
  from public, anon, authenticated;
revoke all on function public.protect_organization_identity()
  from public, anon, authenticated;
revoke all on function public.protect_production_identity()
  from public, anon, authenticated;
revoke all on function public.protect_profile_identity()
  from public, anon, authenticated;
revoke all on function public.handle_new_auth_user()
  from public, anon, authenticated;

revoke all on function public.is_active_org_member(uuid)
  from public, anon, authenticated;
revoke all on function public.is_org_admin(uuid)
  from public, anon, authenticated;
revoke all on function public.can_access_production(uuid)
  from public, anon, authenticated;
revoke all on function public.can_edit_production(uuid)
  from public, anon, authenticated;

grant execute on function public.is_active_org_member(uuid)
  to authenticated;
grant execute on function public.is_org_admin(uuid)
  to authenticated;
grant execute on function public.can_access_production(uuid)
  to authenticated;
grant execute on function public.can_edit_production(uuid)
  to authenticated;

revoke all on function public.bootstrap_first_organization(
  uuid, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.bootstrap_first_organization(
  uuid, text, text, text, text, text, text
) to service_role;

revoke all on function public.accept_organization_invitation(uuid)
  from public, anon, authenticated;
grant execute on function public.accept_organization_invitation(uuid)
  to authenticated;

revoke all on function public.provision_customer_organization(
  uuid, uuid, text, text, text, text, text, text, text, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.provision_customer_organization(
  uuid, uuid, text, text, text, text, text, text, text, text, timestamptz, text
) to service_role;

revoke all on function public.create_organization_invitation(
  uuid, uuid, text, public.organization_role, uuid, public.production_role, timestamptz, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.create_organization_invitation(
  uuid, uuid, text, public.organization_role, uuid, public.production_role, timestamptz, text, timestamptz, text
) to service_role;

revoke all on function public.revoke_organization_invitation(
  uuid, uuid, text, text, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.revoke_organization_invitation(
  uuid, uuid, text, text, timestamptz, text
) to service_role;

-- The hosted project's automatic-RLS event-trigger helper is infrastructure,
-- not an API RPC. It is absent locally, so revoke it conditionally.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute
      'revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role';
  end if;
end
$$;
