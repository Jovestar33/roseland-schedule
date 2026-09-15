# Local Data API session admission review — September 15, 2026

Acceptance follow-up after `2bb06f8`: the new recipient receipt expands the authenticated RPC inventory to **16**. Fresh GET/POST expiry/revocation and all admission scenarios pass; see [LOCAL_ACCEPTANCE_REVIEW.md](./LOCAL_ACCEPTANCE_REVIEW.md). Counts below describe the original session-admission checkpoint unless explicitly updated.

This batch follows local checkpoint `7903ac1` on `codex/migration-schedule-contract`. It closes the reproduced **local Data API** part of F01 and supplies the dedicated F03 concurrency evidence. It does not authorize a hosted rollout or close the broader migration/security gates. Actual schedules were not read or changed. All runtime accounts, MFA factors and records were fictional, in the separate `roseland-session-20260915` Docker project on 583xx ports.

## Policy and implementation

Supabase's ordinary JWT behavior permits a previously issued access token to remain usable until expiry after sign-out. That behavior alone is not a provider vulnerability. The earlier editor wrappers required an active database session, while other authenticated Data API routes did not. This mismatch was a gap in this application's intended admission policy. Supabase documents the [session-ID check](https://supabase.com/docs/guides/auth/sessions).

Forward migration `20260915050000_data_api_session_admission.sql` installs `public.check_application_session` as the database-scoped PostgREST `db_pre_request`. Ordinary `authenticated` requests must have a real session owned by the verified JWT subject, a future JWT expiry, and no elapsed `auth.sessions.not_after`. A request cannot reach its underlying RPC/table operation when this check fails. Existing grants, RLS, tenant/role boundaries and optimistic-version contracts still apply after admission. The helper exposes neither session rows nor the private schema.

Write transactions acquire a SHARE lock on the session row, recheck the clock after acquiring that lock, and retain the lock through commit/rollback. Session deletion or expiry updates serialize with these transactions. Read-only transactions check the current committed session snapshot without a row lock. This includes GET/HEAD and POST calls to STABLE/IMMUTABLE functions. A read admitted before a revocation commits may finish; a new request after committed revocation is refused. This follows [PostgREST transaction access modes and pre-request ordering](https://postgrest.org/en/latest/references/transactions.html).

The three enabled server workflow routes verify the bearer token with Auth, parse its session/expiry alongside AAL2/recent-authentication claims, and bind the verified actor to internal service request headers. They reject absent actors, mismatched payload actors and unapproved RPC names before transport. The database hook checks/locks this actor session through the workflow transaction. A revocation between Auth verification and SQL admission therefore fails with a bounded HTTP 401. Existing workflow role, tenant, audit and rate/idempotency checks remain in force.

A valid-path runtime failure also reproduced the prior legacy service-key compatibility bug: API-key-only requests using the local legacy JWT key reached SQL without service-role authorization (HTTP 401 / 42501). `serviceApiHeaders` now supplies a bearer header for legacy JWT keys. New `sb_secret_` keys remain only in `apikey`, as required by the [API-key migration documentation](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys). The local legacy path was exercised; the new-key header behavior is unit-tested, not hosted-tested. No real key was obtained, rotated or persisted.

## Entrypoint inventory and evidence

The runtime runner queries the actual public-function grants and fails if its inventory no longer matches all 15 non-trigger functions executable by `authenticated`. Each listed function returned HTTP 401 with an expired database session and again with the retained original token after genuine Auth sign-out.

| Authenticated Data API RPC | Valid-access / authorization evidence |
|---|---|
| `is_active_org_member` | Tenant/permission SQL suite and normal RLS reads |
| `is_org_admin` | Tenant/permission SQL suite and admin RLS reads |
| `can_access_production` | Normal owner/viewer read and cross-tenant denial |
| `can_edit_production` | Normal owner write and viewer denial |
| `accept_organization_invitation` | Existing acceptance/suspension SQL suite and eight permission races |
| `get_my_invitation_acceptance` (acceptance follow-up) | Own verified-email/active-membership receipt; fresh GET/POST expiry and revocation denial, expanded 16-RPC inventory; see [LOCAL_ACCEPTANCE_REVIEW.md](./LOCAL_ACCEPTANCE_REVIEW.md) |
| `read_schedule` | Genuine owner/viewer reads; outsider unavailable; GET RPC denial also checked |
| `read_deleted_schedule` | Genuine lifecycle recovery runner and role checks |
| `create_schedule` | Genuine lifecycle creation and initial-version contract |
| `mutate_schedule` | Genuine rename/archive/delete/restore lifecycle and three existing archive races |
| `update_schedule_document` | Genuine saves, stale/invalid/unauthorized denials, atomic history, new session races |
| `session_list_schedules` | Genuine pagination, tenant/member/parent filters and session denial |
| `session_read_schedule` | Genuine local-editor read and session denial |
| `session_update_schedule_document` | Genuine local-editor save/reload and invalid/stale/session denial |
| `require_active_schedule_session` | Session helper SQL assertions and normal wrapper calls |
| `check_application_session` | Every normal Data API operation plus direct revoked-session denial |

All **11 public table routes** were exercised with GET, HEAD, POST, PATCH and DELETE for both expired and revoked sessions: `profiles`, `organizations`, `organization_memberships`, `productions`, `production_memberships`, `phases`, `production_days`, `schedules`, `schedule_versions`, `organization_invitations`, and `audit_events`. All 110 method/table/session combinations returned 401. Normal GETs to every table still succeed under RLS; the caller's profile PATCH succeeds. Normal permission and runtime suites separately verify that unauthorized direct schedule writes remain denied. This does not claim that every table permits every write method for valid callers.

The exposed alternate schema is also covered: `/graphql/v1` and `/rest/v1/rpc/graphql` with `Content-Profile: graphql_public` reject both expired and revoked sessions with 401. Valid sessions reach the existing gateway. The local `pg_graphql` extension is not enabled, so its normal response reports unavailable query functionality; no GraphQL feature/permission parity is claimed and no extension was enabled. Any eventual enabled GraphQL deployment needs query/mutation authorization tests as part of F05.

| Trusted workflow / application route | Fresh evidence |
|---|---|
| `provision_customer_organization` / `POST /api/platform/organizations` | Genuine fictional AAL2 superadmin succeeds; missing binding and retained binding after sign-out return 401 |
| `create_organization_invitation` / `POST /api/platform/invitations` | Genuine fictional AAL2 owner succeeds; missing/wrong-owner/revoked session binding denied; concurrent expiry waits and rejects without creating an invitation |
| `revoke_organization_invitation` / `POST /api/platform/invitations/{id}/revoke` | Genuine fictional AAL2 owner succeeds; missing and revoked binding denied |

For those application routes, server-module tests verify Auth-before-service ordering, actor binding, ignored caller-supplied actor headers, mismatched-actor refusal, disabled-by-default behavior, legacy/new key header handling, and bounded SQL 401 propagation. Runtime evidence covers the actual service HTTP/SQL workflows with genuinely verified MFA claims; this batch does not claim a browser administration interface or a full hosted Next-to-Auth walkthrough.

| Other target entrypoint | Scope / evidence |
|---|---|
| Supabase Auth signup, password token grant, user verification and logout | Genuine local calls in runtime runners; these are provider Auth endpoints, outside the SQL pre-request hook |
| Auth MFA factor enrollment/challenge/verification | Genuine local fictional TOTP upgrade to AAL2; account recovery, factor removal/support and refresh races remain F02/F05 |
| `/platform/setup` | Existing explicit hosted-development configuration gate; disabled by default; setup contract tests still pass. No hosted setup operation performed |
| `/local-schedule` | Explicit loopback-only rehearsal gate; valid, stale, expired/revoked and unauthorized repository paths retested; existing dirty-edit controller tests pass |
| Auth recovery/update/refresh and Storage/Realtime | Not added to this batch's hook; full lifecycle/service authorization remains open |
| Existing Netlify login/editor/public shares/Places | Existing backend and defaults retained; 53 editor/server/API tests rerun. This batch does not replace their authentication or establish production/target parity |

## Concurrent admission evidence

Seven scenarios observe an actual PostgreSQL lock wait before releasing the competing transaction; an eighth controls committed/uncommitted session state to demonstrate read admission. User tokens come from genuine password login, never a locally forged JWT.

| Ordering | Verified result |
|---|---|
| Session deletion first, commit | Waiting save returns 401; version/history unchanged |
| Session deletion first, rollback | Waiting save succeeds; version/history advance exactly once |
| Session expiry update first, commit | Waiting save returns 401; version/history unchanged |
| Session expiry update first, rollback | Waiting save succeeds; version/history advance exactly once |
| Session deadline passes while save waits on session row | Clock recheck rejects save with 401; version/history unchanged |
| Write admitted first, genuine Auth sign-out second | Auth's database transaction waits for the admitted write; write commits, sign-out completes, retained-token next write returns 401 |
| Read while deletion is uncommitted, then after commit | Earlier read succeeds under committed snapshot; subsequent read returns 401 |
| Service workflow waits behind actor expiry update | Committed expiry produces 401; no invitation created |

The five first-order user races check document-version/history counts after each outcome. The existing history-failure rollback, stale-save and suspension tests also pass. Unsaved-edit handling is unchanged; the platform/editor suites still prove that rejected/conflicting or late saves cannot discard newer edits, and the local editor Auth runner confirms session denials.

## Limits and unresolved policy decisions

- **F01 — scoped local fix, broader policy still open.** The pre-request hook covers the Data API, not Auth endpoints, Storage, Realtime, or trusted direct SQL. Supabase explicitly documents this [hook scope](https://supabase.com/docs/guides/database/debugging-performance). Those surfaces need their own inventory and tests before release. A raw service-key/database administrator remains trusted and can bypass RLS or change policy by design. Bootstrap and machine operations are not forced into the human actor-session policy. No ordinary client gains those credentials or privileges.
- **F03 — local race evidence complete within the above contract.** Admission does not cancel an already admitted request when natural JWT/session time later elapses, nor recheck expiry after every later business-row wait. Product acceptance must explicitly decide whether this admission boundary is sufficient or stricter transaction cancellation/deadlines are required. Read cancellation is not promised. Load/latency effects of session-row locks, Auth refresh contention, all account-disable/MFA-recovery paths, and hosted configuration still need assessment.
- **F02 remains open:** full account recovery/onboarding/admin UX and support paths. Genuine local MFA here verifies a backend path, not product completeness.
- **F04 remains open:** application policies/projections for preserved related-store catalogue data.
- **F05 remains open:** comprehensive internal security review/retests, broader service/hosted behavior and complete recovery/configuration parity. Existing fictional recovery artifacts are preserved. Database-specific PostgREST settings are runtime configuration, not proven restored by the previous SQL checkpoint artifacts; restoring/exposing a service requires explicit hook configuration and verification. No production readiness or total capability/usability parity is claimed.

Existing external-AI security-tool evaluation remains future work, not performed or required to complete this batch. The real migration gates remain complete source inventory/reconciliation, total capability/data/usability parity, proven recovery including new target edits, one authoritative writer, Netlify availability and explicit cutover authorization.

## Validation and reproduction

Clean rebuild: **12 migrations; 383 pgTAP assertions in 11 files** pass. **44 platform tests**, **53 editor/server/API tests**, **30 migration/recovery Python contract tests**, TypeScript and a credential-free production build with integrated lint pass. The three genuine Auth runtime runners pass. The **14 existing permission/document/lifecycle races** pass in addition to the eight admission scenarios above. SQL lint reports no schema errors; the local database security advisor reports no issues. The previous full recovery rehearsal was not repeated; its preserved artifacts and limits remain documented separately. No new dependencies, audit waiver, external scan or remote CI run occurred.

Reproduction from the isolated branch after starting only its disposable local stack:

```sh
supabase test db --workdir /private/tmp/roseland-session-db-20260915
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/test-session-admission.ts --workdir /private/tmp/roseland-session-db-20260915
```

`supabase/config.toml` enables local TOTP for the fictional runtime/CI test. Hosted Auth and Netlify defaults are unchanged. The runner refuses linked CLI projects and non-loopback requests, keeps generated passwords/tokens/TOTP secrets in memory, and logs only bounded results. Its fictional fixtures remain in the disposable volume for inspection. Run transaction-isolated pgTAP on a clean disposable database before committed runtime fixtures. Never reset the separate recovery stack to rerun these checks.

Final bounded logs: `/private/tmp/roseland-session-final-pgtap.log`, `-admission.log`, `-schedule-auth.log`, `-editor-auth.log`, `-permission-races.log`, `-schedule-races.log`, `-advisor.log`, `-lint.log`; build log `/private/tmp/roseland-session-build.log`. Earlier failed runs exposed a HEAD test-parser error, disabled local TOTP, and the legacy service transport defect; the final runs above passed after those corrections.

No push, deployment, hosted migration, actual-schedule operation, real credential/MFA change or billing change was performed. Transfer of completion/security reports to the planning task remains pending explicit destination permission after earlier automatic-approval-review rejections; this document records the review locally.
