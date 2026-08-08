const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Object3d inspector — the Geometry selector and per-geometry controls.
 *
 * RGR — before this landed the Algorithm Configuration panel had NO way to
 * change an object's shape (the only surface was the ctxbar "Shape" pill, which
 * offered 9 of 12 primitives and refreshed only itself). Selecting `ellipsoid`
 * or `pyramid` through that pill produced a BLANK inspector: neither had a
 * catalog entry, dimension controls or a Fidelity slider. A Polyhedron had no
 * Sides / Depth / Frequency / Taper / Star inset handle even though
 * buildSolidBaseMesh reads all five. And `prim` was captured OUTSIDE
 * renderObject, so any control that changed the primitive and re-rendered drew
 * the OLD geometry's sliders.
 */

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const GEOMETRIES = [
  'box', 'plane', 'sphere', 'ellipsoid', 'cylinder', 'cone',
  'torus', 'torusKnot', 'capsule', 'superellipsoid', 'pyramid', 'solid',
];

// The control each geometry must own, keyed by its slider aria-label.
const EXPECTED_CONTROLS = {
  box: ['box width', 'box height', 'box depth'],
  plane: ['plane width', 'plane depth'],
  sphere: ['sphere radius', 'Surface fidelity (tessellation detail)'],
  ellipsoid: ['ellipsoid x', 'ellipsoid y', 'ellipsoid z', 'Surface fidelity (tessellation detail)'],
  cylinder: ['cylinder radius', 'cylinder height', 'Surface fidelity (tessellation detail)'],
  cone: ['cone base radius', 'cone height', 'Surface fidelity (tessellation detail)'],
  torus: ['torus diameter', 'torus thickness', 'Surface fidelity (tessellation detail)'],
  torusKnot: ['torusKnot radius', 'torusKnot thickness', 'Surface fidelity (tessellation detail)'],
  capsule: ['capsule radius', 'capsule length', 'Surface fidelity (tessellation detail)'],
  superellipsoid: ['superellipsoid x', 'superellipsoid y', 'superellipsoid z', 'Surface fidelity (tessellation detail)'],
  pyramid: ['pyramid base', 'pyramid height', 'Surface fidelity (tessellation detail)'],
  solid: ['solid radius', 'solid expand', 'solid twist', 'solid explode', 'solid extrude', 'solid shard'],
};

