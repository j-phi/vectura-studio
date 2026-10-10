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
 * No wall-clock RATIOS are asserted (this machine sees load averages in the
 * 10s-100s under parallel agents; timing ratios flaked). The scaling guards
 * count deterministic work (occluder candidate tests) and compare output;
 * only the generous 2000 ms frame budget remains a clock check.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { installOccluderScanCounter } = require('../helpers/occluder-scan-counter');

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

// Isolate the work actually under test: the number of occluder CANDIDATES
// examined by HLR's hiddenAt() across one full draft regen. Deterministic
// (no clock), so it is independent of machine load. See
// tests/helpers/occluder-scan-counter.js for how the count is taken.
const measureOccluderTests = (runtime, engine, layerId) => {
  const HLR = runtime.window.Vectura.Scene3D.HLR;
  const counter = installOccluderScanCounter(HLR);
  try {
    engine.generate(layerId, { preview: true }); // warm-up
    counter.reset();
    engine.generate(layerId, { preview: true }); // measured pass
  } finally {
    counter.restore();
  }
  return counter.count();
};

// Measured (deterministic): indexed n6=73,431 n24=436,657 ratio 5.95;
// forced linear scan n6=5,045,402 n24=49,093,110 ratio 9.73 (112x more work
// at n=24). The absolute n24 bound is the sharp discriminator (10x margin
// each side); the ratio bound (between 5.95 and 9.73) is the sub-quadratic guard.
const RATIO_MAX = 8;
const N24_MAX_CANDIDATE_TESTS = 4000000;

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

  const scanCounts = () => {
    const out = {};
    for (const n of [6, 12, 24]) {
      const engine = new VectorEngine();
      const layer = buildLayer(runtime, engine, n);
      out[n] = measureOccluderTests(runtime, engine, layer.id);
    }
    return out;
  };

  test(
    'HLR occluder-scan work (candidate tests) scales sub-quadratically with object count (spatial index)',
    () => {
      const c = scanCounts();
      const ratio = c[24] / Math.max(c[6], 1);
      // eslint-disable-next-line no-console
      console.log('[perf] scene3d HLR occluder candidate tests n6=%s n12=%s n24=%s ratio(24/6)=%s',
        c[6], c[12], c[24], ratio.toFixed(2));
      // Deterministic work count (no clock). 4x the objects → ~4x the paths
      // AND ~4x the occluders, so a linear-scan lookup is quadratic (~16x);
      // the spatial index keeps it near-linear. Thresholds below sit between the two.
      expect(ratio).toBeLessThan(RATIO_MAX);
      expect(c[24]).toBeLessThan(N24_MAX_CANDIDATE_TESTS);
    },
    60000,
  );

  test(
    'draft mode: toneLaw is never read (turingStripe and ladder give identical draft output)',
    () => {
      // In draft, toneOn is false (the tone apparatus is skipped entirely —
      // see scene3d.js toneOn = !draft && ...), so a toneLaw choice must not
      // change draft generation. Deterministic check: identical path output.
      const RG = runtime.window.Vectura.Scene3D.Regions;
      const origCI = RG.combinedIntensity;
      let intensityCalls = 0;
      RG.combinedIntensity = (...a) => { intensityCalls++; return origCI.apply(RG, a); };
      const sig = (law) => {
        const engine = new VectorEngine();
        const layer = buildLayer(runtime, engine, 12, {
          styleTable: { scene: { mapper: 'hatch', params: { fillDensity: 55, toneLaw: law } } },
        });
        engine.generate(layer.id, { preview: true });
        return JSON.stringify(layer.paths || layer.displayPaths || []);
      };
      let ladder; let stripe;
      try {
        ladder = sig('ladder');
        stripe = sig('turingStripe');
      } finally {
        RG.combinedIntensity = origCI;
      }
      // The tone apparatus (intensity field) must never be evaluated in draft.
      expect(intensityCalls).toBe(0);
      expect(ladder.length).toBeGreaterThan(1000); // non-trivial output
      expect(stripe).toBe(ladder);
    },
    60000,
  );
});
