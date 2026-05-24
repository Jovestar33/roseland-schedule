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
  schedule/          # ScheduleEditor, ScheduleHeader, ScheduleGrid, row types, modals
  schedule/CrewIdentityBlock.tsx  # Compact PRODUCER/DIRECTOR/CAMERA inline-edit block
  schedule/ComboInput.tsx         # Filtered typeahead input with keyboard navigation
  library/           # LibraryPage, ScheduleListTab, LibraryTree, SnapshotsTab, BackupTab
  cms/               # CmsModal, CmsEditor
  toolbar/           # EditorToolbar, SaveDropdown, ShareDropdown, UndoRedoButtons, SyncStatusPill, ToolsPanel
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
| `components/schedule/CrewIdentityBlock.tsx` | Inline-edit crew display between identity line and meta-grid |
| `components/toolbar/SaveDropdown.tsx` | Split Save button; dropdown uses position:fixed to escape overflow |
| `components/toolbar/ShareDropdown.tsx` | Share/Print/Export dropdown; same fixed-position escape pattern |
| `components/toolbar/ToolsPanel.tsx` | Slide-over panel (Templates / Backup / Restore tabs); portal to document.body |
| `components/library/LibraryTree.tsx` | Collapsible production → phase → schedule tree; DnD reorder, inline create, edit modal |
| `components/schedule/ComboInput.tsx` | Typeahead input with filtered dropdown; used for projectName/phase in identity line |

## 4. State Management

Three Zustand stores:

**scheduleStore** — owns all schedule data:
- `rows`, `meta`, `scheduleName`, `dirty`, `syncStatus`, `conflictData`
- `remoteBaseline: { savedAt, hash }` — last known server state for conflict detection
- `undoStack` / `redoStack` (max 80 entries, serialized row snapshots)
- `loadSchedule()` calls `recalcRows()` + `repositionSunRows()` internally
- `getScheduleData()` returns current rows + meta for save/snapshot payloads
- `updateMeta(patch)` sets `dirty: true` — triggers autosave

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
| `snapshots.js` | Read/write named snapshots per schedule (store: schedule-snapshots) |
| `library.js` | Read/write library metadata blob (phaseOrder, tsarchived, display name overrides, folder map, town/date caches) |
| `delete-schedule.js` | Permanent delete of archived schedules; validates editorToken + delete passcode; deletes schedule blob, snapshot blob (best-effort), and cleans all library metadata references atomically |
| `cms.js` | Read/write CMS branding config |
| `templates.js` | Read/write reusable schedule templates (store: schedule-templates) |
| `places.js` | Google Places API proxy (forwards Referer, adds API key) |

All functions share the same HMAC auth check (`SCHEDULE_APP_PASSWORD` + `SCHEDULE_AUTH_SECRET`). `delete-schedule.js` additionally requires `SCHEDULE_DELETE_PASSWORD`; it is the sole server-side entry point for permanent schedule deletion.

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

**Mobile CSS architecture** — Three CSS files interact on mobile: `styles/mobile.css` (primary mobile rules), `styles/inline-patches.css` (loads after mobile.css, has two `@media (max-width:760px)` blocks — "V2" ~line 509 and "V3 CORRECTION" ~line 728 — both use `!important` and win on specificity ties). When fixing mobile layout, both V2 and V3 blocks in inline-patches.css must be updated, not just mobile.css.

**Landscape phone breakpoint** — `@media (orientation: landscape) and (max-height: 500px)` is the correct way to target landscape iPhones without catching tablets. All iPhones in landscape are ~330–430px tall; all iPads in landscape are >700px tall. The old `max-width:900px and orientation:landscape` approach missed iPhone 14/15/16 Pro Max (932px wide) and could incorrectly match small tablets (~800px wide). Two blocks in `inline-patches.css` (safe-area padding and toolbar single-row) use this breakpoint.

**Toolbar CSS architecture** — `EditorToolbar` renders `.toolbar > .toolbar-head + .toolbar-btns`. On desktop both are `display:contents` (children become direct flex items of `.toolbar`). On mobile they become explicit flex rows: `.toolbar-head` is `justify-content:space-between` (name left, sync pill right); `.toolbar-btns` is a flex row of the four button groups with `gap:4px` and `padding:4px 8px 6px 8px` (no overflow scroll). `SaveDropdown` and `ShareDropdown` compute their dropdown position via `getBoundingClientRect()` and render at `position:fixed` to escape the mobile panel context. `.toolbar` uses `overflow:visible` on mobile — the `border-top-radius:18px` rounds the toolbar's own background paint without needing to clip children. The panel (`.panel`) also uses `overflow:visible` to let fixed-position dropdowns escape.

**Panel flex ordering** — `styles/base.css` adds `display:flex; flex-direction:column` to `.panel` inside `@media screen`, with explicit `order` values that place `.wx-strip` (order 3) after `.meta` (order 2) and before `.scroll-hint`/`.tbl-wrap` (orders 4–5). This visually repositions the weather strip below the schedule header fields and above the grid without moving it in the DOM. Print uses `display:block` (unaffected by `@media screen`), preserving the weather strip's original print position above the header block.

