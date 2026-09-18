# B05 focused finish review

September 17, 2026 local time. Isolated fictional data only. No hosted migrations, actual schedules, actual accounts, mail, push or deployment. B08 remains paused with its original failures preserved.

## Changes and findings

- One fresh local stack (`roseland-b05-finish-20260917`, API 57521/database 57522) used the ordinary established signup, password login and getUser verification unchanged. No authentication enforcement was weakened. Previous intermittent 504/session failures are retained. There were 68 running local containers before cleanup; contention is plausible, not a proven root cause.
- A demonstrated trusted-import failure was fixed with a forward migration using the standard CLI. The invoker-only private importer still requires the PostgreSQL session user and remains revoked from all client roles; it now takes the same organization policy lock without requiring an application-user session. Public authentication checks are unchanged.
- Runtime fixture corrections deliberately publish the cross-production template and use a specific Editor restriction where that Editor has no source-production role. Assertions now require explicit server denial codes, never transport errors.
- Automatic capture continues while the snapshot panel is open and preserves the selected preview and unfinished labels/settings.
- The snapshot preview now includes contacts, booking/done status and full call-sheet notes in addition to the existing complete read view.
- The parent restore response uses a shared, tested exact context guard before and after its read. Different actor, organization, schedule, document session, version, edit revision or navigation prevents replacement of newer work.

## Verified checks

- 48 real-session runtime assertions: effective role/isolation denials; capture leaves source and saved history unchanged; exact receipts/retries; default retention and exemptions; naming/expiry ordering; Trash authority; explicit disposable purge and retries; content identity/placement and stale-version conflicts; Save As New authority and restrictions; 137 imported originals with unchanged IDs/order/labels/timestamps/payload; no resurrection after purge; retained catalogue; unsaved/inherited template restrictions.
- 489 pgTAP assertions across 18 files pass.
- 205 platform and 62 editor tests pass, including interrupted capture/settings receipt recovery and newer-edit restoration guards.
- TypeScript and final production build pass. Existing LocalScheduleLibrary hook warning remains.
- Standard SQL lint: no errors; one nonblocking unused `restored` variable warning. Security advisor: no issues found.
- All previous failed logs remain failed, alongside the passing final evidence.

## Authenticated browser walkthrough

Chrome desktop and 390 by 844 viewport, fictional owner only; runtime checks cover other roles.

- Opened source version 2, edited town, captured named snapshot. Inventory grew 139 to 140 with imported records beyond 25. Source stayed version 2 and dirty.
- Reloaded the rebuilt app and signed in normally. Full preview shows multiline descriptions/notes, nested locations, contacts, row status and all call-sheet fields.
- Changed town again and reviewed restore: dialog names snapshot/id/version and explicitly retains current draft/undo. Restore produced saved version 3 with the same source name/production/day and snapshot town. Recover retained source draft brought back the prior unsaved town at original version 2; it cannot silently overwrite saved version 3.
- Save As New into Fictional Copy Destination confirmed a new copy and left the source draft unchanged.
- Named snapshot moved to Trash and restored successfully. Purge warning showed selected id/version and irreversible meaning, then was cancelled. Disposable purge itself is covered by the runtime suite.
- Phone viewport: readable controls, modal inside viewport, document width 390 with viewport 390. Tab reaches the next action with visible focus. Escape closes the modal. Viewport reset to normal.
- Reloaded current saved version 3 and edited town to `Fictional timed automatic capture`; real five-minute capture passed at approximately 23:38 EDT. Count increased 140 to 141, automatic preview contains the exact dirty town, source remains version 3 and unsaved, and the selected snapshot label edit was preserved. No fake clock or browser-state mutation used.

## Scope and resource cleanup

During final verification only five demonstrated B05 dependencies were running: database, Auth, REST, gateway and local mail sink. After completion, the owned browser tab/web server and final B05 stack were stopped with data preserved. Old B05, all three B08 stacks, both template stacks and B03 replay stopped through the standard CLI with volumes preserved. Unneeded fresh-stack storage, metadata and analytics containers stopped without removal. No prune, volume deletion, Docker-wide shutdown or unrelated workload stop.

This is focused local acceptance, not hosted/release acceptance. Forced late network delivery is covered by shared guard/recovery tests rather than a separate browser fault-injection matrix. No provider-concurrency/security investigation was resumed. Follow the standing proportional validation guidance in the shared APPROVED_FOLLOW_ON_DECISIONS.md.
