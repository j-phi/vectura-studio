# iPad 11-inch touch audit: Vectura Studio v1.4.5

**Scope:** finger-only use on an 11-inch iPad. No Apple Pencil, no hardware keyboard, no trackpad.
**Date:** 2026-10-02.
**Build:** `main` @ e609338c (v1.4.5), served by `node scripts/dev-server.js 8411`.
**Method:** Playwright Chromium with iPad emulation: `isMobile:true`, `hasTouch:true`, DPR 2, and an iPad Safari 18 user agent. The audit used these viewports:

- iPad Pro 11" (M4): 834×1210 portrait and 1210×834 landscape.
- iPad Air 11": 820×1180 and 1180×820 (spot-check).

Taps use `page.touchscreen.tap`. Drags, holds, pinches and two-finger pans use CDP `Input.dispatchTouchEvent`. The audit used no mouse events.
**Evidence:** `docs/touch-audit/evidence/ipad/*.png`, captured at 2× DPR, so pixel coordinates are 2× the CSS px values.

The app was **read-only** during the audit. The audit changed no tracked files.

## Layout context (measured)

| Viewport | Body class | Panes on load | Canvas visible | Tool rail |
|---|---|---|---|---|
| 834×1210 portrait | `mobile-layout` (<900 px) | Left 290 px and right 258 px, both **open as overlays** | 286 px wide strip (≈37 %) | Horizontal, 3 wrapped rows, 204 px tall |
| 1210×834 landscape | desktop | Left 290 and right 258, docked | 650×727 | Floating vertical rail, 34 px buttons |
| 820×1180 / 1180×820 (Air) | same as Pro | same | same | same; every result below reproduces |

`(pointer: coarse)` and `(hover: none)` both match. The touch modifier bar (SHIFT/ALT/CMD/CTRL/PAN) shows in both orientations.

## Severity counts

| Severity | Count |
|---|---|
| Blocker (finger cannot do the task) | 2 |
| Major (possible, but painful or error-prone) | 17 |
| Minor (polish) | 8 |
| **Total** | **27** |

---

## Blockers

### IPAD-001: Text cannot be typed or edited without a hardware keyboard
- **Surface:** Type tool (T) on the canvas, and the Text layer panel. **Orientation:** both.
- **Steps:**
  1. Tap the Type tool.
  2. Tap the canvas.
  3. Try to type.
- **Observed:** A text layer is created and a caret is drawn. After the tap, `document.activeElement` is the tool `BUTTON`, so no editable element has focus. `src/ui/text-edit-controller.js:773` captures keystrokes only through `window.addEventListener('keydown', …)`. iPadOS shows the on-screen keyboard only when an editable element has focus, so no keyboard appears. Double-tapping an existing text layer also leaves focus on `CANVAS`. The Text panel has no text-content field: it has 14 inputs (font, size, metrics) and no `<textarea>` for the string.
- **Expected:** Tapping with the Type tool focuses a hidden `<textarea>`/`contenteditable` (with `inputmode="text"`) so that the soft keyboard opens. Alternatively, the Text panel offers a multi-line "Text" field.
- **Evidence:** `26-type-tool-landscape.png`, `27-text-layer-panel-landscape.png`, `28-text-double-tap-landscape.png`. Playwright `keyboard.type` works only because it injects key events directly.

### IPAD-002: The layer context menu (right-click only) has commands that exist nowhere else
- **Surface:** Layers panel and canvas. **Orientation:** both.
- **Steps:**
  1. Long-press (900 ms) a layer card.
  2. Long-press a selected object on the canvas.
- **Observed:**
  - The layer long-press starts the hold-to-reorder drag (`layers-panel.js:317`). The canvas long-press starts hold-to-move. Neither opens a menu.
  - Both menus listen only for `contextmenu` (`layer-context-menu.js:397`, `canvas-context-menu.js:467`). The audit found no `contextmenu` element after either long-press.
  - **"Convert to Scene"** (Polyhedron/Topoform → Scene 3D, `layer-context-menu.js:169`) is defined only in this menu, so finger users cannot reach it.
  - Rename, Duplicate, Delete, Hide, Lock, Expand Fill and scene adds have other entry points.
