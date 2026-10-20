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

Review the platform and organization-admin experience with the team. This increment does not establish complete platform-management readiness. Billing/service integration needs a provider and workflow implementation; exceptional recovery and operational purge remain distinct work. Subsequent mobile and native-PDF checks are recorded in [ACCEPTANCE_REVIEW.md](./ACCEPTANCE_REVIEW.md).


## Original superuser requirements reconciliation — October 20

Source: the human planning decisions in “Roseland Schedule — Voice and Planning”, chat `01a092e9-5cd0-7100-8feb-2b20d2a899fa`. The September 17–18 timestamps below are UTC. This is a source/implementation review; it does not certify hosted behavior or every administrator journey.

| Original requirement | Current implementation and evidence | Status / remaining work |
| --- | --- | --- |
| Separate Platform Super Admin from customer Organization Super Admin (Sep 17, 02:51–02:53 and 03:09) | `PlatformConsole.tsx` and its authenticated API/private designation are separate from organization membership. No automatic workspace membership or impersonation. | Implemented locally for overview/provisioning; not a complete platform operations console. |
| Organization, Production, Schedule permission tabs (Sep 17, 02:50) | `LocalSchedulePermissions.tsx` has all three scopes, named targets, inherited restrictions and effective-access review. | Implemented locally. This pass clarifies defaults, blocked-action semantics and inherited authority. |
| Leadership-only role/permission administration (Sep 17, 02:58) | Existing permission RPCs enforce scope/role authority. Production roles can be assigned to ordinary members. `LocalOrganizationMembers.tsx` supports suspension/reinstatement. | Partial: no complete UI/API workflow for changing existing organization members' roles. Production role assignment also lacks the richer receipt/revision contract needed for robust concurrent administration. |
| Generous defaults, optional restrictions; Organizer can delete/restore unless restricted (Sep 17, 03:18 and 03:22–03:23) | Permission evaluation grants standard capabilities and layers deny rules. Higher-authority restrictions remain binding. | Implemented locally; current role guide explains this without adding a required configuration step. |
| Organization Super Admin alone controls purchasing, services, cancellation and financial details (Sep 17, 02:53:47) | Billing is explicitly unavailable in the platform console. | Missing: provider, organization-owner-only billing/service workflow and separation of service cancellation from data deletion. No payment implementation claimed. |
| Organization Super Admin can suspend Admins (Sep 18, 00:40:42) | Member lifecycle UI/API and backend enforce scoped authority, reason, confirmation, retries and last-active-owner protection. | Implemented locally; later real-account acceptance remains required. |
| Organization deletion has a 30-day cancellation/recovery window (Sep 18, 00:41:02) | Organization lifecycle supports request/cancel and preserves independent restrictions. | Implemented locally. Permanent purge is separate; reaching the deadline does not imply implemented deletion of all data. |
| Retain existing unsaved-work protection (Sep 17, 03:30:59) | Panel dirty state feeds workspace navigation protection. | Fixed an omission here: unfinished production-role assignment now protects its scope and offers Cancel. Failed requests retain the draft. |
| Assisted account/MFA recovery | Settled authority and identity-proof decisions are in `ACCOUNT_RECOVERY_ADMIN_DECISIONS.md`. | Missing execution mechanism: target-bound, expiring, one-use recovery; factor/session handling, audit and notification. Email alone is not identity proof. This pass does not reset factors. |

### Bounded changes in this pass

The permissions screen now has a collapsible role guide, named editing scope, clear restriction semantics and explicit Super Admin authority labels. Scope changes clear the previous scope's access result while loading. Mutation controls respect effective management access and read-only state. Production-role editing appears in Production scope only; its unfinished member/role selection participates in draft protection and has a Cancel action. No new privileges, database policies, role grants or real users were added.

Focused component tests cover selecting/cancelling a role draft without assignment, retained failure vs cleared success, scope locking, and read-only/restricted management. These are UI harness tests, not a replacement for database authorization tests.

### Next implementation priority

Complete organization member-role management around the existing authority model: current member and role, proposed role and named organization, review/back/cancel, expected membership revision, exact-request receipt/retry, last-active-Super-Admin invariant, and audit/notification. Keep promotion authority and assisted recovery separate. Do not implement direct table writes as a substitute for the complete workflow or invent unresolved demotion rules.

The user's October 20 launch direction is a multi-week mirror with the user as Organization Super Admin and two Admins, all existing Netlify schedules copied and verified, and no fictional/test data in the launch environment. Follow [the current mirror plan](./MIGRATION_RUNBOOK.md#october-20-direction--multi-week-mirror-before-cutover). A full customer billing system is a separate product gap; an internal three-user mirror does not establish paid-customer readiness.


### Validation of this review increment

- 137 editor tests passed, including all five permission-scope tests (three new behavioral cases).
- Production build passed, with the same two pre-existing hook warnings. No SQL/API authorization changes were made; the earlier platform/database results above are prior evidence, not newly rerun claims.
- Browser on the current local build: loaded the fictional acceptance organization, opened all permission scopes, selected a production role draft, verified scope controls were disabled, then cancelled and verified navigation returned. No role assignment was submitted.
- Desktop role guide and 390px mobile layout inspected; corrected a mobile tab label that broke “Organization” across lines. Evidence: `output/migration-catchup/permission-review-desktop.png` and `permission-review-mobile.png` in the main workspace.
- Local preview remains on port 3532. No hosted deployment, import, real account provisioning, invitation or data removal occurred in this increment.
