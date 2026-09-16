# Production Command — brand and design direction

Confirmed by the user on September 16, 2026. This is the shared decision record for planning and development tasks. Read it alongside [ROADMAP.md](./ROADMAP.md), [READINESS.md](./READINESS.md), and [REGRESSION_MATRIX.md](./REGRESSION_MATRIX.md).

## Confirmed product decisions

- **Production Command is the product brand from the scheduling release onward.** The name does not depend on completing the later production-management features. Scheduling is the first capability within the product; future tools extend the same product and design system.
- Commercialization beyond Roseland is a core objective. The base interface must be company-neutral, suitable for new customer organizations without inherited Roseland branding.
- Reskinning and organization theming are top priorities, following the current foundation/acceptance batch and before pilot migration. This builds on roadmap Phase 3A, rather than creating a competing roadmap.
- Companies must be able to configure their identity, including company name, logo, colors, and fonts/typography. Configuration must be scoped to the correct organization.
- Preserve the existing Roseland schedule design as an explicit, selectable preset available to Roseland and other users. Do not remove it or silently restyle existing schedules and documents.
- The neutral design system will be the foundation for future Production Command capabilities. The outdated Production Command prototype is reference material only, not an approved design or implementation foundation.

## Research and design decision before implementation

The neutral look and feel has **not yet been selected**. Conduct broad design research before implementing the visual system. Existing concept assets are exploratory unless an explicit approval is recorded here.

1. Research relevant production-management, scheduling, and professional workflow products. Record sources, dates, useful patterns and tradeoffs, focusing on information-dense editing and everyday use rather than appearance alone.
2. Establish design criteria for navigation, hierarchy, typography, spacing and density, color, interaction states, accessibility, desktop/mobile/iPad use, and organization branding. Consider how the system can accommodate future production views without building those features now.
3. Present distinct visual directions using comparable representative screens: schedule editor, schedule library/workspace navigation, company-branding settings, and printable/PDF schedule output. Include Roseland preset examples to demonstrate preservation and configuration.
4. Explain the usability, branding and implementation tradeoffs, recommend a direction, and obtain the user's design selection. Do not treat a preliminary mockup, logo concept or default styling choice as final approval.
5. Record the selected direction, date, approved examples, typography/color/layout tokens and remaining decisions in Markdown; then implement a bounded slice and validate it before expanding.

The product name is confirmed. Logo/wordmark, palette, typefaces, navigation styling, component appearance and exact customization controls remain design decisions. No trademark availability, domain ownership or font licensing has been established by this naming decision.

## Keep three concerns distinct

| Concern | Requirement |
| --- | --- |
| Product identity and interface | Production Command, with a neutral default and a coherent component/navigation system. |
| Organization and document branding | Tenant-specific company identity and controlled visual configuration for interface and generated documents, without cross-company leakage. |
| Schedule and operational templates | Reusable layout/content choices, including the preserved Roseland schedule preset; selecting a template must not grant access to Roseland data or private assets. |

Use versioned presets and validated design tokens. Preserve the current Roseland configuration explicitly. Safe font choices and licensed assets must be resolved during design; arbitrary CSS, scripts, font uploads or purchases are not implied. Keep application styling, document branding and operational content templates independently configurable where appropriate.

## Acceptance and rollout

- Preserve or improve existing capabilities and practical usability: entering information, field sizing, time/grid behavior, navigation, saving, history, recovery, sharing, printing and PDF generation.
- Demonstrate neutral and Roseland presets across desktop, mobile/iPad, editor, read-only views, schedules, call sheets, contact sheets and printed/PDF documents.
- Capture before/after screenshots and reproducible checks. Verified improvements can differ visually; regressions or unverified required behavior block migration.
- Validate contrast, keyboard/focus behavior, legibility and responsive density, plus server-side validation and organization isolation for branding configuration.
- Keep the live Netlify app and its current appearance unchanged until the relevant rollout is separately approved. This planning direction does not authorize deployment, hosted migrations, real-schedule transfer or subscription changes.
- Retain all migration gates: comprehensive internal security review, complete latest-source reconciliation, parallel Netlify availability, one authoritative writer, and demonstrated rollback preserving newer edits.

## Continuity for every task

Use this file as the canonical brief; link to it instead of creating divergent summaries. Tasks in separate checkouts must read this shared project copy and synchronize it deliberately with their own documentation. Chat memory alone is not the decision record. Update the brief when the user makes a design decision, distinguishing confirmed requirements from proposals and completed implementation from planned work.

The ten-minute automatic development coordinator was canceled on September 15. This brief does not restart it or expand the currently assigned implementation batch. The current batch finishes its existing browser acceptance and organization-foundation scope; design research and selection are the next dedicated design milestone.
