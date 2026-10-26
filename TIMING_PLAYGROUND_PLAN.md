# Timing playground — approved experiment and new-chat handoff

Approved direction October 25, 2026. This is roadmap step 3, separate from live timing. John is working on it in a separate chat. Committing this plan records requirements only; sandbox implementation, browser experiments and generated preview assets stay outside the documentation commit. See [rollback record](FLEXIBLE_TIMING_RELEASE.md) and [current status](CURRENT_STATUS.md).

## Objective and boundaries

Improve flexibility within the existing schedule framework, with minimal design interference. Preserve the familiar grid, dimensions, typography, colors, duration foundation and unrelated functionality. Experiment in the existing isolated playground, not the live editor. No hosted changes, real-schedule mutations, deployment, or reactivation of the rejected timing trial is authorized by this plan. Passing automated tests alone is insufficient: John must find the behavior predictable.

## Approved behavior to explore

- Follow previous action: prior finish determines start; duration determines finish.
- Lock Time In: duration edits move finish, retaining start.
- Lock Time Out: duration edits move start, retaining finish; warn about continuity.
- Permit unscheduled actions with durations without inventing a clock time.
- Initially allow one locked endpoint per action. Do not silently unlock anchors, shorten durations or move unrelated fixed times.
- Crew call is an event, not the compulsory start of the schedule. Support pre-call actions, lunch created first, independent blocks and arbitrary action creation/insertion order. Editing a time must not unexpectedly sort rows.
- Compare explicit backward planning with a preview (“Plan preceding actions backward from here”) against more automatic behavior before selecting the final interaction.
- Recalculate on timing edits; preserve saved times on opening.
- Distinguish unplanned gaps, intentional buffers, overlaps and unscheduled actions. Offer adding travel/setup/hold, moving unlocked work to close a gap, or intentionally retaining it. Do not repeatedly nag about an intentional buffer or imply an overlap is safe merely because it was dismissed.

## Acceptance

Test continuous days, locked starts/finishes, location hard-outs, lunch entered first, pre-call work, moved/deleted anchors, multiple anchored blocks, overnight times, custom durations, Undo/Redo, unchanged opening, and print/editor agreement. Verify Safari and Chrome interactions. Preserve the simplest normal workflow; John should predict what will change before acting. Log unresolved decisions separately from bugs.

## Existing artifacts

- `/private/tmp/roseland-account-preview/timing-playground/`
- `/Users/johnsammon/roseland-schedule/artifacts/ui-review-20261020/timing-playground/`
- Rejected trial archive: `/Users/johnsammon/roseland-schedule/artifacts/timing-trial-archive-20261024/`

These are the retained handoff paths, not a fresh report of the separate chat's working state or server availability. Coordinate with that chat before changing its files or services. Recover source provenance before editing generated bundles, and preserve browser-local experiments before replacing a preview. This documentation reconciliation does not restart or modify the timing playground.

## Original separate-chat handoff — retained reference

The following brief was prepared before the timing chat began. Its restore-first instructions are historical; the active timing chat owns current source, preview and server decisions.

Work on the isolated timing playground for Rally / Roseland Schedule. Read TIMING_PLAYGROUND_PLAN.md, FLEXIBLE_TIMING_RELEASE.md, CURRENT_STATUS.md and ROADMAP.md in `/Users/johnsammon/.codex/worktrees/fix-schedule-drag/roseland-schedule` first. Inspect the existing playground and its source; reuse the approved grid and visual design. Help me test fixed Time In or Time Out, free duration edits, backward planning, pre-call actions, non-linear creation and understandable continuity warnings. Keep all experiments isolated from real schedules and the live editor. Start by restoring the existing preview and showing one ordinary continuous day, one location hard-out, and lunch entered first. Explain expected behavior before changing it, then iterate with me. Test the listed edge cases, preserve Undo and saved experiments, and maintain a clear findings log. Do not deploy, change hosted data, redesign unrelated UI, or reintroduce the rejected timing implementation without approval.
