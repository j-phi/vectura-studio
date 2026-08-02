/**
 * Contextual Task Bar — 3D Scene Studio object flyouts (ask #8).
 *
 * Selecting a scene3d object morphs the bar to add four PERSISTENT dropdown
 * pills: Style / Shadow / Highlight / X-ray. Each opens a flyout that stays open
 * until you click elsewhere (or press Escape) — crucially it does NOT tear down
 * mid-edit (a mapper switch or slider drag), because edits write straight
 * through the renderer bridges + regen and never call restoreState().
 *
 * RGR: these assertions reference the new pills, the renderer bridges
 * (setSceneObjectStyle / setSceneObjectField / getSceneObjectResolvedStyle),
 * the border field, and the CONTEXT_BAR.sceneFlyouts config — none exist on the
 * base branch, so this whole file fails before the unit and passes after.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
};
const nextFrames = (ms = 80) => new Promise((r) => setTimeout(r, ms));

const sceneParams = () => ({
  sceneVersion: 1, seed: 0,
  objects: [
    { id: 'obj-1', name: 'Box 1', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
      transform: { x: 0, y: 20, z: 0, yaw: 20, pitch: 12, roll: 0, scale: 1 }, visibility: 'solid' },
  ],
  lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
  ground: { enabled: false }, backdrop: { enabled: false },
  camera: { projection: 'orthographic', yaw: -20, pitch: 15, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
  groups: [], assets: {},
  styleTable: { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} },
});

describe('Contextual Task Bar — scene-object flyouts (ask #8)', () => {
  let runtime, window, document, app, CB;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    CB = window.Vectura.UI.ContextBar;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const host = () => CB.getContentHost();

  const addSelectScene = () => {
    // Fresh scene layer, real params, real algorithm → generate produces paths.
    app.engine.layers = app.engine.layers.filter((l) => l.type !== 'scene3d');
    const scene = new window.Vectura.Layer(`scene-fly-${app.engine.layers.length}`, 'scene3d', 'Scene');
    scene.params = { ...scene.params, ...sceneParams() };
    app.engine.layers.push(scene);
    app.engine.activeLayerId = scene.id;
    app.engine.generate(scene.id);
    app.renderer.setSelection([scene.id], scene.id);
    app.renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1'], faceKeys: [], edgeKeys: [] });
    CB.restoreState();
    return scene;
  };

  const pills = () => Array.from(host().querySelectorAll('.ctxbar-scene-field'));
  const pillByLabel = (text) => pills().find((f) => (f.querySelector('.ctxbar-text-fieldlabel') || {}).textContent === text);
  const openFly = () => document.querySelector('.ctxbar-scene-flyout.is-open');
  const rowCtl = (fly, label) => {
    const row = Array.from(fly.querySelectorAll('.ctxbar-fly-row'))
      .find((r) => (r.querySelector('.ctxbar-fly-label') || {}).textContent === label);
    return row ? row.querySelector('.ctxbar-fly-ctl') : null;
  };
  const styleTable = (scene) => scene.params.styleTable;
  const obj = (scene) => scene.params.objects[0];
  const outsideClick = () => {
    // The global outside-click handler listens for 'pointerdown' (capture);
    // jsdom has no PointerEvent constructor, so synthesize the typed MouseEvent.
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
  };

  test('config: sceneFlyouts + pill labels live in CONTEXT_BAR', () => {
    const C = window.Vectura.CONTEXT_BAR;
    expect(C.sceneFlyouts.style.mappers.length).toBeGreaterThan(0);
    expect(C.buttons.sceneStyle.label).toBe('Style');
    expect(C.buttons.sceneXray.label).toBe('X-ray');
  });

  test('renderer bridges exist', () => {
    ['setSceneObjectStyle', 'setSceneObjectField', 'setSceneParam',
      'getSceneObjectResolvedStyle', 'getSceneObjectRecord'].forEach((m) => {
      expect(typeof app.renderer[m]).toBe('function');
    });
  });

  test('selecting a scene object renders the four flyout pills', async () => {
    addSelectScene();
    expect(CB.getContext().kind).toBe('scene-object');
    const labels = pills().map((f) => f.querySelector('.ctxbar-text-fieldlabel').textContent);
    expect(labels).toEqual(['Style', 'Shadow', 'Highlight', 'X-ray']);
  });

  test('Style ▾ opens, changes mapper (writes byObject + one undo), and STAYS OPEN through a slider edit', async () => {
    const scene = addSelectScene();
    pillByLabel('Style').click();
    let fly = openFly();
    expect(fly).toBeTruthy();
    expect(rowCtl(fly, 'Fill')).toBeTruthy();

    // Change mapper → hatch: writes styleTable.byObject, one history entry.
    const before = app.history.length;
    const mapSel = rowCtl(fly, 'Fill').querySelector('select');
    mapSel.value = 'hatch';
    mapSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(styleTable(scene).byObject['obj-1'].mapper).toBe('hatch');
    expect(app.history.length).toBe(before + 1);

    // The flyout rebuilt in place (Density appeared) but did NOT close.
    fly = openFly();
    expect(fly).toBeTruthy();
    const densCtl = rowCtl(fly, 'Density');
    expect(densCtl).toBeTruthy();

    // Drag Density — flyout must survive the edit (no teardown) and a rAF tick.
    const range = densCtl.querySelector('input[type="range"]');
    range.value = '80';
    range.dispatchEvent(new window.Event('input', { bubbles: true }));
    range.dispatchEvent(new window.Event('change', { bubbles: true }));
    await nextFrames();
    expect(openFly()).toBeTruthy();
    expect(styleTable(scene).byObject['obj-1'].params.fillDensity).toBe(80);
  });

  test('clicking outside closes the open flyout', async () => {
    addSelectScene();
    pillByLabel('Style').click();
    expect(openFly()).toBeTruthy();
    outsideClick();
    expect(openFly()).toBeFalsy();
  });

  test('Shadow ▾ cast toggle writes obj.shadow.enabled', async () => {
    const scene = addSelectScene();
    pillByLabel('Shadow').click();
    const fly = openFly();
    const seg = rowCtl(fly, 'Cast');
    seg.querySelector('.seg-opt[data-value="off"]').click();
    expect(obj(scene).shadow.enabled).toBe(false);
    expect(openFly()).toBeTruthy(); // still open
  });

  test('X-ray ▾ on/off flips object visibility', async () => {
    const scene = addSelectScene();
    pillByLabel('X-ray').click();
    const fly = openFly();
    rowCtl(fly, 'X-ray').querySelector('.seg-opt[data-value="xray"]').click();
    expect(obj(scene).visibility).toBe('xray');
    // Rebuilt in place, back-face controls now present, flyout still open.
    expect(rowCtl(openFly(), 'Back faces')).toBeTruthy();
  });

  test('Highlight ▾ treatment writes style.params.highlightTreatment', async () => {
    const scene = addSelectScene();
    pillByLabel('Highlight').click();
    const fly = openFly();
    const sel = rowCtl(fly, 'Treatment').querySelector('select');
    sel.value = 'burst';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(styleTable(scene).byObject['obj-1'].params.highlightTreatment).toBe('burst');
  });

  test('Highlight ▾ Border toggle writes obj.border.enabled', async () => {
    const scene = addSelectScene();
    pillByLabel('Highlight').click();
    const fly = openFly();
    rowCtl(fly, 'Border').querySelector('.seg-opt[data-value="on"]').click();
    expect(obj(scene).border.enabled).toBe(true);
    // Border weight + pen revealed in place.
    expect(rowCtl(openFly(), 'Weight')).toBeTruthy();
  });
});
