const { loadSurfaceLockRuntime } = require('../helpers/surface-lock-scene');
const FIX = require('../fixtures/scene3d-shadow-anatomy');

// Surface-locked fills: mesh visibility and per-frame outline (docs/surface-lock-contract.md §7, §13; unit W1-E).
// The oracles are the existing pose-mode machinery: HLR.createClipper().hiddenAt for point visibility, the analytic
// sphere/ellipsoid geometry derived independently here for the limb, and the sceneEdge paths algorithms/scene3d.js
// emits for the box outline.

const { BOUNDS, CAMERA, SUN } = FIX;
const clone = (v) => JSON.parse(JSON.stringify(v));
const T0 = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
// Subjects are the shared fixture's own primitives, re-sized and re-placed (scene3d-fixture-single-source rule B).
const sphere = (id, radius, tr) => ({ ...clone(FIX.BALL), id, name: id, params: { ...FIX.BALL.params, radius }, transform: { ...T0, ...tr } });
const box = (id, s, tr) => ({ ...clone(FIX.CUBE), id, name: id, params: { sx: s, sy: s, sz: s }, transform: { ...T0, ...tr } });
// The fixture rig with a perspective projection. The key is computed so the camera is still CAMERA, one field changed.
const PROJECTION = 'projection';
const perspective = (cam) => ({ ...cam, [PROJECTION]: 'perspective' });

let rt; let V; let Vis; let Scene; let Params; let HLR; let TorusOcc;
beforeAll(async () => {
  rt = await loadSurfaceLockRuntime(); V = rt.V;
  Vis = V.Scene3D.SurfaceLockVisibility; Scene = V.Scene3D.Scene; Params = V.Scene3D.Params; HLR = V.Scene3D.HLR;
  TorusOcc = V.Scene3D.TorusOcclusion;
});
afterAll(() => rt && rt.cleanup());

const rawScene = (objects, camera = CAMERA) => (FIX.scene({ objects, camera: { ...camera }, ground: { enabled: false }, lights: [SUN] })(V));
const normalized = (objects, camera) => Params.normalizeParams(rawScene(objects, camera));

const camOf = (np) => {
  const po = Scene.buildProjOpts(np.camera, BOUNDS);
  return {
    yaw: np.camera.yaw, pitch: np.camera.pitch, roll: np.camera.roll, scale: po.scale, cx: po.centerX, cy: po.centerY,
    persp: Number.isFinite(po.focal), focal: po.focal || 0, dist: po.cameraDist || 0,
  };
};
const poseOf = (np, obj) => ({ cam: camOf(np), obj: { x: obj.transform.x, y: obj.transform.y, z: obj.transform.z, yaw: obj.transform.yaw, pitch: obj.transform.pitch, roll: obj.transform.roll } });

const rig = (objects, camera) => {
  const np = normalized(objects, camera);
  const scn = Scene.assembleScene(np, BOUNDS);
  const bakes = np.objects.map((o) => Vis.meshBake(o));
  const poses = np.objects.map((o) => poseOf(np, o));
  const occ = Vis.occluder(bakes, poses);
  return { np, scn, bakes, poses, occ };
};

