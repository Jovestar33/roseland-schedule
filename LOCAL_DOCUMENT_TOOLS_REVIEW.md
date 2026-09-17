# B02 — locally accepted document tools checkpoint

Dispatch `B02-B04-AUTH-20260916`, resumed by the user. Baseline `4d39795742fbb07ae811a40b4f69c428ba6d6615`; durable checkout `/Users/johnsammon/.codex/worktrees/roseland-b02/roseland-schedule`, branch `codex/migration-schedule-contract`. This document accompanies the separately tested B02 commit. B04 starts after that commit.

## Result

The authenticated local editor exposes Call Sheet, Contact Sheet/CSV, schedule print/PDF and deterministic fictional location/weather/sun controls. Optional, multiline and nested document fields survive save/reload. Viewer permissions and account/organization isolation apply to controls and print portals. Modal drafts survive local navigation and reauthentication. The existing documents retain their intended content scope; intentional omissions are preserved.

Print verification found and fixed a blank trailing schedule page, nonrepeating table headers and oversized Call Sheet pagination. Final output has repeated schedule headers, complete intended text and no workspace chrome. Print CSS is scoped to the local workspace. New Call Sheet table headers are local-only. Shared CSV escaping/contact identity and whitespace-preserving field fixes also benefit the existing components.

## Acceptance evidence

| Contract | Result |
|---|---|
| Optional/long/multiline/nested data | Editor store tests plus genuine Auth full-document round trips pass. Browser edited all eight Call Sheet fields, nested location and row notes, saved ordinary fixture version 3, reloaded and verified exact stored values including whitespace; `evidence/b02-documents/browser-saved-document.json`. |
| Read-only and tenant isolation | Genuine Auth owner/editor/viewer/outsider tests pass; viewer writes denied and cross-org reads denied. Browser viewer cannot edit Call Sheet or save; can print. Switching to Woodland hides Harbor records/portals. |
| Modal draft retention | Actual production browser draft with leading/trailing spaces and newline survives schedule/lifecycle navigation, expired session, same-account sign-in and return. Screenshot `b02-auth-retained.jpg`. Closing a focused field follows the existing blur/commit behavior; tests explicitly committed edits before save. |
| Weather and location | Fictional autocomplete and zero coordinates, refresh, clear, undo, sun-only and unavailable responses observed. Existing weather retained when unavailable. Strict date/bounds checks covered in unit tests. Browser date-change automatic refresh was not independently demonstrated; source guards are reviewed. No real provider used. |
| CSV | Browser download equals expected bytes after existing time cascade: 32 contacts, 8 columns, formula prefixes neutralized, multiline/Unicode/quoted values covered by tests. `browser-contacts.csv`, SHA-256 `5e636ac785c2d8a5fabbb59708a916fb8ee822b52443e84f07ef7ea79c0d240a`. |
| PDF | Actual Chrome Save as PDF: ordinary 1 page, empty 1, long schedule 5, Call Sheet 3, Contact Sheet 6. Every page rendered and inspected; marker/text checks and no-blank-page checks pass. Final long schedule printed by a genuine viewer on the production build. Files in `output/pdf/`; hashes and page sizes in `artifact-verification.json`. |
| Desktop/phone | Editor and modal screenshots plus paired library comparisons retained in `evidence/b02-documents/screenshots/`. Library comparison used the same tab at DOM-verified 1280×720 and 390×844 viewports; full-page image height can exceed viewport. |
| Request boundary | Fictional baseline proxy rejects legacy mutations, target rejects legacy service/provider paths; captured sanitized request trace has no unexpected blocked calls. Only loopback target Auth/data services used. |

Evidence paths above are relative to `evidence/b02-documents/` unless stated otherwise. Field inventory: [B02_FIELD_INVENTORY.md](./B02_FIELD_INVENTORY.md). Runtime fixture IDs: `runs/2026-09-17T01-43-47-883Z-manifest.json`.

## Regression and internal review

Platform **144/144**, editor **56/56**, database **431 assertions / 13 files**, production build, TypeScript, scoped ESLint and source diff whitespace checks pass. Raw evidence preserves CSV CRLF and build-log carriage returns, which Git reports as whitespace in artifact-only lines. SQL lint reports no schema errors; local security advisor reports no issues; runtime dependency audit reports no high or critical vulnerabilities. Logs retained in `evidence/b02-documents/logs/`. Genuine Auth runtime also verifies the built workspace gate and server-key nondisclosure.

Retained populated local data exposed SQL tests assuming empty schedule tables. Test-only transactional child-table isolation and a fixture-scoped history count fix those assumptions; every test rolls back. No migration/schema/RLS changes. Review checked document/account response invalidation, hidden modal/portal state, viewer mutation paths, contact tuple preservation, CSV formula escaping and print scope. Remaining library differences are documented separately and are not accepted replacement behavior.

A development-only lifecycle busy-state problem was observed under React StrictMode during a temporary `next dev` experiment: cleanup increments the request generation while a request is active, preventing its finally handler from clearing busy. The final production build does not reproduce it, including reauthentication/navigation. It predates these changes and remains a bounded follow-up; the harness uses the production build.

## Limits and recovery

Local acceptance does not establish hosted readiness, complete migration, full browser matrix or library parity. [LIBRARY_PARITY_ISSUE.md](./LIBRARY_PARITY_ISSUE.md) remains open before reskin. No real schedules, hosted configuration, providers, credentials, push, deployment or migration were used or changed. Only fictional local fixtures were written.

The previous temporary checkout was cleared during a user pause. Exact source authoring records restored B02 into this durable checkout; `source-recovery.json` records provenance. Retained local database volumes were restarted without reset. Failed print diagnostics are retained in `evidence/b02-documents/diagnostics/`. Runtime services and volumes are owned by the local test workflow and retained through B04.
