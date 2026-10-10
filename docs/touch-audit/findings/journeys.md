# Touch Journey Audit: Finger-Only Core Journeys

- **Date:** 2026-10-02
- **Build:** v1.4.5 (`main` @ e609338c plus the working tree)
- **Server:** `node scripts/dev-server.js 8413`
- **Harness:** Playwright Chromium, `isMobile:true`, `hasTouch:true`, Safari user agents.
- **Input:** `page.touchscreen.tap` and CDP `Input.dispatchTouchEvent` only. These covered taps, drags, long-press, and two-finger pinch/pan. JS ran only to read state.
- **Devices:**
  - iPad Pro 11": 834×1210, DPR 2.
  - iPhone Pro: 402×874, DPR 3.
- **Evidence:** `docs/touch-audit/evidence/journeys/<step>-<device>.png`.

> **Caveats.** This is Chromium mobile emulation, not WebKit.
> - Native `<select>` pickers were driven with `selectOption` after a real tap on the control.
> - Typing used `page.keyboard`. That is equal to a **hardware** keyboard, and JRN-004 explains why that matters.
> - Items marked *(verify on device)* depend on engine behavior (viewport overflow, soft keyboard) and need confirmation in real iOS Safari.

## Journey × device matrix

| # | Journey | iPad Pro 11" | iPhone Pro | Blocking / friction step |
|---|---|---|---|---|
| 1 | Pick algorithm → 3 sliders → preset | **PASS-WITH-FRICTION** | **FAIL** | iPad: tapping "Algorithm Layer" also adds an unwanted Attractor layer (JRN-007). iPhone: no way to open Generator or Layers panes (JRN-001). |
| 2 | Add layer, rename, reorder, hide/show, delete | **PASS-WITH-FRICTION** | **FAIL** | iPad: rename fails on heavy docs (JRN-010). The card Delete button is clipped off-screen (JRN-009). Group names are 0 px wide (JRN-012). iPhone: Layers pane unreachable (JRN-001). |
| 3 | Select, move, scale (handles), rotate | **PASS-WITH-FRICTION** | **PASS-WITH-FRICTION** | Handle hit radius is 10 px. The rotate zone is invisible. On iPad the right-side handles sit under the Layers pane (JRN-011). |
| 4 | Pan, pinch-zoom, fit to view, undo/redo | **FAIL** | **FAIL** | Pinch/pan are dropped when the first finger lands on empty canvas or on the selection (JRN-003). View › Reset View breaks the layout (JRN-002). |
| 5 | Draw path (pen/shape), edit anchor, close path | **PASS-WITH-FRICTION** | **PASS-WITH-FRICTION** | Pen, close, and anchor drag all work. Shape variants (Rectangle/Line/Polygon) cannot be picked by long-press (JRN-008). On iPad, Selection/Direct tools are hidden under the left pane at first load (JRN-005). |
| 6 | Mirror modifier + angle; mask | **PASS-WITH-FRICTION** | **FAIL** | iPad: angle slider is 3°/px. Mask buttons are hover-revealed. iPhone: Insert menu is off-screen and the Modifier panel is unreachable (JRN-001, JRN-006). |
| 7 | Add Text, type word, change font/size | **FAIL** *(no HW keyboard)* | **FAIL** | No editable element gets focus, so the soft keyboard never opens (JRN-004). Font and size controls work on iPad. |
| 8 | Paint bucket fill a region | **PASS-WITH-FRICTION** | **PASS** | iPad: the Fill tool sits under the Layers pane. A missed tap focused Search and drew a stray oval (JRN-005). |
| 9 | Save named preset; Document Setup paper size | **PASS-WITH-FRICTION** | **FAIL** (preset) / PASS (Doc Setup) | The save sheet is pinned to the bottom, under the soft keyboard *(verify)*. iPhone: the preset save button is in the unreachable Generator pane. |
| 10 | Export SVG; save .vectura | **PASS** | **PASS-WITH-FRICTION** | iPhone: the Export modal is wider and taller than the screen, and its Export/Close buttons are off-screen. You must pan the whole page (JRN-006). |
| 11 | 3D scene: insert, orbit camera | **PASS-WITH-FRICTION** | **FAIL** | iPad: orbit only through a 56 px gizmo, and the unwanted Attractor layer comes back. iPhone: Add Layer is unreachable. |
| 12 | Recover from a mistake | **PASS-WITH-FRICTION** | **PASS-WITH-FRICTION** | Undo takes 2 taps (Edit › Undo). There is no on-screen undo. Invisible card buttons delete or duplicate with no confirmation (JRN-009). Reset View cannot be undone (JRN-002). |

