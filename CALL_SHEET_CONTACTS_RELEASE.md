# Call sheets and central Contacts — October 23, 2026

Implemented for the Supabase/Vercel app. No legacy feature expansion.

## Features
- Library Contacts hub: server-side search, production/phase/type/level filters and stable pagination/sorting; shared contact creation/editing/archive; source schedule navigation. Existing row contacts are projected without changing source records.
- Client type, company, crew/cast individual call, makeup, ready, release, pickup and availability fields. Shared identity and day-specific instructions remain separate.
- Complete call sheet with section navigation, reporting and key times, logistics/safety, individual calls, meals, department notes and advance notes.
- Explicit immutable issued snapshots, revised versions, expiring/revocable recipient links, separate email acceptance and receipt confirmation. No email is sent by issuing alone.
- Letter/A4 print pagination, long-row continuation, date/version/page markers, optional private contacts and full descriptions.
- New-app fields preserved during two-way schedule synchronization.

## Validation
- 399 platform tests, 207 editor tests, typecheck, lint and production build passed.
- 46 focused database assertions passed; all 27 database suites passed with the CI postgres/pgtap harness. Initial broader-run errors came from the local harness role/extension setup and were corrected without changing application security checks.
- Native Safari three-page Letter PDF visually inspected, with no clipped text or page collisions. Long-row and A4 layout covered by print tests and review toggle.
- Hosted migrations applied: 20261024010825, 20261024010827, 20261024010830. New tables private with no direct client grants; service-only recipient exchange; user RPCs enforce session and scoped authority. Supabase advisor notes the intentional authenticated SECURITY DEFINER entrypoints and deny-by-default private RLS tables.
- Reviewed structural sync guards for all 63 mapped schedules. Kept each app's Library order/archive state; no baseline/document overwrite. Latest cron read reported all 63 synchronized, including Henderson and Sanford edits.
- No fictional hosted records, issued call sheets, recipient links or real emails created during release checks.

## Review
Canonical review: `artifacts/ui-review-20261020/review.html`, revision `call-sheet-contacts-20261024-pass13`. Existing 127 notes/statuses preserved; four additional review items. Human acceptance remains pending.

Deployment and authenticated hosted verification: pending release completion.
