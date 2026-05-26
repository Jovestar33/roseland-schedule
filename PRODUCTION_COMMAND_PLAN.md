# Phase 11 — Production Command Architecture & Product Scope

*Planning document only. No code in this phase.*

---

## 1. Current-State Assessment

### 1.1 Data Model Inventory

**Schedule blob** — key = schedule name (string), stored in `schedules` Netlify Blobs store.

```
ScheduleData
  meta: ScheduleMeta
    town, date, prod, dir, dp        ← day-level crew/location fields
    lat, lng, wx                     ← day-level geo and weather
    projectName, phase               ← production grouping keys (plain text)
    dayNumber, totalDays             ← day identity within a production
    callsheet?: CallSheetData        ← optional per-day call sheet fields
  rows: ScheduleRow[]                ← operational timeline for one day
  savedAt: number
```

**Library blob** — single blob, key = `rp_library_index_v1`, stored in `schedule-library` store.

```
LibraryData
  version: 1
  folders, scheduleFolderMap        ← legacy folder system (mostly superseded by tree)
  phaseOrder                        ← { [prodKey]: { [phaseKey]: scheduleName[] } }
  productionDisplayNames            ← { [prodKey]: displayName }
  phaseDisplayNames                 ← { [prodKey]: { [phaseKey]: displayName } }
  tsarchived                        ← string[] of archived schedule names
  townCache, dateCache              ← { [scheduleName]: value } cached metadata
```

**Other stores:** `schedule-snapshots`, `schedule-templates`, `cms`

**Routes today:**
```
/                        → Library home (auth-gated)
/schedule/[name]         → Daily schedule editor (auth-gated)
/view/[name]             → Public client view (no auth)
/view?v=name&vt=token    → Token-gated read-only view
/login                   → PIN entry
```

**Netlify functions:**
```
save.js, load.js         → schedules store (key = schedule name)
snapshots.js             → schedule-snapshots store
library.js               → schedule-library store
rename-schedule.js       → touches schedules + schedule-snapshots + schedule-library
move-schedule.js         → touches schedules + schedule-library
delete-schedule.js       → touches all three
cms-save.js / cms-load   → cms store
templates.js             → schedule-templates store
places.js / view-link.js → proxy functions
```

**Key architectural fact:** There is no persistent production entity. Productions are derived entirely client-side from `meta.projectName.toLowerCase()` (the `prodKey`). A production exists only as a grouping label. It has no ID, no server-side record, and no metadata of its own beyond `productionDisplayNames` in LibraryData.

---

### 1.2 What Already Functions as Production Command

| Capability | Where It Lives | Notes |
|---|---|---|
| Production grouping | `meta.projectName` + Library `buildTree()` | Client-side derivation, no server entity |
| Phase grouping | `meta.phase` + `phaseOrder` | Same pattern |
| Day identity | `meta.dayNumber`, `meta.totalDays` | Numbers only, no day type |
| Production display names | `LibraryData.productionDisplayNames` | Key-based override |
| Phase display names | `LibraryData.phaseDisplayNames` | Key-based override |
| Cross-phase movement | Move To workflow | Writes to schedule blob + library meta |
| Safe rename | `rename-schedule.js` | Key migration; touches all stores |
| Day-level call sheet | `meta.callsheet: CallSheetData` | Per-schedule, not production-level |
| Row-level contacts | `contactName/Title/Phone/Email` per row | No database; Contact Sheet extracts |
| Row-level locations | `loc, locLat, locLng, subLocations[]` | No database; per-row only |
| Client read-only links | `/view/[name]`, `/view?v=&vt=` | Per-schedule only |
| Snapshots | `schedule-snapshots` store | Per-schedule, up to 25 |

**Design principle already in effect:** The daily schedule is operationally focused on one day. Production-level concerns are handled above it. This principle must be preserved.

---

### 1.3 Gaps Between Current Library and True Production Command

