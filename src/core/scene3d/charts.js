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
      const R = Math.max(1, finite(p.helixRadius, 48));
      const h = Math.max(1, finite(p.helixHeight, 168));
      return {
        point: { x: Math.cos(longitude) * R, y: (u - 0.5) * h, z: Math.sin(longitude) * R },
        normal: { x: Math.cos(longitude), y: 0, z: Math.sin(longitude) },
      };
    }
    if (shape === 'cone') {
      const hh = Math.max(1, finite(p.coneHeight, 136));
      const r0 = Math.max(1, finite(p.baseRadius, 68));
      const y = (u - 0.5) * hh;
      const r = r0 * (1 - u);
      const point = { x: Math.cos(longitude) * r, y, z: Math.sin(longitude) * r };
      const normal = normalize({ x: Math.cos(longitude) * hh, y: r0, z: Math.sin(longitude) * hh });
      return { point, normal };
    }
    if (shape === 'cylinder') {
      const h = Math.max(1, finite(p.cylinderHeight, 156));
      const r = Math.max(1, finite(p.cylinderRadius, 58));
      return {
        point: { x: Math.cos(longitude) * r, y: (u - 0.5) * h, z: Math.sin(longitude) * r },
        normal: { x: Math.cos(longitude), y: 0, z: Math.sin(longitude) },
      };
    }
    if (shape === 'torus') {
      // u sweeps the major (toroidal) ring once; longitude winds the minor
      // (poloidal) tube `turns` times, so a spiral wrap coils around the donut.
      const R = Math.max(1, finite(p.torusRingRadius, 64));
      const tube = Math.max(0.5, finite(p.torusTubeRadius, 26));
      const phi = u * TAU;
      const ct = Math.cos(longitude);
      const ringR = R + tube * ct;
      return {
        point: { x: Math.cos(phi) * ringR, y: tube * Math.sin(longitude), z: Math.sin(phi) * ringR },
        normal: { x: Math.cos(phi) * ct, y: Math.sin(longitude), z: Math.sin(phi) * ct },
      };
    }
    if (shape === 'capsule') {
      // Cylinder of height H radius r, capped by two hemispheres. u is allocated
      // along the meridian arc length (cap, barrel, cap) so the wrap pitch stays
      // even across the seams.
      const r = Math.max(1, finite(p.capsuleRadius, 46));
      const h = Math.max(0, finite(p.capsuleHeight, 120));
      const capArc = (r * Math.PI) / 2;
      const total = h + 2 * capArc;
      const fCap = capArc / total;
      const fCyl = h / total;
      const cl = Math.cos(longitude);
      const sl = Math.sin(longitude);
      if (u < fCap) {
        const lat = (u / fCap - 1) * (Math.PI / 2); // -PI/2 (south pole) .. 0
        const cr = Math.cos(lat);
        return {
          point: { x: cl * cr * r, y: -h / 2 + r * Math.sin(lat), z: sl * cr * r },
          normal: { x: cl * cr, y: Math.sin(lat), z: sl * cr },
        };
      }
      if (u <= fCap + fCyl) {
        const b = fCyl > 0 ? (u - fCap) / fCyl : 0;
        return {
          point: { x: cl * r, y: -h / 2 + b * h, z: sl * r },
          normal: { x: cl, y: 0, z: sl },
        };
      }
      const lat = ((u - fCap - fCyl) / fCap) * (Math.PI / 2); // 0 .. PI/2 (north pole)
      const cr = Math.cos(lat);
      return {
        point: { x: cl * cr * r, y: h / 2 + r * Math.sin(lat), z: sl * cr * r },
        normal: { x: cl * cr, y: Math.sin(lat), z: sl * cr },
      };
    }
    const sphereRadius = Math.max(1, finite(p.sphereRadius, finite(p.ellipsoidEquatorRadius, 64)));
    const rx = shape === 'sphere' ? sphereRadius : Math.max(1, finite(p.ellipsoidEquatorRadius, 76));
    const rz = rx;
    const ry = shape === 'sphere' ? sphereRadius : Math.max(1, finite(p.ellipsoidPolarRadius, 52));
    const lat = (u - 0.5) * Math.PI;
    const cl = Math.cos(lat);
    const point = {
      x: Math.cos(longitude) * cl * rx,
      y: Math.sin(lat) * ry,
      z: Math.sin(longitude) * cl * rz,
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
    const side = Math.floor(s);
    const f = s - side;
    if (side === 0) return { x: -1 + 2 * f, z: -1 };
    if (side === 1) return { x: 1, z: -1 + 2 * f };
    if (side === 2) return { x: 1 - 2 * f, z: 1 };
    return { x: -1, z: 1 - 2 * f };
  };

  const sgnPow = (value, exp) => Math.sign(value) * Math.pow(Math.abs(value), exp);

  const topoTorus = ({ sx, sy, sz }) => {
    const major = Math.max(2, sx * 0.75);
    const minor = Math.max(1, Math.min(sy, sz) * 0.28);
    return (u, vv) => {
      const a = u * TAU;
      const b = vv * TAU;
      return v(Math.cos(a) * (major + Math.cos(b) * minor), Math.sin(b) * minor, Math.sin(a) * (major + Math.cos(b) * minor));
    };
  };

  const topoCone = ({ sx, sy }) => (u, vv) => {
    const a = vv * TAU;
    const r = sx * (1 - u);
    return v(Math.cos(a) * r, (u - 0.5) * sy * 2, Math.sin(a) * r);
  };

  // Open tube: u sweeps around, vv runs along the height axis.
  const topoCylinder = ({ sx, sy, sz }) => (u, vv) => {
    const a = u * TAU;
    return v(Math.cos(a) * sx, (vv - 0.5) * sy * 2, Math.sin(a) * sz);
  };

  // Cylindrical body with hemispherical caps; vv runs bottom→top along the axis.
  const topoCapsule = ({ sx, sy, sz }) => {
    const r = Math.max(1, Math.min(sx, sz));
    const half = Math.max(r, sy);
    const cylHalf = Math.max(0, half - r);
    const cylFrac = cylHalf / half;
    return (u, vv) => {
      const a = u * TAU;
      const tt = vv * 2 - 1; // -1..1
      let yy;
      let rad;
      if (Math.abs(tt) <= cylFrac || cylFrac >= 1) {
        yy = tt * half;
        rad = r;
      } else {
        const sign = Math.sign(tt) || 1;
        const e = (Math.abs(tt) - cylFrac) / Math.max(1e-6, 1 - cylFrac);
        const ang = e * (Math.PI / 2);
        yy = sign * (cylHalf + Math.sin(ang) * r);
        rad = Math.cos(ang) * r;
      }
      return v(Math.cos(a) * rad * (sx / r), yy, Math.sin(a) * rad * (sz / r));
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
      const lat = (vv - 0.5) * Math.PI;
      const cv = sgnPow(Math.cos(lat), e1);
      const sv = sgnPow(Math.sin(lat), e1);
      const cu = sgnPow(Math.cos(lon), e2);
      const su = sgnPow(Math.sin(lon), e2);
      return v(cv * cu * sx, sv * sy, cv * su * sz);
    };
  };

  // (p,q) torus knot rendered as a swept tube; u runs along the knot, vv around the tube.
  const topoTorusKnot = ({ sx, sy, sz }) => {
    const pK = 2;
    const qK = 3;
    const R = Math.max(2, sx * 0.62);
    const tubeR = Math.max(1, Math.min(sy, sz) * 0.24);
    const knotCenter = (t) => {
      const r = R * (2 + Math.cos(qK * t)) * 0.5;
      return v(r * Math.cos(pK * t), R * Math.sin(qK * t) * 0.5, r * Math.sin(pK * t));
    };
    return (u, vv) => {
      const t = u * TAU;
      const phi = vv * TAU;
      const center = knotCenter(t);
      const ahead = knotCenter(t + 0.01);
      const tangent = normalize(v(ahead.x - center.x, ahead.y - center.y, ahead.z - center.z));
      const refUp = Math.abs(tangent.y) > 0.9 ? v(1, 0, 0) : v(0, 1, 0);
      const binormal = normalize(cross(tangent, refUp));
      const normal = normalize(cross(binormal, tangent));
      return add(center, add(mul(normal, Math.cos(phi) * tubeR), mul(binormal, Math.sin(phi) * tubeR)));
    };
  };

  // Sphere (default) / ellipsoid fallback chart — `mode` keeps the ellipsoid's
  // 1.18 / 0.72 axis factors resolved per-sample, exactly as the inline sampler did.
  const topoSphereEllipsoid = ({ sx, sy, sz }, mode) => (u, vv) => {
    const lat = (u - 0.5) * Math.PI;
    const lon = vv * TAU;
    const rx = mode === 'ellipsoid' ? sx * 1.18 : sx;
    const ry = mode === 'ellipsoid' ? sy * 0.72 : sy;
    const rz = sz;
    return v(Math.cos(lon) * Math.cos(lat) * rx, Math.sin(lat) * ry, Math.sin(lon) * Math.cos(lat) * rz);
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
