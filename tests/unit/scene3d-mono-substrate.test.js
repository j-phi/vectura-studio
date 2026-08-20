const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * THE MONOLINE SUBSTRATE, ON THE TWO CHARTS THAT BREAK IT.
 *
 * The nine monoline-depth laws draw through one of two substrates in
 * `surface-fill-mono.js`: a SCREEN substrate (`inv` — a screen point inverted
 * back onto the chart, which is what decides whether a mark may be laid there)
 * and a CHART substrate (`solve` — a screen millimetre step turned into a step
 * in (a, b), which is how every streamline walk moves). Both were written
 * against charts whose parameter speed is roughly uniform. Two of the twelve
 * foundational primitives are nowhere near uniform, and each broke one
 * substrate in a way the gallery in docs/tone-laws shows plainly.
 *
 * (1) WHITE GAPS — `inv`'s seed lattice.
 *     `topoSuperellipsoid` is sgn(cos t)·|cos t|^0.4 in both angles. At t = 0
 *     the partner coordinate's derivative goes as |sin t|^-0.6, i.e. to
 *     infinity, so ONE 1/96 step of the parameter at a face centre moves the
 *     sample a quarter of the body across. The uniform 96x96 lattice `inv`
 *     seeds Newton from therefore has no point at all over a wide band on the
 *     four face-centre meridians and on the equator; `inv` answers null there;
 *     and every screen-space law leaves that band bare. Measured on the
 *     gallery build: nearest-lattice-point distance 3.48 mm at the 99th
 *     percentile against 0.5-0.85 mm on every other primitive, and 17.6 % of
 *     the visible front surface with `inv` returning null — the white cross.
 *     `torusKnot` has the same fault from a different cause (the sweep bunches
 *     where the knot doubles back): 14.4 %.
 *
 * (2) STRAY LINES — an unverified chart step.
 *     `solve` is a LINEARISATION. Where the chart degenerates — a cone's apex,
 *     an ellipsoid's umbilic pole, a torus's inner ring — the determinant is
 *     small but not small enough to be rejected, and the solved (da, db) lands
 *     somewhere else entirely on the parameter square. `at` returns a perfectly
 *     valid front-facing sample THERE, the walk pushes it, and the polyline
 *     draws a straight chord between two legitimate but non-adjacent points.
 *     Measured: `defectSplit` laid a 42.3 mm chord across the ellipsoid, ten
 *     chords totalling 111 mm on the cone, and thirty on the torus of which six
 *     crossed the hole — 41.6 mm of ink outside the silhouette, which the
 *     file's own invariant 1 forbids.
 *
 * Both assertions below fail on the pre-fix file and pass on the fixed one.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const SUN = { id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false };

// The `add` sizes from src/core/scene3d/params.js, so these are the shapes a
// user actually gets from the primitive picker.
const SIZES = {
  ellipsoid: { sx: 30, sy: 20, sz: 22, detail: 26 },
  cone: { sx: 20, sy: 22, sz: 20, detail: 24 },
  torus: { sx: 34, sy: 9, sz: 9, detail: 24 },
  superellipsoid: { sx: 26, sy: 26, sz: 26, detail: 24 },
  torusKnot: { sx: 30, sy: 6, sz: 6, detail: 28 },
};

const SLOW = 120000;

