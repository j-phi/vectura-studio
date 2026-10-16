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
const { installOccluderScanCounter } = require('../helpers/occluder-scan-counter');

const clone = (value) => JSON.parse(JSON.stringify(value));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3, truncate: true, fastPreview: false };

const boxObj = (id, x, z, size = 24) => ({
  id, name: id, primitive: 'box', params: { sx: size, sy: size, sz: size },
  transform: { x, y: 0, z, yaw: id.charCodeAt(1) * 7, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
});

// Measured (deterministic): indexed c6=8,226 c24=64,446 ratio 7.83; forced
// linear scan c6=24,894 c24=448,721 ratio 18.03. Thresholds sit between.
const RATIO_MAX = 12;
const N24_MAX = 200000;

describe('Scene3D.Shadows drag performance (P2 — shared occluder index reuse)', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  // Build scene + occluder set + a FRESH clipper (matching scene3d.js's
  // real per-frame createClipper call) + run Shadows.build once, counting only
  // the occluder candidates examined by the clipper (deterministic, no clock) (the metric under
  // test — same instrumentation technique as scene3d-drag.test.js).
  const measureShadowCandidateTests = (count) => {
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
      const counter = installOccluderScanCounter(HLR);
      try {
        const clipper = HLR.createClipper(occ, { bias: 0.05 });
        const lightDir = V.Scene3D.Lighting.lightWorldDir(p.lights[0]);
        V.Scene3D.Shadows.build(scene, p, BOUNDS, clipper, lightDir, { shadow: p.shadow });
      } finally {
        counter.restore();
      }
      return counter.count();
    };
    run(); // warm-up
    return run();
  };

  test('shadow-hatch occluder candidate tests scale sub-quadratically with occluder count', () => {
    const t6 = measureShadowCandidateTests(6);
    const t24 = measureShadowCandidateTests(24);
    const ratio = t24 / Math.max(t6, 1);
    // eslint-disable-next-line no-console
    console.log('[perf] shadows candidate tests c6=%s c24=%s ratio=%s', t6, t24, ratio.toFixed(2));
    expect(ratio).toBeLessThan(RATIO_MAX);
    expect(t24).toBeLessThan(N24_MAX);
  }, 60000);
});
