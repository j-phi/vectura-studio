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
    const { ShapeUtils } = runtime.window.Vectura;
    const renderer = createRenderer();
    const baseRect = { type: 'rect', x1: 20, y1: 20, x2: 120, y2: 80, cornerRadii: [999, 0, 12, 0] };
    const descriptors = ShapeUtils.getCornerDescriptors(baseRect);

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
    const { Layer, ShapeUtils } = runtime.window.Vectura;
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
    const layer = new Layer('poly-shape', 'expanded', 'Polygon');
    layer.sourcePaths = [renderer.buildShapePath(shape)];
    layer.origin = { x: 100, y: 110 };
    layer.params.posX = 18;
    layer.params.posY = -12;
    layer.params.scaleX = 1;
    layer.params.scaleY = 1;
    layer.params.rotation = 33;
    renderer.engine.layers = [layer];

    const handles = renderer.getShapeCornerHandles(layer);
    const expectedVertices = ShapeUtils.getShapeVertices(shape).map((vertex) => renderer.transformShapeSourcePoint(vertex, layer));
    const bounds = renderer.getLayerBounds(layer);

    expect(handles).toHaveLength(expectedVertices.length);
    handles.forEach((handle, index) => {
      expect(handle.vertex.x).toBeCloseTo(expectedVertices[index].x, 3);
      expect(handle.vertex.y).toBeCloseTo(expectedVertices[index].y, 3);
    });
    expect(bounds.rotation).toBeCloseTo((33 * Math.PI) / 180, 6);
  });
});
