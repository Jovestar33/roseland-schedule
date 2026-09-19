# Fixture preparation notes

Only existing genuine fictional Admin AAL2, Editor, and review-account sessions were used. Normal authenticated Data API/RPC calls enforced RLS. No service-role writes, SQL grants, identity creation, membership changes, policy edits, suspended-account restoration, new recipient links, or alias reissue.

The first read-only baseline attempt selected the restricted `schedule_restrictions` table and was denied. It was replaced by the supported `read_schedule_permissions` RPC; no privileges changed.

A production insert requesting returned rows was rejected by RLS and created no row. A fresh genuine AAL2 check confirmed `is_org_admin=true` and no existing destination. The normal insert without RETURNING succeeded, then `schedule_creation_destinations` independently returned the production with create/organize capabilities. This is fixture setup evidence, not a production-creation UI pass or a policy bypass.

The first new schedule document contained an unsupported top-level row `id` and was rejected PT400. Removing that test-only field matched the existing schema; no validation rules were changed. No schedule had been created by the rejected call. The final reusable script contains the corrected input and refuses to run when its fixture manifest exists; resumption flags used during preparation were removed.

Final additions: one production, five schedules (four API fixtures plus one created/edited/moved in the browser), one template, two subtractive restrictions. Request receipts and normal audit/history rows arise from those actions. Existing rows are compared exactly in the final preservation check.
