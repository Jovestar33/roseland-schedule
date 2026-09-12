begin;

set local role postgres;
create extension if not exists pgtap with schema extensions;
set local search_path = public, auth, extensions, pgtap;
select extensions.plan(21);

select extensions.is(
  has_function_privilege('anon', 'public.is_active_org_member(uuid)', 'EXECUTE'),
  false,
  'anonymous users cannot execute the organization-membership helper'
);
select extensions.is(
  has_function_privilege('anon', 'public.is_org_admin(uuid)', 'EXECUTE'),
  false,
  'anonymous users cannot execute the organization-admin helper'
);
select extensions.is(
  has_function_privilege('anon', 'public.can_access_production(uuid)', 'EXECUTE'),
  false,
  'anonymous users cannot execute the production-access helper'
);
select extensions.is(
  has_function_privilege('anon', 'public.can_edit_production(uuid)', 'EXECUTE'),
  false,
  'anonymous users cannot execute the production-edit helper'
);

select extensions.ok(
  has_function_privilege('authenticated', 'public.is_active_org_member(uuid)', 'EXECUTE'),
  'authenticated users can execute the organization-membership helper'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.is_org_admin(uuid)', 'EXECUTE'),
  'authenticated users can execute the organization-admin helper'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.can_access_production(uuid)', 'EXECUTE'),
  'authenticated users can execute the production-access helper'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.can_edit_production(uuid)', 'EXECUTE'),
  'authenticated users can execute the production-edit helper'
);

select extensions.is(
  has_function_privilege('anon', 'public.accept_organization_invitation(uuid)', 'EXECUTE'),
  false,
  'anonymous users cannot execute invitation acceptance'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.accept_organization_invitation(uuid)', 'EXECUTE'),
  'authenticated users can execute invitation acceptance'
);

select extensions.is(
  has_function_privilege(
    'anon',
    'public.bootstrap_first_organization(uuid,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot execute platform bootstrap'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.bootstrap_first_organization(uuid,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  false,
  'authenticated users cannot execute platform bootstrap'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.bootstrap_first_organization(uuid,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'service role can execute platform bootstrap'
);

select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.provision_customer_organization(uuid,uuid,text,text,text,text,text,text,text,text,timestamptz,text)',
    'EXECUTE'
  ),
  false,
  'authenticated users cannot execute organization provisioning'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.provision_customer_organization(uuid,uuid,text,text,text,text,text,text,text,text,timestamptz,text)',
    'EXECUTE'
  ),
  'service role can execute organization provisioning'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.create_organization_invitation(uuid,uuid,text,public.organization_role,uuid,public.production_role,timestamptz,text,timestamptz,text)',
    'EXECUTE'
  ),
  false,
  'authenticated users cannot execute invitation creation'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.create_organization_invitation(uuid,uuid,text,public.organization_role,uuid,public.production_role,timestamptz,text,timestamptz,text)',
    'EXECUTE'
  ),
  'service role can execute invitation creation'
);
select extensions.is(
  has_function_privilege(
    'authenticated',
    'public.revoke_organization_invitation(uuid,uuid,text,text,timestamptz,text)',
    'EXECUTE'
  ),
  false,
  'authenticated users cannot execute invitation revocation'
);
select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.revoke_organization_invitation(uuid,uuid,text,text,timestamptz,text)',
    'EXECUTE'
  ),
  'service role can execute invitation revocation'
);

select extensions.ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
      and (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or has_function_privilege('service_role', p.oid, 'EXECUTE')
      )
  ),
  'automatic-RLS infrastructure is not callable through Data API roles'
);

select extensions.ok(
  not exists (
    select 1
    from unnest(array[
      'public.set_updated_at()',
      'public.protect_organization_identity()',
      'public.protect_production_identity()',
      'public.protect_profile_identity()',
      'public.handle_new_auth_user()'
    ]) signature
    where has_function_privilege('anon', signature, 'EXECUTE')
      or has_function_privilege('authenticated', signature, 'EXECUTE')
  ),
  'trigger-only functions are not callable through Data API roles'
);

select * from extensions.finish();
rollback;
