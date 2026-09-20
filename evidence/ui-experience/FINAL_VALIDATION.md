# UX-001–005 implementation handoff — September 20, 2026

Status: all three approved local implementation batches complete and developer-validated. The UI specialist has completed independent screen and PDF review, including the empty-print wording correction, with no remaining blocking finding for UX-001–005. Human acceptance and B15 product acceptance remain pending. No deployment, push, migration, branding change or permission change is included.

## Candidate and ownership

- Checkout: `/private/tmp/roseland-ui-experience-refinement`, branch `codex/ui-experience-refinement`.
- Current application commit: `4857a03`; production build `_oSlETlOvZ13oPq-jIdeC`.
- Preview: http://127.0.0.1:3526/review. Existing fictional local database on port 56521.
- Browser/database/test ownership released to UI specialist task `01a0bcf1-67c4-75f1-8de0-131a09f22423`. No further browser actions planned. Temporary viewport reset, owned test tabs closed, clean Library preview left open. Preview server remains running.
- Frozen pre-review checkout remains `ff7eb7a`, application `8965ba8`, build `R2Sn1Vtshobzqmgm-abnr`. Original preview ports 3506/3512/3514/3516/3518/3520/3522/3524 all responded HTTP 200 in final readback; none rebuilt or restarted. User-owned tabs/drafts were not operated.

## Successive implementation checkpoints

| Batch | Checkpoint | Result |
|---|---|---|
| Library and account, UX-001/002/003 | `fb037ee` | Readable strict date-only labels; one native Date range marker; one quiet Account entry in shared shell; Tools duplicate removed; calmer library/header. |
| Call Sheet, UX-004 | `0bafd59` | Shared screen/print document, consistent sans-serif hierarchy, arrival/emergency before schedule, notes/team after, optional full contacts and running print furniture. |
| Contact Sheet, UX-005 | `85bd34f` | Aligned identity/reach and time/assignment columns, readable normal descriptions, less card chrome and repeating contact identity. |
| Document visual corrections | `dd922aa` | Prevent global schedule table widths/dark headers from leaking into documents; allow exceptional oversized contact continuation from page one. |
| Specialist cleanup | `4857a03` | Empty printed Contact Sheet says “No contacts on this schedule.” Screen retains its useful editing guidance. |

Batch details: `BATCH_1.md`, `BATCH_2.md`, `BATCH_3.md`. Main changes are in `lib/date-label.ts`, local library/files/transfers/snapshots and schedule lifecycle labels, `AppHeader`, shared local workspace navigation, `LocalScheduleClient`, `CallSheetModal`, `ContactSheetModal`, `DocumentPrintFurniture`, `lib/print-margins.ts`, and their styles.

Underlying ISO date storage/filter/sort behavior, account mechanisms, effective permissions, contact grouping, CSV escaping/formula protection, download authorization, and editor save/Undo machinery are retained.

## Verification

- 107 editor tests passed (`final-editor-tests.txt`); 251 platform tests passed (`final-platform-tests.txt`). These suites preceded the final presentation-only fixes; the resulting production build passed.
- Final empty-copy cleanup: another production build passed (`review-cleanup-build.txt`) and 10 focused document/keyboard/control tests passed (`review-cleanup-focused-tests.txt`). No broad suite rerun is claimed for that wording-only change.
- Date-specific tests cover invalid/missing dates, leap validation and extreme time zones. Print margin tests cover CSS string escaping.
- Real browser keyboard check on a newly created fictional copy: Escape cancels and restores field focus; Enter commits a single-line field; multiline Enter adds a newline; Tab commits and moves focus; Undo restores original notes; Save/readback confirms the intended emergency field. Existing focused tests cover all eight Call Sheet field paths, late blur/cancel and read-only behavior.
- Three existing map links retained. Viewer Call Sheet exposes static values and output controls; Save disabled. Existing South Viewer/North Editor context switching remains available.
- Organizer and administrator Account access checked. Administrator retained invitations, security, organization members/security/appearance and Administration; ordinary member did not gain Administration. No security/settings changes made. Evidence: `admin-account.txt`, `member-account.txt`, `viewer-call-sheet.txt`.
- Actual narrow browser checks: library at 390px with document width 390; sparse Call Sheet at 320px with document width 320 and modal body client/scroll width 252; oversized contacts at 390px with modal body client/scroll width 322. Full text, long email, café/Zoë/照明 and blank-phone handling retained. Missing date remains “Date not set”; sparse call remains 11:45 PM with no invented town or credits.

### Specialist dispositions

