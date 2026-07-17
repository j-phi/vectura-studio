/**
 * Curve regression net.
 *
 * The existing SVG baselines (svg-baseline.test.js) call
 * `Algorithms[type].generate(params)` directly with `smoothing: 0, simplify: 0`
 * hardcoded, and serialize through tests/helpers/svg.js — a hand-rolled copy of
 * the exporter that only emits cubics when `meta.forceCurves` is set and has no
 * quadratic branch at all. The upshot: **not one of those 33 baselines contains
 * a single curve command**, and the entire curve system is invisible to them.
 *
 * This suite is the missing net. It drives the REAL path:
 *
 *   engine.addLayer(type)      -> the true default cascade (ALGO_DEFAULTS, the
 *                                 factory user-preset, the Layer merge)
 *   engine.generate(id)        -> the display pipeline (smoothing, simplify,
 *                                 masking, modifiers)
 *   Vectura._UIExportUtil      -> the production SVG serializer that the app and
 *     .shapeToSvg                 the plotter actually use
 *
 * and snapshots each algorithm with Curves OFF and Curves ON, so a change to how
 * curves are fitted, flagged, or emitted shows up as a baseline diff instead of
 * passing silently.
 *
 * Refresh with: VECTURA_UPDATE_BASELINES=1 npx vitest run tests/visual/curve-baseline.test.js
 */
const fs = require('fs');
const path = require('path');

const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { compareSvgGeometry } = require('../helpers/svg-geometry-compare');

const UPDATE = process.env.VECTURA_UPDATE_BASELINES === '1';
const BASELINE_DIR = path.resolve(__dirname, '../baselines/curves');
const PRECISION = 3;

// A spread that covers every branch of the curve decision:
//   - plain 2D polylines whose only curving is the draw-time toggle
//   - a 3D algorithm that stamps meta.straight (spiralizer — the reported bug)
//   - a 3D algorithm that reads params.curves properly (topoform, rasterPlane)
//   - an algorithm whose paths carry real bezier anchors (text)
//   - a parametric/marker algorithm (rings, shapePack)
const SCENARIOS = [
  { id: 'flowfield', type: 'flowfield', seed: 101, overrides: { density: 40, maxSteps: 30, stepLen: 5, octaves: 2 } },
  { id: 'lissajous', type: 'lissajous', seed: 202, overrides: { freqX: 4.6, freqY: 7.2, phase: 1.1, resolution: 90 } },
  { id: 'spiral', type: 'spiral', seed: 303, overrides: {} },
  { id: 'rings', type: 'rings', seed: 404, overrides: {} },
  { id: 'harmonograph', type: 'harmonograph', seed: 505, overrides: {} },
  { id: 'shape-pack', type: 'shapePack', seed: 606, overrides: {} },
  { id: 'spiralizer', type: 'spiralizer', seed: 707, overrides: { shape: 'ellipsoid', wrapType: 'spiral', curveResolution: 220, turns: 6 } },
  { id: 'topoform', type: 'topoform', seed: 808, overrides: {} },
  { id: 'raster-plane', type: 'rasterPlane', seed: 909, overrides: {} },
  { id: 'text', type: 'text', seed: 1010, overrides: {} },
];

const MODES = [
  { suffix: 'curves-off', curves: false, smoothing: 0 },
  { suffix: 'curves-on', curves: true, smoothing: 0 },
  { suffix: 'curves-on-smooth', curves: true, smoothing: 0.6 },
];

