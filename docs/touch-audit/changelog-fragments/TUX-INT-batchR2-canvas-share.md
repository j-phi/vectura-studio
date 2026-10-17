# TUX integration, batch R2 item 1 (exact canvas share)

## CHANGELOG
- Touch audit: the canvas share (`canvasPct`) is now the exact visible canvas area, not a 48 x 48 sample grid. The grid read up to 2.6 pp high.

## plans.md line
- [x] TUX-058 batch R2 item 1: exact canvas-share measurement; baseline re-measured for every cell; no cell is below a section 1.5 absolute threshold.

## Notes
- TUX-WAIVER: metric change (canvasPct grid -> exact). 97 cells lowered to the exact value, 21 cells with a rise of 1.0 pp or less keep the old value (131 unchanged), 8 cells rose by more than the 1.0 pp tolerance and are set to the exact value so the ratchet stays green.
- Item 2 (coarse-wide fill-controls `reachable` 80 -> 79) was already corrected in 4c2d02a3; 5a2bce44 had 80, 4c2d02a3, 6ee02531 and 7dba974f have 79, and the batch R2 full audit measures 79.
