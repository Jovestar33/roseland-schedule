# Navigation and brand review — October 20, 2026

Canonical local preview: http://127.0.0.1:3532/review

This review covers the migration workspace's user-facing navigation and its shared editor controls. It does not deploy to Netlify or a hosted Supabase environment. Original Netlify login inspected directly in the browser; its source and shared header styles are the visual reference.

## Changes

- Restore the original 88px header logo and shared AppHeader layout; 72px on small screens.
- Carry the original login's dark background, rose glow, 124px logo, white card and pink primary action into account sign-in and recovery.
- Preserve the originating schedule and unsaved document when entering settings, moving among settings tabs, and returning. History Back also reveals the retained editor draft. Opening a workspace leaves administration after successful navigation.
- Add explicit close labels to membership, security and organization lifecycle panels; add Cancel for unsent invitation drafts and signed-in password reset.
- Add Back to organizations for provisioning, retaining its draft, and restore focus to the Organizations tab.
- Add footer Close to working tool drawers, templates and snapshots. Keep X and Escape behavior. Pending exact requests remain recoverable.
- Add Back to sign in from access/security gates, using the existing sign-out and dirty-work confirmation. This does not bypass account checks.
- Replace unstyled primary-button classes in migration tools with the existing pink button style. Align administration content widths, cards, controls, focus treatment and neutral secondary buttons.

## Surface inventory

| Surface / action | Return, cancellation or close behavior |
| --- | --- |
| Sign-in; invited account; password recovery | Back to sign in from entry subtasks; close email action; cancel signed-in reset |
| Required account / MFA checks | Back to sign in; existing enrollment cancel; no security bypass |
| Account and settings tabs | Back to originating schedule/history/library; header account control toggles back; drafts remain mounted |
| Platform overview / organization setup | Organizations tab and explicit Back; Clear draft; Back to draft during review; uncertain request discard confirmation |
| Invitation create / revoke / accept | Cancel unsent draft; Back from review/revocation; explicit uncertain-result confirmation |
| Members / suspension review | Close members; Cancel membership draft; pending exact request retained |
| Security policy / organization deletion | Explicit Close; discard unsent draft; cancellation of actual deletion remains a separate server action |
| Organization appearance | Existing X/Escape plus Cancel footer; retained pending requests |
| Permissions / production role assignment | Shared settings return; discard restriction draft; collapsible role section; dirty scope-switch guard |
| Library filters, production/phase groups | Filter toggle, Clear filters, disclosure collapse |
| Create schedule / organize / create or rename phase | Existing X/Escape and Cancel; busy guards; uncertain review/result controls |
| Editor / unsaved schedule | Close to Library; Keep editing or discard confirmation; undo/redo |
| Inline metadata, contacts, booking status, custom duration | Existing inline exit or shared modal X/Cancel/Done controls; retained full values |
| Tools chooser | X and Escape |
| Backup/import, move requests, team/client links | All tools, X/Escape and footer Close; imports preserve partially completed requests |
| Move / Duplicate review | Cancel before sending; check/retry/discard-review after uncertain submission |
| Templates / browser template import | X/Escape and footer Close; cancel apply/change review; collapsible management/import sections |
| Snapshots / restore / copy / settings | X/Escape and footer Close; cancel unsent review; check/retry submitted requests |
| Schedule history / restoration | Back to original schedule; Cancel restoration or uncertain-review confirmation; Done/Open saved result |
| Share, print, call sheet, contact sheet, documents | Existing shared modal close/Escape and action-specific footer controls retained |

Close means leave the panel. It does not claim to undo an already submitted operation. Cancel means abandon an unsent local draft/review. Busy and uncertain outcomes retain their existing safeguards.

## Fresh verification

- Production build succeeds. Two pre-existing hook warnings remain in LocalScheduleClient and LocalScheduleLibrary.
- 129 editor tests pass, including four added behavioral regressions: settings return preserves the selected unsaved editor, opening a workspace closes settings after successful navigation, history return does not reload the saved document, and opening settings from History does not enqueue an editor reload.
- 263 platform tests pass.
- Browser: entered an unsent organization setup name, used Back, reopened and verified retention, then cleared it. No organization created.
- Browser: password recovery Back; sign-in layout; genuine existing local test-account MFA; platform and organization layout screenshots.
- Browser: edited a fictional schedule description without saving, opened People & invitations, cancelled an unsent invitation, returned to the same schedule and verified the exact unsaved text survived without a discard dialog. Used Reload and its explicit discard confirmation to remove only the test edit; original saved description verified.
- Browser: opened/closed members, security and lifecycle; Tools → Backup/import → All tools → Snapshots → Close. Verified new controls were present and functional.
- No invitations sent, memberships changed, policies changed, organizations created/deleted, or schedule saves performed in this pass.

Inventory is a source review plus representative browser journeys, not a claim that every destructive/backend operation was executed. Fresh native PDF, physical-phone and separate Safari/Chrome end-to-end runs are outside this UI pass. Visual acceptance remains with the user.

Screenshots live in the main workspace at output/migration-catchup/navigation-login.png, navigation-platform.png and navigation-settings.png.
