# Security Automation and Findings

Status: implemented on draft PR #5 on 2026-07-26. These controls do not change
the Netlify production deployment while the production stability freeze is
active.

## Automated gates

- The application job runs a high/critical production-dependency audit. A
  recognized npm registry advisory-service outage produces a visible warning
  instead of a false application failure; malformed or unknown audit failures
  still fail closed.
- Pull requests run GitHub Dependency Review and block newly introduced
  high/critical runtime vulnerabilities.
- GitHub Dependabot alerts and security-update pull requests are enabled.
- Pull-request commits run Gitleaks. GitHub secret scanning and push protection
  are also enabled at repository level.
- GitHub Actions are pinned to immutable commit SHAs.
- `main` branch protection requires the Application, Database and RLS, and
  Dependency and secret review checks; it applies to the repository owner,
  blocks force-push/deletion, and requires PR conversations to be resolved.
- The database job runs the local Supabase security advisor after rebuilding and
  testing migrations. Any warning or error fails the local gate.
- The linked-development advisor command fails on every unreviewed warning or
  error: `npm run db:advisors:security:linked`.

## Current dependency result

- The production dependency tree has no known high or critical npm advisories
  after updating Next.js to 15.5.21 and resolving the affected PostCSS, Sharp,
  and brace-expansion versions.
- The existing ESLint development toolchain still inherits a high-severity
  brace-expansion denial-of-service advisory. It is not shipped in the
  production bundle, cannot process user-controlled application input, and has
  no compatible upstream fix within the supported ESLint/Next.js 15 peer ranges.
  Dependabot continues to track it. Replace the override with supported upstream
  versions as soon as the lint ecosystem publishes them.

## Supabase advisor review

The hosted development project has no unreviewed security-advisor warnings after
the function-privilege hardening migration.

Accepted warnings:

- Four authenticated boolean authorization helpers are intentionally
  `SECURITY DEFINER` functions. They use a pinned empty `search_path`, return
  only caller-scoped booleans, and are required by recursive-safe RLS policies.
- Invitation acceptance is intentionally callable only by authenticated users.
  It validates the verified account email, invitation state, tenant/production,
  and expiry before writing membership and audit records.
- Supabase leaked-password protection is unavailable on the current Free plan.
  The project instead enforces a 12-character password minimum with letters and
  digits, and the development platform operator uses verified TOTP MFA. Enable
  leaked-password protection before unrelated external users are onboarded or
  record an explicit approved alternative.

Anonymous execution of the authorization helpers and all Data API execution of
the automatic-RLS infrastructure function are revoked. New and existing
function privileges have transaction-isolated local and linked tests.

## Open credential incident

GitHub secret scanning identified two Google API keys committed in repository
history, including a key still present on `main`. Draft PR #5 removes the
hardcoded/browser copies and permits only server-side `GOOGLE_PLACES_KEY`.

Before this change can merge:

1. Rotate or revoke both flagged credentials in Google Cloud.
2. Store the replacement only as the server-side Netlify environment variable
   `GOOGLE_PLACES_KEY`.
3. Restrict the key to the required Places APIs and appropriate server-side
   controls; set quotas and billing alerts.
4. Verify autocomplete and geocoding in a safe preview, without production
   writes.
5. Resolve the GitHub secret-scanning alerts as revoked only after provider-side
   rotation is confirmed.

Do not rewrite public Git history during the production stability freeze.
Rotation removes the credential's value even though the old string remains in
history.
