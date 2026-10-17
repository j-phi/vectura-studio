# TUX integration, batch B1 (header and header menus, Q18)

## CHANGELOG
- Tablet and touch-wide header band is 44 px (was 38). Every header control has a 44 x 44 hit area on touch: the six menu triggers and the theme toggle (invisible ::before expansion), the pane openers (real 44 px box).
- Header menu items are 44 px tall on tablet and touch-wide. A menu taller than the screen scrolls. The panel hangs flush under the band.
- Welcome "take the tour" button is 44 px tall. Its gradient wrap is no longer a second target.
- Touch-wide only: collapsed formula row 36 px (was 40) and status strip 18 px (was 22). iPad landscape with both panes collapsed measures 75.4 % honest canvas share.
- Desktop and phone layouts are unchanged.

## plans.md line
- [x] TUX-041 batch B1 (header + header menus + welcome CTA): `targets-header.spec.js` green on 11 touch projects; Q18 to Q20 recorded.

## Notes
- TUX-WAIVER (baseline cells, all inherent to the 44 px sizes): (1) `canvasPct` of menu-* states on iPadP, iPadL and coarseWide falls 1.1 to 4.8 pp (taller open menu covers more canvas; default states move under 1 pp); (2) `reachable` falls by 1 in states that show the welcome pane (the gradient wrap no longer counts as a second target) and by up to 6 in menu-* states (a taller menu covers more tool-rail centres); (3) `under24` 1 -> 2 on touch-wide generator-picker, layer-selected-handles, right-pane-layers (a 6 px taller header moves a left-pane `.info-btn` onto the pane's bottom clip edge) and 1 -> 5 on coarse-wide scene3d-panel (scroll-position artefact, same family).
- Pre-existing red on HEAD 6f768ae2, NOT touched here: iPhone landscape canvasPct (11 cells per engine, baseline stale since the honest metric), iPadL bottom-pane-open canvasPct 39.2 -> 38.1, iPadL menu-file under44 20 -> 21.
- Q19 (52 px ctxbar) belongs to batch B2. Q20 needs no work here.
