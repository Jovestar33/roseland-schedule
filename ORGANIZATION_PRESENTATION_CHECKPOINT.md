# B07 existing organization presentation — local acceptance

Status: the bounded local B07 workflow is accepted on 2026-09-17. The user explicitly selected **Organization Super Admins and Admins** as the only writers of organization-wide labels, theme colors and action styling. Production Organizer template-publishing authority does not extend to these settings. Existing logo configuration remains part of the same organization presentation record.

## Implemented behavior

Private organization-scoped configuration and exact-request receipts are available only through authenticated RPCs. Active organization members can read; only active organization leadership can write. Versions, policy locks, exact actor/request fingerprints and audit events prevent silent concurrent overwrites and duplicate writes after a lost response. Configuration preserves supported actions/order/styles, palette, labels and embedded PNG/JPEG/WebP/SVG logos. Validation rejects arbitrary CSS, unknown fields, external logo URLs, invalid colors and duplicate/reserved action names rather than stripping them.

The existing local workspace has Organization appearance controls using the current modal and styling. Leaders can preview/edit labels, palette, action choices/order/highlights and logos; members see read-only fields. Cancel restores saved presentation. Closing preserves the draft, and returning to another organization restores only that organization's settings and draft. Signing out clears scoped styles and tab-only drafts; captured requests remain recoverable by their original account. Session/account tickets fence asynchronous results and logo reads retain newer form edits.

A stale save retains the draft and displays the current saved configuration for review. The user explicitly chooses whether to load it or retain their draft against its version before saving again. Interrupted saves use exact retained payloads. Recovery records now have separate keys per request so two tabs cannot overwrite each other's retained data; this also hardens B06 template recovery and reads the earlier single-record format safely.

Editor labels, action styles and embedded branding agree with read-only and local schedule-print presentation; the call-sheet print logo also uses the current configuration. Renaming/removing an action choice leaves existing schedule values visible and unchanged. Clearing or changing organizations clears old palette/style overrides, and an outstanding legacy configuration load cannot overwrite the scoped configuration. No reskin or future product module was introduced.

## Verification and evidence

- 32 genuine Auth/API checks pass on each of two isolated local stacks, including leadership/Organizer/Editor/Viewer/foreign/suspended/anonymous cases, complete configuration round trip, exact retry, stale versions, invalid payloads and simultaneous writers.
- 453 database assertions in 16 files, 189 platform tests and 62 editor tests pass. TypeScript and production build pass; one pre-existing LocalScheduleLibrary effect-cleanup warning remains. Database lint has no schema errors and security advisors report no issues.
- All 28 migrations committed before B07 remain byte-identical. Three forward migrations were applied, including fixes for a reproduced JSON-operator precedence error and validator lint findings. Database test setup was updated for the new foreign keys within its existing rollback-only transaction.
- Browser evidence covers live preview/cancel, embedded logo, lost-response recovery after reload, concurrent-settings review, organization isolation/draft retention, read-only controls, unchanged existing action values, sign-out style clearing and desktop/phone layout. The final build repeats journal-backed lost-response recovery successfully.
- The 390×844 viewport shows a 350px dialog with a visible Close control; Close/Escape return focus to the opener. Viewport overrides were reset and test accounts signed out.
- Print projection DOM has matching labels, subtitle and logo. No new physical print, PDF rendering or physical touch-device acceptance is claimed.
- Both fictional source schedules remain version 1 with exact original documents. No actual schedule, hosted service, deployment, push, subscription or real migration was changed.

Logs, screenshots, sanitized loopback request trace and machine-readable results are in `evidence/organization-presentation/`. The trace retains earlier B06 setup requests to keep chronological evidence intact; the committed B06 trace remains its original checkpoint. Synthetic credentials remain only in a private temporary fixture file.

The wider 45-group legacy-parity gate and deployment/migration acceptance remain open. This checkpoint completes only B07's existing local organization configuration/branding slice.
