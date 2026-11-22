/**
 * Receive-shadow rows (objects plan C4): a Receive shadows Follow scene / On / Off control beside Cast shadow in the
 * focused object panel AND in the monolith inspector, and a Receives shadows On / Off row on the ground (child panel and
 * monolith inspector). Keys are written only when non-default.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const fixtureParams = (overrides = {}) => ({
  sceneVersion: 1, seed: 0, objects: [],
  lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
  ground: { enabled: true }, backdrop: { enabled: false },
  camera: { projection: 'orthographic', yaw: -30, pitch: -20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  groups: [], assets: {},
  styleTable: { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} },
  ...overrides,
});
const fixtureObject = (n) => ({
  id: `obj-${n}`, name: `Box ${n}`, primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
});

describe('Scene3D panel — receive shadows rows', () => {
  let runtime; let window; let document;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); ({ window, document } = runtime); });
  afterAll(() => runtime.cleanup());
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const seg = (container, label) => container.querySelector(`.seg-ctrl[aria-label="${label}"]`);
  const click = (container, label, value) => fire(seg(container, label).querySelector(`.seg-opt[data-value="${value}"]`), 'click');
  const active = (container, label) => seg(container, label).querySelector('.seg-opt.active, .seg-opt[aria-checked="true"], .seg-opt[aria-pressed="true"]');

  const mountMonolith = () => {
    const layer = { id: 's3d-1', type: 'scene3d', name: 'Scene', visible: true, penId: 'pen-1', params: fixtureParams({ objects: [fixtureObject(1)] }) };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    window.Vectura.UI.Scene3DPanel.build(ui, layer, container);
    return { layer, container };
  };

  test('monolith object inspector: the Takes shadow row sits with Cast shadow and writes obj.shadow.receive only when non-null', () => {
    const { layer, container } = mountMonolith();
    fire(container.querySelector('.vs3-tree-row'), 'click');
    expect(seg(container, 'Object casts shadow')).toBeTruthy();
    expect(seg(container, 'Object receives shadows')).toBeTruthy();
    const labels = [...container.querySelectorAll('.vs3-inspector .vs3-lbl')].map((l) => l.textContent);
    expect(labels.indexOf('Takes shadow')).toBe(labels.indexOf('Cast shadow') + 1);
    const obj = layer.params.objects[0];
    expect(obj.shadow && 'receive' in obj.shadow).toBeFalsy();
    click(container, 'Object receives shadows', 'off');
    expect(layer.params.objects[0].shadow.receive).toBe(false);
    click(container, 'Object receives shadows', 'on');
    expect(layer.params.objects[0].shadow.receive).toBe(true);
    click(container, 'Object receives shadows', 'inherit');
    expect('receive' in layer.params.objects[0].shadow).toBe(false);
  });

  test('monolith ground inspector: Receives shadows Off writes receiveShadows:false, On removes the key', () => {
    const { layer, container } = mountMonolith();
    fire(container.querySelector('.vs3-tree-row[data-object-id="ground"]'), 'click');
    expect(seg(container, 'Ground receives shadows')).toBeTruthy();
    // short visible label (the long one clipped in the narrow panel); the aria name keeps the full wording
    const gLabels = [...container.querySelectorAll('.vs3-lbl')].map((l) => l.textContent);
    expect(gLabels).toContain('Takes shadow');
    expect(gLabels.some((t) => /^Receives? shadows?$/.test(t))).toBe(false);
    click(container, 'Ground receives shadows', 'off');
    expect(layer.params.ground.receiveShadows).toBe(false);
    click(container, 'Ground receives shadows', 'on');
    expect('receiveShadows' in layer.params.ground).toBe(false);
  });

  test('focused object3d leaf panel has the row, beside Cast shadow', () => {
    const layer = {
      id: 'obj-leaf', type: 'object3d', name: 'Box', visible: true, parentId: null,
      params: { primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid', style: { penId: null, mapper: 'hatch', params: {} } },
    };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    window.Vectura.UI.Scene3DPanel.build(ui, layer, container);
    const labels = [...container.querySelectorAll('.vs3-lbl')].map((l) => l.textContent);
    expect(labels.indexOf('Takes shadow')).toBe(labels.indexOf('Cast shadow') + 1);
    click(container, 'Object receives shadows', 'off');
    expect(layer.params.shadow.receive).toBe(false);
    click(container, 'Object receives shadows', 'inherit');
    expect('receive' in layer.params.shadow).toBe(false);
  });

  test('focused ground leaf panel has the On/Off row', () => {
    const layer = { id: 'g1', type: 'sceneGround3d', name: 'Ground', visible: true, parentId: null, params: { enabled: true } };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    window.Vectura.UI.Scene3DPanel.build(ui, layer, container);
    click(container, 'Ground receives shadows', 'off');
    expect(layer.params.receiveShadows).toBe(false);
    click(container, 'Ground receives shadows', 'on');
    expect('receiveShadows' in layer.params).toBe(false);
  });
});
