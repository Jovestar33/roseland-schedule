# Independent findings

Baseline62eb261 isolated3490, candidate59270d8 review3520. September19.

## SA-01 — Call Sheet map links missing (functional regression)

Fresh paired browser: ordinary fixture Call Sheet has3 `Open in Maps` links on legacy and0 on target, despite identical basecamp, parking and hospital text. Candidate `components/modals/CallSheetModal.tsx:133` gates mapUrl on `!local`, unlike LocationCell's `!local || providers?.kind === 'live'`. Current live-provider review is therefore denied these legacy controls. No external directions link clicked. Restore appropriate live-provider links and preserve fictional-provider/read-only/projection safeguards.

## SA-02 — Call Sheet editing unavailable from keyboard (inherited usability defect)

All8 `.csh-field` values are spans with tabIndex-1. Dialog focusables are only Close, Include contacts and Print. Mouse editing works; Emergency Contact draft Escape preserves original and keeps dialog open, then second Escape closes and restores Share focus. Extend existing native inline-edit trigger pattern without changing appearance, no read-only editing.

## SA-03 — Share menu ignores Escape (inherited usability defect)

Fresh paired desktop: open Share; Escape on opener leaves Export JSON visible in both runtimes. Candidate has no aria-expanded state or key handler. Add bounded accessible dismissal/focus semantics preserving all4 menu options, click-outside and scroll behavior. This is improvement, not claimed legacy regression.

## Confirmed non-defects / limits

Ordinary candidate initially Unsaved versus legacy Saved is not a proven same-document regression: retained target has3 rows, legacy now has5 including persisted sun markers. Candidate inserts missing derived markers; do not suppress dirty state or relabel matching fixture identities as byte-identical documents. Match content explicitly for later comparisons.
