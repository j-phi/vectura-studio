# Vectura Studio

Vectura Studio is a physics-inspired vector generator for plotter-ready line art. It is deliberately no-build: open `index.html` in a browser and everything runs with modular JavaScript and Tailwind loaded via CDN.

## Highlights
- Plotter-first output in millimeters with machine profiles (A3, A4, AxiDraw V3).
- Layered generation with visibility toggles, ordering, and per-layer stroke/line-cap settings.
- Seeded, repeatable results with live transform controls (position, scale, rotation).
- Switching algorithms restores transform defaults for the selected algorithm (position/scale/rotation do not carry over).
- Collapsible left-panel sections with persisted state: `Algorithm` (including a nested `Transform & Seed` sub-panel, collapsed by default), `Algorithm Configuration`, and `Optimization`.
- ABOUT card is visible by default, toggled by the Algorithm info button, and remembered in saved UI preferences.
- Direct canvas manipulation: drag to move the selected layer, drag corner handles to resize, rotate via the upper-right handle, and double-click to rename layers.
- Multi-selection: shift-click ranges in the layer list, Cmd/Ctrl-click to toggle, or drag a marquee, then move/rotate the group together.
- Cmd/Ctrl+A selects all drawable layers from anywhere in the app (outside text inputs).
- Layer grouping/ungrouping via Cmd/Ctrl+G and Cmd/Ctrl+Shift+G.
- Desktop menu bar is anchored beside `VECTURA.STUDIO` with Illustrator-style shortcuts for Open/Save/Import/Export/Settings/Reset View/Help.
- Top menu dropdowns render as overlays above the canvas/panes so File/Edit/View/Help menus are never clipped by the header.
- Illustrator-style tool bar with selection, direct selection, hand, pen (bezier), and scissor tools (V/A/Space/P/C). Press V/P/C again to cycle subtools.
- Pen long-press subtool menu with Illustrator-style modes and shortcuts (P, +, -, Shift+C).
- Direct path editing for individual line endpoints and bezier handles.
- Expand any layer into per-line sublayers for fine-grained selection and pen assignment.
- Tablet/touch parity: pointer-native canvas interactions, one-finger tool input, two-finger pan/pinch zoom, and touch modifier buttons (`Shift`, `Alt`, `Meta`, `Pan`).
- Alignment guides for canvas center and size matching while dragging.
- Guide visibility and snapping toggles in Settings (Cmd while dragging overrides snapping).
- Optional 10mm grid overlay toggle in Settings for layout alignment.
- Auto-colorization for active/selected/all layer scopes with `None` reset mode, one-shot Apply, and Continuous Apply Changes (continuous updates now re-run correctly while editing pens/palettes, and manual Apply supports chaining one method and then another when continuous is off).
- Optional cookie-backed UI preference persistence from Settings.
- In-app help guide and shortcut menu (press `?`).
- Mobile-first responsive shell for small phones (including iPhone mini): touch-friendly `File/Edit/View/Help` top menus, bottom-docked tool rail, and slide-over side drawers for Generator/Layers panels; right-panel sections now scroll independently on short screens (including the Pens section), and collapsed side panes keep a visible edge tab on very small phones.
- Parameter randomization and simplification controls with live line/point counts.
- Algorithm-aware randomization bias for Shape Pack, Petalis, Rainfall, and Lissajous (strong defaults with occasional outliers).
- Reset to Defaults now restores full algorithm defaults, including transform values (seed, position, scale, rotation).
- Double-click any value to edit it inline, and double-click a control to reset to defaults.
- Fast duplication and nudging: Cmd/Ctrl+D duplicates selection, Alt-drag (Option-drag) to duplicate, arrow keys to nudge (Shift for larger steps).
- Configurable undo with Cmd/Ctrl+Z and adjustable history depth.
- Multiple algorithm families (flowfields, lissajous, harmonograph, wavetable, rings, topo, boids, attractors, hyphae, shape pack).
- Harmonograph pendulum list with add/delete/toggle controls and optional guide overlay.
- Harmonograph anti-loop controls (frequency drift + settle cutoff) and a Virtual Plotter preview with playhead scrubbing and speed presets.
- Rainfall generator with wind, droplet styling, and optional silhouette masking.
- Wavetable noise stack with per-noise blend modes, tile patterns, image effects, polygon noise, and drag-to-reorder layers.
- Petalis generator with radial petals, editable inner/outer designer curves, shading, modifier stacks, and 20 named presets (plus an in-dev light source marker). Hatch Angle rotates shading strokes in place inside petals rather than shifting shading placement on the canvas.
- Petalis algorithm with an embedded full Petal Designer panel in the parameter stack (shape comes from visible designer curves, without hidden legacy tip/base modifiers).
- Petal Designer inline editor and pop-out window use high-DPI rendering with immediate canvas updates, always-on dual-ring controls (`Inner Petal Count`/`Outer Petal Count` plus `Split Feathering`), a `PETAL VISUALIZER` pane with `Overlay` / `Side by Side`, a `PROFILE EDITOR` (`Inner Shape`/`Outer Shape`) with per-side profile import/export and a shared `Export Pair` action below both cards, and matching `Shading Stack` + `Modifier Stack` controls where each card has its own `Petal Shape` target (`Inner`/`Outer`/`Both`). The inline panel can pop out (⧉) and pop back in (↩) while keeping the exact same controls and layout.
- Petalis profile transitions: `Inner = Outer` lock plus count-driven ring boundary and split feathering to morph from innermost to outermost petal profiles.
- Petal Designer interactions include direct/pen anchor editing with modifier support (`Shift` constrain, `Alt/Option` convert, break, or remove handles, `Cmd/Ctrl` temporary direct), plus middle-drag pan and wheel zoom (when both petals are visible, wheel zoom updates both equally).
- Petalis layering now clips petals across both rings when `Layering` is enabled, preventing see-through overlaps.
- Petal Designer shading preview now reflects the full shading parameters (coverage, gaps, line style, jitter, angle, per-card targets, and stack enable/disable) without legacy radial fallback in designer mode.
- Custom Petalis preset reset now clears shading (`shadings=[]`) instead of re-enabling legacy shading toggles.
- Pen palette with assignable colors/widths, reorderable list, drag-to-assign per layer or selection, double-click-to-apply on selected layers, plus palette selection, collapsible panel controls, and add/remove actions.
- Plotter optimization slider to remove fully overlapping paths per pen before export.
- Optimization pipeline (linesimplify, linesort, filter, multipass) with scope selection, preview overlays, and export toggle.
- One-click SVG export with configurable precision and grouping by pen assignment.
- Live formula display and estimated pen distance/time.

