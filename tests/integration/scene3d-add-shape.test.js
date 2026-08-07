const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Adding shapes to an EXISTING 3D scene (discoverability defect).
 *
 * Group A: a scene GROUP (isGroup + containerRole 'scene') mounts the Scene
 * panel's "Add Objects" shelf, and every shelf / More… button routes through
 * engine.addObjectToScene so the new object arrives as a real object3d LAYER
 * child (correct primitive, param bag and penId) — not an inline monolith
 * entry. Before this landed the shelf was retired for groups and the only add
 * path (the layer right-click menu) could make a box or a polyhedron ONLY, so
 * sphere / torus / cylinder / cone / plane / superellipsoid / torusKnot /
 * capsule were unreachable from the UI.
 *
 * Group B: the object3d inspector tells the truth about an IMPORTED mesh.
 * An imported OBJ/STL is a `solid` whose solidType is 'importedMesh' — absent
 * from the parametric family list, so the Select fell back to displaying the
 * last option ("Buckyball"). The option is now present (and selectable), so the
 * readout is correct and switching family stays reversible.
 */

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

// Every primitive the shelf must reach, and the params key that proves the
// engine seeded the right bag (OBJECT3D_PRIMITIVE_DEFAULTS).
const SHELF_PRIMS = ['box', 'sphere', 'cylinder', 'torus', 'cone', 'plane'];
const MORE_PRIMS = ['superellipsoid', 'torusKnot', 'capsule', 'solid'];

// A tiny closed tetrahedron — enough for buildImportedMeshParams to accept.
const TEST_MESH = {
  vertices: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }],
  faces: [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]],
};

