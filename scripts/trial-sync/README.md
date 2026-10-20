# Trial schedule synchronization

October 20, 2026. **Implemented locally, not activated against hosted schedules.** This is an operator-controlled bidirectional schedule-document synchronizer for the Roseland Pictures parallel trial. The new app continues to store documents in Supabase; the existing app continues to use Netlify Blobs.

## Hosted trial preparation (current)

The gated Vercel worker now uses private database leases and durable checkpoints, with separate machine attribution rather than a fabricated user session. The migration files are `20261020223505_durable_trial_sync.sql` and `20261020225810_trial_sync_inventory_visibility.sql`; neither is applied to the hosted project yet. The Owner status screen exposes pause/resume, conflicts, last checks and new/missing/unmapped schedules. A complete library inventory is checked before each worker batch. Inventory discovery never imports, rebinds or deletes a schedule. Explicit conflict-resolution controls and reviewed initial mappings remain launch gates.

The restricted Netlify bridge shipped disabled via PR #23. Only the published Production deployment with the exact site/origin and private credential can use it. `ROSELAND_TRIAL_SYNC_KEYS=[]` keeps every schedule write blocked while permitting the approved read-only capture of all six stores. Do not enable it until the scoped credential and access approval are complete. Do not put the secret into chat, argv, source, browser bundles or logs.

`capture-command.cjs` reads the bridge credential from stdin supplied by the private hidden-prompt helper; it admits only `inventory` and `raw` operations. `verifyCapture(folder)` independently verifies the completed manifest and exact private files. Capture success is a stable double-read observation, not an atomic freeze or an import. Keep the source bytes and metadata even for stores or fields the current importer cannot map. Do not pass a live capture into the synthetic-only rehearsal contract or relabel it as synthetic.

The Vercel project remains on deployment hold; no scheduler or real synchronization is active. The sections below document the earlier foreground operator tool, which remains useful for rehearsal but is not the hosted trial service.

## Foreground operator tool: what it does

- Retains the last common document for every explicitly mapped schedule.
- Propagates one-sided content changes through an atomic destination version check. Descriptions, contacts, notes, dates, time values, call sheets, unknown document fields and row order are preserved. Only the transport-level `savedAt` is excluded from comparison and regenerated on a write.
- Stops when both copies changed differently. A passive HTML report compares changed fields and retains the complete common/Netlify/new-app documents. No timestamp winner or automatic field merge is used.
- Ties an operator's resolution to the exact reviewed copies, checks both again, and retains the overwritten copy in private immutable recovery checkpoints.
- Saves write intent before touching either backend. A missing acknowledgement is recovered by readback if the destination still matches the intent; otherwise it stays unresolved until explicit review. It is never blindly replayed.
- Reads both stores after successful writes; errors and new edits remain visible rather than being marked synchronized.
- Uses the current-session Supabase RPC and actor/organization checks, not privileged direct table writes. Authentication expiry or revoked access stops the affected operation.
- Rechecks in foreground watch mode, reloads renewed operator credentials between passes, backs off after provider failures, and records whether checks are running, stopped or awaiting review. Ctrl-C/SIGTERM finishes an in-flight save and its recovery record before stopping.
- Requires one protected journal per environment pair and operator identity. A file lock prevents overlapping workers using that journal. Checkpoints store only changed recovery content and versions (poll timestamps stay in the replaceable index), while the index is replaced atomically and durably. Missing/corrupt checkpoint data or a missing index with retained checkpoints fails closed.

## Boundaries

This first version syncs **already imported, explicitly mapped schedule contents**. It does not create accounts, import the initial library, or deploy anything. The trial owner can run one batch or a foreground watch process. No always-on hosted service, system scheduler, or in-app Sync button is installed.

Renames, changes to production/phase/day placement, library ordering, archive/Trash and disappearance require structural reconciliation. They stop automatic writes rather than guessing identity or deleting/recreating documents. New schedules appear in an unmapped inventory; import/reconcile them and append their reviewed mapping. Existing mappings cannot silently be rebound or removed. A source-name change cannot be inferred from text similarity.

