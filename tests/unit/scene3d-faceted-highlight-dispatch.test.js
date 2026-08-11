const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene3D — the FACETED highlight dispatch (design spec §5.4 #2/#3/#4/#7,
 * §5.5.2, §5.5.3), scored as O9 / O11 / O14 / O15.
 *
 * The faceted path used to place its highlight by "is this face in the top tone
 * band". Under an ordinary sun no face of a cube ever reaches the top band, so
 * the whole treatment dispatch was dead code there: `blank`, `sparse`,
 * `stippleOut` and `altFill` all fell through to the same untreated hatch and
 * rendered byte-identically, `highlightPenId` never reached any ink, and
 * `highlightSensitivity` was inert outside lightDriven mode.
 *
 * The H zone on a facet is the SPECULAR GLINT FACET SET (§5.5.2), and
 * `highlightSensitivity` is the acceptance cone's angular tightness (O9).
 * Faceted output is legitimately quantized and blocky (§5.5.1) — these tests
 * assert BEHAVIOUR (distinctness, direction, pen routing), never pixels.
 *
 * Deterministic: hash-only, no RNG.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 10, dW: 300, dH: 200, penWidth: 0.3, truncate: 4 };
// Mirrors the design harness fixture: an ordinary 28-degree sun, which is
// exactly the case where no cube face reaches the top tone band.
const CAMERA = { projection: 'orthographic', yaw: -30, pitch: 32, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 28, intensity: 1, castShadows: false };

