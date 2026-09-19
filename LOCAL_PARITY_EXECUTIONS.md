# Local parity execution coverage — in progress

This ledger indexes actual local observations. It does not change the production acceptance results in REGRESSION_MATRIX.md. A partial case is not a pass for the complete case/fixture/device matrix. Published source provenance is recorded separately; the isolated historical runtime is not a live hosted-storage test.

| Case | Local coverage | Evidence boundary |
|---|---|---|
| NAV-01 | Partial | Local library/editor open, Close, refresh and direct copy handoff observed. History selection survives refresh and Back/Forward. Full fixture/role navigation coverage remains. |
| NAV-02 | Partial | Dirty Close and Keep editing observed; ordinary copy is contextual. Retained import and template reviews survive Tools dismissal; template cancellation sends nothing. Concurrent navigation/save permutations remain. |
| IN-01 | Partial | Main/nested textarea clipping repaired at1280/390; phone creation dialog fits. Remaining field/fixture matrix remains. |
| IN-02 | Partial | Keyboard row reorder, time and date entry, dialog Escape/focus observed. Native IAB date-picker crashed; physical keyboard/touch coverage remains. |
| IN-03 | Partial | Tools native dialog, Escape return focus and clear rename confirmation observed. Full accessibility audit remains. |
| LIB-01 | Partial | Search, filters/reset, Recent suppression, production tree and archive/Trash collections observed. Multiple-production and ordering permutations remain. |
| LIB-02 | Partial | Single-step blank creation, file import, Duplicate and direct copy opening observed. Duplicate-name conflict now offers an actionable recovery message; discarded review clears its error. Full paired Save As permutations remain. |
| LIB-03 | Partial | Rename and rename-back preserve identity/document. Cross-production Move has no authorized destination in this fixture and was cancelled. |
| LIB-04 | Partial | Fictional archive/unarchive and Trash/restore complete; saved document/name/slug/status restored exactly. Broader role coverage remains. |
| ED-01 | Partial | Add/delete and keyboard reorder observed on audit fixture. Complete action permutations remain. |
| ED-02 | Partial | Midnight/zero-duration and sunrise/sunset insertion order tested. Remaining anchors and invalid-input matrix remain. |
| ED-03 | Partial | Contact/status and nested completion observed. Not all action/style variants executed. |
| ED-04 | Partial | Duration/reorder/delete and weather Undo/Redo observed. Full saved-baseline permutations remain. |
| ED-05 | Partial | Town/date and call-sheet fields saved/read back. Complete header fixture set remains. |
| SAVE-01 | Partial | Ordinary saves and reopen verified with authenticated readback. Broader paired paths remain. |
| SAVE-02 | Partial | Two ordinary tabs exercised a genuine stale-write conflict, preserved the second draft, checked the different saved result, and explicitly reloaded the first writer. Lost-acknowledgement and network-loss browser paths remain. |
| SNAP-01 | Partial | Unsaved named capture and expanded contents verified without saving source. Restore content, retained newer draft recovery, and clean editor return now observed on a separate fictional schedule; authenticated saved readback verifies content. Snapshot copy opens a separate schedule with matching rows/metadata; rename, Trash and restore preserve snapshot identity. Wider role/fixture matrix remains. |
| TOOL-01 | Partial | Tools drawer, Snapshots direct opening, file review retention, phone sheet and duplicate handoff observed. Full command inventory remains. |
| TPL-01 | Partial | Production-only create/readable complete preview, Apply/Undo/Redo/Save, Apply cancellation, retained review reopening and cancellation observed. Confirmation buttons stay visible at1280/390. Publication, withdrawal, rename, replacement, Trash and restore verified on new fictional templates. C06 browse-first layout, contextual creation, cancel/return/focus and draft preservation verified at1280/390. Broader role/fixture matrix remains. |
| TPL-02 | Partial | Browser discovery/file review, production-only import and byte-exact untouched-source export observed; malformed input rejected with actionable copy. Full browser-storage and role matrix remains. |
| BKP-01 | Partial | Actual single JSON/CSV downloads parsed and verified. Actual full library download contains15 schedules, each exactly matched to authenticated readback. Remaining format/fixture/output matrix remains. |
| BKP-02 | Partial | Actual fictional JSON parsed/imported at production level; exact authenticated readback. Invalid/recovery permutations remain. |
| LOC-01 | Partial | Approved live public Google suggestions/details and restored buttons observed. Manual/provider-error/map-navigation matrix remains. |
| LOC-02 | Partial | Nested fields/completion and saved preservation observed; full reorder/remove/print matrix remains. |
| WX-01 | Partial | Live public forecast, Clear/Undo, refresh order and saved-weather restoration observed. Matched desktop/phone field and button geometry equals legacy; detached Refresh/status and stale Undo feedback corrected. Controlled refresh/error/late-response cases pass. Broader live failure/time and physical-device cases remain. |
| CON-01 | Partial | Fictional full contact saved/read back. Complete long/international/suggestion fixtures remain. |
| CON-02 | Partial | Actual eight-column/two-record CSV checked, including escaping. Full contact sheet sorting/output remains. |
| CALL-01 | Partial | All eight fields saved/read back and shown in preview. Actual printed pagination remains. |
| SHARE-01 | Partial | Team link copied with correct review path. New recipient tab required ordinary sign-in, then opened the intended schedule. Sharing drawer opens directly and Escape returns focus. Client-link and separate-role recipient journeys remain. |
| SHARE-02 | Partial | Client Reload regression corrected by bounded HttpOnly recipient cookie; two distinct browser shares and same-tab navigation/reload verified. Original grant expiry/revocation still denies existing cookies; no-cookie and cross-link/origin denial verified. Full legacy-route/hosted/device variants remain; see B15_CLIENT_REFRESH.md. |
| SHARE-03 | Partial | Client projection visibly omits fixture contacts/call-sheet/status while retaining notes; new fictional link revoked and original denied. Other roles, expiry and full raw-response/log matrix remain. |
| PDF-01 | Blocked output/device evidence | Native print/PDF output is not exposed by the available browser surface; physical device evidence is unavailable. |
| PRINT-01 | Blocked output/device evidence | Native print/PDF output is not exposed by the available browser surface; physical device evidence is unavailable. |
| PDF-02 | Blocked output/device evidence | Native print/PDF output is not exposed by the available browser surface; physical device evidence is unavailable. |
| PDF-03 | Blocked output/device evidence | Native print/PDF output is not exposed by the available browser surface; physical device evidence is unavailable. |
| PRINT-02 | Blocked output/device evidence | Native print/PDF output is not exposed by the available browser surface; physical device evidence is unavailable. |
| UI-01 | Partial | Matched desktop panel/header/grid geometry and polished dialogs/drawer observed. Long/empty fixtures and nested template previews checked; long1280/390 has no clipped textareas or page overflow. Legacy long desktop captured; sun-row differences prevent exact screenshot equivalence. Broader states remain. |
| UI-02 | Partial | 390px library/editor/tool sheet and dialog fit observed without horizontal overflow; physical touch remains. |
| UI-03 | Blocked output/device evidence | Native print/PDF output is not exposed by the available browser surface; physical device evidence is unavailable. |
| CMS-01 | Not executed in this local parity pass | Earlier unit/database suites do not substitute for this runtime parity execution. |
| AUTH-01 | Partial | Fresh Team-link tab required ordinary sign-in and preserved the schedule destination. C09 adds rendered organization/MFA unavailable, retry/loading, recovery and controlled-expiry coverage with retained drafts; challenge rendering uses controlled read fixtures. Genuine MFA/leadership, recovery delivery, invitation and full role variants remain. |
| DATA-01 | Partial | Full fictional JSON/import/duplicate equality and lifecycle round-trip preservation verified. Complete legacy fixture inventory remains. |
| DATA-02 | Partial | New template identity survives rename/Trash/restore/publication/withdrawal/replacement; snapshot identity survives rename/Trash/restore, then copy opens a separate schedule. Complete related-state/legacy mappings remain. |
| MIG-01 | Not executed in this local parity pass | Earlier unit/database suites do not substitute for this runtime parity execution. |
| INV-01 | Partial | Source control inventory expanded and linked to observations; not a completed all-controls execution. |

