# B09/B10 account recovery and administration decisions

September 17, 2026. Durable planning record of explicit decisions received while B08 is implemented. No B09/B10 implementation, actual account/factor/membership change, actual purge, hosted configuration or platform privilege is authorized here.

## MFA defaults and existing sensitive actions

- Platform Super Admin and Organization Super Admin: MFA required.
- Organization Admin, Production Organizer, Editor and Viewer: optional by default; organization policy may require MFA for these roles.
- Ordinary schedule saves do not introduce an MFA prompt. Continuous activity does not bypass authorization or required recent step-up.
- This supersedes earlier blanket leadership/Admin-required wording. Existing invitation creation/revocation and restricted provisioning retain recent-AAL2 gates. The user explicitly acknowledged this sensitive invitation-management exception: an ordinary Admin using those actions must enroll/step up even though ordinary features do not require enrollment by default. Do not silently lower those gates or describe optional MFA as a promise that no sensitive action requires it.
- The intended highest platform role is already settled. Current private active-superadmin provisioning remains narrower than unrestricted tenant access; no new privilege or source/deployment authority is inferred.

Current source already supports local TOTP enrollment/rechallenge and enforces recent AAL2 for the sensitive server workflows. Full top-role enrollment enforcement and organization-configurable MFA policy require bounded implementation/acceptance; the new defaults are product approval, not evidence those complete controls exist. Existing-factor verification before replacement and verification of the new factor were recommended but **not approved as a product procedure** in this discussion.

## Approved assisted recovery concepts

An Organization Super Admin may help a user within their own organization regain access after losing an authenticator, after verifying identity, with a recovery audit record and notification to the affected user.

When no Organization Super Admin can sign in, recovery escalates to the Platform Super Admin, with verified identity, a recorded recovery action and notification to the organization's Super Admins. This does not create self-granted platform status, unrestricted tenant access, an automatic factor-reset mechanism or a recovery bypass.

## B09 technical recommendations still requiring bounded review

Use the B08 verified identity, callback, reset and session-admission contract. Reuse existing genuine factor challenges and recent-auth checks. Before any reset mechanism is dispatched, design the following as a concrete proposal rather than asking the user to invent security machinery:

1. Require recent MFA from an assisting Super Admin who can still authenticate; bind the request to the target identity and the specific organization, reason, evidence and exact operation identity. Prevent self-approval through an ordinary member role or a disabled operator.
2. Establish acceptable proof independent of a possibly compromised email address, an accountable reviewer and a documented denial/escalation path. Email possession alone should not silently become sufficient for exceptional factor removal. Recommend human review of exceptional cases, not an automatically granted grace session.
3. Treat Supabase account factors as account-wide. A customer organization cannot silently reset access affecting other organizations or a platform designation. Detect these situations without exposing other tenants; propose restricted platform review before an account-wide change. No cross-organization disclosure is approved.
4. Define a narrowly limited recovery transaction/session that permits verified factor replacement and fresh sign-in, not ordinary tenant browsing or privilege changes. Prove old-factor/session revocation and token replay denial under B08's admitted-transaction boundary. Retain existing MFA requirements; password recovery alone is insufficient to remove a factor.
5. Keep an immutable non-secret audit trail and recipient/organization notifications, including uncertain response recovery and notification-delivery failures. Local tests must use the mail sink. Do not send real messages until separately authorized.
6. Preserve final-holder safeguards under concurrency. Multiple equal Organization Super Admins and their promotion authority are already approved; the approved peer suspension rule below must be enforced atomically, while unapproved demotion mechanics and exceptional proof are not supplied by role rank. A Platform Super Admin loss-of-factor procedure remains outside the approved customer recovery escalation.

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

Before B10 implementation, inspect existing suspension/reactivation contracts and prior decisions so reinstatement is not needlessly re-asked. Reuse already approved authority where applicable; report any concrete unresolved actor boundary. Cancellation/recovery authority and pending-deletion read/export behavior are now settled above. For organization deletion, design concurrent authority changes, exact purge execution/evidence, dependency handling and backup/legal-retention limits. Do not claim all backups are immediately erased after the product window. Operational purge, backup retention and exceptional recovery proof still need bounded technical review; do not reopen settled cancellation authority, suspension authority, view/export or the 30-day window.

Keep these decisions distinct from B05 snapshot purge and B08 password/session recovery. Preserve B06/B07, original migrations and fictional recovery artifacts. Deployment, hosted changes, actual users/data and full migration/parity acceptance remain separately gated.
