# Roseland Schedule — Master Roadmap

> **B10-A local completion — September 18:** scoped membership suspension and reinstatement are implemented and locally accepted in [B10_A_LOCAL_ACCEPTANCE.md](./B10_A_LOCAL_ACCEPTANCE.md). This supersedes older pending-dispatch language for B10-A only. B10-B deletion/purge, exceptional recovery, hosted parity and release remain separately gated.

> **September 18 consolidated planning:** [Approved follow-on decisions](./APPROVED_FOLLOW_ON_DECISIONS.md) and [B11 source matrix](./B11_SHARING_SOURCE_MATRIX.md) settle Client-link creation/revocation, preserve ordinary row notes and exclusions, and retain only authenticated Team plus scoped Client. B15 uses free-form user testing with one build-linked consolidated notes list maintained by Voice and Planning, grouping issues and tracking fixes through user retest. **B16 must wait for explicit user functional approval after B15.** Then preserve the approved schedule look as a named/versioned selectable Roseland preset, explore/refine/select the design, apply it in bounded sections, and complete hands-on refinements. An optional separate Roseland interface preset is for evaluation, not a selected design. B17/B18 gates and numbering remain unchanged. See the [canonical design brief](./PRODUCTION_COMMAND_DESIGN_BRIEF.md).

> **Current explicit dispatch: B10-A scoped membership suspension and reinstatement.** [B09-A ordinary MFA is locally accepted](./B09_A_LOCAL_ACCEPTANCE.md) at `a662c69`. The [B09/B10 proposal](./B09_B10_NEXT_TECHNICAL_PROPOSAL.md) now records the approved role-based recovery approvers and known-phone/in-person proof; exceptional recovery execution remains separately reviewed and undispatched. B05 is locally accepted at `c356573`; B08 focused local acceptance is at `5f05bd3`, retaining the [same-account concurrency exception and evidence limits](./B08_ACCEPTANCE_DISPOSITION.md). Older audit/status entries below are historical where superseded; none authorizes provider investigation, deployment, real-data work or reskin.

> **September 16 B01 completion:** Explicitly dispatched ordinary editor save-result recovery passed its ten local cases, including genuine Auth and visible browser evidence. See [LOCAL_SAVE_RECOVERY_REVIEW.md](./LOCAL_SAVE_RECOVERY_REVIEW.md). The following audit entry remains the original proposal baseline; its B01 implementation gap is superseded by this bounded result. All hosted/parity/migration gates remain open. No automatic next-batch dispatch is part of B01.

> **September 16 technical acceptance audit:** [TECHNICAL_ACCEPTANCE_AUDIT.md](./TECHNICAL_ACCEPTANCE_AUDIT.md) is the current evidence inventory and bounded work queue at `379e066`. Local editor/workspace/lifecycle/invitation/provisioning work is completed within its documented scope. All 45 production/target parity groups remain unverified. The canceled save-recovery WIP was reverted; B01 is a proposal requiring dispatch, not ongoing work. Earlier next-step/cutoff/coordinator text is historical and grants no continuation authority.

**Confirmed brand direction (September 16, 2026):** **Production Command** is the product brand from the scheduling release onward. Neutral UI and company theming are required before real-data migration, with Roseland retained as a selectable schedule preset. The corrected execution order is technical functionality/parity/security/migration-readiness first, then the reskin, then final candidate revalidation and approved real-data migration. Broad design research and an explicit user design selection precede the reskin. See [PRODUCTION_COMMAND_DESIGN_BRIEF.md](./PRODUCTION_COMMAND_DESIGN_BRIEF.md), the canonical decision record; the older prototype does not define the design.

**Local rollback evidence (September 15):** the executed [checkpoint/replay rehearsal](./RECOVERY_REHEARSAL.md) recovers newer fictional target edits and all included schedule/related-store histories into separate frozen databases, including partial-failure rollback and idempotent retries. This advances the rollback gate without closing hosted/Auth/service recovery, actual fallback/endpoint, complete real-data coverage or production/target parity requirements. The next coherent local security slice is entrypoint review plus dedicated session-revocation/expiry races; F01–F05 remain open.

