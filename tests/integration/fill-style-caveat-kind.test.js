/**
 * U5 — a Fill Style caveat that EXPLAINS intended behaviour (dutyConst's
 * "open paper in highlights is intentional") is informational, not an error.
 * Only a genuine limitation keeps the red `.is-caveat` warning.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = { includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true };
const nextFrames = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const styleTable = (byObject = {}) => ({ scene: { penId: null, mapper: 'none', params: {} }, byObject, byFace: {} });
const fixture = (toneLaw) => ({
  sceneVersion: 1, seed: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0,
  objects: [{ id: 'obj-1', name: 'Sphere 1', primitive: 'sphere', params: { sx: 40, sy: 40, sz: 40, detail: 16 },
    transform: { x: 0, y: 20, z: 0, yaw: 20, pitch: 12, roll: 0, scale: 1 }, visibility: 'solid' }],
  lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
  ground: { enabled: false }, backdrop: { enabled: false },
  camera: { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  groups: [], assets: {},
  styleTable: styleTable({ 'obj-1': { penId: null, mapper: 'hatch', params: { toneLaw } } }),
});

describe('Fill Style caveat kind (U5)', () => {
  let runtime, window, document, app, CB, R;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    CB = window.Vectura.UI.ContextBar;
    R = window.Vectura.SCENE3D_TONE_LAWS;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const flyFor = (toneLaw) => {
    app.engine.layers = app.engine.layers.filter((l) => l.type !== 'scene3d');
    const scene = new window.Vectura.Layer(`scene-ck-${toneLaw}`, 'scene3d', 'Scene');
    scene.params = { ...scene.params, ...fixture(toneLaw) };
    app.engine.layers.push(scene);
    app.engine.activeLayerId = scene.id;
    app.engine.generate(scene.id);
    app.renderer.setSelection([scene.id], scene.id);
    app.renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1'], faceKeys: [], edgeKeys: [] });
    CB.restoreState();
    Array.from(CB.getContentHost().querySelectorAll('.ctxbar-scene-field'))
      .find((f) => f.getAttribute('aria-label') === 'Style').click();
    return document.querySelector('.ctxbar-scene-flyout.is-open');
  };

  test('dutyConst (an explanation) is .is-info and not .is-caveat', () => {
    const fly = flyFor('dutyConst');
    expect(fly.querySelector('.ctxbar-fly-note.is-info')).toBeTruthy();
    expect(fly.querySelector('.ctxbar-fly-note.is-caveat')).toBeNull();
  });

  test('bundleSubNib (a real flood-to-black limitation) keeps .is-caveat', () => {
    const fly = flyFor('bundleSubNib');
    expect(fly.querySelector('.ctxbar-fly-note.is-caveat')).toBeTruthy();
    expect(fly.querySelector('.ctxbar-fly-note.is-info')).toBeNull();
  });

  test('every roster caveat carries a kind; no caveat, no kind', () => {
    R.IDS.forEach((id) => {
      const e = R.BY_ID[id];
      if (e.caveat) expect(['info', 'warning']).toContain(e.caveatKind);
      else expect(e.caveatKind).toBeNull();
    });
  });
});