Snapshots, templates, CMS/branding, public links, permissions and credentials are **not synchronized by this worker**. History created by saves remains in Supabase's existing immutable history; original conflict versions and write intents remain in the protected journal. Separate review is needed for related-store changes. The report's “up to date” applies only to the mapped document at its last check.

Never run two workers with different journals against the same environment pair. The journal lock is local, not a distributed ownership lease. Keep the journal on a durable local filesystem supporting exclusive creation, atomic rename and fsync; back it up. Do not delete it or its checkpoints to clear a conflict. No pruning is automatic. A stopped mirror must preserve and reconcile edits from both systems before either store is abandoned.

## Configuration

Create a private directory (`chmod 700`) outside Git and shared folders. Keep the configuration, credentials, journal and reports there. A configuration has this shape; replace every identity with its verified launch identity:

```json
{
  "format": 1,
  "netlifySiteId": "00000000-0000-0000-0000-000000000001",
  "supabaseUrl": "https://YOUR_PROJECT.supabase.co",
  "organizationId": "00000000-0000-0000-0000-000000000002",
  "actorId": "00000000-0000-0000-0000-000000000003",
  "mappings": [
    {
      "id": "00000000-0000-0000-0000-000000000004",
      "netlifyKey": "Exact legacy schedule key",
      "supabaseId": "00000000-0000-0000-0000-000000000005"
    }
  ]
}
```

Use the source-to-target identities from the verified initial import. Never derive a new target ID from a revision or schedule name. Duplicate source keys or target IDs are rejected. Additional mappings can be appended; existing ones cannot change without a separate identity reconciliation.

`ROSELAND_SYNC_CREDENTIALS` points to a private regular JSON file (`chmod 600`) containing `netlifyToken`, `supabaseApiKey`, and `supabaseAccessToken`. The latter is a current ordinary authorized user's session token for the configured actor, with required MFA. Do not use a service-role token, weaken admission, auto-generate activity, or put credentials into command arguments, Git, browser bundles or reports. The command verifies the authenticated user. It does not log in, generate activity to extend a session, refresh credentials or create a privileged service account. Watch rereads the same private credential file each pass and checks the actor/session again; a renewed authorized session can resume checks without restarting. Invalid credential-file permissions/configuration or a disk failure stops the process. Obtain/refresh the operator session through the approved account process when necessary.

Run outside any inherited `NETLIFY_BLOBS_CONTEXT`: the SDK can otherwise override the configured source site. The CLI refuses such a context.

## Operation

From this worktree:

```sh
export ROSELAND_SYNC_CREDENTIALS=/private/path/credentials.json
npm run sync:trial -- plan /private/path/config.json /private/path/journal
npm run sync:trial -- run /private/path/config.json /private/path/journal
```

`plan` reads both sides and writes local review evidence but does not change schedules. It can reconcile a previously uncertain acknowledgement from readback. `run` establishes baselines only for matching initial copies and applies safe one-sided edits. Initial unequal copies need review; it never assumes either is authoritative.

For repeated checks, keep one foreground process running on the designated operator machine:

```sh
npm run sync:trial -- watch /private/path/config.json /private/path/journal 30
npm run sync:trial -- status /private/path/journal
```

The interval is 15–3600 seconds, measured after a pass finishes. Provider failures back off to five minutes (or the configured interval if longer). Conflicts and missing mappings remain visible while unaffected mapped schedules can continue. An unavailable or uncertain schedule is never force-replayed. Stop watch with Ctrl-C before running `resolve`, changing mappings or using another command that writes the journal. There is no auto-start after reboot, no external notification delivery, and no distributed lock. Sleep, shutdown, lost access or stopped processes stop synchronization; neither app should be described as continuously current when this process is unavailable.

`health.json` records the worker state and last completed/successful pass. `status` checks the saved heartbeat's freshness; it explicitly does **not** claim that a heartbeat proves a process is alive. Stopped/error/expired snapshots exit 2. Reports are saved snapshots, even while watch is running. Reopen them to read fresh results. A failure banner takes precedence over previously current schedule rows.

Open `report.html` in the journal directory. It is a private, escaped, script-free saved report, not a live dashboard. `report.json` and the recovery checkpoints include schedule content and contacts; protect them like a backup. Standard output contains only mapping IDs/statuses and the report location.

For a document conflict, review both complete copies and run:

