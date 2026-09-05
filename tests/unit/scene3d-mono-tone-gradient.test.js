const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Light->dark gradient for the mono fill laws (surface-fill-mono.js) that the
 * fill audit flagged as reading flat (F-19/W-20): `dutyConst` (`lawDuty`),
 * `turingStripe` (`lawTuring`) and `mazeFill` (`lawMaze`), plus `voronoiWeb`
 * and `endShorten` as owner-confirmed-correct GUARDS measured with the exact
 * same harness so a future regression on any of the five is caught here.
 *
 * METHOD. Same technique `scene3d-turing-polarity.test.js` and
 * `scene3d-maze-tonal-range.test.js` already use for these very laws
 * (screen-X bins on a sphere lit from world +X/+Y, area-normalized against
 * the sphere's own disc geometry so limb foreshortening cannot masquerade as
 * a tone effect) — generalized from their quintiles down to THIRDS, per this
 * work item's own spec ("rasterised coverage of the darkest vs lightest
 * third"). Bin 0 = leftmost third (screen-left, shadow); bin 2 = rightmost
 * third (screen-right, lit).
 *
 * THE dutyConst BUG. `lawDuty` computed `duty = clamp(want / (INK / P), 0.18,
 * 1)` — comparing the requested ink AREA against a FIXED reference derived
 * from the ruling pitch `P`, which has nothing to do with this law's own
 * measured light/dark ends (`areaFor(1)` / `areaFor(0)`). With `P` pinned
 * near the plot floor, that fixed reference sits well inside `areaFor`'s true
 * span, so duty saturated to 1 (solid) for the whole shadow half of the tone
 * domain and floored at 0.18 for most of the lit half — only a narrow sliver
 * of radiance in between ever moved the duty cycle at all. Measured
 * pre-fix: shadow/lit third ratio 1.19 (this test's own RED line below). THE
 * FIX drives duty from where the requested area falls between the law's own
 * `areaFor(1)` (lightest) and `areaFor(0)` (darkest) — the same idea
 * `voronoiWeb` already uses for cell size off `pitchFor`'s own span — so the
 * full 0.18..1 duty range is actually used. Post-fix: 1.93.
 *
 * THE turingStripe FIX (partial — see notes). `lawTuring`'s dispersion
 * relation was already corrected for POLARITY in an earlier fix
 * (scene3d-turing-polarity.test.js). This test instead targets MAGNITUDE:
 * the raw `s.I` a lit sphere presents is not evenly spread over 0..1, so
 * feeding it straight into `pitchLegible` requested nearly the same
 * wavelength almost everywhere (measured pre-fix 1.06). Rank-normalizing
 * `s.I` to its percentile within the object's own visible samples — the
 * exact technique `lawMaze` already uses for its own identical
 * compressed-range bug — measurably widens the response (1.06 -> 1.25). It
 * does not reach the >1.5 bar `dutyConst` clears: a reaction-diffusion field
 * diffuses its coefficients across neighbouring cells, which structurally
 * damps how much LOCAL tone variation an anisotropic RD pattern can express
 * relative to a discrete per-mark law — a real, measured, but partial
 * improvement, disclosed here rather than papered over with a lowered
 * expectation dressed as a strong one.
 *
 * mazeFill is a GUARD in this file, not a fix target: its own rank-normalize
 * fix already landed (see scene3d-maze-tonal-range.test.js, 0.988 -> 1.372
 * quintile-extreme). Measured on THIS file's third-split harness it already
 * clears the same >1.15 margin as turingStripe and is asserted here purely to
 * catch a future regression alongside its siblings.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 360, height: 260, m: 20, dW: 320, dH: 220, penWidth: 0.3 };

