const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Shape tool geometry', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const createRenderer = () => {
    const { Renderer } = runtime.window.Vectura;
    const engine = {
      layers: [],
      currentProfile: { width: 210, height: 297 },
      getActiveLayer() {
        return null;
      },
    };
    return new Renderer('main-canvas', engine);
  };

  test('rectangle and oval drafts honor shift constraints', () => {
    const renderer = createRenderer();

    const rect = renderer.buildShapeFromDraft(
      { x: 10, y: 20 },
      { x: 50, y: 70 },
      { shift: true },
      { kind: 'rect' }
    );
    expect(rect.type).toBe('rect');
    expect(Math.abs((rect.x2 - rect.x1) - (rect.y2 - rect.y1))).toBeLessThan(1e-6);

    const oval = renderer.buildShapeFromDraft(
      { x: 20, y: 30 },
      { x: 70, y: 90 },
      { shift: true },
      { kind: 'oval' }
    );
    expect(oval.type).toBe('oval');
    expect(Math.abs(oval.rx - oval.ry)).toBeLessThan(1e-6);

    const ovalPath = renderer.buildShapePath(oval);
    expect(ovalPath.meta.shape.type).toBe('oval');
    expect(ovalPath.meta.anchors).toHaveLength(4);
  });

  test('line drafts produce open two-anchor paths and snap to 45° with shift', () => {
    const renderer = createRenderer();

    const free = renderer.buildShapeFromDraft(
      { x: 10, y: 20 },
      { x: 60, y: 80 },
      {},
      { kind: 'line' }
    );
    expect(free.type).toBe('line');
    expect(free.x1).toBe(10);
    expect(free.y1).toBe(20);
    expect(free.x2).toBe(60);
    expect(free.y2).toBe(80);

    const linePath = renderer.buildShapePath(free);
    expect(linePath.meta.shape.type).toBe('line');
    expect(linePath.meta.closed).toBe(false);
    expect(linePath.meta.anchors).toHaveLength(2);

    // Shift snaps angle to nearest π/4. A 17° angle (slightly off horizontal)
    // should snap to 0°, putting the endpoint on the x-axis through start.
    const dx = 100;
    const dy = Math.tan((17 * Math.PI) / 180) * dx;
    const snapped = renderer.buildShapeFromDraft(
      { x: 0, y: 0 },
      { x: dx, y: dy },
      { shift: true },
      { kind: 'line' }
    );
    expect(Math.abs(snapped.y2)).toBeLessThan(1e-6);
  });

  test('polygon drafts track side count changes during drag', () => {
    const renderer = createRenderer();
    renderer.setTool('shape-polygon');
    renderer.startShapeDraft({ x: 100, y: 100 }, { shiftKey: false, altKey: false, metaKey: false });
    renderer.updateShapeDraft({ x: 140, y: 140 }, { shiftKey: false, altKey: false, metaKey: false });

    expect(renderer.getDraftShape().sides).toBe(6);
    renderer.adjustShapeDraftSides(2);
    expect(renderer.getDraftShape().sides).toBe(8);
    renderer.adjustShapeDraftSides(-5);
    expect(renderer.getDraftShape().sides).toBe(3);
  });

  test('corner descriptors clamp oversized radii and preserve per-corner rounding', () => {
    const { Renderer } = runtime.window.Vectura;
    const renderer = createRenderer();
    const baseRect = { type: 'rect', x1: 20, y1: 20, x2: 120, y2: 80, cornerRadii: [999, 0, 12, 0] };
    const descriptors = Renderer.__shapeUtils.getCornerDescriptors(baseRect);

    expect(descriptors).toHaveLength(4);
    expect(descriptors[0].radius).toBeLessThanOrEqual(descriptors[0].maxRadius + 1e-6);
    expect(descriptors[1].radius).toBe(0);
    expect(descriptors[2].radius).toBeGreaterThan(0);

    const oneCornerPath = renderer.buildShapePath(baseRect);
    const allCornerPath = renderer.buildShapePath({
      ...baseRect,
      cornerRadii: [12, 12, 12, 12],
    });

    expect(oneCornerPath.meta.shape.cornerRadii[1]).toBe(0);
    expect(allCornerPath.meta.shape.cornerRadii.every((radius) => radius > 0)).toBe(true);
    expect(allCornerPath.meta.anchors.length).toBeGreaterThan(oneCornerPath.meta.anchors.length);
  });

  test('rotated primitive-shape handles stay attached to transformed vertices', () => {
    const { Layer, Renderer } = runtime.window.Vectura;
    const renderer = createRenderer();
    const shape = {
      type: 'polygon',
      cx: 100,
      cy: 110,
      radius: 36,
      rotation: -Math.PI / 2,
      sides: 6,
      cornerRadii: [0, 0, 0, 0, 0, 0],
    };
    const layer = new Layer('poly-shape', 'shape', 'Polygon');
    layer.sourcePaths = [renderer.buildShapePath(shape)];
    layer.origin = { x: 100, y: 110 };
    layer.params.posX = 18;
    layer.params.posY = -12;
    layer.params.scaleX = 1;
    layer.params.scaleY = 1;
    layer.params.rotation = 33;
    renderer.engine.layers = [layer];

    const handles = renderer.getShapeCornerHandles(layer);
    const expectedVertices = Renderer.__shapeUtils.getShapeVertices(shape).map((vertex) => renderer.transformShapeSourcePoint(vertex, layer));
    const bounds = renderer.getLayerBounds(layer);

    expect(handles).toHaveLength(expectedVertices.length);
    handles.forEach((handle, index) => {
      expect(handle.vertex.x).toBeCloseTo(expectedVertices[index].x, 3);
      expect(handle.vertex.y).toBeCloseTo(expectedVertices[index].y, 3);
    });
    expect(bounds.rotation).toBeCloseTo((33 * Math.PI) / 180, 6);
  });

  test('corner-radius handles draw for selected shape across select/pen/direct tools', () => {
    const { Layer } = runtime.window.Vectura;
    const renderer = createRenderer();
    const shape = {
      type: 'polygon',
      cx: 100,
      cy: 100,
      radius: 40,
      rotation: -Math.PI / 2,
      sides: 6,
      cornerRadii: [0, 0, 0, 0, 0, 0],
    };
    const layer = new Layer('poly1', 'shape', 'Polygon');
    layer.sourcePaths = [renderer.buildShapePath(shape)];
    layer.origin = { x: 100, y: 100 };
    renderer.engine.layers = [layer];
    renderer.setSelection([layer.id], layer.id);

    const drawn = [];
    const orig = renderer.drawShapeCornerHandles.bind(renderer);
    renderer.drawShapeCornerHandles = (l, idx, scope) => {
      drawn.push({ id: l.id, scope, tool: renderer.activeTool });
      return orig(l, idx, scope);
    };

    ['select', 'pen', 'direct'].forEach((tool) => {
      renderer.activeTool = tool;
      renderer.directSelection = null;
      renderer.draw();
    });

    const scopesAllByTool = drawn.filter((d) => d.scope === 'all').map((d) => d.tool);
    expect(scopesAllByTool).toEqual(expect.arrayContaining(['select', 'pen', 'direct']));
  });

  test('per-corner radii preserved when single-corner drag adjusts one corner in direct mode', () => {
    const { Layer } = runtime.window.Vectura;
    const renderer = new (runtime.window.Vectura.Renderer)('main-canvas', {
      layers: [],
      currentProfile: { width: 210, height: 297 },
      getActiveLayer() { return null; },
      generate(id) {
        const layer = this.layers.find((l) => l.id === id);
        if (layer && Array.isArray(layer.sourcePaths)) {
          layer.paths = layer.sourcePaths.map((p) => {
            const out = p.map((pt) => ({ x: pt.x, y: pt.y }));
            if (p.meta) out.meta = JSON.parse(JSON.stringify(p.meta));
            return out;
          });
        }
      },
    });

    // Hexagon with all 6 corners pre-rounded to radius=5 (simulates scope='all' drag result)
    const shape = {
      type: 'polygon',
      cx: 100, cy: 100, radius: 50,
      rotation: -Math.PI / 2,
      sides: 6,
      cornerRadii: [5, 5, 5, 5, 5, 5],
    };
    const layer = new Layer('hex1', 'shape', 'Hexagon');
    layer.sourcePaths = [renderer.buildShapePath(shape)];
    layer.origin = { x: 100, y: 100 };
    layer.params = { posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0, smoothing: 0, simplify: 0 };
    renderer.engine.layers = [layer];
    renderer.setSelection([layer.id], layer.id);

    // Enter direct selection on the path
    renderer.setDirectSelection(layer, 0);
    expect(renderer.directSelection).not.toBeNull();

    // Get corner handles and simulate a drag on corner index 0
    const handles = renderer.getShapeCornerHandles(layer, 0);
    expect(handles.length).toBe(6);

    // Simulate beginShapeCornerDrag with scope='single'
    const corner = handles[0];
    const started = renderer.beginShapeCornerDrag(layer, 0, corner, 'single');
    expect(started).toBe(true);
    expect(renderer.shapeCornerDrag).not.toBeNull();
    expect(renderer.shapeCornerDrag.scope).toBe('single');

    // The initial shape in the drag should preserve all 6 radii
    const initialRadii = renderer.shapeCornerDrag.shape.cornerRadii;
    expect(initialRadii).toHaveLength(6);
    expect(initialRadii.every((r) => r === 5)).toBe(true);

    // Simulate dragging corner 0 inward (toward center) to produce a different radius
    // Use the inward direction to compute a new position at ~3mm
    const targetRadius = 3;
    const desc = handles[0];
    const newDist = desc.sinHalf > 1e-4 ? targetRadius / desc.sinHalf : targetRadius;
    const dragWorld = {
      x: desc.vertex.x + desc.inward.x * newDist,
      y: desc.vertex.y + desc.inward.y * newDist,
    };
    renderer.updateShapeCornerDrag(dragWorld);

    // After the drag: only corner 0 should have changed
    const finalRadii = renderer.directSelection?.meta?.shape?.cornerRadii;
    expect(finalRadii).toBeDefined();
    // Corners 1-5 must still be ~5 (unchanged)
    for (let i = 1; i < 6; i++) {
      expect(finalRadii[i]).toBeCloseTo(5, 0);
    }
    // Corner 0 should have changed away from 5
    expect(Math.abs(finalRadii[0] - 5)).toBeGreaterThan(0.5);
  });

  test('smoothCommit strips meta.shape so corner handles do not corrupt bezier-smooth paths', () => {
    const { Layer } = runtime.window.Vectura;
    const PathEditOps = runtime.window.Vectura.PathEditOps;
    if (!PathEditOps) return; // skip if not loaded

    const engine = {
      layers: [],
      currentProfile: { width: 210, height: 297 },
      getActiveLayer() { return null; },
      generate(id) {
        const layer = this.layers.find((l) => l.id === id);
        if (layer && Array.isArray(layer.sourcePaths)) {
          layer.paths = layer.sourcePaths.map((p) => {
            const out = p.map((pt) => ({ x: pt.x, y: pt.y }));
            if (p.meta) out.meta = JSON.parse(JSON.stringify(p.meta));
            return out;
          });
        }
      },
    };
    const renderer = new (runtime.window.Vectura.Renderer)('main-canvas', engine);

    const shape = {
      type: 'polygon', cx: 100, cy: 100, radius: 50,
      rotation: -Math.PI / 2, sides: 6,
      cornerRadii: [0, 0, 0, 0, 0, 0],
    };
    const layer = new Layer('hex2', 'shape', 'Hexagon');
    layer.sourcePaths = [renderer.buildShapePath(shape)];
    layer.origin = { x: 100, y: 100 };
    layer.params = { posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0, smoothing: 0, simplify: 0 };
    engine.layers = [layer];
    renderer.setSelection([layer.id], layer.id);

    // Apply bezier smooth via smoothBegin/smoothPreview/smoothCommit
    const app = { engine, renderer, pushHistory() {} };
    PathEditOps.smoothBegin([layer.id], { app, engine });
    PathEditOps.smoothPreview(60, { app, engine });
    PathEditOps.smoothCommit({ app, engine });

    // After smooth commit, meta.shape should be stripped from the live shape path
    const sp = layer.sourcePaths[0];
    expect(sp?.meta?.shape).toBeUndefined();
  });
});
