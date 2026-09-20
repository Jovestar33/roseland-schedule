# Compact notes, printing, and production hub order

Updated September 20, 2026. Deployment is authorized by the user; publication has not occurred.

## Behavior

- Notes and Description show up to three lines, with More/Less in editable and shared schedules. Focusing an editor expands it without altering the saved text.
- An optional Key instruction stays fully visible and prints inline. Shared projections and document import/backup validation preserve it.
- Share > Print / PDF defaults to a compact schedule plus complete supporting notes. Long Notes and Description fields get numbered appendix references, row/time/location labels, clickable PDF links, and page numbers.
- All details inline is available. Both layouts split long content across pages, retain total duration, and show page counts before opening the browser print dialog. Letter and A4 landscape are supported. Export does not depend on screen expansion state.
- Production hubs have up/down controls, with saved order and disabled boundary buttons. Reordering is disabled while filtering or loading. Schedule placement within hubs is unchanged.
- The new app uses Organizer permissions on both moved hubs, active-session checks, version preconditions, and an atomic position swap. Ambiguous failures require a refresh before another move.

## Implementation locations

- Legacy release: `/private/tmp/roseland-legacy-compact-notes`, branch `codex/legacy-compact-notes`, based only on published `62eb261`. It contains no unrelated platform rollout.
- New app: `/private/tmp/roseland-compact-schedule-notes`, branch `codex/compact-schedule-notes`, based on `df803b3` plus compact-text commit `2e1240f`.
- The shared working checkout also retains the corresponding legacy changes. Existing unrelated files there were preserved.

## Validation

- Legacy: nine editor/print/order tests and optimized production build using its own locked dependencies.
- New app: 102 editor tests, four library repository tests, focused final print/backup/order tests, and optimized build/type checking. Existing hook-dependency warnings remain in LocalScheduleClient and LocalScheduleLibrary.
- Database: 21 pgTAP assertions passed in a rollback-only transaction on the local test database, including owner moves, append order, fresh reads, stale-version rejection, Editor/cross-organization/session denials, and key-instruction validation/projection. No hosted migration applied.
- Browser: both real library components moved Gamma above Beta and retained Alpha/Gamma/Beta after reopening, using fictional IO fixtures. Both print entrypoints opened the compact preview. Appendix links remained inside the preview; switching to all-details changed pagination. Temporary routes were removed before release builds.
- Actual Chromium PDF rendering: compact Letter/A4 (two pages), inline Letter (three pages), and an 80-instruction stress case (eight pages). Geometry checks found no overflow or footer collisions. Extracted PDFs retained all 32 supporting note entries and all 80 stress-case instructions; compact PDF destinations point to the correct appendix page. Representative pages were visually inspected.
- PDF samples: `/Users/johnsammon/roseland-schedule/output/pdf/compact-notes-qa/`.

## Deployment remaining

The live legacy destination was confirmed as https://roselandschedule.netlify.app, published commit `62eb261`. Netlify CLI and browser are signed out; a sign-in tab has been left open. GitHub access works.

The new app requires migrations `20260920061526_schedule_key_instruction.sql` and `20260920062506_production_hub_order.sql` before using its new fields/order RPC. Hosted project `roseland-schedule-dev` (`dapvzbzyozlthmhjlekj`) was discoverable, but both attempts to read its migration history timed out. Its prerequisites and current schema must be verified before applying these migrations. This feature does not authorize assuming that the old staging site is the new app's destination or publishing the entire platform as a replacement for legacy.

## Current new-app integration

The user explicitly requested application to the current new app. Only the two feature commits were applied to its current base `1763e75`, preserving newer date formatting, shared recipient-cookie sessions, and professional call/contact sheets. This integration is in `/private/tmp/roseland-current-app-notes`, branch `codex/current-app-notes`. All 117 editor tests and the optimized build passed.

Both feature migrations were applied to the running local new-app database (`roseland-b14-destination-g2`, API port 56521). The transaction verified unchanged count and document checksum for all 155 existing schedules and restored the organization write guard before committing. Hosted Supabase remains unchanged.

The updated new app is now running at http://127.0.0.1:3614/review (build `E6jNBM6_POeSlxj5FNRfH`) from this feature branch, using the existing local database. The previous professional-document review build is preserved. `scripts/serve-current-app-notes.ts` launches this reviewed build; credential values remain in existing private files. The browser confirmed the updated application loads and presents its normal sign-in form.
