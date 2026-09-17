# LIB-01 / UI-01 — library fidelity and usability gap

**Open; library parity is not accepted.** The user reported that library fidelity/design/layout are substantially different. The paired fictional comparison confirms concrete differences. This is a technical readiness gate before reskin; styling cannot replace missing library functions.

## Observed comparison

The existing `components/library/LibraryPage.tsx` / `LibraryTree.tsx` show production/phase hierarchy, compact schedule rows, search/filter controls, Library/Templates/Backup/Restore tabs, row actions and New Schedule/Phase/Production affordances. The local target shows a flat paginated set of schedule buttons below a large account/workspace header; lifecycle actions are on a different screen. It lacks the corresponding hierarchy/search/filter/row-action surface and occupies substantially more vertical space before schedules. On phones, the legacy hierarchy and actions remain compact while the target account and workflow controls dominate the first viewport.

Paired screenshots in `evidence/b02-documents/screenshots/`:

- `b02-library-legacy-desktop.jpg` and `b02-library-target-desktop.jpg`: 1280×720 viewport.
- `b02-library-legacy-mobile.jpg` and `b02-library-target-mobile.jpg`: 390×844 viewport.

Both sides use the same three fictional schedule names. Captures were made sequentially in the same browser tab with DOM-verified viewport sizes. Full-page screenshots can exceed viewport height. Baseline port 3403 is a read-only fixture harness around the existing LibraryPage, with mocked authentication and intercepted local legacy reads; target port 3404 uses genuine local Auth/RLS. This demonstrates local layout/function differences, not hosted/auth equivalence. Shared B02 components exist in the baseline build, so it is not a pristine historical PDF baseline; the compared LibraryPage itself is unchanged from B01.

## Required bounded follow-up

Integrate the approved production/phase/day/library model, hierarchy, list/search/order, compact row controls and navigation while preserving draft/recovery contracts. Agree placement/move/metadata authority and legacy identity/alias behavior under D03 before changing those contracts. Review desktop and phone function/layout against the labeled baseline before any reskin. Test authorization, stale/concurrent moves, metadata reconciliation, deleted-parent recovery and aliases where approved.

B02 covers document controls; B04 is explicitly existing-day-only copy and schedule file tools. Neither silently implements B03 placement policies or accepts this local list as the final library. A concrete next-batch brief will accompany B04 completion. No actual live schedule access or mutation is authorized by this comparison.
