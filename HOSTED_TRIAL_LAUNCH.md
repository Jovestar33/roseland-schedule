# Hosted parallel trial launch

Updated October 20, 2026. User selected Vercel for the new app and the existing Supabase project for data. The existing Netlify app continues during the trial. Both apps will receive real edits. No cutover has occurred.

## Verified preservation and destination

- Supabase project: `roseland-schedule-dev`, `dapvzbzyozlthmhjlekj`, us-east-1. All 56 source migration versions are applied. The user-run guarded helper completed on October 20 at 22:12 UTC; fresh hosted SQL confirmed the ledger, original organization/Owner, zero schedules/productions and RLS on every public table.
- Preserve existing organization `820f7fc4-e364-4aae-a29a-65f7d84eef61`, Roseland Pictures, slug `roseland-pictures`.
- Preserve existing active Owner membership for John, user `71280ab3-541c-4e7f-95f3-f646ac2d701b`. Owner is the current database role. Do not invent a second organization or grant Platform Super Admin authority.
- Direct scoped SQL confirmed zero productions and no `public.schedules` table before preparation. Table-list row estimates are not authoritative counts.
- User-designated additional organization Admins: Nancy Saade Sammon and Melissa Fakhri at their supplied Roseland company addresses. No hosted accounts, invitations or memberships for them have been created by this launch work.
- Migration/editor branch was pushed at `8507eee8541b2c177ed37184837fa0127e996240` before hosting preparation. Recovery bundle, working-tree patches, untracked files and local database dump are protected in the main checkout's ignored `.netlify/trial-launch-recovery/20261020` directory. That database dump is local, not a hosted database backup.
- Legacy safeguard PR #22 is merged at `978da8d66d33be3e6fdebfab3a96b53dd7f56831`. Netlify deploy `6ad7d17dbf672d5c893f1cea` was verified Published; login returned 200 and an unauthenticated load returned 403. Real authenticated trial round-trip remains outstanding.

## Hosted configuration foundation

`readHostedWorkspaceConfig` is a separate configuration validator. The hosted `/workspace` entry now reuses the polished review layout, and `/client` serves the restricted shared-schedule view. It does not bypass the existing loopback-only guards. It returns public fields only and requires:

- `ROSELAND_HOSTED_APP=supabase`
- `VERCEL=1` and `VERCEL_ENV=production`; preview builds are rejected.
- `ROSELAND_APP_ORIGIN` set to the exact HTTPS canonical app origin, with an exactly matching request Host.
- `ROSELAND_SUPABASE_PROJECT_REF=dapvzbzyozlthmhjlekj` and matching `SUPABASE_URL`.
- `SUPABASE_PUBLISHABLE_KEY` with modern publishable-key format.
- `SUPABASE_PLATFORM_WORKFLOWS_ENABLED=true` and a server-only `SUPABASE_SECRET_KEY` (or correctly scoped legacy service key).
- No populated `ROSELAND_LOCAL_*` settings and no Netlify deployment context.

Do not enable the hosted flag until the production routes and gates below are complete. Do not copy local fixture secrets, local account mail settings or a local environment file into Vercel. Configuration validation does not prove credential validity, database readiness, user authorization or successful deployment. No secrets belong in `NEXT_PUBLIC_*` variables. Vercel linkage is ignored by Git.

## Forward schema plan

Use a fresh read-only Supabase migration ledger and run:

```
node scripts/hosting/migration-plan.cjs /private/path/verified-ledger.json
```

The planner does not connect to a database or apply SQL. It rejects duplicate, unknown, renamed or out-of-order applied versions and records SHA-256 checksums of the pending source files. These are source checksums, not proof of the deployed schema definitions. The October 20 check found five applied and fifty-one pending migrations, from `20260808090000_create_schedule_domain_foundation.sql` through `20261020212649_account_policy_enforcement_status.sql`. The final migration exposes the existing policy enforcement setting without changing that setting or creating acceptance records.

Before hosted application: preserve the hosted schema/data and review the forward plan, verify policy settings and provider grants, then apply existing migrations in order without resetting or reseeding the project. Read back the existing organization and Owner membership afterward and run security advisors. The local rehearsal has a manually applied platform console function whose migration ledger needs reconciliation; do not use that ledger discrepancy to reset local data.

