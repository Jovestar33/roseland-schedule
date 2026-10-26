# Current product status — October 25, 2026

This is the reconciled planning checkpoint. The October 25 template release and import were verified; earlier audit findings below retain their original scope and dates. The delivery order is controlled by [ROADMAP.md](ROADMAP.md#october-25-2026--approved-order-of-operations). Older dated records retain their evidence but do not override subsequent user approvals.

## Delivered and in trial

- Supabase-backed Vercel app is deployed at https://roseland-schedule.vercel.app/workspace. Latest verified release: `ae004ce0fa98ce1ecab1bdb91692d6b020b4de02` (native template import workflow); Application and Database/RLS jobs passed in [run 40172826614](https://github.com/Jovestar33/roseland-schedule/actions/runs/40172826614). Dependency/secret review was skipped for this branch push, not independently passed in that run.
- Real schedules were imported with original records/history preserved. Both apps accept real edits during the authorized parallel trial. The last functionality audit reported all 63 original mappings synced. This is a dated observation, not a claim of current continuous health.
- Automatic two-way synchronization and conflict review were activated for the approved 63-schedule scope. New/renamed schedules and structural changes require explicit reconciliation; related stores are not implied to synchronize. New Vercel-only features need not be implemented in Netlify, but their data must survive synchronization.
- Daily editor, centralized scoped Contacts, expanded call sheets, issued documents, recipient links/confirmations, professional distribution emails and the reviewed UI refinements are implemented. The original duration-based timing experience remains live after the rejected experiment was rolled back.
- The first [schedule-template collection](SCHEDULE_TEMPLATE_PLAN.md) is delivered: all 22 native templates are saved in **Rally Template Library** and shared across Roseland Pictures. Read-only verification matched all 343 actions and 11,505 duration minutes to the source files, with no duplicate imports or schedules created in the template library. Use **Library → Templates → Saved templates → Shared with organization**. Practical review and refinement remain ongoing.
- John approved the existing 132-item design review set. Subsequent review should show changed/new items rather than force another full approval pass.
- Nancy and Melissa's approved Organization Admin invitation emails were sent October 25. Their organization invitations expire November 8, 2026, after 14 days. Acceptance was pending at the last verification; do not infer it from successful sending. Account-setup email tokens have a separate expiry policy.

## Active next work

Run the Roseland team trial and capture usability/reliability findings. Keep [timing experimentation](TIMING_PLAYGROUND_PLAN.md) in its separate chat and playground; use and refine the delivered [22-template collection](SCHEDULE_TEMPLATE_PLAN.md) alongside that work. The template collection was explicitly authorized and delivered while timing exploration remained separate; this does not change the approved roadmap sequence. Public identity/neutral theme, broader concept validation, a focused production-planning pilot, and cutover/public-beta preparation remain ahead. Brand research and outside-producer interviews can run alongside the trial.

Rally is the selected public-product name, reconfirmed by John on October 25 (“rally is good”). Production Command is a historical working label for the broader planning capability. Logo, palette, typography and neutral-theme execution remain unselected; the earlier Bounce logo remains rejected. Name selection is not trademark/domain clearance or authorization for purchases or code/route renaming.

## Open boundaries and gates

- Trial is not cutover. Do not retire Netlify or discard either app's edits without final reconciliation and explicit approval.
- Timing experiments remain isolated until John accepts their usability and authorizes a live release. Preserve all unrelated improvements.
- Neutral company-independent skin and versioned Roseland preset are still design work, not delivered public-product branding.
- Offline installation/viewing/editing remain staged work under [the offline plan](INSTALLATION_OFFLINE_PLAN.md); do not advertise complete offline support.
- Broader production planning, CRM expansion, resource planning, itinerary and finance integrations remain planned/proposed, not shipped.
- Latest audit is bounded: some fresh provider checks, Chrome/mobile journeys, recipient inbox/acceptance, and independent security review remain unverified. The 97 hosted RPC advisor warnings were not all independently reviewed. CI and human design approval do not establish universal functional or security acceptance.
- Public onboarding, commercial operations, privacy/terms, tenant isolation review, backup/incident ownership and billing readiness remain public-launch work.

## Evidence and documentation precedence

The earlier functionality audit is retained at `/Users/johnsammon/roseland-schedule/artifacts/functionality-audit-20261025/` (`release-20261025.json`, `audit.json`, `report.html`). The detailed earlier acceptance documents remain evidence of their specific dated scopes. Template release and import evidence is retained at `/Users/johnsammon/roseland-schedule/artifacts/template-library-20261025/`: `import-ui-release.json`, `hosted-import.json`, `validation.json`, and `IMPORT-STATUS.json`. The release check confirmed that local HEAD, the remote branch and the successful Vercel release matched `ae004ce`. This documentation commit does not rerun application tests, deploy code or mutate hosted state.

Use the current roadmap for delivery order, this file for dated status, the timing/template plans for bounded experiments, and the design brief/decision log for identity. Treat older checkbox lists as historical inventories, not current completion dashboards. New explicit user decisions supersede older sequencing.
