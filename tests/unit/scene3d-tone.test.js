const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * scene3d light-made tone (Phase 2 stream 2A).
 *
 * - tone.enabled === false → hatch is light-INVARIANT (exactly Phase 1); the
 *   only light-driven geometry is shadows, which we isolate by disabling ground.
 * - tone.enabled → the face's Lambert intensity drives band → coverage →
 *   spacing; a face turned toward the sun lands in the top (max-coverage) band.
 * - Specular hotspot appears on a lit sphere and vanishes at size 0.
 */

const clone = (value) => JSON.parse(JSON.stringify(value));
const BOUNDS = { width: 320, height: 220, penWidth: 0.3 };

const strip = (paths) => paths.map((p) => ({
  pts: p.map((q) => ({ x: q.x, y: q.y })),
  meta: p.meta || null,
}));

describe('scene3d tone (CONTRACT L3)', () => {
  let runtime;
  let V;
  let algo;
  let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
    // Stub the style cascade so we can force a hatch mapper (mirrors the Phase 1
    // generate test — the real cascade is stream 1B's).
    V.Scene3D.StyleCascade = {
      resolve(styleTable, { objectId }) {
        const t = styleTable || {};
        const s = (t.byObject && t.byObject[objectId]) || t.scene || {};
        return { penId: s.penId != null ? s.penId : null, mapper: s.mapper || 'none', params: { ...(s.params || {}) } };
      },
    };
  });

  afterAll(() => {
    if (V.Scene3D) delete V.Scene3D.StyleCascade;
    runtime.cleanup();
  });

  const hatchedBox = (tone, light) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'obj-1', name: 'Box', primitive: 'box', params: { sx: 60, sy: 60, sz: 60 },
      transform: { x: 0, y: 40, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };          // isolate hatch from cast shadows
    p.camera = { projection: 'orthographic', yaw: -30, pitch: 25, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.styleTable = {
      scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 50 } },
      byObject: {}, byFace: {},
    };
    if (tone) p.tone = tone;
    if (light) p.lights = [{ id: 'sun', type: 'directional', ...light, castShadows: true }];
    return p;
  };

  const fills = (paths) => paths.filter((p) => p.meta && p.meta.kind === 'sceneFill');

  test('tone.enabled=false: hatch is light-invariant (Phase 1 regression)', () => {
    const off = { enabled: false, bands: 3, thresholds: [0.25, 0.55, 0.8], ladder: [0.15, 0.4, 0.65, 0.9], specular: { enabled: false, size: 0 } };
    const a = algo.generate(hatchedBox(off, { azimuth: 20, elevation: 70 }), null, null, BOUNDS) || [];
    const b = algo.generate(hatchedBox(off, { azimuth: 250, elevation: 10 }), null, null, BOUNDS) || [];
    expect(fills(a).length).toBeGreaterThan(0);
    // Different light, tone off → byte-identical output (no intensity applied).
    expect(strip(a)).toEqual(strip(b));
  });

  test('tone.enabled=true: hatch DOES vary with the light (intensity is live)', () => {
    const on = clone(defaults).tone;
    const a = algo.generate(hatchedBox(on, { azimuth: 20, elevation: 70 }), null, null, BOUNDS) || [];
    const b = algo.generate(hatchedBox(on, { azimuth: 250, elevation: 10 }), null, null, BOUNDS) || [];
    expect(fills(a).length).toBeGreaterThan(0);
    expect(strip(a)).not.toEqual(strip(b));
  });

  test('a face turned toward the sun lands in the top coverage band', () => {
    const tone = clone(defaults).tone;
    const Regions = V.Scene3D.Regions;
    const Lighting = V.Scene3D.Lighting;
    // Point the sun straight down (+Y face fully lit). The box top face normal
    // is world +Y → intensity ≈ 1 → top band → max ladder coverage.
    const light = { azimuth: 0, elevation: 90 };
    const L = Regions.towardLight(light);
    const topBand = Regions.band(Regions.intensity({ x: 0, y: 1, z: 0 }, L), tone);
    expect(topBand).toBe(tone.ladder.length - 1);
    const botBand = Regions.band(Regions.intensity({ x: 0, y: -1, z: 0 }, L), tone);
    expect(botBand).toBe(0);
    expect(Regions.coverageFor(topBand, tone)).toBeGreaterThan(Regions.coverageFor(botBand, tone));
  });

  const sphere = (specSize) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'obj-1', name: 'Ball', primitive: 'sphere', params: { radius: 40, detail: 20 },
      transform: { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.camera = { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
    p.tone = { ...clone(defaults).tone, specular: { enabled: specSize > 0, size: specSize } };
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 200, elevation: 55, castShadows: false }];
    return p;
  };

  const specularCount = (paths) => paths.filter((p) => p.meta && p.meta.specular).length;

  test('the solid specular disc is retired (highlight is the wrap fill\'s blank brightest band)', () => {
    // The old solid-white specular disc obscured the form and read as a pasted-on
    // sphere; it is retired. The highlight is now intrinsic — SurfaceFill leaves
    // the brightest tone band un-hatched (see scene3d-surface-fill.test.js). No
    // meta.specular fill is ever emitted now, at any specular size.
    expect(specularCount(algo.generate(sphere(1), null, null, BOUNDS) || [])).toBe(0);
    expect(specularCount(algo.generate(sphere(0), null, null, BOUNDS) || [])).toBe(0);
  });

  test('deterministic with tone on', () => {
    const p = hatchedBox(clone(defaults).tone, { azimuth: 120, elevation: 40 });
    expect(strip(algo.generate(clone(p), null, null, BOUNDS) || []))
      .toEqual(strip(algo.generate(clone(p), null, null, BOUNDS) || []));
  });
});
