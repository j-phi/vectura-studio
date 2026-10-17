# TUX integration, batch B4 (side panels, TUX-041)

## CHANGELOG
- On touch every interactive target in the side panels has a hit area of at least 44 x 44 CSS px. This covers generator parameters (all 25 algorithms), the transform and align panels, the noise rack, the mirror modifier, the fill variant grid, the Text panel (all tabs), pens, the palette list, the layer filter and the shared floating menu. Gate: body.touch-ui. Desktop is unchanged.
- Buttons, summaries and text fields in the left and right panes get a real 44 px box. The info dots, switches, raw checkboxes and the draw-order icons keep their small visual and a centred 44 px ::before.
- Fill type grid: 5 cells across (was 6), 44 px tall. Text panel: fields take a whole row, steppers lie side by side. Align and Pathfinder buttons wrap to 3 across. A docked pen card under 150 px of content puts its weight slider on its own row.
- Generator picker: the list is clamped to the screen, stops above the Reset / Randomize row, and opens upward when fewer than three rows fit below the trigger.
- Formula pane: the header and toggle are 44 px when the pane is open (the pane height is fixed, so the canvas share does not change).
- Scroll cue on long modals (Export, Document Setup): UI.utils.scrollCue marks the edge that still hides controls. The cue observes content and class changes.
- Audit harness: the Q15 rescue keeps an open menu opaque when it covers the row (or its 44 px reach) where the row sits now; only a menu that covers it solely because of the rescue scroll is ignored. A modal control below the fold of its own scrolling body counts in `reachable`. The B3 `reachable` waivers on modal-export and modal-document-setup are gone (25 / 27 / 25 / 25 and 57).

## plans.md line
- [x] TUX-041 batch B4 (side panels): `targets-panels.spec.js` green on 11 touch projects. Panel cells (12 states): under44 248 -> 0, under24 0 -> 0. All 9 projects: under44 446 -> 198, under24 9 -> 9.

## Notes
- RED (iPadP, before): fill grid 12 cells 41x31, expand 97x36, pens headers 30, palette 30, Add 24, tk flip/link 26-27, text panel 30+ controls at 29-38 (scrub fields, steppers 13x15, glyph buttons, switches 30x17), mirror 8 targets at 27-38, algorithm panels (harmonograph, pendula, terrain, rings, rainfall, pattern, rasterPlane) 20-31, picker rows 34, formula toggle 28, palette menu rows 30, filter menu rows 30, align and pathfinder buttons 38-43 wide.
- TUX-WAIVER (not committed, needs a decision): `reachable` falls in generator-picker (iPadP 46 -> 44, iPadL 70 -> 68, coarse-wide 76 -> 74, iPhP 29 -> 27, iPhL 19 -> 18, both engines), fill-controls (iPadL 79 -> 78, iPhP 42 -> 41, iPhL 28 -> 27, both engines), text-panel (iPadP 36 -> 35, both engines) and right-pane-pens (iPhL 23 -> 21, both engines). 44 px rows push controls below the fold of a pane. Their baselines stay at the old values, so these 17 cells fail until a waiver is approved.
- `covered` rose in color-picker on iPhone landscape (28 -> 29, both engines). Commit 31aa7945 itself measures 31 there. See followups.md.
- Honest canvas shares are unchanged by B4 (open panes and the open formula pane only).
