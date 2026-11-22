const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Ground height (Y) — the floor carries an optional world-Y offset `ground.y`.
 * Objects stay put; the floor (and every shadow cast onto it) moves. y = 0 /
 * absent must stay byte-identical, so the 0 cases assert against the legacy
 * numbers and the nonzero cases assert the shift analytically.
 */
const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };
const CAMERA = { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };

describe('scene3d — ground height (Y)', () => {
  let runtime; let V; let Params; let Scene; let Shadows; let HLR; let Lighting; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Params = V.Scene3D.Params; Scene = V.Scene3D.Scene; Shadows = V.Scene3D.Shadows;
    HLR = V.Scene3D.HLR; Lighting = V.Scene3D.Lighting; defaults = V.ALGO_DEFAULTS.scene3d;
  });
  afterAll(() => runtime.cleanup());

  const box = (y) => ({
    id: 'obj-1', name: 'obj-1', primitive: 'box', params: { sx: 30, sy: 30, sz: 30 },
    transform: { x: 0, y, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
  });
  const norm = (ground, light, objects = [box(120)]) => Params.normalizeParams({
    ...clone(defaults), objects, ground: { enabled: true, ...ground }, lights: [light], camera: CAMERA,
  });
  const SUN = { id: 'sun', type: 'directional', castShadows: true, azimuth: 160, elevation: 45 };
  const POINT = { id: 'pt', type: 'point', castShadows: true, position: { x: 40, y: 260, z: 30 } };

  const shadow = (p, withPosition) => {
    const scene = Scene.assembleScene(p, BOUNDS);
    const clipper = HLR.createClipper([], { bias: 0.05 });
    const lt = p.lights[0];
    const out = withPosition
      ? Shadows.build(scene, p, BOUNDS, clipper, null, { lightPosition: lt.position, light: lt })
      : Shadows.build(scene, p, BOUNDS, clipper, Lighting.lightWorldDir(lt), {});
    const paths = out.filter((q) => q.meta && q.meta.sceneTarget && q.meta.sceneTarget.regionClass === 'castShadow');
    const poly = paths.length ? paths[0].meta.sceneTarget.pickPolygon : [];
    return { scene, paths, poly };
  };
  const centroid = (poly) => ({
    x: poly.reduce((a, q) => a + q.x, 0) / poly.length,
    y: poly.reduce((a, q) => a + q.y, 0) / poly.length,
  });

  test('ground record: quad sits at y and records groundY', () => {
    const rec = Scene.assembleScene(norm({ y: 25 }, SUN), BOUNDS).ground;
    expect(rec.groundY).toBe(25);
    rec.world.forEach((pt) => expect(pt.y).toBe(25));
    const flat = Scene.assembleScene(norm({}, SUN), BOUNDS).ground;
    expect(flat.groundY).toBe(0);
    flat.world.forEach((pt) => expect(pt.y).toBe(0));
  });

  test('directional: raising the floor shifts the footprint by gy*d/d.y (projected)', () => {
    const p0 = norm({}, SUN); const p1 = norm({ y: 30 }, SUN);
    const a = shadow(p0); const b = shadow(p1);
    expect(a.poly.length).toBeGreaterThanOrEqual(3);
    expect(b.poly.length).toBeGreaterThanOrEqual(3);
    const d = Lighting.lightWorldDir(p0.lights[0]);
    const k = 30 / d.y;
    const ref = { x: 0, y: 0, z: 0 };
    const q0 = Scene.projectWorldPoint(ref, p0.camera, BOUNDS);
    const q1 = Scene.projectWorldPoint({ x: k * d.x, y: 30, z: k * d.z }, p0.camera, BOUNDS);
    const ca = centroid(a.poly); const cb = centroid(b.poly);
    expect(cb.x - ca.x).toBeCloseTo(q1.x - q0.x, 3);
    expect(cb.y - ca.y).toBeCloseTo(q1.y - q0.y, 3);
  });

  test('point light: the footprint follows the floor height (rays cross y = gy)', () => {
    const a = shadow(norm({}, POINT), true);
    const b = shadow(norm({ y: 40 }, POINT), true);
    expect(a.poly.length).toBeGreaterThanOrEqual(3);
    expect(b.poly.length).toBeGreaterThanOrEqual(3);
    const ca = centroid(a.poly); const cb = centroid(b.poly);
    expect(Math.hypot(cb.x - ca.x, cb.y - ca.y)).toBeGreaterThan(1);
    // Shadow grows with the caster-to-floor gap: a lower floor => bigger footprint.
    const lo = shadow(norm({ y: -40 }, POINT), true);
    const span = (poly) => Math.max(...poly.map((q) => q.x)) - Math.min(...poly.map((q) => q.x));
    expect(span(lo.poly)).toBeGreaterThan(span(b.poly));
  });

  test('a light at or below the floor casts nothing; caster below the floor casts nothing', () => {
    expect(shadow(norm({ y: 300 }, POINT), true).paths.length).toBe(0);
    expect(shadow(norm({ y: 150 }, SUN)).paths.length).toBe(0); // box centre y 120, half 15 => below floor
  });

  test('y = 0 / absent is byte-identical (same shadow polygons)', () => {
    const a = shadow(norm({}, SUN));
    const b = shadow(norm({ y: 0 }, SUN));
    expect(JSON.stringify(b.paths)).toBe(JSON.stringify(a.paths));
  });

  test('groundCoverScale accepts a raised floor and still covers', () => {
    const p = norm({ y: 50 }, SUN);
    const r = Scene.groundCoverScale(p, BOUNDS);
    expect(Number.isFinite(r.scaleX)).toBe(true);
    expect(r.scaleX).toBeGreaterThan(0);
  });
});
