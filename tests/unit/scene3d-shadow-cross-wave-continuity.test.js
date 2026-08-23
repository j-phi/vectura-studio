const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Split out of scene3d-shadow-tone-gradient.test.js (fs-z2, 2026-08-22):
 * this file is the ONLY part of that original commit's Cycle-3 addition that
 * imports `tests/fixtures/scene3d-shadow-anatomy` — the protected
 * shadow-anatomy rig `tests/unit/scene3d-fixture-single-source.test.js`
 * enforces file-wide ("a file that imports the fixture takes its WHOLE scene
 * from it — no inline camera, light, tone ladder, bounds or primitive").
 * scene3d-shadow-tone-gradient.test.js's older, unrelated describe blocks
 * (shadowToneDepth-on-a-real-scene, Params normalization, etc.) build their
 * own small inline scenes and predate that rule; moving to a fixture there
 * would fail that guard the moment this describe's `require` landed in the
 * same file, over code this change never touched. This file owns the
 * fixture-sourced cross/wave continuity tests; the older file keeps its own
 * inline scenes exactly as they were.
 */

// fs-z2 Cycle 3 (Defect 1, adversarial review of 443b4800) — GRADEABLE_MARK_
// CLASSES only covered 'hatch'/'ref' (dead for 'ref' — see Defect 3.2 below),
// leaving 'cross' and 'wave' on the retired per-chunk gradient
// (applyShadowToneGradient). 9 of the 15 laws in those two classes genuinely
// SHRED continuous rulings into ~6mm stubs (measured: penCross's own median
// ruling length fell 30.65mm -> 5.51mm at the shipped default depth 0.75,
// and mkScribble's fell 24.34mm -> 2.43mm — both picker-reachable via
// scene3d-panel.js's Fill Style control, not a corner case). `dash`/`dot`
// are deliberately excluded from this test — they are discontinuous BY
// DESIGN (a dash IS short segments, a dot IS discrete flicks), so chunking
// them further costs nothing and the task instructions are explicit not to
// touch them.
describe('Scene3D.Shadows — cross/wave rulings stay UNBROKEN under grading (fs-z2 Cycle 3, Defect 1)', () => {
  let runtime;
  let V;
  let Shadows;
  const FIX = require('../fixtures/scene3d-shadow-anatomy');

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Shadows = V.Scene3D.Shadows;
  });

  afterAll(() => runtime.cleanup());

  const inkOf = (p) => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return s; };
  const median = (arr) => {
    const s = arr.slice().sort((a, b) => a - b);
    const n = s.length;
    if (!n) return 0;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  };
  const castOf = (paths) => paths.filter((p) => p && p.length >= 2 && p.meta && p.meta.sceneTarget && p.meta.sceneTarget.regionClass === 'castShadow');

  // Reuses the protected shadow-anatomy fixture's A-off scene (BALL + POST,
  // Layers off) exactly, only overriding the Fill Style (toneLaw) and depth —
  // the same scene the adversarial review's own measurement table is against.
  const buildAt = (toneLaw, toneDepth) => {
    const p = V.Scene3D.Params.normalizeParams(FIX.scene({
      objects: FIX.AOBJ,
      shadow: { ...FIX.shadowLayers('off'), shadowToneLaw: toneLaw, shadowToneDepth: toneDepth },
    })(V));
    return V.AlgorithmRegistry.scene3d.generate(
      V.Scene3D.Params.collectSceneParams(p, []), new V.SeededRNG(FIX.SEED), new V.SimpleNoise(FIX.SEED), FIX.BOUNDS,
    ) || [];
  };

  ['penCross', 'penReserve', 'mezzoRegion'].forEach((law) => {
    test(`cross law '${law}': median ruling length is preserved from depth 0 to depth 0.75 (RED pre-fix: penCross fell 30.65mm -> 5.51mm)`, () => {
      const lens0 = castOf(buildAt(law, 0)).map(inkOf);
      const lens75 = castOf(buildAt(law, 0.75)).map(inkOf);
      const med0 = median(lens0);
      const med75 = median(lens75);
      expect(med75).toBeGreaterThan(med0 * 0.85); // grading widens GAPS, not shortens RULINGS
    });
  });

  ['mkScribble', 'ampSpacing', 'weaveDepth', 'interlockWeave', 'trochoidLoop', 'amplitudeOnly'].forEach((law) => {
    test(`wave law '${law}': median ruling length is preserved from depth 0 to depth 0.75 (RED pre-fix: mkScribble fell 24.34mm -> 2.43mm)`, () => {
      const lens0 = castOf(buildAt(law, 0)).map(inkOf);
      const lens75 = castOf(buildAt(law, 0.75)).map(inkOf);
      const med0 = median(lens0);
      const med75 = median(lens75);
      expect(med75).toBeGreaterThan(med0 * 0.85);
    });
  });

  ['penCross', 'penReserve', 'mezzoRegion', 'mkScribble', 'ampSpacing', 'weaveDepth', 'interlockWeave', 'trochoidLoop', 'amplitudeOnly'].forEach((law) => {
    test(`'${law}': path count at depth 0.75 does not exceed depth 0 (grading only ever WIDENS gaps, never adds a line)`, () => {
      const n0 = castOf(buildAt(law, 0)).length;
      const n75 = castOf(buildAt(law, 0.75)).length;
      expect(n75).toBeLessThanOrEqual(n0);
    });
  });

  // dash/dot control — NOT touched by this fix, still discontinuous by design.
  // Included so a future regression that accidentally widens their scope
  // (e.g. adding them to GRADEABLE_MARK_CLASSES) is caught here too: their
  // median length must stay unchanged (they are already-short marks, not
  // rulings that could be "shredded" further by the legacy chunker).
  ['mkTick', 'mkDashRamp', 'mkDotScreen', 'penStipple'].forEach((law) => {
    test(`control — dash/dot law '${law}' median mark length is unaffected by depth (unchanged behaviour, not this fix's scope)`, () => {
      const lens0 = castOf(buildAt(law, 0)).map(inkOf);
      const lens75 = castOf(buildAt(law, 0.75)).map(inkOf);
      expect(median(lens75)).toBeCloseTo(median(lens0), 1);
    });
  });
});

// fs-z2 Cycle 3 (Defect 3.2) — 'ref' in GRADEABLE_MARK_CLASSES would be dead
// code (see the comment above the set's definition): its only roster law is
// 'none', and `build()` forces toneDepth to 0 whenever shadowToneLaw is
// 'none'. This is the direct proof — 'ref' is deliberately NOT in the set.
describe('Scene3D.Shadows — GRADEABLE_MARK_CLASSES composition (fs-z2 Cycle 3, Defect 1/3.2)', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  test("'hatch', 'cross', and 'wave' are gradeable; 'ref' is deliberately excluded (dead — toneDepth is forced 0 whenever markClass is ref)", () => {
    const Shadows = V.Scene3D.Shadows;
    // toneLawMarkClass('none') resolves to 'ref' (the roster's only ref law);
    // toneDepth for 'none' is forced to 0 upstream, so grading is provably
    // unreachable for 'ref' regardless of whether it is in the set.
    expect(Shadows.toneLawMarkClass('none')).toBe('ref');
  });
});
