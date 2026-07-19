# Platform Migration Runbook

Status: Phase 0 procedure. No step authorizes production mutation by itself. Exact owners, dates, RPO/RTO, URLs, and commands must be filled in during implementation and rehearsal.

## Invariants

- Netlify Blobs remains authoritative until the declared cutover point.
- Exports are read-only and repeatable; imports are idempotent and target disposable environments first.
- Legacy data is never automatically deleted.
- Every migrated record maps from `(store, key, source checksum)` to a stable target UUID.
- A failed gate stops the migration without improvising in production.

## Stage 1 — prepare

1. Confirm the approved baseline: East US (North Virginia), AWS `us-east-1` Supabase region; global availability; production-specific membership; RPO 24 hours; RTO 4 hours; 12-month legacy URL compatibility; and 30-day rollback stability window.
2. Assign migration lead, security approver, product validator, rollback authority, and incident channel.
3. Provision isolated Supabase development/preview/production and protected Vercel preview environments.
4. Apply reviewed migrations with RLS and seed synthetic tenants/users.
5. Inventory and rotate credentials as needed; configure quotas, monitoring, alerts, and backups.
6. Record baseline counts for stores, schedules, snapshots, templates, library references, and public links.

## Stage 2 — export and import tooling

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

1. Select one approved non-critical production; use synthetic data by default before approval.
2. Import to protected preview, invite named pilot users, and test role boundaries.
3. Exercise editing, stale-save conflict, snapshots/restore, rename/move/archive/delete/restore, call/contact sheets, print/PDF/CSV, mobile, and share expiry/revocation.
4. Record defects, rerun the importer, and repeat until acceptance criteria pass.
5. Rehearse the exact cutover and rollback with timing.

## Stage 5 — production cutover

1. Announce the planned 1–2 hour maintenance/read-only window and support contact.
2. Verify latest Blob backup and manifest are readable and checksummed.
3. Run final importer dry run; require recorded approvals.
4. Stop legacy writes and record the write-authority timestamp.
5. Export the final delta, import, and reconcile counts/checksums/relationships.
6. Validate representative schedules, users/roles, links, storage, outputs, monitoring, and backups.
7. Switch traffic only after migration, product, and security approvers sign off.
8. Keep Netlify/Blobs read-only for the 30-day stability window and preserve legacy route resolvers for at least 12 months.
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

## Retirement

After the stability window, successful restore drills, resolved incidents, and explicit owner/legal approval: disable Blob writes, preserve the agreed backup/compatibility archive, rotate legacy credentials, remove legacy runtime dependencies, and later dispose of data according to retention policy. Retirement is a separate change, never an automatic cutover step.
