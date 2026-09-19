# WEATHER-FOOTER-REMOVE-20260919

The added weather provider/status footer is removed entirely. It is not hidden, moved elsewhere, or replaced with a tooltip. Saved weather retains the legacy strip and Refresh/Clear buttons. With no weather, a standalone Refresh weather button remains immediately after metadata and before the grid. A failed refresh uses the existing transient error notification; success and Clear produce no extra chatter. Honest unavailable values remain in the unchanged legacy WxStrip.

## Isolated candidate

- Review URL: http://127.0.0.1:3504/review
- Checkout: `/private/tmp/roseland-b15-weather-footer-removal`
- Branch: `codex/b15-weather-footer-removal`, base `31e3881acdce3f583bb168c71a5c7ed489fba1ac`.
- Build: `N58VrGih-TndBPa3zM7OO`; changed-source hashes in `evidence/b15-weather-footer-removal/build-identity.json`.
- Runtime: `/private/tmp/roseland-b15-weather-footer-process.json`, launcher88030/server88039, loopback3504.
- Private fictional login file: `/private/tmp/roseland-b15-review-access.json`. No credentials are stored in evidence.
- Preserved prior candidate: `/private/tmp/roseland-b15-weather-parity`, commit31e3881, port3502, build6R_x6b-jQ1skjZafRWiW2. Neither that build nor its source checkout was modified.

Authority is the latest user override in `/Users/johnsammon/roseland-schedule/QUEUED_WEATHER_PARITY_FIX.md` and the coordinator's bounded WEATHER-FOOTER-REMOVE-20260919 dispatch. This supersedes the preceding pass's decision to retain an attribution/status row. Source licence notices remain unchanged; this report makes no licence-compliance claim.

## Verified behavior

Matched existing fictional weather was reviewed at desktop1280×720 and phone390×844 against isolated legacy3490, pinned source62eb261c897b3a5c4e03857e59fee8071d520b88. Both measured snapshots are exactly equal to legacy: weather text, panel dimensions, toolbar and weather button positions/sizes/order, metadata, grid, and Add Row. Removing the extra row restores the grid's legacy position as well. Measurements are relative to the panel because the approved organization bar and natural scroll offset differ outside it.

Clear removes only draft weather/sun rows and leaves the contextual Refresh button before the table at both sizes. Undo restores the weather without any footer or stale status. All test-only edits were explicitly discarded; reopening displays the original saved weather. A separate existing empty schedule has a disabled Refresh button until its required inputs exist. The ordinary-account authenticated readback confirms the complete saved weather document remains identical at version1. No actual schedule was opened or changed.

Controlled-provider tests exercise the real component handlers and store: pending state, sun-only noForecast results, complete Undo, null/rejected requests, scope/access cancellation and late response/error suppression. Failures preserve data and emit one relevant error toast. No new live Google/Open-Meteo request was made. Error behavior is component-test evidence, not a deliberately induced external-provider failure.

## Evidence and validation

All evidence is under `evidence/b15-weather-footer-removal/`:

- `desktop-geometry.json`, `phone-geometry.json`, `comparison-results.json`: exact candidate/legacy geometry and displayed-weather equality.
- `candidate-desktop.png`, `candidate-phone.png`, `legacy-desktop.png`, `legacy-phone.png`: full-page paired captures; natural scroll positions differ, so geometry is the precise placement comparison.
- `previous-3502-desktop.png`, `previous-3502-phone.png`: copied prior-checkpoint screenshots from the preserved3502 evidence, explicitly not current captures.
- `cleared-desktop.png/json`, `cleared-phone.png/json`, `empty-desktop.png/json`, `undo-phone.txt`: empty, Clear and Undo evidence.
- `saved-readback.json`: complete saved document unchanged and same baseline weather inputs.
- `editor-tests.txt`:10 passed; `provider-tests.txt`:8 passed.
- `weather-markup-comparison.json`:4 pinned-legacy render comparisons pass, including sun-only, zero values and empty weather.
- `build.log`: optimized build/type-check passes with the same two existing hook warnings. No unrelated suite was repeated.

This is a bounded footer correction, not acceptance of the entire app. Schedule toolbar/weather placement is verified for the matched cases; broader library/dialog button placement is still not certified. Existing Client recipient-refresh failure, physical-device and print/PDF gaps, and C08's separate review record remain unchanged. No source licence, provider configuration, hosted setting, migration, deployment or account permission changed. Older review runtimes remain frozen.

Implementation stops here for independent coordinator review and an explicit fresh-task handoff. No new pass or automatic check-in has started.
