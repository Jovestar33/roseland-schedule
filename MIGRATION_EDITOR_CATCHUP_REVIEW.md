# Migration editor and administration catch-up — October 20, 2026

## Review target

Branch: `codex/migration-editor-catchup`. Base: local consolidated Library work at `56f9966` (including its unpushed UX changes). The primary checkout remains untouched.

Canonical local preview: http://127.0.0.1:3532/review?org=c319911f-a044-4def-b7f4-ee4b501e774e

The preview uses newly created fictional records in the existing local Supabase service. No hosted database, live schedule, production deployment, or migration cutover changed. This is a review candidate, not a claim of human acceptance or complete platform readiness.

## Production editor parity

Ported the five production fixes through origin/main `1987fca`:

- Stable draggable indices (`ceae7aa`).
- Deferred textarea resizing to prevent ResizeObserver errors cancelling multiline drags (`9e63226`).
- Automatic weekday beside the selected date (`f3a1004`).
- Full printed header only on the first page (`172e3a9`).
- Exact custom duration entry alongside existing presets (`b9eef97`).

The Supabase persistence, account boundaries, Library grouping, and migration tools are retained.

## Layout and administration

The user's requirements were recovered from “Roseland Schedule — Voice and Planning” (thread `01a092e9-5cd0-7100-8feb-2b20d2a899fa`): distinguish Platform Super Admin from Organization Super Admin, keep defaults permissive, restrict administration to appropriate roles, and expose organization/production/schedule scope clearly.

This pass separates Your account, Your invitations, People & invitations, Organization, and Permissions. Organization controls group sign-in requirements, appearance, and lifecycle. Permission scope has explicit tabs and requires a valid production/schedule selection before showing editable restrictions; unfinished drafts prevent scope changes. Existing server authorization remains unchanged.

Appearance controls use a scrollable form with persistent Save/Cancel actions. Account and admin controls use the editor's typography, colors, surfaces, spacing, and focus styles. Invitation labels now use Organization Super Admin and Organization Admin. The tool chooser is compact; working tools retain their larger panels. Redundant save messages no longer shift the editor.

## Fresh evidence

- Editor suite: 125 passed.
- Platform suite: 258 passed.
- Production build and type validation passed. Two pre-existing hook lint warnings remain in LocalScheduleClient and LocalScheduleLibrary.
- Fictional Organizer: signed in through normal access checks; admin navigation absent.
- Fictional Organization Super Admin: normal MFA verified; administration sections available.
- Browser: selected a 20-minute custom duration, saved, and observed updated cascading times.
- Browser: dragged the last multiline action above the middle action; saved order survived reload. No browser error logs were reported during the test.
- Browser: October 22 displays Thursday.
- Browser: Schedule permission scope requires production and schedule; selecting Main Street Stories / Cedar Falls loads that target.
- Browser: appearance Save/Cancel remain visible while labels scroll.
- Browser: two-page print preview retains full descriptions on its notes page without repeating schedule metadata there.
- Comparison used current production source in a local reference server, not an authenticated live production session.

## Review and remaining boundaries

1. Review the Library and editor visually, including narrow-window use.
2. Review Account & settings as both a normal member and Organization Super Admin.
3. Check permission scope labels and default behavior against the team's actual workflow.
4. Export a native PDF and inspect pagination on the intended printer/paper settings.

Fresh native PDF export and mobile viewport verification are still outstanding. The separate Platform Super Admin console, billing/service management, and top-level production creation/rename are not completed by this pass. Existing automated platform tests do not replace an end-to-end acceptance review of every administration workflow. Deployment and cutover require a separate decision.

## Subsequent platform console increment

The initial Platform Super Admin overview and organization-creation entry point are now implemented locally; see [Platform console review](PLATFORM_CONSOLE_REVIEW.md). Billing/service management and the other acceptance boundaries above remain open.
