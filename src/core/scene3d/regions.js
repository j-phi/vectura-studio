/**
 * Scene3D.Lighting + Scene3D.Regions — Phase 2 light-made tone (spec §3.2, §7
 * group E). Pure/deterministic: no randomness, same inputs → same output.
 *
 * Lighting.lightWorldDir(light) is the SINGLE source of the sun's world-space
 * travel vector (CONTRACT L1). Both streams call it (2B's sun widget/drag and
 * 2A's shadow projection) so the overlay and the shadows always agree.
 *
 *   azimuth  (deg): sun bearing, 0° = world +Z, 90° = world +X.
 *   elevation(deg): 0° = horizon, 90° = straight overhead.
 *   toward-sun  L = ( cosEl·sinAz,  sinEl,  cosEl·cosAz )   (points at the sun)
 *   travel      d = −L = (−cosEl·sinAz, −sinEl, −cosEl·cosAz)  (d.y < 0, el > 0)
 *
 * Regions quantizes the Lambert intensity I = max(0, n̂·L̂) into a tone band
 * (thresholds) → coverage (ladder) → hatch spacing (coverageToSpacing), and
 * builds the specular hotspot (the one iso-band exemption, spec group E).
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const G3 = Vectura.Geometry3D || {};

  const finite = G3.finite || ((value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback));
  const clamp = G3.clamp || ((value, min, max) => Math.max(min, Math.min(max, Number(value) || 0)));
  const v = G3.v || ((x, y, z) => ({ x, y, z }));
  const mul = G3.mul || ((a, s) => v(a.x * s, a.y * s, a.z * s));
  const dot = G3.dot || ((a, b) => a.x * b.x + a.y * b.y + a.z * b.z);
  const normalize = G3.normalize || ((a) => {
    const len = Math.hypot(a.x, a.y, a.z) || 1;
    return v(a.x / len, a.y / len, a.z / len);
  });
  const rotatePoint = G3.rotatePoint;
  const projectPoint = G3.projectPoint;
  const circlePath = G3.circlePath;
  const DEG = Math.PI / 180;

  // ── Lighting (CONTRACT L1) ──────────────────────────────────────────────────

  // World-space TRAVEL direction of the sunlight (points away from the sun,
  // into the scene). Unit length; d.y < 0 for any elevation above the horizon.
  const lightWorldDir = (light) => {
    const src = light || {};
    const az = finite(src.azimuth, 135) * DEG;
    const el = finite(src.elevation, 45) * DEG;
    const cosEl = Math.cos(el);
    // travel = −(toward-sun)
    return normalize(v(-cosEl * Math.sin(az), -Math.sin(el), -cosEl * Math.cos(az)));
  };

  // Inverse of lightWorldDir: a travel vector → {azimuth, elevation} (degrees).
  // 2B may use this when a drag hands back a direction rather than angles.
  const lightFromDir = (dir) => {
    const d = dir || {};
    // toward-sun = −travel
    const sx = -finite(d.x, 0);
    const sy = -finite(d.y, -1);
    const sz = -finite(d.z, 0);
    const len = Math.hypot(sx, sy, sz) || 1;
    const ny = clamp(sy / len, -1, 1);
    return {
      azimuth: (Math.atan2(sx, sz) / DEG + 360) % 360,
      elevation: Math.asin(ny) / DEG,
    };
  };

  // Unit vector pointing TOWARD the light (the Lambert L̂), = −travel.
  const towardLight = (light) => normalize(mul(lightWorldDir(light), -1));

  const Lighting = { lightWorldDir, lightFromDir, towardLight };

  // ── Regions (tone banding) ──────────────────────────────────────────────────

  // Coerce the 2nd argument of intensity() into a unit toward-light vector:
  // accepts a light record ({azimuth,elevation}) OR a precomputed L̂ vector
  // (so the face loop can hoist towardLight() out of the hot path).
  const asLightVec = (arg) => {
    if (arg && (typeof arg.azimuth === 'number' || typeof arg.elevation === 'number')) return towardLight(arg);
    if (arg && Number.isFinite(arg.x) && Number.isFinite(arg.y) && Number.isFinite(arg.z)) return normalize(arg);
    return v(0, 1, 0);
  };

  // Lambert intensity of a world normal under the light: I = max(0, n̂·L̂).
  const intensity = (normalWorld, arg) => {
    const L = asLightVec(arg);
    const n = normalize(normalWorld || v(0, 0, 1));
    return Math.max(0, dot(n, L));
  };

  const validLadder = (tone) => {
    const ladder = tone && Array.isArray(tone.ladder) ? tone.ladder.filter((c) => Number.isFinite(c)) : [];
    return ladder.length ? ladder : [0.5];
  };

  const validThresholds = (tone) => (tone && Array.isArray(tone.thresholds)
    ? tone.thresholds.filter((t) => Number.isFinite(t))
    : []);

  // Quantize intensity I∈[0,1] → band index. Band count is the ladder length
  // (the reader trusts the ladder, tolerating a thresholds/bands length that a
  // hand-edited tone left inconsistent). Higher I → higher band index.
  const band = (I, tone) => {
    const nB = validLadder(tone).length;
    const th = validThresholds(tone);
    const cuts = Math.min(th.length, nB - 1);
    let idx = 0;
    for (let k = 0; k < cuts; k++) {
      if (finite(I, 0) >= th[k]) idx = k + 1;
    }
    return clamp(idx, 0, nB - 1);
  };

  // Coverage fraction (0..1) for a band index, dark→light along the ladder.
  const coverageFor = (bandIndex, tone) => {
    const ladder = validLadder(tone);
    const i = clamp(Math.round(finite(bandIndex, 0)), 0, ladder.length - 1);
    return clamp(finite(ladder[i], 0.5), 0, 1);
  };

  // Coverage → hatch spacing (document mm). Denser coverage → tighter lines;
  // floored at the pen width so a fill never asks for lines finer than the pen.
  const coverageToSpacing = (coverage, penWidth) => {
    const pw = Math.max(0.05, finite(penWidth, 0.3));
    const cov = clamp(finite(coverage, 0.5), 0.02, 1);
    return Math.max(pw, pw / cov);
  };

  // Whole-normal → spacing in one call (band → coverage → spacing).
  const spacingFor = (normalWorld, lightVec, tone, penWidth) => {
    const I = intensity(normalWorld, lightVec);
    return coverageToSpacing(coverageFor(band(I, tone), tone), penWidth);
  };

  // Swatch helper (E-06): the full band ladder as {band, coverage, spacing},
  // dark→light, for a given pen width. Pure — drives a UI preview strip.
  const toneLadder = (tone, penWidth) => validLadder(tone).map((coverage, i) => ({
    band: i,
    coverage: clamp(finite(coverage, 0.5), 0, 1),
    spacing: coverageToSpacing(coverage, penWidth),
  }));

  // Specular hotspot for a curved record (spec group E, the one iso-band
  // exemption). Reuses the topoform half-vector recipe in CAMERA space: the
  // mirror normal H = normalize(L_cam + V) with V = +z (toward viewer); the
  // front face whose camera normal best aligns with H carries the highlight.
  // Returns a filled ring path (meta.fill) or null (off, unlit, size 0).
  const specularRegion = (record, camAngles, toneSpec, light) => {
    const spec = toneSpec || {};
    const size = Math.max(0, finite(spec.size, 0));
    if (spec.enabled === false || size <= 0) return null;
    if (!record || !Array.isArray(record.faces) || !circlePath || !rotatePoint) return null;
    const Lcam = normalize(rotatePoint(towardLight(light), camAngles || { yaw: 0, pitch: 0, roll: 0 }));
    const H = normalize(v(Lcam.x, Lcam.y, Lcam.z + 1)); // + view direction (+z)
    let best = null;
    let bestDot = 0.0; // require a positively-aligned front face (unlit → null)
    record.faces.forEach((face) => {
      if (!face || !face.front || !face.normalCam) return;
      const n = normalize(face.normalCam);
      const d = n.x * H.x + n.y * H.y + n.z * H.z;
      if (d > bestDot) { bestDot = d; best = face; }
    });
    if (!best || !Array.isArray(best.polygon) || !best.polygon.length) return null;
    let cx = 0; let cy = 0; let count = 0;
    best.polygon.forEach((pt) => {
      if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) { cx += pt.x; cy += pt.y; count += 1; }
    });
    if (!count) return null;
    cx /= count; cy /= count;
    // Radius scales with the object's projected extent so it reads at any zoom.
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    (record.projected || []).forEach((pt) => {
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
      if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
    });
    const diag = Number.isFinite(minX) ? (Math.hypot(maxX - minX, maxY - minY) || 1) : 1;
    const radius = Math.max(0.8, diag * 0.05 * clamp(size, 0, 20));
    const normal = best.normalWorld || v(0, 0, 1);
    const path = circlePath(cx, cy, radius, 28, {
      algorithm: 'scene3d',
      kind: 'sceneFill',
      fill: true,
      specular: true,
      sceneTarget: {
        objectId: record.id,
        faceId: best.faceId || null,
        edgeClass: null,
        regionClass: 'specular',
        depth: -finite(best.centroidZ, 0),
        normal: { x: normal.x, y: normal.y, z: normal.z },
        facingUp: normal.y > 0.7,
        occluded: false,
      },
    });
    return path && path.length >= 3 ? path : null;
  };

  const Regions = {
    intensity,
    band,
    coverageFor,
    coverageToSpacing,
    spacingFor,
    toneLadder,
    towardLight,
    specularRegion,
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Lighting, Regions });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Lighting, Regions };
  }
})();
