const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Shape layer curves toggle + direct handle edits', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    app = window.app = new window.Vectura.App();
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  function makePenLineLayer() {
    const { Layer } = window.Vectura;
    app.engine.layers = [];
    const layer = new Layer('pen-line', 'shape', 'Pen Path');
    layer.params.seed = 0;
    layer.params.posX = 0;
    layer.params.posY = 0;
    layer.params.scaleX = 1;
    layer.params.scaleY = 1;
    layer.params.rotation = 0;
    layer.params.smoothing = 0;
    layer.params.simplify = 0;
    layer.params.curves = false;

    const anchors = [
      { x: 20, y: 60, in: null, out: null },
      { x: 60, y: 20, in: null, out: null },   // interior apex
      { x: 100, y: 60, in: null, out: null },
    ];
    const path = anchors.map((a) => ({ x: a.x, y: a.y }));
    path.meta = { anchors, closed: false };
    layer.sourcePaths = [path];
    app.engine.layers.push(layer);
    app.engine.activeLayerId = layer.id;
    app.engine.generate(layer.id);
    return layer;
  }

  // RGR: this test fails before the fix that rebases originalAnchors in
  // _applySelectionPath, because applyShapeAnchorRebuild would replay the
  // initial null-handle snapshot and overwrite the user's handle drag.
  test('dragging a bezier handle on a pen line with curves=ON produces a curved render path', () => {
    const layer = makePenLineLayer();
    layer.params.curves = true;
    app.engine.generate(layer.id);

    // Simulate direct edit: pull the middle anchor's out handle far up-right
    // and mirror in across the anchor (the default non-alt drag behavior).
    app.renderer.setDirectSelection(layer, 0);
    const sel = app.renderer.directSelection;
    expect(sel).toBeTruthy();

    const middle = sel.anchors[1];
    middle.out = { x: middle.x + 30, y: middle.y - 30 };
    middle.in = { x: middle.x - 30, y: middle.y + 30 };

    app.renderer.applyDirectPath();

    const rendered = layer.sourcePaths[0];
    // The user's handles must survive the regen pass.
    expect(rendered.meta.anchors[1].out).not.toBeNull();
    expect(rendered.meta.anchors[1].in).not.toBeNull();
    // Handle offsets should remain "wide" (≥ 20 units in each axis) — not collapsed
    // to the TINY_HANDLE_LEN = 0.0001 fallback that applyShapeAnchorRebuild emits
    // when it rebuilds from a stale originalAnchors snapshot.
    const outOff = Math.hypot(
      rendered.meta.anchors[1].out.x - rendered.meta.anchors[1].x,
      rendered.meta.anchors[1].out.y - rendered.meta.anchors[1].y
    );
    expect(outOff).toBeGreaterThan(20);

    // The resampled polyline should curve past the apex, not pass through it
    // as two straight segments. Look at samples around the apex — the cubic with
    // wide handles pulls some samples above the apex (smaller y in screen coords).
    const apexX = middle.x;
    const apexNeighbors = rendered.filter((pt) => Math.abs(pt.x - apexX) < 15);
    expect(apexNeighbors.length).toBeGreaterThan(1);
    const minY = Math.min(...apexNeighbors.map((pt) => pt.y));
    // Straight-segment apex would put y at middle.y = 20. A curve with handles
    // pulled outward should dip noticeably below 20 near the apex.
    expect(minY).toBeLessThan(middle.y - 1);
  });

  test('toggling curves checkbox calls engine.generate (RGR proof for curves-toggle fix)', () => {
    const layer = makePenLineLayer();
    app.renderer.setSelection([layer.id], layer.id);
    app.ui.buildControls();

    const labels = Array.from(document.querySelectorAll('#dynamic-controls .control-label'));
    const curvesLabel = labels.find((el) => el.textContent.trim() === 'Curves');
    expect(curvesLabel).toBeTruthy();
    const wrapper = curvesLabel.closest('.mb-4');
    const checkbox = wrapper?.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();

    const origGenerate = app.engine.generate.bind(app.engine);
    const generatedIds = [];
    app.engine.generate = (id) => {
      generatedIds.push(id);
      return origGenerate(id);
    };

    try {
      checkbox.checked = true;
      checkbox.dispatchEvent(new window.Event('change', { bubbles: true }));
      expect(layer.params.curves).toBe(true);
      expect(generatedIds).toContain(layer.id);
    } finally {
      app.engine.generate = origGenerate;
    }
  });
});
