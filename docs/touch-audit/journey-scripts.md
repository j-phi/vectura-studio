# Journey scripts J1-J12 (TUX-059)

Human-readable source of `tests/e2e/touch/journey-defs.js`. Both files carry the same step ids. `journeys-static.spec.js` fails when they differ. Change both in the same commit.

The journeys are finger-only and use the **target UX** of `docs/touch-ux-requirements.md` section 6.2. They do not use today's workarounds. A step for UI that does not exist yet fails at that step until the owning lane ships. The step-pinned ledger `tests/e2e/touch/journey-status.json` records where each cell fails.

## Conventions

- Projects: the 8 primary projects (4 devices x Chromium and WebKit = 96 cells). The `-chrome` and `touch-coarse-wide` projects run the same steps as informational measurements.
- Every journey starts with step `boot`. Postconditions of `boot`: app ready; `renderer.scale > 0`; 0 page errors; shell invariants hold; `app.maxHistory >= 30` (the runner raises the undo limit from the default 20 during setup, so the history shift never hides a delta). A fixture, when named, loads during `boot` through the File > Open deserialize path (`ui.openVecturaFile`).
- Each step has a 5 s budget. `boot` (page load, app init, fixture load) has its own 45 s budget, so a heavy fixture on a slow machine never fails `boot` and never moves a pinned failure. A step may carry its own larger budget when it measures a latency (`j2.rename-open`), and J2 runs every step with a 20 s budget because every step on a heavy document is slow by design (JRN-010); a 5 s budget there would pin cells on machine load. The postcondition is polled; nothing sleeps longer than 600 ms except a long-press.
- After EVERY step the runner asserts: the layerCount, historyLen, redoLen and selectedIds deltas in the table; `renderer.scale > 0`; `historyLen < maxHistory`; `scrollX = scrollY = 0`; `visualViewport.offsetLeft = offsetTop = 0` and `scale = 1`; `documentElement.scrollTop/Left = 0`; no `pageerror` and no `console.error` during the step.
- Every touch passes the on-screen guard first: (a) the centre lies inside the device screen from `viewports.js` (not `innerWidth`); (b) `elementFromPoint` returns the target or a descendant; (c) the target and its ancestors are visible.
- Finger actions: tap, doubleTap, longPress, drag, pinch, twoFingerPan, twoFingerTap, softType, pickOption.
- `softType` needs a focused editable element with `inputMode != none`. `pickOption` taps the select, then calls `selectOption` (the OS picker cannot be driven).

## Forbidden routes

These routes would turn a failing cell green without proving the journey. The harness does not use them.

- View > Reset View as a pane escape hatch (JRN-002).
- The PAN modifier for J4 (JRN-003).
- Edit > Undo for J4 or J12. Use the direct Undo/Redo buttons (TUX-020, Q5/Q9) or a two-finger tap.
- The All Tools drawer instead of a long-press on the tool group (J5, JRN-008).
- JS rename (J2). The rename uses a real double-tap on a heavy document (JRN-010).
- `.click()`, `.dblclick()`, locator `.tap()`, `.fill()`, `.check()`, `.hover()`, `.press()`, `.type()`, `page.mouse`, `keyboard.type`, `keyboard.press`, `dispatchEvent`, `scrollIntoView`.
- `evaluate` outside `readState`, `loadFixture` and the invariant and guard helpers.
- `.skip`, `.only`, `engineSupports` guards. A WebKit step that cannot work fails honestly.

## Required routes

J4 runs the pinch twice (first finger on empty canvas; first finger on the selected object). J2 renames on the heavy fixture. J1 asserts layerCount +1 exactly. J12 includes the invisible-button check. J11 orbits by a one-finger canvas drag as well as the gizmo. J6 applies the mask through a visible control. J7 uses the soft-keyboard route. J9 saves a named preset and sets the paper size. J10 uses the direct header Export on phones and checks that footer buttons lie on the screen.

