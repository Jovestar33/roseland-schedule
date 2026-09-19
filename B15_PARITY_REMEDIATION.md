# B15 parity remediation — in progress

The user rejected the 3487 preview for nonworking Google Places/weather and lack of legacy visual parity. The prior review-ready characterization was premature. B15 and user acceptance are open. This report replaces readiness claims, not the preserved raw evidence.

## Current checkpoint

September19: published Netlify provenance is freshly verified; live Google Places and Open-Meteo now pass in the isolated local candidate using only the approved public Raleigh Union Station test. No hosted settings or actual schedules were changed. Final local suites:236 platform and69 editor tests, plus optimized build and credential scan passed. B15 acceptance remains open for the remaining workflow/output/device gaps below.

## Initial severity-ranked gaps (historical observations)

1. **P1 — real providers absent.** `LocalScheduleClient` unconditionally supplies `fictionalDocumentProviders`. Places only searches four invented locations; weather returns invented values. The launcher supplies no Google Places key. The existing protected `/api/places` admits legacy HMAC credentials, not the current Supabase session. Merely pointing the client at that route would fail authorization; no bypass is acceptable. Real provider checks are not passed.
2. **P1 — editor chrome does not match legacy.** Current 1280×720 browser observation shows review/account/organization/navigation layers above a different toolbar. The grid begins near the bottom of the viewport. Shared row components do not establish whole-screen parity. Header fixture labels and an always-visible fictional-weather notice compound the difference.
3. **P1 — missing local controls.** Source confirms map buttons and Google Weather links are suppressed for every local editor, regardless of whether a real provider is available. Local project/phase suggestions are also blanked. Each needs a bounded implementation and runtime comparison, not a claim of equivalent behavior.
4. **P1 — incomplete acceptance evidence.** The existing 45-group production ledger is not an executed end-to-end parity suite. Native dialogs, physical touch, print/PDF and real providers have material gaps. Earlier sampled checks and source hashes remain evidence only for their actual scope.
5. **P2 — live baseline access pending.** Public live site currently redirects to editor sign-in. Automatic approval review rejected opening the private Netlify deploy dashboard because explicit user authorization was not recognized. Coordinator has the exact minimal read-only dashboard request. Previous `62eb261` provenance is historical until refreshed. No indirect dashboard access will be attempted.

## Preservation and method

3487 was inspected without reloading, navigating or editing its user tab: fictional example is saved at version 3. 3485 and B11 3445 stay untouched. Mutation walkthroughs use separate local fictional copies and the ordinary authenticated target paths. Local legacy source comparison must be labeled separately from live observations and from deployed dependency behavior. No actual schedules are changed or exported. No hosted changes, key restriction changes, new paid access, push, deployment, purge, factor reset or excluded B08 probes.

Next evidence records paired viewports, data, fonts, theme and UI state, control-by-control outcomes, fixes and retests. Untested or blocked cases remain explicit; fictional provider responses never count as live provider success.

## Demonstrated causes and corrections under verification

| Defect | Legacy expectation / failed target | Local correction and observed result |
|---|---|---|
| D01 P1 editor hierarchy | At 1280×720, legacy panel x16/y127/w1248; target x36/y284/w1208, grid 216px lower. Different toolbar, extra review/management rows. | Reuse legacy toolbar classes, SaveDropdown and SyncStatusPill; remove extra panel padding and editing navigation; contextualize account/tools. Candidate v3 panel, toolbar and metadata exactly match measured legacy geometry. Mobile Account button caused extra height; v4 moves it to Tools while editing. |
| D02 P1 clipped input | Saved descriptions needed 104px but target textareas were 26px high; notes needed85px at26px; nested descriptions needed33px at15px. Text was present but inaccessible visually. | Initial sizing ran while the permission-gated editor was hidden. Re-measure on visible width changes and loaded fonts. Main, Places and nested textareas fixed. Actual paired v3 screenshots/DOM show zero clipped textareas at1280 and390. |
| D03 P1 library flow | Target exposed a large filter form and technical status text, with separate management navigation before its heading. | Reuse Library heading, existing tabs/search, Filter toggle and compact rows. Ordinary blank creation uses one submission then opens the confirmed result. No permissions or identity/version/recovery checks removed. Still not full library parity: per-row commands, canonical production grouping, production/phase management and Restore discovery require further work. |
| D04 P1 providers | Real Places and weather are absent; local fixture provider is unconditional. | Initial automatic rejection was resolved by explicit user approval for both bounded steps on September19. Live opt-in local proxy now passes public-place suggestions, details and real weather in browser/API checks. No hosted configuration or key restrictions changed. |
| D05 P2 redundant tool entry | Save→Snapshot revealed a second Snapshots launcher; Templates had the same extra step. | v4 requests the existing authorized dialog directly. Named current-draft capture uses one Save snapshot submission with exact-request recovery retained. Direct opening, named unsaved capture, expanded complete preview and closing back to the clean editor verified. Templates direct opening, production-only create and Apply cancellation verified. Publication, restoration and broader authority reviews remain. |
| D06 P1 missing links | Local mode hides main map links, disables nested map buttons, hides Google Weather link. | Restored for explicitly enabled live local providers. Buttons/link are visible; actual external map navigation still needs its own observed check. Fictional-only rehearsal continues to suppress them. |

