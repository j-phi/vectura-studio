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
 * W-36c (2026-09-10, JAY'S DECISION 6 -> option C, docs/3d-audit/
 * lane-reports/W-36c-plan.md): W-36's shipped Rank 1 gave the crossed pair
 * ONE shared coverage budget (`CROSS_PAIR_BUDGET = 1.1`, split so each
 * family got roughly HALF of a lone hatch's target) — MEASURED, no family
 * anywhere rose above 0.74x the matching hatch count. Jay's rule is
 * stronger: EACH family carries the SAME ruling count a single-family hatch
 * draws at the same Density — not a shared split. That is ~2x the ink of a
 * hatch (accepted explicitly), which needs a NEW anti-saturation cap so
 * Density 220 does not go solid: `crossMinPitch() = 2 x inkWidth()`, the
 * pitch at which the pair's cell keeps one clear ink-width of white on each
 * side. P3 and P5 below are REWRITTEN for this rule; P1/P2/P4/P6 and the
 * whole W-26 gap-jump / W-36b bearing-stability / plot-safety guard battery
 * are untouched (see the sibling lane reports for full guard results).
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
const PRIMS6 = ['sphere', 'cylinder', 'torus', 'ellipsoid', 'cone', 'capsule'];
const PEN_MM = 0.3;

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

  // W-36c — the single-family hatch ruling count at the same rig/density,
  // the TARGET each crosshatch family is measured against (P3a).
  const hatchRulingCount = (primitive, density, extraStyle = {}) => {
    const runs = rawRuns(sceneFor(primitive, 'hatch', density, extraStyle));
    const front = runs.filter((r) => !r.back);
    return rulingStats(front).n;
  };

  const finalFills = (params) => (algo.generate(params, null, null, BOUNDS) || [])
    .filter((pth) => pth.meta && pth.meta.kind === 'sceneFill');
  const inkOf = (paths) => paths.reduce((acc, pth) => {
    let s = 0;
    for (let i = 1; i < pth.length; i += 1) s += Math.hypot(pth[i].x - pth[i - 1].x, pth[i].y - pth[i - 1].y);
    return acc + s;
  }, 0);

  // W-26b `inkCoverage` instrument, copied VERBATIM from
  // scene3d-fill-span-verdict.test.js (`disc` + `inkCoverage`) so this
  // unit's cap bar and that file's pre-existing `< 0.85` anti-blob bar can
  // never drift apart — same code, applied to this rig's own raw runs.
  const disc = (raw) => {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    raw.forEach((q) => q.forEach((pt) => {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }));
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, R: (maxX - minX) / 2 };
  };
  const inkCoverage = (raw, penWidth) => {
    const d = disc(raw);
    if (!(d.R > 0)) return 0;
    const CELL = 0.1;
    const G = Math.max(4, Math.ceil((2 * d.R) / CELL));
    const x0 = d.cx - d.R; const y0 = d.cy - d.R;
    const r = penWidth / 2;
    const rc = Math.max(1, Math.ceil(r / CELL));
    const inked = new Uint8Array(G * G);
    const stamp = (x, y) => {
      const ci = Math.round((x - x0) / CELL); const cj = Math.round((y - y0) / CELL);
      for (let j = cj - rc; j <= cj + rc; j++) {
        if (j < 0 || j >= G) continue;
        for (let i = ci - rc; i <= ci + rc; i++) {
          if (i < 0 || i >= G) continue;
          const dx = (i - ci) * CELL; const dy = (j - cj) * CELL;
          if (dx * dx + dy * dy <= r * r) inked[j * G + i] = 1;
        }
      }
    };
    raw.filter((q) => !q.back).forEach((q) => {
      for (let i = 1; i < q.length; i++) {
        const a = q[i - 1]; const b = q[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (!(len > 0)) continue;
        const n = Math.max(1, Math.ceil(len / (CELL / 2)));
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          stamp(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        }
      }
    });
    let inkedN = 0; let totalN = 0;
    for (let gy = 0; gy < G; gy++) {
      for (let gx = 0; gx < G; gx++) {
        const X = (x0 + (gx + 0.5) * CELL - d.cx) / d.R;
        const Y = (y0 + (gy + 0.5) * CELL - d.cy) / d.R;
        if (Math.hypot(X, Y) > 1) continue;
        totalN += 1;
        if (inked[gy * G + gx]) inkedN += 1;
      }
    }
    return totalN ? inkedN / totalN : 0;
  };
  // Same-rig crosshatch coverage helper, used by P5a/P5c.
  const crossCov = (primitive, density, extraStyle = {}) => {
    const raw = rawRuns(sceneFor(primitive, 'crosshatch', density, extraStyle)).filter((r) => !r.back);
    return inkCoverage(raw, PEN_MM);
  };
  // The cap's own pitch floor, reproduced from surface-fill.js's derivation
  // (2 x inkWidth, generalised over crossDensityRatio/crossAngleDelta) so
  // P5c can assert "the family sits AT the cap" without importing a private.
  const INK_SPREAD = 0.12;
  const inkWidth = PEN_MM * (1 + INK_SPREAD);
  const crossMinPitchFor = (ratio, role, deltaDeg) => {
    const r = Math.min(2, Math.max(0.25, ratio));
    const th = (Math.min(170, Math.max(10, deltaDeg)) * Math.PI) / 180;
    const s = Math.max(0.17, Math.abs(Math.sin(th)));
    const pA = (2 * inkWidth) / Math.sqrt(Math.max(1e-6, r * s));
    return role === 'b' ? r * pA : pA;
  };

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

  // ── P3a (NEW — W-36c, JAY'S RULE) — each family >= 0.85x the matching
  // hatch ruling count, below the density where the anti-saturation cap
  // starts biting (docs/3d-audit/lane-reports/W-36c-plan.md §2.4: the cap is
  // dormant through d=110 on every primitive and only "first touch"es at
  // d=140; measured worst margin at d=140 is 0.933, cylinder). Jay's own
  // Fine-rungs cell is included — it is the cell the decision was checked
  // against.
  describe('P3a (NEW) — each family >= 0.85x the matching hatch ruling count', () => {
    PRIMS.forEach((prim) => {
      [1, 50, 80, 110, 140].forEach((d) => {
        test(`${prim} d=${d}`, () => {
          const hatchN = hatchRulingCount(prim, d);
          const { a, b } = crosshatchStats(prim, d);
          expect(a.n / hatchN).toBeGreaterThanOrEqual(0.85);
          expect(b.n / hatchN).toBeGreaterThanOrEqual(0.85);
        });
      });
    });
    test("Jay's cell — sphere d=50, rungMode 'fine'", () => {
      const hatchN = hatchRulingCount('sphere', 50, { rungMode: 'fine' });
      const { a, b } = crosshatchStats('sphere', 50, { rungMode: 'fine' });
      expect(a.n / hatchN).toBeGreaterThanOrEqual(0.85);
      expect(b.n / hatchN).toBeGreaterThanOrEqual(0.85);
    });
  });

  // ── P3b (kept, re-scoped) — count ratio B:A in [0.72, 1.40] at d=50/220 ──
  describe('P3b (kept) — count ratio B:A in [0.72, 1.40] at d=50/220', () => {
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

  // ── P5a (NEW — the cap) — W-26b ink coverage stays < 0.85, the SAME bar
  // scene3d-fill-span-verdict.test.js already enforces, on every primitive
  // at the densities where the cap is meant to bind.
  describe('P5a (NEW) — ink coverage < 0.85 (the cap)', () => {
    PRIMS6.forEach((prim) => {
      [170, 220, 300].forEach((d) => {
        test(`${prim} d=${d}`, () => {
          expect(crossCov(prim, d)).toBeLessThan(0.85);
        });
      });
    });
  });

  // ── P5b (NEW — the cap is not too tight) — at d=220 crosshatch ink must
  // never be LESS than v1.4.1's shipped value: W-36c must not make the
  // picture lighter than what shipped before it.
  describe('P5b (NEW) — d=220 crosshatch ink >= v1.4.1 shipped value', () => {
    const SHIPPED_220 = {
      sphere: 3713.0, cylinder: 5019.6, torus: 3195.0, ellipsoid: 4187.6,
    };
    PRIMS.forEach((prim) => {
      test(`${prim} d=220`, () => {
        const ink = inkOf(finalFills(sceneFor(prim, 'crosshatch', 220)));
        expect(ink).toBeGreaterThanOrEqual(SHIPPED_220[prim]);
      });
    });
  });

  // ── P5c (NEW — the family sits AT the cap, not below it) — where the cap
  // binds (d in {170, 220, 300}), each family's median gap must be >= 0.80x
  // `crossMinPitch` — i.e. the walk is actually reaching the floor the cap
  // sets, not falling short of it.
  describe('P5c (NEW) — at the cap, median gap >= 0.80x crossMinPitch', () => {
    PRIMS.forEach((prim) => {
      [170, 220, 300].forEach((d) => {
        test(`${prim} d=${d}`, () => {
          const { a, b } = crosshatchStats(prim, d);
          const floorA = crossMinPitchFor(1, 'a', 90);
          const floorB = crossMinPitchFor(1, 'b', 90);
          expect(a.gap / floorA).toBeGreaterThanOrEqual(0.80);
          expect(b.gap / floorB).toBeGreaterThanOrEqual(0.80);
        });
      });
    });
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
    // W-33 re-pin (device-space adaptive subdivision of contour rulings):
    // the plan's own W-32/W-33 analysis (§1 guard table) named this exact
    // cell as "directly in W-33's path" and predicted "measured drift =~
    // +0.9mm" — measured here: 656.4 -> 657.25mm (+0.85mm). Fill COUNT is
    // unchanged (still 18): the ring count and placement are untouched,
    // only each ring's own polyline gained a handful of points that trace
    // slightly longer than the chords they replace. See W-33-impl.md
    // "Bars changed".
    test('sphere contour d=50 = 18 fills / 657.25 mm', () => {
      const paths = finalFills(sceneFor('sphere', 'contour', 50));
      expect(paths.length).toBe(18);
      expect(inkOf(paths)).toBeCloseTo(657.25, 1);
    });
  });

  // ── Jay's own cell — sphere, Crosshatch, Ladder, Fine rungs, angle 45, d=50
  describe("Jay's cell — sphere crosshatch, rungMode 'fine', fillAngle 45, d=50", () => {
    test('P2/P3b hold on the Fine-rungs cell too', () => {
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
