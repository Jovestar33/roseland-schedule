# C09 organization and MFA access recovery — September 19, 2026

Bounded implementation checkpoint for independent coordinator review. B15 acceptance remains open; this is not a parity certification or authorization for another batch.

## Candidate and authority

- Checkout: `/Users/johnsammon/.codex/worktrees/ea34/roseland-schedule`
- Branch: `codex/b15-access-recovery`; verified clean starting HEAD `3470509f4bbc3c3fd2afda757be2dc31831b288d`.
- Review: `http://127.0.0.1:3506/review`.
- Build: `MHUgjmypvtTEGaJZIcLt-`.
- Launcher: `scripts/serve-b15-access-recovery-review.ts`.
- Runtime manifest: `/private/tmp/roseland-b15-access-recovery-process.json`.
- Evidence: `evidence/b15-access-recovery/`, including source hashes in `build-identity.json`.
- Private fictional access: `/private/tmp/roseland-b15-review-access.json`. Values are not included here or in evidence.

Authority is C09 in the shared coordinator report, the fresh-task handoff, and Parity Plus acceptance at `/Users/johnsammon/roseland-schedule/`. Earlier C06/C07/C08 and weather/footer corrections are preserved. The previous implementation task was not restarted or delegated to.

## Diagnosis

Ordinary approved sign-in on the frozen3504 candidate reached the populated library. Its local Auth and REST health endpoints both returned200; normal organization and MFA reads succeeded. The user's original screenshot does not identify its runtime or failed responses, so its historical service cause remains unknown. There was no evidence justifying a shared service restart.

To reproduce safely, copied the frozen build into `/private/tmp/c09-before` and served it on3510. A separate loopback proxy3507 injected503 responses only for organization-directory/MFA reads used by this task's3510 and3508 runtimes. Shared56521 services, their retained volumes, and all original previews stayed running. After correcting an initial test-proxy CORS header omission, the copied baseline reproduced the reported duplicate directory errors, disabled organization retry, password reset, disabled two-step button, misleading authenticator heading, second retry and repeated retained-work/internal-batch copy. This is controlled reproduction, not proof of the screenshot's original cause. Baseline screenshots identify the copied `N58VrGih-TndBPa3zM7OO` build.

Source cause: directory and MFA failures were rendered independently; the MFA component retained its `checking` state on failure, while the generic non-ready branch called that an authenticator challenge. Background check failure also left the previous ready flag intact. The product wrapper exposed adjacent account-maintenance controls during these non-ready states.

## Correction

- One bounded access-recovery task replaces those competing surfaces. It has a clear checking/unavailable title, concise explanation, one retained-work assurance, and one primary retry that repeats both directory/scope and MFA reads.
- Known organization identity stays visible. Account navigation stays in place but is disabled while access is unresolved. A smaller brand header applies only to access recovery/challenge; ordinary library/editor geometry is unchanged.
- MFA has an explicit unavailable state. Failed checks revoke UI readiness; no code/setup task appears until successful reads establish the requirement. Existing server/Auth/role/MFA policy and challenge/enrollment operations are unchanged.
- Recovery hides retained panels and disables their access context without unmounting or discarding them. Success reuses the existing scope and draft flow; it never automatically retries a saved mutation.
- Password maintenance is visible in account settings or its proper entry task. Account-policy checks remain available independently. Existing C08 callback/invitation behavior remains mounted.
- Keyboard entry focuses the recovery heading; Retry keeps focus there while disabled/loading; recovery restores focus to account navigation. Actual challenge and expired-session headings receive focus, and Tab reaches their input/action. Successful checks clear only stale unavailable copy.
- Lost-authenticator help is contextual and truthful. It does not imply an implemented reset or expose internal batch terminology.

## Validation

Final optimized build and type check passed. **92 editor tests**, including the new C09 effect/presentation cases, pass. **7 account/session/setup tests** pass. The focused subset has **14 passing tests**: fail-closed initial/background errors, repeated failure, late-response fences, required enrollment versus challenge, expiry, stale-message cleanup, retained panels and account-maintenance visibility. Two inherited unrelated hook warnings remain in LocalScheduleClient/LocalScheduleLibrary. No new database migration, policy/grant change or security feature was introduced.

Rendered checks use normal authorized sign-in. Controlled failures/expiry affect only the task's test connection:

| State | Evidence and outcome |
|---|---|
| Baseline failure | Matched1280×720 and390×844 captures reproduce C09 on the copied starting build. |
| Initial and repeated unavailable | Final desktop/phone panel has one message/assurance/retry; no password reset or false challenge; no horizontal overflow. |
| Loading/retry | Delayed read responses show one disabled Checking action; keyboard focus remains on the heading. Desktop/phone captures include the full action. |
| Known-organization failure | Organization name remains visible while editor content is hidden and inaccessible. |
| Retained draft and recovery | Unsaved fictional note remains mounted and hidden during failed checks, survives controlled401 and ordinary same-account reauthentication, and returns unchanged. Original local note restored without Save. The complete controlled401 journey preceded the final focus/stale-copy/maintenance-only refinement; final-build MFA-only failure/retry separately reconfirms the note remains mounted, hidden, and restored unchanged. |
| Challenge presentation | Successful controlled read fixtures establish a required verified-factor state, showing one code task with focused heading and reachable code field; unavailable copy is absent. Subsequent failed checks remove the code task. No code was submitted and no factor was created or changed. This is rendered fixture evidence, not a new genuine-AAL2 verification claim. |
| Expired-session presentation | Controlled401 invokes existing reauthentication behavior with one sign-in task and no organization/MFA controls. Final heading focus is checked. Full DOM evidence is credential-redacted; screenshot crops exclude credential fields. This is not a one-hour idle-expiry test or actual token revocation. |
| Ordinary direct-service preview | Final3506 normal sign-in reaches the15-schedule library; Account & settings retains Reset password and Two-step verification; Back returns to the library. No account-maintenance form was submitted. |
| Saved data | Authenticated before/after hashes and document versions of all15 existing fictional schedules match exactly. No schedule save, account creation, password change, policy acceptance, mail submission or membership change was performed. |

The original B09 genuine enrollment/verification and server-denial evidence is reused within its historical limits; no fresh B09 security sweep or excluded B08 probes were run. C08's unintended mail-request incident remains candidly documented in its original report; this pass submitted no account/email forms other than ordinary sign-in.

## Remaining gaps and stop

Coordinator independent review of this candidate is pending. Original screenshot runtime/service failure cause is unproven. Genuine leadership/multi-organization journeys, fresh authenticator enrollment/verification, actual idle-hour expiry, physical-device behavior, native PDF/print, hosted prerequisites and complete legacy-control placement/behavior parity remain open. Existing Client-link Reload regression is unchanged and unresolved. Existing saved-fixture differences can still make an ordinary fixture open Unsaved; this pass does not reinterpret that as C09 or claim all fixtures are clean.

Ledger totals remain36 Partial,1 local Fail,2 Not executed,6 Blocked and0 fully passing groups. Footer removal is preserved; source license notices remain intact. No design redux/reskin, hosted configuration/write, deployment/push, migration/export, purge, new tunnel or automation was performed. Implementation stops at this local commit for independent review; no automatic next batch.

Cleanup: task-owned test runtimes3508/3510 and proxy3507 stopped after verification; copied baseline and temporary scripts remain for traceability. Stable3506 remains running. Task-created test tabs were closed, viewport override reset, and the stable review tab retained. All original3480–3504 previews and retained fixtures were preserved.
