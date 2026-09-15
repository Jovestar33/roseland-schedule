# Installation and offline delivery plan

Status: planned, 2026-09-14. Source inspection of development revision `b9d6523`; no installation or airplane-mode device test was performed for this assessment. This document does not authorize implementation, deployment, migration, credential changes, or live cutover.

Migration readiness is the near-term critical path; see [MIGRATION_READINESS.md](./MIGRATION_READINESS.md). Installation and offline use precede broader Production Command and production-management expansion, but must not delay migration or become new cutover prerequisites. Offline delivery may follow cutover. Deliver them incrementally alongside the necessary platform work. The complete database migration is not a prerequisite for an installation-only preview.

## Capability boundaries and current evidence

| Capability | Existing implementation | Gap / release claim |
|---|---|---|
| Installable home-screen or desktop web app | `app/manifest.ts` declares standalone display, start URL, landscape orientation and icons; `app/layout.tsx` includes Apple web-app metadata; icons exist in `public/`. | Installation metadata is present. Install, launch, relaunch, navigation, orientation and updates on target devices remain unverified. A home-screen web app is not a native desktop/mobile package or App Store release. |
| Offline viewing | Current schedule is held in the in-memory Zustand store. Small browser stores hold preferences, recent names, library bookkeeping and legacy templates. | No service worker, offline application shell, IndexedDB schedule repository or durable downloaded-schedule reader was found in the current app. Loading schedules still requires cloud requests. A previously loaded screen is not a cold-start offline guarantee. |
| Offline editing and safe reconnect | Current development save code retains open edits after errors and tracks remote baselines/conflicts. Server writes use atomic conflict checks; snapshots and backup/import provide online recovery. | No durable local draft/outbox, restart recovery, reconnect processor or idempotent replay protocol was found. The `Offline` badge also covers generic failed requests; it does not establish connectivity or durable saving. Unsaved in-memory edits are not protected against process termination. |
| Authentication while disconnected | Current editor uses a shared-password HMAC token in sessionStorage plus a routing cookie. Supabase account/tenant foundations exist separately; the live editor has not switched to them. | No defined local access duration, offline unlock, account-scoped cache lifecycle or removed-member reconnect policy. Installing the app does not change the authentication model. |

Primary code references: `app/manifest.ts`, `app/layout.tsx`, `lib/store/scheduleStore.ts`, `lib/store/authStore.ts`, `components/AuthGate.tsx`, `lib/hooks/useSaveActions.ts`, `lib/api/load.ts`, `lib/api/save.ts`, and `components/toolbar/SyncStatusPill.tsx`. Archived HTML-era cache/queue designs in `MIGRATION_PLAN.md` are not evidence of implementation. Development readiness does not imply the live deployment has the same fixes; use `READINESS.md` for environment-specific evidence.

## Incremental delivery order

### I1 — Installation and launch, initially online

- Confirm target devices and whether a home-screen/desktop installed web app satisfies the first delivery, or a native installer/store package is required.
- Validate the existing manifest, icon quality, standalone launch, orientation, login, deep links, external navigation and app updates in a protected preview with fictional data.
- Resolve failures specific to the installed environment, including session restoration and native browser dialog behavior, within a separately approved implementation scope.
- Make the connectivity requirement explicit: this milestone provides installation and an online schedule workflow, not offline schedules.

Dependencies: selected device/browser matrix, HTTPS preview, working current authentication and editor. Supabase cutover, full relational normalization, theming, billing and Production Command are not prerequisites. A native package decision requires its own technical plan; no framework or rewrite is selected here.

Exit gate: install, launch, close/reopen and update pass on every selected target; online save and recovery remain intact. Do not advertise verified installation before device evidence exists.

### I2 — Offline viewing of explicitly downloaded schedules

