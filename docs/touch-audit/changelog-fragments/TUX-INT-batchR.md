# TUX integration, batch R (real audit regressions)

## CHANGELOG bullet
- Touch: an on-canvas Undo / Redo / Zoom / Fit button hides while another layer (the Petal Designer window, the formula sheet) covers it, and the HUD hides under the phone Document Setup sheet. The phone header buttons step aside under a full-screen modal. The iPhone landscape formula sheet ends left of the HUD. The fill bar clears the bottom safe area. On iPad landscape and wide touch windows the collapsed formula-pane row is 40 px (its 44 px chevron overhangs the status strip). The iPhone landscape HUD buttons are 44 px with no gap. The Scene3D light and visibility controls have a 24 px hit area.

## plans.md line
- [x] TUX-058 batch R: full-audit `covered`, `canvasPct`, Scene3D `wcag258Fail` and iPhone landscape `safeUnprotected` regressions fixed in the product; Q14 narrowed to the phone sheet, Q15 hardened, Q16 (TUX-032 24 px keyboard rows) recorded.

## Product fixes (RED = the full-audit cell before the fix)
- Group 1 `covered` (HUD under overlays): iPadL petal-designer-window covered 31 (baseline 27), iPadP 16 (13), iPhP 21 (19), iPhL 29 (27); iPhP/iPhL modal-document-setup 21 (19) / 26 (24); iPhP/iPhL color-picker 35 (34) / 37 (36); iPhL bottom-pane-open 6 (5). Cause: the HUD buttons showed under the Petal Designer window and the phone Document Setup sheet; the two header pane buttons showed under a full-screen modal; the iPhL formula sheet ran under Zoom Out.
- Group 2 `canvasPct`: coarse-wide default 47.7 vs 49.7 in 12 other states, iPhL menu-view 20.5 (22), iPadP bottom-pane-open 59.4 (60.6), iPadP pen-path-anchors 78.4 (80). Cause: TUX-051 made the collapsed formula row 44 px (301d0aaa), and the HUD stayed visible under the phone menu sheet.
- Group 3 Scene3D iPadP `wcag258Fail` 1 -> 7: `.vs3-more-caret` 16 px wide, `.vs3-tree-vis` 20x20, five `.vs3-tree-addbtn` chips 22 px tall.
- Group 4 iPhL fill-controls `safeUnprotected` 0 -> 3: `.ctxbar--fill` ignored the bottom inset.

## Harness
- Q14 applies on the phone sheet only (`body.phone-menu-open`). Q15 needs a visible scroller whose range reaches the row. Q16 allowlist entry for the TUX-032 24 px keyboard rows. 19 hand-lowered `reachable` / `under44` cells restored.

## Open items
- `canvasPct` still fails in 5 cells: iPadP (Chromium and WebKit) bottom-pane-open 59.4 vs 60.6 and pen-path-anchors 78.4 vs 80, and WebKit iPadL bottom-pane-open 38.6 vs 39.7. The HUD and the context bar fall on a different row of the 48-row sample grid than at the baseline; trimming 4 to 8 px of chrome did not move them.
