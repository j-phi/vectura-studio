/**
 * Algorithm utilities — shared math helpers used across algorithms, UI, and renderer.
 *
 * Consolidates redefinitions of clamp / clamp01 / lerp / frac / applyPad that
 * previously lived inline in 15+ files. Behavior must be byte-identical to the
 * pre-consolidation locals; do not optimize or change signatures here.
 *
 * `applyTile` is intentionally NOT exposed: its existing inline copies vary in
 * small but observable ways per algorithm (padding cap, spiral factor, checker
 * flip, wave amplitude). Each algorithm continues to define its own.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const frac = (v) => v - Math.floor(v);
  const applyPad = (t, pad) => {
    if (pad <= 0) return t;
    const span = 1 - pad * 2;
    if (span <= 0) return 0.5;
    return Math.max(0, Math.min(1, (t - pad) / span));
  };

  window.Vectura.AlgorithmUtils = {
    clamp,
    clamp01,
    lerp,
    frac,
    applyPad,
  };

  // Asset epoch — a counter that anything memoizing algorithm output can fold into its
  // cache key, bumped whenever an asynchronously-loaded asset lands.
  //
  // Several algorithms render a FALLBACK when an asset the params only NAME hasn't
  // arrived yet: `text` draws built-in stroke letterforms until a Google face is fetched
  // and parsed; the picture algorithms draw a procedural sphere until `imageSrc` decodes
  // into IMAGE_SOURCES. The params — and so any key derived from them — are identical
  // before and after. A params-only cache therefore pins the fallback render forever.
  // Bumping this on arrival retires those entries. Callers must be defensive about load
  // order and go through Vectura.bumpAssetEpoch().
  window.Vectura.ASSET_EPOCH = window.Vectura.ASSET_EPOCH || 0;
  window.Vectura.bumpAssetEpoch = () => {
    window.Vectura.ASSET_EPOCH = (window.Vectura.ASSET_EPOCH || 0) + 1;
    return window.Vectura.ASSET_EPOCH;
  };
})();
