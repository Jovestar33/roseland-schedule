# Local Supabase schedule contract

Implemented on `codex/migration-schedule-contract`, following the integration of the auth and schedule foundations. This is an isolated local/tested slice. The existing editor still uses Netlify; no hosted migration, endpoint deployment or backend switch is included.

## Interface

Use a normal authenticated Supabase session client with `createScheduleRepository` in `lib/platform/schedule-repository.ts`. No service-role credential is required or appropriate for this adapter. The database receives the verified user identity through Supabase's normal JWT/RLS path; callers never supply an actor or organization to select an authority.

| Operation | Database RPC | Result |
|---|---|---|
| Read one active schedule | `read_schedule(target_schedule_id uuid)` | Full internal schedule record permitted by the caller's current production access. This is not a public/client-share projection. |
| Replace an existing document | `update_schedule_document(target_schedule_id uuid, expected_version bigint, next_document jsonb, schema_version integer)` | Updated record, incremented `document_version`, server timestamp and actor. Requires schema version 1 and a positive safe-integer expected version. |

`document_version` is the concurrency authority. The legacy document `savedAt` is preserved as data, not trusted as a write precondition; `updated_at` is the server timestamp. The row's stable organization/production/day IDs remain authoritative. The document-update operation does not change lifecycle metadata; use the lifecycle RPCs below. Legacy project/phase/date labels remain document fields; synchronizing those with hierarchy edits is outside this document-only contract. The relational `town` summary is synchronized to trimmed document town in the same update.

The SQL validator accepts optional known legacy fields, including contact data, call-sheet fields, weather, zero duration and sub-locations. It rejects unknown fields/schema versions, invalid containers/types, invalid dates/times/durations, out-of-range coordinates, fractional/invalid day counts, oversized text, more than 5,000 rows, more than 100 sub-locations per row, or a document above 2 MiB. Unknown data is rejected, not silently dropped. Before migration, reconcile real export shapes against this contract and deliberately evolve the schema for legitimate exceptions; do not silently strip legacy data to pass validation.

## Permission and transaction guarantees

- Read uses invoker rights and RLS. Schedule/history reads also require an active day and, when present, an active phase; existing production/organization membership checks still apply.
- Update is a narrowly scoped security-definer function with a pinned empty search path. It checks current production edit access and active parents, locks organization/production/membership/day/phase rows against concurrent lifecycle changes, and rechecks permission after locks. Viewer, suspended and cross-organization writes fail without exposing document contents or versions.
- One conditional UPDATE compares the expected version. The existing triggers increment the version, attribute the actor and append immutable history/checksum inside that transaction. A history-write failure rolls back the document, summary and version.
- Direct authenticated schedule INSERT/UPDATE privileges are revoked so callers cannot bypass validation or omit the version. Creation and administrative lifecycle operations use the separate contracts below before any target editor integration. Trusted database-owner operations remain the migration/administration boundary.
- Concurrent writers with the same version produce one winner and one conflict. A suspension committed first blocks the write; a write serialized first may finish, after which subsequent writes are denied. This is transaction ordering, not instantaneous revocation of an operation already committed.

## Failure behavior

| SQLSTATE | Meaning / adapter outcome |
|---|---|
| `PT400` | Invalid input or missing/invalid expected version → `invalid` |
| `PT401` | Missing user identity → `unauthenticated` |
| `PT404` | Unavailable or unauthorized schedule → `unavailable` |
| `PT409` | Version changed → `conflict`; reload and deliberately resolve |
| Other / transport failure | Generic `failed`; raw database details are not exposed by the adapter |

The adapter rejects partial/mismatched acknowledgements and never retries a write automatically. A lost acknowledgement leaves the outcome uncertain: read again and compare before choosing another write. This slice does not implement durable outboxes or an idempotency key/replay ledger. Repeating an already committed request with its old version conflicts rather than appending another version, but it cannot recover the original acknowledgement as a fully idempotent operation would.

## Verification and next work

`supabase/tests/database/schedule_contract.test.sql` exercises the actual SQL/RLS boundary, malformed legacy documents, access denials, stale/omitted versions, parent deletion and an injected history failure. Existing schedule-domain tests now use the mutation boundary; privileged fixture deletion remains only to test immutable history and read restrictions. The lifecycle suite separately tests the new soft-delete/restore contract, including role limits, slug collisions and audit rollback.

