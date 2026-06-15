/*
 * Vectura Studio — Preset name heuristics.
 *
 * suggestName(layerType, params, opts) proposes a human-friendly default name
 * for a "save current settings as a preset" action. It diffs the layer's params
 * against a basis (the active named preset's expected params, or the algorithm
 * defaults) and names the look after the 2–3 parameters that changed the most —
 * e.g. "Rings · rings 60 · warp 0.73". When nothing scalar diverged it falls
 * back to a unique numbered name ("My Rings 1").
 *
 * This ships the GENERIC heuristic; polished per-algorithm "param → friendly
 * phrase" maps can be added later via ALGO_LABELS / KEY_LABELS without changing
 * the call sites.
 *
 * Registered as window.Vectura.PresetNameHeuristics.
 */
(() => {
  'use strict';
  const Vectura = (window.Vectura = window.Vectura || {});

  // Keys a preset save never names after — transform, seed, and the preset
  // markers themselves. Mirrors the import/save STRIP set plus the markers.
  const IGNORED_KEYS = new Set([
    'preset', 'label', 'seed', 'posX', 'posY', 'scaleX', 'scaleY', 'rotation',
  ]);

  // Friendly algorithm labels. Anything not listed falls back to a title-cased
  // form of the layer type.
  const ALGO_LABELS = {
    flowfield: 'Flow Field',
    boids: 'Boids',
    attractor: 'Attractor',
    hyphae: 'Hyphae',
    lissajous: 'Lissajous',
    harmonograph: 'Harmonograph',
    pendula: 'Pendula',
    wavetable: 'Wavetable',
    rings: 'Rings',
    topo: 'Topo',
    grid: 'Grid',
    rainfall: 'Rainfall',
    phylla: 'Phylla',
    petalisDesigner: 'Petalis',
    spiral: 'Spiral',
    shapePack: 'Shape Pack',
    terrain: 'Terrain',
    svgDistort: 'SVG Distort',
  };

  const algoLabel = (layerType) => {
    if (ALGO_LABELS[layerType]) return ALGO_LABELS[layerType];
    const t = String(layerType || 'Preset');
    // camelCase / lowercase → "Title Case".
    return t
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  // "outerDiameter" → "outer diameter", "freqX" → "freq x".
  const humanizeKey = (key) =>
    String(key)
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[-_]+/g, ' ')
      .toLowerCase()
      .trim();

  // Round to ≤2 decimals, strip trailing zeros. 0.7300001 → "0.73", 60 → "60".
  const fmtNumber = (n) => {
    if (!Number.isFinite(n)) return String(n);
    const rounded = Math.round(n * 100) / 100;
    return String(rounded);
  };

  const fmtValue = (v) => {
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    if (typeof v === 'number') return fmtNumber(v);
    return String(v);
  };

  // Only scalar params are summarizable; objects/arrays (noise stacks, shadings)
  // are skipped — they don't read as a tidy phrase.
  const isScalar = (v) => v == null || ['number', 'boolean', 'string'].includes(typeof v);

  // Relative magnitude of a change, used to rank which keys to name after.
  const changeMagnitude = (next, base) => {
    if (typeof next === 'number' && typeof base === 'number') {
      return Math.abs(next - base) / (Math.abs(base) || 1);
    }
    return 1; // booleans / strings / newly-present keys: flat weight.
  };

  /**
   * @param {string} layerType
   * @param {object} params      the layer's current params
   * @param {object} [opts]
   * @param {object} [opts.basis] expected params to diff against (defaults to
   *                              ALGO_DEFAULTS[layerType])
   * @param {string[]} [opts.existingNames] existing user-preset display names,
   *                              used to keep the numbered fallback unique
   * @returns {string}
   */
  const suggestName = (layerType, params, opts = {}) => {
    const label = algoLabel(layerType);
    const p = params && typeof params === 'object' ? params : {};
    const all = (window.Vectura && window.Vectura.ALGO_DEFAULTS) || {};
    const basis = opts.basis && typeof opts.basis === 'object'
      ? opts.basis
      : (all[layerType] && typeof all[layerType] === 'object' ? all[layerType] : {});

    const changed = [];
    for (const key of Object.keys(p)) {
      if (IGNORED_KEYS.has(key)) continue;
      const next = p[key];
      if (!isScalar(next)) continue;
      const base = basis[key];
      if (next === base) continue;
      // Treat NaN-ish or empty strings as non-informative.
      if (typeof next === 'string' && !next.trim()) continue;
      changed.push({ key, value: next, mag: changeMagnitude(next, base) });
    }

    if (changed.length) {
      changed.sort((a, b) => b.mag - a.mag);
      const parts = changed.slice(0, 3).map((c) => `${humanizeKey(c.key)} ${fmtValue(c.value)}`);
      return `${label} · ${parts.join(' · ')}`;
    }

    // Fallback: unique numbered name.
    const existing = new Set((Array.isArray(opts.existingNames) ? opts.existingNames : []).map((n) => String(n)));
    let n = 1;
    while (existing.has(`My ${label} ${n}`)) n += 1;
    return `My ${label} ${n}`;
  };

  Vectura.PresetNameHeuristics = { suggestName, algoLabel };
})();
