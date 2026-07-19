# Threat Model

Status: Phase 0 baseline. Review whenever identity, sharing, uploads, billing, or data flows change.

## Assets and actors

Assets include user accounts, organization membership, schedules, call sheets, contacts, precise locations, snapshots, generated files, share links, secrets, audit history, backups, and paid-provider budgets. Actors include legitimate owners/editors/viewers, external recipients, removed members, opportunistic attackers, bots, compromised accounts, malicious insiders, and mistakes in migration or deployment.

## Highest-risk scenarios

| Threat | Impact | Primary controls | Verification |
|---|---|---|---|
| Missing/broken RLS exposes another tenant | critical confidentiality/integrity loss | default-deny RLS, stable tenant FKs, server checks | automated cross-tenant CRUD/realtime/storage tests |
| Service key or API credential reaches browser/log | full bypass or cost abuse | server-only secrets, environment isolation, scans, rotation | bundle/log/secret scan |
| Share token leaks or response over-shares | production or personal-data disclosure | hashed scoped expiring tokens, projection allowlists, no-referrer, revocation | link replay/expiry/projection tests |
| XSS from schedule/contact content | account/session compromise | output encoding, CSP, validated rich text prohibition/sanitization | stored/reflected XSS tests |
| Direct API calls bypass client validation | malformed or unauthorized writes | server schema validation, constraints, RLS | JS-disabled and crafted-request tests |
| Auth abuse/account enumeration | takeover/privacy harm | provider protections, generic messages, rate limits, MFA for admins | failure-path and abuse tests |
| Paid Places or document API abuse | unexpected cost/outage | authenticated proxy, quotas, per-user/IP limits, budget alerts | load and limit tests |
| Concurrent edits overwrite work | production schedule corruption | optimistic versions, immutable history, recovery | stale-write and restore tests |
| Migration omits/duplicates/corrupts records | operational loss | immutable export, idempotent import, checksums/reconciliation, backups | repeated dry runs and sample comparison |
| Rollback loses post-cutover writes | integrity loss | maintenance window, controlled write authority, change ledger, rehearsed rollback | rollback drill |
| Preview/CI environment contains production data | unauthorized disclosure | synthetic default, isolated projects/secrets, access protection | environment audit |
| Logs/errors expose contacts, tokens, SQL, payloads | secondary data breach | structured allowlisted logs, redaction, generic errors | log inspection and error tests |
| Insecure files or signed URLs | malware/data disclosure | private buckets, authorization, validation, expiry | storage policy and upload tests |
| Owner/admin misuse or destructive mistake | tenant-wide loss | least privilege, recent auth, confirmations, audit, recoverable deletion | role and recovery drills |

## Trust-boundary rules

- Treat all browser data as attacker controlled.
- CORS limits browser origins but is not authorization; every request still authenticates and authorizes.
- Publishable Supabase credentials may be public only when RLS is complete. Secret/service-role credentials may not cross the server boundary.
- Netlify exports and migration artifacts are confidential, encrypted where stored, access limited, checksummed, retained temporarily, and securely disposed only after approval.
- External API responses are minimized and their errors are normalized before reaching users.

## Privacy and operational risks

The app handles personal contact information and sensitive production logistics. Before external organizations are invited, document controller/processor roles, subprocessors, regions, retention, lawful basis, user rights, export/deletion procedures, incident ownership, breach response, privacy notice, and terms. Legal applicability requires qualified review; this document is not legal advice.

## Review triggers

Revisit this model before public signup, attachments, specialized external roles, realtime editing, email/SMS distribution, billing, AI features, mobile packaging, new subprocessors, or a material schema/share-link change.

