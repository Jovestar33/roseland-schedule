# B05 local snapshot implementation checkpoint

September 17, 2026. Focused B05 local acceptance is complete. The historical blocked checkpoint remains below so earlier failures are not erased.

The fresh fictional stack passed 48 runtime assertions, 489 database assertions, 205 platform tests, 62 editor tests, TypeScript and the final build. SQL lint has one unused-variable warning; security advisor reports no issues. Authenticated desktop and phone-width checks verified capture/complete preview, content restoration with prior-draft recovery, Save As New, recoverable Trash, purge review/cancel and keyboard operation. The real five-minute automatic capture also passed with the panel open: 140 to 141 snapshots, complete dirty draft captured, source unchanged at unsaved version 3, unfinished snapshot label retained.

See [focused finish review](evidence/b05-snapshots/FINISH_REVIEW.md) for exact changes, evidence and limits. Ordinary local login checks remain unchanged. All source/test changes are local; no actual schedules, hosted services, actual accounts or mail were changed. No push or deployment. B08 investigation remains paused.

---

# Historical checkpoint before focused finish

September 17, 2026. **Implementation saved; acceptance incomplete.** No actual schedules, hosted services, exports, users or mail were changed. No push or deployment. The paused B08 provider investigation was not resumed.

## Implemented locally

- Separate snapshot storage and authenticated APIs for capture, complete listing/preview, naming, content restore, recoverable Trash/restore, and explicitly confirmed leadership-only purge of trashed snapshots.
- Actor-bound immutable request receipts and durable client journals. Automatic dirty-draft capture uses the existing five-minute interval and does not save or clean the live schedule. Capture/recovery is fenced by account, organization, stable schedule and document session.
- Leadership-controlled automatic retention (default none) and configurable Trash authority (default Organizer). Named and imported records are exempt; expiry moves eligible automatic records to recoverable Trash.
- Trusted catalogue materialization preserves original IDs, labels, timestamps, payloads and collection order without a count cap. An independent import ledger prevents replay from resurrecting purged copies. No actual import ran.
- Save As New uses the existing source/destination creation policy and retains template restrictions. Editor snapshot authorship grants no schedule-creation authority.
- Local Snapshots panel includes complete preview, reviewed actions, settings and Save As New. Restore persists the previous draft/undo history before sending, uses optimistic versions and checks current document/edit identity before loading the result. A late/recovered result leaves the current draft intact for deliberate reload.

## Verified in this checkout

- Standard Supabase CLI applied `20260917234000_snapshot_policy_import_copy.sql` to the isolated `roseland-b05-20260917` stack using its explicit loopback address and ten-second connection timeout. `20260917233000_schedule_snapshots.sql` was already applied. The rejected direct-container application was never executed.
- 489 pgTAP tests across 18 files pass, including seven new snapshot privilege checks. Two existing transaction-rolled-back fixture cleanup lists were updated for the new foreign keys.
- 202 platform tests pass, including six snapshot model/recovery/timer tests and four settings/copy recovery tests. The model inventory test preserves 137 records across pages.
- 62 editor tests pass. Production build passes; only the pre-existing LocalScheduleLibrary hook warning remains. Final TypeScript check passes.
- One partial genuine-session runtime run confirmed complete draft capture, authorized preview, unchanged live schedule payload/version and unchanged saved-history count. Its initial deny assertions predated stricter error-code checks, so they are not accepted as independent permission-denial evidence.
- The local browser reached the workspace sign-in page only. No authenticated B05 browser acceptance is claimed.

## Remaining blocker and acceptance work

The established fictional login/runtime fixture repeatedly encountered local service failures: an initial signup failure, a transport timeout while recovering an exact capture request, then a signup 504. A single standard stop/start of the B05 stack preserved its database volume and completed. After restart, the fixture failed its existing `getUser` verification of a password-login-issued session. No authentication check was removed, no provider change was made, and no further account investigation was performed. These failures do not establish a provider-security finding.

The full snapshot runtime suite remains **failed/incomplete**. Tests for role denials, settings, exact retries, naming/expiry ordering, content-restore conflicts, full trusted import preservation, no-resurrection replay, copies and inherited template restrictions are written but not fully executed. Runtime success, SQL lint/advisor review, final code review and authenticated browser checks (including late responses, dirty restoration, recovery, desktop/mobile keyboard operation and the real five-minute timer) remain required before B05 acceptance. The local browser test tab was closed and its web server stopped; the isolated database volume is preserved.

Evidence is in `evidence/b05-snapshots/`. Original failed logs are retained alongside passing checks; none are relabelled as passing. No B05 completion claim is made.
