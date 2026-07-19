# Roseland Schedule — Multi-User Platform Migration Plan

> **Status:** Phase 0 specification completed 2026-07-19; Phase 1 awaits implementation approval. No production migration has begun.
>
> **Date:** 2026-07-19
>
> **Scope:** migrate the current Next.js application from shared-PIN authentication and Netlify Blob persistence to a secure, tenant-aware Supabase/Postgres platform without disrupting the working daily schedule product.

## 1. Executive decision

Roseland Schedule will establish the multi-user platform foundation before resuming major Production Command development.

The target stack is:

- GitHub for source control, feature branches, review, and migration history.
- Supabase-managed PostgreSQL as the authoritative application database.
- Supabase Auth for accounts and sessions.
- PostgreSQL Row Level Security for tenant isolation and least-privilege data access.
- Supabase Storage for private generated documents and future attachments.
- Supabase Realtime later for authorized presence/collaboration.
- Vercel as a parallel Next.js deployment environment during migration.
- Netlify and Netlify Blobs retained as the live legacy system and rollback source until cutover is proven.

This replaces two earlier assumptions:

1. The Blob-based Production Command prototype is not the future data foundation.
2. User accounts, relational storage, roles, and tenant isolation are not postponed until after Production Command.

## 2. Why migration comes first

Netlify Blobs has been serviceable for a single shared-PIN workflow, but the app now needs capabilities that belong in a transactional relational system:

- Stable identities independent of names.
- Atomic updates and explicit relationships.
- Organization and production memberships.
- Row-level permissions.
- Multi-user edit attribution and conflict detection.
- Search and reporting across schedules, people, locations, days, and call sheets.
- Audit history, deletion, retention, and data export.
- Secure public projections and revocable links.
- Reliable migration paths for future Production Command modules.

Continuing to add Blob stores for Production Command would create another interim architecture and a larger later migration.

## 3. Non-negotiable preservation requirements

The migration must not regress:

- Schedule grid behavior and fast entry.
- Time cascade, fixed anchors, zero-duration rows, warnings, and reordering.
- Undo/redo and dirty/sync state.
- Google Places, coordinates, map links, location names/addresses, and sub-locations.
- Weather and sunrise/sunset behavior.
- Library grouping and schedule organization during transition.
- Rename, Move To, archive, restore, and recovery behavior.
- Snapshots, preview, restore, save-as-new, and conflict snapshots.
- Desktop, mobile, and iPad layouts.
- Schedule, Contact Sheet, Call Sheet, and read-only print/PDF fidelity.
- Team/client link behavior or an explicit compatible replacement.
- JSON/ZIP backup and data portability.

## 4. Security and privacy model

Security is enforced in layers. UI restrictions alone never constitute authorization.

### 4.1 Data classification

Phase 0 must classify at least:

- Account identifiers and emails.
- Production contacts, phone numbers, roles, and emails.
- Shoot dates, locations, hotels, hospitals, parking, and movement plans.
- Call-sheet emergency and safety information.
- Public/client/vendor projections.
- Authentication, invitation, reset, and share tokens.
- Audit and operational logs.
- Generated PDFs and future attachments.

For each category record its purpose, owner, storage location, access boundary, retention, export, deletion, logging rule, and public-link eligibility.

### 4.2 Tenant isolation

Every tenant-owned row carries `organization_id` directly or inherits it through an enforced foreign-key relationship. Access requires an active membership and sufficient permission.

RLS must cover SELECT, INSERT, UPDATE, and DELETE. Tests must attempt access through:

- Normal UI flows.
- Direct Supabase REST/Data API requests.
- Guessed UUIDs.
- Realtime channels.
- Storage object URLs.
- Server/API routes.
- Public share tokens.

### 4.3 Credential boundaries

- Browser code may receive only Supabase’s publishable key and intentionally public provider keys.
- Supabase secret/service-role credentials stay in server-only environments and bypass RLS, so every use requires explicit server authorization.
- Google browser keys must be restricted by domain and API; privileged or paid operations should use controlled server endpoints where practical.
- Secrets must not enter source, public environment variables, URLs, API responses, analytics, screenshots, or logs.
- Development, preview, and production secrets and databases remain separate.

### 4.4 Validation and constraints

Client validation exists for usability. Every mutation is validated again at a trusted boundary.

Validation includes:

- Shape and type.
- Length and size limits.
- Allowed enum values.
- Ownership and organization membership.
- Role/permission checks.
- Referential integrity.
- Version/conflict expectations.
- File type and size where uploads exist.
- Business invariants such as day/phase/schedule relationships.

Use shared schemas where possible and database constraints for critical invariants.

### 4.5 Abuse and cost control

Apply risk-based limits to authentication, password reset, invitations, public links, Places/geocoding, weather, exports, PDF generation, uploads, email/SMS, and future AI endpoints.

Controls include per-IP, per-user, and per-organization limits; quotas; payload/file limits; timeouts; idempotency; budget alerts; and abuse monitoring.

