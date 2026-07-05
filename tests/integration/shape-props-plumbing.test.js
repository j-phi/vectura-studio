/*
 * SHP-1/2/3 — live shape-property renderer plumbing.
 *
 * The Task Bar Shape Properties popover binds onto the EXISTING live-shape
 * params (`cornerRadii`, `sides`) via a thin renderer API. This suite pins that
 * API: reading uniform corner radius + side count, writing them live, one undo
 * step per gesture, and round-trip with the persisted `meta.shape` the on-canvas
 * corner widget also mutates (no param drift — SHP-3).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('SHP — renderer shape-property plumbing', () => {
  let runtime;
  let engine;
  let renderer;
  let history;

  const makePolygon = (over = {}) => ({
    type: 'polygon', cx: 100, cy: 100, radius: 40, rotation: 0,
    sides: 6, cornerRadii: [0, 0, 0, 0, 0, 0], ...over,
  });

  const mountShape = (shape) => {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    engine = new VectorEngine();
    engine.layers = [];
    const layer = new Layer('shp', 'shape', 'Shape');
    layer.params = { ...layer.params, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0, smoothing: 0, simplify: 0 };
    engine.layers.push(layer);
    const canvas = runtime.document.getElementById('main-canvas');
    renderer = new Renderer(canvas, engine);
    const path = renderer.buildShapePath(shape);
    layer.sourcePaths = [path];
    engine.generate(layer.id);
    history = [];
    renderer.onDirectEditStart = () => { history.push('push'); };
    renderer.onDirectEditCommit = () => {};
    renderer.selectLayer(layer);
    return layer;
  };

  beforeAll(async () => { runtime = await loadVecturaRuntime({ includeRenderer: true }); });
  afterAll(() => { runtime.cleanup(); });

  test('getShapePropsState reports polygon type, sides, and uniform corner radius', () => {
    mountShape(makePolygon({ sides: 6, cornerRadii: [3, 3, 3, 3, 3, 3] }));
    const state = renderer.getShapePropsState();
    expect(state).not.toBeNull();
    expect(state.type).toBe('polygon');
    expect(state.supportsSides).toBe(true);
    expect(state.supportsCornerRadius).toBe(true);
    expect(state.sides).toBe(6);
    expect(state.cornerRadiusMm).toBeCloseTo(3, 3);
    expect(state.cornerRadiusMixed).toBe(false);
    expect(state.maxCornerRadiusMm).toBeGreaterThan(0);
  });

  test('setShapeSides mutates the persisted sides param live and resizes cornerRadii', () => {
    const layer = mountShape(makePolygon({ sides: 6 }));
    renderer.beginShapePropsEdit();
    renderer.setShapeSides(9);
    renderer.endShapePropsEdit();
    const meta = renderer.getShapeMetaForLayer(layer, 0);
    expect(meta.shape.sides).toBe(9);
    expect(meta.shape.cornerRadii).toHaveLength(9);
    expect(renderer.getShapePropsState().sides).toBe(9);
    // One undo step for the whole gesture.
    expect(history.filter((h) => h === 'push')).toHaveLength(1);
  });

  test('setShapeUniformCornerRadius writes a uniform value into cornerRadii, undoably', () => {
    const layer = mountShape(makePolygon({ sides: 5, cornerRadii: [0, 0, 0, 0, 0] }));
    renderer.beginShapePropsEdit();
    renderer.setShapeUniformCornerRadius(2);
    renderer.setShapeUniformCornerRadius(4);
    renderer.endShapePropsEdit();
    const meta = renderer.getShapeMetaForLayer(layer, 0);
    expect(meta.shape.cornerRadii.every((r) => Math.abs(r - 4) < 1e-6)).toBe(true);
    // Two live moves inside one gesture => exactly one history push.
    expect(history.filter((h) => h === 'push')).toHaveLength(1);
  });

  test('rectangle reports corner radius and no sides (SHP-2)', () => {
    mountShape({ type: 'rect', x1: 20, y1: 20, x2: 120, y2: 90, cornerRadii: [5, 5, 5, 5] });
    const state = renderer.getShapePropsState();
    expect(state.type).toBe('rect');
    expect(state.supportsCornerRadius).toBe(true);
    expect(state.supportsSides).toBe(false);
    expect(state.sides).toBeNull();
    expect(state.cornerRadiusMm).toBeCloseTo(5, 3);
  });

  test('SHP-3: popover writes reach the SAME persisted param the on-canvas widget reads (no drift)', () => {
    const layer = mountShape(makePolygon({ sides: 7 }));
    // Popover sets a uniform radius.
    renderer.setShapeUniformCornerRadius(3);
    // The on-canvas corner-handle machinery reads the same meta.shape.
    const handles = renderer.getShapeCornerHandles(layer, 0);
    expect(handles).toHaveLength(7);
    const meta = renderer.getShapeMetaForLayer(layer, 0);
    expect(meta.shape.sides).toBe(7);
    expect(meta.shape.cornerRadii.every((r) => Math.abs(r - 3) < 1e-6)).toBe(true);
    // And side-count edits persist for the widget too.
    renderer.setShapeSides(8);
    expect(renderer.getShapeCornerHandles(layer, 0)).toHaveLength(8);
  });
});
