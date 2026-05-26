# Roseland Schedule — Master Roadmap

## 🔴 Immediate (current session / next 1-2 days)
*App is deployed with real data — these must be done before team use*

1. ✅ **Save overwrite warning audit** — conflict detection rebuilt with pure savedAt comparison; Netlify Blobs eventual-consistency stale-read handled correctly
2. ✅ **Print/PDF verification** — landscape default set via `@page { size: landscape }`; filename format `"[scheduleName] – [YYYY-MM-DD]"` working
3. ✅ **Mobile/iPad layout pass** — complete
   - ✅ Library horizontal overflow fixed (mobile-polish → main, 2026-05-13)
   - ✅ iOS Safari Dynamic Island portrait clipping fixed
   - ✅ Contact icon clipping on grid right edge (portrait mobile) fixed
   - ✅ Mobile toolbar redesign — two-row layout (name+pill / buttons), dropdowns escape overflow via position:fixed, Undo/Redo icon-only on mobile, Close ✕ on mobile
   - ✅ Safari and Chrome favicons confirmed working
   - ✅ Header polish pass — landscape toolbar breakpoint fixed (max-height:500px captures all iPhones incl. Pro Max, excludes tablets); Close button shows ✕ icon in landscape; weather strip #ebebeb background enforced with !important; crew divider 1.5px var(--g300); meta-grid 12px top margin; TOWN/DATE/CALL TIME labels unified to crew-label style (10px, 1px letter-spacing, var(--g400)); crew block labels PRODUCER/DIRECTOR/CAMERA. Merged to main 2026-05-15.
4. **PWA manifest** — make app installable on iPad home screen
   - Status: `manifest.ts` built and deployed, iOS meta tags in place, icons generated at 192×192 and 512×512. Remaining: test PWA install on real iPad in Safari (Share → Add to Home Screen) and verify standalone landscape mode launches correctly
5. ✅ **Print font sizes — tablet and mobile** — resolved and merged to main 2026-05-15. Branch `mobile-and-tablet-print` closed.

## 🟠 Short-Term Polish (v1 — next 2-4 sessions)
*Quality of life improvements before wider use*

6. ✅ **Compact crew block** — Producer / Director / Camera replaced with `CrewIdentityBlock`: two-row display (labels + values), inline edit on tap, sits between identity line and Town/Location. Merged to main 2026-05-15.
7. ✅ **Schedule header fields — Phase 9 complete** — Passed testing 2026-05-26. Branch: `phase-9-schedule-header-identity`, merged to `main` 2026-05-26.
   - Schedule header now presents a two-row identity block: Project/Production name on row 1 (18px bold), Phase · Day on row 2 (12px muted).
   - Project and Phase retain `meta.projectName` and `meta.phase` — the same fields used by Library grouping, Move To, and the read-only view. No metadata schema changes.
   - Project and Phase editing shows all existing options immediately on open (no pre-filtering), consistent with Move To selector UX. Custom values can still be entered.
   - Day is edited via a single slash-notation input (`1/5` = Day 1 of 5; `1` or `1/` = Day 1, totalDays null). Values stored as `meta.dayNumber` and `meta.totalDays` (unchanged).
   - Day input enforces digits-and-slash only at keystroke level. Invalid input (day = 0, day exceeds total, `/5` with no day number) keeps the editor open with a visible inline error — metadata is never corrupted by invalid input.
   - Escape reverts the Day field to the pre-edit snapshot value and closes without writing.
   - Town / Location, Date, Call Time, Producer, Director, Camera, save/load, Library, Move To, print, mobile layout, and read-only view all preserved.
   - **Architecture note:** This is a step toward future call-sheet and Production Command architecture, but is not a call sheet. The schedule editor header remains intentionally clean. Heavy call-sheet-only fields (full crew list, parking, safety notes, permits) belong in a dedicated Call Sheet layer (Item 19), not in the schedule header.
   - **Future (not Phase 9):** Full call sheet generation (Item 19), multi-day master schedule (Item 20), Production Info Panel / Production Command.
