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
    expect(actual).toBe(fs.readFileSync(file, 'utf8'));
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
   * For these algorithms the Curves toggle still produces BYTE-IDENTICAL output
   * whether it is on or off — it is a dead switch. shapePack stamps
   * `meta.straight` on its geometry, which vetoes curves in both the renderer
   * and the exporter regardless of the toggle; text emits its font-designed
   * glyph curves either way, so the toggle changes nothing.
   *
   * This list is a ratchet, not an endorsement: it must only ever SHRINK. When
   * the `meta.straight` audit (Stage D of the unification plan) makes one of
   * these live, this test fails and forces the entry to be removed — which is
   * exactly the signal we want, since the old net could not see the difference
   * at all. Spiralizer — the originally-reported bug — came off this list when
   * it was taught to honour `p.curves`.
   */
  describe('Curves toggle liveness', () => {
    const TOGGLE_IS_DEAD = ['text', 'shape-pack'];

    const isDead = (scenario) =>
      render(scenario, { curves: false, smoothing: 0 })
      === render(scenario, { curves: true, smoothing: 0 });

    test('the toggle is live everywhere except the known-dead list', () => {
      const dead = SCENARIOS.filter(isDead).map((s) => s.id).sort();
      expect(dead).toEqual([...TOGGLE_IS_DEAD].sort());
    });
  });
});
