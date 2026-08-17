const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * RULING CONTINUITY on chart-wrapped primitives.
 *
 * Jay, 2026-08-16, on a capsule with Style ▸ Mapper = Hatch, Density 40,
 * Angle 45 and Highlight ▸ Treatment = None: "With no highlights and hatched
 * fill, I would not expect all of these partial fill lines." The same was
 * reported for crosshatch, spiral and contour; slices and wireframe were clean.
 *
 * THE CONTRACT THESE TESTS PIN. Tone in this engine is made by DROPPING WHOLE
 * RULINGS and by choosing among ruling families — that is correct and these
 * tests must never punish it. What is not allowed is a ruling that is DRAWN
 * being chopped into stubs: the tone drop test is evaluated per sample, and on
 * a wrapped surface every quantity it reads (the local pitch, the composed
 * budget ceiling, the anti-banding feather) varies continuously along the
 * ruling, so a ruling whose rank sits near the local coverage used to flicker
 * on and off along its own length.
 *
 * So the assertions are about FRAGMENTS PER RULING and about SUB-PEN-WIDTH
 * CRUMBS, not about how much ink there is or how many rulings survive.
 *
 * Measured at the emitter, not after the pipeline: `SurfaceFill.buildObject` is
 * wrapped so the runs are read exactly as emitted, with their `lineIndex` /
 * `fam` tags intact. The scene is still driven through the real
 * `algo.generate`, so every default origin (ALGO_DEFAULTS, the factory preset,
 * the style cascade) is live — the tags simply do not survive the display
 * pipeline, and raw output was verified path-for-path identical to the final
 * `scenePaths` for this fixture.
 *
 * `gateT` / `gateF` — the zone-confined crossed families — are DELIBERATELY
 * short and terminate mid-form (O17: the terminator gains its own crossing
 * family, spent on that zone alone). They are excluded from the per-ruling
 * assertions and only held to the crumb floor.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const PEN = 0.3;
const BOUNDS = {
  width: 320, height: 220, m: 10, dW: 300, dH: 200,
  penWidth: PEN, truncate: 4, fastPreview: false, preview3dQuality: 'high',
};
// THE RIG IS IMPORTED, NOT COPIED (scene3d-fixture-single-source, rule A).
// This file used to restate the shadow-anatomy camera and sun inline, and its
// two literals were byte-identical to the fixture's — so this is a pure
// re-pointing at the single source and changes no measured number. The SUBJECT
// below (the capsule and its tone ladder) is this suite's own and deliberately
// stays inline: it is the geometry Jay reported the fragmentation on, not the
// shadow-anatomy ball, and it is allow-listed under rule B for exactly that.
const { CAMERA, SUN } = require('../fixtures/scene3d-shadow-anatomy');

const runLength = (p) => {
  let L = 0;
  for (let i = 1; i < p.length; i += 1) L += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
  return L;
};

