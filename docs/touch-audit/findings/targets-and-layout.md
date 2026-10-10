# Touch targets and layout fitness: iPad Pro 11" and iPhone Pro

Audit date: 2026-10-02 · App version 1.4.5 (main `e609338c`) · Chromium (Playwright) with `isMobile: true, hasTouch: true` and iOS user agents.

- Raw data: `docs/touch-audit/findings/target-audit.json` (4 viewports × 26 UI states, every visible interactive element).
- Screenshots: `docs/touch-audit/evidence/layout/<viewport>__<state>.png` (103 files).
- Scripts: `docs/touch-audit/scripts/target-audit.js` (measures) and `docs/touch-audit/scripts/target-audit-summarize.js` (prints tables).

## How to re-run

```bash
node scripts/dev-server.js 8414 &                       # any free port
node docs/touch-audit/scripts/target-audit.js --port 8414
#   --only iphone-portrait,ipad-landscape   limit viewports
#   --states default,modal-export           limit states
#   --no-shots                              skip screenshots
node docs/touch-audit/scripts/target-audit-summarize.js [viewport-id]
```

A full run takes about 12 minutes. Each state loads on a fresh browser context, so states do not leak into each other. To turn this into a regression test, assert on the `summary` block of each viewport. Good first assertions: `hOverflow === 0`, `defaultCanvasPct` above a floor, zero `covered` targets in `default`, and no `iosZoom` inputs.

### Method notes and limits

- **Targets.** These count as targets: `button`, `a[href]`, `input`, `select`, `textarea`, `summary`, ARIA widget roles, focusable `[tabindex]`, `[onclick]`, `contenteditable`, plus outermost `cursor:pointer` elements (a stand-in for JS click handlers). Nested candidates collapse to the outermost one. The unique-target counts below are deduplicated by CSS path across all states. Repeated rows (for example, every pen row) count once.
- **Size.** Size is the element's border box. That box is also the hit area, so a range input's 4 px box is the real touch height. The 14 px thumb paints outside that box but does not enlarge the hit area.
- **WCAG 2.5.8.** The script applies the spacing exception: a 24 px circle on the target's centre must not touch another target.
- **Covered.** `elementFromPoint` at the centre of the clipped visible box finds a different, unrelated element on top.
- **Canvas %.** A 48×48 grid of `elementFromPoint` samples. The value is the share of the viewport where a tap would land on `#main-canvas`.
- **Safe areas.** Chromium cannot emulate `env(safe-area-inset-*)` and always resolves it to 0. The script therefore flags targets inside the device's inset bands that no CSS rule using `env(safe-area-inset-<side>)` pads (checked with a CSSOM scan). Bands used: iPhone portrait top 59 / bottom 34; iPhone landscape left 59 / right 59 / bottom 21; iPad top 24 / bottom 20. These bands apply because `index.html` declares `viewport-fit=cover` + `apple-mobile-web-app-capable` + `black-translucent`. In home-screen (standalone) mode, content therefore draws under the status bar and the Dynamic Island.
- **Not covered.** Real iOS Safari behaviour (visual-viewport zoom, address-bar collapse, rubber-band) needs a device or the Xcode simulator to confirm.

## Per-viewport summary

| Viewport | Layout classes picked | Unique targets | < 44×44 (HIG) | < 24×24 | Fail WCAG 2.5.8 (after spacing) | Crowded (< 8 px gap) | Text inputs < 16 px | Covered at centre | Canvas % (default) | Horizontal overflow |
|---|---|---|---|---|---|---|---|---|---|---|
| iPad portrait 834×1210 @2 | `mobile-layout` | 233 | 88.4 % (206) | 23.2 % (54) | 5 | 132 | 26 | 7 | **22.2 %** | none |
| iPad landscape 1210×834 @2 | desktop (none) | 218 | 93.6 % (204) | 23.4 % (51) | 6 | 125 | 21 | 1 | 40.4 % | none |
| iPhone portrait 402×874 @3 | `mobile-layout phone-layout auto-collapsed` | 165 | 85.5 % (141) | 20.6 % (34) | 4 | 99 | 18 | 2 | 44.5 % | **+142 px in every state** (+326 px with Help menu open) |
| iPhone landscape 874×402 @3 | `mobile-layout` | 150 | 87.3 % (131) | 18.7 % (28) | 3 | 97 | 6 | 10 | **0.8 %** | none |

Distribution of the smaller target dimension (unique targets):