**Additional migration gates (September 15):** demonstrate rollback using known-good code and recoverable data checkpoints, including partial import failure and edits made after simulated cutover, with per-record reconciliation. Keeping Netlify available does not recover newer target edits. Complete and document a comprehensive internal security review before migration: authentication/session expiry/revocation/recovery, tenant/role and invitation/admin boundaries, direct API bypass, public-link exposure/expiry, secrets, dependencies, input validation, concurrency and backup/rollback access. Track and retest findings; distinguish verified local evidence from separately authorized hosted checks. Surface unresolved high-risk findings and required decisions. These gates remain open; do not claim perfect security or a completed external audit.

**Future consideration — independent external AI-assisted security tools:** separately evaluate tools for privacy review, vulnerability detection and protection against unauthorized access. This is unnumbered future planning, outside the current workflow and not an added blocker for the current batch. Do not start it now. Before any eventual use, review data handling and access scope and obtain applicable authorization. No installation, external scan, repository/data upload or purchase is authorized by this note; existing internal checks continue.

> **TOTAL PARITY GATE (2026-09-15): NOT PASSED.** Before beginning migration of any real schedules, verify total parity between actual current Netlify production behavior and the eventual Supabase/Vercel target runtime, then obtain explicit user approval. This includes PDF creation, printing, navigation, data entry, input-field sizing and every existing feature. Local SQL/API tests or Netlify staging results cannot satisfy this gate. Each item requires Pass/Fail/Not tested and reproducible comparison evidence; unknown/untested blocks migration. Verified improvements may Pass without copying old pixels or needing waivers solely for differing; regressions and untested required behavior block migration. Surface material workflow tradeoffs and unclear cases for user review. Synthetic rehearsals may continue within their existing authorization. See [REGRESSION_MATRIX.md](./REGRESSION_MATRIX.md).


> **Migration acceptance update (2026-09-15):** keep Netlify active and available in parallel. Every active Netlify schedule must be mirrored into Supabase/Vercel and verified individually against the latest source state immediately before switching authority. Require complete inventory, stable mappings, content/revision and related version/metadata checks, explicit missing/duplicate/mismatched/failed records, repeatable delta/final catch-up, a documented consistency boundary and verified backup/rollback. Unresolved differences block completion. Maintain one authoritative writer; post-cutover Netlify behavior requires user agreement, and independent dual writes/two-way sync are not implied. No decommissioning is authorized. See [MIGRATION_RUNBOOK.md](./MIGRATION_RUNBOOK.md).


> **Current priority (2026-09-14):** migration readiness is the near-term critical path: integrated foundation, adapters/import/reconciliation, app accounts/permissions, protected Supabase-backed Vercel pilot, then controlled cutover. Installation and offline support remain ahead of later Production Command expansion, but must not delay migration or become a new cutover prerequisite. See [MIGRATION_READINESS.md](./MIGRATION_READINESS.md) for current gaps and the smallest next implementation task.
>
> **Delivery plan:** [`INSTALLATION_OFFLINE_PLAN.md`](./INSTALLATION_OFFLINE_PLAN.md) separates existing metadata from unimplemented offline capabilities, dependencies, device decisions and release gates. This is a planning change, not implementation or rollout authorization.
>
> **Detailed plan:** see [`PLATFORM_MIGRATION_PLAN.md`](./PLATFORM_MIGRATION_PLAN.md).
>
> **Historical Next.js migration:** [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) records the completed HTML-to-Next.js migration and is retained as an archive.

## Product principles

1. Preserve the working daily schedule editor. Do not rewrite its grid, time cascade, mobile layout, print/PDF, snapshots, call sheet, contact sheet, or read-only views during the platform migration.
2. Production Command is the product brand. Daily Schedule manages one day and Call Sheet communicates one day; broader production-management capabilities extend the same product later.
3. Security, privacy, tenant isolation, backup, and recovery are release gates in every phase—not end-of-project polish.
4. Migrate through parallel environments with a tested rollback path. Netlify data is not destructively removed during cutover.
5. Use stable internal IDs. Display names must not serve as permanent database identity.
6. Prefer a strong production-specific list/timeline before building a complex calendar or Gantt.

