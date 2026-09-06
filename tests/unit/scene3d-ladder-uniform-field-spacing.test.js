const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * W-26 — THE USER'S RULE, VERBATIM: "ladder, fine ladder, and contour must
 * not have irregular gaps unless they're required to create a perceptual
 * gradient of light and shadow."
 *
 * ROOT CAUSE (docs/3d-audit/plan-W26-W27.md, F-23). The discrete ladder
 * SUBSETS a fixed master grid: at constant coverage `c` the phase
 * accumulator (`ladderStep`) keeps the Sturmian word of density `c`, whose
 * kept-INDEX gaps are `floor(1/c)` and `ceil(1/c)` pitches. On a field close
 * to uniform (a cone or cylinder contour ring, a capsule barrel), EVERY kept
 * ruling reads close to the same coverage, so the gap set alternates
 * 1-and-2 master-grid pitches with nothing behind it — a real, DRAWN ~2x
 * spacing jump the user is naming ("irregular gaps"), not a tone gradient.
 *
 * THE FIX (this file's GREEN half): `ladder`, `fineLadder` and
 * `phaseFineLadder` are moved onto the continuous-placement engine
 * `contField*` already uses (`Scene3D.SurfaceFill`'s `emitContFamily`): the
 * spacing off the master grid IS the tone, so no ruling is ever dropped —
 * only WHERE the next one lands moves. See `src/core/scene3d/surface-fill.js`
 * — `isEvenLadder`, `ladderCov`, `ladderWantedPitch`, the `algoCoverage`
 * short-circuit, `covAtSample`'s simplified dispatch, `contMapper`'s
 * dispatch, and the spiral mapper's continuous-turn-placement branch.
 *
 * RED PROOF (manual, per this repo's `scriptOverrides` convention — see
 * `tests/helpers/load-vectura-runtime.js`): this file's own measurement
 * helpers, run against `git show 9fa159f0:src/core/scene3d/surface-fill.js`
 * (this unit's base sha — the W-01 M1 landing, reviewed ACCEPT in
 * `docs/3d-audit/lane-reports/W-01-M1-review.md`) via `scriptOverrides`,
 * measured:
 *   - cone+contour       R1a ratio 2.05  (bar 1.15) — matches the addendum's
 *     inferred ~2.02 closely
 *   - cylinder+contour   R1a ratio 2.00  (bar 1.15)
 *   - capsule-barrel     R1a ratio 2.00  (bar 1.15)
 *   - cone+spiral turn-advance ratio 77.2 (bar 1.15) — far worse than the
 *     addendum's inferred ~2.0: the discrete per-turn ladder verdict on this
 *     fixture drops enough CONSECUTIVE turns in the dark band that the
 *     turn-to-turn gap spikes, not just alternates 1x/2x.
 * all four RED against the bar; all four GREEN (<=1.15, cone+spiral 1.05) on
 * this tree. Full numbers recorded in `docs/3d-audit/lane-reports/W-26-impl.md`.
 */

const clone = (val) => JSON.parse(JSON.stringify(val));
const PEN = 0.3;
const BOUNDS = {
  width: 320, height: 220, m: 10, dW: 300, dH: 200,
  penWidth: PEN, truncate: 4, fastPreview: false, preview3dQuality: 'high',
};
// THE RIG IS IMPORTED, NOT COPIED (scene3d-fixture-single-source, rule A).
const { CAMERA, SUN } = require('../fixtures/scene3d-shadow-anatomy');

const R1A_BAR = 1.15;

describe('Scene3D.SurfaceFill — W-26 ladder family placed continuously', () => {
  let runtime; let V; let algo; let defaults; let SF; let Regions;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    SF = V.Scene3D.SurfaceFill;
    Regions = V.Scene3D.Regions;
  });
  afterAll(() => runtime.cleanup());

  const scene = (mapper, primitive, sizes) => {
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
  const emittedRuns = (mapper, primitive, sizes) => {
    const orig = SF.buildObject;
    const raw = [];
    SF.buildObject = function wrapped(opts) {
      const r = orig.call(this, opts);
      if (r) r.forEach((q) => raw.push(q));
      return r;
    };
    try {
      algo.generate(scene(mapper, primitive, sizes), new V.SeededRNG(0), new V.SimpleNoise(0), BOUNDS);
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

  // ── THE UNIFORM-FIELD LEMMA (analytic, cited not merely assumed) ─────────
  //
  // cone normal = f(azimuth) ONLY, independent of the along-axis coordinate
  // (charts.js:154-158's `topoCone`: the radial tangent's magnitude scales
  // with `r = sx*(1-u)` but its DIRECTION does not, and normalizing the
  // cross product cancels the scale — the normal field is literally the
  // SAME function of azimuth at every along-axis position). Same argument
  // for `topoCylinder` (charts.js:161-164): both tangents are independent of
  // the along-axis coordinate outright. So every CONTOUR ring (fixed
  // along-axis, swept azimuth) integrates the identical distribution of
  // normals as every other ring — the family's ring-mean intensity is
  // constant ring-to-ring under a FIXED light, which is exactly the field
  // R1a's 1.15 bar is stated against.
  const ringMeanI = (mode, sizes, aVal, light) => {
    const chart = SF.chartFor(mode, sizes);
    if (typeof chart !== 'function') return null;
    const NB = 48;
    const EPS = 1e-4;
    let sum = 0;
    let n = 0;
    for (let k = 0; k < NB; k += 1) {
      const b = k / NB;
      const p0 = chart(aVal, b);
      const pa = chart(Math.min(1, aVal + EPS), b);
      const pb = chart(aVal, (b + EPS) % 1);
      if (!p0 || !pa || !pb) continue;
      const dA = { x: (pa.x - p0.x) / EPS, y: (pa.y - p0.y) / EPS, z: (pa.z - p0.z) / EPS };
      const dB = { x: (pb.x - p0.x) / EPS, y: (pb.y - p0.y) / EPS, z: (pb.z - p0.z) / EPS };
      const nrm = {
        x: dA.y * dB.z - dA.z * dB.y,
        y: dA.z * dB.x - dA.x * dB.z,
        z: dA.x * dB.y - dA.y * dB.x,
      };
      const mag = Math.hypot(nrm.x, nrm.y, nrm.z);
      if (!(mag > 1e-9)) continue;
      const nn = { x: nrm.x / mag, y: nrm.y / mag, z: nrm.z / mag };
      const world = { x: p0.x, y: p0.y + 55, z: p0.z };
      const I = Regions.combinedIntensity(nn, world, [light]);
      sum += Math.max(0, Math.min(1, I));
      n += 1;
    }
    return n ? sum / n : null;
  };

  const CONE_SIZES = { sx: 30, sy: 40, sz: 30 };
  const CYL_SIZES = { sx: 22, sy: 40, sz: 22 };
  const CAPSULE_SIZES = { sx: 10, sy: 60, sz: 10 }; // r << half-length: mostly barrel

  describe('the uniform-field lemma', () => {
    it('cone+contour: ring-mean intensity is constant across the along-axis family (max-min < 1e-3)', () => {
      // `chartFor('cone', …)` wraps the lateral chart in `cappedChart`
      // (surface-fill.js:98-117): `a` below `capR/totalLen` (0.273 for
      // CONE_SIZES) lands on the flat base disc, a genuinely different
      // normal field. Sampled strictly inside the lateral span.
      const light = SUN;
      const aVals = [0.35, 0.5, 0.65, 0.8, 0.95];
      const means = aVals.map((a) => ringMeanI('cone', CONE_SIZES, a, light)).filter((v) => v != null);
      expect(means.length).toBe(aVals.length);
      expect(Math.max(...means) - Math.min(...means)).toBeLessThan(1e-3);
    });

    it('cylinder+contour: ring-mean intensity is constant across the along-axis family (max-min < 1e-3)', () => {
      // Same cap-guard as the cone case; a cylinder is capped at BOTH ends
      // (`cappedChart`'s `both` branch), lateral span [0.177, 0.823] for
      // CYL_SIZES — sampled strictly inside it.
      const light = SUN;
      const aVals = [0.25, 0.4, 0.5, 0.6, 0.75];
      const means = aVals.map((a) => ringMeanI('cylinder', CYL_SIZES, a, light)).filter((v) => v != null);
      expect(means.length).toBe(aVals.length);
      expect(Math.max(...means) - Math.min(...means)).toBeLessThan(1e-3);
    });
  });

  describe('R1a — drawn projected gap ratio on a proven-uniform field', () => {
    it('cone+contour: max/min drawn gap <= 1.15', () => {
      const reps = repsFor(emittedRuns('contour', 'cone', CONE_SIZES));
      expect(reps.length).toBeGreaterThan(4); // vacuous-pass guard: paths > 0
      // Cone: only the BASE end (a < 0.273) is remapped onto the flat cap
      // (`both=false` in `cappedChart`) — the apex (a=1) tapers naturally.
      const gaps = gapsOf(excludeEnds(reps, 0.32, 0));
      expect(gaps.length).toBeGreaterThan(2);
      expect(ratio(gaps)).toBeLessThanOrEqual(R1A_BAR);
    });

    it('cylinder+contour: max/min drawn gap <= 1.15', () => {
      const reps = repsFor(emittedRuns('contour', 'cylinder', CYL_SIZES));
      expect(reps.length).toBeGreaterThan(4);
      // Cylinder: BOTH ends are remapped onto flat caps (a < 0.177 or > 0.823).
      const gaps = gapsOf(excludeEnds(reps, 0.22, 0.22));
      expect(gaps.length).toBeGreaterThan(2);
      expect(ratio(gaps)).toBeLessThanOrEqual(R1A_BAR);
    });

    it('capsule barrel (middle 60% of the family, away from the hemispherical caps): max/min drawn gap <= 1.15', () => {
      const reps = repsFor(emittedRuns('contour', 'capsule', CAPSULE_SIZES));
      expect(reps.length).toBeGreaterThan(8);
      const lo = Math.floor(reps.length * 0.2);
      const hi = Math.ceil(reps.length * 0.8);
      const barrel = reps.slice(lo, hi);
      const gaps = gapsOf(barrel);
      expect(gaps.length).toBeGreaterThan(2);
      expect(ratio(gaps)).toBeLessThanOrEqual(R1A_BAR);
    });
  });

  describe('spiral turn-advance ratio', () => {
    // Every FRONT sample of the whole helix, in emission order — the same
    // curve is (almost always) one continuous run for this fixture/camera,
    // so run order + point order together IS the sample order. A turn
    // boundary is detected as a zero-upward-crossing of the AZIMUTHAL
    // (perpendicular-to-drift) screen coordinate — one per winding,
    // independent of axial drift — and the gap between consecutive
    // crossings, projected onto the drift axis, is the turn-to-turn advance
    // this unit's `sweepAtCont` now places continuously instead of by
    // whole-turn drop.
    const turnAdvanceRatio = (raw) => {
      const pts = [];
      raw.forEach((run) => { if (!run.back) for (let i = 0; i < run.length; i += 1) pts.push(run[i]); });
      if (pts.length < 20) return null;
      const first = pts[0];
      const last = pts[pts.length - 1];
      const axLen = Math.hypot(last.x - first.x, last.y - first.y);
      if (!(axLen > 1e-6)) return null;
      const axis = { x: (last.x - first.x) / axLen, y: (last.y - first.y) / axLen };
      const perp = { x: -axis.y, y: axis.x };
      const proj = []; const orth = [];
      pts.forEach((p) => {
        const dx = p.x - first.x; const dy = p.y - first.y;
        proj.push(dx * axis.x + dy * axis.y);
        orth.push(dx * perp.x + dy * perp.y);
      });
      const crossings = [];
      for (let i = 1; i < orth.length; i += 1) {
        if (orth[i - 1] <= 0 && orth[i] > 0) {
          const t = orth[i - 1] / (orth[i - 1] - orth[i]);
          crossings.push(proj[i - 1] + (proj[i] - proj[i - 1]) * t);
        }
      }
      if (crossings.length < 4) return null;
      const gaps = [];
      for (let i = 1; i < crossings.length; i += 1) gaps.push(Math.abs(crossings[i] - crossings[i - 1]));
      const nz = gaps.filter((v) => v > 1e-6);
      return nz.length >= 2 ? Math.max(...nz) / Math.min(...nz) : null;
    };

    it('cone+spiral: turn-advance ratio <= 1.15', () => {
      const raw = emittedRuns('spiral', 'cone', CONE_SIZES);
      expect(raw.length).toBeGreaterThan(0); // vacuous-pass guard
      const r = turnAdvanceRatio(raw);
      expect(r).not.toBeNull();
      expect(r).toBeLessThanOrEqual(R1A_BAR);
    });
  });

  describe('R1c — tone still survives on a genuinely graded field', () => {
    it('sphere+hatch: whole-form max/min drawn gap >= 2 (the fix does not flatten a real gradient)', () => {
      const reps = repsFor(emittedRuns('hatch', 'sphere', { sx: 25, sy: 25, sz: 25 }));
      expect(reps.length).toBeGreaterThan(4);
      const gaps = gapsOf(reps);
      expect(gaps.length).toBeGreaterThan(2);
      expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThanOrEqual(2);
    });
  });

  describe('vacuous-pass guards', () => {
    it('every ruling of the ladder family on these five cells draws WHOLE (no run carries a weightScale other than 1)', () => {
      [
        ['contour', 'cone', CONE_SIZES],
        ['contour', 'cylinder', CYL_SIZES],
        ['contour', 'capsule', CAPSULE_SIZES],
        ['hatch', 'sphere', { sx: 25, sy: 25, sz: 25 }],
      ].forEach(([mapper, primitive, sizes]) => {
        const raw = emittedRuns(mapper, primitive, sizes);
        expect(raw.length).toBeGreaterThan(0);
        raw.forEach((run) => {
          if (run.weightScale != null) expect(run.weightScale).toBe(1);
        });
      });
    });

    it('the ladder-family fix is not a no-op: cone+contour spacing differs from the fixed master-grid subset a literal Bresenham ladder would draw', () => {
      // Direct proxy for "before/after not byte-identical": a subset of a
      // FIXED master grid can only ever draw at INTEGER multiples of one
      // pitch (masterPitch/N for some small integer N); the continuous
      // placement this unit ships draws at pitches that are NOT all integer
      // multiples of a single base value, because they track the field
      // continuously rather than snapping to a shared grid.
      const reps = repsFor(emittedRuns('contour', 'cone', CONE_SIZES));
      const gaps = gapsOf(reps);
      expect(gaps.length).toBeGreaterThan(3);
      const base = Math.min(...gaps);
      const nonIntegerMultiple = gaps.some((g) => {
        const ratioToBase = g / base;
        return Math.abs(ratioToBase - Math.round(ratioToBase)) > 0.03;
      });
      expect(nonIntegerMultiple).toBe(true);
    });
  });
});