Turnstile is appropriate for selected public/anonymous abuse surfaces, but its token must be verified server-side. CORS is configured narrowly but is not treated as authentication or bot protection.

### 4.6 Error handling and logging

Clients receive safe, actionable messages without SQL, stack traces, secrets, provider internals, or account-enumeration clues.

Server logs use request IDs and structured context, but redact passwords, session/reset/share tokens, authorization headers, secrets, and unnecessary personal data.

### 4.7 Legal and operational readiness

Before unrelated external organizations use the system:

- Privacy policy and terms are legally reviewed.
- Data locations and subprocessors are recorded.
- Retention, export, correction, deletion, and organization-offboarding workflows exist.
- Backup/restore and incident-response procedures are tested.
- A security contact and response owner are named.

## 5. Proposed conceptual data model

The exact schema is a Phase 0 deliverable. The conceptual hierarchy is:

```text
Organization
├── OrganizationMembership
├── Production
│   ├── ProductionMembership (required for initial release)
│   ├── Phase
│   ├── ProductionDay
│   │   ├── DailySchedule
│   │   │   ├── ScheduleRow
│   │   │   │   └── SubLocation
│   │   │   └── ScheduleVersion
│   │   └── CallSheet
│   ├── Contact / Department / Assignment
│   ├── Location
│   ├── ItineraryStop / RouteLeg
│   ├── Task / Milestone
│   └── Document
├── ShareLink
└── AuditEvent
```

### Identity rules

- UUIDs are permanent internal identity.
- Names/titles are editable attributes.
- `legacy_name` or a resolver mapping preserves existing schedule URLs during migration.
- Foreign keys reference IDs, never display strings.
- Imported legacy objects record source keys and migration metadata for reconciliation.

### Schedule storage decision to validate

Phase 0 must decide whether schedule content is normalized fully into rows or stored as a versioned JSON document plus relational metadata. The likely safe first approach is hybrid:

- Relational schedule identity, ownership, metadata, version, and relationships.
- Transactional schedule document payload for compatibility with the current editor.
- Normalized production-level people, locations, days, assignments, and future reporting data.

This minimizes editor risk while avoiding name-keyed Blob identity. Normalize more schedule content only where a real query or workflow requires it.

## 6. Initial role and permission model

Keep the first model small:

| Role | Intended capability |
|---|---|
| Owner/Admin | Manage organization, members, productions, schedules, sharing, recovery, and destructive actions |
| Producer/Editor | Create and edit authorized productions, schedules, call sheets, contacts, locations, and versions |
| Viewer | View and print authorized internal content; no mutation |

Client, Vendor, Crew, Scheduler, Billing, and other specialized roles wait until their exact data projections and privacy boundaries are designed.

Prefer permission checks (`schedule:update`, `member:manage`) over scattered role-name comparisons. Organization membership establishes the tenant relationship; production membership is required initially and limits non-admin users to explicitly assigned productions. Organization owners/admins retain organization-wide administration.

## 7. Migration mechanics

### 7.1 Adapters

Introduce domain-facing interfaces rather than allowing components to know the persistence vendor:

```text
ScheduleRepository
ProductionRepository
SnapshotRepository
TemplateRepository
ShareLinkRepository
CMSRepository
```

Create a legacy Netlify implementation and a Supabase implementation. This is a migration seam, not permission to maintain two permanent backends.

### 7.2 Exporter

The exporter is read-only and repeatable. It captures:

- All schedules and metadata.
- Library metadata and ordering.
- Snapshots and templates.
- CMS configuration.
- Archive/deletion state needed for recovery.
- Share-link metadata that can be safely migrated.
- Source key, content hash, size, and export timestamp.

### 7.3 Importer

The importer must be idempotent and support dry runs. It:

- Creates stable IDs.
- Maps project/phase strings to approved relational records.
- Preserves legacy names and URLs.
- Imports schedules without changing their document semantics.
- Associates snapshots with stable schedule IDs.
- Flags duplicates, malformed data, and unresolved relationships.
- Produces a machine-readable reconciliation report.

### 7.4 Reconciliation

At minimum compare:

- Counts per entity/store.
- Schedule payload hashes.
- Snapshot counts and hashes per schedule.
- Archived/active status.
- Library production/phase placement and order.
- Representative print/read-only/call-sheet output.
- Legacy URL resolution.

### 7.5 Cutover and rollback

Cutover uses a short read-only window. A final backup and dry run precede the final import. Traffic changes only after reconciliation and security gates pass.

Netlify remains intact and read-only through a defined stability period. Rollback instructions must state how to restore routing, re-enable the legacy app safely, and handle any writes created after cutover. No legacy deletion is bundled into cutover.

## 8. Deployment model

During migration:

```text
Live legacy:       Netlify + Netlify Blobs
Migration preview: Vercel + Supabase development/preview
Future production: Vercel + Supabase production (subject to cutover approval)
```

Requirements:

