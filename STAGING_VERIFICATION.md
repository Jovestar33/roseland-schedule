# Staging verification — September 12, 2026

Test app: https://roseland-schedule-staging.netlify.app

Deployed application revision: `bfa59a2`, development branch `codex/phase-1-auth-bootstrap`. Separate Netlify project: `roseland-schedule-staging`. The original live app and hosted Supabase schema were not changed.

## Verified on hosted staging

- Existing staging login succeeds; the library was empty before test data was created.
- A fictional schedule saves and reopens with its fields intact.
- Duplicate Save As returns a conflict without replacing data.
- Two saves against the same baseline produce one success and one conflict.
- Snapshot creation, immediate listing, and restoration of its data pass through hosted APIs.
- Signed client links work; unsigned reads fail; private test contact/call-sheet fields are absent from public responses.
- Template name collisions preserve both versions; repeated recovery is idempotent.
- The actual application backup module exports and imports full schedule data against staging; reimport to an existing name fails without overwriting.
- The library immediately reflects removal/recreation of the synthetic imported copy.
- Google Places suggestions and location details both return successful results.

## Browser evidence

Sign-in, library navigation, opening the fictional schedule, editing/saving/reloading, and duplicate-name handling passed. The duplicate-name dialog remained open with its explanatory error, and a screenshot was captured in the task. Snapshot preview showed the expected schedule and times.

The automation browser stalled when the Restore button was activated. No completed UI restore is claimed. Hosted restore API tests passed; manually verify that last browser interaction before broader rollout. A fresh automated tab rendered, but its sign-in action did not complete in that browser session.

## Test fixtures retained

- `STAGING TEST - September 12`
- `STAGING TEST - September 12 (imported test)`

Both are fictional. Snapshots and two fictional templates remain for inspection. No real schedule data was copied. Login settings are in the ignored `.env.staging.local` file; do not commit or share it.

## Corrections discovered by staging

1. Classic Lambda Blobs initialization omitted the uncached endpoint. Save/load/templates/snapshots now use native Request/Response entrypoints.
2. The native entrypoints import the SDK directly in ESM, avoiding the deployed CommonJS module lookup failure.
3. Snapshot reads now request strong consistency.
4. Library listing now sets strong consistency on the store, because the installed SDK ignores a per-list consistency option.

The new actual-entrypoint test uses the real SDK with a synthetic native context and verifies fresh reads, immediate listing, save preconditions, templates and snapshots. The local suite totals 77 tests; full build/type checking/lint passed before the targeted follow-ups, and the affected integration/handler tests passed after each follow-up. Netlify subsequently built each deployed revision successfully. Both push and pull-request GitHub CI runs for `bfa59a2` completed successfully, including the application and database jobs.

## Next step

Review the staging app with one representative workflow, including the pending browser restore action. Production cutover and Supabase migration still require separate approval and the remaining rollout checks in READINESS.md.
