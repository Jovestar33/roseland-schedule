# Local Supabase schedule read/update contract

Implemented on `codex/migration-schedule-contract`, following the integration of the auth and schedule foundations. This is an isolated local/tested slice. The existing editor still uses Netlify; no hosted migration, endpoint deployment or backend switch is included.

## Interface

Use a normal authenticated Supabase session client with `createScheduleRepository` in `lib/platform/schedule-repository.ts`. No service-role credential is required or appropriate for this adapter. The database receives the verified user identity through Supabase's normal JWT/RLS path; callers never supply an actor or organization to select an authority.

| Operation | Database RPC | Result |
|---|---|---|
| Read one active schedule | `read_schedule(target_schedule_id uuid)` | Full internal schedule record permitted by the caller's current production access. This is not a public/client-share projection. |
| Replace an existing document | `update_schedule_document(target_schedule_id uuid, expected_version bigint, next_document jsonb, schema_version integer)` | Updated record, incremented `document_version`, server timestamp and actor. Requires schema version 1 and a positive safe-integer expected version. |

`document_version` is the concurrency authority. The legacy document `savedAt` is preserved as data, not trusted as a write precondition; `updated_at` is the server timestamp. The row's stable organization/production/day IDs remain authoritative. This operation cannot rename, move, change status, archive, delete, restore or create schedules. Legacy project/phase/date labels remain document fields; synchronizing those with hierarchy edits is outside this document-only contract. The relational `town` summary is synchronized to trimmed document town in the same update.

The SQL validator accepts optional known legacy fields, including contact data, call-sheet fields, weather, zero duration and sub-locations. It rejects unknown fields/schema versions, invalid containers/types, invalid dates/times/durations, out-of-range coordinates, fractional/invalid day counts, oversized text, more than 5,000 rows, more than 100 sub-locations per row, or a document above 2 MiB. Unknown data is rejected, not silently dropped. Before migration, reconcile real export shapes against this contract and deliberately evolve the schema for legitimate exceptions; do not silently strip legacy data to pass validation.

## Permission and transaction guarantees

- Read uses invoker rights and RLS. Schedule/history reads also require an active day and, when present, an active phase; existing production/organization membership checks still apply.
- Update is a narrowly scoped security-definer function with a pinned empty search path. It checks current production edit access and active parents, locks organization/production/membership/day/phase rows against concurrent lifecycle changes, and rechecks permission after locks. Viewer, suspended and cross-organization writes fail without exposing document contents or versions.
- One conditional UPDATE compares the expected version. The existing triggers increment the version, attribute the actor and append immutable history/checksum inside that transaction. A history-write failure rolls back the document, summary and version.
- Direct authenticated schedule INSERT/UPDATE privileges are revoked so callers cannot bypass validation or omit the version. Creation and administrative lifecycle operations require separate contracts before exposing the target editor. Trusted database-owner operations remain the migration/administration boundary.
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

`supabase/tests/database/schedule_contract.test.sql` exercises the actual SQL/RLS boundary, malformed legacy documents, access denials, stale/omitted versions, parent deletion and an injected history failure. Existing schedule-domain tests now use the mutation boundary; privileged fixture deletion remains only to test immutable history and read restrictions. No test asserts a user-facing delete/restore contract exists.

`scripts/test-schedule-concurrency.py` uses two real local PostgreSQL connections for competing writers and both suspension/write orderings, observes lock waits and verifies current document/history consistency. It creates only new fictional fixtures and leaves them in the disposable stack for inspection. Run it after the transaction-isolated pgTAP suite; rebuilding the disposable stack clears those fixtures. CI also retains the eight invitation/suspension races and runs the new schedule races.

The TypeScript adapter tests verify request/version forwarding, bounded error mapping, uncertain outcomes and malformed acknowledgements. Full app tests, type/build and local database/advisor results are recorded in `READINESS.md`. The separate `scripts/test-schedule-auth-runtime.ts` now verifies genuine login-issued user sessions through the actual local API/RLS path, including denial, conflict and history rollback. Hosted runtime and editor integration remain unverified.

Next: the minimum create/rename/move/archive/restore and metadata contracts, repository coverage, application account/session integration, and complete export/import/reconciliation needed for the protected Vercel/Supabase pilot. Phase/day direct updates, their complete optimistic/lifecycle rules, and the broader legacy importer remain unfinished. Installation/offline and Production Command are outside this slice.
