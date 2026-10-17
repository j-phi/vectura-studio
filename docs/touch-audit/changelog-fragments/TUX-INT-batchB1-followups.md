# TUX integration, B1 follow-ups (review of R3b and B1)

## CHANGELOG
- Touch audit: canvasPct of the open-menu states (menu-*) is recorded but no longer ratcheted (Q21).
- Touch audit: the Q15 scroll-cut rescue measures the effective hit size (own box plus ::before/::after expansion), not the bare box.
- Bottom-pane spec: on touch-wide the collapsed toggle must sit inside the status strip (left and right edges). TUX-051 requirement 2 cites Q18.

## plans.md line
- [x] B1 follow-ups: 17 iPhone-landscape and 2 iPadL bottom-pane-open canvasPct cells re-baselined (honest metric); Q21 menu canvasPct record-only; Q15 effective hit size.

## Notes
- Re-baseline proof (reviewer): at commit 6f768ae2 the old audit core passes all 56 iPhL tests with values identical to 36c9509d. The new core fails 17. The drop comes only from the honest metric excluding the phone status strip (iPhL default 66.7 -> 62.7). iPadL bottom-pane-open 39.2 -> 38.1 is the metric plus 0.3 pp from the Q18 header (measured 37.8 at 0eded2f1).
- Section 1.5 still holds: iPhL 62.7 >= 60, chrome 54.7 >= 50.
- Coarse-wide scene3d `.vs3-tree-addbtn` (48 x 25 when scrolled into view) stays a real sub-44 target for batch B5.
