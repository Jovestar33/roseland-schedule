# B15 review entry correction

The user reported: “i dont understand what I am looking at”. The coordinator observed the 3485 rehearsal wrapper, technical instructions and controls above a library showing zero schedules/loading and disabled creation. That was not an acceptable review starting point. This correction supersedes the earlier review-ready handoff; it does not constitute user functional approval or start the reskin.

## Diagnosis

The original 3485 service and five g2 services were healthy. The retained Organizer tab available to Devtest showed the five existing schedules, its original saved document and no unfinished work. The coordinator's reported empty state was not treated as missing seed data, and the user's original tab was neither navigated nor reloaded. No reset or reseed was performed.

A deterministic component regression reproduced a readiness race in `LocalScheduleLibrary`: a read starts under `run(load)`; access readiness turns off and invalidates its ticket; readiness returns before that read completes, but the replacement `run(load)` is skipped because `busyRef` still belongs to the old request. The old result is discarded; clearing busy does not rerun the access effect. The library then stays empty with a misleading loading message. This reproduces the reported symptom; no request trace from the coordinator's exact transient state was available to prove its timing.

Reads now have independent loading/error state and request tickets, so resumed readiness starts its own read without waiting behind the obsolete request. Stale results cannot populate the current scope. A failed load ends loading and shows an error with Refresh library as the recovery action. Creation is unavailable until a current inventory/destination read completes. Authorization and API contracts are unchanged.

## Usable entry

The new `/review` route renders the **same** workspace, scoped library, schedule controller, store, header/grid, save/recovery, permission checks, and document tools. It uses the existing Roseland header and styling. It is not a substitute editor or a reskin.

- Technical rehearsal instructions are absent from the ordinary review path. Account/settings controls are collapsed; required account/MFA steps remain visible when admission is pending. Existing lifecycle/read-only warnings remain mounted and visible.
- The library and selected editor occupy separate views. Library, Templates, Snapshots and Backup/Import remain available. Tools retain their existing state and permissions.
- Save, Close, Undo/Redo and Share sit together. Opening a schedule scrolls to its editor so the example rows are visible immediately. Close/Library preserve the existing unsaved-change confirmation and return keyboard focus to Library.
- Review navigation retains `/review` and tracks the selected schedule in the URL. Close returns to a library URL; reopening updates it. Back to schedules from account/settings returns to the schedule screen.
- Successful new-schedule creation now offers an explicit Open created schedule action, using the existing guarded open path.
- Legacy CMS loading is skipped for `/review`, as it is for the original local workspace. The server retains the independent loopback/configuration gate and ordinary authenticated admission. No shared-password sign-in, fake browser auth or permission bypass is introduced.

## Fictional example and verification

The existing fictional Organizer signed in through the normal UI on the new port. The existing production/library loaded and New schedule was enabled. Through **New schedule → Review creation → Confirm reviewed action → Open created schedule**, the agent added only `Example shoot day — fictional` in the existing B14 production. It contains Crew Call at 8:00, Shoot at 8:30, and WRAP at 9:30, totaling 1:45. It was saved, closed and reopened. A subsequent note edit tested dirty Library navigation, Keep editing, Save, Close and reopen; final saved version is 3. Ordinary authenticated API readback confirms three rows and the final note. Existing schedules, review drafts, membership and organization settings were not altered.

Evidence lives in `evidence/b15-entry-fix/`:

- `loading-before.txt` and `loading-after.txt`: both the readiness-race and misleading-loading regressions fail before the fix and pass after. The initial test harness CSS mock error is retained separately, not called an application failure.
- `platform.txt`: 228 passed; `editor.txt`: 67 passed; final focused checks passed; final optimized build and type checks passed. Existing build warnings remain in the logs.
- `example-readback*.json`: original/final connected verification and exact user-facing URL; `editor-final.png` / `library-final.png`: visible functioning editor and library.
- `host-gate-inspection.json`: explicit raw HTTP untrusted Host returned 404 with no workspace/configuration. An initial fetch-based Host override check did not return the expected status; the raw HTTP request verified the actual gate. No bypass was added to satisfy the test.

The exact link was verified again after pinning: the three-row editor opens at saved version 3, Close returns to a populated six-schedule library with New schedule enabled, the URL drops the selected schedule, and reopening restores the correct schedule URL and version. See `pinned-browser-verification.json`. The saved example has intentionally fictional locations; real weather/Places remain outside this local review. The inherited organization/production names and saved organization heading still contain “B14”; these existing fixture settings were preserved. Full hosted/device/output parity and explicit user functional approval remain open.

## Build and handoff

The old B15 snapshot on 3485 and B11 on 3445 remain separate. The corrected review runs on **3487**, with its own pinned application/dependencies and the same retained fictional g2 database. Preserve both old snapshots and all user edits. No hosted changes, deployment, real data, purge, factor recovery or excluded B08 token probe is included.

Coordinator: Roseland Schedule — Voice and Planning. Record this correction against the new build, retain the earlier readiness overstatement as resolved by a new review entry, and collect natural user notes. Do not infer approval from this fix.

Pinned code: `3e9882a`. Build: `Q56HKBDuZItbJULc9MIdH`. Application snapshot: `/private/tmp/roseland-b15-review-app-3e9882a`.

Verified user-facing link: http://127.0.0.1:3487/review?screen=schedule&org=2f75e684-eb3a-4951-9389-2df147812a8a&schedule=28b9e319-47a3-4a88-b1b7-a315adaef9a7

User retest of the confusing review entry is pending; the coordinator owns that final disposition.
