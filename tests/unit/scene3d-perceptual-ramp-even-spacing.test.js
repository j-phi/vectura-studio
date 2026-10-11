const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * FILL-STYLE REVIEW U4b item 5 — Ladder > Rung detail > Perceptual ramp.
 *
 * W-26 moved ladder / fineLadder / phaseFineLadder onto continuous placement so
 * a uniform field no longer draws a 1-and-2-pitch gap alternation. The fourth
 * rung mode, `perceptualRamp`, kept the DISCRETE rung verdict and so brought the
 * irregular gaps straight back. It now rides the same engine (its tone TARGET is
 * unchanged; only the placement moved). Same proven-uniform fields and the same
 * 1.15 bar as scene3d-ladder-uniform-field-spacing.test.js.
 *
 * RED proof (run against base 3afe6079): cone+contour and cylinder+contour
 * both exceed the bar for `perceptualRamp` there.
 */

const clone = (val) => JSON.parse(JSON.stringify(val));
const PEN = 0.3;
const BOUNDS = {
  width: 320, height: 220, m: 10, dW: 300, dH: 200,
  penWidth: PEN, truncate: 4, fastPreview: false, preview3dQuality: 'high',
};
const { CAMERA, SUN } = require('../fixtures/scene3d-shadow-anatomy');

const R1A_BAR = 1.15;

