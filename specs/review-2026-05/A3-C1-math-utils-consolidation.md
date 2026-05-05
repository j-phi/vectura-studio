# A3 + C1 — Math utils consolidation

## Problem

`clamp`, `clamp01`, `lerp`, `frac`, `applyPad`, and `applyTile` are redefined locally across at least a dozen files (UI, modifiers, renderer, and most algorithm files). Drift is inevitable and a recent bug-class for the project. Consolidating into one IIFE module on `window.Vectura.AlgorithmUtils` removes ambiguity and shrinks the surface for future bugs.

## Files in scope

- `src/core/algorithm-utils.js` — **new file** (IIFE on `window.Vectura.AlgorithmUtils`).
- `index.html` — load `algorithm-utils.js` before engine and algorithms.
- Replace local definitions in: `src/ui/ui.js`, `src/ui/ui-petal-designer.js`, `src/ui/ui-auto-colorize.js`, `src/ui/ui-noise-rack.js`, `src/core/randomization-utils.js`, `src/core/modifiers.js`, `src/render/renderer.js`, and the algorithm files: `rainfall.js`, `wavetable.js`, `terrain.js`, `topo.js`, `phylla.js`, `petalis.js`, `lissajous.js`, `horizon.js`, `grid.js`, `flowfield.js` (and any other algorithm file with the same locals — sweep `src/core/algorithms/`).

## EARS requirements

- **REQ-1 (Ubiquitous):** The system shall expose `Vectura.AlgorithmUtils` with the functions `clamp(v, lo, hi)`, `clamp01(v)`, `lerp(a, b, t)`, `frac(v)`, `applyPad(t, pad)`, and `applyTile(nx, ny, mode, padding)`.
- **REQ-2 (Ubiquitous):** Each consumer file shall reference these utilities via `Vectura.AlgorithmUtils` (or a once-per-file local alias) rather than redefining them.
- **REQ-3 (Unwanted behavior):** If a consumer file holds a `clamp` / `clamp01` / `lerp` / `frac` / `applyPad` / `applyTile` whose signature is provably non-equivalent to the consolidated version, then the implementer shall leave it in place and document the exception in this spec's "Notes on exceptions" section in the PR description.
- **REQ-4 (Ubiquitous):** Behavior shall be byte-identical post-consolidation; visual baselines shall not move.

## Implementation notes

- Implementations (the canonical signatures):
  - `clamp(v, lo, hi)` → `v < lo ? lo : v > hi ? hi : v`
  - `clamp01(v)` → `clamp(v, 0, 1)`
  - `lerp(a, b, t)` → `a + (b - a) * t`
  - `frac(v)` → `v - Math.floor(v)`
  - `applyPad(t, pad)` and `applyTile(nx, ny, mode, padding)` — copy the most-common existing implementation; if multiple variants exist, pick the one used by `noise-rack.js` / `randomization-utils.js` and adapt the others to match.
- Add `<script src="src/core/algorithm-utils.js"></script>` in `index.html` before `engine.js` and the algorithms folder.
- For each consumer, top of file: `const { clamp, clamp01, lerp, frac, applyPad, applyTile } = Vectura.AlgorithmUtils;` (or destructure only what's used).
- Sweep with `grep -nE 'const (clamp|clamp01|lerp|frac|applyPad|applyTile) =' src/` after the change — should be empty except documented exceptions.
- Do not change call sites' arguments or order. Do not optimize hot loops.

## Out of scope

- Any signature change, even improvements.
- Adding new utility functions.
- Sanitization (`S1`), engine state (`B1-A6`), renderer precision (`B3`), noise rack (`A4`), tuning constants (`A5`).
- Removing utilities other than the six listed (e.g. `smoothstep`, `easeInOut`).
- Refactoring algorithm logic.

## Acceptance tests

- `tests/unit/algorithm_utils.test.js` (new) — each function returns expected values for a small fixture set (e.g. `clamp(5, 0, 3) === 3`, `lerp(0, 10, 0.25) === 2.5`, `frac(-0.25) === 0.75`).
- `npm run test:visual` — all baselines unchanged.
- `npm run test:unit` and `npm run test:integration` pass.
- Sweep assertion: `rg -nE '^\s*const (clamp|clamp01|lerp|frac|applyPad|applyTile)\s*=' src/` returns no matches outside `src/core/algorithm-utils.js` (or returns only documented exceptions).

## Done when

- [ ] `src/core/algorithm-utils.js` exists and is loaded in `index.html` before engine/algorithms.
- [ ] All listed consumer files use `Vectura.AlgorithmUtils` (or documented exception).
- [ ] Sweep grep returns no unexpected redefinitions.
- [ ] `npm run test:ci` passes with no baseline regeneration.
