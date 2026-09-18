# B09/B10 account recovery and administration decisions

September 17, 2026. Durable planning record of explicit decisions received while B08 is implemented. No B09/B10 implementation, actual account/factor/membership change, actual purge, hosted configuration or platform privilege is authorized here.

## MFA defaults and existing sensitive actions

- Platform Super Admin and Organization Super Admin: MFA required.
- Organization Admin, Production Organizer, Editor and Viewer: optional by default; organization policy may require MFA for these roles.
- Ordinary schedule saves do not introduce an MFA prompt. Continuous activity does not bypass authorization or required recent step-up.
- This supersedes earlier blanket leadership/Admin-required wording. Existing invitation creation/revocation and restricted provisioning retain recent-AAL2 gates. The user explicitly acknowledged this sensitive invitation-management exception: an ordinary Admin using those actions must enroll/step up even though ordinary features do not require enrollment by default. Do not silently lower those gates or describe optional MFA as a promise that no sensitive action requires it.
- The intended highest platform role is already settled. Current private active-superadmin provisioning remains narrower than unrestricted tenant access; no new privilege or source/deployment authority is inferred.

September 18 checkpoint: B09-A ordinary enrollment/rechallenge, required-role admission and organization-configurable MFA policy are locally accepted at `a662c69`; see [acceptance and limits](./B09_A_LOCAL_ACCEPTANCE.md). Exceptional assisted recovery remains planning only. Existing-factor verification before replacement and verification of the new factor were recommended but **not approved as a product procedure** in this discussion.

## Approved assisted recovery authority — September 18 update

This consolidated decision supersedes the earlier Super-Admin-only assistance rule for lower roles. Identity must be verified through a **previously known phone number or in person**; email alone is insufficient. Use the target's highest relevant organization role, so an Admin with a production role is still treated as an Admin.

| Target in the assisting organization | Authorized approver |
|---|---|
| Production Organizer, Editor or Viewer | Organization Admin or Organization Super Admin |
| Organization Admin or Organization Super Admin | Organization Super Admin |
| All organization Super Admins locked out | Escalate to Platform Super Admin |

Record the approving actor, target, organization, verification method/outcome and operation identity in a non-secret audit record; notify the affected user. These are recovery-approval rules, not permission to remove a factor or grant tenant access before a separately reviewed mechanism exists.

When no Organization Super Admin can sign in, recovery escalates to the Platform Super Admin, with verified identity, a recorded recovery action and notification to the organization's Super Admins. This does not create self-granted platform status, unrestricted tenant access, an automatic factor-reset mechanism or a recovery bypass.

## B09 technical recommendations still requiring bounded review

Use the B08 verified identity, callback, reset and session-admission contract. Reuse existing genuine factor challenges and recent-auth checks. Before any reset mechanism is dispatched, design the following as a concrete proposal rather than asking the user to invent security machinery:

1. Require recent MFA from the authorized assisting Admin or Super Admin who can still authenticate; bind the request to the target identity and the specific organization, reason, evidence and exact operation identity. Prevent self-approval through an ordinary member role or a disabled operator.
2. Implement the settled proof method and approver table above without another policy questionnaire. Specify how the previously known contact is established, how verification is recorded and how unverifiable cases are denied/escalated; never substitute a newly supplied number or email-only possession. No automatic grace session is approved.
3. Treat Supabase account factors as account-wide. A customer organization cannot silently reset access affecting other organizations or a platform designation. Detect these situations without exposing other tenants; propose restricted platform review before an account-wide change. No cross-organization disclosure is approved.
4. Define a narrowly limited recovery transaction/session that permits verified factor replacement and fresh sign-in, not ordinary tenant browsing or privilege changes. Prove old-factor/session revocation and token replay denial under B08's admitted-transaction boundary. Retain existing MFA requirements; password recovery alone is insufficient to remove a factor.
5. Keep an immutable non-secret audit trail and recipient/organization notifications, including uncertain response recovery and notification-delivery failures. Local tests must use the mail sink. Do not send real messages until separately authorized.
6. Preserve final-holder safeguards under concurrency. Multiple equal Organization Super Admins and their promotion authority are already approved; the approved peer suspension rule below must be enforced atomically, while unapproved demotion mechanics and recovery execution are not supplied by role rank. A Platform Super Admin loss-of-factor procedure remains outside the approved customer recovery escalation.

Normal MFA enrollment/rechallenge can be reviewed separately from exceptional recovery. Do not label all of B09 complete if exceptional procedures are still unaccepted. B08 does not implement this recovery system or bypass enrolled factors.

## B10 approved suspension and deletion policies

