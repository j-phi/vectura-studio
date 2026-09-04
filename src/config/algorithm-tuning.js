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
    // Scene3D cast-shadow OVERLAP darkening. Where N casters' footprints
    // coincide, the overlap region is emitted as its own geometry and ruled at
    // a TIGHTER pitch in the SAME direction (one deeper shadow, not a
    // crosshatch). See src/core/scene3d/shadows.js -> `overlapPitch`.
    //   maxDepth   how many overlap rungs the ladder has. Depth is clamped to
    //              it, so 4 coincident casters ink the same as 3.
    //   pitchStep  the ladder itself: pitch(n) = sBase / (1 + pitchStep*(n-1)),
    //              then floored at the plot floor (1.2 x penWidth). 0.5 gives
    //              1.00x / 1.50x / 2.00x density across n = 1/2/3.
    //   maxCasters cost guard. A class with more casters than this skips the
    //              intersection lattice and falls back to the plain union
    //              (today's behaviour) rather than paying O(casters x depth)
    //              booleans on a crowd scene.
    scene3dShadowOverlap: Object.freeze({
      maxDepth: 3,
      pitchStep: 0.5,
      maxCasters: 8,
    }),
  });
})();