## Remaining launch work

1. Existing Vercel account verified in Safari: team Roseland Pictures (`roseland-pictures`), Hobby plan, signed-in GitHub identity `jovestar33`. Dashboard displayed "Deploy your first project". The internal browser signup/onboarding is a separate uncompleted session; do not create a duplicate account. The existing-team upgrade dialog offered immediate billing of $20/month, not a free trial. No upgrade or payment was submitted. Finish preparation before the user authorizes paid activation for business deployment. The user approved the GitHub App permissions for `Jovestar33/roseland-schedule` only. GitHub identity confirmation completed and the Vercel import list visibly showed the approved repository. Installation is complete. The direct import form defaulted to legacy `main`, so an empty project was created without deployment, renamed `roseland-schedule`, and connected to the approved repository. Project ID: `prj_rSeevNCH2n4nhnAjMqcSNdtZ7IS4`; dashboard: https://vercel.com/roseland-pictures/roseland-schedule. Production branch is explicitly `codex/migration-editor-catchup`; Next.js preset and Node 24 are selected. Ignored Build Step is saved as "Don’t build anything" (`exit 0`) while launch prerequisites are incomplete. The reserved production domain is `roseland-schedule.vercel.app`; original `project-ex9st.vercel.app` redirects to it. Both show No Deployment. No environment variables, secrets or paid upgrade have been added.
2. Hosted workspace, provider, account-mail and Client-link routes are prepared and locally checked. Organization membership/lifecycle SMTP adapters are now prepared; real provider credentials and delivery verification remain pending. Do not enable the hosted trial with these gaps represented as complete. Keep original local routes closed in Vercel. Select `codex/migration-editor-catchup` for the new app; legacy `main` must not become its production branch.
3. Complete hosted account callback/recovery and delivery configuration using exact canonical redirects. Fictional policies must never become real user terms. Server email admission, verified sessions, MFA, organization scope and idle expiry must remain enforced.
4. Schema application and preservation/readback are complete. Finish the security advisor review and configure leaked-password protection. Use the existing organization and John account. Set up only the two approved organization Admins.
5. Capture a complete fresh legacy inventory and recovery copy. Dashboard stores observed: schedules, schedule-library, schedule-snapshots, schedule-templates, cms and production-index. Initial listing was partial; it is not a complete inventory or backup. Preserve additional stores even when the current importer does not consume them. Exclude local fixtures; preserve the real Lexington copy and its source identity.
6. Import with explicit source-to-target IDs and verify complete document/related-store readback. Establish sync baselines only for identical initial copies. Resolve differing copies explicitly.
7. Build an operationally durable sync service. The present worker is a foreground process with a local journal lock, not an always-on Vercel service or distributed lease. Its ordinary user session expires; it must not fabricate activity or silently bypass MFA/tenant admission. Design durable storage, ownership, session/service authorization, restart recovery and visible failures before calling the multiweek trial continuously synchronized.
8. Verify real endpoints in both directions, concurrent conflict preservation, uncertain-write recovery, browser editing and role boundaries. Make structural/new-schedule and related-store limitations visible. Only then launch the trial.

## Validation for this preparation

63 targeted tests passed: hosted configuration boundaries, migration-plan history checks, existing local workspace/navigation and both sync suites. No hosted schema, schedule data, memberships or email settings were changed. The hosted configuration module is a tested foundation, not a deployed app.

### Hosted provider endpoint preparation

`/api/platform/document-providers` now uses the hosted configuration guard, exact canonical-origin check, ordinary user bearer token, active-session RPC and effective schedule edit permission before requesting weather/location data. The browser provider factory can target this same-origin route explicitly; existing local callers keep their local endpoint. Preview deployments are denied. No server secret is used for tenant admission or passed to upstream providers. The per-process request budget is not a distributed quota; production spend/rate controls still need review.

Sixteen focused hosted/local provider and configuration tests passed, and `tsc --noEmit --incremental false` passed. This code is not deployed and no live provider configuration was changed.

