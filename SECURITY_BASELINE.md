# Security Baseline

> **September 16 current-state reconciliation:** The current audit maps the completed local session/workflow/UI security evidence and outstanding F01–F05 gates. September 11 dependency findings cited below are historical: the September 16 audit at `379e066` reported no high/critical runtime findings. This does not complete comprehensive internal or hosted security acceptance. See [TECHNICAL_ACCEPTANCE_AUDIT.md](./TECHNICAL_ACCEPTANCE_AUDIT.md) for evidence, gates and bounded dispatch proposals.

Status: Phase 0 requirements with Phase 1 automation in progress. See
[`SECURITY_AUTOMATION.md`](./SECURITY_AUTOMATION.md) for implemented gates,
reviewed findings, and the resolved July 29 Google credential incident. See [READINESS.md](./READINESS.md) for September 11 dependency findings and incomplete release gates; this baseline describes requirements, not a completed implementation.

## Identity and authorization

Local September 15 evidence: [SESSION_ADMISSION_REVIEW.md](./SESSION_ADMISSION_REVIEW.md) verifies Data API admission across authenticated RPC/table routes and actor-bound admin workflows, with dedicated revocation/expiry races. This is an admission contract, not universal cancellation or Auth/Storage/Realtime enforcement; F02/F04/F05 and the broader F01 policy remain open.

[ACCOUNT_WORKFLOW_REVIEW.md](./ACCOUNT_WORKFLOW_REVIEW.md) records the subsequent local fixes for changed-input request replay, concurrent rate-cap overshoot, legacy expiry-call compatibility and loopback origin handling. Genuine MFA HTTP tests and transactional audit/state checks pass; full account recovery/onboarding/admin UX and hosted readiness remain open.

- Supabase Auth replaces shared PINs; production sessions use secure provider-managed cookies/tokens and defined expiry/refresh behavior.
- **B08 session policy approved September 17, 2026:** rolling 60-minute inactivity timeout; no fixed elapsed-time forced sign-out for continuously active users. The proposed 12-hour absolute timeout is rejected. Only genuine user activity advances idle expiry; background polling/token refresh/automatic renewal do not count or erase expiry. Explicit sign-out, password-reset revocation, membership/account denial and required step-up MFA remain binding. Verify feasible provider/application enforcement and report limitations. Planning only; no implementation or hosted change authorized.
- **B08 password-reset policy approved September 17, 2026:** after a successful reset, sign out/invalidate all existing sessions and require fresh sign-in with the new password plus any required MFA. Implementation must prove provider and application admission behavior, including issued access tokens; refresh-token revocation alone does not prove immediate rejection. Preserve the existing admitted-transaction boundary and report limitations instead of promising unsupported immediate cancellation. This policy authorizes no implementation or hosted changes; the separate persistence decision follows.
- **B08 Remember me approved September 17, 2026:** optional persistent sign-in on personal devices may survive browser close/reopen, with the rolling 60-minute inactivity timeout still applying. Close/reopen and refresh preserve elapsed inactivity; background traffic cannot extend it. Persistent authentication is separate from draft/journal persistence. Preserve unsaved-work protections, same-account recovery, account isolation, explicit sign-out and approved password-reset invalidation. Planning only; no implementation or hosted change authorized.
- Initial methods are email/password, email recovery, and invitation-based onboarding. Magic-link-only and social login are deferred until their account-linking and support paths are designed.
- **B08 decision approved September 17, 2026:** initial-release account creation is invitation-only. Invited recipients may create/verify an account or use their matching existing account. No public registration, automatic membership or open organization creation is authorized. This records product policy only; implementation and hosted configuration remain separately gated. See [B08_NEXT_BATCH_BRIEF.md](./B08_NEXT_BATCH_BRIEF.md).
- **B08 invitation preview approved September 17, 2026:** only after verified matching-account/email proof, show organization name, assigned production if any, proposed role(s) and expiry before explicit acceptance. Before proof or for wrong/missing/revoked/expired invitations, return generic unavailable/sign-in responses without tenant or recipient disclosure. This approval does not grant broader invitation access or authorize implementation/hosted changes.
- **Updated MFA policy, September 17, 2026:** Platform Super Admin and Organization Super Admin require MFA. Organization Admin, Organizer, Editor and Viewer are optional by default; organization policy may require it. Ordinary schedule saves add no MFA prompt. Existing recent-AAL2 gates for sensitive invitation management and restricted provisioning remain; the user acknowledged the invitation-management exception for otherwise optional Admin MFA. See [ACCOUNT_RECOVERY_ADMIN_DECISIONS.md](./ACCOUNT_RECOVERY_ADMIN_DECISIONS.md) for approved assisted recovery and escalation, which are not yet implemented.
- RLS and Storage policies are default deny and ship with cross-tenant tests.
- Sensitive administrative actions require authorization, audit, and recent authentication where warranted.
- Removed or disabled memberships lose API, realtime, and file access promptly.

## Application and API

