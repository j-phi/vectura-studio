/*
 * Terrain — the floating-horizon pass must clip EXACTLY at the silhouette.
 *
 * Occlusion Bias (depthBias) reaches G3.occludeRowsFloatingHorizon as `eps`, and eps
 * is SLACK in a screen-space test: `visible = !(y > up + eps && y < lo - eps)`. Any
 * eps > 0 therefore lets a farther row draw up to eps px INSIDE the row in front of
 * it. On terrain both the silhouette and the row crossing it are near-horizontal, so
 * that vertical slack is amplified ALONG the line — at the 0.5 this algorithm shipped
 * with, into whiskers over 10px long.
 *
 * The counter-argument was that terrain NEEDS the slack, because unlike raster-plane's
 * free-standing curtains its rows are one continuous surface and would z-fight each
 * other at eps=0 (self-occlusion acne: ink collapses, runs shatter into fragments).
 * That is measurably false, and this file pins both halves of it:
 *
 *   protrusion  — no ink inside the band the pass itself computed  (the bug)
 *   acne        — and zeroing the bias does NOT shatter the output (the feared cure)
 *
 * The reason terrain is safe: the sweep tests a row only against strictly NEARER rows,
 * and one row's own band is degenerate (upper == lower == its own y), so a row can
 * never occlude itself. Adjacent rows only interact where they genuinely overlap.
 *
 * SCOPE — this file tests the ALGORITHM. It hands generate() a param object with
 * depthBias DELETED, so it exercises exactly one of the four origins of that default:
 * the `finite(p.depthBias, …)` fallback in terrain.js. It is structurally blind to
 * ALGO_DEFAULTS, to user-presets/terrain/default.vectura (which is applied ON TOP of
 * them by Layer, and therefore wins), and to any UI cascade. The guard that speaks for
 * what a USER gets is tests/integration/terrain-app-path-occlusion.test.js. Keep both.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { probeHorizon } = require('../helpers/floating-horizon-oracle');

describe('Terrain — hidden-line removal clips exactly at the silhouette', () => {
  let V, G3;

  beforeAll(async () => {
    const runtime = await loadVecturaRuntime({});
    V = runtime.window.Vectura;
    G3 = V.Geometry3D;
  });

  const BOUNDS = { width: 800, height: 600 };

  // ALGO_DEFAULTS with depthBias REMOVED — so terrain.js's own fallback supplies it.
  const paramsWithoutBias = (over = {}) => {
    const p = JSON.parse(JSON.stringify(V.ALGO_DEFAULTS.terrain));
    delete p.depthBias;
    // The factory preset ships free-3d; the vanishing-point modes use a different
    // hidden-line path entirely and never see this parameter.
    return { ...p, perspectiveMode: 'free-3d', occlusion: true, hiddenLineMode: 'remove', ...over };
  };

  const probe = (params) => probeHorizon(
    G3,
    () => V.AlgorithmRegistry.terrain.generate(params, null, new V.SimpleNoise(7), BOUNDS),
    { sampleStep: 0.5 },
  );

  // A bias is invisible at some poses, so sweep tilt, density and relief.
  const POSES = [
    { label: 'as shipped', over: {} },
    { label: 'low tilt', over: { pitch: 6 } },
    { label: 'high tilt', over: { pitch: 45 } },
    { label: 'tall relief', over: { mountainAmplitude: 60 } },
    { label: 'dense grid', over: { depthSlices: 48, xResolution: 260 } },
  ];

  test.each(POSES)('the algorithm default is zero slack — $label', ({ over }) => {
    const shipped = probe(paramsWithoutBias(over));
    expect(shipped.eps, 'eps is slack, not a depth epsilon: it must reach the sweep as 0').toBe(0);
    expect(shipped.rowCount).toBeGreaterThan(4);
    expect(shipped.paths).toBeGreaterThan(4);
  });

  /*
   * The absolute statement. `runs` counts contiguous stretches of >= 1px of emitted ink
   * sitting strictly inside the opaque band — a whisker. Zero is not achievable in
   * principle (the pass rasterises its occluders onto a ~1px column grid, and that
   * rounding leaves a sub-pixel residue no bias can remove), so the floor is MEASURED
   * here rather than assumed: with the slack gone, the residue is the floor, and the
   * floor is < 2px of ink in a single stretch. It is not a tolerance band — the defect
   * being hunted is an order of magnitude above it, as the mutation tests below prove.
   */
  test.each(POSES)('no whisker of ink inside a nearer row — $label', ({ over }) => {
    const m = probe(paramsWithoutBias(over));
    expect(
      m.maxRun,
      `longest run of ink inside the occluding band: ${m.maxRun.toFixed(2)}px (total ${m.overLen.toFixed(1)}px in ${m.runs} runs >=1px)`,
    ).toBeLessThan(2);
  });

  /*
   * The other failure direction. A "fix" that simply over-occludes would also clear the
   * test above — by deleting the ink. These three signals need no oracle at all: acne
   * shatters long runs into many short paths and drops total ink.
   */
  test('zeroing the bias does not shatter the surface (no self-occlusion acne)', () => {
    const zero = probe(paramsWithoutBias());
    const biased = probe(paramsWithoutBias({ depthBias: 0.5 }));   // the value that shipped
    // Acne is a multiple, not a percent — it shatters every run into dozens of stubs.
    // Measured here: paths +3%, fragments +2, ink -1.7%.
    expect(zero.paths, 'path count must not explode').toBeLessThan(biased.paths * 1.5);
    expect(zero.fragments, 'sub-2px fragments must not explode').toBeLessThan(biased.fragments + 15);
    expect(zero.ink, 'ink must not collapse').toBeGreaterThan(biased.ink * 0.9);
    // And the ink that DID disappear is the protruding ink itself, not surface detail.
    const removedInk = biased.ink - zero.ink;
    const removedProtrusion = biased.overLen - zero.overLen;
    expect(removedProtrusion).toBeGreaterThan(removedInk * 0.6);
  });

  /*
   * MUTATION TESTS. A guard that cannot fail is a false statement of safety. Feed the
   * oracle the historical bad value and a grossly bad one; it must go red for both.
   */
  test.each([
    { label: 'the 0.5 that shipped', bias: 0.5 },
    { label: 'a grossly bad 3.0', bias: 3 },
  ])('the oracle CATCHES a poisoned bias — $label', ({ bias }) => {
    const zero = probe(paramsWithoutBias());
    const poisoned = probe(paramsWithoutBias({ depthBias: bias }));
    expect(poisoned.maxRun, 'poisoned bias must trip the >=2px whisker assertion').toBeGreaterThan(2);
    expect(poisoned.runs, 'and must produce whiskers where zero bias produced ~none').toBeGreaterThan(zero.runs + 10);
    expect(poisoned.overLen).toBeGreaterThan(zero.overLen * 3);
  });

  // Sensitivity floor, recorded so the next reader knows what this metric can and
  // cannot see: it still notices a bias of 0.1px. (Measured: it first reacts at
  // ~0.02-0.05px, depending on pose.)
  test('the oracle still notices a bias as small as 0.1px', () => {
    const zero = probe(paramsWithoutBias());
    const nudged = probe(paramsWithoutBias({ depthBias: 0.1 }));
    expect(nudged.overLen).toBeGreaterThan(zero.overLen * 1.5);
  });
});
