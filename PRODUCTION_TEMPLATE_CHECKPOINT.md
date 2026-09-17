# Production template section — local server checkpoint

The user approved **production-only templates by default, with deliberate organization publication** and explicitly assigned publication to **Production Organizers as well as organization leadership**. This resolves the template audience and publisher portions of D02. Organization leadership means Super Admins and Admins under the existing role model. Editors retain production-scoped template writing; Viewers are read-only. CMS authority and browser-only data ownership are separate decisions.

## Implemented server contract

Three forward migrations add production-scoped create/list/read/replace/rename/recoverable Trash/restore, paginated organization publication discovery, deliberate publish/unpublish, optimistic versions, actor-bound exact request receipts and audit events. Rows retain legacy fields and omit generated sun rows; there is no actual legacy/browser import. Private tables and helpers have no client or service-role grants; only authenticated RPC entrypoints run their own effective authorization checks.

Publishing requires source-production Organizer or organization Super Admin/Admin authority, effective production edit/organize, and read/export access to every contributing source. Another production's Organizer cannot borrow that role. Publication expands the template row audience to active same-organization members, subject to the original production and every contributing source's read/export restrictions. A recipient without a source-production role is treated as Viewer only for this template projection. Source-production suspension remains denied. This grants no ordinary source schedule or history access and never grants organization-wide template editing. Cross-organization access remains unavailable.

Replacement keeps all contributing source identities. Read/export checks use each source's current production, including after Move, and retain the template's original production restrictions. Template Trash/restore also honors explicit Trash denials in those current source contexts. Moving or restricting a source can therefore reduce template availability. No data recall is promised for content already delivered to an authorized recipient.

A changed name/content or Trash withdraws publication; restore remains production-only. This prevents an Editor's later replacement from silently changing organization-published content. A fresh authorized publisher must review the new version. A lost acknowledgement retries the original actor/request/payload exactly; an old receipt does not repeat a write or restore an earlier publication state. Name collisions and concurrent mutations produce reviewable conflicts rather than overwrite.

## Evidence

On both `roseland-templates-20260917` (loopback API 55621) and the separate new `roseland-template-replay-20260917` (55721), **77 genuine Auth/API checks passed** using synthetic accounts and fixtures. The second stack replayed the existing 22 migrations and three new forward migrations. Existing migration bytes remain identical to the local parent commit. All prior local recovery volumes are retained.

The full database suite passed **441 assertions in 15 files**; platform **167**, editor **56**, TypeScript, database lint and security advisors also passed. The six new privilege assertions cover all seven public entrypoints, five private routines and three private tables. Application source is unchanged in this server section, so no new application build or browser acceptance is claimed.

The test run found and corrected two fixture issues (JSON property ordering and an invalid membership status), then reproduced a real moved-source Trash restriction miss before applying a forward-only fix. The regression now verifies that moved source restrictions and the original template production's export restriction both remain effective. The two ordinary source schedules remain at their original saved version 1 and rows after all template/publication operations. A separate fictional Move fixture intentionally advances to version 2; denied template operations do not alter it.

See `evidence/production-templates/auth-api.txt`, `clean-replay-auth-api.txt` and `verification.json`. Test credentials remain in a private temporary local file and are not in this checkout or evidence.

## B06 local workflow acceptance — 2026-09-17

The complete local browse/save/replace/rename/Trash/restore, deliberate publication, Apply and reviewed browser-import paths are now implemented and exercised. See [B06_LOCAL_ACCEPTANCE.md](./B06_LOCAL_ACCEPTANCE.md) for the current acceptance scope and evidence. The earlier server-only evidence above remains historical; it is not the final test total.

The broader 45-group legacy parity gate, hosted application acceptance and physical-device testing remain open. No actual schedule, hosted application, provider, subscription, migration service, push or deployment was changed.
