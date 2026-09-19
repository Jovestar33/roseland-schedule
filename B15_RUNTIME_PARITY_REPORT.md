# Runtime parity continuation

September 19, 2026. Controlled save-recovery and navigation journeys found and corrected two navigation defects: browser history could show a Library address while the editor remained open, and an older organization-scope response could restore an outdated address after a schedule was opened. The replacement candidate routes history through the existing editor guards and invalidates older navigation reads. A completed operation also clears its stale wait notice.

## Stable replacement

- Preview: http://127.0.0.1:3514/review
- Build: `bYu7a1qaFvI5AErNSarin`
- Checkout: `/private/tmp/roseland-b15-runtime-parity`
- Branch: `codex/b15-runtime-parity`
- Source and evidence commit: see `git log -1` in this checkout; build/source hashes and final process identity are recorded in `evidence/b15-runtime/validation/final-manifest.json`.
- Normal launcher: `scripts/serve-b15-runtime-review.ts`. It connects directly to the unchanged loopback database on 56521. Fault injection requires an explicit `--faults` flag; the test-only proxy on 3513 is stopped and all held responses were released.
- The user-facing tab is left at Library with the retained fictional review account. Frozen review3512 at `ac6fedb` and earlier preview3506 are preserved.

## Additional evidence

[Save and navigation journeys](B15_RUNTIME_SAVE_NAVIGATION.md) record actual authenticated held-acknowledgement, lost-response-after-commit, interrupted-before-forward, exact retry, second-session newer-save, retained newer edit, and Back/Forward discard/cancel cases. Check saved result never silently replaces the newer draft; the exact retry resends the original document hash and expected version. The final build's held-save check preserves the current URL and newer Unsaved note, then clears the wait message when the acknowledgement arrives.

[Library and input journeys](B15_RUNTIME_LIBRARY_INPUTS.md) record real two-page retrieval, exact search/collection/filter/reset results, page-two error/recovery, late cross-organization responses, and representative custom-action, midnight/zero/blank duration, pinned-time and contact save/cancel/Undo cases. No library or input implementation changes were needed for those checked slices.

All current mutations are confined to 125 newly created fictional schedules in the existing disposable North organization. Final case versions are held-save 3, lost-ack 5, retry 3, navigation 14 and input-edges 2. The two-session conflict ends with the genuine newer remote save intact. Setup/readback incidents are explicitly described in the linked reports; they are not relabeled as passing application cases.

## Validation and preservation

- All 100 editor tests pass, including four new tests of actual workspace navigation callbacks and delayed scope reads.
- Type checking and production build pass. Two inherited hook warnings remain; their text is saved in the build log.
- Final-build browser checks cover the pending-save feedback correction and clean Back/Forward on the stable direct connection. Earlier matched failure/recovery journeys identify their own candidate-build evidence.
- All 15 retained review schedules match the earlier C09/overnight versions and document hashes. Opening the ordinary fixture still recalculates its known legacy time baseline into an Unsaved draft; that draft was discarded without saving. The clean stable-history smoke uses the empty fixture.
- Exact-value credential scan: 140 changed-artifact/browser-bundle files checked against 21 private credential values, with zero matches. Private access material stays outside Git. This bounded check is not whole-system certification.
- No hosted write, deployment, push, real-data export, migration, permission expansion, credential change, shared-service restart, purge, reskin or prohibited probe was performed. The frozen candidate remains available for comparison. The coordinator transmission that was previously blocked was not retried.

## Remaining boundary

The local parity ledgers remain **44 Partial, 1 Not executed (MIG-01), 0 full Pass**. The new slices replace earlier statements that those exact cases were unexecuted; they do not certify every permutation in a control family. Full product acceptance and permission to reskin are not established.

The existing legacy-alias token expired at 06:55:50 UTC. A valid alias recipient open/reload case requires existing valid access material or separately authorized issuance; no new token, secret, alias or grant was created. Physical printer/device checks, authorized hosted behavior, wider permission/invitation/configuration and fixture permutations, real migration and independent review remain as stated in the previous report. This is the completed bounded local continuation, with a stable replacement and reviewable evidence.
