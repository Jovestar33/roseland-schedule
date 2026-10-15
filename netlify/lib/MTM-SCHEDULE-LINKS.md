# MTM production schedule links

Prepared against the live production commit `2266848ce0e1cb27681fc29f58941712991ee07f`.

The scheduled function reads existing schedule blobs every 15 minutes and selects the greatest `savedAt` timestamp for each mapped town. A later edit to an older named schedule therefore makes that schedule the latest. All archived schedules remain eligible: archiving a finished town must not remove its Overview link. Nonempty production labels must be Main To Main Trail, Main to Main, or MTM. Legacy blank production labels require an exact normalized town match.

Only the `production_schedule` URL field on 74 explicitly mapped records in MTM MASTER SCHEDULE can be updated. There are 72 towns, with three existing Thomasville Overview records and a legacy Overview named Garner. All destination names, project IDs, and task-list IDs are checked before writes. No match leaves the existing value unchanged. A failed source read prevents all writes, and URLs over the existing field's 200-character limit are rejected.

## Activation

The integration is disabled until configured. Configure these as secret environment variables scoped to production Functions, never client/public variables:

- `MTM_ZOHO_CLIENT_ID`
- `MTM_ZOHO_CLIENT_SECRET`
- `MTM_ZOHO_REFRESH_TOKEN`

The connection requires ZohoProjects.tasks.READ and ZohoProjects.tasks.UPDATE. Zoho does not offer a permission limited to this custom field; the application restricts its own writes to the fixed project and mapped Overviews.

Set `MTM_LINK_SYNC_ENABLED=true` to allow a read-only preview. Leave `MTM_LINK_SYNC_WRITE` unset. Deploy, invoke the scheduled function with Netlify's Run now control, and inspect the proposed town/task/link matches. Confirm the production labels and live response shape before enabling writes.

Set `MTM_LINK_SYNC_WRITE=true` only after preview review and connection authorization. Redeploy to apply the configuration, run once, and read back the changed fields in Zoho. Repeat Run now if the initial backfill exceeds the 24-second run budget; subsequent runs skip unchanged links. Confirm the next scheduled run succeeds. Scheduling does not run in previews, and the function independently refuses non-production contexts.

Rollback: unset `MTM_LINK_SYNC_ENABLED` and redeploy. Existing links are preserved; the integration never clears a field. To reverse a specific link update, use the saved pre-change Zoho snapshot.

## Validation

`node --test tests/integrations/mtm-schedule-links.test.cjs`

`npm run build`

The tests cover latest selection, exact-town and production isolation, unchanged links, missing/changed destinations, failed reads, dry-run behavior, field-only updates, time budget, URL length, and mapping completeness. Live OAuth, source matching, first write, and the scheduled run still require verification.
