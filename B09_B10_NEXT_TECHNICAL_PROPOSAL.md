# B09/B10 next bounded technical proposal

September 18, 2026. Planning only after B08 focused local acceptance at `5f05bd3`. Use [approved decisions](./APPROVED_FOLLOW_ON_DECISIONS.md) and [account/recovery authority](./ACCOUNT_RECOVERY_ADMIN_DECISIONS.md). Do not reopen settled role defaults, suspension authority, the 30-day window or cancellation rights. This is a proposal for the next dispatch, not implementation authorization.

## B09: ordinary enrollment and policy first

Prepare one concrete contract for TOTP enrollment/rechallenge and required-MFA admission, reusing existing local factor UI, recent-AAL2 sensitive workflows and B08 session/draft recovery. Required roles remain Platform Super Admin and Organization Super Admin; Admin/Organizer/Editor/Viewer remain optional unless organization policy requires MFA. Existing sensitive invitation/provisioning gates stay in place; ordinary schedule saves gain no repeated code prompt.

The proposal should name the policy writer and storage boundary using existing organization Settings authority; define when role/policy changes take effect for existing sessions; show the enrollment-required and same-actor return paths; and explain account-wide factors versus organization-scoped requirements. Map the current code before choosing the smallest forward changes. Routine old-and-new authenticator replacement was not approved as a product procedure, so do not silently include it.

Keep exceptional authenticator-loss recovery as a separately reviewed contract: assisting Super Admin scope and recent verification; acceptable identity proof; restricted Platform Super Admin escalation when no organization Super Admin can sign in; account-wide/cross-organization implications; exact retry/audit; local notification delivery and failure handling. Recommend a concrete proof/reviewer process for review rather than requesting a new broad policy questionnaire. No factor-reset implementation until that contract is reviewed, and no blanket B09-complete claim while it remains open.

## B10: scoped suspension, then recoverable deletion

Inspect existing suspension/reactivation and invitation invalidation contracts first. Propose a bounded membership UI/server operation for the approved authority table: Admins suspend lower roles; only Organization Super Admins suspend Admins; peer Super Admin suspension needs confirmation, notification and an atomic at-least-one-active-holder invariant. Preserve schedules/history, effective restrictions and existing reinstatement rules. This is organization membership suspension, not a global Auth ban.

Then specify an organization-deletion request/cancel state machine with the approved 30-day window. During pending deletion, authorized read/export stays available under existing rights; ordinary writes pause, and suspended users remain denied. Any active organization Super Admin may cancel before expiry, preserving suspensions and restrictions and notifying all Super Admins. Define stale/repeated request behavior and cancellation versus expiry serialization. Produce the dependency/retention/backup/purge execution plan separately; do not schedule or execute permanent purge merely because the window is approved. Subscription cancellation stays separate.

## Proportionate acceptance and stop

For each explicitly dispatched slice, use one minimal fictional local stack and existing fixtures/contracts. Cover the normal enrollment or admin journey, credible role/tenant denial, session/draft return and exact retry after uncertain acknowledgment. Include focused concurrency only for actual last-holder or cancel/expiry invariants; do not rerun the paused B08 token-race investigation. Run relevant existing regressions once after changes and repeat only for a demonstrated failure/change. Preserve forward migration history, failed evidence and recovery volumes; stop owned services at completion.

Before implementation, deliver a short source-to-contract map, concrete API/UI/state proposal, any narrowly unresolved proof boundary, focused acceptance list and exact stop point. No new framework, speculative matrix, hosted change, real accounts/mail/data, deployment, migration, B11 implementation or reskin is part of this planning handoff. B15/B16 user review gates and B17/B18 revalidation/migration approval remain unchanged.