| Viewport | < 24 | 24–31 | 32–43 | ≥ 44 |
|---|---|---|---|---|
| iPad portrait | 54 | 134 | 18 | 27 |
| iPad landscape | 51 | 125 | 28 | 14 |
| iPhone portrait | 34 | 97 | 10 | 24 |
| iPhone landscape | 28 | 96 | 7 | 19 |

The typical control is 24–31 px tall. The skin is sized for a mouse. The only touch-sized controls are the `#tool-bar` tool buttons (44×44 in `mobile-layout`) and the `#touch-modifier-bar` keys (44 px tall in `mobile-layout`).

Canvas share by state (sampled unobstructed %):

| State | iPad P | iPad L | iPhone P | iPhone L |
|---|---|---|---|---|
| default | 22.2 | 40.4 | 44.5 | 0.8 |
| left pane open | 22.2 | 40.4 | 0 | 0.8 |
| bottom pane open | 16.0 | 34.1 | 21.4 | 0 |
| Document Setup | 22.2 | 40.4 | 9.4 | 0.8 |
| Text / Fill / Noise / Scene3D panel | ~21.5 | ~40.4 | 0 | ~0.8 |
| layer selected (handles) | 21.5 | 40.3 | 44.5 | 0.8 |

Pointer media: `(pointer: coarse)` matches and `(hover: hover)` does not on all four viewports. `#main-canvas` has `touch-action: none`. `body` and `html` have `overscroll-behavior: auto`, and no scroll container sets `overscroll-behavior: contain`.

## Layout issues

