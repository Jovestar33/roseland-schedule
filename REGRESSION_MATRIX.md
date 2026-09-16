# Regression Matrix

> **September 16 audit:** [TECHNICAL_ACCEPTANCE_AUDIT.md](./TECHNICAL_ACCEPTANCE_AUDIT.md) inventories all 45 groups and eight additional checks against `379e066`, distinguishing completed local slices from missing integration/evidence/decisions. The paired-runtime ledger remains 0 Pass, 0 observed Fail and 45 Not tested.

September 15 gate clarification: comprehensive internal security review and demonstrable end-to-end rollback are required before migration. Track findings/retests and unresolved high-risk exceptions explicitly; distinguish local checks from hosted configuration checks pending authorization. Rollback evidence must include recoverable code/data checkpoints, partial migration failure and preservation/reconciliation of target edits after simulated cutover. Netlify remaining available alone does not satisfy recovery. The local editor/session evidence in `LOCAL_EDITOR_CONTRACT.md` is supporting evidence; all production-versus-target parity statuses below remain unchanged.

Status: pre-migration preservation contract, updated September 15. All existing required capabilities must pass before real-schedule migration begins. Historical P0/P1 labels are planning priorities, not permission to omit a feature or defer its parity test until cutover.

| Area | Priority | Required scenarios |
|---|---|---|
| Authentication | P0 | login/logout/session expiry/recovery; wrong password; duplicate signup; nonexistent reset; expired/reused links; removed member; invitation replay; network failure; no enumeration |
| Tenant authorization | P0 | every CRUD operation by owner/editor/viewer/removed/anonymous/cross-tenant user; guessed IDs; changed tenant IDs; realtime and storage boundaries |
| Library | P0 | load hierarchy; create/open; move; rename; archive/restore; delete/restore; ordering; metadata consistency; eventual refresh behavior |
| Editor core | P0 | add/edit/delete/reorder rows; drag/drop; undo/redo; action types; zero duration; fixed anchors; cascade; sun lock; notes/status/completion |
| Save and recovery | P0 | create/save/reload; stale-write conflict; retry after network loss; immutable version; snapshot create/list/restore/delete; large schedule |
| Schedule metadata | P0 | production/phase/day/date/town/director/DP; coordinates; weather and sunrise/sunset; legacy records with missing fields |
| Locations | P0 | Places search; manual location; short name/address; map links; sub-locations; missing/invalid coordinates; quota/rate-limit failure |
| Contacts | P0 | row name/title/phone/email; Contact Sheet; CSV export; formula-safe CSV; omitted fields in public projections |
| Call Sheet | P0 | all existing call-sheet fields; schedule/contact summary; isolated print output; missing optional data |
| Read-only/share | P0 | public/team/client views; legacy URLs; scoped fields; invalid/expired/revoked/reused links; token absent from logs/referrer/cache |
| Print/PDF | P0 | desktop print preview; page breaks; compact schedule; call/contact sheets; no editor chrome; representative browsers |
| Mobile/iPad | P0 | edit, reorder, time controls, modals, scrolling, save, read-only, rotation, touch targets |
| Templates/CMS | P0 | load/save/delete/replace templates; legacy local template decision; theme/action styles; unauthorized CMS write denied |
| Migration | P0 | dry-run; repeat import; counts; checksums; duplicates; malformed records; orphan snapshots; renamed schedules; rollback and restore |
| Security | P0 | XSS/injection payloads; server validation; headers/CSP; secrets/bundle scan; redacted errors/logs; rate limits; CSRF/CORS; OWASP ASVS review |
| Operations | P0 | monitoring/alerts; provider budget alert; backup restore; request IDs; incident/rollback contacts; preview isolation |

## Test data set

Maintain synthetic fixtures for empty, ordinary, archived, long/multi-page, many-sub-location, contact-heavy, snapshot-heavy, legacy/missing-field, duplicate-display-name, timezone/date-boundary, and malicious-input schedules. Keep one explicitly approved production-like pilot fixture separate from routine preview data.

## Execution environments

- Automated: schema validation, unit/service tests, database constraints, RLS/role matrix, storage/realtime policies, importer and reconciliation.
- Desktop manual: current supported Chrome plus Safari/Firefox coverage agreed before cutover.
- Devices: representative phone widths, physical or verified iPad/touch behavior, portrait/landscape.
- Output: browser print preview and saved PDF comparisons for schedule, contact sheet, and call sheet.
- Deployment: protected preview against isolated data, then a timed production rehearsal.

## Acceptance record

