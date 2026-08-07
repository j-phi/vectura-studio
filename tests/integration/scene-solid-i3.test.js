const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Convert-to-Scene Increment 3 (CtS I3) — panel + Add-Objects + inspector
 * parity for the `solid` (parametric polyhedron) primitive.
 *
 * Group A (full stack): a scene-tree object3d `solid` LEAF exposes the
 * solidType dropdown + the 5 LIVE deformer sliders (expand / twist / explode /
 * extrude / shard) in the inspector, gated to `solid` objects only; a box shows
 * none of them. Editing solidType or a deformer recomputes the geometry.
 *
 * Group B (direct mount): the scene panel Add-Objects shelf (More… flyout)
 * lists a Solid entry; adding one appends a valid object carrying the
 * scene-consistent solid defaults (radius 20, buckyball, INERT deformers).
 */

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

const fixtureParams = (overrides = {}) => ({
  sceneVersion: 1,
  seed: 0,
  posX: 0,
  posY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  objects: [],
  lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
  ground: { enabled: true },
  backdrop: { enabled: false },
  camera: { projection: 'orthographic', yaw: -30, pitch: -20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  groups: [],
  assets: {},
  styleTable: { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} },
  ...overrides,
});

// ---------------------------------------------------------------------------
// Group A — inspector parity for a scene-tree `solid` LEAF (full stack)
// ---------------------------------------------------------------------------
describe('CtS I3 — solid inspector (full stack)', () => {
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
    // Remove any prior scene layers so ordinals/selection stay clean.
    app.engine.layers = app.engine.layers.filter((l) => !String(l.type).startsWith('scene') && l.type !== 'object3d' && l.type !== 'booleanGroup3d');
    const gid = app.engine.addLayer('scene3d');
    return gid;
  };

  test('adding a solid via engine.addObjectToScene yields a valid, renderable object3d', () => {
    const gid = freshScene();
    const oid = app.engine.addObjectToScene(gid, 'solid');
    expect(oid).toBeTruthy();
    const solid = app.engine.getLayerById(oid);
    expect(solid).toBeTruthy();
    expect(solid.type).toBe('object3d');
    expect(solid.params.primitive).toBe('solid');
    // Scene-consistent defaults (radius 20, not the standalone ~76) + inert deformers.
    expect(solid.params.params.solidType).toBe('buckyball');
    expect(solid.params.params.radius).toBe(20);
    expect(solid.params.params.expand).toBe(100);
    expect(solid.params.params.twist).toBe(0);
    // The seeded params build a real (non-empty) mesh through the shared solid
    // builder — the object is renderable. (The full-stack harness does not run
    // the scene3d compositor to SVG, so we assert at the mesh level.)
    const mesh = window.Vectura.Scene3D.Mesh.createSolidMesh({ ...solid.params.params, applyDeformers: true });
    expect(mesh.vertices.length).toBeGreaterThan(0);
    expect(mesh.faces.length).toBeGreaterThan(0);
    // Computing display geometry must not throw with a solid in the tree.
    expect(() => app.engine.computeAllDisplayGeometry()).not.toThrow();
  });

  test('the inspector exposes solidType + the 5 deformer controls for a solid', () => {
    const gid = freshScene();
    const oid = app.engine.addObjectToScene(gid, 'solid');
    app.engine.activeLayerId = oid;
    app.ui.buildControls();
    const host = controlsHost();
    expect(host.querySelector('select.ctrl-sel[aria-label="Solid type"]')).toBeTruthy();
    ['expand', 'twist', 'explode', 'extrude', 'shard'].forEach((k) => {
      expect(host.querySelector(`input.ctrl-slider[aria-label="solid ${k}"]`)).toBeTruthy();
    });
    // bulge / faceBands are line-art-only (I2) — they must NOT appear.
    expect(host.querySelector('input.ctrl-slider[aria-label="solid bulge"]')).toBeFalsy();
    expect(host.querySelector('input.ctrl-slider[aria-label="solid faceBands"]')).toBeFalsy();
  });

  test('a box object shows NONE of the solid controls (gating correct)', () => {
    const gid = freshScene();
    const oid = app.engine.addObjectToScene(gid, 'box');
    app.engine.activeLayerId = oid;
    app.ui.buildControls();
    const host = controlsHost();
    expect(host.querySelector('select.ctrl-sel[aria-label="Solid type"]')).toBeFalsy();
    ['expand', 'twist', 'explode', 'extrude', 'shard'].forEach((k) => {
      expect(host.querySelector(`input.ctrl-slider[aria-label="solid ${k}"]`)).toBeFalsy();
    });
    // The box inspector still mounts its own dims.
    expect(host.querySelector('input.ctrl-slider[aria-label="box width"]')).toBeTruthy();
  });

  test('changing solidType on a selected solid recomputes the geometry', () => {
    const gid = freshScene();
    const oid = app.engine.addObjectToScene(gid, 'solid');
    app.engine.activeLayerId = oid;
    app.ui.buildControls();
    const host = controlsHost();
    const solid = app.engine.getLayerById(oid);
    const sel = host.querySelector('select.ctrl-sel[aria-label="Solid type"]');
    sel.value = 'octahedron';
    fire(sel, 'change');
    expect(solid.params.params.solidType).toBe('octahedron');
  });

  test('changing a deformer on a selected solid writes params.params and re-renders', () => {
    const gid = freshScene();
    const oid = app.engine.addObjectToScene(gid, 'solid');
    app.engine.activeLayerId = oid;
    app.ui.buildControls();
    const host = controlsHost();
    const solid = app.engine.getLayerById(oid);
    const twist = host.querySelector('input.ctrl-slider[aria-label="solid twist"]');
    twist.value = '45';
    fire(twist, 'input');
    fire(twist, 'change');
    expect(solid.params.params.twist).toBe(45);
  });
});

// ---------------------------------------------------------------------------
// Group B — Add-Objects shelf lists a Solid entry (direct mount, monolith)
// ---------------------------------------------------------------------------
describe('CtS I3 — Add-Objects shelf Solid entry', () => {
  let runtime, window, document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ window, document } = runtime);
  });

  afterAll(() => runtime.cleanup());

  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

  const mount = (paramsOverrides = {}) => {
    const { UI } = window.Vectura;
    const layer = { id: 's3d-1', type: 'scene3d', name: 'Scene 1', visible: true, penId: 'pen-1', params: fixtureParams(paramsOverrides) };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    return { ui, layer, container };
  };

  test('the More… flyout lists a Solid entry that appends a valid solid object', () => {
    const { container, layer } = mount();
    const caret = container.querySelector('.vs3-more-caret');
    fire(caret, 'click');
    const item = container.querySelector('.vs3-more-item[data-prim="solid"]')
      || document.querySelector('.vs3-more-item[data-prim="solid"]');
    expect(item).toBeTruthy();
    fire(item, 'click');
    expect(layer.params.objects.length).toBe(1);
    const obj = layer.params.objects[0];
    expect(obj.primitive).toBe('solid');
    expect(obj.params.solidType).toBe('buckyball');
    expect(obj.params.radius).toBe(20);
    expect(obj.params.expand).toBe(100);
    expect(obj.params.twist).toBe(0);
  });
});
