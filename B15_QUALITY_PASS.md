# B15 quality pass — September 19, 2026

Local review candidate; full B15 acceptance remains open. This checkpoint addresses the independent coordinator findings in /Users/johnsammon/roseland-schedule/COORDINATOR_PARITY_REVIEW.md without changing hosted systems or actual schedules.

## Stable candidate

- Checkout: /private/tmp/roseland-b15-quality-pass
- Branch: codex/b15-quality-pass; starts from bb77fabe71c045fda3b0a75c8da8532249ba537c.
- URL: http://127.0.0.1:3492/review
- Build: T45AklKF6oIS3mSNptLXJ
- Exact changed-source hashes: evidence/b15-quality-pass/build-identity.json.
- Existing review3488 build z9spBaBH_vrJ6SXEJuCkC and legacy3490 were not rebuilt or restarted.
- Existing ordinary local access file: /private/tmp/roseland-b15-review-access.json. Legacy fictional access file: /private/tmp/roseland-b15-legacy-access.json, mode600. Credentials are excluded from this checkpoint and evidence. Legacy authentication succeeded through its normal form; navigation to its library completed the sign-in journey.

## Changes and observed verification

- C01: ordinary dirty Close says only that unsaved changes will be discarded. A real retained save attempt still receives a conditional uncertainty warning; a confirmed historical save receives distinct confirmed-save wording. Keep editing and discard behavior remain unchanged. The ordinary path was exercised; uncertain-save runtime permutations remain open, with existing controller tests passing.
- C02: action-specific success messages replace the blanket draft/reload notice. Success clears when opening a schedule or changing search/filter/scope. Explicitly discarded reviews clear their error. Create → edit → Save → Close → zero-result search showed no stale success message.
- Template previews render complete readable rows: multiline descriptions/notes, contacts, status/completion, timing locks, coordinates and nested locations. Preview/Apply/request confirmation no longer expose raw JSON. Review hides inactive library controls; actions remain in the dialog footer while preview content scrolls. Desktop900px and phone350px dialog widths verified; both phone actions visible with no overflow.
- Template Apply → Undo → Redo → Save exercised on the newly created fictional schedule. Template creation review survives Escape/reopen and Cancel sends nothing. Existing publication/permission/request identities are unchanged.
- Snapshot capture → full preview → restore while a newer unsaved draft exists → Recover retained source draft exercised. Exact newer text returned. A stray Snapshots launcher after restore is fixed; final retest leaves no dialog/extra launcher and returns focus to Tools. Ordinary authenticated readback confirms restored rows, notes, contact and nested content at version5.
- Sharing drawer opens its controls immediately, with styled actions and explicit Team-link sign-in behavior. Copy Team link → new signed-out tab → ordinary sign-in opened the correct fictional schedule. No Client link was created or transmitted. Phone Escape returns focus to Tools.
- Duplicate-name creation returns a clear possible name-collision explanation and explicit recovery choices. The original schedule remains intact; discarding the failed review returns cleanly to the library.
- Long fixture1280/390: no clipped visible textareas or page-level horizontal overflow. Empty fixture: zero rows and enabled Add Row, no overflow. Legacy long desktop image retained for comparison; sun-row differences are visible and exact equality is not claimed.

## Fictional state and validation

Created only B15 quality workflow — fictional and its Quality recovery checkpoint — fictional. The new schedule is retained at version5 with restored template content. No existing actual or coordinator-created schedule was changed. Ordinary/long/empty fixtures were opened for comparison; auto-generated unsaved sun rows in the candidate long fixture were discarded without saving.

239 platform tests and69 editor tests pass. Optimized production build and type checking pass. Two existing React-hooks lint warnings remain (provider useMemo dependencies and library ticket cleanup); no new browser warning/error was captured. Test totals do not certify full runtime parity.

## Remaining acceptance work and supported next steps

The refreshed45-case ledger remains32 Partial,7 Not executed,6 Blocked. Independent review of this build, full paired history/copy/delete/template publication/recipient-role/import-error/navigation coverage, and the remaining fixtures are still required. No group is declared fully accepted.

Native print/PDF: the supported IAB automation surface did not expose native print output. The prior native-app access attempt was rejected by automatic approval review; no alternate automation was used to bypass it. A reviewer must open the fictional schedule in an ordinary browser, choose Share → Print/PDF, save the actual PDF through the native dialog, and supply its local path for pagination/render inspection. That output is not replaced by an HTML preview screenshot.

Physical-device checks: open the local review through an already approved device-access setup, then exercise actual touch scrolling, row controls, dialogs and keyboard interactions. No tunnel or network exposure was created. Viewport emulation above establishes layout evidence only.

Hosted rollout, production settings/data, migrations, purges, account resets and excluded B08 probes remain outside this pass. The user’s existing bounded public-provider and private Netlify-read approvals remain unchanged.
