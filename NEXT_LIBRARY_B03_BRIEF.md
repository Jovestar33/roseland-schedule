# Proposed next batch — library parity and B03 placement/identity

This is a reviewable proposal, not authorization to implement B03, reskin, deploy or access actual schedules. B02 is accepted at `c14e03f`. B04 has passed its separate local acceptance gate; its commit accompanies this brief. The user requires technical and functional/layout parity before reskin.

## Concrete problem and target

The paired fictional desktop/phone evidence in `LIBRARY_PARITY_ISSUE.md` shows a flat local list beneath a large workspace header where the existing library provides production/phase hierarchy, compact schedule rows, search/filter controls, tabs and contextual actions. The next implementation should recover those functions and their usable information density using the existing authenticated workspace and B01 draft/result-recovery contracts. Do not accept visual restyling as a substitute.

Start with equivalent fictional inventories at 1280×720 and 390×844. Include empty, long-name, multi-production, multi-phase, unassigned-day (if approved), archived/deleted, read-only and many-page cases. Keep document and file tools accessible without adding them as permanent oversized blocks above every library row. Preserve existing route/back/forward and unfinished work behavior.

## Decisions required before placement/identity implementation

| Question | Concrete proposal for review | Why it matters |
|---|---|---|
| Same-production moves | Preserve schedule UUID and document history while reparenting between existing authorized days; use an expected placement/version check. | A parent-field update alone does not define concurrency, rollback or retained-draft behavior. |
| Cross-production moves | Decide explicit copy with new UUID versus atomic transfer preserving UUID. If copy, decide source archive/retention and aliases separately. | Changes access, identity, history ownership and legacy links. No implicit transfer or source deletion. |
| Hierarchy/metadata authority | Specify whether production/phase/day names and dates drive corresponding document labels or remain separate, and how mismatches are reviewed. | B04 preserves supplied document metadata exactly and assigns only an existing destination day. No silent metadata rewrite has been approved. |
| Folder normalization and unplaced records | Approve mapping of legacy folders/phase/day labels, duplicate names, blank paths and ordering. Retain unrecognized source values for review. | Avoid inventing hierarchy or dropping schedules that do not fit it. |
| Names, slugs and aliases | Decide scope/case normalization of display-name uniqueness, alias collision resolution, rename history and old-name lookup. | Existing SQL atomically protects active slugs within a production; display-name duplication is currently a client preflight check, not a database uniqueness constraint. |
| Deleted parents and recovery | Define recovery placement when a production/phase/day is deleted or restored and how old aliases resolve. | Parent visibility and permission checks must remain consistent across lists, history and mutations. |

No decision above authorizes cross-tenant transfer, real-data metadata utilities, templates/CMS scope or public sharing audiences. Those remain separate gates.

## Bounded implementation after decisions

Use T2/T3 repositories and current SQL protections to integrate the production/phase/day library, paging, search/filter/order and compact row actions. Add narrowly versioned placement/alias contracts and a forward migration only if the reviewed decisions require them. Preserve old migrations and retained data; use a fresh disposable local stack for schema work.

Review layout against the existing library before styling changes. Keep schedule drafts, undo history, modal drafts, B01 uncertain saves and B04 immutable creation IDs through navigation/auth recovery. Do not reuse display names as record identity. Show explicit user decisions when a move would invalidate a retained draft or change access.

## Acceptance evidence

- Same-parent and approved cross-parent cases, denied destinations, read-only users and tenant isolation using genuine local Auth.
- Rename/name/slug/alias collisions; stale placement/order versions; concurrent moves; parent deletion/recovery; rollback of references/history and old aliases.
- Paginated inventory and metadata/alias reconciliation, including records that cannot be automatically mapped.
- Visible desktop/phone library functionality, density, navigation, empty states, keyboard access and retained-draft recovery; labeled screenshots with equal fixture inventories and viewports.
- Platform/editor/SQL regressions, production build/types/lint, scoped internal review, created-ID manifest and a separate accepted local commit.

Stop at the reviewed library/placement scope. Hosted paired parity, supported browser/device matrix, complete migration exporter, public links and reskin remain separate work. Do not claim B03 or LIB-03 complete while cross-production identity behavior is unresolved.
