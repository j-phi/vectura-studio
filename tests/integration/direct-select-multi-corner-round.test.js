/**
 * Direct-select multi-corner rounding (Illustrator Live Corners parity):
 * with several corners selected, dragging one corner's rounding handle rounds
 * ALL selected corners to the radius under the cursor — unselected corners are
 * untouched. Corners already rounded snap to the dragged level.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('direct-select multi-corner rounding', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
  });

  afterAll(() => runtime.cleanup());

  function makeRect(renderer, engine, Layer, cornerRadii) {
    const shape = { type: 'rect', x1: 0, y1: 0, x2: 100, y2: 100, cornerRadii };
    const layer = new Layer('mcr', 'shape', 'Rect');
    layer.sourcePaths = [renderer.buildShapePath(shape)];
    layer.params = { curves: false, smoothing: 0, simplify: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    engine.layers.push(layer);
    engine.generate(layer.id);
    return layer;
  }

  function setup(cornerRadii = [0, 0, 0, 0]) {
    const { VectorEngine, Layer, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const renderer = new Renderer('main-canvas', engine);
    const layer = makeRect(renderer, engine, Layer, cornerRadii.slice());
    renderer.setSelection([layer.id], layer.id);
    renderer.setTool('direct');
    renderer.setDirectSelection(layer, 0);
    return { renderer, engine, layer };
  }

  test('dragging one selected corner rounds all selected corners, not the others', () => {
    const { renderer, layer } = setup([0, 0, 0, 0]);
    const sel = renderer.directSelection;
    // Corners 0 and 2 selected (unrounded ⇒ anchor idx == vertex idx).
    sel.selectedIndices = new Set([0, 2]);

    const cornerSet = renderer._selectedCornerIndices(renderer.getShapeMetaForLayer(layer, 0).shape);
    expect([...cornerSet].sort()).toEqual([0, 2]);

    renderer.beginShapeCornerDrag(layer, 0, { index: 0 }, 'selected', cornerSet);
    // Drag corner 0 inward to shape-local (12, 12).
    const world = renderer.transformShapeSourcePoint({ x: 12, y: 12 }, layer, null);
    renderer.updateShapeCornerDrag(world);

    const radii = renderer.getShapeMetaForLayer(layer, 0).shape.cornerRadii;
    expect(radii[0]).toBeGreaterThan(0.5);
    expect(radii[2]).toBeGreaterThan(0.5);
    expect(radii[0]).toBeCloseTo(radii[2], 3); // both snap to the same dragged radius
    expect(radii[1]).toBe(0);
    expect(radii[3]).toBe(0);
  });

  test('already-rounded selected corners snap to the dragged level', () => {
    const { renderer, layer } = setup([20, 0, 5, 0]);
    const sel = renderer.directSelection;
    // Vertex 0 (r=20) and vertex 2 (r=5) both selected — map anchors→vertices.
    const cornerSet = renderer._selectedCornerIndices(renderer.getShapeMetaForLayer(layer, 0).shape);
    // Select every anchor so both rounded corners are covered.
    sel.selectedIndices = new Set(sel.anchors.map((_, i) => i));
    const set = renderer._selectedCornerIndices(renderer.getShapeMetaForLayer(layer, 0).shape);
    expect(set.has(0)).toBe(true);
    expect(set.has(2)).toBe(true);

    renderer.beginShapeCornerDrag(layer, 0, { index: 0 }, 'selected', set);
    const world = renderer.transformShapeSourcePoint({ x: 8, y: 8 }, layer, null);
    renderer.updateShapeCornerDrag(world);

    const radii = renderer.getShapeMetaForLayer(layer, 0).shape.cornerRadii;
    // Both previously-different radii (20 and 5) snap to the same dragged value.
    expect(radii[0]).toBeCloseTo(radii[2], 3);
    expect(radii[0]).toBeLessThan(20);
  });
});
