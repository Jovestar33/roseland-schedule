# B03 local implementation and acceptance

Status: A–D complete and verified in the authorized fictional local scope. No push, deployment, hosted configuration change or actual schedule mutation. Whole-app live parity and migration approval remain separate gates.

## Delivered

- A: explicit production Organizer role; optional layered Organization/Production/Schedule restrictions and compact permission Settings; inherited bounds apply to Admins; source-aware copies retain explicit policy.
- B: production-contained Unassigned schedules; optional phase; reviewed assign/clear without fabricated date/day or document changes; compact production/phase/Unassigned library with complete paged search, filters, sorting, recent items, Organizer ordering and recoverable Trash.
- C: direct and requested same-organization Move; minimal destination discovery; restricted whole-document receiving review; optimistic versions/policy review, expiry/cancellation/decline/role-loss checks, atomic retained restrictions, stable identity and full immutable history. Duplicate creates independent identity and opens safely after verified durable source draft/undo retention.
- D: clean replay, combined authorization/concurrency/recovery checks, matched desktop/phone fictional evidence and final navigation/phase review fixes.

## Verification

| Check | Result |
|---|---|
| Platform tests | 167 passed |
| Editor tests | 56 passed |
| Database tests | 435 assertions, 14 files passed |
| Genuine local Auth/API checks | 111 passed |
| TypeScript / production build | Passed |
| Database lint / security advisor | No findings |
| Historical migrations | All 14 pre-B03 migration files byte-identical to accepted B04 |
| Clean replay | All migrations through 20260917080000 applied to a second new unlinked stack |

The fresh stack was `roseland-b03-replay-20260917`, API 55521/DB 55522. Initial development used `roseland-b03-20260917`, API 55421/DB 55422. Both are fictional and unlinked. Raw CLI status and generated fixture credentials were kept outside committed evidence.

Browser verification used equal 1280×720 desktop and 390×844 phone views. The receiving fixture contains 12 rows, long names/descriptions, nested locations, notes, weather and timing fields. Before acceptance it is absent from the receiver's ordinary library and history; the request review displays the whole current document. A genuine source update withdrew the stale preview and disabled approval until renewed review. The receiver approved version 2 into the chosen destination phase as Unassigned. The library then exposed the same identity; a drag reordered its group; History opened correctly and restored version 1 as version 5 while preserving destination labels/placement and all five immutable versions. Saved document content matched the original except required destination labels.

Earlier browser checks created/assigned/cleared an Unassigned record with unchanged document bytes, found a result beyond two full API pages, and duplicated an unsaved source draft across productions. The copy opened at version 1, the source stayed at version 3, and the unsaved source draft was recoverable with its original server baseline. Storage-failure deferral, actor binding and exact retry payloads have focused regression tests.

Final browser fixes: full preview metadata wraps on phones; timing columns remain horizontally scrollable; confirmation identifies phase/copy name/address; existing valid phase follows the legacy chooser rule; a queued History selection waits for initial panel loading instead of being consumed early.

## Evidence and scope

See `evidence/b03-d-acceptance/` for logs, migration checksums, exact browser results and paired screenshots. Earlier section evidence remains in `evidence/b03-a-permissions/`, `evidence/b03-b-library/` and `evidence/b03-c-transfers/`.

Local section commits: A `b8a82f1`, B `e797a77`, C `5d0b879`; D is the commit containing this report. Shared checkout receives documentation/evidence only; its unrelated dirty application source is preserved. Browser test tab closed, viewport reset, temporary Next services stopped and the two owned Supabase stacks stopped with volumes retained. Older recovery volumes were not reset or removed.

This acceptance does not claim all 45 whole-app parity groups passed. Hosted activation, actual schedule migration, deployment, real provider calls, billing, platform privilege expansion, highest-role removal and permanent purge remain outside this batch. No further routine B03 implementation approval is needed; any next batch is a separate brief.
