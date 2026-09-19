# Pre-review technical completion

September 19, 2026 · local fictional environment only.

The locally runnable pass is saved for independent review. Cross-production direct Move and active-member inherited-restriction isolation now have fresh evidence. No new application defect was confirmed, so application source remains the independently corrected `8965ba8` candidate. **Fresh native PDFs remain incomplete because native Mac/Chrome control was unavailable.** This is not product acceptance, hosted readiness, or migration approval.

## Candidate and provenance

| Item | Exact checkpoint |
|---|---|
| Final checkout | `/private/tmp/roseland-pre-review-technical-completion` |
| Branch | `codex/pre-review-technical-completion` |
| Application commit | `8965ba8` — second independent audit corrections |
| Starting checkpoint | `3d81369fb3929dbda00dd80577c1879c4baadd45` |
| New evidence checkpoint | `5f2a81a` — local Move, restriction, browser, and preservation evidence |
| Build | `R2Sn1Vtshobzqmgm-abnr` |
| Review URL | http://127.0.0.1:3524/local-workspace |
| Existing corrected preview | http://127.0.0.1:3522/local-workspace — preserved |
| Backend | Existing fictional `roseland-b14-destination-g2`, loopback API56521 |

The unchanged build was copied from the frozen3522 checkout, not rebuilt or substituted. Its local-workspace server artifact hash matches the frozen artifact: `2ea031bb102e1b1aa80f22e226699d84339d76645d8ecd398e6fa50a9ef464ca`. See [build-and-previews.json](evidence/pre-review/build-and-previews.json). Ports3506,3512,3514,3516,3518,3520,3522 and3524 all returned HTTP200 at the final availability check. No frozen source, build, or process was modified.

## Fresh findings and completed checks

### Cross-production Move — LIB-03

An existing genuine North Admin completed its existing MFA challenge. Its existing organization authority allowed creation of one fictional destination through the normal authenticated Data API; no destination membership was assigned.

Two separate Move cases passed:

- **API case:** reviewed and moved the new source from North production to the new destination; ID, rows, date and town survived; version increased once. Retrying the same request returned the same approved receipt. The source restriction retained its identity and denied action under the destination production. The existing Editor gained no destination access.
- **Chrome case:** New schedule → Review creation → Confirm → Open → add/edit row → Save → Close → Organize → Move to production → Prepare Move → Confirm → reopen. The complete preview showed the saved row/location; the confirmed result opened at version3 with the destination project label and original row/note/town. Database readback independently confirmed the result.

Browser fixture: `Pre-review browser move`, ID `50fb2046-3079-4276-be85-87ea593d0357`. Its date was blank; date preservation is established by the API case, not this browser case. Source/destination IDs and complete receipts are in [permission-results.json](evidence/pre-review/permission-results.json), [browser-move-readback.json](evidence/pre-review/browser-move-readback.json), and the adjacent browser text captures.

This closes the direct-Move fixture gap. A separate multi-person request/approval journey is not claimed; no participant access was created for it.

### Inherited restrictions — TPL-01 / SHARE-03

The existing active North Editor could read/edit/export the new source, receiving target, and unrelated control before application. The Admin added an export denial only to the new source and saved a source-derived template into the new target using the normal template review/save RPCs.

After application:

- Target read/edit/export were denied; direct target restrictions remained empty. Authenticated read returned `PT404 Schedule unavailable`.
- The unrelated control retained read/edit/export access. No member status or production role changed.
- Target sharing review returned `PT404 Sharing unavailable`, while the control still reported `can_create=true`. No new client link was created.
- Chrome member library showed the source and control, excluded the inherited target and moved schedule, and opened the editable control. The Admin could see all new records under their proper production groups.

The inherited export rule restricts copied-content access under the existing policy; the target's denial was isolated from account suspension and direct target rules. See [permission-results.json](evidence/pre-review/permission-results.json), [sharing-restriction.json](evidence/pre-review/sharing-restriction.json), and [member-library.txt](evidence/pre-review/member-library.txt).

**Limit:** this establishes active internal-member and sharing-eligibility isolation. A fresh anonymous Client recipient-token round trip after restriction was not performed because this pass did not create or extend recipient access. Existing recipient evidence retains its original scope.

### Everyday workflows and browser coverage

Fresh Chrome coverage includes genuine member/Admin login, existing MFA, scoped libraries, create/open/edit/save, reviewed Move, confirmation, reopen, and denied-recipient visibility. Fresh Codex in-app browser coverage includes existing B14 login, organization selection/search/open, ordinary Schedule, three-contact Contact Sheet, and Call Sheet views. The Contact Sheet was visually inspected; the Call Sheet screenshot and text were saved. No messages, external directions, downloads of real data, or new grants occurred.

The ordinary fixture opened with automatic sun-row draft changes; none were saved. Browser surfaces are not independent engine coverage. Physical touch, physical keyboards/printers, Safari/Firefox, and device-specific printing remain unverified. Existing independent Chrome390×844/768×1024 evidence is historical to this pass, not newly repeated.

See [browser-observations.md](evidence/pre-review/browser-observations.md). SA01 map links, SA02 Call Sheet keyboard fields, and SA03 Share dismissal were already independently retested on the same application commit; this pass did not reimplement them.