describe('Object3d inspector — Geometry selector', () => {
  let runtime, window, document, app, P;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    P = window.Vectura.Scene3D.Params;
  });

  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const host = () => document.getElementById('dynamic-controls');
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const geomSelect = () => host().querySelector('select.ctrl-sel[aria-label="Object geometry"]');
  const ariaLabels = () => Array.from(host().querySelectorAll('[aria-label]')).map((n) => n.getAttribute('aria-label'));

  const freshScene = () => {
    app.engine.layers = app.engine.layers.filter(
      (l) => !String(l.type).startsWith('scene') && l.type !== 'object3d' && l.type !== 'booleanGroup3d',
    );
    return app.engine.addLayer('scene3d');
  };

  // Add an object of `prim` and open its inspector.
  const openObject = (prim) => {
    const gid = freshScene();
    const oid = app.engine.addObjectToScene(gid, prim);
    app.engine.activeLayerId = oid;
    app.ui.buildControls();
    return app.engine.getLayerById(oid);
  };

  test('the object inspector mounts a Geometry select offering all twelve geometries', () => {
    openObject('box');
    const sel = geomSelect();
    expect(sel).toBeTruthy();
    expect(sel.value).toBe('box');
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(GEOMETRIES);
    // Polyhedron is a single entry — the 16 families live one level down.
    expect(Array.from(sel.options).find((o) => o.value === 'solid').textContent).toBe('Polyhedron');
  });

  test('every geometry renders its OWN controls (no blank inspector, no stale set)', () => {
    GEOMETRIES.forEach((g) => {
      const child = openObject(g);
      expect(child.params.primitive).toBe(g);
      const labels = ariaLabels();
      EXPECTED_CONTROLS[g].forEach((l) => {
        expect(labels).toContain(l);
      });
      // No other geometry's dimension controls leaked in.
      GEOMETRIES.filter((o) => o !== g).forEach((other) => {
        EXPECTED_CONTROLS[other]
          .filter((l) => l.startsWith(`${other} `))
          .forEach((l) => expect(labels).not.toContain(l));
      });
    });
  });

  test('changing Geometry swaps the primitive AND re-renders that geometry\'s controls', () => {
    const child = openObject('box');
    const sel = geomSelect();
    sel.value = 'torus';
    fire(sel, 'change');

    expect(child.params.primitive).toBe('torus');
    // The stale-closure bug: renderObject captured `prim` once, so the panel
    // redrew the BOX sliders here.
    const labels = ariaLabels();
    expect(labels).toContain('torus diameter');
    expect(labels).toContain('torus thickness');
    expect(labels).not.toContain('box width');
    // …and the select itself reads back the new geometry.
    expect(geomSelect().value).toBe('torus');
  });

  test('a swap from the panel is ONE undo step and keeps transform / style / name', () => {
    const child = openObject('torus');
    child.name = 'My Ring';
    child.params.transform = { x: 12, y: 4, z: -8, yaw: 35, pitch: 0, roll: 0, scale: 1.25 };
    child.params.style = { penId: 'pen-2', mapper: 'hatch', params: { fillAngle: 30, fillDensity: 70 } };
    child.params.visibility = 'xray';
    app.ui.buildControls();

    const before = app.history ? app.history.length : null;
    const sel = geomSelect();
    sel.value = 'capsule';
    fire(sel, 'change');

    expect(child.params.primitive).toBe('capsule');
    expect(child.name).toBe('My Ring');
    expect(child.params.transform).toEqual({ x: 12, y: 4, z: -8, yaw: 35, pitch: 0, roll: 0, scale: 1.25 });
    expect(child.params.style.mapper).toBe('hatch');
    expect(child.params.style.penId).toBe('pen-2');
    expect(child.params.visibility).toBe('xray');
    if (before !== null) expect(app.history.length).toBe(before + 1);
  });

  test('a swap keeps the object roughly its previous overall size', () => {
    const child = openObject('torus');
    // Grow the ring to ~120mm across, then become a box.
    child.params.params = { ...child.params.params, sx: 78 };
    const before = P.primitiveNominalSize('torus', child.params.params);
    app.ui.buildControls();

    const sel = geomSelect();
    sel.value = 'box';
    fire(sel, 'change');

    const after = P.primitiveNominalSize('box', child.params.params);
    expect(Math.abs(after - before) / before).toBeLessThan(0.05);
    // Emphatically NOT the default 40mm box.
    expect(child.params.params.sx).toBeGreaterThan(100);
  });

  test('Polyhedron reveals the Family select and the deformers', () => {
    const child = openObject('box');
    const sel = geomSelect();
    sel.value = 'solid';
    fire(sel, 'change');

    expect(child.params.primitive).toBe('solid');
    const family = host().querySelector('select.ctrl-sel[aria-label="Solid type"]');
    expect(family).toBeTruthy();
    expect(family.value).toBe('buckyball');
    expect(Array.from(family.options).length).toBe(16);
    ['solid expand', 'solid twist', 'solid explode', 'solid extrude', 'solid shard']
      .forEach((l) => expect(ariaLabels()).toContain(l));
  });

  test('the polyhedron structure params appear for the families that USE them', () => {
    const child = openObject('solid');
    // buckyball: no sides, no depth, no taper, no star inset.
    expect(ariaLabels()).not.toContain('solid sides');
    expect(ariaLabels()).not.toContain('solid depth');

    const family = host().querySelector('select.ctrl-sel[aria-label="Solid type"]');
    family.value = 'prism';
    fire(family, 'change');
    expect(child.params.params.solidType).toBe('prism');
    expect(ariaLabels()).toContain('solid sides');
    expect(ariaLabels()).toContain('solid depth');
    expect(ariaLabels()).not.toContain('solid taper');

    const f2 = host().querySelector('select.ctrl-sel[aria-label="Solid type"]');
    f2.value = 'starPrism';
    fire(f2, 'change');
    expect(ariaLabels()).toContain('solid star inset');

    const f3 = host().querySelector('select.ctrl-sel[aria-label="Solid type"]');
    f3.value = 'geodesic';
    fire(f3, 'change');
    expect(ariaLabels()).toContain('solid frequency');
    expect(ariaLabels()).not.toContain('solid sides');
  });

  test('an imported mesh survives a geometry swap round-trip through the panel', () => {
    freshScene();
    const TEST_MESH = {
      vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }],
      faces: [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]],
    };
    const res = app.engine.importMeshAsScene(TEST_MESH, 'Test Cube');
    expect(res.ok).toBe(true);
    const child = app.engine.getLayerById(res.childId);
    app.engine.activeLayerId = res.childId;
    app.ui.buildControls();

    // Geometry: Polyhedron → Box destroys the payload unless it is carried.
    let sel = geomSelect();
    sel.value = 'box';
    fire(sel, 'change');
    expect(child.params.primitive).toBe('box');
    expect(child.params.params.importedMesh.vertices.length).toBe(4);

    // …and back, landing ON the import rather than a buckyball.
    sel = geomSelect();
    sel.value = 'solid';
    fire(sel, 'change');
    expect(child.params.params.solidType).toBe('importedMesh');
    expect(child.params.params.importedMesh.vertices.length).toBe(4);
    const family = host().querySelector('select.ctrl-sel[aria-label="Solid type"]');
    expect(family.value).toBe('importedMesh');
  });

  test('a NEW plane has a live Depth slider wired to the key the mesh reads', () => {
    const child = openObject('plane');
    expect(child.params.params).toEqual({ sx: 60, sz: 60 });
    const depth = host().querySelector('[aria-label="plane depth"]');
    expect(depth).toBeTruthy();
    expect(Number(depth.value)).toBe(60);

    depth.value = '180';
    fire(depth, 'input');
    fire(depth, 'change');
    expect(child.params.params.sz).toBe(180);

    const mesh = window.Vectura.Scene3D.Scene.buildPrimitiveMesh({ primitive: 'plane', params: child.params.params }, 1);
    const zs = mesh.vertices.map((v) => v.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(180, 6);
  });

  test('an EXISTING plane is not migrated — its render is untouched', () => {
    const gid = freshScene();
    const oid = app.engine.addObjectToScene(gid, 'plane');
    const child = app.engine.getLayerById(oid);
    // Simulate a plane saved before the fix.
    child.params.params = { sx: 60, sy: 60 };
    app.engine.activeLayerId = oid;
    app.ui.buildControls();

    // Merely opening the inspector must not write sz.
    expect(child.params.params.sz).toBeUndefined();
    expect(child.params.params.sy).toBe(60);
    // The Depth slider tells the truth about what the mesh actually does (120).
    const depth = host().querySelector('[aria-label="plane depth"]');
    expect(Number(depth.value)).toBe(120);
    const mesh = window.Vectura.Scene3D.Scene.buildPrimitiveMesh({ primitive: 'plane', params: child.params.params }, 1);
    const zs = mesh.vertices.map((v) => v.z);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(120, 6);
  });

  test('the panel re-syncs when the shape is changed from the context bar', () => {
    const gid = freshScene();
    const oid = app.engine.addObjectToScene(gid, 'box');
    app.engine.activeLayerId = oid;
    app.ui.buildControls();
    expect(ariaLabels()).toContain('box width');

    // The ctxbar bridge writes through the renderer and rebuilds only itself.
    app.renderer.setSceneSelection({ layerId: gid, mode: 'object', objectIds: [oid], faceKeys: [], edgeKeys: [] }, { silent: true });
    expect(app.renderer.setSceneObjectPrimitive(gid, [oid], 'sphere')).toBe(true);

    // Interacting with the panel re-reads the primitive.
    fire(host().querySelector('.vs3-panel'), 'pointerenter');
    expect(ariaLabels()).toContain('sphere radius');
    expect(ariaLabels()).not.toContain('box width');
  });
});
