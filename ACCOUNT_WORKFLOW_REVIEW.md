# Local account workflow reliability review — September 15, 2026

This batch follows `c03d0f7` on `codex/migration-schedule-contract`. It fixes confirmed request-replay and concurrent-rate defects in the existing organization provisioning and invitation workflows. It adds a compatible days-based invitation RPC, preserves the original timestamp-based RPC, and verifies the built application with genuine fictional MFA sessions. Actual schedules, hosted systems, credentials, billing and deployment settings were untouched.

## Findings, changes and retests

| Finding | Baseline evidence | Final behavior |
|---|---|---|
| W01: changed inputs reuse an earlier successful result | Genuine local AAL2 calls acknowledged eight changed provisioning inputs, five changed invitation inputs and two changed revocation inputs. Concurrent changed requests with one key also returned the first result | A canonical business-input fingerprint is stored with the action/key/actor/resource. Identical retries return the original result without another write/audit/rate slot; changed inputs return bounded HTTP 409 without mutation |
| W02: different request keys race past the rate cap | An audit-table barrier let two distinct-key requests count the same committed events before either could commit. All three workflows exceeded their existing cap by one | A transaction-scoped advisory lock serializes the existing actor/action/tenant rate bucket. At the boundary one request succeeds, the other is rejected with no resource/state/audit/request-marker mutation |
| W03: valid local browser origin rejected | Actual Next 15.5.25 `NextRequest` rewrites `127.0.0.1` to `localhost`; the built route rejected a matching browser Origin with 403 | For recognized loopback Host headers only, compare the original Host origin exactly. Same-origin requests succeed; `localhost` versus `127.0.0.1`, another port and an unrelated origin still fail before Auth |
| W04: NULL AAL handling in trusted SQL | Source inspection found `p_actor_aal <> 'aal2'` could evaluate to NULL instead of rejecting. The ordinary application already required verified AAL2 | All three SQL workflows explicitly reject NULL AAL, including retries. This is defense in depth for trusted callers, not evidence of an ordinary-client MFA bypass |

W01/W02 were release-relevant reliability/abuse-control gaps, not a demonstration that an anonymous caller could use service-role workflows. Actor, role and tenant authorization still applied on the baseline. The old SQL tests intentionally accepted changed payloads as retries; those two expectations are now replaced with conflict assertions, alongside fresh identical-retry coverage. These fixes are local; hosted retesting and the broader F01–F05 release gates remain open.

## Request identity and compatibility

Forward migration `20260915060000_workflow_request_contract.sql` adds a private SHA-256 request fingerprint and replaces the three workflow implementations. The fingerprint covers business inputs, while every invocation separately rechecks current actor authority, AAL2 and recent authentication before resolving a retry. Changing a session or authentication timestamp does not define a new business request. Request keys retain their existing `(action, request_id)` scope; another actor cannot reuse them to retrieve a result.

| Workflow | Fingerprinted business inputs |
|---|---|
| Provision organization | Owner user, name, slug, timezone, locale, country, currency and trimmed operator reason |
| Create invitation | Organization, normalized recipient email, organization role, production/role and the expiry descriptor |
| Revoke invitation | Invitation identity, its organization and trimmed reason |

The API already accepts `expiresInDays`. It now passes that stable integer to `create_organization_invitation_with_days`; the database derives expiry on the first accepted request and returns that original result on retries. The private creation core is shared with the original `create_organization_invitation(... p_expires_at timestamptz ...)`, whose expiry fingerprint represents an absolute instant. Switching between those two request forms with one key conflicts rather than pretending their intent is provably identical.

Days retain the API's existing 24-hour duration. Workflow authentication timestamps use absolute instants rather than reinterpreting a UTC wall-clock value in the database connection's timezone; a non-UTC SQL replay test verifies that valid recent authentication remains valid.

The distinct RPC name preserves positional legacy SQL calls containing timestamp string literals; a same-name integer overload was found to make those valid calls ambiguous and was replaced before completion. The original function signature/grants remain available. The new endpoint is service-role-only, included in the verified actor-session admission hook and the server's permitted RPC list. Its private core/fingerprint/rate helpers are not directly executable by API roles. Missing or expired actor binding on the new endpoint returns 401.

