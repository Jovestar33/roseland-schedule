# B04 — locally accepted Copy / Save As and schedule-only file tools

Dispatch `B02-B04-AUTH-20260916`, existing-day-only scope. Baseline B02 `c14e03fe3416eb5f07688ad8c7abebbaffb1046d`. Durable checkout `/Users/johnsammon/.codex/worktrees/roseland-b02/roseland-schedule`. This review accompanies the separate tested B04 checkpoint. The authorized B02/B04 bundle is complete locally; B03 is not dispatched.

## Implemented behavior

Copy / Save As captures the current editor draft, then reviews names/slugs, full documents and an existing editable production day. A second confirmation creates fresh stable IDs through the existing lifecycle RPC. The source and later draft edits are untouched. File import uses the same immutable per-item controller, stops at the first unconfirmed result, skips confirmed items and probes original IDs/history before retry. Receipts retain created/attempted IDs and states.

Export reads every schedule visible to the account through RLS across organizations, including readable archived/deleted records. It paginates, checks versions while reading and rechecks the inventory before producing a file. Any read failure/change or size/count limit fails the entire export rather than silently producing a partial one. It is not a transactional database snapshot. It exports saved documents only.

The schedule-only format records source provenance and SHA-256 of canonical document JSON. Import verifies hashes, known fields, dates/times/numbers, optional/nested fields and size/count limits before any write. Familiar legacy schedule-only formats reuse the extracted pure legacy parser, followed by stricter target validation; unfamiliar fields are rejected, not stripped. Explicit overwrite/target-ID instructions are rejected. Source identity/status/deleted state/hierarchy are not applied; imported schedules become new drafts in the reviewed existing day, with supplied document metadata preserved.

The UI and file explicitly exclude history, snapshots, templates, CMS, memberships, hierarchy definitions, aliases and browser-only data. This does not satisfy the complete migration exporter gate.

## Executed evidence

| Check | Result |
|---|---|
| Platform | 158 tests pass, including 14 B04 checks for hashes/legacy round trips, malformed/oversize/unknown/overwrite inputs, immutable draft capture, duplicate names/slugs/IDs, partial failure, exact-ID retry, auth denial/recovery, scope changes, duplicate execution and changed export inventories. |
| Editor | 56 regressions pass; extracted legacy parser behavior retained. |
| Database | 431 assertions / 13 files pass against the unchanged 14 migrations and populated retained fixture stack. |
| Build / types / lint | Final production build, TypeScript and scoped ESLint pass. Existing ESLint config deprecation notice only. Source diff whitespace check passes. |
| Dependency audit | No high/critical runtime findings. No universal security claim. |
| Genuine Auth runtime | Owner exported 54 records over multiple pages across two organizations, including a readable deleted record. Viewer exported 52 authorized records; outsider zero. Viewer/cross-tenant create denied. Exact draft-copy/source-preservation, duplicate-name preflight and three-item partial lost-ack recovery pass without duplicate sends. `evidence/b04-files/runtime-results.json` and per-run manifest. |
| Actual browser copy | Edited fictional source without saving; reviewed copy ID `f65fdfee-fdd8-4f62-b7d9-4cd0bcfeb798`; held creation response and made a newer source edit; released and confirmed. New copy contains the earlier reviewed note, newer edit remains in the editor, source still saved version 2. Duplicate existing name rejected before creation. |
| Actual browser export | Download contains 59 saved schedules, every hash matches. `browser-export.json`, `browser-copy-receipt.json`, `browser-verification.json`. Source version unchanged. |
| Browser import and recovery | Malformed JSON rejected before review/write. Valid two-record review canceled with database count 0; reopened and prepared fresh IDs. Simulated pre-send failure, then a committed-but-lost response, followed by expired session/reauthentication and organization switch. Review stayed hidden outside its destination and retained original IDs. Retry confirmed the first record and created only the remaining one. Both records are version 1 and exactly match imported documents; `browser-import-saved-documents.json` and `browser-import-receipt.json`. |
| Browser viewer/account boundary | Viewer has no editable destination and Prepare/Copy disabled; genuine API writes denied. Sign-out cleared all local draft/request details. |
| Responsive review | DOM-verified 1280×720 and 390×844 captures; phone document width 390 with no horizontal overflow. Screenshots retained in `screenshots/`; viewport reset after testing. |
| Request boundary | Sanitized B04 request trace excludes the accepted B02 prefix and has zero unexpected blocked calls. Local runtime rejects non-loopback network destinations. |

## Browser access and artifact provenance

Chrome extension file access initially rejected the chooser API. The user enabled “Allow access to file URLs” and restarted Chrome; the final browser import acceptance then passed through the documented file chooser API. Failed native-picker attempts are not counted as successful imports. Generated local test credentials were used only interactively, never stored in artifacts. Raw JSON/receipt downloads, checksums, screenshots, source/version checks and created-ID manifests are retained under `evidence/b04-files/`.

## Internal review and limits

Reviewed actor/organization guards, immutable document snapshots, existing lifecycle acknowledgement/history matching, account-bound requests, hidden retained reviews, pure parser separation from legacy network adapters, source preservation and full-export failure behavior. Import is sequential, not atomic across a batch; confirmed items remain created after a later failure. Closing/reloading loses in-memory retry details; the UI warns and offers an ID receipt. SQL retains authoritative validation and role checks.

Limits: 1–500 imported schedules, 20 MB serialized file and conservative 2 MB per-document client limit. Export refuses larger inventories/files. Display-name duplicates are rejected in the review and existing-production preflight; atomic concurrent display-name uniqueness is not provided by the existing SQL contract. Active slug uniqueness remains enforced atomically by SQL. No new uniqueness/placement policy was invented; this is an explicit decision in `NEXT_LIBRARY_B03_BRIEF.md`.

No schema, RLS, dependency, actual schedule, hosted configuration, real-provider, real-credential, push or deployment changes. Tests use only generated fictional local actors and data. B02's accepted evidence is preserved. Library parity remains open before reskin; the next brief is a proposal, not a B03 dispatch.

## Checkpoint and cleanup

B02 remains independently accepted at `c14e03f`. B04 has no schema or dependency changes and reuses existing creation/history contracts. `NEXT_LIBRARY_B03_BRIEF.md` is the requested concrete follow-up with unresolved placement/identity decisions. Owned browser sessions are signed out, viewport restored, and owned app/proxy/stack services are stopped after evidence capture; recovery volumes and fictional records remain. No push/deployment.
