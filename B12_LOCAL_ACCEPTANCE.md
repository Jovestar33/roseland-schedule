# B12 complete synthetic reconciliation

September 18, 2026. B12 local synthetic acceptance is complete: **87 capture/import/reconciliation assertions, 31 genuine Auth/MFA application checks, and 4 retained-checkpoint checks passed**. The report contains 23 per-record projection/catalogue entries, 24 expected refusals, and zero unexplained missing, unexpected or mismatched records. B11 remains accepted at `19acbce`; the separate review preparation is `7cbecab`.

## Scope and evidence

- `evidence/b12-integration/reconciliation.json`: exact checks, source revisions, source/target hashes, target versions, explicit browser dispositions and refusal reasons.
- `evidence/b12-integration/synthetic-checkpoints.json`: two immutable generations, original manifest/file bytes in base64, and organization destination state. All contents are fictional. Includes preserved source-removed snapshot and private fictional browser originals; it contains no password, Auth token, service key or real source data.
- `rehearsal.log`, `application-readback.log`, `database-lint.log`, `security-advisors.log`: acceptance output. TypeScript also passed `tsc --noEmit`.
- `failed-attempt-01.log` through `05.log`: original failed attempts retained. They exposed an unsupported empty-logo fixture, JSON object construction, missing import attribution/current MFA context, and lifecycle append-order behavior. The final fixture omits the unsupported optional logo field; import code fixes construct real JSON objects, use the genuine actor session, and apply reviewed ordering after lifecycle transitions. Existing E8/E9 fixtures were not edited.

The envelope covers schedules, snapshot collections/leaves, shared templates, library, CMS, required browser keys, and legacy aliases. Latest delta edits and renames alpha while retaining its stable ID and old-name alias, adds charlie, unarchives/reorders bravo, changes templates/library/CMS/browser template and adds a new snapshot/alias. One explicitly reviewed snapshot disappearance becomes a source catalogue tombstone while its application snapshot stays retained. Changed historical snapshot content is refused. All imported templates remain production-only with source provenance or explicit browser owner/destination confirmation; private suggestions stay in the private capture and are not tenant-published.

Inventory and hashes are checked before and after the declared synthetic freeze boundary. Missing stores/files, changed bytes/inventory during capture, unknown fields, duplicate JSON keys/identities, malformed JSON/documents, orphans, unsupported CMS, unreviewed browser templates, pending browser writes and nonempty unresolved browser schedule/snapshot caches are rejected. Placement/provenance changes and unsupported removals require explicit review. No implicit rename, truncation, normalization or purge is performed.

Import is one transaction under the organization write lock. Exact retry preserves target rows and histories; latest source requires its previous capture hash and increasing revision. Every organization-scoped public/private table, plus snapshot imports and template origins/bindings/save receipts, participates in target-state comparison. Newer target edits, wrong parents and stale boundaries fail. Injected failures after schedules and after all projections roll back completely. Checkpoint update/delete and direct API-role access are denied.

Genuine password login and MFA verified schedules and versions, library name/order/archive/placement, exact template inventory/content, all retained snapshots, CMS and unrelated-organization denials. Service-only Client alias readback verified the latest stable identity, ordinary notes and contact exclusion. B11 already supplies the signed-route/browser sharing coverage; this does not claim an additional real legacy-token inventory or PDF comparison.

## Retained checkpoint and reproduction

The final run is `/private/tmp/roseland-b12-k33pxhsg`, organization `6b115791-b287-4bce-9d6b-757f3319dd16`. Its two source directories, plans, original captures, final state and receipts remain. The committed synthetic checkpoint also retains both original generations independently of temporary files. Database volumes remain retained. Canonical receipt digest: `119f313ddbe5c6ec1696069df04326bdf3819e9e294c51ce78f68283b09c50a3`.

On an authorized restart of the existing **unlinked test** stack `/private/tmp/roseland-b08-20260917` (API 56121), with its preserved fictional B11 actor credentials, run from this checkout:

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/test-complete-capture-readback.ts --prepare
python3 scripts/migration/complete_rehearsal.py
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/test-complete-capture-readback.ts
python3 scripts/migration/verify_complete_checkpoint.py
```

The prepare step obtains genuine current Auth/MFA claims privately for importer attribution. The runner refuses a linked project and creates a new fictional organization per run; it never resets an existing organization. The importer is a trusted session-only SQL helper, not an API endpoint. The only schema addition is the private immutable capture-receipt table in `20260918071049_synthetic_capture_checkpoints.sql`. SQL lint has only the existing unused `restored` variable warning; security advisors found no issues.

## Boundary and remaining work

This completes supported **synthetic** tool acceptance and retained checkpoint verification. It is not actual-source export/migration, a distributed provider freeze, full browser parity, B13 security review, B14 fresh connected restore, or a production fallback decision. Unknown real shapes remain review blockers. B08's accepted exception, paused investigation, exceptional factor recovery and permanent-purge disposition remain as previously recorded. No reskin or branding implementation.

B12 stops here. Review instance stays pinned to `19acbce` at http://127.0.0.1:3445/local-workspace with separate 562xx services and retained user fictional edits; see `B11_PREVIEW_HANDOFF.md`. Test-service cleanup is recorded in `evidence/b12-integration/service-cleanup.json`. B13/B14 require the next explicit dispatch.
