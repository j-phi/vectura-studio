const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const waitForUi = () => new Promise((resolve) => setTimeout(resolve, 80));

// Returns a factory bound to a jsdom window so dispatchEvent accepts the events.
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

describe('Layer group exit via drag', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  // Helper: build an expanded wavetable group directly in engine.layers.
  // Returns { wt, line1, line2 } — wt is the group, line1 and line2 are children.
  // Engine order after expandLayer is: [wt, line2, line1] (children reversed after group).
  // Panel visual order (top-to-bottom): wt header → line2 → line1.
  const buildExpandedGroup = (app, Layer) => {
    const wt = new Layer('wt', 'wavetable', 'Wavetable');
    wt.isGroup = true;
    wt.groupType = 'wavetable';
    wt.groupCollapsed = false;
    wt.type = 'group';
    wt.parentId = null;

    const line1 = new Layer('line1', 'shape', 'WT - Line 1');
    line1.parentId = wt.id;
    line1.params = line1.params || {};
    line1.params.curves = false;
    line1.params.smoothing = 0;
    line1.params.simplify = 0;

    const line2 = new Layer('line2', 'shape', 'WT - Line 2');
    line2.parentId = wt.id;
    line2.params = line2.params || {};
    line2.params.curves = false;
    line2.params.smoothing = 0;
    line2.params.simplify = 0;

    // Engine order that expandLayer produces (wt first, children reversed after it).
    app.engine.layers = [wt, line2, line1];
    return { wt, line1, line2 };
  };

  test('exit-below: dragging a child to the bottom exit zone extracts it below the group', async () => {
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
    const { wt, line1, line2 } = buildExpandedGroup(app, Layer);

    // RED: before fix, line1 stays inside the group or ends up above it.
    expect(line1.parentId).toBe(wt.id);

    // Build the layer panel DOM (creates drop zone handlers).
    app.ui.renderLayers();
    await waitForUi();

    // Find the child card and the bottom exit zone.
    const { document } = window;
    const line1Card = document.querySelector('[data-lvl-id="line1"]');
    const exitZone = document.querySelector('[data-lvl-exit-group]');

    expect(line1Card).toBeTruthy();
    expect(exitZone).toBeTruthy();
    expect(exitZone.dataset.lvlExitDir).toBe('below');

    // Simulate drag: set _lvlDRAG via dragstart on the child card.
    line1Card.dispatchEvent(createDragEvent('dragstart'));

    // Drop on the exit zone — should call _lvlDoExitGroup(line1, wt, 'below').
    exitZone.dispatchEvent(createDragEvent('drop'));

    // line1 must be unparented.
    expect(line1.parentId).toBeNull();

    // line2 must still be inside wt.
    expect(line2.parentId).toBe(wt.id);

    // Panel order must be: wt header → line2 (inside wt) → line1 (below group).
    const order = app.ui.layerListOrder;
    expect(order).toEqual([wt.id, line2.id, line1.id]);
  });

  test('exit-above: dragging a child to the group header top zone extracts it above the group', async () => {
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
    const { wt, line1, line2 } = buildExpandedGroup(app, Layer);

    expect(line1.parentId).toBe(wt.id);

    app.ui.renderLayers();
    await waitForUi();

    const { document } = window;
    const line1Card = document.querySelector('[data-lvl-id="line1"]');
    const grpHeader = document.querySelector('.lvl-grp-hdr[data-lvl-id="wt"]');

    expect(line1Card).toBeTruthy();
    expect(grpHeader).toBeTruthy();

    // Mock getBoundingClientRect so dragover computes pct < 0.35 (top zone).
    grpHeader.getBoundingClientRect = () => ({
      top: 0, left: 0, height: 100, width: 200, right: 200, bottom: 100,
    });

    // Simulate drag start on child card.
    line1Card.dispatchEvent(createDragEvent('dragstart'));

    // Dragover at top of group header (clientY=10, height=100 → pct=0.1 < 0.35).
    grpHeader.dispatchEvent(createDragEvent('dragover', 10));

    // Drop — zone class is 'lvl-drop-before', own child → _lvlDoExitGroup(line1, wt, 'above').
    grpHeader.dispatchEvent(createDragEvent('drop', 10));

    // line1 must be unparented.
    expect(line1.parentId).toBeNull();

    // line2 must still be inside wt.
    expect(line2.parentId).toBe(wt.id);

    // Panel order must be: line1 (above group) → wt header → line2 (inside wt).
    const order = app.ui.layerListOrder;
    expect(order).toEqual([line1.id, wt.id, line2.id]);
  });
});