Historical request rows have no trustworthy original input. Their new fingerprint remains NULL, and reusing such a key returns 409 without rewriting the row or resource. Backfilling from a current mutable resource could invent a false history, so this migration does not do it. Before any hosted rollout, inventory existing request keys and define the operator/client reconciliation procedure. A conflict requires reviewing the original result; automatically switching to a fresh key could duplicate an operation. No client retry behavior is silently changed into an automatic new operation.

Any eventual rollout must coordinate the database and application versions and drain/reconcile outstanding workflow attempts. The previous application computes a fresh absolute expiry on each invitation retry; leaving that old server active against the new input-bound contract would produce conflicts. No hosted rollout or automatic reconciliation was attempted here.

The built API maps replay conflicts to `409` with a bounded review message and rate failures to `429`. It keeps the original success statuses/resource IDs, defaults-off feature gate, existing role assignments and input defaults. No rate threshold was changed:

| Action | Existing bucket and cap |
|---|---|
| Organization provisioning | Actor + action; 10 accepted events per hour |
| Invitation creation | Actor + organization + action; 25 accepted events per 10 minutes |
| Invitation revocation | Actor + organization + action; 50 accepted events per 10 minutes |

## Transaction and admission semantics

Authorization/session checks remain admission checks. Inside a workflow the order is request-key lock, matching-replay resolution, rate-bucket lock, then mutation/audit/request-marker commit. Revocation acquires its invitation row lock after the key/bucket locks and rechecks the row's tenant identity and pending status. This gives the workflows a consistent lock order while retaining terminal-state retry behavior.

Rate accounting uses a clock value taken after acquiring the bucket lock, and stores that value on the operation's audit event. Each subsequent contender sees the preceding committed event. An identical successful retry resolves before rate accounting and consumes no additional slot. A failed transaction rolls back business state, audit and fingerprint marker, and releases its locks; an explicit retry with the same input/key can then succeed.

This does not add cancellation after admission. An admitted workflow may finish while time passes or authority changes after its admission checks, subject to the existing row/state constraints. Session deletion waits for admitted transactions under the prior session contract. Stricter cancellation, post-wait authorization refresh, Auth refresh contention and load/latency policy remain explicit F01/F03/F05 follow-ups; the rate fix does not claim to settle them. Raw service-key or database administrators remain trusted and can bypass ordinary policies by design.

## Executed concurrency and atomicity evidence

All nine workflow races use genuine fictional AAL2 actors and the actual local service HTTP/Data API boundary. A separate SQL connection supplies a controlled audit-table barrier. The runner observes real PostgreSQL lock waits before releasing it; it does not infer concurrency from simultaneous promises alone.

| Scenario | Provision | Invite | Revoke |
|---|---|---|---|
| Two identical requests with one key | Same resource, one audit/marker | Same resource, one audit/marker | Same terminal resource, one audit/marker |
| Changed inputs with one key | Second conflicts | Second conflicts | Second conflicts |
| Two new keys at cap minus one | One success, one rate denial | One success, one rate denial | One success, one rate denial |

After each rate denial the runner checks the missing request marker and untouched business result: no second organization, no second invitation, or the second invitation still pending. Other actors and, where applicable, other organizations retain independent buckets. Identical replay at the cap succeeds without consuming another slot. Three targeted audit-trigger failures separately prove complete rollback of resources/memberships/invitation state and request markers, followed by successful retries.

The built Next server is started by the test with only explicit local configuration, on a verified owned loopback listener, from a checkout without application environment files. All three application routes are exercised through actual Auth verification and SQL: initial success, delayed identical retry, changed-input 409, verified actor attribution, and expired-session 401. The maximum 30-day invitation case also passes. Passwords, access tokens, service keys and TOTP secrets remain in memory; no real account or credential is used and no email is sent to another person.

## Account recovery, onboarding and administration prerequisites

