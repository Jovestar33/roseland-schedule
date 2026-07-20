# Platform Server Workflows

Status: implemented on draft PR #5 and migrated only to `roseland-schedule-dev`. The routes are disabled by default and have no user interface.

## Purpose

These workflows create the trusted boundary for repeatable customer-organization provisioning and organization invitation administration. Browser code never receives the Supabase secret key and cannot call the database mutation functions directly.

## Server routes

- `POST /api/platform/organizations`: restricted platform-superadmin provisioning for an existing verified owner account.
- `POST /api/platform/invitations`: organization Owner/Admin invitation creation, including optional production membership.
- `POST /api/platform/invitations/{invitationId}/revoke`: pending-invitation revocation with a required reason.

Every request requires bounded JSON, a log-safe `Idempotency-Key`, a verified Supabase access token, AAL2 MFA, recent non-refresh authentication, and same-origin browser context. Responses are private/no-store and expose only a resource ID, request ID, and generic error.

## Database boundary

The mutation functions are executable only by the Supabase `service_role`. They independently verify the supplied actor against restricted platform-operator or active organization membership records before changing data.

- Only an active platform `superadmin` may provision an organization.
- Provisioning requires a verified, non-anonymous owner account and atomically creates the organization, active owner membership, idempotency record, and audit event.
- Owners may invite Owner/Admin/Member roles. Admins may invite Members only.
- Production invitations must reference a production in the same organization.
- Invitation creation and revocation are transactional, idempotent, rate-bounded, and audited.
- No authenticated or anonymous database role can execute these server functions or read private idempotency/operator records.

The browser access token is verified with Supabase Auth before its claims are used. The server then validates issuer, audience, subject, expiry, anonymity, AAL, and the most recent non-refresh authentication method. The server secret is sent only as the Supabase `apikey`; it is never used as a browser bearer token.

## Configuration

Required server-only settings are documented in `.env.example`:

- `SUPABASE_PLATFORM_WORKFLOWS_ENABLED=true`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (or temporary legacy `SUPABASE_SERVICE_ROLE_KEY` compatibility)

The feature flag defaults off. Do not add these settings to Netlify production or deploy previews during the active stability freeze. Future Supabase/Vercel development configuration must use development-project values only.

## Validation evidence

- 93 database authorization/workflow tests pass locally and against `roseland-schedule-dev`.
- 11 application contract tests cover validation, international preferences, roles, idempotency keys, JWT claim binding, MFA, and stale authentication.
- Local and hosted project-schema lint report no warnings.
- Application lint and production build pass.
- A built-app request confirms the routes return `404` while the feature flag is disabled.

Synthetic workflow records are rolled back after each database test. No real organization, account, membership, or invitation has been created by this implementation.
