# Local acceptance review — 20 October 2026

Canonical preview: http://127.0.0.1:3532/review

This is local review evidence, not a hosted release or approval to migrate data. The live Netlify app and real schedules were not changed. Visual acceptance remains with the user.

## Changes from this review

- Removed the login tagline. Expired sessions now have one short explanation beneath “Sign in again,” without a competing “Back to sign in” control above the same form. Retained drafts and same-account reauthentication remain intact.
- Successful invitation acceptance no longer marks the completed invitation as unfinished work.
- Added contextual production creation and rename to the library, with Close/Cancel, retained draft protection, actor-bound requests, optimistic versions, and safe retries. Creation inherits organization timezone/locale. Existing RLS remains authoritative; no schema, policy, or service-key exposure changes.
- Time In and Time Out reserve separate space for the value, arrow, and lock. Duration has its own readable width. Phone tables scroll within their container; time controls do not shrink into adjacent controls. Dates and weekdays wrap as a group where necessary.
- Exact-minute times produced by custom durations now remain selected when locked, even when absent from the 15-minute presets.
- Long action labels and organization names wrap, with native select keyboard/picker behavior retained. Suggestion labels, modal headings, buttons, and status text can wrap; form controls remain inside their panels. Print settings stack on phones. Existing More/Less behavior for descriptions and notes remains.

## Fresh browser checks

- Platform administrator sign-in/MFA and organization provisioning: review/back retained the draft, then creation succeeded.
- Organization owner invitation review/back/create, followed by acceptance with the existing fictional member.
- Production creation, rename, and reload persistence.
- Schedule creation, date selection (including weekday), custom duration, multiline descriptions, pointer reordering, save, and reopen.
- Account/settings round trip preserved an unsaved schedule note. Closing offered Keep editing and discard/save routes. A later concurrent-edit conflict correctly retained the attempted save and prevented overwriting the newer version; the temporary stale draft was discarded through the UI.
- 390px phone layout: schedule metadata, horizontally scrolling time controls, library/new-schedule dialog, account navigation, and organization appearance dialog. The appearance form scrolls within its dialog with reachable Cancel and Save controls; no document-wide horizontal overflow in the checked views.
- 1440px desktop layout and editable/locked exact-minute time values, including 10:45 AM and 11:05 AM.
- Viewer: read-only schedule, disabled save, no editable time controls. Editor: editable controls, a test note saved and survived reload, then was restored to blank.

## Native PDF verification

Generated using Chrome’s native Save as PDF and rendered every page for visual inspection:

- `output/pdf/acceptance-review/schedule-compact.pdf`: 2 pages. Readable time columns; full description markers on the notes page; production header appears only on page 1.
- `output/pdf/acceptance-review/contacts.pdf`: 1 page. Complete contact values and multiline details.
- `output/pdf/acceptance-review/callsheet.pdf`: 2 pages. Complete schedule times, supporting details, and final notes.

These files are under `/Users/johnsammon/roseland-schedule`, not this worktree. Screenshots and rendered pages are in that checkout’s `output/migration-catchup/` folder. The in-app browser’s native print dialog required user dismissal; the successful exports were made in Chrome. No physical printer or fresh Safari-native export was tested.

## Validation

- Editor suite: 134 tests passing, including exact-minute options and organization switching.
- Platform suite: 263 tests passing.
- Production build: passing. Existing hook dependency/cleanup warnings remain.
- `git diff --check`: clean.

## Fictional data and cleanup

All database writes were confined to the local API at `127.0.0.1:56521` / database port `56522`:

- Organization: Acceptance Studio — Fictional (`0f5c1fb6-71ee-46e0-b378-48117008bd93`).
- Production: Town Stories — Acceptance (`1dc2b6dc-18a8-42a3-9683-14b9a468fd7f`).
- Schedule: Acceptance Day — Oct 22 (`aa210b74-57b6-4c16-8848-9cd342929953`).
- Existing fictional administrator/member accounts were used; no real people were invited or emailed.
- One empty production, Permission diagnostic — fictional, remains from diagnosing insert-return RLS behavior.
- The explicitly approved temporary Viewer, then Editor membership was removed after testing. A database check confirmed zero matching production memberships remained. The accepted organization membership remains as part of the provisioning fixture.
- Schedule save/version/audit metadata advanced during the authorized tests. Test note and timing edits were restored/discarded; no production schedule data was changed.

## Boundaries

This is a representative workflow and regression review, not certification of every role combination, recovery failure, or future arbitrary-length value. Long single-line editable text retains native caret scrolling; long supporting prose retains its explicit More/Less control. Large tables intentionally scroll horizontally on small screens. Platform billing/service and exceptional recovery work remain separate release-readiness items. No push, deployment, hosted migration, or cutover was performed.
