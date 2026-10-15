# TUX integration, batch B2 (canvas context bar, Q19)

## CHANGELOG
- On touch the canvas context bar is 52 px tall. Every button, field, chip, the pen swatch and the More button has a real 44 x 44 box. Gate: body.touch-ui. Desktop is unchanged.
- The bar grip is a real 44 px box. Its ::before extender is gone, and GRIP_EXTENDER_PX is 0.
- Text-entry controls in the bar are 16 px (no iOS focus zoom). The More menu rows are 44 px and the menu scrolls on a short screen.
- On touch the bar slides left of the zoom HUD when it would sit under it (iPhone landscape with the browser chrome).

## plans.md line
- [x] TUX-041 batch B2 (context bar): `targets-ctxbar.spec.js` green on 11 touch projects. under44 1172 -> 689, under24 182 -> 82 (11 projects, darwin baseline).

## Notes
- TUX-WAIVER (inherent to the 52 px bar, Q19): canvasPct falls 1.5 to 3.5 pp in states that show the bar; `covered` +1 where the drawer backdrop covers the bar (iPadP, iPhL text-panel and the like); `reachable` -1 in iPadL menu-object.
- Honest canvas share after B2: iPadP default 77.1 (>= 70), iPadL both docked 45.6 (>= 45), iPhP 75.0, iPhL 60.7 (>= 60), iPhL chrome 53.7 (>= 50).
- UNRESOLVED: iPadL both panes collapsed 74.7 % (was 75.4; section 1.5 needs 75). `canvas-share.spec.js` "C touch-wide docks and collapses by tap" fails by 0.3 pp in both engines. The idle bar (405 x 52 px, lower centre) costs 0.72 pp. Cheapest remedy: dock the idle bar on touch-wide so it overlaps the 18 px pointer-events:none status strip, and trim the bar padding from 3 to 1 px (bar 48 px). Needs a Jay decision because it changes Q19's 52 px.
