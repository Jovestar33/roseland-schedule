# Roseland Schedule — Architecture Reference

## 1. Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15, App Router, TypeScript |
| State | Zustand (scheduleStore, authStore, cmsStore) |
| Drag & Drop | @hello-pangea/dnd |
| Storage | Netlify Blobs (schedules, snapshots, CMS config, library meta, templates) |
| Auth | HMAC token (password → SHA-256 HMAC) stored in sessionStorage |
| Styling | Plain CSS (`styles/base.css`, no CSS-in-JS) |
| Hosting | Netlify (static export + serverless functions) |

## 2. Folder Structure

```
app/
  (app)/             # Auth-gated routes (middleware enforces)
    page.tsx         # Library home
    schedule/[name]/ # Schedule editor
    backup/          # Backup & export
  (auth)/
    login/           # PIN unlock page
  view/[name]/       # Public client viewer (no auth)
  api/health/        # Health check (local dev)
components/
  schedule/          # ScheduleEditor, row types, toolbar, conflict modal
  library/           # LibraryModal, ScheduleListTab, SnapshotsTab, BackupTab
  cms/               # CmsModal, CmsEditor
  toolbar/           # EditorToolbar
  view/              # ReadOnlyViewer, PublicViewer, ScheduleReadView
lib/
  store/             # scheduleStore.ts, authStore.ts, cmsStore.ts
  hooks/             # useSaveActions.ts
  api/               # save.ts, load.ts, snapshots.ts, library.ts, cms.ts
  rowNormalizer.ts   # Repairs loaded rows to current shape
  recalcRows.ts      # Time cascade engine
  time.ts            # computeTimeOut, formatTime helpers
  constants.ts       # ACTIONS, CMS_COLORS, limits, intervals
  templates.ts       # Template type + LS_TEMPLATES_KEY (kept for migration helper)
  types.ts           # All shared TypeScript types
netlify/functions/   # Serverless: save, load, snapshots, library, cms, templates, places
middleware.ts        # Auth gate + ?next= redirect preservation
app/favicon.ico      # Served as Next.js metadata route — bypasses middleware entirely
app/manifest.ts      # PWA manifest, auto-served at /manifest.webmanifest
```

## 3. Key Files

| File | Purpose |
|---|---|
| `lib/store/scheduleStore.ts` | All schedule state + mutations; undo history; recalc trigger |
| `lib/hooks/useSaveActions.ts` | save / saveAs / saveForce / conflict resolution / cloud load |
| `lib/recalcRows.ts` | Time cascade — recomputes all row times from call time + durations |
| `lib/rowNormalizer.ts` | Upgrades loaded JSON to current row schema |
| `lib/constants.ts` | ACTIONS list, color maps, UNDO_LIMIT=80, AUTO_SNAPSHOT_INTERVAL_MS=5min |
| `netlify/functions/save.js` | Conflict detection (expectedSavedAt + expectedHash), stableStringify |
| `netlify/functions/load.js` | Auth-gated load; `public=1` param for unauthenticated client view |
| `components/schedule/ScheduleEditor.tsx` | Main editor mount; auto-snapshot watcher; storeReady guard |

## 4. State Management

Three Zustand stores:

**scheduleStore** — owns all schedule data:
- `rows`, `meta`, `scheduleName`, `dirty`, `syncStatus`, `conflictData`
- `remoteBaseline: { savedAt, hash }` — last known server state for conflict detection
- `undoStack` / `redoStack` (max 80 entries, serialized row snapshots)
- `loadSchedule()` calls `recalcRows()` + `repositionSunRows()` internally
- `getScheduleData()` returns current rows + meta for save/snapshot payloads

**authStore** — `token: string | null` from sessionStorage

**cmsStore** — branding config; `applyConfig()` injects CSS custom properties + `<style>` block; CMS button lives in Library header (not editor toolbar)

## 5. Data Flow

```
User edits row
  → scheduleStore mutation → dirty = true
  → recalcRows() cascades times through all rows

Save button
  → useSaveActions.save()
  → reads remoteBaselineRef.current (mutable ref, always fresh)
  → POST /.netlify/functions/save with { expectedSavedAt, expectedHash }
  → 200: updateBaseline(savedAt, hash) + markClean()
  → 409: setConflictData({ local, remote }) → ConflictModal shown

Load schedule
  → loadScheduleFromCloud(name) in useSaveActions
  → POST /.netlify/functions/load
  → normalizeRows() → loadSchedule() → recalcRows()
  → updateBaseline(savedAt, '') — server hash unknown until first save
```

## 6. Auth Flow

1. User visits any `(app)` route — middleware checks `rp_auth_flag` cookie
2. No cookie → redirect to `/login?next=<original-path>`
3. Login page: PIN → HMAC token stored in sessionStorage + cookie set
4. Redirect to `?next=` target (or `/`)
5. All API calls send token in POST body as `editorToken`
6. Team Link (`/schedule/[name]?auth=true`) — `?auth=true` tells login page to show PIN inline; after unlock, redirects back to the schedule URL

Public client links (`/view/[name]`) bypass auth entirely — no token needed, load function accepts `public=1`.

## 7. Netlify Functions

| Function | Purpose |
|---|---|
| `save.js` | Write schedule; conflict detection via savedAt + stableStringify hash |
| `load.js` | Read schedule; supports `public=1` for unauthenticated reads |
| `snapshots.js` | Read/write named snapshots per schedule |
| `library.js` | Folder metadata + schedule→folder mapping (separate blob key) |
| `cms.js` | Read/write CMS branding config |
| `templates.js` | Read/write reusable schedule templates (store: schedule-templates) |
| `places.js` | Google Places API proxy (forwards Referer, adds API key) |

