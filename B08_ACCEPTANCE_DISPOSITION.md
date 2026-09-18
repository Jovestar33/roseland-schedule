# B08 bounded local acceptance with a user-approved exception

September 17, 2026. Documentation-only review of saved evidence. The user explicitly accepts the narrow residual risk that concurrent redemption of one invitation/recovery link can produce multiple sessions for the same verified fictional account. The provider investigation remains paused. No test was rerun, no provider or security setting was changed, and no Trusted Access or hardware-key enrollment was performed for this disposition.

**Disposition: bounded fictional local B08 acceptance can be stated with the exception below.** No other blocking product failure was identified in the saved checkpoint. This does not mark the failed concurrency assertions as passed, prove universal provider safety, accept additional unverified consequences, or authorize hosted release. B05 was the active implementation batch at the original disposition; it is now locally accepted. The September 18 ordinary-flow result is recorded below.

## Exact exception

The implementation acceptance runner expected exactly one provider session and one admitted session from concurrent redemption of the same token. That stronger atomic-consumption criterion failed. Saved evidence records two returned invitation sessions, one admitted before initial password setup; two returned recovery sessions, both admitted before password reset. Both successful results referred to the same verified fictional account. Sequential reuse was rejected. Successful password setup/reset subsequently invalidated existing sessions; old refresh and old-password login failed.

The user accepts this **same-token, same-verified-account concurrent-session limitation only** as sufficient to move forward with bounded local work. The exception does not cover different-account or different-organization access, unauthorized membership, weaker role enforcement, MFA bypass, unsuccessful reset revocation, or other unverified consequences. The absence of demonstrated cross-account access in these tests is not proof that no further impact exists.

Keep `evidence/b08-accounts/runtime-results.json`, `runtime.log`, their two failure entries, runner exit status 1 and implementation commit `bc5553e` intact. A future full green result would require new separately authorized evidence; the documentation exception must not suppress or disguise the test results. Do not resume the paused investigation or route around its restriction.

## Essential product criteria and existing evidence

| Criterion | Saved evidence and disposition |
|---|---|
| Invitation-only creation; no automatic tenant access | Public signup denied; real local invitation/verification; duplicate account attempts retained one account; no organization membership before explicit acceptance. Passing bounded local evidence. |
| Recipient/tenant boundaries | Verified matching-recipient preview; anonymous and wrong-account denial; expired/revoked/disabled-parent/membership cases; explicit acceptance and recipient-only receipt. Browser wrong-account confirmation disabled without tenant-name disclosure. Existing 482-assertion authorization/database suite passed. This is tested coverage, not a universal isolation proof. |
| Reset revokes existing sessions | Genuine password-change/reset requests denied old and recovery issued-token admission, old refresh and old password; fresh password sign-in succeeded. Concurrently returned sessions were included. Preserves the already-admitted transaction boundary. Passing bounded local evidence. |
| Existing MFA remains effective | Recovery of an enrolled-factor account could not replace the password until genuine factor verification. No factor-loss bypass. Mandatory-role enrollment and organization MFA policy remain B09, with the approved lighter default unchanged. |
| Session/draft behavior | Server activity deadline, no absolute timeout, background refresh unable to renew application admission; remembered reload/tab reopen; same-account unsaved draft retained after expiry; explicit clear and different-account isolation. Provider Auth token issuance itself may continue after application idle expiry, as disclosed in the original checkpoint. |
| Policies and ordinary UX | Fictional versioned notices and timestamps; no repeated consent for another invitation; material version change denied protected API/service admission until exact reacceptance. Browser review/reacceptance and callback account separation/fragment removal were checked. |

## Independent gaps retained, not waived

- The September 18 user-assisted browser follow-up completed ordinary recovery password submission/fresh sign-in for both fictional accounts and explicit invitation acceptance/workspace entry. The direct invitation-specific password form was not submitted; that uninterrupted sequence and every late-response ordering remain unverified.
- Remember me OFF/ON tab close/reopen and reopening an already-expired remembered session were subsequently verified in Chrome. Expiry used narrowly aged fictional server activity, not a literal hour-long run or whole-browser quit/relaunch. Physical mobile devices and external email clients remain untested; 390px layout is viewport evidence only.
- Real SMTP delivery, mail reputation, provider throttling under public traffic, production redirects, CSP/HTTPS, operational monitoring, hosted session configuration, all-surface Storage/Realtime enforcement and release/cutover remain separate release gates. No actual users, credentials, mail or schedules were used.
- The approved reset boundary rejects subsequent application admission; it does not cancel already-admitted transactions. No broader cancellation guarantee was demonstrated.
- Actual approved legal notices and mandatory-role MFA enrollment/configurable MFA are unfinished external-onboarding/B09 gates. These were already outside this local B08 slice; the concurrent-session exception does not waive them.

These are explicit limits on the bounded local statement. No additional user decision is needed for continuing B05. A hosted release or broader provider guarantee still requires its own completed evidence and authorization. Retain normal password/invitation/recovery UX and the previously approved MFA defaults; do not add hardware-key or Trusted Access requirements to the product on the basis of this finding.

Source: the committed [original checkpoint](./B08_LOCAL_ACCOUNT_CHECKPOINT.md) and sanitized evidence already saved with it. No new vulnerability research or reproduction informed this review.

## Ordinary user-flow follow-up — September 18, 2026

**Focused ordinary local B08 acceptance is complete with the original accepted exception and the limits above.** See [B08_USER_FLOW_CHECKPOINT.md](./B08_USER_FLOW_CHECKPOINT.md) for exact evidence. Remember me OFF/ON tab reopen, controlled expired-session reopen and same-actor draft recovery are verified. A small cross-tab reauthentication email defect was fixed, rebuilt and browser-verified; 205 platform tests and the build pass.

The user completed recovery-based password setup for the already-verified invited account, fresh sign-in, explicit invitation acceptance and organization schedule entry. Dev/Test independently confirmed fresh sign-in and exactly one fictional schedule. The user also completed the separate control-account recovery/fresh-login handoff; the coordinator observed its correct Super Admin scope and unchanged schedule list. Direct invitation-password-form submission remains unverified. No additional human step is pending in the agreed focused finish.

The original same-account concurrent-session exception and failed evidence remain unchanged; no concurrency investigation or race-suite rerun occurred. Owned local web/services stopped with data volumes preserved. No hosted/full-parity acceptance, B09 scope, real account/mail/schedule change, push or deployment is claimed.