- **Expected:** A long-press (≈500 ms without movement) or a visible "⋯" button on each card opens the same menu. Hold-to-drag starts only after movement.
- **Evidence:** `18-layer-long-press-landscape.png`, `09-long-press-canvas-landscape.png`.

---

## Major

### IPAD-003: On load in portrait, both side panes cover most of the canvas and hide primary tools
- **Surface:** App shell. **Orientation:** portrait (also after a rotation from landscape).
- **Steps:**
  1. Open the app at 834×1210, or rotate a landscape session to portrait.
- **Observed:**
  - Left pane (0–290 px) and right pane (576–834 px) overlay the canvas. An elementFromPoint grid shows 24 of 64 sample points on the canvas.
  - **Selection (V), Direct Selection (A) and Fill tools sit under the panes.** elementFromPoint at their centers returns `#left-pane`/`#right-pane`.
  - The context bar's drag handle and "⋯ More options" are also covered.
  - Opening one pane closes the other (good). But the defaults never auto-collapse between 640 and 900 px (`workspace.js:73–76`, `shouldAuto = width < 640`).
  - The only way out is two 28×28 px chevrons (`#btn-pane-toggle-left/right`).
- **Expected:** Below 900 px on touch, start with the panes collapsed (drawer pattern with a backdrop), or dock only one pane.
- **Evidence:** `01-initial-portrait.png`, `21-portrait-with-layer.png`, `37-rotate-to-portrait.png`; after a manual collapse: `22-portrait-panes-closed.png`.

### IPAD-004: Tapping where a hidden layer action button sits deletes that layer
- **Surface:** Layers panel. **Orientation:** both.
- **Steps:**
  1. Have 2 or more layers.
  2. Tap the right end of the lower row of a card that is **not** active.
- **Observed:**
  - `.lvl-acts` has `opacity:0` until `:hover` or `.is-active` (`components.css:7708–7709`), but `pointer-events` stays `auto`.
  - A tap at the invisible 36×36 `.lvl-ab.del` deleted "Spiral" at once, with no confirmation (3 layers → 2).
  - Expand-into-group, Duplicate and Mask buttons are invisible and live in the same way.
  - `.lvl-grp-acts` (group headers, `:7757`) behaves the same way.
- **Expected:** Under `(hover:none)`, either always show the actions or set `pointer-events:none` while hidden. Delete should be undoable with a toast offering "Undo". Undo through Edit › Undo does restore the layer.
- **Evidence:** `20-invisible-delete-tap-landscape.png` (shows 2 remaining cards), `16-layers-panel-landscape.png` (inactive cards show no actions).

### IPAD-005: Resize handles are 10 px hit circles; a near miss rotates the object
- **Surface:** Canvas selection box (Selection tool). **Orientation:** both.
- **Steps:**
  1. Select an object.
  2. Drag from a point 14 px diagonally outside the SE corner handle.
- **Observed:** `renderer.js:15050 hitHandle()` uses `RESIZE_R = 10` and `ROTATE_R = 28` in screen px for every pointer type. The off-by-14 px drag **rotated** the layer by −0.98° and did not resize it. A drag that starts exactly on the corner resizes correctly. The drawn handles are 6/scale px squares (`:14280`), about 6 CSS px.
- **Expected:** For `pointerType==='touch'`, use a resize radius of ≥22 px and grow the drawn handles. Keep rotation outside the enlarged resize zone. Consider a dedicated rotate handle.
- **Evidence:** `06-selected-layer-landscape.png`, `07-after-resize-landscape.png`.

### IPAD-006: Moving an object needs a hidden 350 ms "hold to lift"; a quick drag pans the view
- **Surface:** Canvas (Selection tool). **Orientation:** both.
- **Steps:**
  1. Select a layer.
  2. Drag it immediately with one finger.
