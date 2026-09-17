# Parity section 01: modal keyboard focus

September 17, 2026. **Bounded local improvement verified; whole-app parity is not accepted.**

The published baseline remains commit `62eb261c897b3a5c4e03857e59fee8071d520b88`, deploy `6aa4d1344f4fd68c916c5451`, freshly observed in Netlify Deploys. All 98 inventoried runtime files in the isolated legacy clone match the recorded source hashes. Target comparison: 65 identical, 29 changed, 4 absent at their original paths. Source equality is not integration or runtime acceptance.

## Change

The legacy Contact dialog allows Shift-Tab from Name through Close into the underlying Add Row button. Target now keeps Tab/Shift-Tab inside the frontmost visible generic modal, gives the dialog an accessible name, preserves autofocus and returns focus to its opener. Contact labels now identify their inputs. Share returns document dialogs to its persistent button. Keyboard focus is visible without changing ordinary layout. Nested native dialogs own their own focus scope.

The initial fix captured the autofocus input instead of the original opener; browser verification exposed that failure. Capture now occurs before descendant autofocus commits. Initial failure is retained in modal-focus-results.json; modal-focus-final.json supersedes it.

## Executed cases

| Case | Legacy observation | Target observation | Scoped result |
|---|---|---|---|
| Contact backward/forward boundary | Shift-Tab escapes to Add Row | Name → Shift-Tab Close → Shift-Tab Save Contact; Tab wraps to Close | Pass, improvement at 1280×720 and 390×844 |
| Contact Escape | Background focus remains where it escaped | Returns to original contact button | Pass, improvement at both widths |
| Contact typing/cancel | Local draft/save semantics in source; full paired cancellation profile pending | Typing retains focus; Escape/reopen restores original =Fictional Crew | Target scoped Pass; paired profile incomplete |
| Call Sheet focus return | No explicit opener restoration in source | Backward wrap reaches Print; Escape returns to Share | Target scoped Pass; paired profile incomplete |
| Day 13/12 | Stays in input and reports Day 13 cannot exceed total 12 | Same feedback and input | Pass, paired desktop case |
| Day Escape | Restores 2 of 12; conservatively marks Unsaved | Same values and conservative dirty state | Pass, paired desktop case |
| Unsaved navigation cancel | Close confirmation shown; native Cancel retains route and Unsaved | Reload discard review; Keep editing retains version 1, draft and values and returns to Reload | Pass for these two entry points; full navigation matrix pending |

Final JPEG captures were verified as exactly **1280×720 and 390×844**; paired phone dialogs were visually inspected. Chrome's override initially affected only one tab. Mis-sized legacy captures were replaced by reruns in the same controlled tab, with actual DOM dimensions checked. These are desktop Chrome viewport checks, not physical phone keyboard, touch or iPad evidence.

The native close confirmation stalled extension handling. Native Chrome accessibility cancelled it and verified the dirty route remained. Subsequent OK returned to the fictional library. A stale extension snapshot was replaced with a fresh owned tab. This was a browser-control issue, not an application failure or production mutation.

## Validation and limits

Production build, TypeScript check and **56 editor tests pass**; diff whitespace check passes. Final DOM readback confirms a solid 2px pink input outline at both verified widths. No database/schema, dependency, saved production data or hosted changes are part of this fix.

Exact inventoried legacy frontend source uses the target patched dependency runtime (Next 15.5.25, React 19), fictional login/load responses and blocked legacy mutations. This does not reproduce hosted authentication, providers or production dependency artifacts. Target uses genuine Auth on the owned unlinked local Supabase replay stack and a matched fictional payload. Fixture ID/bytes/hash and provenance are retained; credentials are excluded.

The first proxy run kept a trace in memory but stdin was unavailable; no request trace is claimed for those earlier cases. The harness now persists sanitized method/path/result records when responses finish. New trace entries cover only requests actually captured after restart.

All other modal variants, nested generic/native combinations, focus/selection profiles and browser close/reload warnings need their own runtime checks. This section supports IN-02, IN-03, UI-03, CON-01, ED-05 and NAV-02; it does not pass any entire 45-group gate.

## Remaining work

Source-confirmed target gaps remain: named/automatic dirty snapshots, template/Tools integration, scoped CMS, and share issuance/recipient paths. Immutable saved history is not a substitute for dirty snapshots. B03 does not close these gaps. D02 template visibility remains unresolved after checking durable/shared decisions; the user was asked production scope with deliberate organization publication versus all organization members by default. No template access was expanded while that choice is pending. Continue independent checks; actual schedules stay untouched.
