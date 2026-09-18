# Approved follow-on decisions — September 17, 2026

Planning record from Voice and Planning. B08 implementation continues separately. These approvals define product behavior; they do not authorize actual account changes, deletion, notifications, hosted changes or implementation of B05/B09/B10. Detailed acceptance and enforcement remain to be verified. This record supersedes older statements that these particular decisions are unanswered.

## B05 — Snapshots

- Editors, Organizers, Organization Admins and Organization Super Admins can create and name snapshots within their effective edit permissions.
- Organizers and organization leadership can move snapshots to recoverable Trash and restore them by default; leadership can configure these permissions through established settings authority.
- Organization Admins and Super Admins can permanently delete trashed snapshots within their authority, with explicit confirmation. This is not permission to purge immutable document history.
- Named snapshots do not expire automatically. Preserve every imported legacy snapshot.
- Organization leadership can configure automatic-snapshot retention; default is no automatic expiration.
- Automatic snapshots reaching configured retention move to recoverable Trash, never automatic permanent purge. Named and imported snapshots are exempt.
- Snapshot Trash remains recoverable until deliberate authorized permanent deletion.
- Existing legacy capture behavior is the baseline; no re-opening established timing/workflow decisions without a demonstrated conflict. Existing creation policy governs Save As New.

## B09 — MFA and recovery

- MFA required for Platform Super Admins and Organization Super Admins.
- Ordinary Admins, Organizers, Editors and Viewers have optional MFA by default; organization policy may require it.
- Existing sensitive invitation-management actions retain recent-MFA requirements, including for ordinary Admins. No code prompt for ordinary schedule saves is implied.
- September 18 refinement: Organization Admins and Organization Super Admins may approve authenticator-loss recovery for Production Organizers, Editors and Viewers within their organization. Recovery for Organization Admins and Organization Super Admins requires an Organization Super Admin. Verify identity through a previously known phone number or in person; email alone is insufficient. Retain the recovery audit and affected-user notification.
- If no Organization Super Admin can sign in, escalate recovery to the Platform Super Admin, with verified identity, audit and notification to the organization's Super Admins.
- These concepts do not grant unrestricted cross-organization access or an unverified reset mechanism. The ordinary proof method and approver roles are settled. Account-wide/cross-organization effects, the restricted execution mechanism, revocation and safe recovery design remain technical review items. This approval does not enable factor removal or a recovery bypass.
- The proposed routine old-and-new authenticator verification process was not answered; do not mark it approved.

## B10 — Membership and organization deletion

- Admins can suspend members within their authority while preserving schedules and history. This is organization membership suspension, not global account banning.
- Only Organization Super Admins may suspend Organization Admins; ordinary Admins cannot suspend peers or Super Admins.
- Organization Super Admins may suspend peer Super Admins with confirmation and notification, provided at least one active Organization Super Admin remains. Final-holder protection must hold under concurrency.
- Organization deletion requested by an Organization Super Admin has a 30-day cancellation/recovery window before permanent deletion; separate from subscription cancellation.
- During that window, schedules are read-only and export remains available only under existing effective export permissions. No new access rights or reinstatement of suspended users.
- Any active Organization Super Admin may cancel pending deletion and restore organization access during that window, with all Organization Super Admins notified. Existing member suspensions and restrictions remain.
- Purge execution, backup retention and any applicable retention constraints need an explicit implementation/release plan; no claim that all backups disappear immediately.

## Next planning review

Check current live legacy behavior and durable approvals before asking more product questions. B11 sharing needs a source-backed audience/field comparison and identification of actual unresolved choices, not a fresh questionnaire. Preserve the recorded legacy-link continuity and scoped-public-response requirements. B05/B09/B10 are not marked implemented by this document.

## Consolidated approvals — September 18, 2026

Collected in Voice and Planning while Development and Testing completed its focused B08 finish. Send together at the completed-batch gap; no individual decision messages or interruption of active work.

- **B11 creation:** Editors and above may create Client-view links by default within effective schedule and output permissions. Organization leadership may restrict sharing through Settings; read access alone does not grant publication authority.
- **B11 revocation:** The link creator, authorized Production Organizers and organization leadership may revoke links within their authorized production/organization, subject to effective restrictions.
- **B11 content:** Explicitly preserve the legacy Client scope, including ordinary schedule row notes. Continue excluding row contacts, call-sheet details, status/completion and history as documented in B11_SHARING_SOURCE_MATRIX.md. Inclusion of the existing row-notes field is approved for this Client scope; it does not authorize disclosing separately protected/internal content or bypassing source restrictions.
- **B11 options:** Retain authenticated Team and scoped read-only Client links. Do not add a separate Public option for this migration.
- **B15 review:** The user tests freely and gives notes naturally. Voice and Planning maintains one consolidated list against the reviewed build, groups related issues, and tracks fixes through user retest. Multiple rounds are expected.
- **B16 gate:** Wait for the user's explicit approval of the application's functionality after B15 review before starting the reskin. This confirms the existing gate; it is not a new question to ask repeatedly.

