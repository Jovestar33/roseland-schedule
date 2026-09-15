# Platform Migration Runbook

Status: Phase 0 procedure. No step authorizes production mutation by itself. Exact owners, dates, RPO/RTO, URLs, and commands must be filled in during implementation and rehearsal.

## Invariants

- Netlify Blobs remains authoritative until the declared cutover point.
- Exports are read-only and repeatable; imports are idempotent and target disposable environments first.
- Legacy data is never automatically deleted.
- Permanent identity maps from `(source environment, store, key or reviewed rename alias)` to one stable target UUID. Source revisions/checksums are import-ledger attributes, never inputs that generate a new ID for each edit.
- A failed gate stops the migration without improvising in production.

## September 15 acceptance requirement: preserve Netlify and prove complete mirroring

Netlify must remain active and available in parallel with the Supabase/Vercel environment. Every active Netlify schedule must be mirrored and individually verified in the target before migration can be declared complete. Preserve all in-scope schedule fields; separately reconcile snapshots/versions, library placement/order/archive state, templates, CMS and legacy access according to the complete source inventory. Counts and representative samples supplement, but cannot replace, per-record verification. No decommissioning, disabling the live app, hosted export/import or authority switch is authorized by this requirement.

The final machine-readable acceptance report must contain the complete source inventory and its capture boundary, stable source-to-target mappings (including reviewed rename aliases), each schedule's source revision/checksum and target version/document checksum, related metadata/version comparisons, and explicit missing, duplicate, mismatched, orphaned and failed records. Record unsupported entity types and unresolved metadata decisions. An unknown revision, unverified schedule or unexplained discrepancy blocks completion; an initial copy that has become stale cannot pass.

### Consistency boundary and final catch-up

During rehearsal and transfer, Netlify remains the single authoritative writer. Repeated read-only inventories and delta imports must capture new schedules, changed content/metadata and reviewed rename/deletion mappings. Content hashes are required even when legacy `savedAt` is absent or unreliable. Never infer a rename from similar names, drop disappeared records, or overwrite divergent target edits. Source revision markers are observations to verify, not proof of an atomic multi-store snapshot.

Immediately before switching authority, stop **all legacy write paths** under the separately approved read-only window, drain/resolve in-flight writes, and record the freeze boundary. The app must remain available for reads. Re-enumerate the complete source inventory at this stable boundary, capture/verify a final backup, and run the final delta/catch-up and full per-record reconciliation against this latest state. Recheck inventory and hashes before sign-off. If writes resume or any source state changes, invalidate the report and repeat catch-up/reconciliation; do not switch from a stale report. Unknown/deferred discrepancies block cutover. Account for old installed clients and pending drafts so they cannot write to the previous authority after the switch.

### Decision required before cutover: Netlify behavior after authority switches

Availability is required. Indefinite two-way synchronization or simultaneous independent edits in Netlify Blobs and Supabase have **not** been requested or authorized. Keep one authoritative writer. Agree with the user on the post-cutover behavior before cutover: either adapt the Netlify app to the same Supabase authority (including its account/security model), or keep an explicitly dated read-only legacy view available with a clear path to the current Vercel app. A frozen view must never imply that it includes newer target edits. These are proposed options, not an approved implementation choice, and do not block today's local work.

Keep verified backup/restore and rollback evidence, recover target-only writes before re-enabling legacy writes, retain legacy access for at least the agreed 12 months, and retain the 30-day rollback baseline as a minimum, not an automatic shutdown date. Netlify removal requires a future explicit decision; preservation is part of migration acceptance.

## Gate 0 — total parity before real-schedule migration

**Current status: NOT PASSED.** Total parity means preserving existing capabilities, data and practical workflow usability with no regressions. It is a hard pass/fail prerequisite **before beginning migration of real schedules**, including a real-data pilot; it is not deferred to final cutover. Build and test with synthetic data first. Compare actual current Netlify **production** behavior with the eventual Supabase/Vercel target runtime. Netlify staging, local repository/SQL tests and API-only results are supporting evidence, never substitutes for this comparison.