describe('Scene3D.SurfaceFill — Perceptual ramp is placed continuously (U4b item 5)', () => {
  let runtime; let V; let algo; let defaults; let SF;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
  });
  afterAll(() => runtime.cleanup());

  const scene = (mapper, primitive, sizes, toneLaw) => {
    const p = clone(defaults);
    p.seed = 0;
    p.camera = clone(CAMERA);
    p.ground = { enabled: true };
    p.backdrop = { enabled: false };
    p.lights = [clone(SUN)];
    p.objects = [{
      id: 'ob',
      name: 'Ob',
      primitive,
      params: Object.assign({ detail: 22 }, sizes),
      transform: {
        x: 0, y: 55, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
      },
      visibility: 'solid',
    }];
    // SHIPPED default: do NOT restate p.tone — ALGO_DEFAULTS.scene3d.tone
    // carries `ladder: [0.2, 0.5, 0.85]` (src/config/defaults.js), the
    // rungs the addendum's inferred-coverage note names.
    const style = {
      penId: null,
      mapper,
      params: {
        fillAngle: 45,
        fillDensity: 50,
        fillCurves: false,
        fillSmoothing: 0.65,
        fillSimplify: 0,
        fillFidelity: 1,
        highlightTreatment: 'none',
        ...(toneLaw ? { toneLaw } : {}),
      },
    };
    p.styleTable = {
      scene: clone(style),
      byObject: { ground: { penId: null, mapper: 'none', params: {} }, ob: clone(style) },
      byFace: {},
    };
    return p;
  };

  // Wrap `SF.buildObject` — the same instrumentation pattern
  // `scene3d-fill-even-spacing.test.js` uses — and return the raw RUN
  // arrays (each carries `.fam`/`.lineIndex`/`.back`, per `pushRun`).
  const emittedRuns = (mapper, primitive, sizes, toneLaw) => {
    const orig = SF.buildObject;
    const raw = [];
    SF.buildObject = function wrapped(opts) {
      const r = orig.call(this, opts);
      if (r) r.forEach((q) => raw.push(q));
      return r;
    };
    try {
      algo.generate(scene(mapper, primitive, sizes, toneLaw), new V.SeededRNG(0), new V.SimpleNoise(0), BOUNDS);
    } finally {
      SF.buildObject = orig;
    }
    return raw;
  };

  // One FRONT representative screen point per kept ruling of the primary
  // ('A#…') family — the CENTROID of every point across every run sharing
  // that `lineIndex` (a ring/line split by self-occlusion into more than one
  // run is still ONE ruling). A centroid is far less sensitive than a single
  // edge point to exactly where the camera's silhouette happens to clip a
  // partial arc, which the FIRST-point choice was — this fixture's camera is
  // tilted (yaw -30 / pitch 32), so a ring's visible arc does not start at
  // the same azimuth ring to ring.
  const repsFor = (raw) => {
    const map = new Map();
    raw.forEach((run) => {
      if (run.back || run.lineIndex == null || typeof run.fam !== 'string' || !run.fam.startsWith('A#')) return;
      if (!map.has(run.lineIndex)) map.set(run.lineIndex, { x: 0, y: 0, n: 0 });
      const acc = map.get(run.lineIndex);
      for (let i = 0; i < run.length; i += 1) { acc.x += run[i].x; acc.y += run[i].y; acc.n += 1; }
    });
    return [...map.entries()]
      .filter(([, acc]) => acc.n > 0)
      .sort((a, b) => a[0] - b[0])
      .map(([li, acc]) => ({ li, pt: { x: acc.x / acc.n, y: acc.y / acc.n } }));
  };

  const gapsOf = (reps) => {
    const g = [];
    for (let i = 1; i < reps.length; i += 1) {
      g.push(Math.hypot(reps[i].pt.x - reps[i - 1].pt.x, reps[i].pt.y - reps[i - 1].pt.y));
    }
    return g.filter((v) => v > 1e-6);
  };

  const ratio = (gaps) => (gaps.length >= 2 ? Math.max(...gaps) / Math.min(...gaps) : null);

  // Continuous placement (`emitContFamily`'s walk) advances `f` monotonically
  // from 0, so array POSITION in `reps` (sorted by `lineIndex`, the placement
  // ordinal) tracks the along-axis coordinate monotonically too. The contour
  // family sweeps the WHOLE along-axis domain, including the flat cap disc a
  // cone/cylinder's chart is remapped onto at the ends (`cappedChart`,
  // surface-fill.js:98-117) — a genuinely different normal field the R1a bar
  // was never meant to be measured across. Slicing by fraction of ARRAY
  // POSITION excludes those ends without needing the ruling's own `a` value,
  // which the emitted geometry does not carry.
  const excludeEnds = (reps, loFrac, hiFrac) => reps.slice(
    Math.floor(reps.length * loFrac),
    Math.ceil(reps.length * (1 - hiFrac)),
  );


  const CONE_SIZES = { sx: 30, sy: 40, sz: 30 };
  const CYL_SIZES = { sx: 22, sy: 40, sz: 22 };

  it('cone+contour under Perceptual ramp: max/min drawn gap <= 1.15', () => {
    const reps = repsFor(emittedRuns('contour', 'cone', CONE_SIZES, 'perceptualRamp'));
    expect(reps.length).toBeGreaterThan(4);
    const gaps = gapsOf(excludeEnds(reps, 0.32, 0));
    expect(gaps.length).toBeGreaterThan(2);
    expect(ratio(gaps)).toBeLessThanOrEqual(R1A_BAR);
  });

  it('cylinder+contour under Perceptual ramp: max/min drawn gap <= 1.15', () => {
    const reps = repsFor(emittedRuns('contour', 'cylinder', CYL_SIZES, 'perceptualRamp'));
    expect(reps.length).toBeGreaterThan(4);
    const gaps = gapsOf(excludeEnds(reps, 0.22, 0.22));
    expect(gaps.length).toBeGreaterThan(2);
    expect(ratio(gaps)).toBeLessThanOrEqual(R1A_BAR);
  });

  it('Perceptual ramp still carries tone: sphere+hatch whole-form gap ratio >= 2', () => {
    const reps = repsFor(emittedRuns('hatch', 'sphere', { sx: 25, sy: 25, sz: 25 }, 'perceptualRamp'));
    expect(reps.length).toBeGreaterThan(4);
    const gaps = gapsOf(reps);
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThanOrEqual(2);
  });
});
