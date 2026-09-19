# B15 local functionality review

September 18, 2026 (Eastern). **Scoped local review build ready; B15 full parity and human functional approval remain open.** Code fix commit `684db04`; optimized build `V7u5vTmLh7nXQG_fKTs-p`. Starts from verified B13/B14 `4121426` / `fe6a391`, in `/private/tmp/roseland-b13-b14-cf4b0ee`. No reskin is included.

## Baseline and actual fixes

A fresh read-only Netlify Deploys inspection still identifies published `main @62eb261`, full source `62eb261c897b3a5c4e03857e59fee8071d520b88`, deploy `6aa4d1344f4fd68c916c5451`. See `evidence/b15-review/published-pointer.txt`. All **98 inventoried runtime source/style files** in the local legacy comparison match the pinned source hashes. The candidate has 60 identical paths. `source-comparison.json` records hashes; `legacy-control-census.json` retains the **390 lexical event-handler/listener anchors**. Neither count means that many interactions passed.

The legacy runtime uses the already-patched local Next/React dependencies, not the deployed dependency artifact. Its proxy supplies only identical fictional ordinary/long/empty documents, fake local login, and read-only metadata responses. Legacy mutation/provider requests are blocked. Local build/runtime evidence cannot replace a hosted comparison. The prior 45-group production/target ledger in `REGRESSION_MATRIX.md` therefore remains **0 Pass / 0 observed Fail / 45 Not tested**.

Two demonstrated integration omissions were corrected:

- **Current draft JSON:** Share now exposes the existing JSON export in the local editor. It calls the existing fresh output/template-source authorization before reading the draft. Saved-library export remains a separate operation. A downloaded fictional file contains the unsaved town change plus nested locations, contacts and call-sheet fields, while the source remains saved at version 1. A component behavior check also proves denial causes neither a draft read nor a download. The earlier source audit's claim that this path was available was too broad: the `!local` rendering condition hid it.
- **Explicit Close:** the local toolbar now offers Close schedule. Dirty/modal/uncertain-save state uses the existing discard review, including the warning that a sent save may already have committed. Keep editing and Escape retain the draft. Confirmation clears the document and stale callback generation but preserves the signed-in actor, allowing reopening. A late save/load cannot revive the closed document. Browser testing found and fixed focus return while the dialog was still modal; it now closes the dialog before focusing Refresh list.

## Executed checks

| Evidence | Result and boundary |
|---|---|
| `platform-tests.txt` | 227 passed, including the new close/late-reply/reopen controller case. |
| `editor-tests.txt`, `draft-export-tests.txt` | Existing 62 editor checks passed; two added component checks passed for allowed/denied current-draft export. |
| `focused-final.txt` | Final 10 checks passed after the focus correction; no unrelated suites repeated. |
| `types-final.txt`, `build.txt` | Type check and optimized build passed. Existing lint/ref warnings remain visible in the build log. |
| `browser-checks.json` | Both local legacy and target: duration change 00:30→00:45, Undo→00:30, Redo→00:45; add row 3→4 and Undo→3; multiline notes preserved. These are sampled paired behavior checks, not full ED-group acceptance. |
| Target browser at normal viewport and 390×844 | Dirty Close Keep editing/Escape retain the document; confirmed Close removes editor and focuses Refresh list. Reopening reads the saved document. Library search finds the long fixture; 32 rows render; empty fixture opens with zero rows, adding yields one and Undo restores zero. Width simulation is not physical touch/iPad evidence. |
| `draft-export.json` | Actual JSON downloaded through the target Share button with the unsaved field and complete nested document. Browser download event timed out, but the file in Downloads was directly parsed and verified. |
| Organizer browser | Duplicate review captured source version 1, confirmation opened `B15 review copy`, source backup retained. Copy save/reload yielded version 2 with new notes; original remained version 1 with original notes. Only newly added fictional B15 content was saved. |
| `purge-dependency-catalog.json` | Read-only schema inventory: 47 public/private tables, 115 foreign keys. Input to the proposal, not a purge test. |

Retained failures/limits: initial Close test failed before implementation (`close-before.txt`). Auth initially started before Postgres and exited; gateway cached that missing DNS result. Starting Auth after database health and restarting only the fictional gateway resolved it. First legacy build lacked sandbox access for its font download; second compiled but failed prerendering because the launcher and symlinked dependency tree resolved different React installations. Pointing only the legacy temporary checkout at the independent B13/B14 dependency copy produced a successful build; original logs are retained. The legacy native Close confirmation blocked the browser tool, and its dialog API did not expose the prompt; the fictional tab was closed. **Legacy native Close cancellation is not recorded as a pass.** The target's HTML confirmation was exercised successfully. No provider/token redemption race probe was run.

