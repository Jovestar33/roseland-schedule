# Production Stability Policy

Status: the user explicitly ended the heavy-usage freeze on **September 11, 2026**. The authorized follow-up includes isolated dependency/CI and reliability fixes, disposable local database tests, resuming only existing `roseland-schedule-dev`, compatible transaction-isolated hosted checks, and read-only usage review. **No merge, deployment, new hosted migration/import, purchase or production configuration change is authorized**. See [READINESS.md](./READINESS.md) for current findings and next work.

The restrictions below retain the historical freeze policy. Current scope is stated above; historical rules do not independently authorize additional hosted changes.

## Protected production baseline

The current Netlify application, shared-PIN authentication, Netlify Functions, and Netlify Blob data remain the production authority. Migration work must not change their behavior, credentials, routes, storage, or deployment configuration.

## Historical work allowed during the freeze

- Feature-branch development based on current `main`.
- Local Supabase work with synthetic data.
- Changes applied only to `roseland-schedule-dev` after local tests and a reviewed dry run.
- Draft pull requests, automated CI, and code review.
- Protected isolated previews that cannot read or write production Blob data.
- Documentation committed to the active feature branch.
- Narrow critical production fixes through a separate reviewed branch and regression run.

## Historical prohibitions during the freeze

- Merging migration/auth/theming work into `main`.
- Changing Netlify production environment variables, functions, redirects, middleware, or Blob data.
- Connecting the live UI to Supabase.
- Importing production data into development or preview environments.
- Exercising write workflows against Netlify deploy previews, which may inherit access to existing services.
- Rotating production credentials unless required for an incident and accompanied by a rollback plan.
- Dependency or framework upgrades on `main` unrelated to an approved critical fix.

## Emergency production fixes

An urgent live-app fix must be isolated from migration work, minimize changed files, preserve Blob compatibility, pass application CI and the relevant regression checks, use a deploy preview without production writes, and receive explicit merge approval. Migration branches are rebased only after the fix is live and verified.

## Exit

The user declared the heavy-usage period over on September 11, 2026. Ending the freeze does not automatically authorize migration or cutover; preview, security, regression, backup, rollback and explicit rollout gates still apply. This documentation step changes no deployment or data authority.
