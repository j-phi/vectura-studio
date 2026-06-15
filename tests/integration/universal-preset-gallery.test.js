const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * The universal preset gallery: the thumbnail dropdown that formerly served only
 * the harmonograph family now mounts for ANY algorithm whose preset library is
 * non-empty (dynamic mount keyed on PresetLibraries[layer.type]). These tests
 * prove (a) non-harmonograph algorithms render the gallery (not a <select>),
 * (b) clicking an option applies the preset params and preserves the layer's
 * transform, and (c) the previously <select>-driven systems (petalis/terrain)
 * now render the gallery too.
 */
describe('Universal preset gallery (all algorithms)', () => {
  let runtime, window, document, app;

  const wrap = () => document.querySelector('.hg-preset-dropdown-wrap');
  const groupTitles = () =>
    Array.from(document.querySelectorAll('.hg-preset-group-title')).map((el) => el.textContent.trim());
  const options = () =>
    Array.from(document.querySelectorAll('.hg-preset-option[data-preset-id]:not([data-preset-id="custom"])'));
  const card = (id) => document.querySelector(`.hg-preset-option[data-preset-id="${id}"]`);

  const mount = async (layerType) => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer(layerType);
    app.ui.renderLayers();
    app.ui.buildControls();
  };

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  // Every non-harmonograph algorithm that ships a library renders the gallery,
  // each option carries a thumbnail canvas, and the groups come from the
  // universal vocabulary (≥2 distinct groups per the design contract).
  // petalisDesigner is exercised at the data layer below — its inline petal
  // designer needs canvas measurement APIs jsdom doesn't provide, so a full
  // buildControls() mount isn't representable here. terrain covers the same
  // former-<select> → gallery migration through the full DOM path.
  const SYSTEMS = ['flowfield', 'lissajous', 'shapePack', 'rings', 'terrain'];
  for (const system of SYSTEMS) {
    test(`${system} renders the gallery (not a <select>) with grouped thumbnail options`, async () => {
      await mount(system);
      expect(wrap()).toBeTruthy();
      // The preset control is the gallery — there must be no raw <select> whose
      // first option is the "Custom" preset marker.
      const presetSelect = Array.from(document.querySelectorAll('#dynamic-controls select'))
        .find((sel) => Array.from(sel.options || []).some((o) => o.value === 'custom'));
      expect(presetSelect).toBeFalsy();
      const opts = options();
      expect(opts.length).toBeGreaterThanOrEqual(4);
      opts.forEach((o) => expect(o.querySelector('canvas.hg-preset-option-thumb')).toBeTruthy());
      expect(new Set(groupTitles()).size).toBeGreaterThanOrEqual(2);
    });
  }

  // A fresh layer must initialize on a named, selected, first-in-list preset —
  // never the unnamed "Custom" state. Covers both the reuse case (the default
  // equals a curated preset) and the synthetic "Default" case.
  const DEFAULT_PRESET = {
    flowfield: 'flowfield-default',
    lissajous: 'lissajous-default',
    shapePack: 'shapepack-default',
    rings: 'rings-default',
    terrain: 'terrain-default',
    wavetable: 'wavetable-rolling-hills', // default equals a curated preset (reused)
    topo: 'topo-mountain-range',
    phylla: 'phylla-sunflower',
  };
  for (const [system, expectedId] of Object.entries(DEFAULT_PRESET)) {
    test(`${system} initializes on its named default preset (${expectedId}) — selected + first`, async () => {
      await mount(system);
      expect(app.engine.getActiveLayer().params.preset).toBe(expectedId);
      const firstPreset = options()[0];
      expect(firstPreset.dataset.presetId).toBe(expectedId);
      expect(firstPreset.classList.contains('is-active')).toBe(true);
      // The trigger shows the named preset, not the "Custom" fallback label.
      expect(document.querySelector('.hg-preset-trigger-label').textContent.trim()).not.toBe('Custom');
    });
  }

  test('editing a param flips the trigger to Custom immediately (via regen, no rebuild); restoring it flips back', async () => {
    await mount('lissajous');
    const labelText = () => document.querySelector('.hg-preset-trigger-label').textContent.trim();
    expect(labelText()).toBe('Default'); // fresh layer is on lissajous-default

    const layer = app.engine.getActiveLayer();
    const original = layer.params.freqX;
    // Simulate a slider commit: mutate a param + regen (NO buildControls).
    layer.params.freqX = original + 5;
    app.regen();
    expect(labelText()).toBe('Custom');

    // Restoring the exact previous value flips back to the named preset.
    layer.params.freqX = original;
    app.regen();
    expect(labelText()).toBe('Default');
  });

  test('petalisDesigner is wired for the gallery (library + preset control present)', async () => {
    await mount('flowfield'); // any layer — we only need the loaded runtime globals
    const V = window.Vectura;
    // The library is keyed by layer type and non-empty → the dynamic mount fires.
    expect(Array.isArray(V.PresetLibraries.petalisDesigner)).toBe(true);
    expect(V.PresetLibraries.petalisDesigner.length).toBeGreaterThanOrEqual(4);
    // The control schema still carries a `preset` control for the gallery to intercept.
    const defs = V.UI.CONTROL_DEFS.petalisDesigner || [];
    expect(defs.some((d) => d && d.id === 'preset')).toBe(true);
    // ≥2 universal groups present in the petalisDesigner library.
    const groups = new Set(V.PresetLibraries.petalisDesigner.map((p) => p.group));
    expect(groups.size).toBeGreaterThanOrEqual(2);
  });

  test('clicking a non-harmonograph preset applies its params, preserves transform, sets preset id', async () => {
    await mount('lissajous');
    const layer = app.engine.getActiveLayer();
    // Stamp a distinctive transform the apply path must preserve.
    layer.params.posX = 77;
    layer.params.posY = -33;
    layer.params.rotation = 15;

    card('lissajous-clover').click();

    const after = app.engine.getActiveLayer().params;
    expect(after.preset).toBe('lissajous-clover');
    // Distinctive preset params merged in.
    expect(after.freqX).toBe(3);
    expect(after.freqY).toBe(5);
    // A defaults field the preset didn't set still comes through the base merge.
    expect(after.curves).toBe(true);
    // Transform preserved.
    expect(after.posX).toBe(77);
    expect(after.posY).toBe(-33);
    expect(after.rotation).toBe(15);
    // Active option highlighted after the rebuild.
    expect(card('lissajous-clover').classList.contains('is-active')).toBe(true);
  });

  test('rings preset apply preserves outerDiameter/centerDiameter (EXTRA_PRESERVED)', async () => {
    await mount('rings');
    const layer = app.engine.getActiveLayer();
    layer.params.outerDiameter = 99;
    layer.params.centerDiameter = 12;

    card('rings-fresh-cut').click();

    const after = app.engine.getActiveLayer().params;
    expect(after.preset).toBe('rings-fresh-cut');
    expect(after.rings).toBe(25); // preset value merged
    expect(after.outerDiameter).toBe(99); // physical size preserved
    expect(after.centerDiameter).toBe(12);
  });

  test('Custom is hidden while on a named preset, and appears (active) once the layer diverges', async () => {
    await mount('flowfield');
    // On the factory Default at mount → Custom row is not rendered.
    expect(card('custom')).toBeNull();
    card('flowfield-storm-cell').click();
    expect(app.engine.getActiveLayer().params.preset).toBe('flowfield-storm-cell');
    // Still on a named preset → Custom stays hidden.
    expect(card('custom')).toBeNull();

    // Diverge by editing a param away from the preset, then rebuild the panel.
    const layer = app.engine.getActiveLayer();
    layer.params.density = (layer.params.density || 0) + 137;
    app.ui.buildControls();

    // Now the layer no longer matches its preset → Custom appears and is active,
    // and no named preset is highlighted.
    expect(card('custom')).toBeTruthy();
    expect(card('custom').classList.contains('is-active')).toBe(true);
    expect(document.querySelector('.hg-preset-option:not([data-preset-id="custom"]).is-active')).toBeNull();
  });
});
