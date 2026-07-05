/*
 * COL-3 (Illustrator Tools Parity, Phase 1 Lane D) — reusable pen chip.
 *
 * The Task Bar (Phase 2, TB-4/5/7) hosts a pen chip showing the selection's
 * current pen swatch — or an explicit `?` mixed badge when the selection
 * spans differing penIds (video f0186 / MSC-1) — and clicking it opens the
 * COL-1 popover anchored to the chip. This lane builds the chip as a
 * standalone component (Vectura.UI.PenPicker.createChip) integration-tested
 * here without the Task Bar.
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

describe('Pen chip (COL-3)', () => {
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

  const addTestLayer = () => {
    const id = app.engine.addLayer('wavetable');
    return app.engine.layers.find((l) => l.id === id);
  };

  const closePopover = () => window.Vectura.UI.PenPicker?.close?.();

  test('createChip returns a standalone button component with a refresh() method', () => {
    resetPens();
    const chip = window.Vectura.UI.PenPicker.createChip({});
    expect(chip).toBeTruthy();
    expect(chip.tagName).toBe('BUTTON');
    expect(chip.classList.contains('pen-chip')).toBe(true);
    expect(typeof chip.refresh).toBe('function');
    expect(chip.querySelector('.pen-icon')).toBeTruthy();
  });

  test('single-pen selection: chip shows that pen\'s swatch, no mixed badge', () => {
    resetPens();
    const a = addTestLayer();
    const b = addTestLayer();
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [a, b], 'pen-2');

    const chip = window.Vectura.UI.PenPicker.createChip({
      getTargetLayerIds: () => [a.id, b.id],
    });
    document.body.appendChild(chip);
    const state = chip.refresh();

    expect(state.mixed).toBe(false);
    expect(state.penId).toBe('pen-2');
    expect(chip.classList.contains('mixed')).toBe(false);
    expect(chip.querySelector('.pen-icon').style.background).toBeTruthy();
    expect(chip.querySelector('.pen-chip-mixed').textContent).toBe('');
    chip.remove();
  });

  test('mixed-penId selection renders the explicit `?` mixed state (MSC-1 parity)', () => {
    resetPens();
    const a = addTestLayer();
    const b = addTestLayer();
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [a], 'pen-1');
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [b], 'pen-3');

    const chip = window.Vectura.UI.PenPicker.createChip({
      getTargetLayerIds: () => [a.id, b.id],
    });
    document.body.appendChild(chip);
    const state = chip.refresh();

    expect(state.mixed).toBe(true);
    expect(chip.classList.contains('mixed')).toBe(true);
    expect(chip.querySelector('.pen-chip-mixed').textContent).toBe('?');
    chip.remove();
  });

  test('clicking the chip opens the COL-1 popover anchored to it; clicking again closes', () => {
    resetPens();
    const layer = addTestLayer();
    const chip = window.Vectura.UI.PenPicker.createChip({
      getTargetLayerIds: () => [layer.id],
    });
    document.body.appendChild(chip);

    chip.click();
    expect(window.Vectura.UI.PenPicker.isOpen()).toBe(true);
    expect(document.querySelector('.pen-pick-pop')).toBeTruthy();

    chip.click();
    expect(window.Vectura.UI.PenPicker.isOpen()).toBe(false);
    expect(document.querySelector('.pen-pick-pop')).toBe(null);
    chip.remove();
  });

  test('applying a pen from the chip\'s popover unifies a mixed selection and the chip leaves the mixed state', () => {
    resetPens();
    const a = addTestLayer();
    const b = addTestLayer();
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [a], 'pen-1');
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [b], 'pen-3');

    const applied = [];
    const chip = window.Vectura.UI.PenPicker.createChip({
      getTargetLayerIds: () => [a.id, b.id],
      onApply: (pen) => applied.push(pen.id),
    });
    document.body.appendChild(chip);
    chip.refresh();
    expect(chip.classList.contains('mixed')).toBe(true);

    chip.click();
    document.querySelectorAll('.pen-pick-pop .pen-pick-row')[1].click(); // pen-2

    expect(a.penId).toBe('pen-2');
    expect(b.penId).toBe('pen-2');
    expect(applied).toEqual(['pen-2']);
    // Chip refreshed via the popover's onApply chain.
    expect(chip.classList.contains('mixed')).toBe(false);
    expect(chip.querySelector('.pen-chip-mixed').textContent).toBe('');

    closePopover();
    chip.remove();
  });

  test('chip without explicit ids tracks the current renderer selection', () => {
    resetPens();
    const a = addTestLayer();
    const b = addTestLayer();
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [a], 'pen-1');
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [b], 'pen-2');

    const chip = window.Vectura.UI.PenPicker.createChip({});
    document.body.appendChild(chip);

    app.renderer.setSelection([a.id], a.id);
    expect(chip.refresh().penId).toBe('pen-1');

    app.renderer.setSelection([a.id, b.id], a.id);
    expect(chip.refresh().mixed).toBe(true);
    chip.remove();
  });
});
