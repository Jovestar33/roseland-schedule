# B01 ordinary editor save-result recovery

September 16, 2026 — **B01-01 through B01-10 passed within the local scope below.** This is the explicitly dispatched implementation after documentation checkpoint `8dde3a9` and application checkpoint `379e066`, on `codex/migration-schedule-contract`. The canceled four-file archive was not reapplied. The commit containing this review is the reviewed implementation checkpoint; its hash is recorded in the completion handoff.

## Result and boundaries

An ordinary save captures an immutable account, schedule/organization/production identity, baseline version/schema/metadata, whole document and editor revision before sending. A lost or malformed acknowledgement retains that attempt and the editable draft. **Check saved result** reads through the current account and compares the exact next immutable history version. A matching current version advances the baseline and clears dirty state only when the editor revision is unchanged. Newer edits and undo history stay local.

If the matching historical version is older than the current schedule, the notice reports both versions and keeps further writes blocked until explicit review/reload. Retry is explicit, available only after the original baseline is confirmed unchanged, and checks again before sending the original document/version. SQL's existing expected-version contract decides any intervening writer race. No automatic resend, fresh-version overwrite, server receipt ledger or offline persistence was added.

Only the local editor controller/client/recovery styles, one focused helper, tests, local fault harness and CI invocation changed. SQL, RLS, session admission, dependencies, legacy routes, hosted configuration, real credentials and actual schedules did not change. No push, deploy or real migration occurred. This is saved-state evidence, not proof that one particular network request caused a commit.

## Acceptance ledger

| Case | Result | Executed evidence |
|---|---|---|
| B01-01 | Pass locally | Controller and genuine Auth runtime: held save suppresses duplicate dispatch; one version/history increment; newer edit/undo revision stays dirty. Browser held retry/save disables overlapping actions. |
| B01-02 | Pass locally | Runtime and built visible browser consume a successful upstream commit then return a bounded HTTP 503. Browser confirms version 2 without a second save; newer town draft remains dirty. Final held-check fixture records exactly one save POST, expected version 1, and `2:2` version/history. |
| B01-03 | Pass locally | Pre-send 503 leaves the baseline unchanged. Explicit check enables exact retry; retry probes again. Runtime compares the full frozen document; browser saved the captured town at version 3 while retaining the newer town/notes/undo state. |
| B01-04 | Pass locally | Genuine second editor writes before save, between retry probe/send, and after attempted commit; conditional writes prevent overwrite. Browser reports attempted version 4 versus current version 5, retains draft, disables Save and Retry. |
| B01-05 | Pass locally | Negative helper/controller/transport matrices reject wrong identity, actor, document, schema, version, lifecycle metadata and malformed time; missing/mismatched history cannot confirm. Contradictory current/history at the same version is rejected; history ahead of the first read requires a fresh current read. Runtime consumes a committed acknowledgement then substitutes a mismatched document. |
| B01-06 | Pass locally | Genuine Auth expiry/revocation and password reauthentication; actual membership suspension/restoration; viewer and outsider write denial through current JWT/RLS. Browser same-account login restores the open contact draft and retained conflict attempt after expiry. Viewer renders read-only after account change. |
| B01-07 | Pass locally | Visible browser changes screens/organization during held exact retry and held result read. Harbor draft/result stays hidden in Woodland and returns intact. Back/Forward retains contact/status modal drafts. Browser waits for the bounded save timeout, explicitly signs out and changes account before the harness releases the old response; no old draft/result returns. Controller/runtime additionally deliver a late acknowledgement across an actual actor generation change. |
| B01-08 | Pass locally | Desktop and 390px screenshots; contact and booking-status drafts survive internal navigation and same-account recovery; inline notes and undo/redo survive result checking/retry. Escape and Keep editing cancel discard without losing the attempt or fields; explicit reload clears intended local state and loads the current saved document. The existing Notes cell exposes inline editing; the dormant NotesModal has no UI opener and was not artificially invoked or newly exposed. |
| B01-09 | Pass locally | Genuine 300-row whole-document round-trip and deep immutable comparison, including contact/callsheet/sub-location/zero/fixed/weather fields. No retry-time normalization or replacement with newer edits. |
| B01-10 | Pass locally | Existing configuration/credential tests plus built workspace HTTP checks: local gate, untrusted Host rejection, independent local routes disabled, non-loopback configuration rejected and server key absent from HTML. No legacy-route changes. |