**Weather strip theming** — dark gradient background and light text colors are the global default (also used by print CSS which sets `background:#fff!important` and `color:#111!important` with `!important`). Screen colors are overridden in a separate `@media screen` block: background `#ebebeb`, text uses design system grey variables (`--g400`, `--g600`, `--g800`), links use `--pink`. This lets print CSS remain unchanged.

**CrewIdentityBlock** — `components/schedule/CrewIdentityBlock.tsx` replaces the three `CrewInput` `.mf` fields (Producer, Director, Camera) that previously lived in `ScheduleHeader`'s `meta-grid`. The block sits between `HeaderIdentityLine` and the remaining 3-column `meta-grid` (Town / Date / Call Time). Tap the label or value to edit inline; Enter/blur confirms and calls `updateMeta()` (sets `dirty:true`); Escape reverts. One field editable at a time. Fields: `meta.prod`, `meta.dir`, `meta.dp`. Separated from `meta-grid` by `1.5px solid var(--g300)` border-bottom and `margin-top:12px` on `.meta-grid`.

**Unified meta label style** — `.mf label` (TOWN / LOCATION, DATE, CALL TIME) and `.crew-label` (PRODUCER, DIRECTOR, CAMERA) are intentionally matched: `font-size:10px`, `font-weight:600`, `letter-spacing:1px`, `color:var(--g400)`, `text-transform:uppercase`. Any future label additions in the meta section should use this same style. The old `.mf label` values (11px, .08–.09em letter-spacing, `#71717a`) are superseded.

**Templates** — migrated from localStorage to Netlify Blobs (`schedule-templates` store). One-time migration: on first load, if remote is empty and localStorage has templates, they are pushed up and localStorage is cleared. Templates are accessible from within the editor via the Tools Panel (no longer require closing the schedule to reach the Library).

**Tools Panel** — `ToolsPanel.tsx` mounts via `ReactDOM.createPortal(…, document.body)` to escape all ancestor `overflow` contexts. Renders a backdrop + slide-over panel (380px from right on desktop/tablet; 70vh bottom sheet on mobile). Three tabs: (1) Templates — loads from Netlify Blobs, applies rows in-place via `loadSchedule(scheduleName, …) + updateMeta({})` to preserve the current schedule name while marking dirty; (2) Backup — Export JSON with dated filename; (3) Restore — lists snapshots for the current schedule (no picker), restores via `postSave(force) → loadSchedule → setRemoteBaseline → setSyncStatus('synced')`, with 4-second inline success toast. Snapshot preview overlay uses inline `z-index:10002` to clear the panel's stacking context. Panel z-index: backdrop 10000, panel 10001. Active state `.tp-open` on the Tools toolbar button.

**NOTES column header alignment** — The notes cell (`NotesCell.tsx`) has a `notes-status-wrap` flex row: `status-icon-slot` (24px desktop / 22px mobile ≤760px) + 8px gap + notes textarea. The `<th className="th-notes">` uses `padding-left:37px` (desktop: 5px td-pad + 24px icon + 8px gap) or `36px` (mobile: 6px td-pad + 22px icon + 8px gap) so the header text aligns with the textarea content. Applied to both the actual thead and the `#mobile-grid-sticky` sticky overlay.

**Done/Contact cell column width** — The `.c-cb` column contains both a done checkbox and a 24px contact button in a `display:flex; gap:8px` row (`.done-tools`). On mobile the V9 block (`@media (max-width:760px)` in inline-patches.css) sets the column to 64px with `overflow:hidden` on the td. Width formula: 5px-pad + 20px-checkbox + 8px-gap + 24px-button + 7px-pad ≈ 64px. A narrower column clips the contact button on the right.

**Library auto-grouping tree** — `LibraryTree.tsx` derives the production → phase → schedule hierarchy entirely client-side from schedule metadata (`projectName.trim().toLowerCase()` → prodKey, `phase.trim().toLowerCase()` → phaseKey). No server-side folder data required. `buildTree()` returns `{ productions, ungrouped }`. `ScheduleListTab` is a thin wrapper that just renders `LibraryTree`. Empty productions/phases created via inline "+ Add" inputs are held in component state only (not persisted); they become real once a schedule populates them.

**Library phaseOrder** — Manual drag-and-drop order within a phase is stored in `libMeta.phaseOrder[prodKey][phaseKey]` as an array of schedule names. `applyPhaseOrder()` sorts a phase's schedules by this array; names absent from the array fall back to dayNumber/savedAt sort and append to the end. `onDragEnd` uses `@hello-pangea/dnd`; only same-section (same droppable) reorders are supported — cross-phase and cross-production drops are explicitly rejected with a visible error message. Cross-production/cross-phase schedule movement is not yet implemented; the intended future approach is an explicit "Move To" modal that updates the schedule's `projectName`/`phase` metadata and library metadata together in one operation. After permanent delete, `delete-schedule.js` removes the schedule from all phaseOrder arrays server-side.

**Library display name overrides** — Renaming a production or phase writes `libMeta.productionDisplayNames[prodKey]` or `libMeta.phaseDisplayNames[prodKey][phaseKey]`. The normalized lowercase key (used for grouping) never changes; only the displayed label changes. Schedule blobs are not touched. The tree applies overrides after `buildTree()`, before merging empty containers.

