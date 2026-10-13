# TUX integration, batch R3b (honest iPad landscape canvas share, Q17)

## CHANGELOG
- Touch-audit canvasPct now excludes every area under a pointer-events:none overlay that is 50 % opaque or more (own background alpha times the opacity chain). The status strip on touch-wide is such an overlay.
- iPad landscape and coarse-wide: the collapsed formula row is 40 px (the 44 px chevron overhangs it by 4 px into the strip, so its hit area stays 44 px) and the status strip is 22 px. Both panes collapsed on iPad landscape: 74.5 % (honest metric, before) -> 75.3 %.

## plans.md line
- [x] TUX-058 / TUX-008 batch R3b (Q17): iPad landscape canvas share meets section 1.5 on the honest metric.

## Notes
- TUX-WAIVER-CORRECTION (supersedes the reason in TUX-INT-batchR3-ipadl-share.md and in commit 7ea48df6): the iPadL menu-edit under44 19 -> 20 and reachable 43 -> 44 change is NOT a menu item that the old status strip covered. The new item is `#tool-bar [data-tool="direct"]`. The tool rail moved down 14 px, and the open Edit menu now leaves 35 px of that button uncovered (Q14), so the audit measures it. Do not rewrite history; this note is the correction.
- Pending decision for Jay: a 44 px tablet header (now 38 px) takes the iPad landscape share to 74.6 %. A 36 px row or an 18 px strip brings it back to 75.1 % or 75.0 %.
