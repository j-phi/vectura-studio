# TUX integration, batch R3 item 1 (canvas share: rotated, rounded, pseudo-element and overflow hit areas)

## CHANGELOG
- Touch audit: the exact canvas share now hit-tests each lattice cell at its centre and four corners, and subdivides mixed cells down to 1 px. Rotated elements, rounded corners, pseudo-element hit areas and overflowing content are counted as they are hit, not as their bounding boxes.

## plans.md line
- [x] TUX-058 batch R3 item 1: canvas share reads the true hit area; baseline re-measured (107 cells lowered by the metric change, 17 cells that rose by 0.6 pp or less keep the old value).

## Notes
- TUX-WAIVER: metric change. 107 canvasPct cells lowered by at most 0.5 pp, purely from the new measurement.
