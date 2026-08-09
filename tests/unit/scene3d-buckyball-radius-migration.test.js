const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * BUCKYBALL RADIUS — SCENE_VERSION 3 → 4 migration.
 *
 * Scene3D.Mesh.scaleMeshToRadius divided by meshBounds().maxRadius, which is
 * floored at Math.max(1, …) so the twist deformer never divides by zero. The
 * truncated icosahedron is the ONLY solid whose pre-scale circumradius sits
 * below that floor — its vertices are the 1/3 points of a UNIT icosahedron's
 * edges, giving sqrt((5 + 4/sqrt5)/9) = 0.8685… — so the divide was clamped
 * away and a buckyball was built at 0.8685 · Radius: 13.1% under its stated
 * size, and 13.1% under what the (now honest) Geometry > Radius row claims.
 *
 * The mesh now scales by the TRUE circumradius. SCENE_MIGRATIONS[3] scales a
 * pre-v4 buckyball's STORED radius by that same measured factor so a saved
 * document renders byte-identically, while a new buckyball gets its true size.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };
const ser = (paths) => (paths || []).map((pp) => ({ pts: Array.from(pp), meta: pp.meta || null }));

// Every parametric solid family the Family selector offers.
const SOLID_FAMILIES = [
  'flatPolygon', 'prism', 'antiprism', 'bipyramid', 'cone', 'frustum', 'cupola',
  'starPrism', 'tetrahedron', 'cube', 'octahedron', 'dodecahedron', 'icosahedron',
  'geodesic', 'goldberg', 'buckyball',
];
// The families whose `radius` param IS the circumradius (they are built on, or
// scaled onto, a sphere). The sweep/extrude families below interpret `radius` as
// the RING radius and add depth/2 along z, so their circumradius is legitimately
// larger — they are excluded from the exactness assertion, not from the audit.
const SPHERICAL_FAMILIES = [
  'flatPolygon', 'bipyramid', 'tetrahedron', 'cube', 'octahedron',
  'dodecahedron', 'icosahedron', 'geodesic', 'goldberg', 'buckyball',
];

