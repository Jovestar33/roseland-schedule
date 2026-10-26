# Schedule-template collection — delivery and refinement plan

## Delivered October 25, 2026

John authorized the full 22-template collection, chose **Rally Template Library** as its source production folder, and approved organization-wide availability. All 22 are now imported through the native app and shared across **Roseland Pictures**. This completes the initial build in roadmap step 4; practical use and further refinement continue. It does not release the separate timing experiment.

Open **Library → Templates → Saved templates → Shared with organization**. To filter by the source folder, choose **Production templates → Rally Template Library**. These are reusable template records; the source production contains no schedules. The local downloadable collection also groups the files into seven subject folders.

## Included templates

| No. | Template |
| --- | --- |
| 01 | Town / Downtown Film |
| 02 | Interview + B-roll |
| 03 | Multiple Interviews — One Location |
| 04 | Corporate / Brand Film |
| 05 | Social Content Batch Day |
| 06 | Event Coverage |
| 07 | Product / Demonstration Shoot |
| 08 | Scout / Recce Day |
| 09 | Pickup / Half-Day Shoot |
| 10 | Travel / Company Move Day |
| 11 | Small Narrative / Scripted Shoot |
| 12 | Live Performance / Multicamera Shoot |
| 13 | Documentary / Observational Day |
| 14 | Training / Instructional Video Shoot |
| 15 | Commercial / Agency Shoot |
| 16 | Studio / Virtual Production Day |
| 17 | Real Estate / Architectural Film |
| 18 | Food / Restaurant Shoot |
| 19 | Music Video Shoot |
| 20 | Sports / Action Shoot |
| 21 | Fashion / Lookbook Shoot |
| 22 | Animation / Stop-Motion Shoot |

The final two proposed additions—remote/distributed interviews and industrial/manufacturing—were withdrawn at John's request and are excluded. The deleted Wilson v2 example remains excluded.

## Format and use

The collection contains 343 editable actions and 11,505 total duration minutes across all templates. Native templates keep clock times, dates, locations and contact details blank. Set Time In on the first row after applying a template, then adapt durations to the actual production. The existing duration cascade remains the timing foundation; no experimental endpoint locks or backward-planning behavior is required.

Durations, travel allowances, meal patterns and crew assumptions are planning examples, not confirmed arrangements. Review access, people, equipment, working conditions and applicable requirements before issuing the schedule. The separate review collection includes assumptions, setup guidance, adaptation notes and pre-issue checks.

Keep schedule content templates, production workflow templates and visual presets independent. Organization-wide sharing makes the collection available across Roseland Pictures productions; it does not grant access outside the organization or alter the legacy synchronization scope.

## Verification and evidence

- Application release: `ae004ce0fa98ce1ecab1bdb91692d6b020b4de02`, restoring the native template import interface. [GitHub run 40172826614](https://github.com/Jovestar33/roseland-schedule/actions/runs/40172826614) passed its Application and Database/RLS jobs; Vercel deployment succeeded. The PR-only dependency/secret review job was skipped for this branch push.
- Every hosted row, its order, field keys and source fingerprint matched the original files. All 22 templates have one import receipt and one sharing receipt, with no duplicate imports and no source schedules created.
- The collection passed the app's parser and duration-cascade checks, alternate starting-time checks, duration-edit checks, and desktop/mobile review rendering. These checks do not replace John's practical usability review.
- Local evidence and downloadable files: `/Users/johnsammon/roseland-schedule/artifacts/template-library-20261025/`. See `hosted-import.json`, `import-ui-release.json`, `validation.json`, `manifest.json`, and `IMPORT-STATUS.json`.
- Local review: [template collection](http://127.0.0.1:3576/template-library/index.html), available while its local review server is running. Preview times no longer include a plus prefix. This display change does not alter the native template data or live timing behavior.

## Next refinement

Use the templates on real jobs, collect specific changes, and refine the relevant templates rather than replacing the entire collection. Success means faster setup, little cleanup, editable durations, reliable printing and unchanged permissions. Additional templates require a concrete production use case and user approval. Timing experiments remain governed by [TIMING_PLAYGROUND_PLAN.md](TIMING_PLAYGROUND_PLAN.md).