### Hosted entry, account and Client route checks

The hosted workspace uses `/workspace` navigation and `/api/platform/document-providers`; Client links use `/client` and secure HttpOnly recipient cookies scoped to `/api/platform/client-view/<recipient>`. Grant validity is checked at exchange and every read. Wrong origins and missing hosted configuration are rejected. Hosted middleware blocks legacy schedule and test pages.

`/api/platform/account/mail` has an additional `ROSELAND_HOSTED_ACCOUNT_MAIL=supabase` gate, exact-origin validation, bounded input, database-backed invitation/rate admission, and canonical `/workspace` redirects. It requires disabled public signup and confirmed-email auth settings. It does not create fictional policy acceptance. Hosted policy admission honors the database's existing enforcement switch; missing enforcement metadata fails closed. No real mail has been sent and no auth settings/templates were changed. Configure and test exact token-hash callback templates and real delivery before enabling this flag.

Validation: 318 platform tests passed in the full run; two additional hosted-sharing tests initially had a test-loader error and both passed after that harness was fixed. All six hosted mail/middleware/sharing tests passed together afterward. All 138 editor tests passed, type checking passed, and an isolated production build passed. The build retains existing CSS/hooks warnings. A rollback-only local SQL rehearsal verified policy metadata and grants and left no schema or data change. The ordinary local `postgres` role lacked schema CREATE; the rollback rehearsal used the existing local `supabase_admin` migration administrator without changing privileges.

A separate local server using fictional hosted configuration verified actual built routes: `/workspace` and `/client` returned 200, wrong-host workspace and legacy/review pages returned 404, and the local Client API rejected the request. Server secrets were absent from the sign-in response. Browser review confirmed the hosted sign-in layout and invitation/back navigation with no fictional notices. This is local evidence, not a hosted deployment or a live authenticated trial.

### Dashboard checks and pending user inputs

The existing Supabase dashboard was reached through its existing GitHub login; it confirms the same project and organization. The Free plan has no hosted backups. Authentication email templates show that no custom SMTP delivery is configured. No hosted settings or database records were changed. The user has been asked whether the existing database password is available (without sending it in chat), so a private database backup can precede schema changes, and has selected `action@roseland-pictures.com` as the sender for invitations and password resets. SMTP access and sender verification are still unconfigured. The user completed the Supabase Pro upgrade; Safari Billing now confirms Pro and spend cap enabled, with current/projected plan charges of $25. The existing project is ACTIVE_HEALTHY. The backup page still says "No backups yet" immediately after upgrading. The user clarified that the earlier password was their GitHub sign-in, then personally reset and saved the separate database password on October 20. No password has been provided to the agent. The new database password must be entered privately at the backup helper prompt. Do not reset it again or invent SMTP credentials. Backup access and email setup remain unresolved.

The Vercel project option to use its code/chat data for model improvement was turned off during preparation. The remaining hosted notification adapters, database forward migration, complete source backup/import/mapping, durable sync service, and real dual-edit acceptance checks remain outstanding. Do not describe this project shell or the tested local hosted routes as a running trial.

### Private backup handoff

`scripts/hosting/backup-hosted.py` is prepared, with a runnable copy at `/private/tmp/roseland-backup.py`. It prompts without echo in a real terminal; passes the password only through a subprocess environment; enforces TLS certificate verification and read-only database transactions; verifies the original organization, Owner membership and exact five-migration baseline; writes a private custom-format dump, role metadata without role passwords, archive listing and SHA-256 manifest beneath the ignored recovery folder. It does not save the password, apply migrations, restore data or change credentials. The identity query passed against the actual hosted database. Static/command-guard checks passed; the actual backup has not run. Archive validation is not restore testing. Native computer control refused macOS Terminal, so the user must run the helper and enter the password privately.

### Backup readiness follow-up

The user reported completing the database password reset. The existing Docker backup container is running. A fresh read-only hosted query still reports the exact five original migrations, and the source planner still finds 51 pending migrations. No completed hosted recovery manifest has been observed yet. `scripts/hosting/verify-backup.py` independently checks the exact expected files, private permissions, checksums, archive signature, original organization/Owner identity and table-data listing without exposing contents or connecting to the database. Six tests passed for intact, corrupt, public-permission, wrong-project, path-injection and symlink cases. Integrity verification explicitly does not claim a restore test. Await the private password entry and completed backup before hosted migration. No hosted writes or mail were performed in this follow-up.

