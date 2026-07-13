/**
 * Applying a preset must not silently reset your output controls.
 *
 * A preset defines the FIGURE. Curves / Smoothing / Simplify are not part of the
 * figure — they are universal output controls that say how the resulting line is
 * drawn and plotted, and they apply identically to every algorithm. Yet the
 * preserve set that survives a preset apply was a per-algorithm exception table
 * (`EXTRA_PRESERVED`) listing only rings, petalisDesigner and terrain. On the
 * other ~25 algorithms, picking a preset silently reverted all three to whatever
 * the preset happened to carry — so a user who had turned Curves on watched it
 * switch itself off.
 *
 * They belong in the base preserve set alongside the transform keys, for the same
 * reason the transform is preserved: applying a preset should not move your layer,
 * and it should not un-curve your line either.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('preset apply preserves the universal output controls', () => {
  let runtime;
  let window;
  let app;

  beforeEach(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
  });

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  // A spread of algorithms that were NOT in the old EXTRA_PRESERVED table.
  const TYPES = ['flowfield', 'lissajous', 'spiral', 'harmonograph', 'hyphae'];

  const firstPresetId = (type) => {
    const libs = window.Vectura.PresetLibraries || {};
    const lib = libs[type] || [];
    const hit = lib.find((p) => p && p.id && p.id !== 'custom');
    return hit ? hit.id : null;
  };

  test.each(TYPES)('%s: Curves / Smoothing / Simplify survive a preset apply', (type) => {
    const presetId = firstPresetId(type);
    if (!presetId) {
      // No preset library for this type — nothing to assert, and skipping
      // silently would make this test vacuous, so state it.
      expect(presetId).toBeNull();
      return;
    }

    app.engine.addLayer(type);
    const layer = app.engine.getActiveLayer();

    layer.params.curves = true;
    layer.params.smoothing = 0.65;
    layer.params.simplify = 0.4;

    // buildControls() re-stashes the applier so it closes over the active layer.
    app.ui.buildControls();
    expect(typeof app.ui._applyActivePreset).toBe('function');
    app.ui._applyActivePreset(presetId);

    const live = app.engine.getActiveLayer();
    expect(live.params.preset).toBe(presetId);
    expect(live.params.curves).toBe(true);
    expect(live.params.smoothing).toBeCloseTo(0.65, 6);
    expect(live.params.simplify).toBeCloseTo(0.4, 6);
  });
});
