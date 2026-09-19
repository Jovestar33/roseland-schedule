# Save-feedback correction

September19,2026. Branch `codex/b15-save-feedback`, checkout `/private/tmp/roseland-b15-save-feedback`, based on `39706c3`. Stable review: http://127.0.0.1:3520/review. Build `i1TlVAmpPwZDzdvovJhVA`. Frozen3518 and earlier3516/3514/3512 remain unchanged. The final3520 instance connects directly to56521; scoped test proxy3519 is stopped.

## Confirmed defect and bounded change

The preserved3518 build displayed **Schedule saved.** at page level after a subsequent description edit and after Undo/Redo, while the editor correctly showed **Unsaved**. The message was still present after an intervening checkout/setup operation, so it was persistent rather than a single rendering frame. The notices also occupied vertical space above the editor.

The only application change suppresses that exact ordinary save-success notice while the current store says the draft is dirty. The notice remains available after a fresh completed save. Other messages and the save/recovery controller are unchanged. Rendering the condition from current dirty state avoids an effect delay and handles row edits, metadata edits, Undo and Redo through the existing state model. No dirty indicator or unsaved guard is weakened.

## Focused browser verification

- Ordinary Save shows the success notice with Saved. Editing hides that notice with Unsaved. Undo and Redo keep it hidden; this respects the editor's existing conservative dirty-state behavior even if Undo returns to baseline values.
- Close still displays the normal discard guard; Keep editing retains the draft.
- Actual390×844 viewport has390px page width, no stale success message or empty status paragraph, and no page overflow. `phone-unsaved.png` was visually inspected.
- A genuine save acknowledgement held by the candidate-only proxy leaves Save/Close disabled and the existing pending/recovery presentation visible. Editing before release produces **Saved earlier edits. Newer edits remain unsaved.** This meaningful message remains visible alongside Unsaved.
- A deliberately lost acknowledgement after a genuine commit preserves **Save needs review**, the exact-request explanation and Check saved result. Checking confirms saved version10 while preserving newer draft text and the page-level recovery-completed message. These observations verify the changed condition does not suppress those distinct recovery messages. Arbitrary other error variants were not rerun; the condition matches only the exact ordinary-success string.
- A subsequent deliberate save again displays Schedule saved with Saved. The existing fixture's original document content was restored and independently verified before handoff.

Evidence: `evidence/b15-feedback/cases/`, including persistent before-state, ordinary edit/Undo/Redo, unsaved guard, pending-save, newer-edit acknowledgement, uncertainty/recovery, narrow screenshots, scoped request trace and final authenticated readback. An initial automated empty-fill did not clear the test note; readback caught it. Keyboard Select All/Backspace visibly cleared it and a later save was verified. The no-change attempt remains explicitly labeled in the evidence; it is not counted as a successful edit.

## Validation and preserved state

37 focused existing save/action tests pass. Production build and TypeScript check pass; the same two existing hook warnings remain. The one-line rendering change does not alter requests, retry keys, saved versions, draft guards, permissions or persistence behavior.

No new schedule was created. Only the existing disposable `B15 inline controls — fictional` (`efc8579e-e920-474f-970a-1a1d0a0b33e1`) was saved during these checks, moving from version5 to12. Its final document content exactly matches the earlier checkpoint except its save timestamp. All16 other retained schedule names, versions and complete documents are unchanged. All earlier preview code/builds are preserved; their shared fictional test fixture naturally reflects the authorized saves.

No hosted writes, deployment, access expansion, credential change, real-data migration/export, deletion or rejected-route callback occurred. Full acceptance remains44 Partial,1 Not executed,0 full Pass. Remaining gates in `B15_REMAINING_GATES.md` remain unchanged; this closes the concrete follow-up finding only.
