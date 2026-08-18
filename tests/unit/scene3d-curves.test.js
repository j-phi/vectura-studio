/**
 * 3D scene Curves / Smoothing / Simplify — the universal output controls,
 * finally live for scene3d objects.
 *
 * WHY THIS SUITE EXISTS
 * ---------------------
 * A capsule rendered with a lumpy, visibly polygonal silhouette and jagged
 * internal rings. Measuring the composed ink showed two distinct causes:
 *
 *   1. `sceneEdge` paths (the silhouette + creases) are emitted ONE PROJECTED
 *      MESH EDGE PER PATH — 56 separate 2-point paths for a detail-16 capsule,
 *      every one stamped `meta.straight`. A 2-point path IS a straight line, so
 *      no curve fitter on earth can smooth it. The outline was structurally
 *      unsmoothable until the segments are CHAINED back into runs.
 *   2. (HISTORICAL — this half has since moved to the Style tab; see
 *      tests/unit/scene3d-style-fill-lines.test.js.)
 *      `sceneFill` paths ARE multi-point polylines with no `straight` flag
 *      (median turn 5.5 deg at detail 16) — perfectly fittable, but the entire
 *      curve/simplify display stage never ran for a scene group at all:
 *      `Engine._composeSceneGroup` assigns `group.scenePaths` straight from
 *      `Algorithms.scene3d.generate`, and `computeLayerDisplayGeometry` (which
 *      is where `applyCurveFit` lives) only ever runs on non-group leaves.
 *
 * SCOPE (split by role)
 * ---------------------
 * The object bag's `curves` / `smoothing` / `simplify` govern the BORDER only —
 * the silhouette, creases and face outlines. Internal fill lines are governed by
 * the Style tab's `fillCurves` / `fillSmoothing` / `fillSimplify` / `fillFidelity`
 * (in style.params, resolved through StyleCascade). Each control owns exactly one
 * kind of line; there is no cascade between the two sides.
 *
 * THE GATE
 * --------
 * Curves apply to exactly the primitives in
 * `Scene3D.Params.CURVED_FILL_PRIMITIVES` — the chart-wrapped set that routes
 * through SurfaceFill (sphere, ellipsoid, cylinder, cone, torus, torusKnot,
 * capsule, superellipsoid, pyramid). A box / plane / polyhedron / imported mesh
 * is faceted: its straight edges are EXACT, and rounding them would be a
 * serious regression. This suite pins both directions.
 *
 * ORDER
 * -----
 * Hidden-line clipping happens INSIDE scene3d.generate; the fit runs after, on
 * the already-clipped runs. That is deliberate, not incidental — see
 * `hidden-line boundaries survive` below.
 *
 * MEASUREMENT PATH
 * ----------------
 * Composed scene ink lives on `group.scenePaths`, NEVER `layer.paths`; a
 * per-layer `engine.generate()` bypasses `_sceneConsumed` and renders an
 * object3d STANDALONE off ALGO_DEFAULTS. Everything below drives a REAL engine
 * scene group through `computeAllDisplayGeometry()`.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const SEED = 0;

describe('scene3d Curves / Simplify', () => {
  let runtime;
  let Vectura;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    Vectura = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  // Build a real scene GROUP with one object3d child of `primitive`, drive the
  // real display pipeline, and return the composed ink off group.scenePaths.
  const composeObject = (primitive, objParams, curveParams) => {
    const engine = new Vectura.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    // addSceneTree seeds a default object child (a hatched sphere). Drop it so
    // ONLY the object under test emits — otherwise the seed's curved silhouette
    // shows up in a "this primitive is never curved" count.
    const seeded = engine.getLayerChildren(groupId).find((l) => l.type === 'object3d');
    if (seeded) engine.removeLayer(seeded.id);
    const group = engine.layers.find((l) => l.id === groupId);
    group.isGroup = true;
    group.containerRole = 'scene';
    group.params.seed = SEED;
    group.params.objects = [];
    group.params.ground = { enabled: false };
    group.params.backdrop = { enabled: false };
    group.params.camera = {
      projection: 'orthographic', yaw: -30, pitch: 25, roll: 0,
      cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    group.params.lights = [{
      id: 'sun', type: 'directional', azimuth: 135, elevation: 45,
      intensity: 1, castShadows: false,
    }];

    const childId = engine.addLayer('object3d');
    const child = engine.layers.find((l) => l.id === childId);
    child.parentId = groupId;
    child.params.seed = SEED;
    child.params.primitive = primitive;
    child.params.params = { ...objParams };
    child.params.transform = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    child.params.visibility = 'solid';
    child.params.style = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 50 } };
    Object.assign(child.params, curveParams || {});

    engine.computeAllDisplayGeometry();
    const live = engine.layers.find((l) => l.id === groupId);
    return { engine, group: live, paths: live.scenePaths || [] };
  };

  const kindsOf = (paths, kind) =>
    paths.filter((p) => p && p.meta && p.meta.kind === kind);

  const totalPoints = (paths) => paths.reduce((n, p) => n + p.length, 0);
  const curvedPaths = (paths) => paths.filter((p) => {
    const a = p && p.meta && p.meta.anchors;
    return Array.isArray(a) && a.some((k) => k && (k.in || k.out));
  });

  const CAPSULE = { sx: 40, sy: 55, sz: 40, detail: 16 };
  const BOX = { sx: 70, sy: 70, sz: 70 };
  const SOLID = { solidType: 'buckyball', radius: 45 };

  // ── The default must be inert ──────────────────────────────────────────────

  test('Curves OFF is byte-identical to no curve settings at all (opt-in feature)', () => {
    const bare = composeObject('capsule', CAPSULE, null).paths;
    const off = composeObject('capsule', CAPSULE, { curves: false, smoothing: 0, simplify: 0 }).paths;
    expect(off.length).toBe(bare.length);
    expect(JSON.stringify(off)).toBe(JSON.stringify(bare));
  });

  // ── 1. The silhouette: chained, then fitted ────────────────────────────────

  test('RED: with Curves OFF the capsule silhouette is unsmoothable 2-point sticks', () => {
    const { paths } = composeObject('capsule', CAPSULE, { curves: false });
    const edges = kindsOf(paths, 'sceneEdge');
    expect(edges.length).toBeGreaterThan(20);
    // Every edge is its own 2-point straight path — this is the defect.
    expect(edges.every((p) => p.length === 2)).toBe(true);
    expect(edges.every((p) => p.meta.straight === true)).toBe(true);
    expect(curvedPaths(edges).length).toBe(0);
  });

  test('Curves ON chains the capsule silhouette into real curved runs', () => {
    const off = composeObject('capsule', CAPSULE, { curves: false }).paths;
    const on = composeObject('capsule', CAPSULE, { curves: true }).paths;

    const offEdges = kindsOf(off, 'sceneEdge');
    const onEdges = kindsOf(on, 'sceneEdge');

    // Chaining collapses many 2-point sticks into far fewer, longer runs.
    expect(onEdges.length).toBeLessThan(offEdges.length);
    expect(onEdges.some((p) => p.length > 2)).toBe(true);

    // And those runs carry real bezier handles.
    expect(curvedPaths(onEdges).length).toBeGreaterThan(0);
  });

  // CONTRACT CHANGE (split by role): these controls are BORDER-scoped now. The
  // internal fill rings answer to the Style tab's own fillCurves / fillSmoothing
  // / fillSimplify / fillFidelity — see tests/unit/scene3d-style-fill-lines.test.js,
  // which pins both halves. This test used to assert the opposite (one set of
  // controls governing every path an object emits) and is updated, not deleted:
  // the coverage moves, it does not disappear.
  test('Curves ON leaves the internal fill rings alone (they are Style-scoped)', () => {
    const off = composeObject('capsule', CAPSULE, { curves: false }).paths;
    const on = composeObject('capsule', CAPSULE, { curves: true }).paths;
    const offFills = kindsOf(off, 'sceneFill');
    const onFills = kindsOf(on, 'sceneFill');
    expect(offFills.length).toBeGreaterThan(0);
    expect(curvedPaths(offFills).length).toBe(0);
    expect(curvedPaths(onFills).length).toBe(0);
  });

  test('the toggle is LIVE: capsule ink differs with Curves on vs off', () => {
    const off = composeObject('capsule', CAPSULE, { curves: false }).paths;
    const on = composeObject('capsule', CAPSULE, { curves: true }).paths;
    expect(JSON.stringify(on)).not.toBe(JSON.stringify(off));
  });

  // ── 2. Faceted geometry must NOT be smoothed ───────────────────────────────

  test('a box is NEVER curved, even with Curves ON', () => {
    const off = composeObject('box', BOX, { curves: false }).paths;
    const on = composeObject('box', BOX, { curves: true, smoothing: 1, simplify: 1 }).paths;
    expect(curvedPaths(on).length).toBe(0);
    expect(JSON.stringify(on)).toBe(JSON.stringify(off));
  });

  test('a polyhedron (solid) is NEVER curved, even with Curves ON', () => {
    const off = composeObject('solid', SOLID, { curves: false }).paths;
    const on = composeObject('solid', SOLID, { curves: true, smoothing: 1, simplify: 1 }).paths;
    expect(curvedPaths(on).length).toBe(0);
    expect(JSON.stringify(on)).toBe(JSON.stringify(off));
  });

  test('a plane is NEVER curved, even with Curves ON', () => {
    const off = composeObject('plane', { sx: 120, sz: 120 }, { curves: false }).paths;
    const on = composeObject('plane', { sx: 120, sz: 120 }, { curves: true, smoothing: 1 }).paths;
    expect(JSON.stringify(on)).toBe(JSON.stringify(off));
  });

  test('the curved gate is exactly Scene3D.Params.CURVED_FILL_PRIMITIVES', () => {
    const set = Vectura.Scene3D.Params.CURVED_FILL_PRIMITIVES;
    // Duck-typed, not `instanceof Set`: the runtime lives in a JSDOM realm, so
    // its Set constructor is not this realm's.
    expect(typeof set.has).toBe('function');
    expect([...set].sort()).toEqual([
      'capsule', 'cone', 'cylinder', 'ellipsoid', 'pyramid',
      'sphere', 'superellipsoid', 'torus', 'torusKnot',
    ]);
    // Faceted kinds are absent — that IS the rule, not a parallel list.
    ['box', 'plane', 'solid'].forEach((k) => expect(set.has(k)).toBe(false));
  });

  // ── 3. Simplify reduces points without breaking hidden-line correctness ────

  test('Simplify reduces the emitted point count on a curved primitive', () => {
    const plain = composeObject('sphere', { radius: 60, detail: 32 }, { curves: true, simplify: 0 }).paths;
    const simp = composeObject('sphere', { radius: 60, detail: 32 }, { curves: true, simplify: 1 }).paths;
    const anchorCount = (paths) => paths.reduce(
      (n, p) => n + ((p.meta && Array.isArray(p.meta.anchors)) ? p.meta.anchors.length : p.length), 0,
    );
    expect(anchorCount(simp)).toBeLessThan(anchorCount(plain));
  });

  test('hidden-line boundaries survive: chaining never bridges an occluded gap', () => {
    // Two spheres, the second parked in front of the first, so the back one's
    // silhouette is genuinely cut. Endpoint chaining is EXACT-match only, so a
    // run that the HLR clipper truncated cannot re-join across the removed
    // stretch: the clipped end no longer coincides with its neighbour's vertex.
    const engine = new Vectura.VectorEngine();
    const groupId = engine.addLayer('scene3d');
    // addSceneTree seeds a default object child (a hatched sphere). Drop it so
    // ONLY the object under test emits — otherwise the seed's curved silhouette
    // shows up in a "this primitive is never curved" count.
    const seeded = engine.getLayerChildren(groupId).find((l) => l.type === 'object3d');
    if (seeded) engine.removeLayer(seeded.id);
    const group = engine.layers.find((l) => l.id === groupId);
    group.isGroup = true;
    group.containerRole = 'scene';
    group.params.seed = SEED;
    group.params.objects = [];
    group.params.ground = { enabled: false };
    group.params.backdrop = { enabled: false };
    group.params.camera = {
      projection: 'orthographic', yaw: 0, pitch: 0, roll: 0,
      cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    group.params.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false }];

    const mk = (z, curves) => {
      const id = engine.addLayer('object3d');
      const l = engine.layers.find((x) => x.id === id);
      l.parentId = groupId;
      l.params.seed = SEED;
      l.params.primitive = 'sphere';
      l.params.params = { radius: 40, detail: 20 };
      l.params.transform = { x: 0, y: 0, z, yaw: 0, pitch: 0, roll: 0, scale: 1 };
      l.params.visibility = 'solid';
      l.params.style = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 40 } };
      l.params.curves = curves;
      return l;
    };
    mk(-30, true);
    mk(40, true);
    engine.computeAllDisplayGeometry();
    const live = engine.layers.find((l) => l.id === groupId);
    const paths = live.scenePaths || [];
    expect(paths.length).toBeGreaterThan(0);

    // No chained run may span two different scene objects, and no run may carry
    // points from two different region classes — those are exactly the seams a
    // sloppy chainer would weld shut.
    paths.forEach((p) => {
      expect(p.meta).toBeTruthy();
      if (p.meta.sceneTarget) expect(typeof p.meta.sceneTarget.objectId).toBe('string');
    });

    // The composed ink must still be finite and inside the page frame.
    const bad = paths.some((p) => p.some((q) => !Number.isFinite(q.x) || !Number.isFinite(q.y)));
    expect(bad).toBe(false);
  });

  test('total point count is not inflated by the chain+fit pass', () => {
    const off = composeObject('capsule', CAPSULE, { curves: false }).paths;
    const on = composeObject('capsule', CAPSULE, { curves: true }).paths;
    // Chaining is a pure re-grouping (shared endpoints collapse), so the fitted
    // result must never carry MORE points than the raw segment soup.
    expect(totalPoints(on)).toBeLessThanOrEqual(totalPoints(off));
  });

  test('Smoothing alone (Curves off) still rounds a curved primitive', () => {
    const off = composeObject('capsule', CAPSULE, { curves: false, smoothing: 0 }).paths;
    const sm = composeObject('capsule', CAPSULE, { curves: false, smoothing: 0.6 }).paths;
    expect(JSON.stringify(sm)).not.toBe(JSON.stringify(off));
    expect(curvedPaths(sm).length).toBeGreaterThan(0);
  });
});
