/**
 * B2 — the object panels (tree/leaf object3d panel AND the legacy scene-group
 * inspector) expose Scale X/Y/Z rows, and the uniform Scale slider PRESERVES
 * per-axis ratios (it multiplies sx/sy/sz) instead of wiping them. Every
 * primitive has Position X/Y/Z, Yaw/Pitch/Roll and the three Scale rows.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const PRIMS = ['box', 'sphere', 'ellipsoid', 'cylinder', 'cone', 'torus', 'torusKnot', 'capsule',
  'superellipsoid', 'pyramid', 'plane', 'polyhedron'];

describe('object panels: per-axis scale rows + uniform slider keeps ratios', () => {
  let runtime; let window; let document;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); ({ window, document } = runtime); });
  afterAll(() => runtime.cleanup());

  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const q = (c, label) => c.querySelector(`input.ctrl-slider[aria-label="${label}"]`);
  const drag = (el, v) => { el.value = String(v); fire(el, 'input'); fire(el, 'change'); };

  const mountLeaf = (primitive = 'box', transform = {}) => {
    const layer = {
      id: 'obj-leaf', type: 'object3d', name: 'O', visible: true, parentId: null,
      params: {
        primitive, params: { sx: 40, sy: 40, sz: 40 },
        transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1, ...transform },
        visibility: 'solid', style: { penId: null, mapper: 'wireframe', params: {} },
      },
    };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    window.Vectura.UI.Scene3DPanel.build(ui, layer, container);
    return { layer, container };
  };

  const mountGroup = (primitive = 'box', transform = {}) => {
    const layer = {
      id: 's3d-1', type: 'scene3d', name: 'S', visible: true, penId: 'pen-1',
      params: {
        sceneVersion: 1, seed: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0,
        objects: [{
          id: 'obj-1', name: 'O', primitive, params: { sx: 40, sy: 40, sz: 40 },
          transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1, ...transform }, visibility: 'solid',
        }],
        lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
        ground: { enabled: true }, backdrop: { enabled: false },
        camera: { projection: 'orthographic', yaw: -30, pitch: -20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
        groups: [], assets: {}, styleTable: { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} },
      },
    };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    window.Vectura.UI.Scene3DPanel.build(ui, layer, container);
    fire(container.querySelector('.vs3-tree-row'), 'click');
    return { layer, container, t: () => layer.params.objects[0].transform };
  };

  const ROWS = ['Position X (mm)', 'Position Y (mm)', 'Position Z (mm)', 'Yaw (degrees)', 'Pitch (degrees)',
    'Roll (degrees)', 'Uniform scale', 'Scale X', 'Scale Y', 'Scale Z'];

  test.each(PRIMS)('leaf panel has move/rotate/scale rows for %s', (prim) => {
    const { container } = mountLeaf(prim);
    ROWS.forEach((r) => expect(q(container, r), `${prim}: ${r}`).toBeTruthy());
  });

  test.each(PRIMS)('scene-group inspector has move/rotate/scale rows for %s', (prim) => {
    const { container } = mountGroup(prim);
    ROWS.forEach((r) => expect(q(container, r), `${prim}: ${r}`).toBeTruthy());
  });

  test('leaf: Scale X/Y/Z write transform.sx/sy/sz; untouched axes seed from uniform', () => {
    const { layer, container } = mountLeaf('box', { scale: 2 });
    drag(q(container, 'Scale Y'), 3);
    const t = layer.params.transform;
    expect([t.sx, t.sy, t.sz]).toEqual([2, 3, 2]);
  });

  test('leaf: uniform slider keeps per-axis ratios (does not wipe sx/sy/sz)', () => {
    const { layer, container } = mountLeaf('box', { scale: 1, sx: 1, sy: 2, sz: 1 });
    drag(q(container, 'Uniform scale'), 2);
    const t = layer.params.transform;
    expect(t.scale).toBe(2);
    expect([t.sx, t.sy, t.sz]).toEqual([2, 4, 2]);
  });

  test('leaf: uniform slider on a uniform object adds no per-axis keys', () => {
    const { layer, container } = mountLeaf('box');
    drag(q(container, 'Uniform scale'), 2);
    const t = layer.params.transform;
    expect(t.scale).toBe(2);
    expect('sx' in t || 'sy' in t || 'sz' in t).toBe(false);
  });

  test('inspector: uniform slider keeps per-axis ratios', () => {
    const g = mountGroup('box', { scale: 1, sx: 1, sy: 2, sz: 1 });
    drag(q(g.container, 'Uniform scale'), 2);
    expect(g.t().scale).toBe(2);
    expect([g.t().sx, g.t().sy, g.t().sz]).toEqual([2, 4, 2]);
  });
});
