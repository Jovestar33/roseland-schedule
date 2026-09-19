# B15 workflow and organization UI continuation — September 19, 2026

Local engineering continuation, not full parity acceptance. Builds on cd86ff3923ab03aadd199b2e46c40a0bfd66c41b. Actual schedules and hosted systems were untouched. User3487/3485, coordinator3492, baseline3488 and source-backed legacy3490 were not rebuilt or restarted.

## Stable candidate

- Checkout: /private/tmp/roseland-b15-workflow-completion
- Branch: codex/b15-workflow-completion
- Review: http://127.0.0.1:3494/review
- Final build: tjBgvlEtpK4FPyF7vvq1x
- Build/source identity: evidence/b15-workflow-completion/build-identity.json
- Runtime manifest: /private/tmp/roseland-b15-workflow-process.json
- Existing ordinary fictional login: /private/tmp/roseland-b15-review-access.json. Existing legacy access: /private/tmp/roseland-b15-legacy-access.json. Private credentials remain outside source and evidence.
- All browser work used the in-app browser, desktop1280×720 and phone viewport390×844. Phone viewport checks are layout evidence, not physical touch-device coverage.

## Implemented and verified

### C05 organization context and ordinary navigation

A persistent global bar separates organization context from library actions. A resolved single organization displays its static name and enters its library automatically. Multiple memberships use a labeled native select; paginated membership lists retain the switcher. Loading, membership-read failure and no-membership states are explicit. Selection resolves server-side scope again and clears the requested schedule; it does not move schedules or change ownership/access. Active operations block switching. Unsaved or retained work triggers a cancelable switch review; drafts remain scoped to their original organization.

Rehearsal directory refresh, raw workspace screen navigation, schedule-lifecycle launcher and restricted provisioning are absent from /review. The rehearsal route keeps them. Organization deletion management appears only in settings, while its read-only lifecycle notice remains available globally. Permission-checked organization management stays in Administration. Ordinary members see their own account actions. Single-org browser checks verified direct entry, static context in library/editor/settings, useful sign-in labels, no technical navigation, retained unsaved draft and original editor deep link after settings, desktop/phone layouts without page overflow.

The adjacent invitation entry was observed exposing a dark LOCAL ACCOUNT REHEARSAL screen. Its product-route presentation now uses the established light cards and ordinary invitation labels. Account settings have aligned cards and a focused account/invitations navigation; signed-in users do not see redundant account creation. No authentication or invitation submission semantics changed.

Evidence: organization-library-desktop.png, organization-library-phone.png, organization-account-desktop.png, organization-account-phone.png, organization-sign-in-phone.png, invitation-entry-desktop.png, organization-phone-state.txt, settings-draft-retained.txt, organization-access.json.

**C05 coverage limit:** both existing B15 accounts have one organization. No membership was created or transplanted. Component tests cover resolved single/multiple/paginated/loading/error/empty states and selection identity. Navigation-policy tests cover dirty review, active-write blocking, same-scope navigation and initial entry. Genuine multi-org keyboard selection, cancellation/return and cross-org content isolation remain unverified. Minimum prerequisite: an already approved ordinary fictional account with two memberships on the current B14 destination stack, known fictional schedules in each, and its private access-file path. Independent leadership Administration UI review also remains.

### History, snapshot and template workflows

History previously exposed the complete dark lifecycle rehearsal and lost the selected schedule on refresh. The product route now offers a focused version sidebar, complete readable document preview, explicit restore review and ordinary return controls. The schedule ID is retained in its URL. Refresh and Back/Forward keep the selected schedule. Cancel sends no restore; restoring version3 of the new concurrent-edit fixture produced version5, retained all earlier versions, and reopened the correct saved content. Phone review focuses the confirmation region and stays within390px. Evidence: history-before.png, history-refresh-before.txt, history-after-desktop.png, history-refresh-after.txt, history-restored-v5.txt, history-phone-review.png.

Readable full-document cards now replace raw JSON in schedule-file review, browser-template originals, history and snapshot previews. Rows include full descriptions/notes, contacts, status/completion, time locks, coordinates and nested locations; document previews include metadata, weather and call-sheet fields. Snapshot rename now shows the proposed name, rather than only the old name and internal ID. Snapshot Trash/restore explains recoverability. Review buttons stay in the dialog footer. Snapshot capture → full preview → rename/protect → Trash → restore → Save As New → open passed. Source stayed at version1; snapshot version4 retained matching rows/metadata, with its separately recorded capture timestamp. Evidence: snapshot-name-review.txt, snapshot-copy-open.txt, snapshot-phone-preview.png, snapshot-phone-review.png, saved-readback.json.

Browser-template file import → production-only creation → rename → Trash → restore → organization publication → withdrawal → replacement passed using a newly created fictional template. It ends production-only at version7, one row, not trashed. Original browser-template download is byte-exact; original5-row file remains intact (generated sun rows deliberately omitted on import). No existing template was edited. Evidence: template-published.txt, template-restored-production.txt, template-replaced.txt, browser-template-export-check.json.

Malformed schedule/template files now receive actionable JSON errors explaining that nothing was imported. Both were retested using the ordinary file chooser. Evidence: invalid-schedule-error.txt and invalid-template-error.txt.

