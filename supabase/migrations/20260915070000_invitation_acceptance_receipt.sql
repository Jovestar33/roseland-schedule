-- Recipient-only confirmation for an uncertain acceptance response. Acceptance
-- itself retains its existing single-use, verified-email and suspension rules.
create function public.get_my_invitation_acceptance(invitation_id uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('invitationId', i.id, 'organizationId', i.organization_id, 'acceptedAt', i.accepted_at)
  from public.organization_invitations i
  join auth.users u on u.id = auth.uid() and u.id = i.accepted_by
  join public.organizations o on o.id = i.organization_id and o.deleted_at is null
  join public.organization_memberships m on m.organization_id = i.organization_id
    and m.user_id = u.id and m.status = 'active'
  where i.id = invitation_id and i.status = 'accepted' and i.accepted_at is not null
    and u.email_confirmed_at is not null and lower(btrim(u.email)) = i.email_normalized
    and (i.production_id is null or exists (
      select 1 from public.productions p
      join public.production_memberships pm on pm.production_id = p.id
        and pm.organization_id = p.organization_id and pm.user_id = u.id and pm.status = 'active'
      where p.id = i.production_id and p.organization_id = i.organization_id and p.deleted_at is null
    ));
$$;
revoke all on function public.get_my_invitation_acceptance(uuid) from public, anon, service_role;
grant execute on function public.get_my_invitation_acceptance(uuid) to authenticated;
comment on function public.get_my_invitation_acceptance(uuid) is
  'Own accepted invitation receipt only, with verified matching email and active parents/memberships. Null is not proof an earlier request failed. Data API session admission applies.';
