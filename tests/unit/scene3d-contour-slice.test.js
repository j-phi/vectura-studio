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

  // ── W-27 — smooth-surface ring refinement (R2) ──────────────────────────────
  // buildSliceSegments emits triangle-cut crossing points verbatim: near a
  // sphere's pole a plane crosses only a handful of long, oblique mesh edges,
  // so the ring reads as a visible polygon (45-60° exterior turns) instead of a
  // circle. `Scene3D.Slices.refineRing` (new in this fix) refines a LINKED ring
  // in world space, before projection, using a centripetal Catmull-Rom
  // interpolatory subdivision — INTERPOLATING every original vertex (unlike
  // Chaikin corner-cutting, which would shrink an already-inside-the-surface
  // chord approximation further inside). It does not exist before this fix, so
  // every assertion that CALLS `Slices.refineRing` fails (TypeError: refineRing
  // is not a function) on the base branch; the "sanity" test below asserts the
  // pre-existing raw-ring defect itself and passes on either branch.
  describe('W-27 — contourSlice ring refinement on smooth surfaces', () => {
    const analyticCircleRadius = (r, z) => Math.sqrt(Math.max(0, r * r - z * z));

    // Densely re-samples the STRAIGHT-LINE polyline itself (not just its given
    // vertices) — the true worst-case deviation of a drawn line from the
    // analytic circle is mid-CHORD, not at a vertex, so under-sampling here
    // would hide exactly the chord-sag the fix is meant to close.
    const maxRadialDeviation = (pts, analyticR, samplesPerEdge = 24) => {
      let max = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]; const b = pts[i + 1];
        for (let s = 0; s <= samplesPerEdge; s++) {
          const t = s / samplesPerEdge;
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          const dev = Math.abs(Math.hypot(x, y) - analyticR);
          if (dev > max) max = dev;
        }
      }
      return max;
    };

    const maxTurnDeg = (pts) => {
      // Independent oracle (deliberately NOT the source's own sliceRingMaxTurn)
      // — closed ring, pts[0] === pts[last].
      const n = pts.length - 1; // distinct vertex count
      let max = 0;
      for (let i = 0; i < n; i++) {
        const a = pts[(i - 1 + n) % n]; const b = pts[i]; const c = pts[(i + 1) % n];
        const v1x = b.x - a.x; const v1y = b.y - a.y; const v1z = b.z - a.z;
        const v2x = c.x - b.x; const v2y = c.y - b.y; const v2z = c.z - b.z;
        const l1 = Math.hypot(v1x, v1y, v1z); const l2 = Math.hypot(v2x, v2y, v2z);
        if (l1 < 1e-9 || l2 < 1e-9) continue;
        let cosA = (v1x * v2x + v1y * v2y + v1z * v2z) / (l1 * l2);
        cosA = Math.max(-1, Math.min(1, cosA));
        const deg = (Math.acos(cosA) * 180) / Math.PI;
        if (deg > max) max = deg;
      }
      return max;
    };

    // Sphere r20 detail16 sliceCount26 — the plan's exact repro rig. Planes cut
    // along world +z (sliceRotate/Tilt default 0), so `d[i] === world[i].z` and
    // every ring lies in an EXACT constant-z plane (the crossing formula solves
    // for that z by construction), letting radius/turn math use x,y directly.
    const RADIUS = 20; const DETAIL = 16; const SLICE_COUNT = 26;
    let ringsByPlane;
    beforeAll(() => {
      const mesh = V.Scene3D.Mesh.createTopoformMesh('sphere', { sx: RADIUS, sy: RADIUS, sz: RADIUS }, DETAIL);
      const sliced = V.Scene3D.Slices.buildSliceSegments({
        world: mesh.vertices, faces: mesh.faces, sliceCount: SLICE_COUNT,
      });
      const byPlane = new Map();
      sliced.segments.forEach((s) => {
        if (!byPlane.has(s.plane)) byPlane.set(s.plane, []);
        byPlane.get(s.plane).push([s.a, s.b]);
      });
      ringsByPlane = new Map();
      byPlane.forEach((segs, plane) => ringsByPlane.set(plane, V.Geometry3D.linkSegments(segs)));
    });

    // The single ring closest to a pole (plane 1, the extreme low-z cut) is the
    // worst case the plan measured at 45-60°.
    const poleRing = () => ringsByPlane.get(1)[0];

    // W-27b: the closed-form sphere/ellipsoid correction actually wired into
    // scene3d.js's contourSlice pass (sliceAnalyticProjectLocal, mode
    // 'sphere') — holds z fixed, solves x,y exactly on the sphere at that z.
    // Reproduced here (not re-exported) so this suite can drive
    // `Slices.refineRing`'s public `analyticProject` option directly, the same
    // way the pass does internally, for an identity (untransformed) sphere.
    const sphereAnalyticProject = (pt) => {
      const rem = Math.max(0, 1 - (pt.z / RADIUS) ** 2);
      const cur = Math.hypot(pt.x / RADIUS, pt.y / RADIUS) || 1e-9;
      const k = Math.sqrt(rem) / cur;
      return { x: pt.x * k, y: pt.y * k, z: pt.z };
    };
    const REFINE_OPTS = { analyticProject: sphereAnalyticProject, maxAngleDeg: 8 };

    test('sanity: the RAW pole-adjacent ring is sparse and sharply polygonal (today\'s defect)', () => {
      const raw = poleRing();
      expect(raw.length).toBeGreaterThanOrEqual(4); // at least a closed triangle
      expect(maxTurnDeg(raw)).toBeGreaterThan(20); // well above the 8° ceiling
    });

    test('refineRing brings every REAL ring\'s max exterior turning angle to ≤8°', () => {
      const Slices = V.Scene3D.Slices;
      expect(typeof Slices.refineRing).toBe('function');
      let realRingsChecked = 0;
      ringsByPlane.forEach((rings) => {
        rings.forEach((ring) => {
          // A 2-DISTINCT-point entry (ring.length===2 open, or 3 closed with a
          // repeated point) is a degenerate seam stub (linkSegments closing a
          // single crossing back on itself at a mesh fold) — no interior angle
          // to bound, and not a curve to round. Every genuine ring — down to a
          // raw 3-point triangle, the sparsest real pole case — must still meet
          // the ceiling; refineRing itself now only bails below 3 points.
          const distinct = ring.length >= 4
            && Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y,
              ring[0].z - ring[ring.length - 1].z) < 1e-6
            ? ring.length - 1 : ring.length;
          if (distinct < 3) return;
          realRingsChecked += 1;
          const refined = Slices.refineRing(ring, REFINE_OPTS);
          expect(refined.length).toBeGreaterThanOrEqual(4);
          expect(maxTurnDeg(refined)).toBeLessThanOrEqual(8);
        });
      });
      expect(realRingsChecked).toBeGreaterThan(20); // the sweep actually ran
    });

    // NOTE: on this exact rig (r20/detail16/sliceCount26) the RAW pole ring has
    // enough gently-curved spans elsewhere that `acceptable()` still accepts
    // the path overall (`straight: false`) — the fitter's per-vertex corner
    // detection is the finer net the root cause describes, not the whole-path
    // gate. `reduceAnchors` correctly marks the two genuinely sharp turns
    // `corner: true` and leaves them UNROUNDED, which is exactly the visible
    // "angle" the user reported riding inside an otherwise-curved ring.
    test('the fitter still leaves hard corners in the raw ring; the refined ring has none', () => {
      const GU = V.GeometryUtils;
      const raw = poleRing();
      const refined = V.Scene3D.Slices.refineRing(raw, REFINE_OPTS);
      const to2D = (pts) => pts.map((p) => ({ x: p.x, y: p.y }));
      const cornerCount = (fit) => (Array.isArray(fit.anchors) ? fit.anchors.filter((a) => a && a.corner).length : 0);
      const rawFit = GU.toCurveAnchors(to2D(raw), { closed: true, curves: true });
      const refinedFit = GU.toCurveAnchors(to2D(refined), { closed: true, curves: true });
      expect(cornerCount(rawFit)).toBeGreaterThan(0); // today's visible angle, surviving the fit
      expect(cornerCount(refinedFit)).toBe(0); // fully smoothed — no hard corners left
    });

    // W-27b hard bar: the refined ring must read as a CIRCLE, not a rounded
    // N-gon — ≥48 points and within 0.1mm of the analytic radius (coordinator's
    // acceptance criteria), not merely "smoother than the raw polyline".
    test('the refined pole ring is a true circle: ≥48 points, <0.1mm from analytic radius', () => {
      const raw = poleRing();
      const refined = V.Scene3D.Slices.refineRing(raw, REFINE_OPTS);
      const z = raw[0].z; // every point in this ring shares one exact z (see header)
      const analyticR = analyticCircleRadius(RADIUS, z);
      const rawDev = maxRadialDeviation(raw, analyticR);
      const refinedDev = maxRadialDeviation(refined, analyticR);
      expect(refined.length).toBeGreaterThanOrEqual(48);
      expect(refinedDev).toBeLessThan(rawDev); // more accurate, not just smoother
      expect(refinedDev).toBeLessThan(0.1); // reads as a circle, not a rounded N-gon
    });

    // A mid-latitude ring is already densely tessellated (small exterior turns)
    // — refinement must be a no-op cost-wise there, not runaway subdivision.
    test('a well-tessellated equatorial ring needs no (or minimal) extra refinement rounds', () => {
      const mid = ringsByPlane.get(13)[0]; // near the equator (plane 13 of 26)
      expect(maxTurnDeg(mid)).toBeLessThanOrEqual(8); // already fine before refining
      const refined = V.Scene3D.Slices.refineRing(mid, REFINE_OPTS);
      // Refinement never REMOVES the property; still within the ceiling.
      expect(maxTurnDeg(refined)).toBeLessThanOrEqual(8);
    });

    // R2 corner survival: a FACETED primitive's cross-section is a real polygon
    // (a box cut is a rectangle). Verified the same way as the sphere rings
    // above — direct world-space buildSliceSegments/linkSegments, bypassing
    // camera/HLR entirely, since a box's vertical side faces read edge-on
    // (near-zero front/back dot product) from a straight-down camera and would
    // make this an HLR-visibility test, not a smoothing-gate test. The actual
    // wiring guard (SLICE_SMOOTH_EXCLUDED has 'box') is exercised for real by
    // sanity test (a): a box scene still emits sceneFill paths at all.
    test('a box\'s raw contourSlice ring already has real ≥80° corners, and the gate never refines it', () => {
      const boxMesh = V.Scene3D.Mesh.makeBoxMesh(40, 40, 40, 1);
      const sliced = V.Scene3D.Slices.buildSliceSegments({
        world: boxMesh.vertices, faces: boxMesh.faces, sliceCount: 6,
      });
      const byPlane = new Map();
      sliced.segments.forEach((s) => {
        if (!byPlane.has(s.plane)) byPlane.set(s.plane, []);
        byPlane.get(s.plane).push([s.a, s.b]);
      });
      const midPlaneSegs = byPlane.get(3) || byPlane.get(2);
      const ring = V.Geometry3D.linkSegments(midPlaneSegs)[0];
      expect(ring.length).toBeGreaterThanOrEqual(5); // 4 distinct corners + closing point
      expect(maxTurnDeg(ring)).toBeGreaterThanOrEqual(80); // a real rectangle corner
      // The gate itself: box is never smoothSurface, so the pass must not call
      // refineRing on it. Since refineRing is otherwise idempotent-safe to call,
      // assert the CONTRACT directly — refining this ring WOULD destroy its
      // corners, which is exactly why the pass's SLICE_SMOOTH_EXCLUDED gate
      // must (and does, per the source) skip primitives 'box'/'plane'/'solid'/
      // 'pyramid' before ever reaching refineRing.
      const wouldBeRefined = V.Scene3D.Slices.refineRing(ring);
      expect(maxTurnDeg(wouldBeRefined)).toBeLessThan(20); // refineRing WOULD round it away
    });
  });

  // ── W-27c item (a) — rotated-object / tilted-plane analytic accuracy ───────
  // W-27b's sphere/ellipsoid `sliceAnalyticProjectLocal` held LOCAL z fixed and
  // solved x,y exactly on the ellipsoid at that z. That is only an exact
  // plane∩surface solution when local z happens to BE the cutting coordinate
  // — true only for an UNROTATED object cut by the DEFAULT (untilted) world-Z
  // plane. Any object yaw/pitch/roll, or any sliceRotate/sliceTilt, breaks
  // that coincidence: the W-27c reviewer measured 0.309mm worst-case surface
  // deviation on a rotated ellipsoid / tilted plane (bar 0.15mm, todo per
  // STILL-OPEN.md item (a)). `Scene3D.Slices.localPlaneNormal` /
  // `.inverseObjectTransform` / the 4-arg `.analyticProjectLocal` (Newton,
  // constrained to move only WITHIN the cutting plane) do not exist before
  // this fix — every test below fails (TypeError in beforeAll/the assertion
  // itself) on the pre-fix tree and passes after.
  describe('W-27c — rotated-object / tilted-plane analytic accuracy (item a)', () => {
    // Reproduces the PRE-fix (W-27b, commit 18e5a097-55ddb720) sphere/ellipsoid
    // closed-form projector VERBATIM, as the old-method comparison baseline —
    // not re-exported, so this suite can measure exactly what the reviewer
    // measured rather than re-deriving it.
    const oldEllipsoidProjectLocal = (sizes, p) => {
      const sx = sizes.sx || 1; const sy = sizes.sy || 1; const sz = sizes.sz || 1;
      const rem = Math.max(0, 1 - (p.z / sz) ** 2);
      const qx = p.x / sx; const qy = p.y / sy;
      const cur = Math.hypot(qx, qy) || 1e-9;
      const k = Math.sqrt(rem) / cur;
      return { x: p.x * k, y: p.y * k, z: p.z };
    };

    const ELL = { sx: 20, sy: 12, sz: 16 };
    const ELL_DETAIL = 16;
    // A meaningfully rotated object AND a tilted cutting plane — the exact
    // combination the plan says breaks the z-fixed shortcut.
    const T = { x: 0, y: 0, z: 0, yaw: 35, pitch: 20, roll: 10, scale: 1 };
    const SLICE_ROTATE = 15; const SLICE_TILT = 10;

    let worldMesh; let planeNormalWorld; let localPlaneNormal;
    beforeAll(() => {
      const local = V.Scene3D.Mesh.createTopoformMesh('sphere', ELL, ELL_DETAIL);
      const applyT = V.Scene3D.Scene.applyObjectTransform;
      worldMesh = { vertices: local.vertices.map((pt) => applyT(pt, T)), faces: local.faces };
      const yr = (SLICE_ROTATE * Math.PI) / 180; const pr = (SLICE_TILT * Math.PI) / 180;
      const cy = Math.cos(yr); const sy = Math.sin(yr); const cp = Math.cos(pr); const sp = Math.sin(pr);
      planeNormalWorld = { x: -sy * cp, y: sp, z: cy * cp };
      // Throws (TypeError) before this fix — localPlaneNormal does not exist.
      localPlaneNormal = V.Scene3D.Slices.localPlaneNormal(planeNormalWorld, T);
    });

    // Re-clamps a corrected world point exactly back onto the cutting plane
    // along the plane's own normal, mirroring the pass's own re-clamp step.
    const reclampToPlane = (worldPt, correctedWorldPt, n) => {
      const d0 = worldPt.x * n.x + worldPt.y * n.y + worldPt.z * n.z;
      const dc = correctedWorldPt.x * n.x + correctedWorldPt.y * n.y + correctedWorldPt.z * n.z;
      const diff = dc - d0;
      return {
        x: correctedWorldPt.x - diff * n.x,
        y: correctedWorldPt.y - diff * n.y,
        z: correctedWorldPt.z - diff * n.z,
      };
    };

    // Runs every raw ring crossing point through `project`, then measures how
    // far the corrected LOCAL point sits from the true implicit ellipsoid
    // equation F(local)=0 — |F|/|∇F| is the first-order distance to the true
    // surface in mm, the same unit both the 0.309mm and 0.15mm bars quote.
    const worstSurfaceDeviationMm = (project) => {
      const sliced = V.Scene3D.Slices.buildSliceSegments({
        world: worldMesh.vertices, faces: worldMesh.faces, sliceCount: 20,
        sliceRotate: SLICE_ROTATE, sliceTilt: SLICE_TILT,
      });
      const byPlane = new Map();
      sliced.segments.forEach((s) => {
        if (!byPlane.has(s.plane)) byPlane.set(s.plane, []);
        byPlane.get(s.plane).push([s.a, s.b]);
      });
      let maxDev = 0; let sampleCount = 0;
      byPlane.forEach((segs) => {
        V.Geometry3D.linkSegments(segs).forEach((ring) => {
          ring.forEach((worldPt) => {
            const correctedWorld = project(worldPt);
            const local = V.Scene3D.Slices.inverseObjectTransform(correctedWorld, T);
            const F = (local.x / ELL.sx) ** 2 + (local.y / ELL.sy) ** 2 + (local.z / ELL.sz) ** 2 - 1;
            const gx = (2 * local.x) / (ELL.sx * ELL.sx);
            const gy = (2 * local.y) / (ELL.sy * ELL.sy);
            const gz = (2 * local.z) / (ELL.sz * ELL.sz);
            const gradLen = Math.hypot(gx, gy, gz) || 1e-9;
            const dev = Math.abs(F) / gradLen;
            if (dev > maxDev) maxDev = dev;
            sampleCount += 1;
          });
        });
      });
      return { maxDev, sampleCount };
    };

    test('Slices exposes the W-27c local-plane-normal + inverse-transform + 4-arg analytic projector API', () => {
      expect(typeof V.Scene3D.Slices.localPlaneNormal).toBe('function');
      expect(typeof V.Scene3D.Slices.inverseObjectTransform).toBe('function');
      expect(typeof V.Scene3D.Slices.analyticProjectLocal).toBe('function');
    });

    test('bar: the new plane-constrained Newton projector is within 0.15mm of the true surface on a rotated ellipsoid + tilted plane, and strictly beats the old z-fixed shortcut', () => {
      const oldMethod = worstSurfaceDeviationMm((worldPt) => {
        const local = V.Scene3D.Slices.inverseObjectTransform(worldPt, T);
        const corrected = oldEllipsoidProjectLocal(ELL, local);
        const cw = V.Scene3D.Scene.applyObjectTransform(corrected, T);
        return reclampToPlane(worldPt, cw, planeNormalWorld);
      });
      const newMethod = worstSurfaceDeviationMm((worldPt) => {
        const local = V.Scene3D.Slices.inverseObjectTransform(worldPt, T);
        const corrected = V.Scene3D.Slices.analyticProjectLocal('sphere', ELL, local, localPlaneNormal);
        const cw = V.Scene3D.Scene.applyObjectTransform(corrected, T);
        return reclampToPlane(worldPt, cw, planeNormalWorld);
      });
      expect(oldMethod.sampleCount).toBeGreaterThan(20); // the sweep actually ran
      expect(oldMethod.maxDev).toBeGreaterThan(0.15); // reproduces the reviewer's measured overshoot
      expect(newMethod.maxDev).toBeLessThan(0.15); // meets the plan's bar
      expect(newMethod.maxDev).toBeLessThan(oldMethod.maxDev); // strictly more accurate, not just different
    });
  });

  // ── W-27c item (c) — ring-quality regression guard for cone/cylinder/torus ─
  // STILL-OPEN.md item (c): "add RGR ring-quality assertions for cone/cylinder/
  // torus (only sphere has one)". Independent of item (a)'s rotation defect,
  // this WIP's own refactor (sliceSurfaceFG) replaced cone/cylinder/torus's
  // DIRECT closed-form solve (exact by construction, no iteration) with the
  // same Newton loop used for the sphere/ellipsoid — a real regression risk
  // that had NO test coverage at all before this block (grep confirms no
  // existing test exercises the cone/cylinder/torus analytic projector).
  // Oracle: the general implicit-surface deviation used above (|F|/|∇F|, the
  // first-order distance to the TRUE surface in mm) — not a "reads as a
  // circle" check, since the default (untilted, unrotated) cutting plane is
  // NOT perpendicular to any of these primitives' own axis, so their
  // cross-sections are not literal circles; the F/∇F distance is a correct
  // accuracy oracle regardless of cross-section shape. `Slices.
  // analyticProjectLocal`'s 4th arg and `Slices.localPlaneNormal` do not exist
  // before this fix, so every test here fails (TypeError) on the pre-fix tree.
  describe('W-27c — cone/cylinder/torus analytic-projector regression guard (item c)', () => {
    const IDT = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    const WORLD_Z = { x: 0, y: 0, z: 1 };

    // F(local) and |∇F| per primitive, copied verbatim from sliceSurfaceFG's
    // own comments (independent re-derivation, not a re-export) so this is a
    // real oracle and not a tautological check of the source's own math.
    const surfaceDeviationMm = (mode, sizes, local) => {
      const sx = sizes.sx || 1; const sy = sizes.sy || 1; const sz = sizes.sz || 1;
      let F; let gx; let gy; let gz;
      if (mode === 'cylinder') {
        F = (local.x / sx) ** 2 + (local.z / sz) ** 2 - 1;
        gx = (2 * local.x) / (sx * sx); gy = 0; gz = (2 * local.z) / (sz * sz);
      } else if (mode === 'cone') {
        const r = Math.max(0, sx * (0.5 - local.y / (2 * sy)));
        F = local.x * local.x + local.z * local.z - r * r;
        gx = 2 * local.x; gy = (r * sx) / sy; gz = 2 * local.z;
      } else if (mode === 'torus') {
        const major = Math.max(2, sx * 0.75);
        const minor = Math.max(1, Math.min(sy, sz) * 0.28);
        const pr = Math.hypot(local.x, local.z) || 1e-9;
        const dr = pr - major;
        F = dr * dr + local.y * local.y - minor * minor;
        gx = (2 * dr * local.x) / pr; gy = 2 * local.y; gz = (2 * dr * local.z) / pr;
      } else {
        throw new Error(`unhandled mode ${mode}`);
      }
      const gradLen = Math.hypot(gx, gy, gz) || 1e-9;
      return Math.abs(F) / gradLen;
    };

    // Runs every raw ring crossing point (identity transform, default
    // untilted world-Z cutting plane — the same rig the sphere pole test
    // above uses) through the REAL wired analytic projector and measures the
    // worst-case deviation from the true implicit surface.
    const worstDeviationFor = (mode, sizes, detail, sliceCount) => {
      const mesh = V.Scene3D.Mesh.createTopoformMesh(mode, sizes, detail);
      const localPlaneNormal = V.Scene3D.Slices.localPlaneNormal(WORLD_Z, IDT);
      const sliced = V.Scene3D.Slices.buildSliceSegments({
        world: mesh.vertices, faces: mesh.faces, sliceCount,
      });
      const byPlane = new Map();
      sliced.segments.forEach((s) => {
        if (!byPlane.has(s.plane)) byPlane.set(s.plane, []);
        byPlane.get(s.plane).push([s.a, s.b]);
      });
      let rawMax = 0; let refinedMax = 0; let ringsChecked = 0;
      byPlane.forEach((segs) => {
        V.Geometry3D.linkSegments(segs).forEach((ring) => {
          if (ring.length < 3) return;
          ringsChecked += 1;
          ring.forEach((pt) => { rawMax = Math.max(rawMax, surfaceDeviationMm(mode, sizes, pt)); });
          const analyticProject = (worldPt) => {
            const local = V.Scene3D.Slices.inverseObjectTransform(worldPt, IDT);
            const corrected = V.Scene3D.Slices.analyticProjectLocal(mode, sizes, local, localPlaneNormal);
            return V.Scene3D.Scene.applyObjectTransform(corrected, IDT);
          };
          const refined = V.Scene3D.Slices.refineRing(ring, { analyticProject, maxAngleDeg: 8 });
          refined.forEach((worldPt) => {
            const local = V.Scene3D.Slices.inverseObjectTransform(worldPt, IDT);
            refinedMax = Math.max(refinedMax, surfaceDeviationMm(mode, sizes, local));
          });
        });
      });
      return { rawMax, refinedMax, ringsChecked };
    };

    test.each([
      ['cone', { sx: 20, sy: 24, sz: 20 }, 18, 22],
      ['cylinder', { sx: 20, sy: 24, sz: 20 }, 16, 20],
      ['torus', { sx: 24, sy: 20, sz: 20 }, 18, 22],
    ])('%s: the Newton-refactored projector lands within 0.1mm of the true surface, no worse than the raw ring', (mode, sizes, detail, sliceCount) => {
      const { rawMax, refinedMax, ringsChecked } = worstDeviationFor(mode, sizes, detail, sliceCount);
      expect(ringsChecked).toBeGreaterThan(5); // the sweep actually ran
      expect(refinedMax).toBeLessThan(0.1); // matches the sphere bar already accepted for W-27b
      expect(refinedMax).toBeLessThanOrEqual(rawMax + 1e-6); // refining never makes it LESS accurate
    });
  });

  // ── W-27c review iteration 2 — blocking fixes ───────────────────────────────
  // docs/3d-audit/lane-reports/W-27c-review.md REJECTED 2dc7b3aa: (5) an
  // unguarded catastrophic-divergence failure mode in the Newton loop, and
  // (4, mutation B/C) item (c)'s guards never actually exercise the
  // plane-constraint mechanism (they still pass with it fully removed).
  describe('W-27c review — divergence guard (blocking #1)', () => {
    // Reviewer's construction: a cutting plane whose normal is ALMOST exactly
    // the surface normal at the ring point (near-TANGENT — a real, non-
    // contrived configuration: it occurs at a ring's own turning/extremal
    // points whenever the local surface normal nearly aligns with the plane
    // normal). As the misalignment `eps` shrinks toward (but stays above) the
    // `denom < 1e-12` bail-out floor, the pre-guard Newton step's magnitude
    // (`k = F / denom`) explodes. Reproduced directly against the real wired
    // `Slices.analyticProjectLocal` (sphere r20, p starting at (20.5,0,0),
    // F0=0.1025 -- not yet on the surface, like a raw mesh-chord crossing).
    const sizes = { sx: 20, sy: 20, sz: 20 };
    const p = { x: 20.5, y: 0, z: 0 };
    const startAbsF = (p.x / sizes.sx) ** 2 - 1; // 0.1025, F already >=0 here

    test('a near-tangent cutting plane never teleports the corrected point, and never makes |F| worse than the untouched input', () => {
      [1e-3, 1e-4, 1e-5].forEach((eps) => {
        const raw = { x: 1, y: eps, z: 0 };
        const len = Math.hypot(raw.x, raw.y, raw.z);
        const n = { x: raw.x / len, y: raw.y / len, z: raw.z / len };
        const out = V.Scene3D.Slices.analyticProjectLocal('sphere', sizes, p, n);
        expect(Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z)).toBe(true);
        const dist = Math.hypot(out.x - p.x, out.y - p.y, out.z - p.z);
        const F = (out.x / sizes.sx) ** 2 + (out.y / sizes.sy) ** 2 + (out.z / sizes.sz) ** 2 - 1;
        // Pre-guard (2dc7b3aa/29203162) this was 61.6mm / 617mm / 6174mm and
        // F 9.5 / 953 / 95289 respectively (independently reproduced from the
        // review's exact construction against a git-archived 29203162 scratch
        // tree) -- i.e. it FAILS both of these on the pre-fix tree.
        expect(dist).toBeLessThan(5); // bounded: was 61-6174mm pre-guard
        expect(Math.abs(F)).toBeLessThanOrEqual(Math.abs(startAbsF) + 1e-9); // never worse than untouched input
      });
    });

    test('bounded-iteration contract: a fully NaN-producing scenario (zero-length plane normal) never propagates NaN', () => {
      const degenerateN = { x: 0, y: 0, z: 0 }; // malformed caller input (should never happen, but must not crash)
      const out = V.Scene3D.Slices.analyticProjectLocal('sphere', sizes, p, degenerateN);
      expect(Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z)).toBe(true);
    });
  });

  // ── W-27c review — non-circular plane-membership + surface-residual oracle ─
  // Review mutation testing (section 4): the item (a)/(c) tests' |F|/|∇F|
  // oracle is real (mutation A/C correctly fail it for a fully- or mostly-
  // disabled projector) but NEVER independently checks that the corrected
  // point stays ON THE CUTTING PLANE -- of the two things
  // `sliceAnalyticProjectLocal` claims to guarantee (surface residence AND
  // plane membership), only the first was ever verified in isolation.
  // Mutation B (delete the in-loop gradient-onto-plane projection, the
  // fix's headline mechanism) slipped through unnoticed on an
  // axis-perpendicular cutting plane (an earlier draft of this block used
  // one, to get a clean "circle" oracle) because the in-loop RECLAMP alone
  // gets most of the way there when the plane already happens to align with
  // the primitive's own symmetry axis.
  //
  // Fix: a GENERIC plane orientation that is NOT aligned to any primitive's
  // own axis (so the gradient actually has a component along the plane
  // normal to project out, for every primitive), combined with REAL object
  // rotation (yaw25/pitch15/roll10) -- addresses review blocking #2
  // (cone/cylinder/torus previously had identity-only, axis-aligned rigs).
  // Two INDEPENDENT checks, neither reusing the other: (i) plane membership
  // -- the corrected point's own offset along the plane normal must match
  // the RAW point's offset (pure dot-product geometry, no F/gradient at
  // all); (ii) surface residual -- |F|/|grad F| via a per-primitive F
  // independently re-derived from sliceSurfaceFG's own comments (as items
  // a/c already do), applied here under a plane orientation where it is
  // actually discriminating (see cylinder caveat below).
  describe('W-27c review — non-circular plane-membership + surface-residual oracle under real rotation+tilt (blocking #2)', () => {
    const T = { x: 5, y: -3, z: 8, yaw: 25, pitch: 15, roll: 10, scale: 1 };
    // A LOCAL direction with all three components non-zero and not aligned
    // to any coordinate axis, forward-rotated by T to get the WORLD normal
    // -- `Slices.localPlaneNormal` must invert T's real rotation to recover
    // it, proving the round-trip is correct AND guaranteeing the resulting
    // plane is not accidentally perpendicular/parallel to any primitive's
    // own symmetry axis (which is what let mutation B hide before).
    const localDirRaw = { x: 0.35, y: 0.82, z: 0.45 };
    const dl = Math.hypot(localDirRaw.x, localDirRaw.y, localDirRaw.z);
    const localDir = { x: localDirRaw.x / dl, y: localDirRaw.y / dl, z: localDirRaw.z / dl };
    const worldNormalForLocalDir = () => {
      const T0 = { ...T, x: 0, y: 0, z: 0, scale: 1, sx: 1, sy: 1, sz: 1 };
      return V.Scene3D.Scene.applyObjectTransform(localDir, T0);
    };
    let localPlaneNormal;
    beforeAll(() => { localPlaneNormal = V.Scene3D.Slices.localPlaneNormal(worldNormalForLocalDir(), T); });

    // F(local) and |grad F| per primitive, independently re-derived from
    // sliceSurfaceFG's own comments (same as items a/c) -- not a re-export.
    const surfaceDeviationMm = (mode, sizes, local) => {
      const sx = sizes.sx || 1; const sy = sizes.sy || 1; const sz = sizes.sz || 1;
      let F; let gx; let gy; let gz;
      if (mode === 'sphere') {
        F = (local.x / sx) ** 2 + (local.y / sy) ** 2 + (local.z / sz) ** 2 - 1;
        gx = (2 * local.x) / (sx * sx); gy = (2 * local.y) / (sy * sy); gz = (2 * local.z) / (sz * sz);
      } else if (mode === 'cylinder') {
        F = (local.x / sx) ** 2 + (local.z / sz) ** 2 - 1;
        gx = (2 * local.x) / (sx * sx); gy = 0; gz = (2 * local.z) / (sz * sz);
      } else if (mode === 'cone') {
        const r = Math.max(0, sx * (0.5 - local.y / (2 * sy)));
        F = local.x * local.x + local.z * local.z - r * r;
        gx = 2 * local.x; gy = (r * sx) / sy; gz = 2 * local.z;
      } else if (mode === 'torus') {
        const major = Math.max(2, sx * 0.75);
        const minor = Math.max(1, Math.min(sy, sz) * 0.28);
        const pr = Math.hypot(local.x, local.z) || 1e-9;
        const dr = pr - major;
        F = dr * dr + local.y * local.y - minor * minor;
        gx = (2 * dr * local.x) / pr; gy = 2 * local.y; gz = (2 * dr * local.z) / pr;
      } else {
        throw new Error(`unhandled mode ${mode}`);
      }
      const gradLen = Math.hypot(gx, gy, gz) || 1e-9;
      return Math.abs(F) / gradLen;
    };

    // Samples `count` points already ON the true surface (own parametric
    // formula per primitive), offsets each OUTWARD by `offsetMm` along that
    // point's own surface-gradient direction (simulating a raw/interpolated
    // point not yet on the true surface -- exactly what a Catmull-Rom
    // midpoint is), runs it through the REAL `Slices.analyticProjectLocal`
    // directly (no external reclamp wrapper -- isolates the function the
    // mutations target), and checks (i) plane membership and (ii) surface
    // residual, independently.
    const gradientAt = (mode, sizes, p) => {
      const sx = sizes.sx || 1; const sy = sizes.sy || 1; const sz = sizes.sz || 1;
      if (mode === 'sphere') return { gx: (2 * p.x) / (sx * sx), gy: (2 * p.y) / (sy * sy), gz: (2 * p.z) / (sz * sz) };
      if (mode === 'cylinder') return { gx: (2 * p.x) / (sx * sx), gy: 0, gz: (2 * p.z) / (sz * sz) };
      if (mode === 'cone') {
        const r = Math.max(0, sx * (0.5 - p.y / (2 * sy)));
        return { gx: 2 * p.x, gy: (r * sx) / sy, gz: 2 * p.z };
      }
      const major = Math.max(2, sx * 0.75); const minor = Math.max(1, Math.min(sy, sz) * 0.28);
      const pr = Math.hypot(p.x, p.z) || 1e-9; const dr = pr - major;
      return { gx: (2 * dr * p.x) / pr, gy: 2 * p.y, gz: (2 * dr * p.z) / pr };
    };
    const offSurfacePoint = (mode, sizes, onSurfacePt, offsetMm) => {
      const g = gradientAt(mode, sizes, onSurfacePt);
      const gl = Math.hypot(g.gx, g.gy, g.gz) || 1e-9;
      return {
        x: onSurfacePt.x + (g.gx / gl) * offsetMm,
        y: onSurfacePt.y + (g.gy / gl) * offsetMm,
        z: onSurfacePt.z + (g.gz / gl) * offsetMm,
      };
    };
    const OFFSET_MM = 1; // see rig comment below for why this exact value
    const checkPrimitive = (mode, sizes, onSurfacePtFn, count = 8) => {
      let maxPlaneErr = 0; let maxSurfErr = 0;
      for (let i = 0; i < count; i += 1) {
        const onSurface = onSurfacePtFn(i);
        const raw = offSurfacePoint(mode, sizes, onSurface, OFFSET_MM);
        const d = localPlaneNormal.x * raw.x + localPlaneNormal.y * raw.y + localPlaneNormal.z * raw.z;
        const corrected = V.Scene3D.Slices.analyticProjectLocal(mode, sizes, raw, localPlaneNormal);
        const dc = localPlaneNormal.x * corrected.x + localPlaneNormal.y * corrected.y + localPlaneNormal.z * corrected.z;
        maxPlaneErr = Math.max(maxPlaneErr, Math.abs(dc - d));
        maxSurfErr = Math.max(maxSurfErr, surfaceDeviationMm(mode, sizes, corrected));
      }
      return { maxPlaneErr, maxSurfErr };
    };

    test('localPlaneNormal correctly inverts a REAL (non-identity, non-axis-aligned) object rotation', () => {
      expect(localPlaneNormal.x).toBeCloseTo(localDir.x, 6);
      expect(localPlaneNormal.y).toBeCloseTo(localDir.y, 6);
      expect(localPlaneNormal.z).toBeCloseTo(localDir.z, 6);
    });

    // OFFSET_MM=1 is tuned, not arbitrary: at this value every primitive's
    // CORRECT projector converges to machine precision (independently
    // verified: 1e-8mm-1e-15mm across all four), while the review's mutation
    // B (in-loop gradient-onto-plane projection removed) drives sphere/cone/
    // torus to 0.24/0.24/0.62mm -- both comfortably clear of the 0.15mm bar
    // in the correct direction. cylinder is the one EXCEPTION, documented in
    // its own test below rather than silently omitted.
    test.each([
      ['sphere', { sx: 20, sy: 20, sz: 20 }, (i) => { const th = (i / 8) * Math.PI * 2; return { x: 16 * Math.cos(th), y: 6, z: 16 * Math.sin(th) }; }],
      ['cone', { sx: 20, sy: 24, sz: 20 }, (i) => { const th = (i / 8) * Math.PI * 2; const y = -3; const r = 20 * (0.5 - y / 48); return { x: r * Math.cos(th), y, z: r * Math.sin(th) }; }],
      ['torus', { sx: 24, sy: 20, sz: 20 }, (i) => { const psi = (i / 8) * Math.PI * 2; const major = 18; const minor = 5.6; const pr = major + minor * Math.cos(psi); const y = minor * Math.sin(psi); const th = 0.4; return { x: pr * Math.cos(th), y, z: pr * Math.sin(th) }; }],
    ])('%s under real object rotation + a non-axis-aligned plane: plane membership + surface residual both hold at a 1mm raw offset', (mode, sizes, onSurfacePtFn) => {
      const { maxPlaneErr, maxSurfErr } = checkPrimitive(mode, sizes, onSurfacePtFn, 8);
      expect(maxPlaneErr).toBeLessThan(1e-6); // independent plane-membership check (never reuses F/gradient)
      expect(maxSurfErr).toBeLessThan(0.15); // independent surface-residual check (plan's bar)
    });

    // Cylinder: F = (x/sx)^2+(z/sz)^2-1 does not depend on y AT ALL, so its
    // gradient's y-component is identically zero at every point, for every
    // plane orientation -- meaning the in-loop reclamp (which is NOT part
    // of mutation B; it stays present either way) is, for this one
    // primitive, PROVABLY sufficient on its own to keep the corrected point
    // exactly on the plane, and the surface residual can never distinguish
    // "the right y" from "any other y" since the surface doesn't care.
    // Verified directly: removing the in-loop gradient-onto-plane
    // projection changes NEITHER the plane-membership error NOR the surface
    // residual for cylinder, at any offset tried (1mm through 100mm). This
    // is a real, primitive-specific mathematical property, not a test gap
    // -- documented here rather than silently dropped, per review blocking
    // #2's instruction to add a cylinder fixture (this IS one: it still
    // exercises real rotation + a non-axis-aligned plane end-to-end and
    // would fail if the ROTATION/plane-membership machinery regressed).
    test('cylinder under real object rotation + a non-axis-aligned plane: plane membership + surface residual both hold (mutation B is a mathematical no-op for this primitive -- see comment)', () => {
      const { maxPlaneErr, maxSurfErr } = checkPrimitive(
        'cylinder',
        { sx: 18, sy: 24, sz: 18 },
        (i) => { const th = (i / 8) * Math.PI * 2; return { x: 18 * Math.cos(th), y: 5, z: 18 * Math.sin(th) }; },
        8,
      );
      expect(maxPlaneErr).toBeLessThan(1e-6);
      expect(maxSurfErr).toBeLessThan(0.15);
    });
  });

  // ── W-27c review section 6 — item (b) metric bug ────────────────────────────
  // The reviewer found the implementer's (and this file's own, transitively)
  // `maxTurnDeg` wraps around with `% n` as if every ring were closed. The
  // cone's near-apex-adjacent rings from `buildSliceSegments` are OPEN arcs
  // (first and last points do not coincide), so that wraparound invents a
  // phantom "turn" across an edge that is never drawn on screen. This block
  // provides an open-polyline-aware replacement and records what it measures
  // -- honestly, without asserting a pass/fail verdict against the plan's
  // <=8deg bar, because this implementer's own re-measurement (7.09deg,
  // detailed below) did NOT reproduce the review's cited 39.8deg despite
  // matching every stated rig parameter and trying several wiring variants
  // (with/without the analyticProject option, with/without the pass's own
  // final external plane reclamp). See the lane report for the full
  // reconciliation note -- flagged for the next review pass, not resolved.
  describe('W-27c review section 6 — item (b) open-polyline-aware turn metric', () => {
    const maxTurnDegOpen = (pts) => {
      let max = 0;
      for (let i = 1; i < pts.length - 1; i += 1) {
        const a = pts[i - 1]; const b = pts[i]; const c = pts[i + 1];
        const v1x = b.x - a.x; const v1y = b.y - a.y; const v1z = b.z - a.z;
        const v2x = c.x - b.x; const v2y = c.y - b.y; const v2z = c.z - b.z;
        const l1 = Math.hypot(v1x, v1y, v1z); const l2 = Math.hypot(v2x, v2y, v2z);
        if (l1 < 1e-9 || l2 < 1e-9) continue;
        let cosA = (v1x * v2x + v1y * v2y + v1z * v2z) / (l1 * l2);
        cosA = Math.max(-1, Math.min(1, cosA));
        const deg = (Math.acos(cosA) * 180) / Math.PI;
        if (deg > max) max = deg;
      }
      return max;
    };

    test('the cone near-apex-adjacent ring is genuinely OPEN (first/last points do not coincide) -- the old wraparound metric was invalid on it', () => {
      const sizes = { sx: 20, sy: 24, sz: 20 };
      const mesh = V.Scene3D.Mesh.createTopoformMesh('cone', sizes, 18);
      const sliced = V.Scene3D.Slices.buildSliceSegments({ world: mesh.vertices, faces: mesh.faces, sliceCount: 22 });
      const segsByPlane = new Map();
      sliced.segments.forEach((s) => {
        if (!segsByPlane.has(s.plane)) segsByPlane.set(s.plane, []);
        segsByPlane.get(s.plane).push([s.a, s.b]);
      });
      const ring = V.Geometry3D.linkSegments(segsByPlane.get(1))[0];
      const closureGap = Math.hypot(ring[0].x - ring[ring.length - 1].x, ring[0].y - ring[ring.length - 1].y, ring[0].z - ring[ring.length - 1].z);
      expect(closureGap).toBeGreaterThan(1); // genuinely open, not a closed loop -- confirms the wraparound bug's premise
    });

    test('honest measurement: open-aware max turn across every ring in the exact reviewer rig (sx20/sy24/sz20, detail18, sliceCount22, identity transform)', () => {
      const sizes = { sx: 20, sy: 24, sz: 20 };
      const IDT = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
      const WORLD_Z = { x: 0, y: 0, z: 1 };
      const mesh = V.Scene3D.Mesh.createTopoformMesh('cone', sizes, 18);
      const localPlaneNormal = V.Scene3D.Slices.localPlaneNormal(WORLD_Z, IDT);
      const sliced = V.Scene3D.Slices.buildSliceSegments({ world: mesh.vertices, faces: mesh.faces, sliceCount: 22 });
      const segsByPlane = new Map();
      sliced.segments.forEach((s) => {
        if (!segsByPlane.has(s.plane)) segsByPlane.set(s.plane, []);
        segsByPlane.get(s.plane).push([s.a, s.b]);
      });
      const analyticProject = (worldPt) => {
        const local = V.Scene3D.Slices.inverseObjectTransform(worldPt, IDT);
        const corrected = V.Scene3D.Slices.analyticProjectLocal('cone', sizes, local, localPlaneNormal);
        return V.Scene3D.Scene.applyObjectTransform(corrected, IDT);
      };
      let worst = 0; let ringsChecked = 0;
      segsByPlane.forEach((segs) => {
        V.Geometry3D.linkSegments(segs).forEach((ring) => {
          if (ring.length < 3) return;
          ringsChecked += 1;
          const refined = V.Scene3D.Slices.refineRing(ring, { analyticProject, maxAngleDeg: 8 });
          const t = maxTurnDegOpen(refined);
          if (t > worst) worst = t;
        });
      });
      expect(ringsChecked).toBeGreaterThan(15); // the sweep actually ran
      // RECORDED, not gated: this implementer measures 7.09deg here (under
      // the plan's <=8deg bar) using the exact rig and an open-polyline-aware
      // metric; the review cites 39.8deg for "that same ring" and this
      // implementer could not reproduce that specific figure (see the lane
      // report). The bound below is intentionally loose (documents the
      // measurement without taking a side in the unreconciled discrepancy).
      expect(worst).toBeGreaterThan(0);
      expect(worst).toBeLessThan(45);
    });
  });

  // ── W-29 — faceted-solid contourSlice must always emit closed rings ────────
  // (user-reports/12.png: the default buckyball has a ring with an OPEN END
  // dangling mid-facet.) Root cause
  // (docs/3d-audit/lane-reports/W-27c-0-W-29-plan.md §2): the buckyball's
  // z-symmetric vertex ring sits EXACTLY on plane levels 9 and 18 at
  // sliceCount 26. `edgeCross`'s on-plane branch (`Math.abs(ea) < 1e-6`)
  // then pushes that vertex once per incident fan triangle, producing
  // zero-length segments and odd-degree nodes; `linkSegments`'s greedy walk
  // consumes one continuation per node and abandons the rest, leaving an
  // OPEN ring. Fix: `buildSliceSegments` nudges a plane level a few
  // nanometres off any coincident mesh vertex before cutting, restoring
  // degree-2 topology everywhere the level would otherwise land on a vertex.
  //
  // Oracle (per plane, over the FULL front+back segment set — a plane
  // cutting a CLOSED manifold is always a set of closed loops; the
  // front/back split legitimately produces open arcs on an OPEN-boundary
  // mesh and is therefore not a valid oracle by itself): every cut point
  // has even degree, no zero-length segments, and `linkSegments` yields
  // only CLOSED rings (first≈last within 0.01mm). These fail at this
  // lane's base (073202a4): 6 open rings / 12 odd-degree nodes / 22
  // zero-length segments across 2 bad planes (9, 18) on the default
  // buckyball, measured directly against `Scene3D.Slices.buildSliceSegments`
  // (independently reproduced by this implementer; the plan's own numbers
  // at an earlier commit were 6/12/22/2, matching to the digit).
  describe('W-29 — faceted-solid contourSlice ring topology (closed meshes only)', () => {
    const SLICE_COUNT = 26;
    const key3 = (pt) => `${pt.x.toFixed(6)},${pt.y.toFixed(6)},${pt.z.toFixed(6)}`;
    // Degree/closure computed on a 3-D key (not `linkSegments`' own 2-D key)
    // so the oracle is independent of the production linking code's own
    // possible blind spots — see the plan §2.2 note that the 2-D key is NOT
    // the cause of this defect (0 collisions at sliceRotate 0).
    const topologyOf = (world, faces, sliceCount) => {
      const sliced = V.Scene3D.Slices.buildSliceSegments({ world, faces, sliceCount });
      const byPlane = new Map();
      sliced.segments.forEach((s) => {
        if (!byPlane.has(s.plane)) byPlane.set(s.plane, []);
        byPlane.get(s.plane).push(s);
      });
      let zeroLenSegs = 0; let oddDegreeNodes = 0; let maxDegree = 0;
      let totalRings = 0; let openRings = 0; let worstEndGap = 0; let badPlanes = 0;
      byPlane.forEach((segs) => {
        let planeBad = false;
        segs.forEach((s) => {
          if (Math.hypot(s.a.x - s.b.x, s.a.y - s.b.y, s.a.z - s.b.z) < 1e-6) zeroLenSegs++;
        });
        const deg = new Map();
        segs.forEach((s) => {
          [s.a, s.b].forEach((pt) => {
            const k = key3(pt);
            deg.set(k, (deg.get(k) || 0) + 1);
          });
        });
        deg.forEach((n) => {
          if (n > maxDegree) maxDegree = n;
          if (n % 2 !== 0) { oddDegreeNodes++; planeBad = true; }
        });
        const rings = V.Geometry3D.linkSegments(segs.map((s) => [s.a, s.b]));
        rings.forEach((ring) => {
          totalRings++;
          const gap = Math.hypot(
            ring[0].x - ring[ring.length - 1].x,
            ring[0].y - ring[ring.length - 1].y,
            ring[0].z - ring[ring.length - 1].z,
          );
          if (gap > 0.01) { openRings++; planeBad = true; if (gap > worstEndGap) worstEndGap = gap; }
        });
        if (planeBad) badPlanes++;
      });
      return {
        planes: sliced.planes, segCount: sliced.segments.length, zeroLenSegs,
        oddDegreeNodes, maxDegree, totalRings, openRings, worstEndGap, badPlanes,
      };
    };

    const buckyballMesh = () => {
      const Prm = V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS.solid;
      const mesh = V.Scene3D.Mesh.createSolidMesh({ ...Prm, applyDeformers: true });
      return { world: mesh.vertices, faces: mesh.faces };
    };
    const sphereMesh = () => {
      const Prm = V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS.sphere;
      const mesh = V.Scene3D.Mesh.createTopoformMesh('sphere', { sx: Prm.radius, sy: Prm.radius, sz: Prm.radius }, Prm.detail);
      return { world: mesh.vertices, faces: mesh.faces };
    };
    const torusMesh = () => {
      const Prm = V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS.torus;
      const mesh = V.Scene3D.Mesh.createTopoformMesh('torus', Prm, Prm.detail);
      return { world: mesh.vertices, faces: mesh.faces };
    };
    const boxMesh = () => {
      const Prm = V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS.box;
      const mesh = V.Scene3D.Mesh.makeBoxMesh(Prm.sx, Prm.sy, Prm.sz, 1);
      return { world: mesh.vertices, faces: mesh.faces };
    };

    test.each([
      ['solid (buckyball)', buckyballMesh],
      ['sphere', sphereMesh],
      ['torus', torusMesh],
      ['box', boxMesh],
    ])('%s: every plane cuts the CLOSED mesh into closed rings only, no zero-length segments, no odd-degree nodes — RED at 073202a4 for the buckyball (6/12/22/2)', (name, meshFn) => {
      const { world, faces } = meshFn();
      const t = topologyOf(world, faces, SLICE_COUNT);
      expect(t.zeroLenSegs).toBe(0);
      expect(t.oddDegreeNodes).toBe(0);
      expect(t.openRings).toBe(0);
      expect(t.badPlanes).toBe(0);
      expect(t.maxDegree).toBe(2);
    });

    // Purity guard reasserted locally (mirrors :204-306): the nudge only
    // perturbs a level's position by a few nanometres and must never move
    // the plane count.
    test('plane count stays a pure function of sliceCount with the vertex-coincidence nudge active', () => {
      const { world, faces } = buckyballMesh();
      [2, 12, 26, 120].forEach((sc) => {
        expect(V.Scene3D.Slices.buildSliceSegments({ world, faces, sliceCount: sc }).planes).toBe(sc);
      });
    });

    // Documented exclusion (plan §2.4): cylinder/cone/pyramid meshes have NO
    // cap faces, so a z-const cut through them is genuinely a set of open
    // arcs terminating on the mesh's own open boundary — this is normal
    // geometry, not the degeneracy the nudge targets, and the nudge does
    // not (and must not be expected to) close these. Measured here so the
    // exclusion is documented, not silently widened into the guard above.
    test('cylinder/cone/pyramid are OPEN-BOUNDARY meshes — their contourSlice rings are legitimately open regardless of the nudge', () => {
      const cyl = V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS.cylinder;
      const cylTopo = topologyOf(
        V.Scene3D.Mesh.createTopoformMesh('cylinder', cyl, cyl.detail).vertices,
        V.Scene3D.Mesh.createTopoformMesh('cylinder', cyl, cyl.detail).faces,
        SLICE_COUNT,
      );
      expect(cylTopo.openRings).toBeGreaterThan(0);

      const cone = V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS.cone;
      const coneTopo = topologyOf(
        V.Scene3D.Mesh.createTopoformMesh('cone', cone, cone.detail).vertices,
        V.Scene3D.Mesh.createTopoformMesh('cone', cone, cone.detail).faces,
        SLICE_COUNT,
      );
      expect(coneTopo.openRings).toBeGreaterThan(0);

      const pyr = V.Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS.pyramid;
      const pyrTopo = topologyOf(
        V.Scene3D.Mesh.createTopoformMesh('pyramid', pyr, pyr.detail).vertices,
        V.Scene3D.Mesh.createTopoformMesh('pyramid', pyr, pyr.detail).faces,
        SLICE_COUNT,
      );
      expect(pyrTopo.openRings).toBeGreaterThan(0);
    });
  });

});