Fixtures (`tests/fixtures/touch/`): `journey-basic.vectura` (an oval and a small spiral, no overlap), `journey-heavy.vectura` (Flowfield at 3x density plus Attractor; every layer tap blocks the main thread for 100 ms or more, which is the JRN-010 trigger). `journey-heavy-webkit.vectura` is the same document with 16x Flowfield density. The WebKit projects load it, because WebKit-desktop runs the document about 20x faster than Chromium device emulation: a layer tap blocks 40-90 ms there against 900-1800 ms, which sits under the 350 ms double-tap window and flips with machine load. With the heavier file a Flowfield tap blocks about 0.8-0.9 s in WebKit idle against the 0.46 s needed; more load only lengthens the block and the JRN-010 trigger holds in both engines.

## J1 Pick algorithm, change 3 sliders, pick a preset

Fixture: none (empty document).

| stepId | Finger action | Route (target UX) | Selector contract | Postconditions | Finding |
|---|---|---|---|---|---|
| `boot` | none | open the app | none | app ready; scale > 0; 0 page errors; invariants hold | |
| `j1.open-layers` | tap | tap the Layers drawer control (docked on touch-wide: nothing to tap) | `SELECTORS.paneToggle.right` | right pane open; no data change. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-001 |
| `j1.add-menu` | tap | Layers pane > Add Layer (+) | `SELECTORS.addLayer` | add menu visible; layers +0; history +0. layerCount +0; historyLen +0; redoLen +0; selectedIds same |  |
| `j1.algo-drill` | tap | Add Layer > Algorithm Layer drills down and adds nothing (TUX-035) | `SELECTORS.algoParent` | layers +0 (no stray default layer); submenu visible and inside the screen. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-007 |
| `j1.pick-lissajous` | tap | Algorithm submenu > lissajous | `SELECTORS.algoItem('lissajous')` | layers +1 of type lissajous; history +1; selected = the new layer. layerCount +1; historyLen +1; redoLen +0; selectedIds checked | JRN-007 |
| `j1.open-generator` | tap | tap the Generator drawer control (docked on touch-wide: nothing to tap) | `SELECTORS.paneToggle.left` | left pane open; generator trigger visible. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-001 |
| `j1.slider-1` | drag | scroll the Generator pane by finger, drag the thumb of slider 1 | `SELECTORS.slider nth(0)` | slider value moved in the dragged direction; the active layer param changed; history +1. layerCount +0; historyLen +1; redoLen +0; selectedIds same | JRN-013 |
| `j1.slider-2` | drag | scroll the Generator pane by finger, drag the thumb of slider 2 | `SELECTORS.slider nth(1)` | slider value moved in the dragged direction; the active layer param changed; history +1. layerCount +0; historyLen +1; redoLen +0; selectedIds same | JRN-013 |
| `j1.slider-3` | drag | scroll the Generator pane by finger, drag the thumb of slider 3 | `SELECTORS.slider nth(2)` | slider value moved in the dragged direction; the active layer param changed; history +1. layerCount +0; historyLen +1; redoLen +0; selectedIds same | JRN-013 |
| `j1.preset-open` | tap | Generator pane > preset dropdown | `SELECTORS.presetTrigger` | preset list visible; history +0. layerCount +0; historyLen +0; redoLen +0; selectedIds same |  |
| `j1.preset-pick` | tap | pick a preset other than the active one | `SELECTORS.presetOptionInactive` | the preset trigger names a different preset; the slider edits are replaced; history +1. layerCount +0; historyLen +1; redoLen +0; selectedIds same |  |

## J2 Add, rename (heavy document), reorder, hide/show, delete a layer

Fixture: `journey-heavy`.

