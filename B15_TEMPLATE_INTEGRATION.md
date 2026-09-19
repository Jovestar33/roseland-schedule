# C06 template integration checkpoint — September 19, 2026

Completed bounded local correction after the coordinator's C06 review. This is a saved engineering checkpoint, not whole-app parity acceptance. Implementation stops here for the coordinator's planned fresh-task handoff. No competing implementation task was started.

## Review identity and authority

- Checkout: `/private/tmp/roseland-b15-template-integration`
- Branch: `codex/b15-template-integration`, based on `78343940378287d1a715454f4421bd41b0342aa3`.
- Review: `http://127.0.0.1:3496/review`
- Build: `OSrsuSnfOJ2U5mggulEmZ`; exact source hashes in `evidence/b15-template-integration/build-identity.json`.
- Runtime manifest: `/private/tmp/roseland-b15-template-process.json`.
- Ordinary fictional access file: `/private/tmp/roseland-b15-review-access.json`; private values remain outside source/evidence.
- Product acceptance authority: `/Users/johnsammon/roseland-schedule/PARITY_PLUS_ACCEPTANCE.md`.
- Transfer authority: `/Users/johnsammon/roseland-schedule/DEVTEST_FRESH_TASK_HANDOFF.md`.
- Coordinator finding: C06 in `/Users/johnsammon/roseland-schedule/COORDINATOR_PARITY_REVIEW.md`.

The previous3494 candidate remains frozen at build `tjBgvlEtpK4FPyF7vvq1x` in `/private/tmp/roseland-b15-workflow-completion`. No rebuild, restart or source edits there. Older previews and actual schedules were preserved. No hosted writes, deployment, migrations, account/role changes, purges or new provider queries.

## What changed

Templates now opens with a plain introduction, compact scope controls and readable full-width template choices. The unavailable creation form no longer dominates library entry. Creation is a disclosure available in the context of an editable schedule in the selected production. The product route has one library/Templates entry; its duplicate standalone launcher is not rendered. Rehearsal entry remains available on its separate route.

Selecting a template immediately exposes its complete readable row preview. Rename, replacement, Trash/restore and publication controls are grouped under "Manage name, sharing and Trash" and retain their original permission predicates. Browser discovery, untouched-source export and reviewed import remain in a disclosure after browsing and contextual creation. Request receipts, result recovery, review version checks and apply semantics are unchanged.

Account password and authenticator entries now share one Sign-in and security section with plain introductory copy. The product-facing authenticator entry reads Two-step verification. Authentication behavior is unchanged.

## Control mapping and observed effects

| Entry/control | Current behavior and evidence |
|---|---|
| Library → Templates | Opens the browse-first dialog; all four current templates visible at390px. No standalone launcher outside it and no unavailable new-name field. `templates-browse-desktop.png`, `templates-phone.png`, baseline `templates-before.png`. |
| Library scope / production / Refresh | Production, organization publication and Trash were switched during lifecycle checks and show the relevant item after each mutation. Only one production exists in this account; cross-production permutations remain. |
| Template selection | Keyboard Enter and click load the complete preview, including notes, contacts and nested status in the existing parity fixture. Selected item state is exposed with aria-pressed. `keyboard-template-preview.txt`. |
| Creation from current schedule | Review → Cancel creates nothing and preserves the draft. Review → Confirm creates a new production-only template from reviewed draft rows. Phone cancellation returns to Saved source with Undo disabled. `template-review-phone.png`, `saved-readback.json`. |
| Apply / Keep current rows | Cancellation preserves the newer draft. Apply replaces rows in the draft; Undo restores the exact newer notes. No source save. `apply-cancel-undo.txt`. |
| Rename | Review and confirm rename the new fictional template without changing its identity. Final name/readback verified. |
| Replace with current draft rows | Reviewed replacement captures the newer unsaved notes; result preview and authenticated readback match. Source remains version5 with original empty notes. `template-replace-browser.txt`, `saved-readback.json`. |
| Publish / withdraw | Cancelled publish sends nothing; confirm exposes the new item in Published to organization. Withdrawal returns it to production-only. Final persisted state verified. No permission changes. |
| Trash / restore | Cancelled Trash leaves the item present. Confirm moves the new item into Production Trash; restore returns the same identity to production-only. Final template version7 is active. |
| Browser discovery | Find templates reports no browser templates in this origin; export-original entry appears. No storage inspection outside the UI. |
| Browser file import | Existing fictional JSON file can be selected through the normal chooser, complete source reviewed, destination/name chosen and production-only review opened. Cancel sends nothing; cancelled item absent in readback. `browser-import-review.txt`, `saved-readback.json`. |
| Browser source export | Entry is reachable in its moved disclosure. Byte-exact actual-download behavior is reused from unchanged child component's3494 test (`evidence/b15-workflow-completion/browser-template-export-check.json`); not claimed as a new C06 download. |
| Retry exact request / Check result | Existing retained-request footer is unchanged. Template recovery tests pass. No artificial lost-acknowledgement browser failure was injected in C06; that browser variant remains open. |
| Close / Escape / return | Escape returns to Templates in library and Tools in editor. Source newer draft survives template cancellation/return. Final explicit Close/discard removes only unsaved test edits. Narrow viewport has no page overflow; confirmation button remained within844px height. |
| Account security and recovery | Two-step verification expands read-only optional-MFA status and collapses. Reset password opens and closes recovery form. Back to schedules returns to library. No enrollment, password change, reset email or sign-out action. `account-desktop.png`, `account-phone.png`. |

These observations cover the changed controls and their effects. They do not replace the planned whole-app button inventory or every role/fixture permutation.

## Data and validation

Only new fictional template `284b256a-5b2f-41ef-a7bd-35fe26fae439` was persisted during this pass. It ends as "B15 C06 reviewed — fictional", version7, one row, production-only, outside Trash. Creation → rename → publish → withdraw → Trash → restore → replace accounts for those versions. Its reviewed row note is "C06 newer draft must survive cancellation".

Source schedule `619b6591-65f8-4fbd-a1b6-238825c186b0` remains version5, description "First writer fictional saved change", empty saved notes. Phone creation and browser-import cancellation names are absent. Ordinary authenticated read-only reconciliation: `scripts/read-b15-template-results.ts`, `evidence/b15-template-integration/saved-readback.json`.

Optimized build/type-check passed. Platform suite:240 passed. Relevant editor suite before final UI checks:14 passed; final targeted template apply/recovery and presentation rerun:11 passed. Logs retained in the evidence directory. Existing hook warnings remain; no new build error. Desktop1280×720 and phone390×844 used the in-app browser. Viewport restored and temporary phone tab closed. Phone emulation is layout evidence, not physical-device evidence.

## Remaining acceptance and next owner

`LOCAL_PARITY_EXECUTIONS.md` reconciles previously stale history, snapshot, template and library-backup summaries. Totals remain36 Partial,1 local Fail,2 Not executed,6 Blocked,0 full Pass.

The known Client recipient reload regression remains open: clearing the fragment leaves the bearer only in component memory. Its proposed server-managed recipient-session remedy requires a separate reviewed design; none was implemented here. See `B15_WORKFLOW_COMPLETION.md` for exact evidence and constraints.

Independent C06/recovery review, broader button effects, genuine multi-organization account switching, leadership Administration UI, actual print/PDF output and physical-device evidence remain outstanding. Native application access was previously blocked by automatic approval review; this pass did not attempt a workaround. Older saved3485/3487/3488/3490/3492/3494 previews remain intact. The coordinator should verify this commit/build, update its handoff document, and assign the next bounded work to the sole replacement owner. Do not start another implementation batch in this task.