### Actual local journey observations

Created only `B15 comprehensive parity — fictional` (`86f6b47d-0df9-405b-92d6-9aeeeb0e2ddf`) through the ordinary Organizer library. It opened after the single Create submission. Added two rows and saved multiline description/notes, nested location/address/description/completion, fictional contact and status. `11:45 PM + 00:30 → 12:15 AM`; following zero-duration row remains `12:15 AM`. Duration change→Undo→Redo returned the expected times. Added a third row, moved it from position3 to2 using keyboard drag, undid movement, deleted the third row, Undo restored it and Redo removed it. Dirty Close displayed the guard; Keep editing retained content. Save→Close→reopen returned Saved and the retained fields. Status Escape dismissed without applying its draft; subsequent Save Status succeeded. Ordinary authenticated readback recorded version2/two rows before the later save. These are target observations, not yet paired legacy acceptance for every path.

`control-inventory.json` expands the actual historical legacy source control anchors. `legacy-functional-source.json` identifies unmodified legacy function-body hashes. The isolated runtime on3490 substitutes only Netlify Blobs IO with persistent fictional local storage and uses fictional credentials; its UI/function behavior is source-backed, not a hosted storage/CDN test. Runtime3490 and audit candidate3488 are temporary testing surfaces, not a user-ready handoff.

### Evidence boundaries

Initial screenshots compare identical ordinary document values but different observed themes; their metrics explicitly record that. Subsequent `legacy-matched` screenshots use the target's observed pink/header label in the isolated legacy response, without changing target organization settings. Both report loaded fonts, DPR2 and zoom1. The initial viewport tool changed only its selected tab; the incorrectly sized candidate capture was replaced by an independently measured390px candidate session. Physical touch and native print have not thereby passed. No provider response has been fabricated to stand in for real weather.


## Further executed checks (September 19)

- **Saved content and downloads:** ordinary authenticated readback of the new audit document confirms version4, two rows, nested details/contact/status, unsaved-marker notes now deliberately saved, and all eight call-sheet fields. Actual browser JSON download matches saved rows and metadata exactly; export time is intentionally fresh. Actual contact CSV has two records/eight columns, valid CRLF, multiline quoted description, and safe phone prefix. Files and comparisons are in this evidence folder.
- **Snapshot:** expanded `B15 unsaved draft parity` preview contains the unsaved marker, nested location/address/description, status and full contact. The earlier unexpanded preview capture was premature, not a failed snapshot. Creating it did not save or replace the open schedule.
- **Template:** created `B15 parity rows — fictional`, two rows, production only. Full rows inspected. Apply review followed by Keep current rows preserved the audit draft. No organization publication performed.
- **Navigation fixes:** closing Snapshots/Templates now clears the extra review navigation. Copied Team link keeps `/review`, organization and schedule identity; clipboard result verified. No recipient message was sent and no Client link was created.
- **Desktop comparison:** fresh1280×720 captures both DPR1, zoom1 and loaded fonts. Header111px; panelx16/y127/w1248; toolbar62px; metay189/h225.984; weather y414.984/h61; grid y475.984 match. Grid content height differed because legacy restored two sun rows and target omitted them (D07 below). Earlier DPR2 captures are separately labelled.
- **Phone:** refreshed390px target has document width390, zero clipped visible textareas, and compact header after Account moved to Tools. Screenshot is viewport evidence, not physical touch acceptance.
- **Legacy local mutation path:** edited only the isolated source-backed fictional fixture's first notes, Save→Close→open retained multiline value, then restored original notes and saved. Confirmed real legacy Tools drawer tabs Templates/Backup/Restore, plus library controls Rename production, Rename phase, Links, Move To, Add Phase and Add Production. No Netlify storage writes occurred.
- **Import:** actual chooser selected the downloaded fictional JSON. Parsing and full two-row/eight-call-sheet-field preview succeeded. Submission unavailable: destination picker has no editable day. Cancel review leaves source Saved. No import records created (D08 below).
- **Print:** Call Sheet preview contains all eight fields and fictional contact; Print was invoked, but the browser tools did not expose native print output. No PDF/output correctness claim. The temporary document title persisted in that session; reload after saving restored it. Do not treat a print button click or DOM portal as generated-output proof.