| Gap | Impact |
|---|---|
| No persistent Production entity | Can't store client name, brief, status, overall dates — they'd need to go somewhere per-schedule (wrong) |
| No day-type taxonomy | No way to distinguish shoot day from prep/travel/hold/wrap without encoding it in the schedule name or notes |
| No production-level status | Can't track whether a production is in pre-production, active shoot, post, delivered |
| No schedule linking by stable ID | `ProductionDay.linkedScheduleName` is a string blob key; rename breaks it unless rename function patches production metadata too |
| No day status per production day | No "confirmed / tentative / cancelled / completed" on a day entry above the schedule |
| No multi-day dependency model | No "if Day 3 moves, warn that Day 4 depends on it" logic |
| No master timeline / calendar view | No Gantt, no drag-reorder across the whole production |
| No production-level locations | Basecamp, hospital, recurring locations must be re-entered on every call sheet |
| No production-level contacts | Key contacts (DP, producer, etc.) live only on individual schedule rows |
| No tasks or milestones | No way to track pre-production to-dos, permit deadlines, delivery milestones |
| No itinerary / route planning | No multi-stop location journey view |
| No call sheet distribution | No way to send/share call sheets from a production level |
| Production derived, not declared | No way to create a production before any schedule exists; no way to have a production with no schedules yet |

---

## 2. Product Vision

Production Command is the layer between the Library and the daily schedule editor. It is not a replacement for either — it is a parent system.

```
Production Command
  ├── Production Dashboard      overview: dates, status, days at a glance
  ├── Day List                  ordered list of all days with type + status
  ├── Master Schedule / Gantt   movable timeline, date shifts (v2)
  ├── Itinerary / Map           multi-stop route planning (v3)
  ├── Contacts                  production-level contact database (v5)
  ├── Locations                 production-level locations database (v5)
  ├── Tasks / Milestones        tracking by phase/day/dept (v4)
  └── Documents / Settings      call sheet distribution, production info (v6)

Daily Schedule Editor           one day's operational timeline ← UNCHANGED
Call Sheet Modal                day-level production document ← UNCHANGED
Library                         flat + grouped schedule list ← UNCHANGED
```

**The daily schedule stays clean and focused on one day.**
**The call sheet stays a day-level document.**
**Production Command becomes the parent.**

---

## 3. Proposed Production Command Data Model

### 3.1 New Types (not yet in types.ts — planning only)

```typescript
// A first-class production entity
interface Production {
  id: string;                // stable UUID — never changes on rename
  prodKey: string;           // normalized projectName key — bridges to existing grouping
  title: string;             // display title
  clientName?: string;
  notes?: string;
  status?: ProductionStatus;
  // Production-level shared call sheet defaults
  callSheetDefaults?: {
    hospital?: string;
    parking?: string;
    basecamp?: string;
    emergency?: string;
  };
  createdAt: number;
  updatedAt: number;
}

type ProductionStatus =
  | 'development'
  | 'pre-production'
  | 'in-production'
  | 'post'
  | 'delivered'
  | 'archived';

// One entry in a production's day list
interface ProductionDay {
  id: string;                    // stable UUID
  productionId: string;          // parent production
  date?: string;                 // ISO date string — optional (undated hold days exist)
  type: ProductionDayType;
  typeLabel?: string;            // custom label when type = 'custom'
  title?: string;                // display title override
  phaseKey?: string;             // which production phase this day belongs to
  linkedScheduleName?: string;   // current link mechanism — schedule blob key
  // Future: scheduleId will replace linkedScheduleName when migration is ready
  status: ProductionDayStatus;
  locationSummary?: string;      // e.g., "Brooklyn Navy Yard"
  callSheetStatus?: 'not-started' | 'draft' | 'issued';
  notes?: string;
  sortOrder: number;             // manual ordering within phase
}

type ProductionDayType =
  | 'shoot'
  | 'prep'
  | 'travel'
  | 'hold'
  | 'wrap'
  | 'edit'
  | 'delivery'
  | 'custom';

type ProductionDayStatus =
  | 'tbc'
  | 'confirmed'
  | 'tentative'
  | 'cancelled'
  | 'completed';

// The top-level blob stored in the production-index store
interface ProductionIndex {
  version: 1;
  productions: Production[];
  days: ProductionDay[];      // flat array; query by productionId
  updatedAt: number;
}
```

### 3.2 Storage

**New Netlify Blobs store:** `production-index`

**New blob key:** `rp_production_v1` (single blob, same pattern as `rp_library_index_v1`)

This keeps the implementation simple for v1. At scale (hundreds of productions), a per-production key pattern is better — but for a single-team tool, one blob is correct.

**New serverless function:** `production.js` — GET/POST pattern, same HMAC auth as library.js.

No existing stores or functions change.

