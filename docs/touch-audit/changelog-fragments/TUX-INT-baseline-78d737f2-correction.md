# TUX integration, correction to the 78d737f2 waiver text

## CHANGELOG
- No product change. This note corrects the waiver text of commit 78d737f2 (`target-baseline.json`, 49 insertions, 49 deletions).

## Notes
- Commit 78d737f2 names 19 cells (17 iPhone-landscape cells and 2 iPadL bottom-pane-open cells). Forty-eight cells changed. History is not rewritten; this note is the correction.
- The 19 named cells: canvasPct falls from the honest metric (waiver as written in 78d737f2).
- 14 more cells are Q15 improvements: `under44` falls by 1 in 13 cells and `under24` falls from 5 to 1 in coarse-wide scene3d-panel. They need no waiver; the numbers only improve.
- 15 more cells are record-only `menu-*` canvasPct cells on iPhP, iPadP, iPadL and coarse-wide (Q21). Each is 0.2 to 1 pp lower. The baseline records them but never ratchets them.
- 19 + 14 + 15 = 48.
- Follow-up in a8da12b6: the Q15 rescue now scrolls a clipped row into view and probes elementFromPoint, so a `::before` that a neighbour covers no longer counts. The corrected measurement raises `generator-picker` under44 by 1 on iPadL (both engines; under24 by 1 too) and on iPhP (both engines). The target is `#dynamic-controls ... button.info-btn` (16 x 16 box, true hit area 45 x 18). It is a real small target and it is NOT waived; it belongs to the TUX-041 sweep.
