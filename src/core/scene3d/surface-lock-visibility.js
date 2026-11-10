/**
 * Scene3D.SurfaceLockVisibility — per-frame visibility from a cached object-space mesh: triangle occluder
 * (screen-binned depth lookup) and the per-frame outline (docs/surface-lock-contract.md §7, §13).
 * Owned by work unit W1-E of the surface-lock plan.
 *
 *   supports(obj)                       -> boolean   a primitive class this module can bake (no CSG / boolean units)
 *   meshBake(obj)                       -> MeshBake  POSE-FREE object-space data: per-axis-scaled vertices, face polygons
 *                                                    + normals, a fan triangulation, edge adjacency, convexity, analytic hints.
 *                                                    Reads only obj.primitive, obj.params and the scale keys of obj.transform.
 *   occluder(meshBakes, pose)           -> Occluder  every front-facing cached triangle of every object, transformed by its
 *                                                    pose and binned over the projected scene (at most 512 x 512 cells).
 *   outline(meshBake, pose, occluder?)  -> { silhouette, crease, boundary }, each an array of visible runs
 *                                                    { pts: [{x,y,z}], visible: true, ... } (the clipper result shape).
 *
 * pose: Pose = { cam, obj } (contract §4). For occluder(), pose is { cam, objs: [obj pose per bake] }, an array of
 * Pose objects that share one cam, or a single Pose for a single bake. outline() takes the Pose of its own object and
 * finds that object inside the occluder by meshBake identity (or objectId).
 *
 * The occluder bins triangles instead of rasterising a cell-centre depth: each cell keeps the triangles that touch it and a
 * query evaluates their screen-space support plane exactly at (x, y). That is the arithmetic of hlr.js
 * (buildOccluders / hiddenAt), minus its per-query bbox scan, so visibility agrees with the HLR clipper to the cell
 * boundary rather than to a cell centre, and there is no raster aliasing at a contour.
 *
 * Own-object rule (matches the pose-mode segCtx): a mark (mode 'fill') of a convex object never sees its own triangles;
 * a non-convex object's marks see them through SELF_BIAS_MM, or, for a torus, through TorusOcclusion's analytic field.
 * An edge (mode 'edge') sees every triangle of its own object except the faces adjacent to it, at DEPTH_BIAS_MM.
 */
