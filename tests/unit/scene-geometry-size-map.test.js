const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Geometry creation defaults + the swap size map.
 *
 * RGR — three tables used to describe "what params does this shape start with":
 * engine OBJECT3D_PRIMITIVE_DEFAULTS (add), the panel's PRIMITIVES.defaults()
 * (shelf + slider reset target) and Scene3D.Params.PRIMITIVE_PARAM_DEFAULTS
 * (swap reset). They disagreed for 8 of 10 primitives — `add torus` made a thin
 * ring (sy/sz 9), `swap → torus` a fat donut (sy/sz 22). There is now ONE
 * creation table, PRIMITIVE_CREATE_DEFAULTS, and a swap re-seeds from it and
 * then uniformly rescales it so the object keeps roughly its previous overall
 * size instead of collapsing to a default-sized one.
 *
 * The nominal-size table is asserted against the REAL mesh bounding box, so a
 * mesh-builder change that invalidates a formula fails here rather than shipping
 * a swap that silently resizes the object.
 */

const RUNTIME = { includeRenderer: false, includeUi: false, includeApp: false, includeMain: false };

const GEOMETRIES = [
  'box', 'plane', 'sphere', 'ellipsoid', 'cylinder', 'cone',
  'torus', 'torusKnot', 'capsule', 'superellipsoid', 'pyramid', 'solid',
];