Each run records build/commit, environment, database migration version, fixture/import manifest, browser/device, tester, result, evidence link, defect, severity, and approver. Paired screenshots, field measurements and PDFs demonstrate preservation or improvement of usable behavior; matching old pixel dimensions is not the acceptance rule. See the execution ledger below.

## Do-not-break list

The migration must preserve the time cascade and fixed anchors, drag/drop, undo/redo, weather/sun data, zero-duration rows, library operations, optimistic save conflicts, snapshots, templates, mobile/iPad editing, print/PDF, public/read-only modes, Google Places locations and sub-locations, row contacts/Contact Sheet/CSV, Call Sheet foundation, and legacy link resolution.



## Pre-migration parity gate and evidence ledger

**Gate status: NOT PASSED.** No actual current Netlify-production versus eventual Supabase/Vercel target-runtime parity run is recorded here. All required comparisons below are **Not tested / unverified**. Existing local SQL/API/application tests and Netlify staging checks are supporting engineering evidence only. They cannot mark these runtime comparisons Pass. No baseline screenshots or target outputs have been fabricated.

“Total parity” means preservation of existing capabilities, data and practical workflow usability **with no regressions**, not identical implementation or pixels. Classify each comparison as **preserved capability**, **improvement**, **regression** or **unverified**, and separately record **Pass**, **Fail** or **Not tested**. A verified improvement can Pass without copying old behavior/dimensions or requiring a waiver solely because it differs. It must still pass correctness, permissions, accessibility, usable input capacity and relevant print/PDF content/layout checks. Better field sizes/layouts are acceptable when information and usability are retained or improved. A regression cannot be relabeled an improvement to bypass the gate.

Actual loss of function/data/usability is Fail and blocks migration. Required but untested/unknown behavior is Not tested and blocks migration. Surface material workflow tradeoffs or unclear classifications for user review; unresolved cases do not Pass. Account/login/role architecture changes need reviewed acceptance criteria for their material workflow implications, without treating every improvement as an exception. Do not silently omit features or describe an untested redesign as parity.

Every required item/profile must Pass with evidence, then the user must explicitly approve beginning real-schedule migration. This gate applies before a real-data pilot or transfer, not only at final cutover. Synthetic local/test-runtime work can continue within existing authorization. This ledger grants no authority to query real schedules, create test data in production, export/migrate, deploy or switch traffic. Production baseline capture needs its own authorization; use approved read-only examples or user-provided evidence until such access is granted.

### Current comparison ledger

Each row is a case group. Expand it into individual steps for every applicable supported browser/device/fixture profile; Pass requires all those executions, not one sample. `—` means no paired runtime evidence is recorded. Existing source-based knowledge does not substitute for a run.