## Reconciled source-audit findings

The prior `LIVE_LEGACY_BEHAVIOR_AUDIT.md` described the older `1d8ea621` target, not this candidate. Its 24 findings must be read with later accepted implementation:

| Prior findings | Current implementation/evidence and remaining boundary |
|---|---|
| S01–S07 navigation, dirty state, async save/load | Existing B01/workspace retention and exact-save recovery remain. B15 adds explicit Close and checks stale callbacks. Native unload prompts and complete Back/Forward/device combinations remain incomplete. |
| S08 unsaved snapshots | B05 manual/automatic current-draft snapshot integration is present; see `B05_LOCAL_CHECKPOINT.md` and `B05_IMPLEMENTATION_NOTES.md`. Saved history alone is not the substitute. |
| S09–S12 copy/name/header safeguards | B03 library/transfer plus B04 files implement destination and collision contracts; B15 repeats confirmed-copy opening and source preservation. Existing modal review covers label/keyboard/day cancel fixes. |
| S13–S15 row/time/location/weather | Shared normalized editor components, B02 field/output tests and fictional providers remain. B15 sampled time/undo/row/notes parity passes. Full anchor/sun/drag/real-provider/device combinations remain open. |
| S16–S19 library, placement, lifecycle, restoration | B03-B library hierarchy/search/order and B03-C move/copy plus B05 restoration close the old flat-list/transfer/snapshot integration omissions. Role differences and recoverable Trash are approved changes, not omissions to reverse. |
| S20 Templates/Tools/local recovery | `LocalScheduleTemplates`, `LocalScheduleSnapshots` and schedule files are mounted. B06 and `PRODUCTION_TEMPLATE_CHECKPOINT.md` cover scoped publishing/recovery. Legacy Tools entries map to Templates, Snapshots, Share→Export JSON and files; the old shared-credential Tools component is not mounted. Discoverability remains part of human review. |
| S21–S22 backup/document output | B04 saved-library export/import and B02 call/contact/print remain. B15 repairs the hidden current-draft export. Prior PDFs prove only their scoped outputs, not the application. |
| S23 links/recipient projection | B11 now implements Team/Client flows with the approved audience/field scope, revocation and aliases. See `B11_LOCAL_ACCEPTANCE.md` and `B11_SHARING_SOURCE_MATRIX.md`; hosted legacy-link continuity is still pending. |
| S24 shared appearance/responsive behavior | `ORGANIZATION_PRESENTATION_CHECKPOINT.md` records organization settings and authority; B15 does not change them. Prior desktop/390px and new narrow Close checks do not cover all phone/iPad/touch interactions. |

## Complete 45-group local coverage map

This maps every required group to available implementation/evidence and the remaining check. It deliberately does not turn source inspection or earlier unit checks into full paired-runtime Pass.