These are unit/transport tests, genuine local Auth/Data API tests and visible browser tests against the built local app. The 390px run is viewport emulation, not a physical mobile-device run. No hosted acceptance was performed; **SAVE-02 and all 45 paired production/target parity groups remain unverified** (0 Pass / 0 observed Fail / 45 Not tested). This does not close the wider migration or security gates.

## Fresh verification

Node `24.15.0`, npm `11.12.1`, installed Supabase CLI `2.109.1`; unchanged locked dependencies. The isolated checkout used a temporary dependency symlink to the existing installation; it was removed before committing.

| Check | Result / retained artifact |
|---|---|
| `npm run test:platform` | 139 passed, including 25 new recovery tests — [output](evidence/b01-save-recovery/roseland-b01-platform.log) |
| `npm run test:editor` | 53 editor/server/routing regressions passed — [output](evidence/b01-save-recovery/roseland-b01-editor.log) |
| `supabase test db --workdir /private/tmp/roseland-b01-db-20260916` | 431 assertions, 13 files, 14 unchanged migrations — [output](evidence/b01-save-recovery/roseland-b01-db.log) |
| `npx tsc --noEmit`, lint and production build | Passed; build rerun after final helper consistency guard — [build](evidence/b01-save-recovery/roseland-b01-build.log), [lint](evidence/b01-save-recovery/roseland-b01-lint.log), [types](evidence/b01-save-recovery/roseland-b01-types.log) |
| Credential-boundary test | 1 passed — [output](evidence/b01-save-recovery/roseland-b01-credentials.log) |
| Runtime dependency audit | No high/critical runtime findings — [output](evidence/b01-save-recovery/roseland-b01-dependency-audit.log) |
| Local SQL lint/advisor | No errors/issues — [lint](evidence/b01-save-recovery/roseland-b01-sql-lint.log), [advisor](evidence/b01-save-recovery/roseland-b01-advisor.stderr) |
| Genuine recovery runtime | Passed after final helper and harness changes — [final sanitized output](evidence/b01-save-recovery/roseland-b01-runtime-final.log) |
| Scoped internal review, whitespace and evidence scan | Passed as described below; no new grants, real secrets or external operations in the diff. |

The first built-runtime attempt returned 404 because its test launcher omitted the pre-existing workspace workflow configuration. The harness was corrected to supply its generated local configuration; no product guard was weakened. An initial noninteractive `--serve` invocation closed on stdin EOF and was restarted with a PTY. The first browser tab consequently saw connection refusal. Neither issue was accepted as feature evidence; subsequent complete runs passed. The locked-Mac browser gate was resolved by the user before visible checks resumed.

## Browser evidence and fictional checkpoint

Built app `http://127.0.0.1:3392/local-workspace`, HTTP fault proxy `3391`, disposable stack `/private/tmp/roseland-b01-db-20260916`, project `roseland-b01-20260916`. API/DB ports `56321`/`56322`; browser issuer `http://127.0.0.1:3391/auth/v1`. The project is unlinked. Generated local accounts use `example.test`; passwords, tokens and CLI key output are excluded from committed artifacts.

First visible browser fixture: owner `39c6dd7a-352f-4acf-8170-b12d94d381d1`, editor `d0108ca1-45f7-439b-a078-b145d4980717`, viewer `87e20290-2956-427c-9546-b8d3ee485f7a`; Harbor schedule `57f14bc6-9088-48b1-8138-d6b38784fd3d`. It began at version/history `1:1` with town `Fictional original`. Observed sequence: lost commit `2:2:B01 dropped commit`; unavailable attempt causes no increment; exact retry `3:3:B01 newer unsent draft`; next lost commit `4:4:B01 older committed history`; concurrent writer `5:5:Concurrent fictional writer`; final held old-account save `6:6:B01 late old account commit`. The later `B01 draft after retry capture` and `B01 conflict draft retained` strings were never substituted into a frozen retry.