describe('Scene3D faceted highlight dispatch (O9 / O11 / O14 / O15)', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const CUBE = {
    id: 'cube', name: 'Cube', primitive: 'box', params: { sx: 62, sy: 62, sz: 62 },
    transform: { x: 0, y: 31, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
  };
  // A geodesic polyhedron goes through the FACETED path; primitive:'sphere' is
  // chart-wrapped and would exercise the curved fill instead.
  const LOWPOLY = {
    id: 'lowpoly', name: 'LowPoly', primitive: 'solid', params: { solidType: 'geodesic', radius: 40, frequency: 2 },
    transform: { x: 0, y: 42, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
  };

  const scene = (object, styleParams) => {
    const p = clone(defaults);
    p.objects = [clone(object)];
    p.ground = { enabled: false };
    p.camera = clone(CAMERA);
    p.lights = [clone(SUN)];
    p.tone = {
      ...clone(defaults).tone,
      enabled: true,
      bands: 4,
      thresholds: [0.25, 0.5, 0.75],
      ladder: [0.15, 0.4, 0.65, 0.9],
      specular: { enabled: true, size: 1 },
    };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: {} },
      byObject: { [object.id]: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 50, ...(styleParams || {}) } } },
      byFace: {},
    };
    return p;
  };

  const gen = (object, styleParams) => algo.generate(scene(object, styleParams), null, null, BOUNDS) || [];
  const fills = (paths) => paths.filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');
  const hlFills = (paths) => fills(paths).filter((pp) => pp.meta.sceneTarget && pp.meta.sceneTarget.highlight === true);
  const inkOf = (paths) => paths.reduce((sum, pp) => {
    let L = 0;
    for (let i = 1; i < pp.length; i += 1) L += Math.hypot(pp[i].x - pp[i - 1].x, pp[i].y - pp[i - 1].y);
    return sum + L;
  }, 0);
  // "Visibly different" made measurable: path count, total ink to 0.1 mm, and
  // how much ink landed on the highlight channel. Two treatments that agree on
  // all three drew the same picture.
  const sig = (paths) => {
    const f = fills(paths);
    const h = hlFills(paths);
    return `${f.length}|${inkOf(f).toFixed(1)}|${h.length}|${inkOf(h).toFixed(1)}`;
  };
  const penIdsOf = (paths) => paths.filter((pp) => pp.meta && pp.meta.penId).map((pp) => pp.meta.penId);

  const TREATMENTS = ['none', 'blank', 'sparse', 'stippleOut', 'burst', 'altFill'];

  // ── O14 — every treatment must draw a DIFFERENT picture on a cube. ──────────
  test('O14: the six treatments are all distinct on a faceted cube (perFace)', () => {
    const sigs = TREATMENTS.map((t) => sig(gen(CUBE, { highlightTreatment: t })));
    const byTreatment = {};
    TREATMENTS.forEach((t, i) => { byTreatment[t] = sigs[i]; });
    expect(new Set(sigs).size).toBe(TREATMENTS.length);
    // The specific pre-fix collapse, pinned by name so a regression is legible.
    expect(byTreatment.sparse).not.toBe(byTreatment.blank);
    expect(byTreatment.stippleOut).not.toBe(byTreatment.sparse);
    expect(byTreatment.altFill).not.toBe(byTreatment.blank);
  });

  test('O14: the six treatments are all distinct on a low-poly sphere (perFace)', () => {
    const sigs = TREATMENTS.map((t) => sig(gen(LOWPOLY, { highlightTreatment: t })));
    expect(new Set(sigs).size).toBe(TREATMENTS.length);
  });

  // ── O15 — lightDriven must not swallow sparse/stippleOut into blank. ────────
  test('O15: lightDriven keeps blank / sparse / stippleOut distinct on a cube', () => {
    const ld = (t) => sig(gen(CUBE, { highlightTreatment: t, highlightMode: 'lightDriven' }));
    const blank = ld('blank'); const sparse = ld('sparse'); const stipple = ld('stippleOut');
    expect(sparse).not.toBe(blank);
    expect(stipple).not.toBe(blank);
    expect(stipple).not.toBe(sparse);
  });

  test('O15: lightDriven sparse/stippleOut put ink on the highlight channel', () => {
    ['sparse', 'stippleOut'].forEach((t) => {
      const hl = hlFills(gen(CUBE, { highlightTreatment: t, highlightMode: 'lightDriven' }));
      expect(hl.length).toBeGreaterThan(0);
    });
  });

  // ── O9 — highlightSensitivity is live in the DEFAULT perFace mode, and it
  // closes the acceptance cone: a tighter cone = a smaller highlight = MORE ink
  // left on the object. ──────────────────────────────────────────────────────
  test('O9: highlightSensitivity changes the perFace highlight on a cube', () => {
    const sigs = [1, 3, 6].map((n) => sig(gen(CUBE, { highlightSensitivity: n })));
    expect(new Set(sigs).size).toBe(3);
  });

  test('O9: tightening the cone shrinks the highlight (ink rises) on both faceted shapes', () => {
    [CUBE, LOWPOLY].forEach((obj) => {
      const ink = (n) => inkOf(fills(gen(obj, { highlightSensitivity: n })));
      expect(ink(3)).toBeGreaterThan(ink(1));
      expect(ink(6)).toBeGreaterThan(ink(3));
    });
  });

  test('O9: highlightSensitivity changes the perFace highlight on a low-poly sphere', () => {
    const sigs = [1, 3, 6].map((n) => sig(gen(LOWPOLY, { highlightSensitivity: n })));
    expect(new Set(sigs).size).toBe(3);
  });

  // ── O11 — a second pen must reach sparse / stippleOut / dashed ink. ─────────
  // Both shapes: a low-poly sphere's glint facets carry only a few short
  // rulings, which is exactly where a treatment can silently erase itself and
  // take the whole highlight channel (and its pen) with it.
  test('O11: sparse / stippleOut / dashed emit paths carrying highlightPenId', () => {
    [CUBE, LOWPOLY].forEach((obj) => {
      ['sparse', 'stippleOut', 'dashed'].forEach((t) => {
        const paths = gen(obj, { highlightTreatment: t, highlightPenId: 'pen-hl' });
        const penned = penIdsOf(paths).filter((id) => id === 'pen-hl');
        expect(penned.length).toBeGreaterThan(0);
      });
    });
  });

  test('O11: none / sparse / stippleOut / dashed are four distinct results with a highlight pen', () => {
    const sigs = ['none', 'sparse', 'stippleOut', 'dashed']
      .map((t) => sig(gen(CUBE, { highlightTreatment: t, highlightPenId: 'pen-hl' })));
    expect(new Set(sigs).size).toBe(4);
  });

  // `none` is the total bypass (Round 3 addendum): no highlight channel, no
  // highlight pen, no thinning. That is a contract, not a collapse.
  test('none stays a total bypass: no highlight channel and no highlight pen', () => {
    const paths = gen(CUBE, { highlightTreatment: 'none', highlightPenId: 'pen-hl' });
    expect(hlFills(paths).length).toBe(0);
    expect(penIdsOf(paths).filter((id) => id === 'pen-hl').length).toBe(0);
  });

  // §5.5.3 parity: switching the glint off must remove the highlight entirely on
  // the faceted path too.
  test('specular.enabled:false removes the faceted highlight channel', () => {
    const p = scene(CUBE, { highlightTreatment: 'sparse', highlightPenId: 'pen-hl' });
    p.tone.specular = { enabled: false, size: 1 };
    const paths = algo.generate(p, null, null, BOUNDS) || [];
    expect(hlFills(paths).length).toBe(0);
  });

  test('deterministic: same faceted highlight params → byte-identical output', () => {
    const a = JSON.stringify(gen(CUBE, { highlightTreatment: 'stippleOut', highlightSensitivity: 3 }));
    const b = JSON.stringify(gen(CUBE, { highlightTreatment: 'stippleOut', highlightSensitivity: 3 }));
    expect(a).toBe(b);
  });
});