describe('Scene3D geometry — creation defaults + size map', () => {
  let runtime, V, P, Scene;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(RUNTIME);
    V = runtime.window.Vectura;
    P = V.Scene3D.Params;
    Scene = V.Scene3D.Scene;
  });

  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  // Largest axis-aligned extent of the untransformed mesh a bag produces.
  const meshExtent = (primitive, params) => {
    const mesh = Scene.buildPrimitiveMesh({ primitive, params }, 1);
    const lo = { x: Infinity, y: Infinity, z: Infinity };
    const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
    mesh.vertices.forEach((v) => {
      ['x', 'y', 'z'].forEach((a) => { if (v[a] < lo[a]) lo[a] = v[a]; if (v[a] > hi[a]) hi[a] = v[a]; });
    });
    return Math.max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z);
  };

  test('PRIMITIVE_CREATE_DEFAULTS covers all twelve geometries', () => {
    GEOMETRIES.forEach((g) => {
      expect(P.PRIMITIVE_CREATE_DEFAULTS[g]).toBeTruthy();
      expect(P.PRIMITIVES).toContain(g);
    });
    expect(Object.keys(P.PRIMITIVE_CREATE_DEFAULTS).sort()).toEqual([...GEOMETRIES].sort());
  });

  test('the add-shelf proportions win: torus is a thin ring, not a fat donut', () => {
    expect(P.PRIMITIVE_CREATE_DEFAULTS.torus).toEqual({ sx: 34, sy: 9, sz: 9, detail: 24 });
    expect(P.PRIMITIVE_CREATE_DEFAULTS.sphere).toEqual({ radius: 25, detail: 28 });
    expect(P.PRIMITIVE_CREATE_DEFAULTS.torusKnot).toEqual({ sx: 30, sy: 6, sz: 6, detail: 28 });
  });

  test('a plane is seeded with sz (the key buildPlaneMesh reads), so Depth is live', () => {
    const bag = P.PRIMITIVE_CREATE_DEFAULTS.plane;
    expect(bag.sz).toBe(60);
    expect(bag.sy).toBeUndefined();
    expect(meshExtent('plane', bag)).toBeCloseTo(60, 6);
    // Dragging Depth must actually move the mesh.
    expect(meshExtent('plane', { ...bag, sz: 200 })).toBeCloseTo(200, 6);
  });

  test('an EXISTING plane (sx/sy, no sz) still renders exactly as it does today', () => {
    // The legacy add bag. Nothing may migrate it: sz stays absent, the mesh
    // keeps taking its own 120 fallback, so the saved document is unchanged.
    const legacy = { sx: 60, sy: 60 };
    const mesh = Scene.buildPrimitiveMesh({ primitive: 'plane', params: legacy }, 1);
    const zs = mesh.vertices.map((v) => v.z);
    const xs = mesh.vertices.map((v) => v.x);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(120, 6);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(60, 6);
    // The deserialization table is the contract for saved docs — do not move it.
    expect(P.PRIMITIVE_PARAM_DEFAULTS.plane).toEqual({ sx: 120, sz: 120 });
  });

  test('primitiveNominalSize matches the real mesh bounding box for every geometry', () => {
    GEOMETRIES.forEach((g) => {
      const bag = P.PRIMITIVE_CREATE_DEFAULTS[g];
      const predicted = P.primitiveNominalSize(g, bag);
      const actual = meshExtent(g, bag);
      // 4%: exact for ten of the twelve; the torus knot's swept tube is the
      // widest approximation, and the tessellated charts sample the surface.
      expect(Math.abs(predicted - actual) / actual).toBeLessThan(0.04);
    });
  });

  test('a swap re-seeds from the creation defaults and keeps the overall size', () => {
    // An 80mm-across torus (sx solves 2*(0.75sx + 0.28*9) = 80).
    const torus = { ...P.PRIMITIVE_CREATE_DEFAULTS.torus, sx: 49.94 };
    expect(P.primitiveNominalSize('torus', torus)).toBeCloseTo(80, 0);

    const box = P.buildPrimitiveParams('box', 'torus', torus);
    expect(box.sx).toBeGreaterThan(70);
    expect(box.sx).toBeLessThan(90);
    expect(meshExtent('box', box)).toBeGreaterThan(70);
    // Shape params do NOT carry over — a box has no `detail`.
    expect(box.detail).toBeUndefined();
  });

  test('size is preserved across every ordered pair of geometries', () => {
    const fails = [];
    GEOMETRIES.forEach((from) => {
      const src = { ...P.PRIMITIVE_CREATE_DEFAULTS[from] };
      const srcSize = P.primitiveNominalSize(from, src);
      GEOMETRIES.forEach((to) => {
        if (to === from) return;
        const bag = P.buildPrimitiveParams(to, from, src);
        const got = meshExtent(to, bag);
        // 10%: the polyhedron radius floor (20 mm, the standalone control's own
        // minimum) and the torus/knot tube floors are the only binding clamps
        // in this default-sized sweep.
        if (Math.abs(got - srcSize) / srcSize > 0.1) fails.push(`${from}→${to}: ${srcSize.toFixed(1)} → ${got.toFixed(1)}`);
      });
    });
    expect(fails).toEqual([]);
  });

  test('a scaled swap never lands outside the control that edits it', () => {
    const big = { sx: 200, sy: 200, sz: 200 };
    GEOMETRIES.forEach((to) => {
      const bag = P.buildPrimitiveParams(to, 'box', big);
      const ranges = P.PRIMITIVE_SIZE_RANGE[to] || {};
      Object.keys(ranges).forEach((key) => {
        if (typeof bag[key] !== 'number') return;
        expect(bag[key]).toBeGreaterThanOrEqual(ranges[key].min);
        expect(bag[key]).toBeLessThanOrEqual(ranges[key].max);
      });
    });
  });

  test('an imported-mesh payload survives a swap round-trip', () => {
    const mesh = {
      vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }],
      faces: [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]],
    };
    const imported = { ...P.PRIMITIVE_CREATE_DEFAULTS.solid, solidType: 'importedMesh', importedMesh: mesh };
    const asBox = P.buildPrimitiveParams('box', 'solid', imported);
    expect(asBox.importedMesh).toBe(mesh);
    const backToSolid = P.buildPrimitiveParams('solid', 'box', asBox);
    expect(backToSolid.importedMesh).toBe(mesh);
    // …and it lands back ON the import, not on a buckyball.
    expect(backToSolid.solidType).toBe('importedMesh');
  });

  test('buildPrimitiveParams rejects an unknown geometry', () => {
    expect(P.buildPrimitiveParams('notashape', 'box', { sx: 40 })).toBeNull();
  });
});

