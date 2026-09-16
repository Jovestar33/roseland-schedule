# Production Command — unfinished reference, paused September 16

**Paused by the user's technical-first sequencing correction. Not a delivered gallery or approved design.** Technical functionality, practical parity, security and migration/rollback readiness precede design selection and reskin. Final candidate revalidation follows reskin; real migration requires separate approval.

Only initial public-source research, font downloads, and an unstyled HTML/JavaScript scaffold exist. There is no gallery.css, browser review, screenshot set, completed recommendation, approved palette/wordmark, or app reskin. Do not present this scaffold as working or tested. No real schedules or private competitor accounts were used. No hosted change or purchase occurred.

## Research captured (all accessed 2026-09-16)

These are documented public capabilities, not hands-on usability results. Design implications are our inferences. No proprietary UI or asset was copied.

| Primary source | Documented pattern | Potential implication / tradeoff |
|---|---|---|
| [StudioBinder scheduling](https://www.studiobinder.com/production-scheduling-software-filmmaker/) | Configurable schedule columns, alternate schedules, reports, view-only sharing, location and scene details | Preserve column access and output controls; film stripboards do not directly substitute for the existing timed activity grid. |
| [Yamdu call sheets](https://support.yamdu.com/en/articles/31336-creating-and-distributing-call-sheets) | Template selection, draft editing, connected shooting schedule, sending report | Distinguish working draft from distribution. No delivery feature expansion implied. |
| [Celtx stripboards](https://support.celtx.com/hc/en-us/articles/360059004274-Professional-Stripboards-and-Scheduling) | Reorder strips, control columns, daily duration summaries, integrated call sheets | Offer density choices without losing field access; keep timing and summary semantics explicit. |
| [Celtx call sheets](https://support.celtx.com/hc/en-us/articles/214898058-Call-Sheets) | Schedule-derived day information and reusable company details | Keep document identity separate from operational content. |
| [SetHero](https://sethero.com/) | Publicly advertises drag-and-drop call sheets, printable PDF, contact management, delivery tracking | Document output is a primary workflow. Marketing claims do not establish accessibility or runtime behavior. |
| [Linear display options](https://linear.app/docs/display-options) and [custom views](https://linear.app/docs/custom-views) | Personal versus workspace defaults, grouping, ordering, list/board views | Separate personal density/columns from tenant branding; avoid silently changing collaborators' views. |
| [Airtable mobile interfaces](https://support.airtable.com/articles/2483653332-mobile-interfaces-in-airtable) and [feature differences](https://support.airtable.com/articles/9609457174-airtable-desktop-and-mobile-feature-differences) | Mobile-optimized interfaces with platform-dependent capability differences | Explicitly test touch workflows; a desktop resize is not proof of mobile parity. |
| [Frame.io feature comparison](https://help.frame.io/en/articles/9084073-frame-io-v4-legacy-feature-comparison) | Explicit version comparison capability matrix | Make draft/saved/history boundaries visible and review real differences before restore. |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Contrast, reflow, focus and target-size criteria | Future criteria: AA contrast, visible unobscured keyboard focus, accessible table scrolling, 44px primary touch targets as a design goal. No conformance claim yet. |

## Initial concepts, unreviewed

- **A / Fieldwork:** Inter, persistent workspace navigation, light neutral surfaces, restrained teal. Calm operational emphasis.
- **B / Ledger:** Source Sans 3 with Source Serif 4 headings, document-first composition and wider typographic spacing. Print affinity versus desktop density tradeoff.
- **C / Signal:** IBM Plex Sans/Mono, compact navigation and row inspector, graphite surfaces. Dense information versus outdoor legibility tradeoff.

Intended comparable views: editor, library, organization branding, print/PDF mockup, mobile and Roseland preset comparison, all with the same fictional Tidewater schedule. These concepts are incomplete; do not solicit a design selection yet. The library scaffold dates and responsive behavior require review.

Grounding: `components/toolbar/EditorToolbar.tsx`, `components/schedule/ScheduleHeader.tsx`, `REGRESSION_MATRIX.md`, local lifecycle/provisioning reviews. Current `styles/base.css` uses #111 / #e91e8c, Bebas Neue headings and DM Sans body; preservation must be a versioned preset, not a silent restyle. No private Roseland logo copied.

## Fonts and licensing research

[Inter official](https://rsms.me/inter/), [Adobe Source Sans](https://github.com/adobe-fonts/source-sans), [Adobe Source Serif](https://github.com/adobe-fonts/source-serif/wiki/Source-Serif-Readme), [IBM Plex](https://www.ibm.com/design/language/typography/typeface/), [Bebas Neue distributor](https://github.com/google/fonts/tree/main/ofl/bebasneue), [DM Sans distributor](https://github.com/google/fonts/tree/main/ofl/dmsans). These are OFL font families; exact downloaded licenses are retained beside unmodified font binaries in `fonts/`. Source URLs, Git blob identities and SHA-256 checksums are recorded in `fonts/manifest.json`. Retain licenses and notices when bundling; modifications/reserved names require separate review. No font purchase or arbitrary customer upload is authorized.

## Resume only after technical readiness

Complete source review, criteria and options; style and verify the gallery; compare neutral/Roseland and mobile/print; save screenshots in this stable project directory; then recommend a direction and request the user's selection. Selection remains a gate before bounded app reskin implementation. Prototype affordances are not evidence of runtime feature parity or tenant isolation.