### Hosted backup certificate fix

The first user-run backup stopped before identity/dump because the container system CA bundle did not trust the Supabase endpoint. Downloaded the public CA from the actual Dashboard SSL Configuration download link (`https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`), stored it as `scripts/hosting/supabase-ca.crt`, and pinned its file SHA-256 in the helper. Trust is scoped to the backup process; `verify-full`, hostname checks and read-only settings remain enabled. Both source and `/private/tmp/roseland-backup.py` copies were updated. A live no-password preflight using the runnable helper now reaches the expected authentication challenge. Eight focused backup tests passed. No backup or hosted changes were completed. The browser diagnostic unexpectedly included a temporarily displayed post-reset credential; the user was informed to rotate it again and refresh the page before retrying. No credential was copied into source or backup files.

### Verified hosted recovery and forward rehearsal — October 20, 2026

User completed the read-only hosted backup at `hosted-20261020T220453Z` under the main checkout's private `.netlify/trial-launch-recovery/` directory. Independent checksum, permissions, archive and original identity checks passed. A full restore of the archive and role metadata succeeded in a network-isolated disposable local container with no exposed ports or shared preview volumes. The original organization, active Owner membership and John auth account were restored. All ten original application/private/migration tables matched the live hosted database by count and content fingerprint. The archive manifest retains its original `restoreTested:false`; separate private `restore-rehearsal/` reports record the subsequent successful test.

Restore environment details: the hosted database owner was read back as `postgres` and matched in the restored copy. Restoring existing event-trigger ownership required temporary local-only SUPERUSER on the restored `postgres` role, immediately removed. The migration rehearsal required Supabase's `supautils` startup extension with the existing privileged-role model and `pgrst.*` configuration allowance. After matching these environmental requirements, all 51 pending migration sources passed as the restricted `postgres` role. Post-checks confirmed original identities, zero schedules/productions, no public tables without RLS, account-policy enforcement remaining disabled, the Data API session hook configured, and postgres still NOSUPERUSER. No hosted migration occurred during this rehearsal.

`scripts/hosting/migrate-hosted.py` and `/private/tmp/roseland-migrate.py` are prepared for private user password entry. The helper checks the backup and successful rehearsal, unchanged source checksums, exact CLI dry-run list, fresh original organization/Owner/migration history, and unchanged original table fingerprints before applying `supabase db push`. It uses verified TLS and password environment variables, never argv or persisted passwords; it does not seed, reset, include role imports, or repair the ledger. It then verifies all 56 versions and original organization/Owner and writes a private completion result. Ten focused backup/migration-helper tests passed. Real CLI dry-run/apply with private credentials is pending; a failure must be inspected rather than blindly retried.


### Hosted schema completion and SMTP adapter — October 20, 2026

The user-run migration helper completed successfully at 22:12:40 UTC. Private `hosted-migration-result.json` reports all 56 versions and original organization/Owner preserved. Fresh MCP SQL independently confirmed these facts, zero schedules/productions, RLS on all public tables, the session hook, and unchanged disabled account-policy enforcement. No fixture data or fabricated policy acceptances were imported.

Supabase advisors report 28 INFO private-table RLS-without-policy findings (private RPC-only storage), 78 WARN authenticated SECURITY DEFINER functions (requires per-function authorization review), and disabled leaked-password protection. Performance findings include 64 unindexed foreign keys, seven auth RLS initialization-plan warnings, 36 unused indexes in the empty database, and an absolute auth connection limit. These have not been blanket-allowlisted, revoked or silently represented as resolved. Leaked-password protection still needs dashboard configuration.