8. ✅ **Move CMS to Library** — CMS button removed from schedule toolbar, now in Library header
9. ~~**Export Current JSON to toolbar**~~ — **Skipped / already satisfied.** The Share menu (`ShareDropdown`) already provides JSON export of the current schedule. This is sufficient for current usage; no standalone development phase is needed. Can be revisited only if the Share menu export proves insufficient in practice.
10. ✅ **Tools Panel slide-over** — `ToolsPanel.tsx` renders via `createPortal` to `document.body`; slides from right on desktop/tablet (380px), bottom sheet on mobile (70vh). Three tabs: Templates (save/apply/delete templates from within an open schedule — the context problem is now solved), Backup (Export JSON), Restore (snapshot cards with Preview, Save As New, Restore, Delete). Merged to main 2026-05-15.
11. **Push notifications for overtime** — alert when action runs over its duration
12. **Library improvements**
    - ✅ **Auto-grouping hierarchy tree** — collapsible production → phase → schedule tree derived from schedule metadata; collapse state persists in localStorage. Merged to main 2026-05-16.
    - ✅ **Drag-and-drop reorder** — schedules within a phase are manually reorderable; order persists in `libMeta.phaseOrder`. Merged to main 2026-05-16.
    - ✅ **Inline create Production / Phase** — "+ Add Production" and "+ Add Phase" inline inputs with Enter/Escape; empty containers held in UI state until populated. Merged to main 2026-05-16.
    - ✅ **Edit production/phase display names** — pencil button opens modal; writes display name override to libMeta (`productionDisplayNames` / `phaseDisplayNames`); schedule blobs untouched. Merged to main 2026-05-16.
    - ✅ **Contextual + New Schedule** — button inside each named phase navigates to editor pre-populated with projectName and phase via URL search params. Merged to main 2026-05-16.
    - ✅ **ComboInput typeahead** — projectName and phase fields in the editor identity line show filtered suggestions seeded from library load (localStorage cache). Merged to main 2026-05-16.
    - ✅ **Mobile two-line row layout** — schedule rows on mobile stack into grip+name / actions two-line format; no truncation. Merged to main 2026-05-16.
    - ✅ **Library Refresh reliability** — Refresh button re-fetches current Library data without getting stuck; stale CDN reads during the Netlify Blobs propagation window (~0–15s) cannot roll back recently confirmed archive/restore, DnD reorder, or delete mutations (sessionStorage pending-mutation guards, 60s TTL). Passed testing 2026-05-24.
    - ✅ **Save As Library grouping fix** — schedules created via Save As appear in the correct production/phase group rather than Ungrouped, even when the CDN edge has not yet propagated the new blob (fallback meta cached in sessionStorage). Passed testing 2026-05-24.
    - ✅ **Archive / Restore** — reversible cleanup layer; archived schedules are hidden from the default Library view and can be restored. Persists after Refresh, browser reload, and in-session navigation back to the Library. Passed testing 2026-05-24.
    - ✅ **Permanent Delete (archived only)** — two-step confirmation modal (passcode + type "DELETE"); passcode verified server-side via `SCHEDULE_DELETE_PASSWORD`; active schedules must be archived first. Server atomically deletes the schedule blob, associated snapshots, and all Library metadata references. Deleted schedules do not reappear after Refresh or reload. Passed testing 2026-05-24.
    - ✅ **Same-section DnD persistence hardening** — DnD reorder save failures surface an error banner and revert the UI rather than silently pretending the move saved. Passed testing 2026-05-24.
    - ✅ **Library UI Declutter / Mobile Polish (Phase 6)** — UI-only pass; no Library data model or storage behavior changed. Passed testing 2026-05-25.
      - Redundant Town · Date secondary metadata line removed from all Library rows; schedule names left-aligned.
      - Active desktop rows: Links | Move To | Rename | Archive (all visible buttons).
      - Active mobile rows: Links | Move To | ⋯; ⋯ menu shows Rename and Archive.
      - Archived rows (all breakpoints): Restore | Delete Permanently (desktop) / Delete (mobile) — direct visible buttons, no ⋯ menu.
      - Top toolbar simplified: + New Schedule | Refresh | Archived | More; mobile uses shorter labels (+ New / Refresh / Archived / ⋯). More menu contains only CMS and Log Out.
      - All four Library tabs remain visible in the tab bar (Library / Templates / Backup / Restore).
      - Templates tab: removed useless "Save Current as Template" input/button row; templates are saved from the Tools Panel inside an open schedule.
      - Mobile search placeholder no longer clipped.
      - New `lib-acts-mobile-only` CSS helper (inverse of `lib-acts-desktop-only`) for elements visible only on mobile.
    - ⬜ **Search/filter schedules** — by name, production, phase, date range; pending.
    - ⬜ **Sort options** — sort beyond manual phase order (by name, save date, shoot date); pending.
    - ⬜ **Open recent** — quick access to recently opened schedules on Library load; pending.
    - ⬜ **Cross-section schedule movement** — moving a schedule between productions or phases is not a drag-and-drop feature; cross-section DnD is deliberately rejected. Future implementation should use an explicit Move To workflow (see item 13 below).