describe('Scene3D mono-law light->dark gradient (F-19/W-20)', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  }, 60000);
  afterAll(() => runtime.cleanup());

  const scene = (toneLaw) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1',
      name: 's',
      primitive: 'sphere',
      params: { radius: 46, detail: 24 },
      transform: {
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
      },
      visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    // fillDensity 50 = the audit's "med" density tier (scripts/audit/scene3d-capture.js
    // DENSITY_VALUES), matching this work item's own "d=50" bar.
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 50, toneLaw } },
      byObject: {},
      byFace: {},
    };
    p.tone = clone(defaults).tone;
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 90, elevation: 45, castShadows: false }];
    return p;
  };

  const fills = (paths) => paths.filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');

  // Ink length per unit AREA in a screen-X third of the silhouette bbox,
  // area-normalized against the sphere's own disc geometry (identical
  // technique to the sibling quintileDensity helpers, 3 bins instead of 5).
  const thirdDensity = (paths) => {
    const ff = fills(paths);
    let minX = 1e9; let maxX = -1e9;
    ff.forEach((pp) => pp.forEach((pt) => { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); }));
    const cx = (minX + maxX) / 2; const R = (maxX - minX) / 2;
    const span = Math.max(1e-6, maxX - minX); const binW = span / 3;
    const lens = [0, 0, 0]; const areas = [0, 0, 0];
    ff.forEach((pp) => {
      for (let i = 1; i < pp.length; i += 1) {
        const mx = (pp[i - 1].x + pp[i].x) / 2;
        const len = Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
        let b = Math.floor(((mx - minX) / span) * 3);
        b = Math.max(0, Math.min(2, b));
        lens[b] += len;
      }
    });
    for (let b = 0; b < 3; b += 1) {
      const x0 = minX + b * binW; const x1 = x0 + binW;
      const N = 24; let a = 0;
      for (let k = 0; k < N; k += 1) {
        const x = x0 + (x1 - x0) * ((k + 0.5) / N);
        const d = x - cx;
        a += 2 * Math.sqrt(Math.max(0, R * R - d * d)) * (binW / N);
      }
      areas[b] = a;
    }
    return lens.map((l, i) => l / Math.max(1e-6, areas[i]));
  };

  const ratioOf = (law) => {
    const paths = algo.generate(scene(law), null, null, BOUNDS) || [];
    expect(paths.length).toBeGreaterThan(0);
    const d = thirdDensity(paths);
    expect(d[0]).toBeGreaterThan(0);
    expect(d[2]).toBeGreaterThan(0);
    return d[0] / d[2];
  };

  test('dutyConst: shadow third meaningfully exceeds lit third', () => {
    // Pre-fix (fixed-P duty reference) measured 1.19 — flat, fails this
    // margin. Post-fix (duty normalized over areaFor(1)..areaFor(0)) measures
    // 1.93.
    expect(ratioOf('dutyConst')).toBeGreaterThan(1.5);
  }, 60000);

  test('turingStripe: shadow third exceeds lit third by a real, if partial, margin', () => {
    // Pre-fix (raw, non-normalized s.I feeding pitchLegible) measured 1.06 —
    // within noise of flat. Post-fix (rank-normalized s.I, matching lawMaze's
    // own technique) measures 1.25. See this file's header for why the RD
    // carrier does not reach dutyConst's margin.
    expect(ratioOf('turingStripe')).toBeGreaterThan(1.15);
  }, 90000);

  test('mazeFill: guard against regression on its own already-fixed gradient', () => {
    // Unchanged by this work item (already fixed: scene3d-maze-tonal-range.test.js,
    // 0.988 -> 1.372 on that file's quintile-extreme harness). Measured here
    // (third-split) 1.21.
    expect(ratioOf('mazeFill')).toBeGreaterThan(1.15);
  }, 60000);

  test('voronoiWeb: guard, owner-confirmed-correct reference law', () => {
    // Measured 1.28 on this harness.
    expect(ratioOf('voronoiWeb')).toBeGreaterThan(1.15);
  }, 60000);

  test('endShorten: guard, owner-confirmed-correct reference law', () => {
    // Measured 1.72 on this harness.
    expect(ratioOf('endShorten')).toBeGreaterThan(1.5);
  }, 60000);
});
