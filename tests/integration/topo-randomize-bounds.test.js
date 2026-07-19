/**
 * RGR regression coverage for CI flake root-caused 2026-07-19: the e2e smoke
 * test "core interactions remain functional on desktop and touch tablet"
 * clicks #btn-randomize-params on a topo layer. Topo generation cost scales
 * with resolution² × levels, and Randomize used to draw from the full slider
 * ranges (resolution up to 240, levels up to 60) — pathological combos took
 * 7.4s locally and blew the 60s e2e budget on slower CI runners.
 *
 * The fix mirrors the flowfield idiom (density/maxSteps randomMax): topo's
 * resolution and levels carry randomize-specific upper bounds below the
 * slider max. Sliders still reach 240/60 manually; only Randomize is capped.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('topo Randomize stays within bounded cost caps', () => {
  let runtime;
  let app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      includeMain: false,
      useIndexHtml: true,
    });
    const { window } = runtime;
    window.app = new window.Vectura.App();
    app = window.app;
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('randomizeLayerParams never exceeds randomMax for resolution/levels', () => {
    const id = app.engine.addLayer('topo');
    const layer = app.engine.layers.find((l) => l.id === id);
    expect(layer).toBeTruthy();

    // Without caps, resolution lands above 150 on ~45% of draws — 150
    // iterations make an uncapped randomizer fail with certainty while
    // keeping the capped run deterministic-in-practice.
    for (let i = 0; i < 150; i++) {
      app.ui.randomizeLayerParams(layer);
      expect(layer.params.resolution).toBeLessThanOrEqual(150);
      expect(layer.params.levels).toBeLessThanOrEqual(30);
    }
  });

  test('the slider ranges themselves still reach the full max (caps only bind Randomize)', () => {
    const defs = runtime.window.Vectura.UI.CONTROL_DEFS.topo;
    const resolution = defs.find((d) => d.id === 'resolution');
    const levels = defs.find((d) => d.id === 'levels');
    expect(resolution.max).toBe(240);
    expect(levels.max).toBe(60);
    expect(resolution.randomMax).toBeLessThan(resolution.max);
    expect(levels.randomMax).toBeLessThan(levels.max);
  });
});
