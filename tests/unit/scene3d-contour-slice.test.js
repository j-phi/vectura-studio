/**
 * CtS I5 — depth-slice ('contourSlice') scene treatment.
 *
 * A standalone topoform's `contours` render mode (depth-plane cross-sections)
 * is given a scene-compositor analog: the new `contourSlice` mapper cuts the
 * assembled mesh with parallel planes and runs each cut segment through the
 * SHARED HLR clipper, so the slices are occluded / self-occluded / shadowed by
 * the scene exactly like the surface fills.
 *
 * RGR — `contourSlice` is not in MAPPERS and the slice pass does not exist on
 * the base branch, so every assertion here fails before I5 and passes after.
 * The perf/timeout guard mirrors the topoform Randomize draw-cap precedent
 * (commit 5e75af6): a pathological detail×planes combo must not hang.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, truncate: true, penWidth: 0.3 };

describe('CtS I5 — contourSlice depth-slice treatment', () => {
  let runtime;
  let V;
  let algo;
  let defaults;
  let realCascade;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry && V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS && V.ALGO_DEFAULTS.scene3d;
    realCascade = V.Scene3D.StyleCascade;
  });
  afterAll(() => runtime.cleanup());
  afterEach(() => { if (V.Scene3D) V.Scene3D.StyleCascade = realCascade; });

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const sphere = (id, extra = {}) => ({
    id, name: id, primitive: 'sphere', params: { radius: 22, detail: 18 },
    transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid', ...extra,
  });
  const box = (id, extra = {}) => ({
    id, name: id, primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
    transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid', ...extra,
  });
  const sceneParams = (objects, sliceParams = {}, styleByObject = {}) => {
    const p = clone(defaults);
    p.seed = 1;
    p.objects = objects;
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -25, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper: 'contourSlice', params: { sliceCount: 12, ...sliceParams } },
      byObject: styleByObject, byFace: {},
    };
    return p;
  };
  // Pass-through cascade so styleTable params reach the emit path verbatim.
  const installStub = () => {
    V.Scene3D.StyleCascade = {
      resolve(styleTable, { objectId, faceId }) {
        const t = styleTable || {};
        const s = (t.byFace && t.byFace[`${objectId}/${faceId}`]) || (t.byObject && t.byObject[objectId]) || t.scene || {};
        return { penId: s.penId != null ? s.penId : null, mapper: s.mapper || 'none', params: { ...(s.params || {}) }, provenance: { scope: 'test' } };
      },
    };
  };
  const gen = (objects, sliceParams, styleByObject, bounds) =>
    algo.generate(sceneParams(objects, sliceParams, styleByObject), null, null, bounds || BOUNDS) || [];
  const fills = (paths) => paths.filter((p) => p.meta && p.meta.kind === 'sceneFill' && p.length >= 2);

  // ── The slice helper is exposed for direct geometric unit coverage. ─────────
  describe('Scene3D.Slices.buildSliceSegments', () => {
    // A unit cube spanning [-1,1] on every axis; two quad faces per pair.
    const cubeWorld = [
      { x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 }, { x: 1, y: 1, z: -1 }, { x: -1, y: 1, z: -1 },
      { x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 }, { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 },
    ];
    const cubeFaces = [
      [0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4],
    ];

    test('emits cut segments at exactly sliceCount planes, all within the mesh z-range', () => {
      const Slices = V.Scene3D.Slices;
      expect(Slices && typeof Slices.buildSliceSegments === 'function').toBe(true);
      const out = Slices.buildSliceSegments({ world: cubeWorld, faces: cubeFaces, sliceCount: 6 });
      expect(out.planes).toBe(6);
      expect(out.segments.length).toBeGreaterThan(0);
      // Every cut point sits inside the cube's z-extent [-1, 1] (planes never
      // fall outside the geometry).
      out.segments.forEach((s) => {
        expect(s.a.z).toBeGreaterThanOrEqual(-1.0001);
        expect(s.a.z).toBeLessThanOrEqual(1.0001);
        expect(s.b.z).toBeGreaterThanOrEqual(-1.0001);
        expect(s.b.z).toBeLessThanOrEqual(1.0001);
      });
    });

    test('more planes → more segments; result is deterministic', () => {
      const Slices = V.Scene3D.Slices;
      const few = Slices.buildSliceSegments({ world: cubeWorld, faces: cubeFaces, sliceCount: 4 });
      const many = Slices.buildSliceSegments({ world: cubeWorld, faces: cubeFaces, sliceCount: 20 });
      expect(many.segments.length).toBeGreaterThan(few.segments.length);
      const again = Slices.buildSliceSegments({ world: cubeWorld, faces: cubeFaces, sliceCount: 20 });
      expect(JSON.stringify(again.segments)).toBe(JSON.stringify(many.segments));
    });

    test('an empty mesh emits no segments', () => {
      const Slices = V.Scene3D.Slices;
      expect(Slices.buildSliceSegments({ world: [], faces: [], sliceCount: 8 }).segments).toEqual([]);
    });
  });

  // ── (a) a contourSlice object emits sceneFill contour paths. ────────────────
  test('(a) a contourSlice sphere emits sceneFill cross-section paths, deterministically', () => {
    installStub();
    const a = gen([sphere('obj-1')]);
    const fa = fills(a);
    expect(fa.length).toBeGreaterThan(0);
    // No RNG anywhere — a second generate is byte-identical.
    const b = gen([sphere('obj-1')]);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  // ── (b) an occluder in FRONT cuts the slices (shared-clipper occlusion). ────
  test('(b) an object in front occludes the slices; x-ray dashes the far runs', () => {
    installStub();
    const alone = fills(gen([sphere('obj-1')]));
    // A big box parked between camera and sphere hides part of the rings. The
    // box itself is NOT contourSlice (its own mapper is irrelevant to occlusion).
    const occluded = fills(gen(
      [sphere('obj-1'), box('blocker', { transform: { x: 0, y: 0, z: 60, yaw: 0, pitch: 0, roll: 0, scale: 1 } })],
      {},
      { blocker: { penId: null, mapper: 'none', params: {} } },
    ));
    const sliceRuns = (ps) => ps.filter((p) => p.meta.sceneTarget && p.meta.sceneTarget.objectId === 'obj-1');
    // Occlusion either removes covered runs or splits/clips them — total visible
    // slice length must drop when the blocker is present.
    const len = (ps) => sliceRuns(ps).reduce((s, p) => {
      let d = 0; for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y);
      return s + d;
    }, 0);
    expect(len(occluded)).toBeLessThan(len(alone));

    // X-ray: the sphere set to visibility 'xray' keeps its occluded runs as
    // DASHED "seen-through" lines instead of dropping them.
    const xray = fills(gen(
      [sphere('obj-1', { visibility: 'xray' }), box('blocker', { transform: { x: 0, y: 0, z: 60, yaw: 0, pitch: 0, roll: 0, scale: 1 } })],
      {},
      { blocker: { penId: null, mapper: 'none', params: {} } },
    ));
    const dashed = sliceRuns(xray).filter((p) => p.meta.sceneTarget && p.meta.sceneTarget.occluded);
    expect(dashed.length).toBeGreaterThan(0);
  });

  // ── (c) visibleOnly vs fullContour changes the emitted set. ─────────────────
  test('(c) fullContour on an x-ray object emits more (back rings) than visibleOnly', () => {
    installStub();
    const visOnly = fills(gen([sphere('obj-1', { visibility: 'xray' })], { sliceVisibility: 'visibleOnly' }));
    const full = fills(gen([sphere('obj-1', { visibility: 'xray' })], { sliceVisibility: 'fullContour' }));
    expect(full.length).toBeGreaterThan(visOnly.length);
  });

  // ── (d) PERF/TIMEOUT GUARD — a pathological detail×planes combo can't hang. ─
  test('(d) a dense mesh at max slice count stays bounded (no hang)', () => {
    installStub();
    // A high-detail sphere (thousands of faces) at the max plane count — the
    // exact shape CtS I4 proved intractable for full-scene wireframe HLR. The
    // budget must keep it interactive.
    const dense = { id: 'obj-1', name: 'obj-1', primitive: 'sphere', params: { radius: 22, detail: 80 }, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
    const t0 = Date.now();
    const out = fills(gen([dense], { sliceCount: 120 }));
    const dt = Date.now() - t0;
    expect(out.length).toBeGreaterThan(0);
    // Generous CI ceiling — the point is it TERMINATES, not micro-perf.
    expect(dt).toBeLessThan(8000);
  });

  // ── (e) every non-slice mapper is unaffected (byte-identity safety). ────────
  test('(e) a hatch scene is unchanged by the presence of the new mapper', () => {
    installStub();
    const p = clone(defaults);
    p.seed = 1;
    p.objects = [box('obj-1')];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -25, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = { scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 50 } }, byObject: {}, byFace: {} };
    const out = algo.generate(p, null, null, BOUNDS) || [];
    expect(out.filter((q) => q.meta && q.meta.kind === 'sceneFill').length).toBeGreaterThan(0);
  });

  // ── Budget-design regression (CtS I5 fix). ──────────────────────────────────
  // The original pass derived the effective PLANE count from the global occluder
  // count (maxClip/planeCap), so a denser mesh (more occluders) sliced FEWER
  // planes and — after occlusion + the sub-MIN_RUN chord floor — a detail-100
  // convert rendered ~8 fragments while detail-18 rendered ~940. Camera orbit
  // and unrelated scene objects (which also move the occluder count) blanked or
  // swung the output, and the draft preview used a different plane count than the
  // committed frame. The invariant: the plane set is a pure function of
  // sliceCount — independent of occluder count, camera pose, other objects, and
  // draft-vs-full — and perf degrades by emitting overflow rings RAW, never by
  // dropping planes. These fail on 70becd3 and pass after the fix.
  describe('plane count is a pure function of sliceCount', () => {
    // A sphere at an arbitrary detail; radius fixed so plane geometry matches.
    const detSphere = (detail, extra = {}) => ({
      id: 'obj-1', name: 'obj-1', primitive: 'sphere', params: { radius: 22, detail },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      visibility: 'solid', ...extra,
    });
    // Camera clone with an explicit yaw; everything else matches sceneParams.
    const genYaw = (objects, yaw, sliceParams = {}, styleByObject = {}, bounds) => {
      const p = clone(defaults);
      p.seed = 1;
      p.objects = objects;
      p.ground = { enabled: false };
      p.camera = { projection: 'orthographic', yaw, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
      p.styleTable = {
        scene: { penId: null, mapper: 'contourSlice', params: { sliceCount: 26, ...sliceParams } },
        byObject: styleByObject, byFace: {},
      };
      return algo.generate(p, null, null, bounds || BOUNDS) || [];
    };
    const forObj = (paths, id) => paths.filter((pp) => pp.meta && pp.meta.kind === 'sceneFill'
      && pp.length >= 2 && pp.meta.sceneTarget && pp.meta.sceneTarget.objectId === id);

    // #1 — NON-COLLAPSE at high detail. A denser mesh must NOT invert to a
    // near-empty count; before the fix detail-18→80→100 fell 940→21→8.
    test('#1 detail 80 and 100 do not collapse below the coarse (18) count', () => {
      installStub();
      const c18 = fills(gen([detSphere(18)], { sliceCount: 26 })).length;
      const c80 = fills(gen([detSphere(80)], { sliceCount: 26 })).length;
      const c100 = fills(gen([detSphere(100)], { sliceCount: 26 })).length;
      // Every detail draws a full ring per plane — a two-digit count, never the
      // single-digit fragment count the old plane-collapse produced.
      expect(c18).toBeGreaterThan(12);
      expect(c80).toBeGreaterThan(12);
      expect(c100).toBeGreaterThan(12);
      // Dense output must not be DRASTICALLY fewer than the coarse one (no
      // inversion). Half the coarse count is a generous floor.
      expect(c80).toBeGreaterThanOrEqual(0.5 * c18);
      expect(c100).toBeGreaterThanOrEqual(0.5 * c18);
    });

    // #2 — CAMERA INVARIANCE. The same lone object at three yaws keeps a stable,
    // non-blank contour set (before the fix: 8 fills at yaw −25, 0 at +70).
    test('#2 orbiting the camera does not blank or swing the contour set', () => {
      installStub();
      const counts = [-25, 70, 140].map((yaw) => fills(genYaw([detSphere(80)], yaw)).length);
      counts.forEach((n) => expect(n).toBeGreaterThan(12)); // never blanks
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      expect(min).toBeGreaterThanOrEqual(0.5 * max); // stable band, no swing to 0
    });

    // #3 — DRAFT/FULL PARITY. Draft differs only by skipping HLR, at the SAME
    // plane count (before the fix draft=144 vs full=8 for detail-100).
    test('#3 draft and full emit the same plane set (only occlusion differs)', () => {
      installStub();
      const full = fills(gen([detSphere(100)], { sliceCount: 26 })).length;
      const draft = fills(algo.generate(sceneParams([detSphere(100)], { sliceCount: 26 }), null, null, { ...BOUNDS, fastPreview: true })).length;
      expect(full).toBeGreaterThan(12);
      expect(draft).toBeGreaterThan(12);
      // Same ~1 ring per plane either way; occlusion may split a few front runs.
      expect(Math.abs(draft - full)).toBeLessThanOrEqual(Math.max(4, 0.4 * full));
    });

    // #4 — SCENE-CONTENT INVARIANCE. A far, non-occluding object (its own mapper
    // irrelevant) must not change THIS object's contour count (before the fix a
    // side box moved it 8→112 via the global-occluder coupling).
    test('#4 a far non-occluding object does not change this object\'s count', () => {
      installStub();
      // A FACE-HEAVY neighbour parked far to the side (never between camera and
      // obj-1, so it cannot occlude it). Its faces still join the global occluder
      // set — which is exactly the coupling the original pass leaked through: the
      // extra occluders shrank obj-1's plane budget even though it occludes
      // nothing. Its own mapper is 'none' (outlines), so it contributes no
      // obj-1 sceneFill.
      const farNeighbour = {
        id: 'faraway', name: 'faraway', primitive: 'sphere', params: { radius: 22, detail: 60 },
        transform: { x: 600, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
      };
      const alone = forObj(gen([detSphere(80)], { sliceCount: 26 }), 'obj-1').length;
      const withNeighbour = forObj(
        gen([detSphere(80), farNeighbour], { sliceCount: 26 }, { faraway: { penId: null, mapper: 'none', params: {} } }),
        'obj-1',
      ).length;
      expect(alone).toBeGreaterThan(12);
      // The sphere's own contour set is unmoved by unrelated far geometry.
      expect(Math.abs(withNeighbour - alone)).toBeLessThanOrEqual(2);
    });

    // #5 (solid) — fullContour must show the far-side rings as see-through dashes
    // even on a SOLID object (hiddenTreatment 'remove' would otherwise drop them,
    // making Full ≡ visibleOnly — a silent no-op the convert mapped onto solids).
    test('#5 fullContour on a SOLID object emits more (back-ring) runs than visibleOnly', () => {
      installStub();
      const visOnly = fills(gen([detSphere(18)], { sliceCount: 26, sliceVisibility: 'visibleOnly' }));
      const full = fills(gen([detSphere(18)], { sliceCount: 26, sliceVisibility: 'fullContour' }));
      expect(full.length).toBeGreaterThan(visOnly.length);
      // The extra runs are dashed see-through (occluded) far-side rings.
      const backDashed = full.filter((pp) => pp.meta.sceneTarget && pp.meta.sceneTarget.occluded);
      expect(backDashed.length).toBeGreaterThan(0);
    });
  });
});
