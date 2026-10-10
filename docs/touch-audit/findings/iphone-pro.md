# iPhone Pro finger-only audit (target: "iPhone 18 Pro")

- **Date:** 2026-10-02 · **Build:** v1.4.5 (main @ e609338c, working tree)
- **Device model:** 402×874 CSS px portrait / 874×402 landscape, DPR 3, `isMobile`, `hasTouch`, iOS 26 Safari UA.
- **Extra viewports:** 402×750 (Safari portrait with browser chrome), 874×330 (Safari landscape with chrome), and safe-area overrides (portrait top 62 / bottom 34; landscape left/right 62, bottom 21) through `Emulation.setSafeAreaInsetsOverride`.
- **Harness:** Playwright Chromium (WebKit not available), own server `scripts/dev-server.js 8412`. Taps use `page.touchscreen.tap`. Drags and pinches use CDP `Input.dispatchTouchEvent`. Where a surface could not be reached by finger, I opened it with a JS `.click()` so the audit could continue. The finding says when I did this.
- **Evidence:** `docs/touch-audit/evidence/iphone/NN-*.png` (3× screenshots).
- **Severity:** Blocker = impossible by finger · Major = painful or error-prone · Minor = polish.

## Summary

| Severity | Count |
|---|---|
| Blocker | 7 |
| Major | 19 |
| Minor | 10 |
| **Total** | **36** |

**Root cause to fix first (IPH-001).** In portrait the top menubar is 544 px wide on a 402 px screen. Chromium then inflates the layout viewport to 544×1183 (`innerWidth` 544, `innerHeight` 1183, `documentElement.clientWidth` 402). Several other findings follow from this: menus off-screen, `phone-layout` class never set (because `innerWidth` ≥ 540), modals sized and centred for 544×1183, and the shell scrolling away. A control run with `#app-header{overflow:hidden;max-width:100vw}` injected gave back `innerWidth` 402 / `innerHeight` 874 and the `phone-layout` class. It also moved the Export button on screen (y 964 → 809). See `42-control-header-clipped-export.png`. Real iOS Safari handles overflowing layout differently from Chromium. The overflow itself is certain, but confirm how iOS shows the symptoms (see the last section).

---

## Blockers

### IPH-001 — Top menubar overflows the viewport; Insert and Help menus unreachable
- **Surface:** `#app-header` / `#top-menubar` · **Orientation:** portrait
- **Repro:** Load the app at 402×874. Try to open Insert or Help.
- **Observed:** `#app-header` scrollWidth 544 vs. 402 viewport. Triggers: File 169–223, Edit 224–281, Object 282–353, View 354–415, **Insert 416–483, Help 484–544 (off-screen)**. A tap at x=400 opens nothing for Insert or Help (`aria-expanded=false`). The View panel opens at x=354 with width 244, so only 48 px of it shows (`05-portrait-menu-view.png`). Edit and Object panels are cut off on the right, including the shortcut column (`05-portrait-menu-edit.png`). The theme toggle `#theme-toggle` (26×26 at 362,6) sits on top of the "View" label. Knock-on effects: `innerWidth` is 544, so `body.phone-layout` is never applied (threshold < 540). The only way to reach Insert or Help is to swipe the whole shell sideways (IPH-004).
- **Expected:** All menus reachable inside 402 px. Collapse them into one "☰" or overflow menu on phones, and keep the header ≤ 100vw.
- **Evidence:** `01-portrait-initial.png`, `05-portrait-menu-*.png`, `24-portrait-header-swipe.png`, `42-control-header-clipped-export.png`

