# Local invitation acceptance review — September 15, 2026

This slice follows `2bb06f8` on `codex/migration-schedule-contract`. It adds `/local-accept-invitation`, an independently enabled loopback rehearsal for explicitly supplied fictional invitation IDs and genuine local Auth sessions. Actual schedules, hosted systems, real credentials, Netlify defaults and previous recovery artifacts were untouched. No mail, push, deployment, purchase or billing change occurred.

## Acceptance and recovery contract

The existing `accept_organization_invitation(uuid)` RPC is unchanged. It requires the current account's verified matching email, a pending unexpired invitation, active parents and nonsuspended memberships. It retains stronger existing roles and rejects a reused invitation. The invitation ID and actor are the immutable operation identity; this screen does not add a second request-key or change the original single-use contract.

Recipients cannot read the admin-only invitation/audit tables. Forward migration `20260915070000_invitation_acceptance_receipt.sql` therefore adds `get_my_invitation_acceptance(uuid)`, a narrowly scoped, read-only receipt. It returns only invitation ID, organization ID and acceptance time, and only when all of these hold:

- The invitation is accepted by the current actor, whose current verified email still matches its recipient.
- The organization is undeleted and the actor has active organization membership.
- If the invitation assigns a production, that production is undeleted in the same organization and the actor's matching production membership is active.

Other callers, pending/missing invitations, changed or unverified email, suspended memberships and deleted parents receive no receipt. Even an organization Owner cannot use this endpoint to retrieve another actor's receipt. It grants no listing or mutation rights. The stable security-definer function has an empty search path and explicit authenticated-only execution grants; anonymous and service-role execution are revoked. The existing Data API session-admission hook applies to both its GET and POST forms. Trusted SQL administrators remain outside this ordinary-client boundary.

An absent receipt does **not** establish that an earlier request failed: acceptance may have completed before access was removed. The UI retains the same ID and explains this ambiguity. A retry checks for the recipient's own committed receipt before repeating the existing acceptance RPC. Changed accounts clear the local operation; stale receipt/mutation responses cannot cross that boundary. The repository pins the captured actor's bearer token on each RPC. A failed or lost response never substitutes a fresh invitation ID or grants extra rights.

## Local UI behavior and limits

The page requires `ROSELAND_LOCAL_ACCEPTANCE=supabase`, the existing local Supabase URL/anonymous-key configuration and a loopback Host. Hosted Netlify/Vercel environments, nonloopback URLs and inappropriate keys are refused; unavailable configuration returns 404. It requires no browser service key or platform-admin feature flag. Legacy shared-PIN routing and CMS initialization are bypassed only for this independently gated route; the other local gates remain separate.

Password sign-in, ID review, explicit acceptance, result lookup, acknowledgment, same-account reauthentication and explicit discard/sign-out confirmations are implemented. Accounts/drafts are memory-only, without auth persistence or automatic refresh. Requests use no-store fetches and bounded timeouts. The page warns before leaving with a dirty draft. Closing/reloading loses local drafts, but reentering the same fictional ID and checking its receipt can recover a still-visible completed result. Discarding an unresolved review requires confirmation, keeps the ID draft and account, and does not undo accepted access. Cancelling discard keeps the exact review. A mobile visual check caught the shared dialog's inherited zero margin; explicit automatic margins center it.

This page accepts only supplied fictional IDs; it does not discover pending invitations, parse email links, deliver mail, sign up users, reset passwords, recover lost MFA or preview an organization's name/roles before acceptance. The existing acceptance RPC does not impose a new MFA requirement, and this slice does not invent one. A reviewed recipient preview/disclosure design and delivery/signup/recovery procedures are required before this can be considered complete product onboarding. It is not a production parity result.

## Executed validation

Disposable project `/private/tmp/roseland-acceptance-db-20260915`, ID `roseland-acceptance-20260915`, API/DB ports 61321/61322. The test-only proxy uses owned loopback port 3351, with the built Next application on 3352. All accounts, invitations, memberships and controlled failure states are generated fictional fixtures; no actual schedule is read or changed.

