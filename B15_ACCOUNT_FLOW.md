# C08 single-task account presentation — September 19, 2026

Bounded user-authorized correction following C08. Implementation stops at this checkpoint for independent review and the planned fresh-task handoff. This is not whole-app acceptance.

## Exact candidate

- Checkout: `/private/tmp/roseland-b15-account-flow`
- Branch: `codex/b15-account-flow`, based on `fe2aec884265e5a29faae635d105570782bbf2b2`.
- Review: `http://127.0.0.1:3500/review`
- Final build: `fynQxJ5cKu45f9IpMwuK7`.
- Runtime manifest: `/private/tmp/roseland-b15-account-flow-process.json`.
- Evidence: `evidence/b15-account-flow/`; changed application hashes in `build-identity.json`.
- Existing private fictional access file: `/private/tmp/roseland-b15-review-access.json`; no credentials copied into evidence.

Authority: C08 in `/Users/johnsammon/roseland-schedule/COORDINATOR_PARITY_REVIEW.md`, `/Users/johnsammon/roseland-schedule/PARITY_PLUS_ACCEPTANCE.md`, and `/Users/johnsammon/roseland-schedule/DEVTEST_FRESH_TASK_HANDOFF.md`.

## Implemented behavior

On the product route, invitation setup and password recovery replace the visible sign-in task instead of stacking under it. Sign-in remains mounted but hidden during those tasks; its controlled values are not reset. Child task visibility is synchronized before paint, avoiding an intermediate stacked frame. Each task has a focused heading, consistent field width, primary action and Back to sign in. Return restores focus to the corresponding entry and preserves existing account-form values. Invitation requirements and truthful fictional notices remain intact; expanded notices use ordinary document scrolling.

When reauthentication is needed, the organization bar, account-settings navigation and retained workspace panels are hidden. Retained panels remain mounted. The repeated idle-expiry message is suppressed in the account child, leaving one useful parent explanation. Authentication errors remain visible. Callback presentation also hides competing sign-in/workspace content. Callback Close preserves its original operation and restores entry focus after its busy state ends.

No invitation/authentication/session policy, callback verification, credential update, mail route, account creation, membership or draft/request persistence semantics were changed. Signed-in account settings retain their existing controls. Busy controls remain disabled and give visible Signing in/Sending labels.

## Complete rendered-flow checks

| Flow | Observed result |
|---|---|
| Sign in → invitation setup | Exactly one visible form; heading receives keyboard focus. Required Email/Invitation ID, fictional notices, unchecked acceptance and disabled submit remain. Entire default form and return fit desktop1280×720 and phone390×844. |
| Expanded invitation notices | Both notices readable; phone uses vertical scrolling and return remains reachable. No horizontal overflow. |
| Invitation → Back → reopen | Focus returns to Have an invitation?; unsent invitation value survives. Parent sign-in email also survives task changes. |
| Sign in → recovery → Back | Exactly one visible form; heading focus, primary action and return work at both sizes. Keyboard return has a visible outline on Forgot password?. |
| Error result and return | Actual uncertain recovery response stays readable above the active task and return remains available. See the incident below; this response was not an authorized planned submission test. |
| Synthetic callback → Close | Fresh tab with a fabricated, unverified token shows only callback controls. No Verify click or password entry. Close returns to sign-in and focuses Forgot password? on the final build. |
| Ordinary sign-in | Existing fictional credentials reach the library. No schedule was opened or edited in this check. |

Final-build captures: `invitation-desktop.png`, `invitation-expanded-desktop.png`, `recovery-desktop.png`, `sign-in-phone.png`, `invitation-phone.png`, `invitation-expanded-phone.png`, `recovery-phone.png`, `phone-return.json`, `callback-close-final.txt`. Ordinary sign-in (`ordinary-login-before-expiry-guard.txt`) was verified before the final stale-policy expiry guard; its authentication path is unchanged. Retained-input and actual-error screenshots were captured during this same C08 pass before the last focus-only adjustment; they are supporting behavior evidence, not falsely labeled final-build captures.

## Validation and limits

Optimized build/type-check passed. Seven focused account/session/setup tests plus seven presentation/organization tests pass. Four new tests render actual component branches with named hook-state fixtures: expired UI has one sign-in form and no workspace navigation; retained draft panels remain mounted; a subtask hides sign-in without clearing its password/route state; invitation error/loading controls preserve requirements; expired child notice is suppressed while callback errors remain visible. Effects and IO are excluded from those tests. Existing two hook warnings remain; diff whitespace check passes.

**Live expiry/reauthentication limitation:** no real one-hour idle expiry was induced and no account deadline or token state was modified. The expired-state/draft-mount evidence is rendered component testing, not an end-to-end expired-session browser pass. Account-policy/MFA variants, real recovery delivery and credential completion are not newly certified. Physical device behavior remains distinct from viewport emulation. Independent coordinator review must retain these distinctions.

## Unexpected request during validation

An attempted required-field validation check used an empty-fill action that did not clear the retained fictional email as expected. Clicking Send email therefore submitted one recovery request to the synthetic nonexistent example.test address. The server returned503 with uncertain-outcome copy. All further mail submission checks stopped immediately. A recipient-scoped read of the local Mailpit sink found zero matching messages; message bodies were not read. No password changed, no account was created, and no invitation was submitted. This is recorded candidly in `mail-check-incident.json`; it must not be summarized as "no request sent." No successful-delivery or native-validation result is claimed from that attempt.

## Handoff boundary

All previous candidates, including user3487 and frozen3498/3496/3494, remain unchanged. Only this isolated3500 candidate was rebuilt. No actual schedule changes, hosted operations, migrations or membership changes. Temporary phone override was reset; temporary login/callback tabs were closed. Final review entry remains available. Known Client-link refresh and broader parity gaps remain as recorded in earlier reports. The coordinator should independently inspect the full rendered C08 flows, verify this commit/build, then update its sole-owner fresh-task handoff. No additional batch starts here.
