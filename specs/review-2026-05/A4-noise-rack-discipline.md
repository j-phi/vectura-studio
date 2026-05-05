# A4 — Noise Rack discipline

## Problem

`src/core/algorithms/topo.js` (~lines 47–89) and `src/core/algorithms/phylla.js` (~12–54), and `terrain.js` similarly, fall back to constructing a bespoke "legacyNoise" object when `p.noises` is empty or missing. AGENTS.md and CLAUDE.md mandate that all algorithm noise work converge on the shared Noise Rack model — these legacy escape hatches violate that contract and make future Noise Rack work fragile.

## Files in scope

- `src/core/algorithms/topo.js` — legacyNoise fallback (~47–89).
- `src/core/algorithms/phylla.js` — legacyNoise fallback (~12–54).
- `src/core/algorithms/terrain.js` — equivalent legacy block.
- `src/core/noise-rack.js` — add helper `defaultConfigFor(algorithmId)`.
- `tests/visual/` — existing baselines for topo / phylla / terrain are the regression contract.

## EARS requirements

- **REQ-1 (Ubiquitous):** The Noise Rack module shall expose `Vectura.NoiseRack.defaultConfigFor(algorithmId)` returning a Noise Rack–shaped config object suitable for use as if it had been authored in the UI.
- **REQ-2 (Event-driven):** When an algorithm's `p.noises` is empty, missing, or otherwise invalid, the algorithm shall request a default config via `defaultConfigFor` and proceed using the shared Noise Rack pipeline.
- **REQ-3 (Ubiquitous):** Algorithms shall not construct ad-hoc "legacyNoise" objects; all noise sourcing shall flow through the Noise Rack.
- **REQ-4 (Ubiquitous):** The visual output of topo, phylla, and terrain with empty `p.noises` shall remain visually equivalent to the pre-refactor output (visual baselines unchanged).
- **REQ-5 (Unwanted behavior):** If the refactor produces a legitimate visual delta, then the implementer shall regenerate baselines and document the reason in `CHANGELOG.md`.

## Implementation notes

- `defaultConfigFor` should be a switch / lookup keyed by algorithm id (`'topo'`, `'phylla'`, `'terrain'`, fallthrough default). Each branch returns the exact equivalent of today's legacyNoise object expressed in Noise Rack schema.
- Mirror the legacyNoise frequency, amplitude, and warp parameters byte-for-byte where possible. The goal is a behavior-preserving refactor, not a tuning change.
- After the refactor, run `npm run test:visual` first; if it passes you are done. If it fails, diff the baselines pixel by pixel — small floating-point drift is acceptable to regenerate, but only after documenting in CHANGELOG.
- Keep the public algorithm signatures (`generate(params, rng)`) unchanged.
- Do not modify Noise Rack internals beyond adding `defaultConfigFor`.

## Out of scope

- Other algorithms' noise paths (only topo, phylla, terrain are in scope here).
- Engine state, sanitization, renderer precision, tuning constants, math-utils consolidation (separate tickets).
- Tuning the default noise — only express the existing values in the new shape.
- UI changes to the Noise Rack panel.

## Acceptance tests

- `npm run test:visual` — topo / phylla / terrain baseline images unchanged.
- `tests/unit/noise_rack_defaults.test.js` (new) — `defaultConfigFor('topo')` returns a config that, when consumed by the Noise Rack, produces the same scalar output as the prior legacyNoise object at a sampled set of points.
- `tests/unit/algorithms_noise_path.test.js` (new) — running topo / phylla / terrain with `p.noises = []` and with `p.noises = undefined` both succeed and produce identical output.

## Done when

- [ ] `defaultConfigFor` exposed on `Vectura.NoiseRack`.
- [ ] topo, phylla, terrain no longer reference any local legacyNoise construction.
- [ ] `npm run test:visual` passes (or baselines regenerated with CHANGELOG entry).
- [ ] `npm run test:unit` passes including new noise-default tests.
- [ ] Manual smoke: load a saved project with default-noise topo/phylla/terrain layers, output unchanged.
