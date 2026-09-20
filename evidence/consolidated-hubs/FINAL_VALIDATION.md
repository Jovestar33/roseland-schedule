# Consolidated Library hubs — final local review

September 20, 2026. Implementation commit `7b1fb96`, branch `codex/consolidated-library-hubs`, checkout `/private/tmp/roseland-consolidated-library-hubs`.

Preview: http://127.0.0.1:3532/review?org=13863b28-d671-4da3-b73e-4d907222630e

Build: `uvLqVxKQybfqhGW8_GIpU`. Launcher: `scripts/serve-consolidated-hubs.ts`. Private process record: `/private/tmp/roseland-consolidated-hubs-process.json`. Existing fictional Organizer credentials remain in the original private review-access file; no credentials are included here.

## Result

The Library now groups schedules by production, then named phase/hub, regardless of whether a production day is assigned. Truly unphased schedules appear directly beneath their production. Empty named phases remain visible in the unfiltered Active collection. No synthetic “No production day” grouping is introduced.

Mixed day-assigned/dayless siblings share one version-checked, atomic ordering operation. The old ordering RPC remains unchanged for older previews. Per-schedule restrictions, full visible-group validation, active-session admission, and organization policy locking remain enforced.

Organizer-only contextual phase creation and rename are restored, with stable create IDs, saved rename versions, explicit retry/readback after ambiguous results, and no schedule-document rewrites. Production/phase disclosure state is retained per actor and organization. Existing production up/down order controls remain intact. Filtered/loading/error states disable arrangement.

Existing rose links, display heading and restrained card shape are retained. Contextual creation is a quiet text link; long production and phase names wrap at phone width.

## Consolidated lineage and preserved scope

Base `7ef7023` includes `1763e75` professional Call/Contact Sheets, `c128007` compact notes, and `ce65f51` complete schedule printing/key instructions/production hub ordering. The approved Library color change was cherry-picked as `ef893ae` before this implementation.

The new batch changes only Library source, its repository contract, focused tests, additive SQL, and preview/fixture verification scripts. It does not change schedule editor, recipient-cookie refresh/retry, date-label, compact-note, print-preview, professional document, authentication, or sharing source.

Existing 3528, 3530 and 3614 previews were preserved; no hosted database, push, deployment, or production data changes occurred. New local migration `20260920065905_phase_group_library_order.sql` is applied and recorded on `supabase_db_roseland-b14-destination-g2` (API 56521). Prior key-instruction and production-hub migrations remain present.

## Fresh validation

- Optimized production build/type-check passed. Two pre-existing hook warnings remain in LocalScheduleClient and the Library load-effect cleanup.
- Full editor regression suite: 118 passed. Focused Library repository tests: 5 passed. Final focused UI tests: 3 passed, covering scope changes, load errors, mixed grouping and actor/organization collapse persistence.
- Local rollback SQL tests: 26 phase-group assertions plus 14 production-hub assertions passed. These cover mixed grouping, missing siblings, stale versions and atomicity, unphased ordering, phase creation/rename, create retry, cross-tenant denial, Editor denial, per-schedule Organizer restrictions, and active sessions.
- Security advisor: “No issues found” using the actual local B14 project configuration. Direct catalog checks confirm both new RPCs have fixed empty search paths, authenticated-only execution, and no anonymous/service-role execution. SQL function lint returned `[]` with the checker loaded inside a rollback-only transaction.
- All 190 original full-row fingerprints unchanged: 155 schedules, 9 productions, 17 organization memberships, 9 production memberships. See `preservation-final.json`.
- Fresh fixture organization: 3 productions, 8 named phases after UI creation, 13 schedules after UI creation. Final Organizer API readback confirms saved names, placement, versions and production order.
- Normal browser UI: keyboard moved Pine Ridge scout below day-assigned Cedar Falls shoot within Mountain hub; saved production order changed to Travel / Documentary / Studio; renamed Upcoming hub to Upcoming locations; created Pickup hub; created/opened a dayless schedule contextually inside it. Reload retained the saved changes and collapsed Mountain hub. Search located Cedar under its phase and disabled ordering; Archived empty-state and Clear filters worked.
- Desktop and actual 390px screen checks passed. At 390px, document scroll width is exactly 390; Fictional Studio Campaign wraps to two lines with client/scroll widths 172/172. See final screenshots and `mobile-geometry.json`.
- Independent UI/Experience final review passed after its two requested visual corrections. The reviewer used its own tab, checked desktop/390, mixed phase membership, direct unphased placement, compact notes disclosure, and live Call/Contact Sheet composition; it made no source or data edits.
- Fresh schedule-print smoke: Cedar Falls opens Compact schedule + full notes with 1 schedule page + 1 notes page; All details inline shows the full descriptions/notes on 1 page. This was a screen preview, not a new PDF export.

## Evidence boundaries and remaining legacy gap

Top-level **production creation and production rename controls are still absent from this Library**. This batch restores contextual phase/hub create/rename inside existing productions and retains existing production ordering. It does not claim complete parity for every legacy administration workflow.

The earlier native PDF export, long-content pagination, appendix destinations and professional document extraction checks are inherited from the notes/document implementation reports. They were not repeated as native exports in this batch. Compact note and Call/Contact screens were freshly smoke-checked; the full regression suite also passed. Key-instruction serialization and recipient-cookie security code are preserved and covered by inherited tests; no new end-to-end sharing run was performed.

The automated date-input attempt displayed the requested dates but did not establish a changed filtered result. No fresh browser date-filter pass is claimed; its filtering logic was not modified. Saved disclosure state can keep a matching phase collapsed during search; expanding it reveals the counted match.

Initial validation setup errors were resolved: the hardened local postgres role lacks schema CREATE, so the migration used the same local migration administrator as the existing production-hub migration. A saved DB connection URL failed for advisors; the verified `--local --workdir /private/tmp/roseland-b14-destination-g2` configuration succeeded. No security grants were loosened to address either issue.
