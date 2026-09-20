# Fresh native PDF completion

September 19, 2026 EDT (PDF metadata uses September20 UTC).


On September 19, 2026 (EDT), the user confirmed the laptop was unlocked and authorized only the outstanding native outputs. Chrome 153 native Print > Save as PDF produced all six files from unchanged build `R2Sn1Vtshobzqmgm-abnr` at port 3524. This supersedes the earlier Mac-lock/window blocker. No old file, screenshot, combined proof set, or programmatic substitute is counted as a fresh native output.

| Output | Pages | Exact native PDF path |
|---|---:|---|
| ordinary-schedule | 1 | `/private/tmp/roseland-pre-review-technical-completion/output/pdf/pre-review-native/ordinary-schedule.pdf` |
| ordinary-contacts | 1 | `/private/tmp/roseland-pre-review-technical-completion/output/pdf/pre-review-native/ordinary-contacts.pdf` |
| ordinary-callsheet | 1 | `/private/tmp/roseland-pre-review-technical-completion/output/pdf/pre-review-native/ordinary-callsheet.pdf` |
| long-schedule | 5 | `/private/tmp/roseland-pre-review-technical-completion/output/pdf/pre-review-native/long-schedule.pdf` |
| long-contacts | 6 | `/private/tmp/roseland-pre-review-technical-completion/output/pdf/pre-review-native/long-contacts.pdf` |
| long-callsheet | 3 | `/private/tmp/roseland-pre-review-technical-completion/output/pdf/pre-review-native/long-callsheet.pdf` |

Settings verified individually in each native print preview: **Save as PDF; Letter; All pages; one page per sheet; Default margins and scale; browser headers/footers off; Background graphics off.** Application print styling determines orientation: schedules 792×612pt landscape; Contact/Call Sheets 612×792pt portrait. Both Call Sheets include contacts.

Fixtures: ordinary `5ba74f3b-690d-42e2-9723-5476bca97f8a` (saved version1, three source rows/contacts); long `d11dc5f9-3718-4e64-86d0-bb2c5e011315` (saved version1,32 source rows/contacts). Printing included their automatic sunrise/sunset draft rows; **neither draft was saved**.

All **17 pages** were rendered with Poppler and PDFium. Every PDFium page was visually inspected for clipping, overlapping content, complete cards/rows, repeated table headings and legibility. All **383 content checks passed with zero missing**: description/nested/note end markers, contact names/emails, Call Sheet key-information values, location rows and header fields appropriate to each output. No output-layout defect was found. Renderer/matcher preparation issues are recorded in the QA summary rather than attributed to the application.

Evidence: [native PDF manifest](evidence/pre-review/native-pdf/manifest.json) contains file hashes, native PDF creation metadata, exact paths, fixture/build identities, page sizes, settings, expected markers and per-page visual observations. [Review summary](evidence/pre-review/native-pdf/review-summary.json) records completion and QA limitations. Native settings captures, extracted text and all page renders are adjacent. [PDF status](evidence/pre-review/pdf-status.json) now lists all six fresh files.

The post-print preservation check again confirms18 retained B14 records,127 pre-existing North/South schedules, both existing productions and all six membership rows unchanged. No application code, saved document, permission, alias, hosted resource, frozen preview or automation was changed. No physical printer, different browser engine, device-specific print or human acceptance claim is added.

Browser/native ownership is released to the coordinator for independent file review. Ordinary Chrome tab 1020304413 and long tab 1020304419 remain on their Call Sheet views; both document titles returned to `Roseland Schedule` and body print classes cleared. Automatic sun-row changes remain unsaved in these tabs.


Scope stopped after output checks; coordinator may begin independent file review.