`scripts/test-schedule-concurrency.py` uses two real local PostgreSQL connections for competing writers and both suspension/write orderings, observes lock waits and verifies current document/history consistency. It creates only new fictional fixtures and leaves them in the disposable stack for inspection. Run it after the transaction-isolated pgTAP suite; rebuilding the disposable stack clears those fixtures. CI also retains the eight invitation/suspension races and runs the new schedule races.

The TypeScript adapter tests verify request/version forwarding, bounded error mapping, uncertain outcomes and malformed acknowledgements. Full app tests, type/build and local database/advisor results are recorded in `READINESS.md`. The separate `scripts/test-schedule-auth-runtime.ts` now verifies genuine login-issued user sessions through the actual local API/RLS path, including denial, conflict and history rollback. Hosted runtime and editor integration remain unverified.

Next: application account/session and editor repository integration, the remaining hierarchy/metadata contracts and complete export/import/reconciliation needed for the protected Vercel/Supabase pilot. The bounded synthetic rehearsal is documented in `MIGRATION_REHEARSAL.md`; it does not claim full migration parity. Phase/day direct updates, their complete optimistic/lifecycle rules, and the broader legacy importer remain unfinished. Installation/offline and Production Command are outside this slice.


## September 15: recoverable lifecycle slice

Forward migration `20260915020000_schedule_lifecycle_contract.sql` adds:

| RPC / repository method | Contract |
|---|---|
| `create_schedule` / `create` | Caller-generated UUID and verified day; validated name, slug and schema-1 document. Organization, production and actor derive from the session/parent. Absence is the creation precondition: ID or active-slug collision is a conflict, never an overwrite. Retain the UUID when resolving a lost acknowledgement. |
| `mutate_schedule` / `mutate` | Mandatory current version, operation and strictly allowlisted payload. Supports rename, archive, unarchive, delete, restore and restore_version. |
| `read_deleted_schedule` / `readDeleted` | Admin-only read of a deleted record through RLS, for obtaining its current recovery version. Active parents are still required. |

Owner/admin and assigned editors can create, rename, archive/unarchive and restore document versions. Only owner/admin can soft-delete or undelete. Viewers, removed/suspended memberships and other tenants cannot mutate. Scope rows use the same lock order as document updates, with a permission recheck after locks; the schedule row is then locked and its version checked. No move, hierarchy edit, purge or retention automation is exposed.

Rename takes `{display_name, slug}`. Restore-version takes `{version}` and appends the selected validated **document** as a new version while retaining current name, hierarchy, status and deletion state. Other lifecycle payloads must be empty. Archive remembers the exact prior draft/published status; unarchive restores it. Historical archived rows without a known prior status cannot be silently unarchived; their migration mapping needs an explicit decision. Archived schedules remain accessible to authorized members. Undelete preserves the ID/document/status and conflicts if another active record has taken its slug. Recover an inactive parent first; recovery never implicitly revives a production, day or phase.

Every lifecycle mutation increments the version and appends document and metadata snapshots, with separate SHA-256 checksums, in the same transaction as a safe audit event. Metadata includes name, slug, day, status, previous archive status, town and deletion timestamp. Existing immutable versions are not rewritten; older versions have null metadata. History and audit failure injection both prove complete rollback. Direct authenticated schedule writes and history rewrites remain denied.

The local nine-migration chain passes 340 database assertions. Genuine password-login sessions exercise these RPCs through the SDK/PostgREST adapter. These are local contract results; the editor remains on Netlify and hosted readiness, UI/account integration and complete migration parity remain separate gates.


## Pre-migration capability-preservation gate

Before any real-schedule migration (including a real-data pilot), the actual current Netlify production and eventual Supabase/Vercel runtime must pass the complete [REGRESSION_MATRIX.md](./REGRESSION_MATRIX.md) comparison and receive explicit user approval. Preserve existing capability, data and practical usability; verified improvements may pass without exact pixel matching or a waiver solely for differing. Regressions, untested required behavior and unresolved material tradeoffs block migration. Local contract/rehearsal success does not establish runtime parity. Synthetic work remains within its existing authorization; no new live access, data transfer, deployment or cutover is implied.