Use the per-item acceptance ledger in [REGRESSION_MATRIX.md](./REGRESSION_MATRIX.md). Cover PDF creation, printing, navigation between screens, data entry/input-field dimensions, all editor/library/tools/sharing/template/backup/location/contact/call-sheet features, responsive/device behavior and every preserved data field. Capture paired screenshots, measurements and output files with reproducible steps and exact runtime/build/device/fixture identities. Record each item as Pass, Fail or Not tested; unknown, missing evidence, omitted features and untested profiles are not Pass. Revalidate affected comparisons after either runtime changes.

Classify comparisons as preserved capability, improvement, regression or unverified alongside Pass/Fail/Not tested. Intentional improvements can Pass without reproducing old behavior or pixel dimensions and without individual waivers merely for being different. Test correctness, permissions, accessibility, input capacity/usability and print/PDF content/layout. Better field layouts/sizes are acceptable when information and usability are retained or improved. Actual loss of function, data or usability and untested required behavior block migration. Never label a regression an improvement to bypass the gate. Surface material workflow tradeoffs or unclear cases for user review; account/login/permission architecture changes need reviewed criteria for their material workflow implications. Preserve original comparisons and any explicit user decisions in the ledger.

Require completed evidence and explicit user approval before any real-schedule migration transfer/import begins. Any export performed as part of that migration is also gated. Separately authorized read-only production baseline/inventory capture can support validation, but is not permission to mutate schedules or transfer them into the target. No live inspection/export, production fixture creation, deployment, hosted migration or cutover is authorized by this document update. Synthetic local/test-runtime rehearsals remain permitted within their existing scope.

After Gate 0 passes, the complete latest-source reconciliation, Netlify parallel availability, single authoritative writer, final catch-up/freeze boundary and verified backup/rollback gates still apply. Total UI/functional parity cannot substitute for data reconciliation, and matching data cannot substitute for parity. Reopen Gate 0 for candidate changes that invalidate its evidence.

## Stage 1 — prepare

1. Confirm the approved baseline: East US (North Virginia), AWS `us-east-1` Supabase region; global availability; production-specific membership; RPO 24 hours; RTO 4 hours; 12-month legacy URL compatibility; and 30-day rollback stability window.
2. Assign migration lead, security approver, product validator, rollback authority, and incident channel.
3. Provision isolated Supabase development/preview/production and protected Vercel preview environments.
4. Apply reviewed migrations with RLS and seed synthetic tenants/users.
5. Inventory and rotate credentials as needed; configure quotas, monitoring, alerts, and backups.
6. Record baseline counts for stores, schedules, snapshots, templates, library references, and public links.

## Stage 2 — synthetic export/import tooling; real data only after Gate 0

1. Export each Blob record without mutation, recording store, key, byte size, saved timestamp/metadata, and SHA-256 checksum.
2. Store the manifest and payloads in a restricted temporary location; never print payloads or tokens to logs.
3. Validate JSON shapes and report malformed, duplicate, orphaned, or missing-reference records.
4. Dry-run mapping to stable IDs and report proposed inserts/updates/skips/errors.
5. Import transactionally in dependency order: tenant/memberships, productions/phases/days, schedules, versions/snapshots, templates/library metadata, share compatibility mappings.
6. Record source mappings and checksums so reruns update or skip safely rather than duplicate.

## Stage 3 — reconcile

- Compare source and target counts by record type and production.
- Verify every library schedule reference resolves; identify orphaned snapshots and duplicate display names.
- Compare canonicalized document checksums and representative field-level samples.
- Open representative old, large, unusual, archived, and snapshot-heavy schedules.
- Run the complete regression, security, RLS, storage, and auth failure suites.
- Restore a backup into an isolated target and reconcile it.

Any unexplained difference is a failed gate.

## Stage 4 — pilot

1. Establish the complete production-versus-target parity evidence with synthetic fixtures first. Select a real non-critical production only after Gate 0 passes and the user explicitly approves real-schedule migration.
2. Import approved data to protected preview only within that approval; invite named pilot users and test role boundaries. A real-data pilot cannot be used to bypass the pre-migration parity gate.
3. Exercise editing, stale-save conflict, snapshots/restore, rename/move/archive/delete/restore, call/contact sheets, print/PDF/CSV, mobile, and share expiry/revocation.
4. Record defects, rerun the importer, and repeat until acceptance criteria pass.
5. Rehearse the exact cutover and rollback with timing.

