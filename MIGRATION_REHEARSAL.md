# Synthetic migration rehearsal

This is a limited local database experiment, not a production exporter/importer. It accepts no live input, hosted URL, password or secret. All fixture inserts, updates, temporary mappings and helpers run inside one transaction that always rolls back. No actual Netlify schedule has been read or changed.

Run against an unlinked disposable local Supabase stack after applying all nine migrations:

```sh
python3 scripts/migration/rehearse-synthetic.py --workdir /path/to/disposable-local-project --report /tmp/roseland-synthetic-migration-report.json
```

The runner confirms the local CLI project has no hosted project link, verifies its matching Docker database container, and uses only local Docker SQL. Existing unrelated records are not mutation targets. It uses fixed fictional UUIDs and refuses collisions; do not repurpose it for real inputs. The local Auth runner separately verifies genuine password-login/API sessions; this fixture rehearsal uses trusted local SQL for setup and the validated public schedule RPCs for schedule creation/updates.

## What the experiment proves

| Stage | Expected result |
|---|---|
| Dry-run inventory | Two current schedules missing; stable source-key IDs proposed. |
| Initial import | Two inserts, complete current documents retained, explicit production/phase/day mapping. |
| Identical rerun | Zero inserts/updates, two skips; same identities and history. |
| Source changes during transfer | One existing schedule edited and a third created; reconciliation against latest source reports one mismatch and one missing record. |
| Delta/final catch-up | One insert, one update, one skip. Repeating it gives three skips. |
| Final frozen-source comparison | Every current schedule passes source revision/checksum, target version/document/hash, mapped relational metadata and current immutable history/checksum checks. Counts alone cannot pass. |
| Negative cases | Duplicate identity, malformed document, stale source inventory and independent target edits are rejected. Mid-batch target conflict rolls back an earlier successful update, its history, audit and mapping. |
| Completion | Transaction rolls back. Per-schedule report remains available; full migration remains explicitly incomplete. |

UUIDv5 derives identity from a fixed **synthetic-only** namespace plus entity/store and source key. Revision/content changes do not generate new IDs. A temporary import ledger records source checksum/revision and last verified target version/document/metadata. Unexpected target edits cannot be overwritten by rerunning the importer. Source disappearance requires a reviewed tombstone/rename mapping; lifecycle and placement deltas beyond this document-only experiment are refused. Real legacy `savedAt` is not treated as a reliable global revision—the fixture's monotonic revision is synthetic. Production tooling still needs an exporter/capture protocol for non-atomic multi-store state.

## Coverage and open gates

The report inventories all five known Blob stores. Current schedule documents and explicitly mapped hierarchy are exercised. Snapshots, full library metadata, templates and CMS are **inventoried only**, not silently skipped or declared imported. A target schedule's new version history is verified; that is not evidence that legacy snapshots were migrated. Legacy URLs/share projections, browser-only data decisions, complete metadata/rename/deletion deltas, retry ledger persistence and real backup/restore are still open. The report always sets `migration_complete: false` and names these gates.

The production requirement is broader: every active Netlify schedule must be mirrored into Supabase/Vercel, every in-scope related entity preserved and separately reconciled, and all missing/duplicate/mismatched/failed records resolved against the **latest source state immediately before switching authority**. A stale initial copy is insufficient. Preserve Netlify availability, use repeatable catch-up and a documented final write-freeze boundary, retain verified backup/rollback and legacy access, and obtain agreement on Netlify's post-cutover behavior with one authoritative writer. No indefinite two-way synchronization, deployment, live export or shutdown is authorized here. See [MIGRATION_RUNBOOK.md](./MIGRATION_RUNBOOK.md).


## Pre-migration capability-preservation gate

Before any real-schedule migration (including a real-data pilot), the actual current Netlify production and eventual Supabase/Vercel runtime must pass the complete [REGRESSION_MATRIX.md](./REGRESSION_MATRIX.md) comparison and receive explicit user approval. Preserve existing capability, data and practical usability; verified improvements may pass without exact pixel matching or a waiver solely for differing. Regressions, untested required behavior and unresolved material tradeoffs block migration. Local contract/rehearsal success does not establish runtime parity. Synthetic work remains within its existing authorization; no new live access, data transfer, deployment or cutover is implied.