describe('curve baselines (real display pipeline + production exporter)', () => {
  let runtime;

  beforeAll(async () => {
    // The production serializer lives in ui.js, so the UI must be loaded.
    runtime = await loadVecturaRuntime({ includeUi: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const render = (scenario, mode) => {
    const { VectorEngine, _UIExportUtil } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer(scenario.type);
    const layer = engine.layers.find((l) => l.id === id);

    Object.assign(layer.params, scenario.overrides, {
      seed: scenario.seed,
      posX: 0,
      posY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      simplify: 0,
      curves: mode.curves,
      smoothing: mode.smoothing,
    });

    engine.generate(id);
    engine.computeAllDisplayGeometry();

    const live = engine.layers.find((l) => l.id === id);
    const paths = live.displayPaths || live.paths || [];
    const useCurves = Boolean(live.params.curves);
    const { width, height } = engine.currentProfile;

    const body = paths
      .map((p) => _UIExportUtil.shapeToSvg(p, PRECISION, useCurves))
      .filter(Boolean)
      .join('\n');

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`,
      body,
      '</svg>',
      '',
    ].join('\n');
  };

  const cases = SCENARIOS.flatMap((scenario) =>
    MODES.map((mode) => ({ scenario, mode, name: `${scenario.id}-${mode.suffix}` })),
  );

  test.each(cases)('matches baseline: $name', ({ scenario, mode, name }) => {
    const actual = render(scenario, mode);
    const file = path.join(BASELINE_DIR, `${name}.svg`);

    if (UPDATE) {
      fs.mkdirSync(BASELINE_DIR, { recursive: true });
      fs.writeFileSync(file, actual, 'utf8');
      expect(fs.existsSync(file)).toBe(true);
      return;
    }

    expect(fs.existsSync(file)).toBe(true);
    const baseline = fs.readFileSync(file, 'utf8');

    // Geometric, not byte-exact. The curve fitter's segmentation (corner detection
    // + RDP decimation) turns on float-threshold comparisons, so macOS and CI's
    // Linux legitimately place different anchors for the SAME visual curve — an
    // exact-string baseline fails on whichever platform did not record it. This
    // compares what the paths DRAW within a tolerance that absorbs that drift but
    // not a real regression. "Curves are actually emitted / the toggle is live" is
    // asserted structurally by the ratchet tests below, independent of this.
    const result = compareSvgGeometry(actual, baseline);
    if (!result.ok) {
      throw new Error(
        `curve baseline '${name}' diverged from geometry: ${result.reason}\n`
        + `Refresh baselines with: VECTURA_UPDATE_BASELINES=1 npx vitest run tests/visual/curve-baseline.test.js`
      );
    }
    expect(result.ok).toBe(true);
  });

  // The whole point of the net: if these stop being true, the baselines above
  // have quietly stopped covering curves and would pass no matter what we break.
  describe('the net actually sees curves', () => {
    const curveCommands = (svg) => (svg.match(/[CQ] -?\d/g) || []).length;

    test('the baselines contain curve commands at all', () => {
      const emitting = SCENARIOS.filter(
        (s) => curveCommands(render(s, { curves: true, smoothing: 0.6 })) > 0,
      );
      expect(emitting.length).toBeGreaterThan(0);
    });
  });

  /**
   * Ratchet on the reported bug.
   *
   * The Curves toggle used to produce BYTE-IDENTICAL output, on or off, for
   * spiralizer, text AND shapePack — dead switches, all three, and the old
   * baselines could not see it. Spiralizer came off this list when it was taught
   * to honour `p.curves`.
   *
   * The two that remain are dead for reasons that are NOT the spiralizer bug:
   *
   *   shape-pack — its geometry is parametric circles and ellipses
   *     (`meta.kind === 'circle'`), which are already exact. There is no polyline
   *     to fit, so Curves is *inapplicable* rather than broken.
   *
   *   text — glyph outlines arrive from the font as bezier contours and are
   *     already fitted, so the engine's curve pass deliberately leaves them
   *     alone (re-fitting a curve to a curve degrades it, and the welded-script
   *     fit is the most fragile geometry in the repo). Curves-off therefore does
   *     not de-curve a glyph. Making it do so is a real question, but it belongs
   *     to text's own fit — not to the universal pipeline — and is not worth
   *     risking the weld for.
   *
   * This list is a ratchet: it may only ever SHRINK. If an algorithm's toggle
   * goes dead, this fails.
   */
  describe('Curves toggle liveness', () => {
    const TOGGLE_IS_DEAD = ['shape-pack', 'text'];

    const isDead = (scenario) =>
      render(scenario, { curves: false, smoothing: 0 })
      === render(scenario, { curves: true, smoothing: 0 });

    test('the toggle is live everywhere except the known-dead list', () => {
      const dead = SCENARIOS.filter(isDead).map((s) => s.id).sort();
      expect(dead).toEqual([...TOGGLE_IS_DEAD].sort());
    });
  });
});