- **14 migrations; 431 pgTAP assertions in 13 files pass**, including 22 new receipt/grant/scope/suspension/replay assertions. Initial fixture setup failed because parent deletion requires a fictional Owner identity even from the fixture SQL connection; the fixture now supplies that owner identity without bypassing the production-protection trigger.
- **70 platform tests pass**, including 11 new configuration, immutable actor/ID, duplicate confirmation, uncertain/denied/auth recovery, receipt validation, pinned-token and cross-account late-response checks. **53 existing editor/server/routing tests pass**. Final TypeScript, production build and integrated lint pass.
- The genuine local acceptance runner verifies matching/wrong/unverified accounts; expired/revoked/reused invitations; organization/production suspension; deleted parents; no grants/audit after denial; preservation of stronger Owner roles and exactly bounded Member/Viewer grants; receipt privacy; committed-response loss; pre-send outage; duplicate concurrent acceptance; and expiry followed by same-account password reauthentication. Successful/recovered operations have one acceptance audit. The two simultaneous controllers are HTTP concurrency evidence; they do not separately instrument a database lock wait.
- All **eight existing invitation/suspension races** pass with observed database waits. The expanded session-admission runner passes all **16 authenticated RPCs**, 11 tables across five HTTP methods, receipt GET, and GraphQL-gateway rejection for expired/revoked sessions; its **eight admission scenarios** also pass. This retains the documented admission-time semantics: an admitted request may finish. The local GraphQL extension is absent; gateway tests do not claim GraphQL data execution.
- SQL lint reports no schema errors. The local security-advisor command reports no issues. These are bounded local checks, not a complete hosted/internal security audit. The linked advisor allowlist is not expanded, and no remote advisor or CI run was triggered.

Visible browser evidence covers wrong-account denial and hidden receipt; matching acceptance; reused RPC denial followed by own-receipt recovery; a dropped committed response; actual session expiry and same-account password reauthentication retaining the same ID; expired/revoked denial; explicit discard/cancel with retained ID; and pre-send outage with absent receipt followed by successful same-ID retry. In the dropped-response browser case, the displayed response was bounded “unavailable”; the own-receipt check recovered the completed acceptance. The CLI transport case directly produced the uncertain state. No unobserved explanation for that browser transport difference is claimed.

Fictional browser result checks are saved at `/private/tmp/roseland-acceptance-browser-results.log`: normal/reused ID `027cbd0d-678f-450a-97ab-7eb01e89e4c7`, dropped-response ID `28bf9c08-388a-4945-ab46-137fe35ca78c`, reauthentication ID `ac291fe1-6ab6-48a2-8a12-4a81b5bf9207` and outage ID `8d0e9fa9-74cb-47d1-ab7f-92bd8527176b` each have one acceptance audit. Expired/revoked cases have none. These are fictional operation IDs, not credentials. The final centered confirmation was verified at 1280×720 and 390×844; the temporary viewport was reset and fictional browser sessions were signed out. Desktop and phone-width form/recovery layouts were inspected; physical-device testing and exported screenshot artifacts are not claimed.

Other bounded evidence: `/private/tmp/roseland-acceptance-{build,platform,editor,db,races,sessions,lint}.log`, plus advisor JSON/stderr. Start logs may contain disposable local keys and must not be published. Interactive `--serve` fixture credentials go only to the active test driver, not source/report files.

## Reproduction and next boundary

From an environment-file-free checkout, install dependencies, build, and run:

```
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/test-acceptance-runtime.ts --workdir /path/to/disposable-local-project
```

Use an unlinked, disposable CLI project with the checked-in migrations and local Auth configuration. The runner validates the configured loopback API and named Docker container, creates unique fictional fixtures and retains them in that database. `--serve` in an interactive terminal keeps the local proxy/app available for browser checks; `stop` shuts them down. CI gains this noninteractive runtime step. No real/hosted target is supported by this procedure.

F02 remains open for shared onboarding/session/navigation, recipient preview, delivery, signup, password/MFA recovery, provisioning and broader lifecycle/abuse review. A coherent next local task is shared account/session and organization navigation connecting the already gated acceptance, invitation-management and editor rehearsals, preserving drafts and cross-account boundaries under existing authorization rules. Do not infer a delivery/redirect, owner-lookup, recovery or related-store ownership policy from this work. Those remain explicit decision/procedure gates.

Full capability/data/usability parity, current per-record reconciliation, one authoritative writer, Netlify availability and proven rollback including target-side edits remain mandatory before real migration. Keep the September 15 1:05 PM Eastern cutoff for starting new batches. Earlier invitation/session/recovery volumes and commits remain preserved.
