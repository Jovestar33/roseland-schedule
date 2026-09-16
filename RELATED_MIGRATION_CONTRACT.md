# Related-store migration catalogue

> **September 16 current-state reconciliation:** The next-batch editor/account integration paragraph below has been completed through `ddef735`, `5c533cc`, `d27ccbf` and `379e066`. The private catalogue remains distinct from still-unimplemented related application projections and their unresolved policies. See [TECHNICAL_ACCEPTANCE_AUDIT.md](./TECHNICAL_ACCEPTANCE_AUDIT.md) for evidence, gates and bounded dispatch proposals.

This local slice preserves and reconciles shared Netlify snapshot, template, library and CMS records in a **private migration catalogue**. It is not an application repository, a production exporter or a claim of runtime feature parity. No real schedules or hosted stores were accessed.

## Source contracts and preservation

The contracts were read from `lib/api/{snapshots,templates,library,cms}.ts`, `lib/templates.ts`, the corresponding Netlify handlers, `AUTHORIZATION_MODEL.md`, `TARGET_SCHEMA.md` and `SECURITY_BASELINE.md`.

| Store / actual key | Imported catalogue records | Preserved evidence |
|---|---|---|
| `schedule-snapshots` / `snapshots_` + SHA-256 of schedule name | Complete collection plus each snapshot keyed by its existing ID | Collection name/order/updatedAt; snapshot ID/savedAt/label/full document; verified stable schedule reference. No reuse of the legacy normalizer that silently caps at 25. |
| `schedule-templates` / `templates` | Complete shared map plus each named template | Every row and savedAt; stable mapping separate from checksum/revision. Browser-only templates are not silently assigned to a tenant/user. |
| `schedule-library` / `rp_library_index_v1` | Complete library object plus each folder | Version/timestamps/folders, scheduleFolderMap, phase order, production/phase display names, archive list, town/date caches; every referenced schedule resolves within the destination tenant. |
| `cms` / `rp_cms_config` | Complete settings object | Actions/styles, colors, labels and logo. Unknown fields and credential fields are rejected; unsafe CSS/logo inputs are rejected rather than rendered. |

`related_contract.py` validates the entire input inventory before database mutation, rejects unknown/malformed/duplicate/orphaned data and produces deterministic UUIDv5 mappings from tenant + source environment + store + key + item. Payload changes do not change identity. Collections preserve original order and complete fields; leaf records make individual items independently reconcilable. The database's existing schema-1 validator checks every snapshot/template document before the batch writes. New legitimate legacy shapes require a deliberate contract update, not field stripping.

Source revisions in this rehearsal are explicit synthetic capture revisions, not a claim that legacy `savedAt` provides an atomic revision across stores. Real tooling still requires an approved capture protocol, complete inventory and final consistency boundary.

## Database boundary

Forward migration `20260915030000_related_migration_catalogue.sql` adds `private.migration_records` and immutable `private.migration_record_versions`. RLS is enabled and ordinary API roles, including service_role, receive no table/function grants. The invoker-rights importer runs only through a trusted database migration connection. It validates active destination organization and schedule reference ownership, serializes same-tenant imports, checks expected target version/fingerprint, refuses source revision regression or conflicting equal revisions, and appends a complete checksummed history entry atomically with each change. Collection and leaf input validation is the responsibility of the trusted planner; this is deliberately not an exposed generic JSON write API.

The catalogue's organization identifies the migration destination and isolation boundary. It does **not** authorize every organization member to read shared templates, settings or archived content. No application sharing, browser-data ownership or retention policy has been inferred from this import model.

An explicit reviewed tombstone retains the previous payload/references and appends history. Disappearance from an incomplete source inventory is not deletion authorization. The fictional fixture explicitly removes one old snapshot; previous bytes and import history remain available. No purge or retention timer is implemented. Catalogue history preserves imported source versions separately from the application schedule's own document-version history; legacy snapshots are not mislabeled as historical live edits.

## Rehearsal and verification

```sh
python3 -B -m unittest discover -s tests/migration -v
python3 -B scripts/migration/rehearse-related.py --workdir /path/to/disposable-local-project --report /tmp/roseland-related-migration-report.json
```

The runner accepts no live input files, URLs or credentials. It refuses linked projects, verifies the local Docker database and always rolls back its synthetic transaction. Reports contain keys, mappings, hashes and results rather than private payloads.

The first import writes nine records from four source blobs. An identical rerun writes nothing. The simulated latest inventory changes each store, adds a snapshot and template, and explicitly tombstones the removed snapshot: catch-up inserts two records and updates nine; repeating it skips all eleven. Each current collection/leaf/tombstone compares payload, source revision, target version, references and every immutable import-history checksum. A stale initial copy fails before catch-up.

Negative checks cover duplicate identities, source regression, malformed documents, drift in **each of the four stores**, cross-tenant references, unsafe CMS input and a late history failure that rolls back earlier records in the same batch. Two complete runs produce byte-identical reports. The catalogue report says `catalogue_verified: true`, while `application_parity` and `migration_complete` remain false.

## Remaining contracts and next coherent batch

The catalogue is verified source preservation, not finished application migration. Required follow-up:

- Application read/write projections for snapshots, shared templates, library metadata and CMS; approved visibility/editing rules and recovery semantics. Existing schema design calls for tenant scope but does not fully resolve shared-template/CMS permissions across production membership boundaries.
- Explicit browser-only template/suggestion ownership if that data is brought into scope; legacy snapshot delete versus immutable recovery history; retention/purge policy. No public delete policy is introduced here.
- Reviewed library folder/production/phase normalization, Move To semantics and legacy rename aliases; raw preservation alone does not make hierarchy changes safe or implement the UI.
- One complete real-export capture/mapping process spanning schedules and related stores, with stable source boundaries, reviewable removal/rename mapping and final latest-state reconciliation. The current two synthetic runners are not that exporter.

**Next implementation batch:** add a strictly local, explicit backend selection and genuine account session around the existing schedule editor/library path using the already tested schedule repository. Implement authenticated schedule listing, then prove login → select/open → edit/save/reload plus denied/expired/revoked-session behavior with disposable users. Keep Netlify paths as the existing default and test that separation. This slice can proceed with fictional schedules while related application projections/permission decisions are addressed; it must not claim complete feature parity or ship a partially switched production editor.

All 45 production-versus-target runtime parity groups remain unverified. Verified improvements may pass, but lost capability/data/usability and required untested behavior block real-data migration. Complete latest-source reconciliation, Netlify availability, one authoritative writer, approved cutover and rollback remain mandatory; billing transition stays downstream.
