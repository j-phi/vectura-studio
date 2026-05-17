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

  async function setupGroupedTwoShapeLayers() {
    const { renderer, left, right } = await setupTwoShapeLayers();
    const { Layer } = runtime.window.Vectura;
    const engine = renderer.engine;

    const group = new Layer('grp-1', 'group', 'Group 1');
    group.isGroup = true;
    group.groupType = 'group';
    group.groupCollapsed = false;
    group.visible = true;
    left.parentId = 'grp-1';
    right.parentId = 'grp-1';
    engine.layers.push(group);

    renderer.setSelection(['grp-1', left.id, right.id], 'grp-1');
    return { renderer, left, right, group };
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

  test('rotate commit with group in selection: children rotate correctly, group params unchanged', async () => {
    const { renderer, left, right, group } = await setupGroupedTwoShapeLayers();

    const leftCenterBefore = {
      x: left.origin.x + (left.params.posX ?? 0),
      y: left.origin.y + (left.params.posY ?? 0),
    };
    const rightCenterBefore = {
      x: right.origin.x + (right.params.posX ?? 0),
      y: right.origin.y + (right.params.posY ?? 0),
    };
    const groupPosXBefore = group.params.posX ?? 0;
    const groupPosYBefore = group.params.posY ?? 0;
    const groupRotBefore = group.params.rotation ?? 0;

    const selectedLayers = renderer.getSelectedLayers();
    const bounds = renderer.getSelectionBounds(selectedLayers);
    const rotateOrigin = renderer.getBoundsCenter(bounds);

    renderer.isLayerDrag = true;
    renderer.dragMode = 'rotate';
    renderer.startBounds = bounds;
    renderer.rotateOrigin = rotateOrigin;
    renderer.snap = null;
    renderer.snapAllowed = false;
    renderer.tempTransform = {
      dx: 0, dy: 0, scaleX: 1, scaleY: 1, origin: rotateOrigin, rotation: 90,
    };

    renderer.up({});

    // Group params must not change
    expect(group.params.posX ?? 0).toBeCloseTo(groupPosXBefore, 5);
    expect(group.params.posY ?? 0).toBeCloseTo(groupPosYBefore, 5);
    expect(group.params.rotation ?? 0).toBeCloseTo(groupRotBefore, 5);

    // Each child should be rotated 90° around the selection center
    const rot = Math.PI / 2;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const expectRotated = (centerBefore) => ({
      x: rotateOrigin.x + (centerBefore.x - rotateOrigin.x) * cosR - (centerBefore.y - rotateOrigin.y) * sinR,
      y: rotateOrigin.y + (centerBefore.x - rotateOrigin.x) * sinR + (centerBefore.y - rotateOrigin.y) * cosR,
    });

    const leftExpected = expectRotated(leftCenterBefore);
    const rightExpected = expectRotated(rightCenterBefore);

    const leftCenterAfter = {
      x: left.origin.x + (left.params.posX ?? 0),
      y: left.origin.y + (left.params.posY ?? 0),
    };
    const rightCenterAfter = {
      x: right.origin.x + (right.params.posX ?? 0),
      y: right.origin.y + (right.params.posY ?? 0),
    };

    expect(leftCenterAfter.x).toBeCloseTo(leftExpected.x, 3);
    expect(leftCenterAfter.y).toBeCloseTo(leftExpected.y, 3);
    expect(rightCenterAfter.x).toBeCloseTo(rightExpected.x, 3);
    expect(rightCenterAfter.y).toBeCloseTo(rightExpected.y, 3);
  });

  test('rotate group selection preserves relative distance between children', async () => {
    const { renderer, left, right } = await setupGroupedTwoShapeLayers();

    const leftCenterBefore = {
      x: left.origin.x + (left.params.posX ?? 0),
      y: left.origin.y + (left.params.posY ?? 0),
    };
    const rightCenterBefore = {
      x: right.origin.x + (right.params.posX ?? 0),
      y: right.origin.y + (right.params.posY ?? 0),
    };
    const distBefore = Math.hypot(
      rightCenterBefore.x - leftCenterBefore.x,
      rightCenterBefore.y - leftCenterBefore.y
    );

    const selectedLayers = renderer.getSelectedLayers();
    const bounds = renderer.getSelectionBounds(selectedLayers);
    const rotateOrigin = renderer.getBoundsCenter(bounds);

    renderer.isLayerDrag = true;
    renderer.dragMode = 'rotate';
    renderer.startBounds = bounds;
    renderer.rotateOrigin = rotateOrigin;
    renderer.snap = null;
    renderer.snapAllowed = false;
    renderer.tempTransform = {
      dx: 0, dy: 0, scaleX: 1, scaleY: 1, origin: rotateOrigin, rotation: 135,
    };

    renderer.up({});

    const distAfter = Math.hypot(
      (right.origin.x + right.params.posX) - (left.origin.x + left.params.posX),
      (right.origin.y + right.params.posY) - (left.origin.y + left.params.posY)
    );
    expect(distAfter).toBeCloseTo(distBefore, 3);
  });
});
