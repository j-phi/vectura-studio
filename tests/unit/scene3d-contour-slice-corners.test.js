/**
 * W-34 — "There are some angles in this curved shape that should not be
 * there" (USER, `docs/3d-audit/fill-audit/user-reports/15-w27c-contourslice.png`).
 *
 * New file, deliberately NOT an edit of the 51/57-test guard file
 * (`scene3d-contour-slice.test.js`) — keeps this unit's blast radius auditable.
 * See `docs/3d-audit/lane-reports/W-34-plan.md` for the full measurement that
 * produced every bar and exemption below; this file is that plan's §3 RED
 * oracle, shipped.
 *
 * Two metrics, BOTH open-polyline-aware (a run is open unless first ≈ last
 * within 1e-6; an open run's two endpoints have no turn and are NEVER
 * wrapped — wrapping an open run is exactly the error that produced the
 * withdrawn 39.8° figure, W-27c-review-2.md §"Item (b)"):
 *
 *   M1 — per-vertex exterior turn (`maxVertexTurnOpenAware`), the same
 *        instrument `sliceRingMaxTurn` already uses. Bar: <= 8 deg (the
 *        ledger's bar).
 *   M2 — turn over a fixed 1mm arc (`turnOverArc`), sampling-independent
 *        (unlike M1, which a densely-refined polyline can dodge one vertex
 *        at a time). Used to tell a REAL corner from a merely-dense one.
 *
 * The rig below reproduces the audit-gallery capture exactly
 * (`scripts/audit/scene3d-capture.js:196-263`): identity transform, ortho
 * camera, `contourSlice` @ `sliceCount` 26 (absent from the style params, so
 * it takes its default), `ladder` toneLaw. `fillDensity` never reaches the
 * slice pass, so it is irrelevant here.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3 };
const SCENE3D_SRC = path.join(__dirname, '..', '..', 'src', 'core', 'algorithms', 'scene3d.js');

// ── M1/M2 metric helpers (device-space, open-polyline-aware) ───────────────

const turnDeg = (a, b, c) => {
  const v1x = b.x - a.x; const v1y = b.y - a.y;
  const v2x = c.x - b.x; const v2y = c.y - b.y;
  const l1 = Math.hypot(v1x, v1y); const l2 = Math.hypot(v2x, v2y);
  if (l1 < 1e-9 || l2 < 1e-9) return 0;
  let cosA = (v1x * v2x + v1y * v2y) / (l1 * l2);
  if (cosA > 1) cosA = 1; else if (cosA < -1) cosA = -1;
  return (Math.acos(cosA) * 180) / Math.PI;
};

// A run is closed IFF its first and last point coincide within 1e-6 (same
// convention `refineSliceRing` itself uses to decide whether to append the
// closing duplicate point).
const isClosedRun = (pts) => pts.length >= 4
  && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6;

// M1 — per-vertex exterior turn, open-polyline-aware. Closed: every vertex
// (after dropping the repeated last point). Open: every vertex EXCEPT the
// two endpoints — an endpoint has no incoming or no outgoing edge to turn
// against, and must NEVER be wrapped onto the opposite end of an open run.
const maxVertexTurnOpenAware = (ptsIn) => {
  const closed = isClosedRun(ptsIn);
  const pts = closed ? ptsIn.slice(0, -1) : ptsIn;
  const n = pts.length;
  if (n < 3) return 0;
  let max = 0;
  const lo = closed ? 0 : 1;
  const hi = closed ? n - 1 : n - 2;
  for (let i = lo; i <= hi; i++) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const t = turnDeg(a, b, c);
    if (t > max) max = t;
  }
  return max;
};

// Resample a run by arc length at spacing `h`, open-polyline-aware (an open
// run's two physical endpoints are preserved exactly; a closed run wraps).
const resampleByArc = (ptsIn, h = 0.05) => {
  const closed = isClosedRun(ptsIn);
  const pts = closed ? ptsIn.slice(0, -1) : ptsIn;
  const n = pts.length;
  if (n < 2) return pts.slice();
  const segCount = closed ? n : n - 1;
  const segLens = [];
  let total = 0;
  for (let i = 0; i < segCount; i++) {
    const a = pts[i]; const b = pts[(i + 1) % n];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    segLens.push(d);
    total += d;
  }
  if (total < 1e-9) return pts.slice();
  const count = Math.max(2, Math.round(total / h) + (closed ? 0 : 1));
  const out = [];
  let segIdx = 0; let segStart = 0; let segAcc = segLens[0];
  const denom = closed ? count : count - 1;
  for (let k = 0; k < count; k++) {
    const target = Math.min(total, (k / denom) * total);
    while (segIdx < segCount - 1 && target > segAcc + 1e-9) {
      segIdx += 1;
      segStart += segLens[segIdx - 1];
      segAcc += segLens[segIdx];
    }
    const a = pts[segIdx]; const b = pts[(segIdx + 1) % n];
    const segLen = segLens[segIdx] || 1e-9;
    const t = Math.max(0, Math.min(1, (target - segStart) / segLen));
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  if (closed) out.push({ ...out[0] });
  return out;
};

// M2 — turn over a fixed W-mm arc, open-polyline-aware. k = round((W/2)/h);
// angle(P[i]-P[i-k], P[i+k]-P[i]). Open runs never sample inside k of either
// end (no wrap); closed runs wrap the ring.
const turnOverArc = (ptsIn, W = 1.0, h = 0.05) => {
  const resampled = resampleByArc(ptsIn, h);
  const closed = isClosedRun(resampled);
  const pts = closed ? resampled.slice(0, -1) : resampled;
  const m = pts.length;
  const k = Math.max(1, Math.round((W / 2) / h));
  if (closed ? m < 3 : m < 2 * k + 2) return 0;
  let max = 0;
  const lo = closed ? 0 : k;
  const hi = closed ? m - 1 : m - 1 - k;
  for (let i = lo; i <= hi; i++) {
    const prev = pts[((i - k) % m + m) % m];
    const cur = pts[i];
    const next = pts[(i + k) % m];
    const t = turnDeg(prev, cur, next);
    if (t > max) max = t;
  }
  return max;
};

// ── Analytic ground truth builders (world/local space; identity transform,
// so local === world for this rig's objects) ───────────────────────────────

// Cone: r(y) = sx*(0.5 - y/(2*sy)); cross-section at z=z0 is x=+-sqrt(r(y)^2-z0^2).
// Mirrors sliceSurfaceFG's 'cone' branch exactly (scene3d.js sliceSurfaceFG).
const coneCrossSectionWorld = (sizes, z0, n = 20001) => {
  const { sx, sy } = sizes;
  const rAt = (y) => Math.max(0, sx * (0.5 - y / (2 * sy)));
  // r(y) is monotone decreasing in y over the cone's y-range [-sy, sy]; solve
  // r(yLimit) = |z0| for the y-extent where the plane still intersects.
  const az0 = Math.abs(z0);
  // r(-sy) = sx; r(sy) = 0 (apex). Binary-search the y where r(y) = az0.
  let lo = -sy; let hi = sy;
  if (rAt(lo) < az0) return null; // plane misses the cone entirely
  for (let iter = 0; iter < 80; iter += 1) {
    const mid = (lo + hi) / 2;
    if (rAt(mid) >= az0) lo = mid; else hi = mid;
  }
  const yLimit = lo; // r(yLimit) ~= az0, the vertex-side extreme the plane reaches
  const yBase = -sy; // base-side extreme, always included
  // Parameter cubed toward the vertex-side end (yLimit) so the fine curvature
  // there is well resolved, matching the plan's §1.4 method.
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n; // 0..1, 0 at base, 1 at vertex-side limit
    const tt = t * t * t;
    const y = yBase + (yLimit - yBase) * tt;
    const r2 = rAt(y) ** 2 - z0 * z0;
    const x = Math.sqrt(Math.max(0, r2));
    pts.push({ x, y, z: z0 });
  }
  // base(+x) -> vertex(+x branch reaches x~0) -> mirror back down as -x branch.
  const mirrored = pts.slice(0, -1).reverse().map((p) => ({ x: -p.x, y: p.y, z: p.z }));
  // NO closing-point append here (W-34b correction): unlike the capsule
  // below, the cone has a flat base DISK, so this base(+x) -> vertex ->
  // base(-x) curve is a genuinely OPEN arc — the two base-rim endpoints are
  // real, distinct points (at +x and -x on the base circle) connected only
  // by the (undrawn) base rim, not by the lateral surface this cross-section
  // traces. Appending `{...pts[0]}` as a synthetic closing point invented a
  // phantom wrap-around window straddling the ~36mm base chord, which
  // `turnOverArc`/`isClosedRun` then read as "closed" and used to compute a
  // spurious 141.56 deg/mm "corner" at the seam — nearly 2x the true
  // ~76.18 deg/mm near-apex corner. See W-34-review.md §3 and
  // docs/3d-audit/lane-reports/W-34b-impl.md.
  return pts.concat(mirrored);
};

// Capsule: axis y, radius r = min(sx,sz) (the default rig has sx===sz, so the
// mesh's circular cross-section assumption — `charts.js topoCapsule` — is
// exact here); half = max(r,sy); cylHalf = half-r. rad(y) = r for |y|<=cylHalf,
// else sqrt(max(0, r^2-(|y|-cylHalf)^2)). Cross-section at z=z0:
// x = +-sqrt(rad(y)^2 - z0^2).
const capsuleCrossSectionWorld = (sizes, z0, n = 4001) => {
  const r = Math.max(1, Math.min(sizes.sx, sizes.sz));
  const half = Math.max(r, sizes.sy);
  const cylHalf = Math.max(0, half - r);
  const az0 = Math.abs(z0);
  if (az0 > r) return null; // plane misses the capsule entirely (never happens for |z0|<=r-eps here)
  const Rp = Math.sqrt(Math.max(0, r * r - z0 * z0));
  const yMax = cylHalf + Rp; // where rad(y) = |z0|, by construction of the dome arc
  const radAt = (y) => {
    const ay = Math.abs(y);
    if (ay <= cylHalf) return r;
    const dy = ay - cylHalf;
    return Math.sqrt(Math.max(0, r * r - dy * dy));
  };
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const t = i / n; // 0 at y=-yMax .. 1 at y=+yMax
    const y = -yMax + 2 * yMax * t;
    const w2 = radAt(y) ** 2 - z0 * z0;
    const x = Math.sqrt(Math.max(0, w2));
    pts.push({ x, y, z: z0 });
  }
  const mirrored = pts.slice(0, -1).reverse().map((p) => ({ x: -p.x, y: p.y, z: p.z }));
  return pts.concat(mirrored).concat([{ ...pts[0] }]);
};

describe('W-34 — contourSlice ring corners (open-polyline-aware, device space)', () => {
  let runtime;
  let V;
  let algo;
  let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry && V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS && V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const PRIMITIVES = ['sphere', 'ellipsoid', 'cone', 'cylinder', 'torus', 'capsule'];
  const CAMERAS = {
    a: {},
    b: { yaw: 40, pitch: -15 },
  };

  const sceneForPrimitive = (primitive, cameraOverrides, sliceCount = 26) => {
    const p = clone(defaults);
    p.seed = 1;
    const Prm = V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS[primitive];
    p.objects = [{
      id: 'obj-1', name: 'obj-1', primitive, params: { ...Prm },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { ...V.Scene3D.Params.DEFAULT_CAMERA, ...cameraOverrides };
    p.styleTable = {
      scene: {
        penId: null,
        mapper: 'contourSlice',
        params: { sliceCount, fillAngle: 45, fillDensity: 50, toneLaw: 'ladder' },
      },
      byObject: {}, byFace: {},
    };
    return p;
  };
  const frontFillsOf = (out) => out.filter((q) => q.meta && q.meta.kind === 'sceneFill' && q.length >= 2);
  const genFor = (primitive, cameraOverrides, sliceCount) => frontFillsOf(
    algo.generate(sceneForPrimitive(primitive, cameraOverrides, sliceCount), null, null, BOUNDS) || [],
  );

  // The EXACT world-z of every FRONT slice plane this rig actually cuts —
  // read straight from the real mesh via Scene.assembleScene +
  // Slices.buildSliceSegments (the same two calls the engine's own
  // contourSlice pass makes), not re-derived. sliceRotate/sliceTilt are 0
  // here, so the plane normal is exactly world +z and each segment's own
  // `.a.z` IS the plane's z0.
  const realPlaneZ0s = (primitive, cameraOverrides, sliceCount = 26) => {
    const p = sceneForPrimitive(primitive, cameraOverrides, sliceCount);
    const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
    const obj = scene.objects[0];
    const sliced = V.Scene3D.Slices.buildSliceSegments({
      world: obj.world,
      faces: obj.faceIndexArrays,
      front: obj.faces.map((f) => !!(f && f.front)),
      sliceCount,
    });
    const z0ByPlane = new Map();
    sliced.segments.forEach((s) => { if (s.front && !z0ByPlane.has(s.plane)) z0ByPlane.set(s.plane, s.a.z); });
    return Array.from(z0ByPlane.values()).sort((a, b) => a - b);
  };

  // ── T1 — M1, roster-wide, device space. RED at be5cfcf8: cone 8.0882°,
  //        capsule 9.0750° (camera a). Everything else passes both cameras.
  describe('T1 — M1 (per-vertex turn, open-aware) <= 8 deg on every emitted ring, both cameras', () => {
    PRIMITIVES.forEach((primitive) => {
      Object.keys(CAMERAS).forEach((camId) => {
        test(`${primitive} @ camera ${camId}`, () => {
          const paths = genFor(primitive, CAMERAS[camId]);
          expect(paths.length).toBeGreaterThan(0);
          let worst = 0; let worstIdx = -1;
          paths.forEach((p, idx) => {
            const m = maxVertexTurnOpenAware(p);
            if (m > worst) { worst = m; worstIdx = idx; }
          });
          // eslint-disable-next-line no-console
          console.log(`W-34 T1 M1 ${primitive}/${camId}: worst=${worst.toFixed(4)} deg (path ${worstIdx})`);
          expect(worst).toBeLessThanOrEqual(8);
        });
      });
    });
  });

  // ── T2 — M2, roster-wide, scoped honestly. cylinder/sphere/ellipsoid must
  //        stay <= 20 deg/mm outright. cone and torus are EXCLUDED BY RULE,
  //        not by tolerance: cone's exemption is proven per-run against its
  //        own analytic cross-section's worst M2 (computed from the same
  //        surface equation sliceSurfaceFG uses); torus's saddle-cusp
  //        exemption is inherited from W-27c-0a item 0(a), already measured
  //        and owned there (real lemniscate crossing, not this lane's oracle
  //        to re-derive). capsule is NOT exempted here — that is what T3
  //        settles.
  describe('T2 — M2 (turn per 1mm arc) <= 20 deg/mm, honestly scoped', () => {
    ['sphere', 'ellipsoid', 'cylinder'].forEach((primitive) => {
      test(`${primitive} @ camera a (no exemption — smooth quadric)`, () => {
        const paths = genFor(primitive, CAMERAS.a);
        let worst = 0;
        paths.forEach((p) => { const m = turnOverArc(p, 1.0); if (m > worst) worst = m; });
        console.log(`W-34 T2 M2 ${primitive}/a: worst=${worst.toFixed(2)} deg/mm`);
        expect(worst).toBeLessThanOrEqual(20);
      });
    });

    test('cone @ camera a — worst emitted ring matches the worst REAL slice plane\'s analytic cross-section to within 1 deg/mm', () => {
      const paths = genFor('cone', CAMERAS.a);
      const sizes = V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS.cone;
      const cam = sceneForPrimitive('cone', CAMERAS.a).camera;
      // The analytic ceiling is built from the EXACT 26 world-z values the
      // engine's own buildSliceSegments actually cuts at (not an arbitrary
      // continuous sweep) — this is what makes the exemption a RULE (real
      // geometry at the real planes) rather than a bare "cone is exempt" skip
      // or a tolerance fudge.
      const z0s = realPlaneZ0s('cone', CAMERAS.a);
      expect(z0s.length).toBeGreaterThan(0);
      let analyticCeiling = 0;
      z0s.forEach((z0) => {
        const truth = coneCrossSectionWorld(sizes, z0);
        if (!truth) return;
        const proj = truth.map((w) => V.Scene3D.Scene.projectWorldPoint(w, cam, BOUNDS)).filter(Boolean);
        if (proj.length < 3) return;
        const m = turnOverArc(proj, 1.0);
        if (m > analyticCeiling) analyticCeiling = m;
      });
      let emittedWorst = 0;
      paths.forEach((p) => { const m = turnOverArc(p, 1.0); if (m > emittedWorst) emittedWorst = m; });
      console.log(`W-34 T2 M2 cone/a: emitted worst=${emittedWorst.toFixed(2)}, analytic ceiling (real planes)=${analyticCeiling.toFixed(2)}`);
      // The emitted worst must not EXCEED the true worst by more than 1
      // deg/mm of numerical slack — if it does, something invented a corner
      // beyond the geometry (which §2.1 measured is NOT the case here).
      expect(emittedWorst).toBeLessThanOrEqual(analyticCeiling + 1);
    });

    test('torus @ camera a — exempted by W-27c-0a item 0(a) (real saddle-cusp crossing, owned there)', () => {
      const paths = genFor('torus', CAMERAS.a);
      let worst = 0;
      paths.forEach((p) => { const m = turnOverArc(p, 1.0); if (m > worst) worst = m; });
      console.log(`W-34 T2 M2 torus/a (informational, not gated): worst=${worst.toFixed(2)} deg/mm`);
      // No assertion against a numeric bar — this primitive's saddle geometry
      // is a real Morse-critical crossing, already the subject of a separate,
      // owned item. Recording the number so a regression is at least visible
      // in the console log for whoever next touches this pass.
      expect(Number.isFinite(worst)).toBe(true);
    });
  });

  // ── T3 — the capsule truth oracle. This is the ONLY test whose result
  //        decides Fix B (orchestrator ruling, LEDGER.md "Standing orchestrator
  //        rulings" 2026-09-08): ship Fix B only if this is RED (excess >= 15%).
  describe('T3 — capsule truth oracle (decides Fix B)', () => {
    test('capsule @ camera a — emitted worst M2 within +15% of analytic worst M2', () => {
      const paths = genFor('capsule', CAMERAS.a);
      const sizes = V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS.capsule;
      const cam = sceneForPrimitive('capsule', CAMERAS.a).camera;
      // Same discipline as the cone T2 test: use the EXACT 26 real slice-plane
      // z0 values (from the real mesh via buildSliceSegments), not a
      // continuous sweep that would also hit z0 near +-r — a silhouette-edge
      // extreme no actual plane lands on, where the true cross-section
      // legitimately pinches to a near-point and produces a spuriously huge
      // M2 that no emitted ring corresponds to (measured: a continuous sweep
      // put the "truth" at 72.6 deg/mm, an order of magnitude ABOVE every
      // real plane, which would falsely PASS this oracle vacuously).
      const z0s = realPlaneZ0s('capsule', CAMERAS.a);
      expect(z0s.length).toBeGreaterThan(0);
      let analyticWorst = 0;
      z0s.forEach((z0) => {
        const truth = capsuleCrossSectionWorld(sizes, z0);
        if (!truth) return;
        const proj = truth.map((w) => V.Scene3D.Scene.projectWorldPoint(w, cam, BOUNDS)).filter(Boolean);
        if (proj.length < 3) return;
        const m = turnOverArc(proj, 1.0);
        if (m > analyticWorst) analyticWorst = m;
      });
      let emittedWorst = 0;
      paths.forEach((p) => { const m = turnOverArc(p, 1.0); if (m > emittedWorst) emittedWorst = m; });
      const excessPct = analyticWorst > 0 ? ((emittedWorst - analyticWorst) / analyticWorst) * 100 : null;
      console.log(`W-34 T3 capsule/a: emitted worst=${emittedWorst.toFixed(2)}, analytic worst=${analyticWorst.toFixed(2)}, excess=${excessPct === null ? 'n/a' : excessPct.toFixed(1)}%`);
      // eslint-disable-next-line no-console
      console.log('W-34 T3 RESULT', JSON.stringify({ emittedWorst, analyticWorst, excessPct }));
      expect(emittedWorst).toBeLessThanOrEqual(analyticWorst * 1.15);
    });
  });

  // ── T4 — guard against the fix's own failure mode: no unbounded
  //        subdivision buying the angle.
  describe('T4 — refinement cannot buy the angle with unbounded subdivision', () => {
    test('SLICE_REFINE_MAX_ROUNDS is unchanged at 8', () => {
      const src = fs.readFileSync(SCENE3D_SRC, 'utf8');
      const m = src.match(/const SLICE_REFINE_MAX_ROUNDS\s*=\s*(\d+)/);
      expect(m).not.toBeNull();
      expect(Number(m[1])).toBe(8);
    });

    ['sphere', 'ellipsoid', 'cone', 'torus', 'capsule'].forEach((primitive) => {
      test(`${primitive} @ camera a total emitted point count stays under 2x its pre-fix value`, () => {
        const PRE_FIX_TOTALS = {
          sphere: 2028, ellipsoid: 1888, cone: 4112, torus: 3295, capsule: 6277,
        };
        const paths = genFor(primitive, CAMERAS.a);
        const total = paths.reduce((s, p) => s + p.length, 0);
        console.log(`W-34 T4 ${primitive}/a: total points=${total} (pre-fix ${PRE_FIX_TOTALS[primitive]})`);
        expect(total).toBeLessThan(PRE_FIX_TOTALS[primitive] * 2);
      });
    });
  });

  // ── Mutation guard (permanent, pure-math, no engine dependency) — proves
  //    the open-awareness in M1 is load-bearing by reproducing, on demand,
  //    the withdrawn 39.8° wrapped-open-ring artefact (W-27c-review-2.md).
  describe('mutation guard — wrapping an open run invents a phantom corner', () => {
    test('a near-straight open run reads near-zero turn; wrapped as closed, it reads a large phantom turn', () => {
      // A shallow arc: an OPEN run whose two endpoints are far apart (not a
      // ring) but whose wrap-around chord (last -> first) is short and steep
      // relative to the run's real edges — exactly the geometry that made
      // the withdrawn 39.8deg figure.
      const openRun = [];
      for (let i = 0; i <= 40; i += 1) {
        const t = i / 40;
        openRun.push({ x: t * 20, y: Math.sin(t * Math.PI) * 0.5 }); // shallow, real turn is tiny
      }
      const realTurn = maxVertexTurnOpenAware(openRun);
      expect(realTurn).toBeLessThan(5);

      // The withdrawn metric: wrap unconditionally (i in [0,n-1] with % n),
      // never checking whether the run is actually closed.
      const wrappedMaxTurn = (pts) => {
        const n = pts.length;
        let max = 0;
        for (let i = 0; i < n; i += 1) {
          const a = pts[(i - 1 + n) % n];
          const b = pts[i];
          const c = pts[(i + 1) % n];
          const t = turnDeg(a, b, c);
          if (t > max) max = t;
        }
        return max;
      };
      const phantomTurn = wrappedMaxTurn(openRun);
      expect(phantomTurn).toBeGreaterThanOrEqual(40);
    });
  });
});
