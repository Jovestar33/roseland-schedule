# Target Schema

Status: Phase 0 design. PostgreSQL/Supabase implementation belongs to Phase 1 and must be expressed as reviewed migrations.

## Design decision

Use relational tables for identity, tenancy, permissions, production hierarchy, metadata, sharing, and audit. Preserve the proven daily schedule document as validated `jsonb` during the initial migration. Store immutable document versions separately. Selectively normalize rows, contacts, and locations later when Production Command needs shared structured records.

This hybrid avoids coupling platform migration to an editor rewrite while establishing stable UUID identity immediately.

## Core tables

| Table | Important fields | Purpose |
|---|---|---|
| `organizations` | `id`, `name`, `slug`, timestamps, `deleted_at` | tenant boundary |
| `organization_memberships` | `organization_id`, `user_id`, `role`, status, timestamps | organization authorization |
| `productions` | `id`, `organization_id`, display fields, status, timestamps, version | production identity |
| `production_memberships` | production/user/role/status/timestamps | required production-level access for non-admin users |
| `phases` | `id`, `production_id`, name, position, type | prep/shoot/travel/etc. grouping |
| `production_days` | `id`, `production_id`, `phase_id`, date, number, type, position, status | stable day identity |
| `schedules` | `id`, tenant/production/day FKs, display name, slug, `document jsonb`, document version, timestamps, actor IDs, `deleted_at` | current editable schedule |
| `schedule_versions` | schedule/version/actor/timestamp/document/checksum/label | immutable history and recovery |
| `templates` | tenant scope, name, document, timestamps | reusable schedule templates |
| `share_links` | tenant/resource/scope/token hash/expiry/revocation/creator | revocable external access |
| `audit_events` | tenant, actor, action, resource, request ID, safe metadata, timestamp | security and destructive-action trail |
| `migration_sources` | legacy store/key/checksum/target ID/import run | idempotent legacy mapping |

Later structured tables include `people`, `departments`, `production_assignments`, `locations`, `production_locations`, `call_sheets`, `documents`, and `itinerary_stops`. They should not block the initial cutover.

## Identity and integrity rules

- UUID primary keys are permanent; display names and slugs are editable and never foreign keys.
- Every tenant-owned row carries `organization_id` directly or reaches it through a mandatory foreign key. Direct tenant columns are preferred on high-risk/exposed tables for clear RLS.
- Foreign keys define intentional `RESTRICT`, `CASCADE`, or soft-delete behavior; defaults are never accidental.
- Unique constraints cover memberships, phase/day ordering within parents, active slugs, version numbers, and legacy source mappings.
- Required strings are trimmed and length-bounded. Dates, coordinates, durations, positions, statuses, and enumerations have database checks.
- `created_at`, `updated_at`, `created_by`, and `updated_by` are server/database controlled.
- Optimistic writes require the current `document_version`; successful writes increment it transactionally and add a version row.
- Deletes are recoverable during the retention window. Purge is a separate privileged workflow.
- Share tokens are random, high entropy, and stored only as hashes.

## Schedule document contract

The JSONB document initially mirrors `ScheduleData`, but it is versioned and validated server-side. Validation must reject unknown/oversized payloads, invalid times/statuses/coordinates, excessive row or sub-location counts, and malformed contact fields. Database constraints protect relational metadata; an application schema protects the nested document.

Frequently queried metadata—date, town, phase/day, status, call/wrap time—belongs in columns and must be synchronized in one transaction with the document. The document schema receives an explicit version for future migrations.

## Storage buckets

Proposed private buckets: `generated-documents`, `attachments`, and `imports`. Object paths begin with organization UUID and production UUID. Metadata records in PostgreSQL own authorization and lifecycle. Public buckets are not used for confidential production files; downloads use authenticated checks or short-lived signed URLs.

## Index baseline

Index tenant and foreign-key columns, active memberships, production/date ordering, schedule day/status, share-token hash, expiry/revocation, audit tenant/time/resource, and migration source identity. Index JSONB only for demonstrated queries; do not index the whole schedule document by habit.

## Approved platform assumptions

- Initial Supabase region: United States; application availability: global.
- Every user has organization membership. Non-admin production access additionally requires active production membership.
- Add organization and production preferences for IANA timezone, locale, country, currency, and week start. Store instants in UTC, but store production calendar dates as local dates with an explicit production timezone.
- International addresses and phone numbers are not constrained to US formats; phone storage should support E.164 where a number can be normalized without discarding the entered display value.
- The initial schedule payload uses the hybrid JSONB design described above.

## Phase 1 implementation details still to validate

- Exact retention implementation for soft-deleted data, versions, audit events, exports, and backups under the approved policy baseline.
- Which schedule metadata columns are required for Production Command v1.
- Whether legacy browser templates and crew suggestions become private user data, organization data, or are retired.
