# Inline control parity checkpoint

September19,2026. Isolated branch `codex/b15-inline-controls`, checkout `/private/tmp/roseland-b15-inline-controls`, based on document checkpoint `d172f50`. Review: http://127.0.0.1:3518/review. Build `GvjzjKCWyRkBh2FAjTiys`. Completed3516 and earlier3514/3512 previews remain frozen and running.

## Demonstrated defects and correction

1. Tab from Close skipped project name, phase, production day, producer, director and camera because their edit triggers were mouse-only spans. These six triggers are now native buttons styled to retain the existing text layout. Enter/Space opens editing. Enter commit and Escape cancellation restore focus to the same trigger; Tab commit continues forward. Read-only presentation keeps plain text.
2. Editing a row description, checking a nested location as done, then pressing Undo also removed the earlier description edit. Nested completion now creates its own undo snapshot, matching the existing main-row completion control. The regression test exercises the actual LocationCell handler and real schedule store: Undo preserves the earlier edit, and Redo restores completion.
3. Opening the production-day field and pressing Escape marked a clean, unchanged schedule Unsaved. Cancellation now discards only the uncommitted inline draft. No metadata write is issued on Escape.

These are bounded interaction corrections. No layout redesign, backend/schema change, permissions change or provider change was made.

## Browser verification

The before-build baseline directly reproduced all three defects. After rebuilding:

- Keyboard Tab reaches all six fields in order. Enter opens each; Escape returns focus and keeps the clean schedule Saved. Space activation also works. Project/phase normalization remains in place; Tab from phase commits and moves to production day.
- Invalid day3/2 remains editable with the existing explanatory error. Correcting to2/3 and committing returns focus. All three crew fields accept keyboard entry and commit. The final saved metadata agrees with authenticated readback.
- Description edit → nested completion → Undo retains the earlier description and clears completion. Redo restores completion without changing that description. Saved reopen and authenticated readback retain both.
- At actual390×844, the page has no horizontal overflow; header controls fit, crew truncation remains the existing behavior, project/day keyboard cancellation returns focus, and invalid day cancellation preserves saved metadata. Nested toggle/Undo and keyboard removal/Undo preserve the relevant description and completion baseline. Temporary unsaved narrow checks were discarded through the normal guard.
- A pointer automation attempt on the horizontally off-screen nested remove control produced no visible action. It is not counted as removal; subsequent keyboard activation visibly removed the nested row, and Undo restored it. The earlier extra Undo is retained in the evidence with explicit no-action filenames. This does not establish physical touch behavior.

Measured1200px fonts, colors, column widths and total metadata height are unchanged. Relative phase/crew/table positions remain unchanged. The earlier screenshot had a saved-notice banner, explaining a21px page offset. A native project button has different element bounds from the prior inline span; exact screenshot identity is not claimed. The initial fixture had a blank action, whose inherited inactive-row style hides its textareas. After selecting Shoot, the same visible-row Undo journey was compared against preserved build3516: its Undo loses the preceding visible description edit, while3518 retains it. Redo, deliberate Save and reopen were repeated for this visible-row correction. The final fixture retains Shoot and the visible description. No saved edit was made from the comparison tab. Screenshots and text/DOM evidence are in `evidence/b15-inline/cases/`. This is a before/after candidate comparison, not a newly repeated hosted or isolated-legacy browser run.

## Validation and retained data

101 editor tests pass, including the new interaction/store regression. Type checking and production build pass; two existing hook warnings remain. The first sandboxed build could not resolve Google Fonts; rerunning the same build with normal dependency network access succeeded. No application workaround was added.

Only one new schedule was created through ordinary UI: `B15 inline controls — fictional`, ID `efc8579e-e920-474f-970a-1a1d0a0b33e1`. It is retained at version5. All16 previously retained schedule names, saved versions and complete documents match the previous authenticated export exactly. No actual schedules, identities, memberships, grants, restrictions, production settings or hosted data were modified. Existing normal account sign-in and locally scoped helper sign-out were used.

Full acceptance remains44 Partial,1 Not executed,0 full Pass. See `B15_REMAINING_GATES.md` for the reconciled stopping boundary. No report transmission through the rejected coordinator route was attempted.
