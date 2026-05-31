const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Phase 1 — the first harmonograph preset gallery (none existed before).
 * Asserts the filtered library, the rendered selector, and that applying a
 * preset merges its params into the active layer (the craft-ladder onboarding
 * entry point).
 */
describe('Harmonograph presets', () => {
  let runtime, window, document;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    window.app.engine.addLayer('harmonograph');
    window.app.ui.renderLayers();
    window.app.ui.buildControls();
  });

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  // The preset selector is now the craft-ladder gallery, not a <select>.
  const presetCard = (id) => document.querySelector(`.hg-preset-card[data-preset-id="${id}"]`);

  test('the harmonograph preset library is filtered out of PRESETS', () => {
    const lib = window.Vectura.PresetLibraries.harmonograph;
    expect(Array.isArray(lib)).toBe(true);
    expect(lib.length).toBe(4);
    expect(lib.every((p) => p.preset_system === 'harmonograph')).toBe(true);
    expect(lib.map((p) => p.id)).toEqual(
      expect.arrayContaining([
        'harmonograph-unison-circle',
        'harmonograph-classic-3-2-star',
        'harmonograph-4-3-star',
        'harmonograph-evolving-snake',
      ])
    );
  });

  test('every preset is a valid, non-degenerate figure (evaluates to a real path)', () => {
    const core = window.Vectura.HarmonographCore;
    const base = window.Vectura.ALGO_DEFAULTS.harmonograph;
    window.Vectura.PresetLibraries.harmonograph.forEach((preset) => {
      const params = { ...base, ...preset.params };
      const { path } = core.evaluatePath(params, { sampleCap: 1200 });
      expect(path.length).toBeGreaterThan(100);
      const xs = path.map((p) => p.x);
      const ys = path.map((p) => p.y);
      const spanX = Math.max(...xs) - Math.min(...xs);
      const spanY = Math.max(...ys) - Math.min(...ys);
      // A real 2D figure, not a dot or a flat line.
      expect(Math.min(spanX, spanY)).toBeGreaterThan(1);
    });
  });

  test('the preset gallery renders a card for each of the 4 presets', () => {
    expect(document.querySelector('.hg-preset-gallery')).toBeTruthy();
    expect(document.querySelectorAll('.hg-preset-card').length).toBe(4);
    expect(presetCard('harmonograph-unison-circle')).toBeTruthy();
    expect(presetCard('harmonograph-evolving-snake')).toBeTruthy();
  });

  test('applying a preset merges its params into the active layer', () => {
    presetCard('harmonograph-classic-3-2-star').click();

    const layer = window.app.engine.getActiveLayer();
    expect(layer.params.preset).toBe('harmonograph-classic-3-2-star');
    expect(layer.params.scale).toBe(0.5);
    expect(Array.isArray(layer.params.pendulums)).toBe(true);
    expect(layer.params.pendulums.length).toBe(2);
    expect(layer.params.pendulums.map((p) => p.freq).sort()).toEqual([2, 3]);
    // A field from defaults the preset didn't set still comes through the base merge.
    expect(layer.params.curves).toBe(true);
  });

  test('switching to a different preset replaces the figure (no stale pendulums)', () => {
    presetCard('harmonograph-classic-3-2-star').click();
    // gallery was rebuilt by buildControls(); re-query before reusing.
    presetCard('harmonograph-unison-circle').click();

    const layer = window.app.engine.getActiveLayer();
    expect(layer.params.preset).toBe('harmonograph-unison-circle');
    expect(layer.params.pendulums.length).toBe(1);
  });
});
