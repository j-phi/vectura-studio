const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Multi-selection resize/rotate commit', () => {
  let runtime;

  afterEach(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  async function setupTwoShapeLayers() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { window } = runtime;
    const { VectorEngine, Renderer, Layer } = window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];

    const left = new Layer('multi-left', 'shape', 'Left Box');
    left.sourcePaths = [[
      { x: 40, y: 40 }, { x: 80, y: 40 }, { x: 80, y: 80 }, { x: 40, y: 80 }, { x: 40, y: 40 },
    ]];

    const right = new Layer('multi-right', 'shape', 'Right Box');
    right.sourcePaths = [[
      { x: 140, y: 40 }, { x: 180, y: 40 }, { x: 180, y: 80 }, { x: 140, y: 80 }, { x: 140, y: 40 },
    ]];

    engine.layers.push(left, right);
    engine.generate(left.id);
    engine.generate(right.id);

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.setSelection([left.id, right.id], left.id);
    return { renderer, left, right };
  }

  test('drawing bounding box for >1 selected layers requests handles to be drawn', async () => {
    const { renderer } = await setupTwoShapeLayers();
    const calls = [];
    const origDraw = renderer.drawSelection.bind(renderer);
    renderer.drawSelection = (bounds, opts) => {
      calls.push({ bounds, opts });
      return origDraw(bounds, opts);
    };

    renderer.draw();

    const handleCalls = calls.filter((c) => c.opts && c.opts.showHandles === true);
    expect(handleCalls.length).toBeGreaterThan(0);
  });

  test('resize commit scales both selected layers around the shared origin', async () => {
    const { renderer, left, right } = await setupTwoShapeLayers();
    const bounds = renderer.getSelectionBounds([left, right]);
    expect(bounds).toBeTruthy();

    const origin = renderer.getResizeAnchor('se', bounds); // NW corner of selection bounds
    const startLeftPos = { x: left.params.posX ?? 0, y: left.params.posY ?? 0 };
    const startRightPos = { x: right.params.posX ?? 0, y: right.params.posY ?? 0 };
    const startLeftScale = { x: left.params.scaleX ?? 1, y: left.params.scaleY ?? 1 };
    const startRightScale = { x: right.params.scaleX ?? 1, y: right.params.scaleY ?? 1 };

    renderer.isLayerDrag = true;
    renderer.dragMode = 'resize';
    renderer.activeHandle = 'se';
    renderer.startBounds = bounds;
    renderer.snap = null;
    renderer.snapAllowed = false;
    renderer.tempTransform = {
      dx: 0, dy: 0, scaleX: 2, scaleY: 2, origin, rotation: 0,
    };

    renderer.up({});

    expect(left.params.scaleX).toBeCloseTo(startLeftScale.x * 2, 5);
    expect(left.params.scaleY).toBeCloseTo(startLeftScale.y * 2, 5);
    expect(right.params.scaleX).toBeCloseTo(startRightScale.x * 2, 5);
    expect(right.params.scaleY).toBeCloseTo(startRightScale.y * 2, 5);

    const prof = renderer.engine.currentProfile;
    const expectedFor = (layer, prevPos) => {
      const originLocal = layer.origin || { x: prof.width / 2, y: prof.height / 2 };
      const baseOriginX = originLocal.x + prevPos.x;
      const baseOriginY = originLocal.y + prevPos.y;
      return {
        x: (baseOriginX - origin.x) * 2 + origin.x - originLocal.x,
        y: (baseOriginY - origin.y) * 2 + origin.y - originLocal.y,
      };
    };
    const expLeft = expectedFor(left, startLeftPos);
    const expRight = expectedFor(right, startRightPos);
    expect(left.params.posX).toBeCloseTo(expLeft.x, 5);
    expect(left.params.posY).toBeCloseTo(expLeft.y, 5);
    expect(right.params.posX).toBeCloseTo(expRight.x, 5);
    expect(right.params.posY).toBeCloseTo(expRight.y, 5);

    expect(renderer.tempTransform).toBeNull();
  });
});
