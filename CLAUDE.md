# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mandatory Reading

**Always read `AGENTS.md` first.** It is the repository-level contributor guideline and takes precedence over this file. `docs/agentic-harness-strategy.md` is the source-of-truth for agentic workflow, testing matrix, and documentation contracts.

## Testing Discipline

- Always run the full test suite before committing (target: all tests passing, e.g., 741/936/950 tests)
- Use Red-Green-Refactor (RGR): write a failing regression test FIRST when fixing bugs, then verify it fails, fix the code, verify it passes
- After any CSS or layout change, also run e2e/visual tests to catch z-index, media query, and specificity regressions

## Commit Hygiene

- Before staging, run `git status` and explicitly list files to be included; never `git add -A` if there is unrelated WIP
- If unrelated WIP files are present, stop and ask the user before proceeding
- Always commit AND push in the same step unless told otherwise; do not refuse to push to main if the user has confirmed it is safe

## CSS & Layout Rules

- Prefer container queries over viewport media queries for panel/component-level responsiveness
- When changing CSS, audit for specificity conflicts and pre-existing rules that could override the new styles (grep for the selector first)
- For collapse/expand animations, avoid `display:none` ↔ `max-height` swaps (causes visual gap); use `max-height + visibility` or `grid-template-rows` transitions instead
- **All CSS lands in the skin system at `src/ui/skin/`.** The legacy `styles.css` was deleted in v1.1.10 as the final step of the Meridian cleanup chain; there is no other CSS surface. New panel/component/feature rules go in `src/ui/skin/components.css`; motion/transition rules in `src/ui/skin/motion.css`; new design tokens/CSS variables in `src/ui/skin/tokens.css`. Per-skin palette overrides live in the relevant `src/ui/skin/<skin>.css` file.

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
npm run test:ci                # full PR-gating suite (unit + integration + e2e + visual + perf)
npm run test:update            # regenerate SVG baselines

# Maintenance
npm run version:sync           # sync package.json version → src/config/version.js + index.html badge
npm run profiles:bundle        # rebuild Petal profile library from JSON
```

Node 18+ required. `package.json` is the canonical version source — run `version:sync` whenever the version changes.

**Versioning:** Use plain semver patch increments — `0.8.9` → `0.8.10` → `0.8.11`. Never reset the patch digit after 9; the third number is unbounded (no rollover to a new minor).

## Testing Matrix

| Change class | Minimum checks |
|---|---|
| Core logic / algorithm behavior | `test:unit` + `test:integration` + `test:visual` |
| Export / serialization | `test:unit` + `test:integration` + `test:e2e` |
| UI interaction behavior | `test:integration` + `test:e2e` |
| Rendering output or baselines | `test:visual` (+ `test:perf` for heavy paths) |
| Docs-only | Link/path sanity review only |
| Any PR / full confidence | `test:ci` (unit + integration + e2e + visual + perf) |

## Pre-Commit Validation (Red–Green–Refactor)

**Before every commit, validate that every behavior change is covered by tests and that all tests pass.** This is non-negotiable — CI does not retroactively un-break a commit, and a green-locally-only refactor will silently regress a stale test.

For every change, follow Red–Green–Refactor:

1. **Red.** Identify or write a test that *currently fails* without your change and would catch a regression. For pure refactors with no behavior change, confirm the existing tests already exercise the touched paths; if they don't, add coverage first.
2. **Green.** Make the change. The new/affected test must pass.
3. **Refactor.** Clean up. All tests still pass.

**Mandatory pre-commit checklist** — run before `git commit`:

- [ ] Run the suites required by the [Testing Matrix](#testing-matrix) for your change class. For anything non-trivial, run `npm run test:ci`.
- [ ] Every behavior change has at least one test that **fails without the change and passes with it** (RGR proof). UI-only changes get integration or e2e coverage; renderer/algorithm changes get unit coverage.
- [ ] When a test fails after a refactor, decide deliberately:
  - **Stale assertion** (product behavior intentionally changed) → update the test to reflect the new contract; never delete coverage to "make it pass."
  - **Real regression** → fix the source. Do not silence the test.
- [ ] No skipped or `.only` tests left in the diff.
- [ ] If you removed a public API/method that tests called, update the tests to use the replacement API in the same commit. Don't leave orphaned `TypeError: app.ui.foo is not a function` failures for the next push.

Do **not** rely on CI to surface failures — run the relevant suite locally first. If a CI run on a previous commit is already red, treat fixing it as a blocker for any new commit on the branch.

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

**User presets:** Place `.vectura` files in `user-presets/<layer_type>/` — the directory name must exactly match the layer `type` / `preset_system` value, including camelCase (e.g. `shapePack`, `svgDistort`, `petalisDesigner`). Run `npm run user-presets:bundle` to regenerate `src/config/user-presets.js`. When adding a new algorithm, create its `user-presets/<layer_type>/` directory (with a `.gitkeep`) at the same time.

## Coding Style

- 2-space indentation, LF line endings, trim trailing whitespace (`.editorconfig`)
- Vanilla JS, IIFE modules, `window.Vectura` namespace pattern
- PascalCase for classes, camelCase for methods/variables, lowercase filenames
- Keep semicolons and formatting consistent with nearby files

## Agent Delegation Rules

**Spawn an Explore subagent for:**
- Any open-ended file search where the location is unknown
- Multi-file grep spanning more than 3 files
- Architecture questions touching more than 2 subsystems
- "Where is X implemented?" questions

**Use direct tools (Glob/Grep/Read) for:**
- Reading a known file path
- Searching for a specific known symbol
- Single-file reads or targeted lookups

Always specify thoroughness when spawning Explore agents: `quick` (targeted lookup), `medium` (moderate scan), or `very thorough` (comprehensive cross-codebase analysis).

**Knowledge graph:** After `graphify .` has been run, read `graphify-out/GRAPH_REPORT.md` before any broad file search — navigate by god-nodes and community clusters rather than raw grep.

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

## README Standards

The README is the primary human-facing document. Follow these conventions so it stays readable as the project grows:

- **Top-level sections are scannable.** Limit top-level prose to a short paragraph + ≤5 bullets. Move exhaustive detail into a `<details><summary>Full feature list</summary>` panel beneath.
- **Feature groups, not flat lists.** Organize features into logical groups (Layers & Modifiers, Canvas & Tools, Algorithms, Export, UI & Workflow, Mobile). Each group gets one paragraph at the top level and an expandable detail panel for the full list.
- **Algorithm library is a table.** Use a Markdown table (Algorithm | Description) — not a bullet list.
- **Testing commands are a table.** Use a Markdown table (Command | Purpose) — not a bullet list. Keep the testing matrix table beside it.
- **Keyboard shortcuts live in a `<details>` table.** Never embed shortcuts as inline run-on prose.
- **Release notes:** 3 most recent releases inline; all prior releases in `<details><summary>Older releases (0.6.x and earlier)</summary>`.
- **Reference-only content in `<details>` panels:** project structure, architecture diagrams, workflow docs list, extension guide.
- **Gallery near the top.** Keep the gallery table immediately after the intro paragraph.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- The pre-commit hook (`scripts/hooks/pre-commit`) auto-runs graphify AST update and stages output before every commit — no manual `graphify update .` needed