13. ✅ **Phase 2 — Safe schedule title rename** — Completed and tested 2026-05-24. Branch `phase-2-safe-schedule-rename`, merged to `main` 2026-05-24.
    - Schedules can be renamed from the Library without using Save As.
    - Rename is Library-only; in-editor rename is not implemented (possible later enhancement).
    - Uses an interim key-migration approach: backend copies the schedule blob to the new key, migrates the snapshot blob (keyed by sha256 of name), updates all Library metadata references (phaseOrder, tsarchived, scheduleFolderMap, townCache, dateCache), then deletes old blobs best-effort. Backend endpoint: `netlify/functions/rename-schedule.js`.
    - Rename preserves schedule data, snapshots, phase order, and Library grouping.
    - Blocks genuine duplicate names. Rename-back (A→B→A) works correctly after the sync window — backend cross-checks Library metadata when `isRenameBack` flag is set, avoiding a false 409 from stale CDN blob reads.
    - Old Team/Client links using the old schedule name break after rename; users must copy new links from the Library row.
    - Post-rename sync guard (15 s React state) prevents opening or re-renaming during the Blob propagation window. Pending rename guard (sessionStorage, 60 s TTL) prevents stale CDN blob-list reads from reverting the rename on Library Refresh.
    - Netlify Blobs `{ consistency: 'strong' }` is not used; this environment does not expose `uncachedEdgeURL`. All staleness is handled at the app level.
    - **Future (not current work):** Full `scheduleId` migration — introduce a permanent `scheduleId` field separate from the display title so the blob key never needs to change on rename. In-editor rename (rename without opening the Library) is also a future enhancement.
14. ✅ **Move To workflow — cross-production/cross-phase schedule movement** — Completed and tested 2026-05-24. Branch `phase-3-move-to-workflow`, merged to `main` 2026-05-24.
    - Move To button in each active schedule row (desktop-only) opens a modal with controlled select-style dropdowns for Production and Phase.
    - Existing productions and phases are immediately visible as selectable options. Custom/new entry supported via reveal-on-select text inputs (no need to delete pre-filled text to see options).
    - Phase dropdown prioritizes phases already used in the selected production ("This production" optgroup), then lists other known phases.
    - Backend endpoint: `netlify/functions/move-schedule.js`. Coordinated two-write operation, not a true atomic transaction: writes updated `meta.projectName`/`meta.phase` to the schedule blob first, then updates `phaseOrder` in Library metadata.
    - Move To preserves schedule name, data, snapshots, Team Links, and Client Links. The schedule is appended to the bottom of the destination phase order.
    - If Library metadata write fails after the blob write, the schedule blob remains authoritative for grouping and self-corrects on the next Refresh. Acceptable degraded state.
    - Cross-section drag-and-drop remains intentionally blocked. Cross-section DnD may be added later as a secondary trigger only after Move To has proven stable in production.
    - No changes to print, schedule editor layout, rename, archive/restore, permanent delete, or same-section DnD behavior.
15. ✅ **Phase 5 — Contact Sheet / Contact Extract** — Completed and tested 2026-05-25. Branch `phase-5-contact-sheet`, merged to `main` 2026-05-25.
    - Share dropdown now includes "📋 Contact Sheet".
    - Opens a modal that extracts contacts from the current schedule's existing row-level contact fields (`contactName`, `contactTitle`, `contactPhone`, `contactEmail`).
    - Rows with no contact data are excluded; empty state shown when no contacts exist on the schedule.
    - Contacts deduplicated by exact `contactName.trim() + contactPhone.trim()`; merged cards list all associated row-context lines (time, action, location, description).
    - CSV download: 8-column headers, one row per contact × row-context pair.
    - Print: uses a `cs-print-only` portal rendered directly on `document.body` — outside the `.overlay`/`.modal` tree that `print.css` suppresses — so contact sheet prints correctly. Normal schedule Print/PDF is unaffected.
    - Contact button (`DoneContactCell`) and `ContactModal` entry point are unchanged.
    - Contacts remain editor-only; public/client view contacts not included in Phase 5.
    - **Limitations (deferred):** one contact per row; no contacts database; no public view contacts (item 17); no sub-location contacts (Phase 4B).