**Totals:**
- **iPad:** 0 PASS, 9 PASS-WITH-FRICTION, 2 FAIL, 1 PASS.
- **iPhone:** 1 PASS, 5 PASS-WITH-FRICTION, 6 FAIL.

### Taps vs desktop (approximate, happy path)

| Journey | Desktop (mouse/kbd) | iPad touch | iPhone touch |
|---|---|---|---|
| 1 | ~8 clicks | ~10 taps (+1 stray layer to delete) | not completable* |
| 2 | ~8 | ~12 (Delete via Edit menu, 2 taps) | not completable* |
| 4 | wheel/space-drag + Cmd+0/Z | pinch ok only when first finger avoids canvas content; Reset View destructive | PAN-modifier + 1-finger drag works; Reset View destructive |
| 7 | 3 + typing | blocked without HW keyboard | blocked |
| 10 | 4 | 5 | 7+ (page pan needed) |
| 12 | Cmd+Z (1) | 2 taps | 2 taps |

\*There is an undiscoverable escape hatch: View › Reset View forces a desktop-style layout with reachable pane toggles (JRN-002). It is not a viable user path.

---

## Blockers

### JRN-001: iPhone: Generator, Layers, and Modifier panes cannot be opened (iPhone)

- **Journeys:** 1, 2, 6, 9 (preset), 11.
- **Evidence:** `00-initial-iphone.png`, `j1-01-righttoggle-iphone.png`, `j1-08-leftedge-iphone.png`, `j1-05-toolbar-dragged-iphone.png`.
- **Steps:** Tap the right-pane `>` toggle at (371,42). Tap the left toggle at (4,42). Tap the 40 px edge strips. Drag the toolbar grip.

**What happens:**
- **Both pane toggles are covered by the toolbar.** `elementFromPoint` at both toggles returns `.toolbar-drag-handle`. That grip is a 378×14 px strip across the toolbar top, and the toolbar overlays y 38–292.
- **The edge strips do nothing.**
- **The toolbar does not move** when you drag its grip.
- **The mobile handles never show.** The dedicated `#btn-mobile-pane-left/right` handles are always `display:none`. The unconditional `.mobile-pane-handle { display:none }` rule in `src/ui/skin/components.css` (around line 9595) comes later than the `@media (max-width:900px)` rule that shows them (around line 8520) and overrides it. This is a specificity/order bug.
- **The context bar does not render on phone.** `.ctxbar` is `display:none`, so its Add Layer / Presets chips are also missing.

**Result:** No Add Layer, no algorithm picker, no sliders, no presets, no layer list, and no modifier controls.

**Why:** occluded by panel; missing touch affordance (CSS override).

### JRN-002: View › Reset View destroys the touch layout (iPad and iPhone)

- **Journeys:** 4, 12.
- **Evidence:** `j4-06-after-reset-ipad.png`, `j4-05-resetview-ipad.png`, `j4-05-reset-iphone.png`.

**Handler:** `src/ui/shell/header.js` (around line 160). It runs `renderer.center()`, then `expandPanes()`. The fit is computed **before** the panes open, so it is stale.

**iPad:**
- The left pane re-opens at 335 px.
- The bottom formula pane opens, and its text overlaps (garbled).
- The toolbar flips to vertical, and the modifier bar becomes a floating box.
- The canvas shrinks to 164 px and zoom drops to 37%.

**iPhone:**
- Both panes open at 335 px.
- The canvas is **0 px wide**.
- Zoom goes **negative** (`scale = -0.22`).

