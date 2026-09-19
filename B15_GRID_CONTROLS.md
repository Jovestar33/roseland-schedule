# Custom action and divider correction

The reported second action row is an Other/custom action, whose text field intentionally replaces the chooser. Its Change action button was occluded by the Location cell because a 170px minimum input width overrode flex sizing. The desktop table also assigned only 80.5% of its width to percentage columns, leaving the fixed utility columns enlarged by table layout. Both defects reproduce in the isolated legacy source runtime at 1200px; this is an authorized Parity Plus correction of inherited behavior.

Screen-only styles now allow the custom input to shrink around its existing button. Description absorbs the remaining table width, preserving 38px row-number, 3px divider and 36px delete columns. Other data columns retain percentage allocation. The existing narrow-screen pixel widths and print rules remain in effect. The horizontal-scroll hint also appears at intermediate desktop widths where the 1225px table exceeds its container. The button has an explicit accessible name. Action changes, custom-text clearing and Undo semantics are unchanged.

## Direct browser checks

- Same fictional ordinary schedule on isolated legacy3490 and candidate3512 reproduced the 9.30px divider, 117.88px row-number column and occluded button at1200. The hit target was the adjacent Location textarea.
- Final measured1200 and1440 widths: utility columns38/3/36px. Phone390 preserves the established1341px grid, columns38/190/250/260/190/3/100/100/110/64/36. All three page widths equal their viewport; overflow stays inside the grid.
- Custom button is inside its Action cell and is the visible hit target at all three widths. Custom → chooser → Shoot works in both Done and normal states. Two Undo actions restore the original custom text. Done state was returned to its initial value. The phone button works; keyboard focus reaches the far-right Contact control and scrolls the grid969px without page overflow.
- Production build passes with the two inherited hook warnings. No saved-document write was issued during these checks. Authenticated readback is recorded separately.

Evidence: `evidence/b15-overnight/grid/`. Screenshots show the fictional ordinary fixture only; this does not claim all schedules, physical touch, or complete visual parity. Print styles were excluded from the sizing correction and actual PDF verification is a separate pass.
