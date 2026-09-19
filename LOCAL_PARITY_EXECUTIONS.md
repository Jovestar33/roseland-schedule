# Local parity execution coverage — in progress

This ledger indexes actual local observations. It does not change the production acceptance results in REGRESSION_MATRIX.md. A partial case is not a pass for the complete case/fixture/device matrix. Published source provenance is recorded separately; the isolated historical runtime is not a live hosted-storage test.

| Case | Local coverage | Evidence boundary |
|---|---|---|
| NAV-01 | Partial | Local library/editor open, Close, refresh and direct copy handoff observed; full paired navigation/back/forward coverage remains. |
| NAV-02 | Partial | Dirty Close and Keep editing observed; retained import review survives Tools dismissal. Concurrent navigation/save permutations remain. |
| IN-01 | Partial | Main/nested textarea clipping repaired at1280/390; phone creation dialog fits. Remaining field/fixture matrix remains. |
| IN-02 | Partial | Keyboard row reorder, time and date entry, dialog Escape/focus observed. Native IAB date-picker crashed; physical keyboard/touch coverage remains. |
| IN-03 | Partial | Tools native dialog, Escape return focus and clear rename confirmation observed. Full accessibility audit remains. |
| LIB-01 | Partial | Search, filters/reset, Recent suppression, production tree and archive/Trash collections observed. Multiple-production and ordering permutations remain. |
| LIB-02 | Partial | Single-step blank creation, file import, Duplicate and direct copy opening observed. Name collision and full paired Save As permutations remain. |
| LIB-03 | Partial | Rename and rename-back preserve identity/document. Cross-production Move has no authorized destination in this fixture and was cancelled. |
| LIB-04 | Partial | Fictional archive/unarchive and Trash/restore complete; saved document/name/slug/status restored exactly. Broader role coverage remains. |
| ED-01 | Partial | Add/delete and keyboard reorder observed on audit fixture. Complete action permutations remain. |
| ED-02 | Partial | Midnight/zero-duration and sunrise/sunset insertion order tested. Remaining anchors and invalid-input matrix remain. |
| ED-03 | Partial | Contact/status and nested completion observed. Not all action/style variants executed. |
| ED-04 | Partial | Duration/reorder/delete and weather Undo/Redo observed. Full saved-baseline permutations remain. |
| ED-05 | Partial | Town/date and call-sheet fields saved/read back. Complete header fixture set remains. |
| SAVE-01 | Partial | Ordinary saves and reopen verified with authenticated readback. Broader paired paths remain. |
| SAVE-02 | Not executed in this local parity pass | Earlier unit/database suites do not substitute for this runtime parity execution. |
| SNAP-01 | Partial | Unsaved named capture and expanded contents verified without saving source. Restore/copy/delete semantics remain. |
| TOOL-01 | Partial | Tools drawer, Snapshots direct opening, file review retention, phone sheet and duplicate handoff observed. Full command inventory remains. |
| TPL-01 | Partial | Production-only create/full preview and Apply cancellation observed. Publishing/update/delete and role matrix remain. |
| TPL-02 | Not executed in this local parity pass | Earlier unit/database suites do not substitute for this runtime parity execution. |
| BKP-01 | Partial | Actual single JSON/CSV downloads parsed and verified. Full library and complete export matrix remain. |
| BKP-02 | Partial | Actual fictional JSON parsed/imported at production level; exact authenticated readback. Invalid/recovery permutations remain. |
| LOC-01 | Partial | Approved live public Google suggestions/details and restored buttons observed. Manual/provider-error/map-navigation matrix remains. |
| LOC-02 | Partial | Nested fields/completion and saved preservation observed; full reorder/remove/print matrix remains. |
| WX-01 | Partial | Live public forecast, Clear/Undo, refresh order and saved-weather initial restoration observed. Broader failure/time cases remain. |
| CON-01 | Partial | Fictional full contact saved/read back. Complete long/international/suggestion fixtures remain. |
| CON-02 | Partial | Actual eight-column/two-record CSV checked, including escaping. Full contact sheet sorting/output remains. |
| CALL-01 | Partial | All eight fields saved/read back and shown in preview. Actual printed pagination remains. |
| SHARE-01 | Partial | Team link copied with correct review path; no Client link or recipient journey performed. |
| SHARE-02 | Not executed in this local parity pass | Earlier unit/database suites do not substitute for this runtime parity execution. |
| SHARE-03 | Not executed in this local parity pass | Earlier unit/database suites do not substitute for this runtime parity execution. |
| PDF-01 | Blocked output/device evidence | Native print/PDF output is not exposed by the available browser surface; physical device evidence is unavailable. |
| PRINT-01 | Blocked output/device evidence | Native print/PDF output is not exposed by the available browser surface; physical device evidence is unavailable. |
| PDF-02 | Blocked output/device evidence | Native print/PDF output is not exposed by the available browser surface; physical device evidence is unavailable. |
| PDF-03 | Blocked output/device evidence | Native print/PDF output is not exposed by the available browser surface; physical device evidence is unavailable. |
| PRINT-02 | Blocked output/device evidence | Native print/PDF output is not exposed by the available browser surface; physical device evidence is unavailable. |
| UI-01 | Partial | Matched desktop panel/header/grid geometry and polished dialogs/drawer observed. Full long/empty/overflow fixture set remains. |
| UI-02 | Partial | 390px library/editor/tool sheet and dialog fit observed without horizontal overflow; physical touch remains. |
| UI-03 | Blocked output/device evidence | Native print/PDF output is not exposed by the available browser surface; physical device evidence is unavailable. |
| CMS-01 | Not executed in this local parity pass | Earlier unit/database suites do not substitute for this runtime parity execution. |
| AUTH-01 | Not executed in this local parity pass | Earlier unit/database suites do not substitute for this runtime parity execution. |
| DATA-01 | Partial | Full fictional JSON/import/duplicate equality and lifecycle round-trip preservation verified. Complete legacy fixture inventory remains. |
| DATA-02 | Not executed in this local parity pass | Earlier unit/database suites do not substitute for this runtime parity execution. |
| MIG-01 | Not executed in this local parity pass | Earlier unit/database suites do not substitute for this runtime parity execution. |
| INV-01 | Partial | Source control inventory expanded and linked to observations; not a completed all-controls execution. |

Evidence: B15_PARITY_REMEDIATION.md and evidence/b15-parity-remediation/. No actual schedules or hosted settings were changed. Native output and physical-device cases remain open; no workaround for the blocked native-app access was attempted.