## Stage 5 — production cutover

1. Announce the planned 1–2 hour maintenance/read-only window and support contact.
2. Verify latest Blob backup and manifest are readable and checksummed.
3. Run final importer dry run; require recorded approvals and agreement on Netlify availability/behavior after cutover.
4. Freeze every legacy write path, drain in-flight writes and record the consistency boundary; keep the Netlify app available for reads.
5. Re-enumerate the latest complete source state, take the final verified backup, import the final delta and reconcile every active schedule plus all in-scope related records. Explicit missing/duplicate/mismatched/failed records must be resolved, not waived by matching counts.
6. Validate representative schedules, users/roles, links, storage, outputs, monitoring, and backups.
7. Switch traffic only after migration, product, and security approvers sign off.
8. Preserve Netlify availability using the agreed single-authority behavior; retain the verified legacy rollback baseline for at least 30 days and legacy route resolution for at least 12 months. Neither deadline authorizes disabling the app.
9. Monitor auth failures, authorization denials, errors, latency, writes, provider spend, and support reports.

## Rollback

Rollback triggers include unexplained reconciliation differences, cross-tenant access, data corruption, failed writes, unusable critical workflows, widespread auth failure, or unacceptable error/latency rates.

1. Rollback authority declares the event and stops new writes to prevent divergence.
2. Capture target database state, audit events, logs, and the post-cutover change ledger without exposing content.
3. Route traffic back to the verified read-only legacy deployment, then deliberately re-enable legacy writes only after confirming it is safe.
4. Reconcile any target-only writes. Apply them to legacy through a reviewed recovery procedure; do not discard them silently.
5. Notify affected users, document timestamps and scope, and open an incident review.
6. Correct and rehearse before attempting cutover again.

Rollback becomes substantially harder once both systems accept writes. During the stability window there must be exactly one authoritative writer, and target-side writes must be recoverable through an explicit change ledger/version history.

## Billing transition: reduce Netlify cost after migration acceptance

The user wants eventually to stop paying for Netlify to help fund Supabase, and to be notified when the evidence supports that decision. This does not supersede the requirement to keep Netlify active and available in parallel. Do not equate ending a paid plan with shutting down the app or assume a cancellation preserves fallback access.

Before recommending a billing change, require all of these:

- Verified complete active-schedule reconciliation against the final source state, with all in-scope related data accounted for and discrepancies resolved.
- A functioning Supabase/Vercel pilot, explicitly approved cutover and successful real-use review.
- Verified backup/restore and rollback, including recovery of target-only writes.
- Completion of the agreed parallel availability/stability period, while preserving remaining fallback and legacy-access obligations. The 30-day baseline is not automatic cancellation approval.
- A current dependency and cost assessment for **Vercel plus Supabase plus any residual Netlify services**. Include relevant seats, environments, compute/storage/egress, usage/overages, functions/Blobs, DNS/domains, legacy routes and other dependencies actually used.

At that milestone, verify current official plan prices/terms and the account's actual subscriptions through authorized read-only access. Assess whether a downgrade can remove or reduce Netlify charges while retaining required app/fallback access; identify limitations, renewal/effective dates and the proposed combined monthly cost. If no compatible downgrade is verified, explain the remaining cost and availability tradeoff and obtain a user decision. Unknown plan terms or missing evidence mean the recommendation is not ready.

Notify the user when these gates are met, with the evidence, residual dependencies, cost comparison and concrete proposed next step. The existing daily Supabase follow-up now includes this milestone and stays quiet while it is unchanged or unmet. This is a future assessment/notification requirement; no purchase, subscription change, cancellation, shutdown or deployment is authorized. Continue the migration critical path without making speculative billing research a blocker for local work.

## Retirement

No retirement is currently authorized. The user requires Netlify to remain active and available. Any future retirement proposal must obtain an explicit superseding user decision, meet retention/legacy-access obligations and include tested recovery; expiry of the stability window alone authorizes no shutdown or deletion.