### IPH-002 — Generator and Layers drawers cannot be opened by finger in portrait
- **Surface:** `.pane-left` / `.pane-right` slide-over drawers · **Orientation:** portrait (< 640 px)
- **Repro:** Tap the `›` / `‹` pane toggles in the top corners. Tap the 40 px grey side slivers. Edge-swipe from x=2.
- **Observed:** `#btn-pane-toggle-left` (28×28 @ 4,42) and `#btn-pane-toggle-right` (28×28 @ 371,42) are covered by `#tool-bar` (`elementFromPoint` → `.toolbar-drag-handle`). The toolbar has `z-index:60` in `body.mobile-layout.auto-collapsed`, which is above the panes at 55. `.mobile-pane-handle` buttons are `display:none`. Taps on the sliver and an edge swipe do nothing (pane width stays 40). The context task bar, which carries "Add Layer" and "Document Setup", is `display:none` at ≤ 640 px. Result: no finger path to algorithm parameters, the layer list, Add Layer, Pens, or the Text panel. A user can create layers only through the Draw-Algorithm / Type / Pen tools, and cannot then edit them.
- **Expected:** Visible 44 pt drawer handles (for example in the bottom bar), or a tab bar with Generator / Canvas / Layers. The toggles must sit above the toolbar.
- **Evidence:** `03-portrait-tap-left-toggle.png`, `03b-portrait-tap-left-sliver.png`, `06-portrait-layers-drawer-forced.png` (opened with JS)

### IPH-003 — Export SVG dialog: Export button and close button are off-screen
- **Surface:** File → Export SVG (`.modal-card--export`) · **Orientation:** portrait
- **Repro:** File → Export SVG… (real taps). Try to export or close.
- **Observed:** The card is at 87,171 and measures 370×842, inside a 544×1183 overlay. **"Export SVG" button at (346, 964)**, which is below the 874 px screen and partly past x=402. `.modal-close` is at x=414, which is off-screen. The card has `overflow:hidden`, and only `.export-settings-scroll` scrolls (348/451), so a swipe never brings the button into view. A tap on the backdrop does not close it. Help (`.modal-card--help`, 512 px wide, close × at x=487) and the info dialog (512 px wide) have the same problem.
- **Expected:** Full-screen sheet on phones. Pin the primary action and close button in a sticky header or footer inside the safe area.
- **Evidence:** `31-portrait-modal-btn-export.png`, `32-portrait-export-scrolled.png`, `31-portrait-modal-btn-help.png`, `23-portrait-info-tap.png`

### IPH-004 — The whole app shell scrolls or pans away under a swipe
- **Surface:** document / visual viewport · **Orientation:** portrait
- **Repro:** Swipe up on the toolbar (200,270 → 200,50) or on the modifier bar. Or swipe sideways on the header.
- **Observed:** `visualViewport.offsetTop` goes 0 → 299 → 309. Header and toolbar leave the screen, and a 309 px empty grey band shows below the modifier bar. A sideways swipe on the header sets `offsetLeft` to 142, leaving a dead grey column on the right. A pull-down that starts on the canvas cannot recover it, because the canvas has `touch-action:none`. A hold-drag on a layer row also scrolled the shell by ~74 px, so the Pens tab then sat off-screen (`39-portrait-pens-tab.png`).
- **Expected:** A fixed app shell that never scrolls: `position:fixed; inset:0` or `overscroll-behavior:none` on html/body, with no element wider than the viewport.
- **Evidence:** `41-portrait-shell-scrolled.png`, `24-portrait-header-swipe.png`, `39-portrait-pens-tab.png`

### IPH-005 — Landscape: canvas is 44 px tall (0 px with Safari chrome)
- **Surface:** workspace layout · **Orientation:** landscape
- **Repro:** Load at 874×402.
- **Observed:** Width 874 is in the 640–900 "tablet" band, so both panes open by default (left 290, right 258). The toolbar wraps to **204 px** high. `#viewport-container` is **874×44** (`01-landscape-initial.png`). At 874×330 (Safari chrome showing) it is **0 px**. With the safe-area insets it is 23 px. Collapsing both panes does not help (still 44 px). The only fix is the 13×13 px "Rotate toolbar orientation" button, which turns the toolbar into a floating strip and gives 248 px of canvas, partly covered by the strip (`28-landscape-toolbar-rotated.png`).
- **Expected:** Treat a short height (≤ 500 px) as phone. Use a single-row or side-rail toolbar, collapse the panes, and keep at least ~60 % of the height for the canvas.
- **Evidence:** `01-landscape-initial.png`, `26-landscape-panes-collapsed.png`, `27-landscape-layer.png`, `28-landscape-toolbar-rotated.png`, `29-landscape-safari-chrome.png`