### 3.3 Data Ownership — What Lives Where

| Data | Lives On | Rationale |
|---|---|---|
| Day's operational timeline | `ScheduleData.rows` | Day-level; schedule editor owns this |
| Day's crew (prod/dir/camera) | `ScheduleMeta` | Day-level; may be different each day |
| Day's call time, location | `ScheduleMeta` | Day-level operational |
| Day's call sheet fields | `ScheduleMeta.callsheet` | Day-level; call sheet modal owns this |
| Day's weather | `ScheduleMeta.wx` | Day-level, fetched at call time |
| Production title, client | `Production` | Production-level |
| Production status | `Production` | Production-level |
| Call sheet defaults (recurring hospital, parking) | `Production.callSheetDefaults` | Production-level; pre-populate day call sheets |
| Day type (shoot/prep/travel…) | `ProductionDay.type` | Above the schedule; Production Command owns this |
| Day status (confirmed/tentative…) | `ProductionDay.status` | Above the schedule |
| Day → schedule link | `ProductionDay.linkedScheduleName` | Bridge field; fragile until scheduleId migration |
| Production-level contacts | `Production` (v5) | Not day-level |
| Production-level locations | `Production` (v5) | Not day-level |
| Tasks / milestones | `Production` (v4) | Not day-level |

---

## 4. Routing Model

### 4.1 New Routes

All under the `(app)` route group → auth-gated by existing middleware with no changes needed.

```
/productions                            → Production Command home: list of productions
/productions/[prodKey]                  → Production dashboard (default: day list tab)
/productions/[prodKey]/timeline         → Master schedule / Gantt (v2)
/productions/[prodKey]/map              → Itinerary / route planning (v3)
/productions/[prodKey]/contacts         → Production contacts (v5)
/productions/[prodKey]/locations        → Production locations (v5)
/productions/[prodKey]/tasks            → Tasks and milestones (v4)
```

Using `prodKey` (normalized `projectName`) in the URL for v1 keeps it compatible with the existing Library grouping scheme without requiring any schedule blob changes.

### 4.2 Unchanged Routes

```
/                        → Library home (unchanged)
/schedule/[name]         → Daily schedule editor (unchanged)
/view/[name]             → Public client view (unchanged)
/view?v=name&vt=token    → Token-gated view (unchanged)
/login                   → PIN entry (unchanged)
```

### 4.3 Navigation Integration

Two options:

**Option A (recommended for v1):** Add a "Productions" link to the Library header toolbar alongside the existing tabs. Library stays as the home screen. Productions is a new section reachable from the Library.

**Option B (future):** Make `/productions` the home screen; Library becomes a sub-view within a production or a tab at the top level.

Option A is safer — zero breaking change, zero re-training for existing users. Option B is the eventual destination; migrate when the production model is stable.

---

## 5. Module Breakdown

### v1 (Phase 11 implementation)

**5.1 Productions List (`/productions`)**
- Cards or table rows for each production
- Production title, status badge, day count, date range
- Quick-access to create a new production
- Productions derived from existing Library groupings (auto-populated) + explicit Production blobs
- Sort by status, then by most-recently updated

**5.2 Production Dashboard (`/productions/[prodKey]`)**
Default view is the Day List. Tabs reveal other modules as they are built.

**5.3 Day List (within dashboard)**
- Ordered list of all ProductionDay entries for this production
- Columns: Date | Type badge | Title | Status | Linked Schedule | Actions
- Type badges: SHOOT (red), PREP (blue), TRAVEL (purple), HOLD (grey), WRAP (teal), EDIT (orange), DELIVERY (green), CUSTOM (neutral)
- Status badges: CONFIRMED, TENTATIVE (yellow), TBC (grey), CANCELLED (strikethrough), COMPLETED (dimmed)
- Actions per day: Open Schedule, Open Call Sheet (navigates to schedule with call sheet auto-open), Edit Day, Unlink, Delete Day
- Footer: Add Day (opens inline form to set date/type/title/linked schedule)
- Day without a linked schedule shows a "Create Schedule" shortcut

