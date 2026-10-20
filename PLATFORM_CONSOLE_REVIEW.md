# Platform administration — October 20, 2026

## Local review scope

Adds a Platform tab for accounts with an active private `superadmin` designation. Organization Super Admin status alone does not qualify. The existing MFA/session/policy admission and organization-creation workflow remain authoritative.

The console provides a searchable, cursor-paginated organization overview, lifecycle status and recovery deadlines, membership-gated workspace links, and a styled organization-creation form with explicit review and exact-request retry behavior. The overview reveals only organization metadata; it does not read schedules, list customer contact details, grant membership, or provide impersonation.

Billing is explicitly shown as not connected. Subscription/payment/service changes, exceptional account recovery, permanent deletion, and new platform-role assignment controls are not implemented by this increment.

Canonical preview: http://127.0.0.1:3532/review?screen=provisioning

All changes are local. No deployment, hosted migration, real customer account, or production schedule changed.

## Access implementation

- `GET /api/platform/console` verifies the bearer token with Supabase Auth, checks account verification, AAL2 and session claims, and binds SQL actor headers to that verified identity.
- Self-designation discovery returns only the current actor's designation. Organization metadata additionally requires authentication within 15 minutes.
- The public RPC is security invoker and executable only by the trusted server role.
- The definer helper lives in the non-exposed `platform_console_private` schema, with an empty search path. It validates service/actor context, admitted session, AAL2, current designation, and recent authentication before returning organization metadata.
- No access to the existing private schema was added. No new table grants or membership bypasses were added.
- Search is applied on the server; pages return at most 26 records (25 displayed plus a next-page signal). Only an active membership offers Open workspace; normal workspace checks still apply.
- The additive SQL file was applied directly to the fictional local database for iteration. Migration history was not advanced and hosted application is still pending a release decision.

## Fresh validation

- 263 platform tests passed, including new route authentication/input and response-binding coverage.
- 125 editor tests passed.
- 20 transactional pgTAP checks passed: anonymous/browser RPC denial, private-schema isolation, organization-owner denial, designated access, search/cursor behavior, no inferred membership, MFA/freshness, actor substitution, designation revocation, and session revocation.
- Production build passed. Only the two previously recorded hook warnings remain.
- Local Supabase security advisor: no warning-or-higher findings. Loopback requires `sslmode=disable`; no hosted TLS settings changed.
- Browser: Organization Super Admin lacks the Platform tab. Designated Platform Super Admin can sign in with genuine local Auth/MFA, open the console without any organization membership, search for Roseland Preview, and see its status without an Open workspace action.
- Browser: new-organization input reaches an explicit review; backing out retains the draft and Clear resets it. No organization was created through this browser test. The existing provisioning regression suite passed; no claim of a new full creation/notification acceptance test is made.

## Fictional test account

The user explicitly approved creating `platform-review-20261020@example.test` only in the local service at `127.0.0.1:56521`, enrolling a test authenticator, and retaining a private fixture file. The account has platform authority over local test records and no organization membership. Credentials and MFA material are excluded from Git and this report. No production platform designation was changed.

## Remaining acceptance

Review the platform and organization-admin experience with the team. This increment does not establish complete platform-management readiness. Billing/service integration needs a provider and workflow implementation; exceptional recovery and operational purge remain distinct work. Fresh mobile/native-PDF acceptance from the editor catch-up is still outstanding.