### IPH-006 — Type tool: the soft keyboard never opens
- **Surface:** Type tool (T) on canvas · **Orientation:** both
- **Repro:** Tap the Type tool, then tap the canvas.
- **Observed:** A text layer is created, but `document.activeElement` stays the toolbar `BUTTON.tool-btn`. No input, textarea or contenteditable takes focus, and keystrokes are read from document `keydown`. Playwright's synthetic `keyboard.type('Hi')` worked (`34-portrait-type-typed.png`), but on an iPhone with no hardware keyboard nothing opens the keyboard. The Text-panel text field is the only other way in, and it sits in the drawer that IPH-002 makes unreachable.
- **Expected:** Focus a real (visually hidden) `<textarea>` with `font-size ≥ 16px` on canvas text entry. Keep the caret above the keyboard by watching `visualViewport` resize.
- **Evidence:** `33-portrait-type-tool-tap.png`, `34-portrait-type-typed.png`

### IPH-007 — Pinch-zoom and two-finger pan fail when the first finger lands on empty canvas
- **Surface:** canvas, Select tool · **Orientation:** both
- **Repro:** With nothing selected (or with the fingers outside the selection), pinch or two-finger-drag on empty canvas.
- **Observed:** Scale stayed 1.226 and offset stayed (30,114) for: a simultaneous pinch, a simultaneous two-finger pan, and a realistic staggered two-finger pan (second finger lands 60 ms later). The simultaneous pan drew a marquee and selected a layer instead. Cause: the first pointer starts a marquee (`isSelecting`), and `canStartTouchGesture()` then refuses the second finger (renderer.js ~1883). A pinch whose first finger landed inside a selected object's bounds did zoom (1.226 → 3.371). Workarounds exist for pan only (Hand tool, PAN modifier), and nothing covers zoom.
- **Expected:** On a second touch inside ~250 ms, or before ~10 px of travel, cancel the marquee or tool action and start the gesture (Procreate / Illustrator iPad behaviour).
- **Evidence:** `18-portrait-staggered-pan.png`, `19-portrait-pinch-empty-marquee.png`, `12-portrait-pinch.png`

---

## Major

### IPH-008 — "All Tools" drawer is clipped; 7+ tools unreachable
- **Surface:** toolbar `…` (`#tool-overflow-btn`) · **Orientation:** portrait
- **Observed:** The drawer opens anchored at about x=272 and runs off the right edge. Items at x ≥ 397 are off-screen: Anchor Point, Draw Algorithm, Polygon, Erase Pattern Fill, Scissor Line, Scissor Rectangle, and the List/Grid view toggles (24×22 at x 472/498). The visible part is also covered by the right pane sliver (z 55). All items are 34×34 px.
- **Evidence:** `04-portrait-toolbar-more.png`

### IPH-009 — Add Layer: Algorithm submenu is hover-only; a tap adds an unwanted layer
- **Surface:** Layers → Add Layer → "Algorithm Layer" (`.lvl-add-has-sub`, `#lvl-algo-submenu`) · **Orientation:** portrait
- **Observed:** The submenu opens on `mouseenter` only (shortcuts.js:607). A tap on the row runs the `algo-parent` click and **adds the preferred type (Attractor) at once**, with toast "Added attractor layer". The emulated mouseenter leaves the 180×858 px submenu floating at y=118, so its bottom (976) is below the screen and the 3D entries (Polyhedron, Raster Plane…) are cut off. Picking from it adds a second layer. The submenu flies out to the left at x=11, away from the thumb. The toast is cut off at the top-right.
- **Evidence:** `07-portrait-add-layer-tap.png`, `08-portrait-algorithm-submenu.png`

### IPH-010 — Inputs use 11 px text, so iOS zooms the page on focus
- **Surface:** layer search, all Generator params, Text panel, Document Setup, export settings · **Orientation:** both
- **Observed:** `matchMedia('(pointer: coarse)')` is true, but the `@media (pointer: coarse) input{font-size:max(16px,1em)}` rule loses on specificity. Measured `font-size`: `#layer-search-input` 11 px. All 24 Generator text/number/select controls for Flowfield are 11 px. Text panel fields are 11 px. Document Setup fields are mostly 11 px (a few 16 px). Export dialog fields are 11/12/16 px. iOS Safari zooms in on focus for anything under 16 px and does not zoom back out.
- **Expected:** Inputs ≥ 16 px on coarse pointers, with enough specificity to win (for example `[data-ui-skin] body.mobile-layout input`).

