# Native PDF output verification

Native Chrome access was available in this session. Fifteen actual PDFs were produced through the application's Print controls and Chrome Save as PDF, then reopened with PDF libraries and rendered for visual inspection. No browser-automation PDF shortcut, HTML screenshot or print-preview screenshot substitutes for those files.

Chrome 153 used Letter paper, All pages, one page per sheet, default scale/margins, no browser headers/footers, and the same native configuration for legacy and target. Application CSS determines orientation: target schedules are 792×612pt landscape; contacts/call sheets are 612×792pt portrait. The isolated legacy source runtime 3490 is not a hosted-storage acceptance test.

| Fixture/output | Target pages | Legacy pages | Finding |
|---|---:|---:|---|
| Ordinary schedule | 1 | 1 | Target includes complete descriptions, nested addresses/descriptions, notes and time columns. Legacy's default portrait output clips right-hand columns and leaves controls/compact editor values. |
| Ordinary Contact Sheet | 1 | 1 | Same three contacts, phone/email and complete row descriptions. Target uses wrapped readable content. |
| Ordinary Call Sheet, contacts included | 1 | 1 | All eight key-information fields, three contacts and schedule retained. Target restores table headings. |
| Long schedule | 5 | 3 | All 32 ordinary rows and their final description/nested/notes markers present. Target repeats headings, shows complete time columns and restores weather sun markers. Legacy's smaller portrait/editor output clips columns and differs in saved-sun-row handling. |
| Long Contact Sheet | 6 | 5 | All 32 contacts/contexts present. Target keeps cards together; legacy splits cards across pages. |
| Long Call Sheet, contacts included | 3 | 3 | All 32 contacts and schedule rows, all key information and END-CALL-NOTES retained. Target repeats table headings and has readable page breaks. |
| Empty schedule / contacts / call sheet | 1 each | Not newly generated | Correct empty schedule, explicit no-contact state, and empty call-sheet masthead. No content leaked from the preceding long schedule. |

All 354 expected end/contact markers across the ordinary/long files were checked individually in each relevant file, with zero missing. Text extraction alone is insufficient: all page montages were visually inspected. Poppler produced missing glyphs on one late schedule page despite complete PDF text; independent PDFium rendering displayed those glyphs correctly. Final QA captures use PDFium and the discrepancy is retained as a renderer limitation, not an application-fix claim.

The prior local document-rendering corrections already present in the checkpoint account for the output improvements; this pass adds real native evidence. Print CSS and document layout were not changed overnight. The only output interaction correction restores keyboard focus to Share after native print cancellation. Final browser result: BUTTON/Share, normal title restored, no lingering print class or local-document mode. Contact/Call modal close returns through their existing focus handling.

Files: `output/pdf/target-{ordinary,long,empty}-{schedule,contacts,callsheet}.pdf`, plus six `legacy-{ordinary,long}-*.pdf` comparison artifacts. `evidence/b15-overnight/output/pdf-checks.json` records hashes, page sizes, counts and checked markers. Adjacent `*-pages.png` files show every rendered page; extracted text is retained separately. These artifacts are fictional QA outputs, not real production exports.

The review proof set, `output/pdf/overnight-native-proof-set.pdf`, combines the nine target PDFs into 20 unchanged pages with section bookmarks. It is a compiled review artifact, not one native print job. Ordinary/long PDFs were generated on build `RsWKhI9el-JsMPSsVUbC7`; empty outputs and final print cancellation were verified on `U_DzDuTypFB9XtcrScYi3`. The intervening print change only restores focus; document layout is unchanged. Page text was compared exactly with each source after assembly, and the assembled first/last pages were rendered and inspected.

Remaining prerequisites: a physical printer/paper check, real phone/tablet and OS print/share dialogs, other browser engines, non-default paper/scaling/accessibility requirements and authorized hosted execution. Desktop viewport emulation is not a substitute for those results. Full B15 output/device acceptance remains open.