- Validate every request on the server with bounded schemas; client validation is UX only.
- Enforce database types, checks, uniqueness, foreign keys, and optimistic versions.
- Allowlist response fields by audience. Never return whole records merely because the UI currently ignores fields.
- Protect state-changing cookie-authenticated endpoints against CSRF; use explicit allowed origins as defense in depth.
- Apply risk-based limits to auth, shares, Places, exports, PDFs, uploads, invitations, and destructive actions.
- Use Turnstile only on abuse-prone anonymous forms and verify it server-side; it does not replace authorization.

## Secrets and environments

- Browser: Supabase publishable key only. Server: secret/service-role and paid-provider keys.
- Preserve the July 29 removal of browser Places keys and revocation of both historical credentials; continue enforcing provider restrictions/quotas. Do not reintroduce `NEXT_PUBLIC_GOOGLE_PLACES_KEY`.
- Separate development, preview, and production projects, credentials, data, and deployment access.
- Never place credentials in source, client bundles, generated files, URLs, analytics, logs, or migration reports.
- Run secret and credential-leak scans in CI and before cutover.
- Repository secret scanning and push protection remain enabled; provider alerts
  are not closed until rotation or revocation is independently confirmed.

## Browser and transport headers

Set and verify per route:

- HTTPS with HSTS after domain behavior is validated.
- A nonce/hash-based Content Security Policy compatible with Next.js and required providers.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: no-referrer` on tokenized share pages; restrictive default elsewhere.
- `Permissions-Policy` disabling unused sensors/features.
- Framing denied by CSP `frame-ancestors` unless a deliberate embed requirement exists.
- Authenticated/private responses use `Cache-Control: private, no-store`; tokenized content is not cached publicly.
- Cookies use Secure, HttpOnly where server-managed, SameSite, narrow path/domain, and bounded lifetime.

## XSS, injection, and content

- Render schedule/contact data as text by default; prohibit unsafe HTML or sanitize with a reviewed library.
- Parameterize SQL and avoid dynamic identifiers from requests.
- Validate outbound URLs/protocols and defend server fetches against SSRF if URL fetching is added.
- Use safe spreadsheet export handling for cells beginning with formula characters.
- Review dependencies and Next.js/Supabase advisories continuously; patch
  critical issues before release. High/critical runtime findings block CI;
  development-only exceptions require written scope, compensating controls, and
  an upstream-remediation owner.

## Logging and errors

- Users receive stable generic messages and request IDs, never SQL, stack traces, provider bodies, secret names, or account-enumerating detail.
- Structured server logs allowlist event fields. Redact tokens, cookies, passwords, contact details, documents, schedule payloads, query strings, and signed URLs.
- Audit logs capture actor, tenant, action, target, outcome, request ID, and safe metadata; they are tamper-resistant and access restricted.
- Define retention, alert ownership, escalation, and incident response before cutover.

## Data lifecycle and recovery

- Document retention for active data, versions, soft deletes, audit events, exports, migration artifacts, files, and backups.
- Provide scoped export and deletion processes; deletion accounts for replicas/backups and communicates delays.
- Encrypt data in transit and at rest through providers; restrict operator access.
- Backups are useful only after a timed restoration drill and reconciliation.
- Establish RPO/RTO, backup frequency, restoration ownership, and incident contacts.
- Initial operating targets are RPO 24 hours and RTO 4 hours; provider capability and a restoration drill must prove these before cutover.

## Global privacy and transfers

- The product is globally available even though initial application data is hosted in the United States.
- Publish broadly applicable disclosures describing data categories, purposes, US hosting, international transfers, subprocessors, retention, security practices, user rights, and contact/request procedures.
- Use jurisdiction-neutral core privacy/terms language with regional supplements where required. Do not market the service as universally compliant without qualified legal review.
- Record the accepted privacy/terms version and acceptance timestamp for signup and invitation acceptance.
- **B08 terms interaction approved September 17, 2026:** new users accept Terms of Service and acknowledge Privacy Policy once at signup, recording versions/timestamps. Require reacceptance for materially changed terms; no repeated acceptance for another invitation under the same current versions. Local tests use plainly fictional versioned notices; final approved legal text remains an external-onboarding release gate, with no compliance claims. Bounded fictional local B08 implementation is authorized; hosted changes remain excluded.
- Build access, correction, export, and deletion workflows without restricting them to users from selected countries.
- Organization and production preferences must support international timezones, dates, addresses, phone numbers, locales, and currencies without US-only validation.

## Release evidence

Required evidence includes RLS/role tests, auth failure-path tests, OWASP ASVS-based review, dependency and secret scans, header/CSP verification, API response and log review, abuse/cost tests, migration reconciliation, backup restore, and rollback rehearsal. Findings have owners and severity-based deadlines; critical findings block release.

### B08 local verification race — open acceptance gate

September 17, 2026: installed local Auth v2.192.0 returned two sessions from concurrent verification of one recovery token; both passed application admission before reset. Reset then invalidated both. Sequential replay is denied, but atomic token consumption is not proven and B08 remains unaccepted. The default-off local candidate and exact evidence are recorded in [B08_LOCAL_ACCOUNT_CHECKPOINT.md](./B08_LOCAL_ACCOUNT_CHECKPOINT.md). No hosted configuration or actual account was changed.
