/**
 * Scene3D.PosePreview — the frame-rate drag preview for a 3D Scene.
 *
 * WHY. A mono-fill Scene (mezzotint) costs 0.2-1.8 s per compose: the law walks
 * streamlines in SCREEN space and inverts the chart by Newton iteration, so
 * there is no rotation-invariant mark set to reuse inside the generator, and no
 * draft tier of the real law gets within an order of magnitude of a frame.
 * This module takes the compose OFF the interaction path instead:
 *
 *   SNAPSHOT (once per settled compose, `Engine._composeSceneGroup`). The
 *   settled ink is LIFTED into object space. Every vertex of a mark that lies
 *   on the object (sphere, box) is ray-cast back onto the surface and stored as
 *   a model-space point; every vertex of a ground mark (fill, shadow, frame) is
 *   stored as a world point on y = 0. Nothing here changes the compose: this is
 *   a read of its result.
 *
 *   WARP (every drag frame). The lifted points are carried through the CURRENT
 *   object transform and camera (one 3x3 matrix per vertex), culled by facing
 *   (sphere: n.v > 0; box: any touched face front) and projected. The hemisphere
 *   that was hidden when the scene settled has no marks of its own, so each mark
 *   is also drawn through the CENTRE (p -> -p): a convex centrally symmetric
 *   body never shows a point and its antipode at once, so the two copies tile the
 *   whole surface exactly once. O(vertices), no allocation beyond the output.
 *
 *   EXACT RENDER. A warp frame is a PREVIEW (`group._pathsFromDraft = true`).
 *   The release / idle compose is the unchanged full compose; this module never
 *   touches it, so the settled ink is byte-identical to a render without it.
 *
 * A scene is warpable only when everything EXCEPT the pose (object position /
 * rotation / scale, camera angles / zoom) is identical to the settled one, it
 * holds exactly one sphere or box, and every settled path is attributable to
 * that object or to the ground. Anything else falls back to the draft tiers.
 */