Evidence: B15_PARITY_REMEDIATION.md and evidence/b15-parity-remediation/. No actual schedules or hosted settings were changed. Native output and physical-device cases remain open; no workaround for the blocked native-app access was attempted.

September 19 quality-pass delta: B15_QUALITY_PASS.md and evidence/b15-quality-pass/. C01/C02 verified locally. Coverage totals are now 32 Partial, 7 Not executed, 6 Blocked; no complete group is promoted to Pass.

September 19 workflow continuation: B15_WORKFLOW_COMPLETION.md and evidence/b15-workflow-completion/. History refresh/restore, snapshot copy/Trash/recovery, template publication/withdrawal/replacement, exact15-document library download and C05 single-organization product navigation are verified local slices. C04 matched-input check resolves the dirty-state discrepancy; no indicator suppression. Coverage:36 Partial,1 observed local Fail (Client recipient refresh),2 Not executed (CMS-01, MIG-01),6 Blocked. Multi-organization genuine account journey and leadership Administration UI remain unverified; component tests do not replace them. No full group Pass.

September 19 C06 integration checkpoint: B15_TEMPLATE_INTEGRATION.md and evidence/b15-template-integration/. Browse-first template library, contextual creation, complete management lifecycle, apply/cancel/undo, browser import cancellation, keyboard return and390px layout verified. Account security entries are grouped and their disclosures/return work. Existing full backend/export evidence is explicitly reused rather than misrepresented as a new complete run. Totals remain36 Partial,1 local Fail,2 Not executed,6 Blocked,0 full Pass. Implementation stops at this checkpoint for the coordinator handoff.

