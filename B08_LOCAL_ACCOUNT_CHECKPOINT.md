> Current disposition: the user accepted the narrow same-account concurrent-session limitation. See [B08_ACCEPTANCE_DISPOSITION.md](./B08_ACCEPTANCE_DISPOSITION.md) for bounded local acceptance with exception and retained gaps. The original failed checkpoint below is historical evidence; its tests remain failed and the investigation remains paused.

# B08 local account checkpoint — acceptance blocked

September 17, 2026. Local implementation commit `bc5553e`; **B08 is not accepted or complete**. No hosted change, deployment, real email, actual account or actual schedule modification. B05/B09/B10/B11 remain separate planning work. Organization presentation writers remain Organization Super Admins/Admins only; B06 template-publishing authority is unchanged.

## Investigation paused by user

The user requested stopping the provider investigation and continuing independent B05 ordinary product development without Trusted Access enrollment. Preserve this failed checkpoint and evidence. Do not retry or route around the flagged investigation; no B08 acceptance is claimed.

## Blocking finding: concurrent Auth token consumption

Installed local Auth: `public.ecr.aws/supabase/gotrue:v2.192.0`; CLI `2.109.1`.

Two concurrent genuine `verifyOtp` calls using one invitation token both returned sessions. One was admitted by application session checks before password setup. Two concurrent calls using one recovery token both returned sessions, and **both were admitted before password reset**. Both refer to the same verified fictional recipient; this did not confer another account or automatic tenant membership. Sequential reuse was rejected. Successful password replacement then rejected all old/recovery sessions through the application boundary, and old refresh/password login failed.

The runner preserves these as failures, continues independent checks, writes a sanitized result, and exits **1**. A disabled button or application-only serial queue would not repair direct calls to the provider. Do not claim atomic single-use links, advance B08 acceptance, or deploy this candidate until the provider race is fixed or a reviewed enforceable replacement is proven against direct Auth calls. No hosted reproduction or external issue publication was attempted.

