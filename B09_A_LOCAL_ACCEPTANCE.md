# B09-A ordinary MFA — local acceptance

September 18, 2026. Implemented under the explicit B09-A dispatch following proposal `2f90da2`. This closes the bounded ordinary enrollment/policy slice locally; it does not complete exceptional B09 recovery or authorize a release.

## Implemented

- Workspace Account Security supports first TOTP enrollment, incorrect-code recovery and challenge of an existing verified authenticator. Secrets stay in memory and are cleared after verification/account change. No factor removal, replacement or recovery bypass was added.
- Active Platform Super Admins and enrolled accounts require AAL2 for protected application requests. Organization Super Admins require AAL2 in their organization. Other roles remain optional unless an organization policy requires them; an unenrolled user's unrelated organization stays available. Verified factors protect the account across organizations.
- Organization Super Admins/Admins can change the optional-role requirements through Organization Security under effective permission restrictions and a genuine TOTP verification within 30 minutes. Fixed mandatory roles cannot be disabled. Saves use version checks, actor-bound immutable request receipts and transactional non-secret audit records.
- Narrow caller-only MFA status and own-organization discovery remain available behind valid session/ban admission so required enrollment cannot hide the route back. Existing terms/idle checks and sensitive invitation/provisioning gates remain in place. The server forwards verified actor assurance to trusted workflows; browser-supplied actor headers cannot substitute for JWT assurance.
- Shared organization permission predicates, direct tenant-table restrictive RLS, settings RPCs and the existing policy lock enforce the requirement. Live memberships/policy are read on subsequent requests; already admitted transactions retain the established B08 boundary.
- Workspace panels retain same-actor schedule/policy drafts during reauthentication. Periodic access checks do not record activity or discard drafts. Policy request IDs remain retained within the panel for explicit exact retry; no automatic stale-write resubmission or new cross-account draft sharing was introduced.

Forward migrations: `20260918044230_ordinary_mfa_admission.sql` and `20260918045820_mfa_missing_assurance_denial.sql`. The second explicitly makes absent trusted assurance false rather than SQL NULL. Before the first migration applied, its enum spelling was corrected from `super_admin` to the existing `superadmin`; the failed attempt is retained in evidence and did not enter migration history. The preserved B08 test stack also received the already committed B05 snapshot migrations it was missing. No existing migration history was rewritten or database reset performed.

## Acceptance and evidence

| Check | Result / evidence |
|---|---|
| Genuine local Auth and database contract | **34 passed**, [runtime.log](./evidence/b09-mfa/runtime.log): enrollment, wrong code, next-login challenge, owner/platform requirements, optional editor/Admin, policy version/retry/audit, role-change admission, direct API denial, unrelated organization, outsider denial, forged browser headers and private helper grants. |
| Existing sensitive workflow | **6 passed**, [sensitive-runtime.log](./evidence/b09-mfa/sensitive-runtime.log): genuine password login denied before MFA, genuine TOTP challenge, retained exact invitation request succeeds, repeat returns the same invitation, missing service assurance fails closed. No real mail sent. |
| Browser | [browser-evidence.json](./evidence/b09-mfa/browser-evidence.json): required owner enrollment, QR/manual setup, wrong-code recovery, verification, organization policy save; unsaved town text and policy checkbox draft survived controlled session expiration, fresh password login and MFA challenge. Both saved afterward; the fictional schedule reached version 2 without another code prompt. |
| Existing regression suites | **205 platform tests passed**, [platform-tests.log](./evidence/b09-mfa/platform-tests.log); **62 editor tests passed**, [editor-tests.log](./evidence/b09-mfa/editor-tests.log). Updated directory and trusted-header contract tests passed; no B08 token-race suite. |
| Types/build | TypeScript and production build passed: [types.log](./evidence/b09-mfa/types.log), [build.log](./evidence/b09-mfa/build.log). The existing `LocalScheduleLibrary` ref-cleanup lint warning remains; no new MFA lint warning. |
| Local database | Forward application recorded in [migration.log](./evidence/b09-mfa/migration.log) and [followup-migration.log](./evidence/b09-mfa/followup-migration.log). [Security advisors](./evidence/b09-mfa/db-advisors.log): no issues. [DB lint](./evidence/b09-mfa/db-lint.log): no errors; existing snapshot function's unused `restored` variable warning remains. |

Browser uncertainty is stated precisely: the periodic check detected the controlled expired session before the attempted policy submission, so that browser case proves retained **drafts**, not a submitted uncertain-acknowledgment request. Exact submitted-request retry is proven by the separate genuine HTTP invitation test and policy RPC receipt tests. This was controlled expiration, not a literal idle-hour wait or hardware-device test. Browser acceptance preceded a final stale-message cleanup; types/build verified that minor cleanup.

The runtime fixtures are new fictional `@example.test` accounts in the preserved unlinked local `roseland-b08-20260917` stack (`127.0.0.1:56121`, local app `3435`). Private credentials/factor material are in a mode-600 temporary fixture file, never in evidence or Git. `scripts/test-mfa-runtime.ts` creates fresh fictional fixtures; `scripts/serve-mfa-user-flows.ts` serves them without running a race suite; `scripts/test-mfa-sensitive-runtime.ts` checks the existing sensitive route. All scripts reject a linked or unexpected target. The owned browser test tab was closed.

## Stop and limits

Owned services are stopped after acceptance, with containers/volumes and private fictional recovery fixtures preserved; see [cleanup.txt](./evidence/b09-mfa/cleanup.txt). Actual schedules/accounts/mail and hosted configuration were untouched. No push, deployment, real-data migration, provider security investigation, B08 race rerun, B10/B11 work or reskin occurred.

Enrollment abandoned by closing a tab can leave an unverified provider factor; this slice deliberately exposes no removal/cleanup or replacement operation. Exceptional factor loss/proof, account-wide assisted recovery, Platform Super Admin self-recovery and any later factor-management procedure remain separately reviewed. Existing sensitive-action gates are preserved. Full hosted/browser parity, hardware-authenticator behavior, operational deletion and B15/B16/B17/B18 release gates are not accepted by this local result.