**Library archive and permanent delete** — `libMeta.tsarchived` is a string array of archived schedule names. Archiving removes the name from active `phaseOrder` entries and from the recent-schedules list. Restoring removes it from `tsarchived`. Permanent delete is only available for archived schedules (active schedules must be archived first). `delete-schedule.js` handles deletion atomically: deletes the schedule blob from the `schedules` store, deletes the associated snapshot blob from `schedule-snapshots` (keyed by `sha256(name)`; best-effort, non-fatal if absent), then reads and rewrites the library metadata blob with the schedule removed from `tsarchived`, `phaseOrder`, `scheduleFolderMap`, `townCache`, and `dateCache`. The two-step confirmation UI (passcode + type "DELETE") lives in `LibraryPage.tsx`. The server validates the delete password independently of the editor token.

**Netlify Blobs eventual consistency and client-side mutation guards** — Netlify Blobs CDN reads can return pre-write state for up to ~15 seconds after a write. `LibraryPage` guards against stale reads silently rolling back confirmed actions using sessionStorage-based pending mutation maps (60-second TTL): `rp_lib_pending_mutations` (archive/restore), `rp_lib_pending_phase_order` (DnD reorder), `rp_lib_pending_deletions` (permanent delete). On each Library fetch, `applyPendingMutations()` overlays pending state onto cloud state; if the cloud has caught up (confirms the mutation), the pending entry is cleared automatically. Guards are stored in sessionStorage rather than `useRef` so they survive in-session navigation (component unmount resets refs). Library metadata saves that fail now revert local state and surface an error banner rather than silently accepting the failure.

**ComboInput** — `components/schedule/ComboInput.tsx` is a controlled input with a filtered suggestion dropdown. `onMouseDown + e.preventDefault()` on options prevents blur-before-click. Pressing Enter fires `onBlur?.()` (commit) whether or not a dropdown item is active; pressing Escape fires `onEscape?.()` (revert). `HeaderIdentityLine` uses a `draftRef` alongside `draft` state so `commit()` always reads the latest value synchronously, even when a dropdown option was just selected (React batching would otherwise lag state).

**Library options cache** — After `LibraryPage` parallel-fetches all schedule data, it writes unique projectName/phase values to `localStorage('rp_lib_project_options')` and `localStorage('rp_lib_phase_options')`. `HeaderIdentityLine` reads these on mount to seed ComboInput suggestions — no extra network calls in the editor.

**Contextual new schedule** — The "+ New Schedule" button inside a named phase navigates to `/schedule/Untitled?proj=X&ph=Y`. `app/(app)/schedule/[name]/page.tsx` reads those search params and passes them as `initMeta` to `ScheduleEditor`. `ScheduleEditor` applies them once (guarded by `initMetaApplied` ref) after `scheduleName === name` resolves, and only if the schedule has no existing projectName/phase (i.e., it's a fresh blank schedule).

## 10. Feature Map

**Schedule editing**: action rows, custom rows, sun rows, notes, call time, location, town, date, weather strip
**Schedule header**: identity line (project/route/day), compact crew block (PRODUCER/DIRECTOR/CAMERA inline edit), Town/Location, Date, Call Time
**Time cascade**: automatic timeOut recalc on any duration/order change
**Drag & drop**: row reorder (row 0 protected), DnD via @hello-pangea/dnd
**Undo/redo**: 80-level history, row-level snapshots
**Conflict detection**: optimistic concurrency via savedAt + content hash, resolution modal (overwrite or reload)
**Auto-snapshot**: every 5 min while dirty
**Manual snapshots**: named versions, restore, compare (BackupTab)
**Library**: collapsible production → phase → schedule tree (auto-grouped from metadata); same-section drag-and-drop reorder within a phase (cross-section movement not yet implemented); inline create production/phase; edit display names; contextual + New Schedule pre-populates identity; Team/Client link copy; archive/restore; permanent delete for archived schedules only (two-step confirmation, passcode-protected server-side); stale-read protection for recent Library mutations (sessionStorage pending-mutation guards)
**Sharing**: Team Link (`?auth=true` deep link), Client Link (`/view/[name]` public)
**Public viewer**: branded read-only view, no auth required
**CMS**: per-brand colors, fonts, logo, action style overrides — applied via CSS custom properties
**Backup**: export current schedule JSON, export all schedules ZIP
**Google Places**: location autocomplete via proxied Places API
**Weather**: Open-Meteo integration; weather strip sits between Call Time field and schedule grid (screen); light grey background (#ebebeb) with design-system text colors
**Templates**: reusable row sets stored in Netlify Blobs, synced across devices; accessible from within the editor via Tools Panel
**Tools Panel**: slide-over drawer (Templates / Backup / Restore) accessible from the editor toolbar without closing the schedule
**Print/PDF**: landscape default via `@page`; filename `"[name] – [YYYY-MM-DD]"` set on `document.title` before print
**PWA**: installable via Safari Add to Home Screen; manifest at `/manifest.webmanifest`
