# Production Command — brand and design direction

Confirmed by the user on September 16, 2026. This is the shared decision record for planning and development tasks. Read it alongside [ROADMAP.md](./ROADMAP.md), [READINESS.md](./READINESS.md), and [REGRESSION_MATRIX.md](./REGRESSION_MATRIX.md).

## Confirmed product decisions

- **September 18 latest naming feedback:** the user likes both Rally and Huddle. Both remain favored exploratory candidates, with no final selection or availability screening. This supersedes the assistant's proposed Riff/Scoot comparison, not the product's existing working label. See shared decision BD-016.

- **September 18 naming feedback:** Rally received a positive user response for suggesting acceleration, enjoyable work and achievable schedules/budgets/production plans. It is a favored reference, not a selected name. The user requested adjacent options, recorded in [naming round 02](./design/brand-and-design/NAMING_ROUND_02.md). Availability remains unchecked. See shared decision BD-015.

- **September 18 central identity promise:** make production work fun. The user reports that users say the existing schedule app makes scheduling fun and wants that experience extended to budgets and multi-day master scheduling. The user authorized naming exploration including set-aside ideas; [round 01](./design/brand-and-design/NAMING_ROUND_01.md) is exploratory and unscreened, with no selected name. See shared decisions BD-013 and BD-014.

- **September 18 personality refinement:** the user selected playful and friendly over bold and powerful for naming/brand personality. Retain the earlier bold/expressive visual preference; the combined direction is approachable, human, creative, catchy and fun with expressive visuals. No individual name or visual execution is selected. See shared decision BD-012.

- **September 18 naming character:** the user requires the umbrella name to be catchy and fun, alongside human and creative and broad enough for the production suite. No replacement name is selected. See shared decision BD-011.

- **September 18 umbrella scope clarification:** the user says budgets and master production scheduling across multiple days will be added very soon. Develop the identity for the broader production-management suite from the outset, including scheduling, budgeting and production direction; schedule-only naming is unsuitable. This records intended product scope, not a verified delivery date or expanded implementation authorization. See shared decision BD-010.

- **September 18 personality selection:** the user explicitly prefers a human, creative name and identity over a technical, precise feel, alongside the initial bold/expressive direction. This informs creative exploration; no specific name or visual execution is selected. See shared decision BD-009.

- **September 18 identity framing:** the user explicitly defines this work as an identity exercise: overarching name, personality and visual language developed together for the product, rather than naming alone or interface decoration. See shared decision BD-008.

- **September 18 creative discovery:** the user leans toward a bold, expressive identity and prioritizes a new umbrella name for the complete future production-management product. Production Command feels very Gen X to the user and is no longer the creative anchor; it remains the existing working label until a replacement is chosen. This is a naming exploration direction, not approval of a name or authorization to rename code/routes. See shared decisions BD-006 and BD-007.

- **September 18 correction: Production Command is a working title, not the final consumer brand.** The user reopened naming, logo and creative identity for the future Brand and Design chat. Earlier final-name wording is superseded. Scheduling remains the first capability of a broader production-management product.
- Commercialization beyond Roseland is a core objective. The base interface must be company-neutral, suitable for new customer organizations without inherited Roseland branding.
- Reskinning and organization theming remain required before real-data migration, but only after functionality, parity, security and technical migration/rollback readiness are verified. This September 16 sequencing correction supersedes the earlier instruction to start design immediately after the foundation batch.
- Companies must be able to configure their identity, including company name, logo, colors, and fonts/typography. Configuration must be scoped to the correct organization.
- Preserve the existing Roseland schedule design as an explicit, selectable preset available to Roseland and other users. Do not remove it or silently restyle existing schedules and documents.
- The neutral design system will be the foundation for future Production Command capabilities. The outdated Production Command prototype is reference material only, not an approved design or implementation foundation.

## Delivery order — user correction, September 16

1. Complete technical functionality, account/recovery and related-data workflows. Verify functional and practical-usability parity, comprehensive internal security, and technical migration/rollback readiness, including separately authorized hosted checks. Local tests alone do not close hosted gates.
2. Complete B15 hands-on user review in iterative rounds, resolve blocking functional/usability notes, and obtain acceptance. Then follow the staged B16 process below: preserve the approved current look, develop design directions, refine the selected direction, apply it, and make final refinements. Preserve unfinished research as reference; it must not displace technical work now.
3. Revalidate the final reskinned candidate: functionality, security, mobile/accessibility, printing/PDF, data reconciliation and rollback. Earlier parity results are a baseline, not automatic acceptance of the changed interface.
4. Only then seek explicit approval for real-data migration and cutover, keeping Netlify available as agreed.

A protected synthetic-data pilot may be needed to clear technical hurdles before reskinning; it is distinct from real-data migration and still requires deployment authorization. Phase numbers are workstream labels, not an override of this execution order.

## Research and design decision before implementation

### B16 stages — user refinement, September 17

Keep the existing roadmap numbers. B16 is a staged design process after B15 technical and human acceptance:

1. **Preserve the approved current look.** Capture the schedule appearance the user is happy with after B15 feedback, not merely today's unfinished state. Save it as a named, versioned, selectable Roseland production-schedule look covering the editor's schedule presentation, read-only output and print/PDF appearance. Preserve representative examples and configuration so it remains usable after the neutral design is applied. Keep visual presets distinct from schedule-content templates and private production data.
2. **Develop the look and feel.** Conduct the planned research and explore comparable Production Command directions for the neutral interface and configurable schedule presentation. Include the option of a preserved Roseland interface look for the user's own organization/administrative workspace; this is an option to evaluate, not yet a final interface-preset choice or an additional privilege. Product default remains organization-neutral.
3. **Refine the selected direction.** Review representative screens and document outputs with the user, collect notes, and iterate to an approved direction before broad application. Identify which choices belong to interface styling versus schedule/document styling so selecting one need not silently change the other.
4. **Apply the approved design.** Implement in bounded sections across the actual app and its outputs, with organization-scoped branding and the preserved schedule preset available. Retain the approved baseline; do not silently restyle existing schedules or rebuild settled functionality.
5. **Final refinements.** Let the user review the implemented design in use, resolve visual/usability notes in manageable rounds, and confirm the design is ready for B17. B17 remains the final candidate revalidation, and B18 remains separately approved migration.

B15 and B16 each allow multiple human-review rounds with one shared notes log grouped by functional blockers, reskin work, and optional later features. This is not an unlimited requirement to implement every new idea before release; resolve blockers and obtain explicit user acceptance of the relevant phase. No reskin implementation is authorized merely by recording these stages.

The neutral look and feel has **not yet been selected**. Conduct broad design research before implementing the visual system. Existing concept assets are exploratory unless an explicit approval is recorded here.

1. Research relevant production-management, scheduling, and professional workflow products. Record sources, dates, useful patterns and tradeoffs, focusing on information-dense editing and everyday use rather than appearance alone.
2. Establish design criteria for navigation, hierarchy, typography, spacing and density, color, interaction states, accessibility, desktop/mobile/iPad use, and organization branding. Consider how the system can accommodate future production views without building those features now.
3. Present distinct visual directions using comparable representative screens: schedule editor, schedule library/workspace navigation, company-branding settings, and printable/PDF schedule output. Include Roseland preset examples to demonstrate preservation and configuration.
4. Explain the usability, branding and implementation tradeoffs, recommend a direction, and obtain the user's design selection. Do not treat a preliminary mockup, logo concept or default styling choice as final approval.
5. Record the selected direction, date, approved examples, typography/color/layout tokens and remaining decisions in Markdown; then implement a bounded slice and validate it before expanding.

The final product name, logo/wordmark, palette, typefaces, navigation styling, component appearance and exact customization controls remain design decisions. Production Command is a working title only. No trademark availability, domain ownership or font licensing has been established by this naming decision.

## Keep three concerns distinct

| Concern | Requirement |
| --- | --- |
| Product identity and interface | Working title Production Command; final name open, with a neutral default and a coherent component/navigation system. |
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

**September 18 creative-role clarification:** Brand and Design is primarily and almost exclusively the graphic-design, visual-assistance and art-direction task. Its aesthetic objective is beautiful, modern website/application design that appeals to Gen Z and even Gen Alpha. Technical checks remain the responsibility of engineering/coordinating tasks. This clarification does not select a specific style, restrict the product to an age group, or change implementation approval gates. See decisions BD-004 and BD-005 in the [shared decision record](./design/brand-and-design/DECISIONS.md).

**September 18 Brand and Design kickoff:** the user has started the dedicated creative task and authorized a discovery conversation, one clear question at a time, with decisions recorded in the shared workspace. See [discovery proposal and current question](./design/brand-and-design/DISCOVERY.md). This supersedes future-chat/setup-only wording: independent creative discussion and documentation can proceed now. Keep that work separate from Devtest's active engineering; do not change application code or interrupt Devtest. Reskin implementation remains subject to technical checks, explicit B15 functional approval and approval of the selected design. No new identity or existing concept has been approved by the kickoff.

September 18: start the future creative chat with the shared [Brand and Design workspace](./design/brand-and-design/README.md). Voice and Planning coordinates, Brand and Design develops user-reviewed options, and Devtest implements approved work after existing gates. Folder setup does not start research or reskin implementation. Deliver its queued handoff only at Devtest's next completed-batch gap unless urgent. The user also approved an early fictional-data hands-on preview after B11, without renumbering or replacing formal B15 acceptance.

Use this file as the canonical brief; link to it instead of creating divergent summaries. Tasks in separate checkouts must read this shared project copy and synchronize it deliberately with their own documentation. Chat memory alone is not the decision record. Update the brief when the user makes a design decision, distinguishing confirmed requirements from proposals and completed implementation from planned work.

The ten-minute automatic development coordinator was canceled on September 15. This brief does not restart it or expand the currently assigned implementation batch. Lifecycle acceptance and organization provisioning have completed locally. The subsequent design-research assignment is superseded by the technical-first priority above; retain its useful artifacts and resume authorized technical work. Design implementation still requires the user’s selection.

## September 16 technical audit pointer

[TECHNICAL_ACCEPTANCE_AUDIT.md](./TECHNICAL_ACCEPTANCE_AUDIT.md) is the current technical gate inventory and dispatch proposal; no feature or design implementation is authorized by that audit. Initial [unfinished design research](./design/production-command/2026-09-16-directions/RESEARCH.md) is preserved for later. It has no completed gallery, approved recommendation or user selection. The technical-first delivery order above remains controlling.
