# Current Data Inventory

Status: Phase 0 baseline, 2026-07-19. This is a read-only inventory; no production data was exported or changed.

## Runtime and trust boundaries

- Next.js 15 / React 19 browser application hosted on Netlify.
- Netlify Functions are the current server boundary; Netlify Blobs is authoritative storage.
- A shared password produces an HMAC editor token. The token is stored in `sessionStorage`; a non-secret `rp_auth_flag` cookie only controls middleware redirects.
- Google Places is proxied by `app/api/places/route.ts`. The code accepts server-only `GOOGLE_PLACES_KEY` but can fall back to `NEXT_PUBLIC_GOOGLE_PLACES_KEY`.
- Browser, Netlify Functions, Netlify Blobs, Google Places, weather services, and public-link recipients are separate trust boundaries.

## Blob stores and records

| Store | Key | Value | Writers |
|---|---|---|---|
| `schedules` | schedule display name | `ScheduleData` JSON | save, move, rename, metadata migration, delete |
| `schedule-library` | current shared library key | `LibraryData` JSON | library, move, rename, delete |
| `schedule-snapshots` | derived from schedule name | snapshot collection JSON | snapshots, rename, delete |
| `schedule-templates` | `templates` | template map JSON | templates |
| `cms` | `rp_cms_config` | sanitized CMS config JSON | cms-save |

Display names currently act as storage identity. Rename therefore requires a multi-store copy/update/delete sequence and is not atomic.

## Persisted shapes

- `ScheduleData`: `meta`, `rows`, `savedAt`.
- `ScheduleMeta`: town/date/production/phase/day metadata, coordinates, cached weather, director/DP, and call-sheet data.
- `ScheduleRow`: timing, action, description, location, notes, status, contact fields, fixed-time controls, completion flag, and nested sub-locations.
- `SubLocation`: label/name/address/coordinates/description/completion.
- Snapshots: ID, timestamp, optional label, and a full schedule document.
- Library: folders, schedule-to-folder mapping, phase ordering/display names, archive state, town/date caches, and version metadata.
- Templates: named reusable schedule payloads.
- CMS: theme/action styling and supported presentation configuration.

The source-of-truth TypeScript definitions are in `lib/types.ts`; library and template transport types also live under `lib/api` and `lib/templates.ts`.

## Server endpoints

| Endpoint | Methods | Access/purpose |
|---|---|---|
| `auth` | POST | shared-password login and editor token issuance |
| `load` | GET | editor, public, or scoped view-token schedule read |
| `save` | POST | optimistic save; also contains protected delete compatibility |
| `library` | GET/POST | shared library read/write |
| `snapshots` | GET/POST | list/add/delete snapshot records |
| `templates` | GET/POST | list/save/replace/delete templates |
| `move-schedule` | POST | update schedule and library metadata |
| `rename-schedule` | POST | migrate schedule, snapshots, and library references |
| `delete-schedule` | POST | delete schedule/snapshots and repair library |
| `migrate-project-meta` | POST | patch legacy schedule metadata |
| `view-link` | GET | create a signed read-only URL |
| `cms-load` | GET | public presentation configuration |
| `cms-save` | POST | delete-PIN protected CMS update |
| `/api/places` | GET | Google Places proxy |

## Routes and public surfaces

- `/login`: shared-password login.
- `/`: authenticated library.
- `/schedule/[name]`: authenticated editor, keyed by display name.
- `/view/[name]`: public read-only route.
- `/view?v=...&vt=...`: signed read-only route.
- Legacy `?s=...` and `?v=...&vt=...` URLs are redirected by middleware and must remain resolvable through migration.
- Print/PDF, contact sheet, call sheet, map links, CSV export, and browser-generated outputs can contain production and personal data.

## Browser persistence

Canonical keys include `rp_sched_editor_token_v16`, `rp_crew`, `rp_scheds`, `rp_sched_queue`, `rp_sched_snaps`, `rp_sync_meta`, `rp_sched_deleted`, `rp_library_meta_v1`, and `rp_tpls`. Additional session keys support recent saves/adds and mutation guards; UI preferences cache collapse state, recent schedules, project/phase choices, and library-operation state.

Browser caches are compatibility/convenience data, not a future authorization boundary. Legacy template and suggestion data need an explicit import-or-retire decision.

## Environment variables and secrets

| Variable | Classification | Current use |
|---|---|---|
| `SCHEDULE_APP_PASSWORD` | secret | shared login and token verification |
| `SCHEDULE_AUTH_SECRET` | secret | HMAC editor/view tokens |
| `SCHEDULE_DELETE_PASSWORD` | secret | destructive operations and CMS save |
| `GOOGLE_PLACES_KEY` | secret | preferred Places server credential |
| `NEXT_PUBLIC_GOOGLE_PLACES_KEY` | browser-visible | current compatibility fallback |

No secret value was read during this inventory. Phase 1 must eliminate the public Places fallback and rotate any credential ever exposed to a browser.

## Data classification

- Restricted: auth secrets, future service-role keys, share-token hashes, recovery material.
- Confidential production: schedules, call sheets, unpublished locations, travel/hotel/parking/hospital details, notes, snapshots, production status.
- Personal: names, titles, phone numbers, email addresses, membership and audit records.
- Public-by-explicit-action: the minimum projection deliberately exposed through a scoped share link.
- Operational: logs, request IDs, migration manifests, checksums, reconciliation reports.

## Known constraints and migration implications

- Shared credentials cannot identify an actor or isolate organizations.
- Blob mutations spanning stores are eventually consistent and non-transactional.
- Name-keyed identity complicates rename, duplicates, links, and references.
- Full JSON responses can expose more fields than a recipient needs.
- Only `X-Frame-Options` is configured globally today; the security-header baseline is incomplete.
- Production data may remain in browser storage, generated files, logs, exports, backups, and received share links after the primary record changes.

