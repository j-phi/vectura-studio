const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Universal preset SAVE: the dirty-state save pip + Save Preset modal that lets
 * a user snapshot the current params as a user preset across any algorithm.
 * Covers pip visibility, the modal + auto-name, save-as-new, the overwrite vs.
 * save-as-new fork, Undo, and the Cmd/Ctrl+S accelerator.
 */
describe('Universal preset save (save pip + modal)', () => {
  let runtime, window, document, app;

  const pip = () => document.querySelector('.hg-preset-save-pip');
  const modal = () => document.querySelector('.vectura-modal');
  const nameInput = () => document.getElementById('preset-save-name');
  const triggerLabel = () => document.querySelector('.hg-preset-trigger-label').textContent.trim();
  const userPresets = (sys) => JSON.parse(window.localStorage.getItem(`vectura.user_presets.${sys}`) || '[]');

  const mount = async (layerType) => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.localStorage.clear();
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer(layerType);
    app.ui.renderLayers();
    app.ui.buildControls();
  };

  const diverge = (key, delta = 5) => {
    const layer = app.engine.getActiveLayer();
    layer.params[key] = (layer.params[key] || 0) + delta;
    app.regen();
  };

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('save pip is hidden on a clean named preset and appears when the layer diverges', async () => {
    await mount('lissajous');
    expect(pip()).toBeTruthy();
    expect(pip().hidden).toBe(true);

    diverge('freqX');
    expect(pip().hidden).toBe(false);

    // Reverting flips it back off.
    const layer = app.engine.getActiveLayer();
    layer.params.freqX -= 5;
    app.regen();
    expect(pip().hidden).toBe(true);
  });

  test('clicking the pip opens the Save modal with a pre-filled auto-name', async () => {
    await mount('lissajous');
    diverge('freqX');
    pip().click();
    expect(modal()).toBeTruthy();
    expect(nameInput()).toBeTruthy();
    expect(nameInput().value).toContain('Lissajous');
  });

  test('Save as new creates a User preset, marks the layer clean, and hides the pip', async () => {
    await mount('lissajous');
    diverge('freqX');
    pip().click();
    nameInput().value = 'My Test Look';
    document.querySelector('.preset-save-confirm').click();

    const saved = userPresets('lissajous');
    expect(saved.length).toBe(1);
    expect(saved[0].name).toBe('My Test Look');
    expect(saved[0].group).toBe('User');
    // transform/seed stripped from saved params.
    expect('posX' in saved[0].params).toBe(false);
    expect('seed' in saved[0].params).toBe(false);

    const layer = app.engine.getActiveLayer();
    expect(layer.params.preset).toBe(saved[0].id);
    expect(triggerLabel()).toBe('My Test Look');
    expect(pip().hidden).toBe(true);
  });

  test('origin = built-in preset offers an Update fork', async () => {
    await mount('flowfield');
    document.querySelector('.hg-preset-option[data-preset-id="flowfield-storm-cell"]').click();
    diverge('density', 137);
    pip().click();
    expect(modal()).toBeTruthy();
    // Built-in origin now shows the Update fork (same as user-origin).
    expect(document.querySelector('.preset-save-seg')).toBeTruthy();
    expect(document.querySelector('.seg-opt[data-mode="update"]')).toBeTruthy();
  });

  test('overwriting a built-in preset shadows it in localStorage under the same id', async () => {
    await mount('lissajous');
    const layer = app.engine.getActiveLayer();
    expect(layer.params.preset).toBe('lissajous-default');

    diverge('freqX');
    pip().click();
    document.querySelector('.preset-save-seg .seg-opt[data-mode="update"]').click();
    document.querySelector('.preset-save-confirm').click();
    // Confirm the destructive overwrite dialog.
    document.querySelector('.vectura-dialog-footer .hdr-btn.is-danger').click();

    const saved = userPresets('lissajous');
    const overwritten = saved.find((p) => p.id === 'lissajous-default');
    expect(overwritten).toBeTruthy();
    expect(overwritten.params.freqX).toBe(layer.params.freqX);
    expect(layer.params.preset).toBe('lissajous-default');
    expect(pip().hidden).toBe(true);
  });

  test('origin = user preset offers an Update fork that rewrites the preset in place', async () => {
    await mount('lissajous');
    // First create a user preset and land on it.
    diverge('freqX');
    pip().click();
    nameInput().value = 'Base Look';
    document.querySelector('.preset-save-confirm').click();
    const baseId = userPresets('lissajous')[0].id;
    expect(app.engine.getActiveLayer().params.preset).toBe(baseId);

    // Now edit away from it and Update in place.
    diverge('freqY', 7);
    pip().click();
    expect(document.querySelector('.preset-save-seg')).toBeTruthy();
    // Switch to Update mode.
    document.querySelector('.preset-save-seg .seg-opt[data-mode="update"]').click();
    document.querySelector('.preset-save-confirm').click();
    // Destructive confirm dialog.
    document.querySelector('.vectura-dialog-footer .hdr-btn.is-danger').click();

    const saved = userPresets('lissajous');
    expect(saved.length).toBe(1); // updated in place, not duplicated
    expect(saved[0].id).toBe(baseId);
    expect(saved[0].params.freqY).toBe(app.engine.getActiveLayer().params.freqY);
    expect(app.engine.getActiveLayer().params.preset).toBe(baseId);
  });

  test('the success toast Undo removes the just-saved preset and restores the prior marker', async () => {
    await mount('lissajous');
    const prevPreset = app.engine.getActiveLayer().params.preset; // lissajous-default
    diverge('freqX');
    pip().click();
    nameInput().value = 'Throwaway';
    document.querySelector('.preset-save-confirm').click();
    expect(userPresets('lissajous').length).toBe(1);

    const toast = document.querySelector('.vectura-toast');
    expect(toast).toBeTruthy();
    toast.click(); // onClick === undo

    expect(userPresets('lissajous').length).toBe(0);
    expect(app.engine.getActiveLayer().params.preset).toBe(prevPreset);
  });

  test('a fresh layer auto-applies a user-overridden default preset on gallery init', async () => {
    await mount('lissajous');
    const factoryFreqX = app.engine.getActiveLayer().params.freqX;

    // Overwrite the built-in Default with a modified freqX.
    diverge('freqX');
    const savedFreqX = app.engine.getActiveLayer().params.freqX;
    pip().click();
    document.querySelector('.preset-save-seg .seg-opt[data-mode="update"]').click();
    document.querySelector('.preset-save-confirm').click();
    document.querySelector('.vectura-dialog-footer .hdr-btn.is-danger').click();
    expect(userPresets('lissajous').find((p) => p.id === 'lissajous-default')).toBeTruthy();

    // Add a brand-new layer (simulates adding a layer after a hard refresh).
    app.engine.addLayer('lissajous');
    app.ui.renderLayers();
    app.ui.buildControls();

    const newLayer = app.engine.getActiveLayer();
    // The gallery auto-apply should have merged the saved Default params.
    expect(newLayer.params.freqX).not.toBe(factoryFreqX);
    expect(newLayer.params.freqX).toBe(savedFreqX);
    // Pip must be hidden — the layer matches its named preset.
    expect(pip().hidden).toBe(true);
  });

  test('Cmd/Ctrl+S opens the modal only when the layer is dirty', async () => {
    await mount('lissajous');
    const container = document.getElementById('dynamic-controls');
    // Dispatch from a control input inside the panel — the realistic focus path.
    // When clean, the global "Save Project" handler bails on input targets, so
    // Cmd+S is a true no-op here rather than reaching the project-save action.
    const source = container.querySelector('input') || container;
    const press = () => {
      const e = new window.KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true });
      source.dispatchEvent(e);
    };

    // Clean → no modal.
    press();
    expect(modal()).toBeNull();

    // Dirty → modal opens.
    diverge('freqX');
    press();
    expect(modal()).toBeTruthy();
  });
});
