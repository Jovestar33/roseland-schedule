# Local schedule lifecycle review — September 15, 2026

This checkpoint follows `5c533cc` on `codex/migration-schedule-contract` in `/private/tmp/roseland-migration-contract-20260914`. The shared loopback workspace now exposes blank creation in an existing authorized production day, rename, archive/unarchive, soft-delete/recovery and document-history restore through the existing versioned RPCs. All execution uses fictional accounts and schedules. Actual schedules, hosted services, real credentials, billing and Netlify defaults are untouched. No push, deployment, schema migration, new dependency or policy change is included.

**Status: implementation and automated/runtime checks pass; final visual acceptance remains pending.** The Mac locked before the remaining browser checks, and the computer-use tool could not unlock it. The user has been asked to unlock it. Do not mark the remaining scenarios below as passed, or start a new implementation batch in their place.

## Behavior and boundaries

Lifecycle panels are retained separately for each visited organization under the existing account generation/session rules. Discovery separates active, archived and deleted collections, with bounded UUID cursors. Production-day destinations use active parents and existing production permissions. History is fetched in descending version pages; documents are fetched only for an explicit preview. These are live cursors, not a transactionally consistent snapshot spanning pages.

Each review deep-copies and freezes its actor, organization, schedule UUID, expected saved version, operation, payload and document. Creation allocates one UUID and an empty schema-1 document. Mutations preserve their original expected version. Requests explicitly pin the actor's current bearer token; preflight reads check tenant and version, while the unchanged SQL/RLS boundary remains authoritative against races. Owner/Admin and assigned editors retain their existing editing rights; only Owner/Admin can soft-delete or recover. Viewers can inspect authorized documents and history without mutation rights.

Unknown results retain the same review. Explicit checking and retries compare the exact next immutable history entry, including actor, identity, document and lifecycle metadata. A matching stored version can be confirmed even when a later current version exists; both numbers are shown. This is evidence of saved state, **not a causal request receipt or new durable idempotency ledger**. An unavailable read does not prove that a request failed. Creation can retry only its original UUID; invisible mutations remain blocked. A different current version conflicts without adopting it or silently preparing a newer write. Changing accounts invalidates pending controller results. Previously admitted requests may finish under the existing session-admission contract.

Saved-record operations never automatically replace an editor baseline, dirty document, undo history or open modal draft. **Open in editor** navigates through a fresh authorized organization lookup and the editor's existing explicit discard guard. A stale editor save keeps its original version and edits. Editor discard confirmations are organization-scoped. While that confirmation is open, retained editor modal portals and keyboard handlers are hidden; cancelling should reveal the original modal draft. The final Escape-key verification of this last adjustment is pending below.

Document restore appends only the selected historical document, preserving current identity/name/status metadata. Rename and undelete address collisions remain conflicts. Older archived rows without a known prior status cannot be unarchived without a migration decision. Deleted parents are never restored implicitly. No hierarchy creation/editing, cross-production move, permanent purge, retention automation, publication transition, related-store projection or new ownership/sharing policy is included. The global in-memory workspace still loses drafts on a full reload/tab close, with its existing before-unload warning.

## Executed validation

- **101 platform tests pass**, including 23 lifecycle checks for immutable reviews, duplicate submits, retry/check behavior, stale versions, actor/tenant boundaries, payloads and acknowledgement validation. **53 editor/server/routing regressions pass.** Final TypeScript, production build with integrated lint, and diff whitespace checks pass.
- **14 unchanged migrations; 431 pgTAP assertions across 13 files pass** on a separate clean SQL project. SQL lint finds no schema errors and the local security advisor reports no issues. An initial run against the active browser fixture database failed broad fixture-cleanup/count assumptions; it was not an application failure. The suite was rerun on a separate clean project without deleting the browser fixtures. No prior race or hosted result is relabeled as new evidence.
- The new genuine Auth/runtime runner passes all lifecycle operations, reopen/discovery, immutable history and Owner/editor/viewer/tenant boundaries; rename/undelete collisions; stale historical restore versus a newer genuine editor save; actual dropped responses for creation and all six mutations; pre-send outages; matching an older committed result after a newer save; expired/revoked sessions and same-account recovery; and built route/Host/secret gates.
- Two simultaneous genuine Owner/editor archive requests produce one saved version/audit and one retained conflict. This is HTTP concurrency evidence, not a measured database lock-wait test. Real **25+2** day, schedule and history pages have no gaps/duplicates and preserve tenant visibility. A deleted parent prevents recovery without changing the schedule version.
- CI includes the new runtime after the shared-workspace runner. No remote CI execution was triggered. Dependencies, SQL policies and earlier standalone implementations are unchanged; their previous broad runtime results are not claimed as fresh runs here.

