# B1 + A6 — Engine state persistence and encapsulation

## Problem

`VectorEngine.exportState`/`importState` (`src/core/engine.js` ~lines 137–216) omit `layer.origin`, so save → load loses the layer origin used by `renderer.js:1316–1330` for transform math. Separately, `src/ui/ui.js` mutates engine internals directly at lines 6551, 8363, 8393, 8402, 8416 (`app.engine.layers = ...`, `app.engine.activeLayerId = ...`), bypassing any invariant the engine could enforce. Both are addressed here because they touch the same engine surface.

## Files in scope

- `src/core/engine.js` — `exportState` (~137–165), `importState` (~167–216); add new methods `reorderLayers`, `deleteLayersById`, `setActiveLayerId`.
- `src/ui/ui.js` — lines 6551, 8363, 8393, 8402, 8416 (replace direct assignments).
- `tests/unit/engine_state.test.js` (new or extended) — origin round-trip + new method coverage.

## EARS requirements

- **REQ-1 (Ubiquitous):** The engine shall include `origin` (cloned `{x, y}`) in each layer entry produced by `exportState`.
- **REQ-2 (Event-driven):** When `importState` consumes a layer payload that contains `origin`, the engine shall restore `layer.origin` to a fresh clone of that value.
- **REQ-3 (Unwanted behavior):** If a layer payload omits `origin`, then the engine shall default `layer.origin` to `{ x: 0, y: 0 }`.
- **REQ-4 (Ubiquitous):** The engine shall expose `reorderLayers(layersOrIds)` accepting either an array of layer objects or an array of layer ids; it shall reorder `this.layers` to match while validating that the set of ids matches the current set.
- **REQ-5 (Ubiquitous):** The engine shall expose `deleteLayersById(idArray)` that removes the matching layers and clears `activeLayerId` if the active layer was removed.
- **REQ-6 (Ubiquitous):** The engine shall expose `setActiveLayerId(idOrNull)` that sets `activeLayerId` only when the id is `null` or matches an existing layer.
- **REQ-7 (Unwanted behavior):** If any of the new engine methods receives an invalid input (unknown id, mismatched set, non-array), then the engine shall leave state unchanged and emit `console.warn('[Engine] <reason>')`.
- **REQ-8 (Ubiquitous):** The UI shall call the new engine methods rather than assigning to `app.engine.layers` or `app.engine.activeLayerId` directly.

## Implementation notes

- Clone origin on both export and import — never share references with the live layer object.
- Implement `reorderLayers` to detect array element type by checking the first element (`typeof === 'string'` → id list; else assume layer objects); both forms validate `new Set(ids).size === this.layers.length` and that all ids exist.
- `deleteLayersById` should iterate once, filter, and only then consider clearing `activeLayerId`.
- `setActiveLayerId(null)` is valid and clears the active layer.
- In `ui.js`, the line 6551 site is the layer-reorder DnD handler — replace with `reorderLayers`. Lines 8363/8393/8402/8416 are the deletion / active-id assignments — replace appropriately.
- Do not change history / undo semantics; engine methods should remain side-effect-free aside from state mutation (callers continue to drive history).

## Out of scope

- Sanitization (`S1-pattern-svg-xss.md`).
- Renderer precision (`B3-renderer-precision.md`).
- Noise rack (`A4`), tuning (`A5`), math utils (`A3-C1`).
- Adding listeners, events, or observer patterns to the engine.
- Refactoring `exportState`/`importState` beyond adding `origin`.

## Acceptance tests

- `tests/unit/engine_state.test.js` — origin round-trip: set layer origin to `{x: 50, y: -25}`, export, mutate live, import, assert restored origin equals.
- `tests/unit/engine_state.test.js` — back-compat: import a payload missing `origin`, assert layer origin equals `{x: 0, y: 0}`.
- `tests/unit/engine_layers.test.js` (new) — `reorderLayers` happy path with id array and with layer-object array.
- `tests/unit/engine_layers.test.js` — `reorderLayers` with mismatched set leaves layers untouched and warns.
- `tests/unit/engine_layers.test.js` — `deleteLayersById` removes layers and clears `activeLayerId` when active was removed.
- `tests/unit/engine_layers.test.js` — `setActiveLayerId` rejects unknown ids and accepts `null`.
- `tests/integration/ui_layer_ops.test.js` (existing or extended) — UI deletion / reorder still works end-to-end.

## Done when

- [ ] `engine.js` exports/imports include `origin` with clone + default.
- [ ] Three new engine methods implemented with input validation.
- [ ] All five `ui.js` direct-assignment sites use the new methods.
- [ ] `npm run test:unit` and `npm run test:integration` pass.
- [ ] Manual smoke: save a project with a non-zero origin layer, reload, layer origin preserved.