All functions share the same HMAC auth check. Delete operations require a separate `SCHEDULE_DELETE_PASSWORD` env var.

## 8. Public Routes

| Route | Auth | Purpose |
|---|---|---|
| `/view/[name]` | None | Client/vendor read-only viewer |
| `/schedule/[name]` | PIN | Editor (also used for read-only with `?readonly=true`) |
| `/login` | None | PIN entry |

## 9. Architectural Quirks

**remoteBaselineRef pattern** — `useSaveActions` keeps a mutable ref updated synchronously after every save response, mirroring the Zustand `remoteBaseline` slice. Zustand batching can produce intermediate renders where `dirty=false` but the store baseline is stale; the ref bypasses React's re-render cycle entirely.

**Hash algorithm mismatch** — server uses `stableStringify` (sorted keys); client's old `hashSchedule` used `JSON.stringify` (insertion-order). Client-computed hashes are never used as baselines. Initial baseline uses `hash: ''`; after any save the server-returned hash is stored and reused verbatim.

**recalcRows after load** — `loadSchedule()` calls `recalcRows()` which rewrites row `timeOut` values. Rows in the store differ from the raw JSON on disk. `getScheduleData()` returns post-recalc rows; this is intentional (server always gets canonical data) but means you cannot diff store rows against raw loaded JSON.

**Sun rows** — `recalcRows` skips sun rows (`continue` without advancing the cursor). Sun rows are repositioned to stay at sunrise/sunset times relative to call time via `repositionSunRows`.

**storeReady guard** — `ScheduleEditor` checks `scheduleName === name` before rendering to prevent flashing stale data during route transitions.

**Auto-snapshot** — 5-minute `setInterval` in `ScheduleEditor`. Uses `dirtyRef`/`snapshotRef` mutable refs (updated every render) to avoid stale closure capturing `dirty=false` at mount time.

**Favicon** — served from `app/favicon.ico` as a Next.js metadata route. Public-directory assets (`public/*.ico`) were intercepted by Netlify's edge middleware despite matcher exclusions; the `app/` placement bypasses middleware entirely.

**Static asset middleware exclusion** — matcher uses `[^/]*\\.(?:png|jpg|jpeg|svg|ico|webp|gif|woff2?|ttf|eot)` negative lookahead with non-capturing group (`(?:)` required — Next.js 15 rejects capturing groups in matchers).

**PWA** — `app/manifest.ts` auto-served at `/manifest.webmanifest`; iOS meta tags via `appleWebApp` in layout metadata; 192×192 and 512×512 icons generated from `apple-touch-icon.png` (1254×1254 source).

**Print** — `@page { size: landscape }` in `print.css`. `lib/print.ts` sets `document.title` to `"[scheduleName] – [YYYY-MM-DD today]"` before `window.print()`, restores via `setTimeout(100)`. Print CSS is structured in versioned blocks (V5–V14k) appended over time. Desktop/laptop baseline: `thead th { font-size: 9px }`, `td { font-size: 8.1px }`, `.hdr-title { font-size: 17px }`. Touch/mobile device print overrides are scoped with `@media print and (hover: none) and (pointer: coarse)` — this catches both phones AND tablets. Landscape and portrait are further split with `and (orientation: landscape/portrait)`. As of 2026-05-14, mobile/touch font sizes in those blocks are smaller than desktop (thead th ~7–7.5px), causing "too small" complaints on tablet and mobile printouts. Active fix branch: `mobile-and-tablet-print`.

**Mobile CSS architecture** — `styles/mobile.css` contains both screen and print rules. Critical: the `@media (max-width: 760px)` block for `.hdr` uses `!important` on individual padding sides — `padding-top: max(70px, env(safe-area-inset-top, 70px)) !important` — to clear the Dynamic Island. Previously this was a shorthand `padding` with `!important` which overrode all JS-applied padding; fixed 2026-05-14. The `c-cb` column (done/contact cell) is `width: 64px` with `td:nth-child(10) { padding-left:0; padding-right:0 }` to prevent the contact button from being clipped. `.tbl-wrap` has `padding-right: 10px` at ≤760px to prevent content reaching the screen's rounded-corner edge in portrait.

**Templates** — migrated from localStorage to Netlify Blobs (`schedule-templates` store). One-time migration: on first load, if remote is empty and localStorage has templates, they are pushed up and localStorage is cleared.

## 10. Feature Map

**Schedule editing**: action rows, custom rows, sun rows, notes, call time, location, town, date, weather strip  
**Time cascade**: automatic timeOut recalc on any duration/order change  
**Drag & drop**: row reorder (row 0 protected), DnD via @hello-pangea/dnd  
**Undo/redo**: 80-level history, row-level snapshots  
**Conflict detection**: optimistic concurrency via savedAt + content hash, resolution modal (overwrite or reload)  
**Auto-snapshot**: every 5 min while dirty  
**Manual snapshots**: named versions, restore, compare (BackupTab)  
**Library**: folder/project organization, sort by savedAt, move between folders  
**Sharing**: Team Link (`?auth=true` deep link), Client Link (`/view/[name]` public)  
**Public viewer**: branded read-only view, no auth required  
**CMS**: per-brand colors, fonts, logo, action style overrides — applied via CSS custom properties  
**Backup**: export current schedule JSON, export all schedules ZIP  
**Google Places**: location autocomplete via proxied Places API  
**Weather**: Open-Meteo integration, weather strip on schedule header  
**Templates**: reusable row sets stored in Netlify Blobs, synced across devices  
**Print/PDF**: landscape default via `@page`; filename `"[name] – [YYYY-MM-DD]"` set on `document.title` before print  
**PWA**: installable via Safari Add to Home Screen; manifest at `/manifest.webmanifest`  
