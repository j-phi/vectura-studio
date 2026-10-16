# TUX integration, batch B5 (Scene3D, Petal Designer, Pattern designer, remainder sweep, TUX-041)

## CHANGELOG
- On touch every interactive target in the Scene3D panel (tabs, section headers, shelf, More flyout and caret, tree rows, visibility and delete toggles, add-light chips, group controls, info dots, switches), the Petal Designer (inline and pop-out) and the Pattern designer has a hit area of at least 44 x 44 CSS px. The full audit now reports 0 targets under 44 and 0 under 24 on all 9 baseline projects (was 198 and 9 after B4). Gate: body.touch-ui. Desktop is unchanged.
- Scene3D: real 44 px boxes replace the 24 px ::before extensions of Batch R. A four-option switch gets its own row. The More caret is 45 px wide and the More button takes two shelf cells. The More flyout is clamped into the screen and scrolls when taller than it.
- Petal Designer: petal profile thumbnails wrap to 44 px cells, inputs and selects are 44 px tall, the transition-lock switch keeps its look and takes a 44 px ::before. The canvas HUD steps aside while the pop-out window is open (the window covered half of the zoom buttons).
- Pattern designer: the header row and tool strip wrap, so all eight tools sit inside the pane (the last five ran past the pane edge).
- Document Setup drawer on iPad landscape and touch-wide: the tool rail rides above the drawer and the drawer keeps its right 16 px empty (the drawer had taken 5 px of every rail button).
- Generator picker: on a short screen (iPhone landscape) the scrolling list shows a scroll cue.
- Collapsed touch-wide pane chevron: it fills the 36 px rail again (B4's pane rule had grown it to 44 px, which cost the iPad landscape canvas share its margin: 74.999 %).
- Canvas selection: a finger tap within 22 px of a stroke selects it (mouse and pen keep 5 px). With several strokes in range the nearest wins (TUX-024).
- Audit harness: an open dropdown no longer steals hit-area pixels from a rail button it cuts (the size does not depend on which menu is open). Q22 keeps every open menu opaque while it probes a row below the fold. The unrounded exact canvas share is available (`raw: true`).

## plans.md line
- [x] TUX-041 batch B5 (Scene3D, Petal, Pattern, remainder): `targets-scene3d-petal.spec.js` green on 11 touch projects. All 9 projects: under44 198 -> 0, under24 9 -> 0. Allowlist: no new entries (2 existing).

## Notes
- RED (iPadP, before): Scene3D tabs 88x35, section headers 97x31, More caret 25x50, Ground toggle 24x25, add-light chips 48-72 x 24-25, boolean group button 89x25, seg-opt 42-97 x 31, tog-btn 30-54 x 31, info dots 14x15, switch 44x36, object name input 97x31; Petal profile side switch 63x29, 8 shape thumbs 35-43 x 74, accordion summaries 97x31-41, numeric inputs 47x24, transition lock switch 30x16, selects 97x37-42; Pattern tools 5 of 7 off the pane edge; Petal pop-out zoom-in 31x46 (HUD half covered); rail buttons 32-40 x 44 under open menus and 39 x 44 under the Document Setup drawer (iPad landscape, 11 cells per engine).
- Audit: 22 cells under44 went 198 -> 0 and 9 under24 -> 0. `reachable` rose in the Scene3D, Petal and Pattern cells (more targets are 44 px) and fell in cells where the Q22 correction applies (see below); nothing else worsened.
- Q22 correction (review of a6d18020): the probe checked menu overlap against the pre-scroll rect of a below-fold row, which is off screen, so every open menu was transparent. It counted 114 rows on iPhone landscape generator-picker; 53 stay reachable when the menu is opaque (the other 61 lie under the open list). By finger no pane row is reachable while the picker is open. `reachable` cells that fall for this reason are a correction, not a regression.
- Followups closed: the B3 (a) rail under the Document Setup drawer, the B4 Pattern toolbar item, the B4 "generator picker scroll cue" review item, the iPad landscape unrounded canvas share.
