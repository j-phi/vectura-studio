const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const waitForUi = () => new Promise((resolve) => setTimeout(resolve, 80));

const makeDragEventFactory = (window) => (type, clientY = 0) => {
  const e = new window.Event(type, { bubbles: true, cancelable: true });
  e.dataTransfer = {
    effectAllowed: 'move',
    dropEffect: 'move',
    setData() {},
    getData() { return ''; },
    clearData() {},
  };
  Object.defineProperty(e, 'clientY', { value: clientY });
  return e;
};

describe('Layer mask-child exit via drag', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  // Helper: build a non-group mask source with two children.
  // Engine order (normalizeGroupOrder convention): [mc2, mc1, msrc]
  //   — children at lower indices, mask source after last descendant.
  // Panel visual order: msrc → mc1 → mc2 → [exit zone].
  const buildMaskGroup = (app, Layer) => {
    const msrc = new Layer('msrc', 'shape', 'Mask Source');
    msrc.parentId = null;
    msrc.mask = { enabled: true, sourceIds: [], mode: 'parent', hideLayer: false, invert: false, materialized: false };
    msrc.maskCapabilities = { canSource: true, reason: '', sourceType: 'closed-shape' };
    msrc.visible = true;
    msrc.params = msrc.params || {};
    msrc.params.curves = false;
    msrc.params.smoothing = 0;
    msrc.params.simplify = 0;

    const mc1 = new Layer('mc1', 'shape', 'Masked Child 1');
    mc1.parentId = msrc.id;
    mc1.visible = true;
    mc1.params = mc1.params || {};
    mc1.params.curves = false;
    mc1.params.smoothing = 0;
    mc1.params.simplify = 0;

    const mc2 = new Layer('mc2', 'shape', 'Masked Child 2');
    mc2.parentId = msrc.id;
    mc2.visible = true;
    mc2.params = mc2.params || {};
    mc2.params.curves = false;
    mc2.params.smoothing = 0;
    mc2.params.simplify = 0;

    // normalizeGroupOrder convention: children before parent.
    app.engine.layers = [mc1, mc2, msrc];
    return { msrc, mc1, mc2 };
  };

  test('exit-below: dragging a mask child to the exit zone below mask extracts it below the mask', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      useIndexHtml: true,
    });
    const { window } = runtime;
    const { Layer } = window.Vectura;
    window.app = new window.Vectura.App();
    await waitForUi();

    const app = window.app;
    const createDragEvent = makeDragEventFactory(window);
    const { msrc, mc1, mc2 } = buildMaskGroup(app, Layer);

    // RED: before fix, no exit zone exists for mask children.
    expect(mc1.parentId).toBe(msrc.id);

    app.ui.renderLayers();
    await waitForUi();

    const { document } = window;
    const mc1Card = document.querySelector('[data-lvl-id="mc1"]');
    const exitZone = document.querySelector(`[data-lvl-exit-group="${msrc.id}"]`);

    expect(mc1Card).toBeTruthy();
    expect(exitZone).toBeTruthy();
    expect(exitZone.dataset.lvlExitDir).toBe('below');

    // Simulate drag start on child card, then drop on exit zone.
    mc1Card.dispatchEvent(createDragEvent('dragstart'));
    exitZone.dispatchEvent(createDragEvent('drop'));

    // mc1 must be unparented.
    expect(mc1.parentId).toBeNull();

    // mc2 must still be inside msrc.
    expect(mc2.parentId).toBe(msrc.id);

    // Engine order: mc2 (child) → msrc (parent) → mc1 (extracted below).
    const engineOrder = app.engine.layers.map((l) => l.id);
    expect(engineOrder).toEqual([mc2.id, msrc.id, mc1.id]);
  });

  test('exit-above: dragging a mask child to the mask source top zone extracts it above the mask', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      useIndexHtml: true,
    });
    const { window } = runtime;
    const { Layer } = window.Vectura;
    window.app = new window.Vectura.App();
    await waitForUi();

    const app = window.app;
    const createDragEvent = makeDragEventFactory(window);
    const { msrc, mc1, mc2 } = buildMaskGroup(app, Layer);

    expect(mc1.parentId).toBe(msrc.id);

    app.ui.renderLayers();
    await waitForUi();

    const { document } = window;
    const mc1Card = document.querySelector('[data-lvl-id="mc1"]');
    const msrcCard = document.querySelector('[data-lvl-id="msrc"]');

    expect(mc1Card).toBeTruthy();
    expect(msrcCard).toBeTruthy();

    // Mock getBoundingClientRect so dragover computes pct < 0.2 (top zone).
    msrcCard.getBoundingClientRect = () => ({
      top: 0, left: 0, height: 100, width: 200, right: 200, bottom: 100,
    });

    // Simulate drag start on child, dragover top zone, then drop.
    mc1Card.dispatchEvent(createDragEvent('dragstart'));
    msrcCard.dispatchEvent(createDragEvent('dragover', 5));
    msrcCard.dispatchEvent(createDragEvent('drop', 5));

    // mc1 must be unparented.
    expect(mc1.parentId).toBeNull();

    // mc2 must still be inside msrc.
    expect(mc2.parentId).toBe(msrc.id);

    // Engine order: mc1 (extracted above) → mc2 (child) → msrc (parent).
    const engineOrder = app.engine.layers.map((l) => l.id);
    expect(engineOrder).toEqual([mc1.id, mc2.id, msrc.id]);
  });

  test('exit zone DOM exists below masked children', async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true,
      includeUi: true,
      includeApp: true,
      useIndexHtml: true,
    });
    const { window } = runtime;
    const { Layer } = window.Vectura;
    window.app = new window.Vectura.App();
    await waitForUi();

    const app = window.app;
    buildMaskGroup(app, Layer);

    app.ui.renderLayers();
    await waitForUi();

    const { document } = window;
    const exitZone = document.querySelector('[data-lvl-exit-group="msrc"]');

    expect(exitZone).toBeTruthy();
    expect(exitZone.dataset.lvlExitDir).toBe('below');
    expect(exitZone.classList.contains('lvl-grp-exit-zone')).toBe(true);
    expect(exitZone.classList.contains('lvl-grp-exit-zone--below')).toBe(true);
  });
});