| stepId | Finger action | Route (target UX) | Selector contract | Postconditions | Finding |
|---|---|---|---|---|---|
| `boot` | none | open the app, load the fixture | none | app ready; scale > 0; 0 page errors; invariants hold | |
| `j2.open-layers` | tap | tap the Layers drawer control (docked on touch-wide: nothing to tap) | `SELECTORS.paneToggle.right` | right pane open; no data change. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-001 |
| `j2.add-menu` | tap | Layers pane > Add Layer (+) | `SELECTORS.addLayer` | add menu visible; layers +0; history +0. layerCount +0; historyLen +0; redoLen +0; selectedIds same |  |
| `j2.add-empty` | tap | Add Layer > Empty Layer | `SELECTORS.addItem('layer')` | layers +1; history +1; selected = the new layer. layerCount +1; historyLen +1; redoLen +0; selectedIds checked |  |
| `j2.rename-open` | doubleTap | double-tap the name of a heavy layer (timestamp-based, TUX-038) | `SELECTORS.cardName` | rename input appears within 1500 ms of the double-tap and holds focus; layers +0. The step waits up to 6 s and measures the latency. The ledger pin is deterministic: the input is over the 1500 ms threshold, or never shows within 6 s. It is not pinned on the 5 s step budget. layerCount +0; historyLen +0; redoLen +0; selectedIds any | JRN-010 |
| `j2.rename-type` | softType | type the new name with the soft keyboard | `focused rename input` | rename input holds the typed text. layerCount +0; historyLen +0; redoLen +0; selectedIds same |  |
| `j2.rename-commit` | tap | tap a neutral spot in the pane to commit | `SELECTORS.layerStatusBar` | layer name = Renamed; history +1. layerCount +0; historyLen +1; redoLen +0; selectedIds any |  |
| `j2.reorder` | drag | drag the row grip of row 1 below row 2, no hold (TUX-044) | `SELECTORS.cardGrip` | layer order changed (same ids); history +1. layerCount +0; historyLen +1; redoLen +0; selectedIds any |  |
| `j2.hide` | tap | tap the eye of the first row | `SELECTORS.cardEye` | that layer is hidden. layerCount +0; historyLen any; redoLen +0; selectedIds any |  |
| `j2.show` | tap | tap the eye again | `SELECTORS.cardEye` | that layer is visible again. layerCount +0; historyLen any; redoLen +0; selectedIds any |  |
| `j2.delete-menu` | tap | tap the row ⋯ button (TUX-034) | `SELECTORS.cardMore` | layer menu visible; layers +0. layerCount +0; historyLen +0; redoLen +0; selectedIds any |  |
| `j2.delete` | tap | layer menu > Delete | `SELECTORS.layerMenuEntry Delete` | layers -1; history +1. layerCount -1; historyLen +1; redoLen +0; selectedIds any |  |

## J3 Select, move, scale by handle, rotate

Fixture: `journey-basic`.

| stepId | Finger action | Route (target UX) | Selector contract | Postconditions | Finding |
|---|---|---|---|---|---|
| `boot` | none | open the app, load the fixture | none | app ready; scale > 0; 0 page errors; invariants hold | |
| `j3.select-object` | tap | tap the oval on the canvas (Selection tool) | `canvas point at the object centre` | selected = [oval]; history +0. layerCount +0; historyLen +0; redoLen +0; selectedIds checked |  |
| `j3.move` | drag | quick drag on the selected object (Q4, 6 px slop, no hold) | `canvas point at the object centre` | object WORLD position moved by about the drag vector (world bounds change); renderer.offsetX/offsetY unchanged; history +1. A drag that only pans the view fails this step. layerCount +0; historyLen +1; redoLen +0; selectedIds same | JRN-003 |
| `j3.scale` | drag | drag the south-east resize handle outward | `canvas point at the SE corner` | object box wider and taller; history +1. layerCount +0; historyLen +1; redoLen +0; selectedIds same | JRN-011 |
| `j3.rotate` | drag | drag from just outside the north-east corner around the object | `canvas point outside the NE corner` | rotation param changed; history +1. layerCount +0; historyLen +1; redoLen +0; selectedIds same | JRN-011 |

## J4 Pan, pinch-zoom (empty canvas and on the object), fit to view, undo/redo

Fixture: `journey-basic`.