- **Observed:** The view panned (offset +64,+32) and the layer did not move (`renderer.js:7208–7230`, `:7356–7362`). Holding 450 ms and then dragging moved it (posX 0→38). No visual "lifted" state appears. Lift feedback relies on `navigator.vibrate`, which iOS Safari does not have. The status bar teaches "Click the object to select | Shift+Click … | Option+Drag …".
- **Expected:** Give a visible lift cue (scale/shadow on the bounds, or a ring that fills during the hold). Document the gesture in Help and in the touch status hints. Consider starting a direct drag when the touch begins on a stroke of an already selected object.
- **Evidence:** `06-selected-layer-landscape.png`; logs in the audit transcript (event trace shows `isPan=true` after the first move).

### IPAD-007: The "Algorithm Layer" submenu in Add Layer opens on hover only; a tap adds the wrong type
- **Surface:** Layers panel › + Add Layer menu. **Orientation:** both.
- **Steps:**
  1. Tap **+ Add Layer**.
  2. Tap **‹ Algorithm Layer**.
- **Observed:** The submenu opens on `mouseenter` only (`shortcuts.js:607–610`). The tap also fires the `algo-parent` click, which **immediately adds the preferred default type** (an Attractor layer, with the toast "Added attractor layer"). The 2D/3D algorithm list then stays **open over the layers panel** with its parent menu closed. Picking an algorithm here needs hover.
- **Expected:** On touch, tapping the parent row drills down (as in the context-bar version at `context-bar.js:2597–2615`) and adds nothing.
- **Note:** On a real iPad, the mouseover content-change heuristic of Safari can suppress the click. Verify on a device.
- **Evidence:** `04-add-layer-landscape.png`, `05-add-layer-algo-tap-landscape.png`.

### IPAD-008: Tool sub-menus (Shape, Pen, Fill, Scissor) need press, hold and slide; release on the button closes the menu
- **Surface:** Tool rail. **Orientation:** both.
- **Steps:**
  1. Press the Shape tool for 500 ms.
  2. Slide to "Line" and release.
- **Observed:**
  - The menu opens after 280 ms (`toolbar.js:341–349`) with 28×28 px items.
  - Sliding and releasing on "Line" left the tool as `select`, not `shape-line`.
  - Hold-and-lift with no slide closes the menu at once, because `pointerup` closes it.
  - Sub-tools are reachable only through **⋯ All Tools** (34×34 icon-only items in the grid view).
  - Help says "Press and hold any toolbar button marked ▸".
- **Expected:** Hold and lift leaves the menu open as a tappable popover with ≥44 px rows and labels.
- **Evidence:** `31-shape-submenu-held-landscape.png`, `32-tool-overflow-drawer-landscape.png`.

### IPAD-009: Finishing an open Pen path needs Enter or a precise double-tap; switching tools discards the path
- **Surface:** Pen tool. **Orientation:** both.
- **Steps:**
  1. Pen tool: tap 2 or 3 anchors.
  2. Try to finish without closing the path.
- **Observed:**
  - Enter commits (`shortcuts.js:364`).
  - Double-tap commits only if both taps fall within **8 px and 400 ms** (`renderer.js:2087`). With 4 px of jitter it committed; with 12 px of jitter it did not.
  - Tapping another tool **silently discarded** a 2-anchor draft (`penDraft → null`, layer count unchanged).
  - During drawing, the context bar shows no "Done/Cancel" action.
  - Closing the path by tapping the first anchor works.
- **Expected:** Show a "Done ✓" and "Cancel" chip while `penDraft` is active, and use a touch double-tap radius of ≥24 px. Commit, do not discard, when the tool changes.
- **Evidence:** `24-pen-tool-3-anchors-landscape.png`, `25-pen-tool-close-landscape.png`.

### IPAD-010: Pinching anywhere outside the canvas zooms the whole web page
- **Surface:** Panels, menus, toolbars. **Orientation:** both.
- **Steps:**
  1. Pinch out with two fingers on the left panel.
