const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * RGR — THE RIBBON MUST ACTUALLY SHIP A RIBBON.
 *
 * `scene3d-ribbon-weightscale.test.js` (T4) proves every bucket-B path leaves at
 * weightScale 1. That assertion is satisfied TRIVIALLY by the failure mode this
 * file exists to catch: when `ribbonize` cannot clip its ribbon it falls back to
 * `centrePass`, a bare single-pen centreline — which is weightScale 1 and passes
 * T4 while the entire feature is inert. The whole variable-width pipeline can
 * die without one existing assertion changing colour.
 *
 * WHAT WENT WRONG (2026-08-29). `buildRegionRings` marches squares over the
 * chart's (a, b) parameter square and bisects each grid edge that straddles the
 * front/back boundary. On a PERIODIC axis the wrap cell's outside corner comes
 * back as parameter 0 while its inside corner is (N-1)/N, so the bisection
 * interval spanned the whole chart the LONG way round and converged on the
 * OPPOSITE silhouette. A sphere seen down its own seam (camera yaw 0) therefore
 * traced its LEFT limb twice and its right limb never: one 218-point ring of
 * signed area -0.014 instead of a ~6600 mm² disc. Every ribbon then clipped to
 * nothing and shipped its centreline. Measured in the running app before the
 * fix: `taperedEnds` -> wide 39, clipped 39, ribbons 0, outlines 0, fills 0,
 * degenerate 39.
 *
 * The scene below is the axis-aligned one from
 * `scripts/stroke-fill-integration-evidence.js` — camera yaw/pitch 0 and an
 * untransformed sphere — precisely because that is the alignment that puts the
 * front/back boundary ON the chart seam. The T4 fixture's yaw 20 / pitch 10
 * sphere hides the bug (it traces one good ring plus one collapsed one), which
 * is exactly why the defect survived a green suite.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));
const BOUNDS = { width: 320, height: 220, m: 20, dW: 280, dH: 180, penWidth: 0.3 };

// Bucket B laws whose width varies ALONG the ruling, so each one really does
// build ribbons rather than one flat-width band. A representative spread of the
// twelve; the full roster's weightScale invariant is T4's job, not this file's.
const RIBBON_LAWS = ['taperedEnds', 'nibAngle', 'isophoteWidth', 'ampSpacing'];

