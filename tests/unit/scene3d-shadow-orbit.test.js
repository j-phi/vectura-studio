const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene3D.Shadows — orbit stability regressions (fix-map #1 + #2).
 *
 *  #2  DRAFT (fastPreview) shadows must be ground-clipped: at a low sun the raw
 *      per-caster hull projects far along the light ray and its hatch would run
 *      off the finite ground quad (the "full-canvas white lines" bug). Every
 *      emitted draft shadow point must lie within the ground quad's screen AABB.
 *
 *  #1  The shadow-fill hatch BASIS must be camera-independent: derived from a
 *      world ground-plane direction, not a screen angle. Expressed in the
 *      projected ground basis the hatch direction must be invariant as the
 *      camera orbits (the hatch stays glued to the ground instead of swimming).
 */

const clone = (value) => JSON.parse(JSON.stringify(value));
const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };

const boxObj = (id, x, y, size = 30) => ({
  id, name: id, primitive: 'box', params: { sx: size, sy: size, sz: size },
  transform: { x, y, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
});

describe('Scene3D.Shadows orbit stability (fix-map #1/#2)', () => {
  let runtime;
  let V;
  let G3;
  let Shadows;
  let HLR;
  let Lighting;
  let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    G3 = V.Geometry3D;
    Shadows = V.Scene3D.Shadows;
    HLR = V.Scene3D.HLR;
    Lighting = V.Scene3D.Lighting;
    defaults = V.ALGO_DEFAULTS.scene3d;
  });

  afterAll(() => runtime.cleanup());

  // Build a normalized scene + run Shadows.build. `light` overrides the sun,
  // `camera` overrides the view, `bounds` merges extra flags (fastPreview).
  const buildScene = ({ objects, light = {}, camera = {}, shadow } = {}) => {
    const p = V.Scene3D.Params.normalizeParams({
      ...clone(defaults),
      objects,
      ground: { enabled: true },
      lights: [{ id: 'sun', type: 'directional', castShadows: true, azimuth: 160, elevation: 40, ...light }],
      ...(shadow ? { shadow: { ...clone(defaults).shadow, ...shadow } } : {}),
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1, ...camera },
    });
    const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
    const occ = [];
    scene.objects.forEach((r) => r.faces.forEach((f) => {
      if (f.front) occ.push({ id: f.key, objectId: r.id, polygon: f.polygon });
    }));
    const clipper = HLR.createClipper(occ, { bias: 0.05 });
    return { p, scene, clipper };
  };

  const run = (cfg, bounds = {}) => {
    const { p, scene, clipper } = buildScene(cfg);
    const lightDir = Lighting.lightWorldDir(p.lights[0]);
    return { scene, paths: Shadows.build(scene, p, { ...BOUNDS, ...bounds }, clipper, lightDir, {}) };
  };

  const shadowPaths = (paths) => paths.filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.regionClass === 'castShadow');

  // ── #2 : DRAFT shadows stay inside the finite ground quad ───────────────────
  test('DRAFT shadow at a low sun emits no hatch outside the ground quad AABB', () => {
    // Low sun (≈5°, just above the 2° grazing cutoff): unclipped the hull projects
    // ~400mm along the ray, past the ±240mm ground quad → its hatch would run off
    // the plate. The draft path must clip to the ground before hatching.
    const cfg = { objects: [boxObj('obj-1', 0, 20, 30)], light: { azimuth: 180, elevation: 5 } };
    const { scene, paths } = run(cfg, { fastPreview: true, preview3dQuality: 'draft' });
    const shadows = shadowPaths(paths);
    expect(shadows.length).toBeGreaterThan(0);

    // Ground quad screen AABB (the finite receiver every shadow must sit on).
    const ground = scene.ground.faces[0].polygon;
    let gMinX = Infinity; let gMaxX = -Infinity; let gMinY = Infinity; let gMaxY = -Infinity;
    ground.forEach((pt) => {
      if (pt.x < gMinX) gMinX = pt.x; if (pt.x > gMaxX) gMaxX = pt.x;
      if (pt.y < gMinY) gMinY = pt.y; if (pt.y > gMaxY) gMaxY = pt.y;
    });
    const eps = 0.5; // float slack on the clip boundary
    shadows.forEach((path) => path.forEach((pt) => {
      expect(pt.x).toBeGreaterThanOrEqual(gMinX - eps);
      expect(pt.x).toBeLessThanOrEqual(gMaxX + eps);
      expect(pt.y).toBeGreaterThanOrEqual(gMinY - eps);
      expect(pt.y).toBeLessThanOrEqual(gMaxY + eps);
    }));
  });

  // ── #1 : hatch basis is camera-independent (anchored to the ground) ─────────
  // Dominant hatch screen direction = orientation of the longest emitted segment
  // (all hatch lines are parallel; the longest is a clean full-width line).
  const hatchDir = (paths) => {
    let best = 0; let bx = 1; let by = 0;
    shadowPaths(paths).forEach((path) => {
      for (let i = 1; i < path.length; i++) {
        const dx = path[i].x - path[i - 1].x; const dy = path[i].y - path[i - 1].y;
        const len = Math.hypot(dx, dy);
        if (len > best) { best = len; bx = dx; by = dy; }
      }
    });
    return { x: bx, y: by, len: best };
  };

  // Express a screen vector in the projected ground basis (gx=world+X, gz=world+Z
  // projected to screen). The (a,b) coefficients are the direction IN THE GROUND
  // PLANE — invariant under camera orbit iff the hatch is ground-anchored.
  const groundBasisAngle = (scene, camera, screenVec) => {
    const camAngles = { yaw: finiteOr(camera.yaw, 0), pitch: finiteOr(camera.pitch, 0), roll: finiteOr(camera.roll, 0) };
    const proj = (wx, wz) => {
      const cam = G3.rotatePoint({ x: wx, y: 0, z: wz }, camAngles);
      return G3.projectPoint(cam, scene.projOpts);
    };
    const o = proj(0, 0);
    const px = proj(100, 0); const pz = proj(0, 100);
    const gx = { x: px.x - o.x, y: px.y - o.y };
    const gz = { x: pz.x - o.x, y: pz.y - o.y };
    // Solve screenVec = a*gx + b*gz.
    const det = gx.x * gz.y - gx.y * gz.x;
    const a = (screenVec.x * gz.y - screenVec.y * gz.x) / det;
    const b = (gx.x * screenVec.y - gx.y * screenVec.x) / det;
    // Undirected: fold to a 0..180 bearing in the ground plane.
    let ang = Math.atan2(b, a) * 180 / Math.PI;
    ang = ((ang % 180) + 180) % 180;
    return ang;
  };
  const finiteOr = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const angDiff = (a, b) => { let d = Math.abs(a - b) % 180; if (d > 90) d = 180 - d; return d; };

  test('hatch basis is invariant under camera orbit (default fixed-angle scene)', () => {
    const objects = [boxObj('obj-1', 0, 20, 30)];
    const light = { azimuth: 160, elevation: 40 };
    const camA = { yaw: 0, pitch: 55 };
    const camB = { yaw: 42, pitch: 38 };

    const a = run({ objects, light, camera: camA });
    const b = run({ objects, light, camera: camB });
    expect(hatchDir(a.paths).len).toBeGreaterThan(1);
    expect(hatchDir(b.paths).len).toBeGreaterThan(1);

    const gaA = groundBasisAngle(a.scene, camA, hatchDir(a.paths));
    const gaB = groundBasisAngle(b.scene, camB, hatchDir(b.paths));
    // Ground-plane hatch direction must match across cameras (glued to ground).
    // Old screen-space fixed angle drifts by tens of degrees here.
    expect(angDiff(gaA, gaB)).toBeLessThan(6);
  });

  test('hatch basis is invariant under camera orbit (shadowAngleFollowsLight)', () => {
    const objects = [boxObj('obj-1', 0, 20, 30)];
    const light = { azimuth: 160, elevation: 40 };
    const shadow = { shadowAngleFollowsLight: true };
    const camA = { yaw: 0, pitch: 55 };
    const camB = { yaw: 42, pitch: 38 };

    const a = run({ objects, light, camera: camA, shadow });
    const b = run({ objects, light, camera: camB, shadow });
    expect(hatchDir(a.paths).len).toBeGreaterThan(1);
    expect(hatchDir(b.paths).len).toBeGreaterThan(1);

    const gaA = groundBasisAngle(a.scene, camA, hatchDir(a.paths));
    const gaB = groundBasisAngle(b.scene, camB, hatchDir(b.paths));
    expect(angDiff(gaA, gaB)).toBeLessThan(6);
  });
});
