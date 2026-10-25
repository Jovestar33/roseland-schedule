# Invitation email review — October 25, 2026

Status: wording and layout approved by John on October 25, 2026. Deployment and sending to Nancy and Melissa authorized; hosted installation and delivery must be verified separately.

Use `invite.subject.txt` for Supabase’s **Invite user** subject and `invite.html` for its HTML template. These are Supabase Auth configuration, not part of a Vercel redeploy. Preserve the existing token-hash/optional-invitation fragment URL and site URL when installing. This change does not create accounts, grant roles, or send mail.

The preview uses the exact template with inert links, substituted recipient addresses and the existing white-background logo. Nancy and Melissa see the same wording. Their intended Admin roles must be reviewed in the real invitation workflow; the email does not claim that access has already been granted.

The current flow verifies the link, sets a password, returns to sign-in, then offers the team invitation for acceptance. The wording describes that sequence. Existing-account recipients need their organization invitation/sign-in flow rather than an unnecessary account-setup email; verify account existence before sending. No exact expiry duration is promised because Auth link expiry and organization invitation expiry are separate settings.

Browser layout review is not inbox rendering or delivery verification. Send a test only after wording approval. Unrelated local fictional email templates are unchanged.
