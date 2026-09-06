/**
 * Scene3D.ShadowReceive — Unit D: shadows falling onto OTHER 3D objects.
 *
 * Settled architecture (stroke-fill handoff, item D): per surface SAMPLE, ask
 * "is this world point in shadow?" and feed the boolean into the intensity
 * the tone laws already consume (Regions.combinedIntensity). This is
 * deliberately NOT a projected-silhouette approach — a projected silhouette
 * is only valid against a PLANE, and a curved receiver (a cone, a second
 * sphere) needs the shadow term evaluated per sample on its own curved
 * surface. No new region geometry is introduced by this module.
 *
 * `pointInShadow(worldPoint, light, occluders, opts)` casts a ray from
 * `worldPoint` toward the light through a flat list of world-space triangles
 * (Moller-Trumbore) built by `buildOccluderSet(records)` from each object
 * record's OWN faces (`record.faces[i].worldVerts`, scene.js's faceRecord).
 *
 * Self-shadow exclusion: `opts.excludeObjectId` skips every triangle whose
 * `objectId` matches — the receiver currently being shaded must never be
 * blocked by its own geometry (both the deliberate case — a point on the
 * caster's own lit surface — and the accidental case — a same-surface
 * epsilon self-intersection at t~0).
 *
 * Grazing rays: a ray whose determinant with a triangle is ~0 (parallel to
 * its plane) is treated as a MISS (stable, never NaN) — see
 * `rayTriangleIntersect`. A ray landing exactly ON a shared triangle edge
 * (u, v, or u+v at the 0/1 boundary) is treated INCLUSIVELY (a hit) so two
 * adjacent triangles on a tessellated curved occluder (e.g. a sphere) never
 * leak a 1-ULP light crack along their shared seam.
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  Vectura.Scene3D = Vectura.Scene3D || {};
  const G3 = Vectura.Geometry3D || {};

  const finite = G3.finite || ((value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback));
  const v = G3.v || ((x = 0, y = 0, z = 0) => ({ x, y, z }));
  const sub = G3.sub || ((a, b) => v(a.x - b.x, a.y - b.y, a.z - b.z));
  const add = G3.add || ((a, b) => v(a.x + b.x, a.y + b.y, a.z + b.z));
  const dot = G3.dot || ((a, b) => a.x * b.x + a.y * b.y + a.z * b.z);
  const cross = G3.cross || ((a, b) => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x));
  const mul = G3.mul || ((a, s) => v(a.x * s, a.y * s, a.z * s));
  const normalize = G3.normalize || ((a) => {
    const len = Math.hypot(a.x, a.y, a.z) || 1;
    return v(a.x / len, a.y / len, a.z / len);
  });
  const DEG = Math.PI / 180;

  // Self-contained copy of Regions/Lighting's world-space TRAVEL direction
  // (CONTRACT L1) so this module has no load-order dependency on regions.js —
  // it only needs to run BEFORE surface-fill.js (index.html ordering).
  const lightWorldDir = (light) => {
    const src = light || {};
    const az = finite(src.azimuth, 135) * DEG;
    const el = finite(src.elevation, 45) * DEG;
    const cosEl = Math.cos(el);
    return normalize(v(-cosEl * Math.sin(az), -Math.sin(el), -cosEl * Math.cos(az)));
  };
  const towardLight = (light) => normalize(mul(lightWorldDir(light), -1));

  // ── Moller-Trumbore ray/triangle intersection ───────────────────────────────
  // Returns the ray parameter t (origin + t*dir hits the triangle), or null on
  // a genuine miss OR a near-parallel (grazing-the-plane) ray — never NaN.
  const DET_EPS = 1e-9;
  const BOUND_EPS = 1e-7;
  const rayTriangleIntersect = (origin, dir, a, b, c) => {
    const e1 = sub(b, a);
    const e2 = sub(c, a);
    const pvec = cross(dir, e2);
    const det = dot(e1, pvec);
    if (Math.abs(det) < DET_EPS) return null; // parallel to the triangle's plane — documented MISS
    const invDet = 1 / det;
    const tvec = sub(origin, a);
    const u = dot(tvec, pvec) * invDet;
    if (u < -BOUND_EPS || u > 1 + BOUND_EPS) return null;
    const qvec = cross(tvec, e1);
    const w = dot(dir, qvec) * invDet;
    if (w < -BOUND_EPS || u + w > 1 + BOUND_EPS) return null;
    const t = dot(e2, qvec) * invDet;
    return Number.isFinite(t) ? t : null;
  };

  // ── Occluder set: flatten every record's world-space faces into triangles ──
  // Fan-triangulation of each face's worldVerts (faces are convex polygons —
  // every scene3d primitive/CSG face is planar-convex by construction).
  const buildOccluderSet = (records) => {
    const triangles = [];
    (records || []).forEach((record) => {
      if (!record || !Array.isArray(record.faces)) return;
      const objectId = record.id;
      record.faces.forEach((face) => {
        const wv = face && face.worldVerts;
        if (!Array.isArray(wv) || wv.length < 3) return;
        const a = wv[0];
        for (let i = 1; i < wv.length - 1; i++) {
          const b = wv[i];
          const c = wv[i + 1];
          if (!a || !b || !c) continue;
          triangles.push({ a, b, c, objectId, faceId: face.faceId });
        }
      });
    });
    // Per-object bounding sphere (loose — centroid + max vertex distance, not
    // a minimal-enclosing-ball) so `pointInShadow` can reject an ENTIRE
    // object with one O(1) ray/sphere test instead of walking every one of
    // its triangles. This is the profiling fix that mattered (see the
    // module header + docs/3d-audit/handoff/unit-d-notes.md): the majority
    // of samples on a receiver are NOT in shadow, and without this every one
    // of those still paid for a full linear scan of every occluder triangle.
    // Purely an early-out — never a false negative: the bounding sphere
    // fully contains its object's mesh, so any real ray/triangle hit inside
    // it forces the ray to also cross the sphere's own surface.
    const groups = new Map();
    triangles.forEach((tri) => {
      let g = groups.get(tri.objectId);
      if (!g) { g = []; groups.set(tri.objectId, g); }
      g.push(tri);
    });
    const objects = [];
    groups.forEach((tris, objectId) => {
      let sx = 0; let sy = 0; let sz = 0; let n = 0;
      tris.forEach((t) => {
        [t.a, t.b, t.c].forEach((p) => { sx += p.x; sy += p.y; sz += p.z; n += 1; });
      });
      const center = n ? v(sx / n, sy / n, sz / n) : v(0, 0, 0);
      let maxR2 = 0;
      tris.forEach((t) => {
        [t.a, t.b, t.c].forEach((p) => {
          const dx = p.x - center.x; const dy = p.y - center.y; const dz = p.z - center.z;
          const r2 = dx * dx + dy * dy + dz * dz;
          if (r2 > maxR2) maxR2 = r2;
        });
      });
      objects.push({ objectId, triangles: tris, center, radius: Math.sqrt(maxR2) });
    });
    return { triangles, objects };
  };

  // Conservative ray/bounding-sphere overlap test — TRUE whenever a real
  // triangle intersection inside this sphere is geometrically possible in
  // (MIN_T, maxT); never a false negative (see buildOccluderSet's comment).
  const raySphereMayHit = (origin, dir, center, radius, maxT) => {
    const oc = sub(center, origin);
    const tca = dot(oc, dir);
    const d2 = dot(oc, oc) - tca * tca;
    if (d2 > radius * radius) return false;
    const thc = Math.sqrt(Math.max(0, radius * radius - d2));
    const t0 = tca - thc;
    const t1 = tca + thc;
    if (t1 < 1e-6) return false; // whole sphere behind the ray origin
    if (t0 > maxT) return false; // whole sphere beyond the light itself
    return true;
  };

  // Bias along the toward-light direction so the ray's origin sits just off
  // the receiver's own surface — avoids re-hitting the originating triangle
  // at t~0 from floating-point noise (independent of, and in addition to,
  // the explicit `excludeObjectId` self-shadow exclusion below).
  const ORIGIN_BIAS = 1e-3; // document mm
  const MIN_T = 1e-6;

  // pointInShadow(worldPoint, light, occluderSet, opts?) → boolean.
  //   occluderSet: { triangles } from buildOccluderSet (a falsy/empty set is
  //                 never in shadow — strict no-op).
  //   opts.excludeObjectId: skip every triangle from this object id (self-
  //                 shadow exclusion — see module header).
  //   opts.epsilon: override ORIGIN_BIAS (world mm).
  // Directional-ish lights (type 'directional', or any unrecognized type —
  // mirrors Regions.combinedIntensity's own fallback branch) treat the light
  // as infinitely far: any positive-t hit occludes. Positional lights
  // ('point'/'spot'/'area') cast toward `light.position`; a hit beyond the
  // light itself does not occlude it.
  const pointInShadow = (worldPoint, light, occluderSet, opts = {}) => {
    const triangles = occluderSet && Array.isArray(occluderSet.triangles) ? occluderSet.triangles : null;
    if (!triangles || !triangles.length) return false;
    const objects = occluderSet && Array.isArray(occluderSet.objects) ? occluderSet.objects : null;
    const P = worldPoint;
    if (!P || !Number.isFinite(P.x) || !Number.isFinite(P.y) || !Number.isFinite(P.z)) return false;
    const type = light && light.type;
    let dir;
    let maxT = Infinity;
    if ((type === 'point' || type === 'spot' || type === 'area') && light.position
        && Number.isFinite(light.position.x) && Number.isFinite(light.position.y) && Number.isFinite(light.position.z)) {
      const toL = sub(light.position, P);
      const dist = Math.hypot(toL.x, toL.y, toL.z);
      if (dist < 1e-9) return false; // coincident with the light — never self-shadowed
      dir = mul(toL, 1 / dist);
      maxT = dist - MIN_T;
    } else {
      dir = towardLight(light);
    }
    const epsilon = Number.isFinite(opts.epsilon) ? opts.epsilon : ORIGIN_BIAS;
    const origin = add(P, mul(dir, epsilon));
    const excludeObjectId = opts.excludeObjectId;

    // Grouped path (buildOccluderSet output): one O(1) bounding-sphere test
    // per OBJECT before ever touching its triangles — see raySphereMayHit.
    if (objects) {
      for (let oi = 0; oi < objects.length; oi++) {
        const grp = objects[oi];
        if (excludeObjectId != null && grp.objectId === excludeObjectId) continue;
        if (!raySphereMayHit(origin, dir, grp.center, grp.radius, maxT)) continue;
        const tris = grp.triangles;
        for (let i = 0; i < tris.length; i++) {
          const tri = tris[i];
          const t = rayTriangleIntersect(origin, dir, tri.a, tri.b, tri.c);
          if (t !== null && t > MIN_T && t < maxT) return true;
        }
      }
      return false;
    }

    // Flat fallback (a hand-built `{ triangles }` occluder set, e.g. in unit
    // tests that skip buildOccluderSet) — unchanged linear scan.
    for (let i = 0; i < triangles.length; i++) {
      const tri = triangles[i];
      if (excludeObjectId != null && tri.objectId === excludeObjectId) continue;
      const t = rayTriangleIntersect(origin, dir, tri.a, tri.b, tri.c);
      if (t !== null && t > MIN_T && t < maxT) return true;
    }
    return false;
  };

  const ShadowReceive = {
    buildOccluderSet,
    pointInShadow,
    rayTriangleIntersect,
  };

  Vectura.Scene3D.ShadowReceive = ShadowReceive;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ShadowReceive;
  }
})();
