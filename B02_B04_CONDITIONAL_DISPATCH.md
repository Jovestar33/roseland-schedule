# Conditional B02 + B04 dispatch

User authorization: September 16, 2026 — automatically start this one bundle only if B01 finishes successfully. This does not restore the canceled general-purpose coordinator or authorize further batches.

## Trigger and success gate

Wait for the current B01 turn in Development and Testing (`01a092ee-ab24-7392-b1d8-e583935604d2`, B01 turn `01a0a8b7-b4ef-78d3-a483-72dead39a6bc`) to finish. Confirm recorded B01-01 through B01-10 acceptance, required regression/build/internal-review results, local commit and synchronized review. Idle/completed alone is insufficient. Missing evidence, failed acceptance, unresolved blocker or user pause means do not dispatch. Report the specific gap once and stop this conditional monitor.

## Authorized bundle, sequential checkpoints

Use the accepted B01 commit as the baseline and [TECHNICAL_ACCEPTANCE_AUDIT.md](./TECHNICAL_ACCEPTANCE_AUDIT.md) for the full B02/B04 contracts.

1. **B02: existing document tools and metadata.** Inventory and integrate existing Call Sheet, Contact Sheet/CSV, schedule print/PDF controls and missing metadata/weather/sun workflows into the local authenticated editor. Use deterministic fictional provider responses. Preserve optional/long/nested fields, read-only permissions, modal drafts and account/organization isolation. Verify genuine Auth save/reload, formula-safe CSV, complete multi-page PDF/print output without editor chrome, desktop/mobile screenshots, and absence of legacy Netlify lookups/writes. Save a separately validated checkpoint before B04.
2. **B04: Copy/Save As and schedule-only backup/import.** Limit destinations to existing authorized production days. No B03 hierarchy creation/moves or new placement policy. Support reviewed current-draft copy, export of all schedules authorized to the fictional account, and reviewed create-only import. Preserve the source, create fresh stable IDs, reject duplicate names/slugs and overwrite attempts, validate bad/oversize/partial files, preserve edits during operations, recover partial/uncertain results by original identity, and enforce role/tenant boundaries. Verify file round trips/content hashes, pagination/completeness, safe filenames, browser cancel/error/retry and existing regressions. Label exports as schedule-only, excluding related stores; this does not satisfy the complete migration exporter gate.

If B02 fails, stop before B04. If a policy/schema/permission change is necessary beyond the approved contracts, report it rather than inventing or broadening scope. Preserve accepted checkpoints and failed-run diagnostics.

## Completion and boundaries

Record separate evidence tables and local commits for B02 and B04, required tests/build/internal review, screenshots and actual PDF/CSV/JSON artifacts with fictional data only. Retain code/data checkpoints and created-ID manifests; stop only owned test services and retain recovery volumes. Synchronize review/continuity into the shared project. Local testing does not establish hosted parity.

No reskin, further design research, B03/B05 or later implementation, public sharing, CMS redesign, real provider calls, actual customer schedules, real downloads/data exports, hosted configuration/schema changes, credentials, push, deployment, purchases or migration. Stop after this bundle and return a verified report. The combined monitor checks this condition every 15 minutes, must dispatch at most once, then remove its conditional handoff instructions and return to daily service monitoring. It must not delete the independent daily objectives or continue to further batches.

## Dispatch and library concern

Dispatched once September 16 after verified B01 commit `4d39795`, marker `B02-B04-AUTH-20260916`. The user reports that the viewed library differs substantially in fidelity/design/layout. This is an unresolved user-reported parity concern, not an accepted replacement or verified diagnosis. Development must document concrete differences with clearly labelled fictional local baseline/target evidence where available; preserve existing usability and fix in-scope regressions. Larger library/hierarchy changes require a bounded follow-up, not silent expansion of B02/B04. Library functional and layout parity must be established before reskin and cannot be deferred to styling. No actual live-data access is authorized by this feedback.
