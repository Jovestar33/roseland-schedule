# Paginated library and input continuation

September 19, 2026. These browser journeys use the existing disposable North Editor and South Viewer sessions. The continuation adds 125 fictional schedules in North: 120 library records and five isolated runtime cases. It creates no identity, membership, invitation, credential or grant. The retained 15-document review organization is separate.

## Complete-library behavior

The Editor's readable North library spans two real RPC pages, 100 plus 18 records. Eight new Trash fixtures are not readable by this Editor. Searching `Runtime library` therefore produces 104 Active, 8 Archived and 112 All saved records. Exact visible names were compared to the fixture manifest, not just the displayed count. A known second-page record, Runtime library 011, is found by search.

Trimmed mixed-case town search returns 56 Harbor schedules. Combining that search with North production and October 10–15 returns the expected 12 records, in ascending schedule-date order. A reversed date range returns zero. Clear filters resets production, collection, sort and dates while retaining the search; the separate clear-search control restores the full active list. Results and exact names are recorded in `cases/library-checks.json` and `cases/library-sort-check.json`.

A controlled second-page 503 during Refresh reports an error and retains the previous complete 104 matching records. A fresh browser session with no prior complete library instead shows Library unavailable and no partial first-page schedule buttons. Clearing the fault and refreshing recovers the complete list. During a manual held refresh, operation controls and organization switching are disabled. During initial scope loading, switching remains available: two overlapping North second-page responses were held, South was selected and loaded, then both North responses were released. South remained selected with only its own read-only day. No library implementation change was needed for these cases.

## Action, time and contact edges

The new input fixture uses the same ActionCell, time controls, ContactModal and schedule store as the legacy editor. Current browser checks cover these additional slices; they do not claim a new paired legacy browser run for every combination.

- Other action text containing spaces, an accent, punctuation and Japanese characters survives action-return Undo and saved reopen. The saved document retains the exact original custom text, including surrounding spaces.
- 11:45 PM plus 00:30 displays 12:15 AM and cascades that time into the next row. Zero duration produces the same in/out time and no missing-duration hint; a blank duration removes Time Out and shows the downstream hint.
- Pinning the second row at 12:45 AM shows a 30-minute gap. Unlocking it restores the 12:15 AM cascade and removes the gap. Final saved rows retain the expected 00:30 and 00:15 durations.
- Fictional Unicode name/title, an international-format phone with extension, and a plus-addressed `example.invalid` email save and reopen. Contact fields trim surrounding spaces. Closing an edited modal discards its unsubmitted name; Undo restores the previous contact after an explicit contact save. No Email or Call action was launched.
- Reopening the saved schedule and authenticated document readback agree on custom action, times, contact fields and two rows (`readback-input-final.json`, input screenshots/captures). Native select controls expose only preset time/duration choices, so arbitrary malformed typed time was not claimed as an available UI journey. The legacy contact modal has no form-submit email validity gate; this pass preserves that behavior and does not certify address deliverability.

## Fixture and observation limits

The initial SQL library seed omitted its denormalized town column. A direct SQL repair failed atomically because the normal updated-by trigger had no authenticated actor. The 112 member-readable new library fixtures were then repaired through genuine authenticated saves of their unchanged documents; the eight unreadable Trash records were left alone. The seed script now supplies town initially. `fixture-town-repair.json` records this setup issue; it was not an application search defect.

Phone and email values are omitted from the browser text snapshots even when visibly populated. A screenshot and authenticated fictional document readback verified them. Repeated exploratory typing briefly duplicated the unsubmitted fields; the fields were replaced with the intended exact values before saving. No real contact data was used.

Evidence is in `evidence/b15-runtime/cases/`. Multiple productions, all ordering/drag combinations, all invalid/imported time forms, physical keyboards and devices, and all contact-output permutations remain outside these additional slices.
