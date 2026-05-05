# A5 — Algorithm tuning constants

## Problem

`rainfall.js` and `wavetable.js` carry inline magic numbers (noise scales, gust scales, spiral factors, hex ratios, padding limits, default zooms) that should live in `src/config/` per CLAUDE.md ("Never hardcode values in UI or engine — put them in config"). Centralizing them gives presets, tests, and future tuning a single source of truth.

## Files in scope

- `src/config/algorithm-tuning.js` — **new file** (IIFE on `window.Vectura.AlgorithmTuning`).
- `src/core/algorithms/rainfall.js` — replace inline constants.
- `src/core/algorithms/wavetable.js` — replace inline constants (lines 139, 213).
- `index.html` — script load order: `algorithm-tuning.js` before any algorithm consumer.

## EARS requirements

- **REQ-1 (Ubiquitous):** The system shall expose `Vectura.AlgorithmTuning` as a frozen object containing per-algorithm tuning blocks keyed by algorithm id.
- **REQ-2 (Ubiquitous):** The `rainfall` block shall contain `noiseScale = 0.01`, `gustScale = 0.003`, `spiralFactor = 0.5`, `hexRatio = Math.sqrt(3) / 2`, `paddingMax = 0.45`.
- **REQ-3 (Ubiquitous):** The `wavetable` block shall contain `defaultZoom = 0.02`.
- **REQ-4 (Ubiquitous):** `rainfall.js` and `wavetable.js` shall read these values from `Vectura.AlgorithmTuning` rather than inlining literals.
- **REQ-5 (Unwanted behavior):** If the implementer is tempted to change a numeric value, then the implementer shall stop — value changes are out of scope.

## Implementation notes

- Define `AlgorithmTuning` as `Object.freeze({ rainfall: Object.freeze({...}), wavetable: Object.freeze({...}) })` to prevent accidental mutation.
- Keep `hexRatio` as `Math.sqrt(3) / 2` rather than a literal `0.866` — preserves precision.
- Inject a single script tag in `index.html` immediately after other `src/config/*.js` entries and before `src/core/*.js`.
- Algorithm files dereference once at top of `generate` (e.g. `const T = Vectura.AlgorithmTuning.rainfall;`) to avoid repeated lookups in hot loops.
- Exact byte equivalence is required — visual baselines must not move.

## Out of scope

- Any other algorithm's magic numbers (deferred to a future spec).
- Changing values, not even rounding `0.866` differently.
- UI exposure of these constants.
- Engine state, sanitization, renderer precision, noise rack, math utils (separate tickets).

## Acceptance tests

- `npm run test:visual` — rainfall and wavetable baselines unchanged.
- `tests/unit/algorithm_tuning.test.js` (new) — `Vectura.AlgorithmTuning.rainfall.noiseScale === 0.01`, etc.; object is frozen.
- `tests/unit/algorithm_tuning.test.js` — `hexRatio === Math.sqrt(3) / 2` (strict equality).

## Done when

- [ ] `src/config/algorithm-tuning.js` exists, frozen, loaded in `index.html`.
- [ ] `rainfall.js` and `wavetable.js` reference only the new tuning block (no remaining literals for the listed constants).
- [ ] `npm run test:visual` passes without regeneration.
- [ ] `npm run test:unit` passes including new tuning test.