| Group | Local evidence / implementation | Remaining full-parity check |
|---|---|---|
| NAV-01 | Workspace retention, B03 library; B15 Close/reopen/copy opening | Full deep-link/Back/Forward/refresh across supported browsers |
| NAV-02 | B01 revision/attempt fences; B15 close and dirty cancel | Native unload and complete pending-operation navigation combinations |
| IN-01 | Shared fields; B02 document and modal review; B15 multiline/long fixture | Every long field/layout at supported browser/zoom/device profiles |
| IN-02 | Existing modal keyboard fixes; B15 Tab/Escape | Full date/time/selection/paste and touch-keyboard walkthrough |
| IN-03 | Existing labels/focus fixes; B15 Close focus | Complete accessibility/contrast/touch target sweep |
| LIB-01 | B03-B hierarchy/filter/order; B15 search | All hierarchy/order/collection combinations in paired runtime |
| LIB-02 | B03/B04 collision/copy contracts; B15 duplicate/open | New/collision/copy all profiles and failure cases |
| LIB-03 | B03-C authorized transfer/phase/stable ID | Hosted references/legacy URLs and representative paired placement |
| LIB-04 | B03 lifecycle, Trash and permission tests | Paired archive/unarchive/delete/restore browser paths |
| ED-01 | Shared grid, B15 add/Undo and multiline editing | Duplicate/delete/reorder/drag around anchors at supported devices |
| ED-02 | Shared timing, B15 zero-duration fixture and cascade | Overnight, invalid input, fixed-in/out and sun-lock combinations |
| ED-03 | Shared actions/status/notes; existing field tests | Every action/status/color/completion in UI and output |
| ED-04 | Store revision tests; B15 row/time Undo/Redo | All supported edit types and saved/dirty boundary walkthrough |
| ED-05 | B02 round trips and existing header fixes | All header edit/commit/cancel/reload/output paths |
| SAVE-01 | B01 persistence; B15 copy version 2 save/reload | Empty/long and ordinary saves across final hosted stack |
| SAVE-02 | B01 exact uncertain-save recovery and fresh regression suite | Hosted network/error/session behavior; preserve narrow B08 exception |
| SNAP-01 | B05 current-draft/manual/automatic/Trash/history | Complete paired snapshot UI and hosted persistence |
| TOOL-01 | Entry mapping above; B15 draft JSON restored | Human discoverability review of every legacy Tools option |
| TPL-01 | B06 scoped template CRUD/apply/publish | Complete paired template UI and hosted admission |
| TPL-02 | B06 local/browser template recovery | Actual supported-browser local recovery/import paths |
| BKP-01 | B04 exports; B15 actual unsaved JSON | All filenames/formats/library cases at final hosted target |
| BKP-02 | B04 chooser/round-trip evidence and validation | Final-browser malformed/partial/retry import flow |
| LOC-01 | B02 fictional provider/manual fields; B13 admission fix | Authorized hosted Places credentials, quota/error and map behavior |
| LOC-02 | Nested field round trips and existing B02 evidence | Full nested edit/reorder/remove/print UI combinations |
| WX-01 | B02 deterministic weather and shared sun calculations | Real provider/date refresh/failure and timezone comparisons |
| CON-01 | B02 complete contacts and modal labels | International/long/crew suggestions across device profiles |
| CON-02 | B02 CSV/Contact Sheet evidence | Current final-browser download and pagination/profile coverage |
| CALL-01 | B02 fields/scoped call sheet output | All options and long/optional values on final profiles |
| SHARE-01 | B11 Team/Client creation/revocation contracts | Hosted recipient navigation/copy/share workflows |
| SHARE-02 | B11 aliases/scoped reads; B12 synthetic mapping | Deployed named/legacy/scoped URL continuity |
| SHARE-03 | B11 projections and access tests | Hosted headers/referrer/log/privacy controls |
| PDF-01 | B02 ordinary/long/empty output evidence | Actual final browser Save as PDF and file inspection |
| PRINT-01 | B02 scoped print portal/layout | Real print preview/paper/scaling/page-break profiles |
| PDF-02 | B02 contact output | Representative browser long-contact PDF pagination |
| PDF-03 | B02 call sheet output | Representative browser long-call-sheet PDF pagination |
| PRINT-02 | Existing view/print integration | Final read-only/mobile print/share paths |
| UI-01 | Prior desktop modal evidence; B15 normal viewport | Complete agreed desktop/zoom/layout coverage |
| UI-02 | Prior 390px evidence; B15 390×844 checks | Phone orientation/touch/keyboard/save/share, not only emulation |
| UI-03 | No physical touch acceptance claimed | User/device access for iPad reorder, selection, rotation and print |
| CMS-01 | Organization presentation checkpoint, Admin/Super Admin rule | Hosted setting persistence and full read-only/output consistency |
| AUTH-01 | B08/B09 ordinary account/MFA evidence | Hosted redirects/mail/rate limits, provider configuration and exceptional recovery review |
| DATA-01 | Full document tests and B12/B14 reconciliation; B15 JSON | Final-runtime all-field round trip and legacy fixture variation |
| DATA-02 | B03/B05/B06/B07/B11/B12 related-store contracts | Final hosted mappings and related-record integrity |
| MIG-01 | B12 synthetic capture; B14 two connected restorations | Production D09, approved pilot, hosted RPO/RTO and external features |
| INV-01 | 98 source files, 390 lexical anchors, S01–S24 reconciliation, this 45-group map | Human comprehensive walkthrough plus every applicable runtime profile |

## Smallest remaining access/actions

1. User freely reviews the build in `B15_REVIEW_HANDOFF.md`; coordinator keeps one build-linked notes list. Fix and retest blockers. **Explicit functional approval is still needed before B16.** No repeated policy questionnaire is needed.
2. Separately authorize the target hosted deployment/configuration and read-only production comparison scope before hosted checks. Verify target redirects/mail, provider keys/quota, headers/logs/rate limits, legacy URL routing and applicable Storage/Realtime/GraphQL/Functions surfaces. The latter unavailable surfaces from B13 are not passes.
3. Provide supported physical phone/iPad and desktop print/browser profiles for remaining device/output behavior. Native browser prompts that the automation cannot inspect need a human check or supported browser tooling; do not claim they passed.
4. Review the bounded execution/retention items in `B15_RECOVERY_PURGE_PROPOSAL.md`. Those are proposals only. Actual recovery/purge implementation needs its own dispatch, with the B08 race prohibition intact.
5. B17 final validation and B18 explicit migration/cutover approval remain after the existing functional/reskin gates. B15 does not export actual schedules or grant hosted/purge/account authority.