// Deterministic sampler of surface points on the FRONT faces of the pose-mode assembly (screen x, y and camera z).
const sampleFront = (scn, n) => {
  let seed = 12345;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const tris = [];
  scn.objects.forEach((rec, oi) => rec.faces.forEach((f) => {
    if (!f.front) return;
    for (let k = 1; k + 1 < f.indices.length; k++) tris.push([oi, rec.projected[f.indices[0]], rec.projected[f.indices[k]], rec.projected[f.indices[k + 1]]]);
  }));
  const out = [];
  for (let i = 0; i < n; i++) {
    const [oi, a, b, c] = tris[Math.floor(rnd() * tris.length)];
    let u = rnd(); let v = rnd(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
    const w = 1 - u - v;
    out.push({ oi, x: w * a.x + u * b.x + v * c.x, y: w * a.y + u * b.y + v * c.y, z: w * a.z + u * b.z + v * c.z });
  }
  return out;
};

const distToSegs = (p, segs) => {
  let best = Infinity;
  segs.forEach(([a, b]) => {
    const dx = b.x - a.x; const dy = b.y - a.y; const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  });
  return best;
};

// Agreement of the new occluder with the HLR clipper over sampled surface points. Returns the counts and every
// disagreement's distance to the nearest contour of a front face of ANOTHER object.
const compareToClipper = (r, n, ctxFor) => {
  const faces = [];
  r.scn.objects.forEach((rec) => rec.faces.forEach((f) => { if (f.front) faces.push({ id: f.key, objectId: rec.id, polygon: f.polygon, onlyOwnObject: false }); }));
  const clipper = HLR.createClipper(faces, { bias: 0.05 });
  const samples = sampleFront(r.scn, n);
  let agree = 0; let hidden = 0; const bad = [];
  samples.forEach((s) => {
    const rec = r.scn.objects[s.oi];
    const want = clipper.hiddenAt(s.x, s.y, s.z, ctxFor(rec));
    const got = r.occ.hiddenAt(s.x, s.y, s.z, r.occ.segFor(r.bakes[s.oi]));
    if (want) hidden += 1;
    if (want === got) { agree += 1; return; }
    const segs = [];
    r.scn.objects.forEach((o, oj) => {
      if (oj === s.oi) return;
      o.faces.forEach((f) => { if (!f.front) return; const P = f.polygon; for (let i = 0; i < P.length; i++) segs.push([P[i], P[(i + 1) % P.length]]); });
    });
    bad.push(distToSegs(s, segs));
  });
  return { agree, hidden, total: samples.length, bad };
};

describe('surface lock visibility (W1-E)', () => {
  it('1. point visibility agrees with the HLR clipper on a sphere + box scene', () => {
    const r = rig([sphere('s', 30, { y: 30 }), box('b', 40, { x: 30, y: 20, z: 45, yaw: 20 })]);
    const c = compareToClipper(r, 5000, (rec) => ({ objectId: rec.id, selfObject: true, selfOcclude: !rec.convex }));
    expect(c.hidden).toBeGreaterThan(150); // the scene really occludes
    expect(c.hidden).toBeLessThan(c.total - 150);
    expect(c.agree / c.total).toBeGreaterThanOrEqual(0.995);
    c.bad.forEach((d) => expect(d).toBeLessThanOrEqual(0.3));
  });

  it('1b. an object behind another is hidden, and the same object alone is not', () => {
    const r = rig([sphere('s', 30, { y: 30 }), box('b', 40, { x: 30, y: 20, z: 45 })]);
    const alone = rig([sphere('s', 30, { y: 30 })]);
    const samples = sampleFront(r.scn, 2000).filter((s) => s.oi === 0);
    const withBox = samples.filter((s) => r.occ.hiddenAt(s.x, s.y, s.z, r.occ.segFor(r.bakes[0]))).length;
    const lone = samples.filter((s) => alone.occ.hiddenAt(s.x, s.y, s.z, alone.occ.segFor(alone.bakes[0]))).length;
    expect(lone).toBe(0);
    expect(withBox).toBeGreaterThan(0);
  });

  it('2. sphere limb equals the analytic circle (orthographic) and the tangent cone (perspective)', () => {
    const R = 25;
    const objs = [sphere('s', R, { x: 10, y: 25, z: -5 })];
    // orthographic: a circle of radius R * zoom about the independently projected centre
    const o = rig(objs, { ...CAMERA, yaw: 40, pitch: 20 });
    const centre = Scene.projectWorldPoint({ x: 10, y: 25, z: -5 }, o.np.camera, BOUNDS);
    const limb = Vis.outline(o.bakes[0], o.poses[0], o.occ).silhouette;
    expect(limb.length).toBe(1);
    expect(limb[0].closed).toBe(true);
    const pts = limb[0].pts;
    expect(pts.length).toBeGreaterThan(100);
    pts.forEach((p) => expect(Math.abs(Math.hypot(p.x - centre.x, p.y - centre.y) - R * o.np.camera.zoom)).toBeLessThan(0.005));
    // perspective: every limb point's eye ray is tangent to the sphere
    const cam = perspective({ ...CAMERA, yaw: 40, pitch: 20 });
    const p = rig(objs, cam);
    const pc = camOf(p.np);
    const cc = V.Geometry3D.rotatePoint({ x: 10, y: 25, z: -5 }, { yaw: cam.yaw, pitch: cam.pitch, roll: 0 });
    const eye = { x: 0, y: 0, z: pc.focal + pc.dist };
    const k = pc.focal * pc.scale;
    const lp = Vis.outline(p.bakes[0], p.poses[0], p.occ).silhouette[0].pts;
    expect(lp.length).toBeGreaterThan(100);
    lp.forEach((q) => {
      const d = { x: (q.x - pc.cx) / k, y: -(q.y - pc.cy) / k, z: -1 };
      const w = { x: cc.x - eye.x, y: cc.y - eye.y, z: cc.z - eye.z };
      const cr = { x: w.y * d.z - w.z * d.y, y: w.z * d.x - w.x * d.z, z: w.x * d.y - w.y * d.x };
      const dist = Math.hypot(cr.x, cr.y, cr.z) / Math.hypot(d.x, d.y, d.z);
      // the limb is a silhouette of radius R: the eye ray is at distance R from the centre; screen error = (dist - R) * k / depth
      expect(Math.abs(dist - R) * (k / (pc.focal + pc.dist - cc.z))).toBeLessThan(0.02);
    });
  });

  it('2b. an ellipsoid limb lies on the surface with the normal perpendicular to the view (rotated, scaled object)', () => {
    const el = { id: 'e', name: 'e', primitive: 'ellipsoid', params: { sx: 30, sy: 14, sz: 20, detail: 24 }, transform: { ...T0, x: 5, y: 20, z: 3, yaw: 35, pitch: 20, roll: 10, sx: 1.2, sy: 1, sz: 0.8 }, visibility: 'solid' };
    const r = rig([el]);
    const a = [36, 14, 16]; // semi-axes x per-axis object scale
    const t = r.np.objects[0].transform; const cam = r.np.camera; const pc = camOf(r.np);
    const G = V.Geometry3D; const inv = TorusOcc.invRotatePoint;
    const limb = Vis.outline(r.bakes[0], r.poses[0], r.occ).silhouette[0].pts;
    const vdirCam = { x: 0, y: 0, z: 1 };
    limb.forEach((q) => {
      const c = { x: (q.x - pc.cx) / pc.scale, y: -(q.y - pc.cy) / pc.scale, z: q.z };
      const w = inv(c, { yaw: cam.yaw, pitch: cam.pitch, roll: cam.roll });
      const p = inv({ x: w.x - t.x, y: w.y - t.y, z: w.z - t.z }, { yaw: t.yaw, pitch: t.pitch, roll: t.roll });
      const f = (p.x / a[0]) ** 2 + (p.y / a[1]) ** 2 + (p.z / a[2]) ** 2;
      expect(Math.abs(f - 1)).toBeLessThan(1e-9);
      const n = { x: p.x / a[0] ** 2, y: p.y / a[1] ** 2, z: p.z / a[2] ** 2 };
      const nw = G.rotatePoint(G.rotatePoint(n, { yaw: t.yaw, pitch: t.pitch, roll: t.roll }), { yaw: cam.yaw, pitch: cam.pitch, roll: cam.roll });
      expect(Math.abs(nw.z * vdirCam.z) / Math.hypot(nw.x, nw.y, nw.z)).toBeLessThan(1e-9);
    });
  });

  it('3. box outline edges equal the pose-mode sceneEdge set at the same pose', () => {
    [{ yaw: 20 }, { yaw: -50, pitch: 15 }].forEach((tr) => {
      const objs = [box('b', 40, { y: 20, ...tr })];
      const raw = rawScene(objs); const np = Params.normalizeParams(raw);
      const paths = V.AlgorithmRegistry.scene3d.generate(Params.collectSceneParams(np, []), new V.SeededRNG(0), new V.SimpleNoise(0), BOUNDS) || [];
      const poseSegs = [];
      paths.filter((p) => p.meta && p.meta.kind === 'sceneEdge').forEach((p) => { for (let i = 0; i + 1 < p.length; i++) poseSegs.push([p[i], p[i + 1]]); });
      expect(poseSegs.length).toBeGreaterThanOrEqual(6);
      const r = rig(objs);
      const o = Vis.outline(r.bakes[0], r.poses[0], r.occ);
      const mine = [];
      [...o.silhouette, ...o.boundary].forEach((run) => { for (let i = 0; i + 1 < run.pts.length; i++) mine.push([run.pts[i], run.pts[i + 1]]); });
      expect(o.crease.length).toBeGreaterThan(0); // creases are classified; pose mode only draws them for wireframe
      const sample = (segs, other) => segs.forEach(([a, b]) => {
        const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5));
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          expect(distToSegs({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, other)).toBeLessThan(0.01);
        }
      });
      sample(mine, poseSegs); sample(poseSegs, mine);
    });
  });

  it('3b. an occluder in front removes the hidden part of an outline', () => {
    const alone = rig([box('b', 40, { y: 20 })]);
    const both = rig([box('b', 40, { y: 20 }), sphere('s', 30, { y: 20, z: 60 })]);
    const len = (o) => [...o.silhouette, ...o.boundary, ...o.crease].reduce((s, run) => s + run.pts.reduce((a, p, i, arr) => (i ? a + Math.hypot(p.x - arr[i - 1].x, p.y - arr[i - 1].y) : a), 0), 0);
    const l0 = len(Vis.outline(alone.bakes[0], alone.poses[0], alone.occ));
    const l1 = len(Vis.outline(both.bakes[0], both.poses[0], both.occ));
    expect(l1).toBeLessThan(l0 - 5);
  });

  it('4. torus: the TorusOcclusion path agrees with the pose-mode fill visibility', () => {
    const P = Params.PRIMITIVE_PARAM_DEFAULTS && Params.PRIMITIVE_PARAM_DEFAULTS.torus;
    const torus = { id: 't', name: 't', primitive: 'torus', params: { ...(P || { sx: 40, sy: 40, sz: 40 }), detail: 24 }, transform: { ...T0, y: 20, pitch: 8 }, visibility: 'solid' };
    const r = rig([torus, sphere('s', 12, { x: 30, y: 30, z: 40 })], { ...CAMERA, pitch: 28 });
    const t = r.np.objects[0];
    const sizes = { sx: t.params.sx, sy: t.params.sy, sz: t.params.sz };
    const analytic = TorusOcc.buildSelfOcclusionTest(t.transform, r.np.camera, r.scn.projOpts, sizes, { gapMm: 8, marginMm: 1 });
    const c = compareToClipper(r, 5000, (rec) => (rec.id === 't'
      ? { objectId: rec.id, selfObject: true, selfOcclude: true, analyticOccluder: analytic }
      : { objectId: rec.id, selfObject: true, selfOcclude: !rec.convex }));
    expect(c.hidden).toBeGreaterThan(100);
    expect(c.agree / c.total).toBeGreaterThanOrEqual(0.995);
  });

  it('5. meshBake is pose-free', () => {
    const a = Vis.meshBake(box('b', 40, { x: 5, yaw: 10 }));
    const b = Vis.meshBake(box('b', 40, { x: -30, y: 7, yaw: 77, pitch: 12 }));
    ['vertices', 'faceNormals', 'triVerts', 'triFace', 'edgeA', 'edgeB', 'edgeF0', 'edgeF1'].forEach((k) => expect(Array.from(a[k]), k).toEqual(Array.from(b[k])));
    const c = Vis.meshBake(box('b', 40, { scale: 2 }));
    expect(c.vertices[0]).toBeCloseTo(2 * a.vertices[0], 12);
    expect(Vis.meshBake(sphere('s', 20, { yaw: 3 })).convex).toBe(true);
  });

  it('supports() accepts the primitive classes and refuses the rest', () => {
    ['sphere', 'ellipsoid', 'box', 'torus', 'torusKnot', 'cylinder', 'solid'].forEach((p) => expect(Vis.supports({ primitive: p }), p).toBe(true));
    expect(Vis.supports({ primitive: 'csg' })).toBe(false);
    expect(Vis.supports(null)).toBe(false);
    expect(Vis.supports({ primitive: 'bogus' })).toBe(false);
  });

  it('F-V1: meshBake precomputes the mean triangle extent used to size the occluder grid', () => {
    const np = normalized([sphere('s', 30, { y: 30 })]);
    const bake = Vis.meshBake(np.objects[0]);
    expect(Number.isFinite(bake.triExtentMean)).toBe(true);
    expect(bake.triExtentMean).toBeGreaterThan(0.1);
    expect(bake.triExtentMean).toBeLessThan(30);
  });

  it('F-V1: repeated occluder builds reuse scratch (no large typed-array allocations once warm)', () => {
    const r = rig([sphere('a', 40, { y: 40 }), box('b', 30, { x: 60, y: 15 })]);
    for (let i = 0; i < 3; i++) Vis.occluder(r.bakes, r.poses);
    // The module runs in the runtime's vm context: patch the constructors on that context's global (and on the
    // host global, in case a build shares it) and restore exactly what was there.
    const realms = [rt.runtime.window, globalThis].filter(Boolean);
    const counts = realms.map(() => 0);
    const NAMES = ['Float64Array', 'Int32Array', 'Uint8Array'];
    const saved = realms.map((g) => NAMES.map((n) => ({ n, own: Object.prototype.hasOwnProperty.call(g, n), v: g[n] })));
    const wrap = (Ctor, k) => {
      const W = function wrapped(...a) { if (typeof a[0] === 'number' && a[0] >= 2000) counts[k] += 1; return new Ctor(...a); };
      W.prototype = Ctor.prototype; W.from = Ctor.from.bind(Ctor); W.of = Ctor.of.bind(Ctor);
      return W;
    };
    try {
      realms.forEach((g, k) => saved[k].forEach((e) => { g[e.n] = wrap(e.v || globalThis[e.n], k); }));
      for (let i = 0; i < 10; i++) Vis.occluder(r.bakes, r.poses);
    } finally {
      realms.forEach((g, k) => saved[k].forEach((e) => { if (e.own) g[e.n] = e.v; else delete g[e.n]; }));
    }
    console.log('F-V1 large typed-array allocations over 10 warm occluder builds', JSON.stringify(counts));
    expect(Math.max(...counts)).toBe(0);
  });

  it('F-V1: two live occluders stay independent although they share scratch memory', () => {
    const A = rig([sphere('a', 40, { y: 40 })]);
    const B = rig([sphere('a', 40, { y: 40 }), box('b', 30, { x: 0, y: 20, z: 60 })]);
    const pts = sampleFront(A.scn, 150).concat(sampleFront(B.scn, 150));
    const ref = (occ) => pts.map((q) => occ.hiddenAt(q.x, q.y, q.z + 0.3, { obj: -1, mode: 'fill' }));
    const a0 = ref(A.occ); const b0 = ref(B.occ);
    const A2 = Vis.occluder(A.bakes, A.poses); // rebuilds over the shared scratch
    const B2 = Vis.occluder(B.bakes, B.poses);
    expect(ref(A.occ)).toEqual(a0);
    expect(ref(B.occ)).toEqual(b0);
    expect(ref(A2)).toEqual(a0);
    expect(ref(B2)).toEqual(b0);
  });

  it('acceptance timings (reported)', () => {
    const big = { ...sphere('big', 40, { y: 40 }), params: { ...FIX.BALL.params, radius: 40, detail: 32 } };
    const np = normalized([big]);
    const bake = Vis.meshBake(np.objects[0]);
    const pose = poseOf(np, np.objects[0]);
    for (let i = 0; i < 5; i++) Vis.occluder([bake], [pose]);
    const t0 = performance.now(); const N = 20;
    let occ; for (let i = 0; i < N; i++) occ = Vis.occluder([bake], [pose]);
    const occMs = (performance.now() - t0) / N;
    const dflt = rig([sphere('s', 46, { y: 46 })]);
    for (let i = 0; i < 5; i++) Vis.outline(dflt.bakes[0], dflt.poses[0], dflt.occ);
    const t1 = performance.now();
    for (let i = 0; i < N; i++) Vis.outline(dflt.bakes[0], dflt.poses[0], dflt.occ);
    const outMs = (performance.now() - t1) / N;
    // eslint-disable-next-line no-console
    const dm = []; for (let i = 0; i < 30; i++) { const s0 = performance.now(); Vis.occluder(dflt.bakes, dflt.poses); dm.push(performance.now() - s0); }
    dm.sort((a, b) => a - b);
    console.log(`F-V1 default-sphere occluder median ${dm[15].toFixed(2)} ms (p90 ${dm[27].toFixed(2)})`);
    console.log(`W1-E timings: occluder ${bake.triCount} tris -> ${occ.triangleCount} front, grid ${occ.gridSize.join('x')}: ${occMs.toFixed(2)} ms; default sphere outline ${outMs.toFixed(2)} ms`);
    expect(occMs).toBeLessThan(20);
    expect(outMs).toBeLessThan(10);
  });
});
