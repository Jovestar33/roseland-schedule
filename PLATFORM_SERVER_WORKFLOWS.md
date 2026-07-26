# Platform Server Workflows

Status: implemented on draft PR #5 and migrated only to `roseland-schedule-dev`. The organization/invitation routes are disabled by default and have no administration interface. The separate development Auth/MFA setup page is also disabled by default.

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

## Development Auth and MFA setup

The isolated `/platform/setup` page supports the first development account's email/password sign-in, TOTP authenticator enrollment, and AAL2 session verification. It is not a replacement for the live login and does not read or change schedule data.

The page is fail-closed behind a separate server-only switch:

- `SUPABASE_AUTH_SETUP_ENABLED=true`
- `SUPABASE_AUTH_SETUP_PROJECT_REF`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

The expected project ref must match the HTTPS Supabase hostname. Only a modern `sb_publishable_…` key is accepted; secret and service-role keys are rejected before rendering. The publishable key is intentionally the only credential passed to browser code. Keep the switch absent/false on Netlify and every production environment.

After the account reaches AAL2, the initial Roseland organization, Owner membership, and restricted platform-operator designation must still be created through the existing one-time server-only bootstrap transaction. The setup page cannot perform or claim that bootstrap.

### Completed development bootstrap

On 2026-07-26, the initial development Auth identity enrolled and verified one TOTP factor. The server-only bootstrap transaction then created exactly one Roseland Pictures organization with an active Owner membership, an active MFA-required platform `superadmin` designation, and one `platform.bootstrap.completed` audit event.

Post-transaction verification confirmed that anonymous and authenticated roles cannot execute the bootstrap function, the service role retains the intended permission, and a replay attempt is rejected without creating duplicate records. The browser setup session was signed out and its local server stopped afterward. This state exists only in `roseland-schedule-dev`; it does not affect the live Netlify application.

## Validation evidence

- 93 database authorization/workflow tests pass locally and against `roseland-schedule-dev`.
- 15 application contract tests cover setup fail-closed configuration, secret-key rejection, validation, international preferences, roles, idempotency keys, JWT claim binding, MFA, and stale authentication.
- Local and hosted project-schema lint report no warnings.
- Application lint and production build pass.
- A built-app request confirms the routes return `404` while the feature flag is disabled.

Synthetic workflow records are rolled back after each database test. Separately, the explicitly authorized development bootstrap created the initial development account state, Roseland Pictures organization, Owner membership, restricted operator designation, and audit event described above. No customer organization, invitation, production data, or live application data was created or changed.
