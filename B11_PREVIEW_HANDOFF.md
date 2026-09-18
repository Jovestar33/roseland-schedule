# Stable fictional hands-on preview

September 18, 2026. Ready after B11 acceptance `19acbce`. This supplements formal B15 review; it is not full parity or reskin approval.

- Open **http://127.0.0.1:3445/local-workspace** on this computer. The delivered in-app browser tab is already signed in as `review-organizer@example.test`, with Organizer access to two fictional productions. Edit, save, organize, create/revoke scoped Client links, and use existing print/output tools. Client links are local to this computer in this preview.
- Code/build snapshot: `/private/tmp/roseland-b11-review-app-19acbce`. It contains accepted commit `19acbce` and its matching `.next` build; shared dependencies are unchanged. Do not rebuild or mutate this directory during B12. No new branding or design implementation.
- Dedicated database/Auth/mail project: `roseland-b11-review-19acbce`, configuration `/private/tmp/roseland-b11-review-stack`, API `56221`, database `56222`, mail sink `56224`, app `3445`. Its volumes and storage are distinct from active tests on `56121` / `3435`. This review stack starts only database, Auth, REST, gateway and mail. No hosted services.
- Private local sign-in/access file (mode 600): `/private/tmp/roseland-b11-review-access.json`. It contains only fictional review access and identifiers, not a hosted credential. Keep passwords out of committed notes. A reload retains the tab's session; ordinary idle/sign-in rules still apply.
- Current launcher PID `48660`, server PID `48673`; fresh process record `/private/tmp/roseland-b11-review-process.json`, log `/private/tmp/b11-review-app.log`. Verify the recorded command/project before any later cleanup; PIDs can be reused.

## Verification and starting state

A real browser sign-in loaded both fictional productions and schedules. Organizer controls for arranging/new schedules are present. Ordinary browser save committed, then the temporary verification Town edit was restored. Mountain Day starts at version 4 and Studio Day at version 2; original/current versions and history are retained. A scoped Client link was created in the review instance. The accepted B11 browser/API tests cover its renderer, revoke, expiry, roles and source restrictions; the dedicated review smoke check confirms local access/save/issuance. No physical PDF comparison is claimed here.

The first review seed used row IDs and 24-hour times inconsistent with the existing saved-document contract. A save exposed this seed defect before handoff. Only the new fictional seed was corrected through genuine versioned Organizer saves; original values remain in `/private/tmp/b11-review-original-seed.json`. The one-time seed script now validates documents before insertion. No application contract was relaxed.

## Lifetime, notes and cleanup

Keep this designated review instance running for the user's review window and throughout B12, preserving all user-created fictional edits. Do not reseed, reset, restore over it, apply B12 migrations to it, or silently switch its build. Record notes against `19acbce`, the schedule name/version and the action. Coordinator groups notes and requests affected retests; no need to wait for review completion before B12.

All B12/test services stop at the B12 acceptance boundary. Only this designated review instance stays running. Its lifetime ends when the user finishes review or requests that it stop; arrange any later candidate update explicitly at a completed-batch handoff. Cleanup: stop the verified review launcher gracefully, then run `supabase stop --workdir /private/tmp/roseland-b11-review-stack` using the project CLI. Do not use `--no-backup`, delete volumes or erase review edits. Keep the private access/fixture records for a later authorized restart. The launcher is `scripts/serve-b11-review.ts`; the one-time seed refuses an existing access file.