16. **Version history UX**
    - ✅ **Phase 8 — Snapshot UX Polish** — Completed and tested 2026-05-25. Branch `phase-8-snapshot-ux-polish`, merged to `main` 2026-05-25.
      - Manual snapshots now prompt for a custom label; blank/cancel falls back to "Manual snapshot."
      - Snapshot cards show label as the main title; timestamp and action count appear as secondary metadata.
      - Auto snapshots and conflict snapshots continue to display their labels clearly.
      - Snapshot count badge shows X / 25 in both ToolsPanel Restore tab and Library Versions tab.
      - Snapshot cap increased from 10 to 25 per schedule (server-side `normalizeSnapshots` and UI).
      - Capacity note appears at 25 / 25: "New snapshots replace the oldest."
      - Snapshot creation failure no longer shows a false success toast — an error toast is surfaced instead.
      - Button labels and delete button styling unified between ToolsPanel Restore tab and Library Versions tab (Preview / Save As New / Restore / Delete).
      - Redundant "Selected: [name]" line removed from Library Versions tab.
      - Save As New from snapshot pre-loads known snapshot data into the store before navigation so the new schedule opens populated immediately, avoiding blank-schedule flash from Blob propagation lag.
      - Existing Preview, Restore, Delete, auto-snapshot, and conflict snapshot behavior intact.
    - ⬜ **Remaining / future (not Phase 8):** full autosave/version history redesign; snapshot rename/editing; styled confirmation modal replacement for `confirm()` / `prompt()` dialogs; side-by-side version compare.
17. **Client read-only view enhancements**
    - ✅ **Phase 7 — Read-only Link Experience / Client View Polish** — UI-only pass; no data model, storage, or server-side function changes. Passed testing 2026-05-25.
      - Public/client view now shows a designed schedule identity block: schedule name, production/project name, phase, and day number / total days where available.
      - Schedule name appears as part of the designed printed document, not only in the browser/PDF title bar.
      - Read-only table preserves Time Out in print/PDF. (Root cause: global `print.css` rule `th:last-child / td:last-child` suppressed editor delete column but also hit Time Out in the 9-column read view; fix scoped to `.rv-panel` class.)
      - Sub-locations render underneath main locations with descriptions and Google Maps links where lat/lng exists.
      - Standard action types use action color styling (matching the editor and PDF).
      - Completed rows are no longer faded — clients see all rows at full opacity.
      - Mobile/narrow view includes a horizontal scroll hint above the schedule table.
      - Public view print hides the dark branded header and Print/Save PDF button.
      - Both `/view/[name]` (unauthenticated) and `/view?v=name&vt=token` (token-gated) benefit from all improvements via shared `ScheduleReadView`.
      - Contact fields are not rendered publicly. No contacts were exposed.
      - Normal editor behavior and print/PDF were not changed.
      - **Note:** Browser "Headers and Footers" (URL / date / page number in PDF margins) are browser-controlled and not app behavior.
    - ⬜ **Public/client contact cards** — opt-in contact name/title/phone/email visible in public view; requires explicit per-schedule contact visibility control; deferred.
    - ⬜ **Contact visibility toggle** — per-schedule or per-link toggle to enable showing contacts publicly; deferred.
    - ⬜ **Separate vendor/crew read-only link** — distinct link type with richer contact/crew info for internal use; deferred.

## 🟡 Medium-Term (v2 — next major development cycle)
*New feature categories that expand scope significantly*