(function registerScenePosePreview() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});

  // Counters for the contract tests (a rotation-only drag must never re-lift).
  const stats = { snapshots: 0, lifts: 0, warps: 0, refusals: 0, lastRefusal: null };

  const num = (v, d) => (typeof v === 'number' ? (Number.isFinite(v) ? v : d) : (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d));
  const D2R = Math.PI / 180;
  const ORTHO_ORIGIN_Z = 1e4;
  const FACE_TOL = 0.02; // mm of local space: a lifted vertex this close to a box face plane touches that face
  const BIT_PX = 1; const BIT_NX = 2; const BIT_PY = 4; const BIT_NY = 8; const BIT_PZ = 16; const BIT_NZ = 32;
  const AXIS_BITS = [[BIT_PX, BIT_NX], [BIT_PY, BIT_NY], [BIT_PZ, BIT_NZ]];

  const GEO_MEMO = new Map();
  const refuse = (why) => { stats.refusals += 1; stats.lastRefusal = why; return null; };

  // ── 3x3 matrices, row-major [m00 m01 m02 m10 ...] ────────────────────────────
  // The scene's rotation order (yaw -> pitch -> roll) is whatever Geometry3D's
  // rotator does; build the matrix by running the rotator over the basis, so
  // this module can never drift from it.
  const rotMatrix = (angles) => {
    const G3 = Vectura.Geometry3D;
    const rot = G3.makeRotator(angles);
    const ex = rot({ x: 1, y: 0, z: 0 }); const ey = rot({ x: 0, y: 1, z: 0 }); const ez = rot({ x: 0, y: 0, z: 1 });
    return [ex.x, ey.x, ez.x, ex.y, ey.y, ez.y, ex.z, ey.z, ez.z];
  };
  const mul3 = (A, B) => {
    const out = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
    return out;
  };
  const tr3 = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
  const apply3 = (A, x, y, z) => [A[0] * x + A[1] * y + A[2] * z, A[3] * x + A[4] * y + A[5] * z, A[6] * x + A[7] * y + A[8] * z];

  // ── describe: everything a snapshot / warp needs from one scene ─────────────
  const describe = (raw, bounds) => {
    const Params = Scene3D.Params; const Scene = Scene3D.Scene; const G3 = Vectura.Geometry3D;
    if (!Params || !Scene || !G3 || typeof G3.makeRotator !== 'function') return refuse('modules');
    let p;
    try { p = Params.normalizeParams(raw); } catch (_) { return refuse('normalize'); }
    if (!p || !Array.isArray(p.objects) || p.objects.length !== 1) return refuse('objects');
    const o = p.objects[0];
    const prim = o.primitive;
    if (prim !== 'sphere' && prim !== 'box') return refuse(`primitive:${prim}`);
    if (p.groups && (Array.isArray(p.groups) ? p.groups.length : Object.keys(p.groups).length)) return refuse('groups');
    const t = o.transform || {};
    const s = num(t.scale, 1);
    const sx = num(t.sx, s); const sy = num(t.sy, s); const sz = num(t.sz, s);
    if (!(sx > 0 && sy > 0 && sz > 0)) return refuse('scale');
    if (prim === 'sphere' && (Math.abs(sx - sy) > 1e-9 || Math.abs(sy - sz) > 1e-9)) return refuse('sphere-nonuniform');
    const cam = p.camera || {};
    const width = num(bounds && bounds.width, 200); const height = num(bounds && bounds.height, 200);
    const projOpts = Scene.buildProjOpts(cam, { width, height });
    const persp = Number.isFinite(projOpts.focal) && projOpts.focal > 0;
    const pose = {
      cam: {
        yaw: num(cam.yaw, 0), pitch: num(cam.pitch, 0), roll: num(cam.roll, 0),
        scale: num(projOpts.scale, 1), cx: num(projOpts.centerX, width / 2), cy: num(projOpts.centerY, height / 2),
        persp, focal: persp ? projOpts.focal : 0, dist: persp ? num(projOpts.cameraDist, 0) : 0,
      },
      obj: {
        x: num(t.x, 0), y: num(t.y, 0), z: num(t.z, 0),
        yaw: num(t.yaw, 0), pitch: num(t.pitch, 0), roll: num(t.roll, 0), sx, sy, sz,
      },
    };
    // Local geometry from the primitive's own mesh: a sphere's vertices sit on the true sphere, a
    // box's on +-h per axis. Memoized by primitive + params (a drag frame must not rebuild a mesh).
    const gkey = `${prim}|${JSON.stringify(o.params || null)}`;
    let geo = GEO_MEMO.get(gkey);
    if (!geo) {
      let mesh;
      try { mesh = Scene.buildPrimitiveMesh(Object.assign({}, o, { id: o.id || 'o' }), 1); } catch (_) { return refuse('mesh'); }
      if (!mesh || !Array.isArray(mesh.vertices) || !mesh.vertices.length) return refuse('mesh');
      let hx = 0; let hy = 0; let hz = 0; let rad = 0;
      let cxm = 0; let cym = 0; let czm = 0;
      mesh.vertices.forEach((q) => {
        hx = Math.max(hx, Math.abs(q.x)); hy = Math.max(hy, Math.abs(q.y)); hz = Math.max(hz, Math.abs(q.z));
        rad = Math.max(rad, Math.hypot(q.x, q.y, q.z));
        cxm += q.x; cym += q.y; czm += q.z;
      });
      const nv = mesh.vertices.length;
      geo = { hx, hy, hz, rad, centred: Math.hypot(cxm / nv, cym / nv, czm / nv) <= 1e-6 * Math.max(1, rad) };
      if (GEO_MEMO.size >= 16) GEO_MEMO.delete(GEO_MEMO.keys().next().value);
      GEO_MEMO.set(gkey, geo);
    }
    const { hx, hy, hz, rad } = geo;
    if (!geo.centred) return refuse('uncentred');
    if (!(hx > 0 && hy > 0 && hz > 0 && rad > 0)) return refuse('degenerate');
    // The key: the scene with its POSE blanked. Equal key => the two scenes differ only by pose.
    let key;
    try {
      key = JSON.stringify({
        p: Object.assign({}, p, {
          camera: Object.assign({}, p.camera, { yaw: 0, pitch: 0, roll: 0, zoom: 1 }),
          objects: [Object.assign({}, o, { transform: Object.assign({}, o.transform, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1, sx: 1, sy: 1, sz: 1 }) })],
        }),
        b: [width, height, num(bounds && bounds.m, 0), num(bounds && bounds.penWidth, 0), bounds && bounds.truncate ? 1 : 0],
      });
    } catch (_) { return refuse('key'); }
    // The sun, when it is the one directional light: the cast shadow can then be re-projected per frame.
    let sunDir = null;
    try {
      const Lt = Scene3D.Lighting;
      const ls = (Array.isArray(p.lights) ? p.lights : []).filter((l) => l && l.type !== 'ambient');
      if (Lt && ls.length === 1 && (!ls[0].type || ls[0].type === 'directional')) {
        const d = Lt.lightWorldDir(ls[0]);
        if (d && d.y < -1e-3) sunDir = [d.x, d.y, d.z];
      }
    } catch (_) { sunDir = null; }
    return {
      key, prim, objId: o.id, pose, width, height, sunDir,
      half: [hx, hy, hz], radius: rad,
      groundOn: Boolean(p.ground && p.ground.enabled),
    };
  };

  // Camera + object matrices of one pose: c = A * L + cT  (L local, c camera space).
  const poseMatrices = (info, pose) => {
    const camR = rotMatrix({ yaw: pose.cam.yaw, pitch: pose.cam.pitch, roll: pose.cam.roll });
    const objR = rotMatrix({ yaw: pose.obj.yaw, pitch: pose.obj.pitch, roll: pose.obj.roll });
    const M = mul3(camR, objR);
    const S = pose.obj;
    const A = [M[0] * S.sx, M[1] * S.sy, M[2] * S.sz, M[3] * S.sx, M[4] * S.sy, M[5] * S.sz, M[6] * S.sx, M[7] * S.sy, M[8] * S.sz];
    const cT = apply3(camR, S.x, S.y, S.z);
    return { camR, objR, M, A, cT };
  };

  // ── lift ─────────────────────────────────────────────────────────────────
  // Camera-space ray through a screen point.
  const screenRay = (pose, X, Y) => {
    const c = pose.cam;
    if (c.persp) {
      const k = c.focal * c.scale;
      return { o: [0, 0, c.focal + c.dist], d: [(X - c.cx) / k, -(Y - c.cy) / k, -1] };
    }
    return { o: [(X - c.cx) / c.scale, -(Y - c.cy) / c.scale, ORTHO_ORIGIN_Z], d: [0, 0, -1] };
  };

  const sameCamera = (a, b) => a.yaw === b.yaw && a.pitch === b.pitch && a.roll === b.roll && a.scale === b.scale
    && a.persp === b.persp && a.focal === b.focal && a.dist === b.dist;
  const sameObject = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z && a.yaw === b.yaw && a.pitch === b.pitch
    && a.roll === b.roll && a.sx === b.sx && a.sy === b.sy && a.sz === b.sz;

  const pathTarget = (path) => (path && path.meta && path.meta.sceneTarget) || null;

  // Generator so the lift can be time-sliced (`sliceMs`): it yields every few hundred vertices once the
  // slice is spent. Driven to completion at once, it is the synchronous lift.
  function* liftGen(info, paths, sliceMs) {
    const now = () => (globalScope.performance && globalScope.performance.now ? globalScope.performance.now() : Date.now());
    let sliceStart = now();
    const pose = info.pose;
    const { camR, objR } = poseMatrices(info, pose);
    const camRt = tr3(camR); const objRt = tr3(objR);
    const S = pose.obj;
    const Tw = [S.x, S.y, S.z];
    // total vertex count
    let n = 0;
    for (let i = 0; i < paths.length; i++) n += Array.isArray(paths[i]) ? paths[i].length : 0;
    const X = new Float64Array(n); const Y = new Float64Array(n); const Z = new Float64Array(n);
    const MASK = new Uint8Array(n); const OK = new Uint8Array(n);
    const start = new Int32Array(paths.length + 1);
    const kind = new Uint8Array(paths.length); // 0 object, 1 ground (plane), 2 sphere silhouette (screen similarity), 3 untouched, 4 cast-shadow ground mark
    const metas = new Array(paths.length);
    const camNormalY = apply3(camR, 0, 1, 0); // ground plane normal in camera space (plane passes through the origin)
    const half = info.half; const rad = info.radius;
    let at = 0;
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      start[i] = at;
      if (!Array.isArray(path)) return refuse('path-shape');
      const tg = pathTarget(path);
      if (!tg) return refuse('untargeted');
      const meta = path.meta;
      const slim = Object.assign({}, meta);
      delete slim.anchors; slim.closed = false; slim.forceCurves = false;
      metas[i] = slim;
      if (tg.objectId === info.objId) {
        kind[i] = (info.prim === 'sphere' && tg.edgeClass === 'silhouette') ? 2 : 0;
      } else if (tg.objectId === 'ground') {
        kind[i] = (tg.regionClass === 'castShadow') ? 4 : 1;
      } else return refuse(`target:${tg.objectId}`);
      for (let j = 0; j < path.length; j++, at++) {
        if (sliceMs && (at & 255) === 0 && now() - sliceStart > sliceMs) { yield; sliceStart = now(); }
        const q = path[j];
        const sx = q.x; const sy = q.y;
        if (kind[i] === 2) { X[at] = sx; Y[at] = sy; OK[at] = 1; continue; }
        const ray = screenRay(pose, sx, sy);
        if (kind[i] === 1 || kind[i] === 4) {
          // ray . n_cam * ... : plane n.P = 0 with P = o + t d
          const nd = camNormalY[0] * ray.d[0] + camNormalY[1] * ray.d[1] + camNormalY[2] * ray.d[2];
          const no = camNormalY[0] * ray.o[0] + camNormalY[1] * ray.o[1] + camNormalY[2] * ray.o[2];
          if (Math.abs(nd) < 1e-6) { OK[at] = 0; continue; }
          const t = -no / nd;
          const pc = [ray.o[0] + t * ray.d[0], ray.o[1] + t * ray.d[1], ray.o[2] + t * ray.d[2]];
          const w = apply3(camRt, pc[0], pc[1], pc[2]);
          if (!(Math.abs(w[0]) < 1e6 && Math.abs(w[2]) < 1e6)) { OK[at] = 0; continue; }
          X[at] = w[0]; Z[at] = w[2]; OK[at] = 1;
          continue;
        }
        // object: ray into local space
        const ow = apply3(camRt, ray.o[0], ray.o[1], ray.o[2]);
        const dw = apply3(camRt, ray.d[0], ray.d[1], ray.d[2]);
        const ol = apply3(objRt, ow[0] - Tw[0], ow[1] - Tw[1], ow[2] - Tw[2]);
        const dl = apply3(objRt, dw[0], dw[1], dw[2]);
        ol[0] /= S.sx; ol[1] /= S.sy; ol[2] /= S.sz; dl[0] /= S.sx; dl[1] /= S.sy; dl[2] /= S.sz;
        let hit = null;
        if (info.prim === 'sphere') {
          const a = dl[0] * dl[0] + dl[1] * dl[1] + dl[2] * dl[2];
          const b = ol[0] * dl[0] + ol[1] * dl[1] + ol[2] * dl[2];
          const cc = ol[0] * ol[0] + ol[1] * ol[1] + ol[2] * ol[2] - rad * rad;
          let disc = b * b - a * cc;
          if (disc < 0) disc = disc > -1e-6 * rad * rad * a ? 0 : -1;
          if (disc >= 0) hit = (-b - Math.sqrt(disc)) / a;
        } else {
          let t0 = -Infinity; let t1 = Infinity; let miss = false;
          for (let ax = 0; ax < 3 && !miss; ax++) {
            const d = dl[ax]; const o0 = ol[ax];
            if (Math.abs(d) < 1e-12) { if (Math.abs(o0) > half[ax] + FACE_TOL) miss = true; continue; }
            let ta = (-half[ax] - o0) / d; let tb = (half[ax] - o0) / d;
            if (ta > tb) { const sw = ta; ta = tb; tb = sw; }
            if (ta > t0) t0 = ta;
            if (tb < t1) t1 = tb;
            if (t0 > t1 + 1e-9) miss = true;
          }
          if (!miss) hit = t0;
        }
        if (hit === null || !Number.isFinite(hit)) { OK[at] = 0; continue; }
        const lx = ol[0] + hit * dl[0]; const ly = ol[1] + hit * dl[1]; const lz = ol[2] + hit * dl[2];
        X[at] = lx; Y[at] = ly; Z[at] = lz; OK[at] = 1;
        if (info.prim === 'box') {
          let m = 0;
          const L = [lx, ly, lz];
          for (let ax = 0; ax < 3; ax++) {
            if (L[ax] >= half[ax] - FACE_TOL) m |= AXIS_BITS[ax][0];
            if (L[ax] <= -half[ax] + FACE_TOL) m |= AXIS_BITS[ax][1];
          }
          MASK[at] = m || 63;
        }
      }
    }
    start[paths.length] = at;
    stats.lifts += 1;
    return { X, Y, Z, MASK, OK, start, kind, metas, count: paths.length };
  }
  const buildLift = (info, paths) => {
    const it = liftGen(info, paths, 0);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  };

  // ── snapshot ─────────────────────────────────────────────────────────────
  // `raw` is the assembled scene input, `paths` the settled ink the canvas shows.
  const snapshot = (raw, bounds, paths) => {
    stats.snapshots += 1;
    if (!Array.isArray(paths) || !paths.length) return refuse('no-paths');
    const info = describe(raw, bounds);
    if (!info) return null;
    let lift;
    try { lift = buildLift(info, paths); } catch (_) { return refuse('lift-threw'); }
    if (!lift) return null;
    return { info, paths, lift };
  };

  // The same snapshot, lifted in slices of `sliceMs` that yield to the event loop (the settle that
  // follows a worker compose must not hold the main thread). `onDone(snap | null)` fires when complete;
  // the returned handle cancels it.
  const snapshotSliced = (raw, bounds, paths, onDone, sliceMs = 5) => {
    stats.snapshots += 1;
    let cancelled = false;
    if (!Array.isArray(paths) || !paths.length) { refuse('no-paths'); onDone(null); return { cancel() {} }; }
    const info = describe(raw, bounds);
    if (!info) { onDone(null); return { cancel() {} }; }
    const it = liftGen(info, paths, sliceMs);
    const step = () => {
      if (cancelled) return;
      let r;
      try { r = it.next(); } catch (_) { refuse('lift-threw'); onDone(null); return; }
      if (!r.done) { setTimeout(step, 0); return; }
      if (!r.value) { onDone(null); return; }
      const snap = { info, paths, lift: r.value };
      // Prime the lazily built parts (view-cone tiling, shadow lattice, JIT) in their own short tasks, so
      // the first drag frame pays for none of them.
      const stages = [
        () => { if (info.prim === 'sphere') sphereTiling(info, snap.lift); },
        () => { snap.lift._shadowFit = info.sunDir ? fitShadow(snap.lift) : null; snap.lift.hasShadow = Boolean(snap.lift._shadowFit); },
        () => { const nudge = { cam: Object.assign({}, info.pose.cam, { yaw: info.pose.cam.yaw + 0.01 }), obj: Object.assign({}, info.pose.obj) }; warp(snap, Object.assign({}, info, { pose: nudge })); },
        () => { const nudge = { cam: Object.assign({}, info.pose.cam, { pitch: info.pose.cam.pitch - 0.01 }), obj: Object.assign({}, info.pose.obj, { x: info.pose.obj.x + 0.1 }) }; warp(snap, Object.assign({}, info, { pose: nudge })); },
      ];
      const prime = () => {
        if (cancelled) return;
        const st = stages.shift();
        if (st) { try { st(); } catch (_) { /* priming is best effort */ } setTimeout(prime, 0); return; }
        onDone(snap);
      };
      prime();
    };
    setTimeout(step, 0);
    return { cancel() { cancelled = true; } };
  };

  // Can the preview frame for `raw` be served from this snapshot?
  const compatible = (snap, raw, bounds) => {
    if (!snap) return null;
    const now = describe(raw, bounds);
    if (!now || now.key !== snap.info.key || now.prim !== snap.info.prim || now.objId !== snap.info.objId) return null;
    return now;
  };

  // ── 2D occluders for ground marks (the object hides the floor behind it) ────
  const clipOutsideCircle = (a, b, cx, cy, r, out) => {
    const dx = b.x - a.x; const dy = b.y - a.y;
    const fx = a.x - cx; const fy = a.y - cy;
    const A = dx * dx + dy * dy; const B = 2 * (fx * dx + fy * dy); const C = fx * fx + fy * fy - r * r;
    const disc = B * B - 4 * A * C;
    if (A < 1e-18 || disc <= 0) { out.push([0, 1]); return; }
    const sq = Math.sqrt(disc);
    const t0 = (-B - sq) / (2 * A); const t1 = (-B + sq) / (2 * A);
    if (t1 <= 0 || t0 >= 1) { out.push([0, 1]); return; }
    if (t0 > 0) out.push([0, Math.min(1, t0)]);
    if (t1 < 1) out.push([Math.max(0, t1), 1]);
  };
  const clipOutsideConvex = (a, b, hull, out) => {
    // Cyrus-Beck for the INSIDE interval of a CCW convex polygon; the outside is its complement.
    let t0 = 0; let t1 = 1;
    const dx = b.x - a.x; const dy = b.y - a.y;
    for (let i = 0; i < hull.length; i++) {
      const p = hull[i]; const q = hull[(i + 1) % hull.length];
      const ex = q.x - p.x; const ey = q.y - p.y;
      const num = ex * (a.y - p.y) - ey * (a.x - p.x); // inside when >= 0 for CCW (screen y down handled by caller)
      const den = ex * dy - ey * dx;
      if (Math.abs(den) < 1e-12) { if (num < 0) { out.push([0, 1]); return; } continue; }
      const t = -num / den;
      if (den > 0) { if (t > t0) t0 = t; } else if (t < t1) t1 = t;
      if (t0 >= t1) { out.push([0, 1]); return; }
    }
    if (t0 > 0) out.push([0, t0]);
    if (t1 < 1) out.push([t1, 1]);
  };
  const convexHull = (pts) => {
    const P = pts.slice().sort((p, q) => (p.x - q.x) || (p.y - q.y));
    if (P.length < 3) return P;
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo = [];
    for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    const up = [];
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop();
    return lo.concat(up); // CCW in a y-up frame
  };

  const project = (pose, cx, cy, cz, out) => {
    const c = pose.cam;
    if (c.persp) {
      const denom = c.focal + c.dist - cz;
      if (denom <= c.focal * 0.05) return false;
      const s = (c.focal / denom) * c.scale;
      out.x = c.cx + cx * s; out.y = c.cy - cy * s;
      return true;
    }
    out.x = c.cx + cx * c.scale; out.y = c.cy - cy * c.scale;
    return true;
  };


  // ── cast shadow, re-projected per frame ────────────────────────────────────
  // The settled shadow is a world-fixed hatch lattice clipped to the object's shadow. If every shadow mark
  // is a straight segment on a regular lattice, the lattice can be rebuilt for ANY pose and clipped to the
  // shadow polygon of the CURRENT pose (hull of the silhouette projected along the sun onto y = 0).
  const fitShadow = (lift) => {
    const groups = new Map(); // angle key -> {ang, nx, nz, items:[{c, i, x0,z0,x1,z1}]}
    const { X, Z, OK, start, kind } = lift;
    for (let i = 0; i < lift.count; i++) {
      if (kind[i] !== 4) continue;
      const a = start[i]; const b = start[i + 1];
      let f = -1; let l = -1;
      for (let k = a; k < b; k++) if (OK[k]) { if (f < 0) f = k; l = k; }
      if (f < 0 || l === f) continue;
      const dx = X[l] - X[f]; const dz = Z[l] - Z[f];
      const len = Math.hypot(dx, dz);
      if (!(len > 1e-9)) continue;
      const ux = dx / len; const uz = dz / len;
      for (let k = f; k <= l; k++) {
        if (!OK[k]) return null;
        if (Math.abs((X[k] - X[f]) * -uz + (Z[k] - Z[f]) * ux) > 1e-3 * len + 1e-6) return null; // not straight
      }
      let ang = Math.atan2(uz, ux); if (ang < 0) ang += Math.PI; if (ang >= Math.PI - 1e-9) ang = 0;
      const ak = Math.round(ang * 1000);
      let g = groups.get(ak);
      if (!g) { g = { ux, uz, nx: -uz, nz: ux, items: [] }; groups.set(ak, g); }
      g.items.push({ c: g.nx * X[f] + g.nz * Z[f], i, t0: g.ux * X[f] + g.uz * Z[f], t1: g.ux * X[l] + g.uz * Z[l] });
    }
    if (!groups.size) return null;
    const out = [];
    groups.forEach((g) => {
      const cs = Array.from(new Set(g.items.map((it) => Math.round(it.c * 1e4) / 1e4))).sort((p, q) => p - q);
      const meta = new Map();
      g.items.forEach((it) => { const k = Math.round(it.c * 1e4) / 1e4; if (!meta.has(k)) meta.set(k, it.i); });
      let sp = 0;
      for (let k = 1; k < cs.length; k++) { const d = cs[k] - cs[k - 1]; if (d > 1e-6 && (sp === 0 || d < sp)) sp = d; }
      let regular = sp > 0;
      if (regular) for (let k = 0; k < cs.length; k++) { const q = (cs[k] - cs[0]) / sp; if (Math.abs(q - Math.round(q)) > 0.05) { regular = false; break; } }
      out.push({ g, cs, sp: regular ? sp : 0, mi: meta.get(cs[0]), meta });
    });
    return out;
  };

  // Convex polygon (CCW in the (x, z) frame) of the object's shadow on y = 0.
  const shadowHull = (now, sun) => {
    const pose = now.pose; const o = pose.obj;
    const objR = rotMatrix({ yaw: o.yaw, pitch: o.pitch, roll: o.roll });
    const pts = [];
    const cast = (wx, wy, wz) => {
      const s = -wy / sun[1];
      pts.push({ x: wx + s * sun[0], y: wz + s * sun[2] });
    };
    if (now.prim === 'sphere') {
      const r = now.radius * o.sx;
      let ux = sun[1]; let uy = -sun[0]; let uz = 0; // any vector perpendicular to the sun
      if (Math.hypot(ux, uy) < 1e-6) { ux = 0; uy = sun[2]; uz = -sun[1]; }
      const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
      const wx = sun[1] * uz - sun[2] * uy; const wy = sun[2] * ux - sun[0] * uz; const wz = sun[0] * uy - sun[1] * ux;
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * Math.PI * 2; const ca = Math.cos(a) * r; const sa = Math.sin(a) * r;
        cast(o.x + ca * ux + sa * wx, o.y + ca * uy + sa * wy, o.z + ca * uz + sa * wz);
      }
    } else {
      for (let i = 0; i < 8; i++) {
        const l = apply3(objR, (i & 1 ? 1 : -1) * now.half[0] * o.sx, (i & 2 ? 1 : -1) * now.half[1] * o.sy, (i & 4 ? 1 : -1) * now.half[2] * o.sz);
        cast(o.x + l[0], o.y + l[1], o.z + l[2]);
      }
    }
    const hull = convexHull(pts);
    return hull.length >= 3 ? hull : null;
  };
  const chordOfLine = (px, pz, dx, dz, hull) => {
    let t0 = -Infinity; let t1 = Infinity;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i]; const b = hull[(i + 1) % hull.length];
      const ex = b.x - a.x; const ez = b.y - a.y;
      const num = ex * (pz - a.y) - ez * (px - a.x);
      const den = ex * dz - ez * dx;
      if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
      const t = -num / den;
      if (den > 0) { if (t > t0) t0 = t; } else if (t < t1) t1 = t;
    }
    return t0 < t1 && Number.isFinite(t0) && Number.isFinite(t1) ? [t0, t1] : null;
  };

  // The unit sphere's tiling: the settled view cone (x0 >= |x1|, |x2| in the view basis b0,b1,b2) is the
  // best-sampled ink; six proper rotations carry it onto the six octahedral cells, so a turning sphere
  // shows ink of the right density everywhere instead of a stretched limb band and a gap.
  const sphereTiling = (info, lift) => {
    if (lift._tile) return lift._tile;
    const M0 = poseMatrices(info, info.pose).M;
    let b0 = [M0[6], M0[7], M0[8]];
    const nl = Math.hypot(b0[0], b0[1], b0[2]) || 1; b0 = b0.map((v) => v / nl);
    let b1 = Math.abs(b0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const d = b1[0] * b0[0] + b1[1] * b0[1] + b1[2] * b0[2];
    b1 = [b1[0] - d * b0[0], b1[1] - d * b0[1], b1[2] - d * b0[2]];
    const l1 = Math.hypot(b1[0], b1[1], b1[2]); b1 = b1.map((v) => v / l1);
    const b2 = [b0[1] * b1[2] - b0[2] * b1[1], b0[2] * b1[0] - b0[0] * b1[2], b0[0] * b1[1] - b0[1] * b1[0]];
    const B = [b0[0], b1[0], b2[0], b0[1], b1[1], b2[1], b0[2], b1[2], b2[2]]; // columns b0,b1,b2
    const Bt = tr3(B);
    const P = [ // coordinates in the (b0,b1,b2) basis
      [1, 0, 0, 0, 1, 0, 0, 0, 1],
      [-1, 0, 0, 0, 1, 0, 0, 0, -1],
      [0, 1, 0, -1, 0, 0, 0, 0, 1],
      [0, -1, 0, 1, 0, 0, 0, 0, 1],
      [0, 0, 1, 0, 1, 0, -1, 0, 0],
      [0, 0, -1, 0, 1, 0, 1, 0, 0],
    ];
    const T = P.map((m) => mul3(B, mul3(m, Bt)));
    const cell = new Uint8Array(lift.X.length);
    const { X, Y, Z } = lift;
    for (let k = 0; k < X.length; k++) {
      const x0 = X[k] * b0[0] + Y[k] * b0[1] + Z[k] * b0[2];
      const x1 = X[k] * b1[0] + Y[k] * b1[1] + Z[k] * b1[2];
      const x2 = X[k] * b2[0] + Y[k] * b2[1] + Z[k] * b2[2];
      cell[k] = (x0 >= Math.abs(x1) && x0 >= Math.abs(x2)) ? 1 : 0;
    }
    lift._tile = { T, cell };
    return lift._tile;
  };
  const MIN_FACING = 0.25; // sphere: marks foreshortened past this cosine are dropped, not piled on the rim

  // ── warp ─────────────────────────────────────────────────────────────────
  const warp = (snap, now) => {
    stats.warps += 1;
    const { info, lift, paths } = snap;
    const pose = now.pose; const spose = info.pose;
    const camSame = sameCamera(pose.cam, spose.cam);
    const objSame = sameObject(pose.obj, spose.obj);
    if (camSame && objSame) return paths.slice();
    const { camR, A, cT, M } = poseMatrices(now, pose);
    const sphere = now.prim === 'sphere';
    const c = pose.cam;
    const camPz = c.persp ? c.focal + c.dist : 0;
    const out = [];
    const tmp = { x: 0, y: 0 };

    // box faces: front flags (+X,-X,+Y,-Y,+Z,-Z => bits 1,2,4,8,16,32)
    let frontMask = 0;
    if (!sphere) {
      for (let ax = 0; ax < 3; ax++) {
        for (let sg = 0; sg < 2; sg++) {
          const sign = sg === 0 ? 1 : -1;
          const nx = sign * M[ax]; const ny = sign * M[3 + ax]; const nz = sign * M[6 + ax];
          // face centre in camera space: A * (sign*h_ax * e_ax) + cT
          const fx = A[ax] * sign * now.half[ax] + cT[0]; const fy = A[3 + ax] * sign * now.half[ax] + cT[1]; const fz = A[6 + ax] * sign * now.half[ax] + cT[2];
          const front = c.persp ? (nx * (0 - fx) + ny * (0 - fy) + nz * (camPz - fz)) > 1e-9 : nz > 1e-9;
          if (front) frontMask |= AXIS_BITS[ax][sg];
        }
      }
    }
    const swapMask = (m) => (((m & 21) << 1) | ((m >> 1) & 21));

    // sphere silhouette similarity: centre + radius on screen, before / after
    let simK = 1; let simDx = 0; let simDy = 0; let simCx0 = 0; let simCy0 = 0;
    let occ = null; // {circle:{cx,cy,r}} | {hull}
    {
      const sCam = apply3(poseMatrices(info, spose).camR, spose.obj.x, spose.obj.y, spose.obj.z);
      const p0 = { x: 0, y: 0 }; const p1 = { x: 0, y: 0 };
      if (sphere) {
        if (project(spose, sCam[0], sCam[1], sCam[2], p0) && project(pose, cT[0], cT[1], cT[2], p1)) {
          const rr = (P, p, z) => info.radius * P.obj.sx * (p.persp ? (p.focal / Math.max(p.focal * 0.05, p.focal + p.dist - z)) : 1) * p.scale;
          const r0 = rr(spose, spose.cam, sCam[2]); const r1 = rr(pose, c, cT[2]);
          simK = r0 > 0 ? r1 / r0 : 1; simCx0 = p0.x; simCy0 = p0.y; simDx = p1.x; simDy = p1.y;
          occ = { circle: { cx: p1.x, cy: p1.y, r: r1 } };
        }
      } else {
        const pts = [];
        for (let i = 0; i < 8; i++) {
          const lx = (i & 1 ? 1 : -1) * now.half[0]; const ly = (i & 2 ? 1 : -1) * now.half[1]; const lz = (i & 4 ? 1 : -1) * now.half[2];
          const q = {};
          const cc = [A[0] * lx + A[1] * ly + A[2] * lz + cT[0], A[3] * lx + A[4] * ly + A[5] * lz + cT[1], A[6] * lx + A[7] * ly + A[8] * lz + cT[2]];
          if (project(pose, cc[0], cc[1], cc[2], q)) pts.push({ x: q.x, y: -q.y }); // y-up for the hull
        }
        const hull = pts.length >= 3 ? convexHull(pts) : null;
        if (hull && hull.length >= 3) occ = { hull: hull.map((q) => ({ x: q.x, y: q.y })) };
      }
    }

    const emit = (i, pts) => {
      if (pts.length < 2) return;
      pts.meta = lift.metas[i];
      out.push(pts);
    };
    const antiOut = [];
    const { X, Y, Z, MASK, OK, start, kind, metas } = lift;
    const gc0 = apply3(camR, 1, 0, 0); const gc2 = apply3(camR, 0, 0, 1);
    const spans = [];
    const tiling = sphere ? sphereTiling(info, lift) : null;
    const tileAT = tiling ? tiling.T.map((Tm) => mul3(A, Tm)) : null;

    // ground marks: project the world points, then drop what the object hides. `pts` (array of [x,z]) overrides the lift.
    const groundRun = (i, a, b, pts) => {
      let run = [];
      const flush = () => { if (run.length >= 2) emit(i, run); run = []; };
      const pr = [];
      const n = pts ? pts.length : b - a;
      for (let k = 0; k < n; k++) {
        let wx; let wz;
        if (pts) { wx = pts[k][0]; wz = pts[k][1]; } else { if (!OK[a + k]) { pr.push(null); continue; } wx = X[a + k]; wz = Z[a + k]; }
        const cx = gc0[0] * wx + gc2[0] * wz; const cy = gc0[1] * wx + gc2[1] * wz; const cz = gc0[2] * wx + gc2[2] * wz;
        const q = { x: 0, y: 0 };
        pr.push(project(pose, cx, cy, cz, q) ? q : null);
      }
      for (let k = 0; k + 1 < pr.length; k++) {
        const p0 = pr[k]; const p1 = pr[k + 1];
        if (!p0 || !p1) { flush(); continue; }
        spans.length = 0;
        if (occ && occ.circle) clipOutsideCircle(p0, p1, occ.circle.cx, occ.circle.cy, occ.circle.r, spans);
        else if (occ && occ.hull) {
          const f0 = { x: p0.x, y: -p0.y }; const f1 = { x: p1.x, y: -p1.y };
          clipOutsideConvex(f0, f1, occ.hull, spans);
        } else spans.push([0, 1]);
        const dx = p1.x - p0.x; const dy = p1.y - p0.y;
        for (let s = 0; s < spans.length; s++) {
          const t0 = spans[s][0]; const t1 = spans[s][1];
          if (t1 - t0 < 1e-9) continue;
          const q0 = { x: p0.x + dx * t0, y: p0.y + dy * t0 };
          const q1 = { x: p0.x + dx * t1, y: p0.y + dy * t1 };
          if (!(run.length && t0 === 0 && s === 0)) { flush(); run.push(q0); }
          run.push(q1);
          if (t1 < 1) flush();
        }
      }
      flush();
    };
    let shadowFit;
    if (info.sunDir && now.sunDir && lift.hasShadow !== false) {
      if (lift._shadowFit === undefined) { lift._shadowFit = fitShadow(lift); lift.hasShadow = Boolean(lift._shadowFit); }
      shadowFit = lift._shadowFit || undefined;
    }
    if (shadowFit) {
      const hull = shadowHull(now, now.sunDir);
      if (!hull) shadowFit = undefined;
      else {
        for (let gi = 0; gi < shadowFit.length; gi++) {
          const { g, cs, sp, meta } = shadowFit[gi];
          let cmin = Infinity; let cmax = -Infinity;
          hull.forEach((q) => { const c = g.nx * q.x + g.nz * q.y; if (c < cmin) cmin = c; if (c > cmax) cmax = c; });
          const offs = [];
          if (sp > 0 && (cmax - cmin) / sp < 4000) {
            const k0 = Math.ceil((cmin - cs[0]) / sp - 1e-9); const k1 = Math.floor((cmax - cs[0]) / sp + 1e-9);
            for (let k = k0; k <= k1; k++) offs.push(cs[0] + k * sp);
          } else cs.forEach((c) => { if (c >= cmin && c <= cmax) offs.push(c); });
          for (let oi = 0; oi < offs.length; oi++) {
            const c = offs[oi];
            const px = g.nx * c; const pz = g.nz * c;
            const ch = chordOfLine(px, pz, g.ux, g.uz, hull);
            if (!ch) continue;
            const mk = meta.get(Math.round(c * 1e4) / 1e4);
            groundRun(mk === undefined ? shadowFit[gi].mi : mk, 0, 0, [[px + g.ux * ch[0], pz + g.uz * ch[0]], [px + g.ux * ch[1], pz + g.uz * ch[1]]]);
          }
        }
      }
    }
    for (let i = 0; i < lift.count; i++) {
      const a = start[i]; const b = start[i + 1];
      const kd = kind[i];
      if (kd === 3) { out.push(paths[i]); continue; }
      if (kd === 2) {
        const src = paths[i]; const pts = new Array(src.length);
        for (let j = 0; j < src.length; j++) pts[j] = { x: simDx + (src[j].x - simCx0) * simK, y: simDy + (src[j].y - simCy0) * simK };
        emit(i, pts);
        continue;
      }
      if (kd === 4 && shadowFit !== undefined && shadowFit) { continue; } // rebuilt below, once
      if (kd === 1 || kd === 4) {
        groundRun(i, a, b, null);
        continue;
      }
      if (sphere) {
        // six rotated copies of the settled view cone tile the whole sphere (see sphereTiling)
        const { T, cell } = tiling;
        for (let ti = 0; ti < 6; ti++) {
          const dest = ti === 0 ? out : antiOut;
          // A * T applied to a local point
          const AT = tileAT[ti];
          let run = [];
          for (let k = a; k < b; k++) {
            let vis = OK[k] === 1 && cell[k] === 1;
            let px = 0; let py = 0;
            if (vis) {
              const cx = AT[0] * X[k] + AT[1] * Y[k] + AT[2] * Z[k] + cT[0];
              const cy = AT[3] * X[k] + AT[4] * Y[k] + AT[5] * Z[k] + cT[1];
              const cz = AT[6] * X[k] + AT[7] * Y[k] + AT[8] * Z[k] + cT[2];
              const nx = cx - cT[0]; const ny = cy - cT[1]; const nz = cz - cT[2];
              if (c.persp) {
                const vx = -cx; const vy = -cy; const vz = camPz - cz;
                vis = (nx * vx + ny * vy + nz * vz) > MIN_FACING * Math.sqrt((nx * nx + ny * ny + nz * nz) * (vx * vx + vy * vy + vz * vz));
              } else vis = nz > MIN_FACING * Math.sqrt(nx * nx + ny * ny + nz * nz);
              if (vis) { vis = project(pose, cx, cy, cz, tmp); px = tmp.x; py = tmp.y; }
            }
            if (vis) run.push({ x: px, y: py });
            else {
              if (run.length >= 2) { run.meta = metas[i]; dest.push(run); }
              run = [];
            }
          }
          if (run.length >= 2) { run.meta = metas[i]; dest.push(run); }
        }
        continue;
      }
      // box marks: this copy, and the antipodal copy
      for (let copy = 0; copy < 2; copy++) {
        const sg = copy === 0 ? 1 : -1;
        const dest = copy === 0 ? out : antiOut;
        let run = [];
        for (let k = a; k < b; k++) {
          let vis = OK[k] === 1;
          let px = 0; let py = 0;
          if (vis) {
            const lx = sg * X[k]; const ly = sg * Y[k]; const lz = sg * Z[k];
            const cx = A[0] * lx + A[1] * ly + A[2] * lz + cT[0];
            const cy = A[3] * lx + A[4] * ly + A[5] * lz + cT[1];
            const cz = A[6] * lx + A[7] * ly + A[8] * lz + cT[2];
            const m = copy === 0 ? MASK[k] : swapMask(MASK[k]);
            vis = (m & frontMask) !== 0;
            if (vis) { vis = project(pose, cx, cy, cz, tmp); px = tmp.x; py = tmp.y; }
          }
          if (vis) run.push({ x: px, y: py });
          else {
            if (run.length >= 2) { run.meta = metas[i]; dest.push(run); }
            run = [];
          }
        }
        if (run.length >= 2) { run.meta = metas[i]; dest.push(run); }
      }
    }
    for (let i = 0; i < antiOut.length; i++) out.push(antiOut[i]);
    return out;
  };

  Scene3D.PosePreview = { snapshot, snapshotSliced, compatible, warp, stats, describe, _internals: { rotMatrix, mul3 } };

  if (typeof module !== 'undefined' && module.exports) module.exports = Scene3D.PosePreview;
})();
