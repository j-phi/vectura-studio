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
    // The whole file shares ONE app, so undo history accumulates across tests.
    // Its default cap (20) evicts old entries once enough writes pile up, which
    // would corrupt the `before + 1` delta assertions further down. Raise the cap
    // so eviction never masks a real regression (deltas are unchanged by this).
    app.maxHistory = 100000;
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
    // I22 adds the leading 'Shape' primitive-swap pill.
    expect(labels).toEqual(['Shape', 'Style', 'Shadow', 'Highlight', 'X-ray']);
  });

  test('Style ▾ opens, changes mapper (writes byObject + one undo), and STAYS OPEN through a slider edit', async () => {
    const scene = addSelectScene();
    pillByLabel('Style').click();
    let fly = openFly();
    expect(fly).toBeTruthy();
    expect(rowCtl(fly, 'Type')).toBeTruthy();

    // Change mapper → hatch: writes styleTable.byObject, one history entry.
    const before = app.history.length;
    const mapSel = rowCtl(fly, 'Type').querySelector('select');
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
    // The back-face rows are FILL controls and are now shown only for a
    // surface-fill mapper — under this fixture's default 'none' the object has
    // no surface to see through and x-ray output is identical to solid, so the
    // rows are removed and a note explains why (scene-xray-reachable.test.js
    // owns that case). Give the object a fill so this test keeps asserting what
    // it was written to assert: the rows appear the moment x-ray goes on.
    app.renderer.setSceneObjectStyle(scene.id, ['obj-1'], { mapper: 'hatch' });
    CB.restoreState();
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

  // I6 — Border relocated from the Highlight flyout to the Style flyout.
  test('Style ▾ Border toggle writes obj.border.enabled (I6: moved from Highlight)', async () => {
    const scene = addSelectScene();
    pillByLabel('Style').click();
    const fly = openFly();
    rowCtl(fly, 'Border').querySelector('.seg-opt[data-value="on"]').click();
    expect(obj(scene).border.enabled).toBe(true);
    // Border weight + pen revealed in place, still in the Style flyout.
    expect(rowCtl(openFly(), 'Weight')).toBeTruthy();
  });

  test('Highlight ▾ no longer carries the Border row (I6)', async () => {
    addSelectScene();
    pillByLabel('Highlight').click();
    const fly = openFly();
    expect(rowCtl(fly, 'Border')).toBeFalsy();
    // Treatment still lives here.
    expect(rowCtl(fly, 'Treatment')).toBeTruthy();
  });

  // ── "None" treatment (was "Keep") ─────────────────────────────────────────
  // Jay: the no-highlight choice must read "None", must mean no highlighting at
  // all, and must not offer Strength or Pen — they are inert there. The stored
  // param value is unchanged (see Vectura.SCENE_HIGHLIGHT.NONE_VALUE); only the
  // label and the row gating moved.
  const NONE = () => window.Vectura.SCENE_HIGHLIGHT.NONE_VALUE;
  const selectedLabel = (ctl) => {
    const sel = ctl.querySelector('select');
    return sel.options[sel.selectedIndex].textContent;
  };
  const setTreatment = (v) => {
    const sel = rowCtl(openFly(), 'Treatment').querySelector('select');
    sel.value = v;
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  };

  test('config: the no-highlight treatment is labelled "None", and both surfaces share one list', () => {
    const SH = window.Vectura.SCENE_HIGHLIGHT;
    expect(SH).toBeTruthy();
    const labels = SH.TREATMENTS.map((o) => o.label);
    expect(labels).toContain('None');
    expect(labels).not.toContain('Keep');
    expect(SH.TREATMENTS.find((o) => o.label === 'None').value).toBe(SH.NONE_VALUE);
    // Single source of truth — the ctxbar config reuses the shared list rather
    // than carrying its own copy (the panel reads it too).
    expect(window.Vectura.CONTEXT_BAR.sceneFlyouts.highlight.treatments).toBe(SH.TREATMENTS);
    // None has no configurable ink; every other treatment does (bar Blank).
    expect(SH.hasDetailControls(SH.NONE_VALUE)).toBe(false);
    expect(SH.hasDetailControls('blank')).toBe(false);
    expect(SH.hasDetailControls('sparse')).toBe(true);
    expect(SH.hasDetailControls('burst')).toBe(true);
  });

  test('Highlight ▾ None removes the Strength and Pen rows, and the engine accepts the written value', async () => {
    const scene = addSelectScene();
    pillByLabel('Highlight').click();
    setTreatment(NONE());
    const fly = openFly();
    expect(selectedLabel(rowCtl(fly, 'Treatment'))).toBe('None');
    expect(rowCtl(fly, 'Strength')).toBeFalsy();
    expect(rowCtl(fly, 'Pen')).toBeFalsy();
    // The value the UI writes must survive engine normalization — a UI writing
    // an unrecognized treatment would silently degrade to 'blank'.
    expect(styleTable(scene).byObject['obj-1'].params.highlightTreatment).toBe(NONE());
    expect(app.renderer.getSceneObjectResolvedStyle(scene.id, 'obj-1').params.highlightTreatment).toBe(NONE());
  });

  test('Highlight ▾ switching off None brings Strength and Pen back', async () => {
    addSelectScene();
    pillByLabel('Highlight').click();
    setTreatment(NONE());
    expect(rowCtl(openFly(), 'Strength')).toBeFalsy();
    setTreatment('sparse');
    expect(rowCtl(openFly(), 'Strength')).toBeTruthy();
    expect(rowCtl(openFly(), 'Pen')).toBeTruthy();
    // …and back off again.
    setTreatment(NONE());
    expect(rowCtl(openFly(), 'Strength')).toBeFalsy();
    expect(rowCtl(openFly(), 'Pen')).toBeFalsy();
  });

  test('a document saved with the legacy "keep" treatment still loads and reads None', async () => {
    const scene = addSelectScene();
    // Simulate a persisted document written before the rename.
    app.renderer.setSceneObjectStyle(scene.id, ['obj-1'], { params: { highlightTreatment: 'keep' } });
    CB.restoreState();
    pillByLabel('Highlight').click();
    const fly = openFly();
    expect(selectedLabel(rowCtl(fly, 'Treatment'))).toBe('None');
    expect(rowCtl(fly, 'Strength')).toBeFalsy();
    expect(rowCtl(fly, 'Pen')).toBeFalsy();
  });

  // I7 — when the treatment is "Alt fill" the flyout must reveal a mapper picker
  // (which alternate fill is drawn in the highlight region) + the density slider;
  // for any other treatment the mapper picker is hidden (like burst's controls).
  test('I7: config carries the alt-fill mapper option list', () => {
    const C = window.Vectura.CONTEXT_BAR.sceneFlyouts.highlight;
    expect(Array.isArray(C.altFillMappers)).toBe(true);
    expect(C.altFillMappers.map((o) => o.value))
      .toEqual(['hatch', 'crosshatch', 'contour', 'spiral', 'stipple']);
    expect(C.altFill.label).toBeTruthy();
  });

  test('I7: Alt fill treatment reveals the alt-fill mapper picker + density; hidden otherwise', async () => {
    const scene = addSelectScene();
    pillByLabel('Highlight').click();
    // Default treatment (blank/keep) → no alt-fill picker.
    expect(rowCtl(openFly(), 'Alt fill')).toBeFalsy();
    // Switch to a non-altFill treatment → still no picker.
    const sel0 = rowCtl(openFly(), 'Treatment').querySelector('select');
    sel0.value = 'burst';
    sel0.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(rowCtl(openFly(), 'Alt fill')).toBeFalsy();
    // Switch to Alt fill → picker + density appear, flyout stays open.
    const sel = rowCtl(openFly(), 'Treatment').querySelector('select');
    sel.value = 'altFill';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(styleTable(scene).byObject['obj-1'].params.highlightTreatment).toBe('altFill');
    const mapCtl = rowCtl(openFly(), 'Alt fill');
    expect(mapCtl).toBeTruthy();
    expect(rowCtl(openFly(), 'Strength')).toBeTruthy();
    // The picker exposes the five fill mappers.
    const opts = Array.from(mapCtl.querySelector('select').options).map((o) => o.value);
    expect(opts).toEqual(expect.arrayContaining(['hatch', 'crosshatch', 'contour', 'spiral', 'stipple']));
  });

  test('I7: changing the alt-fill mapper writes style.params.altFillMapper scoped to the selection', async () => {
    const scene = addSelectScene();
    app.renderer.setSceneObjectStyle(scene.id, ['obj-1'], { params: { highlightTreatment: 'altFill' } });
    CB.restoreState();
    pillByLabel('Highlight').click();
    const sel = rowCtl(openFly(), 'Alt fill').querySelector('select');
    sel.value = 'contour';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(styleTable(scene).byObject['obj-1'].params.altFillMapper).toBe('contour');
    // Scoped: the scene-wide style is untouched.
    expect((styleTable(scene).scene.params || {}).altFillMapper).toBeUndefined();
    expect(openFly()).toBeTruthy();
  });

  // ── Multi-select MIXED-value display (MSC-scene) ───────────────────────────
  const sceneParamsMulti = () => {
    const p = sceneParams();
    p.objects = [
      { id: 'obj-1', name: 'Box 1', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
        transform: { x: -30, y: 20, z: 0, yaw: 20, pitch: 12, roll: 0, scale: 1 }, visibility: 'solid' },
      { id: 'obj-2', name: 'Box 2', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
        transform: { x: 30, y: 20, z: 0, yaw: 20, pitch: 12, roll: 0, scale: 1 }, visibility: 'solid' },
    ];
    return p;
  };
  // Two objects selected; optionally seed each with a per-object style patch.
  const addSelectMulti = (styleA, styleB) => {
    app.engine.layers = app.engine.layers.filter((l) => l.type !== 'scene3d');
    const scene = new window.Vectura.Layer(`scene-multi-${app.engine.layers.length}`, 'scene3d', 'Scene');
    scene.params = { ...scene.params, ...sceneParamsMulti() };
    app.engine.layers.push(scene);
    app.engine.activeLayerId = scene.id;
    app.engine.generate(scene.id);
    if (styleA) app.renderer.setSceneObjectStyle(scene.id, ['obj-1'], styleA);
    if (styleB) app.renderer.setSceneObjectStyle(scene.id, ['obj-2'], styleB);
    app.renderer.setSelection([scene.id], scene.id);
    app.renderer.setSceneSelection({ layerId: scene.id, mode: 'object', objectIds: ['obj-1', 'obj-2'], faceKeys: [], edgeKeys: [] });
    CB.restoreState();
    return scene;
  };
  const MIXED = () => window.Vectura.CONTEXT_BAR.sceneFlyouts.mixed;

  test('Style ▾ shows MIXED when two objects have DIFFERENT mappers', async () => {
    addSelectMulti({ mapper: 'hatch', params: {} }, { mapper: 'stipple', params: {} });
    pillByLabel('Style').click();
    const ctl = rowCtl(openFly(), 'Type');
    expect(ctl.classList.contains('ctxbar-fly-mixed')).toBe(true);
    const sel = ctl.querySelector('select');
    expect(sel.value).toBe(MIXED().sentinel);
    // A "Mixed" sentinel option is present and neither object's real value leaks.
    const labels = Array.from(sel.options).map((o) => o.textContent);
    expect(labels).toContain(MIXED().label);
  });

  test('Style ▾ shows the SHARED value when two objects AGREE on the mapper', async () => {
    addSelectMulti({ mapper: 'hatch', params: {} }, { mapper: 'hatch', params: {} });
    pillByLabel('Style').click();
    const ctl = rowCtl(openFly(), 'Type');
    expect(ctl.classList.contains('ctxbar-fly-mixed')).toBe(false);
    expect(ctl.querySelector('select').value).toBe('hatch');
  });

  test('Editing from MIXED applies to BOTH objects, one undo, and resolves the display', async () => {
    const scene = addSelectMulti({ mapper: 'hatch', params: {} }, { mapper: 'stipple', params: {} });
    pillByLabel('Style').click();
    const before = app.history.length;
    const sel = rowCtl(openFly(), 'Type').querySelector('select');
    sel.value = 'contour';
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
    // Both objects now carry the picked mapper.
    expect(styleTable(scene).byObject['obj-1'].mapper).toBe('contour');
    expect(styleTable(scene).byObject['obj-2'].mapper).toBe('contour');
    expect(app.history.length).toBe(before + 1);
    // The flyout rebuilt in place → the control now shows the unified value.
    const ctl = rowCtl(openFly(), 'Type');
    expect(ctl.classList.contains('ctxbar-fly-mixed')).toBe(false);
    expect(ctl.querySelector('select').value).toBe('contour');
  });

  test('Shadow ▾ Cast shows MIXED when objects disagree on cast', async () => {
    const scene = addSelectMulti();
    // obj-1 explicit on, obj-2 explicit off → disagree.
    app.renderer.setSceneObjectField(scene.id, ['obj-1'], 'shadow.enabled', true);
    app.renderer.setSceneObjectField(scene.id, ['obj-2'], 'shadow.enabled', false);
    CB.restoreState();
    pillByLabel('Shadow').click();
    const ctl = rowCtl(openFly(), 'Cast');
    expect(ctl.classList.contains('ctxbar-fly-mixed')).toBe(true);
    expect(ctl.querySelector('.seg-opt[data-value="__scene-mixed__"]')).toBeTruthy();
  });

  test('single-selection is NOT flagged mixed (regression guard)', async () => {
    addSelectScene();
    pillByLabel('Style').click();
    const ctl = rowCtl(openFly(), 'Type');
    expect(ctl.classList.contains('ctxbar-fly-mixed')).toBe(false);
    expect(ctl.querySelector('select').value).not.toBe(MIXED().sentinel);
  });

  // ── I20 — pen writes are SCOPED to the ctxbar selection (never layer-wide) ──
  // The old scene ctxbar mounted the generic layer-writing pen chip, so picking
  // a pen while "1 face" was selected repainted EVERY object (it wrote
  // layer.penId). The scoped chip writes styleTable.byObject / byFace instead.
  const seedPens = () => {
    window.Vectura.SETTINGS.pens = [
      { id: 'pen-a', name: 'Pen A', color: '#ff0000', width: 0.3 },
      { id: 'pen-b', name: 'Pen B', color: '#00ff00', width: 0.3 },
    ];
  };
  const penChip = () => host().querySelector('.ctxbar-scene-pen-chip');
  const penFly = () => document.querySelector('.ctxbar-scene-pen-flyout.is-open');
  const pickPen = (name) => Array.from(penFly().querySelectorAll('.ctxbar-scene-pen-row'))
    .find((r) => r.textContent.includes(name)).click();

  const addSelectSceneMulti = (mode, sel) => {
    app.engine.layers = app.engine.layers.filter((l) => l.type !== 'scene3d');
    const scene = new window.Vectura.Layer(`scene-scope-${app.engine.layers.length}`, 'scene3d', 'Scene');
    scene.params = { ...scene.params, ...sceneParamsMulti() };
    app.engine.layers.push(scene);
    app.engine.activeLayerId = scene.id;
    app.engine.generate(scene.id);
    app.renderer.setSelection([scene.id], scene.id);
    app.renderer.setSceneSelection({ layerId: scene.id, mode, objectIds: [], faceKeys: [], edgeKeys: [], ...sel });
    CB.restoreState();
    return scene;
  };

  test('I20: FACE pen chip writes byFace only — layer pen + other object untouched', async () => {
    seedPens();
    const scene = addSelectSceneMulti('face', { faceKeys: ['obj-1/2'] });
    expect(CB.getContext().kind).toBe('scene-face');
    const chip = penChip();
    expect(chip).toBeTruthy();            // scoped chip present (the global chip is gone)
    chip.click();
    expect(penFly()).toBeTruthy();
    const penBefore = scene.penId; // fresh layer carries a default pen
    const before = app.history.length;
    pickPen('Pen A');
    // Only the selected face carries the pen; the scene-wide layer pen is untouched.
    expect(scene.params.styleTable.byFace['obj-1/2'].penId).toBe('pen-a');
    expect(scene.penId).toBe(penBefore);
    // Neither obj-1 (as a whole) nor obj-2 resolve to the picked pen.
    expect(app.renderer.getSceneObjectResolvedStyle(scene.id, 'obj-1').penId).toBeFalsy();
    expect(app.renderer.getSceneObjectResolvedStyle(scene.id, 'obj-2').penId).toBeFalsy();
    expect(app.history.length).toBe(before + 1);
  });

  test('I20: OBJECT pen chip writes byObject only — other object unchanged', async () => {
    seedPens();
    const scene = addSelectSceneMulti('object', { objectIds: ['obj-1'] });
    expect(CB.getContext().kind).toBe('scene-object');
    const penBefore = scene.penId;
    penChip().click();
    pickPen('Pen B');
    expect(scene.params.styleTable.byObject['obj-1'].penId).toBe('pen-b');
    expect(scene.penId).toBe(penBefore);
    expect(app.renderer.getSceneObjectResolvedStyle(scene.id, 'obj-2').penId).toBeFalsy();
  });

  // ── I22 — swap the selected object's primitive from the ctxbar Shape pill. ──
  test('I22: Shape pill swaps the object primitive (one undo)', async () => {
    const scene = addSelectScene();       // obj-1 is a box
    expect(obj(scene).primitive).toBe('box');
    const shapeField = pillByLabel('Shape');
    expect(shapeField).toBeTruthy();
    shapeField.click();
    const fly = document.querySelector('.ctxbar-scene-shape-flyout.is-open');
    expect(fly).toBeTruthy();
    const before = app.history.length;
    Array.from(fly.querySelectorAll('.ctxbar-menu-item')).find((i) => i.textContent === 'Sphere').click();
    expect(obj(scene).primitive).toBe('sphere');
    expect(app.history.length).toBe(before + 1);
  });
});