| ID | Capability | Required comparison | Result | Classification | Production/target evidence |
|---|---|---|---|---|---|
| NAV-01 | Screen navigation | Login → library → editor → library; tabs, tools/modals, browser back/forward, deep links and refresh retain the correct schedule/context. | Not tested | unverified | — |
| NAV-02 | Navigation while editing | Unsaved work, in-flight save, restore and navigation; no lost edits, stale acknowledgement or cross-schedule update. | Not tested | unverified | — |
| IN-01 | Field sizing and capacity | Every grid/header/modal/search/contact/call-sheet field: width/height, padding, font, wrapping, auto-resize, long/multiline input, visible value, error display and reachability. Better sizes/layouts may pass without matching old pixels. | Not tested | unverified | — |
| IN-02 | Input interaction | Typing, paste, selection, keyboard/tab order, focus, date/time controls, dropdowns, touch keyboard and validation; no clipping or reduced usable input capacity. | Not tested | unverified | — |
| IN-03 | Accessibility and feedback | Labels, keyboard reachability, visible focus, errors/save status, contrast and usable touch targets; improvements preserve or improve access. | Not tested | unverified | — |
| LIB-01 | Library display | Hierarchy, schedule list/tree, search/filter, project/phase grouping, folder names, ordering, expand/collapse and versions/templates/backup tabs. | Not tested | unverified | — |
| LIB-02 | Create/open/Save As | Empty/new schedule, existing-name collision, copy/Save As, opening results and reload; stable identity and intact source. | Not tested | unverified | — |
| LIB-03 | Rename and Move To | Rename/move between supported folders/projects/phases, ordering, references, schedule metadata, snapshots and legacy links remain correct. Target identity constraints cannot silently remove Move To. | Not tested | unverified | — |
| LIB-04 | Archive and recovery | Archive/unarchive, delete/restore where offered, confirmation/cancel and recovery behavior; preserved content and appropriate permission checks. | Not tested | unverified | — |
| ED-01 | Rows and editing | Add/insert/delete/duplicate/reorder rows, drag/drop, row actions and keyboard interactions; values remain attached to the correct row. | Not tested | unverified | — |
| ED-02 | Time calculations | Time in/out, duration including zero, fixed anchors, cascade and sun locks; overnight/date boundaries and invalid values behave correctly. | Not tested | unverified | — |
| ED-03 | Actions and styling | All existing action types, styles, colors, status/completion controls, notes and descriptions; no hidden or lost information. | Not tested | unverified | — |
| ED-04 | Undo/redo | Undo/redo across supported edit types, row operations and time changes; saved baselines and dirty state remain correct. | Not tested | unverified | — |
| ED-05 | Schedule header/metadata | Project/phase/day/date/town, director/DP, coordinates and all optional header fields; editing, display, reload and output preserve values. | Not tested | unverified | — |
| SAVE-01 | Save/reload/version | Create/save/reload, autosave/manual save if present, server acknowledgement and visible status; document and metadata remain consistent. | Not tested | unverified | — |
| SAVE-02 | Conflicts and failures | Competing edits, stale request, timeout, network loss/retry and lost acknowledgement; no false saved state, lost input or overwrite. | Not tested | unverified | — |
| SNAP-01 | Snapshots/history | Create/list/label/open/restore/copy/delete where offered, recovery and reload. Compare legacy snapshots separately from new immutable target history. | Not tested | unverified | — |
| TOOL-01 | Tools panel | Every existing Tools entry and option is inventoried and exercised; no menu command disappears without a surfaced product decision. | Not tested | unverified | — |
| TPL-01 | Shared templates | List/load/create/save/replace/delete, collisions and resulting schedules retain all fields and settings. | Not tested | unverified | — |
| TPL-02 | Local/legacy templates | Local template discovery, recovery/import decision and failure handling; no silent removal of local user data. | Not tested | unverified | — |
| BKP-01 | Backup/export | Single and library schedule exports/downloads, filenames, supported formats and complete payload preservation. | Not tested | unverified | — |
| BKP-02 | Import/recovery UI | Existing parse/preview/import capabilities, validation/error reporting and restore behavior actually supported by production; improvements tested end to end. | Not tested | unverified | — |
| LOC-01 | Places and manual locations | Search/autocomplete/details, manual name/address/short label, maps links, clear/reselect, coordinates and provider/network/quota errors. | Not tested | unverified | — |
| LOC-02 | Sub-locations | Add/edit/reorder/remove and completion state; long addresses/notes, maps and nested data persist and print correctly. | Not tested | unverified | — |
| WX-01 | Weather and sun | Weather display/refresh/failure, sunrise/sunset and locked time interactions; controlled time/provider responses make comparisons reproducible. | Not tested | unverified | — |
| CON-01 | Contacts/data entry | Name/title/phone/email and crew suggestions; long/international/missing values, modal/grid layout and saved data. | Not tested | unverified | — |
| CON-02 | Contact Sheet/CSV | All existing contact sheet options, sorting/grouping and CSV download; complete values, safe escaping/formula handling, no lost contacts. | Not tested | unverified | — |
| CALL-01 | Call Sheet | All call-sheet fields and options, schedule/contact summaries, locations/safety/parking/hotel/hospital/notes and optional/long values. | Not tested | unverified | — |
| SHARE-01 | Share workflow | Every current Share option, link creation/copy, view selection and recipient navigation; permissions/scoping and useful content remain correct. | Not tested | unverified | — |
| SHARE-02 | Read-only/legacy URLs | Named/signed/legacy URLs, read-only display, refresh/deep links, long schedules and invalid/expired/revoked access. | Not tested | unverified | — |
| SHARE-03 | Privacy/access changes | Approved target permissions/projections, omitted restricted fields, no token leakage; material recipient workflow/content changes reviewed explicitly. | Not tested | unverified | — |
| PDF-01 | Schedule PDF creation | Actual existing PDF-generation/save-as-PDF path; ordinary/long/empty/contact-heavy schedules, full content, font/column layout, pagination and filename. | Not tested | unverified | — |
| PRINT-01 | Schedule printing | Actual browser print preview/output: paper/orientation/scaling options, page breaks, repeated headers where present, no clipped rows or editor chrome. | Not tested | unverified | — |
| PDF-02 | Contact Sheet PDF/print | Generate/open/print complete contact-sheet output; long/international values, wrapping, pagination and no missing fields. | Not tested | unverified | — |
| PDF-03 | Call Sheet PDF/print | Generate/open/print isolated call-sheet output; all sections, complete values, page boundaries and legible layout. | Not tested | unverified | — |
| PRINT-02 | Read-only and responsive output | Print/PDF from existing supported views and device/browser paths; saved files open and preserve the same useful information. | Not tested | unverified | — |
| UI-01 | Desktop layout | Agreed browser/viewport/zoom profiles; grid/header/toolbars/modals, scrolling, sticky elements, overflow and resizing remain usable. | Not tested | unverified | — |
| UI-02 | Phone layout | Agreed phone widths and portrait/landscape; navigation, long fields, time inputs, editing, modals, save/share and touch controls. | Not tested | unverified | — |
| UI-03 | iPad/tablet/touch | Physical or validated touch-device evidence for reorder, selection, scrolling, keyboard, orientation and print/share where supported. | Not tested | unverified | — |
| CMS-01 | Presentation/CMS | Theme/action configuration, supported styling, read-only/print consistency, saving and unauthorized-change rejection. | Not tested | unverified | — |
| AUTH-01 | Target accounts/login | Login/logout, signup/invite/recovery/expiry, denied/removed users and failures. User-reviewed criteria for material account/role workflow changes; improvements need no waiver solely for differing. | Not tested | unverified | — |
| DATA-01 | Complete document fields | Schema/backup round trips and runtime save/reload preserve all current meta/row/sub-location/contact/call-sheet/weather/optional/legacy fields; no silent stripping. | Not tested | unverified | — |
| DATA-02 | Related state and identity | Library/order/archive metadata, snapshots, templates, CMS, legacy links and stable mappings; no detached or overwritten related records. | Not tested | unverified | — |
| MIG-01 | Safe transfer/recovery | Synthetic idempotent import, delta catch-up, per-record final reconciliation, malformed/duplicate/orphan reporting and backup/rollback; separate from runtime UI parity. | Not tested | unverified | — |
| INV-01 | Completeness walk-through | Enumerate every current production screen/menu/control/output against this ledger and add missing cases before sign-off; a closed list cannot silently exclude discovered features. | Not tested | unverified | — |

