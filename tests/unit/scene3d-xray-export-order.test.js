const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * X-ray back-face EXPORT order (fs-b2, companion to
 * scene3d-xray-paint-order.test.js). Canvas paint order is `layer.paths` /
 * `group.scenePaths` array order; SVG/export/plot order is
 * `UI.getExportSnapshot`, which buckets paths by EFFECTIVE pen in FIRST-SEEN
 * order (`seenGroupOrder` in ui-file-io.js) and, within one pen group, in
 * item/array order. A distinct x-ray back pen therefore only lands BEHIND the
 * front pen's group if the back-tagged geometry is pushed to the scene's
 * composed path array before the front-tagged geometry — the exact ordering
 * scene3d-xray-paint-order.test.js pins at the algorithm level. This file
 * drives the full engine + UI stack (engine.addSceneTree → getExportSnapshot)
 * to confirm the fix reaches the actual export, not just `generate()`'s
 * return value.
 */

const FULL_STACK = {
  includeRenderer: true,
  includeUi: true,
  includeApp: true,
  includeMain: false,
  useIndexHtml: true,
};

describe('Scene3D x-ray back-face EXPORT order (fs-b2)', () => {
  let runtime; let window; let app; let engine; let ui; let SETTINGS;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window } = runtime);
    app = new window.Vectura.App();
    window.app = app;
    engine = app.engine;
    ui = app.ui;
    SETTINGS = window.Vectura.SETTINGS;
    SETTINGS.cropExports = false;
    SETTINGS.truncate = false;
    SETTINGS.plotterOptimize = 0;
    SETTINGS.optimizationExport = false;
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  // Build a scene tree with ONE x-ray box, no ground/shadow noise, and an
  // explicit front/back pen pairing. `distinctBackPen` toggles whether the
  // back family gets its OWN pen (xrayBackPenId) or inherits the front pen —
  // the export bucketing behaves differently in each case (a separate <g> vs
  // shared-group item order), and both must come out back-before-front.
  const buildScene = (distinctBackPen) => {
    engine.layers.slice().forEach((l) => { try { engine.removeLayer(l.id); } catch (e) { /* noop */ } });
    engine.layers.length = 0;
    const groupId = engine.addSceneTree();
    const group = engine.getLayerById(groupId);
    group.params.tone = { ...group.params.tone, enabled: false };
    group.params.backdrop = { enabled: false };
    group.params.camera = {
      projection: 'orthographic', yaw: -20, pitch: 15, roll: 0,
      cameraDistance: 620, focalLength: 520, zoom: 1,
    };
    const kids = engine.getLayerDescendants(groupId);
    const groundKid = kids.find((l) => l.type === 'sceneGround3d');
    if (groundKid) groundKid.params.enabled = false;
    const lightKid = kids.find((l) => l.type === 'sceneLight3d');
    if (lightKid) lightKid.params.castShadows = false;
    const obj = kids.find((l) => l.type === 'object3d');
    obj.params.primitive = 'box';
    obj.params.params = { sx: 40, sy: 40, sz: 40 };
    obj.params.transform = { x: 0, y: 20, z: 0, yaw: 20, pitch: 15, roll: 0, scale: 1 };
    obj.params.visibility = 'xray';
    obj.params.style = {
      penId: 'pen-1',
      mapper: 'hatch',
      params: {
        fillAngle: 45,
        fillDensity: 60,
        ...(distinctBackPen ? { xrayBackPenId: 'pen-2' } : {}),
      },
    };
    engine.computeAllDisplayGeometry();
    return groupId;
  };

  test('scene really produced back-tagged x-ray fills (sanity)', () => {
    const groupId = buildScene(true);
    const group = engine.getLayerById(groupId);
    expect(Array.isArray(group.scenePaths)).toBe(true);
    const fills = group.scenePaths.filter((pp) => pp.meta && pp.meta.kind === 'sceneFill');
    expect(fills.some((pp) => pp.meta.sceneTarget && pp.meta.sceneTarget.xrayBack === true)).toBe(true);
    expect(fills.some((pp) => !(pp.meta.sceneTarget && pp.meta.sceneTarget.xrayBack === true))).toBe(true);
  });

  test('distinct back pen: the back-pen export group is emitted BEFORE the front-pen group', () => {
    buildScene(true);
    const snapshot = ui.getExportSnapshot();
    const backIdx = snapshot.groups.findIndex((g) => g.key === 'pen-2');
    const frontIdx = snapshot.groups.findIndex((g) => g.key === 'pen-1');
    expect(backIdx).toBeGreaterThanOrEqual(0);
    expect(frontIdx).toBeGreaterThanOrEqual(0);
    // First-seen order: the back pen's key must be registered before the
    // front pen's — that is what puts its <g> (plotted/drawn) BEHIND the
    // front pen's <g> in the exported document.
    expect(backIdx).toBeLessThan(frontIdx);
  });

  test('shared pen (no distinct back pen): back-tagged items precede front-tagged items within the one group', () => {
    buildScene(false);
    const snapshot = ui.getExportSnapshot();
    const group = snapshot.groups.find((g) => g.key === 'pen-1');
    expect(group).toBeTruthy();
    const fillItems = group.items.filter((it) => it.path && it.path.meta && it.path.meta.kind === 'sceneFill');
    const backIdxs = fillItems
      .map((it, i) => (it.path.meta.sceneTarget && it.path.meta.sceneTarget.xrayBack === true ? i : -1))
      .filter((i) => i >= 0);
    const frontIdxs = fillItems
      .map((it, i) => (it.path.meta.sceneTarget && it.path.meta.sceneTarget.xrayBack === true ? -1 : i))
      .filter((i) => i >= 0);
    expect(backIdxs.length).toBeGreaterThan(0);
    expect(frontIdxs.length).toBeGreaterThan(0);
    expect(Math.max(...backIdxs)).toBeLessThan(Math.min(...frontIdxs));
  });
});
