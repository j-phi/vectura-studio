const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * W-31 — USER (Jay, verbatim, on `user-reports/13-w26-judge-montage.webp`):
 * "I'm unclear on why some of these sections have diamond/square gaps and
 * some have rectangular gaps - are lines not being evenly spaced? The only
 * reason there should be greater amounts of space in some areas is if we're
 * trying to represent highlights on a shape (less ink = more light)."
 *
 * Root cause (`docs/3d-audit/lane-reports/W-31-plan.md` §2, class c-1):
 * `probe()` returns `mmPerFrac` as an area-weighted MEAN over the WHOLE
 * ruling, and the walk takes ONE scalar step from it
 * (`df = clamp(want / pb.mmPerFrac, dfMin, dfMax)`) emitted at a constant
 * parameter offset. A family whose local clearance varies along its rulings
 * gets local gaps that vary the same way; the crossing family's field is the
 * mirror of it, so the CELL ASPECT ramps across the surface even with the
 * light OFF (measured here: cone 0.60 -> 1.77, cylinder 0.73 -> 1.34 at
 * `716b435b`, tone-OFF, so no highlight exemption can apply — the plan's own
 * class (a) proof is that a legitimate highlight opens both families'
 * spacing identically, which the flat-tone control here disables entirely).
 *
 * ORCHESTRATOR RULING (LEDGER.md "Standing orchestrator rulings", the W-31
 * row, 2026-09-09): Rank 1 (per-sample "warped" offset placement) was NOT
 * prototyped by the plan and carries a mandatory go/no-go SPIKE before any
 * test or guard work — clear the cylinder d=220 flat-tone control's five
 * column medians inside [0.85, 1.18] or fall back to Rank 3. Rank 2
 * (per-sample TONE only) is REJECTED BY MEASUREMENT and must never be
 * retried.
 *
 * THIS UNIT RAN THE SPIKE (§4.1a: per-sample `mmArr`/`wantArr` in `probe()`,
 * `lineAtWarped` on the wrapped-angle branch of `angleFamily`, a per-sample
 * walk step accumulated in a cumulative `warpArr`, gated to
 * `crossShare != null && isEvenLadder()`) and MEASURED it on cylinder d=220
 * camera a, this unit's own base (`716b435b`):
 *
 *   flat-tone column medians  before -> after spike
 *     col 0-.2   0.726 -> 0.636  (WORSE — moves further under 0.85)
 *     col .2-.4  0.870 -> 1.024  (into band)
 *     col .4-.6  1.003 -> 0.992  (into band)
 *     col .6-.8  1.176 -> 1.145  (into band)
 *     col .8-1   1.340 -> 0.940  (into band)
 *   lit-rig column medians (after spike): 0.775, 0.837, 1.059, 0.988, 0.657
 *     — 3 of 5 columns still outside [0.85, 1.18]
 *   per-window scatter (outFrac, all interior windows, flat rig): 0.421 (before)
 *     -> 0.667 (after — WORSE); measurable windows 76 -> 39 (FEWER)
 *
 * FOUR of five columns land inside the band, but the fifth (the column
 * nearest the interior box's own edge, where the ruling's local clearance
 * varies most) does not, on BOTH the flat and lit rig — the spike does not
 * clear its own gate. Per the standing ruling this unit STOPS the Rank-1
 * mechanism here (reverted; zero source diff ships) and takes RANK 3: this
 * file lands as a NON-REGRESSION CEILING at today's (`716b435b`) own
 * numbers — nothing tightened, nothing widened, no fix shipped. The
 * placement rewrite is filed as W-31b for the next implementer, who should
 * start from the spike's own failure mode (the outermost interior column,
 * and the per-window scatter regression) rather than re-deriving Rank 1 from
 * zero. Full numbers, per primitive, are in `W-31-impl.md`.
 *
 * Instrument (plan §1.1, reproduced independently on this unit's own base —
 * NOT assumed identical to the plan's `e31d8591` numbers): front faces only,
 * grouped by `run.fam`/`run.lineIndex` via the documented in-repo idiom
 * (wrap `SurfaceFill.buildObject`, restore in `finally` — matches
 * `scene3d-crosshatch-parity.test.js`). LOCAL PERPENDICULAR GAP: at every
 * interior vertex of ruling i, cast a segment along the local normal
 * (from the i-1/i+1 chord) and take the nearest crossing of ruling i+1 —
 * the same "clearance measured across the flow" construction
 * `contFieldAniso`'s `acrossClear` already uses. WINDOWS: bin samples into
 * square windows of side `3 * max(medGapA, medGapB)` (min 2.5mm); a window
 * counts only with >= 3 samples of EACH family. CELL ASPECT =
 * `median(gA in window) / median(gB in window)`. INTERIOR = windows whose
 * centre lies inside the middle 70% of the ink bbox in both u and v — drops
 * the silhouette ring and the chart-pole knot (a stated geometric exemption,
 * not a tolerance). FLAT-TONE CONTROL: the same cell with `lights: []`, so
 * `ladderCov(I)` is constant and any residual aspect deviation is
 * PLACEMENT, not tone.
 */

const BOUNDS = {
  width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3,
};
const clone = (v) => JSON.parse(JSON.stringify(v));

describe('W-31 — crosshatch CELL SHAPE, Rank-3 non-regression ceiling (no source fix; see header)', () => {
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

  // ── Scene builder — matches scene3d-crosshatch-parity.test.js's rig,
  // plus a camera-b toggle and a flat-tone (`lights: []`) toggle. ──────────
  const sceneFor = (primitive, density, camB, flat, extraStyle = {}) => {
    const p = clone(defaults);
    p.camera = camB ? { ...P.DEFAULT_CAMERA, yaw: 40, pitch: -15 } : { ...P.DEFAULT_CAMERA };
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.lights = flat ? [] : [{
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
      mapper: 'crosshatch',
      params: {
        fillAngle: 45, fillDensity: density, toneLaw: 'ladder', ...extraStyle,
      },
    };
    p.styleTable = { scene: clone(style), byObject: { 'obj-1': clone(style) }, byFace: {} };
    return p;
  };

  // Raw runs, the in-repo idiom (scene3d-curved-crosshatch-controls
  // .test.js:177-180 / scene3d-crosshatch-parity.test.js): wrap
  // `SurfaceFill.buildObject` and collect what it actually returns — the
  // ONLY place `.fam`/`.lineIndex`/`.back` survive.
  const rawRuns = (params) => {
    const seen = [];
    const real = SurfaceFill.buildObject;
    SurfaceFill.buildObject = (o) => {
      const r = real(o);
      if (Array.isArray(r)) r.forEach((run) => seen.push(run));
      return r;
    };
    try { algo.generate(params, null, null, BOUNDS); } finally { SurfaceFill.buildObject = real; }
    return seen;
  };

  const median = (arr) => {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  };
  const pctl = (arr, p) => {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const idx = Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))));
    return s[idx];
  };

  // Local perpendicular gap samples of `lines` against the crossing family
  // `crossLines` — plan §1.1.1, the same construction as `acrossClear`.
  const localGaps = (lines, crossLines, cap) => {
    const samples = [];
    for (let i = 0; i < lines.length - 1; i += 1) {
      const cur = lines[i]; const nxt = lines[i + 1];
      for (let k = 1; k < cur.length - 1; k += 1) {
        const p0 = cur[k]; const a = cur[k - 1]; const b = cur[k + 1];
        if (!p0 || !a || !b) continue;
        const tx = b.x - a.x; const ty = b.y - a.y;
        const tl = Math.hypot(tx, ty);
        if (!(tl > 1e-9)) continue;
        const nx = -ty / tl; const ny = tx / tl;
        let best = Infinity;
        for (let j = 1; j < nxt.length; j += 1) {
          const q0 = nxt[j - 1]; const q1 = nxt[j];
          if (!q0 || !q1) continue;
          const x0 = p0.x - nx * cap; const y0 = p0.y - ny * cap;
          const x1 = p0.x + nx * cap; const y1 = p0.y + ny * cap;
          const rx = x1 - x0; const ry = y1 - y0;
          const sx = q1.x - q0.x; const sy = q1.y - q0.y;
          const den = rx * sy - ry * sx;
          if (Math.abs(den) < 1e-12) continue;
          const u = ((q0.x - x0) * sy - (q0.y - y0) * sx) / den;
          const v = ((q0.x - x0) * ry - (q0.y - y0) * rx) / den;
          if (u < 0 || u > 1 || v < 0 || v > 1) continue;
          const d = Math.abs(u - 0.5) * 2 * cap;
          if (d < best) best = d;
        }
        if (Number.isFinite(best)) samples.push({ x: p0.x, y: p0.y, g: best });
      }
    }
    return samples;
  };

  // The full instrument — plan §1.1, cap = 6.0 (validated in the plan:
  // 2.0mm vs 6.0mm moves the per-column medians by <=0.03).
  const cellShapeStats = (primitive, density, camB, flat, cap = 6.0, extraStyle = {}) => {
    const runs = rawRuns(sceneFor(primitive, density, camB, flat, extraStyle));
    const front = runs.filter((r) => !r.back);
    const fams = Array.from(new Set(front.map((r) => r.fam))).sort();
    if (fams.length !== 2) return { error: `fams=${fams.length}` };
    const [famA, famB] = fams;
    const byLine = (fam) => {
      const m = new Map();
      front.filter((r) => r.fam === fam).forEach((r) => {
        if (r.lineIndex == null) return;
        if (!m.has(r.lineIndex)) m.set(r.lineIndex, []);
        m.get(r.lineIndex).push(...r);
      });
      return Array.from(m.entries()).sort((a, b) => a[0] - b[0]).map(([, pts]) => pts);
    };
    const linesA = byLine(famA);
    const linesB = byLine(famB);
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    front.forEach((r) => r.forEach((pt) => {
      if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
        minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
        minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
      }
    }));
    const uOf = (x) => (x - minX) / Math.max(1e-6, maxX - minX);
    const vOf = (y) => (y - minY) / Math.max(1e-6, maxY - minY);
    const sA = localGaps(linesA, linesB, cap);
    const sB = localGaps(linesB, linesA, cap);
    const medGapA = median(sA.map((s) => s.g));
    const medGapB = median(sB.map((s) => s.g));
    if (medGapA == null || medGapB == null) {
      return {
        error: 'no gap samples', nA: linesA.length, nB: linesB.length,
      };
    }
    const win = Math.max(2.5, 3 * Math.max(medGapA, medGapB));
    const wKey = (x, y) => `${Math.floor(x / win)},${Math.floor(y / win)}`;
    const winsA = new Map(); const winsB = new Map();
    sA.forEach((s) => { const k = wKey(s.x, s.y); if (!winsA.has(k)) winsA.set(k, []); winsA.get(k).push(s); });
    sB.forEach((s) => { const k = wKey(s.x, s.y); if (!winsB.has(k)) winsB.set(k, []); winsB.get(k).push(s); });
    const keys = new Set([...winsA.keys(), ...winsB.keys()]);
    const cells = [];
    keys.forEach((k) => {
      const a = winsA.get(k) || []; const b = winsB.get(k) || [];
      if (a.length < 3 || b.length < 3) return;
      const all = a.concat(b);
      const cx = all.reduce((s, pt) => s + pt.x, 0) / all.length;
      const cy = all.reduce((s, pt) => s + pt.y, 0) / all.length;
      const u = uOf(cx); const v = vOf(cy);
      const interior = u >= 0.15 && u <= 0.85 && v >= 0.15 && v <= 0.85;
      const ga = median(a.map((pt) => pt.g)); const gb = median(b.map((pt) => pt.g));
      cells.push({
        u, v, ga, gb, aspect: ga / gb, interior,
      });
    });
    const interiorCells = cells.filter((c) => c.interior);
    const cols = [[0, 0.2], [0.2, 0.4], [0.4, 0.6], [0.6, 0.8], [0.8, 1]];
    const colMedians = cols.map(([lo, hi]) => {
      const inCol = interiorCells.filter((c) => (c.u >= lo && c.u < hi) || (hi === 1 && c.u === 1));
      return { n: inCol.length, aspect: median(inCol.map((c) => c.aspect)) };
    });
    const spreadA = sA.map((s) => s.g); const spreadB = sB.map((s) => s.g);
    return {
      nA: linesA.length,
      nB: linesB.length,
      medGapA,
      medGapB,
      windows: interiorCells.length,
      colMedians,
      spreadRatioA: spreadA.length ? pctl(spreadA, 0.95) / Math.max(1e-6, pctl(spreadA, 0.05)) : null,
      spreadRatioB: spreadB.length ? pctl(spreadB, 0.95) / Math.max(1e-6, pctl(spreadB, 0.05)) : null,
    };
  };

  // ── The ceiling: RE-PINNED for W-36c (JAY'S DECISION 2026-09-10, #6 ->
  // option C — see `## Bars changed` in that unit's commit body and
  // docs/3d-audit/lane-reports/W-36c-impl.md). Each family now carries the
  // single-family hatch ruling count under a new anti-saturation cap
  // (`surface-fill.js`, `CROSS_FAMILY_BUDGET` + `crossMinPitch`), so BOTH
  // families draw more rulings than under W-36's shared-budget split — `nA`/
  // `nB`/`windows`/`cols[].n` all rise (denser families give the
  // interior-window instrument more samples: C5, measurability, improves on
  // all 11 configs). The ASPECT RANGE — what W-31 actually protects — does
  // NOT regress: narrower on 3 configs (sphere d=50 a, torus d=220 a, cone
  // d=220 a), flat on 4, wider on 2 that gained measurable columns (cylinder
  // d=50 a: 2->3 cols; ellipsoid d=50 a: 3->5 cols), and cone d=50 a's old
  // 0.191 minimum (one column had n=1, a one-sample artefact) is gone now
  // that every column has n>=3 — NOT a regression against that artefact.
  // ⚠ C2 (within-family local-gap p95/p05 spread, the ceiling test below)
  // WORSENS on 9 of 11 configs — this is the W-31b defect (`probe()`'s
  // per-ruling MEAN `mmPerFrac` spent as one scalar step) made more visible
  // by denser families and a larger order-statistic population; it is a
  // ceiling going UP, disclosed under `## Bars changed`, and is NOT fixed
  // here (W-31 already measured its own Rank 1/Rank 2 dead; this belongs to
  // W-31b). Re-derived on THIS unit's own base (`a3b651f0`) per
  // AGENT-PROTOCOL.md — not the plan's `426cc5e4` numbers, though they match
  // to the digit (T4 landed disjoint code). A `null` column means fewer than
  // 3 samples of one family fell in that fifth of the interior box (thin at
  // d=50, expected). ─────────────────────────────────────────────────────
  const CEILING = [
    {
      prim: 'sphere', d: 220, cam: 'a', nA: 53, nB: 54, windows: 110, spreadA: 15.18, spreadB: 15.58,
      cols: [{ n: 9, aspect: 0.8259 }, { n: 28, aspect: 0.9515 }, { n: 33, aspect: 1.0083 }, { n: 31, aspect: 1.0707 }, { n: 9, aspect: 1.2390 }],
    },
    {
      prim: 'sphere', d: 50, cam: 'a', nA: 21, nB: 21, windows: 28, spreadA: 14.27, spreadB: 14.31,
      cols: [{ n: 0, aspect: null }, { n: 11, aspect: 0.9511 }, { n: 6, aspect: 1.0048 }, { n: 11, aspect: 1.0317 }, { n: 0, aspect: null }],
    },
    {
      prim: 'sphere', d: 220, cam: 'b', nA: 54, nB: 53, windows: 106, spreadA: 15.00, spreadB: 14.97,
      cols: [{ n: 10, aspect: 1.0015 }, { n: 28, aspect: 0.9748 }, { n: 30, aspect: 1.0002 }, { n: 27, aspect: 1.0275 }, { n: 11, aspect: 1.0063 }],
    },
    {
      prim: 'cylinder', d: 220, cam: 'a', nA: 64, nB: 66, windows: 90, spreadA: 9.81, spreadB: 9.57,
      cols: [{ n: 5, aspect: 0.7408 }, { n: 34, aspect: 0.8644 }, { n: 18, aspect: 1.0001 }, { n: 29, aspect: 1.1636 }, { n: 4, aspect: 1.3770 }],
    },
    {
      prim: 'cylinder', d: 50, cam: 'a', nA: 24, nB: 25, windows: 29, spreadA: 9.76, spreadB: 8.94,
      cols: [{ n: 0, aspect: null }, { n: 8, aspect: 0.8673 }, { n: 14, aspect: 1.0023 }, { n: 7, aspect: 1.1894 }, { n: 0, aspect: null }],
    },
    {
      prim: 'torus', d: 220, cam: 'a', nA: 41, nB: 42, windows: 100, spreadA: 6.50, spreadB: 7.49,
      cols: [{ n: 6, aspect: 1.0396 }, { n: 32, aspect: 1.0643 }, { n: 27, aspect: 0.9263 }, { n: 29, aspect: 0.9676 }, { n: 6, aspect: 1.0997 }],
    },
    {
      prim: 'torus', d: 50, cam: 'a', nA: 16, nB: 16, windows: 20, spreadA: 4.47, spreadB: 4.72,
      cols: [{ n: 2, aspect: 1.2841 }, { n: 7, aspect: 0.9766 }, { n: 5, aspect: 0.7237 }, { n: 6, aspect: 0.9775 }, { n: 0, aspect: null }],
    },
    {
      prim: 'ellipsoid', d: 220, cam: 'a', nA: 52, nB: 54, windows: 86, spreadA: 14.70, spreadB: 14.71,
      cols: [{ n: 7, aspect: 0.9923 }, { n: 24, aspect: 1.0244 }, { n: 22, aspect: 0.9906 }, { n: 26, aspect: 0.9585 }, { n: 7, aspect: 1.0437 }],
    },
    {
      prim: 'ellipsoid', d: 50, cam: 'a', nA: 20, nB: 21, windows: 32, spreadA: 12.65, spreadB: 12.74,
      cols: [{ n: 4, aspect: 1.0011 }, { n: 5, aspect: 1.0279 }, { n: 10, aspect: 1.0009 }, { n: 9, aspect: 0.9554 }, { n: 4, aspect: 0.9896 }],
    },
    {
      prim: 'cone', d: 220, cam: 'a', nA: 49, nB: 51, windows: 101, spreadA: 16.80, spreadB: 18.84,
      cols: [{ n: 6, aspect: 0.6438 }, { n: 31, aspect: 0.6917 }, { n: 28, aspect: 1.0151 }, { n: 30, aspect: 1.4652 }, { n: 6, aspect: 1.6427 }],
    },
    {
      prim: 'cone', d: 50, cam: 'a', nA: 19, nB: 20, windows: 28, spreadA: 10.73, spreadB: 16.88,
      cols: [{ n: 0, aspect: null }, { n: 10, aspect: 0.7682 }, { n: 8, aspect: 1.0456 }, { n: 7, aspect: 1.6212 }, { n: 3, aspect: 1.5620 }],
    },
  ];

  describe('C1/C5 — flat-tone column-median cell aspect + measurability floor do not regress', () => {
    CEILING.forEach((rec) => {
      test(`${rec.prim} d=${rec.d} cam=${rec.cam}`, () => {
        const stats = cellShapeStats(rec.prim, rec.d, rec.cam === 'b', true);
        expect(stats.nA).toBe(rec.nA);
        expect(stats.nB).toBe(rec.nB);
        // C5 — measurability floor: must not starve below today's window
        // count (0930cb2d starved this to 0-7 measurable windows; W-36
        // brought it to today's counts — a future regression must not undo
        // that).
        expect(stats.windows).toBeGreaterThanOrEqual(rec.windows);
        rec.cols.forEach((col, i) => {
          expect(stats.colMedians[i].n).toBe(col.n);
          if (col.aspect == null) {
            expect(stats.colMedians[i].aspect).toBeNull();
          } else {
            // CI-5, 2026-09-19: `torus d=220 cam=a` column 2 (n=27, a MEDIAN
            // of an odd-length sample — a single sorted element, not an
            // average) is measurably PLATFORM-SPLIT, not a stale pin. Same
            // commit (a6879837), same test, same assertion:
            //   macOS arm64 (this worktree, `node -v` v20.20.2): 0.9262980105396276
            //   ubuntu-latest x64 (GH Actions node-version: 20): 0.937078841874498
            //     — reproduced bit-for-bit identical across TWO separate real
            //     CI runs (35451981431 R4-fix's own run, 35454205820 main's
            //     later run; ci.log both report
            //     "expected 0.937078841874498 to be close to 0.9263" verbatim)
            // The other 4 columns in this same record (n=6/32/29/6) do NOT
            // diverge between platforms — only this one, at the boundary
            // sample count where a sub-ULP difference in the upstream
            // trig-derived local-gap measurements (Math.atan2/sin/cos, whose
            // last-bit results are not guaranteed identical across CPU
            // architectures) can flip which of two near-tied samples the
            // sorted median lands on, swinging the OUTPUT by ~1.2% even
            // though every INPUT differs by ~1e-13. Anchored to BOTH
            // independently-measured platform values (tight ±0.0005 each,
            // not a blanket widen) rather than one — a real regression that
            // moved the true median would still fail against both.
            // `## Bars changed` in the commit body.
            const PLATFORM_PINS = (rec.prim === 'torus' && rec.d === 220 && rec.cam === 'a' && i === 2)
              ? [0.9262980105396276, 0.937078841874498]
              : [col.aspect];
            const nearest = PLATFORM_PINS.reduce((a, b) => (
              Math.abs(stats.colMedians[i].aspect - a) <= Math.abs(stats.colMedians[i].aspect - b) ? a : b
            ));
            expect(stats.colMedians[i].aspect).toBeCloseTo(nearest, PLATFORM_PINS.length > 1 ? 3 : 2);
          }
        });
      });
    });
  });

  describe('C2 — within-family local-gap spread (p95/p05) does not regress', () => {
    CEILING.forEach((rec) => {
      test(`${rec.prim} d=${rec.d} cam=${rec.cam}`, () => {
        const stats = cellShapeStats(rec.prim, rec.d, rec.cam === 'b', true);
        // A true ceiling, not a fingerprint: allow float noise (+0.05) but
        // catch a regression toward MORE spread than today.
        expect(stats.spreadRatioA).toBeLessThanOrEqual(rec.spreadA + 0.05);
        expect(stats.spreadRatioB).toBeLessThanOrEqual(rec.spreadB + 0.05);
      });
    });
  });

  // ── Oracle-validity proof (plan §3.4 mutation 3): the band re-centres on
  // the dial's documented sense, not on a blanket "aspect must be 1"
  // assumption — crossDensityRatio=2 asks family B for HALF family A's
  // pitch density-share (i.e. a WIDER gap), so gapA/gapB should land near
  // 1/ratio = 0.5, not near 1. Measured on this unit's own base: column
  // medians 0.356, 0.437, 0.500, 0.566 (5th column has no interior samples
  // at this ratio). ─────────────────────────────────────────────────────
  test('oracle validity — crossDensityRatio=2 re-centres the band near 0.5, not 1.0 (cylinder d=220 cam a, flat)', () => {
    const stats = cellShapeStats('cylinder', 220, false, true, 6.0, { crossDensityRatio: 2 });
    const measured = stats.colMedians.filter((c) => c.aspect != null).map((c) => c.aspect);
    expect(measured.length).toBeGreaterThanOrEqual(3);
    measured.forEach((a) => {
      expect(a).toBeGreaterThan(0.25);
      expect(a).toBeLessThan(0.70);
    });
  });
});