describe('Scene tree — adding a shape to an existing scene', () => {
  let runtime, window, document, app;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
  });

  afterAll(() => {
    runtime?.cleanup?.();
    runtime = null;
  });

  const controlsHost = () => document.getElementById('dynamic-controls');
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

  const freshScene = () => {
    app.engine.layers = app.engine.layers.filter(
      (l) => !String(l.type).startsWith('scene') && l.type !== 'object3d' && l.type !== 'booleanGroup3d',
    );
    const gid = app.engine.addLayer('scene3d');
    app.engine.activeLayerId = gid;
    app.ui.buildControls();
    return gid;
  };

  const objectChildren = (gid) => app.engine.getLayerChildren(gid).filter((l) => l.type === 'object3d');

  // ── Group A — the shelf is present and wired to the layer tree ─────────────

  test('a scene GROUP mounts the Add Objects shelf with every primitive reachable', () => {
    freshScene();
    const host = controlsHost();
    const shelf = host.querySelector('.vs3-shelf');
    expect(shelf).toBeTruthy();
    SHELF_PRIMS.forEach((prim) => {
      expect(host.querySelector(`.vs3-shelf-btn[data-prim="${prim}"]`)).toBeTruthy();
    });
    // The exotics live behind the More… flyout, which is portaled to <body>.
    fire(host.querySelector('.vs3-more-caret'), 'click');
    MORE_PRIMS.forEach((prim) => {
      expect(document.querySelector(`.vs3-more-item[data-prim="${prim}"]`)).toBeTruthy();
    });
  });

  test('clicking the Torus shelf button adds a torus object3d LAYER child', () => {
    const gid = freshScene();
    const before = objectChildren(gid).length;
    fire(controlsHost().querySelector('.vs3-shelf-btn[data-prim="torus"]'), 'click');

    const kids = objectChildren(gid);
    expect(kids.length).toBe(before + 1);
    const added = kids[kids.length - 1];
    expect(added.type).toBe('object3d');
    expect(added.parentId).toBe(gid);
    expect(added.params.primitive).toBe('torus');
    // The engine's torus param bag (a null pen breaks the compositor spacing).
    expect(added.params.params).toEqual({ sx: 34, sy: 9, sz: 9, detail: 24 });
    expect(added.penId).toBeTruthy();
    // Nothing leaked into the monolith's inline object list.
    expect(app.engine.getLayerById(gid).params.objects.length).toBe(0);
    expect(() => app.engine.computeAllDisplayGeometry()).not.toThrow();
  });

  test('clicking the Sphere shelf button adds a sphere object3d LAYER child', () => {
    const gid = freshScene();
    fire(controlsHost().querySelector('.vs3-shelf-btn[data-prim="sphere"]'), 'click');
    const kids = objectChildren(gid);
    const added = kids[kids.length - 1];
    expect(added.params.primitive).toBe('sphere');
    expect(added.params.params).toEqual({ radius: 25, detail: 28 });
    expect(added.penId).toBeTruthy();
  });

  test('a shelf add selects the new child and pushes exactly one history entry', () => {
    const gid = freshScene();
    const depth = app.history ? app.history.length : null;
    fire(controlsHost().querySelector('.vs3-shelf-btn[data-prim="cone"]'), 'click');
    const kids = objectChildren(gid);
    const added = kids[kids.length - 1];
    expect(app.engine.activeLayerId).toBe(added.id);
    expect(Array.from(app.renderer.selectedLayerIds)).toContain(added.id);
    if (depth !== null) expect(app.history.length).toBe(depth + 1);
  });

  test('the More… flyout adds an exotic primitive as a LAYER child too', () => {
    const gid = freshScene();
    fire(controlsHost().querySelector('.vs3-more-caret'), 'click');
    fire(document.querySelector('.vs3-more-item[data-prim="capsule"]'), 'click');
    const kids = objectChildren(gid);
    const added = kids[kids.length - 1];
    expect(added.type).toBe('object3d');
    expect(added.params.primitive).toBe('capsule');
    expect(app.engine.getLayerById(gid).params.objects.length).toBe(0);
  });

  test('the layer context menu offers every shape and adds the one picked', () => {
    const gid = freshScene();
    const LC = window.Vectura.UI.Menus.LayerContext;
    const group = app.engine.getLayerById(gid);
    const items = LC._itemsFor(app.ui, group);
    const labels = items.filter((i) => i.key).map((i) => i.label);
    ['Box', 'Sphere', 'Cylinder', 'Torus', 'Cone', 'Plane', 'Polyhedron'].forEach((l) => {
      expect(labels).toContain(l);
    });
    LC._runAction(app.ui, group, 'scene-add-prim:torus');
    const kids = objectChildren(gid);
    expect(kids[kids.length - 1].params.primitive).toBe('torus');
  });

  // ── Group B — imported mesh is represented truthfully ──────────────────────

  test('an imported mesh reads as "Imported mesh", not the buckyball fallback', () => {
    freshScene();
    const res = app.engine.importMeshAsScene(TEST_MESH, 'Test Cube');
    expect(res.ok).toBe(true);
    const child = app.engine.getLayerById(res.childId);
    expect(child.params.params.solidType).toBe('importedMesh');

    app.engine.activeLayerId = res.childId;
    app.ui.buildControls();
    const sel = controlsHost().querySelector('select.ctrl-sel[aria-label="Solid type"]');
    expect(sel).toBeTruthy();
    // The readout must match the data, not fall through to the last option.
    expect(sel.value).toBe('importedMesh');
    const opts = Array.from(sel.options).map((o) => o.value);
    expect(opts).toContain('importedMesh');
    expect(Array.from(sel.options).find((o) => o.value === 'importedMesh').textContent)
      .toBe('Imported mesh');
  });

  test('switching an imported mesh to a parametric family stays reversible', () => {
    freshScene();
    const res = app.engine.importMeshAsScene(TEST_MESH, 'Test Cube');
    app.engine.activeLayerId = res.childId;
    app.ui.buildControls();
    const child = app.engine.getLayerById(res.childId);

    let sel = controlsHost().querySelector('select.ctrl-sel[aria-label="Solid type"]');
    sel.value = 'cube';
    fire(sel, 'change');
    expect(child.params.params.solidType).toBe('cube');
    // The payload is NOT destroyed …
    expect(child.params.params.importedMesh.vertices.length).toBe(TEST_MESH.vertices.length);

    // … and the option is still offered, so the UI is a route back.
    app.ui.buildControls();
    sel = controlsHost().querySelector('select.ctrl-sel[aria-label="Solid type"]');
    expect(Array.from(sel.options).map((o) => o.value)).toContain('importedMesh');
    sel.value = 'importedMesh';
    fire(sel, 'change');
    expect(child.params.params.solidType).toBe('importedMesh');
  });

  test('a parametric solid with no mesh payload does NOT offer "Imported mesh"', () => {
    const gid = freshScene();
    const oid = app.engine.addObjectToScene(gid, 'solid');
    app.engine.activeLayerId = oid;
    app.ui.buildControls();
    const sel = controlsHost().querySelector('select.ctrl-sel[aria-label="Solid type"]');
    expect(sel.value).toBe('buckyball');
    expect(Array.from(sel.options).map((o) => o.value)).not.toContain('importedMesh');
  });
});