## Gallery
Sample outputs included in `assets/gallery/`. 

| Flowfield | Boids | Attractor |
| --- | --- | --- |
| ![Flowfield sample](assets/gallery/flowfield-sample.svg) | ![Boids sample](assets/gallery/boids-sample.svg) | ![Attractor sample](assets/gallery/attractor-sample.svg) |

## Quick Start
Option A - open directly:
- Double-click `index.html`.

Option B - serve locally:
```bash
python -m http.server
```
Then visit `http://localhost:8000`.

For automated tests:
```bash
npm install
```
If your Node runtime does not support Unicode regex property escapes (for example, some Node `18.16.x` builds), run:
```bash
npm run patch:test-runtime
```

## Testing
- `npm run test:unit` - deterministic unit coverage for RNG/noise, algorithms, and shared utility helpers.
- `npm run test:integration` - engine workflow integration coverage (layer lifecycle, optimization pipeline, state roundtrip, deterministic export).
- `npm run test:e2e` - Playwright smoke tests on desktop + tablet-touch Chromium.
- `npm run test:visual` - SVG baseline regression checks (`tests/baselines/svg`).
- `npm run test:visual:screenshots` - optional Playwright screenshot snapshot checks for high-risk UI shells.
- `npm run test:perf` - stress/performance checks for generation and optimization.
- `npm run test:ci` - PR-gating suite (`unit + integration + e2e`).
- `npm run test:update` - updates visual SVG baselines (requires review before commit).
- Vitest config is in `vitest.config.mjs`; Playwright config is in `playwright.config.js`.

