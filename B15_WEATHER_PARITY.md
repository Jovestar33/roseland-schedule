# WEATHER-PARITY-20260919 — saved comparison and correction

Bounded user-authorized weather/button pass, continuing from C08. Implementation stops here for independent coordinator review and the planned fresh-task handoff. No unrelated batch began.

## Candidate and authority

- Checkout: `/private/tmp/roseland-b15-weather-parity`
- Branch: `codex/b15-weather-parity`, base `38c1b74006dbfb5bb9ce9ba65432a9ccce7f2064`.
- Review: `http://127.0.0.1:3502/review`
- Final build: `6R_x6b-jQ1skjZafRWiW2`. Exact build and changed-source hashes: `evidence/b15-weather-parity/build-identity.json`.
- Runtime manifest: `/private/tmp/roseland-b15-weather-process.json`.
- Private ordinary fictional access file: `/private/tmp/roseland-b15-review-access.json`. Credentials remain outside source/evidence.
- Legacy source: `62eb261c897b3a5c4e03857e59fee8071d520b88`; isolated source-backed runtime3490. Its fictional Blobs adapter is not proof of live hosted storage/CDN parity.

Authority: `/Users/johnsammon/roseland-schedule/QUEUED_WEATHER_PARITY_FIX.md`, `/Users/johnsammon/roseland-schedule/PARITY_PLUS_ACCEPTANCE.md`, and `/Users/johnsammon/roseland-schedule/DEVTEST_FRESH_TASK_HANDOFF.md`.

Frozen3500 remained unchanged for the coordinator's account-flow review. User3487 was inspected read-only; its expired-session screen did not expose weather, and it was not signed in, refreshed or altered. Older previews remain preserved.

## Diagnosis before edits

Matched inputs were the existing saved candidate "B15 matched weather — fictional" and isolated legacy "B15 ordinary fictional day". Authenticated readback and legacy fixture inspection verify identical weather payload, town, date and coordinates. Desktop1280×720 and phone390×844 were compared. Geometry uses panel-relative positions to separate the approved organization bar and natural scroll position from schedule layout.

The reported general field/button mismatch was **not reproduced for these matching inputs**. Weather-strip values, dimensions and positions exactly match: sunrise6:30AM, sunset7:15PM,75°F/54°F, partly-cloudy condition/icon,35% precipitation, Google Weather link and fictional update text. The visible Save/menu, Undo, Redo, Share, Tools and Close button positions/sizes/order match legacy at both sizes, as do weather Refresh/Clear. The baseline supports neither wind nor gust fields; none were invented. No global right-alignment or formatting changes were justified.

Two concrete integration defects were reproduced:

1. `.local-weather-controls` had flex order7, after the entire table and Add Row. Attribution and status were detached from weather. After Clear, the only Refresh weather control moved below all rows: phone panel-relative y1191.5, despite metadata ending at y463.0.
2. Clear → Undo restored the weather but left "Weather and sun rows cleared from this draft" visible. Feedback was tied to component lifetime rather than the weather it described.

Evidence: `before-geometry.json`, `before-legacy-comparison.json`, `before-cleared-phone.json/png`, `before-undo-status.txt`, paired `candidate-before-desktop.png`, `candidate-before-phone.png`, `legacy-desktop.png`, `legacy-phone.png`. Full legacy captures also exist. Some viewport screenshots use natural browser scroll positions; measured comparisons are normalized to the schedule panel, not inferred from screenshot offsets.

## Correction

Weather controls, feedback and attribution now sit immediately after the weather strip, before the schedule grid. With no forecast loaded, Refresh stays beside the date/location section. The required attribution remains legible and subordinate; desktop places it at the right of the compact context row, while phone wraps naturally. Existing legacy weather and toolbar buttons are unchanged.

Interrupted requests also clear obsolete Loading feedback. Feedback records the document/date/coordinate context and the weather object it describes. Undo, a new weather value or a different context suppresses obsolete feedback. Provider calls, response guards, edit permissions, saved data, sun calculation and Undo operations are unchanged.

The extra context row is an intentional new-capability difference from legacy; it was already present below the table and is now attached to the weather it describes. It moves the grid downward by its compact height, without moving the original weather values or buttons.

## Results and control mapping

| Control/state | Verified outcome |
|---|---|
| Saved weather opening/reopening | Same displayed fields and legacy geometry. Saved document remains exactly unchanged at version1. |
| Weather Refresh/Clear and main toolbar | Same positions, order and dimensions as legacy at both sizes. No broad alignment edits. |
| Clear | Only draft weather/sun rows clear. Nearby Refresh and feedback are available before the grid at desktop and phone sizes. |
| Undo after Clear | Weather/sun rows return and cleared-message disappears. Desktop and phone actual UI checks. Test-only draft changes were explicitly discarded on Close. |
| Empty schedule/scope transition | Nearby Refresh is disabled without required metadata; prior clear message is absent. Returning to saved fixture restores its original weather. |
| Refresh/loading/no-forecast/error | Actual component handlers with a controlled provider show busy/read-only state and correct result/failure feedback. Failure retains weather; Undo restores rows/metadata. No new live provider request was made. |
| Late response after scope/access change | Controlled handler tests confirm no write into a different scope or disabled editing context. |
| Sun-only, zero values and empty weather | Actual candidate WxStrip markup equals pinned legacy markup in all four saved/zero/sun-only/empty cases. This is render evidence, not a live forecast-fetch claim. |

Final evidence: `after-desktop-geometry.json`, `after-phone-geometry.json`, `after-legacy-comparison.json`, `candidate-after-desktop.png`, `candidate-after-phone.png`, `after-cleared-desktop.png`, `after-cleared-phone.png/json`, `after-undo-status.txt`, `after-empty-desktop.png`, `weather-markup-comparison.json`, `saved-readback.json`. Scripted readback uses the ordinary account and reads only; no service-role mutation or saved fixture modification.

## Validation and handoff limits

Optimized build/type-check pass;9 editor/weather/Undo tests and8 provider/authorization tests pass. Four pinned-legacy markup comparisons pass. The two existing hook warnings remain. Exact logs are retained; no broad unrelated suite was repeated. Provider attribution and public-link gating remain intact. No live Google/Open-Meteo call, credential operation, hosted configuration, migration or deployment was needed.

This corrects demonstrated context/feedback defects; it does not prove every weather scenario or resolve an unseen user-specific field discrepancy by assumption. Coordinator must independently review3502 against the matched baseline and clarify any remaining visual discrepancy with the actual affected view. Physical touch, print/PDF, broader role/time/error scenarios and the prior Client recipient-refresh failure remain open. C08's separate independent review and its recorded request incident are unchanged by this pass.

Stop at this saved checkpoint. The coordinator should verify exact commit/build, update the weather queue and sole-owner fresh-task handoff, and assign any further bounded work explicitly.
