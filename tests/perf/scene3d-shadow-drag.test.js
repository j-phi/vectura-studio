/**
 * FS-F1 P2: Scene3D.Shadows reuses the SAME HLR clipper (created once per
 * frame by scene3d.js and handed to Shadows.build) for every ground hatch
 * line it clips — see shadows.js:637 `clipper.clipPath(pts, ...)` inside
 * emitHatchLines. There is no separate occluder scan in shadows.js; the
 * profiler's "0.24 -> 90ms across the same scaling" quadratic in shadow
 * generation IS hlr.js's linear occluder scan, just paid many more times
 * (one call per hatch-line sample run instead of one per edge/fill segment).
 * The P1 spatial index therefore fixes shadow generation with NO shadows.js
 * code change — this file proves that reuse: it measures cumulative
 * clipPath cost during Shadows.build (not the whole HLR occluder count) as
 * object count scales, using the exact assembleScene + createClipper +
 * Shadows.build harness scene3d-shadows.test.js uses (bypassing algo.generate
 * so shadow-generation cost isn't diluted by the rest of the pipeline).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const clone = (value) => JSON.parse(JSON.stringify(value));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3, truncate: true, fastPreview: false };

const boxObj = (id, x, z, size = 24) => ({
  id, name: id, primitive: 'box', params: { sx: size, sy: size, sz: size },
  transform: { x, y: 0, z, yaw: id.charCodeAt(1) * 7, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
});

describe('Scene3D.Shadows drag performance (P2 — shared occluder index reuse)', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  // Build scene + occluder set + a FRESH clipper (matching scene3d.js's
  // real per-frame createClipper call) + run Shadows.build once, timing only
  // the cumulative time spent inside clipper.clipPath (the metric under
  // test — same instrumentation technique as scene3d-drag.test.js).
  const measureShadowClipPathMs = (count) => {
    const defaults = V.ALGO_DEFAULTS.scene3d;
    const objects = [];
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    for (let i = 0; i < count; i++) {
      const col = i % cols; const row = Math.floor(i / cols);
      objects.push(boxObj('o' + i, (col - cols / 2) * 12, (row - cols / 2) * 12));
    }
    const p = V.Scene3D.Params.normalizeParams({
      ...clone(defaults),
      objects,
      ground: { enabled: true },
      lights: [{ id: 'sun', type: 'directional', castShadows: true, azimuth: 150, elevation: 40 }],
      shadow: { shadowLayers: true, shadowLayerCount: 4, shadowDensity: 85 },
      camera: { projection: 'orthographic', yaw: 0, pitch: 55, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
    });
    const scene = V.Scene3D.Scene.assembleScene(p, BOUNDS);
    const occ = [];
    scene.objects.forEach((r) => r.faces.forEach((f) => {
      if (f.front) occ.push({ id: f.key, objectId: r.id, polygon: f.polygon, onlyOwnObject: r.visibility === 'xray' });
    }));

    const run = () => {
      const HLR = V.Scene3D.HLR;
      const clipper = HLR.createClipper(occ, { bias: 0.05 });
      const origClipPath = clipper.clipPath;
      let totalMs = 0;
      clipper.clipPath = (...args) => {
        const t0 = performance.now();
        const result = origClipPath.apply(clipper, args);
        totalMs += performance.now() - t0;
        return result;
      };
      const lightDir = V.Scene3D.Lighting.lightWorldDir(p.lights[0]);
      V.Scene3D.Shadows.build(scene, p, BOUNDS, clipper, lightDir, { shadow: p.shadow });
      return totalMs;
    };
    run(); // warm-up
    return run();
  };

  test('shadow-hatch clipPath cost scales sub-quadratically with occluder count', () => {
    const t6 = measureShadowClipPathMs(6);
    const t24 = measureShadowClipPathMs(24);
    const ratio = t24 / Math.max(t6, 0.001);
    // eslint-disable-next-line no-console
    console.log('[perf] shadows clipPath scaling t6=%sms t24=%sms ratio=%s loadavg=%s',
      t6.toFixed(2), t24.toFixed(2), ratio.toFixed(2), require('os').loadavg());
    // Same reasoning as scene3d-drag.test.js's HLR ratio guard: a linear
    // occluder scan is quadratic here (profiler: 0.24ms -> 90ms across this
    // exact scaling, ~375x). The shared spatial index brings this down to
    // close to linear.
    expect(ratio).toBeLessThan(6);
  }, 60000);
});