### IPH-011 — Sliders: tiny targets, and scrolling changes values
- **Surface:** `.ctrl-slider` (all algorithm params, Document Setup, export precision, draw-order) · **Orientation:** both
- **Observed:** Track 194×4 px, thumb 14×14 px (`::-webkit-slider-thumb`), draw-order slider 6 px. **A vertical swipe that starts on a slider (to scroll the panel) changed the value 1 → −0.3** and also scrolled the panel (520 → 779). A tap on the track jumps the value (−0.3 → 2.95). In a long scrolling drawer full of sliders, scrolling past them alters parameters by accident.
- **Expected:** ≥ 28 px thumb, a 44 px tall hit row, `touch-action: pan-y` on the track, and value change only after a horizontal-dominant move (or tap thumb then drag).
- **Evidence:** `22-portrait-generator-scrolled.png`

### IPH-012 — Transform, anchor and 3D handles are mouse-sized
- **Surface:** canvas selection frame, Direct Selection, Pen, 3D gizmo · **Orientation:** both
- **Observed:** Code: `hitHandle` `RESIZE_R = 10` px (20 px diameter). Anchor tolerance 6 px, bézier handle tolerance 5 px. 3D orbit centre 5 px, yaw/pitch markers 9 px. Drawn handles are 6 px squares. Measured: a resize drag that starts 12 px diagonally outside the NW corner (normal finger offset) **did nothing**. 3 px outside worked. The rotate zone (28 px) worked (rotation 15.4°).
- **Expected:** Hit radius ≥ 22 px for `pointerType==='touch'`, and nudge handles outward on small selections.
- **Evidence:** `16-portrait-selected-handles.png`, `17-portrait-after-resize.png`, `44-portrait-3d-polyhedron.png`

### IPH-013 — Permanent 40 px pane slivers eat 20 % of canvas width and cover handles
- **Surface:** `.pane-left` / `.pane-right` collapsed state · **Orientation:** portrait
- **Observed:** Each sliver is 40×780 and blank (no icon or label). It sits above the canvas (z 55). A selection's SE corner at x=361 lay on the right sliver's edge (362–402), and resize there failed. The usable canvas width is 322 of 402 px.
- **Expected:** Hide the slivers on phones (drawers open from explicit buttons), or make them thin, labelled grab handles that don't take pointer events over the canvas.

### IPH-014 — Toolbar takes 29 % of the screen height
- **Surface:** `#tool-bar` · **Orientation:** portrait
- **Observed:** Toolbar 402×254 (3 wrapped rows plus dividers, drag handle and pin row). Canvas `#viewport-container`: 493 px at 874, **369 px at 750** (Safari chrome), and 397 px with standalone insets. Adding header 38, bottom-pane header 32 and modifier bar 57 gives 381 px of chrome before the canvas.
- **Expected:** One horizontally scrolling row (or a bottom rail) of ~52 px, with secondary tools in the overflow. The README's "bottom-docked tool rail" is not what ships.
- **Evidence:** `01-portrait-initial.png`, `01-portrait-safari-initial.png`

### IPH-015 — Safe-area insets applied to the wrong elements
- **Surface:** `#app-header`, `#tool-bar`, `.pane-*`, `#status-bar` · **Orientation:** both
- **Observed:** `viewport-fit=cover` + `apple-mobile-web-app-capable` + `black-translucent` mean the page draws under the status bar when run as a home-screen app. `padding-top: env(safe-area-inset-top)` is on **`#tool-bar`**, the second element, not on `#app-header`. With a 62 px top inset, the header (logo, File/Edit…) stays at y=0 under the Dynamic Island, and a 62 px empty band opens between header and tools (`30-portrait-safe-area-insets.png`). In landscape (left/right inset 62), the header logo (x 14), the Generator drawer content and the pane toggles sit under the Dynamic Island. `#status-bar` sits under the home indicator. Only the modifier bar honours the left, right and bottom insets.
- **Evidence:** `30-portrait-safe-area-insets.png`, `30-landscape-safe-area-insets.png`

