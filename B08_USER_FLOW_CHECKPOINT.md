# B08 ordinary local user-flow checkpoint

September 18, 2026. **Focused ordinary local B08 acceptance is complete, with the retained exception and evidence limits below.** This is not hosted or full-parity acceptance. The accepted same-token/same-verified-account concurrency exception and original failures in `evidence/b08-accounts/` remain unchanged. Neither the flagged race script nor the full concurrency-containing runtime suite was executed.

## Verified in this run

- Reused the preserved `roseland-b08-20260917` database on API 56121, mail 56124 and local web 3435. No new stack, database reset, schema migration, hosted change, actual account/mail/schedule, push or deployment.
- Checked Docker inventory and resources first: no running containers, 14 CPUs, approximately 7.75 GiB memory. Started one stack; explicitly stopped metadata/storage/analytics that the CLI started despite exclusions. Kept database, Auth, REST, gateway and local mail only.
- Existing invitation-only provider signup configuration, email verification, versioned fictional notices, application admission and 60-minute policy retained. The local fixture launcher enables the established B08 policy gate while serving and restores its prior value on exit.
- Genuine UI invited-account request reached the local mail sink; followed the delivered link and verified it once. Callback fragment was scrubbed. Password setup form identifies the verified fictional recipient and states organization access has not been accepted. The user subsequently completed password setup through ordinary recovery for this already-verified recipient in the coordinator in-app browser; the original invitation-specific password form was not submitted.
- Genuine UI password-reset request reached the local mail sink for the separate fictional control account; followed and verified the delivered recovery link once. The user completed new-password entry/submission and fresh sign-in in the coordinator in-app browser. The coordinator independently observed the correct control account, selected Organization Super Admin scope, and confirmed Schedules loaded with exactly one unchanged fictional draft under Unassigned.
- Remember me OFF: normal password sign-in, close tab, reopen workspace -> sign-in required.
- Remember me ON: normal password sign-in, close tab, reopen workspace -> remembered account ready and authorized organization available.
- Idle expiry in an open workspace: changed only the newest disposable account's server activity fixture to 61 minutes ago, preserving the actual configured threshold and provider controls. Next ordinary request required reauthentication; same-account fresh sign-in preserved version 1, unsaved state and exact fictional town edit.
- Expired remembered reopen: closed the tab, aged only that newest disposable session activity beyond 60 minutes, reopened -> sign-in required, protected organization navigation disabled, no claim of retained tab-only drafts. This is controlled expired-fixture browser evidence, **not a literal 60-minute elapsed idle test or whole-browser quit/relaunch test**.
- Demonstrated ordinary defect: after a remembered account was signed out in another tab, the workspace could retain actor identity but lose its email state, leaving a blank read-only sign-in field. LocalWorkspaceClient now retains the email from each genuine Auth session. Rebuilt and verified the remembered companion tab displays the original email after cross-tab sign-out and successfully signs in with its existing password.
- 3 focused account-session tests, all 205 platform tests, TypeScript and production build passed. Existing LocalScheduleLibrary hook warning remains. No application schema or permissions changed; no database test expansion was needed.

## Completed human browser handoffs and exact limits

Browser-tool policy required user entry, confirmation and submission of both new passwords. No API password change was substituted for these browser outcomes.

1. Invited account: the coordinator observed user-submitted recovery password save and fresh sign-in for the already-verified recipient, no organization access before acceptance, correct member/editor preview, explicit user acceptance, and entry into the organization schedule list. Dev/Test independently signed in using the user-authorized credential and confirmed the member organization and exactly one fictional schedule. The authorized credential is retained only in the mode-600 temporary fixture file, never Git or project documentation.
2. Separate control account: following a fresh ordinary recovery email requested in the UI and verified once, the user completed password submission and fresh login. The coordinator observed the correct control-account email, Organization Super Admin scope, and exactly one unchanged fictional schedule. No additional password replay was needed. The superseded old control-account password was removed from the private fixture file; the new password was not independently replayed or inferred from the suggested value.
3. Direct invitation-specific password submission remains **unverified**. The invited account completed password setup through recovery after its invitation email had already been verified. This validates the ordinary recovery-to-sign-in path and explicit invitation acceptance, not the original direct invitation-password-form sequence.
4. Controlled server-activity aging validates browser behavior after the existing 60-minute threshold; a literal hour-long idle run, whole-browser quit/relaunch and physical mobile devices were not tested. Hosted email/configuration and physical device acceptance remain B15.
5. The user-approved same-token/same-verified-account concurrent-session exception remains exactly as documented in B08_ACCEPTANCE_DISPOSITION.md. Original failed evidence remains failed and unchanged. No flagged race/full concurrency suite, provider investigation, Trusted Access or hardware-key requirement was introduced.

## Cleanup

The owned web3435 process and five minimal B08 services were stopped after the final handoff. The launcher restored the prior local policy gate (false). Named database, storage and runtime volumes remain preserved. Owned Chrome test tabs were closed; coordinator in-app browser tabs were not manipulated. No unrelated web process was stopped. See `evidence/b08-user-flows/final-cleanup.txt`.

## Restart and scope

`scripts/serve-account-user-flows.ts` is a separate bounded local fixture launcher. It never runs the race suite, refuses linked/nonloopback/environment-bearing deployment targets, creates only synthetic control data, and stores local credentials in a mode-600 temporary file. `--resume` reuses the existing fixtures rather than generating accounts again. Do not commit the private fixture file or callback tokens. Any future user-flow rehearsal must request fresh local messages through the normal UI; completed callbacks must not be reused.

Supabase skill/current changelog and official `auth-verifyotp` / `auth-resetpasswordforemail` references were consulted; no provider upgrade or security expansion was introduced. Project forward-only migration/recovery rules remain controlling. Hosted email/configuration and physical device acceptance remain B15; no B09 scope was started.
