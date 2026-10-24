# Duration-led timing trial

The Vercel editor offers fixed starts and finishes on every schedule. Opening a saved schedule preserves its stored timing; text, contact, weather and other non-timing changes also preserve it. Duration changes, explicit fixed-time changes, action insertion/deletion/reordering, and changing the between-anchor direction recalculate the plan. Missing durations are unknown, never assumed to be zero. A zero-duration marker is supported.

Call time is not automatically fixed. Without explicit anchors, timing edits use the existing first action start as a soft starting point. A later fixed start or finish can move the call backward. Existing explicit locks remain fixed. Overnight offsets are retained in saves, exports, snapshots, restricted Client views, call sheets and print.

Gaps offer an Add action here control; overlaps and incompatible fixed endpoints are warnings and never silently shorten durations. Undo restores exact previous values.

## Verification

- 227 editor tests (including 2,000 deterministic generated single/multiple-anchor plans); 404 platform tests.
- Local production build and lint passed; three pre-existing hook warnings remain.
- 14 rollback-only database assertions passed. Additive hosted migration 20261024024627 applied; 63 active schedules retained. No hosted schedule records were changed by tests.
- Browser checks: fixed minute finish on an old schedule, backward call calculation, first-row keyboard drag, forward planning, partial gap fill, overlap, Undo, local save/reload and overnight day labels. Safari full-width layout inspected.
- Supabase advisors report existing restricted private-table / security-definer RPC and index/RLS performance advisories; neither changed timing function is flagged. No grants or RLS policies were changed.
- Human usability and design acceptance remains pending.

## Synchronization

Resolved new-app timing can sync to Netlify. Once a schedule uses the new timing metadata, subsequent Netlify timing/order edits require conflict review; they cannot silently replace the resolved plan. Legacy description-only edits still sync if timing is unchanged. No new legacy editor features are deployed.

## Rollback

Pre-timing application commit: b6391247dcc1da4c0ed5686574eff281b59a81b5.
Previous production deployment: https://vercel.com/roseland-pictures/roseland-schedule/A5eKYPAa87zra6YH72r5m6FZi2uk.

An app rollback does not restore saved schedule data. Before reverting, preserve any schedules edited during this trial using exports/history; review timing metadata and synchronization conflicts. The additive validator migration can remain in place. Restore individual prior document versions only on explicit request. Do not reset the database or revert unrelated contacts/call-sheet work.

## Review

Canonical review: /Users/johnsammon/roseland-schedule/artifacts/ui-review-20261020.
Updated timing review uses isolated examples of the actual editor. Save example stays in page memory only; no real records or browser review notes are modified. Previous user notes and decisions are retained.