### IPH-016 — Reorder grips are mouse-only (noise rack, effects, config stacks, pens)
- **Surface:** `.noise-grip` and the other grips · **Orientation:** both
- **Observed:** The grips bind `grip.onmousedown` only: noise-rack-panel.js:2062/2186, algo-config-panel.js:1045/3188/3414/3726, pens-panel.js:472. A touch hold-drag of Noise 01's grip (14×20 px) below Noise 02 left the order "Noise 01,Noise 02" unchanged. The pane resizers and bottom-pane resizer are also mousedown-only (hidden on mobile, so lower impact).
- **Evidence:** `37-portrait-noise-grip-drag.png`

### IPH-017 — Layer row actions are 18–20 px; Delete sits next to Duplicate
- **Surface:** `#layer-list` rows · **Orientation:** both
- **Observed:** Rows are 46 px tall (good), but the actions are tiny. `lvl-ib` Hide/Lock 20×20. `lvl-ab` Expand / Duplicate / **Delete** 18×18, side by side. Mask 18×18. Header controls: search 71×20, filter 30×30, Add Layer 80×24, draw-order eye/settings 18×18. The pen-colour dot is not exposed as a reachable swatch.
- **Expected:** 44 pt actions, or a swipe-to-reveal / ⋯ menu per row. Put Delete behind confirmation or undo-toast.
- **Evidence:** `38-portrait-layer-reorder.png`, `39-portrait-pens-tab.png`

### IPH-018 — Pen tool: closing and finishing need pixel accuracy or a keyboard
- **Surface:** Pen tool · **Orientation:** both
- **Observed:** Closing works when the tap is exactly on the start anchor (0 px). **5 px and 10 px offsets missed** and added a 4th anchor instead. Double-tap to finish needs < 8 px drift and < 400 ms. With 8.5 px drift it added 2 anchors instead of finishing. Enter (commit), Escape (cancel) and Backspace (remove last anchor) are keyboard-only (shortcuts.js:364–374), and no on-screen Done / Cancel / Undo-point control exists.
- **Evidence:** `35-portrait-pen-path.png`

### IPH-019 — Tool sub-menus need hold-and-slide; the menu opens under the thumb
- **Surface:** Shape / Pen / Fill / Scissor flyouts (`.tool-submenu`) · **Orientation:** both
- **Observed:** A hold of 280 ms opens the flyout (42×138 at 229,117, right under the finger). Items are 28×28. Lifting without sliding closes it. In my run, a slide to "Polygon" and release left the tool as `select`. A tap on the chevron corner does nothing. iOS long-press also risks the system callout.
- **Expected:** Tap the chevron to open a stay-open popover with ≥ 44 pt items, offset from the finger.
- **Evidence:** `45-portrait-shape-submenu-held.png`, `43-portrait-shape-submenu.png`

### IPH-020 — Context menus are reachable only through `contextmenu`
- **Surface:** canvas context menu (`canvas-context-menu.js`), layer list context menu (`layer-context-menu.js`) · **Orientation:** both
- **Observed:** Both bind the `contextmenu` event only. iOS Safari does not fire `contextmenu` on long-press. In the emulator, a 900 ms long-press on the canvas opened no menu. Every action that lives only in these menus is touch-unreachable.
- **Evidence:** `14-portrait-long-press.png`

### IPH-021 — Info "i" buttons are 16 px and open an oversized dialog that shifts the page
- **Surface:** `.info-btn` (5+ per Generator section, 15 px `.export-info-btn`) · **Orientation:** portrait
- **Observed:** A tap opens a 512 px wide info dialog in a 402 px viewport. Text is cut off, the close button is at x≈470, and the page pans sideways 142 px.
- **Evidence:** `23-portrait-info-tap.png`

### IPH-022 — Small top-menu triggers and items
- **Surface:** top menubar · **Orientation:** both
- **Observed:** Triggers 54–71×26 px, 11 px text. Menu items 30 px tall. Theme toggle 26×26, overlapping View (IPH-001). These are the only route to Undo, Redo, Delete, Group, Lock and Export, so they get heavy use.

### IPH-023 — Toolbar pin / home / rotate controls are 13×13 px
- **Surface:** `.toolbar-pin-btn`, `.toolbar-home-btn`, `.toolbar-rotate-btn` · **Orientation:** both
- **Observed:** 13×13 px buttons 2 px apart, at (205/220/235, 261). Rotate is the only fix for the landscape layout (IPH-005).