### Additional defects

| ID | Finding | Status |
|---|---|---|
| D07 P1 | Legacy restores missing sunrise/sunset rows from saved weather on load. Target only did this after refresh, omitting two visible markers. | Local correction restores from saved weather without external requests and allows Undo. Dedicated initial-load browser retest still required; live refresh, Clear/Undo, and saved public-location weather passed. |
| D08 P1 | Library can create at production level, but JSON import requires an existing editable day. The ordinary Organizer fixture has no offered destination. | Open workflow mismatch. No permissions changed and no destination invented. Need align import placement with approved production/day rules and test creates/recovery. |
| D09 P2 | Copied Team links from review switched to `/local-workspace`; closing tool dialogs left expanded controls. | Corrected locally; copied URL and snapshot dismissal verified. |

Latest completed full suites:68 editor tests and228 platform tests passed; optimized navigation build passed. Saved-sun-row follow-up has its own focused store checks/build/browser evidence. These are local code checks, not proof that all45 parity groups or live services pass.


## Authorized live-provider result

The user answered **Approve both bounded steps** to the precise read-only Netlify provenance and local Google Places/Open-Meteo public-location test request. The prior automatic blocks are resolved for that scope. `live-deploy-provenance.json` confirms main commit62eb261c897b3a5c4e03857e59fee8071d520b88 and Published deploy6aa4d1344f4fd68c916c5451. No deploy/settings mutation occurred.

The local route is opt-in, loopback-only and disabled on Netlify/Vercel. Each request checks same origin, active local Supabase session and effective schedule edit permission using the user's token/anon key, then a process budget. Provider requests are reconstructed from validated query/place ID or date/coordinates. Local session and schedule context never go to either provider; Google key never goes to Open-Meteo. Redirects are refused, requests time out and errors are redacted. Shared legacy auth remains intact.

Actual public query **Raleigh Union Station** returned five Google suggestions and resolved the selected station. The browser then showed September19 weather85°F/71°F,13% precipitation,7:00AM sunrise and7:15PM sunset. These are observed test response values, not a current forecast recommendation. Clear removed weather/sun rows and Undo restored them. Final name retains the selected station plus street address. Refresh now places sunrise before sunset when both precede a late-night call (new regression test). Ordinary authenticated readback confirms only our new fictional schedule at version6/four rows, including two sun markers; prior version4/download evidence remains unchanged.

`live-provider-check.json` records successful real requests and actual401/403 denials; `provider-secret-scan.json` records133 checked client/evidence files with no Google or service key. The final build and236 platform/69 editor checks passed. No broad/provider-failure matrix, output completeness or B15 readiness claim follows from this limited public example.

Native date-picker invocation crashed the IAB audit tab. The previously saved version remained intact; only unsaved public test edits were lost. A fresh audit tab used keyboard date entry successfully. This is recorded as a browser/tool limitation pending reproduction in Chrome, not silently treated as an application pass or a resolved date-picker issue.

