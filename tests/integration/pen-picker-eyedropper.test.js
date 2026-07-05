/*
 * COL-4 (Illustrator Tools Parity, Phase 1 Lane D) — eyedropper samples/
 * creates a matching PEN, never a bare hex.
 *
 * The popover's eyedropper samples the pen of a clicked canvas layer
 * (nearest-path via the renderer's existing findLayerAtPoint hit logic —
 * plotter semantics, not raster pixels):
 *   - layer carries a known penId            → that pen is re-applied
 *   - layer color matches a pen w/ tolerance → that pen is re-applied
 *   - novel color                            → New Pen tab opens PRE-FILLED
 *     with the sampled hex (user explicitly creates the pen; nothing is
 *     auto-created, no bare hex is ever written to a layer)
 *
 * The pointer plumbing (window-capture listener over the renderer canvas) is
 * a thin wrapper over PenPicker._sampleWorldPoint, which is exercised here
 * with real renderer hit-testing over generated layer geometry.
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

describe('Pen Picker eyedropper (COL-4)', () => {
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

  // A world point guaranteed to sit ON the layer's interaction geometry.
  const pointOnLayer = (layer) => {
    const paths = app.renderer.getInteractionPaths(layer);
    const poly = paths.find((p) => Array.isArray(p) && p.length >= 2);
    expect(poly).toBeTruthy();
    return { x: poly[0].x, y: poly[0].y };
  };

  const openPopoverFor = (layerIds) => {
    const anchor = document.createElement('button');
    document.body.appendChild(anchor);
    window.Vectura.UI.openPenPicker({ anchorEl: anchor, targetLayerIds: layerIds });
    return anchor;
  };

  const closePopover = () => window.Vectura.UI.PenPicker?.close?.();

  test('popover header exposes the eyedropper button with the config-driven title', () => {
    resetPens();
    const layer = addTestLayer();
    const anchor = openPopoverFor([layer.id]);
    const btn = document.querySelector('.pen-pick-pop .pen-pick-eyedropper');
    expect(btn).toBeTruthy();
    expect(btn.title).toBe(window.Vectura.UI_CONSTANTS.PEN_PICKER.LABELS.EYEDROPPER_TITLE);
    closePopover();
    anchor.remove();
  });

  test('sampling a layer with a known penId re-applies that pen to the targets — no duplicate pen created', () => {
    resetPens();
    const source = addTestLayer();
    const target = addTestLayer();
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [source], 'pen-3');
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [target], 'pen-1');
    // Keep the source ON TOP for the nearest-path hit, but sample its own point.
    const world = pointOnLayer(source);

    const anchor = openPopoverFor([target.id]);
    const result = window.Vectura.UI.PenPicker._sampleWorldPoint(world);

    expect(result.outcome).toBe('applied');
    expect(result.pen.id).toBe('pen-3');
    expect(target.penId).toBe('pen-3');
    expect(target.color).toBe('#93c5fd');
    expect(target.strokeWidth).toBe(0.8);
    expect(SETTINGS.pens.length).toBe(3); // no duplicate
    closePopover();
    anchor.remove();
  });

  test('sampling a layer whose color matches a pen within tolerance (no penId) re-applies that pen', () => {
    resetPens();
    const source = addTestLayer();
    const target = addTestLayer();
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [target], 'pen-1');
    // Orphan color: no penId, but case-variant of pen-2's color.
    source.penId = null;
    source.color = '#DBEAFE';
    // Sample the SOURCE's own geometry point; source must win the hit, so
    // move it to the top of the z-order (findLayerAtPoint scans reversed).
    app.engine.layers.splice(app.engine.layers.indexOf(source), 1);
    app.engine.layers.push(source);
    const world = pointOnLayer(source);

    const anchor = openPopoverFor([target.id]);
    const result = window.Vectura.UI.PenPicker._sampleWorldPoint(world);

    expect(result.outcome).toBe('applied');
    expect(result.pen.id).toBe('pen-2');
    expect(target.penId).toBe('pen-2');
    expect(SETTINGS.pens.length).toBe(3);
    closePopover();
    anchor.remove();
  });

  test('sampling a novel color opens New Pen PRE-FILLED with the hex — nothing auto-created, no bare hex written', () => {
    resetPens();
    const source = addTestLayer();
    const target = addTestLayer();
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [target], 'pen-1');
    source.penId = null;
    source.color = '#123456'; // matches no pen
    app.engine.layers.splice(app.engine.layers.indexOf(source), 1);
    app.engine.layers.push(source);
    const world = pointOnLayer(source);

    const anchor = openPopoverFor([target.id]);
    const result = window.Vectura.UI.PenPicker._sampleWorldPoint(world);

    expect(result.outcome).toBe('prefilled');
    expect(result.hex).toBe('#123456');
    const pop = document.querySelector('.pen-pick-pop');
    // New Pen tab active, hex field pre-filled.
    expect(pop.querySelector('.pen-pick-tab[data-tab="new"]').classList.contains('active')).toBe(true);
    expect(pop.querySelector('.color-modal-hex').value.toLowerCase()).toBe('123456');
    // Nothing was created or written.
    expect(SETTINGS.pens.length).toBe(3);
    expect(target.penId).toBe('pen-1');
    expect(target.color).toBe('#ffffff');
    closePopover();
    anchor.remove();
  });

  test('COL-4b: activating the eyedropper mounts the magnifier loupe and switches the canvas cursor to an eyedropper; toggling off removes both', () => {
    resetPens();
    const layer = addTestLayer();
    const anchor = openPopoverFor([layer.id]);
    const btn = document.querySelector('.pen-pick-pop .pen-pick-eyedropper');

    btn.click();
    const loupe = document.querySelector('.pen-loupe');
    expect(loupe).toBeTruthy();
    expect(loupe.querySelector('.pen-loupe-canvas')).toBeTruthy();
    expect(loupe.querySelector('.pen-loupe-reticle')).toBeTruthy();
    expect(app.renderer.canvas.classList.contains('pen-eyedropper-cursor')).toBe(true);

    btn.click(); // toggle off
    expect(document.querySelector('.pen-loupe')).toBe(null);
    expect(app.renderer.canvas.classList.contains('pen-eyedropper-cursor')).toBe(false);

    closePopover();
    anchor.remove();
  });

  test('COL-4b: moving over the canvas shows the loupe at the pointer with the would-be pick — pen name for a match, hex for a novel color; off-canvas hides it', () => {
    resetPens();
    const source = addTestLayer();
    const target = addTestLayer();
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [source], 'pen-3');
    const anchor = openPopoverFor([target.id]);
    document.querySelector('.pen-pick-pop .pen-pick-eyedropper').click();

    const canvas = app.renderer.canvas;
    const origHit = app.renderer.findLayerAtPoint;
    const origRect = canvas.getBoundingClientRect;
    app.renderer.findLayerAtPoint = () => source;
    canvas.getBoundingClientRect = () => ({
      left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600,
    });
    try {
      const move = (targetEl, x, y) => targetEl.dispatchEvent(
        new window.MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y }),
      );
      const loupe = document.querySelector('.pen-loupe');

      move(canvas, 400, 300);
      expect(loupe.classList.contains('visible')).toBe(true);
      expect(loupe.style.left).not.toBe('');
      expect(loupe.classList.contains('hit')).toBe(true);
      expect(loupe.style.getPropertyValue('--loupe-color')).toBe('#93c5fd');
      expect(loupe.querySelector('.pen-loupe-text').textContent).toBe('Pen 3');

      // Novel color → ring + hex label (what a click would prefill).
      source.penId = null;
      source.color = '#123456';
      move(canvas, 410, 310);
      expect(loupe.classList.contains('hit')).toBe(true);
      expect(loupe.style.getPropertyValue('--loupe-color')).toBe('#123456');
      expect(loupe.querySelector('.pen-loupe-text').textContent).toBe('#123456'.toUpperCase());

      // No hit → neutral ring, no label content.
      app.renderer.findLayerAtPoint = () => null;
      move(canvas, 420, 320);
      expect(loupe.classList.contains('hit')).toBe(false);
      expect(loupe.querySelector('.pen-loupe-text').textContent).toBe('');

      // Off-canvas → loupe hides.
      move(document.body, 10, 10);
      expect(loupe.classList.contains('visible')).toBe(false);
    } finally {
      app.renderer.findLayerAtPoint = origHit;
      canvas.getBoundingClientRect = origRect;
      closePopover();
      anchor.remove();
    }
  });

  test('COL-4b: closing the popover mid-sample removes the loupe and restores the canvas cursor', () => {
    resetPens();
    const layer = addTestLayer();
    const anchor = openPopoverFor([layer.id]);
    document.querySelector('.pen-pick-pop .pen-pick-eyedropper').click();
    expect(document.querySelector('.pen-loupe')).toBeTruthy();

    closePopover();
    expect(document.querySelector('.pen-loupe')).toBe(null);
    expect(app.renderer.canvas.classList.contains('pen-eyedropper-cursor')).toBe(false);
    anchor.remove();
  });

  test('sampling empty canvas is a no-op miss', () => {
    resetPens();
    const target = addTestLayer();
    window.Vectura.PensPanel.assignPenToLayers(SETTINGS.pens, [target], 'pen-1');
    const anchor = openPopoverFor([target.id]);

    const result = window.Vectura.UI.PenPicker._sampleWorldPoint({ x: 1e6, y: 1e6 });
    expect(result.outcome).toBe('miss');
    expect(target.penId).toBe('pen-1');
    expect(SETTINGS.pens.length).toBe(3);
    closePopover();
    anchor.remove();
  });
});