18. ✅ **Phase 4 — Location details / sub-locations** — Completed and tested 2026-05-25. Branch `phase-4-location-details`, merged to `main` 2026-05-25.
    - Sub-locations render inline within the Location cell, stacked below the main location — no modal is used.
    - Main location behavior (text, Google Places autocomplete, map pin, wrapping) is unchanged.
    - Main and sub-location text wraps cleanly across desktop, tablet, mobile, and print; long addresses do not clip or overflow.
    - Each sub-location: `loc` with Google Places autocomplete, `locLat`/`locLng` with individual map pin, optional `desc` text (auto-resizing textarea), `done` status checkbox.
    - Sub-locations save/load with the schedule. Old schedules without `subLocations` work unchanged.
    - Print: sub-location `loc` and `desc` text print below the main location; pin, remove, and add controls are hidden.
    - Mobile: tested and working.
    - Data model: `ScheduleRow.subLocations?: Array<{ id, loc, locLat, locLng, done, desc }>`. Existing `loc`, `locLat`, `locLng` on the row are unchanged.
    - Sub-location data is row-level, not Library data. Library, rename, Move To, archive, delete, Save As, and DnD are all unaffected.
    - **Phase 4B (deferred — not yet started):** Evaluate contact-per-sub-location integration. The existing row-level contact button (`.done-tools` column) was not moved. Options: (a) attach a contact to individual sub-locations, (b) broader row/contact redesign, or (c) let the Contact Sheet feature (item 15) absorb this need. Evaluate after item 15 is implemented.
    - **Post-Phase-4 bug fixes (merged to `main` 2026-05-25):**
      - DnD regression from Phase 4: `DescTextarea` auto-resize changed from `useEffect` to `useLayoutEffect` (synchronous, does not fire during drop animation); all buttons in `LocationCell.tsx` given `type="button"`; CSS transition removed from `.loc-add-subloc`.
      - `"00:00"` duration regression: all four `!r.dur` falsy guards replaced with `r.dur === ''` (explicit blank check) in `hasOpenRows`, `guardReorder`, `nextFixedAnchorMin`, and `isLocked`. `computeTimeOut` guard changed from `durMins <= 0` to `row.dur === ''` — a row with Time In and duration "00:00" now correctly shows Time Out equal to Time In.
19. ✅ **Phase 10 — Call Sheet Foundation** — Completed and deployed 2026-05-26. Branch `phase-10-call-sheet-planning`, merged to `main` 2026-05-26.
    - Share dropdown now includes "📄 Call Sheet".
    - Call Sheet opens as a separate modal/document from the current schedule. The schedule editor header and grid are unchanged — no call-sheet-only fields were added to the schedule.
    - Call Sheet pulls existing schedule data: schedule name, project/production name, phase, Day X of Y, date, town/location, producer, director, camera, weather (condition + temp range where available), and a simplified schedule timeline (time + action + location per non-blank row).
    - General call is derived automatically from the first non-sun row. Staggered/group call times are deferred to a future structured call-sheet extension.
    - Call-sheet-specific fields are stored under `meta.callsheet: CallSheetData` (additive optional field on `ScheduleMeta`; old schedules with no `callsheet` field work unchanged): `basecamp`, `parking`, `hospital`, `emergency`, `mealNotes`, `safetyNotes`, `specialInstructions`, `notes`.
    - Blank fields are hidden in both the digital call sheet display and all print/PDF output.
    - Basecamp, Crew Parking, and Nearest Hospital use `LocationField`: Google Places autocomplete when editing (same infrastructure as the main schedule editor); `📍` map-pin link (Google Maps directions) in display mode; map pin hidden in print.
    - Contacts can be included with a toggle but default OFF each time the modal opens.
    - Call Sheet print is fully isolated: `callsheet-print-only` portal on `document.body` + `body.callsheet-printing` class; includes Roseland branding/logo, branded header bar, General Call box, Key Information (before Schedule), Contacts (toggle-gated), and schedule summary. Normal schedule Print/PDF, Contact Sheet print, Library, snapshots, and read-only view are unaffected.
    - Print: Key Information and Contacts avoid interior page breaks; headings avoid orphaning; time column stays on one line; long location text wraps cleanly; no blank trailing page.
    - **Design principle:** The schedule stays clean. The Call Sheet is a separate document that shares data with the schedule. This is a foundation for future Production Command / multi-day call-sheet workflows.
    - **Deferred (not Phase 10):**
      - Shareable call-sheet URL (currently editor-only modal/print/PDF)
      - Vendor/crew-specific call sheet views
      - Staggered/group call times
      - Distribution lists
      - Production-level office/coordinator fields
      - Advance schedule / next-day preview
      - Role-specific call sheets
      - Server-side PDF generation
20. **Multi-day projects** — master schedule containing multiple daily schedules, duplicate day, move rows between days
21. **Production management** — booking/permit/release/vendor/location status tracking, crew/gear/travel notes — film-specific not generic PM
22. **CMS branding architecture** — per-schedule templates, multi-brand support (Roseland/Saluki/neutral SaaS shell) — needs dedicated planning session before any code

## 🟢 Longer-Term (SaaS layer)
*Architectural shift — plan carefully before starting*

