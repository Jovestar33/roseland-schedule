# Genuine local role and organization journeys

The overnight pass used three new disposable fictional accounts and two new organizations, productions and schedules on the existing unlinked `roseland-b14-destination-g2` stack. `scripts/seed-b15-overnight.ts` follows the established local fixture pattern, refuses another API origin and refuses to run again over its private access file. Existing review memberships were not expanded. Setup SQL/admin Auth provision only the new fixtures; all reported permission checks use genuine user sessions.

## Observed journeys

| Journey | Result |
|---|---|
| Admin sign-in | Genuine password sign-in followed by genuine enrolled TOTP challenge. Actual provider verification succeeds; no forged token or controlled response substitutes for this check. Repeated on final build. |
| North → South with an unsaved schedule | Stay here preserves the North note. Confirm switch exposes only South's schedule and explicitly reports a draft retained in another organization. Returning to North restores the exact unsaved marker. No save occurs during switching. |
| Switch confirmation | Found misleading source-organization wording on the return trip: the global dirty state belonged to North while the dialog named South. Corrected to retain work in its original organization. Final 390 px dialog is 350 px wide, fully inside viewport, with both buttons visible. |
| Administration | Actual Admin sees membership, security, appearance, permission and invitation entries. Member account sees account/security and invitations-for-you; Administration/Manage invitations are absent. |
| Organization appearance | Edit/cancel restores saved appearance and returns focus. Save of one header label in the new North organization reports version 1; genuine member readback and a fresh Admin session confirm it. South remains version 0. Action reorder preview then Cancel leaves Crew Call first. Labels/Colors/Actions/Logo sections and keyboard reachability checked at 390 px. No retained organization settings were changed. |
| Organization security/members | Actual list contains only the new Admin/Member; Admin self-suspension is not offered. Editor-MFA draft toggle then Discard restores unchecked. No policy or membership mutation issued. |
| Invitation review | Actual Admin can draft only Member organization access, choose North production/Viewer and review accurate access/expiry. Back to draft sends nothing. It previously dropped focus to body; it now returns to Review invitation. Final preview uses the selected organization heading. No invitation was confirmed and no email was sent. |
| Editor in North / Viewer in South | Member saves a North note, switches to South and sees read-only content with Save and More save options disabled; no editing inputs. Returning/reopening North restores the saved note and editing. The saved North appearance is scoped to North. South 390 px page has no page overflow. |
| Outsider | No organization-access message and no Administration. Direct North schedule URL is denied with an unavailable-organization message and no schedule content. Normal authenticated Data API reads return zero new schedules. |
| Backend permission check | The same genuine member's South update RPC is denied. Admin AAL2 and member each read the two assigned schedules. These assertions are separate from browser observations. |

Final browser return checks passed on build `U_DzDuTypFB9XtcrScYi3`. The 96 editor tests and type check passed; production build passes with the two inherited hook warnings. `evidence/b15-overnight/roles/` contains sanitized snapshots, responsive captures, setup assertions and authenticated readback. Private credentials/factor secrets remain outside the repository.

This closes the previously missing nominal multi-organization/Admin browser slice. It does not assert every owner/Admin permission mutation, invitation delivery/recovery, membership revocation race or hosted policy permutation. Existing B08 exclusions remain; no deployment, schema migration, retained membership change or physical-device claim.
