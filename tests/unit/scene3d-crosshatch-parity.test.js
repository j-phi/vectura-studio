const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * W-36 — USER (Jay, verbatim): "make crosshatch have the same number of
 * crosshatch lines as it has hatch lines unless there's a special algorithm
 * that mandates this is not the case or variation is needed for
 * highlight/shadow."
 *
 * Root cause (docs/3d-audit/lane-reports/W-36-plan.md §1): W-26b-1
 * (`surface-fill.js`, `CROSS_SHARE_BASE = 0.1`) gave the crosshatch crossing
 * family (`A#1`) only a TENTH of the primary family's (`A#0`) coverage share
 * at the shipped `crossDensityRatio = 1`, so its wanted PITCH is ~10x wider
 * than family A's by construction — on a sphere/torus at low density family
 * B draws as few as ONE ruling.
 *
 * ORCHESTRATOR RULING (LEDGER.md "Standing orchestrator rulings",
 * 2026-09-08): the oracle here is P1-P6 below, NOT the brief's literal ±10%
 * count bar. Equal pitch does NOT give equal counts — the two families
 * traverse different extents of the same silhouette (measured: ellipsoid
 * d=50, gaps 0.3% apart, counts 22% apart) — and the pre-audit v1.3.98
 * picture Jay accepts as correct is ITSELF outside ±10% on counts (B:A
 * 0.54-1.10). Forcing literal count parity would require making one family
 * unevenly spaced, which W-31 exists to forbid. Equal SPACING is the
 * physical content of Jay's rule; count parity is its consequence up to the
 * silhouette's own aspect.
 *
 * Rig (matches the audit-capture rig used throughout this plan):
 * PRIMITIVE_PARAM_DEFAULTS + DEFAULT_CAMERA, sun 135deg/45deg (no cast
 * shadow — irrelevant to fill placement), ground+backdrop off, fillAngle 45,
 * toneLaw 'ladder' (the shipped default), BOUNDS 320x220 pen 0.3.
 */

const BOUNDS = {
  width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3,
};
const clone = (v) => JSON.parse(JSON.stringify(v));
const PRIMS = ['sphere', 'cylinder', 'torus', 'ellipsoid'];

