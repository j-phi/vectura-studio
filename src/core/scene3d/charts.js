/**
 * Scene3D.Charts — parametric surface samplers shared by the 3D scene algorithms.
 *
 * Extracted VERBATIM from spiralizer.js (shapePoint) and topoform.js (the
 * buildPrimitiveRaw mode samplers): every expression, literal, and branch is
 * preserved byte-for-byte so the precision-3 SVG baselines stay byte-exact.
 *
 * Dependency chain: Geometry3D → Scene3D.Charts → Scene3D.Mesh → algorithms.
 * Param resolution (e.g. scaleX3d ?? primitiveScaleX) stays in the algorithms;
 * the topoform factories take already-resolved sizes and return a (u, v) →
 * vertex sampler.
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const G3 = Vectura.Geometry3D || {};
  // local alias: a hot-loop `Math.x` is a global lookup, answered through an interceptor by a window-backed global (jsdom, vm)
  const Mth = Math;

  const {
    TAU,
    finite,
    v,
    add,
    mul,
    cross,
    normalize,
  } = G3;

  // ── Spiralizer wrap surface (spiralizer.js shapePoint) ─────────────────────
  // Sphere / ellipsoid / cone / cylinder / torus / capsule / helix sampler:
  // returns { point, normal } for a longitude/latitude-style (u, longitude)
  // coordinate on the selected shape. Reads its shape params straight off `p`.
  const spiralizerSurface = (p, u, longitude) => {
    const shape = p.shape || 'ellipsoid';
    if (shape === 'helix') {
      // A coiled strand: u climbs the central axis (height), longitude winds the
      // strand around it. Because the spiral wrap couples u and longitude, this
      // traces a true 3D helix; helixCount offsets several strands in phase to
      // make a double / triple / n-helix.
      const R = Mth.max(1, finite(p.helixRadius, 48));
      const h = Mth.max(1, finite(p.helixHeight, 168));
      return {
        point: { x: Mth.cos(longitude) * R, y: (u - 0.5) * h, z: Mth.sin(longitude) * R },
        normal: { x: Mth.cos(longitude), y: 0, z: Mth.sin(longitude) },
      };
    }
    if (shape === 'cone') {
      const hh = Mth.max(1, finite(p.coneHeight, 136));
      const r0 = Mth.max(1, finite(p.baseRadius, 68));
      const y = (u - 0.5) * hh;
      const r = r0 * (1 - u);
      const point = { x: Mth.cos(longitude) * r, y, z: Mth.sin(longitude) * r };
      const normal = normalize({ x: Mth.cos(longitude) * hh, y: r0, z: Mth.sin(longitude) * hh });
      return { point, normal };
    }
    if (shape === 'cylinder') {
      const h = Mth.max(1, finite(p.cylinderHeight, 156));
      const r = Mth.max(1, finite(p.cylinderRadius, 58));
      return {
        point: { x: Mth.cos(longitude) * r, y: (u - 0.5) * h, z: Mth.sin(longitude) * r },
        normal: { x: Mth.cos(longitude), y: 0, z: Mth.sin(longitude) },
      };
    }
    if (shape === 'torus') {
      // u sweeps the major (toroidal) ring once; longitude winds the minor
      // (poloidal) tube `turns` times, so a spiral wrap coils around the donut.
      const R = Mth.max(1, finite(p.torusRingRadius, 64));
      const tube = Mth.max(0.5, finite(p.torusTubeRadius, 26));
      const phi = u * TAU;
      const ct = Mth.cos(longitude);
      const ringR = R + tube * ct;
      return {
        point: { x: Mth.cos(phi) * ringR, y: tube * Mth.sin(longitude), z: Mth.sin(phi) * ringR },
        normal: { x: Mth.cos(phi) * ct, y: Mth.sin(longitude), z: Mth.sin(phi) * ct },
      };
    }
    if (shape === 'capsule') {
      // Cylinder of height H radius r, capped by two hemispheres. u is allocated
      // along the meridian arc length (cap, barrel, cap) so the wrap pitch stays
      // even across the seams.
      const r = Mth.max(1, finite(p.capsuleRadius, 46));
      const h = Mth.max(0, finite(p.capsuleHeight, 120));
      const capArc = (r * Mth.PI) / 2;
      const total = h + 2 * capArc;
      const fCap = capArc / total;
      const fCyl = h / total;
      const cl = Mth.cos(longitude);
      const sl = Mth.sin(longitude);
      if (u < fCap) {
        const lat = (u / fCap - 1) * (Mth.PI / 2); // -PI/2 (south pole) .. 0
        const cr = Mth.cos(lat);
        return {
          point: { x: cl * cr * r, y: -h / 2 + r * Mth.sin(lat), z: sl * cr * r },
          normal: { x: cl * cr, y: Mth.sin(lat), z: sl * cr },
        };
      }
      if (u <= fCap + fCyl) {
        const b = fCyl > 0 ? (u - fCap) / fCyl : 0;
        return {
          point: { x: cl * r, y: -h / 2 + b * h, z: sl * r },
          normal: { x: cl, y: 0, z: sl },
        };
      }
      const lat = ((u - fCap - fCyl) / fCap) * (Mth.PI / 2); // 0 .. PI/2 (north pole)
      const cr = Mth.cos(lat);
      return {
        point: { x: cl * cr * r, y: h / 2 + r * Mth.sin(lat), z: sl * cr * r },
        normal: { x: cl * cr, y: Mth.sin(lat), z: sl * cr },
      };
    }
    const sphereRadius = Mth.max(1, finite(p.sphereRadius, finite(p.ellipsoidEquatorRadius, 64)));
    const rx = shape === 'sphere' ? sphereRadius : Mth.max(1, finite(p.ellipsoidEquatorRadius, 76));
    const rz = rx;
    const ry = shape === 'sphere' ? sphereRadius : Mth.max(1, finite(p.ellipsoidPolarRadius, 52));
    const lat = (u - 0.5) * Mth.PI;
    const cl = Mth.cos(lat);
    const point = {
      x: Mth.cos(longitude) * cl * rx,
      y: Mth.sin(lat) * ry,
      z: Mth.sin(longitude) * cl * rz,
    };
    return {
      point,
      normal: normalize({ x: point.x / (rx * rx), y: point.y / (ry * ry), z: point.z / (rz * rz) }),
    };
  };

  // ── Topoform primitive charts (topoform.js buildPrimitiveRaw samplers) ─────
  // Each factory takes resolved sizes { sx, sy, sz } and returns the exact
  // (u, vv) → vertex sampler that buildPrimitiveRaw previously defined inline.

  // Point on the perimeter of the unit square [-1,1]^2, parameterised t in [0,1).
  const squarePerimeter = (t) => {
    const s = (((t % 1) + 1) % 1) * 4;
    const side = Mth.floor(s);
    const f = s - side;
    if (side === 0) return { x: -1 + 2 * f, z: -1 };
    if (side === 1) return { x: 1, z: -1 + 2 * f };
    if (side === 2) return { x: 1 - 2 * f, z: 1 };
    return { x: -1, z: 1 - 2 * f };
  };

  // T2-8b-5d (perf, no output change): the surface-fill samplers evaluate a chart at (a, b), (a+EPS, b) and
  // (a, b+EPS) back to back, so each axis angle repeats. `trigMemo(angleOf)` keeps the cos/sin of the last
  // two distinct inputs; the values are exactly what `Mth.cos/Mth.sin(angleOf(x))` return.
  const trigMemo = (angleOf) => {
    let x0 = NaN; let c0 = 0; let s0 = 0; let x1 = NaN; let c1 = 0; let s1 = 0; let flip = false;
    const out = { c: 0, s: 0 };
    return (x) => {
      // 0 / -0 compare equal but give differently signed zeros: never memoised. NaN never equals itself.
      if (x === 0) { const z = angleOf(x); out.c = Mth.cos(z); out.s = Mth.sin(z); return out; }
      if (x === x0) { out.c = c0; out.s = s0; return out; }
      if (x === x1) { out.c = c1; out.s = s1; return out; }
      const ang = angleOf(x);
      const c = Mth.cos(ang); const sn = Mth.sin(ang);
      if (flip) { x0 = x; c0 = c; s0 = sn; } else { x1 = x; c1 = c; s1 = sn; }
      flip = !flip;
      out.c = c; out.s = sn;
      return out;
    };
  };

  const sgnPow = (value, exp) => Mth.sign(value) * Mth.pow(Mth.abs(value), exp);

  const topoTorus = ({ sx, sy, sz }) => {
    const major = Mth.max(2, sx * 0.75);
    const minor = Mth.max(1, Mth.min(sy, sz) * 0.28);
    const ta = trigMemo((u) => u * TAU);
    const tb = trigMemo((vv) => vv * TAU);
    return (u, vv) => {
      const A = ta(u); const ca = A.c; const sa = A.s;
      const B = tb(vv);
      // T2-8b-5d (perf, no output change): the ring radius is computed once (it was computed twice, identically).
      const ringR = major + B.c * minor;
      return v(ca * ringR, B.s * minor, sa * ringR);
    };
  };

  const topoCone = ({ sx, sy }) => {
    const tv = trigMemo((vv) => vv * TAU);
    return (u, vv) => {
      const T = tv(vv); const ca = T.c; const sa = T.s;
      const r = sx * (1 - u);
      return v(ca * r, (u - 0.5) * sy * 2, sa * r);
    };
  };

  // Open tube: u sweeps around, vv runs along the height axis.
  const topoCylinder = ({ sx, sy, sz }) => (u, vv) => {
    const a = u * TAU;
    return v(Mth.cos(a) * sx, (vv - 0.5) * sy * 2, Mth.sin(a) * sz);
  };

  // Cylindrical body with hemispherical caps; vv runs bottom→top along the axis.
  const topoCapsule = ({ sx, sy, sz }) => {
    const r = Mth.max(1, Mth.min(sx, sz));
    const half = Mth.max(r, sy);
    const cylHalf = Mth.max(0, half - r);
    const cylFrac = cylHalf / half;
    return (u, vv) => {
      const a = u * TAU;
      const tt = vv * 2 - 1; // -1..1
      let yy;
      let rad;
      if (Mth.abs(tt) <= cylFrac || cylFrac >= 1) {
        yy = tt * half;
        rad = r;
      } else {
        const sign = Mth.sign(tt) || 1;
        const e = (Mth.abs(tt) - cylFrac) / Mth.max(1e-6, 1 - cylFrac);
        const ang = e * (Mth.PI / 2);
        yy = sign * (cylHalf + Mth.sin(ang) * r);
        rad = Mth.cos(ang) * r;
      }
      return v(Mth.cos(a) * rad * (sx / r), yy, Mth.sin(a) * rad * (sz / r));
    };
  };

  // Square cross-section tapering to an apex; subdivides with detail.
  const topoPyramid = ({ sx, sy, sz }) => (u, vv) => {
    const edge = squarePerimeter(u);
    const taper = 1 - vv; // 1 at base, 0 at apex
    return v(edge.x * sx * taper, (vv - 0.5) * sy * 2, edge.z * sz * taper);
  };

  const topoSuperellipsoid = ({ sx, sy, sz }) => {
    const e1 = 0.4;
    const e2 = 0.4;
    return (u, vv) => {
      const lon = (u - 0.5) * TAU;
      const lat = (vv - 0.5) * Mth.PI;
      const cv = sgnPow(Mth.cos(lat), e1);
      const sv = sgnPow(Mth.sin(lat), e1);
      const cu = sgnPow(Mth.cos(lon), e2);
      const su = sgnPow(Mth.sin(lon), e2);
      return v(cv * cu * sx, sv * sy, cv * su * sz);
    };
  };

  // (p,q) torus knot rendered as a swept tube; u runs along the knot, vv around the tube.
  const topoTorusKnot = ({ sx, sy, sz }) => {
    const pK = 2;
    const qK = 3;
    const R = Mth.max(2, sx * 0.62);
    const tubeR = Mth.max(1, Mth.min(sy, sz) * 0.24);
    const knotCenter = (t) => {
      const r = R * (2 + Mth.cos(qK * t)) * 0.5;
      return v(r * Mth.cos(pK * t), R * Mth.sin(qK * t) * 0.5, r * Mth.sin(pK * t));
    };
    return (u, vv) => {
      const t = u * TAU;
      const phi = vv * TAU;
      const center = knotCenter(t);
      const ahead = knotCenter(t + 0.01);
      const tangent = normalize(v(ahead.x - center.x, ahead.y - center.y, ahead.z - center.z));
      const refUp = Mth.abs(tangent.y) > 0.9 ? v(1, 0, 0) : v(0, 1, 0);
      const binormal = normalize(cross(tangent, refUp));
      const normal = normalize(cross(binormal, tangent));
      return add(center, add(mul(normal, Mth.cos(phi) * tubeR), mul(binormal, Mth.sin(phi) * tubeR)));
    };
  };

  // Sphere (default) / ellipsoid fallback chart — `mode` keeps the ellipsoid's
  // 1.18 / 0.72 axis factors resolved per-sample, exactly as the inline sampler did.
  const topoSphereEllipsoid = ({ sx, sy, sz }, mode) => {
    const rx = mode === 'ellipsoid' ? sx * 1.18 : sx;
    const ry = mode === 'ellipsoid' ? sy * 0.72 : sy;
    const rz = sz;
    const tlat = trigMemo((u) => (u - 0.5) * Mth.PI);
    const tlon = trigMemo((vv) => vv * TAU);
    return (u, vv) => {
      const L = tlat(u); const cl = L.c; const sl = L.s;
      const O = tlon(vv);
      return v(O.c * cl * rx, sl * ry, O.s * cl * rz);
    };
  };

  const api = {
    spiralizerSurface,
    squarePerimeter,
    sgnPow,
    topoTorus,
    topoCone,
    topoCylinder,
    topoCapsule,
    topoPyramid,
    topoSuperellipsoid,
    topoTorusKnot,
    topoSphereEllipsoid,
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Charts: api });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
