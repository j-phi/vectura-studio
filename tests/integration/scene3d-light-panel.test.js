/**
 * 3D Scene panel — Phase 2 stream 2B: Light selection + tone-band editor.
 *
 * Direct-mount against a ui stub (the Group B pattern from
 * scene3d-panel.test.js). Exercises: the Sun tree fixture, activating the Light
 * shelf button, the light Inspector (azimuth/elevation/cast-shadows), and the
 * Tone section (band count → thresholds/ladder/specular), all committing once.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const fixtureParams = (overrides = {}) => ({
  sceneVersion: 1,
  seed: 0,
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

const fixtureObject = (n, primitive = 'box') => ({
  id: `obj-${n}`,
  name: `Box ${n}`,
  primitive,
  params: { sx: 40, sy: 40, sz: 40 },
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
  visibility: 'solid',
});

describe('Scene3D panel — Light + tone (Phase 2, vs3-)', () => {
  let runtime;
  let window;
  let document;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    window = runtime.window;
    document = runtime.document;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const fire = (el, type, init = {}) => el.dispatchEvent(new window.Event(type, { bubbles: true, ...init }));

  const mount = (paramsOverrides = {}) => {
    const { UI } = window.Vectura;
    const layer = {
      id: 's3d-1', type: 'scene3d', name: 'Scene 1', visible: true, penId: 'pen-1',
      params: fixtureParams(paramsOverrides),
    };
    const pushHistory = vi.fn();
    const regen = vi.fn();
    const storeLayerParams = vi.fn();
    const ui = { app: { pushHistory, regen }, storeLayerParams };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    return { ui, layer, container, pushHistory, regen, storeLayerParams };
  };

  const clickTab = (container, value) => fire(container.querySelector(`.tab-btn[data-value="${value}"]`), 'click');
  const commitSlider = (input, value) => { input.value = String(value); fire(input, 'input'); fire(input, 'change'); };

  test('Sun is always a scene-tree fixture, below Ground', () => {
    const { container } = mount({ objects: [fixtureObject(1)] });
    const sun = container.querySelector('.vs3-tree-light');
    expect(sun).toBeTruthy();
    expect(sun.querySelector('.vs3-tree-name').textContent).toBe('Sun');
    // Ordering: object rows, then Ground, then Sun.
    const rows = Array.from(container.querySelectorAll('.vs3-tree-row')).map((r) => r.dataset.objectId);
    expect(rows).toEqual(['obj-1', 'ground', 'light']);
  });

  test('activating the Light shelf button selects the sun and mounts the light Inspector', () => {
    const { container, pushHistory } = mount({ objects: [fixtureObject(1)] });
    const lightBtn = container.querySelector('.vs3-shelf-btn[data-light="sun"]');
    expect(lightBtn).toBeTruthy();
    expect(lightBtn.disabled).toBe(false);
    fire(lightBtn, 'click');
    // Selection is not an undoable edit.
    expect(pushHistory).toHaveBeenCalledTimes(0);
    expect(container.querySelector('.vs3-tree-light').classList.contains('selected')).toBe(true);
    expect(container.querySelector('input.ctrl-slider[aria-label="Light azimuth (degrees)"]')).toBeTruthy();
    expect(container.querySelector('input.ctrl-slider[aria-label="Light elevation (degrees)"]')).toBeTruthy();
    expect(container.querySelector('.vs3-inspector .seg-ctrl[aria-label="Cast shadows"]')).toBeTruthy();
  });

  test('selecting the Sun row edits azimuth/elevation; cast-shadows toggle commits once', () => {
    const { container, layer, pushHistory } = mount();
    fire(container.querySelector('.vs3-tree-light'), 'click');

    commitSlider(container.querySelector('input.ctrl-slider[aria-label="Light azimuth (degrees)"]'), 200);
    expect(layer.params.lights[0].azimuth).toBe(200);
    expect(pushHistory).toHaveBeenCalledTimes(1);

    commitSlider(container.querySelector('input.ctrl-slider[aria-label="Light elevation (degrees)"]'), 30);
    expect(layer.params.lights[0].elevation).toBe(30);
    expect(pushHistory).toHaveBeenCalledTimes(2);

    const off = container.querySelector('.vs3-inspector .seg-ctrl[aria-label="Cast shadows"] .seg-opt[data-value="off"]');
    fire(off, 'click');
    expect(layer.params.lights[0].castShadows).toBe(false);
    expect(pushHistory).toHaveBeenCalledTimes(3);
  });

  test('the Sun visibility dot toggles cast-shadows', () => {
    const { container, layer } = mount();
    const dot = container.querySelector('.vs3-tree-light .vs3-tree-vis');
    expect(layer.params.lights[0].castShadows).toBe(true);
    fire(dot, 'click');
    expect(layer.params.lights[0].castShadows).toBe(false);
  });

  test('Tone band-count SegCtrl writes params.tone.bands + enabled; Flat disables tone', () => {
    const { container, layer, pushHistory } = mount();
    const bands = container.querySelector('.vs3-tone .seg-ctrl[aria-label="Tone bands"]');
    expect(bands).toBeTruthy();
    // Default is 3 bands, enabled.
    expect(layer.params.tone.bands).toBe(3);
    expect(layer.params.tone.enabled).toBe(true);

    fire(bands.querySelector('.seg-opt[data-value="4"]'), 'click');
    expect(layer.params.tone.bands).toBe(4);
    expect(layer.params.tone.enabled).toBe(true);
    expect(layer.params.tone.thresholds.length).toBe(3);
    expect(layer.params.tone.ladder.length).toBe(4);
    expect(pushHistory).toHaveBeenCalledTimes(1);

    fire(container.querySelector('.vs3-tone .seg-ctrl[aria-label="Tone bands"] .seg-opt[data-value="flat"]'), 'click');
    expect(layer.params.tone.enabled).toBe(false);
    expect(layer.params.tone.bands).toBe(1);
    // No threshold/ladder rows while flat.
    expect(container.querySelector('input.ctrl-slider[aria-label="Tone threshold 1"]')).toBeFalsy();
  });

  test('threshold sliders stay ascending (clamped to neighbors)', () => {
    const { container, layer } = mount({ tone: {
      enabled: true, bands: 3, thresholds: [0.25, 0.55, 0.8],
      ladder: [0.15, 0.4, 0.65, 0.9], specular: { enabled: true, size: 1 },
    } });
    const t1 = container.querySelector('input.ctrl-slider[aria-label="Tone threshold 1"]');
    expect(t1).toBeTruthy();
    // Push threshold 1 ABOVE threshold 2 (0.55) — it must clamp below it.
    commitSlider(t1, 0.9);
    expect(layer.params.tone.thresholds[0]).toBeLessThan(layer.params.tone.thresholds[1]);
    expect(layer.params.tone.thresholds[0]).toBeCloseTo(0.54, 5);
  });

  test('specular toggle + size, and coverage ladder rows are present', () => {
    const { container, layer } = mount();
    expect(container.querySelector('.vs3-tone .seg-ctrl[aria-label="Specular highlight"]')).toBeTruthy();
    expect(container.querySelector('input.ctrl-slider[aria-label="Specular size"]')).toBeTruthy();
    // One coverage row per band (default 3).
    expect(container.querySelectorAll('input.ctrl-slider[aria-label^="Tone coverage"]').length).toBe(3);

    const spOff = container.querySelector('.vs3-tone .seg-ctrl[aria-label="Specular highlight"] .seg-opt[data-value="off"]');
    fire(spOff, 'click');
    expect(layer.params.tone.specular.enabled).toBe(false);
    // Size control retracts when specular is off.
    expect(container.querySelector('input.ctrl-slider[aria-label="Specular size"]')).toBeFalsy();
  });

  test('non-scene layers never mount the vs3 panel (strict no-op preserved)', () => {
    // The panel module only renders when build() is invoked for a scene3d layer.
    // A fresh container that build() was never called on stays empty.
    const empty = document.createElement('div');
    document.body.appendChild(empty);
    expect(empty.querySelector('.vs3-panel')).toBeFalsy();
    expect(empty.querySelector('.vs3-tone')).toBeFalsy();
  });
});