| stepId | Finger action | Route (target UX) | Selector contract | Postconditions | Finding |
|---|---|---|---|---|---|
| `boot` | none | open the app, load the fixture | none | app ready; scale > 0; 0 page errors; invariants hold | |
| `j4.select-object` | tap | tap the oval on the canvas (Selection tool) | `canvas point at the object centre` | selected = [oval]; history +0. layerCount +0; historyLen +0; redoLen +0; selectedIds checked |  |
| `j4.pinch-empty` | pinch | pinch with the first finger on empty canvas (JRN-003) | `canvas point on empty canvas` | scale grows; selection kept; history +0; the object params are untouched. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-003 |
| `j4.pinch-object` | pinch | pinch with the first finger on the selected object (JRN-003) | `canvas point on the object` | scale grows; selection kept; the object is not moved or resized. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-003 |
| `j4.pan` | twoFingerPan | two-finger pan on the canvas | `canvas point` | view offset changed; scale unchanged; history +0. layerCount +0; historyLen +0; redoLen +0; selectedIds same |  |
| `j4.fit` | tap | tap Fit in the canvas HUD (TUX-020, TUX-009) | `SELECTORS.hudFit` | view transform changed; scale > 0; pane states unchanged. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-002 |
| `j4.move` | drag | quick drag the selected object | `canvas point at the object centre` | object WORLD position moved; view offset unchanged; history +1. layerCount +0; historyLen +1; redoLen +0; selectedIds same |  |
| `j4.undo` | tap | tap the direct Undo button (TUX-020) | `SELECTORS.headerUndo` | history -1; redo +1; the object is back at its original world position; view offset unchanged. layerCount +0; historyLen -1; redoLen +1; selectedIds any |  |
| `j4.redo` | tap | tap the direct Redo button (TUX-020) | `SELECTORS.headerRedo` | history +1; redo -1; the object is at its moved world position again; view offset unchanged. layerCount +0; historyLen +1; redoLen -1; selectedIds any |  |

## J5 Draw a closed path, long-press the Shape group for Rectangle, edit an anchor

Fixture: none (empty document).

| stepId | Finger action | Route (target UX) | Selector contract | Postconditions | Finding |
|---|---|---|---|---|---|
| `boot` | none | open the app | none | app ready; scale > 0; 0 page errors; invariants hold | |
| `j5.canvas-ready` | tap | close any drawer that covers the canvas (same control as opening it) | `SELECTORS.paneToggle` | no open pane overlaps the canvas. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-001 |
| `j5.pen-tool` | tap | tap the Pen tool | `SELECTORS.tool('pen')` | active tool = pen. layerCount +0; historyLen +0; redoLen +0; selectedIds same |  |
| `j5.place-anchors` | tap | tap three anchor points on the canvas | `canvas points` | three anchors placed; no stray layer. layerCount +0; historyLen any; redoLen +0; selectedIds same |  |
| `j5.close-path` | tap | tap the first anchor to close the path | `canvas point at the first anchor` | layers +1; history +1. layerCount +1; historyLen +1; redoLen +0; selectedIds any |  |
| `j5.shape-menu` | longPress | long-press the Shape tool group; the variant menu stays open after the finger lifts (JRN-008) | `SELECTORS.tool('shape')` | shape variant menu visible. layerCount +0; historyLen +0; redoLen +0; selectedIds any | JRN-008 |
| `j5.shape-pick` | tap | tap Rectangle in the variant menu | `SELECTORS.shapeVariant('rect')` | active tool = a rectangle shape tool. layerCount +0; historyLen +0; redoLen +0; selectedIds any | JRN-008 |
| `j5.draw-rect` | drag | drag a rectangle on the canvas | `canvas points` | layers +1; history +1; selected = the rectangle. layerCount +1; historyLen +1; redoLen +0; selectedIds any |  |
| `j5.direct-tool` | tap | tap the Direct Selection tool | `SELECTORS.tool('direct')` | active tool = direct. layerCount +0; historyLen +0; redoLen +0; selectedIds any |  |
| `j5.drag-anchor` | drag | drag the north-west corner anchor of the rectangle | `canvas point at the NW corner` | the rectangle box changed; history +1. layerCount +0; historyLen +1; redoLen +0; selectedIds any |  |

## J6 Mirror modifier: add, change angle, apply a mask

Fixture: `journey-basic`.

