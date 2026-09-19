# Browser observations — final corrected build

2026-09-19, isolated port3524; no application source changes.

## Fresh Chrome journey

- Existing North member signed in with unchanged credentials. Library search `Pre-review` showed source and unrestricted control only. Inherited target and moved destination schedule were absent. Control opened with editing and Share controls. No member data changes.
- Existing North Admin signed in and completed the existing authenticator challenge; no factor enrollment or credential change.
- Admin library showed all four new API fixtures and the approved API Move request, grouped under their correct productions.
- Created `Pre-review browser move` through New schedule > Review creation > Confirm > Open. Added one Shoot row, description `BROWSER MOVE CONTENT MUST SURVIVE`, note `Fictional review only`, and town `Fictional Harbor`; Save produced version2.
- A browser-tool date fill did not persist; the preview showed a blank date. No date claim is made for this UI case. The separate API case verifies date retention.
- Closed editor; Organize > Move to production > Prepare Move showed the complete saved row and location. Confirm returned `Saved action confirmed.` Reopened result at version3, destination project label `Pre-review fictional destination`, same content and town. Database readback confirmed all these values.
- Original `setValue` organization-selection call reported it did not retain the option, but the next DOM snapshot showed selection and completed library load. The actual observed page state governs the result; this was not treated as an application failure.

## Fresh Codex in-app browser journey

- Existing B14 review account signed in, selected B14 Fictional Studio, searched `ordinary`, and opened B15 ordinary fictional day.
- Schedule, Contact Sheet (three contacts) and Call Sheet views opened. Call Sheet exposed eight edit buttons and three map links with the live-provider configuration. No map links followed and no contact messages sent.
- Contact modal visually inspected at1280x720: three legible cards and Print/CSV controls. Call Sheet visible screenshot saved; lower content remains in its scrollable modal, so screenshot is not full-document/PDF evidence.
- Ordinary fixture opens with automatic sun-row changes in the draft; this was not saved. All retained database documents remain unchanged.
- These are two browser surfaces; no separate Safari/Firefox engine or physical-device claim.

## Native print blocker

- Native app access first reported that the Mac was locked and automatic unlock unavailable. User was asked to unlock it via an asynchronous input request; no response arrived during this pass.
- One subsequent native Chrome selection failed `cgWindowNotFound`. Browser DOM control continued to work. No OS lock bypass or unsupported native-control path attempted.
- No fresh native PDFs created. Browser screenshots and older PDFs are not substitutes for that gate.

## Review surfaces

- Chrome tab1020304410: isolated3524, Admin, saved browser Move result.
- In-app browser tab2: isolated3524, ordinary Call Sheet ready for review; unsaved automatic sun rows are draft-only.
- All pre-existing frozen preview processes were preserved;3506,3512,3514,3516,3518,3520,3522 and new3524 each returned HTTP200 at final check.

Saved browser text snapshots normalize trailing whitespace only.
