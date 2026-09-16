# Local organization provisioning review — September 16, 2026

This completes the one-time authorized batch after `67cdc0c`. Lifecycle browser acceptance and its contrast/mobile-dialog fixes are checkpointed in **`d27ccbf`**; see [LOCAL_LIFECYCLE_REVIEW.md](./LOCAL_LIFECYCLE_REVIEW.md). The subsequent change connects the existing organization-provisioning workflow to the shared loopback workspace. All accounts, organizations and documents exercised are fictional. Actual schedules, Netlify, hosted Supabase, real credentials and billing remain unchanged. No push, deployment, live migration or automatic coordinator restart occurred.

## Implementation and authorization

The **Restricted provisioning** screen is a retained, account-bound workspace panel independent of the selected organization. It uses the existing `POST /api/platform/organizations` route, with no new server endpoint, SQL migration, grant or policy. The panel can be viewed by a signed-in rehearsal account; viewing a form is not an operator designation or authorization. Every confirmation/retry still requires the existing active private platform `superadmin` designation, verified non-anonymous owner, genuine AAL2, recent authentication, session admission, canonical input binding, rate limit and transactional audit. Ordinary organization Owners/Admins are denied by that boundary. No browser receives operator records or server credentials.

The form accepts an existing owner UUID supplied through the operator process. It does not search for owners, disclose account details, create accounts, grant operator status or enroll/reset authenticators. A previously verified authenticator can be challenged; missing enrollment is explained as a separate setup prerequisite. MFA verification failures retain the draft; an authentication failure offers the shared same-account sign-in flow. The server remains authoritative for freshness even when the client reports an AAL2 session.

Review uses the existing canonical parser, then freezes the actor, complete normalized settings and one request key. Duplicate confirmation is suppressed. Transport pins the matching actor/session, exact body/key and same-origin endpoint; responses must contain a valid organization UUID and the exact request ID. Timeouts and malformed acknowledgements remain uncertain. Explicit retry sends the same immutable request through the existing server idempotency ledger; there is no new result lookup or account-disclosure API. Changed-input conflicts do not silently allocate a key or resend. Discarding a sent review warns that its result may already exist. Account changes invalidate late results and clear every retained draft; internal navigation and same-account reauthentication retain the review.

**Open organization if accessible** performs the normal fresh membership lookup. Provisioning for another owner does not enroll the operator in that organization. No organization access is inferred from a successful creation response. A new owner can discover its organization, which initially has no production/day/schedules. Creating those hierarchies is outside this slice.

## Fresh verification

- **114 platform tests pass**, including 13 provisioning-controller/transport tests for canonical immutable inputs, invalid values, duplicates, unknown/auth/MFA/denied/rate recovery, conflict handling, account changes, exact session/key/body binding and acknowledgement validation. **53 editor/server/routing regressions pass.** TypeScript, lint, production build/integrated lint and diff checks pass. Maximum-length valid name/address/reason values wrap within a 390px review without horizontal page overflow.
- **14 unchanged migrations; 431 pgTAP assertions across 13 files pass** on the newly created clean provisioning database before runtime fixtures. SQL lint reports no schema errors; local security advisor reports no issues. The dependency audit reports no high or critical runtime vulnerabilities. No dependency or SQL changes were required.
- The new genuine MFA/built runtime verifies denied Owner/Admin/other-tenant actors, unverified/missing owners and invalid input; operator provisioning and exact replay; changed-input conflict; permitted recipient/own-owner discovery and operator/outsider isolation; dropped committed acknowledgement and pre-send outage; held duplicate confirmation and concurrent identical requests; actual session expiry/revocation, same-account password/MFA recovery, existing rate cap and inactive-operator denial. Each successful request has one audit. These new request races are HTTP concurrency checks, not claims of measured lock waits.
- The existing **shared-workspace runtime passes again**, including role/tenant navigation, acceptance-to-read-only schedule access, session expiry/revocation, genuine Admin MFA, held/dropped invitation responses, Host/route gates and server-key exclusion.
- The existing **account-workflow runtime passes again**: all three workflows, 15 changed-input variants, identical and changed-input measured same-key lock waits, three concurrent rate-boundary races, replay at cap, days-based canonical inputs, injected audit-failure rollback, and built genuine-MFA HTTP/expiry checks. The six same-key plus three rate races are fresh executions. This does not newly verify hosted behavior or every broader session/Storage/Realtime boundary.
- CI adds the provisioning runtime after lifecycle testing; no remote CI run was triggered. The first new runtime attempt failed only because its fictional inactive-operator fixture omitted the schema-required `disabled_at`; the fixture was corrected and complete reruns pass. SQL policies were not weakened to make it pass.

## Visible browser evidence

The in-app browser stayed visible during testing. An operator with no organization membership signed in and verified its genuine existing factor. Its immutable self-owned review survived a deliberately lost committed acknowledgement and navigation/back; retry returned the same organization. A recipient-owned review survived actual session expiry, shared password reauthentication and another genuine MFA verification, then completed with its original key. Opening that result as the operator was denied. Signing in as the recipient exposed its own new organization; browser history did not restore the prior actor's review.

