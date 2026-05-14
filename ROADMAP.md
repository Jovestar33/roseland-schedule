# Roseland Schedule — Master Roadmap

## 🔴 Immediate (current session / next 1-2 days)
*App is deployed with real data — these must be done before team use*

1. ✅ **Save overwrite warning audit** — conflict detection rebuilt with pure savedAt comparison; Netlify Blobs eventual-consistency stale-read handled correctly
2. ✅ **Print/PDF verification** — landscape default set via `@page { size: landscape }`; filename format `"[scheduleName] – [YYYY-MM-DD]"` working
3. **Mobile/iPad layout pass** — largely complete; two items remain:
   - ✅ Library horizontal overflow fixed (mobile-polish → main, 2026-05-13)
   - ✅ iOS Safari Dynamic Island portrait clipping fixed — root cause was CSS `padding:10px !important` shorthand in `mobile.css` overriding all JS and inline padding; fixed with `padding-top:max(70px, env(safe-area-inset-top, 70px)) !important`; login scroll reset also fixed (`scrollTo(0,0)` + 80ms delay before `router.replace`)
   - ⏳ **Contact icon clipping on grid right edge (portrait mobile)** — partially fixed on `mobile-polish` branch (column width 56→64px, cell padding zeroed on nth-child(10)), NOT yet merged to main. Needs verification before merge.
   - Note: Safari and Chrome favicons confirmed working as of 2026-05-13
4. **PWA manifest** — make app installable on iPad home screen
   - Status: `manifest.ts` built and deployed, iOS meta tags in place, icons generated at 192×192 and 512×512. Remaining: test PWA install on real iPad in Safari (Share → Add to Home Screen) and verify standalone landscape mode launches correctly
5. **Print font sizes — tablet and mobile** ← ACTIVE, branch: `mobile-and-tablet-print` (cut from main 2026-05-14)
   - Desktop/laptop prints correctly (baseline)
   - **Tablet**: "PRODUCTION SCHEDULE" header text too small; grid column headers (ACTION, LOCATION, etc.) too small
   - **Mobile**: same header issues PLUS grid field body text also too small
   - Root cause to investigate: `print.css` uses `@media print and (hover: none) and (pointer: coarse)` to target touch devices. Tablet likely matches this query but font sizes in those blocks are tuned for phone scale. Need separate tablet breakpoint or size bump specifically for tablet coarse-pointer engines.
   - Key print CSS facts: desktop baseline is `thead th { font-size: 9px }`, `td { font-size: 8.1px }`, `hdr-title { font-size: 17px }`. Mobile/touch overrides live in V14d–V14k blocks (lines ~609–1497 of print.css). Currently landscape touch: `thead th ~7.55px`, portrait touch: `thead th ~7px` — both smaller than desktop baseline, explaining the "too small" complaint.

## 🟠 Short-Term Polish (v1 — next 2-4 sessions)
*Quality of life improvements before wider use*

5. **Schedule header fields** — add Project Name, Phase, Day Out of Days above Town/Location
6. ✅ **Move CMS to Library** — CMS button removed from schedule toolbar, now in Library header
7. **Export Current JSON** — move to schedule toolbar, remove from Backup tab
8. **Library/Snapshots accessible without closing schedule** — slide-over drawer
   - Note: Templates tab is currently broken because "Save Current as Template" requires an open schedule, but templates are only accessible from the Library when no schedule is open. This must be fixed as part of the Library slide-over drawer feature — templates need to work from within an open schedule context.
9. **Push notifications for overtime** — alert when action runs over its duration
10. **Library improvements** — search/filter schedules, sort options, archive instead of hard delete, open recent
11. **Contact sheet / extract** — generate a shareable contact list URL or exportable sheet from schedule row data; evaluate whether a lightweight contacts DB is needed to support this properly
12. **Version history UX** — named versions, better restore UX, compare versions, save version as new schedule
13. **Client read-only view enhancements** — crew contact cards visible in public view

## 🟡 Medium-Term (v2 — next major development cycle)
*New feature categories that expand scope significantly*

14. **Call sheets** — generate from schedule, pull weather/locations/contacts/rows, add parking/safety notes, export PDF
15. **Multi-day projects** — master schedule containing multiple daily schedules, duplicate day, move rows between days
16. **Production management** — booking/permit/release/vendor/location status tracking, crew/gear/travel notes — film-specific not generic PM
17. **CMS branding architecture** — per-schedule templates, multi-brand support (Roseland/Saluki/neutral SaaS shell) — needs dedicated planning session before any code

## 🟢 Longer-Term (SaaS layer)
*Architectural shift — plan carefully before starting*

18. **User accounts** — replace shared PIN with real auth (Clerk recommended); migrate storage from Netlify Blobs to a database with true atomic writes (PlanetScale or Supabase) — Netlify Blobs has ~15 second eventual consistency which is acceptable for single-PIN use but insufficient for real multi-user collaboration
19. **Roles** — Admin / Producer / Editor / Read-only / Client / Vendor
20. **Multi-org** — each company gets own data, branding, CMS config; aligns with CMS branding architecture above
21. **Billing** — Stripe, seat-based or per-org subscription
22. **Collaboration** — presence indicators, conflict prevention, eventually live shared editing
23. **PWA/App Store** — installable PWA first, App Store packaging later

## 🔵 Vision (longer horizon)
*Where this becomes a platform*

24. **Budgeting integration** — connect schedule (shoot days, crew, gear, locations) to budget rollups
25. **Saluki Media version** — AED currency, VAT, Arabic market branding
26. **Master Schedule** — birds-eye view across all active productions
27. **AI production tools** — shot tracking, prompt/reference tracking, generated shot status, rights/licensing

---

## Session Order
- **Current session:** Finish link cleanup → test → wrap
- **Next session:** Items 3–4 (mobile/tablet pass + PWA install test)
- **Then v1 polish:** Items 5–13 grouped by theme
- **Item 17 (CMS architecture):** Planning conversation before any code
