# Controlled save and navigation browser journeys

Continuation from `ac6fedb`, isolated in `/private/tmp/roseland-b15-runtime-parity`. Frozen preview3512 is preserved. All mutations below target newly inserted disposable schedules in the already disposable North organization; existing account roles and memberships are unchanged. The candidate-only loopback proxy forwards genuine authenticated requests and injects only allowlisted response failures/delays. It logs request identities, versions and document hashes, never credentials or document payloads.

## Save outcomes

| Case | Direct browser result | Authenticated saved result |
|---|---|---|
| Held acknowledgement | Original attempt A is sent once. Newer edit B remains editable and Unsaved. Settings can be visited and left while the response is pending. Returning after release retains B and permits a later deliberate Save. | Version 2 contains A; deliberate subsequent save makes version 3 contain B. |
| Response lost after commit | Save and exact retry remain disabled until Check saved result. Closing warns that the save may already have completed; Keep editing retains the draft. Checking confirms the committed version without replacing newer edit B. | Version 2 contains A; the recovery check adds no version. |
| Lost acknowledgement followed by another session's save | A second genuine browser session reads the committed version and saves D. The original tab's check identifies its own attempted version 4 and current version 5, keeps local edit E Unsaved, and blocks Save/retry. Reload cancellation keeps E; explicit reload adopts D. | Version 5 contains D. The older tab never overwrites it. |
| Request interrupted before forwarding | Check saved result reports the original baseline still current. Retry exact save sends the identical document hash and original expected version, despite newer edit B in the browser. | Version 2 contains A, not B. B remains Unsaved until its later deliberate Save makes version 3. |
| Browser Back during a held save | Current schedule address remains visible, Close/Save/switch stay disabled, and the user is told to finish the current operation. Releasing the acknowledgement preserves the newer Unsaved draft. | The attempt commits once; the newer draft is saved only by a subsequent explicit action. |

Evidence lives in `evidence/b15-runtime/cases/`: network trace, named DOM/accessibility captures, screenshots and readbacks after held/lost/retry/final cases. The response-loss cases are controlled transport fixtures with actual database commits and genuine sessions; they do not claim a physical network outage or hosted-browser acceptance.

## Defects found and corrected

Browser Back previously changed the address to Library while leaving the editor open, including with a clean schedule. Same-organization history changes now enter the existing editor open/close and discard guards. The address stays bound to the displayed draft until the action succeeds; accepted history navigation replaces the history entry so Forward remains available. Busy navigation is refused without discarding the pending attempt. Cancellation leaves the original address and note; confirmation returns to Library, and Forward restores saved content rather than discarded edits.

A second controlled reproduction held both overlapping organization-scope reads at Library, opened/edited a schedule, then released the older responses. They restored the older Library address while leaving the newer draft visible. Editor selection and guarded history navigation now invalidate older navigation tickets. The same two-response test preserves the current schedule address, exact newer note and Unsaved state. `scope-race-before-fix.json` and `scope-race-final.json` record the matched case.

The busy-navigation notice is also cleared when the operation finishes, so completed work does not leave a stale instruction to wait. Final production verification of that small feedback refinement is recorded in the consolidated continuation report.

Four focused tests exercise actual workspace callbacks with delayed read IO: stale scope completion, Back-to-Library request, busy Back refusal, and Forward history handling. They supplement the browser discard/recovery journeys. The 100 editor tests pass after the routing correction; final build/type/checkpoint identity belongs in the consolidated continuation report.

## Test-tool incident and limits

The first authenticated readback script used default sign-out scope and ended the disposable member's other sessions. The browser showed the expired-session recovery panel and resumed its existing schedule after signing in again. The helper was corrected to `scope: 'local'` before subsequent readbacks. No retained review account, schedule or membership was changed. This incident is not presented as an intentional session-expiry acceptance test.

Some browser DOM-evaluation calls timed out after dialog transitions; documented accessibility controls and actual visible values were used to finish verification. No browser-control bypass or approval workaround was used.

The existing B11 legacy-alias token expired at 06:55:50 UTC on September 19. A valid alias open/reload check cannot use it now without issuing new access material, which this continuation excludes. No new token, secret, alias or grant was created. New Client-link refresh retains its prior evidence; valid legacy-alias runtime coverage remains open with this precise prerequisite.
