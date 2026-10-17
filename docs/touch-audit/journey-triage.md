# Touch journey triage (TUX-059)

Date: 2026-10-12. Branch: `touch/integration` (with `touch/harn` merged). Harness: `tests/e2e/touch/journeys.spec.js`, `journey-defs.js`, `pages.js`, `helpers/touch.js`. Ledger: `tests/e2e/touch/journey-status.json`.

Every cell below was measured by `npm run test:e2e:touch:journeys:ledger` (PW_PORT=8600, 8 primary projects, retries 0). A FAIL cell is a confirmed PRODUCT defect. Each ledger entry names its owning TUX in `tux`; the static spec rejects an entry without one.

C = Chromium (CDP trusted touch), W = WebKit (Playwright touchscreen plus synthetic pointer events).

## 1. Corrected matrix (12 x 8)

| Journey | C iPadL | C iPadP | C iPhL | C iPhP | W iPadL | W iPadP | W iPhL | W iPhP | Pass |
|---|---|---|---|---|---|---|---|---|---|
| J1 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 8/8 |
| J2 | PASS | PASS | FAIL `j2.reorder` | PASS | PASS | PASS | FAIL `j2.reorder` | PASS | 6/8 |
| J3 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 8/8 |
| J4 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 8/8 |
| J5 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 8/8 |
| J6 | FAIL `j6.select-second` | FAIL `j6.select-second` | FAIL `j6.multi-latch` | FAIL `j6.select-second` | FAIL `j6.select-second` | FAIL `j6.select-second` | FAIL `j6.multi-latch` | FAIL `j6.select-second` | 0/8 |
| J7 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 8/8 |
| J8 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 8/8 |
| J9 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 8/8 |
| J10 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 8/8 |
| J11 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS | 8/8 |
| J12 | PASS | FAIL `j12.undo` | PASS | PASS | PASS | FAIL `j12.undo` | PASS | PASS | 6/8 |
| **Total** | | | | | | | | | **84/96** |


The previous ledger showed 37/96. Of the 44 cells that failed after the merge and the guard fix, 36 failed first on a HARNESS fault and 8 on a PRODUCT defect. Fixing the harness exposed 4 more PRODUCT cells downstream (J2 and J6 on iPhone landscape). Final count: 84 PASS, 12 PRODUCT FAIL, 0 HARNESS FAIL.

## 2. PRODUCT failures

| # | Journey | Projects | Failing step | Finger repro | Root cause | Owning TUX | Severity |
|---|---|---|---|---|---|---|---|
| P1 | J6 | C+W iPadL, C+W iPadP, C+W iPhP (6) | `j6.select-second` | Load `journey-basic`. Open Layers. Tap the Oval row name. Tap Multi in the touch modifier bar (it shows latched, with the "Multi-select" canvas badge). Tap the Spiral row name. Result: only Spiral is selected; the latch stays on. | `src/ui/panels/layers-panel.js:1065` (`_lvlDoSel`) reads only `e.metaKey`/`e.ctrlKey`/`e.shiftKey`. It never calls `Vectura.InputModifiers.readModifiers(e)`. `#layer-list` is not in `consumeSurfaces` (`src/config/touch-modifiers.js:16`), so the latch is not consumed either. | TUX-033 req 1 (also TUX-045 req 2) | High: no finger path to multi-select layers, so J6 cannot apply a mask |
| P2 | J6 | C+W iPhL (2) | `j6.multi-latch` | iPhone landscape, `journey-basic`. Open Layers (drawer). Tap Multi in the modifier bar. Result: `elementFromPoint` at the Multi button centre is `#mobile-pane-backdrop`, so a finger tap lands on the backdrop (which closes the drawer, TUX-011 req 4); no latch. | The modifier bar stacks below the drawer backdrop in the phone-landscape layout (on iPhone portrait it stays reachable). The latch cannot be set before the drawer opens, because it releases on the next gesture. | TUX-045 req 2 (with TUX-008 req 2) | High: same as P1 on iPhL |
| P3 | J12 | C+W iPadP (2) | `j12.undo` | iPad portrait, `journey-basic`. Open Layers (drawer). Delete a layer by row ⋯ > Delete. Look for Undo. Result: no Undo on screen; the HUD is hidden while the drawer is open. | Commit 18a1496d ("HUD steps aside under drawer and modal") sets the canvas HUD to `visibility:hidden` under the drawer backdrop. Tablet layout has no header Undo, so no direct Undo exists while a drawer is open. | TUX-020 req 1 ("on screen at all times"; Q5) | Medium: recovery takes 2 taps (close drawer, then Undo) |
| P4 | J2 | C+W iPhL (2) | `j2.reorder` | iPhone landscape, `journey-heavy`. Open Layers. The list is 100 px tall (one row visible; the draw-order bar takes the rest). Drag row 1's grip to the list's bottom edge and rest 1.5 s. Result: the list does not scroll (`scrollTop` stays 0) and the order does not change. | No edge auto-scroll in the layer-list reorder (`src/ui/panels/layers-panel.js:313` `_bindCardTouchDrag`). | TUX-044 req 5 | Medium: reorder impossible on iPhL past the first visible row |

