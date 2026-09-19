# C07 sign-in hierarchy checkpoint — September 19, 2026

Small separately committed follow-up authorized by the user through the coordinator. Sole implementation owner stops at this checkpoint for the planned fresh-task boundary.

- Checkout: `/private/tmp/roseland-b15-sign-in-hierarchy`
- Branch: `codex/b15-sign-in-hierarchy`; base `30fd24a76f4427d6782bc165ef7a7a8b6e8b3e73`.
- Candidate: `http://127.0.0.1:3498/review`
- Build: `bxnWmdCK5H4Fwj5yxlPCl`.
- Runtime manifest: `/private/tmp/roseland-b15-sign-in-process.json`.
- Evidence: `evidence/b15-sign-in-hierarchy/`, including exact changed-source hashes and build/test logs.
- Private ordinary fictional access file remains `/private/tmp/roseland-b15-review-access.json`; no credentials are copied into evidence.

Authority: C07 in `/Users/johnsammon/roseland-schedule/COORDINATOR_PARITY_REVIEW.md`, `/Users/johnsammon/roseland-schedule/PARITY_PLUS_ACCEPTANCE.md`, and `/Users/johnsammon/roseland-schedule/DEVTEST_FRESH_TASK_HANDOFF.md`.

## Change

The product sign-in screen has a clearly emphasized primary Sign in button. Forgot password? and Have an invitation? are quiet underlined secondary actions with usable targets, visible keyboard focus and expanded state. They remain semantic buttons because they reveal existing local forms without navigation. Their wording no longer suggests open registration.

Both forms offer Back to sign in, which closes the disclosure and restores focus to its entry. Existing form values are retained. Invitation ID and acceptance requirements, request handlers, callback handling, session behavior and routing are unchanged. Signed-in Reset password remains a settings action; no account-creation entry is rendered for signed-in product users. Rehearsal-route labels remain unchanged.

The first visual check caught an unavailable signed-out color token; explicit existing-palette fallback colors fixed it before the final build. Screenshots and identity refer to the corrected build.

## Verification

- Desktop1280×720 and phone390×844 show one strong primary action with quiet secondary actions. No narrow-page overflow. `sign-in-desktop.png`, `sign-in-phone.png`.
- Tab focuses Forgot password? with a solid2px outline; Enter opens Request password recovery. Keyboard return restores the same visible focus. `keyboard-focus-desktop.png`, `keyboard-focus-phone.png`, `phone-keyboard-result.json`.
- Have an invitation? opens the existing invited-account form with required Invitation ID and disabled submission until the existing requirements are met. Back restores its trigger focus; reopening preserves the unsent invitation entry.
- The sign-in email remains visibly present across recovery open/return. `sign-in-input-retained.png`. The browser DOM evaluator did not expose this live email value reliably, so the captured rendered result is the evidence.
- Both secondary forms and return controls were exercised at both viewport sizes. No emails were sent; no account creation, password change, policy acceptance or permission changes occurred.
- Normal existing fictional sign-in reaches the library. Account settings retains Reset password and Two-step verification, with no redundant account-creation entry. `signed-in-account.txt`. The temporary signed-in tab was closed without editing any schedule.
- Optimized build/type-check passed;7 focused account/session/setup tests passed. Two existing hook warnings remain. `git diff --check` passed. No authentication implementation changed.

Temporary phone viewport was reset and tab closed. The final signed-out3498 candidate remains available. C06/3496 and all prior candidates were left unchanged. No schedule data or hosted settings were modified.

## Remaining boundary

C07 is locally verified and ready for independent coordinator review. It does not close whole-app parity: C06's recorded gaps, Client-link recipient refresh, broader control/role coverage, genuine multi-org, print/PDF and physical-device evidence remain as recorded in `B15_TEMPLATE_INTEGRATION.md` and `B15_WORKFLOW_COMPLETION.md`. No new implementation batch begins here.