describe('Scene3D.SurfaceFill — a drawn ruling is not chopped into stubs', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  // Jay's reported setup, as close as a headless fixture gets to it.
  const jayScene = (mapper) => {
    const p = clone(defaults);
    p.seed = 0;
    p.camera = clone(CAMERA);
    p.ground = { enabled: true };
    p.backdrop = { enabled: false };
    p.lights = [clone(SUN)];
    p.objects = [{
      id: 'cap', name: 'Capsule', primitive: 'capsule',
      params: { sx: 30, sy: 40, sz: 30, detail: 22 },
      transform: {
        x: 0, y: 55, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
      },
      visibility: 'solid',
    }];
    p.tone = {
      enabled: true,
      bands: 4,
      thresholds: [0.25, 0.5, 0.75],
      ladder: [0.15, 0.4, 0.65, 0.9],
      specular: { enabled: true, size: 1 },
    };
    const style = {
      penId: null,
      mapper,
      params: {
        fillAngle: 45,
        fillDensity: 40,
        fillCurves: false,
        fillSmoothing: 0.65,
        fillSimplify: 0,
        fillFidelity: 1,
        highlightTreatment: 'none',
      },
    };
    p.styleTable = {
      scene: clone(style),
      byObject: { ground: { penId: null, mapper: 'none', params: {} }, cap: clone(style) },
      byFace: {},
    };
    return p;
  };

  // Run the real algorithm, but capture what the fill emitter actually produced.
  const emittedRuns = (mapper) => {
    const SF = V.Scene3D.SurfaceFill;
    const orig = SF.buildObject;
    const raw = [];
    SF.buildObject = function wrapped(opts) {
      const r = orig.call(this, opts);
      if (r) r.forEach((p) => raw.push(p));
      return r;
    };
    try {
      algo.generate(jayScene(mapper), new V.SeededRNG(0), new V.SimpleNoise(0), BOUNDS);
    } finally {
      SF.buildObject = orig;
    }
    return raw;
  };

  const MAPPERS = ['hatch', 'crosshatch', 'contour', 'spiral'];

  test.each(MAPPERS)('%s emits no sub-pen-width crumb', (mapper) => {
    const raw = emittedRuns(mapper);
    expect(raw.length).toBeGreaterThan(0);
    // `scene3d.js` has culled sub-pen-width fragments on structural edges since
    // Phase 1 (MIN_RUN_MM = 0.6, "draws as a dot at best and only costs pen-down
    // travel"); the curved FILL never applied the same floor. Before the fix
    // family A alone emitted ten runs under 1 mm, four of them under 0.2 mm.
    const crumbs = raw.filter((p) => runLength(p) < 2 * PEN);
    expect(crumbs.map((p) => +runLength(p).toFixed(2))).toEqual([]);
  });

  // The spiral is one continuous helix with no per-ruling index, so it is held
  // to the crumb floor only; the rest carry indexed families.
  test.each(['hatch', 'crosshatch', 'contour'])('%s: a ruling survives as one polyline, not a row of stubs', (mapper) => {
    const raw = emittedRuns(mapper);
    // Only the UNGATED families make this claim — the zone-confined crossed
    // families are meant to stop where their zone stops.
    const open = raw.filter((p) => p.lineIndex != null && typeof p.fam === 'string'
      && (p.fam.startsWith('A#') || p.fam.startsWith('over#')));
    expect(open.length).toBeGreaterThan(0);
    const perRuling = new Map();
    open.forEach((p) => {
      const k = `${p.back ? 'B' : 'F'}:${p.fam}:${p.lineIndex}`;
      perRuling.set(k, (perRuling.get(k) || 0) + 1);
    });
    const counts = [...perRuling.values()];
    const fragmented = counts.filter((c) => c > 2).length;
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    // A ruling may legitimately be cut ONCE inside the visible surface — it can
    // pass behind the form and come back, and it may terminate at a genuine
    // zone step. Three or more pieces is chatter.
    expect(fragmented).toBe(0);
    expect(mean).toBeLessThanOrEqual(1.5);
  });

  test.each(['hatch', 'contour'])('%s: the primary family rules across the form, not in short dashes', (mapper) => {
    const raw = emittedRuns(mapper);
    const A = raw.filter((p) => typeof p.fam === 'string' && p.fam.startsWith('A#'))
      .map(runLength).sort((a, b) => a - b);
    expect(A.length).toBeGreaterThan(4);
    // Scale-free: compare the median ruling against the object's own projected
    // size, so the assertion does not encode this fixture's millimetres.
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    raw.forEach((p) => p.forEach((q) => {
      minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
    }));
    const span = Math.hypot(maxX - minX, maxY - minY);
    const median = A[A.length >> 1];
    // Before the fix the median family-A run was 3 mm against a ~85 mm span
    // (3.5%) — a dash, not a ruling. A ruling that is drawn should cross a
    // meaningful fraction of the form.
    expect(median / span).toBeGreaterThan(0.1);
  });

  test('the deliberate mechanisms survive: zone-confined crossed families still stop at their zone', () => {
    const raw = emittedRuns('hatch');
    const gated = raw.filter((p) => typeof p.fam === 'string' && p.fam.startsWith('gate'));
    // O17 — the terminator gains its own crossing family, confined to that zone.
    // These are SHORT on purpose. If a "continuity" change ever swallows them,
    // the terminator stops out-inking the form shadow and the dip closes.
    expect(gated.length).toBeGreaterThan(4);
    expect(gated.every((p) => runLength(p) >= 2 * PEN)).toBe(true);
  });

  test('Highlight None and Highlight blank agree — the cut is upstream of every highlight branch', () => {
    // Jay's standing contract is that `none` means no highlight machinery at
    // all. It already held: the fragmentation was never the highlight's doing,
    // so `none` and `blank` must emit the same ruling structure.
    const countOf = (treatment) => {
      const SF = V.Scene3D.SurfaceFill;
      const orig = SF.buildObject;
      const raw = [];
      SF.buildObject = function wrapped(opts) {
        const r = orig.call(this, opts);
        if (r) r.forEach((p) => raw.push(p));
        return r;
      };
      try {
        const p = jayScene('hatch');
        p.styleTable.scene.params.highlightTreatment = treatment;
        p.styleTable.byObject.cap.params.highlightTreatment = treatment;
        algo.generate(p, new V.SeededRNG(0), new V.SimpleNoise(0), BOUNDS);
      } finally {
        SF.buildObject = orig;
      }
      return raw.filter((p) => typeof p.fam === 'string' && p.fam.startsWith('A#')).length;
    };
    expect(countOf('none')).toBe(countOf('blank'));
  });
});