- **Observed:** `visualViewport.scale` went from 1 to **5**, and the whole app chrome zoomed. `html` and `body` have `touch-action:auto`. The viewport meta has no scale limit, and no `gesturestart` handler exists. On the canvas only (`touch-action:none`), pinching works correctly.
- **Expected:** Set `touch-action: pan-x pan-y` on the app shell (keep `none` on the canvas) and/or `preventDefault` `gesturestart`/`gesturechange` outside the canvas. iOS ignores `user-scalable=no`.
- **Evidence:** `36-pinch-on-panel-landscape.png`.

### IPAD-011: 11 px text inputs make iOS auto-zoom on focus
- **Surface:** Every numeric value chip (`input.slider-val`, 46×30 px), the Text panel inputs, layer search (71×20 px) and preset-save name. **Orientation:** both.
- **Steps:**
  1. Tap a value chip next to any slider.
- **Observed:** The computed `font-size` is **11 px**. `components.css:8770` sets `font-size:max(16px,1em)` under `(pointer:coarse)`, but more specific skin rules override it. iOS Safari zooms the page on focus of any input below 16 px and does not zoom back out. This compounds IPAD-010.
- **Expected:** Inputs at ≥16 px on coarse pointers, enforced with a higher-specificity, skin-scoped rule.
- **Evidence:** `14-sliders-landscape.png`. Measured values are in the transcript ("number inputs … 11px").

### IPAD-012: Hit areas are below 44 pt across the app (the most common finding)
**Orientation:** both, unless noted. All sizes are CSS px. The Apple HIG minimum is 44×44.

| Element | Selector | Size |
|---|---|---|
| Top menu triggers File…Help | `#btn-menu-*` | 54–71 × **26** |
| Top menu items | `.top-menu-item` | 242 × **30** |
| Theme toggle | `#theme-toggle` | **26×26** |
| Pane collapse chevrons | `#btn-pane-toggle-left/right/bottom` | **28×28** |
| Tool rail buttons (landscape) | `.tool-btn` | **34×34**. Portrait `mobile-layout` gives 44×44 |
| Toolbar pin / home / rotate | `.toolbar-pin-btn` etc. | **13×13** |
| Toolbar drag handle | `.toolbar-drag-handle` | 34×**14** |
| Context bar buttons | `.ctxbar-btn` | h **26**; overflow 30×**22**; handle **16×26** |
| Touch modifier buttons (landscape) | `.touch-mod-btn` | 44–51 × **30** |
| Info "i" buttons | `.info-btn` | **16×16** |
| Section headers | `.left-panel-section-header` | 290 × **30** |
| Selects / dropdown triggers | `select`, `.hg-preset-trigger` | h **30** |
| Preset gallery rows | `.hg-preset-option` | 264 × **38** |
| Noise / pen reorder grips | `.noise-grip`, `.pen-grip` | **14×20** |
| Noise delete | `.noise-delete` | **26×24** |
| Add Noise | `.noise-add` | 75 × **26** |
| Layer filter / Add layer | `#layer-filter-btn`, `#btn-add-layer` | 30×30; 80 × **24** |
| Layer search field | `#layer-search-input` | 71 × **20** |
| Draw-order buttons | `.draw-order-settings` etc. | **18×18**; slider h **6** |
| Pen color swatch | `input.pen-color` | **14×14** |
| Pen remove × | `.pen-remove` | **18×18** |
| Pen weight value | `.pen-width-value` | 40×**20** |
| Modal close × | `.modal-close` | **24×24** |
| Help tabs | Help guide tab buttons | h **30** |
| Petal pop-out | `.petal-popout` | **26×26** |
| Export "Legend settings" | Export modal legend button | **22×22** |

- **Expected:** Add a `(pointer:coarse)` token layer that raises every interactive control to ≥44 px. Where visuals must stay small, extend hit areas with `::before` padding. The layers panel (`components.css:7862`) already does this.
- **Evidence:** `01-initial-landscape.png`, `16-layers-panel-landscape.png`, `34-pens-tab-landscape.png`, `30-modal-export-landscape.png`, `30-modal-help-landscape.png`.