The change is not in undo history. The user who wanted "fit to view" ends with no canvas.

**Why:** desktop-only pane logic runs on mobile; no fit recompute after layout.

### JRN-003: Two-finger pinch/pan is dropped when the first finger starts a marquee or layer drag (iPad and iPhone)

- **Journey:** 4.
- **Evidence:** `j4-04-stuck-ipad.png`, `j4-02-gestures-iphone.png`.

**Root cause:** `canStartTouchGesture()` in `src/render/renderer.js` (around line 1883) returns false while `isSelecting` or `isLayerDrag` is set.

With the Selection tool, the first finger's `pointerdown` starts one of these:
- a marquee, on empty canvas, or
- a layer drag, on the selection.

The second finger then can never start a gesture. Read-back while two fingers were down: `flags:["isSelecting"], touchGesture:null`.

**Effects:**
- Pinches and pans fail intermittently. It depends on where the first finger lands. 8 of 8 repeated pinches failed after the first success.
- The gesture **clears the selection**.
- When the first finger is on the selected object, the gesture **resizes or moves the object** instead of zooming. In the test the selection's x2 changed from 437 to 505.

**Workaround found:** Hold the PAN modifier and drag with one finger. That panned correctly.

**Why:** gesture arbitration does not cancel the one-finger action when a second finger arrives.

### JRN-004: Text cannot be typed without a hardware keyboard (iPad and iPhone)

- **Journey:** 7.
- **Evidence:** `j7-01-typed-ipad.png`, `j7-02-textpanel-ipad.png`.

**What happens:**
1. Select the Type tool and tap the canvas. A text layer is created.
2. `document.activeElement` stays on the tool `<button>`.
3. `src/ui/text-edit-controller.js` listens to `window` `keydown` only. There is no textarea, contenteditable, or `inputmode` proxy, so iOS never shows the on-screen keyboard.
4. The Text panel has no text-content field to fall back on.

"Hello" was typed only through an emulated hardware keyboard.

**What does work on iPad:**
- **Font picker:** tap the family, then tap Lato. This applied `google:lato`.
- **Size field:** this works with friction. The field does not select on focus, so typing appends: "40" + "72" clamped to 160. Users must backspace on the soft keyboard first.

**Why:** missing touch/soft-keyboard text input path.

---

## Major

### JRN-005: Panes cover the floating toolbar (iPad)

- **Journeys:** 5, 8.
- **Evidence:** `j1-02-addmenu-ipad.png`, `j5-02-pen-closed-ipad.png`, `j8-01-filltool-ipad.png`.

The toolbar spans the full 834 px width, but both 290 px side panes overlay it.

- **At first load:** Selection (V) and Direct (A) sit under the Generator pane. A tap on Selection hits `#left-welcome-intro`.
- **Right pane open:** Fill (F) sits under the Layers pane. The test tap hit `#layer-search-input`. That focuses search, which would raise the soft keyboard, and the next canvas tap drew a stray oval.
- **Space:** The toolbar plus grip takes about 240 px of vertical canvas. On iPhone it takes 254 of 874 px (`j1-09-alltools-iphone.png`).

**Why:** occluded by panel.

### JRN-006: iPhone layout is wider than the device, so menus and modals overflow (iPhone, *verify on device*)

- **Journeys:** 4, 6, 10.
- **Evidence:** `j1-04-menuswipe-iphone.png`, `j1-07-drawn-iphone.png`, `j4-04-viewmenu-iphone.png`, `j10-01-export-iphone.png`.

**Cause:** The top menubar is 544 px wide on a 402 px device, so `innerWidth` = 544.

**Effects:**
- **Breakpoint missed:** The `phone-layout` breakpoint (`innerWidth < 540`, `src/ui/shell/workspace.js`) is never applied.
- **Top menus:**
  - Insert and Help are off-screen.
  - The View label is half-covered by the theme toggle.
  - The View dropdown opens with only a 30 px sliver visible.
