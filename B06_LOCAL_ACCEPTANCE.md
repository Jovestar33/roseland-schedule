# B06 local template workflow acceptance

Status: accepted for the bounded fictional local workflow on 2026-09-17. Whole-product legacy parity remains open; this does not assert a fresh hosted production comparison, physical-device acceptance or permission to deploy.

## Contract and implementation

Production-only is the default. Source Production Organizers and Organization Super Admins/Admins may deliberately publish after reviewing complete rows, including notes and contacts. Editors manage templates in their production; Viewers read only. A later content/name change or Trash withdraws publication, and restore remains production-only. Cross-organization template discovery is denied.

The Templates panel supports browse, save draft, replace, rename, recoverable Trash/restore and publish/withdraw. Captured mutations are immutable, bound to actor and organization, written and read back in local recovery storage before dispatch, and checked against exact server receipts after an uncertain reply or reload. A different account cannot recover the first account's request. Closing a review or changing scope invalidates late UI callbacks.

Apply replaces every draft row, preserves receiving metadata/name/placement, and records matching pending provenance in Undo/Redo. Copy/move/new-template capture waits for the Apply save. Save atomically writes the rows with snapshots of source restriction contexts; direct table/history reads, downstream copy and receiving transfer previews honor those contexts. The preview bypass was reproduced before a forward-only correction. Contexts are immutable restrictions captured at accepted delivery, not a promise to recall already delivered data after later source-policy changes.

A stale template review blocks save while retaining the draft. After a fresh saved-result check confirms the original version is still current, the user can keep the draft and review again. Reapplying fully replaces rows and obsolete pending provenance; Undo retains the earlier draft. Original optimistic versions prevent a delayed previous save from being overwritten. Confirming an earlier save never marks newer edits clean.

Browser-only discovery does not infer ownership. A file or the current browser's legacy map is inspected intact; the user chooses one template, an explicit production, a unique name and confirms authority over its content. Import is create-only and production-scoped. Generated sun rows are omitted from the imported copy. Existing browser data/files remain untouched, and source export preserves exact bytes. Unknown/malformed input is rejected as a whole. Import form state survives a name collision and is cleared on account/organization changes.

## Verification

- 110 genuine Auth/API assertions on each of two isolated template stacks.
- 447 database assertions, 184 platform tests, 60 editor tests and 111 B03 Auth/API transfer/library regression assertions pass.
- TypeScript and production build pass. The build retains one pre-existing LocalScheduleLibrary effect-cleanup warning. Database lint and security advisors report no issues.
- All 25 previously committed migration files remain byte-identical; three new migrations replay successfully.
- Chrome desktop 1280×720 and phone viewport 390×844 checks cover the workflow, explicit import ownership, collision retention, publication roles, account isolation, keyboard focus, Apply/Undo/Redo/discard, delayed responses and stale-review recovery. The phone template dialog is 350 px wide with no horizontal overflow.
- Actual browser downloads match the fictional original source byte-for-byte. The JSON upload fixture hash remains `51d2894fb8eaac30c7ea3c9f10f4f7fcb0948f829c675b0b1523cd4f3359f202`.
- Both fictional source schedules remain version 1 with exact original documents. Only dedicated fictional receiver schedules were intentionally saved.

Detailed logs, sanitized loopback request trace, screenshots and machine-readable results are in `evidence/production-templates/`. Temporary synthetic login credentials are excluded from all evidence and Git. Browser viewport overrides were reset. Existing local recovery volumes and unrelated shared-checkout changes were preserved.

## Next bounded slice

B07 covers existing organization configuration/branding, without a new reskin. The user explicitly chose Organization Super Admins and Admins as its writers; Production Organizers do not receive organization-settings authority merely because they can publish templates. Preserve current configuration fields and document/editor consistency, and verify cancel/reload, conflicts, account isolation and denied writes with fictional fixtures.