| ID | Severity | Viewport(s) | Issue | Evidence |
|---|---|---|---|---|
| LAY-001 | **Blocker** | iPhone portrait | **The menubar overflows the 402 px viewport by 142 px in every state.** `#btn-menu-view` (354–415), `#btn-menu-insert` (416–483) and `#btn-menu-help` (484–544) run past the right edge. Chromium grows the layout viewport to 544 px (`innerWidth` 544 vs `clientWidth` 402), so the page pans sideways. Opening View, Insert or Help widens it again, to 598 / 660 / 728 px. Insert and Help are unreachable without panning, and `#theme-toggle` is covered by `#btn-menu-view`. Viewport-relative overlays then size against 544 px: `#modal-overlay` is 0–544, the preset-save sheet is 544 px wide, and `.modal-card` is 512 px wide. The document also scrolls vertically by 309 px. | `iphone-portrait__default.png`, `__menu-help.png`, `__modal-preset-save.png` |
| LAY-002 | **Blocker** | iPhone landscape | **The canvas collapses to 874×44 px (0.8 % of the viewport).** In `mobile-layout` without `auto-collapsed`, the stacked header + top-anchored toolbar (3 rows) + context bar + bottom pane + 44 px modifier bar + status bar use up the 402 px height. `renderer.scale` goes **negative (−0.074)** and the HUD shows "−2 %". With a Text layer or a pen path, the draw throws `IndexSizeError: arc radius (−67.5) is negative`. Both panes also open by default as drawers. | `iphone-landscape__default.png`; `text-panel` / `pen-path-anchors` errors in JSON |
| LAY-003 | **Blocker** | iPad portrait (also iPhone landscape) | **Both side panes are open by default at 640–899 px widths and cover the tool bar.** `#tool-bar` Selection and Direct Selection buttons are covered by `#left-welcome-intro`. The Fill tool is covered by `#layer-search-input`. The context bar is clipped by both panes. The canvas is reduced to 22 % on a 10-inch screen. `workspace.js` deliberately keeps panes open in this band without a backdrop, and `mobile-layout` makes them absolute overlays, so the canvas centre is the only free area. | `ipad-portrait__default.png` |
| LAY-004 | **Major** | All, standalone mode | **Header, menus and top-of-pane controls sit in the top safe-area band without `env(safe-area-inset-top)` padding.** Only one rule pads the top inset (`body.mobile-layout #tool-bar`), but `#app-header` sits *above* the toolbar. Affected: the `#btn-menu-*` triggers, `#theme-toggle`, `#btn-pane-toggle-left/right` (y = 41), `#right-pane-tabs` (y = 38) and `#btn-close-settings` (y = 43). In home-screen mode on iPhone (59 px inset) these sit under the status bar and Dynamic Island. In iPhone landscape, right-edge controls (`#btn-add-layer`, `#btn-add-pen`, pen rows, the `#layer-add-menu` items) sit inside the 59 px right inset with no padding. | `safeUnprotected` in JSON |
| LAY-005 | **Major** | iPhone landscape | **The Export modal's header sits under the app header.** `.modal-card--export` starts at y = 16, `.header-main` covers its close button (centre hit = `div.header-main`), and `#export-modal-nav` "Output" is covered by `#export-modal-footer`. The color-picker modal's close button is outside the viewport (`inViewport: false`). Only the footer "Close" button can dismiss these modals. | `iphone-landscape__modal-export.png`, `__color-picker.png` |
| LAY-006 | **Major** | All | **Range sliders are 2–6 px tall hit boxes.** `.ctrl-slider` is 4 px, `#pen-list .pen-width` is 2 px and `#draw-order-input` is 6 px. The thumb paints at 14 px but is outside the hit box. This affects every parameter in the left pane, the paint-bucket fill controls, the export precision slider and the pen widths. The `(pointer: coarse)` rules in `components.css` do not enlarge them. | e.g. `#pb-fillDensity` 136×4, `.ctrl-slider` "Export precision" 706×4 |
| LAY-007 | **Major** | All | **Text inputs and selects use an 11 px font, which makes iOS zoom the page on focus.** Count: 26 / 21 / 18 / 6 per viewport. Examples: `#layer-search-input`, `#generator-module` (select), the numeric chips beside every slider (`*-chip`), `#paint-bucket-pen`, `.pen-width-value`, and the Petal Designer numeric fields. Only `.color-modal-hex` and the preset-save name input are ≥ 16 px. | `iosZoom` in JSON |
| LAY-008 | **Major** | iPad portrait/landscape, iPhone portrait | **The Petal Designer pop-out window does not fit.** It is 720×1178 at y = 266 on iPad portrait and 720×802 at y = 62 on iPad landscape (bottom 864 > 834). Its header controls are 26–34 px. The inline designer is 1,319–1,326 px tall inside the left pane, which is a long nested scroll. | `*__petal-designer-window.png` |
| LAY-009 | **Major** | iPad landscape | **iPad landscape gets the desktop layout (no `mobile-layout`) although the pointer is coarse.** Tool buttons drop below 44 px (all 15 toolbar targets < 44). `#touch-modifier-bar` keys are 51×30 in a floating pill that covers the canvas top. Pane resizers stay mouse-sized. The layout switch uses only `innerWidth < 900`, with no `pointer: coarse` input. | `ipad-landscape__default.png` |
| LAY-010 | Minor | All | No scroll container sets `overscroll-behavior: contain`. Examples: `#left-panel-content` (scrollHeight 4,442), `#gm-module-menu`, `#export-settings-scroll`, `.modal-card--help`, `#petal-designer-window`. Scroll chaining reaches `body` (`overscroll-behavior: auto`). On iPhone portrait the document itself scrolls (see LAY-001), so a flick at the end of a panel pans the whole app. | `scrollers` in JSON |
| LAY-011 | Minor | iPhone portrait | The left drawer is 290 px wide on a 402 px screen, and its only close control is the 28×28 `<` (`#btn-pane-toggle-left`). The backdrop tap does close it. The toolbar drag handle covers `#btn-pane-toggle-left/right` at their centre points. | `covered` list |
| LAY-012 | Minor | All | Document Setup (`#settings-panel`) is a 290 px drawer. Its close button `#btn-close-settings` is 24×24, 2 px from the header on iPhone portrait. The section headers are 289×30 with a 1 px gap. | `*__modal-document-setup.png` |
| LAY-013 | Minor | iPhone/iPad portrait | The preset-save sheet docks at the bottom (good), but **Save is 38.7×24 and Cancel is 54.7×26**, placed at the top of the sheet. | `*__modal-preset-save.png` |

### Canvas handle and anchor hit radii

These values come from probing the renderer's own hit tests (`hitHandle`, `_hitControlInAnchors`). They are constant in screen pixels at every zoom, because world tolerances are divided by `renderer.scale`. No branch enlarges them for `pointerType === 'touch'`.

| Handle | Hit radius (CSS px) | Diameter | vs 44 px |
|---|---|---|---|
| Resize corner / edge midpoint (`RESIZE_R`) | 10 | 20 | 45 % |
| Rotate zone outside a corner (`ROTATE_R`) | 28 | 56 | OK |
| Path anchor (direct select / pen) | 6 | 12 | 27 % |
| Bezier in/out handle | 5 | 10 | 23 % |
| 3D orbit centre / yaw–pitch markers | 5 / 9 | 10 / 18 | 23 % / 41 % |