(function registerScene3DSurfaceLockVisibility() {
  'use strict';

  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const Scene3D = (Vectura.Scene3D = Vectura.Scene3D || {});

  // TODO(config): move the constants below to SCENE3D_SURFACE_LOCK (orchestrator, after the Wave 1 merge).
  const DEPTH_BIAS_MM = 0.05;          // cross-object depth margin (the HLR clipper's HLR_BIAS)
  const SELF_BIAS_MM = 6;              // non-convex own-object margin for marks (hlr.js SELF_OCCLUDE_BIAS)
  const MAX_CELLS = 512;               // occluder grid, cells per side
  const CELL_TRIANGLES = 1; // TODO(config): grid cell edge in mean triangle extents
  const RUN_STEP_MM = 1;               // sample pitch along a run to find visibility changes
  const RUN_RESOLUTION_MM = 0.05;      // visibility changes are bisected to this length
  const CREASE_ANGLE_DEG = 28;         // Edges.DEFAULT_CREASE_ANGLE
  const NEAR_FRACTION = 0.05;          // geometry3d projectPoint near plane: denom <= 0.05 * focal is invalid
  const LIMB_SAGITTA_MM = 0.002;       // chord error of the analytic limb polyline
  const LIMB_MIN_POINTS = 72;
  const LIMB_MAX_POINTS = 1440;
  const MIN_TRI_AREA2 = 1e-6;          // hlr.js: a footprint below this occludes nothing
  const TORUS_ANALYTIC = true;         // Torus self-occlusion through TorusOcclusion (contract §7); false = triangle buffer
  const TORUS_GAP_MM = 8;              // algorithms/scene3d.js TORUS_SELF_OCCLUDE_GAP_MM
  const TORUS_MARGIN_MM = 1;           // algorithms/scene3d.js TORUS_SELF_OCCLUDE_MARGIN_MM

  const SUPPORTED = new Set(['sphere', 'ellipsoid', 'cylinder', 'cone', 'capsule', 'superellipsoid', 'pyramid',
    'torus', 'torusKnot', 'box', 'plane', 'solid']);
  const ALWAYS_CONVEX = new Set(['box', 'plane', 'sphere', 'ellipsoid', 'cylinder', 'cone', 'capsule', 'pyramid']);
  const ALWAYS_NONCONVEX = new Set(['torus', 'torusKnot']);
  const CONVEXITY_BUDGET = 3000000;
  const CONVEXITY_EPS = 1e-6;

  const finite = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  const degToRad = (d) => (d * Math.PI) / 180;

  // ── Linear algebra (row-major 3x3, the PosePreview recipe) ──────────────────────────────────────────────────────────

  const rotMatrix = (angles) => {
    const rot = Vectura.Geometry3D.makeRotator({ yaw: finite(angles.yaw, 0), pitch: finite(angles.pitch, 0), roll: finite(angles.roll, 0) });
    const ex = rot({ x: 1, y: 0, z: 0 }); const ey = rot({ x: 0, y: 1, z: 0 }); const ez = rot({ x: 0, y: 0, z: 1 });
    return [ex.x, ey.x, ez.x, ex.y, ey.y, ez.y, ex.z, ey.z, ez.z];
  };
  const mul3 = (A, B) => {
    const out = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
    return out;
  };

  // Everything one frame needs from a Pose: c = A p + cT, view parameters, projection.
  const frameOf = (pose) => {
    const cam = pose.cam; const o = pose.obj;
    const camR = rotMatrix(cam); const objR = rotMatrix(o);
    const A = mul3(camR, objR);
    const ox = finite(o.x, 0); const oy = finite(o.y, 0); const oz = finite(o.z, 0);
    const persp = !!cam.persp;
    return {
      A,
      cT: [camR[0] * ox + camR[1] * oy + camR[2] * oz, camR[3] * ox + camR[4] * oy + camR[5] * oz, camR[6] * ox + camR[7] * oy + camR[8] * oz],
      persp,
      scale: finite(cam.scale, 1),
      cx: finite(cam.cx, 0),
      cy: finite(cam.cy, 0),
      focal: persp ? finite(cam.focal, 520) : 0,
      dist: persp ? finite(cam.dist, 620) : 0,
    };
  };

  // Camera-space vertices, screen positions and validity of a bake under a frame (geometry3d.projectPoint arithmetic).
  const transformMesh = (bake, fr) => {
    const n = bake.vertexCount;
    const P = bake.vertices; const A = fr.A; const cT = fr.cT;
    const cz = new Float64Array(n); const X = new Float64Array(n); const Y = new Float64Array(n); const ok = new Uint8Array(n);
    const near = fr.focal * NEAR_FRACTION;
    for (let i = 0; i < n; i++) {
      const px = P[3 * i]; const py = P[3 * i + 1]; const pz = P[3 * i + 2];
      const x = A[0] * px + A[1] * py + A[2] * pz + cT[0];
      const y = A[3] * px + A[4] * py + A[5] * pz + cT[1];
      const z = A[6] * px + A[7] * py + A[8] * pz + cT[2];
      cz[i] = z;
      if (fr.persp) {
        const denom = fr.focal + fr.dist - z;
        if (denom <= near) { ok[i] = 0; continue; }
        const s = (fr.focal / denom) * fr.scale;
        X[i] = fr.cx + x * s; Y[i] = fr.cy - y * s;
      } else {
        X[i] = fr.cx + x * fr.scale; Y[i] = fr.cy - y * fr.scale;
      }
      ok[i] = 1;
    }
    return { cz, X, Y, ok };
  };

  // Per-face front flag (scene.js faceRecord): orthographic n_c.z > 0, perspective n_c . (eye - centroid_c) > 0.
  const faceFronts = (bake, fr) => {
    const F = bake.faceCount; const N = bake.faceNormals; const C = bake.faceCentroids; const A = fr.A; const cT = fr.cT;
    const out = new Uint8Array(F);
    for (let f = 0; f < F; f++) {
      const nx = N[3 * f]; const ny = N[3 * f + 1]; const nz = N[3 * f + 2];
      const ncx = A[0] * nx + A[1] * ny + A[2] * nz;
      const ncy = A[3] * nx + A[4] * ny + A[5] * nz;
      const ncz = A[6] * nx + A[7] * ny + A[8] * nz;
      if (!fr.persp) { out[f] = ncz > 0 ? 1 : 0; continue; }
      const px = C[3 * f]; const py = C[3 * f + 1]; const pz = C[3 * f + 2];
      const cx = A[0] * px + A[1] * py + A[2] * pz + cT[0];
      const cy = A[3] * px + A[4] * py + A[5] * pz + cT[1];
      const cz = A[6] * px + A[7] * py + A[8] * pz + cT[2];
      out[f] = (ncx * (0 - cx) + ncy * (0 - cy) + ncz * (fr.focal + fr.dist - cz)) > 0 ? 1 : 0;
    }
    return out;
  };

  // ── supports / meshBake ─────────────────────────────────────────────────────────────────────────────────────────────

  const supports = (obj) => Boolean(obj && typeof obj === 'object' && SUPPORTED.has(obj.primitive)
    && obj.primitive !== 'csg' && !(obj.params && obj.params.pretransformed));

  const isConvexMesh = (verts, faces) => {
    const V = verts.length / 3; const F = faces.length;
    if (V < 4 || F < 2) return true;
    if (V * F > CONVEXITY_BUDGET) return false;
    for (let fi = 0; fi < F; fi++) {
      const face = faces[fi];
      if (face.length < 3) continue;
      const a = face[0]; const b = face[1]; const c = face[2];
      const ux = verts[3 * b] - verts[3 * a]; const uy = verts[3 * b + 1] - verts[3 * a + 1]; const uz = verts[3 * b + 2] - verts[3 * a + 2];
      const wx = verts[3 * c] - verts[3 * a]; const wy = verts[3 * c + 1] - verts[3 * a + 1]; const wz = verts[3 * c + 2] - verts[3 * a + 2];
      let nx = uy * wz - uz * wy; let ny = uz * wx - ux * wz; let nz = ux * wy - uy * wx;
      const l = Math.hypot(nx, ny, nz); if (l < 1e-12) continue;
      nx /= l; ny /= l; nz /= l;
      for (let vi = 0; vi < V; vi++) {
        const d = nx * (verts[3 * vi] - verts[3 * a]) + ny * (verts[3 * vi + 1] - verts[3 * a + 1]) + nz * (verts[3 * vi + 2] - verts[3 * a + 2]);
        if (d > CONVEXITY_EPS) return false;
      }
    }
    return true;
  };

  const meshBake = (obj) => {
    const Scene = Scene3D.Scene;
    if (!supports(obj) || !Scene || typeof Scene.buildPrimitiveMesh !== 'function') {
      throw new Error('SurfaceLockVisibility.meshBake: unsupported object');
    }
    const mesh = Scene.buildPrimitiveMesh(obj, 1);
    const t = obj.transform || {};
    const s = finite(t.scale, 1);
    const sx = finite(t.sx, s); const sy = finite(t.sy, s); const sz = finite(t.sz, s);
    const V = mesh.vertices.length;
    const vertices = new Float64Array(3 * V);
    for (let i = 0; i < V; i++) {
      const p = mesh.vertices[i];
      vertices[3 * i] = p.x * sx; vertices[3 * i + 1] = p.y * sy; vertices[3 * i + 2] = p.z * sz;
    }
    const F = mesh.faces.length;
    const faceStart = new Int32Array(F + 1);
    let corners = 0;
    mesh.faces.forEach((f, i) => { faceStart[i] = corners; corners += f.length; });
    faceStart[F] = corners;
    const faceVerts = new Int32Array(corners);
    const faceNormals = new Float64Array(3 * F); const faceCentroids = new Float64Array(3 * F);
    let triCount = 0;
    mesh.faces.forEach((face, fi) => {
      const L = face.length;
      let nx = 0; let ny = 0; let nz = 0; let cx = 0; let cy = 0; let cz = 0;
      for (let k = 0; k < L; k++) {
        const a = face[k]; const b = face[(k + 1) % L];
        faceVerts[faceStart[fi] + k] = a;
        const ax = vertices[3 * a]; const ay = vertices[3 * a + 1]; const az = vertices[3 * a + 2];
        const bx = vertices[3 * b]; const by = vertices[3 * b + 1]; const bz = vertices[3 * b + 2];
        nx += (ay - by) * (az + bz); ny += (az - bz) * (ax + bx); nz += (ax - bx) * (ay + by); // Geometry3D.faceNormal (Newell)
        cx += ax; cy += ay; cz += az;
      }
      const nl = Math.hypot(nx, ny, nz);
      if (nl > 1e-12) { nx /= nl; ny /= nl; nz /= nl; } else { nx = 0; ny = 0; nz = 1; }
      faceNormals[3 * fi] = nx; faceNormals[3 * fi + 1] = ny; faceNormals[3 * fi + 2] = nz;
      const cnt = Math.max(1, L);
      faceCentroids[3 * fi] = cx / cnt; faceCentroids[3 * fi + 1] = cy / cnt; faceCentroids[3 * fi + 2] = cz / cnt;
      triCount += Math.max(0, L - 2);
    });
    const triVerts = new Int32Array(3 * triCount); const triFace = new Int32Array(triCount);
    let ti = 0;
    mesh.faces.forEach((face, fi) => {
      for (let k = 1; k + 1 < face.length; k++) {
        triVerts[3 * ti] = face[0]; triVerts[3 * ti + 1] = face[k]; triVerts[3 * ti + 2] = face[k + 1]; triFace[ti] = fi; ti += 1;
      }
    });
    // Edge adjacency in Geometry3D.collectEdges order (insertion order over faces, then corners).
    const edgeMap = new Map(); const eA = []; const eB = []; const eF0 = []; const eF1 = []; const eN = [];
    mesh.faces.forEach((face, fi) => {
      for (let k = 0; k < face.length; k++) {
        const a = face[k]; const b = face[(k + 1) % face.length];
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        let e = edgeMap.get(key);
        if (e === undefined) { e = eA.length; edgeMap.set(key, e); eA.push(a); eB.push(b); eF0.push(fi); eF1.push(-1); eN.push(1); continue; }
        eN[e] += 1;
        if (eN[e] === 2) eF1[e] = fi;
      }
    });
    const E = eA.length;
    const edgeCreaseDot = new Float64Array(E);
    for (let e = 0; e < E; e++) {
      if (eN[e] !== 2) { edgeCreaseDot[e] = NaN; continue; }
      const a = eF0[e]; const b = eF1[e];
      edgeCreaseDot[e] = faceNormals[3 * a] * faceNormals[3 * b] + faceNormals[3 * a + 1] * faceNormals[3 * b + 1] + faceNormals[3 * a + 2] * faceNormals[3 * b + 2];
    }
    const prim = obj.primitive;
    let convex;
    if (ALWAYS_CONVEX.has(prim)) convex = true;
    else if (ALWAYS_NONCONVEX.has(prim)) convex = false;
    else convex = isConvexMesh(vertices, mesh.faces);
    const pr = obj.params || {};
    let analytic = null;
    if (prim === 'sphere' || prim === 'ellipsoid') {
      const r = finite(pr.radius, 20);
      const ax = prim === 'sphere' ? r : finite(pr.sx, 20);
      const ay = prim === 'sphere' ? r : finite(pr.sy, 20);
      const az = prim === 'sphere' ? r : finite(pr.sz, 20);
      analytic = { kind: 'ellipsoid', radii: [ax * sx, ay * sy, az * sz] };
    }
    const torus = prim === 'torus'
      ? { sizes: { sx: finite(pr.sx, 20), sy: finite(pr.sy, 20), sz: finite(pr.sz, 20) }, scale: [sx, sy, sz] }
      : null;
    return {
      objectId: obj.id, primitive: prim, convex, analytic, torus,
      scale: [sx, sy, sz],
      vertexCount: V, vertices,
      faceCount: F, faceStart, faceVerts, faceNormals, faceCentroids, faceIds: mesh.faceIds ? mesh.faceIds.slice() : null,
      triCount, triVerts, triFace,
      edgeCount: E, edgeA: Int32Array.from(eA), edgeB: Int32Array.from(eB), edgeF0: Int32Array.from(eF0), edgeF1: Int32Array.from(eF1),
      edgeFaces: Uint8Array.from(eN), edgeCreaseDot,
    };
  };

  // ── Occluder ────────────────────────────────────────────────────────────────────────────────────────────────────────

  const normalizePoses = (bakes, pose) => {
    if (Array.isArray(pose)) return pose;
    if (pose && Array.isArray(pose.objs)) return pose.objs.map((o) => ({ cam: pose.cam, obj: o }));
    return bakes.map(() => pose);
  };

  const torusProbe = (bake, pose) => {
    const T = Vectura.Scene3D.TorusOcclusion;
    const cam = pose.cam; const o = pose.obj;
    const transform = { x: o.x, y: o.y, z: o.z, yaw: o.yaw, pitch: o.pitch, roll: o.roll, sx: bake.scale[0], sy: bake.scale[1], sz: bake.scale[2] };
    const camera = {
      yaw: cam.yaw, pitch: cam.pitch, roll: cam.roll,
      projection: cam.persp ? 'perspective' : 'orthographic', focalLength: cam.focal, cameraDistance: cam.dist,
    };
    const projOpts = { centerX: cam.cx, centerY: cam.cy, scale: cam.scale };
    if (cam.persp) { projOpts.focal = cam.focal; projOpts.cameraDist = cam.dist; }
    return T.buildSelfOcclusionTest(transform, camera, projOpts, bake.torus.sizes, { gapMm: TORUS_GAP_MM, marginMm: TORUS_MARGIN_MM });
  };


  // Bins triangles into the nx x ny grid: every cell the bbox of a footprint touches lists the triangle (CSR).
  // (Cells are about one triangle wide, so the bbox is within a few entries of the exact footprint.)
  const binTriangles = (tb, n, gx0, gy0, cs, nx, ny) => {
    let cap = Math.max(1024, n * 4);
    let pc = new Int32Array(cap); let pt = new Int32Array(cap); let m = 0;
    const inv = 1 / cs;
    for (let t = 0; t < n; t++) {
      let c0 = Math.floor((tb[4 * t] - gx0) * inv); let c1 = Math.floor((tb[4 * t + 2] - gx0) * inv);
      let r0 = Math.floor((tb[4 * t + 1] - gy0) * inv); let r1 = Math.floor((tb[4 * t + 3] - gy0) * inv);
      if (c0 < 0) c0 = 0; if (c1 > nx - 1) c1 = nx - 1; if (r0 < 0) r0 = 0; if (r1 > ny - 1) r1 = ny - 1;
      if (m + (c1 - c0 + 1) * (r1 - r0 + 1) > cap) {
        while (m + (c1 - c0 + 1) * (r1 - r0 + 1) > cap) cap *= 2;
        const nc = new Int32Array(cap); nc.set(pc); pc = nc;
        const nt = new Int32Array(cap); nt.set(pt); pt = nt;
      }
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { pc[m] = r * nx + c; pt[m] = t; m += 1; }
    }
    const cellStart = new Int32Array(nx * ny + 1);
    for (let i = 0; i < m; i++) cellStart[pc[i] + 1] += 1;
    for (let c = 0; c < nx * ny; c++) cellStart[c + 1] += cellStart[c];
    const cellTris = new Int32Array(m); const fill = new Int32Array(nx * ny);
    for (let i = 0; i < m; i++) { const c = pc[i]; cellTris[cellStart[c] + fill[c]] = pt[i]; fill[c] += 1; }
    return { cellStart, cellTris };
  };

  const occluder = (bakes, pose) => {
    const list = Array.isArray(bakes) ? bakes : [bakes];
    const poses = normalizePoses(list, pose);
    const index = new Map();
    list.forEach((b, i) => { index.set(b, i); if (b.objectId !== undefined && !index.has(b.objectId)) index.set(b.objectId, i); });

    // Pass 0: every front-facing, non-degenerate triangle in screen space.
    let total = 0;
    list.forEach((b) => { total += b.triCount; });
    const td = new Float64Array(10 * Math.max(1, total)); // ax ay e1x e1y e2x e2y invDet az dz1 dz2
    const tObj = new Int32Array(Math.max(1, total)); const tFace = new Int32Array(Math.max(1, total));
    const tb = new Float64Array(4 * Math.max(1, total)); // x0 y0 x1 y1 (bbox)
    let n = 0;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    list.forEach((b, oi) => {
      const fr = frameOf(poses[oi]);
      const tm = transformMesh(b, fr);
      const front = faceFronts(b, fr);
      const { X, Y, cz, ok } = tm;
      for (let t = 0; t < b.triCount; t++) {
        const f = b.triFace[t];
        if (!front[f]) continue;
        const i0 = b.triVerts[3 * t]; const i1 = b.triVerts[3 * t + 1]; const i2 = b.triVerts[3 * t + 2];
        if (!ok[i0] || !ok[i1] || !ok[i2]) continue;
        const e1x = X[i1] - X[i0]; const e1y = Y[i1] - Y[i0]; const e2x = X[i2] - X[i0]; const e2y = Y[i2] - Y[i0];
        const det = e1x * e2y - e1y * e2x;
        if (Math.abs(det) < MIN_TRI_AREA2) continue;
        const o = 10 * n;
        td[o] = X[i0]; td[o + 1] = Y[i0]; td[o + 2] = e1x; td[o + 3] = e1y; td[o + 4] = e2x; td[o + 5] = e2y;
        td[o + 6] = 1 / det; td[o + 7] = cz[i0]; td[o + 8] = cz[i1] - cz[i0]; td[o + 9] = cz[i2] - cz[i0];
        const lx = Math.min(X[i0], X[i1], X[i2]); const hx = Math.max(X[i0], X[i1], X[i2]);
        const ly = Math.min(Y[i0], Y[i1], Y[i2]); const hy = Math.max(Y[i0], Y[i1], Y[i2]);
        tb[4 * n] = lx; tb[4 * n + 1] = ly; tb[4 * n + 2] = hx; tb[4 * n + 3] = hy;
        tObj[n] = oi; tFace[n] = f;
        if (lx < minX) minX = lx; if (hx > maxX) maxX = hx; if (ly < minY) minY = ly; if (hy > maxY) maxY = hy;
        n += 1;
      }
    });

    // Grid over the projected triangles; cells hold every triangle whose footprint touches them (CSR).
    let nx = 1; let ny = 1; let cs = 1; let gx0 = 0; let gy0 = 0;
    let cellStart = new Int32Array(2); let cellTris = new Int32Array(0);
    if (n > 0) {
      const w = Math.max(maxX - minX, 1e-6); const h = Math.max(maxY - minY, 1e-6);
      // Cell size follows the triangle size (CELL_TRIANGLES mean triangle extents) but never drops below extent / MAX_CELLS.
      let extentSum = 0;
      for (let t = 0; t < n; t++) extentSum += Math.max(tb[4 * t + 2] - tb[4 * t], tb[4 * t + 3] - tb[4 * t + 1]);
      cs = Math.max(Math.max(w, h) / MAX_CELLS, CELL_TRIANGLES * (extentSum / n));
      gx0 = minX - cs * 1e-3; gy0 = minY - cs * 1e-3;
      nx = Math.min(MAX_CELLS, Math.floor((maxX - gx0) / cs) + 1); ny = Math.min(MAX_CELLS, Math.floor((maxY - gy0) / cs) + 1);
      const binned = binTriangles(tb, n, gx0, gy0, cs, nx, ny);
      cellStart = binned.cellStart; cellTris = binned.cellTris;
    }

    // Lazy per-object analytic torus probes.
    const probes = new Array(list.length).fill(undefined);
    const probeFor = (oi) => {
      if (probes[oi] !== undefined) return probes[oi];
      const b = list[oi];
      probes[oi] = (TORUS_ANALYTIC && b.torus && !b.convex) ? torusProbe(b, poses[oi]) : null;
      return probes[oi];
    };

    // seg: { obj: index, mode: 'fill' | 'edge', f0, f1 } (f0/f1: faces adjacent to an edge, excluded from its own object's test).
    const hiddenAt = (x, y, z, seg) => {
      const own = seg ? seg.obj : -1;
      const edgeMode = seg && seg.mode === 'edge';
      if (own >= 0 && !edgeMode) {
        const probe = probeFor(own);
        if (probe && probe(x, y, z)) return true;
      }
      if (n === 0) return false;
      const gx = Math.floor((x - gx0) / cs); const gy = Math.floor((y - gy0) / cs);
      if (gx < 0 || gy < 0 || gx >= nx || gy >= ny) return false;
      const cell = gy * nx + gx;
      const s1 = cellStart[cell + 1];
      for (let k = cellStart[cell]; k < s1; k++) {
        const t = cellTris[k];
        const oi = tObj[t];
        let bias = DEPTH_BIAS_MM;
        if (oi === own) {
          if (edgeMode) {
            const f = tFace[t];
            if (f === seg.f0 || f === seg.f1) continue;
          } else {
            const b = list[oi];
            if (b.convex) continue;
            if (probeFor(oi)) continue; // analytic field decides a torus's own occlusion
            bias = SELF_BIAS_MM;
          }
        }
        const o = 10 * t;
        const dx = x - td[o]; const dy = y - td[o + 1];
        const inv = td[o + 6];
        const u = (dx * td[o + 5] - dy * td[o + 4]) * inv;
        const v = (td[o + 2] * dy - td[o + 3] * dx) * inv;
        if (u < -1e-9 || v < -1e-9 || u + v > 1 + 1e-9) continue;
        if (td[o + 7] + u * td[o + 8] + v * td[o + 9] > z + bias) return true;
      }
      return false;
    };

    const lookup = (bake) => {
      const i = index.get(bake);
      if (i !== undefined) return i;
      if (bake && bake.objectId !== undefined && index.has(bake.objectId)) return index.get(bake.objectId);
      return -1;
    };

    // Polyline -> visible/hidden runs. Points carry {x, y, z}; a visibility change is bisected to RUN_RESOLUTION_MM.
    const clipRun = (pts, seg) => {
      const runs = [];
      if (!Array.isArray(pts) || pts.length < 2) return runs;
      let cur = null; let curVis = null;
      const push = (p) => { cur.pts.push({ x: p.x, y: p.y, z: p.z }); };
      const open = (vis, p) => { cur = { pts: [], visible: vis }; curVis = vis; push(p); runs.push(cur); };
      const visAt = (p) => !hiddenAt(p.x, p.y, p.z, seg);
      const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
      open(visAt(pts[0]), pts[0]);
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i]; const b = pts[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(1, Math.ceil(len / RUN_STEP_MM));
        let prevT = 0; let prevVis = curVis;
        for (let k = 1; k <= steps; k++) {
          const tt = k / steps; const p = k === steps ? b : lerp(a, b, tt);
          const vis = visAt(p);
          if (vis !== prevVis) {
            let lo = prevT; let hi = tt; let guard = 0;
            while ((hi - lo) * len > RUN_RESOLUTION_MM && guard < 24) {
              const m = (lo + hi) / 2;
              if (visAt(lerp(a, b, m)) === prevVis) lo = m; else hi = m;
              guard += 1;
            }
            const cross = lerp(a, b, (lo + hi) / 2);
            push(cross);
            open(vis, cross);
          }
          prevT = tt; prevVis = vis;
        }
        push(b);
      }
      return runs;
    };
    const closedMerge = (runs) => {
      if (runs.length > 1 && runs[0].visible && runs[runs.length - 1].visible) {
        const last = runs.pop();
        runs[0].pts = last.pts.concat(runs[0].pts.slice(1));
      }
      return runs;
    };

    return {
      cellCount: nx * ny, triangleCount: n, gridSize: [nx, ny], cellMm: cs,
      indexOf: lookup,
      segFor: (bake) => ({ obj: lookup(bake), mode: 'fill', f0: -1, f1: -1 }),
      hiddenAt, clipRun, closedMerge,
    };
  };

  // ── Outline ─────────────────────────────────────────────────────────────────────────────────────────────────────────

  const tangentBasis = (w) => {
    // two unit vectors orthogonal to unit w
    const ax = Math.abs(w[0]); const ay = Math.abs(w[1]); const az = Math.abs(w[2]);
    const h = ax <= ay && ax <= az ? [1, 0, 0] : (ay <= az ? [0, 1, 0] : [0, 0, 1]);
    let e1 = [w[1] * h[2] - w[2] * h[1], w[2] * h[0] - w[0] * h[2], w[0] * h[1] - w[1] * h[0]];
    const l1 = Math.hypot(e1[0], e1[1], e1[2]); e1 = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
    const e2 = [w[1] * e1[2] - w[2] * e1[1], w[2] * e1[0] - w[0] * e1[2], w[0] * e1[1] - w[1] * e1[0]];
    return [e1, e2];
  };

  // Exact limb of an ellipsoid (semi-axes along the object axes) as polyline runs of screen points {x, y, z = camera z}.
  // In unit-sphere coordinates u (camera point = M u + cT, M = A D), the silhouette is { u : u.q = 1 } for the pinhole
  // eye (q = M^-1 (e - cT)) and the great circle u . w = 0 (w = M^-1 z) for the orthographic view.
  const ellipsoidLimb = (radii, fr) => {
    const A = fr.A; const cT = fr.cT;
    const [a, b, c] = radii;
    if (!(a > 0 && b > 0 && c > 0)) return [];
    let center = [0, 0, 0]; let rad = 1; let axis;
    if (fr.persp) {
      const ex = -cT[0]; const ey = -cT[1]; const ez = fr.focal + fr.dist - cT[2];
      const q = [(A[0] * ex + A[3] * ey + A[6] * ez) / a, (A[1] * ex + A[4] * ey + A[7] * ez) / b, (A[2] * ex + A[5] * ey + A[8] * ez) / c];
      const q2 = q[0] * q[0] + q[1] * q[1] + q[2] * q[2];
      if (!(q2 > 1 + 1e-9)) return []; // eye inside the ellipsoid: no limb
      center = [q[0] / q2, q[1] / q2, q[2] / q2]; rad = Math.sqrt(1 - 1 / q2);
      const ql = Math.sqrt(q2); axis = [q[0] / ql, q[1] / ql, q[2] / ql];
    } else {
      const w = [A[6] / a, A[7] / b, A[8] / c];
      const wl = Math.hypot(w[0], w[1], w[2]);
      axis = [w[0] / wl, w[1] / wl, w[2] / wl];
    }
    const [e1, e2] = tangentBasis(axis);
    // Point count from the largest projected extent.
    const rMax = Math.max(a, b, c) * fr.scale * (fr.persp ? 2 : 1);
    const N = Math.max(LIMB_MIN_POINTS, Math.min(LIMB_MAX_POINTS, Math.ceil(Math.PI / Math.acos(Math.max(0, 1 - LIMB_SAGITTA_MM / Math.max(rMax, LIMB_SAGITTA_MM * 2))))));
    const near = fr.focal * NEAR_FRACTION;
    const pts = [];
    for (let k = 0; k < N; k++) {
      const th = (2 * Math.PI * k) / N; const ct = Math.cos(th) * rad; const st = Math.sin(th) * rad;
      const ux = center[0] + ct * e1[0] + st * e2[0]; const uy = center[1] + ct * e1[1] + st * e2[1]; const uz = center[2] + ct * e1[2] + st * e2[2];
      const px = a * ux; const py = b * uy; const pz = c * uz;
      const x = A[0] * px + A[1] * py + A[2] * pz + cT[0];
      const y = A[3] * px + A[4] * py + A[5] * pz + cT[1];
      const z = A[6] * px + A[7] * py + A[8] * pz + cT[2];
      if (fr.persp) {
        const denom = fr.focal + fr.dist - z;
        if (denom <= near) { pts.push(null); continue; }
        const s = (fr.focal / denom) * fr.scale;
        pts.push({ x: fr.cx + x * s, y: fr.cy - y * s, z });
      } else {
        pts.push({ x: fr.cx + x * fr.scale, y: fr.cy - y * fr.scale, z });
      }
    }
    // Split at invalid samples; a loop with none stays closed.
    if (pts.every(Boolean)) { return [pts.concat([{ x: pts[0].x, y: pts[0].y, z: pts[0].z }])]; }
    const runs = []; let cur = [];
    pts.forEach((p) => { if (p) cur.push(p); else { if (cur.length > 1) runs.push(cur); cur = []; } });
    if (cur.length > 1) runs.push(cur);
    return runs;
  };

  const outline = (bake, pose, occ, opts = {}) => {
    const result = { silhouette: [], crease: [], boundary: [] };
    const fr = frameOf(pose);
    const oi = occ ? occ.indexOf(bake) : -1;
    const fillSeg = { obj: oi, mode: 'fill', f0: -1, f1: -1 };

    if (bake.analytic && bake.analytic.kind === 'ellipsoid') {
      ellipsoidLimb(bake.analytic.radii, fr).forEach((poly) => {
        const closed = poly.length > 2 && poly[0].x === poly[poly.length - 1].x && poly[0].y === poly[poly.length - 1].y;
        if (!occ) { result.silhouette.push({ pts: poly, visible: true, closed, limb: true }); return; }
        let runs = occ.clipRun(poly, fillSeg);
        if (closed) runs = occ.closedMerge(runs);
        const wholeLoop = closed && runs.length === 1 && runs[0].visible;
        runs.filter((r) => r.visible && r.pts.length > 1).forEach((r) => result.silhouette.push({ ...r, closed: wholeLoop, limb: true }));
      });
      return result;
    }

    const creaseDot = Math.cos(degToRad(finite(opts.creaseAngle, CREASE_ANGLE_DEG)));
    const tm = transformMesh(bake, fr);
    const front = faceFronts(bake, fr);
    for (let e = 0; e < bake.edgeCount; e++) {
      const na = bake.edgeFaces[e];
      let cls = null;
      const f0 = bake.edgeF0[e]; const f1 = bake.edgeF1[e];
      if (na === 1) cls = 'boundary';
      else if (na === 2) {
        if (front[f0] !== front[f1]) cls = 'silhouette';
        else if (bake.edgeCreaseDot[e] < creaseDot) cls = 'crease';
      }
      if (!cls) continue;
      if (cls === 'crease' && bake.convex && !front[f0] && !front[f1]) continue; // a back crease of a convex body is always hidden
      const ia = bake.edgeA[e]; const ib = bake.edgeB[e];
      if (!tm.ok[ia] || !tm.ok[ib]) continue;
      const pts = [{ x: tm.X[ia], y: tm.Y[ia], z: tm.cz[ia] }, { x: tm.X[ib], y: tm.Y[ib], z: tm.cz[ib] }];
      const extra = { edge: e, a: ia, b: ib, faces: na === 2 ? [f0, f1] : [f0] };
      if (!occ) { result[cls].push({ pts, visible: true, ...extra }); continue; }
      const seg = { obj: oi, mode: 'edge', f0, f1 };
      occ.clipRun(pts, seg).filter((r) => r.visible && r.pts.length > 1).forEach((r) => result[cls].push({ ...r, ...extra }));
    }
    return result;
  };

  Scene3D.SurfaceLockVisibility = {
    supports, meshBake, occluder, outline,
    // Test seams.
    _internals: { frameOf, transformMesh, faceFronts, ellipsoidLimb, DEPTH_BIAS_MM, SELF_BIAS_MM, MAX_CELLS },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Scene3D.SurfaceLockVisibility;
})();
