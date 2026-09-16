# Fictional checkpoint, rollback and replay rehearsal

> **September 16 current-state reconciliation:** The proposed session-entrypoint/race follow-up below was completed at `c03d0f7`; later account-workflow races passed at `fb6c2e9` and were rerun at `379e066`. This recovery evidence remains scoped to its older `ddef735` checkpoint and disconnected SQL databases. Current connected-service recovery remains open. The historical September 15 cutoff is not current dispatch authority. See [TECHNICAL_ACCEPTANCE_AUDIT.md](./TECHNICAL_ACCEPTANCE_AUDIT.md) for evidence, gates and bounded dispatch proposals.

September 15, 2026. Known-good application/schema checkpoint: **ddef735**. The new work adds local Python recovery tooling and tests; no application route, hosted schema, credential, subscription or actual schedule was changed.

## What is recoverable

This is an executed SQL data-recovery rehearsal using a generated fictional tenant in the disposable `roseland-contract-20260914` stack. It restores into **new databases**, disconnected from the Supabase Auth/API services. It does not overwrite the source database, a prior recovery database or an existing checkpoint file. Existing unrelated fixture tenants and the separate `roseland-schedule` stack are outside its mutation scope.

The immutable pre-cutover checkpoint contains complete scoped schedule rows, hierarchy, document/metadata versions and audit events; private snapshot/template/library/CMS catalogue records and every catalogue version; and minimal fictional identity/profile references. Three ordered journals preserve subsequent changes, including a new day/schedule, a rename, archive state, call-sheet/row edits, changed related collections/items, an explicit fictional tombstone, and an additional accepted edit on the recovered database. Stable IDs, original versions, timestamps, actors, metadata, payloads, checksums and references are retained. History is appended during replay, never rewritten or synthesized from only the latest document.

The source target is frozen before its final capture. Recovery membership starts suspended and remains suspended until exact reconciliation; the test then activates only that recovery writer and verifies the old writer is still denied. It accepts one more edit, freezes again, captures a third journal, and rebuilds the full chain into another database using only the saved files. All rehearsal writers finish frozen. This proves recovery of newer target edits rather than merely switching code back.

## Final evidence

Artifacts: `/private/tmp/roseland-recovery-20260915-verified/`.

| Result | Verified evidence |
|---|---|
| Contract tests | **30 pass**: 14 new recovery tests plus 16 existing related-store tests. Covers tampering, omitted inventories, unexpected auth fields, duplicate identities, cross-tenant rows, immutable history changes, unsupported hard deletions, wrong predecessors, incomplete/duplicate journals and per-record mismatch detection. |
| Executed recovery checks | **13 pass**, including failure after real writes during checkpoint load, schedule/history replay and related-store/history replay; rollback includes the data, trigger state and durable acknowledgement/authority marker. Failure tests require the intended error, not merely any exception. A correctly hashed checkpoint with omitted schedule history is rejected atomically before acknowledgement. |
| Retry and ordering | Identical checkpoint/journal retries do not duplicate versions. Out-of-order and stale predecessors fail unchanged. A lost-acknowledgement retry revalidates the already-applied data. Both active-writer replay and stale replay against a frozen but newer dataset are refused without losing the newer edit. |
| Reconciliation | **55 individually verified records** across 11 exported table groups; zero missing, unexpected, mismatched, duplicate or failed records. Includes 3 schedules, 8 immutable schedule versions, 11 related catalogue records, 20 catalogue versions, 5 audit events and the scoped hierarchy/identity references. |
| Final schedule state | `Fictional alpha renamed` version **4**, archived `Fictional bravo` version **2**, newly created `Fictional charlie` version **2**. One explicit recoverable catalogue tombstone. |
| SQL integrity | Document and metadata checksums, complete contiguous version histories, related fingerprints/current snapshots, same-tenant schedule references and enabled user triggers verified. No password hashes or Auth sessions in recovery databases. Foreign keys and checks stay enabled during loading. |
| Fresh restore | Generation 2 restores entirely from disk and resumes identically. The standalone CLI separately restores generation 3; its `--resume` result is identical. Both remain frozen. |

The final run ID is `aff2f519-4361-4cc2-aeaf-c1100b55db04`. Its recovery databases use `roseland_recovery_aff2f51943614cc2aeafc1100b55db04_1`, `_2` and `_3`. `report.json` holds every verification result and per-record expected/actual hash. `cli-generation-3.json` and `cli-generation-3-resume.json` hold the standalone CLI results.

The first schema clone exposed a local permission limit on privileged-role default grants; these future-object grants are now explicitly excluded. Existing object ACLs/RLS are retained. Initial SQL comparison/integrity syntax issues were corrected before the final passing run. Earlier `...-a`, `...-b`, `...-c` and `...-d` and `...-final` directories/databases are development attempts, not the final evidence set. Their generated source fixtures were frozen; nothing was removed to hide failures.

No application/schema migration or dependency change was needed. CI gains the synthetic recovery command, but no push or remote CI run occurred. The previous application's 367 pgTAP/37 platform/53 editor tests and build are recorded at ddef735, not presented as freshly rerun for these Python-only changes.

## Recovery procedure for this tested local fixture

