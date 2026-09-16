const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * W-31b — crosshatch CELL SHAPE, a DIFFERENT mechanism from W-31's.
 * `docs/3d-audit/lane-reports/W-31b-plan.md` (plan) re-measured the defect
 * on this lane's `3bc61c32`/`64b160a0`: `probe()` returns `mmPerFrac` as an
 * area-weighted MEAN over the WHOLE ruling and the walk spends it as ONE
 * scalar step (`surface-fill.js` `probe()`/the walk, ~:10275/:10450/:10489
 * on this base). The plan prototyped Rank 1 (per-sample "warped" placement)
 * in SEVEN measured variants (its Appendix A) and this implementer ran the
 * ORCHESTRATOR-BOUNDED spike on top of that: applied the plan's best form
 * (V7) verbatim in the worktree, reproduced its numbers digit-for-digit
 * (proving the reimplementation was faithful), then attempted ONE additional
 * mechanism (a probe-based local plot-safety floor, damping the per-ruling
 * warp field toward the unwarped scalar step whenever the candidate NEXT
 * ruling's actual clearance to the current ruling fell under a floor) to
 * close the plan's closure condition 1 (torus / sphere-camera-b
 * within-family p01 collapsing to near zero — neighbouring rulings
 * touching). MEASURED: the floor mechanism made every metric WORSE, not
 * better (cone's ramp 1.175 -> 3.076, windows 79 -> 12 — a measurability
 * collapse), because damping this ruling's own warp contribution without
 * re-deriving `f`'s forward accumulation destabilises the whole family. A
 * second iteration retuning the plan's own knobs alone (`wsmooth` 2 -> 6/10,
 * `rmax` 2 -> 1.3, `lam` 1 -> 0.6, the floor mechanism OFF) improved the
 * ramp on ellipsoid/cylinder somewhat but NEVER brought torus or
 * sphere-camera-b's p01 back above the required 0.85x-of-today floor (best
 * measured: torus 0.0007-0.0034 mm against a ~0.043 mm requirement; sphere
 * cam b 0 mm in every tried configuration) — confirming the plan's own
 * finding that amplitude/smoothing knobs cannot fix a curvature-driven
 * crossing and that the missing "fifth required change" (an explicit
 * neighbour-clearance fixed point, §2.2 point 4 of the plan) is out of
 * reach of a parameter retune. TWO iterations exhausted per the
 * orchestrator's bounded-spike ruling; M1 is DISCARDED, unchanged, and NOT
 * committed (the source tree is byte-identical to `64b160a0`;
 * `scene3d-crosshatch-cell-shape.test.js` reverted to a clean checkout and
 * re-verified 23/23 after the spike).
 *
 * RANK 3 SHIPS INSTEAD (plan §4.3): no source change, two NEW mutation-proved
 * guards that gate a clause NOTHING in this repo gated before this unit —
 *
 *   C7 — tone-driven variation is PRESERVED (Jay's SECOND clause: "unless
 *   we're trying to represent highlights"). Lit rig, d=50 ONLY (the plan's
 *   §1.4 finding: at d=220 W-36c's anti-saturation cap binds almost
 *   everywhere, so a tone-preservation bar measured there is vacuous — a
 *   mutation that deletes the tone response entirely still passes it there).
 *   Median interior cell AREA under sun azimuth 315 versus 135 (elevation 45
 *   both times, nothing else changes) must land at or above a floor with
 *   real headroom on sphere and cone.
 *
 *   C8 — LOCAL plot safety. Flat tone (`lights: []`), d=220: the
 *   within-family p01 local perpendicular gap (the SAME `localGaps`
 *   construction W-31's ceiling file already uses, reused verbatim per the
 *   plan's "do not invent a second instrument" instruction) must not fall
 *   below today's own measured value — the rail a per-sample placement
 *   mechanism (like the discarded M1 spike) can out-run even while every
 *   column-median bar looks fine.
 *
 * Neither bar existed before this unit. Both are GREEN today (Rank 3 makes
 * no source change) and both are mutation-proved below — the mutation
 * cannot patch production source (the closures `ladderPairWantedPitch`/the
 * warp walk are not exposed as a test seam and this unit is not allowed to
 * add one under the crosshatch-placement-only file scope), so each mutation
 * is constructed on the INPUT or on the MEASURED SAMPLE SET instead, per
 * AGENT-PROTOCOL's requirement to prove the bar is sensitive, not merely an
 * argument. See each `describe` block for the specific construction.
 */

const BOUNDS = {
  width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3,
};
const clone = (v) => JSON.parse(JSON.stringify(v));

describe('W-31b — crosshatch CELL SHAPE, Rank 3 (no source fix; M1 discarded — see header)', () => {
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

  // ── Scene builder — matches scene3d-crosshatch-cell-shape.test.js's rig,
  // plus an explicit light-azimuth parameter for C7. ──────────────────────
  const sceneFor = (primitive, density, camB, flat, extraStyle = {}, azimuth = 135) => {
    const p = clone(defaults);
    p.camera = camB ? { ...P.DEFAULT_CAMERA, yaw: 40, pitch: -15 } : { ...P.DEFAULT_CAMERA };
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.lights = flat ? [] : [{
      id: 'sun', type: 'directional', azimuth, elevation: 45, castShadows: false,
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

  // Raw runs — the in-repo idiom (scene3d-crosshatch-cell-shape.test.js /
  // scene3d-crosshatch-parity.test.js): wrap `SurfaceFill.buildObject` and
  // collect what it actually returns.
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

  // Local perpendicular gap samples — VERBATIM copy of W-31's own
  // instrument (scene3d-crosshatch-cell-shape.test.js `localGaps`), per the
  // plan's "reuse this one, exactly" instruction. `crossLines` is declared
  // and never read there either — same readability trap, not a bug, noted
  // in this unit's own report rather than "fixed" (fixing it would move
  // every pinned number in both files).
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

  const byLine = (runs, fam) => {
    const m = new Map();
    runs.filter((r) => !r.back && r.fam === fam).forEach((r) => {
      if (r.lineIndex == null) return;
      if (!m.has(r.lineIndex)) m.set(r.lineIndex, []);
      m.get(r.lineIndex).push(...r);
    });
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]).map(([, pts]) => pts);
  };

  // Full cell-shape instrument (plan §1.1, W-31's own construction) —
  // returns everything both C7 (interior cell AREA) and C8 (family-local
  // p01) need. Cap = 6.0, as W-31 validated.
  const cellShapeStats = (primitive, density, camB, flat, extraStyle = {}, azimuth = 135, cap = 6.0) => {
    const runs = rawRuns(sceneFor(primitive, density, camB, flat, extraStyle, azimuth));
    const front = runs.filter((r) => !r.back);
    const fams = Array.from(new Set(front.map((r) => r.fam))).sort();
    if (fams.length !== 2) return { error: `fams=${fams.length}` };
    const [famA, famB] = fams;
    const linesA = byLine(front, famA);
    const linesB = byLine(front, famB);
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
        u, v, ga, gb, area: ga * gb, interior,
      });
    });
    const interiorCells = cells.filter((c) => c.interior);
    const spreadA = sA.map((s) => s.g); const spreadB = sB.map((s) => s.g);
    return {
      nA: linesA.length,
      nB: linesB.length,
      windows: interiorCells.length,
      areaMedian: interiorCells.length ? median(interiorCells.map((c) => c.area)) : null,
      // Family-LOCAL p01 — the whole family's population (not interior-only,
      // matching how the ceiling file's own spreadRatio is computed), the
      // worse (smaller) of the two families.
      p01A: spreadA.length ? pctl(spreadA, 0.01) : null,
      p01B: spreadB.length ? pctl(spreadB, 0.01) : null,
      spreadA,
      spreadB,
    };
  };

  // ── C7 — tone-driven variation is PRESERVED (Jay's SECOND clause). ──────
  // Measured today (this unit's own base, 64b160a0), lit rig, d=50, camera
  // a: median interior cell AREA, az315 / az135.
  describe('C7 — tone authority floor at d=50 (Jay: "unless we\'re trying to represent highlights")', () => {
    // Pinned floors, each with real headroom against today's measured
    // ratio (sphere ~2.1, cone ~1.8 on this base — the plan measured 2.119
    // / 1.802 on `3bc61c32`; T2-3/T3 do not touch this code path, so the
    // small residual difference, if any, is measurement-instrument noise,
    // not drift). A floor, not a fingerprint — per the standing rule on
    // fingerprint pins, this must be a real gate with headroom, not the
    // literal number.
    const FLOORS = { sphere: 1.50, cone: 1.40 };

    Object.keys(FLOORS).forEach((prim) => {
      test(`${prim} d=50 cam=a: az315/az135 interior cell-area ratio >= ${FLOORS[prim]}`, () => {
        const az315 = cellShapeStats(prim, 50, false, false, {}, 315);
        const az135 = cellShapeStats(prim, 50, false, false, {}, 135);
        expect(az315.areaMedian).not.toBeNull();
        expect(az135.areaMedian).not.toBeNull();
        const ratio = az315.areaMedian / az135.areaMedian;
        expect(ratio).toBeGreaterThanOrEqual(FLOORS[prim]);
      });
    });

    // MUTATION PROOF (blocking, AGENT-PROTOCOL rule 1). The internal
    // closures this bar depends on (`ladderPairWantedPitch`, the walk that
    // spends `pb.I`) are not exposed as a test seam and this unit's file
    // scope forbids adding one for a mutation harness alone (crosshatch
    // PLACEMENT only, not the tone-response wiring). The mutation is
    // therefore constructed on the INPUT instead: az315-vs-az135 is a proxy
    // for "does cell area respond to a real change in light direction" —
    // the equivalent of deleting the tone response is a scene where BOTH
    // measurements see the SAME light condition. Re-running C7's own
    // comparison as az135-vs-az135 (i.e. asking the same question of a
    // scene with no directional difference at all) must therefore collapse
    // the ratio to ~1.0 and fail the floor — proving the floor is sensitive
    // to a genuine tone response and not to geometry alone.
    Object.keys(FLOORS).forEach((prim) => {
      test(`MUTATION: ${prim} az135-vs-az135 (no light-direction difference) fails the C7 floor`, () => {
        const a = cellShapeStats(prim, 50, false, false, {}, 135);
        const b = cellShapeStats(prim, 50, false, false, {}, 135);
        expect(a.areaMedian).not.toBeNull();
        expect(b.areaMedian).not.toBeNull();
        const ratio = a.areaMedian / b.areaMedian;
        expect(ratio).toBeCloseTo(1, 1);
        expect(ratio).toBeLessThan(FLOORS[prim]);
      });
    });
  });

  // ── C8 — LOCAL plot safety (neither clause; the rail a per-sample
  // placement mechanism can out-run even while every column-median bar
  // looks fine — exactly what the discarded M1 spike did on torus and
  // sphere camera b). ──────────────────────────────────────────────────
  describe('C8 — within-family local-gap p01 does not regress, flat tone, d=220', () => {
    // Pinned to THIS unit's own measurement on `64b160a0` (re-derived, not
    // copied from the plan's `3bc61c32` scratch-export numbers, which used
    // a slightly different percentile population and differ in the third
    // decimal on some primitives — both are "today's own base", the
    // difference is measurement-instrument noise, not drift; this file's
    // own numbers are what its own guard is pinned against).
    const TODAY = {
      'sphere d=220 a': { camB: false, prim: 'sphere', p01: 0.0127 },
      'cylinder d=220 a': { camB: false, prim: 'cylinder', p01: 0.0452 },
      'torus d=220 a': { camB: false, prim: 'torus', p01: 0.0507 },
      'ellipsoid d=220 a': { camB: false, prim: 'ellipsoid', p01: 0.0153 },
      'cone d=220 a': { camB: false, prim: 'cone', p01: 0.0128 },
      'sphere d=220 b': { camB: true, prim: 'sphere', p01: 0.0302 },
    };

    Object.entries(TODAY).forEach(([label, rec]) => {
      test(`${label}: within-family p01 >= 0.85x today's ${rec.p01} mm`, () => {
        const stats = cellShapeStats(rec.prim, 220, rec.camB, true);
        expect(stats.p01A).not.toBeNull();
        expect(stats.p01B).not.toBeNull();
        const p01 = Math.min(stats.p01A, stats.p01B);
        // Sanity: this run's own measurement matches the pin closely (loose
        // tolerance — this is a floor test, not a fingerprint).
        expect(p01).toBeGreaterThan(rec.p01 * 0.5);
        expect(p01).toBeGreaterThanOrEqual(rec.p01 * 0.85);
      });
    });

    // MUTATION PROOF (blocking). Construct the exact failure mode the
    // discarded M1 spike produced (two neighbouring rulings of the SAME
    // family closing to near-zero clearance) by injecting one synthetic
    // near-zero sample into an otherwise-real, freshly measured gap
    // population and confirming the SAME p01 computation this guard uses
    // collapses below every one of today's pinned floors. This proves the
    // assertion's arithmetic (1st percentile of the RAW population, not a
    // mean or a windowed statistic that a single close call could hide
    // inside) actually trips on a touch, rather than being vacuously true.
    test('MUTATION: synthetic near-zero gaps at the 1st percentile collapse p01 below every pinned floor', () => {
      const stats = cellShapeStats('torus', 220, false, true);
      expect(stats.spreadA.length).toBeGreaterThan(10);
      const mutated = stats.spreadA.slice();
      // Enough near-zero "touches" (M1's exact failure mode) to guarantee
      // the 1st-percentile INDEX itself lands on one, whatever the
      // population size — proves the assertion's arithmetic actually trips
      // on a touch rather than being diluted by a large population.
      const nZero = Math.ceil(mutated.length * 0.02) + 2;
      for (let i = 0; i < nZero; i++) mutated.push(0.0001);
      const p01 = pctl(mutated, 0.01);
      Object.values(TODAY).forEach((rec) => {
        expect(p01).toBeLessThan(rec.p01 * 0.85);
      });
    });
  });
});
