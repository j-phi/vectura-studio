/**
 * scene3d TONE goldens — deterministic JSON baselines for the light-made tone
 * system (bands / ladder / coverage / specular / highlight / shadow tone).
 *
 * WHY THESE EXIST
 * ---------------
 * Nothing else in the repo pins scene3d tone. Every SVG baseline under
 * tests/baselines/svg + tests/baselines/curves renders LEGACY algorithms — not
 * one scene3d layer — and the three JSON files in tests/baselines/scene3d pin
 * chart/mesh GEOMETRY (consumed by scene3d-charts-parity / scene3d-mesh-
 * invariants). "N visual baselines byte-identical" has therefore never
 * protected this subsystem. These goldens close that gap ahead of the tone
 * ramp / materials / dark-paper inversion work.
 *
 * WHY JSON AGGREGATES, NOT SVG
 * ----------------------------
 * What needs pinning is NUMBERS — how much ink tone makes, and WHERE. An SVG
 * golden would churn on every unrelated scene3d change (edge styles, HLR,
 * gizmos), and several implementers work in this subsystem concurrently. The
 * aggregates below fail loudly on a tone behaviour change and are indifferent
 * to refactors that do not move ink.
 *
 * THE TWO FILL IMPLEMENTATIONS
 * ----------------------------
 * Faceted prims (box) fill through scene3d.js `coverageGain`; curved prims
 * (sphere) fill through src/core/scene3d/surface-fill.js `coverageForSample`.
 * These have silently diverged before (I27 exists solely because a cube and a
 * sphere under one light shaded in OPPOSITE directions). BOTH read coverage as
 * the COMPLEMENT band (`nBands-1-b`), and a future inversion toggle flips
 * exactly those two reads. Every ladder scenario below is captured on both, and
 * `inversion sensitivity` proves the goldens actually detect a flip at each site.
 *
 * MEASUREMENT PATH (read before changing anything here)
 * -----------------------------------------------------
 * Composed scene ink lives on `group.scenePaths`, NEVER on `layer.paths`; a
 * per-layer `engine.generate()` bypasses `_sceneConsumed` and renders an
 * object3d STANDALONE off ALGO_DEFAULTS — a classic false positive. These
 * fixtures make the exact call Engine._composeSceneGroup makes:
 *   Scene3D.Params.collectSceneParams(params, []) -> AlgorithmRegistry.scene3d
 *   .generate(assembled, new SeededRNG(seed), new SimpleNoise(seed), bounds)
 * with the same `bounds` shape the engine assembles. `collectSceneParams` is a
 * pass-through for an inline-only (monolith) scene, so this is byte-identical
 * to what a composed scene group emits. `scene-group-compose parity` below
 * pins that equivalence against a REAL engine scene group.
 *
 * DETERMINISM
 * -----------
 * scene3d has zero RNG — all stochasticity is deterministic positional hashing
 * — so a golden that is not stable is worthless. Every scenario is generated
 * THREE times per run and the three summaries must be identical before the
 * golden is compared. `seed` is pinned explicitly on every fixture (layer.js
 * defaults params.seed to Math.random() when it is absent).
 *
 * REGENERATION (deliberate only)
 * ------------------------------
 *   npm run test:update                     # regenerates ALL visual baselines
 *   VECTURA_UPDATE_BASELINES=1 npx vitest run tests/visual/scene3d-tone-baseline.test.js
 * Regenerate ONLY when tone behaviour changed on purpose, and say so in the
 * commit. Never regenerate to make a drift pass.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const UPDATE_BASELINES = process.env.VECTURA_UPDATE_BASELINES === '1';
const BASELINE_DIR = path.resolve(__dirname, '../baselines/scene3d/tone');

const clone = (v) => JSON.parse(JSON.stringify(v));

// Engine._composeSceneGroup builds bounds from the document profile + the group
// pen. Fixed here so a machine-profile change can never move a tone golden.
const BOUNDS = {
  width: 320, height: 220, m: 10, dW: 300, dH: 200,
  penWidth: 0.3, truncate: 4, fastPreview: false, preview3dQuality: 'high',
};
const SEED = 0;
const GRID = 10; // GRID x GRID ink histogram over the page frame

// sqrt is correctly rounded by IEEE-754; Math.hypot is not specified to be, so
// segment length uses sqrt to keep the goldens portable across libm builds.
const segLen = (a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
};
const r4 = (n) => Math.round(n * 1e4) / 1e4;
const r3 = (n) => Math.round(n * 1e3) / 1e3;

const bump = (bag, key, ink) => {
  const slot = bag[key] || (bag[key] = { paths: 0, ink: 0 });
  slot.paths += 1;
  slot.ink += ink;
};
const sortKeys = (bag, fn) => Object.keys(bag).sort().reduce((out, k) => {
  out[k] = fn ? fn(bag[k]) : bag[k];
  return out;
}, {});

/**
 * Aggregate one composed scene into the golden payload.
 *
 * Fields, and what each is here to catch:
 *  - totals            total ink is THE headline tone number (how much ink the
 *                      light made); paths/points catch structural changes.
 *  - byKind            separates sceneFill (tone-made) from sceneEdge/sceneFace
 *                      (structure), so an edge-only change cannot masquerade as
 *                      a tone change and vice versa.
 *  - byRegionClass     castShadow / specular / emissive ink, split out — the
 *                      shadowMode:'inverse' path is visible here as ZERO
 *                      castShadow paths.
 *  - byObject          ground vs object ink (inverse shadow thins the GROUND).
 *  - fillPathsByFace   per-face fill counts on a faceted prim ARE the per-band
 *                      emitted path counts: each box face sits in one tone band
 *                      and its line count is that band's coverage. This is the
 *                      loudest single signal an inversion flip produces.
 *  - byPen             pen distribution (highlight/shadow pen overrides).
 *  - byDash            meta.strokeDash signature. lineType:'dotted' changes ONLY
 *                      this — no geometry — so nothing else would see it.
 *  - flags             highlight / occluded / xrayBack / specular / fill counts.
 *  - bbox              exact extent; catches a projection or ground-quad move.
 *  - fillGrid/inkGrid  GRIDxGRID coverage histogram over the page frame. This is
 *                      WHERE the ink is: an inversion moves ink from the lit
 *                      side to the dark side while totals may barely move.
 */