- Introduce an offline application shell and a versioned local document repository, separate from HTTP response caching. Cache only allowlisted static application assets in the shell.
- Add an explicit download/remove workflow for selected schedules, with visible download completeness, last verified version/time, stale status and available-device-storage errors.
- Partition local content by environment, backend authority, account, organization and stable schedule identity. Use a repository adapter so a fictional legacy preview can run before the Supabase importer/cutover; do not make display names permanent offline identities.
- Define offline access duration, device sharing, logout/account-switch cleanup and permitted local content before using real private schedules. Keep public/share-token pages and administrative data out of the initial offline cache.
- Show last-downloaded text and approved assets while offline. Fresh weather, Places search, map routing, sharing, cloud backup and other remote services remain unavailable; label stale external information clearly.
- Keep authenticated HTTP responses `private, no-store`. Any authorized device-local document persistence is an explicit new policy exception to review in `SECURITY_BASELINE.md` and `AUTHORIZATION_MODEL.md`, not a blanket service-worker cache of API responses.

Dependencies: local schema/storage, stable identity seam, shell routing that can open without a server, and an offline access policy. Synthetic preview work can precede complete migration. Private multi-user release requires account/tenant isolation and lifecycle enforcement; the present shared credential cannot enforce per-person revocation. Full Production Command data normalization and live cutover remain unnecessary for the preview.

Exit gate: download online, disconnect, terminate/relaunch and open the selected schedule; undownloaded schedules fail clearly. Test eviction/quota failure, stale versions, logout/account switch, expired offline access, app updates and permitted field projections. Browser storage is recoverable device storage, not the sole backup.

### I3 — Durable offline drafts and safe reconnect

- First support editing existing downloaded schedules. Defer offline create/rename/move/archive/delete, membership changes, public sharing and uploads until their identity/permission semantics are designed.
- Persist a local draft and outbox atomically before reporting “Saved on this device.” Keep that status distinct from “Synced.” Retain the base server document/version, local revision, stable resource identity, schema version and a unique operation ID.
- Reconnect in the foreground with a visible manual retry path; background sync is optional enhancement, not a delivery guarantee.
- Reauthenticate and recheck current organization/production permissions before reading or replaying queued work. Pause on expired sessions; reject revoked access and never silently replay another account's drafts. Define retention/discard/recovery for inaccessible drafts under the access policy.
- Require server validation, current-version compare-and-swap, transactional history and idempotency. A lost response followed by retry must not duplicate a write; a remote edit must cause review rather than last-write-wins.
- Preserve base, local and remote versions for conflict resolution. Do not auto-merge row ordering, timing or deletions. Present deliberate resolution/copy options only where the current user has permission; any overwrite must still check the version reviewed.
- Coordinate multiple tabs/windows and serialize per-schedule replay. Cover crashes between local commit, server commit and acknowledgement, schema upgrades, app updates, partial batches, storage failure, revoked access and remote archive/delete.

Dependencies: I2 storage/access boundaries; the minimum Phase 1–3 identity, authorization and repository contracts; and conflict/history/idempotency primitives promoted from Phase 6. These must pass before multi-user offline writes ship, rather than being deferred until after cutover. Use the validated JSON schedule document initially; full relational normalization, realtime collaboration and Production Command are not required. A synthetic legacy-adapter prototype is possible, but must not invent a parallel permanent sync platform.

Exit gate: offline edits survive termination, reauthentication and reconnect; a single authorized server result is acknowledged; concurrent edits, replayed operations and revoked permissions cannot silently overwrite or leak data. Test two devices plus multiple windows and forced process/network failures. Backup/recovery and retention procedures cover pending local work.

## Small milestones for joint testing

These are implementation-sized slices, not a new approval process. Resolve the target choice first; then work through the dependencies and demonstrate each result with fictional data in preview.

