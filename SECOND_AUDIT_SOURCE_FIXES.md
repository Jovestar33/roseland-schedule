# Second audit — source/test correction checkpoint

September19,2026. Branch `codex/b15-second-audit-fixes`, checkout `/private/tmp/roseland-b15-second-audit-fixes`, based on `59270d8`. Isolated build: `R2Sn1Vtshobzqmgm-abnr`. **The source/test phase started no preview service. The later service-only handoff is recorded below. Independent browser verification remains coordinator-owned; this is not audit completion.**

The input findings are preserved in `evidence/second-audit-fixes/independent-findings.md`; their original source is `/Users/johnsammon/roseland-schedule/evidence/second-audit/findings.md`.

## Corrections

- **SA-01:** Call Sheet map URLs now follow the existing LocationCell capability rule: legacy mode or an explicitly live document provider, plus a nonempty visible address. Fictional, absent and unspecified local providers expose no links. Destinations are encoded and links retain `noopener noreferrer`. No map or provider request was made. Read-only fields remain plain text; existing projection and output-authorization code is unchanged.
- **SA-02:** All eight Call Sheet field values use native edit buttons when editable. The existing styles, placeholders and field order remain. Enter commits single-line values; location autocomplete retains ownership of an Enter that selects a suggestion. Multiline Enter remains a newline, and blur commits as before. Escape discards the draft, prevents the enclosing modal from consuming that same key, and returns focus to the trigger. A closed-edit guard prevents a later blur or delayed selection callback from committing a canceled draft. Tab completion does not pull focus backward. Read-only presentation has no edit buttons.
- **SA-03:** While Share is open, Escape dismisses it and returns focus to the opener unless the event was already handled. The opener exposes expanded state and the controlled popup's unique ID. All four options retain their order. Existing outside-click, scroll dismissal, output authorization and modal handlers remain.

The Call Sheet print section and the main component markup after the print-section boundary are byte-identical to the baseline. The CSS addition only resets native edit-button defaults before the existing field styles. This source check does not replace independent browser/print-layout verification.

## Validation

107 editor tests pass, including six new component/handler tests. They verify the actual eight field definitions, cancellation followed by blur, focus-return effects, single-line and multiline commit behavior, autocomplete Enter ownership and late callback cancellation, live/fictional/absent-provider link gating, read-only output, Share Escape/state/order, and retained outside/scroll dismissal. Existing export authorization and public-projection tests also pass. The existing draft-export harness was updated only to supply a mocked React `useId`; its assertions are unchanged.

Production build and TypeScript checking pass. The two inherited hook warnings remain. The initial focused run identified the old export test mock's missing `useId`; after that mock update the focused checks passed. The final broader run includes all six new tests. Logs and source/build hashes are in `evidence/second-audit-fixes/`.

These are source-level component and controlled-handler checks, not real browser events. Native focus traversal, paired visual layout, actual map-link presence in the review runtime and independent end-to-end acceptance remain for the coordinator's browser phase.

## Isolation / handoff

No browser tools, shared-database calls, credentials, external map calls, hosted writes or existing-service start/restart operations were used. All edits and the build are confined to this new checkout; existing dependencies are reused via the untracked node_modules link. Stable3520 and earlier build identities were read only and remain unchanged. No source was copied into those running checkouts. No callback through the previously rejected report route was attempted.

Stop here and await the coordinator's explicit browser/service handoff. Do not infer permission to launch a preview from the presence of an inherited launcher script.

## Service-only handoff

The coordinator subsequently authorized starting the existing build only. The review is now running at **http://127.0.0.1:3522/review**, bound to127.0.0.1. Source checkpoint remains `8965ba8`; served build is `R2Sn1Vtshobzqmgm-abnr`. The process reported Ready in314ms and an ordinary local HTTP request to `/review` returned200. Exact process IDs and launch metadata are in `evidence/second-audit-fixes/launch.json`.

The launcher is outside the checkout at `/private/tmp/roseland-b15-second-audit-launch.ts`. It reuses the frozen3520 launch configuration and existing credentials, changing only the unused listen port and process-manifest path; the connection is directly to the existing local56521 database. Live providers are configured, but no provider was called. No application code or compiled artifact changed, no existing service was restarted, and the recorded frozen build identities remain unchanged.

No browser was opened, no fixture/database mutation or shared-database test was run, and no new credentials/access were created. The coordinator retains sole browser/database audit ownership. Stop after this service handoff and await further direction.
