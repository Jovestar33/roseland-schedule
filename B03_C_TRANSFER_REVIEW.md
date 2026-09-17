# B03 C — Move, requested transfer and Duplicate opening

Local implementation checkpoint; no deployment or whole-app acceptance. Prior local commits: A b8a82f1, B e797a77.

Direct Move requires effective source and destination organizing/transfer authority. Source-only Organizers can request a destination using only its necessary name/ID. Eligible receiving Organizers review the whole current saved document, with no pre-acceptance source history or membership grant. Policy/version changes require renewed review. Cancellation, decline, seven-day expiry and role loss withdraw new preview access.

Move retains schedule ID and immutable historical bytes/provenance, moves explicit restrictions atomically and applies destination bounds. Destination-authorized readers gain full history; source-only readers lose current/history/old-reference access. Current production/phase labels follow destination. Restoring a pre-Move version retains current placement and canonical labels. No date, location, rows or day-number mutation is inferred.

Duplicate uses a new identity and creator-bound exact receipt, retains explicit rules, applies destination labels and leaves source/history unchanged. Confirmed copies open only in the original active account/navigation/document context, after exact durable readback of the latest source draft and undo history. Storage failures, pending saves or navigation changes defer opening. A recovery action reads the account-scoped retained draft only after fresh edit authorization; saving still checks its original server version. Captured copy intent remains immutable across retries.

Verified: 167 platform tests, 431 database assertions, 102 genuine fictional Auth/API checks, types/build and database lint. Coverage includes competing Moves (one success/version), stale reviews, source/destination readership, history provenance, policy retention, cancellation/decline/expiry/role loss, exact copy/Move retry and storage-failure deferral. Browser checks confirmed cross-production Duplicate of an unsaved draft, automatic copy opening, source draft recovery, unchanged saved source and a populated-schedule Move.

Evidence: evidence/b03-c-transfers/. Full-document review layout was adjusted after browser inspection; final equal desktop/phone screenshots and receiving-account acceptance are part of D. Clean replay and integrated acceptance are in progress. The independent 45-group whole-app parity ledger is not completed by B03.