describe('Engine — add and swap read the SAME creation table', () => {
  let runtime, window, app, P;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({
      includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
    });
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    P = window.Vectura.Scene3D.Params;
  });

  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const freshScene = () => {
    app.engine.layers = app.engine.layers.filter(
      (l) => !String(l.type).startsWith('scene') && l.type !== 'object3d' && l.type !== 'booleanGroup3d',
    );
    return app.engine.addLayer('scene3d');
  };

  test('every geometry is addable and lands on the creation defaults', () => {
    GEOMETRIES.forEach((g) => {
      const gid = freshScene();
      const oid = app.engine.addObjectToScene(gid, g);
      const child = app.engine.getLayerById(oid);
      expect(child.params.primitive).toBe(g);
      expect(child.params.params).toEqual(P.PRIMITIVE_CREATE_DEFAULTS[g]);
    });
  }, 120000);

  test('swapping TO a geometry produces what adding it produces (same proportions)', () => {
    const gid = freshScene();
    const oid = app.engine.addObjectToScene(gid, 'box');
    const child = app.engine.getLayerById(oid);
    GEOMETRIES.forEach((g) => {
      if (g === 'box') return;
      // A box the same size as g's own default ⇒ scale factor 1 ⇒ the swap must
      // land exactly on the creation defaults (which are the ADD defaults).
      const target = P.PRIMITIVE_CREATE_DEFAULTS[g];
      const size = P.primitiveNominalSize(g, target);
      child.params.primitive = 'box';
      child.params.params = { sx: size, sy: size, sz: size };
      expect(app.engine.setObjectPrimitive(oid, g, { recompute: false })).toBe(true);
      Object.keys(target).forEach((k) => {
        if (typeof target[k] !== 'number') { expect(child.params.params[k]).toBe(target[k]); return; }
        expect(child.params.params[k]).toBeCloseTo(target[k], 0);
      });
    });
  }, 60000);

  test('setObjectPrimitive keeps transform / style / pen / visibility / role / name', () => {
    const gid = freshScene();
    const oid = app.engine.addObjectToScene(gid, 'torus');
    const child = app.engine.getLayerById(oid);
    child.name = 'My Ring';
    child.penId = 'pen-3';
    child.params.transform = { x: 10, y: 5, z: -3, yaw: 20, pitch: 0, roll: 0, scale: 1.5 };
    child.params.style = { penId: 'pen-2', mapper: 'hatch', params: { fillAngle: 30, fillDensity: 70 } };
    child.params.visibility = 'xray';
    child.params.role = 'hole';

    expect(app.engine.setObjectPrimitive(oid, 'sphere')).toBe(true);
    expect(child.params.primitive).toBe('sphere');
    expect(child.name).toBe('My Ring');
    expect(child.penId).toBe('pen-3');
    expect(child.params.transform).toEqual({ x: 10, y: 5, z: -3, yaw: 20, pitch: 0, roll: 0, scale: 1.5 });
    expect(child.params.style).toEqual({ penId: 'pen-2', mapper: 'hatch', params: { fillAngle: 30, fillDensity: 70 } });
    expect(child.params.visibility).toBe('xray');
    expect(child.params.role).toBe('hole');
    // No stale keys from the torus bag.
    expect(child.params.params.sx).toBeUndefined();
  });

  test('setObjectPrimitive rejects a bad target and a no-op swap', () => {
    const gid = freshScene();
    const oid = app.engine.addObjectToScene(gid, 'box');
    expect(app.engine.setObjectPrimitive(oid, 'notashape')).toBe(false);
    expect(app.engine.setObjectPrimitive(oid, 'box')).toBe(false);
    expect(app.engine.setObjectPrimitive(gid, 'sphere')).toBe(false);
  });
});
