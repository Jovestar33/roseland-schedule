# Professional document pass — final developer validation

September 20, 2026. Implemented and developer-validated; independent PDF review reported passing; independent live review and human acceptance pending. Local candidate only.

## Candidate and provenance

- Preview: http://127.0.0.1:3528/review
- Checkout: `/private/tmp/roseland-professional-document-pass`
- Branch: `codex/professional-document-pass`
- Application: `1ac69c234e2848f026ae1f635bb80229213dd56f`
- Production build: `fZciGqvCFp4-RrzseSgnK`
- Application checkpoints: `f493a85` composition/helpers; `1ac69c2` removes obsolete Call Sheet print geometry overrides.
- Previous candidate 3526 remains at evidence HEAD `eb2e017`, application `4857a03`, build `_oSlETlOvZ13oPq-jIdeC`; checked unchanged. Older preview processes were not altered.
- Browser/native ownership released to UI/Experience after final export and keyboard Save. Owned tab returned to clean Library; viewport reset. No deployment, push, migration, access or branding change.

## Delivered behavior

Call Sheet now uses a compact industry document masthead: small existing logo with dark backing, prominent project/call/date/day, credits and supplied conditions/daylight at the top. Paired arrival/emergency details and elevated safety/special instructions precede a ruled work table. The table preserves descriptions, notes, full addresses and nested location details. Meal/general notes and opt-in contacts follow without a forced new contact page. Empty optional print sections collapse; editable screen retains all eight fields.

An explicit Crew Call takes priority over earlier prep. Without one, the first timed activity is labeled First scheduled activity. Missing call/date remain explicit. Weather is supplied data only, including zero precipitation and partial temperatures. No inferred individualized calls, invented cast/scene data, verified-ER claim or new data schema.

Idle values use subtle underlines; existing Enter/Escape/multiline/Tab/focus, maps, Undo and Save mechanisms remain. Contact Sheet keeps identity/reach and assignment details while reducing repeated padding, retaining approximately 10pt body type and repeated oversized identity.

Industry hierarchy was informed by primary references: [StudioBinder call sheet guide](https://www.studiobinder.com/blog/create-better-call-sheet-with-free-call-sheet-template/), [SetHero professional call sheets](https://sethero.com/blog/creating-call-sheets-excel-template-download/) and [StudioBinder template types](https://www.studiobinder.com/call-sheet-template/). These inform composition; they do not establish a universal feature checklist or user acceptance.

## Native PDFs and page-count interpretation

All ten final files came from native Chrome Save as PDF on the same final application/build. Letter plus an ordinary A4 sample, default scale/margins, browser headers/footers and backgrounds off; app running identity/date/page counters remain. All Call Sheets include optional contacts for the test. **29 pages visually inspected; 1,153 expected content checks; zero missing markers.** SHA-256, fixture/version, settings and page sizes are in [manifest](native-pdf/manifest.json). Both Poppler and PDFium renders are retained. PDFs were not modified after native export.

| File | Paper | Pages | Content checks |
|---|---|---:|---:|
| empty-callsheet.pdf | Letter | 1 | 2 |
| empty-contacts.pdf | Letter | 1 | 2 |
| long-callsheet.pdf | Letter | 8 | 524 |
| long-contacts.pdf | Letter | 6 | 257 |
| ordinary-callsheet-a4.pdf | A4 | 2 | 68 |
| ordinary-callsheet.pdf | Letter | 2 | 68 |
| ordinary-contacts.pdf | Letter | 1 | 22 |
| oversized-callsheet.pdf | Letter | 4 | 102 |
| oversized-contacts.pdf | Letter | 3 | 75 |
| sparse-callsheet.pdf | Letter | 1 | 33 |

Before/after using the same fixture content: ordinary Call Sheet 2→2; sparse Call Sheet 2→1; long Call Sheet 5→8; ordinary Contact Sheet 1→1; long Contact Sheet 9→6; oversized Contact Sheet 4→3; empty sheets remain 1. A4 ordinary and oversized Call Sheet are additional coverage. Call Sheets now include previously omitted work descriptions, notes, full/nested addresses/details; the long increase reflects added content and is not claimed as a density gain. Content and readable type took priority over forcing an ordinary one-page result.

Extracted body text is approximately 9.9pt from nominal 10pt CSS (Chrome font quantization); labels/footers are smaller. Corrected print table uses a 52pt time column and 31% location column, with flexible activity/details. The initial preflight exposed obsolete 9pt and 18/32/50 geometry plus inherited zebra styling; final application removes those overrides. The preflight PDF is explicitly non-final and excluded from the ten outputs.

Oversized Call Sheet CONT-41 spans page 2→3. Visual inspection confirmed its complete text; the checker removes only repeated page/table furniture to compare the continuous paragraph. No real content was removed to pass the check. Oversized contacts repeat name/role/email on continuation pages; accented text and Chinese characters render. Empty and sparse missing-data messages are visible.

## Focused verification

- 10/10 editor controls tests passed on final candidate, including eight fields, real hooks, Escape/Enter/Tab, maps/read-only, Undo/store behavior and Share dismissal.
- 10/10 focused platform/document tests passed: call semantics, missing call, weather zero/partial data, untimed/full nested text, long-row flow, existing document tools and CSS string escaping.
- Final production build passed. Historical full-suite results are not presented as a fresh full-suite run for this pass.
- Actual desktop and 390px Call/Contact screenshots inspected. At 390px, document width is 390 and modal client/scroll widths match at 322; all eight Call Sheet edits remain reachable. Oversized email-only contact has a valid mailto link and no invented phone link.
- Real browser keyboard check on **Professional document keyboard — fictional** only: Escape canceled and restored trigger focus; Enter opened/committed the single-line field and restored focus; multiline Enter retained a newline; Tab committed; Undo restored the original general notes. Three Maps destinations preserved. Guarded Save required exact fresh-copy identity, showed Schedule saved, and API readback confirmed the emergency edit and original general notes.
- No original fixture Save occurred in this pass. [Preservation readback](preservation-final.json) verifies all **20 existing full records exactly unchanged**, including the prior pass's repaired long-fixture v3 metadata. Existing North/South 127 schedules, 2 productions, 4 organization memberships and 2 production memberships are unchanged. One fresh isolated keyboard copy was created and saved.

The prior pass's accidental original-long Save and repair remain historical facts; this pass does not erase that version/audit history. Current preservation is compared against a newly captured baseline that includes it.

## Review and limitations

UI/Experience independently reported inspecting all 29 final PDF pages with separate hashes/renders: corrected widths/plain rows, complete CONT-41, no clipping/overlap or dropped end markers. Live review was released to that task while this report was written. Human product acceptance remains pending. Chrome 153 desktop native print and 390px responsive scope were exercised; other browsers/devices are not newly certified. Individual cast/department calls, distribution/acknowledgment workflow and new cast-management fields remain outside this composition pass.