User confirmed `action@roseland-pictures.com` is an alias owned by `john@roseland-pictures.com`. New server-only membership/lifecycle notification routes require the hosted production guard, exact canonical Origin, bounded JSON, authenticated actor, and the existing database claim RPC with live session/MFA/organization checks. Recipients and content come from claimed database events, never caller-provided addresses. Claims suppress concurrent/repeated sends; failure remains retryable. SMTP acceptance is displayed as provider acceptance, not guaranteed inbox delivery. If acceptance succeeds but the subsequent receipt is lost, a later retry can duplicate the message; this is not exactly-once SMTP delivery.

Required production-only mail variables (values remain unset in Vercel):
- `ROSELAND_HOSTED_NOTIFICATIONS=smtp`
- `ROSELAND_SMTP_HOST`: verified Zoho SMTP hostname, either `smtppro.zoho.com` or `smtp.zoho.com` for this account
- `ROSELAND_SMTP_PORT`: `465` or `587`; TLS is mandatory and certificates are verified
- `ROSELAND_SMTP_USERNAME=john@roseland-pictures.com`
- `ROSELAND_SMTP_FROM=action@roseland-pictures.com`
- `ROSELAND_SMTP_PASSWORD`: private Zoho application password; never source/chat/browser output

Supabase Auth needs its own custom SMTP configuration with the same approved sender and mailbox credentials, exact production site/redirect URLs and reviewed callback templates. No real email has been sent, no credential was obtained or saved, and no hosted email settings changed. User is being asked whether an app password is already available for private setup. Local notification endpoints retain their fictional-recipient and loopback restrictions.

Validation: 19 focused hosted-mail, membership and lifecycle tests passed, along with TypeScript checking. Nodemailer 10.1.7 and types 8.0.2 are pinned. The refreshed production audit identified existing Next.js, sharp and source-map-js advisories; Next.js was patched to 15.5.27, sharp override to 0.35.5 and source-map-js lock resolution to 1.2.2. The production dependency audit then reported no high/critical findings. Development dependency findings remain for separate review. A clean isolated production build passed using the patched dependency lockfile, with existing CSS/React-hook warnings. Credential-leak checks passed. The full platform run passed 325 of 326 tests; the sole failure was sandbox denial of the disposable emulator listener, and all 28 sync tests passed on a permitted rerun. All 138 editor tests passed. No deployment or trial activation has occurred.


### Saved hosted settings and private Vercel handoff — October 20, 2026

User privately saved the Zoho application password in Supabase. Safari reload verified custom SMTP remains enabled, sender `action@roseland-pictures.com`, name Roseland Pictures, host `smtppro.zoho.com`, port 465 and username `john@roseland-pictures.com`. This confirms persistence, not SMTP authentication or inbox delivery. No test message has been sent.

Set and read back Supabase Site URL `https://roseland-schedule.vercel.app` and the exact redirect allowlist entry `https://roseland-schedule.vercel.app/workspace`. Disabled public signup; email confirmation remains required, anonymous sign-in remains off. A fresh public Auth settings request returned 200 and independently confirmed signup disabled, confirmation required and email provider enabled. Enabled leaked-password protection; the fresh security advisor result no longer includes that warning. Other advisor findings remain pending review.

Saved 12 non-secret Vercel Config variables to Production only: hosted-app flag, canonical origin, project ref, Supabase URL/publishable key/workflow flag, account mail and notification flags, SMTP host/port/username/from. Verified the success receipt and every variable name under Production. The production branch remains `codex/migration-editor-catchup`; team still shows Hobby. No paid upgrade was made. Existing deployment hold is not removed.

Prepared two blank Vercel Secret fields scoped only to Production: `ROSELAND_SMTP_PASSWORD` and `SUPABASE_SECRET_KEY`. User has been asked to enter the saved Zoho app password and copy the existing default Supabase Secret key privately from the adjacent API Keys tab, then save. No secret value was revealed, read, copied or persisted by the agent. These two saves are not yet verified. No new Supabase key was created.

Prepared production invitation/recovery templates under `supabase/hosted-account-templates/`, separate from fictional local templates. Links use the app's existing fragment-based explicit verification flow on `/workspace`; missing invitation metadata is omitted. These templates still need review and saving in Supabase before real invitations/password recovery are tested. All deployment, schedule import/mapping, durable synchronization and real trial acceptance gates remain outstanding.
