/*
 * COL-1/COL-3/COL-4 (Tools Parity, Phase 1 Lane D) — anchored
 * Pen Picker popover.
 *
 * Vectura's plotter-native translation of the video's Swatches/Mixer color
 * hub: colors are PENS ({id, name, color, width} in SETTINGS.pens), never
 * bare hexes — plot-order optimization groups strokes by layer.penId, so
 * every apply writes the full penId/color/strokeWidth triple via the shared
 * COL-2 helper (Vectura.PensPanel.assignPenToLayers).
 *
 * Covered here:
 *   COL-1 — popover opens anchored with Pens (default) + New Pen tabs;
 *     Pens tab lists SETTINGS.pens rows with `{name} — {HEX} — {width}{unit}`
 *     hover tooltips; clicking a row applies the triple immediately (no OK
 *     step) as ONE undoable step; New Pen reuses the extracted HSV+hex picker
 *     plus width + name fields; Add Pen creates a SETTINGS.pens entry and
 *     applies it; popover and docked Pens panel share SETTINGS.pens (both
 *     update immediately).
 *   COL-2 (integration side) — undo restores per-layer pen assignments.
 *
 * The module's <script> tag is added to index.html by the phase integrator
 * (this lane does not own index.html), so the runtime loads it explicitly
 * below, guarded against double-load for when the tag lands.
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const POPOVER_SRC = path.resolve(__dirname, '../../src/ui/panels/pen-picker-popover.js');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Pen Picker popover (COL-1)', () => {
  let runtime, window, document, app, SETTINGS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    if (!window.Vectura?.UI?.PenPicker) {
      window.eval(fs.readFileSync(POPOVER_SRC, 'utf8'));
    }
    app = new window.Vectura.App();
    window.app = app;
    SETTINGS = window.Vectura.SETTINGS;
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const resetPens = () => {
    SETTINGS.pens = [
      { id: 'pen-1', name: 'Pen 1', color: '#ffffff', width: 0.3 },
      { id: 'pen-2', name: 'Pen 2', color: '#dbeafe', width: 0.5 },
      { id: 'pen-3', name: 'Pen 3', color: '#93c5fd', width: 0.8 },
    ];
    app.ui.renderPens();
  };

  const closePopover = () => window.Vectura.UI.PenPicker?.close?.();

  const openFor = (layerIds, extra = {}) => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    const controller = window.Vectura.UI.openPenPicker({
      anchorEl: anchor,
      targetLayerIds: layerIds,
      ...extra,
    });
    return { anchor, controller };
  };

  const addTestLayer = () => {
    const id = app.engine.addLayer('wavetable');
    return app.engine.layers.find((l) => l.id === id);
  };

  test('public API is exposed: Vectura.UI.openPenPicker + PenPicker.{open,close,isOpen,createChip}', () => {
    const { UI } = window.Vectura;
    expect(typeof UI.openPenPicker).toBe('function');
    expect(typeof UI.PenPicker.open).toBe('function');
    expect(typeof UI.PenPicker.close).toBe('function');
    expect(typeof UI.PenPicker.isOpen).toBe('function');
    expect(typeof UI.PenPicker.createChip).toBe('function');
  });

  test('opens anchored with Pens tab default: one row per SETTINGS.pens entry, hover tooltip `{name} — {HEX} — {width}{unit}`', () => {
    resetPens();
    const layer = addTestLayer();
    const { anchor } = openFor([layer.id]);

    const pop = document.querySelector('.pen-pick-pop');
    expect(pop).toBeTruthy();
    expect(window.Vectura.UI.PenPicker.isOpen()).toBe(true);

    // Two-tab header, Pens active by default.
    const tabs = pop.querySelectorAll('.pen-pick-tab');
    expect(tabs.length).toBe(2);
    expect(pop.querySelector('.pen-pick-tab[data-tab="pens"]').classList.contains('active')).toBe(true);

    // One swatch row per pen, tooltip carries name — hex — width-in-doc-units.
    const rows = pop.querySelectorAll('.pen-pick-row');
    expect(rows.length).toBe(3);
    expect(rows[1].title).toBe('Pen 2 — #DBEAFE — 0.5mm');
    // Row surfaces reuse the Pens panel's swatch rendering (.pen-icon).
    expect(rows[0].querySelector('.pen-icon')).toBeTruthy();

    closePopover();
    expect(document.querySelector('.pen-pick-pop')).toBe(null);
    expect(window.Vectura.UI.PenPicker.isOpen()).toBe(false);
    anchor.remove();
  });

  test('clicking a Pens-tab row applies the FULL penId/color/strokeWidth triple immediately (no OK step) to all target layers', () => {
    resetPens();
    const a = addTestLayer();
    const b = addTestLayer();
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [a, b], 'pen-1');

    const applied = [];
    const { anchor } = openFor([a.id, b.id], { onApply: (pen) => applied.push(pen.id) });
    const rows = document.querySelectorAll('.pen-pick-pop .pen-pick-row');
    rows[1].click(); // pen-2

    [a, b].forEach((layer) => {
      expect(layer.penId).toBe('pen-2');
      expect(layer.color).toBe('#dbeafe');
      expect(layer.strokeWidth).toBe(0.5);
    });
    expect(applied).toEqual(['pen-2']);
    // Popover stays open (video parity: swatch hub persists across picks).
    expect(window.Vectura.UI.PenPicker.isOpen()).toBe(true);

    closePopover();
    anchor.remove();
  });

  test('an apply is ONE undoable step — undo restores each layer\'s prior pen assignment', () => {
    resetPens();
    const a = addTestLayer();
    const b = addTestLayer();
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [a], 'pen-1');
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [b], 'pen-3');
    app.pushHistory();

    const { anchor } = openFor([a.id, b.id]);
    document.querySelectorAll('.pen-pick-pop .pen-pick-row')[1].click(); // pen-2
    expect(a.penId).toBe('pen-2');
    expect(b.penId).toBe('pen-2');
    closePopover();
    anchor.remove();

    app.undo();
    const ra = app.engine.layers.find((l) => l.id === a.id);
    const rb = app.engine.layers.find((l) => l.id === b.id);
    expect(ra.penId).toBe('pen-1');
    expect(ra.color).toBe('#ffffff');
    expect(ra.strokeWidth).toBe(0.3);
    expect(rb.penId).toBe('pen-3');
    expect(rb.color).toBe('#93c5fd');
    expect(rb.strokeWidth).toBe(0.8);
  });

  test('New Pen tab hosts the shared HSV+hex picker plus width and name fields (name defaults to "Pen {n+1}")', () => {
    resetPens();
    const layer = addTestLayer();
    const { anchor } = openFor([layer.id]);
    const pop = document.querySelector('.pen-pick-pop');

    pop.querySelector('.pen-pick-tab[data-tab="new"]').click();
    expect(pop.querySelector('.pen-pick-tab[data-tab="new"]').classList.contains('active')).toBe(true);
    // Reused openColorModal machinery (createHsvHexPicker), not a rebuild.
    expect(pop.querySelector('.color-sv-canvas')).toBeTruthy();
    expect(pop.querySelector('.color-hue-canvas')).toBeTruthy();
    expect(pop.querySelector('.color-modal-hex')).toBeTruthy();
    // Width field mirrors the Pens panel slider range/step.
    const width = pop.querySelector('.pen-pick-width');
    expect(width).toBeTruthy();
    expect(width.min).toBe('0.05');
    expect(width.max).toBe('2');
    expect(width.step).toBe('0.05');
    // Name defaults to Pen {n+1} (3 pens → "Pen 4").
    expect(pop.querySelector('.pen-pick-name').value).toBe('Pen 4');

    closePopover();
    anchor.remove();
  });

  test('New Pen width readout is an editable numeric textbox kept in sync with the slider (docked Pens panel parity)', () => {
    resetPens();
    const layer = addTestLayer();
    const { anchor } = openFor([layer.id], { tab: 'new' });
    const pop = document.querySelector('.pen-pick-pop');
    const slider = pop.querySelector('.pen-pick-width');
    const field = pop.querySelector('.pen-pick-width-value');

    // Editable number input, not a read-only span, seeded from the slider.
    expect(field.tagName).toBe('INPUT');
    expect(field.type).toBe('number');
    expect(parseFloat(field.value)).toBeCloseTo(parseFloat(slider.value), 5);

    // Slider drag → textbox display follows.
    slider.value = '0.9';
    slider.dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(parseFloat(field.value)).toBeCloseTo(0.9, 5);

    // Typed value → slider follows.
    field.value = '1.25';
    field.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(parseFloat(slider.value)).toBeCloseTo(1.25, 5);

    // Out-of-range typed value clamps to [0.05, 2] and the display snaps to
    // the normalized value (number inputs do not auto-clamp their text).
    field.value = '9';
    field.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(parseFloat(slider.value)).toBeCloseTo(2, 5);
    expect(parseFloat(field.value)).toBeCloseTo(2, 5);

    // Garbage reverts to the slider's value instead of wedging the pair.
    field.value = '';
    field.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(parseFloat(field.value)).toBeCloseTo(2, 5);

    closePopover();
    anchor.remove();
  });

  test('Add Pen uses a width typed into the mixer textbox', () => {
    resetPens();
    const layer = addTestLayer();
    const { anchor } = openFor([layer.id], { tab: 'new' });
    const pop = document.querySelector('.pen-pick-pop');

    const field = pop.querySelector('.pen-pick-width-value');
    field.value = '1.15';
    field.dispatchEvent(new window.Event('change', { bubbles: true }));
    pop.querySelector('.pen-pick-add').click();

    const pen = SETTINGS.pens[SETTINGS.pens.length - 1];
    expect(pen.width).toBeCloseTo(1.15, 5);
    expect(layer.strokeWidth).toBeCloseTo(1.15, 5);

    closePopover();
    anchor.remove();
  });

  test('REGRESSION: switching to New Pen re-sizes the mixer canvases that were 0×0 while the tab was display:none (blank wheel/hue strip)', async () => {
    resetPens();
    const layer = addTestLayer();
    const { anchor } = openFor([layer.id]); // Pens tab default → mixer hidden
    const pop = document.querySelector('.pen-pick-pop');
    const sv = pop.querySelector('.color-sv-canvas');
    const hue = pop.querySelector('.color-hue-canvas');

    // Let the picker's initial rAF sizing pass run while the tab is hidden —
    // in a real browser it measures offsetWidth 0 there, same as jsdom.
    await new Promise((resolve) => setTimeout(resolve, 30));

    // Once .hidden drops, a real browser measures true sizes — stand-in mocks.
    [[sv, 232, 174], [hue, 232, 12]].forEach(([canvas, w, h]) => {
      Object.defineProperty(canvas, 'offsetWidth', { value: w, configurable: true });
      Object.defineProperty(canvas, 'offsetHeight', { value: h, configurable: true });
    });

    pop.querySelector('.pen-pick-tab[data-tab="new"]').click();
    // Without the tab-show re-layout these stay 0×0 and the mixer is blank.
    expect(sv.width).toBe(232);
    expect(sv.height).toBe(174);
    expect(hue.width).toBe(232);
    expect(hue.height).toBe(12);

    closePopover();
    anchor.remove();
  });

  test('Add Pen creates a SETTINGS.pens entry with the chosen color/width/name and applies it immediately; docked panel updates', () => {
    resetPens();
    const layer = addTestLayer();
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [layer], 'pen-1');

    const { anchor } = openFor([layer.id]);
    const pop = document.querySelector('.pen-pick-pop');
    pop.querySelector('.pen-pick-tab[data-tab="new"]').click();

    const hexInput = pop.querySelector('.color-modal-hex');
    hexInput.value = '12ab34';
    hexInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    const widthInput = pop.querySelector('.pen-pick-width');
    widthInput.value = '1.25';
    widthInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    const nameInput = pop.querySelector('.pen-pick-name');
    nameInput.value = 'Signature';
    nameInput.dispatchEvent(new window.Event('input', { bubbles: true }));

    pop.querySelector('.pen-pick-add').click();

    expect(SETTINGS.pens.length).toBe(4);
    const pen = SETTINGS.pens[3];
    expect(pen.color).toBe('#12ab34');
    expect(pen.width).toBe(1.25);
    expect(pen.name).toBe('Signature');
    expect(pen.id).toBeTruthy();

    // Applied immediately — full triple.
    expect(layer.penId).toBe(pen.id);
    expect(layer.color).toBe('#12ab34');
    expect(layer.strokeWidth).toBe(1.25);

    // Docked Pens panel reflects the popover's change (single source of truth).
    expect(document.querySelectorAll('#pen-list .pen-item').length).toBe(4);

    closePopover();
    anchor.remove();
  });

  test('docked-panel changes propagate into an open popover (SETTINGS.pens is shared, no divergent copies)', async () => {
    resetPens();
    const layer = addTestLayer();
    const { anchor } = openFor([layer.id]);
    expect(document.querySelectorAll('.pen-pick-pop .pen-pick-row').length).toBe(3);

    app.ui.addPen();
    await tick();

    expect(document.querySelectorAll('.pen-pick-pop .pen-pick-row').length).toBe(4);

    closePopover();
    anchor.remove();
  });

  test('with no targetLayerIds the popover binds to the current renderer selection', () => {
    resetPens();
    const a = addTestLayer();
    const b = addTestLayer();
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [a, b], 'pen-1');
    app.renderer.setSelection([a.id, b.id], a.id);

    const { anchor } = openFor(undefined);
    document.querySelectorAll('.pen-pick-pop .pen-pick-row')[2].click(); // pen-3
    expect(a.penId).toBe('pen-3');
    expect(b.penId).toBe('pen-3');

    closePopover();
    anchor.remove();
  });

  // Pen models: the New Pen tab can create a model pen; the pens row chip
  // opens the model picker; the ink-settings popover edits pen.ink.
  describe('pen models', () => {
    const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
    const rowOf = (penId) => document.querySelector(`#pen-list .pen-item[data-pen-id="${penId}"]`);

    test('New Pen with a model: model + default size + laid width, applied in one step', () => {
      resetPens();
      const layer = addTestLayer();
      const { anchor } = openFor([layer.id], { tab: 'new' });
      const pop = document.querySelector('.pen-pick-pop');
      const sel = pop.querySelector('.pen-pick-model');
      expect(sel.value).toBe('plain');
      sel.value = 'sakura-pigma-micron';
      fire(sel, 'change');
      expect(parseFloat(pop.querySelector('.pen-pick-width-value').value)).toBeCloseTo(0.46, 5);
      const before = app.history.length;
      pop.querySelector('.pen-pick-add').click();
      const pen = SETTINGS.pens[SETTINGS.pens.length - 1];
      expect(pen).toMatchObject({ model: 'sakura-pigma-micron', size: '05', width: 0.46 });
      expect(layer.strokeWidth).toBeCloseTo(0.46, 5);
      expect(app.history.length).toBe(before + 1);
      closePopover();
      anchor.remove();
    });

    test('model picker: picking a model is one undo step and cascades the laid width; Plain clears it', () => {
      resetPens();
      const layer = addTestLayer();
      window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [layer], 'pen-2');
      app.ui.renderPens();
      rowOf('pen-2').querySelector('.pen-model-chip').click();
      const pop = document.querySelector('.ink-pop-models');
      expect(pop).toBeTruthy();
      const rows = Array.from(pop.querySelectorAll('.ink-model-row')).map((r) => r.dataset.modelId);
      expect(rows[0]).toBe('plain');
      expect(rows).toContain('sharpie-ultra-fine');
      // Search filters the list.
      const search = pop.querySelector('.ink-pop-search');
      search.value = 'sharpie';
      fire(search, 'input');
      expect(Array.from(pop.querySelectorAll('.ink-model-row')).map((r) => r.dataset.modelId)).toEqual(['sharpie-ultra-fine']);
      const before = app.history.length;
      pop.querySelector('.ink-model-row').click();
      expect(document.querySelector('.ink-pop')).toBeNull();
      const pen = SETTINGS.pens[1];
      expect(pen).toMatchObject({ model: 'sharpie-ultra-fine', size: 'Ultra Fine', width: 0.65 });
      expect(layer.strokeWidth).toBeCloseTo(0.65, 5);
      expect(app.history.length).toBe(before + 1);
      expect(rowOf('pen-2').querySelector('.pen-model-chip').textContent).toBe('Sharpie');
      app.undo();
      expect(SETTINGS.pens[1].model).toBeUndefined();
      expect(SETTINGS.pens[1].width).toBe(0.5);
      // Re-picking the current model is a no-op (no empty undo step).
      window.Vectura.PenModel.applyModel(SETTINGS.pens[1], 'sharpie-ultra-fine');
      app.ui.renderPens();
      rowOf('pen-2').querySelector('.pen-model-chip').click();
      const n = app.history.length;
      document.querySelector('.ink-model-row[data-model-id="sharpie-ultra-fine"]').click();
      expect(app.history.length).toBe(n);
      rowOf('pen-2').querySelector('.pen-model-chip').click();
      document.querySelector('.ink-model-row[data-model-id="plain"]').click();
      expect(SETTINGS.pens[1].model).toBeUndefined();
      expect(app.history.length).toBe(n + 1);
    });

    test('ink settings: no undo step on open / focus / no-op input; one per drag; reset to model defaults is one step', () => {
      resetPens();
      window.Vectura.PenModel.applyModel(SETTINGS.pens[0], 'pentel-sign-pen');
      app.ui.renderPens();
      const before = app.history.length;
      rowOf('pen-1').querySelector('.pen-ink-btn').click();
      const pop = document.querySelector('.ink-pop-settings');
      expect(pop).toBeTruthy();
      const slider = pop.querySelector('.ink-slider[data-key="wetness"]');
      fire(slider, 'focus');
      fire(slider, 'input'); // value unchanged: no-op
      expect(app.history.length).toBe(before);
      for (let i = 0; i < 20; i += 1) { slider.value = String(0.3 + i * 0.02); fire(slider, 'input'); }
      fire(slider, 'change');
      expect(app.history.length).toBe(before + 1);
      expect(SETTINGS.pens[0].ink.wetness).toBeCloseTo(0.68, 6);
      expect(rowOf('pen-1').querySelector('.pen-ink-btn').classList.contains('has-overrides')).toBe(true);
      // A second drag is a second step.
      slider.value = '0.9'; fire(slider, 'input'); fire(slider, 'change');
      expect(app.history.length).toBe(before + 2);
      const reset = document.querySelector('.ink-pop-settings .ink-reset');
      expect(reset.disabled).toBe(false);
      reset.click();
      expect(SETTINGS.pens[0].ink).toBeUndefined();
      expect(app.history.length).toBe(before + 3);
      expect(document.querySelector('.ink-pop-settings .ink-reset').disabled).toBe(true);
      // Size select in the popover writes the laid width (one step).
      window.Vectura.UI.InkSettings.close();
      window.Vectura.PenModel.applyModel(SETTINGS.pens[0], 'sakura-pigma-micron');
      app.ui.renderPens();
      rowOf('pen-1').querySelector('.pen-ink-btn').click();
      const size = document.querySelector('.ink-pop-settings .ink-size');
      size.value = '08';
      const n = app.history.length;
      fire(size, 'change');
      expect(SETTINGS.pens[0]).toMatchObject({ size: '08', width: 0.55 });
      expect(app.history.length).toBe(n + 1);
      window.Vectura.UI.InkSettings.close();
      expect(document.querySelector('.ink-pop')).toBeNull();
    });
  });
});
