# Roseland Schedule — Master Roadmap

> **Current direction (approved 2026-07-19):** migrate the working single-PIN app to a secure multi-user platform before resuming Production Command feature development.
>
> **Detailed plan:** see [`PLATFORM_MIGRATION_PLAN.md`](./PLATFORM_MIGRATION_PLAN.md).
>
> **Historical Next.js migration:** [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) records the completed HTML-to-Next.js migration and is retained as an archive.

## Product principles

1. Preserve the working daily schedule editor. Do not rewrite its grid, time cascade, mobile layout, print/PDF, snapshots, call sheet, contact sheet, or read-only views during the platform migration.
2. Production Command manages the production. Daily Schedule manages one day. Call Sheet communicates one day.
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

## 🟠 Phase 1: secure Supabase foundation

**Status:** in progress. The first tenant-foundation migration is merged to `main` and applied only to `roseland-schedule-dev`. Organizations, organization memberships, productions, and production memberships have default-deny RLS; 22 local/remote authorization tests and GitHub CI pass. The live app still uses Netlify Auth/Blobs.

**Production stability freeze:** [`PRODUCTION_STABILITY_POLICY.md`](./PRODUCTION_STABILITY_POLICY.md) is active during the heavy-usage period. Migration/auth/theming work remains on feature branches and `roseland-schedule-dev`; it is not merged into `main` until the user explicitly ends the freeze.

- [ ] Create isolated development, preview, and production Supabase environments.
- [x] Commit database migrations to GitHub.
- [ ] Create the initial tenant-aware schema: organizations, memberships, productions, phases, production days, schedules, rows, sub-locations, versions, contacts, locations, call sheets, share links, and audit events.
- [ ] Add UUID primary keys, foreign keys, indexes, timestamps, actor attribution, optimistic version fields, and recovery-friendly deletion behavior.
- [ ] Enable RLS in the same migration that creates every exposed table.
- [ ] Implement default-deny, least-privilege policies for SELECT/INSERT/UPDATE/DELETE.
- [ ] Align Storage policies with organization/production membership.
- [ ] Keep secret/service-role credentials server-only; use only the publishable key in browser code.
- [ ] Implement the initial Roseland Owner plus restricted, audited platform-operator bootstrap without browser-level RLS bypass.
- [x] Add automated cross-tenant and role-boundary tests; extend the matrix whenever an exposed table, role, storage policy, or realtime channel is added.
- [ ] Add security-advisor, dependency, and secret-scan checks.

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

**Exit gate:** all current data can be imported repeatedly into a disposable environment and reconciled without changing production.

## 🟠 Phase 3: accounts, organizations, and permissions

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

This phase follows authentication and organization context and must finish before pilot migration or unrelated organizations are invited. It is intentionally earlier than the broader SaaS customization work.

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
- [ ] Use synthetic data by default in previews; import one approved test production for migration QA.
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

**Cutover gate:** RLS, authorization, auth failure, secret scan, OWASP/ASVS, migration reconciliation, backup restore, and rollback rehearsal all pass. Privacy/terms and incident ownership must be ready before unrelated external users are invited.

## 🟡 Phase 6: multi-user reliability

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

- [ ] Billing and subscription plans.
- [ ] Additional-organization onboarding, preset management, and reusable organization setup templates.
- [ ] Specialized Client, Vendor, Crew, and Read-only roles.
- [ ] Production templates and onboarding/import assistance.
- [ ] Budget and expense integration.
- [ ] Documents and production reports expansion.
- [ ] Realtime shared editing after conflict prevention is proven.
- [ ] PWA/App Store packaging improvements.
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
- Overtime notifications, Library search/sort/recent, public contact cards, snapshot compare/rename, contact-per-sub-location, and standalone PWA testing are deferred behind the platform migration unless required for current production use.
- Clerk was previously preferred for future auth. The approved direction now uses Supabase Auth to keep identity, RLS, storage, and realtime authorization within one platform.
- The old plan to build the Mother App on additional Netlify Blob stores before migrating is superseded.

---

*Last updated: 2026-07-19 — Phase 1 tenant foundation merged and protected by CI; neutral platform and organization theming moved forward to immediately follow accounts/organization context. Next session: continue Phase 1 authentication and secure Roseland bootstrap.*
