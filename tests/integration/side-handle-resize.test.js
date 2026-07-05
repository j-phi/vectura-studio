/**
 * SEL-1 (integration): dragging an edge-midpoint handle resizes the selection
 * along that axis only; Shift constrains proportions; the W×H tooltip shows.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('SEL-1: edge-midpoint handle drag resizes one axis only', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  async function setupSquare() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const square = new Layer('sq-1', 'shape', 'Square');
    square.sourcePaths = [[
      { x: 40, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 80 }, { x: 40, y: 80 }, { x: 40, y: 40 },
    ]];
    engine.layers.push(square);
    engine.generate(square.id);
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1;
    renderer.offsetX = 0;
    renderer.offsetY = 0;
    renderer.setSelection([square.id], square.id);
    return { renderer, square };
  }

  const measure = (renderer, layer) => {
    const b = renderer.getSelectionBounds([layer]);
    return { w: b.maxX - b.minX, h: b.maxY - b.minY };
  };

  const armEdgeDrag = (renderer, handle) => {
    const bounds = renderer.getSelectionBounds(renderer.getSelectedLayers());
    renderer.isLayerDrag = true;
    renderer.dragMode = 'resize';
    renderer.activeHandle = handle;
    renderer.startBounds = bounds;
    renderer.dragStart = renderer.getHandlePoint(handle, bounds);
    renderer.snap = null;
    renderer.snapAllowed = false;
    return bounds;
  };

  test('east-edge drag scales width only', async () => {
    const { renderer, square } = await setupSquare();
    const before = measure(renderer, square);
    armEdgeDrag(renderer, 'e');
    // Drag the east midpoint (80,60) out to x=100 → width x1.5, height unchanged.
    renderer.move({ clientX: 100, clientY: 60, buttons: 1 });
    renderer.up({});
    const after = measure(renderer, square);
    expect(after.w).toBeCloseTo(before.w * 1.5, 3);
    expect(after.h).toBeCloseTo(before.h, 3);
  });

  test('south-edge drag scales height only', async () => {
    const { renderer, square } = await setupSquare();
    const before = measure(renderer, square);
    armEdgeDrag(renderer, 's');
    // Drag the south midpoint (60,80) down to y=100 → height x1.5, width unchanged.
    renderer.move({ clientX: 60, clientY: 100, buttons: 1 });
    renderer.up({});
    const after = measure(renderer, square);
    expect(after.h).toBeCloseTo(before.h * 1.5, 3);
    expect(after.w).toBeCloseTo(before.w, 3);
  });

  test('Shift+edge drag constrains proportions', async () => {
    const { renderer, square } = await setupSquare();
    const before = measure(renderer, square);
    armEdgeDrag(renderer, 'e');
    renderer.move({ clientX: 100, clientY: 60, buttons: 1, shiftKey: true });
    renderer.up({});
    const after = measure(renderer, square);
    expect(after.w).toBeCloseTo(before.w * 1.5, 3);
    expect(after.h).toBeCloseTo(before.h * 1.5, 3);
  });

  test('edge drag shows the W×H drag tooltip', async () => {
    const { renderer } = await setupSquare();
    armEdgeDrag(renderer, 'e');
    renderer.move({ clientX: 100, clientY: 60, buttons: 1 });
    expect(renderer._dragTooltipEl).toBeTruthy();
    expect(renderer._dragTooltipEl.textContent).toContain('×');
    renderer.up({});
  });
});