describe('W-36 — crosshatch crossing family carries the same pitch as the primary family', () => {
  let runtime; let V; let algo; let P; let SurfaceFill; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    P = V.Scene3D.Params;
    SurfaceFill = V.Scene3D.SurfaceFill;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  // ── Scene builder — one object, the rig above, styled by `mapper` ────────
  const sceneFor = (primitive, mapper, density, extraStyle = {}) => {
    const p = clone(defaults);
    p.camera = { ...P.DEFAULT_CAMERA };
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.lights = [{
      id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: false,
    }];
    p.objects = [{
      id: 'obj-1',
      name: 'Obj',
      primitive,
      params: clone(P.PRIMITIVE_PARAM_DEFAULTS[primitive]),
      transform: {
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1,
      },
      visibility: 'solid',
    }];
    const style = {
      penId: null,
      mapper,
      params: {
        fillAngle: 45, fillDensity: density, toneLaw: 'ladder', ...extraStyle,
      },
    };
    p.styleTable = { scene: clone(style), byObject: { 'obj-1': clone(style) }, byFace: {} };
    return p;
  };

  // ── Raw runs, per the in-repo idiom (scene3d-curved-crosshatch-controls
  // .test.js:177-180): wrap SurfaceFill.buildObject and collect what it
  // actually returns — the ONLY place `.fam` / `.lineIndex` / `.back` survive
  // (scene3d.js re-emits the fill runs without `.fam`).
  const rawRuns = (params) => {
    const seen = [];
    const real = SurfaceFill.buildObject;
    SurfaceFill.buildObject = (o) => {
      const r = real(o);
      if (Array.isArray(r)) r.forEach((run) => seen.push(run));
      return r;
    };
    try {
      algo.generate(params, null, null, BOUNDS);
    } finally {
      SurfaceFill.buildObject = real;
    }
    return seen;
  };

  // Distinct-lineIndex ruling count + median centre-to-centre gap (mm),
  // sorted by lineIndex, for ONE family's front-facing runs (X-ray `.back`
  // already excluded by the caller — case 4, §2.1).
  const rulingStats = (runs) => {
    const byLine = new Map();
    runs.forEach((r) => {
      if (r.lineIndex == null) return;
      if (!byLine.has(r.lineIndex)) byLine.set(r.lineIndex, []);
      byLine.get(r.lineIndex).push(...r);
    });
    const lines = Array.from(byLine.entries()).sort((a, b) => a[0] - b[0]);
    const centroids = lines.map(([, pts]) => {
      let sx = 0; let sy = 0; let n = 0;
      pts.forEach((pt) => {
        if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) { sx += pt.x; sy += pt.y; n += 1; }
      });
      return n ? { x: sx / n, y: sy / n } : null;
    }).filter(Boolean);
    const gaps = [];
    for (let i = 1; i < centroids.length; i += 1) {
      gaps.push(Math.hypot(centroids[i].x - centroids[i - 1].x, centroids[i].y - centroids[i - 1].y));
    }
    gaps.sort((a, b) => a - b);
    const n = gaps.length;
    const gap = n ? (n % 2 ? gaps[(n - 1) / 2] : (gaps[n / 2 - 1] + gaps[n / 2]) / 2) : null;
    return { n: lines.length, gap };
  };

  // A#0 / A#1 stats for a crosshatch cell. Asserts exactly two families exist
  // (§3.0's mandatory guard) so a future third family fails loudly rather
  // than silently merging into the pair.
  const crosshatchStats = (primitive, density, extraStyle = {}) => {
    const runs = rawRuns(sceneFor(primitive, 'crosshatch', density, extraStyle));
    const front = runs.filter((r) => !r.back);
    const fams = Array.from(new Set(front.map((r) => r.fam))).sort();
    expect(fams.length).toBe(2);
    const [famA, famB] = fams;
    return {
      a: rulingStats(front.filter((r) => r.fam === famA)),
      b: rulingStats(front.filter((r) => r.fam === famB)),
    };
  };

  const finalFills = (params) => (algo.generate(params, null, null, BOUNDS) || [])
    .filter((pth) => pth.meta && pth.meta.kind === 'sceneFill');
  const inkOf = (paths) => paths.reduce((acc, pth) => {
    let s = 0;
    for (let i = 1; i < pth.length; i += 1) s += Math.hypot(pth[i].x - pth[i - 1].x, pth[i].y - pth[i - 1].y);
    return acc + s;
  }, 0);

  // ── P1 — both families draw at least 2 rulings on every cell ────────────
  describe('P1 — both families draw >= 2 rulings on every cell', () => {
    PRIMS.forEach((prim) => {
      [1, 50, 220].forEach((d) => {
        test(`${prim} d=${d}`, () => {
          const { a, b } = crosshatchStats(prim, d);
          expect(a.n).toBeGreaterThanOrEqual(2);
          expect(b.n).toBeGreaterThanOrEqual(2);
        });
      });
    });
  });

  // ── P2 — median-gap ratio B:A in [0.80, 1.25] at d=50/220 ────────────────
  describe('P2 — median-gap ratio B:A in [0.80, 1.25] at d=50/220', () => {
    PRIMS.forEach((prim) => {
      [50, 220].forEach((d) => {
        test(`${prim} d=${d}`, () => {
          const { a, b } = crosshatchStats(prim, d);
          expect(a.gap).not.toBeNull();
          expect(b.gap).not.toBeNull();
          const ratio = b.gap / a.gap;
          expect(ratio).toBeGreaterThanOrEqual(0.80);
          expect(ratio).toBeLessThanOrEqual(1.25);
        });
      });
    });
  });

  // ── P3 — count ratio B:A in [0.72, 1.40] at d=50/220 ─────────────────────
  describe('P3 — count ratio B:A in [0.72, 1.40] at d=50/220', () => {
    PRIMS.forEach((prim) => {
      [50, 220].forEach((d) => {
        test(`${prim} d=${d}`, () => {
          const { a, b } = crosshatchStats(prim, d);
          const ratio = b.n / a.n;
          expect(ratio).toBeGreaterThanOrEqual(0.72);
          expect(ratio).toBeLessThanOrEqual(1.40);
        });
      });
    });
  });

  // ── P4 — at d=1, abs(nB - nA) <= 3 (integers, not a percentage) ──────────
  describe('P4 — at d=1, |nB - nA| <= 3', () => {
    PRIMS.forEach((prim) => {
      test(`${prim} d=1`, () => {
        const { a, b } = crosshatchStats(prim, 1);
        expect(Math.abs(b.n - a.n)).toBeLessThanOrEqual(3);
      });
    });
  });

  // ── P5 — anti-saturation guard (judge C1's cell) ─────────────────────────
  test('P5 — cylinder d=220 crosshatch ink stays in [4200, 5431] mm (v1.3.98 + 15% cap)', () => {
    const ink = inkOf(finalFills(sceneFor('cylinder', 'crosshatch', 220)));
    expect(ink).toBeGreaterThanOrEqual(4200);
    expect(ink).toBeLessThanOrEqual(5431);
  });

  // ── P6 — byte-identity controls: non-crosshatch mappers are untouched ────
  describe('P6 — byte-identity controls (hatch/contour untouched)', () => {
    test('sphere hatch d=50 = 24 fills / 723.4 mm', () => {
      const paths = finalFills(sceneFor('sphere', 'hatch', 50));
      expect(paths.length).toBe(24);
      expect(inkOf(paths)).toBeCloseTo(723.4, 0);
    });
    test('cylinder hatch d=220 = 145 fills / 4495.5 mm', () => {
      const paths = finalFills(sceneFor('cylinder', 'hatch', 220));
      expect(paths.length).toBe(145);
      expect(inkOf(paths)).toBeCloseTo(4495.5, 0);
    });
    test('sphere contour d=50 = 18 fills / 656.4 mm', () => {
      const paths = finalFills(sceneFor('sphere', 'contour', 50));
      expect(paths.length).toBe(18);
      expect(inkOf(paths)).toBeCloseTo(656.4, 0);
    });
  });

  // ── Jay's own cell — sphere, Crosshatch, Ladder, Fine rungs, angle 45, d=50
  describe("Jay's cell — sphere crosshatch, rungMode 'fine', fillAngle 45, d=50", () => {
    test('P2/P3 hold on the Fine-rungs cell too', () => {
      const { a, b } = crosshatchStats('sphere', 50, { rungMode: 'fine' });
      const gapRatio = b.gap / a.gap;
      const countRatio = b.n / a.n;
      expect(gapRatio).toBeGreaterThanOrEqual(0.80);
      expect(gapRatio).toBeLessThanOrEqual(1.25);
      expect(countRatio).toBeGreaterThanOrEqual(0.72);
      expect(countRatio).toBeLessThanOrEqual(1.40);
    });
  });
});