September 19 C08: B15_ACCOUNT_FLOW.md records the single-task sign-in/invitation/recovery correction, full desktop/narrow form navigation and final callback focus checks. Expired-state coverage is rendered component evidence, not live idle expiry. One unintended fictional recovery request returned503; recipient-scoped local mail sink read found zero messages. No parity group is promoted. Implementation stops for independent review and sole-owner handoff.

September19 WEATHER-PARITY-20260919: B15_WEATHER_PARITY.md and evidence/b15-weather-parity/ record matched legacy values/button geometry, nearby weather attribution/refresh/status, and weather-scoped feedback. Source document unchanged at version1. No provider/configuration changes or live provider queries in this pass. Full parity status remains partial pending independent review.

September19 C09 access-recovery checkpoint: B15_ACCESS_RECOVERY.md and evidence/b15-access-recovery/ record the reproduced fragmented unavailable state and bounded correction. One recovery task rechecks directory/MFA, keeps known organization identity and mounted drafts, and distinguishes unavailable checks from a required challenge or expired session. Controlled503/401 browser evidence is separate from genuine provider policy evidence; original screenshot service cause is unknown. No earlier C06/C07/C08/weather slice was reimplemented or parity group promoted. Totals remain36 Partial,1 local Fail,2 Not executed,6 Blocked,0 full Pass. Stop for independent review.

September19 overnight Client-refresh pass: B15_CLIENT_REFRESH.md and evidence/b15-overnight/client-refresh/ resolve the observed local recipient Reload failure. Totals now37 Partial,0 known local Fail,2 Not executed,6 Blocked,0 full Pass. Earlier totals are historical; this is not whole-sharing acceptance. Continue the authorized UI/control, role/multi-org and actual-output passes.
