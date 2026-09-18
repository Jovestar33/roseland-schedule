# B05 snapshot catch-up — approved policy, implementation not dispatched

September 17, 2026. This reconciles the unfinished B05 checkpoint and subsequent explicit user decisions. B08 remains the active implementation batch. No snapshot implementation, real data change or actual deletion is authorized by these planning decisions.

## Current evidence and scope

The private migration catalogue preserves complete synthetic snapshot collections, IDs, labels, order and original payload/history without the legacy 25-item truncation. Target immutable saved-document history has local restore evidence. Neither implements named snapshots or automatic capture of unsaved drafts in the target editor. Current legacy `ScheduleEditor.tsx` captures dirty drafts every five minutes; `lib/api/snapshots.ts` and `useSnapshotActions.ts` still use Netlify. No target B05 acceptance was found. See [B08 brief](./B08_NEXT_BATCH_BRIEF.md), [related migration contract](./RELATED_MIGRATION_CONTRACT.md) and original [B05 queue](./TECHNICAL_ACCEPTANCE_AUDIT.md).

Keep snapshot records separate from immutable saved history. Existing capture timing/workflow is the baseline; these decisions do not replace it with document-save history or silently import a legacy bug. Legacy deletion ignores non-success responses, and legacy collection normalization caps at 25; neither is target acceptance or an approved new retention rule.

## Approved product contract

| Operation | Approved authority and behavior |
|---|---|
| Create and name | Production Editors, Organizers and Organization Admins/Super Admins, within authorized production/schedule scope and effective edit/policy restrictions. No unauthorized scope or platform cross-tenant access. |
| Snapshot Save As New | Preserve the previously approved schedule-creation policy: Organizer-and-above at the authorized destination, with source and destination restrictions. Snapshot authorship does not grant new-schedule creation to Editors. |
| Recoverable Trash / restore from Trash | Organizer-and-above by default, within authorized scope and effective restrictions; organization leadership may configure this through established settings authority. This concerns snapshot records, not changing existing document-content restoration authority. |
| Named retention | Named snapshots remain until deliberately removed. No automatic expiry, pruning or silent item-count cap. Deliberate removal first follows recoverable Trash. |
| Imported legacy snapshots | Preserve every imported snapshot. Imported records are exempt from automatic retention, including imported records originally labelled automatic. No silent normalizer truncation. |
| Automatic retention | Organization leadership may configure a retention period for automatic snapshots. Default: no automatic expiry/deletion. Named and imported snapshots are exempt. Existing capture timing remains the baseline. |
| Retention expiry | Eligible automatic snapshots move to recoverable Trash, never automatic permanent purge. Background retention must not infer more authority than the configured policy. |
| Permanent purge | Deliberate, explicitly confirmed action by Organization Admins or Organization Super Admins within their organization/schedule scope and effective restrictions. Organizers alone cannot purge. Trash remains recoverable until such an action. This applies only to trashed snapshot records, not immutable saved history, schedules, accounts or organizations. No actual purge is authorized now. |

These are settled decisions; do not ask them again. Organization leadership means the established customer roles, not an inferred platform bypass. No retention service, timer or scheduled deletion has been started.

## Proposed bounded catch-up implementation

After a separate dispatch, add a tenant-scoped named-snapshot repository, exact mutation receipts and compact existing Tools/Versions integration for create/list/name/preview/restore/Save As New/Trash/restore-from-Trash/confirmed purge. Preserve complete payloads, original imported identities/order and provenance. Capture automatic snapshots from the current dirty draft under the current actor/document identity; capture itself must not save or clean the live document.

Use existing Editor content-restore and Organizer creation rules, optimistic versions, inherited restrictions, B06 template-source restriction contexts and actor/session fencing. Restoration must preserve current schedule identity/placement and retain newer local edits under the established explicit review/discard contract. Do not reuse the legacy force-overwrite path blindly. Exact retries must not allocate replacement identities or claim a failed acknowledgement means a failed mutation.

Implement retention only through the approved organization configuration and recoverable Trash transition; no default expiry and no count-based pruning. Name/protect an automatic snapshot before expiry using a reviewed atomic transition, so concurrent naming and retention cannot silently remove protected content. A technical design should specify age calculation, eligibility, scheduler ownership, row locks, audit, recoverable deletion receipts and backup/recovery implications before implementation. These are design obligations, not invitations for the user to choose database mechanisms.

Permanent purge must review the selected trashed snapshot, explain irreversibility, recheck current authority/restrictions and leave a non-content audit record. Do not claim that application record deletion immediately erases copies in retained backups; keep that operational retention statement explicit. Do not purge immutable saved versions or snapshot content still required by a separately retained artifact through a cascading shortcut.

## Acceptance and stop

Prove full collections over 25 items; original IDs/order/bytes; dirty-draft/manual/automatic capture; Editor/Organizer/leadership/Viewer/outsider boundaries; naming versus expiry races; default no-expiry and imported/named exemptions; Trash restoration and confirmation/cancellation; denied Organizer purge; exact retry after dropped acknowledgements; stale content restore; Save As New source/destination restrictions; timer navigation/account/expiry isolation; and zero actual-data access. Use fresh isolated local stacks, genuine fictional Auth, repository/SQL/browser checks, source manifests and forward-only migrations.

No further product question is identified in the recorded operations above. If source review reveals a genuinely new behavior, present the concrete conflict and recommendation. Full parity remains open until this target workflow is accepted; B06/B07 or B08 completion cannot close B05 by numbering. Stop after the separately authorized local B05 scope, with hosted deployment and actual data/deletion still excluded.
