# Authorization Model

Status: Phase 0 design. Default deny applies to database tables, storage objects, server endpoints, realtime channels, and share-link projections.

## Authority planes

Administrative control is deliberately separated:

- Infrastructure owner: controls GitHub, hosting, Supabase projects, migrations, environment configuration, and incident recovery. This is not an application login or tenant role.
- Organization owner: the highest ordinary application role. The initial app account owns the Roseland Pictures organization and administers all of its productions.
- Platform operator: a restricted internal designation for platform bootstrap, migration, and exceptional support. Operator records live outside exposed application schemas and do not grant a normal browser session blanket tenant access.

Platform operations run through dedicated server-only actions, verify an active operator record, require MFA/recent authentication where interactive, require a reason for sensitive access, and create an audit event. Normal operator activity still uses ordinary organization/production RLS.

Supabase secret/service-role credentials are infrastructure credentials, not “superadmin accounts.” They remain server-only, use separate clients from user sessions, and never enter browser code, URLs, logs, screenshots, or chat.

## Roles

- Owner/Admin: organization settings, members, productions, all content, export/deletion initiation, and security-sensitive actions.
- Producer/Editor: create and edit authorized productions, days, schedules, versions, contacts, locations, and documents; create/revoke permitted share links.
- Viewer: read authorized internal production material; no mutation or member administration.
- External recipient: no account-derived tenant access; receives only an explicit share projection with scope, expiry, and revocation.

Every authenticated user belongs to an organization. Non-admin users also require active membership in each production they can access. Organization owners/admins administer all productions; editors and viewers see only explicitly assigned productions. Removing either membership promptly removes database, API, realtime, and storage access.

Specialized client, vendor, crew, and talent roles are deferred until their projections are designed.

## Initial Roseland bootstrap

The first bootstrap is a one-time server-only transaction:

1. Create or invite the initial Supabase Auth user through an authorized administrative path.
2. Create the Roseland Pictures organization.
3. Add that user as active organization Owner.
4. Add the restricted platform-operator designation.
5. Record the bootstrap audit event.
6. Verify the transaction cannot be replayed after any organization exists.
7. Require MFA before the operator performs later platform-sensitive actions.

No public signup or ordinary authenticated user can claim the first organization. Bootstrap code remains incapable of creating a second “first” organization.

## Permission matrix

| Capability | Owner/Admin | Producer/Editor | Viewer | Share recipient |
|---|---:|---:|---:|---:|
| Read authorized production | yes | yes | yes | projection only |
| Edit schedules/days | yes | yes | no | no |
| Restore versions | yes | yes | no | no |
| Manage members/roles | yes | no | no | no |
| Delete/restore production | yes | limited by policy | no | no |
| Export organization | yes | no | no | no |
| Create/revoke share link | yes | permitted scopes | no | no |
| Read audit/security events | yes | limited operational events | no | no |

## RLS policy model

- RLS is enabled in the migration that creates every exposed table; no interval with an unprotected table is acceptable.
- Policies exist separately for SELECT, INSERT, UPDATE, and DELETE and require active membership plus the necessary role.
- New tenant rows must derive organization/user identity from the authenticated session or verified parent—not trust arbitrary client-supplied IDs.
- Updates prevent moving a row to another organization or production.
- Membership and role mutation requires an owner/admin and prevents removing or demoting the final owner.
- Helper functions such as `is_active_org_member` and `has_org_role` are minimal, reviewed, search-path pinned, and tested for recursion and privilege escalation.
- The service-role credential bypasses RLS and therefore remains server-only, narrowly used, redacted, and unavailable to previews or browser bundles.
- Realtime subscriptions reuse the same table policies and receive explicit cross-tenant tests.

## Table policy matrix

| Tables | SELECT | INSERT/UPDATE | DELETE |
|---|---|---|---|
| organizations | active member | owner/admin for settings | privileged soft-delete workflow only |
| organization memberships | own row; owners/admins see tenant roster | owner/admin; invitation acceptance is a scoped server flow | owner/admin, never final owner |
| productions, phases, days | authorized tenant/production member | owner/admin/editor in authorized scope | recoverable owner/admin or explicitly permitted editor action |
| schedules, versions, templates | authorized member; viewer read only | owner/admin/editor; version rows append only | schedules/templates recoverable by policy; versions immutable |
| production memberships | own row plus tenant admins | owner/admin | owner/admin with final-access safeguards |
| share links | creator and authorized managers; token hash never selected to clients | owner/admin or permitted editor | revoke rather than hard delete |
| audit events | owner/admin; limited safe operational projection if later approved | trusted server/database path only | no client delete |
| migration sources | migration administrators only | trusted importer only | no routine client access |

Future people, locations, assignments, call sheets, documents, and itinerary tables inherit production authorization but require separate policies and tests when created. No generic “all tenant tables” policy is copied without review.

## Public links

Anonymous clients never receive broad table SELECT permission. A server route resolves a hashed token, checks resource, scope, expiry, revocation, and rate limits, then returns an allowlisted projection. Internal notes, personal contact details, audit data, unpublished locations, and unrelated schedule fields are excluded unless the selected share scope explicitly requires them.

Legacy view URLs map to stable schedule IDs for at least 12 months after cutover. Tokens are not written to logs, analytics, referrers, or error reports. New links default to 30-day expiry, are revocable, and omit contact details and internal notes unless an explicit scope requires them. Responses use restrictive cache and referrer policies.

## Storage authorization

- Object ownership is anchored by an authorized database record and tenant-prefixed path.
- Upload, list, download, replace, and delete policies are tested independently.
- Signed URLs are short lived and revocation-sensitive where practical.
- Generated public outputs are separate from internal source documents.
- File type, size, extension, and content validation precede later attachment support.

## Server checks

RLS is the final database boundary, not the only check. Server actions validate authentication, permission, resource relationship, payload schema, concurrency version, abuse limits, and output projection. Administrative and destructive actions require recent authentication where appropriate and produce audit events.

## Required automated tests

For each table and operation, test owner, editor, viewer, removed member, anonymous user, expired share link, and a user in another organization. Include guessed UUIDs, changed tenant IDs, nested-parent substitution, bulk operations, realtime subscriptions, storage paths, and service endpoints. The release gate is that cross-tenant access returns no data and causes no mutation.