- **Page pan:** A horizontal swipe pans the *whole app* sideways by 142 px. That leaves a blank band and hides the left UI.
- **Vertical pan:** A vertical swipe on non-canvas UI pans the page down, so the menubar leaves the screen. Canvas swipes cannot bring it back because the canvas uses `touch-action:none`. Only a swipe on the modifier bar restored it.
- **Export modal:** Its header × and footer Export/Close buttons are off-screen at x>402 and y 963. The user is stuck until they pan the page. Export SVG then works, using the button's visible left edge.

**Why:** content wider than viewport; no overflow containment.

### JRN-007: Tapping "Algorithm Layer" in Add Layer commits a default layer (iPad)

- **Journeys:** 1, 6, 11.
- **Evidence:** `j1-03-algosub-ipad.png`, `j11-01-scene3d-ipad.png`.

The algorithm submenu opens only on `mouseenter` (`src/ui/shortcuts.js`, around line 607). A tap fires emulated `mouseenter` and also `click`. The `algo-parent` click handler then adds the preferred type (Attractor) immediately.

The submenu then stays open, and picking Flowfield, Rings, or Scene 3D adds a **second** layer. This was reproduced 4 times; each run left a stray "Attractor 01" or a "Wavetable 02" inside a mirror modifier.

**Why:** hover-only submenu; parent row doubles as a commit action.

### JRN-008: Tool subtool menus (long-press) do not work by touch (iPad and iPhone)

- **Journeys:** 5, 11.
- **Evidence:** `j5-03-shape-hold-iphone.png`, `j11-01-algo-longpress-iphone.png`.

**How it is built:** `src/ui/shell/toolbar.js` (around line 340) opens the menu after a 280 ms hold, but only selects on `pointerup` over a `.tool-sub-btn`.

**What fails:**
- **Release in place:** Lifting the finger without moving closes the menu immediately.
- **Hold and slide:** Sliding to the variant fails because `touch-action: manipulation` lets the browser cancel the pointer.

The tool did not change, and the Shape tool kept drawing ovals. The Draw Algorithm chevron has the same problem.

**Workaround:** Use the "…" All Tools drawer. On iPhone that drawer is clipped at the right edge (`j1-09-alltools-iphone.png`).

**Why:** press-drag-release menu needs a mouse.

### JRN-009: Layer card actions are invisible yet tappable, and Delete has no confirmation (iPad)

- **Journeys:** 2, 12.
- **Evidence:** `j12-01-invisible-action-ipad.png`, `j12-03-edge-delete-ipad.png`, `j2-03-hidden-ipad.png`.

On cards that are not active, `.lvl-acts` is `opacity:0` with pointer events still on (`components.css` around line 7708). The CSS shows it on `:hover`, which does not exist on touch.

**Findings:**
- **Hidden Duplicate:** Tapping where it sits duplicated "Attractor 01".
- **Clipped Delete:** The Delete button is at x 829–865, past the 834 px viewport, so it is almost always off-screen. A tap on the screen's right edge (x=831) **deleted a layer with no confirmation**.
- **Undo:** Edit › Undo recovered it (2 taps).
- **Locked children:** Children inside a mirror modifier are auto-locked, so their mask button is disabled. Nothing shows why.

**Why:** hidden behind hover; target clipped at the viewport edge.

### JRN-010: Double-tap to rename fails on documents with heavy layers (iPad)

- **Journey:** 2.
- **Evidence:** `j2-01-rename-ipad.png` (failed), `j2-05-rename-light-ipad.png` (worked).

`_lvlDoSel` (`src/ui/panels/layers-panel.js`, around line 971) detects a double-tap with `Date.now()` and a 350 ms window. Every tap triggers a ~180 ms main-thread long task with a Flowfield or Attractor in the doc. That puts the two handlers about 366 ms apart even when the touches are 122 ms apart (event `timeStamp`).

**Results:**
- **Heavy doc** (Flowfield River Current + Attractor): rename never triggered.
- **Light doc** (two ovals): rename worked, the name was pre-selected, and typing replaced it.

**Why:** timing uses handler time, not `event.timeStamp`.

### JRN-011: Transform handles are small and the rotate zone is invisible (iPad and iPhone)