CI lives in `.github/workflows/test.yml`:
- Pull requests: unit, integration, and e2e smoke.
- `main` + nightly: visual regression and perf stress lanes.
- CI install steps run with `--no-audit --no-fund --loglevel=error` to keep test logs focused on failures.

## How to Use
1. Pick an algorithm in the left panel and adjust its parameters.
2. Expand `Transform & Seed` inside the Algorithm panel, then use transform controls (seed, position, scale, rotation) to nudge the layer.
3. Use Post-Processing Lab for smoothing/curves/simplify plus optional optimization passes and preview.
4. Manage layers on the right: add, reorder (drag the grip), duplicate, hide, rename (double-click), expand into sublayers, and assign pens (drag a pen onto a layer to apply to the selection).
5. Use Settings for machine size, margin, truncation, margin guides, stroke, background, SVG precision, auto-colorization, and optional cookie preference saving.
6. Save/Open full projects via .vectura files, or import SVGs as new layers.
7. Switch to the Petalis algorithm to use the embedded inline designer panel, then use ⧉ to pop it out into a floating window or ↩ to dock it back in. In Petalis, petal shape is driven by visible inner/outer designer curves, always-on inner/outer count + split controls, a `PETAL VISUALIZER` (`Overlay` / `Side by Side`), a `PROFILE EDITOR` with per-side profile import/export controls plus a shared `Export Pair` button below both profile cards, and `Shading Stack` + `Modifier Stack` cards where each entry has its own `Petal Shape` target (`Inner`/`Outer`/`Both`) plus symmetry controls.
8. Export from `File > Export SVG`.

Pan: Shift + Drag. Zoom: Mouse Wheel. Touch: one-finger tool input, two-finger pan/pinch zoom. On phones, use the top `File/Edit/View/Help` menu bar, then open Generator/Layers with pane toggles (including edge tabs) and expand/collapse the Model panel with the floating Model button. Move layer: Drag. Resize layer: Drag corner handles. Rotate: Drag the upper-right handle (Shift snaps). Duplicate: Alt-drag. Expand: Cmd/Ctrl + E. Pen tool: click to add points, click-drag for bezier curves (Shift constrains, Alt breaks handles), double-click near the first point to close, Enter commits, Esc cancels. Pen subtools: `+` add anchor, `-` delete anchor, `Shift+C` convert anchor. Direct tool (`A`) edits endpoints and handles on individual line paths. Scissor tool: drag a line/rect/circle to split intersecting paths. Petal Designer adds middle-drag panning, wheel zoom-to-cursor (both visible petals zoom together), and Illustrator-style `Shift`/`Alt`/`Cmd/Ctrl` editing modifiers.

## Algorithm Library
Each layer is powered by an algorithm with its own parameters and formula preview:
- Flowfield: noise-driven vector fields with selectable noise types, octaves, and minimum-length filtering.
- Boids: emergent flocking paths.
- Attractors: Lorenz-like and chaotic systems.
- Hyphae: branching, growth-like structures.
- Lissajous: harmonic parametric curves.
- Harmonograph: multi-pendulum curves with damping, anti-loop drift, settle cutoff, and an interactive plotter preview.
- Wavetable: layered noise wave stacks with multiple noise types, image effects, and polygon shaping.
- Rings: concentric rings with noise-modulated radii.
- Topo: contours extracted from a noise-based height field, with mapping modes preserving closed contour loops to avoid seam gaps.
- Rainfall: rain traces with droplet shaping, wind, and silhouette/ground controls.
- Petalis: radial petal structures with presets and embedded inner/outer curve editing, always-on dual inner/outer rings, a `PETAL VISUALIZER` (`Overlay` / `Side by Side`), a per-side `PROFILE EDITOR` with import/export support plus a shared `Export Pair` action below both cards, matching shading/modifier stacks with per-card `Petal Shape` targeting (`Inner`/`Outer`/`Both`), count-driven transition/split-feather controls, and a collapsible randomness/seed panel (defaults: `radialGrowth` 0.05), with shape controlled by visible designer curves instead of hidden legacy tip/base modifiers.
- Spiral: includes optional closure for looping the outer end back into the spiral.
- Shape Pack: circle/polygon packing with perspective controls.

