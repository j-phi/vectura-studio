/**
 * H3 — Scene3D light panel polish.
 *  1. A purely informational note under a control carries `.is-info` (subtle), never `.is-caveat`: the Shading slider's
 *     "follows Shading only in the mid-tones" note for a Fill Style that does so.
 *  2. The Light inspector shows a compact read-only readout: is the key light IN FRONT of or BEHIND the subject relative to
 *     the camera. It follows the light angle and the camera rotation.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const params = (over = {}) => ({
  sceneVersion: 1, seed: 0,
  objects: [{ id: 'obj-1', name: 'Sphere 1', primitive: 'sphere', params: { radius: 40 },
    transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }],
  lights: [{ id: 'sun', type: 'directional', azimuth: 330, elevation: 40, castShadows: true }],
  ground: { enabled: true }, backdrop: { enabled: false },
  camera: { projection: 'orthographic', yaw: -30, pitch: 20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  groups: [], assets: {},
  tone: { model: 'v2', enabled: true, bands: 3, darkness: 50 },
  styleTable: { scene: { penId: null, mapper: 'hatch', params: { toneLaw: 'ladder' } }, byObject: {}, byFace: {} },
  ...over,
});

describe('Scene3D light panel polish (H3)', () => {
  let runtime; let window; let document;
  beforeAll(async () => { runtime = await loadVecturaRuntime(); window = runtime.window; document = runtime.document; });
  afterAll(() => runtime.cleanup());

  const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));
  const commit = (input, v) => { input.value = String(v); fire(input, 'input'); fire(input, 'change'); };
  const mount = (over) => {
    const layer = { id: 's3d-1', type: 'scene3d', name: 'Scene 1', visible: true, penId: 'pen-1', params: params(over) };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    window.Vectura.UI.Scene3DPanel.build(ui, layer, container);
    return { layer, container };
  };

  test('Shading: the mid-tones note is an .is-info note (not a caveat) for a Fill Style that follows only mid-tones', () => {
    const { container } = mount({ styleTable: { scene: { penId: null, mapper: 'hatch', params: { toneLaw: 'mkDotScreen' } }, byObject: {}, byFace: {} } });
    const note = container.querySelector('[data-control="toneDarknessMidtones"]');
    expect(note).toBeTruthy();
    expect(note.classList.contains('vs3-lawnote')).toBe(true);
    expect(note.classList.contains('is-info')).toBe(true);
    expect(note.classList.contains('is-caveat')).toBe(false);
    expect(note.textContent).toMatch(/mid-tones/);
  });

  test('Shading: no mid-tones note for a Fill Style that follows Shading in full (Ladder)', () => {
    const { container } = mount();
    expect(container.querySelector('input.ctrl-slider[aria-label="Shading darkness"]')).toBeTruthy();
    expect(container.querySelector('[data-control="toneDarknessMidtones"]')).toBeFalsy();
  });

  test('Light readout: default key light (az 330 / el 40) reads IN FRONT; a rear azimuth reads BEHIND, live', () => {
    const { container, layer } = mount();
    fire(container.querySelector('.vs3-tree-light'), 'click');
    const out = () => container.querySelector('[data-control="lightFacing"]');
    expect(out()).toBeTruthy();
    expect(out().dataset.facing).toBe('front');
    expect(out().textContent).toMatch(/in front/i);
    expect(out().getAttribute('aria-label')).toMatch(/in front/i);
    commit(container.querySelector('input.ctrl-slider[aria-label="Light azimuth (degrees)"]'), 150);
    expect(layer.params.lights[0].azimuth).toBe(150);
    expect(out().dataset.facing).toBe('behind');
    expect(out().textContent).toMatch(/behind/i);
    expect(out().getAttribute('aria-label')).toMatch(/behind/i);
  });

  test('Light readout follows the camera: turning the scene round flips front/behind', () => {
    const { container, layer } = mount();
    fire(container.querySelector('.vs3-tree-light'), 'click');
    const out = container.querySelector('[data-control="lightFacing"]');
    expect(out.dataset.facing).toBe('front');
    layer.params.camera.yaw = 150;
    fire(container.querySelector('input.ctrl-slider[aria-label="Light elevation (degrees)"]'), 'input');
    expect(out.dataset.facing).toBe('behind');
  });
});

describe('Scene3D light leaf panel readout (H3)', () => {
  let runtime; let window; let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime({ includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true }); window = runtime.window; V = window.Vectura; });
  afterAll(() => runtime.cleanup());
  test('a sun leaf layer shows the readout, reading the parent scene camera', () => {
    const engine = new V.VectorEngine();
    const gid = engine.addSceneTree();
    const grp = engine.getLayerById(gid);
    const sun = engine.layers.find((l) => l.type === 'sceneLight3d');
    const ui = { app: { engine, pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const c = window.document.createElement('div'); window.document.body.appendChild(c);
    V.UI.Scene3DPanel.build(ui, sun, c);
    const out = c.querySelector('[data-control="lightFacing"]');
    expect(out).toBeTruthy();
    expect(out.dataset.facing).toBe('front');
    grp.params.camera.yaw = 150;
    c.querySelector('input.ctrl-slider[aria-label="Light elevation (degrees)"]').dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(out.dataset.facing).toBe('behind');
  });
});
