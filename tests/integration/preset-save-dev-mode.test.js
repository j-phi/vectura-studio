const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

/*
 * Developer-mode preset authoring: when SETTINGS.devMode is on, the Save Preset
 * dialog gains (1) an "Overwrite existing" picker that can target ANY preset in
 * the library (including built-ins) and (2) a Category control that accepts an
 * existing group or a freshly-typed one. Overwriting a built-in writes a
 * localStorage entry under the built-in's id that shadows it (deduped in the
 * gallery). Non-dev behavior is covered by preset-save.test.js and must be
 * unaffected — these tests only assert the dev-only surface + semantics.
 */
describe('Preset save — developer mode (overwrite-any + categories)', () => {
  let runtime, window, document, app;

  const pip = () => document.querySelector('.hg-preset-save-pip');
  const modal = () => document.querySelector('.vectura-modal');
  const nameInput = () => document.getElementById('preset-save-name');
  const userPresets = (sys) => JSON.parse(window.localStorage.getItem(`vectura.user_presets.${sys}`) || '[]');
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const openPopover = () => document.querySelector('.hg-preset-trigger').click();
  const groupTitles = () => Array.from(document.querySelectorAll('.hg-preset-group-title')).map((e) => e.textContent.trim());

  const mount = async (layerType) => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.localStorage.clear();
    window.Vectura.SETTINGS.devMode = true; // turn ON developer mode
    window.app = new window.Vectura.App();
    app = window.app;
    app.engine.addLayer(layerType);
    app.ui.renderLayers();
    app.ui.buildControls();
  };

  const diverge = (key, delta = 137) => {
    const layer = app.engine.getActiveLayer();
    layer.params[key] = (layer.params[key] || 0) + delta;
    app.regen();
  };

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  test('dev mode adds the Category + Destination controls and an Overwrite picker that lists built-ins', async () => {
    await mount('flowfield');
    diverge('density');
    pip().click();
    expect(modal()).toBeTruthy();

    // Category + Destination controls are dev-only.
    expect(document.getElementById('preset-save-cat')).toBeTruthy();
    expect(document.getElementById('preset-save-dest')).toBeTruthy();

    // The Save-mode fork shows even though the origin is a built-in (non-dev
    // would offer Save-as-new only — see preset-save.test.js).
    const seg = document.querySelector('.preset-save-seg');
    expect(seg).toBeTruthy();
    seg.querySelector('.seg-opt[data-mode="update"]').click();

    const picker = document.getElementById('preset-save-target');
    expect(picker).toBeTruthy();
    expect(picker.hidden).toBe(false);
    const ids = Array.from(picker.querySelectorAll('option')).map((o) => o.value);
    expect(ids).toContain('flowfield-storm-cell'); // a curated built-in is targetable
  });

  test('save-as-new into a brand-new category persists the group and renders a new section', async () => {
    await mount('flowfield');
    diverge('density');
    pip().click();

    const cat = document.getElementById('preset-save-cat');
    cat.value = '__new__';
    fire(cat, 'change');
    const catNew = document.getElementById('preset-save-cat-new');
    expect(catNew.hidden).toBe(false);
    catNew.value = 'My Lab';
    fire(catNew, 'input');

    nameInput().value = 'Lab Rat';
    document.querySelector('.preset-save-confirm').click();

    const saved = userPresets('flowfield');
    expect(saved.length).toBe(1);
    expect(saved[0].name).toBe('Lab Rat');
    expect(saved[0].group).toBe('My Lab');

    // The custom category renders as its own group section in the gallery.
    openPopover();
    expect(groupTitles()).toContain('My Lab');
  });

  test('overwriting a built-in writes a shadow under its id and the gallery dedupes it', async () => {
    await mount('flowfield');
    // Land on a curated built-in, then edit away from it.
    document.querySelector('.hg-preset-option[data-preset-id="flowfield-storm-cell"]').click();
    diverge('density');
    const newDensity = app.engine.getActiveLayer().params.density;

    pip().click();
    document.querySelector('.preset-save-seg .seg-opt[data-mode="update"]').click();
    const picker = document.getElementById('preset-save-target');
    picker.value = 'flowfield-storm-cell';
    fire(picker, 'change');
    document.querySelector('.preset-save-confirm').click();
    // Destructive overwrite confirm.
    document.querySelector('.vectura-dialog-footer .hdr-btn.is-danger').click();

    // A localStorage entry now exists under the built-in's id, holding the edit.
    const saved = userPresets('flowfield');
    const shadow = saved.find((p) => p.id === 'flowfield-storm-cell');
    expect(shadow).toBeTruthy();
    expect(shadow.params.density).toBe(newDensity);

    // The gallery shows exactly one option for that id (override shadows built-in).
    openPopover();
    const opts = document.querySelectorAll('.hg-preset-option[data-preset-id="flowfield-storm-cell"]');
    expect(opts.length).toBe(1);
  });
});
