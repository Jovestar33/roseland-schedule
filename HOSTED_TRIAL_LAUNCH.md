# Hosted parallel trial launch

Updated October 20, 2026. User selected Vercel for the new app and the existing Supabase project for data. The existing Netlify app continues during the trial. Both apps will receive real edits. No cutover has occurred.

## Verified preservation and destination

- Supabase project: `roseland-schedule-dev`, `dapvzbzyozlthmhjlekj`, us-east-1. Its five applied migration versions match the first five source migrations.
- Preserve existing organization `820f7fc4-e364-4aae-a29a-65f7d84eef61`, Roseland Pictures, slug `roseland-pictures`.
- Preserve existing active Owner membership for John, user `71280ab3-541c-4e7f-95f3-f646ac2d701b`. Owner is the current database role. Do not invent a second organization or grant Platform Super Admin authority.
- Direct scoped SQL confirmed zero productions and no `public.schedules` table before preparation. Table-list row estimates are not authoritative counts.
- User-designated additional organization Admins: Nancy Saade Sammon and Melissa Fakhri at their supplied Roseland company addresses. No hosted accounts, invitations or memberships for them have been created by this launch work.
- Migration/editor branch was pushed at `8507eee8541b2c177ed37184837fa0127e996240` before hosting preparation. Recovery bundle, working-tree patches, untracked files and local database dump are protected in the main checkout's ignored `.netlify/trial-launch-recovery/20261020` directory. That database dump is local, not a hosted database backup.
- Legacy safeguard PR #22 is merged at `978da8d66d33be3e6fdebfab3a96b53dd7f56831`. Netlify deploy `6ad7d17dbf672d5c893f1cea` was verified Published; login returned 200 and an unauthenticated load returned 403. Real authenticated trial round-trip remains outstanding.

## Hosted configuration foundation

`readHostedWorkspaceConfig` is a separate configuration validator; the hosted workspace entry page is not yet implemented. It does not bypass the existing loopback-only guards. It returns public fields only and requires:

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

The planner does not connect to a database or apply SQL. It rejects duplicate, unknown, renamed or out-of-order applied versions and records SHA-256 checksums of the pending source files. These are source checksums, not proof of the deployed schema definitions. The October 20 check found five applied and fifty pending migrations, from `20260808090000_create_schedule_domain_foundation.sql` through `20261020173258_platform_console_overview.sql`.

Before hosted application: preserve the hosted schema/data and review the forward plan, verify policy settings and provider grants, then apply existing migrations in order without resetting or reseeding the project. Read back the existing organization and Owner membership afterward and run security advisors. The local rehearsal has a manually applied platform console function whose migration ledger needs reconciliation; do not use that ledger discrepancy to reset local data.

## Remaining launch work

1. Existing Vercel account verified in Safari: team Roseland Pictures (`roseland-pictures`), Hobby plan, signed-in GitHub identity `jovestar33`. Dashboard displayed "Deploy your first project". The internal browser signup/onboarding is a separate uncompleted session; do not create a duplicate account. The existing-team upgrade dialog offered immediate billing of $20/month, not a free trial. No upgrade or payment was submitted. Finish preparation before the user authorizes paid activation for business deployment. The user approved the GitHub App permissions for `Jovestar33/roseland-schedule` only. That exact single-repository selection was submitted; GitHub requires fresh mobile/password identity confirmation before installation can finish. Do not claim the connection is complete until the callback and repository listing confirm it.
2. Add the hosted workspace entry and authenticated provider endpoints. Preserve the polished review layout while replacing loopback URLs, fictional notice copy, local mail sinks and local-only Client link routes with deliberate production implementations. Keep original local routes closed in Vercel. Avoid connecting the legacy `main` branch to a new-app production project; it still deploys the legacy app.
3. Complete hosted account callback/recovery and delivery configuration using exact canonical redirects. Fictional policies must never become real user terms. Server email admission, verified sessions, MFA, organization scope and idle expiry must remain enforced.
4. Apply the reviewed schema plan with preservation/readback and security checks. Use the existing organization and John account. Set up only the two approved organization Admins.
5. Capture a complete fresh legacy inventory and recovery copy. Dashboard stores observed: schedules, schedule-library, schedule-snapshots, schedule-templates, cms and production-index. Initial listing was partial; it is not a complete inventory or backup. Preserve additional stores even when the current importer does not consume them. Exclude local fixtures; preserve the real Lexington copy and its source identity.
6. Import with explicit source-to-target IDs and verify complete document/related-store readback. Establish sync baselines only for identical initial copies. Resolve differing copies explicitly.
7. Build an operationally durable sync service. The present worker is a foreground process with a local journal lock, not an always-on Vercel service or distributed lease. Its ordinary user session expires; it must not fabricate activity or silently bypass MFA/tenant admission. Design durable storage, ownership, session/service authorization, restart recovery and visible failures before calling the multiweek trial continuously synchronized.
8. Verify real endpoints in both directions, concurrent conflict preservation, uncertain-write recovery, browser editing and role boundaries. Make structural/new-schedule and related-store limitations visible. Only then launch the trial.

## Validation for this preparation

63 targeted tests passed: hosted configuration boundaries, migration-plan history checks, existing local workspace/navigation and both sync suites. No hosted schema, schedule data, memberships or email settings were changed. The hosted configuration module is a tested foundation, not a deployed app.

### Hosted provider endpoint preparation

`/api/platform/document-providers` now uses the hosted configuration guard, exact canonical-origin check, ordinary user bearer token, active-session RPC and effective schedule edit permission before requesting weather/location data. The browser provider factory can target this same-origin route explicitly; existing local callers keep their local endpoint. Preview deployments are denied. No server secret is used for tenant admission or passed to upstream providers. The per-process request budget is not a distributed quota; production spend/rate controls still need review.

Sixteen focused hosted/local provider and configuration tests passed, and `tsc --noEmit --incremental false` passed. This code is not deployed and no live provider configuration was changed.
