# B03 A — permissions foundation checkpoint

Local implementation on the isolated development branch. No push, deployment, live schedules or hosted settings changed. Existing migrations and retained recovery volumes were preserved. This checkpoint is the permissions section of the authorized A–D sequence; B–D remain required.

## Implemented behavior

- Explicit production Organizer assignment; existing Editors are not promoted. Organizer manages creation, rename/archive and recoverable Trash. Editor saves existing content and restores document versions. Viewer reads. Organization Super Admin retains internal `owner` compatibility and the customer-facing label is introduced in organization selection.
- Restrictive organization/production/schedule policies target a role or member. Inherited denies win; Super Admin restrictions bind Admin. Admin cannot replace/remove an owner restriction or target themselves, owners or peer Admins. Policy administration remains separate from document read access. No platform override, purge, billing or future-module grants.
- Optional compact Settings controls show explicit/inherited rules and the current actor's effective result. Authorized leadership can explicitly assign a production role. Settings drafts participate in the existing unsaved-work and signout safeguards.
- RLS reads/history, current document mutations, lifecycle, relevant metadata and invitation creation consult scheduling permissions. Transaction admission serializes policy changes with scheduling writes. Current user/session admission and optimistic document versions remain in place.
- Known-source Save As binds source ID, saved version and policy stamp. Source restrictions are copied atomically with the new identity, combined with destination bounds. Generic file import remains untrusted create-only content; uploaded data cannot grant permissions. A previously downloaded document has no enforceable provenance guarantee.
- Exact creator-only copy receipts recover a lost acknowledgement even when history is restricted, subject to current read permission. They disclose no historical document. Existing captured-source/newer-draft behavior remains; automatically opening the copy belongs to C.
- Output controls recheck current permission before print/download and reject stale navigation/account responses. A readable document already delivered to a browser cannot be recalled or made impossible to copy by a later policy change.

## Verified evidence

- 158 platform tests and 56 editor tests passed.
- 431 database assertions across 13 files passed. Updated legacy management scenarios explicitly distinguish Organizer management from Editor content editing; denied metadata writes and foreign-key/shape invariants remain checked.
- 47 genuine local Auth/API/RLS checks passed: role boundaries, three-scope restrictions, owner bounds on Admin, no self-unlock, retained copy restrictions, failed combination rollback, creator-only receipt matching, discarded-response recovery without duplicate identity/history, and concurrent policy admission on both sides of the commit boundary.
- TypeScript, production build and database function lint passed; database lint reports no issues. `git diff --check` passed.
- Chrome browser: fictional owner sign-in; organization/production/schedule Settings; save and clear an Editor restriction; inherited rule is disabled at schedule scope; readable 390×844 phone controls; source-bound Save As confirmation. Desktop and phone screenshots are in this directory.
- Browser copy: source remains exactly equal to immutable version 6; new copy is version 1, retains all 3 explicit source restrictions and has one copy receipt. The captured copy differs from the stored source only in the editor's existing `savedAt` timestamp, not in schedule fields. First comparison against the copy was corrected to use the immutable source version for the source-preservation assertion.

## Test environment and limits

New unlinked stack `/private/tmp/roseland-b03-local-20260917`, project `roseland-b03-20260917`, API 55421, database 55422. Only generated example.test accounts and fictional documents. Existing stacks/volumes were not reset or deleted. Browser fixture credentials remain private in /private/tmp and are excluded from artifacts. The local app was served on loopback 3417 with the protected workspace launcher. Browser test tab was closed and viewport override reset.

Development-time function refinements were applied on the disposable stack after its initial forward migration run. A full clean migration replay and the combined B–D browser matrix remain part of final integrated acceptance. These scoped checks do not close the 45-group whole-app legacy parity ledger or hosted/device/migration gates. Unassigned placement, familiar library hierarchy/order, Move/request review, copy-opening with durable newer-draft preservation and their combined evidence are still outstanding.

Reproduce the section checks with `npm run test:platform`, `npm run test:editor`, `npx tsc --noEmit`, `npm run build`, `supabase test db --workdir <new-unlinked-workdir>`, `supabase db lint --local --level warning --workdir <new-unlinked-workdir>`, and `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types scripts/test-b03-runtime.ts --workdir /private/tmp/roseland-b03-local-20260917`. The runtime harness refuses any differently named project and any non-loopback API.
