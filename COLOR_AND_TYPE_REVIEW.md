# Color and typography review — October 20, 2026

Local preview: http://127.0.0.1:3532/review

## Shared system

The migration interface now uses `styles/review-theme.css` for application colors and typography sizes. The original Netlify app's existing pink gradient and Bebas Neue / DM Sans pairing remain the reference. Organization-specific schedule colors and action classes remain configurable; they no longer determine administration buttons, tabs, focus rings, or modal chrome.

| Use | Standard |
| --- | --- |
| Primary action | Original gradient: #f03a98 → #d81f82, white text |
| Primary hover | Original gradient: #e62f8f → #be186f |
| Active navigation / keyboard focus | #9d1468 |
| Soft selection / tool hover | #fff3f9 |
| Main / supporting / small text | #171717 / #52525b / #66666f |
| Page / card / border | #f4f4f5 / white / #e4e4e7 |
| Destructive deletion | #b91c1c; hover #991b1b |
| Active / recovery-window badges | Existing green / amber semantic pairs retained |
| Page heading | Bebas Neue, 26px |
| Dialog / drawer heading | Bebas Neue, 24px |
| Section / card heading | DM Sans, 18px / 16px |
| Body / button / input text | DM Sans, 13px; buttons weight 600 |
| Form labels / supporting details | 12px, with 11px compact captions |
| Sign-in heading / logo | Existing larger entry treatment retained |

## Scope and fixes

Reviewed all 12 migration stylesheets: workspace, invitations/acceptance/provisioning, editor tools, library, platform console, history, transfers, organization context, templates, and schedule/template previews. Shared portal modals and buttons are included by a review-only screen rule.

- Removed configurable `--pink` references from these interface styles. Organization test accent #ff88aa remains unchanged in its settings.
- Replaced the one-off invitation-button patch with shared primary-action styling.
- Standardized normal, hover, keyboard focus, active-tab, selected-item and disabled-control treatments.
- Removed leftover blue-green prototype colors from migration transfer dialogs and editor file/confirmation panels. Separate dark rehearsal-only route styles remain isolated from the product review.
- Supplied explicit ink and secondary-text tokens where new components previously referenced undefined variables.
- Normalized page/dialog headings and body/control fonts; enlarged very small template/document supporting text.
- Preserved schedule action-row colors, stored organization settings, document content, and print rules. Shared portal overrides are screen-only.

## Verification

- Production build succeeds, with the same two pre-existing hook warnings.
- Diff whitespace checks pass.
- Static audit: all 22 UI tokens referenced by the 12 migration stylesheets resolve; no configurable pink variables remain in those stylesheets.
- Browser under an existing custom organization accent (#ff88aa): Review invitation renders the original gradient, DM Sans 13px/600; Accept an invitation heading renders Bebas Neue 26px.
- Browser: invitation management uses the same primary gradient and 13px control text; Library heading is Bebas Neue 26px.
- Browser: appearance modal heading is Bebas Neue 24px; disabled Save appearance retains the shared primary treatment. Modal was cancelled without saving.
- Browser: organization deletion action is red and disabled until its existing confirmation requirements are met. No deletion requested.
- Visually inspected account/settings, invitation acceptance/management, permissions, appearance modal, and backup/import drawer. Preview refreshed after the final build.
- No organization configuration, permissions, memberships or schedule data changed. No production deployment.

This is a source-wide visual audit with representative rendered checks, not an accessibility certification or a fresh native-PDF/mobile-device test. Sign-in and platform-console styling were source-reviewed in this pass; earlier screenshots are not claimed as new browser checks.

Evidence in the main workspace: output/migration-catchup/color-type-settings.png and color-type-invitations.png.
