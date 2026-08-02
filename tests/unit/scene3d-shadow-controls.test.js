const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene3D.Shadows — Phase 5 shadow controls (ask #6 shadow half).
 *
 * The legacy renderer hardcoded SHADOW_ANGLE=45 and SHADOW_COVERAGE=0.5, always
 * solid, pen from the caster. Phase 5 makes shadow rendering fully controllable
 * via a scene-level `params.shadow` bag (threaded into Shadows.build as
 * opts.shadow) plus a per-object cast toggle (obj.shadow.enabled, null=inherit).
 *
 * Each test below FAILS on the hardcoded-constant code and passes once the bag
 * is honored. A regression guard proves DEFAULTS reproduce the pre-Phase-5
 * output byte-identical.
 */

const clone = (value) => JSON.parse(JSON.stringify(value));
const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };

const boxObj = (id, x, y, size = 30, extra = {}) => ({
  id, name: id, primitive: 'box', params: { sx: size, sy: size, sz: size },
  transform: { x, y, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid', ...extra,
});

describe('Scene3D.Shadows controls (Phase 5)', () => {
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

  // Build shadow paths for a directional sun, threading a normalized shadow bag.
  // `passBag` false replicates the LEGACY call (no opts.shadow at all) so the
  // regression guard can compare defaults against the constant-fallback path.
  const buildShadows = (objects, shadowBag = {}, { passBag = true, lightOverride = {} } = {}) => {
    const p = V.Scene3D.Params.normalizeParams({
      ...clone(defaults),
      objects,
      ground: { enabled: true },
      lights: [{ id: 'sun', type: 'directional', castShadows: true, azimuth: 160, elevation: 45, ...lightOverride }],
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
      shadow: shadowBag,
    });
    const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
    const clipper = HLR.createClipper([], { bias: 0.05 }); // no HLR occlusion — isolate controls
    const dir = Lighting.lightWorldDir(p.lights[0]);
    return Shadows.build(scene, p, BOUNDS, clipper, dir, passBag ? { shadow: p.shadow } : {});
  };

  const sPaths = (paths) => paths.filter((p) => p.meta && p.meta.sceneTarget && p.meta.sceneTarget.regionClass === 'castShadow');
  const lineCount = (paths) => sPaths(paths).length;
  const totalLen = (paths) => sPaths(paths).reduce((acc, path) => {
    let l = 0;
    for (let i = 1; i < path.length; i++) l += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    return acc + l;
  }, 0);
  const regionCount = (paths) => new Set(sPaths(paths).map((p) => JSON.stringify(p.meta.sceneTarget.pickPolygon))).size;
  // Mean line direction, absolute components (orientation without sign).
  const meanDir = (paths) => {
    let sx = 0; let sy = 0;
    sPaths(paths).forEach((p) => {
      if (p.length < 2) return;
      const dx = p[p.length - 1].x - p[0].x;
      const dy = p[p.length - 1].y - p[0].y;
      const l = Math.hypot(dx, dy) || 1;
      sx += Math.abs(dx / l); sy += Math.abs(dy / l);
    });
    return { sx, sy };
  };
  // Mean radius of hatch vertices from their own centroid — smaller = lines
  // concentrated toward the core.
  const meanRadial = (paths) => {
    const pts = [];
    sPaths(paths).forEach((p) => p.forEach((pt) => pts.push(pt)));
    if (!pts.length) return 0;
    let cx = 0; let cy = 0;
    pts.forEach((p) => { cx += p.x; cy += p.y; });
    cx /= pts.length; cy /= pts.length;
    let r = 0;
    pts.forEach((p) => { r += Math.hypot(p.x - cx, p.y - cy); });
    return r / pts.length;
  };

  test('HEADLINE — shadowDensity changes the number of shadow hatch lines', () => {
    const sparse = buildShadows([boxObj('obj-1', 0, 20, 40)], { shadowDensity: 10 });
    const dense = buildShadows([boxObj('obj-1', 0, 20, 40)], { shadowDensity: 95 });
    expect(lineCount(sparse)).toBeGreaterThan(0);
    expect(lineCount(dense)).toBeGreaterThan(lineCount(sparse));
  });

  test('HEADLINE — shadowAngle changes hatch orientation', () => {
    const a0 = buildShadows([boxObj('obj-1', 0, 20, 40)], { shadowAngle: 0 });
    const a90 = buildShadows([boxObj('obj-1', 0, 20, 40)], { shadowAngle: 90 });
    const d0 = meanDir(a0);
    const d90 = meanDir(a90);
    // angle 0 → hatch runs ~horizontal (|dx| dominates); angle 90 → ~vertical.
    expect(d0.sx).toBeGreaterThan(d0.sy);
    expect(d90.sy).toBeGreaterThan(d90.sx);
  });

  test('HEADLINE — shadowLineType:"dashed" stamps strokeDash on shadow paths', () => {
    const dashed = buildShadows([boxObj('obj-1', 0, 20, 40)], { shadowLineType: 'dashed' });
    const solid = buildShadows([boxObj('obj-1', 0, 20, 40)], { shadowLineType: 'solid' });
    expect(sPaths(dashed).some((p) => Array.isArray(p.meta.strokeDash) && p.meta.strokeDash.length)).toBe(true);
    expect(sPaths(solid).some((p) => Array.isArray(p.meta.strokeDash) && p.meta.strokeDash.length)).toBe(false);
  });

  test('shadowLayers:true emits nested inset sub-regions, densest toward the core', () => {
    const flat = buildShadows([boxObj('obj-1', 0, 20, 50)], { shadowLayers: false });
    const layered = buildShadows([boxObj('obj-1', 0, 20, 50)], { shadowLayers: true, shadowLayerCount: 3 });
    // More distinct pick polygons than the single flat hull.
    expect(regionCount(layered)).toBeGreaterThan(regionCount(flat));
    // More total ink (nested overlapping rings) …
    expect(totalLen(layered)).toBeGreaterThan(totalLen(flat));
    // … and that ink concentrates toward the core (mean radius shrinks).
    expect(meanRadial(layered)).toBeLessThan(meanRadial(flat));
  });

  test('per-object shadow.enabled:false removes that object cast shadow; others remain', () => {
    // Distinct pens per object so each caster is its OWN style class and the
    // single-caster region keeps its casterId identity (a shared class → null).
    const styleOf = (id) => ({ penId: id === 'obj-2' ? 'pen-b' : 'pen-a' });
    const run = (objects) => {
      const p = V.Scene3D.Params.normalizeParams({
        ...clone(defaults), objects, ground: { enabled: true },
        lights: [{ id: 'sun', type: 'directional', castShadows: true, azimuth: 160, elevation: 45 }],
        camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
        shadow: {},
      });
      const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
      const clipper = HLR.createClipper([], { bias: 0.05 });
      const dir = Lighting.lightWorldDir(p.lights[0]);
      return Shadows.build(scene, p, BOUNDS, clipper, dir, { styleOf, shadow: p.shadow });
    };
    const both = run([boxObj('obj-1', -55, 20, 30), boxObj('obj-2', 55, 20, 30)]);
    const oneOff = run([
      boxObj('obj-1', -55, 20, 30),
      boxObj('obj-2', 55, 20, 30, { shadow: { enabled: false } }),
    ]);
    expect(sPaths(both).some((p) => p.meta.sceneTarget.casterId === 'obj-2')).toBe(true);
    expect(sPaths(oneOff).some((p) => p.meta.sceneTarget.casterId === 'obj-2')).toBe(false);
    // obj-1 still casts.
    expect(sPaths(oneOff).some((p) => p.meta.sceneTarget.casterId === 'obj-1')).toBe(true);
    expect(totalLen(oneOff)).toBeLessThan(totalLen(both));
  });

  test('shadowPenId overrides the drawn pen for every shadow', () => {
    const styleOf = () => ({ penId: 'pen-caster' });
    const p = V.Scene3D.Params.normalizeParams({
      ...clone(defaults), objects: [boxObj('obj-1', 0, 20, 40)], ground: { enabled: true },
      lights: [{ id: 'sun', type: 'directional', castShadows: true, azimuth: 160, elevation: 45 }],
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
      shadow: { shadowPenId: 'pen-shadow' },
    });
    const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
    const clipper = HLR.createClipper([], { bias: 0.05 });
    const dir = Lighting.lightWorldDir(p.lights[0]);
    const paths = sPaths(Shadows.build(scene, p, BOUNDS, clipper, dir, { styleOf, shadow: p.shadow }));
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((pp) => expect(pp.meta.penId).toBe('pen-shadow'));
  });

  test('REGRESSION — defaults reproduce the pre-Phase-5 shadow output byte-identical', () => {
    const withDefaults = buildShadows([boxObj('obj-1', 0, 20, 40)], {}, { passBag: true });
    const legacy = buildShadows([boxObj('obj-1', 0, 20, 40)], {}, { passBag: false });
    expect(JSON.stringify(sPaths(withDefaults))).toBe(JSON.stringify(sPaths(legacy)));
  });

  test('determinism — identical params regenerate byte-identical output', () => {
    const bag = { shadowDensity: 70, shadowAngle: 30, shadowLineType: 'dashdot', shadowLayers: true, shadowLayerCount: 4 };
    const a = buildShadows([boxObj('obj-1', 0, 20, 40)], bag);
    const b = buildShadows([boxObj('obj-1', 0, 20, 40)], bag);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
