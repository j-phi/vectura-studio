/**
 * Scene3D.CSG — a constructive-solid-geometry BSP engine for the scene3d layer.
 *
 * An Evan-Wallace-style binary space partition (CSGPolygon / CSGNode
 * build·clipTo·invert·allPolygons) adapted to the repo's INDEX mesh shape
 * ({ vertices:[{x,y,z}], faces:[[i,…]] }). n-gon input faces are fan-
 * triangulated going in; the boolean is performed on flat polygons carrying
 * only positions (the flat-shaded pipeline recomputes face normals from
 * positions downstream, so per-vertex normals are never needed). The result is
 * fan-triangulated back to an index mesh, WELDED (Scene3D.Mesh.weldMesh — shared
 * coincident vertices + repeated-index degenerate drop) and zero-area triangles
 * are dropped.
 *
 * WINDING (critical): the BSP owns the winding. `subtract` inverts the clip
 * solid so a bore wall's normal points INTO the removed volume (away from the
 * remaining material) — which relative to the object centroid reads INWARD.
 * That is correct: buildRecord's camera-facing front test (normalCam.z > 0)
 * classifies it. Never re-wind CSG output with Mesh.orientFace — its
 * "away from origin" heuristic would flip every concave cut wall the wrong way
 * and the hole would render inverted or empty. The signed mesh volume of a
 * correct subtract is POSITIVE and equals vol(A) − vol(A∩B); an orientFace'd
 * result would not.
 *
 * Every entry point is wrapped so any failure / empty / degenerate result
 * returns `null`; the caller (Scene3D.Boolean) then falls back to the uncarved
 * children (the same graceful-degradation contract shadows follow on draft).
 *
 * Dependency chain: Geometry3D → Scene3D.Mesh → Scene3D.CSG → Scene3D.Boolean.
 * Pure geometry: no RNG, no polygon-clipping (structurally avoids the AUD-05
 * FillBoolean crash cliff).
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const G3 = Vectura.Geometry3D || {};
  const Mesh = (Vectura.Scene3D && Vectura.Scene3D.Mesh) || {};

  const { v, add, sub, mul, dot, cross, normalize, length } = G3;

  // Plane classification epsilon. A point within EPS of a plane is COPLANAR;
  // large enough to absorb the fp noise of split-point arithmetic on mm-scale
  // geometry, small enough never to swallow a real thin feature.
  const EPS = 1e-5;

  const COPLANAR = 0;
  const FRONT = 1;
  const BACK = 2;
  const SPANNING = 3;

  const copy = (pt) => v(pt.x, pt.y, pt.z);

  // Plane through three points: { normal (unit), w } with signed distance of a
  // point p = dot(normal, p) − w.
  const planeFromPoints = (a, b, c) => {
    const n = normalize(cross(sub(b, a), sub(c, a)));
    return { normal: n, w: dot(n, a) };
  };
  const planeDegenerate = (pl) =>
    !Number.isFinite(pl.normal.x) || !Number.isFinite(pl.normal.y) || !Number.isFinite(pl.normal.z)
    || (pl.normal.x === 0 && pl.normal.y === 0 && pl.normal.z === 0);
  const flipPlane = (pl) => ({ normal: mul(pl.normal, -1), w: -pl.w });

  // Split `polygon` by `plane`, routing whole/partial pieces into the four out
  // arrays (Evan-Wallace splitPolygon adapted; verts are plain positions so a
  // shared reference is safe — nothing mutates a vertex in place).
  const splitPolygon = (plane, polygon, coplanarFront, coplanarBack, front, back) => {
    let polygonType = 0;
    const types = [];
    for (let i = 0; i < polygon.verts.length; i++) {
      const t = dot(plane.normal, polygon.verts[i]) - plane.w;
      const type = (t < -EPS) ? BACK : (t > EPS) ? FRONT : COPLANAR;
      polygonType |= type;
      types.push(type);
    }
    if (polygonType === COPLANAR) {
      (dot(plane.normal, polygon.plane.normal) > 0 ? coplanarFront : coplanarBack).push(polygon);
    } else if (polygonType === FRONT) {
      front.push(polygon);
    } else if (polygonType === BACK) {
      back.push(polygon);
    } else {
      const f = [];
      const b = [];
      const n = polygon.verts.length;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ti = types[i];
        const tj = types[j];
        const vi = polygon.verts[i];
        const vj = polygon.verts[j];
        if (ti !== BACK) f.push(vi);
        if (ti !== FRONT) b.push(vi);
        if ((ti | tj) === SPANNING) {
          const denom = dot(plane.normal, sub(vj, vi));
          const t = denom !== 0 ? (plane.w - dot(plane.normal, vi)) / denom : 0;
          const mid = add(vi, mul(sub(vj, vi), t));
          f.push(mid);
          b.push(mid);
        }
      }
      if (f.length >= 3) front.push({ verts: f, plane: polygon.plane });
      if (b.length >= 3) back.push({ verts: b, plane: polygon.plane });
    }
  };

  // ── BSP node (plain object; recursive build/clip/invert). ──────────────────
  const newNode = () => ({ plane: null, front: null, back: null, polygons: [] });

  const buildNode = (node, polygons) => {
    if (!polygons.length) return;
    if (!node.plane) node.plane = polygons[0].plane;
    const front = [];
    const back = [];
    for (let i = 0; i < polygons.length; i++) {
      splitPolygon(node.plane, polygons[i], node.polygons, node.polygons, front, back);
    }
    if (front.length) {
      if (!node.front) node.front = newNode();
      buildNode(node.front, front);
    }
    if (back.length) {
      if (!node.back) node.back = newNode();
      buildNode(node.back, back);
    }
  };

  const clipPolygons = (node, polygons) => {
    if (!node.plane) return polygons.slice();
    let front = [];
    let back = [];
    for (let i = 0; i < polygons.length; i++) {
      splitPolygon(node.plane, polygons[i], front, back, front, back);
    }
    if (node.front) front = clipPolygons(node.front, front);
    back = node.back ? clipPolygons(node.back, back) : [];
    return front.concat(back);
  };

  const clipTo = (node, bsp) => {
    node.polygons = clipPolygons(bsp, node.polygons);
    if (node.front) clipTo(node.front, bsp);
    if (node.back) clipTo(node.back, bsp);
  };

  const invertNode = (node) => {
    for (let i = 0; i < node.polygons.length; i++) {
      const p = node.polygons[i];
      node.polygons[i] = { verts: p.verts.slice().reverse(), plane: flipPlane(p.plane) };
    }
    if (node.plane) node.plane = flipPlane(node.plane);
    const tmp = node.front;
    node.front = node.back;
    node.back = tmp;
    if (node.front) invertNode(node.front);
    if (node.back) invertNode(node.back);
  };

  const allPolygons = (node) => {
    let polys = node.polygons.slice();
    if (node.front) polys = polys.concat(allPolygons(node.front));
    if (node.back) polys = polys.concat(allPolygons(node.back));
    return polys;
  };

  // ── Index mesh ⇄ polygon soup. ─────────────────────────────────────────────
  // Fan-triangulate every input face into flat polygons; drop degenerate tris.
  const meshToPolygons = (mesh) => {
    const polys = [];
    const verts = mesh.vertices || [];
    (mesh.faces || []).forEach((face) => {
      if (!Array.isArray(face) || face.length < 3) return;
      for (let k = 2; k < face.length; k++) {
        const a = verts[face[0]];
        const b = verts[face[k - 1]];
        const c = verts[face[k]];
        if (!a || !b || !c) continue;
        const plane = planeFromPoints(a, b, c);
        if (planeDegenerate(plane)) continue;
        polys.push({ verts: [copy(a), copy(b), copy(c)], plane });
      }
    });
    return polys;
  };

  // Fan-triangulate output polygons back to an index mesh (pre-weld: raw verts,
  // Scene3D.Mesh.weldMesh shares coincident ones + drops repeated-index tris).
  const polygonsToMesh = (polys) => {
    const vertices = [];
    const faces = [];
    polys.forEach((poly) => {
      const vs = poly.verts;
      if (!vs || vs.length < 3) return;
      const base = vertices.length;
      for (let i = 0; i < vs.length; i++) vertices.push(v(vs[i].x, vs[i].y, vs[i].z));
      for (let k = 2; k < vs.length; k++) faces.push([base, base + k - 1, base + k]);
    });
    return { vertices, faces };
  };

  // Signed twice-area of a triangle (|(b−a)×(c−a)|).
  const triArea2 = (a, b, c) => length(cross(sub(b, a), sub(c, a)));

  // Drop near-zero-area triangles (collinear T-junction fans etc.). Threshold is
  // scale-relative to the mesh extent so it never bites real geometry.
  const dropSlivers = (mesh) => {
    let maxAbs = 1;
    for (let i = 0; i < mesh.vertices.length; i++) {
      const p = mesh.vertices[i];
      const a = Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z));
      if (a > maxAbs) maxAbs = a;
    }
    const areaEps = maxAbs * maxAbs * 1e-9;
    const faces = mesh.faces.filter((f) => {
      const a = mesh.vertices[f[0]];
      const b = mesh.vertices[f[1]];
      const c = mesh.vertices[f[2]];
      return a && b && c && triArea2(a, b, c) > areaEps;
    });
    return { vertices: mesh.vertices, faces };
  };

  // Signed volume via the divergence theorem (Σ v0·(v1×v2) / 6). Exact for any
  // closed polyhedral surface regardless of T-junctions. Positive ⇔ consistent
  // outward-from-material winding — the check that distinguishes a correct
  // subtract from an orientFace'd (concavity-flipped) one.
  const meshVolume = (mesh) => {
    let sum = 0;
    (mesh.faces || []).forEach((f) => {
      const a = mesh.vertices[f[0]];
      const b = mesh.vertices[f[1]];
      const c = mesh.vertices[f[2]];
      if (!a || !b || !c) return;
      sum += dot(a, cross(b, c));
    });
    return sum / 6;
  };

  const finalizeMesh = (polys) => {
    if (!polys || !polys.length) return null;
    let mesh = polygonsToMesh(polys);
    if (!mesh.faces.length) return null;
    mesh = Mesh.weldMesh ? Mesh.weldMesh(mesh) : mesh;
    mesh = dropSlivers(mesh);
    if (!mesh.faces.length) return null;
    return { vertices: mesh.vertices, faces: mesh.faces };
  };

  // ── Boolean fold on two BSP node roots (Evan-Wallace op sequences). ─────────
  const runOp = (op, aMesh, bMesh) => {
    const a = newNode();
    buildNode(a, meshToPolygons(aMesh));
    const b = newNode();
    buildNode(b, meshToPolygons(bMesh));
    if (op === 'union') {
      clipTo(a, b);
      clipTo(b, a);
      invertNode(b);
      clipTo(b, a);
      invertNode(b);
      buildNode(a, allPolygons(b));
      return allPolygons(a);
    }
    if (op === 'intersect') {
      invertNode(a);
      clipTo(b, a);
      invertNode(b);
      clipTo(a, b);
      clipTo(b, a);
      buildNode(a, allPolygons(b));
      invertNode(a);
      return allPolygons(a);
    }
    // subtract (default): A − B.
    invertNode(a);
    clipTo(a, b);
    clipTo(b, a);
    invertNode(b);
    clipTo(b, a);
    invertNode(b);
    buildNode(a, allPolygons(b));
    invertNode(a);
    return allPolygons(a);
  };

  const validMesh = (m) => m && Array.isArray(m.vertices) && m.vertices.length >= 4
    && Array.isArray(m.faces) && m.faces.length >= 4;

  const binaryOp = (op, A, B) => {
    try {
      if (!validMesh(A) || !validMesh(B)) return null;
      return finalizeMesh(runOp(op, A, B));
    } catch (_) {
      return null;
    }
  };

  const subtract = (A, B) => binaryOp('subtract', A, B);
  const union = (A, B) => binaryOp('union', A, B);
  const intersect = (A, B) => binaryOp('intersect', A, B);

  // Fold an op across a list of meshes (left-to-right). union/intersect reduce
  // the whole list; subtract carves every later mesh out of the first.
  const combine = (op, meshes) => {
    try {
      const list = (meshes || []).filter(validMesh);
      if (!list.length) return null;
      if (list.length === 1) return finalizeMesh(meshToPolygons(list[0]));
      let acc = list[0];
      for (let i = 1; i < list.length; i++) {
        acc = binaryOp(op, acc, list[i]);
        if (!validMesh(acc)) return null;
      }
      return acc;
    } catch (_) {
      return null;
    }
  };

  const api = {
    subtract,
    union,
    intersect,
    combine,
    meshVolume,
    // exposed for tests / Boolean's triangle-budget accounting
    meshToPolygons,
    EPS,
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { CSG: api });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
