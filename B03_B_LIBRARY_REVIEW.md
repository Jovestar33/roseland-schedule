# B03 B — Unassigned and compact library

Local implementation checkpoint; full B03 remains incomplete until C and D. A is committed as b8a82f1. No push, hosted configuration, actual schedules or providers were changed.

Schedules can now be Unassigned within a production, with optional phase independent of the day. New/assign/clear use reviewed identities and versions, active existing parents and effective Organizer permissions. Assignment changes placement only: no manufactured day/date or document changes. Versions, audit, Trash/recovery and Editor document saves/restoration work with nullable day placement.

The familiar production/phase library includes a direct Unassigned section, metadata-only complete paged search, production/date/status filters, sorting, recent authorized records and within-section drag ordering. Ordering atomically verifies the full visible group and all saved versions. Pending operations and editor drafts remain guarded; loaded library data and reviews are bound to account and organization. Phone rows wrap their metadata below the name.

Verification: 161 platform tests, 431 database assertions and 68 genuine local Auth/API checks pass. TypeScript/build and database lint pass. Browser checks used the same fictional 213-record inventory on desktop (1280×720) and phone (390×844): search finds the record beyond two full API pages. Browser creation, assignment and clearing produced versions 1–3 with identical document bytes and no date. Evidence is in evidence/b03-b-library/.

Limits: C direct/requested Move, cross-production Duplicate opening and durable draft recovery are still pending. D clean replay, combined concurrency/security and wider desktop/mobile acceptance remain pending. This is not a whole-app parity acceptance; the separate 45-group live parity ledger remains untested.