### IPAD-013: Sliders have a 4 px track and a 14 px thumb; pen-weight sliders have a 2 px track
- **Surface:** Every `.ctrl-slider` (left panel, export, noise rack) and `.pen-width`. **Orientation:** both.
- **Observed:**
  - The input element is 194×**4** px (`components.css:412–441`).
  - A drag that starts 0, 6 or 10 px off the track centre grabbed the thumb (Chromium touch adjustment). At 16 px off, it missed.
  - A tap on the track **jumps** the value (1 → 3.6). A user who tries to scroll and lands on a track changes a parameter.
  - A vertical swipe that started on the thumb scrolled the panel and kept the value (good).
  - Pen weight slider: 90×**2** px.
- **Expected:** A ≥28 px thumb and a ≥44 px hit band on coarse pointers. Consider "tap track does not jump" on touch.
- **Evidence:** `14-sliders-landscape.png`, `35-pen-color-tap-landscape.png`.

### IPAD-014: Help, status bar and tooltips use only mouse and keyboard words
- **Surface:** Help guide (Help › Help Guide), status bar, `title` tooltips. **Orientation:** both.
- **Observed:**
  - Help Quick Start says "Double-click the canvas to generate a new layer", "Space: pan", "⌘Z / Delete / ⌘⇧E", "double-click a value to edit inline".
  - The platform toggle offers only "⌘ Mac / Ctrl Win".
  - The status bar shows "Click / Shift+Click / Option+Drag".
  - Tool names exist only as `title`, which needs hover. Touch users cannot learn the icon-only rail.
  - Help does not document the real touch gestures: hold to move, hold to reorder, two-finger pan, pinch, double-tap to finish a pen path, or the SHIFT/ALT/CMD modifier buttons.
- **Expected:** Add a "Touch" platform tab and gesture page, and use touch-aware status hints when `pointerType==='touch'`. Long-press a tool to show its name.
- **Evidence:** `30-modal-help-portrait.png`, `30-modal-help-landscape.png`.

### IPAD-015: Petal Designer anchors are about 4 px apart, in a 194×170 canvas
- **Surface:** Petalis › inline Petal Designer (Petal Visualizer). **Orientation:** both.
- **Observed:**
  - Touch drags do edit the curve; a drag at 50 %/20 % changed params.
  - The anchor dots are ≈4 px radius, and the bottom of the profile has 4 or 5 anchors within ≈20 px, so a fingertip (≈44 px) covers several of them.
  - Mode buttons are 28×28.
  - The pop-out window button is 26×26.
- **Expected:** On touch, grow the anchors and pick the nearest one in a ≥22 px radius. Default to the popped-out large designer, or allow pinch-zoom in the editor canvas.
- **Evidence:** `39-petal-inline-designer-landscape.png`, `40-petal-designer-after-drag-landscape.png`.

### IPAD-016: Layers panel in coarse mode truncates names to 3–6 characters, and action icons overflow
- **Surface:** Layers panel (258 px default width). **Orientation:** both.
- **Observed:**
  - The coarse-pointer rules (`components.css:7862–7883`) raise names to 18 px and buttons to 36–40 px, but the pane width stays the same. Names read "Spiral …", "Flowfi…", "Obj…", "Su…", "Gro…".
  - The Scene 3D group row shows no name at all.
  - Action icons on Text and Petalis cards are clipped at the right edge.
  - A 40 px leading indent is mostly unused.
- **Expected:** Widen the right pane on coarse pointers, move the actions to a swipe or "⋯" menu, or drop the type sub-row label.
- **Evidence:** `16-layers-panel-landscape.png`, `27-text-layer-panel-landscape.png`, `42-scene3d-selected-landscape.png`, `39-petal-inline-designer-landscape.png`.