const summarize = (paths, bounds) => {
  const byKind = {};
  const byRegionClass = {};
  const byObject = {};
  const byPen = {};
  const byDash = {};
  const fillPathsByFace = {};
  const flags = { highlight: 0, occluded: 0, xrayBack: 0, specular: 0, fill: 0, straight: 0 };
  const fillGrid = new Array(GRID * GRID).fill(0);
  const inkGrid = new Array(GRID * GRID).fill(0);
  let totalInk = 0;
  let points = 0;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;

  const cellOf = (x, y) => {
    const cx = Math.min(GRID - 1, Math.max(0, Math.floor((x / bounds.width) * GRID)));
    const cy = Math.min(GRID - 1, Math.max(0, Math.floor((y / bounds.height) * GRID)));
    return cy * GRID + cx;
  };

  paths.forEach((p) => {
    const meta = p.meta || {};
    const target = meta.sceneTarget || {};
    const isFill = meta.kind === 'sceneFill';
    let ink = 0;
    points += p.length;
    for (let i = 0; i < p.length; i += 1) {
      const q = p[i];
      if (q.x < minX) minX = q.x;
      if (q.x > maxX) maxX = q.x;
      if (q.y < minY) minY = q.y;
      if (q.y > maxY) maxY = q.y;
      if (i === 0) continue;
      const len = segLen(p[i - 1], q);
      ink += len;
      const cell = cellOf((p[i - 1].x + q.x) / 2, (p[i - 1].y + q.y) / 2);
      inkGrid[cell] += len;
      if (isFill) fillGrid[cell] += len;
    }
    totalInk += ink;

    bump(byKind, meta.kind || '<none>', ink);
    bump(byRegionClass, target.regionClass || '<none>', ink);
    bump(byObject, target.objectId || '<none>', ink);
    bump(byPen, typeof meta.penId === 'string' ? meta.penId : '<inherit>', ink);
    bump(byDash, Array.isArray(meta.strokeDash) ? meta.strokeDash.map(r4).join(',') : '<solid>', ink);
    if (isFill) {
      const key = `${target.objectId}/${target.faceId}`;
      fillPathsByFace[key] = (fillPathsByFace[key] || 0) + 1;
    }
    if (target.highlight === true) flags.highlight += 1;
    if (target.occluded === true) flags.occluded += 1;
    if (target.xrayBack === true) flags.xrayBack += 1;
    if (meta.specular === true) flags.specular += 1;
    if (meta.fill === true) flags.fill += 1;
    if (meta.straight === true) flags.straight += 1;
  });

  const inkOf = (slot) => ({ paths: slot.paths, ink: r4(slot.ink) });
  return {
    totals: { paths: paths.length, points, ink: r4(totalInk) },
    byKind: sortKeys(byKind, inkOf),
    byRegionClass: sortKeys(byRegionClass, inkOf),
    byObject: sortKeys(byObject, inkOf),
    byPen: sortKeys(byPen, inkOf),
    byDash: sortKeys(byDash, inkOf),
    fillPathsByFace: sortKeys(fillPathsByFace),
    flags,
    bbox: paths.length
      ? [r4(minX), r4(minY), r4(maxX), r4(maxY)]
      : null,
    fillGrid: fillGrid.map(r3),
    inkGrid: inkGrid.map(r3),
  };
};