- Protected preview deployments.
- No production customer data in ordinary previews.
- Separate environment variables and provider projects.
- Database migrations applied through an auditable workflow.
- Security headers and CSP tested against Supabase, Google Places/maps, weather, storage, and document output.
- Authenticated pages and API responses use safe cache policies.

## 9. Verification strategy

### Automated

- Unit tests for time and normalization logic.
- Repository contract tests against both adapters during migration.
- Database migration and constraint tests.
- RLS/authorization tests with multiple organizations and roles.
- Auth failure-path tests.
- Import idempotency and reconciliation tests.
- API validation and error-redaction tests.
- Legacy route resolver tests.
- Dependency and secret scanning.

### Manual/regression

- Real schedules of different sizes and ages.
- Desktop Chrome/Safari.
- iPhone and iPad portrait/landscape.
- Schedule print/PDF.
- Contact Sheet and Call Sheet display/print.
- Public/client views and map links.
- DnD, undo/redo, time cascade, anchors, and zero-duration rows.
- Places, weather, snapshots, restore, rename, Move To, archive, and delete.
- Session expiration and concurrent save conflicts.
- Backup restoration and rollback rehearsal.

## 10. Security release gates

### Before any migrated production data

- Threat model reviewed.
- Data classification complete.
- Schema and RLS policies reviewed.
- Preview/production separation proven.
- Export/import tools tested on synthetic fixtures.

### Before cutover

- Cross-tenant and permission tests pass.
- Auth failure-path suite passes.
- Secret and dependency scans pass.
- OWASP ASVS-based review recorded.
- Import reconciliation passes.
- Backup restoration succeeds.
- Rollback rehearsal succeeds.
- Monitoring, redaction, rate limits, and budget alerts verified.

### Before unrelated external organizations or billing

- Independent security assessment.
- Legal review.
- Export/deletion/offboarding validation.
- File/storage and public-link review.
- Incident-response exercise.
- Named security and operational ownership.

## 11. Production Command relationship

The branch `phase-11-production-command-planning` contains valuable planning and a functional Blob-based prototype. It is intentionally unmerged because its first dashboard was technically valid but not sufficiently useful, and its persistence model predates the approved multi-user migration.

After the platform foundation is stable:

- Inspect and selectively port reusable presentation and workflow ideas.
- Build Production Command against stable production, phase, day, schedule, contact, location, and membership IDs.
- Make its first screen an attention-aware production dashboard and master schedule, not a directory of links.
- Keep the Daily Schedule as the tactical editor and the Call Sheet as a generated day-level document.
- Build project itinerary/map functionality at the production level.

Do not merge the branch wholesale or extend its Blob store.

## 12. Immediate Phase 0 deliverables

The next implementation task is still documentation and inspection:

1. `CURRENT_DATA_INVENTORY.md`
2. `TARGET_SCHEMA.md` with table relationships and hybrid schedule-storage decision
3. `AUTHORIZATION_MODEL.md` with roles, permissions, and RLS policy matrix
4. `THREAT_MODEL.md`
5. `MIGRATION_RUNBOOK.md` with export/import/reconciliation/cutover/rollback
6. `REGRESSION_MATRIX.md`
7. `SECURITY_BASELINE.md` with validation, secrets, headers, logging, rate limits, scanning, privacy, backup, and release gates

No Supabase project creation, production credential changes, production export, deployment switch, or application code migration should occur until these documents are reviewed and approved.

## 13. Phase 0 decisions and operating defaults

- Host the initial Supabase project in East US (North Virginia), AWS `us-east-1`. This is a storage location, not a geographic restriction on users.
- Support global use from day one. Avoid US-only assumptions in dates, timezones, addresses, phone numbers, currency, or production locations.
- Use email/password login, email password recovery, and email invitations initially. Defer magic-link-only and social login. Make MFA available and require it for owners/admins before unrelated external users are onboarded.
- Every user belongs to an organization. Production membership is required initially for non-admin access; invitations identify organization role and initial production access.
- Use the hybrid schedule design: relational tenancy/metadata with a validated, versioned JSONB schedule document during migration.
- Preserve legacy schedule/view URL resolution for at least 12 months after cutover. New public shares are scoped, revocable, omit internal/contact data by default, and expire after 30 days unless deliberately extended. Unsafe legacy tokens are replaced rather than copied.
- Plan a 1–2 hour read-only cutover window and retain Netlify/Blobs intact and read-only for a 30-day stability period.
- Move the custom domain only after the protected Vercel pilot, regression suite, security gates, backup restoration, and rollback rehearsal pass.
- Design for worldwide availability with US hosting and broadly applicable international/cross-border transfer disclosures. Use jurisdiction-neutral core terms plus required regional supplements; do not claim universal legal compliance without qualified review.
- Initial recovery objectives are RPO 24 hours and RTO 4 hours. Phase 1 must verify that provider configuration and operating procedures can meet or improve them before production cutover.

---

*This plan supersedes the earlier strategy of extending the Mother App through additional Netlify Blob stores before introducing accounts and relational storage.*