### Save conflict, content identity and actual downloads

Two normal tabs opened the new fictional schedule at version2. First writer saved version3; second writer's stale save was rejected, exact draft preserved, false Saved state avoided, and overwrite disabled. Checking saved result confirmed the different version. Explicit Reload discarded the stale draft and loaded the first writer's content. History restored version2 as version4, then the new history UI restored version3 as version5. Evidence: competing-edit-recovery.txt/png and immutable-history.txt. Timeout/lost-acknowledgement permutations remain separate unexecuted browser paths; controller tests are supporting evidence only.

C04 was an input mismatch, not an unexplained dirty-state defect: candidate ordinary fixture stored3rows and no sun markers; legacy stored5rows including2markers from an earlier fictional save. Candidate truthfully adds missing markers to a dirty draft. Importing the identical legacy5-row document as a new fixture opens Saved with Undo disabled. No dirty-indicator suppression or silent save was introduced. Authenticated readback proves the imported document remains exactly unchanged at version1. Evidence: ordinary-sun-row-inputs.json and matched-weather-saved.txt/png.

The additional editor footer is required provider attribution. It now uses restrained spacing, border and typography; provider behavior is unchanged.

The actual UI library backup downloaded15 saved fictional schedules. All15 payloads and versions exactly match ordinary authenticated readback. Its stated exclusions remain history, snapshots, templates, CMS, memberships, hierarchy definitions, legacy aliases and browser-only data. This is a complete schedule-document export, not a complete database backup. Evidence: library-downloaded.json and library-download-check.json. Snapshot-copy content verifies all rows/contacts/nested locations, weather and call-sheet metadata; destination production/phase are intentionally assigned by the reviewed destination.

## Open blocking finding — Client recipient refresh

A Client link created only for B15 snapshot copy — fictional opened successfully without sign-in. The visible Client projection omitted contacts, call sheets and status; ordinary notes remained visible. Browser Reload then displayed "Shared schedule unavailable. Ask the sender for a current link." LocalClientViewer clears the fragment and keeps the bearer only in component memory, so reload loses it. The fictional link was revoked, and reopening the original link then correctly failed. No token values were written into evidence. Files: client-projection.txt, client-refresh-unavailable.txt, client-revoked.txt.

The isolated published-source legacy3490 /view/name route loaded and reloaded successfully (legacy-recipient-refresh.txt). Source confirms PublicViewer requests the public projection. This is a demonstrated local recipient-refresh regression. B11_LOCAL_ACCEPTANCE.md explicitly describes clearing fragments but specifies no persisted recipient-session design. The coordinator confirmed ordinary refresh should work while valid; reopening the original link is not accepted as the requirement.

Smallest policy-compatible remedy to assess: exchange a valid fragment once for a bounded server-managed HttpOnly recipient session, then clear the fragment and revalidate the original grant/sponsor restrictions on every read. The session must not outlive or renew the underlying link, must be invalidated by revocation/expiry, and must handle simultaneous different shared schedules without cookie collisions. Hosted HTTPS/Secure-cookie behavior, narrow scope, request-origin checks, cache/referrer/log behavior and unavailable cookies need review. This introduces server session state and is a proposal, not an approved implementation. Leaving the fragment or storing a JS-readable bearer would be smaller code changes but changes the existing token-retention exposure and is likewise not silently adopted. No persistence architecture was changed in this pass.

## Validation and remaining work

240 platform tests and72 editor tests pass, including four new organization presentation/navigation cases. Optimized build/type-check pass. The same two existing hook warnings remain. Evidence logs and exact changed-source hashes are retained. Tests do not establish full UI parity or recipient-role coverage.

LOCAL_PARITY_EXECUTIONS.md remains explicit about incomplete case groups. No full group is promoted to Pass. Client refresh is an observed Fail. Native print/PDF and physical touch evidence remain unavailable; source-backed legacy is not a live hosted comparison. Native-app access was previously rejected by automatic approval review, and no alternate automation bypassed it.

Exact external prerequisites:
1. Open the stable fictional review in an ordinary browser and use Share → Print/PDF to save actual schedule, Contact Sheet and Call Sheet PDFs. Supply their local file paths for pagination/content inspection. An HTML preview does not substitute.
2. Use an already approved physical-device access setup for real phone/iPad touch, keyboard, rotation and print/share checks. No tunnel or network exposure was created.
3. Provide the existing approved multi-organization fictional fixture described above for real switch/cancel/isolation coverage. No new account, role or membership changes were performed.
4. Review and authorize the bounded recipient-session remedy before implementing persistence changes. Hosted deployment/production baseline and migration remain separately gated.

Fictional artifacts created in this continuation: concurrent-edit schedule619b6591-65f8-4fbd-a1b6-238825c186b0(v5), matched-weather scheduleb640d0dd-7b2b-413f-8151-6271145baf4a(v1 unchanged), snapshot-copy schedulee62b61ba-02ee-4d23-97b7-8eec30fd64d9(v1), snapshot25420833-b8c2-4cd8-928a-d0f1927d8489(v4), templated2b1772a-21d8-4966-98f5-191249d0313c(v7). No purges. No live provider call or actual schedule data was needed in this continuation.
