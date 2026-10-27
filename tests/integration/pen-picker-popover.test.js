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
      fire(slider, 'pointerdown');
      for (let i = 0; i < 20; i += 1) { slider.value = String(0.3 + i * 0.02); fire(slider, 'input'); }
      fire(slider, 'change');
      expect(app.history.length).toBe(before + 1);
      expect(SETTINGS.pens[0].ink.wetness).toBeCloseTo(0.68, 6);
      expect(rowOf('pen-1').querySelector('.pen-ink-btn').classList.contains('has-overrides')).toBe(true);
      // A second drag is a second step.
      fire(slider, 'pointerdown'); slider.value = '0.9'; fire(slider, 'input'); fire(slider, 'change');
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

    // Review item 7: arrow keys fire input+change on every press; a keyboard
    // session (until the slider loses focus) is ONE undo step.
    test('ink sliders: a keyboard session of arrow presses is one undo step', () => {
      resetPens();
      window.Vectura.PenModel.applyModel(SETTINGS.pens[0], 'pentel-sign-pen');
      app.ui.renderPens();
      rowOf('pen-1').querySelector('.pen-ink-btn').click();
      const slider = document.querySelector('.ink-pop-settings .ink-slider[data-key="wetness"]');
      slider.focus();
      const before = app.history.length;
      for (let i = 1; i <= 6; i += 1) {
        slider.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        slider.value = String(0.5 + i * 0.01); fire(slider, 'input'); fire(slider, 'change');
      }
      expect(app.history.length).toBe(before + 1);
      expect(SETTINGS.pens[0].ink.wetness).toBeCloseTo(0.56, 6);
      // Leaving the slider ends the session: the next arrow press is a new step.
      fire(slider, 'blur');
      slider.value = '0.6'; fire(slider, 'input'); fire(slider, 'change');
      expect(app.history.length).toBe(before + 2);
      app.undo();
      expect(SETTINGS.pens[0].ink.wetness).toBeCloseTo(0.56, 6);
      window.Vectura.UI.InkSettings.close();
    });

    // Review item 8: listbox keyboard model.
    test('model picker keyboard: aria-activedescendant follows ArrowUp/Down, Enter picks, Esc closes back to the chip', () => {
      resetPens();
      app.ui.renderPens();
      rowOf('pen-2').querySelector('.pen-model-chip').click();
      const pop = document.querySelector('.ink-pop-models');
      const search = pop.querySelector('.ink-pop-search');
      expect(document.activeElement).toBe(search);
      expect(search.getAttribute('role')).toBe('combobox');
      const listbox = document.getElementById(search.getAttribute('aria-controls'));
      expect(listbox.getAttribute('role')).toBe('listbox');
      const active = () => document.getElementById(search.getAttribute('aria-activedescendant'));
      expect(active().dataset.modelId).toBe('plain'); // the current model starts active
      const key = (k) => search.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      const ids = Array.from(pop.querySelectorAll('.ink-model-row')).map((r) => r.dataset.modelId);
      key('ArrowDown'); key('ArrowDown');
      expect(active().dataset.modelId).toBe(ids[2]);
      expect(active().classList.contains('kbd-active')).toBe(true);
      expect(active().getAttribute('role')).toBe('option');
      key('ArrowUp');
      expect(active().dataset.modelId).toBe(ids[1]);
      key('ArrowUp'); key('ArrowUp'); // clamps at the top
      expect(active().dataset.modelId).toBe('plain');
      key('End');
      expect(active().dataset.modelId).toBe(ids[ids.length - 1]);
      // Search narrows and re-targets the first match.
      search.value = 'micron'; fire(search, 'input');
      expect(active().dataset.modelId).toBe('sakura-pigma-micron');
      const before = app.history.length;
      key('Enter');
      expect(SETTINGS.pens[1].model).toBe('sakura-pigma-micron');
      expect(app.history.length).toBe(before + 1);
      expect(document.querySelector('.ink-pop')).toBeNull();
      expect(document.activeElement).toBe(rowOf('pen-2').querySelector('.pen-model-chip'));
      // Esc closes without a change and returns focus to the chip.
      rowOf('pen-2').querySelector('.pen-model-chip').click();
      const n = app.history.length;
      document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(document.querySelector('.ink-pop')).toBeNull();
      expect(app.history.length).toBe(n);
      expect(document.activeElement).toBe(rowOf('pen-2').querySelector('.pen-model-chip'));
    });

    // Review item 9: focus survives the pens-list re-render and stays trapped.
    test('ink settings: Reset then Esc returns focus to the re-rendered row button; Tab is trapped in the popover', () => {
      resetPens();
      window.Vectura.PenModel.applyModel(SETTINGS.pens[0], 'pentel-sign-pen');
      SETTINGS.pens[0].ink = { wetness: 0.9 };
      app.ui.renderPens();
      const oldBtn = rowOf('pen-1').querySelector('.pen-ink-btn');
      oldBtn.click();
      const reset = document.querySelector('.ink-pop-settings .ink-reset');
      reset.focus();
      reset.click();
      expect(SETTINGS.pens[0].ink).toBeUndefined();
      // Reset disables itself: focus moved to a live control inside the popover, not <body>.
      const pop = document.querySelector('.ink-pop-settings');
      expect(pop.contains(document.activeElement)).toBe(true);
      // Tab from the last focusable wraps to the first; Shift+Tab wraps back.
      const focusables = Array.from(pop.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]'));
      expect(focusables.length).toBeGreaterThan(2);
      focusables[focusables.length - 1].focus();
      document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(focusables[0]);
      document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(focusables[focusables.length - 1]);
      document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(document.querySelector('.ink-pop')).toBeNull();
      const btn = rowOf('pen-1').querySelector('.pen-ink-btn');
      expect(btn.isConnected).toBe(true);
      expect(document.activeElement).toBe(btn);
      expect(document.activeElement).not.toBe(document.body);
    });

    // Review item 5: dye inks on dark stock are faint but visible, and say so.
    test('ink settings on dark stock: a dye pen shows the "barely visible" hint; an opaque gel does not', () => {
      resetPens();
      const P = window.Vectura.Paper;
      const prev = P.effective();
      P.setActive(P.forType('black'));
      try {
        window.Vectura.PenModel.applyModel(SETTINGS.pens[0], 'sharpie-ultra-fine');
        window.Vectura.PenModel.applyModel(SETTINGS.pens[1], 'uniball-signo-broad-um153');
        app.ui.renderPens();
        rowOf('pen-1').querySelector('.pen-ink-btn').click();
        const warn = document.querySelector('.ink-pop-settings .ink-note-warn');
        expect(warn).toBeTruthy();
        expect(warn.textContent).toMatch(/barely visible on dark paper/i);
        window.Vectura.UI.InkSettings.close();
        rowOf('pen-2').querySelector('.pen-ink-btn').click();
        expect(document.querySelector('.ink-pop-settings .ink-note-warn')).toBeNull();
        window.Vectura.UI.InkSettings.close();
      } finally {
        P.setActive(prev);
      }
    });

    // ---- Special inks + pen files + My pens --------------------------------
    test('special inks strip: one undo step per pick on any pen; effect sliders only while an effect is set', () => {
      resetPens();
      const layer = addTestLayer();
      window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [layer], 'pen-2');
      app.ui.renderPens();
      rowOf('pen-2').querySelector('.pen-ink-btn').click();
      let pop = document.querySelector('.ink-pop-settings');
      expect(pop.querySelectorAll('.fx-swatch[data-swatch-id]').length).toBeGreaterThanOrEqual(17);
      expect(pop.querySelector('.ink-slider[data-key="effectStrength"]')).toBeNull();
      app.history.length = 0; // under the history cap, so +1 is observable
      const before = app.history.length;
      pop.querySelector('.fx-swatch[data-swatch-id="metallic-gold"]').click();
      expect(SETTINGS.pens[1]).toMatchObject({ color: '#c9a24a', effect: 'metallic' });
      expect(SETTINGS.pens[1].model).toBeUndefined(); // a plain pen keeps being plain
      expect(layer.color).toBe('#c9a24a');
      expect(app.history.length).toBe(before + 1);
      pop = document.querySelector('.ink-pop-settings');
      expect(pop.querySelector('.fx-swatch[data-swatch-id="metallic-gold"]').getAttribute('aria-pressed')).toBe('true');
      expect(pop.querySelector('.ink-slider[data-key="effectStrength"]')).toBeTruthy();
      expect(pop.querySelector('.ink-slider[data-key="flakeDensity"]')).toBeTruthy();
      // One undo step per strength drag.
      const strength = pop.querySelector('.ink-slider[data-key="effectStrength"]');
      fire(strength, 'pointerdown');
      [0.5, 0.4, 0.3].forEach((v) => { strength.value = String(v); fire(strength, 'input'); });
      fire(strength, 'change');
      expect(SETTINGS.pens[1].ink.effectStrength).toBeCloseTo(0.3, 6);
      expect(app.history.length).toBe(before + 2);
      // Opaque white: no flakes, so no flake slider.
      pop.querySelector('.fx-swatch[data-swatch-id="opaque-white"]').click();
      pop = document.querySelector('.ink-pop-settings');
      expect(pop.querySelector('.ink-slider[data-key="flakeDensity"]')).toBeNull();
      expect(app.history.length).toBe(before + 3);
      // "No special ink" clears the effect only (one step).
      pop.querySelector('.fx-swatch.fx-none').click();
      expect(SETTINGS.pens[1].effect).toBeUndefined();
      expect(SETTINGS.pens[1].color).toBe('#f7f7f4');
      expect(app.history.length).toBe(before + 4);
      window.Vectura.UI.InkSettings.close();
    });

    test("special inks: 'No special ink' switches a model's built-in effect off (explicit 'plain'), pressed state follows", () => {
      resetPens();
      window.Vectura.PenModel.applyModel(SETTINGS.pens[0], 'sakura-gelly-roll-metallic');
      app.ui.renderPens();
      rowOf('pen-1').querySelector('.pen-ink-btn').click();
      let pop = document.querySelector('.ink-pop-settings');
      expect(pop.querySelector('.fx-swatch.fx-none').getAttribute('aria-pressed')).toBe('false');
      let pushes = 0;
      const push = app.pushHistory;
      app.pushHistory = function countedPush(...args) { pushes += 1; return push.apply(this, args); };
      try { pop.querySelector('.fx-swatch.fx-none').click(); } finally { app.pushHistory = push; }
      expect(pushes).toBe(1);
      expect(SETTINGS.pens[0]).toMatchObject({ model: 'sakura-gelly-roll-metallic', effect: 'plain' });
      pop = document.querySelector('.ink-pop-settings');
      expect(pop.querySelector('.fx-swatch.fx-none').getAttribute('aria-pressed')).toBe('true');
      expect(pop.querySelector('.ink-slider[data-key="effectStrength"]')).toBeNull();
      window.Vectura.UI.InkSettings.close();
    });

    test('New Pen: a Special inks pick becomes the new pen\'s effect (the mixer colour stays the pen colour)', () => {
      resetPens();
      const layer = addTestLayer();
      const { anchor } = openFor([layer.id], { tab: 'new' });
      const pop = document.querySelector('.pen-pick-pop');
      pop.querySelector('.pen-pick-fx .fx-swatch[data-swatch-id="glow-aqua"]').click();
      expect(pop.querySelector('.color-modal-hex').value.toLowerCase()).toContain('e2f0ee');
      app.history.length = 0; // under the history cap, so +1 is observable
      const before = app.history.length;
      pop.querySelector('.pen-pick-add').click();
      const pen = SETTINGS.pens[SETTINGS.pens.length - 1];
      expect(pen).toMatchObject({ effect: 'glow', color2: '#5ae0ff', color: '#e2f0ee' });
      expect(app.history.length).toBe(before + 1);
      closePopover();
      anchor.remove();
    });

    test('pen files: Pens ⋯ ▸ Export pens downloads a vectura-pens file; importing it adds new pens in one undo step', async () => {
      resetPens();
      SETTINGS.pens[0].effect = 'metallic';
      const saved = [];
      const D = window.Vectura.Download;
      const prevSave = D.saveBlob;
      D.saveBlob = (blob, name) => { saved.push({ blob, name }); };
      try {
        document.getElementById('btn-pens-menu').click();
        const exportItem = Array.from(document.querySelectorAll('.pens-menu [role="menuitem"]')).find((el) => /Export pens/.test(el.textContent));
        expect(exportItem).toBeTruthy();
        exportItem.click();
      } finally { D.saveBlob = prevSave; }
      expect(saved).toHaveLength(1);
      expect(saved[0].name).toBe('vectura-pens.json');
      const text = await new Promise((resolve) => { const fr = new window.FileReader(); fr.onload = () => resolve(String(fr.result)); fr.readAsText(saved[0].blob); });
      const doc = JSON.parse(text);
      expect(doc).toMatchObject({ schema: 'vectura-pens', version: 1 });
      expect(doc.pens).toHaveLength(3);
      expect(doc.pens[0]).toMatchObject({ name: 'Pen 1', effect: 'metallic' });
      // Import (the file input path reads the same text): one undo step
      // (counted at pushHistory: the history array may sit at its cap).
      let pushes = 0;
      const push = app.pushHistory;
      app.pushHistory = function countedPush(...args) { pushes += 1; return push.apply(this, args); };
      let res;
      try { res = window.Vectura.UI.InkSettings.importPensText(app, text); } finally { app.pushHistory = push; }
      expect(res.ok).toBe(true);
      expect(SETTINGS.pens).toHaveLength(6);
      const ids = SETTINGS.pens.map((p) => p.id);
      expect(new Set(ids).size).toBe(6);
      expect(pushes).toBe(1);
      expect(document.querySelectorAll('#pen-list .pen-item')).toHaveLength(6);
      app.undo();
      expect(SETTINGS.pens).toHaveLength(3);
      // The file input route (size cap first).
      const input = document.getElementById('inp-pens-import');
      expect(input && input.accept).toMatch(/json/);
      const big = await window.Vectura.UI.InkSettings.importPensFile(app, { size: 300 * 1024, text: async () => text });
      expect(big.reason).toBe('too-large');
      const viaFile = await window.Vectura.UI.InkSettings.importPensFile(app, { size: text.length, text: async () => text });
      expect(viaFile.ok).toBe(true);
      expect(SETTINGS.pens).toHaveLength(6);
      // A newer pens file is refused with a message, nothing changes.
      const n = app.history.length;
      const future = window.Vectura.UI.InkSettings.importPensText(app, JSON.stringify({ ...doc, version: 2 }));
      expect(future).toMatchObject({ ok: false, reason: 'version' });
      expect(SETTINGS.pens).toHaveLength(6);
      expect(app.history.length).toBe(n);
    });

    test('pen files: hostile pen names import as text — no markup reaches the pens panel', () => {
      resetPens();
      const evil = JSON.stringify({ schema: 'vectura-pens', version: 1, pens: [
        { name: '<img src=x onerror="window.__pwned=1">', color: '#123456', width: 0.4 },
        { name: '"><style>*{display:none}</style>', color: '#654321', width: 0.4, effect: 'glitter' },
      ] });
      const res = window.Vectura.UI.InkSettings.importPensText(app, evil);
      expect(res.ok).toBe(true);
      const list = document.getElementById('pen-list');
      expect(list.querySelector('img')).toBeNull();
      expect(list.querySelector('style')).toBeNull();
      expect(window.__pwned).toBeUndefined();
      const names = Array.from(list.querySelectorAll('.pen-name-input')).map((i) => i.value);
      expect(names).toContain('<img src=x onerror="window.__pwned=1">');
    });

    test('My pens: save from Ink settings, listed first in the model picker, apply (one step), rename / delete / add', async () => {
      resetPens();
      window.localStorage.removeItem(window.Vectura.PEN_MODELS.LIBRARY_KEY);
      const O = window.Vectura.UI.overlays;
      const prevPrompt = O.Prompt.show;
      const prevDialog = O.Dialog;
      const answers = ['My gold', 'Gold renamed'];
      O.Prompt.show = () => Promise.resolve(answers.shift());
      O.Dialog = (_host, props) => ({ open: () => props.onConfirm() });
      try {
        window.Vectura.PenModel.applyEffectSwatch(SETTINGS.pens[0], window.Vectura.PenModel.swatchById('metallic-gold'));
        app.ui.renderPens();
        rowOf('pen-1').querySelector('.pen-ink-btn').click();
        document.querySelector('.ink-pop-settings .ink-save-lib').click();
        await tick(); await tick();
        const lib = window.Vectura.PenLibrary.library();
        expect(lib.list().map((e) => e.name)).toEqual(['My gold']);
        window.Vectura.UI.InkSettings.close();
        // Model picker: My pens group first; picking applies the saved ink to pen 3.
        rowOf('pen-3').querySelector('.pen-model-chip').click();
        const rows = Array.from(document.querySelectorAll('.ink-pop-models .ink-model-row'));
        expect(rows[0].classList.contains('ink-library-row')).toBe(true);
        expect(document.querySelector('.ink-pop-models .ink-model-group').textContent).toBe('My pens');
        app.history.length = 0; // under the history cap, so +1 is observable
        const before = app.history.length;
        rows[0].click();
        expect(SETTINGS.pens[2]).toMatchObject({ id: 'pen-3', name: 'Pen 3', color: '#c9a24a', effect: 'metallic' });
        expect(app.history.length).toBe(before + 1);
        // My pens popover from the Pens ⋯ menu: rename, add to document, delete.
        window.Vectura.UI.InkSettings.openMyPens({ anchorEl: document.getElementById('btn-pens-menu'), app });
        let pop = document.querySelector('.ink-pop-library');
        pop.querySelector('.ink-lib-btn[data-act="rename"]').click();
        await tick(); await tick();
        expect(lib.list()[0].name).toBe('Gold renamed');
        pop = document.querySelector('.ink-pop-library');
        const n = SETTINGS.pens.length;
        pop.querySelector('.ink-lib-btn[data-act="add"]').click();
        expect(SETTINGS.pens).toHaveLength(n + 1);
        expect(SETTINGS.pens[n]).toMatchObject({ name: 'Gold renamed', effect: 'metallic' });
        expect(['pen-1', 'pen-2', 'pen-3']).not.toContain(SETTINGS.pens[n].id);
        document.querySelector('.ink-pop-library .ink-lib-btn[data-act="delete"]').click();
        expect(lib.list()).toEqual([]);
        expect(document.querySelector('.ink-pop-library .ink-model-empty')).toBeTruthy();
        window.Vectura.UI.InkSettings.close();
      } finally {
        O.Prompt.show = prevPrompt;
        O.Dialog = prevDialog;
      }
    });
  });
});
