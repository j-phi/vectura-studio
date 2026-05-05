# B3 — Renderer precision near-zero scale

## Problem

In `src/render/renderer.js` lines 1346–1348, when `|scaleX| < 1e-6` the code clamps to `1` (and similarly for `scaleY`), which is not an inverse of the forward transform — the inverse blows up to a wildly different magnitude than the forward map, producing visible jumps in `worldToSourcePoint` and friends near degenerate scales. The clamp must preserve direction and magnitude order so that `forward(inverse(p)) ≈ p`.

## Files in scope

- `src/render/renderer.js` — lines 1346–1348 (and any sibling lines for `safeY` / `safeScaleY`).
- `tests/unit/renderer_precision.test.js` (new) — finite-output assertions.

## EARS requirements

- **REQ-1 (Unwanted behavior):** If `|scaleX|` is below `1e-6`, then the renderer shall substitute `(Math.sign(scaleX) || 1) * 1e-6` in place of `scaleX` for the inverse computation.
- **REQ-2 (Unwanted behavior):** If `|scaleY|` is below `1e-6`, then the renderer shall substitute `(Math.sign(scaleY) || 1) * 1e-6` in place of `scaleY` for the inverse computation.
- **REQ-3 (Ubiquitous):** The renderer shall return finite numbers from `worldToSourcePoint` for all finite inputs, including near-degenerate scales.

## Implementation notes

- Direct replacement: `const safeX = Math.abs(scaleX) < 1e-6 ? (Math.sign(scaleX) || 1) * 1e-6 : scaleX;` (same shape for `safeY`).
- `Math.sign(0)` is `0`, hence the `|| 1` fallback to give a deterministic positive direction when scale is exactly zero.
- Audit the surrounding function for any other `< 1e-6 ? 1` clamps — fix them with the same pattern. Only fix clamps that are part of an inverse computation; leave unrelated clamps alone.
- Do not change the threshold (`1e-6`) — only the substituted value.

## Out of scope

- Any other renderer behavior (selection, drag, snap, zoom).
- Engine state (`B1-A6`), sanitization (`S1`), tuning (`A5`), noise rack (`A4`), math utils (`A3-C1`).
- Refactoring `worldToSourcePoint` signature or callers.

## Acceptance tests

- `tests/unit/renderer_precision.test.js` — `worldToSourcePoint` with `scaleX = 1e-9` returns finite numbers.
- `tests/unit/renderer_precision.test.js` — `worldToSourcePoint` with `scaleX = -1e-9` returns finite numbers and preserves sign of the inverse direction.
- `tests/unit/renderer_precision.test.js` — `worldToSourcePoint` with `scaleX = 0` returns finite numbers (no NaN).
- `tests/unit/renderer_precision.test.js` — round-trip `forward(inverse(p))` with normal scale (e.g. `2.5`) is within `1e-9` of `p`.

## Done when

- [ ] Lines 1346–1348 (and any sibling clamps in the same function) updated to the signed `1e-6` form.
- [ ] New unit test file added and passing.
- [ ] `npm run test:unit` and `npm run test:visual` pass with no baseline regeneration needed.
