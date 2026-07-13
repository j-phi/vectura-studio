const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { probeHorizon } = require('../helpers/floating-horizon-oracle');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Terrain — no line breaks through the row in front of it, ON THE PATH THE USER TAKES.
 *
 * The sibling unit test hands terrain.generate() a param object, which reaches exactly
 * ONE of the places Occlusion Bias comes from — the `finite(p.depthBias, …)` fallback —
 * and is structurally blind to the other two:
 *
 *   ALGO_DEFAULTS.terrain              seeds a new layer's params
 *   user-presets/terrain/default        the factory preset, Object.assign'd ON TOP of
 *                                       them by Layer (src/core/layer.js) — so it WINS
 *
 * That blindness is not hypothetical: on raster-plane the same bias shipped wrong from
 * the preset, and again from a UI cascade, while thousands of generate()-level tests
 * stayed green. A hand-written param object cannot see a bad default, because it
 * *supplies* the value it is testing. Terrain shipped 0.5 in all three places at once.
 *
 * So this test buys the layer the way a user does — addLayer (ALGO_DEFAULTS + factory
 * preset), regenerate through the engine — and asserts on the OUTPUT of the hidden-line
 * pass. The last test poisons the bias and REQUIRES this suite to notice: a guard that
 * cannot fail is worse than no guard.
 */
describe('Terrain — the app path draws no line inside the row in front of it', () => {
  let runtime, window, app, G3;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    G3 = window.Vectura.Geometry3D;
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  /*
   * Add a terrain layer, apply `view`, regenerate through the engine, and measure the
   * hidden-line pass against an exact continuous rebuild of its own upper/lower horizon
   * (tests/helpers/floating-horizon-oracle.js).
   *
   * The measurement reads the occluder's INPUT and OUTPUT, not layer.paths: terrain
   * applies a uniform fit-to-canvas scale+translate AFTER occlusion (and rewrites the
   * returned points in place while doing it), so layer.paths is in a different space
   * than the rows and comparing the two produces spectacular nonsense.
   *
   * `poison` forces a bias in after the layer is built — used only to prove this
   * measurement can fail.
   */
  const renderViaApp = (view = {}, poison = null) => {
    const id = app.engine.addLayer('terrain');
    const layer = app.engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, view);
    if (poison) Object.assign(layer.params, poison);

    app.engine.activeLayerId = layer.id;
    // app.regen() is what the UI calls. engine.generate() takes an ID, not a layer —
    // handing it the layer is a silent no-op that leaves the PREVIOUS render in place.
    const m = probeHorizon(G3, () => app.regen(), { sampleStep: 0.5 });

    const params = { ...layer.params };
    app.engine.removeLayer(layer.id);
    return { ...m, params };
  };

  test('a fresh terrain layer clips with zero slack', () => {
    const r = renderViaApp();
    // Asserted on the value that actually reached the hidden-line pass, not on any one
    // of the three places it could have come from.
    expect(r.params.depthBias, 'Occlusion Bias is slack: above 0 a farther row protrudes').toBe(0);
    expect(r.eps, 'and that is what the sweep must actually receive').toBe(0);
    // The preset really does route through this code path — if it ever stops shipping
    // free-3d + occlusion, everything below would pass by measuring nothing.
    expect(r.params.perspectiveMode, 'the vanishing-point modes never reach this pass').toBe('free-3d');
    expect(r.params.occlusion).toBe(true);
    expect(r.params.hiddenLineMode).toBe('remove');
    expect(r.rowCount).toBeGreaterThan(8);
    expect(r.paths).toBeGreaterThan(8);
  });

  // A bias is invisible at some poses, so sweep the camera and the terrain around the
  // one the FACTORY PRESET ships (pitch 17.3, yaw -0.4 — not ALGO_DEFAULTS').
  const VIEWS = [
    { label: 'as shipped', view: {} },
    { label: 'low tilt', view: { pitch: 6 } },
    { label: 'high tilt', view: { pitch: 45 } },
    { label: 'rolled', view: { roll: 12 } },
    { label: 'tall relief', view: { mountainAmplitude: 60 } },
    { label: 'dense grid', view: { depthSlices: 48, xResolution: 260 } },
  ];

  /*
   * `maxRun` = the longest contiguous stretch of emitted ink sitting strictly inside the
   * opaque band — a whisker, in px, which is the thing you actually see. The pass
   * rasterises its occluders onto a ~1px column grid, so a sub-pixel residue survives at
   * any bias and a hard zero is not achievable; the ceiling here sits just above that
   * measured floor and an order of magnitude below the defect (the shipped 0.5 produced
   * runs of 5-13px — see the poison test).
   */
  test.each(VIEWS)('no whisker of ink inside a nearer row — $label', ({ view }) => {
    const r = renderViaApp(view);
    expect(
      r.maxRun,
      `longest run of ink inside the occluding band: ${r.maxRun.toFixed(2)}px (total ${r.overLen.toFixed(1)}px in ${r.runs} runs >=1px)`,
    ).toBeLessThan(2);
  });

  /*
   * The opposite failure. Over-occluding would clear the test above by deleting the ink,
   * and on a continuous heightfield that is the real risk of a zero bias (self-occlusion
   * acne: runs shatter, ink collapses). These signals are model-free.
   */
  test('the surface does not shatter or thin out at zero slack', () => {
    const shipped = renderViaApp();
    const biased = renderViaApp({}, { depthBias: 0.5 }); // the value that shipped
    // Acne is a multiple, not a percent: it shatters every run into dozens of stubs.
    // Measured through the app: paths 131 vs 112 (the slack was BRIDGING genuine hidden
    // gaps, so removing it correctly splits a few runs), fragments 10 vs 8, ink -5%
    // — and that 5% is the protruding ink itself.
    expect(shipped.paths, 'path count must not explode').toBeLessThan(biased.paths * 1.5);
    expect(shipped.fragments, 'sub-2px fragments must not explode').toBeLessThan(biased.fragments + 15);
    expect(shipped.ink, 'ink must not collapse').toBeGreaterThan(biased.ink * 0.9);
  });

  // MUTATION TEST — poison the bias and require this suite to see it.
  test.each([
    { label: 'the 0.5 that shipped', bias: 0.5 },
    { label: 'a grossly bad 3.0', bias: 3 },
  ])('this guard CATCHES a poisoned Occlusion Bias — $label', ({ bias }) => {
    const clean = renderViaApp();
    const bad = renderViaApp({}, { depthBias: bias });
    expect(bad.maxRun, 'a poisoned bias must trip the whisker assertion above').toBeGreaterThan(2);
    expect(bad.runs).toBeGreaterThan(clean.runs + 10);
  });
});
