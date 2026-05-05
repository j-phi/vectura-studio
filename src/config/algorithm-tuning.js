/**
 * Algorithm tuning constants.
 *
 * Centralizes magic numbers used by individual algorithm implementations so
 * that presets, tests, and future tuning can rely on a single source of
 * truth rather than literals embedded in hot loops.
 *
 * Frozen at construction to prevent accidental mutation. Algorithms
 * dereference once at the top of `generate` to avoid repeated lookups.
 */
(() => {
  const W = window;
  W.Vectura = W.Vectura || {};
  W.Vectura.AlgorithmTuning = Object.freeze({
    rainfall: Object.freeze({
      noiseScale: 0.01,
      gustScale: 0.003,
      spiralFactor: 0.5,
      paddingMax: 0.45,
    }),
    wavetable: Object.freeze({
      defaultZoom: 0.02,
    }),
  });
})();
