const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Changing a layer's algorithm must land on that algorithm's factory Default.
 *
 * "Factory state" for a type is ALGO_DEFAULTS with the `<type>-default` preset applied
 * on top — that is what `new Layer()` builds (src/core/layer.js `factoryParams`), and it
 * is what the preset gallery compares against to decide whether the layer is still "on"
 * its Default or has diverged to "Custom".
 *
 * The layer-type swap re-derived that state by hand and got a different answer: it rebuilt
 * params from ALGO_DEFAULTS ALONE. So flipping the Algorithm dropdown handed you a layer
 * that claimed `preset: '<type>-default'` while missing every value that preset curates —
 * topoform came up at primitiveDetail 18 instead of 100, spiralizer lost 11 curated params.
 * The gallery, correctly, called it "Custom". The Default was never loaded.
 *
 * Same bug, same cause, in "Reset to Defaults": reset to ALGO_DEFAULTS is not reset to what
 * a new layer of this type gets.
 *
 * These are mechanical sweeps over every algorithm whose factory preset curates anything —
 * they name no algorithm and no value, so a new one is covered on arrival.
 */
describe('a layer that changes algorithm loads that algorithm’s factory Default', () => {
  let runtime, window, document, app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
  });
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  // Placement and identity are per-layer by nature — they are carried across a swap on
  // purpose, so they are not part of "did the Default load".
  const NOT_A_LOOK = new Set(['seed', 'posX', 'posY', 'scaleX', 'scaleY', 'rotation']);

  // Every algorithm whose `<type>-default` preset actually curates something. An empty
  // preset defers wholly to ALGO_DEFAULTS, so it cannot distinguish the two code paths.
  const curatingTypes = () =>
    (window.Vectura.PRESETS || [])
      .filter((p) => p.preset_system
        && p.id === `${p.preset_system.toLowerCase()}-default`
        && p.params && Object.keys(p.params).length)
      .map((p) => p.preset_system);

  const looksOf = (params) => {
    const out = {};
    Object.keys(params).forEach((k) => { if (!NOT_A_LOOK.has(k)) out[k] = params[k]; });
    return out;
  };

  /*
   * The reference: a brand-new layer of this type, bought through the engine and put
   * through the same panel build + regen. Not `factoryParams()` raw — the noise rack and
   * the pendula panel canonicalize their entries in place on the first regen (key order,
   * ids, legacy mirror keys), so the raw factory object is not what a live layer holds.
   * Comparing a switched layer against a live fresh one is the claim we actually mean.
   */
  const freshLooks = (type) => {
    const id = app.engine.addLayer(type);
    app.ui.renderLayers();
    app.ui.buildControls();
    const layer = app.engine.layers.find((l) => l.id === id);
    const looks = JSON.parse(JSON.stringify(looksOf(layer.params)));
    app.engine.removeLayer(id);
    return looks;
  };

  const switchAlgorithmTo = (type) => {
    const select = document.getElementById('generator-module');
    select.value = type;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  };

  test('the Algorithm dropdown loads the factory Default, not bare ALGO_DEFAULTS', () => {
    const types = curatingTypes();
    expect(types.length, 'no factory preset curates anything — the sweep would be vacuous').toBeGreaterThan(0);

    const offenders = [];
    types.forEach((type) => {
      const factory = freshLooks(type);

      // A brand-new layer of the SOURCE type, switched through the real <select>. Driving
      // the actual dropdown is the only way to see this — the swap path is UI code, and a
      // hand-written param object would supply the very values under test.
      const id = app.engine.addLayer('flowfield');
      app.ui.renderLayers();
      app.ui.buildControls();
      switchAlgorithmTo(type);

      const layer = app.engine.layers.find((l) => l.id === id);
      const missing = Object.keys(factory).filter(
        (k) => JSON.stringify(layer.params[k]) !== JSON.stringify(factory[k]),
      );
      if (missing.length) {
        offenders.push(
          `${type}: switched layer differs from a fresh ${type} layer on ${missing.length} param(s) — `
          + missing.slice(0, 4).map((k) => `${k}=${JSON.stringify(layer.params[k])} (fresh: ${JSON.stringify(factory[k])})`).join(', '),
        );
      }
      app.engine.removeLayer(layer.id);
    });

    expect(offenders, `\n  ${offenders.join('\n  ')}\n`).toEqual([]);
  });

  test('"Reset to Defaults" restores the factory Default, not bare ALGO_DEFAULTS', () => {
    const types = curatingTypes();
    const offenders = [];

    types.forEach((type) => {
      const factory = freshLooks(type);

      const id = app.engine.addLayer(type);
      app.ui.renderLayers();
      app.ui.buildControls();

      const layer = app.engine.layers.find((l) => l.id === id);
      // Move something off its default so the reset has work to do.
      const key = Object.keys(factory).find((k) => typeof factory[k] === 'number');
      if (key) layer.params[key] = factory[key] + 7;

      const reset = [...document.querySelectorAll('button')]
        .find((b) => b.textContent.trim() === 'Reset to Defaults');
      expect(reset, 'the Reset to Defaults button must exist').toBeTruthy();
      reset.click();

      const missing = Object.keys(factory).filter(
        (k) => JSON.stringify(layer.params[k]) !== JSON.stringify(factory[k]),
      );
      if (missing.length) {
        offenders.push(
          `${type}: after reset, ${missing.length} param(s) are not at factory — `
          + missing.slice(0, 4).map((k) => `${k}=${JSON.stringify(layer.params[k])} (factory: ${JSON.stringify(factory[k])})`).join(', '),
        );
      }
      app.engine.removeLayer(layer.id);
    });

    expect(offenders, `\n  ${offenders.join('\n  ')}\n`).toEqual([]);
  });

  /*
   * The preset library is shipped state, shared by every layer ever created. A factory
   * preset's nested params (rasterplane-default carries a whole `noises` rack) must be
   * COPIED into the layer, never aliased: hand a layer the preset's own array and the
   * first edit to that noise rewrites the shipped preset in memory — every subsequent
   * new layer of that type inherits the edit, and the gallery, comparing against the
   * mutated preset, still reports "Default".
   */
  test('a factory preset never hands the layer its own nested objects', () => {
    const nested = (window.Vectura.PRESETS || []).filter(
      (p) => p.preset_system
        && p.id === `${p.preset_system.toLowerCase()}-default`
        && Object.values(p.params || {}).some((v) => v && typeof v === 'object'),
    );
    expect(nested.length, 'no factory preset carries a nested param — the sweep would be vacuous').toBeGreaterThan(0);

    const offenders = [];
    nested.forEach((preset) => {
      const type = preset.preset_system;
      const id = app.engine.addLayer(type);
      const layer = app.engine.layers.find((l) => l.id === id);

      Object.keys(preset.params).forEach((key) => {
        const value = preset.params[key];
        if (!value || typeof value !== 'object') return;
        if (layer.params[key] === value) {
          offenders.push(`${preset.id}: layer.params.${key} IS the preset's own object — an edit would rewrite the shipped preset`);
        }
      });
      app.engine.removeLayer(layer.id);
    });

    expect(offenders, `\n  ${offenders.join('\n  ')}\n`).toEqual([]);
  });
});