Next technical work: create a minimal fictional reproduction for the installed provider, compare its token lookup/update locking with a supported corrected version, and rerun invitation/recovery concurrency, stale links, reset-session revocation and retained-draft checks. The installed-version [provider verification source](https://github.com/supabase/auth/blob/v2.192.0/internal/api/verify.go) was consulted; the failure above is established by local runtime evidence, not inferred solely from source.

## Implemented local candidate

- Default-off, loopback-only workspace account feature and server mail route. Public provider signup disabled; email confirmation enabled; isolated Mailpit delivery. Invitation-gated Auth account creation grants no organization membership.
- Verified matching-recipient preview contains organization, assigned production, proposed roles and expiry only. Missing/wrong/revoked/expired invitations and inactive parents/memberships remain unavailable. Explicit acceptance and recipient-bound recovery receipts remain separate.
- Fixed-origin email callbacks use token hashes in the URL fragment, scrub the fragment, reject extra/duplicate/redirect parameters and keep callback Auth separate from the workspace account. Closing a callback is serialized before another may begin. Verified invitation handoff is actor-bound and does not automatically accept or overwrite another review.
- Recovery/password setup enforces provider password requirements and existing enrolled-factor verification. Password mutation expires every existing session atomically in the database; fresh password sign-in is required. No MFA-loss bypass or new platform privilege.
- Genuine trusted visible-tab input advances a server-owned 60-minute activity deadline. Refresh/polling do not. Expired activity cannot revive itself. No fixed absolute timeout; real-token tests move creation time back 15 hours while retaining recent activity.
- Optional Remember me stores authentication separately from tab-only drafts and durable account-bound B03/B06/B07 journals. Reauthentication retains same-account work; explicit sign-out warns before clearing tab-only drafts; another account cannot see the former workspace.
- Fictional terms/privacy versions and timestamps, immutable receipt replay, server-owned signup metadata, exact-version acceptance and material-change reacceptance. Protected Data API and service-actor admission return 428 until accepted. Narrow policy/activity RPCs remain available for recovery. The private `enforce_acceptance` rollout gate defaults off for prior rehearsal compatibility; B08 runtime enables it only in its owned database and disables it on exit. Mail delivery refuses to run without this gate. Stale signup notices return an explicit 409 for every address, without eligibility disclosure.
- Mail route has strict origin/body/redirect checks, private no-store output, hash-only serialized abuse counters, generic eligibility responses and a shared response-time floor. This is not constant-time behavior; direct Auth endpoints retain provider rate limits and require separate hosted abuse/delivery configuration.

## Validation and limits

Sanitized records are in `evidence/b08-accounts/`.

- Fresh isolated migration replay plus all **482 database assertions across 17 files passed**; SQL lint reports no schema errors and security advisor reports no issues. All **31 pre-B08 migration hashes are unchanged**. Five new forward migrations preserve the already-applied initial migration and its corrective history.
- **192 platform tests and 62 editor tests passed**. Type check and production build passed. The build retains one pre-existing `LocalScheduleLibrary` effect-cleanup warning.
- **12 real Auth/mail/API scenario groups passed; concurrent invitation and recovery token consumption failed as above.** Coverage includes actual delivered verification, duplicate signup, weak passwords, expired links/invitations, inactive parents, suspended membership, banned account, anonymous/wrong-account denials, uncertain signup delivery, discarded password response, reset revocation, existing MFA, material policy changes and concurrent mail limits. Synthetic bootstrap accounts are not counted as email-verification proof.
- Chrome: remembered authentication reload and tab close/reopen; corrected restored status; local signup request/mail; callback fragment removal; verification while another account is open; sequential link replay rejection; wrong-account preview denial; policy-review gate/reacceptance; expired-session same-account unsaved draft retention; explicit clearing and other-account isolation. Keyboard focus and desktop/390px callback layout inspected; phone-width document and viewport both measured 390px. Temporary viewport and owned tabs were cleaned up.
- Password mutation and MFA recovery were verified through genuine Auth APIs. Browser checks cover verification and password-form rendering, not automated new-password entry/submission. Physical-device/mobile email-client behavior, every possible delayed-response ordering and hosted delivery remain untested.
- Provider refresh may still issue a token after the application's idle deadline. That token is denied by application Data API/service-actor admission and cannot renew activity; the UI requires sign-in and stops refresh on expiry. No claim that provider Auth, Storage, Realtime or already-admitted operations are universally cancelled. Existing admitted-transaction boundary remains: admitted work may finish.
- Mandatory-role MFA enrollment/configurable organization MFA, assisted factor-loss recovery, final legal text, hosted Auth/mail/security configuration, all-surface session integration, broad parity and cutover remain later gates. This candidate does not close B09 or full parity.

## Reproduce safely

From the development checkout, choose a new unused B08 workdir and port range. The preparation script refuses existing/non-B08 directories and never resets/stops another project:

```sh
node --experimental-strip-types scripts/prepare-account-rehearsal.ts --workdir /private/tmp/roseland-b08-new-run --port-base 56520
node_modules/.bin/supabase start --workdir /private/tmp/roseland-b08-new-run --exclude studio,imgproxy,edge-runtime,logflare,vector,supavisor
node_modules/.bin/supabase test db --workdir /private/tmp/roseland-b08-new-run
npm run build
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/test-account-runtime.ts --workdir /private/tmp/roseland-b08-new-run
```

The runner owns loopback ports 3434/3435 and discovers local keys in memory. It refuses linked/nonloopback targets and environment-file-bearing production checkouts. `--serve` optionally retains fictional browser fixtures in a mode-600 `/private/tmp` file; never commit those passwords, TOTP secrets or email tokens. Commands are `expire-owner`, `drop-mail`, `stop`. Normal completion stops the owned Next/proxy processes; it leaves database/mail volumes available for reproduction. Recovery databases were not reset or deleted.

Retained projects: primary `roseland-b08-20260917` (561xx), clean replay `roseland-b08-replay-20260917` (565xx). No local credential files or provider startup key output are included in evidence.
