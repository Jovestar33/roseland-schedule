# Security Baseline

Status: Phase 0 requirements. Controls become release gates as the migrated environment is implemented.

## Identity and authorization

- Supabase Auth replaces shared PINs; production sessions use secure provider-managed cookies/tokens and defined expiry/refresh behavior.
- Initial methods are email/password, email recovery, and invitation-based onboarding. Magic-link-only and social login are deferred until their account-linking and support paths are designed.
- MFA is required for owners/admins before external tenant onboarding.
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
- Remove `NEXT_PUBLIC_GOOGLE_PLACES_KEY`; rotate any key previously exposed and enforce provider restrictions/quotas.
- Separate development, preview, and production projects, credentials, data, and deployment access.
- Never place credentials in source, client bundles, generated files, URLs, analytics, logs, or migration reports.
- Run secret and credential-leak scans in CI and before cutover.

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
- Review dependencies and Next.js/Supabase advisories continuously; patch critical issues before release.

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
- Build access, correction, export, and deletion workflows without restricting them to users from selected countries.
- Organization and production preferences must support international timezones, dates, addresses, phone numbers, locales, and currencies without US-only validation.

## Release evidence

Required evidence includes RLS/role tests, auth failure-path tests, OWASP ASVS-based review, dependency and secret scans, header/CSP verification, API response and log review, abuse/cost tests, migration reconciliation, backup restore, and rollback rehearsal. Findings have owners and severity-based deadlines; critical findings block release.
