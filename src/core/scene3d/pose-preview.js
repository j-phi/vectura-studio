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
    return {
      key, prim, objId: o.id, pose, width, height,
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

  const buildLift = (info, paths) => {
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
    const kind = new Uint8Array(paths.length); // 0 object, 1 ground (plane), 2 sphere silhouette (screen similarity), 3 untouched
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
        kind[i] = 1;
      } else return refuse(`target:${tg.objectId}`);
      for (let j = 0; j < path.length; j++, at++) {
        const q = path[j];
        const sx = q.x; const sy = q.y;
        if (kind[i] === 2) { X[at] = sx; Y[at] = sy; OK[at] = 1; continue; }
        const ray = screenRay(pose, sx, sy);
        if (kind[i] === 1) {
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
      if (kd === 1) {
        // project the ground vertices, then drop what the object hides
        let run = [];
        const flush = () => { if (run.length >= 2) emit(i, run); run = []; };
        const pr = [];
        for (let k = a; k < b; k++) {
          if (!OK[k]) { pr.push(null); continue; }
          const wx = X[k]; const wz = Z[k];
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
            // hull is y-up; flip the segment into the same frame
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
        continue;
      }
      // object marks: this copy, and the antipodal copy
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
            if (sphere) {
              const nx = cx - cT[0]; const ny = cy - cT[1]; const nz = cz - cT[2];
              vis = c.persp ? (nx * (0 - cx) + ny * (0 - cy) + nz * (camPz - cz)) > 0 : nz > 0;
            } else {
              const m = copy === 0 ? MASK[k] : swapMask(MASK[k]);
              vis = (m & frontMask) !== 0;
            }
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

  Scene3D.PosePreview = { snapshot, compatible, warp, stats, describe, _internals: { rotMatrix, mul3 } };

  if (typeof module !== 'undefined' && module.exports) module.exports = Scene3D.PosePreview;
})();