### Observations (no failing cell; for the owning lanes)

- iPhone landscape: `#layer-status-bar` has 0 px height under `#draw-order-bar`. The layer count and the status-bar actions (mask button) are not visible there. J2 commits the rename by tapping the active Layers tab instead. Candidate owners: TUX-007, TUX-012.
- iPhone landscape: the font picker popover opens below its trigger and is not clamped to the viewport. When the trigger sits low in the pane, the options start at y 384 of 402. J7 passes because the finger scroll settles the trigger higher. Candidate owner: the TUX-014 popover primitive.
- iPhone landscape: the layer list is 100 px tall (one row). It works with finger scrolling, but it is tight. Candidate owner: TUX-007.

## 3. HARNESS fixes

| # | Cells (first failure) | Fault | Fix | Basis |
|---|---|---|---|---|
| H1 | false positives in the old ledger (webkit-ipad-portrait J7, J9) | `guardTarget` walked every ancestor and rejected a tap when any ancestor had computed `visibility:hidden`. Visibility inherits, and a descendant can set `visibility:visible` again. | Read the target's own computed visibility. The `elementFromPoint` hit test stays. Opacity 0 on any ancestor still rejects, because opacity composes. RED/GREEN self-test (ii-b). | CSS visibility semantics |
| H2 | J1 x8, J11 x8 at `*.algo-drill` | The selector `#lvl-algo-submenu` is the mouse-only hover fly-out. TUX-035 drills down inside `#layer-add-menu` for touch (`shortcuts.js` `enterDrill`; `add-layer.spec.js` asserts that `#lvl-algo-submenu` stays hidden). | `algoSubmenu` = `#layer-add-menu.is-drill .lvl-add-drill-list`. Rows are finger-scrolled into the drill list before the tap (3D Scene sits at y 1179 in a 610 px list). | TUX-035 req 1, 2 |
| H3 | J5 x8 at `j5.shape-menu` | `toolbar.js` `initSubtoolMenu` portals every sub-menu to `<body>`. The selector `#tool-bar .tool-submenu` never matched. | `shapeMenu` / `shapeVariant` without the `#tool-bar` ancestor. | TUX-014 |
| H4 | J2 x8 at `j2.rename-open` | CDP `Input.dispatchTouchEvent` waits for the page to handle the first tap, so the second tap was stamped 3.8 s later. No real finger does that. The WebKit fixture (`journey-heavy-webkit`) was built only to make this artifact fail. | Chromium double-tap sends hardware touch times (`timestamp`, the second tap +110 ms). WebKit times the gap from the first finger-down. Both engines load `journey-heavy`. The rename latency is recorded, not bounded: on the heavy document it measures machine load (1.9 s once), and no TUX sets a limit. | TUX-038 req 5 (`event.timeStamp`) |
| H5 | J9 C+W iPhL at `j9.select-layer`; J6 C+W iPhL at `j6.select-source` | The Spiral row sat below the fold of the 100 px layer list, under the draw-order bar. The harness tapped without scrolling. | `rowIntoView`: finger-scroll `#layer-list` first (no sticky-header inset). | finger path |
| H6 | J9 C iPhL at `j9.preset-save-open`; J1 C iPhL at `j1.slider-3` (exposed by H5/H2) | `fingerScrollInto` measured mid-fling (momentum), then a fixed 229 px drag (+fling = 300 px) overshot a 286 px pane and oscillated. | Wait until the target holds still; drag about the remaining distance. | timing |
| H7 | J2 C+W iPhL at `j2.rename-commit` | The "neutral spot" was `#layer-status-bar`, which has 0 px height on iPhL. | Tap the status bar where it has height, else the already-active Layers tab. Either tap blurs the input and commits. | finger path |
| H8 | J2 C+W iPhL at `j2.reorder` | The drop point lay outside the list, over the draw-order bar. | Drag to the list's bottom edge and rest 1.5 s for the auto-scroll. The cell still fails: that is P4. | TUX-044 req 5 |
| H9 | J11 x8 at `j11.orbit-drag` (exposed by H2) | The step expected a one-finger drag on empty canvas to orbit the camera. That is not a feature for any input: a mouse drag on touch-ipad-landscape does not orbit either, and no TUX requires it. | Step removed. J11 orbits through the gizmo (`j11.orbit-gizmo`, TUX-025). **Decision for Jay:** if an empty-canvas orbit is wanted on touch, it needs a new TUX; then restore the step. | no owning TUX |
| H10 | none (hygiene) | A debug `console.log('GEOM', ...)` was in `journey-defs.js`. | Removed. The static spec now forbids debug console output in the journey files (RED: `journey-defs.js:457 uses debug console output`). | |
| H11 | ledger | Entries had no triage. Harness failures could be pinned as expected. | Every entry needs a `tux` (owning TUX and defect). `merge-ledger.js` keeps it while the cell fails at the same step. The static spec rejects untriaged entries (RED on the previous ledger: `touch-ipad-landscape\|J1 has no tux triage`). | DoD D4 |

The `webkit-ipad-portrait|J7` and `|J9` entries were removed when the ledger was regenerated after H1. Both cells pass.