| stepId | Finger action | Route (target UX) | Selector contract | Postconditions | Finding |
|---|---|---|---|---|---|
| `boot` | none | open the app, load the fixture | none | app ready; scale > 0; 0 page errors; invariants hold | |
| `j6.open-layers` | tap | tap the Layers drawer control (docked on touch-wide: nothing to tap) | `SELECTORS.paneToggle.right` | right pane open; no data change. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-001 |
| `j6.add-menu` | tap | Layers pane > Add Layer (+) | `SELECTORS.addLayer` | add menu visible; layers +0; history +0. layerCount +0; historyLen +0; redoLen +0; selectedIds same |  |
| `j6.add-mirror` | tap | Add Layer > Mirror Modifier Group | `SELECTORS.addItem('mirror')` | layers +1 (the modifier group); history +1; selected = the group. layerCount +1; historyLen +1; redoLen +0; selectedIds checked | JRN-006 |
| `j6.open-generator` | tap | tap the Generator drawer control (docked on touch-wide: nothing to tap) | `SELECTORS.paneToggle.left` | left pane open; generator trigger visible. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-001 |
| `j6.angle` | drag | drag the mirror Angle slider thumb | `SELECTORS.slider nth(0)` | angle slider value changed; history +1. layerCount +0; historyLen +1; redoLen +0; selectedIds same | JRN-013 |
| `j6.reopen-layers` | tap | tap the Layers drawer control (docked on touch-wide: nothing to tap) | `SELECTORS.paneToggle.right` | right pane open; no data change. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-001 |
| `j6.select-source` | tap | tap the oval row (mask source) | `SELECTORS.cardName` | selected = [oval]. layerCount +0; historyLen +0; redoLen +0; selectedIds checked |  |
| `j6.multi-latch` | tap | tap the Multi-select modifier (one-shot latch, TUX-045) | `SELECTORS.modifier('shift')` | the modifier shows as latched. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-016 |
| `j6.select-second` | tap | tap the spiral row | `SELECTORS.cardName` | selected = oval and spiral. layerCount +0; historyLen +0; redoLen +0; selectedIds checked |  |
| `j6.apply-mask` | tap | tap the visible mask control in the layer status bar | `SELECTORS.maskButton` | the spiral is a child of the oval; history +1. layerCount +0; historyLen +1; redoLen +0; selectedIds any | JRN-006 |

## J7 Add text, type a word with the soft keyboard, change font and size

Fixture: none (empty document).

| stepId | Finger action | Route (target UX) | Selector contract | Postconditions | Finding |
|---|---|---|---|---|---|
| `boot` | none | open the app | none | app ready; scale > 0; 0 page errors; invariants hold | |
| `j7.canvas-ready` | tap | close any drawer that covers the canvas (same control as opening it) | `SELECTORS.paneToggle` | no open pane overlaps the canvas. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-001 |
| `j7.type-tool` | tap | tap the Type tool | `SELECTORS.tool('type')` | active tool = type. layerCount +0; historyLen +0; redoLen +0; selectedIds same |  |
| `j7.tap-canvas` | tap | tap the canvas; an editable proxy takes focus so the keyboard opens (TUX-028) | `canvas point` | layers +1 (text); an editable element has focus. layerCount +1; historyLen any; redoLen +0; selectedIds any | JRN-004 |
| `j7.type-word` | softType | type "Hello" with the soft keyboard | `focused editable` | the text layer text = Hello. layerCount +0; historyLen any; redoLen +0; selectedIds any | JRN-004 |
| `j7.open-generator` | tap | tap the Generator drawer control (docked on touch-wide: nothing to tap) | `SELECTORS.paneToggle.left` | left pane open; generator trigger visible. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-001 |
| `j7.font-open` | tap | Text panel > font face | `.vtp-fontpick-trigger` | font list visible. layerCount +0; historyLen +0; redoLen +0; selectedIds same |  |
| `j7.font-pick` | tap | tap another font | `.vtp-fp-opt:not(.sel)` | font param changed; history +1. layerCount +0; historyLen +1; redoLen +0; selectedIds same |  |
| `j7.size-focus` | tap | tap the size value; the whole value is selected (TUX-042) | `[data-ref="slot-size"] input` | an editable numeric field has focus. layerCount +0; historyLen +0; redoLen +0; selectedIds same |  |
| `j7.size-type` | softType | type 72 | `focused size field` | font size param = 72; history not asserted (the field commits on blur; the commit path is not measurable until the step is reachable). layerCount +0; historyLen any; redoLen +0; selectedIds same |  |

