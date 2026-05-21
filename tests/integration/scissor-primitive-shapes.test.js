const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

// Repro for the user-reported regression: the scissor tool must fully split
// primitive shape layers (oval, polygon, closed-pen) into two visible layers,
// not just insert a node.
describe('Scissor: full split of primitive shape layers', () => {
  let runtime, window;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const horizCut = { mode: 'line', line: { a: { x: -200, y: 0 }, b: { x: 200, y: 0 } } };

  const buildOvalSourcePath = () => {
    const k = 0.5522847498;
    const rx = 100, ry = 60;
    const anchors = [
      { x:  rx, y:   0, in: { x:  rx,     y:  ry * k }, out: { x:  rx,     y: -ry * k } },
      { x:   0, y: -ry, in: { x:  rx * k, y: -ry     }, out: { x: -rx * k, y: -ry     } },
      { x: -rx, y:   0, in: { x: -rx,     y: -ry * k }, out: { x: -rx,     y:  ry * k } },
      { x:   0, y:  ry, in: { x: -rx * k, y:  ry     }, out: { x:  rx * k, y:  ry     } },
    ];
    const poly = window.Vectura.GeometryUtils.buildPolylineFromAnchors(anchors, true);
    poly.meta = {
      kind: 'shape',
      closed: true,
      anchors: anchors.map((a) => ({
        x: a.x, y: a.y,
        in:  a.in  ? { x: a.in.x,  y: a.in.y  } : null,
        out: a.out ? { x: a.out.x, y: a.out.y } : null,
      })),
      shape: { type: 'oval', cx: 0, cy: 0, rx, ry, rotation: 0 },
    };
    return poly;
  };

  const buildHexagonSourcePath = () => {
    const r = 100;
    const anchors = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      anchors.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, in: null, out: null });
    }
    const poly = window.Vectura.GeometryUtils.buildPolylineFromAnchors(anchors, true);
    poly.meta = {
      kind: 'shape',
      closed: true,
      anchors: anchors.map((a) => ({ x: a.x, y: a.y, in: null, out: null })),
      shape: { type: 'polygon', cx: 0, cy: 0, radius: r, rotation: 0, sides: 6 },
    };
    return poly;
  };

  const buildClosedPenSourcePath = () => {
    const anchors = [
      { x: -100, y: -50, in: null, out: null },
      { x:  100, y: -50, in: null, out: null },
      { x:  100, y:  50, in: null, out: null },
      { x: -100, y:  50, in: null, out: null },
    ];
    const poly = window.Vectura.GeometryUtils.buildPolylineFromAnchors(anchors, true);
    poly.meta = {
      kind: 'shape',
      closed: true,
      anchors: anchors.map((a) => ({ ...a })),
    };
    return poly;
  };

  // Adds a primitive shape layer the same way createManualLayerFromPath would,
  // then runs applyScissor and returns the resulting layers.
  const cutShape = (buildSourcePath, payload) => {
    const app = new window.Vectura.App();
    const engine = app.engine;
    const ui = app.ui;
    const { Layer } = window.Vectura;

    // Start from a clean slate.
    engine.layers.length = 0;
    const id = 'test-shape-' + Math.random().toString(36).slice(2, 8);
    const layer = new Layer(id, 'shape', 'Test Shape');
    layer.sourcePaths = [buildSourcePath()];
    layer.params.curves = true;
    engine.layers.push(layer);
    engine.activeLayerId = id;
    engine.generate(id);

    ui.applyScissor(payload);
    return { app, engine, layer, ui };
  };

  test('OVAL: horizontal knife through cardinal anchors produces 2 shape layers (full split)', () => {
    const { engine } = cutShape(buildOvalSourcePath, horizCut);
    const shapeLayers = engine.layers.filter((l) => !l.isGroup);
    expect(shapeLayers.length).toBe(2);
    // Both children must have polyline-only sourcePaths (no parametric meta.shape
    // — otherwise the renderer would draw the full original outline).
    shapeLayers.forEach((child) => {
      expect(child.type).toBe('shape');
      expect(Array.isArray(child.sourcePaths)).toBe(true);
      expect(child.sourcePaths[0].length).toBeGreaterThan(1);
      expect(child.sourcePaths[0].meta?.shape).toBeUndefined();
    });
    // The two pieces must lie on opposite sides of the cut (y=0).
    const sideOf = (pts) => {
      const meanY = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      return Math.sign(meanY);
    };
    const sides = shapeLayers.map((l) => sideOf(l.sourcePaths[0]));
    expect(sides[0]).not.toBe(sides[1]);
  });

  test('HEXAGON: horizontal knife through vertex pair produces 2 shape layers', () => {
    const { engine } = cutShape(buildHexagonSourcePath, horizCut);
    const shapeLayers = engine.layers.filter((l) => !l.isGroup);
    expect(shapeLayers.length).toBe(2);
    shapeLayers.forEach((child) => {
      expect(child.sourcePaths[0].meta?.shape).toBeUndefined();
    });
  });

  test('CLOSED PEN RECTANGLE: horizontal knife through middle produces 2 shape layers', () => {
    const { engine } = cutShape(buildClosedPenSourcePath, horizCut);
    const shapeLayers = engine.layers.filter((l) => !l.isGroup);
    expect(shapeLayers.length).toBe(2);
  });

  test('OVAL: knife through vertex pair leaves NO layer with meta.anchors of the original full outline', () => {
    // Bug hypothesis: the renderer's tracePath draws beziers from meta.anchors
    // when handles are present. If the cut children inherit the parent's full
    // anchor list (via any caching path), the canvas keeps drawing the original
    // un-cut outline even though the polyline points were split.
    const { engine } = cutShape(buildOvalSourcePath, horizCut);
    const shapeLayers = engine.layers.filter((l) => !l.isGroup);
    shapeLayers.forEach((child) => {
      const meta = child.sourcePaths[0]?.meta;
      const hasOriginalAnchorCount = Array.isArray(meta?.anchors) && meta.anchors.length === 4;
      expect(hasOriginalAnchorCount).toBe(false);
    });
  });
});