### IPH-024 — No dynamic viewport units: modifier bar can hide behind Safari's toolbar
- **Surface:** `<body class="h-screen …">` · **Orientation:** both
- **Observed:** Layout height is `100vh` (Tailwind `h-screen`). The skin has no `dvh`, `svh` or `-webkit-fill-available`. In iOS Safari `100vh` is the *largest* viewport, so with the bottom tab bar showing, the lowest ~80 px (the modifier bar and the bottom-pane chevron) is behind browser chrome. The emulator cannot show this. A static 402×750 run shows how much height is lost.
- **Expected:** `height: 100dvh` (fallback `100vh`).

### IPH-025 — Keyboard-only functions with no touch equivalent
- **Surface:** shortcuts.js · **Orientation:** both
- **Observed:** No on-screen equivalent for: Escape (cancel scissor, fill, algo-draw and shape drafts; leave group-edit mode), arrow-key nudge, ↑/↓ polygon side count and corner-drag type, Cmd+[ / ] bring forward or backward (no Arrange menu item), +/- zoom, Shift+F7, Tab. Undo and Redo need 2 taps through the Edit menu, with no toolbar button.

### IPH-026 — Layer reorder by hold-drag did not reorder (confirm on device)
- **Surface:** `#layer-list` touch reorder (layers-panel.js:317, 350 ms hold) · **Orientation:** portrait
- **Observed:** A 450 ms hold, then a drag of row 1 past row 3, left "Flowfield,Spiral,Rings" unchanged, and the shell scrolled (IPH-004). The code uses passive `touchstart` and `preventDefault` in `touchmove`. Behaviour may differ on WebKit, so confirm on device. When the hold engages, the only feedback is `navigator.vibrate`, which iOS Safari does not support.
- **Evidence:** `38-portrait-layer-reorder.png`

---

## Minor

### IPH-027 — Hold-to-move gives no feedback on iOS; a quick drag pans
- Touch move on a selected object needs a 350 ms still hold (renderer.js:7209). Feedback is `navigator.vibrate(30)` (not supported on iOS) and a cursor change (invisible on touch). A quick drag on the object pans the canvas instead (offset +20,+20). That is defensible, but nothing on screen explains it. Add a visual "lift" (shadow or scale) state.

### IPH-028 — Drawer backdrop hard to hit
- `#mobile-pane-backdrop` is z 54, below both panes (55) and the toolbar (60). With the left drawer open, a tap at (380,600) landed on the right sliver and did not close the drawer. Only the strip x≈290–362 dismisses it. The toolbar stays live above the backdrop.

### IPH-029 — Double-tap gestures promised by Help don't work
- Help says "Double-click the canvas to generate a new layer". A double-tap on the canvas left the layer count unchanged (1 → 1). Slider reset, step-pill reset, the LFO curve editor ("Double-click to add a point / remove") and the pattern / petal designers depend on `dblclick`. On iOS that event may not fire on double-tap.
- **Evidence:** `13-portrait-double-tap.png`, `31-portrait-modal-btn-help.png`

### IPH-030 — Modifier bar is desktop-shaped
- 5 × 44 px buttons labelled SHIFT / ALT / CMD / CTRL / PAN, permanently 57 px tall. CMD and CTRL are desktop concepts, and nothing explains what they do on a phone. The phone glyph CSS (`body.phone-layout … ::before`) never applies, because of IPH-001.

### IPH-031 — Mouse and keyboard copy on touch devices
- Landscape status bar: "**Click** the object to select | **Shift+Click** … | **Option+Drag** …". The Help guide is keyboard-only, with a Mac/Win toggle and no "Touch" tab. The zoom readout shows "-2%" / "-5%" when the canvas is 44 px tall.
- **Evidence:** `01-landscape-initial.png`, `31-portrait-modal-btn-help.png`

### IPH-032 — Bottom formula pane and pane toggles are 28×28 px
- `#btn-pane-toggle-bottom` 28×28, `#btn-pane-toggle-left/right` 28×28 (also covered, IPH-002).

### IPH-033 — Text panel micro-controls
- `.vtp-scrub-name` labels use 9 px text (13 px tall). Scrub handles are 29×28. Two unlabeled 13×15 / 13×14 buttons. `.vtp-sw-toggle` is 30×16. The text input is 197×30 at 11 px (IPH-010).
- **Evidence:** `46-portrait-text-panel.png`

