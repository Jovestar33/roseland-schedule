# Local invitation management review — September 15, 2026

This bounded slice follows `fb6c2e9` on `codex/migration-schedule-contract`. `/local-invitations` now supports fictional Owner/Admin invitation management against an explicitly configured loopback Supabase instance. It does not send invitations by email. Actual schedules, hosted systems, real credentials, Netlify defaults and prior recovery artifacts were untouched. No SQL migration, dependency, push, deployment or billing change was made.

## Behavior and boundaries

The page requires `ROSELAND_LOCAL_ADMIN=supabase`, the existing workflow gate, a loopback Host and URL, an anonymous local browser key, matching server URL/public key, and a server-only service key. Netlify/Vercel environments are refused. The route is independently gated and returns 404 when unavailable; it does not use the legacy shared-PIN cookie. CMS initialization is skipped on this local route as it already is for the local editor.

Fictional accounts sign in using genuine Supabase password sessions and explicitly enroll a local TOTP factor or rechallenge an existing verified factor. The setup key/code disappear after verification. Sessions and drafts stay in memory, without persistent browser auth storage or automatic refresh. A reload loses them; the page states that limitation and warns before leaving with a dirty draft. This is not a password-reset or lost-authenticator recovery procedure.

Owner/Admin organization choices, active productions and pending invitations are read through the authenticated SDK and existing RLS, in pages of 25. Owner controls expose existing elevated roles; Admin controls expose Member only and disable revocation of Owner/Admin invitations. Backend authorization remains authoritative. Expired pending invitations are labelled expired. Refresh/pagination and unavailable-selection labels preserve a draft rather than silently changing its recipient, role or production.

A review creates one immutable, normalized business-input snapshot and one request key. Confirmation, uncertain retries, rate failures and same-account password/MFA reauthentication retain that snapshot/key. Requests cannot be submitted concurrently. Success requires explicit acknowledgment before another request. Revocation requires a reason and confirms the returned invitation identity.

After an uncertain response, a scoped audit lookup checks organization, actor, request key and action, then compares the resulting invitation with the reviewed inputs. An absent result stays uncertain. A changed-input conflict cannot be blindly retried or silently acknowledged as a matching old result. Discarding an unresolved request requires explicit confirmation that clearing local state does not undo a possibly completed operation. Changing accounts clears local drafts and ignores late results from the prior account.

## Executed evidence

Fresh disposable project: `/private/tmp/roseland-invitation-ui-db-20260915`, project ID `roseland-invitation-ui-20260915`, API/DB ports 60321/60322. The built application listens on owned loopback port 3346 behind a test-only proxy on 3345. Fault injection exists only in the test runner. The original 543xx stack and older disposable recovery databases were preserved.

- All 13 existing migrations apply to the fresh project; **409 pgTAP assertions across 12 files pass**.
- **59 platform tests pass**, including 13 invitation configuration, immutable-request, failure/retry, duplicate-submit, result lookup, conflict and cross-account late-response checks.
- **53 existing editor/server/routing tests pass**. Production build, integrated lint and TypeScript pass.
- The new genuine-auth built runtime verifies scoped organization choices; outsider/viewer denial; 25+1 invitation/production pagination; enabled local route and foreign-Host/setup/editor 404 guards; actual backend role/tenant denial; committed-response loss with lookup and same-key retry producing one audit/result; pre-send outage with absent result; actual changed-body 409 with a mismatched prior result; actual rate denial/retry; and actual session expiry followed by password/MFA reauthentication preserving the exact operation.
- Visible browser testing uses only generated `example.test` fixtures: owner password login and genuine MFA enrollment; production Editor invitation with a three-day duration; explicit create acknowledgment; reasoned revocation; dropped successful response resolved by audit lookup; unavailable transport remaining uncertain until retry; actual 429 with the same key on success; actual 401 followed by same-account password/MFA reauthentication with the same key on success; sign-out confirmation/cancel and explicit draft clearing; Admin role/revocation restrictions; Viewer empty management scope. No email was delivered.

The browser rate request retained key `43ffd1e3-a5f6-461f-87a7-7ceb7e1bfbce`; the expired-session request retained `3eb52d23-bd50-4b8f-9938-7096745d921c`. Each has exactly one audit event in the disposable database after browser recovery. The created-and-revoked browser invitation is confirmed revoked; the lost-response and outage invitations are confirmed pending. These are fictional operation identifiers, not credentials. Initial visual inspection found insufficient header contrast from the inherited light background; a page-scoped dark background fixes it. Viewer empty-state wording was also corrected to avoid asking for MFA when there is no management scope. Final browser inspection verified the corrected 1280×720 desktop view and 390×844 responsive view, including wrapped account text, stacked cards, form controls and pending-list buttons. The temporary viewport was reset, the fictional browser session signed out and the test tab closed.

Bounded logs: `/private/tmp/roseland-invitation-{build,platform,editor,db}.log`. The interactive runner emits generated fixture credentials only to the active test driver; they are not written to source or report files. The CLI start log may contain local keys and must not be published. Browser screenshots are observed in the task; no exported screenshot artifact or physical-device test is claimed. CI gains the noninteractive built-runtime step; no remote CI run was triggered. Prior workflow concurrency/security-advisor evidence remains in `ACCOUNT_WORKFLOW_REVIEW.md`; it is not relabelled as a fresh race/security-audit run for this UI slice.

## Reproduction and remaining work

From an environment-file-free checkout with dependencies installed, build with `npm run build`, then run:

```
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/test-invitation-ui-runtime.ts --workdir /path/to/disposable-local-project
```

The target must be an unlinked local CLI project with the checked-in migrations and genuine local Auth/TOTP enabled. The runner discovers only its configured loopback API and exact Docker container. It creates unique fictional records and retains them in that disposable database. Add `--serve` from an interactive terminal for a browser rehearsal; `stop` closes its owned application/proxy. Do not use a real or hosted target. The operator must supply any separate interactive development configuration through environment variables; no credential file is included.

F02 remains open. This slice does not implement invitation acceptance, delivery, signup onboarding, password reset, lost-MFA recovery, platform provisioning UI, verified-owner lookup, account export/deletion, or complete lifecycle/auth-abuse review. No delivery/redirect, ownership or recovery policy is invented. F01/F03 admission semantics, F04 related projections and F05 comprehensive/hosted security and performance gates remain as documented.

A coherent next local slice is invitation acceptance using explicit fictional invitation IDs and the existing verified-email/expiry/replay policies, with recoverable UI drafts and real local Auth evidence. Any actual email delivery, password/MFA recovery, owner lookup, related-store application projection or hosted onboarding needs its stated decisions/procedures first. Full capability/data/usability parity, current per-record reconciliation, one writer, Netlify availability and proven rollback including post-cutover edits still block real migration. Keep the September 15 1:05 PM Eastern cutoff for starting new batches.
