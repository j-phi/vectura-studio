/**
 * U3 (fill-style review r3) — scene-tab honesty + Object 3D row pen.
 *
 *   - Tone ▸ Specular is disabled (with its reason) when no object in the
 *     scene draws a specular: PRH-027 keeps the curved specular stage off, so
 *     only faceted Hatch/Crosshatch fills read it (r3 §2c).
 *   - Tone ▸ Bands carries an (i) saying which fills read the bands.
 *   - Shadow ▸ Tone depth (shadowToneDepth, engine-read, never offered) is a
 *     row on the flat shadow build, removed under Layers and under No Tone.
 *   - Layers panel ▸ Assign pen on an Object 3D row routes that object's ink
 *     (r3 headline 3: it used to change only the row colour).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const fixtureParams = (objects, byObject) => ({
  sceneVersion: 1, seed: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0,
  objects,
  lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
  ground: { enabled: true },
  backdrop: { enabled: false },
  camera: { projection: 'orthographic', yaw: -30, pitch: -20, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  groups: [], assets: {},
  styleTable: { scene: { penId: null, mapper: 'none', params: {} }, byObject, byFace: {} },
});
const objOf = (id, primitive) => ({
  id, name: id, primitive, params: {},
  transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid',
});

describe('U3 — scene Tone / Shadow honesty', () => {
  let runtime; let window; let document;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ window, document } = runtime);
  });
  afterAll(() => runtime.cleanup());

  const mountScene = (primitive, mapper, toneLaw, shadow) => {
    const { UI } = window.Vectura;
    const params = fixtureParams([objOf('obj-1', primitive)], {
      'obj-1': { penId: null, mapper, params: { toneLaw } },
    });
    if (shadow) params.shadow = shadow;
    const layer = { id: 's3d-1', type: 'scene3d', name: 'Scene', visible: true, penId: 'pen-1', params };
    const ui = { app: { pushHistory: vi.fn(), regen: vi.fn() }, storeLayerParams: vi.fn() };
    const container = document.createElement('div');
    document.body.appendChild(container);
    UI.Scene3DPanel.build(ui, layer, container);
    return { layer, container };
  };
  const rowIn = (root, label) => Array.from(root.querySelectorAll('.vs3-row'))
    .find((r) => (r.querySelector('.vs3-lbl') || {}).textContent === label) || null;
  const tone = (c) => c.querySelector('.vs3-tone');
  const shadow = (c) => c.querySelector('.vs3-shadow');

  test('Specular is disabled with a reason when the only object is a curved sphere', () => {
    const { container, layer } = mountScene('sphere', 'hatch', 'ladder');
    const spec = rowIn(tone(container), 'Specular');
    expect(spec.classList.contains('is-disabled')).toBe(true);
    expect(spec.getAttribute('title')).toMatch(/PRH-027/);
    expect(rowIn(tone(container), 'Highlight size')).toBeNull();
    // A disabled row does not write.
    const off = Array.from(spec.querySelectorAll('button')).find((b) => b.textContent.trim() === 'Off');
    off.click();
    expect(layer.params.tone.specular.enabled).not.toBe(false);
  });

  test('Specular stays live for a box with Hatch + Ladder', () => {
    const { container } = mountScene('box', 'hatch', 'ladder');
    const spec = rowIn(tone(container), 'Specular');
    expect(spec.classList.contains('is-disabled')).toBe(false);
  });

  test('Specular is disabled on a box whose Fill Style is field-driven (maze)', () => {
    const { container } = mountScene('box', 'hatch', 'mazeFill');
    expect(rowIn(tone(container), 'Specular').classList.contains('is-disabled')).toBe(true);
  });

  test('Bands carries an (i) naming the fills that read it', () => {
    const { container } = mountScene('sphere', 'hatch', 'taperedEnds');
    const bands = rowIn(tone(container), 'Bands');
    const pop = bands.querySelector('.vs3-lawinfo-pop');
    expect(pop).toBeTruthy();
    expect(pop.textContent).toMatch(/No object in this scene/);
  });

  test('Shadow Tone depth: offered on the flat shadow and writes shadowToneDepth', () => {
    const { container } = mountScene('box', 'hatch', 'ladder');
    const row = rowIn(shadow(container), 'Tone depth');
    expect(row).toBeTruthy();
    expect(row.querySelector('input[type="range"]').value).toBe('0.75');
  });

  test('Shadow Tone depth is removed under Layers and under No Tone', () => {
    const layered = mountScene('box', 'hatch', 'ladder', { shadowLayers: true });
    expect(rowIn(shadow(layered.container), 'Tone depth')).toBeNull();
    const none = mountScene('box', 'hatch', 'ladder', { shadowToneLaw: 'none' });
    expect(rowIn(shadow(none.container), 'Tone depth')).toBeNull();
  });
});

describe('U3 — Layers panel Assign pen on an Object 3D row routes ink', () => {
  const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };
  let runtime; let window; let app;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    await new Promise((r) => setTimeout(r, 80));
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  test('picking a pen from the Object 3D row pen menu moves that object\'s fill to the pen', () => {
    const engine = app.engine;
    const gid = engine.addSceneTree();
    const group = engine.getLayerById(gid);
    const obj = engine.getLayerChildren(gid).find((k) => k.type === 'object3d');
    obj.params.style = { penId: null, mapper: 'hatch', params: { toneLaw: 'ladder' } };
    engine.computeAllDisplayGeometry();
    group.groupCollapsed = false;
    app.ui.renderLayers();
    const pens = window.Vectura.SETTINGS.pens;
    const target = pens.find((p) => p.id !== group.penId && p.id !== obj.penId);
    const card = window.document.querySelector(`[data-layer-id="${obj.id}"]`)
      || Array.from(window.document.querySelectorAll('.lvl-card')).find((c) => c.dataset.id === obj.id);
    expect(card).toBeTruthy();
    const opt = card.querySelector(`.pen-option[data-pen-id="${target.id}"]`);
    opt.click();
    expect(obj.penId).toBe(target.id);
    expect(obj.params.style.penId).toBe(target.id);
    const objFills = (group.scenePaths || []).filter((p) => p.meta && p.meta.kind === 'sceneFill'
      && p.meta.sceneTarget && p.meta.sceneTarget.objectId === obj.id);
    expect(objFills.length).toBeGreaterThan(0);
    objFills.forEach((p) => expect(p.meta.penId).toBe(target.id));
  });
});