| Slice | Small deliverable | Observable acceptance check | Depends on |
|---|---|---|---|
| M1 — Install and reopen | Validate/fix the existing manifest and installed launch on one chosen device; provide the minimum installation guidance needed on that device. Keep the workflow online. | Install from the preview, launch from its icon, sign in, open a fictional schedule, close/reopen and save/reload it. Document session behavior; verify app update does not discard open work. | Device/package choice and existing working preview. No database migration. |
| M2 — Offline launch | Cache the application shell with an explicit offline empty state and controlled update behavior. | After one online visit, disconnect and cold-launch the installed app. It opens a clear offline screen; missing schedules are not represented as downloaded. Reconnect/update works. | M1 and shell/cache design; synthetic data only. |
| M3 — One downloaded schedule | Add versioned local storage and download/remove for one fictional existing schedule; make the offline view read-only. | Download, disconnect, terminate/relaunch, read the same version, remove it and verify it is unavailable offline. Simulate incomplete download/quota failure and show a recoverable error. | M2, identity/repository seam and selected data projection. Private-data release additionally needs the offline access policy and account isolation. |
| M4 — Durable local draft | Enable offline edits for that existing downloaded fixture, with atomic local persistence and separate device-saved/synced status; cloud replay stays disabled until M5. | Edit offline, terminate/relaunch, recover exactly the latest locally acknowledged draft. Storage failure must not falsely report device-saved. | M3 and base-version/outbox schema. Can be prototyped with fictional data before migration. |
| M5 — Safe reconnect | Add foreground retry, authorization recheck, idempotent version-checked writes and explicit conflict recovery. | Reconnect once and verify one server update; repeat after a lost acknowledgement with no duplicate effect. Concurrent remote edits require review. Expired sessions pause; revoked access cannot write; local work follows the defined recovery policy. | M4, current permission enforcement, version/history/idempotency server contract; no live cutover or Production Command required. |

**Smallest first installation implementation slice (when it does not delay migration):** M1 on one selected device using the existing protected staging app and manifest. Inspect the actual installed launch/session behavior, correct only blockers to that path, and repeat the joint test. Do not bundle service workers, a new database, native conversion or additional production features into M1. If a native installer/store package is the first required deliverable, select the OS and packaging approach before coding; do not silently substitute a web installation.

**Blocking decisions by milestone:** the first device/package choice blocks M1. Downloaded field scope and device-access/expiry policy must be settled before private offline data is enabled, but do not block M1 or a synthetic M2–M4 prototype. Conflict review is the default for overlapping changes; collaborative auto-merge, full migration completion and broader product branding are not decisions needed to start M1.

## Access and migration constraints

RLS and server checks govern online operations; they cannot instantly revoke a copy already downloaded onto a disconnected device. Product policy must bound offline access and define what happens on reconnect, logout and device loss. Do not promise remote deletion while the device remains offline, or treat persistent storage as encryption/access control.

Do not send the same outbox to both legacy and migrated backends. Namespace drafts by authority and mapping version. Before any eventual migration, require an online sync/reconciliation window or explicit recovery/export handling for pending drafts and unavailable devices. Define how legacy IDs, local schemas and app versions migrate; prevent an old installed client from writing to a retired authority. Origin changes may require redownload or an explicit transfer procedure because browser storage is origin-scoped.

Netlify/Blobs remains authoritative until approved cutover. Keep production unchanged while developing in protected environments with fictional data by default. Preserve the existing export/import reconciliation, security, backup/restore, rollback rehearsal and explicit rollout gates; planned 1–2 hour read-only cutover, at least 12 months of legacy route compatibility and 30-day read-only rollback stability period remain in force. Do not delete legacy data or assume local drafts are included in cloud backups.

## Product decisions before implementation

1. First installation target: iPhone/iPad home-screen app, Android home-screen app, desktop installed web app, or a native installer/store package; choose the initial supported devices. Recommendation: evaluate the existing installed-web-app path first if that meets the required installation experience, without promising it meets a native-package requirement.
2. Offline scope: selected daily schedules first; decide whether private row contacts/call-sheet data and attachments may be downloaded or whether the initial view should omit them.
3. Device access policy: shared versus personal devices, maximum offline access duration, local unlock expectations, and handling of unsynced drafts after logout, revoked access or expiry. Agree this before private offline data is enabled.

## Technical references

- [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps): manifest/installation and offline support are separate work; installation can be offered without offline support.
- [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria): browser storage can be evicted or cleared; persistence requests and quota failure need explicit handling.
- [MDN Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API): support is limited, so reconnect correctness must not depend solely on background execution.
