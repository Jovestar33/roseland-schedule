# Roseland Schedule — Next.js Migration Plan

> **Status:** Planning — do not merge to `main` until feature parity is verified.
> **Main branch:** Golden locked baseline, live on Netlify. Do not touch.
> **Migration branch:** `next-app-migration-v2` (to be created fresh off `main`)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Original App Audit](#2-original-app-audit)
3. [Current Migration Branch Audit](#3-current-migration-branch-audit)
4. [Gap Analysis](#4-gap-analysis)
5. [Tech Stack Decisions](#5-tech-stack-decisions)
6. [Proposed File Structure](#6-proposed-file-structure)
7. [TypeScript Types](#7-typescript-types)
8. [Routing Plan](#8-routing-plan)
9. [Migration Phases](#9-migration-phases)
10. [SaaS Architecture](#10-saas-architecture)
11. [Feature Roadmap Beyond Parity](#11-feature-roadmap-beyond-parity)
12. [Decisions Needed Before Coding](#12-decisions-needed-before-coding)

---

## 1. Executive Summary

The original app is a **5,247-line monolithic `index.html`** with inline CSS and JavaScript — a fully-featured, production-grade schedule editor used by Roseland Pictures. It is live on Netlify and must remain untouched throughout this migration.

The existing `next-app-migration` branch is **~15–20% complete**: a UI shell with basic local state, but no backend integration, no time logic, no action system, and no advanced features. It is not a viable starting point. The plan is to start fresh on a new branch.

The goal is:
- **Phase 1:** Feature-complete Next.js migration that exactly replicates the original app
- **Phase 2:** SaaS product sold to other production companies, with multi-user accounts, org management, and billing

The existing Netlify backend functions are **production-quality and will be kept as-is** throughout the migration. The frontend is rebuilt around them.

---

## 2. Original App Audit

### 2.1 Technology

- Single `index.html` file (~5,247 lines)
- Inline CSS (~1,500 lines)
- Inline JavaScript (~3,700 lines)
- No build step, no dependencies, no bundler
- Deployed directly to Netlify static hosting
- Backend: 8 Netlify Functions (Node.js) using Netlify Blobs for storage

### 2.2 Data Model

**Schedule metadata (`getMeta()`):**
```js
{
  town: string,       // Main location / town name
  date: string,       // Shoot date
  prod: string,       // Producer name
  dir: string,        // Director name
  dp: string,         // Director of Photography
  lat: number | null, // Latitude from Google Places
  lng: number | null, // Longitude from Google Places
  wx: object | null   // Weather data from Open-Meteo
}
```

**Schedule row (`makeRow()`):**
```js
{
  action: string,       // Selected from ACTIONS dropdown
  otherText: string,    // Custom label when action === 'Other'
  desc: string,         // Description / long-form text
  loc: string,          // Location name
  locLat: number|null,  // Latitude from Google Places
  locLng: number|null,  // Longitude
  notes: string,        // General notes
  status: string,       // Booking/on-set status notes
  contactName: string,
  contactTitle: string,
  contactPhone: string,
  contactEmail: string,
  timeIn: string,       // 12-hour format, e.g. "7:00 AM"
  dur: string,          // Duration, e.g. "1:30"
  done: boolean,        // Mark row as completed (fades row)
  sunLocked: boolean,   // Row locked to sunrise/sunset time
  fixedIn: boolean,     // Lock Time In value
  fixedOut: boolean,    // Lock Time Out value
  fixedOutTime: string  // Manual Time Out override when fixedOut is true
}
```

**Full schedule payload (`buildCurrentScheduleData()`):**
```js
{
  meta: ScheduleMeta,
  rows: ScheduleRow[],
  savedAt: number  // Date.now()
}
```

### 2.3 Actions List

```js
const ACTIONS = [
  '', 'Crew Call', 'Cast Call', 'Briefing / Meeting', 'Breakfast',
  'Move to Location', 'Set Up', 'Move / Set Up', 'Shoot', 'Tear Down / Pack Up',
  'Move', 'LUNCH', 'Dinner', 'WRAP', 'Move to Hotel', 'Drive to Next Town',
  'Location Scout', 'Time Off', 'Rest of Day Off', 'Day Off', 'Drive Home', 'Other'
];
```

Default on new row: `'Move / Set Up'`

### 2.4 Action Color Classes

```js
const CMS_ACTION_STYLES = [
  { cls: 'aShoot',     defBg: '#fce7f3', defText: '#9d1468' },
  { cls: 'aLunch',     defBg: '#fef9c3', defText: '#854d0e' },
  { cls: 'aDinner',    defBg: '#fff1f2', defText: '#9f1239' },
  { cls: 'aWrap',      defBg: '#dcfce7', defText: '#166534' },
  { cls: 'aDayOff',    defBg: '#f0fdf4', defText: '#15803d' },
  { cls: 'aDrive',     defBg: '#eff6ff', defText: '#1d4ed8' },
  { cls: 'aMove',      defBg: '#f5f3ff', defText: '#6d28d9' },
  { cls: 'aCrewCall',  defBg: '#fff7ed', defText: '#c2410c' },
  { cls: 'aBreakfast', defBg: '#fefce8', defText: '#a16207' },
  { cls: 'aBreak',     defBg: '#f0fdf4', defText: '#166534' },
  { cls: 'aSetup',     defBg: '#faf5ff', defText: '#7e22ce' },
  { cls: 'aOther',     defBg: '#f1f5f9', defText: '#475569' }
];
```

### 2.5 CSS Design Tokens

```js
const CMS_COLORS = [
  { key: '--pink',       def: '#e91e8c' },
  { key: '--pink-dark',  def: '#9d1468' },
  { key: '--pink-light', def: '#f472b6' },
  { key: '--black',      def: '#111111' },
  { key: '--row-even',   def: '#fdf4f9' },
  { key: '--row-hover',  def: '#fce7f3' },
  { key: '--g100',       def: '#f4f4f5' }
];
// Gray scale: --g50 through --g800
// Fonts: --fd (Bebas Neue), --fb (DM Sans)
```

### 2.6 Storage Keys

| Key | Storage | Purpose |
|---|---|---|
| `rp_sched_editor_token_v16` | sessionStorage | Auth token |
| `rp_crew` | localStorage | Crew name autocomplete |
| `rp_scheds` | localStorage | Local schedule cache |
| `rp_sched_queue` | localStorage | Offline sync queue |
| `rp_sched_snaps` | localStorage | Local snapshot cache |
| `rp_sync_meta` | localStorage | Sync metadata |
| `rp_sched_deleted` | localStorage | Delete tombstones |
| `rp_library_meta_v1` | localStorage | Library/folder metadata |
| `rp_tpls` | localStorage | Templates |
| `rp_notif_dismissed` | localStorage | Dismissed notifications |
| `rp_notif_fired` | localStorage | Fired notifications |

### 2.7 Netlify Function API Contracts

All functions live at `/.netlify/functions/{name}`.

**`POST /auth`**
```
Body:    { password: string }
Returns: { ok: boolean, token?: string, error?: string }
```

**`GET /load`**
```
Query:   ?name=&editorToken=&viewToken=&_=timestamp
Returns: { meta, rows, savedAt } | null (404 = not found)
```

**`POST /save`**
```
Body:    { name, data, editorToken, deleted?, deletePassword?,
           force?, expectedSavedAt?, expectedHash? }
Returns: { ok, conflict?, savedAt? }
```

**`GET /view-link`**
```
Query:   ?name=&editorToken=
Returns: { viewToken: string, error?: string }
```

**`GET /library`**
```
Query:   ?editorToken=&t=timestamp
Returns: { schedules: LibraryEntry[], folders: string[] }
```

**`POST /library`**
```
Body:    { editorToken, library: LibraryMeta }
Returns: { ok: boolean }
```

**`GET /snapshots`**
```
Query:   ?editorToken=&name=&t=timestamp
Returns: { snapshots: Snapshot[] }
```

**`POST /snapshots`**
```
Body:    { editorToken, name, action: 'add'|'delete',
           snapshot?: { id, savedAt, label, data }, snapshotId?: string }
Returns: { ok: boolean }
```

**`GET /cms-load`**
```
No params
Returns: { actions, actionStyles, colors, labels, logo }
```

**`POST /cms-save`**
```
Body:    { pin, verify?, actions?, actionStyles?, colors?, labels?, logo? }
Returns: { ok: boolean, error?: string }
```

### 2.8 Full Feature Inventory

**Core editor:**
- Single-day production schedule editor
- Schedule name, save, load, Save As
- Metadata: date, town, producer, director, DP, weather, sunrise/sunset
- Schedule grid: action, description, location, notes, status, contacts, time in, duration, time out, done
- Add row, delete row, reorder rows (drag-and-drop desktop; button-based tablet)
- Action dropdown with 22 presets + custom "Other"
- Default new row action: Move / Set Up
- Location input with Google Places autocomplete + map button
- Notes popup, Booking Status popup, Contact popup (with call/email launchers)
- Undo / redo (stack limit: 80)
- Unsaved-change tracking

**Time logic:**
- Duration-based Time Out calculation (Time Out = Time In + Duration)
- Editable Time In
- Fixed Time In lock (left-arrow icon)
- Fixed Time Out lock (right-arrow icon)
- Sunrise/sunset locked rows
- Full recalculation cascade after any row edit or reorder
- All lock states preserved through save/load

**Library / Projects:**
- Schedule library synced to Netlify Blobs
- Folder/project organization, Uncategorized bucket
- Cross-device sync
- Open, close, Save As new schedule
- Duplicate entry prevention, delete sync fix

**Save / sync / protection:**
- Save/load through Netlify Blobs (cloud)
- Local browser cache (localStorage)
- Offline save queue with retry
- Export current schedule JSON
- Export full library JSON
- Import JSON
- Server-side overwrite protection (hash + savedAt comparison)
- Conflict dialog: overwrite remote / save as copy / reload remote / cancel

**Snapshots / versions:**
- Cloud snapshots + local fallback cache
- Auto-snapshot every 5 minutes
- Manual snapshot with notes/label
- Versions tab: list, visual preview, restore, save as new schedule, delete
- Snapshot list order preserved

**Read-only / vendor links:**
- Team edit links (`?s=ScheduleName`)
- Client/vendor read-only links (`?v=ScheduleName&vt=ViewToken`)
- Read-only users cannot save or edit
- Read-only print still works

**Print / PDF:**
- Dedicated print.css (preserved exactly — treat as sensitive)
- Laptop/desktop and mobile/tablet print both work
- Visible Time Out column, no right-side cutoff
- No spurious second page in mobile landscape
- Current print header/weather/meta layout preserved
- Default PDF filename will eventually include schedule name + version

**CMS:**
- Logo upload (base64 storage)
- Custom action labels (rename "Crew Call" → "Cast Arrival" etc.)
- Per-action background + text color theming
- UI element label customization
- PIN-based CMS access

**Authentication:**
- HMAC-SHA256 editor token (app password → token → sessionStorage)
- View token (schedule-specific, read-only, passed in URL)
- Delete password for schedule deletion

**Offline / sync:**
- localStorage schedule cache
- Offline save queue
- Conflict detection via hash + timestamp
- Sync status indicator: synced / pending / syncing / offline / conflict
- Manual retry + auto-retry

---

## 3. Current Migration Branch Audit

### 3.1 File Tree (`next-app-migration` branch)

```
/
├── app/
│   ├── components/
│   │   └── ScheduleApp.tsx       (~400 lines — monolithic, no sub-components)
│   ├── globals.css               (Tailwind v4 + minimal CSS vars)
│   ├── layout.tsx                (still says "Create Next App" in metadata)
│   └── page.tsx                  (renders <ScheduleApp /> only)
├── netlify/functions/            (all 8 functions copied, none called from frontend)
├── styles/                       (original CSS copied but NOT imported anywhere)
│   ├── base.css
│   ├── app-shell.css             (empty)
│   ├── mobile.css
│   └── print.css
├── scripts/
│   └── utils.js                  (time utilities — NOT imported by React)
├── package.json                  (Next 16.2.6, React 19, Tailwind v4)
└── next.config.ts                (empty)
```

### 3.2 What Works

| Feature | Status |
|---|---|
| Next.js app shell renders | ✅ |
| Basic table (timeIn, timeOut, action, location, notes) | ✅ |
| Add / delete rows | ✅ |
| Edit schedule metadata | ✅ |
| Save draft to localStorage | ✅ |
| Load draft from localStorage on startup | ✅ |
| New schedule with confirmation dialog | ✅ |
| "Unsaved changes" indicator | ✅ |
| All 8 Netlify backend functions (copied) | ✅ |

### 3.3 What's Missing

- Action dropdown with presets — plain text input only
- Time validation and duration auto-calculation
- All Netlify function integration — none called
- Authentication / login modal
- Contact modal, status modal, notes modal
- Library browser with folders
- Snapshot / version history UI
- Row reordering (drag-and-drop)
- Read-only view mode
- Google Places autocomplete
- Weather + sunrise/sunset rows
- Row locking (fixedIn, fixedOut, sunLocked)
- CMS panel
- Template system
- Undo/redo
- Offline sync queue + conflict detection
- Print CSS (original files not imported)
- Mobile/tablet responsive layout
- Crew member autocomplete
- Share links

### 3.4 Data Model Gap

Original `makeRow()` has **17 fields**. Current migration row type has **5 fields** (70% missing):

| Fields | Original | Migration |
|---|---|---|
| action, timeIn, timeOut, location, notes | ✅ | ✅ |
| desc, otherText | ✅ | ❌ |
| contactName, contactTitle, contactPhone, contactEmail | ✅ | ❌ |
| status, done | ✅ | ❌ |
| locLat, locLng | ✅ | ❌ |
| dur | ✅ | ❌ |
| sunLocked, fixedIn, fixedOut, fixedOutTime | ✅ | ❌ |

### 3.5 Verdict

The existing `next-app-migration` branch is not a viable base. Starting fresh from `main` is the correct approach.

---

## 4. Gap Analysis

### Critical Missing (app non-functional without these)

| Feature | Impact |
|---|---|
| Action dropdown with presets | Users can't select action type |
| Time validation + duration calculation | Time Out is never computed |
| Netlify Blobs integration (save/load) | No cloud persistence |
| Authentication | No access control |
| Row reordering | Can't sequence the day |

### High Priority Missing

| Feature | Impact |
|---|---|
| Contact modal | Can't store location/crew contact info |
| Status modal | Can't track booking status |
| Library browser | Can't navigate between schedules |
| Snapshot system | No version history |
| Row locking | Can't lock critical times |
| Read-only view | Can't share with clients/vendors |

### Medium Priority Missing

| Feature | Impact |
|---|---|
| Google Places autocomplete | Manual location entry only |
| Weather + sunrise/sunset | Missing key scheduling data |
| CMS panel | No branding customization |
| Template system | No reusable schedule templates |
| Undo/redo | No change recovery |
| Offline queue + conflict dialog | Data loss risk |
| Print layout | PDFs broken |
| Mobile/tablet responsive | Unusable on set devices |

---

## 5. Tech Stack Decisions

| Concern | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15, App Router | Real routes, RSC for read-only view, API routes for future SaaS |
| Language | TypeScript throughout | Full type coverage required per roadmap |
| Styling | **Port original CSS as plain `.css` files — no Tailwind** | Preserves exact visual identity; `print.css` treated as sacred; avoids full redesign risk |
| State | Zustand | Best fit for undo/redo stack, sync queue, offline state, CMS config across deep component trees |
| Drag-and-drop | `@hello-pangea/dnd` | Active fork of react-beautiful-dnd; handles both mouse (desktop) and touch (iPad/tablet) |
| Auth Phase 1 | Existing HMAC token wrapped in Zustand auth store | Keep existing `auth.js` function as-is; abstraction layer allows swap to Clerk/Auth.js post-parity without component changes |
| Auth Phase 2 (SaaS) | Clerk (recommended) | Handles invites, org management, roles, SSO out of the box |
| Fonts | `next/font/google` — Bebas Neue + DM Sans | Self-hosted subset, matches original exactly |
| Deploy | Netlify (existing) | `netlify.toml` with deploy previews on migration branch; `main` stays live |

---

## 6. Proposed File Structure

```
/
├── app/
│   ├── layout.tsx                    ← Root HTML, fonts, CSS imports, ToastProvider
│   ├── globals.css                   ← @import all style layers in cascade order
│   │
│   ├── (auth)/
│   │   ├── layout.tsx                ← Unauthenticated shell (no nav/toolbar)
│   │   └── login/
│   │       └── page.tsx              ← Login form → token → redirect to /
│   │
│   ├── (app)/
│   │   ├── layout.tsx                ← Auth gate: redirect to /login if no token
│   │   ├── page.tsx                  ← Library / Home (replaces modal-first startup)
│   │   └── schedule/
│   │       └── [name]/
│   │           ├── page.tsx          ← Schedule editor
│   │           └── print/
│   │               └── page.tsx      ← Print-only layout (no toolbar, no modals)
│   │
│   └── view/
│       └── page.tsx                  ← Read-only view, reads ?v=&vt= params
│                                        (handles legacy links — no redirect needed)
│
├── components/
│   ├── schedule/
│   │   ├── ScheduleEditor.tsx        ← Outer container, loads from store on mount
│   │   ├── ScheduleHeader.tsx        ← Date, town, prod/dir/dp, weather strip
│   │   ├── WeatherStrip.tsx          ← Open-Meteo display, last updated, refresh btn
│   │   ├── ScheduleGrid.tsx          ← DnD context wrapper + table shell
│   │   ├── ScheduleRow.tsx           ← Single draggable row
│   │   ├── ActionCell.tsx            ← ACTIONS dropdown + otherText input
│   │   ├── TimeInCell.tsx            ← Input + fixed-in lock toggle (left-arrow icon)
│   │   ├── DurationCell.tsx          ← Input, drives time-out recalc cascade
│   │   ├── TimeOutCell.tsx           ← Computed display + fixed-out lock (right-arrow icon)
│   │   ├── LocationCell.tsx          ← Google Places autocomplete + map button
│   │   ├── DescriptionCell.tsx
│   │   ├── NotesCell.tsx             ← Inline truncated + opens NotesModal
│   │   ├── StatusCell.tsx            ← Opens StatusModal
│   │   ├── ContactCell.tsx           ← Opens ContactModal
│   │   ├── DoneCell.tsx              ← Checkbox, fades row when checked
│   │   ├── RowControls.tsx           ← Drag handle, add below, delete, sun-lock toggle
│   │   └── SunriseSunsetRow.tsx      ← Non-editable solar time marker row
│   │
│   ├── modals/
│   │   ├── Modal.tsx                 ← Base wrapper (portal, backdrop, Escape key)
│   │   ├── ContactModal.tsx          ← name/title/phone/email + call/email action buttons
│   │   ├── StatusModal.tsx           ← Booking/on-set status textarea
│   │   ├── NotesModal.tsx            ← Full notes popup
│   │   ├── SaveAsModal.tsx           ← Name input + folder picker
│   │   ├── ConflictModal.tsx         ← Overwrite / save as copy / reload / cancel
│   │   ├── SnapshotModal.tsx         ← List, visual preview, restore, save-as-new, delete
│   │   ├── ShareLinkModal.tsx        ← Editor link + read-only link + copy buttons
│   │   └── DeleteConfirmModal.tsx
│   │
│   ├── toolbar/
│   │   ├── EditorToolbar.tsx         ← New / Library / Save / Save As / Snapshot / Share / Print
│   │   ├── SyncStatusPill.tsx        ← synced / pending / syncing / offline / conflict
│   │   └── UndoRedoButtons.tsx
│   │
│   ├── library/
│   │   ├── LibraryPage.tsx           ← Full library/home view
│   │   ├── LibraryToolbar.tsx        ← New schedule, import, export, search, sort/filter
│   │   ├── FolderList.tsx            ← Folder CRUD sidebar
│   │   └── ScheduleCard.tsx          ← Name, date, folder badge, open/delete actions
│   │
│   ├── cms/
│   │   ├── CMSPanel.tsx              ← PIN gate + tabs: Actions / Colors / Labels / Logo
│   │   ├── ActionStyleEditor.tsx     ← Label + bg/text color per action class
│   │   ├── LabelEditor.tsx           ← Rename UI element labels
│   │   └── LogoUpload.tsx            ← Base64 logo storage + preview
│   │
│   └── ui/
│       ├── Toast.tsx
│       ├── ToastProvider.tsx         ← Context + queue management
│       └── Button.tsx
│
├── lib/
│   ├── api/                          ← Typed fetch wrappers over /.netlify/functions/*
│   │   ├── auth.ts                   ← postAuth(password) → token
│   │   ├── schedules.ts              ← loadSchedule, saveSchedule, deleteSchedule
│   │   ├── library.ts                ← getLibrary, saveLibrary
│   │   ├── snapshots.ts              ← getSnapshots, addSnapshot, deleteSnapshot
│   │   ├── cms.ts                    ← getCMS, saveCMS
│   │   └── viewLinks.ts              ← getViewLink
│   │
│   ├── store/
│   │   ├── scheduleStore.ts          ← rows[], meta, undoStack[], redoStack[], dirty flag
│   │   ├── authStore.ts              ← token, isAuthenticated, login(), logout()
│   │   ├── syncStore.ts              ← status, offlineQueue[], conflictState
│   │   └── cmsStore.ts               ← config, injectCSSVars(), loaded flag
│   │
│   ├── hooks/
│   │   ├── useSchedule.ts            ← load/save/saveAs/newSchedule operations
│   │   ├── useSync.ts                ← queue processor, retry, offline detection
│   │   ├── useUndoRedo.ts            ← pushState(), undo(), redo(), limit=80
│   │   ├── useAutoSnapshot.ts        ← 5-min interval, calls addSnapshot
│   │   ├── useWeather.ts             ← Open-Meteo fetch, sunrise/sunset parse
│   │   ├── useGooglePlaces.ts        ← Places autocomplete, lat/lng extraction
│   │   └── useLocalDraft.ts          ← localStorage mirror of schedule state
│   │
│   ├── time.ts                       ← t12m, m12, durm (ported to TS) + recalcRows()
│   ├── hash.ts                       ← Deterministic schedule hash for conflict detection
│   ├── rowNormalizer.ts              ← makeRow(), validate/coerce all row fields
│   ├── constants.ts                  ← ACTIONS[], CMS_COLORS[], CMS_ACTION_STYLES[], defaults
│   └── types.ts                      ← All shared TypeScript types (see Section 7)
│
├── styles/
│   ├── tokens.css                    ← --pink, --g100–g800, --fd, --fb, breakpoint vars
│   ├── base.css                      ← Buttons, inputs, panels, scrollbars
│   ├── schedule-grid.css             ← Table, cells, action color classes, lock icons
│   ├── modals.css                    ← All modal overlays and content areas
│   ├── toolbar.css                   ← Header, toolbar bar, sync pill
│   ├── library.css                   ← Library/home page layout
│   ├── mobile.css                    ← All 3 breakpoints: <480px, 480–760px, 761–1400px
│   └── print.css                     ← PRESERVED EXACTLY from original — do not modify
│
├── netlify/
│   └── functions/                    ← ALL 8 ORIGINAL FUNCTIONS — ZERO CHANGES
│       ├── auth.js
│       ├── load.js
│       ├── save.js
│       ├── snapshots.js
│       ├── library.js
│       ├── cms-load.js
│       ├── cms-save.js
│       └── view-link.js
│
├── public/
│   ├── manifest.json                 ← Stubbed now; full PWA config added later
│   └── icons/
│
├── middleware.ts                     ← Legacy query-param redirects (see Section 8)
├── .env.local                        ← gitignored — SCHEDULE_APP_PASSWORD, SCHEDULE_AUTH_SECRET,
│                                        SCHEDULE_DELETE_PASSWORD, NEXT_PUBLIC_GOOGLE_PLACES_KEY
├── .gitignore                        ← node_modules, .next, .netlify, .env.local
├── netlify.toml                      ← Build command, publish dir, deploy previews
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## 7. TypeScript Types

All types live in `lib/types.ts` and mirror the original app's data model exactly.

```typescript
// Mirrors original makeRow() — all 17 fields
interface ScheduleRow {
  action: string;
  otherText: string;
  desc: string;
  loc: string;
  locLat: number | null;
  locLng: number | null;
  notes: string;
  status: string;
  contactName: string;
  contactTitle: string;
  contactPhone: string;
  contactEmail: string;
  timeIn: string;
  dur: string;
  done: boolean;
  sunLocked: boolean;
  fixedIn: boolean;
  fixedOut: boolean;
  fixedOutTime: string;
}

// Mirrors getMeta()
interface ScheduleMeta {
  town: string;
  date: string;
  prod: string;
  dir: string;
  dp: string;
  lat: number | null;
  lng: number | null;
  wx: WeatherData | null;
}

// Mirrors buildCurrentScheduleData() — wire-compatible with Netlify Blobs
interface ScheduleData {
  meta: ScheduleMeta;
  rows: ScheduleRow[];
  savedAt: number;
}

interface WeatherData {
  sunrise?: string;
  sunset?: string;
  temp?: number;
  condition?: string;
  precipitation?: number;
  updatedAt?: number;
}

interface Snapshot {
  id: string;
  savedAt: number;
  label: string;
  data: ScheduleData;
}

interface LibraryEntry {
  name: string;
  savedAt: number;
  folder: string | null;
}

interface LibraryMeta {
  schedules: LibraryEntry[];
  folders: string[];
}

interface CMSConfig {
  actions: string[];
  actionStyles: Record<string, { bg: string; text: string }>;
  colors: Record<string, string>;
  labels: Record<string, string>;
  logo: string | null;
}

// Sync states
type SyncStatus = 'synced' | 'pending' | 'syncing' | 'offline' | 'conflict';

interface ConflictState {
  local: ScheduleData;
  remote: ScheduleData;
  scheduleName: string;
}

interface SyncQueueEntry {
  scheduleName: string;
  data: ScheduleData;
  queuedAt: number;
}

// SaaS-ready — used as orgId: 'default' initially
interface OrgContext {
  orgId: string;
  orgSlug: string;
}

// Auth
interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
}
```

---

## 8. Routing Plan

### Route Table

| URL | Component | Auth |
|---|---|---|
| `/login` | Login form → calls `auth.js` → stores token | Public |
| `/` | Library / Home | Required |
| `/schedule/[name]` | Schedule editor | Required |
| `/schedule/[name]/print` | Print-only layout | Required |
| `/view?v=NAME&vt=TOKEN` | Read-only client/vendor view | None (view token in URL) |

### Legacy Link Compatibility

The original app used query params on the root URL. These must continue to work for bookmarks and shared links:

```
/?s=ScheduleName         → /schedule/ScheduleName
/?v=NAME&vt=TOKEN        → /view?v=NAME&vt=TOKEN
```

A root-level `middleware.ts` handles these rewrites before any page renders:

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const s = searchParams.get('s');
  const v = searchParams.get('v');
  const vt = searchParams.get('vt');

  if (s) return NextResponse.redirect(new URL(`/schedule/${encodeURIComponent(s)}`, request.url));
  if (v && vt) return NextResponse.redirect(new URL(`/view?v=${encodeURIComponent(v)}&vt=${encodeURIComponent(vt)}`, request.url));
}

export const config = { matcher: '/' };
```

### Read-Only View (`/view`)

- Rendered as a Server Component where possible (RSC fetches schedule via view token)
- Full schedule grid displayed in read-only mode
- All modals hidden (contact, status, notes are readable but not editable)
- Print button works — uses same `print.css`
- No toolbar save/edit buttons rendered

---

## 9. Migration Phases

> Each phase ends with a Netlify deploy preview. `main` is never touched.

### Phase 0 — Foundation (2–3 days)

- Create `next-app-migration-v2` branch off `main`
- Scaffold Next.js 15 project: App Router, TypeScript, no Tailwind
- Configure `netlify.toml`:
  - `[build] command = "npm run build" publish = ".next"`
  - Deploy preview enabled on branch
- Write `.gitignore`: `node_modules`, `.next`, `.netlify`, `.env.local`
- Write `lib/types.ts` — all types from Section 7
- Write `lib/constants.ts` — ACTIONS[], CMS_COLORS[], CMS_ACTION_STYLES[], storage key constants, UNDO_LIMIT, AUTO_SNAPSHOT_INTERVAL_MS
- Write `lib/time.ts` — port `t12m`, `m12`, `durm` from `scripts/utils.js` to TypeScript; add `recalcRows()` for cascade time recalculation
- Write `lib/rowNormalizer.ts` — `makeRow()`, `normalizeRow()`, `validateRow()`
- Write `lib/hash.ts` — deterministic schedule hash used for conflict detection
- Port all CSS from `index.html` into `/styles/` files — **`print.css` copied character-for-character**
- Configure `app/globals.css` to `@import` all style layers in correct cascade order
- Wire fonts via `next/font/google` (Bebas Neue + DM Sans)
- Stub `public/manifest.json` for future PWA

**Deliverable:** Project builds and deploys. No UI yet.

---

### Phase 1 — Auth + Shell (2–3 days)

- Write `lib/store/authStore.ts` — token, isAuthenticated, `login()`, `logout()`, sessionStorage persistence using key `rp_sched_editor_token_v16`
- Write `lib/api/auth.ts` — typed wrapper for `POST /.netlify/functions/auth`
- Build `/login` page with modal-style login form
- Build `(app)/layout.tsx` — auth gate: if no valid token, redirect to `/login`
- Write `middleware.ts` — legacy `?s=` and `?v=&vt=` redirect handling
- Build `ui/ToastProvider.tsx` + `ui/Toast.tsx` — toast queue with auto-dismiss

**Deliverable:** Login works. Authenticated users see a blank app shell. Legacy links redirect correctly.

---

### Phase 2 — Schedule Editor Core (1.5–2 weeks)

- Write `lib/store/scheduleStore.ts` — `rows[]`, `meta`, `undoStack[]`, `redoStack[]`, dirty flag, `pushUndo()`, `undo()`, `redo()`
- Write `lib/hooks/useUndoRedo.ts`
- Build `ScheduleEditor`, `ScheduleHeader`, `ScheduleGrid`
- Build all cell components:
  - `ActionCell` — full ACTIONS dropdown + otherText input, action color class applied to row
  - `TimeInCell` — 12-hour time input + fixedIn lock toggle (left-arrow icon)
  - `DurationCell` — duration input (HH:MM), triggers `recalcRows()` on change
  - `TimeOutCell` — computed display (or manual input when fixedOut), right-arrow lock toggle
  - `LocationCell` — text input (Google Places wired in Phase 4) + map link button
  - `DescriptionCell`, `NotesCell`, `StatusCell`, `ContactCell`, `DoneCell`
- Build `RowControls` — drag handle, add-row-below, delete, sun-lock toggle
- Wire `@hello-pangea/dnd` for drag-and-drop reorder (desktop mouse + iPad touch)
- Build `SunriseSunsetRow` — non-editable solar marker rows
- Build all three modals: `ContactModal`, `StatusModal`, `NotesModal`
- Build `EditorToolbar` with `UndoRedoButtons` and unsaved-changes indicator
- Wire `useUndoRedo` to all row/meta mutations

**Deliverable:** Full schedule editor works locally in the browser. Time Out calculates correctly. All lock states work. Drag-and-drop works on desktop and iPad. No cloud save yet.

---

### Phase 3 — Persistence & Sync (1 week)

- Write all API wrappers in `lib/api/schedules.ts`
- Write `lib/store/syncStore.ts` — status, offlineQueue[], conflictState
- Write `lib/hooks/useSync.ts` — online/offline detection, queue processing, retry, hash comparison
- Write `lib/hooks/useLocalDraft.ts` — localStorage mirror keyed to schedule name
- Wire Save button → `saveSchedule()` → sync store → Netlify function
- Wire load-on-mount → `loadSchedule()` when navigating to `/schedule/[name]`
- Build `SyncStatusPill` — synced / pending / syncing / offline / conflict
- Build `ConflictModal` — four options: overwrite remote / save as copy / reload remote / cancel
- Build `SaveAsModal` — name input + folder picker
- Build `DeleteConfirmModal` — password confirmation
- Add JSON export (current schedule), JSON export (full library), JSON import

**Deliverable:** Full round-trip save/load through Netlify Blobs. Offline queue works. Conflict dialog appears when two devices edit the same schedule.

---

### Phase 4 — Library, Snapshots, Share Links (1 week)

- Write `lib/api/library.ts` + `lib/api/snapshots.ts` + `lib/api/viewLinks.ts`
- Build `LibraryPage`, `LibraryToolbar`, `FolderList`, `ScheduleCard`
- Wire library to `GET /library` and `POST /library` functions
- Folder CRUD: create, rename, delete; schedule assignment to folders
- Search, sort, filter schedules in library
- Build `lib/hooks/useAutoSnapshot.ts` — 5-minute interval timer, calls `addSnapshot`
- Build `SnapshotModal` — list view, visual preview panel, restore, save as new schedule, notes/label, delete
- Build `ShareLinkModal` — calls `GET /view-link`, displays editor link + read-only link with copy buttons
- Build `/view` page — full schedule grid in read-only mode, prints via `print.css`

**Deliverable:** Library navigation works. Snapshots auto-save and can be restored. Read-only vendor links work. Legacy `?v=&vt=` links resolve correctly.

---

### Phase 5 — CMS, Weather, Google Places, Print (4–5 days)

- Write `lib/api/cms.ts`
- Write `lib/store/cmsStore.ts` — loads config on app start, injects CSS custom properties into `document.documentElement` for live theming
- Build `CMSPanel`, `ActionStyleEditor`, `LabelEditor`, `LogoUpload`
- Write `lib/hooks/useWeather.ts` — Open-Meteo API fetch, sunrise/sunset extraction
- Build `WeatherStrip` — temp, conditions, precipitation, last updated, refresh button
- Wire sunrise/sunset data → `SunriseSunsetRow` insertion into grid
- Write `lib/hooks/useGooglePlaces.ts` — Places autocomplete using `NEXT_PUBLIC_GOOGLE_PLACES_KEY`
- Wire `LocationCell` to autocomplete hook, extract lat/lng on selection
- Wire crew name autocomplete (Producer, Director, DP) to `localStorage` key `rp_crew`
- Verify `/schedule/[name]/print` layout matches original print output exactly:
  - Time Out column visible
  - No right-side cutoff
  - No spurious second page in mobile landscape
  - Header / weather / meta layout preserved
  - Row wrapping preserved

**Deliverable:** CMS works. Weather displays. Location autocomplete works. Print output matches original.

---

### Phase 6 — Parity Verification (2–3 days)

Before anything is merged or promoted:

- Side-by-side comparison of Next.js app vs. live `main` branch on Netlify
- Verify all legacy links: `?s=ScheduleName`, `?v=ScheduleName&vt=ViewToken`
- Verify offline queue: go offline, make edits, come back online, confirm sync
- Verify conflict dialog: edit same schedule on two tabs, confirm conflict appears
- Verify all row lock behaviors and time recalc edge cases
- Verify undo/redo stack (80 operations)
- Verify auto-snapshot fires at 5 minutes and cloud snapshot is retrievable
- Verify print output on laptop, mobile, tablet, landscape orientation
- Verify CMS: change action color, reload, confirm color persists and applies to rows
- Verify read-only view: confirm no save/edit controls, confirm print works
- No regressions introduced to `main`

**Deliverable:** Feature parity confirmed. Migration branch is promoted. `main` is retired or archived.

---

## 10. SaaS Architecture

### What's Built Into the Migration (Day One)

These decisions cost nothing now but make SaaS straightforward later:

| Decision | Why It Matters |
|---|---|
| `OrgContext` type (`orgId`, `orgSlug`) in `lib/types.ts` | Tenant awareness baked into data model from the start |
| All Netlify calls go through `lib/api/` wrappers | Swap backend without touching any component |
| Auth store abstraction (`login()`, `logout()`, `isAuthenticated`) | Swap HMAC token for Clerk/Auth.js without changing any component |
| Route group `(app)/` | Can become `(app)/[orgSlug]/` when multi-tenancy is added |
| Netlify Blobs key-based storage | Adding `org/{orgId}/` prefix to function keys is a one-line change per function |

### Multi-Tenancy Migration Path (Post-Parity)

The Netlify functions currently store data under flat keys (`schedules/{name}`, `library_meta`, `cms_config`). For multi-tenancy, each function gets a one-line change:

```js
// Before (single tenant)
const key = `schedules/${name}`;

// After (multi-tenant)
const orgId = req.headers['x-org-id'] || 'default';
const key = `org/${orgId}/schedules/${name}`;
```

This is the only change needed to the backend functions. Everything else is additive.

### SaaS Data Model (Future)

```
Organization
  ├── id (orgId)
  ├── slug (orgSlug — used in URL or subdomain)
  ├── name
  ├── plan (free / pro / enterprise)
  ├── cmsConfig (logo, colors, action labels — per org)
  └── members[]
        ├── userId
        └── role: admin | producer | editor | viewer | client | vendor

Project (maps to current "folder")
  ├── id
  ├── orgId
  ├── name
  └── schedules[]

Schedule
  ├── name
  ├── orgId
  ├── projectId
  └── data: ScheduleData (unchanged wire format)
```

### Role Matrix (Future)

| Action | admin | producer | editor | viewer | client | vendor |
|---|---|---|---|---|---|---|
| View schedule | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit schedule | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Save / sync | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete schedule | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage snapshots | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Restore snapshot | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage library/folders | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| CMS / branding | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Invite members | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Print | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 11. Feature Roadmap Beyond Parity

These are out of scope for the initial migration but should inform architectural decisions now.

### Library / Home Improvements
- True home screen on login (no delayed modal)
- Open recent schedules
- Search, sort, filter schedules
- Archive instead of hard delete

### Contacts
- Clickable contact list derived from schedule rows (phone + email)
- Read-only, derived — not a separate database yet

### Call Sheets
- Generate call sheet from schedule
- Pull date, call time, weather, sunrise/sunset, locations, rows, contacts, notes
- Add parking/basecamp, safety notes, map links
- Export/share as PDF

### Version History
- Named versions beyond snapshots
- Compare versions
- Better restore UX

### Multi-Day / Project Architecture
- Master Schedule for a project
- Multiple daily schedules inside one project
- Duplicate day, move/copy rows between days

### Production Management (Film/TV-specific)
- Booking, permit, release, vendor, location status tracking
- Crew/gear/travel notes
- Not generic PM — film/TV/documentary-specific

### PWA / App Store
- Full `manifest.json` + service worker
- Installable on iPad/iPhone
- Better offline shell
- App Store packaging after PWA is stable

### Budgeting App Integration
- Migrate budgeting app on similar stack
- Connect schedule (shoot days, crew, gear, locations) to budget rollups

### AI / Moving Image Production
- App stays focused on film, TV, documentary, AI filmmaking
- Future: shot tracking, prompt/reference tracking, generated shot status, rights/licensing

---

## 12. Decisions Needed Before Coding Starts

| # | Decision | Options | Recommended |
|---|---|---|---|
| 1 | **New branch name** | `next-app-migration-v2`, `next-rebuild`, `react-app` | `next-app-migration-v2` |
| 2 | **Google Places API key** | Reuse key from `index.html`, create new key | Create new key scoped to Next.js domain in Google Cloud Console |
| 3 | **CSS approach** | Port original CSS verbatim (no Tailwind), or Tailwind redesign | Port original CSS — preserves exact visual identity, lower risk |
| 4 | **Drag-and-drop library** | `@hello-pangea/dnd`, `dnd-kit`, custom | `@hello-pangea/dnd` for proven touch/tablet support |
| 5 | **Phase ordering** | Sequential as described, or prioritize specific features? | Sequential — each phase ships something testable |
| 6 | **SaaS auth (future)** | Clerk, Auth.js, custom | Clerk — org/role management built-in, no server setup |

---

*Last updated: 2026-05-11*
*Prepared against: `main` branch golden baseline (index.html, ~5,247 lines)*
*Existing `next-app-migration` branch: audited and abandoned in favor of clean rebuild*
