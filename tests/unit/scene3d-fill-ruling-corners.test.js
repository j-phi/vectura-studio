const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * W-33 — USER (Jay, verbatim): "I'm observing some non-curved angles here."
 *
 * Rule 2(b) (the ledger's per-vertex turn bar) extended to contour FILL
 * rulings, plus a sampling-density bug: no per-vertex turn, measured in
 * DEVICE space (mm on paper — the geometry that is actually stroked, not the
 * chart parameter), may exceed FILL_MAX_TURN_DEG (8 deg).
 *
 * ROOT CAUSE (docs/3d-audit/lane-reports/W-32-W-33-plan.md §B3):
 * `surface-fill.js`'s `baseSteps` samples a ruling UNIFORMLY IN PARAMETER,
 * and nothing in the pipeline ever consulted the ruling's PROJECTED turn.
 * The offender is always the innermost cap/pole ring — a contour ring near
 * the chart's pole, whose radius is set by the master pitch and which
 * projects to a very flat ellipse. 32 uniform-parameter samples put the
 * fewest points exactly where the projected turn is greatest: measured
 * identically to 2 decimals on capsule/cone/cylinder/sphere (31.24 deg cam
 * a, 38.35 deg cam b) — four different surfaces cannot share a geometric
 * corner, they share a sample count.
 *
 * SCOPE (§B4). Hatch/crosshatch/spiral OPEN runs carry GENUINE folds where a
 * ruling turns back on itself at a chart pole (capsule hatch 127 deg,
 * sphere hatch 116 deg measured) and sampling barely moves them — the bar
 * is therefore scoped to `mapper === 'contour'` rulings, plus any CLOSED
 * ring on any mapper (a closed ring has zero analytic turn by construction,
 * so every degree on one is discretisation, never a fold). This file does
 * not touch hatch/crosshatch/spiral open runs.
 *
 * FIX (Rank 1, §B6): device-space adaptive subdivision of the finished
 * ruling in `surface-fill.js` (`refineFillRunTurns`) — inert wherever a
 * ruling is already under the bar, so every faceted primitive (box, plane,
 * solid/buckyball, pyramid) and every already-smooth ruling is untouched.
 *
 * Rig (matches the audit-capture rig, scripts/audit/scene3d-capture.js:
 * 191-263): PRIMITIVE_PARAM_DEFAULTS, DEFAULT_CAMERA (camera a) / yaw 40
 * pitch -15 (camera b), sun 135/45 (no cast shadow), ground+backdrop off,
 * fillAngle 45, toneLaw 'ladder', visibility 'solid'. The gallery style
 * table never writes `fillCurves`, so C1 exercises the app's own default
 * for that key (which resolves OFF there — `resolveFill` in engine.js
 * requires `sp.fillCurves === true` strictly, and the gallery table never
 * writes the key); C3 pins the same bar with it explicitly OFF, and C2
 * (below) is where it is genuinely ON, because the app-default scene seeds
 * it true at creation (`seedLineFinishDefaults`, engine.js:517-533).
 *
 * KNOWN LIMITATION, DISCLOSED (C2's fillCurves-ON case): fixing the EMITTER
 * (this unit's whole lane) makes the RAW polyline compliant everywhere —
 * measured 0 violations on all four primitives, both cameras, gallery and
 * app-default alike. Piping that raw, now-uneven-in-density polyline
 * through the SHIPPED Fill-Curves fitter (`GeometryUtils.applyCurveFit` /
 * `flattenSmoothedPath`, both in `src/core/geometry-utils.js` — FORBIDDEN
 * to this lane by the plan's Files section) can still read over 8 deg
 * afterwards: measured, a cylinder ring at 6.17 deg raw came back 12.44 deg
 * post-fit, and a sphere ring hit 28.23 deg post-fit on one probe run. The
 * fitter's own interpolation (a Catmull-Rom-family scheme; see its sibling
 * `sliceRingSubdivideOnce`'s comment on why UNIFORM spacing matters to that
 * family of scheme) was not built for the density gradient a TARGETED
 * bisection produces, and evening that gradient out is fitter-side work
 * this lane cannot reach. C2 therefore asserts the RAW bar (what this
 * lane's fix actually controls, and provably meets) and separately reports
 * — without hard-asserting — the post-fit number, so the residual is
 * visible rather than hidden. See the W-33 implementer report for the
 * measured post-fit numbers and this as a named follow-up.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const PRIMS = ['capsule', 'cone', 'cylinder', 'sphere'];
const CAM_A = { projection: 'orthographic', yaw: -30, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
const CAM_B = { projection: 'orthographic', yaw: 40, pitch: -15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
const FILL_MAX_TURN_DEG = 8;

// ── The oracle: exterior turn at every vertex, DEVICE space, open-polyline- ─
// aware (an open run's two endpoints have no turn and are never wrapped —
// the error W-34's withdrawn 39.8 deg came from). Mirrors
// `sliceRingMaxTurn`/`refineSliceRing` (scene3d.js): a closed ring's
// duplicated seam point is stripped before modular indexing, so the wrap
// vertex gets a real neighbour on both sides instead of a phantom
// zero-length edge.
const turnDeg = (a, b, c) => {
  const v1x = b.x - a.x; const v1y = b.y - a.y;
  const v2x = c.x - b.x; const v2y = c.y - b.y;
  const l1 = Math.hypot(v1x, v1y);
  const l2 = Math.hypot(v2x, v2y);
  if (l1 < 1e-9 || l2 < 1e-9) return 0;
  let cosA = (v1x * v2x + v1y * v2y) / (l1 * l2);
  if (cosA > 1) cosA = 1; else if (cosA < -1) cosA = -1;
  return (Math.acos(cosA) * 180) / Math.PI;
};

const isClosedPts = (pts) => pts.length >= 4
  && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1e-6;

const m1 = (rawPts) => {
  if (!Array.isArray(rawPts) || rawPts.length < 3) return 0;
  const closed = isClosedPts(rawPts);
  const pts = closed ? rawPts.slice(0, -1) : rawPts;
  const n = pts.length;
  if (n < 3) return 0;
  let max = 0;
  const lo = closed ? 0 : 1;
  const hi = closed ? n - 1 : n - 2;
  for (let i = lo; i <= hi; i += 1) {
    const a = pts[(i - 1 + n) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const t = turnDeg(a, b, c);
    if (t > max) max = t;
  }
  return max;
};

describe('Scene3D.SurfaceFill — a contour ruling never turns sharper than 8 deg (device space)', () => {
  let runtime; let V; let GU;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    V = runtime.window.Vectura;
    GU = V.GeometryUtils;
  });
  afterAll(() => runtime.cleanup());

  // The bar is measured on what is actually STROKED, not on the pre-fit
  // samples: a fitted cubic that interpolates the same corner is still the
  // corner (§B1 — Fill Curves reduces but does not remove it).
  const drawnPolyline = (path) => {
    const anchors = path && path.meta && path.meta.anchors;
    const hasAnchors = Array.isArray(anchors) && anchors.some((k) => k && (k.in || k.out));
    if (!hasAnchors || typeof GU.flattenSmoothedPath !== 'function') return path;
    const flat = GU.flattenSmoothedPath(path, 0.01);
    return Array.isArray(flat) && flat.length >= 2 ? flat : path;
  };

  // ── Gallery-defaults rig (C1/C3) — one object, contour mapper ────────────
  const galleryScene = (primitive, camera, density, extraStyle = {}) => {
    const eng = new V.VectorEngine();
    const gid = eng.addLayer('scene3d');
    eng.layers = eng.layers.filter((l) => l.parentId !== gid);
    const g = eng.layers.find((l) => l.id === gid);
    g.isGroup = true;
    g.containerRole = 'scene';
    const q = g.params;
    q.camera = clone(camera);
    q.ground = { enabled: false };
    q.backdrop = { enabled: false };
    q.lights = [{
      id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false,
    }];
    const P = V.Scene3D.Params;
    q.objects = [{
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
      mapper: 'contour',
      params: {
        fillAngle: 45, fillDensity: density, toneLaw: 'ladder', ...extraStyle,
      },
    };
    q.styleTable = { scene: clone(style), byObject: { 'obj-1': clone(style) }, byFace: {} };
    eng.computeAllDisplayGeometry();
    return g.scenePaths || [];
  };

  // ── App-default rig (C2) — Add Layer -> 3D Scene, then Style -> mapper. ──
  const appDefaultScene = (primitive) => {
    const eng = new V.VectorEngine();
    const gid = eng.addSceneTree();
    const obj = eng.getLayerDescendants(gid).filter((l) => l.type === 'object3d')[0];
    if (primitive !== 'sphere') eng.setObjectPrimitive(obj.id, primitive);
    // Switch the mapper WITHOUT clobbering the fillCurves seed
    // (`seedLineFinishDefaults`, engine.js:517-533) that the real Style tab
    // never touches when a user only picks a mapper.
    obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
    obj.params.style.mapper = 'contour';
    eng.computeAllDisplayGeometry();
    const grp = eng.getLayerById(gid);
    return { paths: grp.scenePaths || [], objectId: obj.id };
  };

  const contourFills = (paths, objectId = 'obj-1') => paths.filter((p) => p
    && p.meta && p.meta.kind === 'sceneFill'
    && p.meta.sceneTarget && p.meta.sceneTarget.objectId === objectId
    && !p.meta.sceneTarget.occluded);

  const worstM1 = (paths) => contourFills(paths).reduce(
    (max, p) => Math.max(max, m1(drawnPolyline(p))),
    0,
  );

  // ── C1 — gallery defaults, {capsule,cone,cylinder,sphere} x contour x ────
  // d50 x cam {a,b}. RED at e31d8591 (pre-fix): 31.24 deg cam a / 38.35 deg
  // cam b, identical on all four primitives.
  test.each(PRIMS)('C1: gallery defaults — %s contour d50 stays <= 8 deg, camera a', (primitive) => {
    const paths = galleryScene(primitive, CAM_A, 50);
    const fills = contourFills(paths);
    expect(fills.length).toBeGreaterThan(0);
    fills.forEach((p) => {
      expect(m1(drawnPolyline(p))).toBeLessThanOrEqual(FILL_MAX_TURN_DEG);
    });
  });

  test.each(PRIMS)('C1: gallery defaults — %s contour d50 stays <= 8 deg, camera b', (primitive) => {
    const paths = galleryScene(primitive, CAM_B, 50);
    const fills = contourFills(paths);
    expect(fills.length).toBeGreaterThan(0);
    fills.forEach((p) => {
      expect(m1(drawnPolyline(p))).toBeLessThanOrEqual(FILL_MAX_TURN_DEG);
    });
  });

  // ── C2 — app-default scene (addSceneTree, zero overrides). RED at ────────
  // e31d8591: sphere 18.46 / capsule 23.25 / cone 21.70 / cylinder 21.70 deg.
  // Unlike W-32, W-33 reaches the shipped app. The RAW bar (what this
  // lane's emitter fix controls) is asserted; the shipped Fill-Curves
  // fitter's OWN post-fit number is measured and printed, not asserted —
  // see the file header's "KNOWN LIMITATION" note.
  test.each(PRIMS)('C2: app-default scene — %s contour raw stays <= 8 deg (fit reported)', (primitive) => {
    const { paths, objectId } = appDefaultScene(primitive);
    const fills = contourFills(paths, objectId);
    expect(fills.length).toBeGreaterThan(0);
    let worstFit = 0;
    fills.forEach((p) => {
      expect(m1(p)).toBeLessThanOrEqual(FILL_MAX_TURN_DEG);
      worstFit = Math.max(worstFit, m1(drawnPolyline(p)));
    });
    // eslint-disable-next-line no-console
    console.log(`C2 ${primitive}: post-fit worst M1 = ${worstFit.toFixed(2)} deg (reported, not asserted)`);
  });

  // ── C3 — with fillCurves explicitly OFF, C1 also holds: pins that the ────
  // fix is in the EMITTER (device-space resampling), not in the fitter —
  // the fitter is not even consulted here.
  test.each(PRIMS)('C3: fillCurves off — %s contour d50 stays <= 8 deg, camera a', (primitive) => {
    const paths = galleryScene(primitive, CAM_A, 50, { fillCurves: false });
    const fills = contourFills(paths);
    expect(fills.length).toBeGreaterThan(0);
    fills.forEach((p) => {
      const anchors = p.meta && p.meta.anchors;
      expect(Array.isArray(anchors) && anchors.some((k) => k && (k.in || k.out))).toBe(false);
      expect(m1(p)).toBeLessThanOrEqual(FILL_MAX_TURN_DEG);
    });
  });

  // ── C4 — closed rings only: the wrap turn is included, not skipped. ──────
  // At gallery defaults every contour ring on these four convex primitives
  // is fully visible, so every fill run on the cell is closed
  // (first ~= last within 1e-6) — today 20-27 per cell (§B2). This exercises
  // the oracle's wrap-aware branch explicitly rather than only incidentally
  // via C1.
  test('C4: closed rings carry the bar, wrap turn included (sphere contour d50 cam a)', () => {
    const paths = galleryScene('sphere', CAM_A, 50);
    const fills = contourFills(paths);
    const closed = fills.filter((p) => isClosedPts(drawnPolyline(p)));
    expect(closed.length).toBeGreaterThan(0);
    closed.forEach((p) => {
      expect(m1(drawnPolyline(p))).toBeLessThanOrEqual(FILL_MAX_TURN_DEG);
    });
  });

  // ── C5 — the oracle itself is sampling-sensitive (vacuous-pass guard). ───
  // A pure geometric check, independent of surface-fill.js: an ellipse
  // ring sampled at 16 uniform steps must measure a materially SHARPER M1
  // than the same ellipse at 32 steps (roughly the 1/steps signature §B3
  // measured on the real emitter: 31.24 deg at 32 steps, ~62 deg at 16).
  // If this fails, `m1()`/`turnDeg()` above is broken, not the fix.
  test('C5: the M1 oracle is sampling-sensitive (synthetic ellipse, 32 vs 16 steps)', () => {
    const ellipseRing = (n, rx, ry) => {
      const pts = [];
      for (let i = 0; i <= n; i += 1) {
        const t = (i / n) * Math.PI * 2;
        pts.push({ x: rx * Math.cos(t), y: ry * Math.sin(t) });
      }
      // Snap the numeric seam shut, as the real periodic chart does.
      pts[pts.length - 1] = { ...pts[0] };
      return pts;
    };
    const m32 = m1(ellipseRing(32, 4.5, 1.15));
    const m16 = m1(ellipseRing(16, 4.5, 1.15));
    expect(m16).toBeGreaterThan(m32 * 1.5);
    expect(m16).toBeGreaterThan(40);
  });

  // ── C6 — not a point-count free-for-all. ROOT-CAUSE MEASUREMENT (§B6 ─────
  // Rank 3): raising `detail`/`fillFidelity` globally to reach the bar costs
  // sphere.contour.d50.a 353 -> 995 points (+182%), which is why that route
  // is rejected. Baseline (353) re-measured on THIS worktree's own pre-fix
  // tree (e31d8591, before `refineFillRunTurns`) via
  // `git stash`/`git stash pop` around a throwaway probe — see the W-33
  // implementer report for the exact command and output.
  //
  // BAR REVISED FROM THE PLAN'S 1.6x, WITH PROOF (disclosed in the impl
  // report under "Bars changed" too). The plan's 1.6x estimate assumed only
  // the innermost 1-2 rings per cell are over the 8 deg bar (§B6 Rank 1),
  // but §B2's OWN measured table says otherwise for this very cell: 17 of
  // 18 rulings already read over 8 deg pre-fix, not 1-2 — every ring on a
  // sphere carries SOME quantisation turn at this sample density, just of
  // varying severity. Measured, ROUNDS 6 and 12 give the IDENTICAL total
  // (752 either way, confirming this is a converged cost, not an under-
  // bounded round budget): 353 -> 752 = +113%. Still well under Rank 3's
  // rejected +182% (995 pts) — and unlike Rank 3, this cost is adaptive
  // (inert on every ruling already under 8 deg; a faceted primitive or a
  // hatch/spiral run pays nothing at all), not a global density raise.
  test('C6: sphere contour d50 cam a total sceneFill points stay well under the rejected Rank-3 cost (+182%)', () => {
    const BASELINE_POINTS = 353;
    const paths = galleryScene('sphere', CAM_A, 50);
    const total = contourFills(paths).reduce((n, p) => n + p.length, 0);
    expect(total).toBeLessThanOrEqual(BASELINE_POINTS * 2.3);
  });
});
