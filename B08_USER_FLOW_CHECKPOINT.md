# B08 ordinary local user-flow checkpoint

September 18, 2026. **Session checks complete; password browser handoffs pending.** This does not close the remaining B08 end-to-end gaps. The accepted same-token/same-verified-account concurrency exception and original failures in `evidence/b08-accounts/` remain unchanged. Neither the flagged race script nor the full concurrency-containing runtime suite was executed.

## Verified in this run

- Reused the preserved `roseland-b08-20260917` database on API 56121, mail 56124 and local web 3435. No new stack, database reset, schema migration, hosted change, actual account/mail/schedule, push or deployment.
- Checked Docker inventory and resources first: no running containers, 14 CPUs, approximately 7.75 GiB memory. Started one stack; explicitly stopped metadata/storage/analytics that the CLI started despite exclusions. Kept database, Auth, REST, gateway and local mail only.
- Existing invitation-only provider signup configuration, email verification, versioned fictional notices, application admission and 60-minute policy retained. The local fixture launcher enables the established B08 policy gate while serving and restores its prior value on exit.
- Genuine UI invited-account request reached the local mail sink; followed the delivered link and verified it once. Callback fragment was scrubbed. Password setup form identifies the verified fictional recipient and states organization access has not been accepted. New password entry/submission remains for the user.
- Genuine UI password-reset request reached the local mail sink for the separate fictional control account; followed and verified the delivered recovery link once. Reset password form ready. New password entry/submission and fresh sign-in remain for the user.
- Remember me OFF: normal password sign-in, close tab, reopen workspace -> sign-in required.
- Remember me ON: normal password sign-in, close tab, reopen workspace -> remembered account ready and authorized organization available.
- Idle expiry in an open workspace: changed only the newest disposable account's server activity fixture to 61 minutes ago, preserving the actual configured threshold and provider controls. Next ordinary request required reauthentication; same-account fresh sign-in preserved version 1, unsaved state and exact fictional town edit.
- Expired remembered reopen: closed the tab, aged only that newest disposable session activity beyond 60 minutes, reopened -> sign-in required, protected organization navigation disabled, no claim of retained tab-only drafts. This is controlled expired-fixture browser evidence, **not a literal 60-minute elapsed idle test or whole-browser quit/relaunch test**.
- Demonstrated ordinary defect: after a remembered account was signed out in another tab, the workspace could retain actor identity but lose its email state, leaving a blank read-only sign-in field. LocalWorkspaceClient now retains the email from each genuine Auth session. Rebuilt and verified the remembered companion tab displays the original email after cross-tab sign-out and successfully signs in with its existing password.
- 3 focused account-session tests, all 205 platform tests, TypeScript and production build passed. Existing LocalScheduleLibrary hook warning remains. No application schema or permissions changed; no database test expansion was needed.

## Human browser steps still required

Browser-tool policy requires user entry, confirmation and submission of new passwords. No API password change is substituted for browser acceptance.

1. In the verified invited-account tab, enter matching test-only passwords (at least 12 characters including uppercase, lowercase and a number), submit `Save password and sign out existing sessions`, then sign in using that page's verified email. Stop before accepting the organization invitation so explicit review/acceptance can be verified.
2. In the verified reset tab, submit a different test-only password and sign in using its displayed control-account email. If the other fictional account is already shown, sign out of that workspace first. Leave Remember me unchecked during these two steps to simplify account separation. Passwords need not be shared with the agent.
3. Verify the invitation preview/explicit acceptance, authorized workspace entry, and reset fresh-sign-in return. Then stop the owned web process and local stack with named volumes preserved.

The five minimal services and owned web process remain running solely for these pending handoffs; two callback tabs are marked for handoff. Other test tabs were closed. The actual cleanup requirement remains open until these steps are completed or deliberately deferred.

## Restart and scope

`scripts/serve-account-user-flows.ts` is a separate bounded local fixture launcher. It never runs the race suite, refuses linked/nonloopback/environment-bearing deployment targets, creates only synthetic control data, and stores local credentials in a mode-600 temporary file. `--resume` reuses the existing fixtures rather than generating accounts again. Do not commit the private fixture file or callback tokens. If a pending callback session expires, request a new local message through the normal UI.

Supabase skill/current changelog and official `auth-verifyotp` / `auth-resetpasswordforemail` references were consulted; no provider upgrade or security expansion was introduced. Project forward-only migration/recovery rules remain controlling. Hosted email/configuration and physical device acceptance remain B15; no B09 scope was started.