describe('Scene3D — buckyball radius correction (SCENE_VERSION 3 → 4)', () => {
  let runtime; let V; let Mesh; let Params; let defaults; let algo;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Mesh = V.Scene3D.Mesh;
    Params = V.Scene3D.Params;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const circumradius = (mesh) => (mesh.vertices || [])
    .reduce((best, pt) => Math.max(best, Math.hypot(pt.x, pt.y, pt.z)), 0);
  const solid = (solidType, radius, extra) => Mesh.createSolidMesh({
    solidType, radius, sideCount: 5, depth: 24, frequency: 2, taper: 55, starRatio: 45, ...(extra || {}),
  });

  // ── THE BUG: a buckyball must measure its stated Radius. ───────────────────
  describe.each([20, 45, 76, 130])('at Radius %s', (radius) => {
    test('a buckyball measures exactly its stated Radius', () => {
      expect(circumradius(solid('buckyball', radius))).toBeCloseTo(radius, 9);
    });
  });

  test('every SPHERICAL family measures its stated Radius (buckyball no longer the outlier)', () => {
    const measured = {};
    SPHERICAL_FAMILIES.forEach((t) => { measured[t] = circumradius(solid(t, 100)) / 100; });
    SPHERICAL_FAMILIES.forEach((t) => {
      expect([t, Math.abs(measured[t] - 1) < 1e-9]).toEqual([t, true]);
    });
  });

  // The sweep/extrude families are unchanged by the fix — pinned so a future
  // change to scaleMeshToRadius cannot silently resize them.
  test('the sweep/extrude families keep their ring-radius + depth geometry', () => {
    const sweep = SOLID_FAMILIES.filter((t) => !SPHERICAL_FAMILIES.includes(t));
    expect(sweep).toEqual(['prism', 'antiprism', 'cone', 'frustum', 'cupola', 'starPrism']);
    sweep.forEach((t) => {
      // radius 100 in xy, depth 24 ⇒ ±12 in z ⇒ hypot(100, 12) = 100.7174…
      expect(circumradius(solid(t, 100))).toBeCloseTo(Math.hypot(100, 12), 6);
    });
  });

  // ── The factor is MEASURED from the mesh, not hardcoded. ───────────────────
  test('the legacy factor is the raw truncated-icosahedron circumradius', () => {
    const raw = Mesh.buildTruncatedIcosahedronRaw();
    const factor = Mesh.legacyTruncatedIcosahedronScale();
    expect(factor).toBe(circumradius(raw));
    // …and that is the closed form sqrt((5 + 4/sqrt5)/9).
    expect(factor).toBeCloseTo(Math.sqrt((5 + 4 / Math.sqrt(5)) / 9), 12);
    expect(factor).toBeGreaterThan(0.868);
    expect(factor).toBeLessThan(0.869);
  });

  test('the old clamped divide is exactly what the factor undoes', () => {
    // OLD behavior == NEW behavior scaled by the factor.
    const factor = Mesh.legacyTruncatedIcosahedronScale();
    const legacyLook = solid('buckyball', 100 * factor);
    expect(circumradius(legacyLook)).toBeCloseTo(100 * factor, 9);
    // The raw construction times 100 is literally what the old code emitted.
    const raw = Mesh.buildTruncatedIcosahedronRaw();
    legacyLook.vertices.forEach((pt, i) => {
      expect(pt.x).toBeCloseTo(raw.vertices[i].x * 100, 9);
      expect(pt.y).toBeCloseTo(raw.vertices[i].y * 100, 9);
      expect(pt.z).toBeCloseTo(raw.vertices[i].z * 100, 9);
    });
  });

  // ── meshBounds' degenerate guard is intact. ────────────────────────────────
  test('meshBounds still floors at 1 (the twist deformer\'s divide-by-zero guard)', () => {
    expect(Mesh.meshBounds([]).maxRadius).toBe(1);
    expect(Mesh.meshBounds([]).maxDepth).toBe(1);
    expect(Mesh.meshBounds([{ x: 0, y: 0, z: 0 }]).maxRadius).toBe(1);
    // A flat (zero-depth) mesh still falls back to maxRadius for depth — the
    // pre-existing `maxDepth || maxRadius` semantics, deliberately unchanged.
    expect(Mesh.meshBounds([{ x: 5, y: 5, z: 0 }]).maxDepth).toBeCloseTo(Math.hypot(5, 5), 12);
    expect(Mesh.meshBounds([{ x: 0.2, y: 0.2, z: 0 }]).maxDepth).toBe(1);
    // But the TRUE circumradius is reported unfloored by the new helper.
    expect(Mesh.maxVertexRadius([{ x: 0.5, y: 0, z: 0 }])).toBe(0.5);
    expect(Mesh.maxVertexRadius([])).toBe(0);
  });

  test('scaleMeshToRadius survives a degenerate (empty / origin-only) mesh', () => {
    expect(() => Mesh.scaleMeshToRadius({ vertices: [], faces: [] }, 50)).not.toThrow();
    const origin = Mesh.scaleMeshToRadius({ vertices: [{ x: 0, y: 0, z: 0 }], faces: [] }, 50);
    expect(origin.vertices[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(Number.isFinite(origin.bounds.maxRadius)).toBe(true);
  });

  test('a sub-unit construction is no longer clamped', () => {
    const half = { vertices: [{ x: 0.5, y: 0, z: 0 }, { x: -0.5, y: 0, z: 0 }], faces: [] };
    expect(Mesh.scaleMeshToRadius(half, 10).vertices[0].x).toBeCloseTo(10, 12);
  });

  // ── THE POINT: a pre-v4 document keeps today's look. ───────────────────────
  const scene = (params, sceneVersion) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'o', primitive: 'solid', params: clone(params),
      transform: { x: 0, y: 50, z: 0, yaw: 20, pitch: 10, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper: 'wireframe', params: {} }, byObject: {}, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: false };
    p.sceneVersion = sceneVersion;
    return p;
  };
  const render = (p) => ser(algo.generate(p, null, null, BOUNDS));
  const radiusOf = (p) => p.objects[0].params.radius;

  test('SCENE_VERSION is 4 and the chain reaches it from every prior version', () => {
    expect(Params.SCENE_VERSION).toBe(4);
    [1, 2, 3].forEach((from) => {
      expect(Params.sanitizeSceneParams(scene({ solidType: 'buckyball', radius: 40 }, from)).sceneVersion).toBe(4);
    });
  });

  test('a fresh scene is born at SCENE_VERSION, so it is never migrated', () => {
    expect(defaults.sceneVersion).toBe(Params.SCENE_VERSION);
  });

  describe.each([1, 2, 3])('a v%s document', (from) => {
    test('renders its buckyball BYTE-IDENTICALLY to the pre-fix build', () => {
      const factor = Mesh.legacyTruncatedIcosahedronScale();
      const migrated = Params.sanitizeSceneParams(scene({ solidType: 'buckyball', radius: 40 }, from));
      expect(radiusOf(migrated)).toBeCloseTo(40 * factor, 12);
      // The pre-fix render of a radius-40 buckyball is, by construction, the
      // post-fix render at radius 40·factor.
      const legacyLook = Params.sanitizeSceneParams(
        scene({ solidType: 'buckyball', radius: 40 * factor }, Params.SCENE_VERSION),
      );
      expect(render(migrated)).toEqual(render(legacyLook));
      // …and that is genuinely NOT what an unmigrated 40 now draws.
      const unmigrated = scene({ solidType: 'buckyball', radius: 40 }, Params.SCENE_VERSION);
      expect(render(migrated)).not.toEqual(render(Params.sanitizeSceneParams(unmigrated)));
    });
  });

  test('an ABSENT solidType is a buckyball and is migrated too', () => {
    const factor = Mesh.legacyTruncatedIcosahedronScale();
    const src = scene({ radius: 40 }, 3);
    expect(src.objects[0].params.solidType).toBeUndefined();
    expect(radiusOf(Params.sanitizeSceneParams(src))).toBeCloseTo(40 * factor, 12);
  });

  test('an ABSENT radius is materialized from the deserialization default (20)', () => {
    const factor = Mesh.legacyTruncatedIcosahedronScale();
    const src = scene({ solidType: 'buckyball' }, 3);
    expect(src.objects[0].params.radius).toBeUndefined();
    expect(radiusOf(Params.sanitizeSceneParams(src))).toBeCloseTo(20 * factor, 12);
  });

  // ── Idempotency. ───────────────────────────────────────────────────────────
  test('running the migration twice equals running it once', () => {
    const once = Params.sanitizeSceneParams(scene({ solidType: 'buckyball', radius: 40 }, 1));
    const twice = Params.sanitizeSceneParams(once);
    expect(radiusOf(twice)).toBe(radiusOf(once));
    expect(render(twice)).toEqual(render(once));
    // Three times, for good measure — the factor must never compound.
    expect(radiusOf(Params.sanitizeSceneParams(twice))).toBe(radiusOf(once));
  });

  test('a document already at v4 is left completely alone', () => {
    const src = scene({ solidType: 'buckyball', radius: 40 }, Params.SCENE_VERSION);
    expect(radiusOf(Params.sanitizeSceneParams(src))).toBe(40);
  });

  // ── Surgical: nothing else is touched. ─────────────────────────────────────
  test.each(SOLID_FAMILIES.filter((t) => t !== 'buckyball'))(
    'a v3 %s solid keeps its stored radius', (solidType) => {
      const src = scene({ solidType, radius: 40, sideCount: 5, depth: 24, frequency: 2 }, 3);
      const migrated = Params.sanitizeSceneParams(src);
      expect(radiusOf(migrated)).toBe(40);
      expect(render(migrated)).toEqual(render(Params.sanitizeSceneParams(
        scene({ solidType, radius: 40, sideCount: 5, depth: 24, frequency: 2 }, Params.SCENE_VERSION),
      )));
    },
  );

  test('an importedMesh solid is NOT migrated (it never used the clamped divide)', () => {
    const src = scene({ solidType: 'importedMesh', radius: 40 }, 3);
    expect(radiusOf(Params.sanitizeSceneParams(src))).toBe(40);
  });

  test('a non-solid primitive is untouched', () => {
    const p = clone(defaults);
    p.objects = [{
      id: 'o1', name: 'o', primitive: 'sphere', params: { radius: 40, detail: 20 },
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.sceneVersion = 3;
    expect(Params.sanitizeSceneParams(p).objects[0].params.radius).toBe(40);
  });

  test('only the buckyball object in a mixed scene moves', () => {
    const factor = Mesh.legacyTruncatedIcosahedronScale();
    const p = clone(defaults);
    p.objects = [
      { id: 'a', name: 'a', primitive: 'solid', params: { solidType: 'buckyball', radius: 40 }, transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
      { id: 'b', name: 'b', primitive: 'solid', params: { solidType: 'icosahedron', radius: 40 }, transform: { x: 60, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
      { id: 'c', name: 'c', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: -60, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' },
    ];
    p.sceneVersion = 3;
    const out = Params.sanitizeSceneParams(p);
    expect(out.objects[0].params.radius).toBeCloseTo(40 * factor, 12);
    expect(out.objects[1].params.radius).toBe(40);
    expect(out.objects[2].params.sx).toBe(40);
  });

  // ── The LEAF object3d shape (a scene-tree object, not a monolith scene). ───
  const leaf = (params, sceneVersion) => {
    const p = clone(V.ALGO_DEFAULTS.object3d);
    p.primitive = 'solid';
    p.params = clone(params);
    if (sceneVersion !== undefined) p.sceneVersion = sceneVersion;
    return p;
  };

  test('a v3 object3d LEAF buckyball is migrated', () => {
    const factor = Mesh.legacyTruncatedIcosahedronScale();
    const out = Params.migrateScene(leaf({ solidType: 'buckyball', radius: 40 }, 3));
    expect(out.params.radius).toBeCloseTo(40 * factor, 12);
    expect(out.sceneVersion).toBe(4);
  });

  test('a v4 object3d LEAF buckyball is left alone, and re-migrating never compounds', () => {
    const once = Params.migrateScene(leaf({ solidType: 'buckyball', radius: 40 }, 3));
    const twice = Params.migrateScene(once);
    expect(twice.params.radius).toBe(once.params.radius);
    expect(Params.migrateScene(leaf({ solidType: 'buckyball', radius: 40 }, 4)).params.radius).toBe(40);
  });

  test('a v3 object3d LEAF of another family keeps its radius', () => {
    expect(Params.migrateScene(leaf({ solidType: 'goldberg', radius: 40 }, 3)).params.radius).toBe(40);
  });

  // A leaf created TODAY must survive save → reload without shrinking. The leaf
  // shape has no sceneVersion of its own in ALGO_DEFAULTS, so migrateScene would
  // read it as v1 and apply the whole chain — which would silently shrink a
  // brand-new buckyball the first time its document is reopened.
  test('a NEW object3d leaf is stamped at SCENE_VERSION so a reload cannot shrink it', () => {
    expect(V.ALGO_DEFAULTS.object3d.sceneVersion).toBe(Params.SCENE_VERSION);
    // Simulate create → save → reload: a leaf built from the factory block and
    // fed back through the migration chain must keep its radius.
    const fresh = leaf({ solidType: 'buckyball', radius: 40 });
    expect(fresh.sceneVersion).toBe(Params.SCENE_VERSION);
    expect(Params.migrateScene(fresh).params.radius).toBe(40);
    // …and reloading a SECOND time is still stable.
    expect(Params.migrateScene(Params.migrateScene(fresh)).params.radius).toBe(40);
  });

  // A genuinely legacy leaf carries no sceneVersion at all — it must still
  // migrate (the factory stamp above must not leak onto old payloads).
  test('a legacy leaf with NO sceneVersion key is still treated as v1 and migrated', () => {
    const factor = Mesh.legacyTruncatedIcosahedronScale();
    const legacy = { primitive: 'solid', params: { solidType: 'buckyball', radius: 40 } };
    expect(legacy.sceneVersion).toBeUndefined();
    expect(Params.migrateScene(legacy).params.radius).toBeCloseTo(40 * factor, 12);
  });
});