describe('ribbon region clip — a ribbon law must emit real ribbons, not centrelines', () => {
  let runtime; let V; let algo; let defaults;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    algo = V.AlgorithmRegistry.scene3d;
    defaults = V.ALGO_DEFAULTS.scene3d;
  }, 120000);
  afterAll(() => runtime.cleanup());

  // SEAM-ALIGNED. Do not "tidy" these angles: a non-zero yaw turns the chart
  // seam away from the silhouette and the regression stops reproducing.
  const scene = (law, strokeFillStyle) => {
    const p = clone(defaults);
    p.objects = [{
      id: 'ball', name: 'Ball', primitive: 'sphere', params: { radius: 46, detail: 26 },
      transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
    }];
    p.ground = { enabled: false };
    p.backdrop = { enabled: false };
    p.camera = {
      projection: 'orthographic', yaw: 0, pitch: 0, roll: 0,
      cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    const base = { penId: null, mapper: 'hatch', params: { fillAngle: 0, fillDensity: 60, toneLaw: law } };
    p.styleTable = { scene: clone(base), byObject: { ball: clone(base) }, byFace: {} };
    p.tone = { ...clone(defaults).tone, enabled: true };
    p.lights = [{ id: 'sun', type: 'directional', azimuth: 90, elevation: 30, intensity: 1, castShadows: false }];
    // C4 puts this on the LAYER, not in the style cascade — see the
    // strokeFillStyle test below for why that distinction has teeth.
    if (strokeFillStyle) p.strokeFillStyle = strokeFillStyle;
    return p;
  };

  const build = (law, strokeFillStyle) => {
    const paths = algo.generate(scene(law, strokeFillStyle), null, null, BOUNDS) || [];
    return { paths, stats: V.Scene3D.SurfaceFill.lastRibbonStats };
  };

  test.each(RIBBON_LAWS)('"%s" builds, clips, outlines and fills real ribbons', (law) => {
    const { stats } = build(law);
    expect(stats).toBeTruthy();
    expect(stats.algo).toBe(law);
    expect(stats.ribbonLaw).toBe(true);
    // The region tracer has to hand back a usable silhouette in the first place.
    expect(stats.regionRings).toBeGreaterThan(0);
    // There must be something to ribbonize at all — otherwise the assertions
    // below are vacuous in the same way T4 was.
    expect(stats.wide).toBeGreaterThan(0);
    // THE CLAIM. Real ribbons, with a real outline and a real interior fill.
    expect(stats.ribbons).toBeGreaterThan(0);
    expect(stats.outlines).toBeGreaterThan(0);
    expect(stats.fills).toBeGreaterThan(0);
    // THE MACHINERY MUST NOT FAIL. These two buckets have no legitimate cause:
    // `noRing` means the ribbon could not be built from a width profile that is
    // wider than the pen, and `clipEmpty` means the clip erased a ribbon whose
    // centreline was proved on-surface sample by sample. `clipEmpty` was 100 %
    // of the 2026-08-29 blocker.
    expect(stats.noRing).toBe(0);
    expect(stats.clipEmpty).toBe(0);
    // AND NO WHOLESALE FALLBACK. `erodeEmpty` IS legitimate at the margin — a
    // ribbon only a little over one pen wide has nothing left after the outline
    // erosion takes a pen width out of it, and C3 rule 5 says that stretch ships
    // as one honest centreline. What is never legitimate is that happening to
    // MOST of them, which is what "the feature is inert" looks like from here.
    expect(stats.ribbons * 2).toBeGreaterThan(stats.wide);
  }, 120000);

  test('the traced visible region is a real area, not a retraced hairline', () => {
    build('taperedEnds');
    const stats = V.Scene3D.SurfaceFill.lastRibbonStats;
    // A r=46 sphere projects to a ~6650 mm² disc. The seam bug produced a ring
    // of |area| 0.014 — six orders of magnitude down — so a generous floor still
    // catches it dead. `regionArea` is the sum of |signed area| over the traced
    // front rings.
    expect(stats.regionArea).toBeGreaterThan(1000);
  }, 120000);

  /* C4 — THE CONTROL HAS TO REACH THE FILL.
   *
   * `strokeFillStyle` is a LAYER param (ALGO_DEFAULTS.scene3d), which is where
   * W4's UI writes it — but `scene3d.js` was reading it off the STYLE cascade
   * (`g.style.params`), where nothing ever writes it. The two halves of the
   * contract were built in parallel worktrees against opposite readings and
   * neither test caught it, because W4's tests assert the param is WRITTEN and
   * the engine's assert the param is FORWARDED. Nothing asserted the pixels
   * changed. Measured in the running app: `b-spiral-full.png` and
   * `b-concentric-full.png` were byte-identical, 19294.0 mm of ink each.
   */
  test('strokeFillStyle actually changes the ink — spiral is not concentric', () => {
    const key = (paths) => paths
      .filter((pp) => pp.meta && pp.meta.kind === 'sceneFill')
      .map((pp) => pp.map((q) => `${q.x.toFixed(3)},${q.y.toFixed(3)}`).join(';')).join('|');
    const spiral = build('taperedEnds', 'spiral');
    const spiralKey = key(spiral.paths);
    const concentric = build('taperedEnds', 'concentric');
    const concentricKey = key(concentric.paths);

    // Both must have actually built ribbons, or "different" would be trivial.
    expect(spiral.stats.fills).toBeGreaterThan(0);
    expect(concentricKey.length).toBeGreaterThan(0);
    expect(concentricKey).not.toBe(spiralKey);
  }, 120000);
});