At iPhone landscape scale (−0.074), the selection box has negative width and the edge-midpoint zone is 0, so handles cannot be used (see LAY-002).

## Worst offenders by component

Sizes are CSS px, w×h. "Gap" is the edge distance to the nearest unrelated target.

**Range sliders (all panels): Blocker for touch use**
- `.ctrl-slider` (all algorithm parameters, `#pb-fillDensity`, `#pb-fillPadding`, `#pb-fillShiftX/Y`, `#paint-bucket-sensitivity`): 136–212 × **4**
- `#pen-list .pen-width`: 90 × **2**
- `#draw-order-input`: 233 × 6
- Export "Export precision" `.ctrl-slider`: 706 × 4 (iPad P), 274 × 4 (iPhone P)

**Toolbar (`#tool-bar`)**
- `.toolbar-footer` `.toolbar-pin-btn` / `.toolbar-home-btn` / `.toolbar-rotate-btn`: **13×13**, gaps 0–2 px. These fail WCAG 2.5.8 even with the spacing exception, on all viewports.
- "More primitives" flyout caret: 16×49 (fails 2.5.8).
- Tool buttons on iPad landscape (desktop layout): < 44 on all 15.

**Context bar (`.ctxbar`)**
- `.ctxbar-handle` 16×26 (fails 2.5.8 on iPad landscape), `.ctxbar-text-size-caret` 18×26 with a 0 px gap (fails), `.ctxbar-overflow` 30×22, `.pen-chip` 24×24, labelled buttons 26 px tall with 2 px gaps.

**Right pane, Pens**
- `.pen-color` (native color input) 14×14, `.pen-remove` 18×18, `.pen-width-value` 40×20 (11 px font), `#btn-add-layer` 79.6×24, `#layer-search-input` 71×20 (11 px font).
- Draw-order bar: `#draw-order-overlay-toggle` and `#draw-order-color-settings` 18×18, 7 px gap.

**Modals**
- `.export-info-btn` 15×15; `label.sw-toggle` switches 30×16 (Export, Noise Rack, Petal Designer); `.modal-close` 24×24; `#export-legend-gear` 22×22.
- Color picker `.color-modal-hex` 20 px tall.
- Help modal `.help-platform-btn` 55×26 with a 0 px gap.

**Menus (`.top-menu-panel`, `#layer-add-menu`)**
- Every menu item is 242×30 with 0–2 px row gaps (34–35 of 36 crowded). Top-level triggers are 54–71 × 26 with a 1 px gap.

**Document Setup (`#settings-panel`)**
- `#btn-close-settings` 24×24; `.sect-hdr` 289×30 with a 1 px gap; `#theme-family-modern/classic` 131×30 with a 0 px gap.

**Left pane / Noise Rack / Petal Designer**
- `.noise-grip` 14×20; `.info-btn` 16×16; `#algo-about-close` 16×16; `.petal-popin` 28×26, `.petal-close` 26×26, `.petal-tool-btn` 34×26.
- Bottom-of-pane controls sit under `#touch-modifier-bar` on iPhone landscape. `#paint-bucket-pen`, a Noise Rack `.info-btn` and the Petal Designer lock toggle are covered by `button.touch-mod-btn`.

**Bottom pane**
- `#btn-pane-toggle-bottom` 28×28 (the only way to open the formula pane).

## Top 5 to fix first

1. **LAY-002:** the iPhone landscape canvas collapses to 44 px, the scale goes negative, and the renderer throws. Use `auto-collapsed` (closed drawers) when height < ~500, and remove the top-anchored toolbar rows. Clamp `renderer.scale` > 0.
2. **LAY-001:** the iPhone portrait menubar overflows by 142 px, which pans the page and makes Insert/Help unreachable. Collapse the menubar into one overflow menu below ~600 px, and add `overflow-x: clip` on the header.
3. **LAY-003:** iPad portrait panes cover the toolbar and leave 22 % canvas. Default to closed drawers with a backdrop when the pointer is coarse.
4. **LAY-006 / LAY-007:** sliders have 2–6 px hit boxes, and inputs use 11 px fonts that trigger iOS zoom. Under `(pointer: coarse)`, give `input[type=range]` a ≥ 28–44 px box, and set text inputs/selects to `font-size: 16px`.
5. **LAY-004 / LAY-005:** add safe-area padding to `#app-header` and to fixed modals, and keep modal headers below the app header so close buttons stay reachable.
