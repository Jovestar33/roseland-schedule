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
7. **Schedule header fields** — add Project Name, Phase, Day Out of Days above Town/Location (crew block already done; these three fields remain)
8. ✅ **Move CMS to Library** — CMS button removed from schedule toolbar, now in Library header
9. **Export Current JSON** — move to schedule toolbar, remove from Backup tab
10. ✅ **Tools Panel slide-over** — `ToolsPanel.tsx` renders via `createPortal` to `document.body`; slides from right on desktop/tablet (380px), bottom sheet on mobile (70vh). Three tabs: Templates (save/apply/delete templates from within an open schedule — the context problem is now solved), Backup (Export JSON), Restore (snapshot cards with Preview, Save As New, Restore, Delete). Merged to main 2026-05-15.
11. **Push notifications for overtime** — alert when action runs over its duration
12. **Library improvements** — search/filter schedules, sort options, archive instead of hard delete, open recent
13. **Contact sheet / extract** — generate a shareable contact list URL or exportable sheet from schedule row data; evaluate whether a lightweight contacts DB is needed to support this properly
14. **Version history UX** — named versions, better restore UX, compare versions, save version as new schedule
15. **Client read-only view enhancements** — crew contact cards visible in public view

## 🟡 Medium-Term (v2 — next major development cycle)
*New feature categories that expand scope significantly*

16. **Call sheets** — generate from schedule, pull weather/locations/contacts/rows, add parking/safety notes, export PDF
17. **Multi-day projects** — master schedule containing multiple daily schedules, duplicate day, move rows between days
18. **Production management** — booking/permit/release/vendor/location status tracking, crew/gear/travel notes — film-specific not generic PM
19. **CMS branding architecture** — per-schedule templates, multi-brand support (Roseland/Saluki/neutral SaaS shell) — needs dedicated planning session before any code

## 🟢 Longer-Term (SaaS layer)
*Architectural shift — plan carefully before starting*

20. **User accounts** — replace shared PIN with real auth (Clerk recommended); migrate storage from Netlify Blobs to a database with true atomic writes (PlanetScale or Supabase) — Netlify Blobs has ~15 second eventual consistency which is acceptable for single-PIN use but insufficient for real multi-user collaboration
21. **Roles** — Admin / Producer / Editor / Read-only / Client / Vendor
22. **Multi-org** — each company gets own data, branding, CMS config; aligns with CMS branding architecture above
23. **Billing** — Stripe, seat-based or per-org subscription
24. **Collaboration** — presence indicators, conflict prevention, eventually live shared editing
25. **PWA/App Store** — installable PWA first, App Store packaging later

## 🔵 Vision (longer horizon)
*Where this becomes a platform*

26. **Budgeting integration** — connect schedule (shoot days, crew, gear, locations) to budget rollups
27. **Saluki Media version** — AED currency, VAT, Arabic market branding
28. **Master Schedule** — birds-eye view across all active productions
29. **AI production tools** — shot tracking, prompt/reference tracking, generated shot status, rights/licensing

---

## Session Order
- **Also pending:** Item 4 (PWA install test on real iPad — manual test only)
- **Next v1 polish:** Items 7, 9, 11–15 grouped by theme
- **Item 19 (CMS architecture):** Planning conversation before any code

---
*Last updated: 2026-05-15 — Tools Panel (Item 10) merged to main; mobile toolbar/grid polish pass complete*