Visible browser work completed before the lock covered creation/reopening, rename with its committed response held across another organization, archive/unarchive, deleted discovery/recovery, name collision with the original version retained, cancelled review discard, stale editor save without lost edits, stale historical restore versus a genuine newer editor save, and explicit successful restore. A newer unsaved editor draft and an open contact draft survived navigation to lifecycle, document restore, return to the editor and cancellation of the editor discard prompt. The subsequent final editor reload invocation has no retained browser observation and is not claimed as verified.

Read-only database evidence at `/private/tmp/roseland-lifecycle-ui-browser-results.log` confirms:

- `c6ec4e0a-03b2-4a7b-94f2-ceea990beab5`, **UI lifecycle renamed**, has versions 1–6 and exactly the create/rename/archive/unarchive/delete/restore audits; it is active, draft and undeleted.
- `4f41154f-d17f-4961-9123-451d1527f2ed`, **Browser Harbour day**, has versions 1–4. Its version-4 document checksum equals version 1; the current name is retained and the restore audit starts from version 3. The failed collision and stale restore appended no version.

### Remaining browser acceptance

After unlocking the Mac, run the final build with new fictional fixtures and finish:

1. Contact draft → lifecycle → Open in editor → Escape on the discard confirmation. Verify only that confirmation closes and the exact contact draft returns, then confirm an explicit discard loads the saved result.
2. A dropped committed lifecycle response followed by check/retry across internal navigation, and actual session expiry followed by same-account sign-in with the original review retained. These passed genuine runtime checks but still need final UI observations.
3. Member/editor, viewer and other-tenant lifecycle controls and account/back-history isolation in the browser. SQL/runtime authorization passed; final UI checks remain.
4. Desktop and mobile review/history/discard layout, with useful exported screenshots and viewport restoration. No new lifecycle mobile check, screenshot artifact, physical-device check, hosted security review or full parity is claimed.

## Reproduction and continuity

The runtime project is `/private/tmp/roseland-lifecycle-ui-db-20260915`, project ID `roseland-lifecycle-ui-20260915`, API/DB 63321/63322. The clean SQL project is `/private/tmp/roseland-lifecycle-sql-db-20260915`, project ID `roseland-lifecycle-sql-20260915`, API/DB 64321/64322. The runtime owns loopback proxy 3371 and built Next port 3372.

Use an environment-file-free checkout, installed locked dependencies, an unlinked disposable local project and a built application:

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/test-lifecycle-ui-runtime.ts --workdir /path/to/disposable-project
```

Add `--serve` for browser checks. Interactive fault controls are `hold`, `drop`, `unavailable`, `release`, `concurrent`, `expire`, `revoke`, `results` and `stop`. Only generated fictional credentials are printed in interactive mode. The runner refuses linked/nonloopback targets and keeps credentials in memory. Noninteractive runs work with the normal local issuer. Interactive fault testing requires this disposable project's Auth `jwt_issuer = "http://127.0.0.1:3371/auth/v1"`; browser and server then use that same proxy origin. Existing issuer validation is unchanged, and no production configuration is relaxed.

Evidence: `/private/tmp/roseland-lifecycle-ui-{platform,editor,build,runtime,sql-lint}.log`, advisor JSON/stderr, browser result log, and `/private/tmp/roseland-lifecycle-sql-db.log`. Do not publish start logs, which may contain disposable keys. The runtime shuts down its owned Next/proxy processes. Both new disposable stacks are stopped with volumes retained; the original `roseland-schedule` 543xx stack and all earlier recovery volumes remain preserved. The existing browser tab may still show the previous page; no new logout/tab-close observation was possible after the Mac locked.

Finish the pending browser acceptance before selecting a new slice. A possible subsequent bounded local task is workspace integration of the existing organization-provisioning workflow, preserving its existing MFA, recent-auth, input-bound retries and rate rules; it requires a separate scope confirmation from the coordinator, not an inferred onboarding policy. Recipient disclosure/delivery, password/MFA recovery, related ownership/sharing and broader administration remain explicit F02/F04 decisions.

Full capability/data/usability parity, latest complete inventory and per-record reconciliation, one authoritative writer, Netlify availability and proven rollback including target-side edits remain mandatory before any real-schedule migration or pilot. F01/F04/F05 limits and broader security review remain open. Preserve all checkpoints and the September 15 1:05 PM Eastern cutoff for starting new batches.