## J8 Paint-bucket fill a closed region

Fixture: `journey-basic`.

| stepId | Finger action | Route (target UX) | Selector contract | Postconditions | Finding |
|---|---|---|---|---|---|
| `boot` | none | open the app, load the fixture | none | app ready; scale > 0; 0 page errors; invariants hold | |
| `j8.canvas-ready` | tap | close any drawer that covers the canvas (same control as opening it) | `SELECTORS.paneToggle` | no open pane overlaps the canvas. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-001 |
| `j8.fill-tool` | tap | tap the Fill tool | `SELECTORS.tool('fill')` | active tool = fill. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-005 |
| `j8.fill-tap` | tap | tap inside the oval | `canvas point at the oval centre` | a fill was committed (history +1, no stray draw). layerCount any; historyLen +1; redoLen +0; selectedIds any | JRN-005 |

## J9 Save a named preset; set the paper size in Document Setup

Fixture: `journey-basic`.

| stepId | Finger action | Route (target UX) | Selector contract | Postconditions | Finding |
|---|---|---|---|---|---|
| `boot` | none | open the app, load the fixture | none | app ready; scale > 0; 0 page errors; invariants hold | |
| `j9.select-layer` | tap | tap the spiral on the canvas side: open Layers and tap its row | `SELECTORS.cardName` | selected = [spiral]. layerCount +0; historyLen +0; redoLen +0; selectedIds checked |  |
| `j9.open-generator` | tap | tap the Generator drawer control (docked on touch-wide: nothing to tap) | `SELECTORS.paneToggle.left` | left pane open; generator trigger visible. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-001 |
| `j9.preset-save-open` | tap | Generator pane > save preset | `SELECTORS.presetSavePip` | the save-preset sheet opens. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-014 |
| `j9.preset-name` | softType | tap the name field and type with the soft keyboard | `#preset-save-name` | the name field contains the typed text. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-014 |
| `j9.preset-confirm` | tap | tap Save in the sheet | `#modal-overlay Save button` | the sheet closes; the preset list names the new preset. layerCount +0; historyLen any; redoLen +0; selectedIds same |  |
| `j9.menu-file` | tap | File menu (phones: ☰ > File) | `SELECTORS.menuTrigger('file') \| SELECTORS.hamburger` | File menu panel open. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-006 |
| `j9.doc-setup` | tap | File > Document Setup | `SELECTORS.btnSettings` | Document Setup panel visible. layerCount +0; historyLen +0; redoLen +0; selectedIds same |  |
| `j9.paper-section` | tap | tap the Paper section header only when `aria-expanded` is not true | `#settings-panel .sect-hdr Paper` | Paper section expanded (aria-expanded true); the Size select is the topmost element at its centre. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-019 |
| `j9.paper-size` | pickOption | tap the Size select and choose A4 | `#machine-profile` | document paper size = a4. layerCount +0; historyLen any; redoLen +0; selectedIds same |  |

## J10 Export SVG; save the .vectura project

Fixture: `journey-basic`.

| stepId | Finger action | Route (target UX) | Selector contract | Postconditions | Finding |
|---|---|---|---|---|---|
| `boot` | none | open the app, load the fixture | none | app ready; scale > 0; 0 page errors; invariants hold | |
| `j10.export-open` | tap | phones: direct header Export; tablets: File > Export SVG | `SELECTORS.headerExport \| SELECTORS.btnExport` | the Export SVG modal is open. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-006 |
| `j10.export-download` | tap | tap Export SVG in the modal footer (it must lie on the screen) | `SELECTORS.exportSubmit` | an .svg download starts. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-006 |
| `j10.export-close` | tap | tap Close in the modal footer | `SELECTORS.exportCancel` | the modal closes. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-006 |
| `j10.menu-file` | tap | File menu (phones: ☰ > File) | `SELECTORS.menuTrigger('file') \| SELECTORS.hamburger` | File menu panel open. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-006 |
| `j10.save-vectura` | tap | File > Save .vectura | `SELECTORS.btnSaveVectura` | a .vectura download starts. layerCount +0; historyLen +0; redoLen +0; selectedIds same |  |

