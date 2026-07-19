# Regression Matrix

Status: Phase 0 preservation contract. P0 failures block pilot/cutover; P1 failures require explicit acceptance and a dated fix.

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
| Templates/CMS | P1 | load/save/delete/replace templates; legacy local template decision; theme/action styles; unauthorized CMS write denied |
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

Each run records build/commit, environment, database migration version, fixture/import manifest, browser/device, tester, result, evidence link, defect, severity, and approver. Baseline screenshots/PDFs are evidence, not pixel-perfect requirements where browser rendering legitimately differs.

## Do-not-break list

The migration must preserve the time cascade and fixed anchors, drag/drop, undo/redo, weather/sun data, zero-duration rows, library operations, optimistic save conflicts, snapshots, templates, mobile/iPad editing, print/PDF, public/read-only modes, Google Places locations and sub-locations, row contacts/Contact Sheet/CSV, Call Sheet foundation, and legacy link resolution.

