/**
 * Vectura Studio — Scene 3D surface-locked fills: shared constants.
 *
 * One table for the numbers every surface-lock module reads (contract:
 * docs/surface-lock-contract.md). The modules under src/core/scene3d/surface-lock*.js
 * never carry their own literal for any key below.
 *
 * Nothing here changes a pose-mode render: a style without `markSpace: 'surface'`
 * never reaches a surface-lock module.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});

  Vectura.SCENE3D_SURFACE_LOCK = Object.freeze({
    // Bumped whenever a baker's output for the same bake key changes. Part of every bake key.
    BAKE_VERSION: 1,
    // Contract §6 — a vertex whose facing cosine c = n·view is below this is culled (crossing interpolated).
    NZ_CULL: 0.08,
    // Contract §5 — the tone look-up table has TONE_LUT_SIZE + 1 entries for I = k / TONE_LUT_SIZE.
    TONE_LUT_SIZE: 256,
    // Contract §2 — octahedral normal quantisation (signed 16-bit per component).
    OCT_SCALE: 32767,
    // Contract §4 — levels per MarkSet: level 0 (lit maximum pitch) plus up to MAX_LEVELS - 1 halvings.
    MAX_LEVELS: 6,
    // Contract §4 — finest baked level reaches the darkest pitch at this multiple of the bake scale
    // (zoom headroom before a re-bake is needed to stay dense).
    ZOOM_HEADROOM: 2,
    // Contract §8 — module-level bake cache, least-recently-used by bytes.
    CACHE_MB: 64,
    CACHE_MB_MOBILE: 24,
    // Contract §11 — frame budgets (ms). Perf tests assert counters; these are the generous clocks.
    FRAME_BUDGET_MS: 8,
    BAKE_BUDGET_MS: 400,
  });
})();
