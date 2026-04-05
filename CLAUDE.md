# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mandatory Reading

**Always read `AGENTS.md` first.** It is the repository-level contributor guideline and takes precedence over this file. `docs/agentic-harness-strategy.md` is the source-of-truth for agentic workflow, testing matrix, and documentation contracts.

## What This Project Is

Vectura Studio is a **no-build, browser-native** physics-inspired vector generator for plotter-ready line art. It uses vanilla JavaScript in an IIFE module pattern with `window.Vectura` namespace registration — there is no bundler, no transpilation, and no framework.

## Commands

```bash
# Run locally (two options)
python -m http.server          # serve at http://localhost:8000
# OR open index.html directly in a browser

# Tests
npm run test                   # unit + integration
npm run test:unit              # Vitest unit tests
npm run test:integration       # Vitest integration tests
npm run test:e2e               # Playwright smoke (desktop + tablet)
npm run test:visual            # SVG baseline regression
npm run test:perf              # performance/stress tests
npm run test:ci                # PR-gating suite (unit + integration + e2e)
npm run test:update            # regenerate SVG baselines

# Maintenance
npm run version:sync           # sync package.json version → src/config/version.js + index.html badge
npm run profiles:bundle        # rebuild Petal profile library from JSON
```

Node 18+ required. `package.json` is the canonical version source — run `version:sync` whenever the version changes.

## Testing Matrix

| Change class | Minimum checks |
|---|---|
| Core logic / algorithm behavior | `test:unit` + `test:integration` + `test:visual` |
| Export / serialization | `test:unit` + `test:integration` + `test:e2e` |
| UI interaction behavior | `test:integration` + `test:e2e` |
| Rendering output or baselines | `test:visual` (+ `test:perf` for heavy paths) |
| Docs-only | Link/path sanity review only |
| CI-gating confidence | `test:ci` |

## Architecture

### Module Loading

`index.html` is the app shell. Script load order matters: `src/config/` files must load before core, before UI/render, before `src/main.js`. All modules register on `window.Vectura` as IIFEs. `main.js` waits for the `load` event then instantiates `new App()`.

### Major Subsystems

**`src/app/app.js` — App (orchestrator)**
Bootstrap, theme switching, cookie-based preference persistence, and undo/redo history management. Entry point for all user actions.

**`src/core/engine.js` — VectorEngine**
Layer lifecycle and state, algorithm execution, display geometry pipeline (masking, modifiers), serialization/deserialization for `.vectura` project files, and document/machine setup.

**`src/core/algorithms/` — Algorithm Registry**
13+ algorithm implementations (flowfield, boids, attractors, hyphae, lissajous, harmonograph, wavetable, rings, topo, grid, rainfall, phylla, petalis, spiral, shapepack). Each exports `generate(params, rng)`. Central registry at `src/core/algorithms/index.js`.

**`src/render/renderer.js` — Renderer**
Canvas rendering with pan/zoom, multi-layer selection and transform handles (drag, resize, rotate), guide overlays, snapping, and touch/pointer interactions.

**`src/ui/ui.js` — UI**
Panel management, algorithm parameter controls, Petal Designer editor, SVG export with optimization pipeline, and file I/O (open/save `.vectura`, import SVG).

**`src/core/modifiers.js` — Modifiers**
Mirror modifier containers with per-axis show/hide, angle controls, and geometry reflection/clipping.

**`src/core/masking.js` + `src/core/path-boolean.js` — Masking**
Layer masking, silhouette capability detection, hidden geometry filtering.

**`src/core/noise-rack.js` — Noise Rack**
Universal multi-algorithm noise stacking system. New algorithm noise work must converge on this shared model — do not introduce algorithm-specific noise stacks.

**`src/core/optimization-utils.js` + `src/core/geometry-utils.js` — Optimization**
Path simplification (Visvalingam, Curve modes), line sorting for plotter efficiency, path offset, closure detection.

### Data Flow

```
index.html → main.js → App → VectorEngine + Renderer + UI
                                    ↓
                         Algorithm execution → Noise/RNG → Paths
                                    ↓
                         Display geometry (masking, modifiers)
                                    ↓
                         Optimization (simplify, sort, filter)
                                    ↓
                         Renderer (canvas display + SVG export)
```

### Configuration

All defaults, machine profiles, palettes, presets, and descriptions live in `src/config/`. Never hardcode values in UI or engine — put them in config. Cross-system presets belong in `src/config/presets.js` (not per-system files); use `preset_system` filtering in code.

**Preset naming:** `id` must be lowercase kebab-case prefixed by system: `<preset_system>-<preset-name>`.

## Coding Style

- 2-space indentation, LF line endings, trim trailing whitespace (`.editorconfig`)
- Vanilla JS, IIFE modules, `window.Vectura` namespace pattern
- PascalCase for classes, camelCase for methods/variables, lowercase filenames
- Keep semicolons and formatting consistent with nearby files

## Documentation Contracts

Every PR must assess whether these docs need updates:

| Change | Required doc updates |
|---|---|
| UI behavior / shortcuts / help | `README.md`, in-app help guide, in-app shortcut list, version increment |
| Feature capability | `README.md`, `plans.md`, `CHANGELOG.md` |
| Workflow / test policy | `docs/agentic-harness-strategy.md`, `AGENTS.md`, `docs/testing.md` |
| Any repository change | `plans.md`, `CHANGELOG.md`, README release notes; run `version:sync` if version changed |
| Hardening idea (not needed for beta) | Log in `docs/pre-release-hardening-log.md` as `PRH-###`; do not implement unless explicitly requested |

Architecture diagrams use Mermaid — update them when architecture meaningfully changes.
