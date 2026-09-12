# Security Automation and Findings

Status: controls introduced on draft PR #5 on July 26, 2026, with secret/dependency review also merged through the hotfix lineage. The freeze ended September 11; this readiness step does not authorize deployment changes. Current checks and dependency findings are in [READINESS.md](./READINESS.md).

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

## Dependency result (September 11, 2026)

Fresh runtime audits supersede the July clean result: auth `cbdb921` reports one critical, two high and one moderate package finding; schedule `3e0cb89` reports one critical and one high. Next 15.5.21 and Sharp 0.35.0 remain flagged in both. Schedule's PostCSS/Nano ID update removes those findings but does not establish release readiness. See [READINESS.md](./READINESS.md) for advisories, applicability limits, PR #9's actual failure and the proposed dependency slice.

Historical July result: the runtime audit passed after the then-current Next/PostCSS/Sharp changes; a development ESLint/brace-expansion exception was recorded. Do not reuse that exception's old “no compatible upstream fix” claim without a fresh full dependency audit and compatibility check. No dependency changes were made during this documentation review.

## Historical Supabase advisor review (July 26, 2026)

Hosted settings and advisories were not rechecked in the September readiness pass.

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

## Resolved credential incident

GitHub secret scanning identified two Google API keys committed in repository
history, including a key then present on `main`. This incident was resolved on
2026-07-29 through isolated security hotfix PR #7:

1. The browser and hardcoded Google Places calls were replaced with the
   same-origin `/api/places` proxy, which accepts only server-side
   `GOOGLE_PLACES_KEY`.
2. A replacement key restricted to Places API (New) was stored as a secret for
   Netlify production, deploy-preview, branch-deploy, and preview-server/agent
   contexts. The non-secret Local CLI context contains no Google credential.
3. The preview passed credential-leak, application, build, database/RLS,
   dependency, Gitleaks, and live Places checks without production writes.
4. PR #7 merged to `main` as commit
   `62eb261c897b3a5c4e03857e59fee8071d520b88` and Netlify production deploy
   `6a69a1941a16950008ce757e` published successfully.
5. Production login, redirect, sanitized-error, autocomplete, and place-details
   smoke tests passed. Autocomplete was verified again after revocation.
6. Both historical Google credentials were deleted provider-side; the July 29
   record noted a 30-day provider restoration window, not an ongoing status. GitHub secret-scanning alerts #1 and
   #2 were resolved as `revoked`; zero open alerts remained.

Public Git history rewriting is not authorized in the September 11 readiness step.
Rotation removes the credential's value even though the old string remains in
history.