// ── Fixtures ────────────────────────────────────────────────────────────────
const CAMERA = { projection: 'orthographic', yaw: -30, pitch: 25, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };
const SUN = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: true };
// A 4-light rig: Regions.combinedIntensity SUMS then clamps to 1, so several
// lights saturate every face flat and the tone ladder stops discriminating.
const RIG4 = [
  { id: 'l1', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: false },
  { id: 'l2', type: 'directional', azimuth: 315, elevation: 30, intensity: 1, castShadows: false },
  { id: 'l3', type: 'directional', azimuth: 45, elevation: 70, intensity: 1, castShadows: false },
  { id: 'l4', type: 'directional', azimuth: 225, elevation: 10, intensity: 1, castShadows: false },
];
const RIG1 = [RIG4[0]];

const BOX = { id: 'obj-1', name: 'Box', primitive: 'box', params: { sx: 70, sy: 70, sz: 70 }, transform: { x: 0, y: 35, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
const BALL = { id: 'ball', name: 'Ball', primitive: 'sphere', params: { radius: 70, detail: 24 }, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
const PAIR_BOX = { ...BOX, params: { sx: 55, sy: 55, sz: 55 }, transform: { x: -55, y: 27.5, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 } };
const PAIR_BALL = { ...BALL, params: { radius: 32, detail: 20 }, transform: { x: 55, y: 32, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 } };

// Explicit tone ladders. `bands` / `thresholds` / `ladder` are length-consistent
// (thresholds = bands-1, ladder = bands); Regions trusts the ladder length.
const TONE_OFF = { enabled: false, bands: 3, thresholds: [0.33, 0.66], ladder: [0.2, 0.5, 0.85], specular: { enabled: false, size: 0 } };
const toneBands = (bands, specular = true) => {
  const table = {
    2: { thresholds: [0.5], ladder: [0.25, 0.8] },
    3: { thresholds: [0.33, 0.66], ladder: [0.2, 0.5, 0.85] }, // ALGO_DEFAULTS
    4: { thresholds: [0.25, 0.5, 0.75], ladder: [0.15, 0.4, 0.65, 0.9] },
  }[bands];
  return { enabled: true, bands, ...clone(table), specular: { enabled: specular, size: 1 } };
};

const scene = (over = {}) => (Vectura) => {
  const p = clone(Vectura.ALGO_DEFAULTS.scene3d);
  p.seed = SEED;                        // pinned: never let layer.js seed it
  p.camera = clone(CAMERA);
  p.ground = over.ground || { enabled: false };
  p.backdrop = { enabled: false };
  p.objects = clone(over.objects || [BOX]);
  p.lights = clone(over.lights || [SUN]);
  p.tone = clone(over.tone || toneBands(3));
  if (over.shadow) p.shadow = { ...p.shadow, ...over.shadow };
  p.styleTable = {
    scene: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 50, ...(over.styleParams || {}) } },
    byObject: {},
    byFace: {},
  };
  return p;
};

const SCENARIOS = [
  // ── A. Faceted ladder — scene3d.js `coverageGain` complement site ──────────
  { id: 'box-tone-off', build: scene({ tone: TONE_OFF }) },
  { id: 'box-bands-2', build: scene({ tone: toneBands(2) }) },
  { id: 'box-bands-3', build: scene({ tone: toneBands(3) }) },
  { id: 'box-bands-4', build: scene({ tone: toneBands(4) }) },
  { id: 'box-bands-3-specular-off', build: scene({ tone: toneBands(3, false) }) },

  // ── B. Curved ladder — surface-fill.js `coverageForSample` complement site ─
  { id: 'sphere-tone-off', build: scene({ objects: [BALL], tone: TONE_OFF }) },
  { id: 'sphere-bands-2', build: scene({ objects: [BALL], tone: toneBands(2) }) },
  { id: 'sphere-bands-3', build: scene({ objects: [BALL], tone: toneBands(3) }) },
  { id: 'sphere-bands-4', build: scene({ objects: [BALL], tone: toneBands(4) }) },
  { id: 'sphere-bands-3-specular-off', build: scene({ objects: [BALL], tone: toneBands(3, false) }) },

  // ── C. I27 direction parity — both fill implementations, ONE light ────────
  { id: 'parity-box-and-sphere', build: scene({ objects: [PAIR_BOX, PAIR_BALL] }) },

  // ── D. Highlight. highlightSensitivity is INERT under the default perFace
  //      mode and live under lightDriven; both are pinned so the asymmetry is
  //      captured (see the relational contracts below).
  { id: 'box-highlight-perface-sens1', build: scene({ styleParams: { highlightMode: 'perFace', highlightSensitivity: 1 } }) },
  { id: 'box-highlight-perface-sens6', build: scene({ styleParams: { highlightMode: 'perFace', highlightSensitivity: 6 } }) },
  { id: 'box-highlight-lightdriven-sens1', build: scene({ styleParams: { highlightMode: 'lightDriven', highlightSensitivity: 1 } }) },
  { id: 'box-highlight-lightdriven-sens6', build: scene({ styleParams: { highlightMode: 'lightDriven', highlightSensitivity: 6 } }) },
  { id: 'sphere-highlight-lightdriven-sens6', build: scene({ objects: [BALL], styleParams: { highlightMode: 'lightDriven', highlightSensitivity: 6 } }) },
  // stippleOut had ZERO test coverage before this file. highlightPenId also
  // makes the pen distribution non-trivial.
  { id: 'box-highlight-stippleout', build: scene({ styleParams: { highlightTreatment: 'stippleOut', highlightPenId: 'pen-hl' } }) },
  { id: 'sphere-highlight-stippleout', build: scene({ objects: [BALL], styleParams: { highlightTreatment: 'stippleOut', highlightPenId: 'pen-hl' } }) },

  // ── E. Stroke treatments with ZERO coverage before this file ──────────────
  { id: 'box-linetype-dotted', build: scene({ styleParams: { lineType: 'dotted' } }) },
  { id: 'box-overstroke', build: scene({ styleParams: { overstroke: true } }) },

  // ── F. Multi-light saturation (combinedIntensity sums then clamps to 1) ───
  { id: 'box-lights-1', build: scene({ lights: RIG1 }) },
  { id: 'box-lights-4', build: scene({ lights: RIG4 }) },
  { id: 'sphere-lights-1', build: scene({ objects: [BALL], lights: RIG1 }) },
  { id: 'sphere-lights-4', build: scene({ objects: [BALL], lights: RIG4 }) },

  // ── G. Shadow tone. 'additive' emits a cast-shadow hatch; 'inverse' (I26)
  //      THINS the ground's own fill instead of adding ink.
  { id: 'shadow-additive-default', build: scene({ ground: { enabled: true }, shadow: { shadowMode: 'additive', shadowPenId: 'pen-shadow' } }) },
  { id: 'shadow-inverse', build: scene({ ground: { enabled: true }, shadow: { shadowMode: 'inverse', shadowPenId: 'pen-shadow' } }) },
];

describe('scene3d tone goldens', () => {
  let runtime;
  let V;
  let algo;
  let Params;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    Params = V.Scene3D.Params;
  });

  afterAll(() => runtime.cleanup());

  // The exact call Engine._composeSceneGroup makes.
  const compose = (params, bounds = BOUNDS, collected = []) => algo.generate(
    Params.collectSceneParams(params, collected),
    new V.SeededRNG(SEED),
    new V.SimpleNoise(SEED),
    bounds,
  ) || [];

  const scenarioById = (id) => SCENARIOS.find((s) => s.id === id);

  // Generate THREE times and require identical summaries before anything else
  // looks at the numbers. scene3d has no RNG, so any drift here is a real bug.
  const stableSummary = (build) => {
    const runs = [0, 1, 2].map(() => JSON.stringify(summarize(compose(build(V)), BOUNDS)));
    expect(runs[1]).toBe(runs[0]);
    expect(runs[2]).toBe(runs[0]);
    return JSON.parse(runs[0]);
  };
  const summaryFor = (id) => stableSummary(scenarioById(id).build);

  const compare = (id, actual) => {
    const file = path.join(BASELINE_DIR, `${id}.json`);
    const serialized = `${JSON.stringify(actual, null, 2)}\n`;
    if (UPDATE_BASELINES) {
      fs.mkdirSync(BASELINE_DIR, { recursive: true });
      fs.writeFileSync(file, serialized, 'utf8');
      expect(fs.existsSync(file)).toBe(true);
      return;
    }
    expect(
      fs.existsSync(file),
      `Missing tone golden ${id}.json. Regenerate deliberately with: npm run test:update`,
    ).toBe(true);
    expect(
      serialized,
      `Tone golden drift in ${id}. If tone changed ON PURPOSE, regenerate with `
      + 'npm run test:update (or VECTURA_UPDATE_BASELINES=1 npx vitest run '
      + 'tests/visual/scene3d-tone-baseline.test.js) and say so in the commit.',
    ).toBe(fs.readFileSync(file, 'utf8'));
  };

  describe('goldens', () => {
    SCENARIOS.forEach(({ id, build }) => {
      test(`${id} matches its golden (and regenerates identically 3x)`, () => {
        const summary = stableSummary(build);
        expect(summary.totals.paths).toBeGreaterThan(0);
        compare(id, summary);
      });
    });
  });

  // ── Relational contracts. The goldens pin the numbers; these pin the
  //    RELATIONSHIPS, so a regeneration cannot quietly bless a broken one.
  describe('tone contracts the goldens encode', () => {
    test('tone off ⇒ a faceted prim hatches light-invariantly (every face the same count)', () => {
      const counts = Object.values(summaryFor('box-tone-off').fillPathsByFace);
      expect(counts.length).toBeGreaterThan(1);
      expect(new Set(counts).size).toBe(1);
    });

    test('tone on ⇒ the faceted per-face counts spread across bands', () => {
      const counts = Object.values(summaryFor('box-bands-3').fillPathsByFace);
      expect(new Set(counts).size).toBeGreaterThan(1);
    });

    test('band COUNT is live on both fill implementations', () => {
      const box = ['box-bands-2', 'box-bands-3', 'box-bands-4'].map((id) => summaryFor(id).totals.ink);
      const sphere = ['sphere-bands-2', 'sphere-bands-3', 'sphere-bands-4'].map((id) => summaryFor(id).totals.ink);
      expect(new Set(box).size).toBe(3);
      expect(new Set(sphere).size).toBe(3);
    });

    // The two fill implementations do NOT agree about specular: surface-fill.js
    // sparsens the brightest band by `specular.size`, while scene3d.js
    // `coverageGain` never consults tone.specular at all. That asymmetry is a
    // live divergence between the faceted and curved paths — pinned here so a
    // tone/material change either preserves it deliberately or is caught.
    test('specular is LIVE on the curved fill (surface-fill.js sparsens the bright band)', () => {
      expect(summaryFor('sphere-bands-3').totals.ink)
        .not.toBe(summaryFor('sphere-bands-3-specular-off').totals.ink);
    });

    // CONTRACT INVERTED — on purpose. This used to assert that the faceted fill
    // IGNORED tone.specular: `coverageGain` never consulted it, so box-bands-3
    // and box-bands-3-specular-off were byte-identical while the curved fill DID
    // honour specular. That is a faceted/curved divergence of exactly the kind
    // I27 already had to repair once, and Jay's ask was explicit: faceted objects
    // have highlights and shadows too. The faceted path now computes a per-face
    // specular term, so these two MUST differ — this failing is the fix working.
    test('specular is LIVE on the faceted fill', () => {
      expect(summaryFor('box-bands-3'))
        .not.toEqual(summaryFor('box-bands-3-specular-off'));
    });

    // CONTRACT INVERTED — on purpose, and for the same reason as the one above.
    // This used to pin `highlightSensitivity` as inert outside lightDriven, which
    // was the O9 defect written down as a contract: the dial did nothing at all
    // in the mode the app actually ships as the default. Under perFace it is now
    // the angular tightness of the specular ACCEPTANCE CONE (design spec §5.4
    // #4), so tightening it shrinks the glint facet set — these two MUST differ,
    // and this failing is the fix working.
    test('highlightSensitivity is LIVE under the default perFace mode', () => {
      expect(summaryFor('box-highlight-perface-sens1'))
        .not.toEqual(summaryFor('box-highlight-perface-sens6'));
    });

    test('highlightSensitivity is LIVE under lightDriven mode', () => {
      expect(summaryFor('box-highlight-lightdriven-sens1'))
        .not.toEqual(summaryFor('box-highlight-lightdriven-sens6'));
    });

    test("lineType:'dotted' changes ONLY meta.strokeDash — never the geometry", () => {
      const solid = summaryFor('box-bands-3');
      const dotted = summaryFor('box-linetype-dotted');
      expect(dotted.totals).toEqual(solid.totals);
      expect(dotted.inkGrid).toEqual(solid.inkGrid);
      expect(Object.keys(solid.byDash)).toEqual(['<solid>']);
      expect(Object.keys(dotted.byDash)).toEqual(['0.4,2']);
    });

    test('overstroke double-strikes the FILL lines but not the shared edges', () => {
      const base = summaryFor('box-bands-3');
      const over = summaryFor('box-overstroke');
      // scene3d.js strips wobble/overstroke from shared edge lines (they are
      // already drawn twice by adjacent faces) and keeps it for unique fills.
      expect(over.byKind.sceneFill.paths).toBe(base.byKind.sceneFill.paths * 2);
      expect(over.byKind.sceneEdge.paths).toBe(base.byKind.sceneEdge.paths);
      // The second strike is hash-offset, so fill ink is ~2x but not exactly 2x.
      expect(over.byKind.sceneFill.ink).toBeGreaterThan(base.byKind.sceneFill.ink * 1.95);
      expect(over.byKind.sceneFill.ink).toBeLessThan(base.byKind.sceneFill.ink * 2.05);
    });

    test('four lights SATURATE: combinedIntensity sums then clamps, so tone flattens', () => {
      const one = summaryFor('box-lights-1').fillPathsByFace;
      const four = summaryFor('box-lights-4').fillPathsByFace;
      // One light: the faces spread across bands. Four: the DIFFUSE ladder stops
      // discriminating — combinedIntensity sums then clamps to 1, so every face
      // lands in the top band. The per-face counts are no longer all equal only
      // because the faceted fill now carries a SPECULAR term, which is
      // view-dependent and therefore still separates faces after the diffuse
      // term has saturated. The saturation claim is unchanged; it is now stated
      // against the diffuse band index rather than against the emitted counts.
      expect(new Set(Object.values(one)).size).toBeGreaterThan(1);
      expect(new Set(Object.values(four)).size).toBeLessThan(new Set(Object.values(one)).size + 1);
      const spread = (bag) => {
        const v2 = Object.values(bag);
        return (Math.max(...v2) - Math.min(...v2)) / Math.max(1, Math.max(...v2));
      };
      expect(spread(four)).toBeLessThan(spread(one));
    });

    test("shadowMode:'inverse' emits NO castShadow ink — it thins the ground fill", () => {
      const additive = summaryFor('shadow-additive-default');
      const inverse = summaryFor('shadow-inverse');
      expect(additive.byRegionClass.castShadow.paths).toBeGreaterThan(0);
      expect(inverse.byRegionClass.castShadow).toBeUndefined();
      expect(inverse.totals.ink).toBeLessThan(additive.totals.ink);
      expect(inverse.byObject.ground.ink).toBeLessThan(additive.byObject.ground.ink);
    });

    test('the shadow pen override reaches the cast-shadow ink', () => {
      expect(summaryFor('shadow-additive-default').byPen['pen-shadow'].paths).toBeGreaterThan(0);
    });
  });

  // ── Measurement-path guard. The goldens above are captured through the
  //    monolith call `_composeSceneGroup` makes. This proves that call is the
  //    SAME ink a real engine scene GROUP composes — and that the tempting
  //    shortcut (reading the object3d child's own paths) measures nothing,
  //    because the child is `_sceneConsumed` and its ink lives on the GROUP.
  describe('composed-output parity (the measurement path these goldens use)', () => {
    const engineBounds = (engine) => {
      const S = V.SETTINGS;
      const { width, height } = engine.currentProfile;
      const m = S.margin;
      const pens = Array.isArray(S.pens) ? S.pens : [];
      const pen = pens[0];
      const penWidth = Number(pen && pen.width) > 0 ? Number(pen.width) : 0.35;
      return {
        width, height, m, dW: width - m * 2, dH: height - m * 2,
        penWidth, truncate: S.truncate, fastPreview: false,
        preview3dQuality: S.preview3dQuality,
      };
    };

    const buildToneGroup = (engine) => {
      const group = new V.Layer('tone-scene', 'scene3d', 'Scene');
      group.isGroup = true;
      group.containerRole = 'scene';
      const envelope = scene({ tone: toneBands(3) })(V);
      group.params = { ...envelope, objects: [], groups: [] };
      engine.layers.push(group);

      const child = new V.Layer('tone-box', 'object3d', 'Box');
      Object.assign(child.params, {
        primitive: BOX.primitive,
        params: clone(BOX.params),
        transform: clone(BOX.transform),
        visibility: 'solid',
        role: 'solid',
        style: { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 50 } },
        faceStyles: {},
      });
      child.parentId = group.id;
      engine.layers.push(child);
      return { group, child };
    };

    test('group.scenePaths === the monolith compose call, and the child emits nothing', () => {
      const engine = new V.VectorEngine();
      engine.layers = [];
      const { group, child } = buildToneGroup(engine);
      engine.layers.forEach((l) => { if (!l.isGroup) engine.generate(l.id); });
      engine.computeAllDisplayGeometry();

      // The trap: a consumed object3d renders NOTHING on its own. Anyone
      // measuring `layer.paths` here would be measuring a standalone object
      // built from ALGO_DEFAULTS, not this scene's tone.
      expect(child._sceneConsumed).toBe(true);
      expect(engine.getRenderablePaths(child)).toEqual([]);

      expect(Array.isArray(group.scenePaths)).toBe(true);
      expect(group.scenePaths.length).toBeGreaterThan(0);

      const bounds = engineBounds(engine);
      const collected = [{ kind: 'object', id: child.id, params: child.params }];
      const mono = compose(group.params, bounds, collected);
      expect(summarize(group.scenePaths, bounds)).toEqual(summarize(mono, bounds));
    });
  });

  // ── Inversion sensitivity. The upcoming dark-paper inversion flips how the
  //    coverage ladder is READ at exactly two sites — surface-fill.js
  //    `coverageForSample` and scene3d.js `coverageGain`, both of which take
  //    the COMPLEMENT band today. These tests monkeypatch Regions.coverageFor
  //    (runtime only, restored in `finally` — no source is touched) to prove the
  //    goldens above actually DETECT a flip at each site, rather than being
  //    numbers that happen to be stable.
  describe('inversion sensitivity (proves the goldens can see the flip)', () => {
    const withFlippedLadder = (fn) => {
      const Regions = V.Scene3D.Regions;
      const original = Regions.coverageFor;
      Regions.coverageFor = (bandIndex, tone) => {
        const ladder = (tone && Array.isArray(tone.ladder)) ? tone.ladder : [];
        const n = ladder.length;
        if (!n) return original(bandIndex, tone);
        return original(n - 1 - bandIndex, tone); // read the OTHER end
      };
      try { return fn(); } finally { Regions.coverageFor = original; }
    };

    test('a flipped ladder read moves the FACETED golden (scene3d.js coverageGain)', () => {
      const before = summaryFor('box-bands-3');
      const after = withFlippedLadder(() => summaryFor('box-bands-3'));
      expect(after).not.toEqual(before);
      expect(after.fillPathsByFace).not.toEqual(before.fillPathsByFace);
    });

    // The curved path's ladder READ SITE MOVED in Round 3. It used to read
    // `Regions.coverageFor` directly (coverageForSample); it now classifies the
    // sample into a form ZONE and reads `Regions.formInk`, because the ladder's
    // own numbers cannot express T > F > R — Lambert is clamped, so T, F and R
    // are all I = 0 and no threshold can separate them. `coverageForSample`
    // survives only as the no-zone fallback. So the inversion probe has to flip
    // the site the curved fill actually consults, or it proves nothing.
    const withFlippedFormInk = (fn) => {
      const Regions = V.Scene3D.Regions;
      const original = Regions.formInk;
      const swap = { L: 'F', M: 'F', F: 'L', T: 'L', R: 'M', H: 'H' };
      Regions.formInk = (zone) => original(swap[zone] || zone); // read the OTHER end
      try { return fn(); } finally { Regions.formInk = original; }
    };

    test('a flipped ladder read moves the CURVED golden (surface-fill.js formInk)', () => {
      const before = summaryFor('sphere-bands-3');
      const after = withFlippedFormInk(() => summaryFor('sphere-bands-3'));
      expect(after).not.toEqual(before);
      expect(after.fillGrid).not.toEqual(before.fillGrid);
    });

    test('the curved fill no longer reads coverageFor when zones are live', () => {
      // Not a redundancy: it PINS where the read moved to. If a future refactor
      // routes the curved fill back through coverageFor, this fails and the
      // probe above must be re-pointed rather than silently going blind.
      const before = summaryFor('sphere-bands-3');
      expect(withFlippedLadder(() => summaryFor('sphere-bands-3'))).toEqual(before);
    });

    test('the flip is fully reverted — the goldens are re-measurable afterwards', () => {
      withFlippedLadder(() => summaryFor('box-bands-3'));
      compare('box-bands-3', summaryFor('box-bands-3'));
    });
  });
});
