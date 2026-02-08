# Vectura Studio

Vectura Studio is a physics-inspired vector generator for plotter-ready line art. It is deliberately no-build: open `index.html` in a browser and everything runs with modular JavaScript and Tailwind loaded via CDN.

## Highlights
- Plotter-first output in millimeters with machine profiles (A3, A4, AxiDraw V3).
- Layered generation with visibility toggles, ordering, and per-layer stroke/line-cap settings.
- Seeded, repeatable results with live transform controls (position, scale, rotation).
- Direct canvas manipulation: drag to move the selected layer, drag corner handles to resize, rotate via the upper-right handle, and double-click to rename layers.
- Multi-selection: shift-click ranges in the layer list, Cmd/Ctrl-click to toggle, or drag a marquee, then move/rotate the group together.
- Layer grouping/ungrouping via Cmd/Ctrl+G and Cmd/Ctrl+Shift+G.
- Expand any layer into per-line sublayers for fine-grained selection and pen assignment.
- Canvas shortcut overlay that stays above the formula panel (toggleable in Settings).
- Alignment guides for canvas center and size matching while dragging.
- Guide visibility and snapping toggles in Settings (Cmd while dragging overrides snapping).
- In-app help guide and shortcut menu (press `?`).
- Parameter randomization and simplification controls with live line/point counts.
- Double-click any value to edit it inline, and double-click a control to reset to defaults.
- Fast duplication and nudging: Alt-drag (Option-drag) to duplicate, arrow keys to nudge (Shift for larger steps).
- Configurable undo with Cmd/Ctrl+Z and adjustable history depth.
- Multiple algorithm families (flowfields, lissajous, harmonograph, wavetable, rings, topo, boids, attractors, hyphae, shape pack).
- Harmonograph pendulum list with add/delete/toggle controls and optional guide overlay.
- Rainfall generator with wind, droplet styling, and optional silhouette masking.
- Wavetable noise stack with per-noise blend modes, image-based noise input, and drag-to-reorder layers.
- Pen palette with assignable colors/widths, reorderable list, drag-to-assign per layer or selection, plus palette selection and add/remove controls.
- Plotter optimization slider to remove fully overlapping paths per pen before export.
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

## How to Use
1. Pick an algorithm in the left panel and adjust its parameters.
2. Use the transform controls (seed, position, scale, rotation) to nudge the layer.
3. Manage layers on the right: add, reorder (drag the grip), duplicate, hide, rename (double-click), expand into sublayers, and assign pens (drag a pen onto a layer to apply to the selection).
4. Use Settings for machine size, margin, truncation, margin guides, stroke, background, and SVG precision.
5. Export with the [EXPORT SVG] button.

Pan: Shift + Drag. Zoom: Mouse Wheel. Move layer: Drag. Resize layer: Drag corner handles. Rotate: Drag the upper-right handle (Shift snaps). Duplicate: Alt-drag. Expand: Cmd/Ctrl + E.

## Algorithm Library
Each layer is powered by an algorithm with its own parameters and formula preview:
- Flowfield: noise-driven vector fields with selectable noise types, octaves, and minimum-length filtering.
- Boids: emergent flocking paths.
- Attractors: Lorenz-like and chaotic systems.
- Hyphae: branching, growth-like structures.
- Lissajous: harmonic parametric curves.
- Harmonograph: multi-pendulum curves with damping and frequency control.
- Wavetable: layered noise wave stacks with multiple noise types.
- Rings: concentric rings with noise-modulated radii.
- Topo: contours extracted from a noise-based height field.
- Rainfall: rain traces with droplet shaping, wind, and silhouette/ground controls.
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
- `src/render/` - canvas rendering and view transforms.
- `src/ui/` - panels, controls, settings, and SVG export.
- `src/config/` - machine profiles, defaults, UI descriptions, and palette library.
- `dist/` - optional prebuilt output (not required for local dev).

## Customization Tips
- Add new algorithms by extending `src/core/algorithms/index.js` and wiring defaults/UI in `src/config/` and `src/ui/ui.js`.
- Machine sizes live in `src/config/machines.js` and are used for bounds and export dimensions.
- Pen palettes live in `src/config/palettes.js` and can be edited or extended.
- Keep script order intact in `index.html`; `src/main.js` expects globals to be registered on `window.Vectura`.

## Deployment (GitHub Pages)
1. Push this repo to GitHub.
2. In Settings > Pages, set Source to "Deploy from a branch".
3. Select your branch (for example, `main`) and the root (`/`) folder.

All asset paths are relative (`./...`), so the site works under a GitHub Pages subpath.