### Reproducible evidence requirements

For every execution record: case ID and exact steps; actual Netlify production URL/build/capture time; target Vercel URL/build, Supabase migration version and account role; matched approved fixture/content identity; browser/version, OS/device, viewport, zoom/DPR, orientation and print settings; observed results; Pass/Fail/Not tested; classification; evidence paths; defect or decision link; tester/date and reviewer. A staging comparison must be labelled staging and cannot fill the production-baseline column.

Capture paired screenshots of the same state and full relevant field values, plus widths/heights, font/wrapping/auto-resize/overflow observations where sizing is involved. Measure the actual input content and practical capacity, not merely the bounding box. Exact old dimensions are not required for a verified improvement. Use the same content/settings to capture print preview and generated PDF files; compare text/fields, page count/breaks, clipping, readable scale and layout. Record every meaningful difference with its classification and evidence; do not hide material content/layout losses inside a global visual tolerance. Any browser/font rendering tolerance must preserve usability and complete information.

Use the fixture set above, including empty/ordinary/long/multi-page/contact-heavy/call-sheet-heavy/sub-location-heavy/legacy/malformed/conflicting data. Declare supported browser/device profiles and run each applicable case on them. Control or record time, weather/provider responses and network conditions so dynamic values do not mask regressions. Keep sensitive approved evidence access-restricted and omit credentials/tokens.

Record material tradeoffs in a decision ledger: case/build, existing capability, proposed target behavior, benefit, potential information/usability loss, user decision and tested acceptance criteria. Routine improvements with verified retained capability do not require individual waivers. A pending decision or required missing test keeps the gate closed. Any accepted scope change must be explicit and must not erase the original comparison.

### Known gaps and sign-off

Current gaps: completion of the existing local editor/account integration into the full product (the scoped workspace/lifecycle/provisioning slices are already locally accepted); complete snapshots/templates/library/CMS and legacy-link runtime coverage; Move To semantics under immutable production identity; legacy snapshot-delete versus target immutable-history behavior; complete field preservation; actual paired production/target navigation/input/layout runs; physical-device/browser and PDF/print evidence. Passing a local archive or Auth RPC does not close its UI parity row.

Gate summary must state required executions, Pass/Fail/Not tested totals, classification totals, unresolved defects/decisions, exact candidate builds and user approval. Currently **0 Pass, 0 observed Fail, 45 case groups Not tested; all 45 unverified; real-schedule migration blocked**. The final execution count expands these groups across the agreed fixtures and device/browser profiles. The absence of an observed failure is not evidence of success. Reopen affected cases if production or target behavior changes after capture. Even after parity approval, latest-source complete reconciliation, Netlify availability, a single authoritative writer and verified rollback remain mandatory.
