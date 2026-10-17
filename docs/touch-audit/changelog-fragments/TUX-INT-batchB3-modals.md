# TUX integration, batch B3 (modals, TUX-041)

## CHANGELOG
- On touch every interactive target in every modal has a hit area of at least 44 x 44 CSS px. This covers Export, Help, Document Setup, the colour picker, Save Preset, the info sheet and the confirm sheets. Gate: body.touch-ui. Desktop is unchanged.
- Buttons, selects, text fields, steppers, help tabs and the preview buttons get a real 44 px box. Info buttons, toggles and the legend gear keep their small visual and get a centred 44 px ::before. The row that holds one is 44 px tall, so no extension reaches a neighbour.
- Document Setup: the Margin Line Gap field takes a whole row on touch. Its slider was 26 px wide (a thumb with no track).
- Help: the tab strip wraps instead of clipping, and the close target keeps all 44 px.
- Touch-audit rescue (Q15): a row cut by its own scroller is probed at three scroll rests (centre, lower third, upper third) and keeps the best result. An open popup that covers the centre rest no longer hides a real 44 px target. This clears the generator-picker info button cell (iPadL and iPhP, both engines).

## plans.md line
- [x] TUX-041 batch B3 (modals): `targets-modals.spec.js` green on 11 touch projects. Modal and colour-picker cells: under44 265 -> 22, under24 73 -> 0 (the 22 left are tool-rail buttons part-covered by the Document Setup drawer on iPadL, not modal targets). All 11 projects: under44 689 -> 446, under24 82 -> 9.

## Notes
- TUX-WAIVER: `reachable` falls in modal-export (iPadP 25 -> 22, iPadL 25 -> 20, coarse-wide 25 -> 24, iPhP 20 -> 18, both engines) and modal-document-setup (iPadL 57 -> 56, both engines). The 44 px rows push controls below the fold of the scrolling modal body. They are still reachable by scrolling (item lists before and after differ only by `on ok` -> `off offscreen`).
- The generator-picker info button was never a CSS defect. Its 44 px ::before is intact (a scrolled-to info button measures 45 x 44 with the picker closed; the spec asserts it). In that state the button sits at the bottom edge of the pane, so only 18 px of its target is on screen, and the old centre-only rescue scrolled it under the open picker. The generator-picker cells are back at their baseline (iPadL 8, iPhP 10).
- Out of scope, left for B4: `#gm-module-menu .lvl-algo-sub-item` (49 x 34) and `#btn-randomize-params` in the generator-picker cell.
- The honest section 1.5 canvas shares are unchanged (no layout change outside modals).