| Policy | Approved behavior and boundary |
|---|---|
| Ordinary organization Admin suspension | May suspend lower-role members within existing organization authority, preserving schedules/history. Cannot suspend peer Admins, Organization Super Admins or platform operators, bypass higher restrictions or issue a global Auth ban. |
| Organization Admin suspension | Only an Organization Super Admin within that organization may suspend an Organization Admin. Preserve schedules/history and deny subsequent protected requests. |
| Request admission | Suspension denies subsequent protected requests under the existing boundary; no claim that already admitted transactions are interrupted. No global account deletion or cross-org suspension is inferred. |
| Peer Super Admin suspension | An Organization Super Admin may suspend another in the same organization after confirmation, with notification to the affected person, only while at least one active Organization Super Admin remains. Enforce final-holder protection atomically under concurrent operations. No platform suspension/global ban; preserve schedules/history. |
| Entire organization deletion | Organization Super Admin-requested organization deletion has a 30-day cancellation/recovery window before permanent deletion. This is separate from subscription cancellation. No actual deletion, scheduled purge or billing action is authorized now. |
| Cancel / recover pending deletion | Any active Organization Super Admin of that organization may cancel within the 30 days and restore access, with notification to all its Super Admins. Preserve separately suspended memberships and effective permissions; no new role or reinstatement is inferred. |
| Pending deletion access | Existing authorized users may view/export under current effective read/export permissions; editing and new ordinary writes are paused. Suspended users remain denied. Necessary authorized cancellation/recovery controls stay available. |

Before B10 implementation, inspect existing suspension/reactivation contracts and prior decisions so reinstatement is not needlessly re-asked. Reuse already approved authority where applicable; report any concrete unresolved actor boundary. Cancellation/recovery authority and pending-deletion read/export behavior are now settled above. For organization deletion, design concurrent authority changes, exact purge execution/evidence, dependency handling and backup/legal-retention limits. Do not claim all backups are immediately erased after the product window. Operational purge, backup retention and the exceptional recovery execution contract still need bounded technical review; do not reopen settled cancellation authority, suspension authority, view/export or the 30-day window.

Keep these decisions distinct from B05 snapshot purge and B08 password/session recovery. Preserve B06/B07, original migrations and fictional recovery artifacts. Deployment, hosted changes, actual users/data and full migration/parity acceptance remain separately gated.

## Next bounded proposal — September 18

B08 focused local acceptance is now recorded at `5f05bd3`, preserving its accepted exception and exact evidence limits. [B09_B10_NEXT_TECHNICAL_PROPOSAL.md](./B09_B10_NEXT_TECHNICAL_PROPOSAL.md) narrows the next review to ordinary MFA enrollment/policy enforcement, separately reviewed exceptional recovery, then scoped suspension and recoverable organization deletion. Settled defaults/authority above are not reopened. No implementation or operational reset/purge is dispatched by this planning consolidation.

## Completed-batch handoff — September 18

B09-A is complete locally at `a662c69`. **Superseding dispatch: B10-A suspension and reinstatement are now explicitly authorized for bounded local implementation.** Exceptional recovery remains documentation only. The remaining exceptional-recovery technical boundary is how an approved verification becomes a one-use, expiring, target-bound recovery operation with proven factor/session revocation, exact retry, audit and notification handling. Cross-organization or platform-designated targets require a separately reviewed restricted authority/impact contract before any account-wide change; ordinary organization approval cannot authorize that impact or reveal other tenants. Platform Super Admin self-recovery remains outside the approved escalation. No exceptional recovery or B10-B deletion implementation is dispatched.

## B10-A reinstatement approval and dispatch — September 18

Reinstatement uses the same authority as suspension: Organization Admins may reinstate lower-role members within their organization; Organization Super Admins may reinstate Admins and Super Admins. Restore the prior role and retained restrictions, without adding privileges or undoing independent production/schedule restrictions. Restore only that organization membership; do not recreate invalidated invitations, alter global account bans or change unrelated organization memberships. Keep current-actor authority, confirmation/notification, actor-bound revision/receipt handling and the at-least-one-active-Super-Admin invariant. This supersedes the earlier source/plan deferral of reinstatement. The user explicitly dispatched local B10-A implementation, testing and commit with fictional fixtures and preserved volumes. B10-B, exceptional recovery, purge, B11 and release/reskin work remain outside this dispatch.

### Superseding B10-B dispatch and local completion — September 18

Following B10-A `09e7553`, the user explicitly dispatched the bounded 30-day organization deletion-request/read-only/cancellation slice. It is implemented and locally accepted in [B10_B_LOCAL_ACCEPTANCE.md](./B10_B_LOCAL_ACCEPTANCE.md). Any active same-organization Super Admin may cancel strictly before the deadline without altering suspensions, roles, restrictions or invitations. At the deadline, the organization remains frozen awaiting separately approved purge work. This supersedes earlier B10-B-awaiting-dispatch wording only; permanent deletion, scheduler, billing, exceptional recovery, B11 and release/reskin remain outside the dispatch.