## Approved target architecture

| Concern | Direction |
|---|---|
| Source control | GitHub remains the canonical repository and feature-branch workflow |
| Application database | Supabase-managed PostgreSQL |
| Authentication | Supabase Auth |
| Authorization | PostgreSQL Row Level Security plus server-side permission checks |
| Tenant model | Organizations/workspaces with memberships and production-level access |
| File/object storage | Supabase Storage for generated documents and attachments |
| Realtime | Supabase Realtime available later for presence/collaboration; not required for initial cutover |
| Hosting | Introduce Vercel as a parallel Next.js environment; keep Netlify live during migration and rollback window |
| Legacy storage | Netlify Blobs remains authoritative until cutover, then read-only until retirement is explicitly approved |

Approved Phase 0 assumptions: initial Supabase hosting in East US (North Virginia), AWS `us-east-1`, with global application availability; broad international-transfer disclosures; email/password, recovery, and invitation login flows; required production-specific memberships; 12-month legacy URL compatibility; a planned 1–2 hour cutover window; 30-day read-only rollback stability period; and initial RPO/RTO targets of 24/4 hours.

## ✅ Phase 0: architecture, security, and migration specification

**Status:** completed, reviewed, and approved. No production data was mutated during Phase 0.

Phase 0 documents: [`CURRENT_DATA_INVENTORY.md`](./CURRENT_DATA_INVENTORY.md), [`TARGET_SCHEMA.md`](./TARGET_SCHEMA.md), [`AUTHORIZATION_MODEL.md`](./AUTHORIZATION_MODEL.md), [`THREAT_MODEL.md`](./THREAT_MODEL.md), [`SECURITY_BASELINE.md`](./SECURITY_BASELINE.md), [`MIGRATION_RUNBOOK.md`](./MIGRATION_RUNBOOK.md), and [`REGRESSION_MATRIX.md`](./REGRESSION_MATRIX.md).

- [x] Inventory every Netlify Blob store, function/API endpoint, data shape, environment variable, public URL, cache, and local/session storage key.
- [x] Define the relational schema and stable-ID strategy.
- [x] Define organizations, memberships, roles, permissions, and public-link boundaries.
- [x] Classify stored data and document where personal or sensitive production data flows.
- [x] Produce a threat model covering tenant isolation, public links, file access, paid APIs, and administrative actions.
- [x] Define Row Level Security policies for every exposed table and storage bucket.
- [x] Define server-side validation and database-constraint rules.
- [x] Define secrets, logging, error-redaction, rate-limit, and security-header standards.
- [x] Define retention, export, deletion, backup, restore, incident-response, privacy-policy, and terms requirements.
- [x] Define migration dry run, reconciliation, cutover, rollback, and legacy URL compatibility.
- [x] Turn the current feature set into a regression suite and explicit “do not break” list.
- [x] Mark the unmerged `phase-11-production-command-planning` branch as reference/prototype work, not the future data foundation.

**Exit gate:** schema, authorization model, threat model, migration procedure, rollback procedure, and regression matrix reviewed and approved before implementation.

## Priority delivery track: installation and offline use

Migration takes scheduling priority. This track may proceed alongside it only when it does not delay the critical path; offline delivery can follow cutover. Phase numbers below remain migration workstream identifiers, not a requirement to finish every migration phase before testing installation. Execute this track before Phase 7 and later production-management expansion; the detailed gates are in [INSTALLATION_OFFLINE_PLAN.md](./INSTALLATION_OFFLINE_PLAN.md).

| Order | Deliverable | Required foundation / timing |
|---|---|---|
| I1 | Installable home-screen/desktop app validation, initially online | Select the device/package target; test existing manifest, launch, login and updates in preview. Can precede full Supabase migration. Native installer/store distribution is a separate unresolved product choice. |
| I2 | Offline viewing of selected downloaded schedules | Offline shell, durable versioned local storage, stable identity adapter and explicit private-data/access policy. Synthetic preview can precede cutover; private multi-user use requires account/tenant lifecycle controls from Phases 1–3. |
| I3 | Durable offline drafts with safe reconnect | I2 plus permission revalidation, version-checked writes, idempotent replay, history and conflict recovery. Pull these Phase 6 prerequisites forward; prove them in preview before shipping offline editing. |
| Then | Broader Production Command and production-management modules | Complete installation/offline gates for the selected target and the relevant secure platform/migration gates. |

