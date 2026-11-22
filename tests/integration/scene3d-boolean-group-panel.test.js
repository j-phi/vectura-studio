/**
 * B4 — the combined-shape (boolean group) panel carries the same Transform rows as an object: X/Y/Z, Yaw/Pitch/Roll, Scale
 * and Scale X/Y/Z. Edits write the group's own optional `transform`; returning to identity removes the key again.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('boolean group panel — Transform rows (B4)', () => {
  let runtime; let window; let document;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); ({ window, document } = runtime); });
  afterAll(() => runtime.cleanup());
  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

  const mount = () => {
    const layer = { id: 'bg-1', type: 'booleanGroup3d', name: 'Boolean 01', visible: true, isGroup: true, parentId: null, params: { op: 'subtract', style: { penId: null, mapper: 'wireframe', params: {} } } };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn(), engine: { getLayerChildren: () => [], getLayerById: () => null } }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    window.Vectura.UI.Scene3DPanel.build(ui, layer, container);
    return { layer, container };
  };
  const set = (container, label, value) => {
    const el = container.querySelector(`[aria-label="${label}"]`);
    expect(el).toBeTruthy();
    el.value = String(value);
    fire(el, 'input');
    fire(el, 'change');
  };

  test('has the full Transform row set, none written until edited', () => {
    const { layer, container } = mount();
    ['Position X (mm)', 'Position Y (mm)', 'Position Z (mm)', 'Yaw (degrees)', 'Pitch (degrees)', 'Roll (degrees)', 'Uniform scale', 'Scale X', 'Scale Y', 'Scale Z']
      .forEach((l) => expect(container.querySelector(`[aria-label="${l}"]`), l).toBeTruthy());
    expect(layer.params.transform).toBeUndefined();
  });

  test('move / rotate / scale rows write the group transform; back to identity removes it', () => {
    const { layer, container } = mount();
    set(container, 'Position X (mm)', 25);
    expect(layer.params.transform.x).toBe(25);
    set(container, 'Yaw (degrees)', 40);
    expect(layer.params.transform.yaw).toBe(40);
    set(container, 'Uniform scale', 2);
    expect(layer.params.transform.scale).toBe(2);
    set(container, 'Scale X', 3);
    expect(layer.params.transform.sx).toBe(3);
    expect(layer.params.transform.sy).toBe(2); // others seeded from the uniform base
    // undo it all
    set(container, 'Position X (mm)', 0);
    set(container, 'Yaw (degrees)', 0);
    set(container, 'Uniform scale', 1);
    ['Scale X', 'Scale Y', 'Scale Z'].forEach((l) => set(container, l, 1));
    expect(layer.params.transform).toBeUndefined();
  });

  test('Takes shadow label replaces the clipped long one on object panels', () => {
    const layer = { id: 'o1', type: 'object3d', name: 'Box', visible: true, parentId: null, params: { primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid', style: { penId: null, mapper: 'hatch', params: {} } } };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    window.Vectura.UI.Scene3DPanel.build(ui, layer, container);
    const labels = [...container.querySelectorAll('.vs3-lbl')].map((l) => l.textContent);
    expect(labels).toContain('Takes shadow');
    expect(labels).not.toContain('Receive shadows');
    expect(container.querySelector('.seg-ctrl[aria-label="Object receives shadows"]')).toBeTruthy();
  });
});