| Capability | Current local evidence | Remaining prerequisite |
|---|---|---|
| Password login, sign-out and expiry | Genuine local Auth and editor/session runners; dirty edits preserved for same-account reauthentication | Product login/session UX beyond the loopback rehearsal; refresh behavior, lost-session support and hosted settings |
| MFA / recent authentication | Genuine fictional TOTP upgrade; all server routes enforce verified AAL2 and recent auth | Account-facing enrollment/rechallenge UX, factor removal/loss recovery, support ownership and anti-lockout tests |
| Owner/Admin invitation administration | RLS-protected records, create/revoke APIs, role rules, input-bound retries, rate races and atomic audit | Local UI with tenant selection, pending invitation list, stable request snapshots/keys, retry/reauthentication and explicit result review |
| Invite acceptance / onboarding | Existing email/role/parent checks and acceptance/suspension tests | Approved invitation delivery/link/redirect flow; verified-email UX; expired/reused/wrong-account states; no enumeration. Local Auth uses fictional auto-confirmed accounts, so email-delivery verification is not established |
| Password reset / recovery | Requirements recorded; no product recovery flow claimed | Redirect allowlist, delivery setup, generic responses, expired/reused links, session handling and full failure-path tests. Do not send real recovery mail or change actual credentials in a local batch |
| Superadmin provisioning UI | Backend and full local HTTP path work for an existing verified owner UUID | Restricted verified-owner lookup/selection and operational review UX; no general Auth-user enumeration endpoint is assumed |
| Membership/organization management | Existing tenant/role model and suspension/acceptance checks | Owner-preservation, removal/demotion, organization switching and account export/deletion UX/workflows require their specified lifecycle coverage |
| Existing request history at rollout | Unknown fingerprints fail closed without data changes | Inventory and communicate reconciliation for pre-migration request keys before enabling the new hosted contract |

**Next coherent local batch:** an explicitly enabled, loopback-only invitation-management screen for fictional Owner/Admin sessions. Use the existing role/tenant rules to list permitted organizations and pending invitations, obtain/rechallenge genuine MFA, create and revoke with immutable request snapshots and stable keys, and preserve drafts through recoverable failures and same-account reauthentication. Exercise role/tenant denial, pending edits, uncertain transport, changed-input conflicts, rate denial, expiry and retry through the actual UI. Keep Netlify defaults and the hosted-only `/platform/setup` guard intact. This batch did not start that UI work because the backend compatibility/security contract needed a complete review first.

That UI slice can use already-specified invitation roles and durations without choosing a new product policy. Decisions for real onboarding/delivery and MFA/account-recovery support remain gates before those broader flows. Related-store ownership/projections and stricter cancellation remain unresolved; they are not implicit authorization to invent behavior. The external AI security-tool evaluation remains an unnumbered future note, not work performed or a blocker added to this batch.

## Validation and reproduction

Final local evidence: **13 migrations, 409 pgTAP assertions in 12 files, 46 platform tests, 53 editor/server/API tests and 30 migration/recovery Python contract tests** pass. TypeScript and the credential-free production build with integrated lint pass. All four genuine Auth runtime runners pass, including the built Next workflow path. The **nine new workflow races**, **eight prior session-admission scenarios** and **14 prior permission/document/lifecycle races** pass on the final schema. SQL lint reports no schema errors and the local database security advisor reports no issues. The prior full recovery rehearsal and dependency audit were not repeated; no dependency changed, and preserved recovery artifacts retain their separately documented scope.

Run only against an unlinked disposable local CLI project, never a hosted/actual-data target. Transaction-isolated pgTAP should run before committed runtime fixtures on a clean database.

```sh
supabase test db --workdir /private/tmp/roseland-workflow-db-20260915
npm run build
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/test-workflow-runtime.ts --workdir /private/tmp/roseland-workflow-db-20260915 --next-port 3341
```

The baseline mode `--expect-vulnerable` is only for the pre-fix twelve-migration schema; CI runs the fixed expectations and the built HTTP tests. Local project `roseland-workflow-20260915` uses distinct 593xx ports. Prior session and recovery volumes are preserved. Logs use `/private/tmp/roseland-workflow-` with `baseline.log`, `pgtap.log`, `http-runtime.log`, `platform.log`, `editor.log`, `build.log`, `session-admission.log`, `schedule-auth.log`, `editor-auth.log`, `permission-races.log`, `schedule-races.log`, `advisor.log`, `lint.log` and `migration-tests.log`.

No dependency changes, push, deployment, hosted migration, actual-schedule read/write, real credential/MFA change or billing operation occurred. No external security scan was run. Transfer of reports to the planning task remains subject to the earlier automatic-approval-review block and pending explicit destination permission; the review and continuity notes are maintained locally.