## Native PDF requirement — blocked, no fresh output paths

**Fresh schedule PDF:** none. **Fresh Contact Sheet PDF:** none. **Fresh Call Sheet PDF:** none.

The native tool first reported that the Mac was locked and asked for manual unlock. An asynchronous unlock request was sent to the user; no reply arrived during this pass. A subsequent native Chrome selection reported `cgWindowNotFound`. Browser DOM control remained usable, but it does not establish native print/save availability. No lock bypass or alternative headless/programmatic PDF was used.

The prior fifteen native PDFs remain in `output/pdf/`: nine `target-{ordinary,long,empty}-{schedule,contacts,callsheet}.pdf` artifacts and six `legacy-{ordinary,long}-{schedule,contacts,callsheet}.pdf` comparisons. The second independent audit rechecked354 markers with zero missing. These are **older artifacts**, not fresh output from this candidate. New browser captures do not close the native output gate. [pdf-status.json](evidence/pre-review/pdf-status.json) explicitly records an empty fresh-path list.

Next bounded action after native access returns: use this unchanged3524 candidate and the ordinary/long fictional fixtures, save Schedule/Contact/Call Sheet through native Print, record the new paths and print settings, then render and inspect every page plus expected text markers. No access-policy change is needed.

## Completed versus blocked ledger

The [prior independent45-family ledger](evidence/pre-review/prior-independent-coverage-ledger.md) is retained verbatim with its original evidence classifications. The following is the current delta and remaining disposition; unlisted families retain their prior scoped evidence rather than becoming new runtime passes.

| Family / requirement | Current disposition | Boundary |
|---|---|---|
| LIB-03 direct cross-production Move | Fresh API + Chrome pass | Multi-person request/approval not executed |
| TPL-01 inherited restriction isolation | Fresh genuine active-member pass | Template review/save used normal RPCs; prior browser template lifecycle evidence retained |
| SHARE-03 privacy/access changes | Fresh internal-member + sharing-eligibility pass | Fresh anonymous recipient-token transition remains unverified |
| SHARE-02 valid legacy alias | Blocked | Only known existing legacy token expired `2026-09-19T06:55:50Z`; no reissue or extension |
| NAV/LIB/ED/SAVE everyday sequence | Fresh representative Chrome pass | No exhaustive permutation claim |
| CON-02 / CALL-01 browser documents | Fresh in-app browser views | Screenshots/DOM are not native print evidence |
| PDF-01/02/03 and PRINT-01 final-build native outputs | Blocked | Native Mac lock/window access; zero fresh PDFs |
| UI-02/03 physical devices / PRINT-02 device output | External device gate | Existing desktop viewport evidence only |
| Hosted integration and full privacy runtime | Outside authorization | No deployment, push, hosted mutations, or access expansion |
| MIG-01 real-data transfer / reconstruction acceptance | Outside authorization | No real migration/export or writer switch |
| Final visual/product acceptance | Human review required | No automated sign-off |

Legacy status: [legacy-alias-status.json](evidence/pre-review/legacy-alias-status.json). No excluded B08 probes were run.

## Validation and preservation

- Fresh editor suite: **107 passed, 0 failed**. [Log](evidence/pre-review/editor-tests.log).
- Fresh platform suite: **248 passed, 0 failed**. [Log](evidence/pre-review/platform-tests.log).
- Genuine-session permission/Move assertions and final database readback passed. These supplement the unit suites; they are not a fresh full DB reconstruction.
- All **18 retained B14 review schedules** matched the start-of-pass records exactly, including names, versions and documents.
- All **127 existing North/South schedules**, both existing productions, all **four organization memberships**, both production memberships, and existing production-level permissions were unchanged.
- Only **one new production, five new schedules, one template and two subtractive restrictions** were added, plus their ordinary receipts/history/audit records. New fixtures remain available for review; no permanent deletion occurred.

See [baseline.json](evidence/pre-review/baseline.json), [preservation-final.json](evidence/pre-review/preservation-final.json), [new-records.json](evidence/pre-review/new-records.json), and [fixture-preparation.md](evidence/pre-review/fixture-preparation.md). Preparation notes distinguish rejected fixture inputs/API return behavior from application failures. Credentials remain in existing private temporary files, outside committed evidence. `node_modules` is an untracked dependency symlink.

## Short independent review route

1. Open3524 and use the existing fictional North Admin account/authenticator. Search `Pre-review`. Check `Pre-review browser move` under the fictional destination: saved version3, destination project label, retained description/note/town. The Chrome tab is left on that result.
2. Use the existing North member in a separate session. Search `Pre-review`: source/control remain available; inherited target and destination records should be absent. Open the control to verify normal editing remains available. Compare the before/after capability evidence for the inherited target.
3. In the existing B14 review session, open ordinary Schedule, Contact Sheet and Call Sheet. The in-app browser is left on the Call Sheet. Inspect the retained second-audit corrections and complete fresh native PDFs once the Mac/native window is accessible; avoid saving the ordinary fixture's automatic draft changes.
4. Review this report's remaining gates before any hosted, physical-device, real-data, or acceptance decision. The task stops here for independent review; no automation was restarted.