**5.4 Production Settings (within dashboard)**
- Edit production title, client name, status, notes
- Call sheet defaults (recurring hospital, parking address — pre-populate any day's call sheet where those fields are blank)

### v2 (future)
**Master Schedule / Gantt** — horizontal movable timeline; drag days to shift dates; dependency warnings when a day is moved and dependents exist; date-range overview.

### v3 (future)
**Itinerary / Map** — multi-stop location planning with route visualization; day-by-day location summary; Roadtrippers-style view of a multi-day shoot.

### v4 (future)
**Tasks / Milestones** — tasks by phase/day/department; milestone tracking for key dates (permits, location confirmations, equipment delivery, lab delivery, client review).

### v5 (future)
**Production-Level Contacts Database** — reusable key contacts (DP, producer, key crew, vendors); available across all days; pre-populate relevant call sheet fields; searchable.

**Production-Level Locations Database** — saved locations (studios, recurring sets, base camps, hospitals); lat/lng stored; available across all days; link to Google Maps.

### v6 (future)
**Sharing / Roles** — call sheet distribution (email/PDF); distribution lists; role-based access (Producer / AD / Crew / Client / Vendor views).

**Documents** — attach permits, contracts, briefs, release forms to the production.

### v7 (future)
**Budget / Expense Integration** — connect shoot days and crew to budget line items.

---

## 6. Relationship to Existing Systems

### 6.1 Daily Schedule Editor
- Completely unchanged.
- Production Command links to schedules by name but does not modify schedule blobs.
- "Open Schedule" from Production Command navigates to `/schedule/[name]`.
- Schedule editor continues to be the operational tool for one day.

### 6.2 Call Sheet Modal
- Completely unchanged in Phase 11v1.
- In v2+: Production Command can pre-populate call sheet defaults (hospital, basecamp) from `Production.callSheetDefaults` when a day's `meta.callsheet` field is empty.
- "Open Call Sheet" shortcut in Production Command navigates to the schedule editor and triggers the call sheet modal — this is a URL param pattern (`?openCallSheet=1`) that the schedule editor can handle, rather than a new route.
- Call sheet distribution (emailing/sharing) is a v6 concern.

### 6.3 Library
- Library remains the primary home screen at `/` and continues to function exactly as today.
- Production Command reads the same underlying schedule data but maintains its own enrichment blob (`production-index`).
- Productions List at `/productions` can be reached from a toolbar link in the Library.
- Long-term: the Library may become a "Schedule List" sub-view within Production Command, but this is not Phase 11.

### 6.4 Contact Sheet
- Completely unchanged.
- Production-level contacts (v5) will be a separate database; row-level contacts and the Contact Sheet modal are unaffected.

### 6.5 Snapshots, CMS, Templates, Backup
- All unchanged. Production Command does not touch these.

### 6.6 Read-Only / Client Links
- Unchanged. `/view/[name]` and token-gated links remain per-schedule.
- A future production-level client link (shows all days in a production) is a v6 concern.

---

## 7. Migration Strategy

### 7.1 Phase 11v1 — Zero-Migration Approach

Production Command v1 is built on top of existing schedule names with **no migrations to existing schedule blobs**.

1. When the user first opens `/productions`, the app derives a provisional production list from the existing Library grouping (`projectName` → `prodKey`).
2. Any production the user has not explicitly "claimed" in Production Command is auto-shown in the list as a stub (title = displayName from Library, no Production blob yet).
3. When the user opens a production dashboard for the first time, a Production record is created and written to `production-index`.
4. `ProductionDay` entries are not auto-created from schedules — the user manually links or creates days in Production Command. This avoids false assumptions about day type or status.

**What this means:** Existing users see their productions listed at `/productions` with zero data loss. They can enrich them gradually by adding day metadata and linking schedules.

### 7.2 Schedule Name as Link Key (and its risks)

`ProductionDay.linkedScheduleName` = the schedule's blob key (e.g., `"Day 3 — Brooklyn Navy Yard"`).

Risk: if the user renames the schedule in the Library, the link breaks.

Mitigation: patch `rename-schedule.js` to also update `ProductionDay.linkedScheduleName` in the `production-index` blob — exactly the same pattern it already uses to update `phaseOrder` in `schedule-library`. This is a three-store write (schedules + schedule-library + production-index).

### 7.3 scheduleId Migration — Recommended for v2, Not v1

A stable `scheduleId` (UUID in `ScheduleMeta`) would make links unbreakable and enable production-level querying by ID. However:

- Every existing schedule blob would need a `scheduleId` written to it (massive write).
- All production-index `linkedScheduleName` references would need to be migrated to `linkedScheduleId`.
- The schedule editor URL (`/schedule/[name]`) would either need to change or support both name and ID lookups.

**Recommendation: defer to v2.** Add `scheduleId?: string` to `ScheduleMeta` as an optional field. Populate it silently on the next save for any schedule that doesn't have one. Build a `scheduleId → name` index as a secondary lookup. No URL changes in v2 — URLs remain `/schedule/[name]`; the ID is internal only. Full URL migration to `/schedule/[id]` is a much later architectural shift.

### 7.4 How prodKey Namespace Collision Is Handled

Two productions with the same normalized `projectName` would share a `prodKey`. Currently this is handled in the Library with `productionDisplayNames` overrides. In Production Command v1, the `prodKey` is stable per-production because each production gets a UUID `id` at creation. The URL uses `prodKey` for human-readability; if two productions share a key, the app disambiguates by `id`. This edge case is rare in practice and can be resolved with a slug-with-suffix pattern (`brooklyn-2026`, `brooklyn-2026-2`) if needed.

---

## 8. First Implementation Slice (v1 Spec)

### 8.1 New Files

```
app/(app)/productions/page.tsx               → Productions list
app/(app)/productions/[prodKey]/page.tsx     → Production dashboard
components/productions/ProductionsList.tsx   → List of all productions
components/productions/ProductionDashboard.tsx  → Dashboard shell with tabs
components/productions/DayList.tsx           → Day list view
components/productions/DayRow.tsx            → Single day row
components/productions/DayForm.tsx           → Add/edit day inline form
lib/api/productions.ts                       → getProductionIndex(), putProductionIndex()
lib/store/productionStore.ts                 → Zustand store for production data
netlify/functions/production.js              → GET/POST, same auth pattern as library.js
styles/productions.css                       → Production Command styles
```

### 8.2 Unchanged Files

Everything else. No schedule blobs touched. No Library behavior touched. No schedule editor touched. No call sheet modal touched.

### 8.3 Day Type Badge Colors (suggested)

| Type | Color |
|---|---|
| SHOOT | Red / pink-red |
| PREP | Blue |
| TRAVEL | Purple |
| HOLD | Grey |
| WRAP | Teal |
| EDIT | Orange |
| DELIVERY | Green |
| CUSTOM | Neutral grey |

These will be defined in `styles/productions.css` — not in CMS config (production types are structural, not brand-level).

### 8.4 What "Open Call Sheet" Means

When the user clicks "Open Call Sheet" on a day row:
- Navigate to `/schedule/[linkedScheduleName]?openCallSheet=1`
- The schedule editor reads `searchParams.openCallSheet` on mount and triggers the call sheet modal after load
- Requires a small addition to `ScheduleEditor` to consume this param — the only editor touch-point in v1

Alternatively, call sheet could be opened from the Production Day row as a separate modal that reads the schedule data directly. This avoids any editor change but requires a separate data load. Recommendation: the URL-param approach, because it keeps the call sheet in its natural context (the schedule editor) without duplication.

---

## 9. Questions Resolved

**What should Production Command own that the daily schedule should not?**
Production title and client, overall production status, the day-type taxonomy (shoot/prep/travel/hold/wrap/edit/delivery), day status (confirmed/tentative/cancelled), multi-day chronology, production-level contacts and locations (v5), tasks/milestones (v4), itinerary/route planning (v3), call sheet distribution (v6).

**What data remains day-level?**
The operational timeline (rows), call time, crew (prod/dir/camera), town/location, weather, day-level call sheet fields, snapshots.

**What data becomes production-level?**
Production title, client, status; call sheet defaults (hospital, parking, basecamp); contacts database (v5); locations database (v5); tasks (v4); milestones (v4).

**How should call sheets connect to Production Command?**
Day-level call sheet data stays in `meta.callsheet` (unchanged). Production Command provides: (a) a `callSheetDefaults` at the production level that pre-populates blank fields; (b) a call sheet status indicator per day; (c) an "Open Call Sheet" shortcut. Distribution and bulk issuance are v6.

**How should itinerary/map planning connect to daily schedules?**
Each ProductionDay has a `locationSummary` (plain text, v1). In v3, each day links to one or more named locations from the production locations database, which have lat/lng for route planning. The daily schedule's row-level locations remain independent and operational. The production itinerary is the higher-level "where are we going on Day 3" view; the row-level locations are "which specific address on set are we at during the 2pm slot."

**How should the current Library evolve?**
The Library stays unchanged for Phase 11. In the medium term, it becomes a "Schedules" view within or alongside Production Command. The production → phase → schedule tree in the Library is already a primitive Production Command view; Production Command builds on top of that same mental model with richer data.

**Should Library become the production home screen, or should Production Command be a separate module?**
Separate module for v1 (Library unchanged at `/`). Long-term, the Library may become a sub-view of Production Command or be replaced by a "Schedules" tab within the production dashboard. Do not merge them in v1 — it would be a large breaking change with uncertain UX payoff.

**What is the safest first build?**
Productions List + Production Dashboard (Day List only) + Production Settings + "Open Schedule" / "Open Call Sheet" links. No Gantt, no map, no permissions, no budget. This is enough to replace the mental model of "a production is just a projectName label" with "a production is a first-class entity with structured days."

**What should absolutely be deferred?**
Gantt/calendar drag, route planning, permissions/roles, budget, call sheet distribution, production-level contacts/locations database, tasks, server-side PDF, scheduleId migration, multi-user collaboration, App Store packaging.

---

## 10. Risks and Limitations

| Risk | Severity | Mitigation |
|---|---|---|
| `prodKey` namespace collision | Low | UUID `id` disambiguates; slug-with-suffix if needed |
| Schedule rename breaks `linkedScheduleName` | Medium | Patch `rename-schedule.js` to update production-index (same pattern as library update) |
| Library and Production-index diverge | Medium | Both are derived from same underlying schedules; divergence is cosmetic (Library shows grouping; Production Command shows enrichment). No sync required for v1. |
| Netlify Blobs eventual consistency on production-index | Medium | Same sessionStorage pending-mutation guard pattern as Library |
| `openCallSheet=1` URL param adds editor complexity | Low | Small addition to `ScheduleEditor`; clearly scoped, easy to revert |
| Single production-index blob size | Low | Fine for single-team use; per-production key pattern for scale later |
| Users confused about Library vs Productions | Medium | Clear navigation labels; Library = "manage schedules"; Productions = "manage productions." Eventually consolidate. |
| prodKey in URLs (not ID) means URL breaks on display name rename | Low | `prodKey` is the normalized key, not the display name. Display name renames don't change `prodKey`. |

---

## 11. Recommended Future Phases After v1

| Phase | Label | What It Adds |
|---|---|---|
| v1 | Production Command Foundation | Productions list, day list, day types, status, link to schedules, call sheet shortcut, call sheet defaults |
| v2 | Calendar / Gantt | Draggable day timeline, date shifts, basic dependency warnings, calendar view |
| v3 | Itinerary / Map | Multi-stop location planning, route visualization, location database v1 |
| v4 | Tasks / Milestones | Task tracking by phase/day/department, milestone dates, delivery tracking |
| v5 | Contacts & Locations Database | Production-level reusable contacts and locations; link to call sheet fields |
| v6 | Sharing / Documents | Call sheet distribution, distribution lists, attachments, role-based sharing |
| v7 | Budget Integration | Connect days/crew/locations to budget line items |

---

## 12. Testing Strategy for v1

- Create a production from the Library's existing projectName grouping → verify it appears in Productions List with correct schedule count.
- Manually create a ProductionDay (shoot day, confirmed, with date and linked schedule) → verify it appears in the Day List in the correct order.
- Open Schedule from a Day row → verify navigation to `/schedule/[name]`.
- Open Call Sheet from a Day row → verify navigation to schedule with call sheet auto-open (once `openCallSheet` param is implemented).
- Rename a schedule from the Library → verify the `linkedScheduleName` in production-index is patched and the day still links correctly.
- Edit production title → verify change is saved and displayed.
- Refresh browser → verify production and day data persist.
- Verify Library is completely unaffected: all existing Library actions (archive, restore, rename, move, DnD reorder, delete) work exactly as before.
- Verify daily schedule editor, call sheet, contact sheet, snapshots, print, and public view are all unaffected.
- Verify that existing schedules without any Production Command interaction continue to work through the Library exactly as before.

---

*Phase 11 planning complete. No code implemented. Awaiting implementation approval.*
*Branch: `phase-11-production-command-planning`*
*Last updated: 2026-05-26*
