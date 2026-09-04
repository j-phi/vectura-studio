const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene3D.Shadows — LIGHT-relative silhouette (camera-invariant shadow shape).
 *
 * A cast shadow is a projection of the caster from the LIGHT. Its outline must
 * therefore depend only on the light + geometry, NEVER on where the camera sits.
 * The silhouette edge set is classified from the light's viewpoint (a face-pair
 * that straddles the light — one toward, one away), not the camera's front/back.
 *
 *  - CAMERA INVARIANCE: orbiting the camera (yaw) with a FIXED sun must not
 *    change the projected footprint. Under orthographic projection at a fixed
 *    pitch, a yaw orbit only ROTATES the ground footprint, so its screen AREA is
 *    invariant. The old camera-relative classification drifted (~2%+) and the
 *    torus hole ratio swam as faces flipped front/back — this test pins that.
 *  - LIGHT DEPENDENCE: moving the LIGHT (azimuth / elevation) DOES change the
 *    footprint (direction + length), so the fix is not merely freezing the shape.
 *  - BOX stays a SOLID footprint; determinism preserved.
 */

const clone = (value) => JSON.parse(JSON.stringify(value));
const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };

const torusObj = (id, x, y) => ({
  id, name: id, primitive: 'torus', params: { sx: 80, sy: 18, sz: 18, detail: 26 },
  transform: { x, y, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
});
const boxObj = (id, x, y, size = 30) => ({
  id, name: id, primitive: 'box', params: { sx: size, sy: size, sz: size },
  transform: { x, y, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
});

describe('Scene3D.Shadows — light-relative silhouette (camera-invariant)', () => {
  let runtime;
  let V;
  let Shadows;
  let HLR;
  let Lighting;
  let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Shadows = V.Scene3D.Shadows;
    HLR = V.Scene3D.HLR;
    Lighting = V.Scene3D.Lighting;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });

  afterAll(() => runtime.cleanup());

  // Directional-sun scene (no HLR occlusion, isolating the projected footprint
  // from screen occlusion by the caster's own body).
  const runShadows = (objects, light, camera = {}) => {
    const p = V.Scene3D.Params.normalizeParams({
      ...clone(defaults), objects, ground: { enabled: true },
      lights: [{ id: 'sun', type: 'directional', castShadows: true, ...light }],
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1, ...camera },
    });
    const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
    const clipper = HLR.createClipper([], { bias: 0.05 });
    const lightDir = Lighting.lightWorldDir(p.lights[0]);
    return Shadows.build(scene, p, BOUNDS, clipper, lightDir, {});
  };

  const shadowPaths = (paths) => paths.filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.regionClass === 'castShadow');
  const ringArea = (poly) => { let a = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j].x * poly[i].y - poly[i].x * poly[j].y; return Math.abs(a); };
  const outerRing = (paths) => {
    const polys = [...new Set(shadowPaths(paths).map((p) => JSON.stringify(p.meta.sceneTarget.pickPolygon)))].map((s) => JSON.parse(s));
    return polys.sort((a, b) => ringArea(b) - ringArea(a))[0];
  };
  const outerArea = (paths) => ringArea(outerRing(paths));
  const outerCentroidX = (paths) => { const r = outerRing(paths); let cx = 0; r.forEach((p) => { cx += p.x; }); return cx / r.length; };

  // Closest a hatch RUN gets to the outer-ring centroid, normalised by radius: a
  // filled footprint → runs cross the centre (≈0); an annulus → a clear hole (>0).
  const distToSeg = (px, py, a, b) => {
    const vx = b.x - a.x; const vy = b.y - a.y; const wx = px - a.x; const wy = py - a.y;
    const l2 = vx * vx + vy * vy; let t = l2 > 0 ? (wx * vx + wy * vy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (a.x + t * vx), py - (a.y + t * vy));
  };
  const holeRatio = (paths) => {
    const outer = outerRing(paths);
    let cx = 0; let cy = 0; outer.forEach((p) => { cx += p.x; cy += p.y; }); cx /= outer.length; cy /= outer.length;
    let R = 0; outer.forEach((p) => { R = Math.max(R, Math.hypot(p.x - cx, p.y - cy)); });
    let closest = Infinity;
    shadowPaths(paths).forEach((path) => { for (let i = 1; i < path.length; i++) { const d = distToSeg(cx, cy, path[i - 1], path[i]); if (d < closest) closest = d; } });
    return closest / (R || 1);
  };

  // ── CAMERA INVARIANCE (the core fix) ────────────────────────────────────────
  test('a torus shadow footprint is INVARIANT as the camera orbits (fixed sun)', () => {
    const light = { azimuth: 180, elevation: 55 };
    const yaws = [0, 25, 50, 75];
    const areas = yaws.map((yaw) => outerArea(runShadows([torusObj('obj-1', 0, 200)], light, { yaw })));
    const holes = yaws.map((yaw) => holeRatio(runShadows([torusObj('obj-1', 0, 200)], light, { yaw })));
    // Under ortho at fixed pitch a yaw orbit only rotates the ground footprint,
    // so its screen AREA must be invariant. Camera-relative classification let it
    // drift ~2.3% (silhouette loops changed as faces flipped front/back).
    const maxA = Math.max(...areas); const minA = Math.min(...areas);
    expect(maxA / minA).toBeLessThan(1.01);
    // The annular hole must not swim either: hole ratio spread stays tight.
    const spread = Math.max(...holes) - Math.min(...holes);
    expect(spread).toBeLessThan(0.01);
    // And it stays a genuine annulus (open hole) at EVERY camera angle.
    holes.forEach((h) => expect(h).toBeGreaterThan(0.3));
  });

  // ── LIGHT DEPENDENCE (the fix is not just freezing the shape) ───────────────
  test('moving the sun (azimuth) shifts the footprint; lowering it grows the footprint', () => {
    const cam = { yaw: 0 };
    // Azimuth swing moves the shadow to a different quarter of the ground.
    const cxSouth = outerCentroidX(runShadows([torusObj('obj-1', 0, 90)], { azimuth: 180, elevation: 40 }, cam));
    const cxEast = outerCentroidX(runShadows([torusObj('obj-1', 0, 90)], { azimuth: 90, elevation: 40 }, cam));
    expect(Math.abs(cxSouth - cxEast)).toBeGreaterThan(50);
    // A lower sun stretches the projection → a larger footprint.
    const areaHigh = outerArea(runShadows([torusObj('obj-1', 0, 90)], { azimuth: 180, elevation: 60 }, cam));
    const areaLow = outerArea(runShadows([torusObj('obj-1', 0, 90)], { azimuth: 180, elevation: 25 }, cam));
    expect(areaLow).toBeGreaterThan(areaHigh * 1.03);
  });

  // ── BOX stays SOLID ─────────────────────────────────────────────────────────
  test('a convex box shadow stays a SOLID filled footprint (no spurious hole)', () => {
    const paths = runShadows([boxObj('obj-1', 0, 20, 30)], { azimuth: 180, elevation: 45 });
    expect(shadowPaths(paths).length).toBeGreaterThan(0);
    expect(holeRatio(paths)).toBeLessThan(0.12);
  });

  // ── DETERMINISM ─────────────────────────────────────────────────────────────
  test('shadow build is deterministic (identical inputs → identical output)', () => {
    const a = shadowPaths(runShadows([torusObj('obj-1', 0, 120)], { azimuth: 160, elevation: 45 }, { yaw: 20 }));
    const b = shadowPaths(runShadows([torusObj('obj-1', 0, 120)], { azimuth: 160, elevation: 45 }, { yaw: 20 }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