These are product/planning approvals, not evidence of implementation or permission for deployment, real data migration, cutover or changes to live accounts. Preserve the technical-first sequence and existing B08 accepted exception and evidence limits.

## Standing implementation and validation guidance

### Human review before reskin and migration

User explicitly requires a hands-on product review before the reskin. Include this within B15 without renumbering: provide the isolated working replacement and fictional schedules, let the user test normal workflows and give notes, record feedback against the reviewed build, fix blocking issues and return affected flows for review. User acceptance of that functional experience is required before B16. Automated acceptance is not a substitute. Optional improvements can be separately prioritized; B17 final revalidation and B18 explicit migration approval remain required. This adds a review gate, not authorization to deploy or move real data.

### Staged B16 reskin and preserved look

After B15 user review, preserve the current schedule look the user has approved as a named/versioned selectable Roseland preset. Also evaluate preserving the interface look for the user's own organization as an optional separate preset; that possibility is not yet a final design selection. B16 then has look-and-feel development/research, selected-direction refinement, application to the app, and final hands-on refinements. Keep schedule/document styling and interface styling independently selectable where appropriate. Both B15 and B16 support multiple feedback rounds and a consolidated notes log. Canonical details are in PRODUCTION_COMMAND_DESIGN_BRIEF.md; roadmap numbering and technical-first sequence are unchanged. Planning only, no current development interruption or reskin dispatch.

User direction: “we want sanity everywhere. not overkill.” Use the simplest maintainable implementation that meets approved requirements, reusing proven legacy behavior and settled decisions. Focus verification on ordinary user workflows and credible data-loss, access and recovery risks. Run relevant existing checks after changes; repeat or broaden only for an actual failure, change or unresolved material concern. Avoid speculative matrices, unnecessary frameworks/infrastructure, repeated environment rebuilds, redundant questions and endless evidence collection. Stop at agreed acceptance criteria, distinguish release blockers from nonblocking improvements, and disclose untested limits. This does not waive agreed parity, data preservation, permissions, source isolation or explicit release approval.

## Development checkpoint pointer — September 18

This development copy incorporates the shared planning approvals. Earlier implementation-status sentences are dated context, not current acceptance: B05 is locally accepted at `c356573`; focused ordinary B08 acceptance is recorded at `5f05bd3` with its exact exception and evidence limits in [B08_USER_FLOW_CHECKPOINT.md](./B08_USER_FLOW_CHECKPOINT.md). These approvals do not dispatch B09/B10/B11 implementation. The next bounded technical proposal is [B09_B10_NEXT_TECHNICAL_PROPOSAL.md](./B09_B10_NEXT_TECHNICAL_PROPOSAL.md).

## Coordination and next-slice handoff — September 18

- The user calls Development and Testing **Devtest**. Voice and Planning collects side-chat decisions and sends one consolidated handoff at completed-batch gaps, unless urgent steering or a stop is needed.
- Stop routine “live app unchanged” status repetitions. If proposed work will affect the live app, prominently state **LIVE APP WILL BE CHANGED** before proceeding and preserve the applicable approval requirements. This wording is advance notice, not authorization by itself.
- B09-A is locally complete at `a662c69`; [B10-A scoped membership suspension](./B09_B10_NEXT_TECHNICAL_PROPOSAL.md#b10-a-scoped-membership-suspension-and-reinstatement) is the next reviewed, ready implementation candidate. This handoff dispatches documentation only, not B10 or exceptional recovery.

### Superseding B10-A dispatch

The user explicitly authorized B10-A suspension **and reinstatement** after the completed-batch planning handoff. Reinstatement follows suspension authority: Organization Admins restore lower-role members; Organization Super Admins restore Admins/Super Admins. Restore the prior role and retained restrictions for that membership only, preserve independent production/schedule restrictions, and never recreate invalidated invitations, alter global bans or restore unrelated memberships. Preserve current authorization, versioned exact receipts, confirmation/notification and final-active-holder protection. Earlier “awaiting dispatch” text above is historical; B10-B and exceptional recovery are not dispatched.

### B10-A local implementation checkpoint

The authorized suspension/reinstatement slice is implemented with [bounded local acceptance](./B10_A_LOCAL_ACCEPTANCE.md). The role/restriction, current-authorization, notification, exact-retry and final-holder requirements above remain authoritative. No B10-B or exceptional recovery dispatch is implied.

### Superseding B10-B dispatch and local completion — September 18

Following B10-A `09e7553`, the user explicitly dispatched the bounded 30-day organization deletion-request/read-only/cancellation slice. It is implemented and locally accepted in [B10_B_LOCAL_ACCEPTANCE.md](./B10_B_LOCAL_ACCEPTANCE.md). Any active same-organization Super Admin may cancel strictly before the deadline without altering suspensions, roles, restrictions or invitations. At the deadline, the organization remains frozen awaiting separately approved purge work. This supersedes earlier B10-B-awaiting-dispatch wording only; permanent deletion, scheduler, billing, exceptional recovery, B11 and release/reskin remain outside the dispatch.
