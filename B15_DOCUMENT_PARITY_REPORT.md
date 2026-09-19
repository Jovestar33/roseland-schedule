# Document-workflow parity checkpoint

Verified September 19, 2026, in `/private/tmp/roseland-b15-document-parity`, branch `codex/b15-document-parity`, based on frozen runtime checkpoint `22b77d7`. Stable review: http://127.0.0.1:3516/review. Build: `maNJN6IqApSNAN_ML5hfD`. Application fix is committed in `f5ef94f`; final evidence is committed separately. The preview now connects directly to the unchanged local fictional database on56521; the scoped fault proxy3515 is stopped. Frozen previews3514 and3512 remain separate and unchanged.

## Change and verified behavior

A genuinely committed snapshot whose acknowledgement was lost displayed “Schedule request failed.” The only application change gives accurate uncertain-result feedback and directs the user to **Check snapshot result**, while retaining the exact request and draft. Recovery, authorization and persistence semantics are unchanged. The rebuilt candidate was verified through a second genuine capture with a deliberately lost response, followed by successful recovery of that same capture.

- Snapshot capture recovery preserved newer unsaved project name, date, description and notes. Canceling Restore retained the same draft and did not save it. Restore/Cancel were keyboard reachable at390×844. Each of the two deliberately named captures exists exactly once.
- Template Apply cancellation preserved dirty metadata and rows, with both actions keyboard reachable at390×844. Applying the existing template and deliberately saving retained the target metadata and its inherited user-specific export restriction in `private.schedule_template_bindings`. The existing template/source restriction was unchanged. The affected recipient already has suspended organization membership, so their genuine denied session does not independently prove the inherited restriction caused the denial.
- A checksum mismatch and a mixed two-document input containing an invalid time were rejected before creation. An existing name/slug collision blocked preparation; editing the review allowed preparation. Canceling both desktop and narrow reviews created nothing and preserved the editor draft. On a verified390×844 viewport, keyboard focus reached confirmation and Cancel; Cancel was executed. All three fictional source files retain their original hashes.
- A second genuine browser session saved version7 while export held an earlier version6 read. Export detected the changed inventory and refused a partial file. A later retry downloaded16 saved schedules; every document exactly matches fresh authenticated readback. This is a schedule-only backup, excluding snapshots, templates, hierarchy definitions, memberships and other related state.

## Preservation and evidence

Only one new schedule was created: `B15 document parity — fictional`, ID `1b150e87-7959-4ab8-8e23-76970ca6a928`. Its final saved version is7. All15 previously retained schedule versions and document hashes are unchanged. No rejected or canceled import created a schedule. No membership, credential, grant or direct restriction was changed; no hosted changes, production data migration, deployment or permanent deletion occurred.

The target retains15 snapshots: two named and13 automatic. Twelve automatic captures occurred from09:16:28 through10:12:18 UTC during the earlier active draft; one occurred at22:02:53 after session recovery. They are retained, not purged. Named request/recovery evidence is separate from automatic captures.

Evidence: `evidence/b15-document/cases/`. Key files: `snapshot-lost-ack-corrected.txt`, `snapshot-corrected-recovery.txt`, `template-binding-preservation.json`, `import-cancel-keyboard-phone.png`, `export-concurrent-change-refused.txt`, `export-recovered.txt`, `library-download-check.json`, `preservation-check.json`, `final-readback.json`, and `stable-direct-library.txt`. The actual downloaded JSON is retained as `library-downloaded.json`. The browser download-event waiter timed out; the completed download itself was located and independently parsed and compared. Some earlier import screenshots were1200px and are explicitly named desktop; only the fresh390px capture supports the phone claim.

## Validation and limits

Production build, TypeScript checking,100 editor tests and31 focused existing snapshot/file/template tests pass. Build retains two pre-existing hook warnings. Logs and final runtime/source manifest are in `evidence/b15-document/validation/`.

Full acceptance remains **44 Partial,1 Not executed (MIG-01),0 full Pass**. The ledger adds only the specific observed slices. Wider role/fixture combinations, physical devices/printers, hosted behavior and human acceptance remain open. Isolating the inherited restriction's effect requires an appropriate already-authorized active recipient; expanding access is outside this run. Cross-production Move still needs an authorized destination fixture. Previously expired alias access was not retried.

## Interrupted operation and resumed authorization

An earlier file-chooser call took45936.1494 seconds to return; the next clock reading was22:00:19 UTC, beyond the original11:50:49 UTC deadline. Its cause is unknown. The test preview/proxy were stopped and pending work recorded without claiming completed import checks. The user subsequently renewed authorization through September20 at02:00:42 UTC. Ordinary sign-in recovered the retained draft; the candidate was rebuilt and the unfinished checks completed within that renewed window. No blocked coordinator transmission was retried. Results are saved locally in this task.