describe('Scene3D mono substrate — the superellipsoid and torusKnot charts', () => {
  let runtime; let win; let V; let algo; let defaults; let SF;
  const optsFor = {};

  // The REAL opts bag `scene3d.js` builds for a chart-wrapped primitive,
  // captured by wrapping buildObject during one real `algo.generate` pass — the
  // same technique scene3d-tone-law-dispatch.test.js uses, and for the same
  // reason: nothing here hand-rolls the projection or the transform.
  const captureOpts = (primitive) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1',
      name: 's',
      primitive,
      params: clone(SIZES[primitive]),
      transform: {
        x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
      },
      visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    p.styleTable = { scene: { penId: null, mapper: 'hatch', params: { fillAngle: 45, fillDensity: 60 } }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [SUN];

    const calls = [];
    const orig = SF.buildObject;
    SF.buildObject = function wrapped(o) {
      const result = orig.call(this, o);
      calls.push({ opts: o, result });
      return result;
    };
    try { algo.generate(p, null, null, BOUNDS); } finally { SF.buildObject = orig; }
    let best = calls[0];
    calls.forEach((c) => { if ((c.result || []).length > (best.result || []).length) best = c; });
    return best && best.opts;
  };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    win = runtime.window;
    V = win.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Object.keys(SIZES).forEach((k) => { optsFor[k] = captureOpts(k); });
  }, SLOW);
  afterAll(() => runtime.cleanup());

  const run = (primitive, toneLaw) => {
    win.__MONO_TRACE = 1;
    win.__MONO_CTX = null;
    const out = SF.buildObject({ ...optsFor[primitive], toneLaw });
    return out || [];
  };

  /* ── (1) the screen substrate must cover the form ───────────────────────── */
  // Asked of the LIVE context the law itself used, not of a copy: a harness
  // that reimplements `inv` measures its own copy, and the copy is what went
  // stale while the white cross was being diagnosed.
  const coverage = (primitive) => {
    run(primitive, 'dutyConst');
    const C = win.__MONO_CTX;
    expect(C, `no mono context published for ${primitive} — the law did not dispatch`).toBeTruthy();
    expect(C.ok).toBe(true);
    // THE PROBE SET MUST BE DENSE ON THE PAPER, NOT IN THE PARAMETER SQUARE.
    // A uniform (a, b) grid is the very distribution that hides this defect:
    // on a superellipsoid the band that goes bare occupies a THIRD of the body
    // on screen and one grid step in the parameter, so a uniform grid puts one
    // sample in it and reports 0.5 % missing where a viewer sees a white cross.
    // So the probe set is grown by bisecting each parameter interval until its
    // two ends land within PROBE_MM of each other on screen — and PROBE_MM is
    // deliberately FINER than the lattice the fix builds, so most probe points
    // are not lattice points and `inv` has to do real work to answer them.
    const PROBE_MM = 0.35;
    const N = 120;
    const probes = [];
    const bisect = (a0, b0, s0, a1, b1, s1, depth) => {
      if (!s0 || !s1 || depth <= 0) return;
      if (Math.hypot(s1.x - s0.x, s1.y - s0.y) <= PROBE_MM) return;
      const am = (a0 + a1) / 2; const bm = (b0 + b1) / 2;
      const sm = C.at(am, bm);
      if (!sm) return;
      probes.push({ x: sm.x, y: sm.y });
      bisect(a0, b0, s0, am, bm, sm, depth - 1);
      bisect(am, bm, sm, a1, b1, s1, depth - 1);
    };
    const grid = [];
    for (let i = 0; i <= N; i += 1) {
      const row = [];
      for (let j = 0; j <= N; j += 1) {
        const s = C.at(i / N, j / N);
        row.push(s ? { x: s.x, y: s.y } : null);
        if (s && j < N) probes.push({ x: s.x, y: s.y });
      }
      grid.push(row);
    }
    for (let i = 0; i <= N; i += 1) {
      for (let j = 0; j < N; j += 1) bisect(i / N, j / N, grid[i][j], i / N, (j + 1) / N, grid[i][j + 1], 10);
    }
    for (let j = 0; j <= N; j += 1) {
      for (let i = 0; i < N; i += 1) bisect(i / N, j / N, grid[i][j], (i + 1) / N, j / N, grid[i + 1][j], 10);
    }
    let miss = 0;
    probes.forEach((p) => { if (!C.inv(p.x, p.y)) miss += 1; });
    return { on: probes.length, miss, pct: probes.length ? (miss / probes.length) * 100 : 100 };
  };

  test('1. `inv` answers for the surface it is standing on (superellipsoid)', () => {
    const c = coverage('superellipsoid');
    expect(c.on).toBeGreaterThan(2000);
    // Pre-fix this stood at 17.6 % of the interior. The bar is set at 3 % so
    // the silhouette band — where `inv` is entitled to refuse a point that is
    // half off the form — cannot make the assertion flap.
    expect(c.pct, `inv() refused ${c.pct.toFixed(2)}% of ${c.on} front-facing chart samples on the superellipsoid`).toBeLessThan(3);
  }, SLOW);

  test('2. `inv` answers for the surface it is standing on (torusKnot)', () => {
    const c = coverage('torusKnot');
    expect(c.on).toBeGreaterThan(2000);
    expect(c.pct, `inv() refused ${c.pct.toFixed(2)}% of ${c.on} front-facing chart samples on the torusKnot`).toBeLessThan(3);
  }, SLOW);

  /* ── (2) no mark may jump the chart ─────────────────────────────────────── */
  // Every emitter in the file samples at 0.5 mm or finer and the streamline
  // walk steps 0.34 mm, so no legitimate segment approaches 2 mm. A segment
  // that does is a chart jump, and the straight line it draws is the stray.
  const longestSegment = (primitive, toneLaw) => {
    const paths = run(primitive, toneLaw);
    const fill = paths.filter((p) => p && p.length >= 2 && (!p.meta || p.meta.kind !== 'sceneEdge'));
    let worst = 0; let at = null;
    fill.forEach((p) => {
      for (let i = 1; i < p.length; i += 1) {
        const d = Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
        if (d > worst) { worst = d; at = [Math.round(p[i - 1].x * 10) / 10, Math.round(p[i - 1].y * 10) / 10]; }
      }
    });
    return { worst, at, paths: fill.length };
  };

  test.each(['ellipsoid', 'cone', 'torus', 'superellipsoid'])(
    '3. a streamline law lays no chord across the body (defectSplit on %s)',
    (primitive) => {
      const r = longestSegment(primitive, 'defectSplit');
      expect(r.paths).toBeGreaterThan(4);
      expect(
        r.worst,
        `defectSplit on ${primitive}: longest emitted segment ${r.worst.toFixed(2)} mm at ${r.at} — the walk jumped the chart`,
      ).toBeLessThan(2);
    },
    SLOW,
  );

  test('4. the direction-field law lays no chord either (etfKang on the ellipsoid)', () => {
    const r = longestSegment('ellipsoid', 'etfKang');
    expect(r.worst).toBeLessThan(2);
  }, SLOW);

  /* ── (3) the monoline invariant itself ──────────────────────────────────── */
  test('5. every path of every mono law is still at one pen width', () => {
    const laws = ['etfKang', 'defectSplit', 'mezzoRegion', 'originSpiral', 'dutyConst',
      'endShorten', 'turingStripe', 'voronoiWeb', 'mazeFill'];
    const offenders = [];
    laws.forEach((law) => {
      // The ellipsoid, not the superellipsoid: the monoline claim is a property
      // of the laws and not of the chart, and nine laws on the refined
      // superellipsoid lattice costs 45 s to say the same thing.
      run('ellipsoid', law).forEach((p) => {
        const w = p && p.meta && p.meta.weightScale;
        if (w !== undefined && w !== null && Number(w) !== 1) offenders.push(`${law}:${w}`);
      });
    });
    expect(offenders, `these mono paths carry a weight scale: ${offenders.slice(0, 8).join(', ')}`).toEqual([]);
  }, SLOW);
});