Final held-check fixture: owner `d7be5bee-679f-4b93-8687-5225d9e8af59`, Harbor schedule `c208dfb1-8cab-4192-896b-6a27b0fca2fe`. It began `1:1:Fictional original`, then one deliberately dropped-response save yielded `2:2:B01 held check attempt`. The captured POST list was exactly `[{"mode":"drop","version":1}]` after result recovery. `B01 edits while checking` remained dirty in the UI and was discarded only by explicit sign-out. Both Woodland controls remained `1:1:Fictional original`. [Final fictional metadata and document fingerprints](evidence/b01-save-recovery/fictional-checkpoint.jsonl) bind these observations to the retained data; MD5 is an equality fingerprint, not a security integrity claim. The fixture creation document is defined in the committed runner; immutable version-1 histories remain in the retained volume.

- [Desktop contact draft after Back/Forward](evidence/b01-save-recovery/contact-retained-desktop.jpg)
- [Desktop older-match/current-newer conflict](evidence/b01-save-recovery/later-version-desktop.jpg)
- [390px conflict and retained draft](evidence/b01-save-recovery/later-version-390.jpg)
- [390px explicit discard warning](evidence/b01-save-recovery/discard-390.jpg)
- [390px retained contact draft](evidence/b01-save-recovery/contact-retained-390.jpg)
- [Viewer after account change and late response](evidence/b01-save-recovery/viewer-after-account-change.jpg)
- [Held result check confirms saved state, preserves newer draft](evidence/b01-save-recovery/held-check-draft-desktop.jpg)

Screenshots were inspected, not merely generated. The status draft was separately verified in the live 390px browser; its saved transition capture was excluded because it was scaled before the viewport settled. Build-log trailing whitespace was normalized for the evidence copy without changing results. At 390px the existing wide schedule grid requires horizontal scrolling; row controls were tested after scrolling them into view. Recovery/discard/modal text and actions remain usable. This batch does not claim a full editor visual/accessibility audit.

## Scoped internal review and remaining limits

Reviewed every changed application/CI/helper/controller path and its tests. Actor plus SDK session must match before token-pinned ordinary-session RPCs; scoped history is read under normal user authority. Current-record/history checks validate complete JSON, expected next version, actor, tenant/production and lifecycle metadata. Changed actor/document session or generation rejects late results. Same-account recovery retains draft/attempt; explicit sign-out clears account state. No shared mutable draft is used for retry. Existing repository validation and SQL expected-version checks remain the final write boundary.

Current and history reads are not one transaction snapshot: another writer can commit after a check. The next conditional write still conflicts; the UI never silently adopts an observed later version. An already admitted request may commit after navigation, timeout or account change. Discard/sign-out does not undo that database commit. No durable recovery across page closure/reload is promised. Hidden/denied history and unavailable checks cannot establish failure or success. The scoped review is not an independent external security audit and does not close F01–F05, complete account recovery, public links, related stores, hosted parity, final reconciliation or migration/rollback gates.

## Reproduction, cleanup and stop boundary

From an environment-file-free checkout with a built app and installed locked dependencies, start an explicitly named unlinked disposable stack with the same 14 migrations. Do not reset another stack. For visible fault injection configure its local Auth issuer to proxy `3391`; ordinary CI runtime uses its normal local issuer.

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/test-save-recovery-runtime.ts --workdir /private/tmp/roseland-b01-db-20260916
# Interactive PTY, fictional browser credentials are emitted to this terminal only:
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/test-save-recovery-runtime.ts --workdir /private/tmp/roseland-b01-db-20260916 --serve
```

Interactive controls: `drop`, `unavailable`, `malformed`, `hold`, `hold-check`, `release`, `results`, `concurrent`, `expire`, `revoke`, `suspend`, `restore-access`, `stop`. Wait for a control's completion before a dependent command. `drop` consumes the upstream response and emits HTTP 503, avoiding a TCP disconnect that could cause browser POST replay. `results` prints only fictional save counts/versions/town. Do not redirect the interactive credential output to a file.

All owned browser/app/proxy sessions ended; the B01 stack was stopped with its Docker recovery volume retained. The original 543xx stack and earlier recovery volumes were preserved. Source rollback is `379e066` plus accepted audit `8dde3a9`; rolling back code does not undo fictional database commits. Design scaffold/font assets remain preserved and untracked. Review and evidence are synchronized to the shared original project as documentation only. **This batch stops at B01; it does not dispatch B02/B04 or restart the canceled coordinator.**