1. Preserve the known-good `ddef735` code and the entire final artifact directory. Do not replace, truncate or manually patch a checkpoint/journal to make a mismatch disappear. The directory is owner-only; checkpoint files are atomically published without overwrite, with file and directory fsync. The manifest hashes every required file; journals require the precise predecessor and final-state hashes. Hashes detect accidental corruption, **not malicious re-signing**. Only restore the schema SQL from this trusted locally generated artifact set.
2. Use `/private/tmp/roseland-migration-contract-20260914` and the **unlinked disposable** CLI workdir `/private/tmp/roseland-contract-db-20260914`. Start that stack if stopped. Do not substitute the original `roseland-schedule` workdir, a hosted project or real input data. No Supabase key/password is needed by the recovery commands; they use local Docker SQL.
3. Choose an unused recovery generation (1–3 already exist for the final run). The following command validates the complete file inventory, hashes, schema binding and all journal predecessors **before** creating a new database. It restores the checkpoint and all three journals, including the post-recovery edit, and leaves the new destination frozen:

   ```sh
   python3 -B scripts/migration/recover-fictional.py \
     --workdir /private/tmp/roseland-contract-db-20260914 \
     --artifacts /private/tmp/roseland-recovery-20260915-verified \
     --generation 4
   ```

4. Require `reconciliation.verified: true`, all five integrity checks true, and empty missing/unexpected/mismatched/duplicate/failed lists. Review each row/version hash in the JSON result rather than relying on counts. If interrupted **after the destination schema/marker exists**, retry the same marked, frozen generation:

   ```sh
   python3 -B scripts/migration/recover-fictional.py \
     --workdir /private/tmp/roseland-contract-db-20260914 \
     --artifacts /private/tmp/roseland-recovery-20260915-verified \
     --generation 4 --resume
   ```

   The loader validates the last acknowledged stage before resuming. It refuses unknown markers, active writers, unexpected data and wrong predecessors. A failed schema creation without a valid marker cannot be resumed or overwritten; retain it for inspection and choose a new generation. Generation 1 accepted a later edit after its previous replay acknowledgement, so do not force an old replay into it; recover the complete saved chain into a new generation instead.
5. Keep the old source frozen. The CLI intentionally does not enable membership, connect Auth/API services or change an endpoint. The test harness's explicit fictional activation is not a production failover mechanism. Do not point a real app at these databases: authentication credentials, sessions, complete role/default-grant recovery and service configuration were not restored.
6. After inspection, stop only the disposable project, retaining its volume and all artifacts:

   ```sh
   /Users/johnsammon/roseland-schedule/node_modules/.bin/supabase stop \
     --workdir /private/tmp/roseland-contract-db-20260914
   ```

To reproduce the entire failure-injection scenario, use a **new** output directory:

```sh
python3 -B scripts/migration/rehearse-recovery.py \
  --workdir /private/tmp/roseland-contract-db-20260914 \
  --output-dir /private/tmp/roseland-recovery-another-run
```

## Implementation boundaries and remaining release gates

`recovery_contract.py` validates credential-free checkpoint envelopes, canonical row identities, immutable history and ordered journals, and reports each reconciliation difference. `recovery_runtime.py` locks all restored tables and the recovery authority marker, validates the exact predecessor under lock, and restores inside one transaction. It temporarily disables USER triggers **only in the new disconnected recovery database**, to load original historical rows without generating duplicate history. Foreign-key/check constraints remain active, user triggers are re-enabled before commit, history/reference integrity is checked inside each transaction before its retry marker is acknowledged, and errors roll back both trigger state and data. New updates after activation use the existing versioned RPC and normal history trigger.

Schema capture uses selected schemas and explicitly reinstalls the required `pgcrypto`/`uuid-ossp` extension dependencies. PostgreSQL documents that [selected-schema dumps do not automatically include all dependencies](https://www.postgresql.org/docs/17/app-pgdump.html). The local clone omits original object ownership and privileged future-object default grants. Existing table/function ACLs and RLS are retained, but this is not a complete Supabase cluster, role, credential or service restore.

The frozen membership is a deliberately explicit **fictional owner** policy. Real ownership/retention/sharing decisions are not inferred. Membership/permission history, password reset/login sessions, invitation/AAL2/admin workflows, Storage/Realtime, hosted settings, full exporter coverage, external backup storage/authenticity/key custody and measured production RPO/RTO remain unverified. The one-writer checks concern ordinary authenticated schedule RPCs under the tested freeze; they are not a distributed failover lease or protection from a trusted database administrator bypassing controls.

No Netlify reverse exporter or endpoint/code cutover was executed. Returning the application code to an earlier revision leaves newer data recovery as a separate step. Before real migration, decide and rehearse either a compatible same-database fallback or reverse export/replay, account for all newer target edits and related data, maintain one writer, and reconcile against the actual final boundary. Netlify availability alone remains insufficient.

The comprehensive internal security review and LOCAL_EDITOR_CONTRACT.md findings **F01–F05** remain open: global active-session policy, full account recovery/admin UX, dedicated session-revocation races, related-store application projections and broader security/hosted review. No high-risk exception is silently accepted. The unnumbered external AI-assisted security-tool evaluation remains future planning, not work initiated here. **Application parity and real migration completion remain false.**

Next coherent local batch: inventory every target authentication/authorization entrypoint and add the missing two-connection session revocation/expiry races; close confirmed local bypasses and retain explicit findings for policy/hosted decisions. Continue related application projections and full regression evidence afterward. No new batch may start after September 15, 1:05 PM Eastern without further authorization.