Defaults live in `src/config/defaults.js` and descriptions in `src/config/descriptions.js`.

## Architecture
```mermaid
flowchart LR
  HTML[index.html] --> Main[src/main.js]
  Main --> App[src/app/app.js]

  App --> UI[src/ui/ui.js]
  App --> Engine[src/core/engine.js]
  App --> Renderer[src/render/renderer.js]

  UI --> Controls[Panels & Controls]
  UI --> Export[SVG Export]
  Renderer --> Canvas[(Canvas)]

  Engine --> Layer[src/core/layer.js]
  Engine --> Algorithms[src/core/algorithms/index.js]
  Engine --> RNG[src/core/rng.js]
  Engine --> Noise[src/core/noise.js]

  Config[src/config/*.js] --> UI
  Config --> Engine
  Styles[styles.css] --> HTML
```

## Project Structure
- `index.html` - app shell, Tailwind CDN config, and script order.
- `styles.css` - custom UI styling and texture effects.
- `src/app/` - application orchestration and lifecycle.
- `src/core/` - vector engine, layers, RNG/noise, and algorithms.
- `src/core/geometry-utils.js` - shared path smoothing/simplification and cloning helpers.
- `src/core/optimization-utils.js` - shared path length/sort/offset helpers used by optimization flow.
- `src/core/algorithms/*.js` - one file per algorithm, with `src/core/algorithms/index.js` assembling the registry exposed to the engine.
- `src/render/` - canvas rendering and view transforms.
- `src/ui/` - panels, controls, settings, and SVG export.
- `src/ui/randomization-utils.js` - shared parameter randomization engine with algorithm-specific bias profiles.
- `src/config/` - machine profiles, defaults, UI descriptions, palette library, and cross-system preset registry.
- `src/config/petal-profiles/` - project profile JSON library ingested by Petalis (`index.json` + `.json` profile files), including the default profile shapes used to populate Petal Designer PROFILE dropdowns.
- `tests/` - unit, integration, e2e smoke, visual baseline, and performance suites.
- `docs/testing.md` - testing workflow details, baseline policy, and CI behavior.
- `dist/` - optional prebuilt output (not required for local dev).

## Customization Tips
- Add new algorithms by creating `src/core/algorithms/<algorithm>.js`, registering it in the algorithm registry, and wiring defaults/UI in `src/config/` and `src/ui/ui.js`.
- Machine sizes live in `src/config/machines.js` and are used for bounds and export dimensions.
- Pen palettes live in `src/config/palettes.js` and can be edited or extended.
- Presets live in `src/config/presets.js` as a shared registry; each entry requires `preset_system`, `id`, `name`, and `params`.
- Petalis profile files are loaded from `src/config/petal-profiles/*.json` (listed in `src/config/petal-profiles/index.json`) to populate Petal Designer PROFILE dropdowns.
- Post-Processing Lab includes smoothing/curves/simplify plus the optimization pipeline (linesimplify, linesort, filter, multipass).
- Keep script order intact in `index.html`; `src/main.js` expects globals to be registered on `window.Vectura`.

## Deployment (GitHub Pages)
1. Push this repo to GitHub.
2. In Settings > Pages, set Source to "Deploy from a branch".
3. Select your branch (for example, `main`) and the root (`/`) folder.

All asset paths are relative (`./...`), so the site works under a GitHub Pages subpath.
