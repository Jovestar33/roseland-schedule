-- Hosted projects created with legacy API auto-exposure can grant privileges
-- directly to Data API roles when objects are created. Revoke those grants
-- explicitly, then restore only the intended least-privilege surface.

revoke all on schema private from public, anon, authenticated;

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.organization_invitations from public, anon, authenticated;
revoke all on table public.audit_events from public, anon, authenticated;
revoke all on table private.platform_operators from public, anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select on table public.organization_invitations to authenticated;
grant select on table public.audit_events to authenticated;

revoke all on function public.bootstrap_first_organization(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.bootstrap_first_organization(uuid, text, text, text, text, text, text)
  to service_role;

revoke all on function public.accept_organization_invitation(uuid)
  from public, anon, authenticated;
grant execute on function public.accept_organization_invitation(uuid)
  to authenticated;

revoke all on function public.protect_profile_identity()
  from public, anon, authenticated;
revoke all on function public.handle_new_auth_user()
  from public, anon, authenticated;
