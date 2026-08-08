/**
 * Defect 4 — the shape lists must reach primitive parity.
 *
 * The ctxbar "Shape" flyout (CONTEXT_BAR.sceneFlyouts.shape.primitives) listed
 * only 9 of the 12 primitives — Plane, Ellipsoid and Polyhedron (`solid`) were
 * unreachable from the canvas, while the docked panel offers all 12. The layer
 * context menu's "Add shape" category likewise had no Ellipsoid or Pyramid.
 *
 * Both lists are DISPLAY vocabularies for Scene3D.Params.PRIMITIVES; every value
 * must be a real primitive (the renderer bridge rejects anything else) and every
 * primitive must appear exactly once.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Defect 4 — scene shape-list parity with Scene3D.Params.PRIMITIVES', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true });
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  test('the ctxbar Shape flyout offers every primitive, exactly once', () => {
    const prims = V.CONTEXT_BAR.sceneFlyouts.shape.primitives;
    const values = prims.map((p) => p.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values.slice().sort()).toEqual(V.Scene3D.Params.PRIMITIVES.slice().sort());
    prims.forEach((p) => expect(typeof p.label === 'string' && p.label.length > 0).toBe(true));
  });

  test('the ctxbar Shape flyout names `solid` "Polyhedron" (panel + menu vocabulary)', () => {
    const prims = V.CONTEXT_BAR.sceneFlyouts.shape.primitives;
    expect(prims.find((p) => p.value === 'solid').label).toBe('Polyhedron');
    expect(prims.find((p) => p.value === 'plane').label).toBe('Plane');
    expect(prims.find((p) => p.value === 'ellipsoid').label).toBe('Ellipsoid');
  });

  test('every ctxbar shape value can actually be created (PRIMITIVE_CREATE_DEFAULTS)', () => {
    const P = V.Scene3D.Params;
    V.CONTEXT_BAR.sceneFlyouts.shape.primitives.forEach((p) => {
      expect(P.PRIMITIVE_CREATE_DEFAULTS[p.value]).toBeTruthy();
      expect(P.buildPrimitiveParams(p.value, 'box', { sx: 40, sy: 40, sz: 40 })).toBeTruthy();
    });
  });

  test('the layer context menu "Add shape" category offers every primitive, exactly once', () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneGroup();
    const grp = engine.getLayerById(gid);
    const ui = { app: { engine, renderer: { selectedLayerIds: new Set([gid]) } } };
    const items = V.UI.Menus.LayerContext._itemsFor(ui, grp);

    // Slice the "Add shape" category (up to the next category divider).
    const start = items.findIndex((i) => i.category === 'Add shape');
    expect(start).toBeGreaterThanOrEqual(0);
    const shapes = [];
    for (let i = start + 1; i < items.length; i++) {
      if (items[i].category) break;
      shapes.push(items[i]);
    }
    const labels = shapes.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.length).toBe(V.Scene3D.Params.PRIMITIVES.length);
    ['Ellipsoid', 'Pyramid', 'Plane', 'Polyhedron'].forEach((l) => expect(labels).toContain(l));
  });

  test('every "Add shape" entry actually adds that primitive to the tree', () => {
    // The compositor is stubbed: this asserts the ADD path seeds the right
    // primitive + bag, not the render (composing 12 stacked solids costs ~40s
    // and exercises nothing this test is about).
    const real = V.AlgorithmRegistry.scene3d.generate;
    V.AlgorithmRegistry.scene3d.generate = () => [];
    try {
      const engine = new V.VectorEngine();
      engine.layers = [];
      const gid = engine.addSceneGroup();
      V.Scene3D.Params.PRIMITIVES.forEach((prim) => {
        const oid = engine.addObjectToScene(gid, prim);
        const child = engine.getLayerById(oid);
        expect(child.params.primitive).toBe(prim);
        expect(child.params.params).toEqual(V.Scene3D.Params.PRIMITIVE_CREATE_DEFAULTS[prim]);
      });
    } finally {
      V.AlgorithmRegistry.scene3d.generate = real;
    }
  });
});