### IPH-034 — Toasts cut off and positioned top-right
- "Added attractor layer" renders partly off-screen at the top right, under the header and the Dynamic Island (`08-portrait-algorithm-submenu.png`).

### IPH-035 — Generator header controls under 44 px
- Section headers 290×30, preset trigger 224×30, Add Noise 75×26, noise delete 26×24, selects 30 px tall. The 36×36 preset save pip is the closest to target.

### IPH-036 — Export dialog nav and secondary controls
- Export nav tabs 36 px tall. `export-info-btn` 15×15. Precision value field 46×24. Fit / Reset 42×36.


---

## Works well

- **Primary tool buttons** are 44×44 with ≥ 6 px gaps and no overlap (portrait, matching `tests/e2e/iphone-mini.spec.js`).
- **Modifier bar** buttons are 44 px tall, full-width and evenly split. The bar honours `env(safe-area-inset-left/right/bottom)`.
- **One-finger pan** works with the Hand tool and with the PAN modifier toggle (offset moved 60,60 both ways).
- **Pinch-zoom** works smoothly when the first finger lands on a selected object (1.226 → 3.371).
- **Tap-to-select** picked the topmost layer. **Hold-to-lift move** (350 ms) moved the layer cleanly. The **rotate zone** (28 px) worked by finger.
- **File / Edit / Object menus** open by tap, and items run their actions.
- **Document Setup** opens as a full-height left drawer with 30 px+ accordion headers and segmented controls, which suits a phone (`31-portrait-modal-btn-settings.png`).
- **Layer rows** are 46 px tall. The Algorithm submenu items are ~34–39 px with icons.
- **Canvas** has `touch-action:none`, so the browser does not page-zoom or scroll when you draw on it. Pen tap-to-add-anchor is reliable.
- `-webkit-tap-highlight-color: transparent`, `user-select:none` and `touch-action:manipulation` are set for buttons on coarse pointers, so there is no 300 ms delay and no blue flash.
- The Generator drawer scrolls on its own (`#left-panel-content` 744/2359) with momentum.

## Needs real iOS Safari to confirm

1. **Layout-viewport inflation (IPH-001/003/004).** Chromium mobile grows the ICB to 544×1183 because of the overflowing header. iOS WebKit may instead let the user pan sideways or shrink-to-fit. The 544 px header overflow is certain, but how it looks on iOS needs checking (`visualViewport` on device).
2. **Focus auto-zoom (IPH-010):** confirm zoom on the 11 px inputs and whether the page stays zoomed after blur.
3. **`contextmenu` on long-press (IPH-020)** and **`dblclick` on double-tap (IPH-029):** iOS 26 behaviour inside a `touch-action:none` canvas versus the panels.
4. **Touch layer reorder (IPH-026)** and HTML5 `draggable` rows/pens on iPhone Safari.
5. **`100vh` vs. the bottom tab bar (IPH-024):** compact vs. bottom tab layout, and minimised toolbar on scroll.
6. **Safe-area insets (IPH-015):** real values in Safari tab mode vs. home-screen standalone (`apple-mobile-web-app-capable`), plus landscape Dynamic Island side.
7. **System gestures:** the left-edge back swipe vs. the left sliver / drawer, the home-indicator swipe vs. the modifier bar (no `env(safe-area-inset-bottom)` margin on `#status-bar` in landscape), and Safari pull-to-refresh when the shell is scrolled (IPH-004).
8. **Keyboard occlusion:** whether a focused Text-panel field or a Document Setup number field stays above the keyboard. No `visualViewport` resize handling was found.
9. **Haptics:** `navigator.vibrate` is not available on iOS, so check whether hold-to-lift and layer-drag are discoverable without it.
10. **Long-press on toolbar buttons:** whether the iOS callout or loupe fights the 280 ms hold-to-open sub-menus (IPH-019).

## Not exercised (scope note)

Petal Designer, the Pendula Motion Rack curve editor, the paint-bucket fill controls, the pen colour picker and the full 3D Scene panel were not driven end-to-end. They are reached through the drawers that IPH-002 blocks. A code scan shows the same patterns (11 px inputs, `dblclick`-only edits, `onmousedown` grips, 16 px info buttons), so expect IPH-010/016/021/029 to apply there too.