### IPAD-017: The portrait tool rail wraps into 3 sparse rows and uses 17 % of the screen height
- **Surface:** Tool rail, `mobile-layout`. **Orientation:** portrait.
- **Observed:** The rail is 834×204 px. Row 1 has 9 tools, row 2 has only the Scissor/pencil tool, and row 3 has only "⋯" plus the 13 px pin/home/rotate cluster. Each row has a full-width divider that crosses the canvas area. The canvas starts at y=242.
- **Expected:** Use a single scrollable row, or a bottom dock of ≤64 px. Hide pin and rotate on touch.
- **Evidence:** `22-portrait-panes-closed.png`, `01-initial-portrait.png`.

### IPAD-018: Preset delete, revert and set-default controls appear only on hover
- **Surface:** Preset gallery dropdown (user presets). **Orientation:** both.
- **Observed:** `.hg-preset-delete` is shown only by `.hg-preset-option:hover .hg-preset-delete { display:flex }` (`components.css:3922`). Revert and set-default are 18×18 px at `opacity:.6`. On touch, the first tap selects the row and closes the list, so the user cannot reach the controls. The audit did not exercise this live: the fresh profile has no user presets. This finding comes from code.
- **Expected:** Always show the controls on `(hover:none)` with ≥44 px targets, or give the rows a swipe-to-delete or "⋯" action.
- **Evidence:** `44-preset-gallery-open-landscape.png` (factory rows, 38 px tall).

### IPAD-019: Reordering noise layers by touch failed in the test
- **Surface:** Noise Stack card grip. **Orientation:** landscape.
- **Observed:** The grips are 14×20 px and use `onmousedown` (`noise-rack-panel.js:2062`) through the touch→mouse bridge. A touch drag of grip 2 upward did not change the order. The drop point was near the top edge of the scroll pane, so the result is **inconclusive**. Even so, the target size and the need for auto-scroll across 900 px tall cards make this error-prone.
- **Expected:** A ≥44 px grip and a hold-to-lift similar to layer cards, or "Move up/down" buttons.

---

## Minor

### IPAD-020: The canvas context menu has no touch trigger
The canvas menu has Duplicate, Delete, Group, Isolate, Simplify, Smooth, Flip and Transform. All of these are also in the Object and Edit menus, so this is convenience only. Long-press is consumed by hold-to-move. (`09-long-press-canvas-landscape.png`)

### IPAD-021: Double-tap to reset a slider or edit a value inline depends on `dblclick`
In Chromium emulation, a double-tap fired one `dblclick`, but double-tapping a slider thumb did not reset it (4 → 4). This behavior is undiscoverable on touch and its iOS Safari behavior is unknown. Offer reset in a long-press or "⋯" menu. (`slider.js:215–220`, `algo-config-panel.js:308`)

### IPAD-022: Undo is two taps deep
Undo works by finger through Edit › Undo (tested: it restored a deleted layer). There is no on-screen undo/redo button and no iPadOS gesture (three-finger swipe, two-finger tap). This is risky together with IPAD-004.

### IPAD-023: Touch modifier keys stay on with little feedback
SHIFT, ALT, CMD and CTRL toggle on and stay on until the user taps them again. The only cue is the button tint in a bar that may be off-screen in portrait (the bottom bar at y=1126). The "CMD" and "CTRL" labels mean nothing to iPad users. Consider auto-release after one gesture and clearer labels ("Multi-select", "Duplicate", "Constrain"). (`10-shift-modifier-active-landscape.png`)

### IPAD-024: 3D gizmo sub-handles are small
Orbit drag works within 8 px of the centre (pad radius 17 px, ring 28 px; camera yaw changed on all tries). The yaw, pitch and roll markers are ≈4–6 px dots clustered on the 28 px ring. (`42-scene3d-selected-landscape.png`)

### IPAD-025: The modal close × is 24 px
Modals with a footer (Export has a large CLOSE) are fine. The Help guide has only the 24×24 ×, plus tapping the backdrop. (`30-modal-help-portrait.png`)

### IPAD-026: Info "i" popovers are useful but hard to hit
A tap opens a centred modal explanation (good). The 16×16 target sits next to labels, so a missed tap hits the label or the slider below. (`15-info-tap-landscape.png`)

