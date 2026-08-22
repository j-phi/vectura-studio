/**
 * Phase 1 gate guard: a populated scene must regenerate fast enough to drag.
 * The 12-object gate demands >=20fps (<=50ms/frame). A full-detail scene3d
 * regen on 12 mixed primitives is ~400ms, so the live ground-drag runs at
 * DRAFT preview quality (coalesced onto animation frames). This guard asserts a
 * draft-quality preview regen of a 12-object scene stays bounded, protecting
 * the drag responsiveness the renderer relies on (renderer._scheduleSceneDragRegen).
 *
 * FS-F1 correction: the original fixture below set NO surface `style.mapper`
 * (every object defaulted to mapper:'none'), so the only clipper.clipPath
 * traffic came from a handful of silhouette/crease EDGES per object — it never
 * exercised the dense per-hatch-line clip calls a real filled scene produces,
 * and its "~17ms/move verified live" comment described a scene that was never
 * actually what this fixture measured (real figure closer to ~170ms with fill
 * on). Every scene below now sets `styleTable.scene.mapper = 'hatch'` so the
 * clipPath call volume — and therefore HLR occluder-scan cost — matches a real
 * filled drag frame.
 *
 * Absolute milliseconds are NOT asserted (this machine sees load averages in
 * the 10s-100s under parallel agents) — only cross-scaling RATIOS, which are
 * far more load-stable when measured within one process run.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

// Build `count` boxes on a compact grid so their SCREEN-SPACE silhouettes
// genuinely overlap (real occlusion, not just a big bounding box) — the HLR
// occluder scan is the thing under test, and it only does real work when
// samples actually land under multiple candidate occluders.
const buildObjects = (count) => {
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const out = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    out.push({
      id: 'o' + i,
      name: 'O' + i,
      primitive: i % 3 === 0 ? 'sphere' : i % 3 === 1 ? 'box' : 'cylinder',
      params: { sx: 22, sy: 18, sz: 22, radius: 14, detail: 16 },
      // Tight pitch (12mm on a ~22mm object) — deliberately DENSE overlap
      // (not just adjacent), so most sample points along most paths have
      // several candidate occluders to test — the thing the occluder scan
      // (and its spatial index) actually pays for.
      transform: {
        x: (col - cols / 2) * 12, y: 0, z: (row - cols / 2) * 12,
        yaw: i * 11, pitch: i * 3, roll: 0, scale: 1,
      },
      visibility: 'solid',
    });
  }
  return out;
};

const buildLayer = (runtime, engine, count, extra = {}) => {
  const layer = new runtime.window.Vectura.Layer('mono-perf-' + count, 'scene3d', 'Scene');
  engine.layers.push(layer);
  engine.activeLayerId = layer.id;
  layer.params.objects = buildObjects(count);
  layer.params.styleTable = {
    scene: { mapper: 'hatch', params: { fillDensity: 55 } },
    ...(extra.styleTable || {}),
  };
  layer.params.camera = {
    ...layer.params.camera,
    projection: 'orthographic', yaw: -28, pitch: 22, roll: 0,
  };
  Object.assign(layer.params, extra.params || {});
  return layer;
};

// Median of N timed draft-preview regenerations (after one warm-up call).
const timeDraftGen = (engine, layerId, n = 8) => {
  engine.generate(layerId, { preview: true }); // warm-up (primes caches)
  const samples = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    engine.generate(layerId, { preview: true });
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
};

// Isolate the cost actually under test: cumulative wall time spent INSIDE
// HLR.createClipper's clipPath, across one full draft regen. This is the
// metric the profiler's own report measured (hlr.clipPath = 153/173ms of a
// 12-object draft frame) — engine.generate() as a whole also pays for scene
// assembly, style resolution, edge classification, etc., which scale close
// to linearly and dilute a whole-frame ratio. Patches
// Vectura.Scene3D.HLR.createClipper for the duration of one generate() call
// and restores it unconditionally (even on throw).
const measureClipPathMs = (runtime, engine, layerId) => {
  const HLR = runtime.window.Vectura.Scene3D.HLR;
  const origCreateClipper = HLR.createClipper;
  let totalMs = 0;
  HLR.createClipper = (...args) => {
    const clipper = origCreateClipper.apply(HLR, args);
    const origClipPath = clipper.clipPath;
    clipper.clipPath = (...cpArgs) => {
      const t0 = performance.now();
      const result = origClipPath.apply(clipper, cpArgs);
      totalMs += performance.now() - t0;
      return result;
    };
    return clipper;
  };
  try {
    engine.generate(layerId, { preview: true }); // warm-up
    totalMs = 0;
    engine.generate(layerId, { preview: true }); // measured pass
  } finally {
    HLR.createClipper = origCreateClipper;
  }
  return totalMs;
};

describe('scene3d drag performance', () => {
  let runtime;
  let VectorEngine;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ VectorEngine } = runtime.window.Vectura);
    // eslint-disable-next-line no-console
    console.log('[perf] uptime at scene3d-drag.test.js start:', require('os').loadavg());
  });

  afterAll(() => runtime.cleanup());

  test(
    'a draft-quality preview regen of 12 objects holds a generous drag frame budget',
    () => {
      const engine = new VectorEngine();
      const layer = buildLayer(runtime, engine, 12);
      const perFrame = timeDraftGen(engine, layer.id, 6);
      // Generous ceiling: this is a smoke check against a catastrophic
      // regression, not the precision instrument (that's the ratio test
      // below). Pre-fix this fixture (with fill on) measured ~170-230ms.
      expect(perFrame).toBeLessThan(2000);
    },
    60000,
  );

  test(
    'HLR occluder-scan cost (clipPath) scales sub-quadratically with object count (spatial index)',
    () => {
      const engine6 = new VectorEngine();
      const layer6 = buildLayer(runtime, engine6, 6);
      const hlr6 = measureClipPathMs(runtime, engine6, layer6.id);

      const engine12 = new VectorEngine();
      const layer12 = buildLayer(runtime, engine12, 12);
      const hlr12 = measureClipPathMs(runtime, engine12, layer12.id);

      const engine24 = new VectorEngine();
      const layer24 = buildLayer(runtime, engine24, 24);
      const hlr24 = measureClipPathMs(runtime, engine24, layer24.id);

      const ratio = hlr24 / Math.max(hlr6, 0.001);
      // eslint-disable-next-line no-console
      console.log('[perf] scene3d HLR clipPath scaling hlr6=%sms hlr12=%sms hlr24=%sms ratio(24/6)=%s loadavg=%s',
        hlr6.toFixed(2), hlr12.toFixed(2), hlr24.toFixed(2), ratio.toFixed(2), require('os').loadavg());
      // 4x the objects → ~4x the occluders AND ~4x the paths/samples. A
      // linear-scan occluder lookup (today) is therefore quadratic in object
      // count — the profiler measured ~8.2x here. A spatial index makes
      // per-sample lookup ~O(1) amortized, so total clipPath cost should
      // scale close to linearly (a modest constant over 4x is allowed for
      // index-build overhead and more occluders per index cell as density
      // rises with count in this fixture).
      expect(ratio).toBeLessThan(6);
    },
    60000,
  );

  test(
    'draft mode: an expensive tone law (turingStripe) costs about the same as a cheap one (ladder)',
    () => {
      // In draft, toneOn is false (the tone apparatus is skipped entirely —
      // see scene3d.js:469), so a shadow/fill toneLaw choice must not change
      // draft cost. This guards against a regression that starts reading
      // toneLaw during draft generation.
      const engineLadder = new VectorEngine();
      const layerLadder = buildLayer(runtime, engineLadder, 12, {
        styleTable: { scene: { mapper: 'hatch', params: { fillDensity: 55, toneLaw: 'ladder' } } },
      });
      const tLadder = timeDraftGen(engineLadder, layerLadder.id, 6);

      const engineStripe = new VectorEngine();
      const layerStripe = buildLayer(runtime, engineStripe, 12, {
        styleTable: { scene: { mapper: 'hatch', params: { fillDensity: 55, toneLaw: 'turingStripe' } } },
      });
      const tStripe = timeDraftGen(engineStripe, layerStripe.id, 6);

      const ratio = tStripe / Math.max(tLadder, 0.001);
      // eslint-disable-next-line no-console
      console.log('[perf] draft toneLaw cost ladder=%sms turingStripe=%sms ratio=%s',
        tLadder.toFixed(2), tStripe.toFixed(2), ratio.toFixed(2));
      expect(ratio).toBeLessThan(1.5);
      expect(1 / ratio).toBeLessThan(1.5);
    },
    60000,
  );
});
