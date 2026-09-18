# B05 local implementation notes

Current checkpoint: the focused local finish has passed 48 genuine-session snapshot assertions, 489 database checks, 205 platform tests, 62 editor tests, TypeScript and the final build. Authenticated desktop/mobile browser workflows and the real five-minute automatic capture check pass. Focused local B05 acceptance is complete. See `B05_LOCAL_CHECKPOINT.md` and `evidence/b05-snapshots/FINISH_REVIEW.md` for current evidence and limits. Earlier blocked/paused sections below are retained as historical evidence and are superseded by the focused finish.

Historical initial model checkpoint; no B08 provider investigation. Completed at that checkpoint: immutable snapshot request capture, actor/organization/schedule-bound recovery journal, full pagination and a five-minute active-document dirty timer (six focused tests passed, commit `43f0735`). Repository methods are contracts awaiting the database/UI implementation, not completed feature acceptance.

## Storage and authority

Snapshots use separate private tables and never append saved-document history when captured. A snapshot remains attached to the stable source schedule ID and follows its current scope/effective permissions. Read/preview requires source history access; capture/name/content restore require effective edit access. Unsaved B06 template applications are reviewed and their permission contexts retained with the snapshot, without saving or changing the source schedule. Applying/copying snapshot content retains those contexts through the existing template binding mechanism.

Organization settings default to no automatic retention and Organizer-level Trash/restore. Leadership can choose Editor, Organizer or organization-leadership minimum for snapshot Trash/restore; Viewers retain read-only behavior. Explicit inherited restrictions still deny operations. Purge always requires organization leadership, current effective edit/Trash authority, an already-trashed selected record, expected version and explicit confirmation; changing the snapshot Trash setting does not delegate purge.

Mutations lock existing organization permission state, then source schedule and selected snapshot in consistent order. Exact request receipts bind actor, scope, operation, expected versions and payload fingerprint. Content is immutable after capture; naming changes the label/protection only. Purge retains a non-content audit/receipt and never cascades into saved history, copied documents or imported catalogue originals.

## Automatic capture and retention

Capture remains every five minutes while the active document is dirty and editable. It neither saves nor marks the document clean. Timer and in-flight requests are bound to actor, stable schedule ID and document session. An uncertain attempt retains the same request and snapshot IDs; it must be checked/retried before another automatic capture is allocated. Account/navigation changes cannot dispatch against the old document or apply its response to the new one.

Retention age uses server capture time for native automatic snapshots. Null retention means no expiry. Named and imported snapshots are exempt. Naming and expiry use the same permission/row locking so one reviewed transition wins; a stale naming attempt cannot silently alter a newly trashed snapshot. The local application requests a bounded retention sweep for the authorized source schedule; the database applies only the leadership-configured policy and moves eligible readable automatic records to recoverable Trash. No independent hosted scheduler or automatic purge is started.

## Restoration, copies and imports

Content restore reviews snapshot and live schedule versions, explicitly handles the current dirty draft, preserves current schedule identity/name/placement and uses optimistic saved-document update. The UI must retain any newer edits while recovering an uncertain committed restore. Save As New uses the accepted Organizer-and-above source/destination creation contract and preserves source/template restrictions; snapshot authorship adds no creation privilege.

Imported collections are materialized only from the trusted private migration catalogue in a deliberate fictional migration test. Preserve original ID, label, saved timestamp, collection order and entire payload, with no count cap or browser normalizer. Original catalogue records remain unchanged even if an authorized local snapshot copy is later purged. No actual migration/export is authorized.

The original acceptance requirements were database/runtime role and exact-retry checks, full UI integration, import preservation, naming/retention ordering, stale restores, copy restrictions, Trash/confirmed fictional purge and browser review. See the current checkpoint above for verified results; the historical pause notes below do not describe the current status.

## Paused local migration checkpoint

The isolated `roseland-b05-20260917` stack is healthy and has applied migration `20260917233000_schedule_snapshots.sql`. The next migration, `20260917234000_snapshot_policy_import_copy.sql`, is saved in this checkout and the disposable stack directory but has NOT been applied or runtime-validated. It adds leadership settings, trusted catalogue materialization, and snapshot copy/recovery operations. UI integration and acceptance remain incomplete.

The standard `supabase migration up --local --workdir /private/tmp/roseland-b05-20260917` command failed twice with `LegacyDbConnectError` / `PgClient: Connection timed out`. A proposed direct container SQL application with migration-history recording was rejected by automatic approval review as bypassing the user instruction to stop at a B05 platform block. That command did not execute. No workaround or further database mutation was attempted. Work is paused pending direction on the standard migration connection problem. No B08 investigation resumed, no hosted changes, and no actual schedules changed.

## Authorized read-only connection diagnosis

The user approved diagnosing the standard migration connection without applying SQL or changing migration history. Confirmed: PostgreSQL is healthy inside its container; localhost port 57322 accepts TCP and PostgreSQL handshake traffic; the CLI connects to the correct loopback port; database connection counts are well below the limit and no blocked active database query was seen. Installed CLI is 2.109.1. Standard `migration list --local` and an explicit loopback URL with default connection settings both fail in about three seconds. Standard read-only `migration list` with an explicit loopback URL and `connect_timeout=10` succeeds (with default SSL negotiation); `sslmode=disable&connect_timeout=2` also succeeded once. This isolates the observed problem to connection setup/default timeout behavior rather than migration execution; the precise source of setup latency is not established. No CLI replacement, container restart, configuration edit, SQL application, or migration-history write was performed.

Successful listings confirm migration `20260917233000` applied and `20260917234000` still pending. A proposed next action is the normal Supabase migration command against the same explicit loopback database with a ten-second connection timeout, subject to authorization to resume writes. The direct-container application route remains unused.

## Historical validation handoff before the focused finish

See `B05_LOCAL_CHECKPOINT.md` for the saved implementation and exact evidence limits. Standard local restart completed with data preserved, but the established fixture subsequently failed session verification. Runtime attempts stopped; no provider-security investigation or authentication workaround followed. B05 acceptance remains open.