### IPAD-027: Tapping the welcome-tour, bottom-pane and draw-order areas near panel edges can trigger them by accident
The bottom "Mathematical model" pane header (full width, about 36 px) sits just under the canvas in landscape. A tap that was meant for the canvas near its bottom edge expanded the formula pane during testing. This takes about 200 px of the canvas until the user collapses it again with a 28 px chevron. (Seen in `32-tool-overflow-drawer-landscape.png`.)

---

## Works well
- **Pinch-zoom and two-finger pan on the canvas** both work, including a staggered second finger (first finger down and moved 5 px, then the second finger joins). Scale 2.1 → 5.5 → 15.4.
- **Marquee:** a quick one-finger drag on empty canvas selected all 3 layers.
- **Tap to select and tap empty space to deselect** are reliable.
- **Hold-to-move** works once known (450 ms hold, then the drag moves the object).
- **Layer reorder:** a long-press (600 ms) and drag on a card reordered spiral/rings/flowfield correctly. Double-tap on a layer name opens the inline rename input.
- **Panel scrolling:** a vertical swipe on labels scrolls the left panel (scrollTop 0 → 560). A swipe that starts on a slider thumb scrolls and does not change the value.
- **Menus** (File/Edit/Object/View/Insert/Help) open and close by tap; tapping outside dismisses them.
- **Info buttons** open a readable, centred explanation modal (good touch pattern).
- **Export SVG modal:** large toggles, 38–60 px buttons, and a big CLOSE / EXPORT SVG footer.
- **Paint bucket:** one tap filled the tapped Rings region.
- **Pen tool:** tap to place anchors, drag for a curved anchor, and tap the first anchor to close. All work.
- **3D scene orbit** by finger drag on the gizmo pad works. The Scene panel "Add Objects" tiles are large (≈63×40 px).
- **All Tools drawer** gives touch access to every sub-tool. The layer card eye and lock buttons are 40×40 px under `(pointer:coarse)`.
- **Document Setup** opens as a left-pane mode with full-width 50 px rows.
- **iPad Air 11" (820×1180 / 1180×820)** behaves the same as the Pro 11" in every check (same breakpoints, same covered tools).
- No page errors occurred during any test run.

## Could not test in Chromium emulation (needs a real iPad with Safari)
1. **On-screen keyboard occlusion.** The landscape keyboard is ≈ 400 of 834 px. Value chips in the lower half of the left panel, and the layer search, may be covered. Safari shifts the visual viewport inside an `overflow:hidden; height:100vh` body, and the result is unknown.
2. **Safari hover emulation.** Safari's "content change on mouseover suppresses click" heuristic may change the outcome of IPAD-004 (opacity changes probably do not count) and IPAD-007 (a display change may suppress the click).
3. **`dblclick` synthesis** for double-tap in Safari (IPAD-021, layer rename, pen double-tap finish).
4. **HTML5 drag-and-drop** (`draggable`, `dataTransfer`): dragging a pen icon onto a layer (`pens-panel.js:464`), mirror rows (`mirror-panel.js:1487`), and file drop. iPadOS supports a long-press drag session that may conflict with the custom touch handlers.
5. **Native `<input type=color>`** (system colour sheet) and native `<select>` popovers.
6. **`100vh` with the Safari toolbar visible** versus collapsed, home-indicator safe area (`viewport-fit=cover` is set and safe-area rules exist), Split View / Stage Manager widths. A ½ split ≈ 597 px would switch to the phone layout.
7. **Palm rejection and accidental touches** of a resting hand, **Apple Pencil** hover and pressure (out of scope, but `pointerType:'pen'` takes the mouse path because `isTouchPointer` checks only `'touch'`).
8. **`navigator.vibrate`** is absent on iOS. The haptic for lift and reorder is confirmed missing by API surface but was not felt.
9. **File open/save** through the Files app (`showSaveFilePicker` is not supported; download fallback) and the Export SVG download flow.
10. **Rendering performance** for heavy layers during pinch on A-series/M-series GPUs.