- **Journey:** 3.
- **Evidence:** `j3-02-moved-scaled-ipad.png`, `j3-03-rotated-ipad.png`, `j3-01-transform-iphone.png`.

`hitHandle()` (`renderer.js`, around line 15050) uses these zones:
- **Resize:** `RESIZE_R = 10` px.
- **Rotate:** `ROTATE_R = 28` px, *outside* a corner. There is no visible affordance and no hover cursor.

**Results:**
- **Missed handle:** A drag 14 px inside the corner did not resize.
- **Rotate:** Worked only when started 14 px outside the corner.
- **Hidden handles on iPad:** With the right pane open, the selection's right-side handles sit under `#layer-list`. The README says rotate is "via the upper-right handle", and that handle is the one covered.
- **Move:** A 30 px move gave 20 px of travel on iPhone, from touch slop.

**Why:** target too small; hover-dependent discoverability.

### JRN-012: Group and modifier names are 0 px wide (iPad)

- **Journeys:** 2, 6.
- **Evidence:** `j6-01-mirror-ipad.png`, `j6-07-mask-ipad.png`.

In the 290 px right pane, the group header icons consume the row and `.lvl-grp-name` gets width 0. You cannot read or double-tap a group, mirror modifier, or 3D Scene name.

**Why:** layout overflow at tablet width.

---

## Minor

### JRN-013: Mirror angle slider is too coarse (iPad)

The mirror Angle slider is 120 px for 360°, so 3°/px. A 40 px drag moved the angle from 90° to 214°. The mirror Disable, Lock, and Delete buttons are 22×22 px.

Evidence: `j6-03-angle-ipad.png`.

### JRN-014: Save Preset sheet may sit under the soft keyboard (iPad, *verify on device*)

The Save Preset bottom sheet auto-focuses the name field at y≈1087 of 1210. The Save button is 39×24 px. The iPad soft keyboard (≈400 px) would cover the field and the segmented control.

The flow works with a hardware keyboard: "Touch Test" was saved.

Evidence: `j9-01-savepreset-ipad.png`.

### JRN-015: Font search auto-focuses and opens the keyboard (iPad)

The font picker auto-focuses its search box. On touch that opens the keyboard over the font list, which sits at the bottom half of the screen.

Evidence: `j7-03-fontpicker-ipad.png`.

### JRN-016: Small targets in the toolbar grip, menus, and pane toggles (iPad and iPhone)

| Control | Size |
|---|---|
| Toolbar Lock / Reset / Rotate buttons | 13×13 px |
| Top menu items | 30 px tall |
| Menu triggers | 26 px tall |
| Pane toggles | 28×28 px |
| Layer search field (iPad) | 71×20 px |
| Add Layer button (iPad) | 80×24 px |

### JRN-017: Undo has no on-screen control (iPad and iPhone)

Undo and redo are only in the Edit menu, which takes 2 taps. There is no toolbar button and no gesture. This adds friction to every recovery.

### JRN-018: Theme toggle overlaps the View menu (iPhone)

The theme toggle overlaps the View trigger. The toggle sits under it and cannot be reached.

### JRN-019: iPad Document Setup Paper section opens on first tap (iPad)

On iPad, the first tap on the Paper size `<select>` area hit the collapsed section header. It expanded the section instead of opening the picker. This is a minor extra tap.

Evidence: `j9-03-paper-ipad.png`.

---

## What worked well (both devices unless noted)

- **Sliders (iPad):** Native range sliders dragged reliably.
- **Presets (iPad):** The preset dropdown has 38 px rows.
- **Layer reorder (iPad):** Long-press (350 ms) then drag works.
- **Hide/show eye (iPad):** 40 px targets.
- **Pen tool:** Tap to place anchors and tap the first anchor to close. Direct-select anchor drag works.
- **Fill tool:** Hatch fill on tap.
- **File menu:** Export SVG and Save .vectura downloads both work.
- **Document Setup:** Opens as a drawer on iPhone.
- **Scene 3D orbit gizmo (iPad):** Works.
- **PAN modifier:** Gives a reliable one-finger pan.