1. Empty print cleanup: screen still says “No contacts found. Add contacts using the 👤 button on any row.” Native print says only “No contacts on this schedule.” Only `empty-contacts.pdf` was regenerated after `4857a03`, then rendered and inspected. Other eight native PDFs were preserved byte-for-byte with earlier build provenance.
2. Mobile Move requests: at actual 390px, navigation client/scroll width both 358px; button right edge 346px in the 390px viewport. Tab from Backup focuses Move requests, and Enter opens the Move and duplicate dialog. The latest screenshot `library-mobile-navigation.png` shows the whole button and focus ring. Existing narrow navigation permits horizontal overflow when needed; no wrapping change was necessary. Earlier screenshot clipping is superseded by this explicit live check.

## Native PDF evidence

Directory: `output/pdf/ui-experience-native/`. All files are actual Chrome Save as PDF output, not reconstructed PDFs. Letter, all pages, default scale/margins, one page per sheet, browser headers/footers off, backgrounds off. Ordinary schedule remains the legacy landscape print regression. Call Sheet outputs include optional contacts.

| PDF | Pages | Application / build |
|---|---:|---|
| ordinary-callsheet.pdf | 2 | dd922aa / 6z38egc_cN3M5P1N2vgR7 |
| ordinary-contacts.pdf | 1 | same |
| ordinary-schedule.pdf | 1 | same |
| long-callsheet.pdf | 5 | same |
| long-contacts.pdf | 9 | same |
| empty-callsheet.pdf | 1 | same |
| empty-contacts.pdf | 1 | 4857a03 / _oSlETlOvZ13oPq-jIdeC |
| oversized-contacts.pdf | 4 | dd922aa / 6z38egc_cN3M5P1N2vgR7 |
| sparse-callsheet.pdf | 2 | same |

All 26 pages were rendered with Poppler and PDFium and visually inspected. Text is readable; no observed clipping or overlap. Long contact blocks remain together when they fit; the exceptional 70-paragraph contact continues across four pages with repeated name/role/reach. Schedule/contact table headers and document identity/page counts repeat. Sparse two-page layout is retained without shrinking type.

654 expected content checks pass, zero missing markers. `native-pdf/manifest.json` records file hashes, source fixture IDs/versions, page sizes, content markers and visual review status. `native-pdf/export-provenance.json` locks the eight unchanged exports to their actual source build. `scripts/check-ui-experience-pdfs.py` is read-only PDF inspection/rendering, with optional specific filenames to refresh affected QA only.

Native running margin boxes were verified in Chrome 153. This is not a claim about other browser engines, physical printers, or arbitrary paper sizes. Chrome's feature documentation: https://developer.chrome.com/blog/print-margins.

## Fixture preservation and disclosed incident

One native-print automation action incorrectly matched the application Save button while the intended print preview was not foreground. It saved automatic sun rows/recalculated times into the original **fictional long fixture**, `d11dc5f9-3718-4e64-86d0-bb2c5e011315`, advancing version 1 to 2. This did not meet the intended no-original-fixture-write boundary and was disclosed during work.

The exact original document JSON was restored through the normal authenticated, version-checked update API, after confirming no intervening change. The correction is version 3. History was not erased. Four record-level fields differ from the original baseline: `document_version`, `updated_at`, `updated_by`, and derived `town` (original null, now “Fictional Harbor Studio”). The saved document itself is exactly original. Details: `unintended-save-readback.json`, `incident-repair.json`. Print automation was changed to require the native `chrome://print/` surface, exact document title, native Save panel and exact output folder before saving any PDF.

Final read-only preservation check at `2026-09-20T05:58:12.463Z`: all 18 original B14 documents exactly match baseline; 17 original records match completely; the repaired long record exactly matches its documented correction. All 127 original North/South schedules, two original productions, four organization memberships, two production memberships and existing production permissions remain unchanged. Existing move restrictions and sharing denial/control behavior were rechecked. No new client links or recipient access granted; recipient-token round trip was not retested.

Two new B14 fictional inspection copies were created for keyboard/save and oversized-contact checks (`inspection-fixtures.json`). The preservation report's separate counts of one production/five schedules/one template/two restrictions belong to the **earlier pre-review work**, not new changes in this UI batch. They remain preserved.

## Remaining acceptance

Independent screen/PDF review is complete and passed within the scoped checks: Library/date marker and keyboard/Account/Tools/ordinary Call Sheet/Contact Sheet, 390px Library and Contact Sheet, and all 26 PDF pages. The corrected empty PDF was separately verified and the other eight hashes were unchanged. Role and mutation checks remain developer evidence, not independently repeated mutation tests. The reviewer reset its viewport and retained a clean Library preview without editing or saving schedules. Full independent report: `/Users/johnsammon/roseland-schedule/design/ui-experience/INDEPENDENT_REVIEW_COMPLETE.md`. No remaining blocking finding for UX-001–005. User acceptance remains pending; this does not close B15 or authorize hosted/production changes.