## J11 3D scene: insert, orbit the camera with one finger on the canvas

Fixture: none (empty document).

| stepId | Finger action | Route (target UX) | Selector contract | Postconditions | Finding |
|---|---|---|---|---|---|
| `boot` | none | open the app | none | app ready; scale > 0; 0 page errors; invariants hold | |
| `j11.open-layers` | tap | tap the Layers drawer control (docked on touch-wide: nothing to tap) | `SELECTORS.paneToggle.right` | right pane open; no data change. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-001 |
| `j11.add-menu` | tap | Layers pane > Add Layer (+) | `SELECTORS.addLayer` | add menu visible; layers +0; history +0. layerCount +0; historyLen +0; redoLen +0; selectedIds same |  |
| `j11.algo-drill` | tap | Add Layer > Algorithm Layer drills down and adds nothing (TUX-035) | `SELECTORS.algoParent` | layers +0 (no stray default layer); submenu visible and inside the screen. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-007 |
| `j11.pick-scene3d` | tap | Algorithm submenu > 3D Scene | `SELECTORS.algoItem('scene3d')` | one new root layer of type scene3d; history +1; selected = the scene. layerCount any; historyLen +1; redoLen +0; selectedIds any | JRN-007 |
| `j11.canvas-ready` | tap | close any drawer that covers the canvas (same control as opening it) | `SELECTORS.paneToggle` | no open pane overlaps the canvas. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-001 |
| `j11.orbit-gizmo` | drag | drag the orbit gizmo centre | `canvas point at the gizmo centre` | scene camera yaw or pitch changed; history +1. layerCount +0; historyLen +1; redoLen +0; selectedIds any | JRN-011 |
| `j11.orbit-drag` | drag | one-finger drag on empty canvas orbits the camera | `canvas point away from the scene` | scene camera yaw or pitch changed; history +1. layerCount +0; historyLen +1; redoLen +0; selectedIds any | JRN-011 |

## J12 Recover from a mistake: hidden actions are inert, delete, undo, redo, two-finger undo

Fixture: `journey-basic`.

| stepId | Finger action | Route (target UX) | Selector contract | Postconditions | Finding |
|---|---|---|---|---|---|
| `boot` | none | open the app, load the fixture | none | app ready; scale > 0; 0 page errors; invariants hold | |
| `j12.open-layers` | tap | tap the Layers drawer control (docked on touch-wide: nothing to tap) | `SELECTORS.paneToggle.right` | right pane open; no data change. layerCount +0; historyLen +0; redoLen +0; selectedIds same | JRN-001 |
| `j12.hidden-actions` | tap | tap where invisible card actions sit (JRN-009); none may exist | `readState().ghosts (opacity < 0.5, pointer events on)` | layers +0; history +0; no invisible-but-tappable button exists. layerCount +0; historyLen +0; redoLen +0; selectedIds any | JRN-009 |
| `j12.delete-menu` | tap | tap the row ⋯ button | `SELECTORS.cardMore` | layer menu visible. layerCount +0; historyLen +0; redoLen +0; selectedIds any |  |
| `j12.delete` | tap | layer menu > Delete | `SELECTORS.layerMenuEntry Delete` | layers -1; history +1. layerCount -1; historyLen +1; redoLen +0; selectedIds any |  |
| `j12.undo` | tap | tap the direct Undo button (TUX-020) | `SELECTORS.headerUndo` | layers +1 (restored); history -1; redo +1. layerCount +1; historyLen -1; redoLen +1; selectedIds any | JRN-017 |
| `j12.redo` | tap | tap the direct Redo button (TUX-020) | `SELECTORS.headerRedo` | layers -1; history +1; redo -1. layerCount -1; historyLen +1; redoLen -1; selectedIds any | JRN-017 |
| `j12.undo-gesture` | twoFingerTap | two-finger tap on the canvas undoes once (Q9, TUX-020) | `canvas point` | layers +1; history -1; redo +1; scale unchanged. layerCount +1; historyLen -1; redoLen +1; selectedIds any | JRN-017 |