23. **User accounts** — replace shared PIN with real auth (Clerk recommended); migrate storage from Netlify Blobs to a database with true atomic writes (PlanetScale or Supabase) — Netlify Blobs has ~15 second eventual consistency which is acceptable for single-PIN use but insufficient for real multi-user collaboration
24. **Roles** — Admin / Producer / Editor / Read-only / Client / Vendor
25. **Multi-org** — each company gets own data, branding, CMS config; aligns with CMS branding architecture above
26. **Billing** — Stripe, seat-based or per-org subscription
27. **Collaboration** — presence indicators, conflict prevention, eventually live shared editing
28. **PWA/App Store** — installable PWA first, App Store packaging later

## 🔵 Vision (longer horizon)
*Where this becomes a platform*

29. **Budgeting integration** — connect schedule (shoot days, crew, gear, locations) to budget rollups
30. **Saluki Media version** — AED currency, VAT, Arabic market branding
31. **Master Schedule** — birds-eye view across all active productions
32. **AI production tools** — shot tracking, prompt/reference tracking, generated shot status, rights/licensing

---

## Session Order
- **Also pending:** Item 4 (PWA install test on real iPad — manual test only)
- **Phase 1 / 1A complete:** Library Refresh reliability, Save As grouping fix, Archive/Restore persistence, Same-section DnD hardening, Permanent Delete for archived schedules. All passed testing 2026-05-24. Branch: `library-refresh-archive-fix`.
- **Phase 2 complete:** Safe schedule title rename. Passed testing 2026-05-24. Branch: `phase-2-safe-schedule-rename`, merged to `main` 2026-05-24.
- **Phase 3 complete:** Move To workflow (cross-production/cross-phase schedule movement). Passed testing 2026-05-24. Branch: `phase-3-move-to-workflow`, merged to `main` 2026-05-24.
- **Phase 4 complete:** Location Details / Sub-locations (stacked inline, no modal). Passed testing 2026-05-25. Branch: `phase-4-location-details`, merged to `main` 2026-05-25.
- **Phase 4 post-release fixes (merged to `main` 2026-05-25):** DnD regression (`useLayoutEffect`, `type="button"`, CSS transition removal in `LocationCell.tsx`); `"00:00"` duration/Time Out regression (`r.dur === ''` guards throughout; `computeTimeOut` now returns Time In for zero-duration rows). Branch: `fix/dnd-regression`.
- **Phase 4B (deferred):** Contact button evaluation — contact-per-sub-location integration or broader row/contact redesign. Not yet started; revisit after item 17 (public view contacts).
- **Phase 5 complete:** Contact Sheet / Contact Extract. Passed testing 2026-05-25. Branch: `phase-5-contact-sheet`, merged to `main` 2026-05-25.
- **Phase 6 complete:** Library Declutter / Mobile Polish. Passed testing 2026-05-25. Branch: `phase-6-library-declutter`, merged to `main` 2026-05-25.
- **Phase 7 complete:** Read-only Link Experience / Client View Polish. Passed testing 2026-05-25. Branch: `phase-7-readonly-view-polish`, merged to `main` 2026-05-25.
- **Phase 8 complete:** Snapshot UX Polish. Passed testing 2026-05-25. Branch: `phase-8-snapshot-ux-polish`, merged to `main` 2026-05-25.
- **Phase 9 complete:** Schedule Header Identity Fields. Passed testing 2026-05-26. Branch: `phase-9-schedule-header-identity`, merged to `main` 2026-05-26.
- **Phase 10 complete:** Call Sheet Foundation. Completed and deployed 2026-05-26. Branch: `phase-10-call-sheet-planning`, merged to `main` 2026-05-26. Includes full Call Sheet modal, print portal, Google Places location assistance for location-style fields, map-pin links, print layout polish, and blank-page fix.
- **Next recommended phase:** Planning conversation for Item 20 (Multi-day / Master Schedule) and the future structured Call Sheet extension (staggered call times, distribution, shareable URL). Item 11 (push notifications for overtime) remains a self-contained short-term polish item. Item 16 remaining scope (side-by-side compare, full autosave redesign, snapshot rename) deferred. Item 17 remaining work (public contact cards, contact visibility toggle, separate vendor/crew link type) deferred — requires explicit privacy design before implementation.
- **Near-term polish:** Item 11 (overtime push notifications).
- **Item 22 (CMS architecture):** Planning conversation before any code.

---
*Last updated: 2026-05-26 — Phase 10 Call Sheet Foundation complete and deployed. Item 19 marked complete. Session Order updated. Next: planning conversation for Item 20 (Multi-day / Master Schedule) and future structured Call Sheet extension (staggered calls, distribution, shareable URL).*