- [ ] Confirm initial devices and whether an installed web app meets the installation requirement; do not assume native packaging is required or already provided.
- [ ] Complete I1 installation/launch/update verification.
- [ ] Complete I2 offline download, cold-start viewing and access-lifecycle verification.
- [ ] Complete I3 durable editing, restart recovery, reconnect and conflict verification.
- [ ] Extend cutover/rollback rehearsals to include installed app versions, local schema/ID mappings and pending drafts; never replay one outbox to two backend authorities.

**Current capability:** manifest/icons and Apple standalone metadata exist. No current service worker, durable offline schedule cache or reconnect outbox was found in the development app. Installation on target devices remains unverified; the Offline status label is not a promise of local persistence. Historical cache/queue descriptions do not establish current support.

**Scope boundary:** Netlify remains live and authoritative until explicit cutover approval. Installation and offline previews do not authorize production changes, hosted migrations, a native rewrite or deployments. Existing security, backup, reconciliation and rollback gates remain mandatory.

## 🟠 Phase 1: secure Supabase foundation

**Current assessment:** [MIGRATION_READINESS.md](./MIGRATION_READINESS.md) supersedes stale blockers in the September 11 status below. Dependency/CI remediation and local lifecycle tests subsequently passed; the still-separate schedule draft now conflicts with its updated auth base and is the next integration task.