Provider contracts were checked against [Google Autocomplete](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete), [Google attribution](https://developers.google.com/maps/documentation/places/web-service/policies) and [Open-Meteo forecast documentation](https://open-meteo.com/en/docs). Compact prediction lists include Google Maps attribution; weather retains Open-Meteo attribution. No provider account/configuration was created or changed.


## Acceptance refinement received during verification

User clarification relayed by Voice and Planning: the library may differ where approved new functionality requires it, but must look and feel like a mature application. Assess differences as justified organization/production/permission functionality versus quality/usability regressions. Require coherent hierarchy, typography, spacing, control treatment, clear primary/contextual secondary actions, useful loading/empty/error states, predictable navigation and few unnecessary steps. This does not authorize new branding or a reskin. Unchanged editor behavior retains strict legacy fidelity. Canonical production grouping is therefore not automatically a defect; missing discoverability, clutter and inconsistent workflows still are.


## Library and interaction refinement (September 19, continued)

The user explicitly prioritizes **opening and organizing schedules** and authorizes useful improvements. Quality must be at least legacy level and better where justified: a polished modern UI, while preserving familiar Roseland styling and approved access rules. Passing code tests alone does not satisfy this standard.

- Library filters now truly collapse, show an active-filter count, and offer an immediately visible Clear filters command. Filtered collections suppress unrelated Recent items. Search, empty results, archived collection and Trash discovery were exercised.
- Recent, production rows, creation/organization dialogs and controls use consistent spacing and typography. New schedule dialog fits at390px, focuses its name field and returns focus to New Schedule on Escape. Phone header reduced from198px to83px without horizontal overflow. New views are in `library-*-polished.png` and `library-phone-create-dialog.png`.
- Rename confirmation previously showed only the old name. It now shows both old and proposed names before submission. Fictional audit rename/rename back, archive/unarchive and Trash/recovery all completed. Version12 readback exactly matches version6 document, name, slug and status; no purge occurred. See `library-roundtrip-verification.json` and archived/Trash/review evidence.
- D08 is corrected locally: import offers authorized production placement with an optional existing day, using the existing production creation RPC and normal account permissions. Fresh preflight rejects unavailable production authority and foreign day/phase choices; retries retain the exact reviewed destination/identity/document. Legacy source-copy fallback keeps its existing day-bound copy policy. No migration or authority expansion occurred.
- Browser import of the actual fictional JSON download created one independent schedule with no production day. Ordinary authenticated readback is byte-structure equivalent to the full imported document (all metadata/rows retained), version1. Library opening/closing works. The browser then duplicated that import; readback verifies a different identity, exact document match and unchanged version1 source. See `import-readback.json`, `duplicate-readback.json`, `import-production-confirmed.txt`, `library-duplicate-confirmed.txt`.
- Tools now opens a native modal drawer on desktop and a bottom sheet at390px, rather than expanding management rows above the schedule. Dialog controls retain mounted operation state. Escape returns focus to the trigger. Tools→Snapshots opens the existing dialog directly. A named unfinished import review survived drawer close/reopen, then was cancelled without creating data. See `tools-drawer-desktop.png`, `tools-drawer-phone.png`, `tools-retained-import.txt`.
- D07 initial-load check is now executed: opening the ordinary fictional comparator adds6:30AM sunrise and7:15PM sunset from stored weather. Undo removes them. The resulting unsaved draft was discarded; the comparator was not saved and no weather request was needed.

Current full local suites:239 platform and69 editor tests passed; optimized Tools build passed. Later presentation/empty-state refinements receive their own final build/browser checks. These observations do not close the production45-group/device/output acceptance gate.

Remaining material gaps include full paired legacy/target matrix execution, actual generated print/PDF outputs, physical touch, real recipient/read-only workflows, broader provider failures and permission permutations, legacy template recovery and history semantics. Cross-production Move remains unexecuted in this ordinary fixture because no other destination is available; do not grant access or invent a destination to call it passed. Its empty state now explains that limitation.

Final interaction retest: unavailable Move explains the absent destination; Duplicate opened a further fictional copy directly with zero dialogs left open. Backup/Import scope is now in a disclosure, and unavailable current-draft copying is hidden in the library. Latest optimized build passed and the audited browser emitted no errors/warnings. `LOCAL_PARITY_EXECUTIONS.md` explicitly maps all45 groups to partial, unexecuted or blocked local coverage; it is not production sign-off.