Mobile 390×844 checks verify review readability, cancellation retaining the exact key, shared discard confirmation, and long-input wrapping. Desktop 1280×720 checks show recovered results and permitted workspace discovery. A recipient lacking a verified factor sees the separate setup requirement and cannot confirm. The temporary viewport was reset, fictional account signed out and the owned test tab closed. Physical devices and hosted parity were not tested.

Browser audit evidence in `/private/tmp/roseland-provisioning-20260916/browser-audit.log`:

| Request | Organization | Audits | Operator member | Recipient member |
| --- | --- | --- | --- | --- |
| `c5709cae-bc19-4eb6-878f-d10cdb89af76` | `3273af9c-edf5-4270-a52b-f50e277bae86` | 1 | yes | no |
| `163b85da-c31c-401b-99b7-d052dd93a4b3` | `eb3ef7fa-e9de-4b8e-892d-e3a3a80b35c6` | 1 | no | yes |

Screenshots:

- [Recovered provisioning](/private/tmp/roseland-provisioning-20260916/recovered-provisioning.png)
- [Mobile provisioning review](/private/tmp/roseland-provisioning-20260916/mobile-provisioning-review.png)
- [Mobile discard confirmation](/private/tmp/roseland-provisioning-20260916/mobile-clear-confirmation.png)
- [Maximum-length review](/private/tmp/roseland-provisioning-20260916/mobile-long-input-review.png)
- [Recipient workspace](/private/tmp/roseland-provisioning-20260916/recipient-workspace.png)
- [Lifecycle contact retained after Escape](/private/tmp/roseland-lifecycle-acceptance-20260916/contact-after-escape.png)
- [Corrected mobile editor discard](/private/tmp/roseland-lifecycle-acceptance-20260916/mobile-editor-discard-fixed.png)
- [Corrected desktop history preview](/private/tmp/roseland-lifecycle-acceptance-20260916/desktop-history-review-fixed.png)

## Reproduction, retained checkpoints and limits

Use an environment-file-free checkout, installed locked dependencies, a production build and an unlinked disposable Supabase project. Run the clean database suite before adding runtime fixtures:

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/test-provisioning-ui-runtime.ts --workdir /path/to/disposable-project
```

The runner rejects linked/nonloopback destinations and discovers only the named local Docker project. It uses generated signup/password/MFA sessions, not forged access tokens; trusted SQL creates fictional authorization fixtures and controlled expiry/rate/disabled-operator conditions. Optional `--serve` provides browser fixtures and controls `code`, `hold`, `drop`, `unavailable`, `release`, `expire`, `results`, `stop`. No real credential is needed. The `drop` control discards the upstream committed acknowledgement and returns an ambiguous gateway failure, avoiding automatic browser TCP replay; it is a fault-injection harness, not production behavior. Local Auth retains its normal issuer and existing validation.

Project `/private/tmp/roseland-provisioning-db-20260916`, ID `roseland-provisioning-20260916`, API/DB 65321/65322, owns Next 3382 and browser proxy 3383. The revived lifecycle project remains separately identified in its review. Both test stacks finish stopped with their fictional volumes retained; the original 543xx project and every earlier recovery checkpoint are preserved. Logs: `/private/tmp/roseland-provisioning-{platform,editor,build,lint,db,runtime,workspace-regression,workflow-regression,sql-lint,dependency-audit}.log`, advisor JSON/stderr and the screenshot/audit directories above. Do not publish start logs or interactive generated passwords/TOTP material.

This is local account-foundation evidence, not complete onboarding, authorization administration or release acceptance. Owner verification/lookup procedures, operator designation/recovery, signup/delivery, password/MFA recovery and related-store ownership/disclosure still require their existing separate decisions and implementation. No new policy was invented to fill those gaps. Full latest-source inventory/reconciliation, capability/data/usability parity, one writer, Netlify availability, internal security review and proven rollback of newer target edits remain required before real migration.

## Next milestone and stop boundary

The canonical [Production Command design brief](./PRODUCTION_COMMAND_DESIGN_BRIEF.md) was read from the shared original checkout and copied unchanged here; README, ROADMAP Phase 3A and READINESS link to it. **Production Command is the confirmed product brand from the scheduling release onward. The neutral visual direction is not selected.** Next is a dedicated research/design decision phase: dated sources, usability/accessibility criteria, distinct representative editor/library/company-branding/print mockups, tradeoffs and Roseland preset examples, followed by the user's selection before implementation. Existing concepts are exploratory; the old prototype is not revived. Keep product chrome, company/document branding and operational templates separate, with organization isolation and versioned presets.

This bounded implementation batch stops here. No research expansion, reskin, live rename, later Production Command functionality, font upload/licensing, arbitrary CSS, purchase, deployment or automatic coordinator restart is included. There are no outstanding blockers for this local batch; design selection and the broader migration/security/parity gates remain future prerequisites.