```sh
npm run sync:trial -- resolve /private/path/config.json /private/path/journal MAPPING_ID supabase REVIEW_HASH
```

Use `netlify` instead of `supabase` to select that current copy. The report supplies the mapping ID and review hash under Operator reference. This is an intentional replacement, with both prior versions retained. To combine changes, edit the desired combined version in one app first, generate a new report and select that reviewed copy. A stale hash is rejected. An uncertain write can also be resolved this way after reviewing current copies; changed structure cannot.

Exit 0 means the command completed without unresolved/missing mappings; for `plan`, ready transfers still have not been applied. Exit 2 means review or mapping work remains. Exit 1 means the command stopped on a configuration, authentication, storage or command error. Inspect retained private evidence before retrying; never use force-save to bypass a sync conflict.

After a process crash, verify its PID is no longer running before removing only `worker.lock`; preserve all state/checkpoint files. Run `plan` first. Do not remove a lock from an active worker or treat a lost journal as an empty baseline.

## Validation and remaining activation checks

- The full platform suite passes 303 tests and the editor suite passes 138 tests; the production build passes. The sync command help and private conflict report were checked, including browser rendering.
- 40 automated sync tests cover one-sided edits in both directions, unchanged/identical edits, conflicts, exact-version resolution, source/destination races, uncertain acknowledgements, disk failure before write, missing records, actor/tenant binding, private journal reopening/locking/corruption, metadata retention and escaped report content. Watch tests additionally cover repeated bidirectional propagation, conflicts across passes, expired/renewed sessions, backoff, graceful interruption, failed health persistence, stale heartbeat reporting, bounded recovery storage, and the real legacy save handler rejecting a stale editor after a sync write.
- Genuine local Supabase password login + existing fictional MFA: copied a Netlify-side edit into the database, copied a database edit back, stopped conflicting edits, resolved an exact reviewed conflict, and verified stale SQL version rejection. Netlify storage in this round trip was an in-memory conditional store through the real sync adapter.
- The actual installed Netlify SDK 10.7.13 was checked against its official local Blobs server for conditional PUT success/stale rejection. That emulator omits ETags on reads and encodes space-containing keys in listings; the sync adapter correctly refused its unversioned reads. This is not a complete Netlify-hosted end-to-end claim, and no provider code was weakened to hide the limitation.
- The legacy editor now retains unknown top-level document fields through ordinary saves and Save As; metadata and row extension fields are also covered by the regression test. This prerequisite shipped to the legacy app on October 20 via PR #22, commit `978da8d66d33be3e6fdebfab3a96b53dd7f56831`; Netlify deploy `6ad7d17dbf672d5c893f1cea` was verified Published. This does not activate synchronization.
- Three earlier fictional rehearsal schedules were created in the existing local Acceptance Studio. IDs: `ad0613e1-6f20-4c15-baf7-023ee70d6196` (initial empty-response diagnostic), `b0ce7319-b546-413e-9760-d4ade9d19ff4`, and `800853dc-88f8-438a-a41b-922766493e40`. Their fixtures/history stay local and are excluded from the launch import.
- Latest genuine runtime evidence: `/private/tmp/roseland-trial-sync-9d2d39e0-b36d-444b-90a6-58841d52fa9c/result.json`. This additional fictional schedule also exercised foreground watch against real Supabase RPCs in both directions and stopped cleanly. It contains no credentials. Existing acceptance schedules and memberships were not changed.

Before connecting real schedules: bind the exact hosted source/destination/actor, verify the deployed legacy save paths and strong-read ETags, perform and reconcile the initial import, protect/back up the single operator journal, and exercise the real endpoint round trip on an explicitly identified pilot record with the team. Keep known structural/related-store limitations visible. No ongoing worker, hosted role grants, real email or live sync writes have been enabled by this implementation. The two real Lexington drafts created separately are not linked to an active worker.

Provider references checked: [Netlify conditional Blobs writes](https://docs.netlify.com/build/data-and-storage/netlify-blobs/#set), [Supabase database functions](https://supabase.com/docs/guides/database/functions), and the [October 12 TLS notice](https://supabase.com/changelog/cbc-tls-ciphers-deprecated). The notice does not require TLS weakening for this modern Node worker.