**Status (September 11, 2026):** Phase 1 remains incomplete. Tenant foundation is merged. [PR #5](https://github.com/Jovestar33/roseland-schedule/pull/5) adds auth/bootstrap and server workflows on `cbdb921`; [PR #8](https://github.com/Jovestar33/roseland-schedule/pull/8), stacked on #5 at `3e0cb89`, adds schedule-domain tables/history and 45 domain assertions. Both remain drafts. Auth/bootstrap migrations were historically applied only to `roseland-schedule-dev`; the schedule migration has not been applied there according to PR #8. No live UI uses Supabase yet.

**Freeze ended September 11, 2026.** The approved restart is a documentation/readiness pass, not merge, deployment or migration authorization. See [PRODUCTION_STABILITY_POLICY.md](./PRODUCTION_STABILITY_POLICY.md).

**Current evidence and next work:** [READINESS.md](./READINESS.md) supersedes older undated readiness claims. Fresh auth tests (24), lint and build pass, but fresh runtime audits report critical/high findings on both foundation lockfiles. Address dependency/CI readiness first, then reproduced save/link issues and domain validation, mandatory optimistic writes, restore and lifecycle permissions. Docker was stopped; no fresh database or full editor/device regression was run. Historical 114 auth / 159 schedule database assertions are not current release approval.

**Historical milestones:** July 26 development TOTP and one-time Roseland Owner/operator bootstrap completed; July 29 PR #5 CI passed and Places hotfix PR #7 resolved the historical credentials. These remain dated records, not fresh hosted checks.

- [ ] Create isolated development, preview, and production Supabase environments.
- [x] Commit database migrations to GitHub.
- [ ] Complete the initial tenant-aware schema: organizations/memberships/productions are merged; profiles/invitations/audit and phases/days/schedules/versions are in draft foundations. Templates, shares and migration mappings remain planned. Keep rows/sub-locations/contacts/call-sheet fields in validated JSON initially; normalize later as needed.
- [ ] Add UUID primary keys, foreign keys, indexes, timestamps, actor attribution, optimistic version fields, and recovery-friendly deletion behavior.
- [ ] Enable RLS in the same migration that creates every exposed table.
- [ ] Implement default-deny, least-privilege policies for SELECT/INSERT/UPDATE/DELETE.
- [ ] Align Storage policies with organization/production membership.
- [ ] Keep secret/service-role credentials server-only; use only the publishable key in browser code.
- [x] Create the initial development-only Supabase Auth identity for the Roseland bootstrap rehearsal.
- [x] Enroll and verify TOTP MFA through the isolated setup page, then disable the page again.
- [x] Implement and execute the initial Roseland Owner plus restricted, audited platform-operator bootstrap without browser-level RLS bypass.
- [x] Implement disabled-by-default, server-controlled organization provisioning and invitation creation/revocation with MFA, recent-auth, idempotency, rate, role, tenant, and audit checks.
- [x] Add automated cross-tenant and role-boundary tests; extend the matrix whenever an exposed table, role, storage policy, or realtime channel is added.
- [x] Add security-advisor, dependency, and secret-scan checks; track reviewed findings and credential rotation in [`SECURITY_AUTOMATION.md`](./SECURITY_AUTOMATION.md).

**Exit gate:** User A cannot access Organization B through UI, direct API calls, guessed UUIDs, realtime channels, or storage URLs.

## 🟠 Phase 2: compatibility data layer and migration tooling

- [ ] Introduce repository/service interfaces so UI components no longer depend directly on Netlify functions.
- [ ] Provide a legacy Netlify Blob adapter and a Supabase adapter.
- [ ] Build a repeatable, non-destructive Blob export.
- [ ] Build an idempotent Blob-to-Postgres importer with dry-run mode.
- [ ] Map legacy schedule names to stable schedule IDs while preserving display names and legacy routes.
- [ ] Detect duplicates, malformed records, missing references, and orphaned snapshots.
- [ ] Produce record-count, relationship, and checksum reconciliation reports.
- [ ] Verify importer reruns do not duplicate or corrupt data.

**Exit gate:** synthetic fixtures can be imported repeatedly into a disposable environment and reconciled without changing production. Real-schedule migration additionally requires the total-parity gate and explicit user approval first.

## 🟠 Phase 3: accounts, organizations, and permissions

September 16 local status: invitation management (`2bb06f8`), acceptance (`3e5ac67`), shared session/organization navigation (`5c533cc`), lifecycle UI and browser acceptance (`67cdc0c`, `d27ccbf`) and restricted operator provisioning (`379e066`) are locally complete within their recorded scope. See [TECHNICAL_ACCEPTANCE_AUDIT.md](./TECHNICAL_ACCEPTANCE_AUDIT.md) and its evidence register. Signup/delivery, password/MFA recovery, broader administration and hosted integration remain open. Local acceptance does not complete Phase 3 or establish production/target parity. The old Mac-unlock acceptance blocker is resolved.

- [ ] Replace the shared PIN with Supabase Auth in the migration environment.
- [ ] Create the initial Roseland organization and membership flow.
- [ ] Implement Owner/Admin, Producer/Editor, and Viewer permissions; defer specialized external roles until their data views are designed.
- [ ] Add invitations, membership removal, session expiration, account recovery, and organization switching where required.
- [ ] Add account and organization export/deletion workflows.
- [ ] Add audit events for login/security changes, invitations, role changes, destructive actions, sharing, and imports.
- [ ] Test wrong-password, duplicate-signup, nonexistent reset, expired/reused link, removed-member, invitation replay, and network-failure paths.
- [ ] Prevent account enumeration and rate-limit authentication abuse.
- [ ] Support MFA for owners/admins before external organizations are onboarded.

**Exit gate:** the full authentication failure-path suite and permission matrix pass.

## 🟠 Phase 3A: neutral platform design and organization theming

Follow [PRODUCTION_COMMAND_DESIGN_BRIEF.md](./PRODUCTION_COMMAND_DESIGN_BRIEF.md). This design milestone follows verified functionality, parity, security and all technical migration/rollback prerequisites; it precedes real-data migration. The brand is confirmed; the neutral visual direction remains undecided.

- [ ] Conduct broad design research with sources and explicit usability/accessibility criteria.
- [ ] Present distinct visual directions with representative interface and document mockups, tradeoffs, and preserved Roseland preset examples.
- [ ] Record the user's selected direction and approved design-system foundation before implementing the reskin.

Execution-order override (September 16): complete technical workflows, functional parity, security and migration/rollback readiness before this reskin. A separately authorized protected synthetic-data pilot can precede it to establish hosted evidence. After the reskin, rerun affected and final release gates before any real-data migration or external customer rollout. Phase numbering does not change this order.

- [ ] Extract the current visual configuration into a versioned `Roseland Pictures` preset; do not discard or silently restyle it.
- [ ] Create a polished, neutral platform preset as the default for newly created organizations.
- [ ] Resolve the active app theme from authenticated organization context, with safe fallbacks while sessions hydrate.
- [ ] Separate app chrome, generated-document branding, and operational templates so organizations can configure them independently.
- [ ] Add validated organization tokens for name, logo, primary/accent colors, neutral surfaces, typography preset, and schedule-action colors.
- [ ] Allow deliberately limited production overrides such as production logo, title treatment, and accent color.
- [ ] Store system presets as versioned, immutable definitions; organization customizations reference or safely copy a known version.
- [ ] Migrate the existing global CMS configuration into the Roseland organization preset without changing the current live appearance.
- [ ] Use private managed assets and allowlisted design tokens; do not accept arbitrary CSS, HTML, scripts, or uploaded fonts.
- [ ] Enforce contrast, accessibility, asset type/size, and safe color/font validation on the server as well as in the UI.
- [ ] Test neutral and Roseland presets across desktop, mobile, iPad, read-only views, schedules, call sheets, contact sheets, print, and PDF.
- [ ] Keep the live Netlify app visually unchanged until both presets pass the preview regression matrix.

**Exit gate:** the neutral platform is the default for a new organization, Roseland renders as an explicit versioned preset with no regressions, customization cannot inject executable content, and both app and document themes pass accessibility/mobile/print review.

## 🟠 Phase 4: parallel deployment and pilot migration

- [ ] Deploy the Supabase-backed app to a protected Vercel preview environment.
- [ ] Keep the current Netlify production app unchanged.
- [ ] Use synthetic data in previews to establish actual Netlify-production versus Supabase/Vercel runtime parity. Import a real test production only after every parity item passes its preservation/improvement criteria and the user explicitly approves real-data migration.
- [ ] Configure and test CSP, HSTS, content-type, referrer, permissions, framing, cookie, and authenticated-cache policies.
- [ ] Add structured redacted logging, generic client errors, request IDs, monitoring, provider budget alerts, and risk-based rate limits.
- [ ] Protect public/anonymous abuse surfaces with Cloudflare Turnstile where warranted and validate tokens server-side.
- [ ] Run the complete regression matrix on desktop, mobile, iPad, print, and read-only surfaces.
- [ ] Run a backup restoration drill and rehearse rollback.

**Exit gate:** a migrated production survives editing, saving, conflict checks, snapshots, restore, print/PDF, call/contact sheets, sharing, mobile use, and a complete backup/restore exercise.

## 🟠 Phase 5: controlled schedule-system cutover

1. Take and verify a final Blob backup.
2. Run the final importer dry run and reconciliation.
3. Announce a short maintenance/read-only window.
4. Import all production records.
5. Validate counts, relationships, snapshots, links, and representative schedules.
6. Switch application traffic only after the cutover gate passes.
7. Preserve resolvers for legacy schedule and view URLs.
8. Monitor authentication, authorization, writes, paid APIs, and errors.
9. Keep Netlify available as a read-only rollback system through an agreed stability window.
10. Retire Blob writes only after explicit approval; do not automatically delete legacy data.

**Cutover gate:** the previously approved pre-migration total-parity gate remains valid for the candidate builds; RLS, authorization, auth failure, secret scan, OWASP/ASVS, migration reconciliation, backup restore, and rollback rehearsal all pass. Privacy/terms and incident ownership must be ready before unrelated external users are invited.

## 🟡 Phase 6: multi-user reliability

**Dependency override:** version-checked writes, save attribution/history, permission revalidation, idempotent replay and conflict recovery are prerequisites for I3 offline editing and must be implemented and tested before that release. Phase 6 is not a reason to postpone them until after live cutover. Presence and realtime collaboration remain later work.

- [ ] Optimistic concurrency and stale-edit warnings using database versions.
- [ ] Save attribution and activity/audit history.
- [ ] Safe conflict resolution and recovery workflows.
- [ ] Version comparison and durable snapshots.
- [ ] Presence indicators after authorization boundaries are proven.
- [ ] Expiring, revocable, scoped share links.
- [ ] Separate public/client/vendor projections; never expose full internal records by default.
- [ ] Realtime collaborative editing remains deferred until safe simultaneous editing is proven.

## 🟡 Phase 7: Production Command redesign

**The unmerged Blob-based v1 is a prototype/reference, not the merge target.** Reuse sound UI/workflow ideas only after the relational foundation exists.

Production Command v1 should be a useful operating surface:

- [ ] Production landing page and production switcher.
- [ ] Phase/day master schedule with prep, shoot, travel, hold, wrap, edit, delivery, and custom day types.
- [ ] Day status, schedule status, call-sheet status, location summary, date, call time, wrap time, and responsible owner.
- [ ] Create, duplicate, move, reorder, and open production days.
- [ ] Open the linked Daily Schedule and Call Sheet.
- [ ] Shared production information with controlled day-level overrides.
- [ ] Attention dashboard: upcoming days, unconfirmed locations, missing contacts, missing schedules, call sheets not ready, open tasks, and recent changes.
- [ ] List/timeline first; calendar/Gantt later.

## 🟡 Phase 8: structured production databases

- [ ] People, crew, departments, clients, talent/cast, contributors, and vendors.
- [ ] Locations, hotels, parking, basecamps, hospitals, airports, permits, access/load-in notes, and contacts.
- [ ] Department, group, and individual call times.
- [ ] Tasks, milestones, deliverables, documents, permits, releases, vehicles, and gear in deliberate sub-phases.
- [ ] Assign reusable records to productions, days, schedules, rows, itinerary stops, and call sheets.
- [ ] Production-level defaults feed outputs; day-specific data overrides them.

## 🟡 Phase 9: generated operational documents

- [ ] Generate call sheets from structured production/day data rather than hand-entering every field.
- [ ] Organization-selected document themes—including the Roseland preset—plus production-grade information density: compact dashboard, boxed sections, tight schedule table, and structured department/contact blocks.
- [ ] Staggered/group/department/talent/vendor call times.
- [ ] Contact sheets, client/vendor views, advance schedules, and daily production reports.
- [ ] Distribution, delivery/open/confirmation tracking, revisions, and version history.
- [ ] Server-generated PDFs only when the data and document model are stable.

## 🟡 Phase 10: project itinerary and dynamic map

- [ ] Roadtrippers-style production-level stop list and map.
- [ ] Multi-day routing across shoot locations, hotels, airports, meals, parking, fuel, basecamps, meetings, and travel days.
- [ ] Arrival/departure/duration, route order, mileage, drive time, status, and notes.
- [ ] Filters by day, phase, type, and status.
- [ ] Unrealistic travel-gap and missing-coordinate warnings.
- [ ] Optional itinerary-stop → schedule-row and schedule-row → itinerary-stop bridges.
- [ ] Keep the existing daily map lightweight; the strategic itinerary belongs to the production.

## 🟢 Later SaaS and platform phases

### Commercial layer

- [ ] Build repeatable customer-organization signup and provisioning, separate from the one-time Roseland bootstrap.
- [ ] Define plans and the full subscription lifecycle: trials, activation, plan changes, cancellation, expiration, and reactivation.
- [ ] Integrate a billing provider through server-only APIs plus signed, idempotent, replay-safe webhooks and reconciliation jobs.
- [ ] Model feature entitlements and enforce plan limits on the server and in the database, not only in the interface.
- [ ] Support the selected combination of seat, production, storage, and metered-usage limits without coupling authorization to billing-provider records.
- [ ] Add billing-owner permissions separately from production and organization-content permissions.
- [ ] Define failed-payment, grace-period, suspension/read-only, recovery, and account-reactivation rules that do not destroy customer data.
- [ ] Support applicable sales tax/VAT, invoices, credits, refunds, and a secure customer billing portal for international customers.
- [ ] Complete account and organization export and deletion workflows, including subscription termination, retention, audit, and legal-hold handling.
- [ ] Add additional-organization onboarding, preset management, and reusable organization setup templates.

### Product expansion

- [ ] Specialized Client, Vendor, Crew, and Read-only roles.
- [ ] Production templates and onboarding/import assistance.
- [ ] Budget and expense integration.
- [ ] Documents and production reports expansion.
- [ ] Realtime shared editing after conflict prevention is proven.
- [ ] Additional platform/store distribution beyond the chosen I1 installation target, if separately selected. Core installation and offline support now belong to I1–I3 above.
- [ ] AI-production workflows: prompt packs, shotboards, assets, consistency references, model/version notes, render tasks, edit milestones, and rights/licensing.
- [ ] Saluki Media/international branding, currency, tax, and localization.

## Commercial-release security gate

Before onboarding unrelated organizations or charging customers:

- [ ] Independent security review.
- [ ] Legal review of privacy, terms, subprocessors, and processing practices.
- [ ] OWASP ASVS-based verification completed and recorded.
- [ ] Cross-tenant access and authorization review.
- [ ] Account, organization, and data export/deletion validation.
- [ ] Secret, dependency, credential-leak, API-response, and log-redaction scans.
- [ ] File-upload and object-storage review.
- [ ] Rate-limit, abuse, and cost-control load tests.
- [ ] Backup recovery and incident-response exercises.
- [ ] Monitoring, alerting, and named response ownership verified.

## Working baseline that must remain protected

The deployed app already provides a mature daily schedule workflow:

- Next.js/React/TypeScript schedule editor with time cascade, fixed anchors, DnD, undo/redo, weather, sunrise/sunset, and zero-duration support.
- Library hierarchy, Move To, rename, archive/restore/delete, templates, backup, and snapshots.
- Mobile/iPad editor and print/PDF layouts.
- Google Places-assisted locations, sub-locations, short names, collapsible addresses, and map links.
- Row contacts, Contact Sheet, and CSV export.
- Client/team read-only links and polished public print view.
- Call Sheet foundation with key information, contacts, schedule summary, and isolated print/PDF output.
- Save conflict detection and Netlify eventual-consistency guards.

Completed implementation history remains documented in Git history and [`ARCHITECTURE.md`](./ARCHITECTURE.md). The roadmap no longer treats additional Blob-based polish as the default next step unless it is a critical production fix.

## Deferred and superseded work

- `phase-11-production-command-planning` contains a functional Blob-based Production Command prototype plus planning. Do not merge it into `main`; inspect and salvage selectively after Phase 6.
- Overtime notifications, public contact cards, snapshot compare/rename, and contact-per-sub-location remain deferred. Standalone installation testing and offline support have moved to the priority I1–I3 track. Library already contains search/filter/recent surfaces; further polish is deferred unless required for current use.
- Clerk was previously preferred for future auth. The approved direction now uses Supabase Auth to keep identity, RLS, storage, and realtime authorization within one platform.
- The old plan to build the Mother App on additional Netlify Blob stores before migrating is superseded.

---

*Last updated: 2026-09-14 — migration readiness confirmed as the critical path; installation/offline stays ahead of production-management expansion without delaying migration. Live cutover remains separately gated. Planning/documentation only; no implementation, merge, migration or deployment authorized.*


## Netlify billing-transition milestone

- [ ] After complete final active-schedule/related-data reconciliation, a functioning Supabase/Vercel pilot, approved cutover, successful real-use/rollback review and the agreed parallel availability period, notify the user when reducing or ending the **paid Netlify plan** is appropriate.
- [ ] Verify current provider/account plans and compare combined Vercel + Supabase costs and residual Netlify dependencies. Assess a downgrade that retains required Netlify fallback/legacy access; never assume cancellation is compatible with availability.
- [ ] Present the evidence, proposed cost/effective date and any unresolved availability tradeoff for an explicit user decision. No subscription change, purchase or shutdown is authorized.

The existing daily Supabase follow-up includes this future notification gate. Details are in [MIGRATION_RUNBOOK.md](./MIGRATION_RUNBOOK.md). Billing reduction remains downstream of migration acceptance, not a new blocker for today's local work.
