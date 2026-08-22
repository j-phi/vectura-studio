/**
 * Contextual Task Bar — scene TREE object context (RC2 regression guard).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `context-bar-scene-flyouts.test.js` builds a MONOLITH scene3d layer (a leaf
 * with inline `params.objects`) and puts THAT layer in `selectedLayerIds`. No
 * scene a user can build today has that shape: `engine.addLayer('scene3d')`
 * calls `addSceneTree()`, which produces a scene GROUP (type 'scene3d',
 * isGroup, containerRole 'scene') whose objects live on CHILD `object3d`
 * layers. Both real entry points — a canvas pick (`_sceneDownSelect`) and a
 * layer-row click (`mirrorChildToCanvas` in scene3d-panel.js) — select the
 * CHILD and point `sceneSelection.layerId` at the GROUP.
 *
 * `getContext()` required the scene layer itself to be in the selection, so on
 * every real tree scene the bar fell through to a plain layer context and the
 * Style / Shadow / Highlight / X-ray pills never mounted. The monolith-only
 * fixture is precisely why that shipped green.
 *
 * These tests therefore drive the REAL tree shape with the CHILD selected.
 * They fail on the base branch and pass after the getContext() fix.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
};
const nextFrames = (ms = 80) => new Promise((r) => setTimeout(r, ms));

describe('Contextual Task Bar — scene TREE object context (RC2)', () => {
  let runtime, window, document, app, CB;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    app.maxHistory = 100000;
    CB = window.Vectura.UI.ContextBar;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const host = () => CB.getContentHost();
  const pills = () => Array.from(host().querySelectorAll('.ctxbar-scene-field'));
  // fs-s1 made Style/Shadow/Highlight icon-only (no visible `.ctxbar-text-fieldlabel`
  // span) — select pills by their accessible name (aria-label), which
  // makeDropField always sets, rather than by visible text.
  const pillLabels = () => pills().map((f) => f.getAttribute('aria-label'));
  const pillByLabel = (t) => pills().find((f) => f.getAttribute('aria-label') === t);
  const openFly = () => document.querySelector('.ctxbar-scene-flyout.is-open');
  const rowCtl = (fly, label) => {
    const row = Array.from(fly.querySelectorAll('.ctxbar-fly-row'))
      .find((r) => (r.querySelector('.ctxbar-fly-label') || {}).textContent === label);
    return row ? row.querySelector('.ctxbar-fly-ctl') : null;
  };
  const outsideClick = () => {
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
  };

  const clearLayers = () => {
    outsideClick();
    app.engine.layers = [];
    app.renderer.setSelection([], null);
    app.renderer.setSceneSelection(null);
  };

  // The scene a USER builds: Add Layer → 3D Scene → addSceneTree().
  const buildTree = () => {
    clearLayers();
    const gid = app.engine.addLayer('scene3d');
    const group = app.engine.getLayerById(gid);
    const kids = app.engine.getLayerChildren(gid);
    const objChild = kids.find((l) => l.type === 'object3d');
    const lightChild = kids.find((l) => l.type === 'sceneLight3d');
    const groundChild = kids.find((l) => l.type === 'sceneGround3d');
    app.engine.computeAllDisplayGeometry();
    return { gid, group, objChild, lightChild, groundChild };
  };

  // The exact selection state BOTH real entry points produce for a tree object:
  // the CHILD layer is selected; sceneSelection names the GROUP + the child id
  // (identity contract: child layer id === scene object id).
  const selectChildLikeAPick = (gid, child) => {
    app.renderer.setSelection([child.id], child.id);
    app.renderer.setSceneSelection({
      layerId: gid, mode: 'object', objectIds: [child.id], faceKeys: [], edgeKeys: [],
    });
    CB.restoreState();
  };

  // Legacy inline monolith (the shape the OLD fixture used) — regression pin.
  const buildMonolith = () => {
    clearLayers();
    const scene = new window.Vectura.Layer('mono-scene', 'scene3d', 'Scene');
    scene.params = {
      ...scene.params,
      objects: [{
        id: 'obj-1', name: 'Box 1', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
        transform: { x: 0, y: 20, z: 0, yaw: 20, pitch: 12, roll: 0, scale: 1 }, visibility: 'solid',
      }],
      groups: [],
    };
    app.engine.layers.push(scene);
    app.engine.activeLayerId = scene.id;
    app.engine.generate(scene.id);
    app.renderer.setSelection([scene.id], scene.id);
    app.renderer.setSceneSelection({
      layerId: scene.id, mode: 'object', objectIds: ['obj-1'], faceKeys: [], edgeKeys: [],
    });
    CB.restoreState();
    return scene;
  };

  // ── 0. the tree shape is what the app really builds ────────────────────
  test('engine.addLayer("scene3d") builds a scene GROUP whose object lives on an object3d CHILD', () => {
    const { group, objChild, lightChild, groundChild } = buildTree();
    expect(group.type).toBe('scene3d');
    expect(group.isGroup).toBe(true);
    expect(group.containerRole).toBe('scene');
    expect(group.params.objects).toEqual([]);   // inline arrays are empty by design
    expect(objChild).toBeTruthy();
    expect(objChild.type).toBe('object3d');
    expect(lightChild).toBeTruthy();
    expect(groundChild).toBeTruthy();
  });

  // ── 1. THE REGRESSION — pills must mount with the CHILD selected ───────
  test('CHILD selected in a tree scene → scene-object context with Style/Shadow/Highlight/X-ray pills', () => {
    const { gid, objChild } = buildTree();
    selectChildLikeAPick(gid, objChild);

    const ctx = CB.getContext();
    expect(ctx.kind).toBe('scene-object');
    // The context must resolve to the scene GROUP, not the child, so every
    // downstream bridge call (layerId) targets the compositor owner.
    expect(ctx.primaryLayer.id).toBe(gid);

    const labels = pillLabels();
    ['Style', 'Shadow', 'Highlight', 'X-ray'].forEach((l) => expect(labels).toContain(l));
  });

  // ── 2. the Shadow flyout opens and binds to the right records ──────────
  test('Shadow ▾ opens on a tree scene; Cast writes the CHILD record, Style/Pen write the GROUP', () => {
    const { gid, group, objChild } = buildTree();
    selectChildLikeAPick(gid, objChild);

    const shadowPill = pillByLabel('Shadow');
    expect(shadowPill).toBeTruthy();
    shadowPill.click();
    const fly = openFly();
    expect(fly).toBeTruthy();
    ['Cast', 'Style', 'Pen', 'Density', 'Layers'].forEach((r) => {
      expect(rowCtl(fly, r)).toBeTruthy();
    });

    // Cast is PER-OBJECT → must land on the CHILD layer's params (tree scenes
    // have no inline objects[] for it to hide in).
    const castSeg = rowCtl(fly, 'Cast').querySelector('button[data-value="off"], [data-value="off"]');
    expect(castSeg).toBeTruthy();
    castSeg.click();
    expect(objChild.params.shadow.enabled).toBe(false);

    // Jay's ask verbatim — "configure the shadow line style as well as the
    // pen(s) used". Both are scene-scope, on the GROUP's params.shadow bag.
    const styleSel = rowCtl(openFly(), 'Style').querySelector('select');
    styleSel.value = 'dashed';
    styleSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(group.params.shadow.shadowLineType).toBe('dashed');

    const penSel = rowCtl(openFly(), 'Pen').querySelector('select');
    const penOpt = Array.from(penSel.options).find((o) => o.value);
    expect(penOpt).toBeTruthy();
    penSel.value = penOpt.value;
    penSel.dispatchEvent(new window.Event('change', { bubbles: true }));
    expect(group.params.shadow.shadowPenId).toBe(penOpt.value);

    outsideClick();
  });

  // ── 3. regression pin — the legacy monolith path still works ───────────
  test('legacy inline monolith (scene layer itself selected) still resolves to scene-object', () => {
    const scene = buildMonolith();
    const ctx = CB.getContext();
    expect(ctx.kind).toBe('scene-object');
    expect(ctx.primaryLayer.id).toBe(scene.id);
    const labels = pillLabels();
    ['Style', 'Shadow', 'Highlight', 'X-ray'].forEach((l) => expect(labels).toContain(l));
  });

  // ── 4. sibling child types resolve sanely ──────────────────────────────
  test('booleanGroup3d child selected (scene selection names it) → scene-object context, no throw', () => {
    const { gid } = buildTree();
    const bg = new window.Vectura.Layer('bool-child', 'booleanGroup3d', 'Boolean');
    bg.isGroup = true;
    bg.parentId = gid;
    app.engine.layers.push(bg);
    app.engine.computeAllDisplayGeometry();

    app.renderer.setSelection([bg.id], bg.id);
    app.renderer.setSceneSelection({
      layerId: gid, mode: 'object', objectIds: [bg.id], faceKeys: [], edgeKeys: [],
    });
    expect(() => CB.restoreState()).not.toThrow();
    expect(CB.getContext().kind).toBe('scene-object');
    expect(CB.getContext().primaryLayer.id).toBe(gid);
    // The flyout must survive a record-less target rather than throwing.
    expect(() => pillByLabel('Shadow').click()).not.toThrow();
    expect(openFly()).toBeTruthy();
    outsideClick();
  });

  test('sceneLight3d / sceneGround3d child selected → NO scene-object context (panel clears the scene selection)', () => {
    const { gid, lightChild, groundChild } = buildTree();
    [lightChild, groundChild].forEach((child) => {
      // scene3d-panel.js calls mirrorChildToCanvas(ui, layer, null) for both of
      // these, i.e. setSceneSelection(null) — no object is targeted, so the bar
      // must NOT claim a scene-object context.
      app.renderer.setSelection([child.id], child.id);
      app.renderer.setSceneSelection(null);
      CB.restoreState();
      expect(CB.getContext().kind).not.toBe('scene-object');
      expect(pillLabels()).not.toContain('Shadow');
    });
    expect(gid).toBeTruthy();
  });

  // ── 5. getContext() must stay safe for everything that is NOT 3D ───────
  test('non-3D contexts are unchanged (idle / single-path / group), even with a stale scene selection', () => {
    const { gid, objChild } = buildTree();

    // Idle.
    app.renderer.setSelection([], null);
    app.renderer.setSceneSelection(null);
    CB.restoreState();
    expect(CB.getContext().kind).toBe('idle');

    // A plain 2D layer selected while a STALE scene selection still points at
    // the tree must NOT be hijacked into a scene context.
    const shape = new window.Vectura.Layer('plain-shape', 'shape', 'Path');
    app.engine.layers.push(shape);
    app.renderer.setSelection([shape.id], shape.id);
    app.renderer.setSceneSelection({
      layerId: gid, mode: 'object', objectIds: [objChild.id], faceKeys: [], edgeKeys: [],
    });
    CB.restoreState();
    expect(CB.getContext().kind).not.toBe('scene-object');
    expect(CB.getContext().primaryLayer.id).toBe(shape.id);

    // A mixed selection (scene child + unrelated layer) also falls through.
    app.renderer.setSelection([objChild.id, shape.id], objChild.id);
    CB.restoreState();
    expect(CB.getContext().kind).not.toBe('scene-object');

    // A plain (non-scene) GROUP still reports 'group'.
    app.renderer.setSelection([], null);
    app.renderer.setSceneSelection(null);
    const grp = new window.Vectura.Layer('plain-group', 'group', 'Group');
    grp.isGroup = true;
    app.engine.layers.push(grp);
    shape.parentId = grp.id;
    app.renderer.setSelection([grp.id, shape.id], grp.id);
    CB.restoreState();
    expect(CB.getContext().kind).toBe('group');
    shape.parentId = null;
  });

  // ── 6. the fix emits ZERO new ink ──────────────────────────────────────
  test('mounting the scene context does not change the composed group.scenePaths', () => {
    const { gid, group, objChild } = buildTree();
    const sig = (g) => JSON.stringify((g.scenePaths || []).map((p) => (p.points || p).length ?? 0));
    app.engine.computeAllDisplayGeometry();
    const before = sig(group);
    expect((group.scenePaths || []).length).toBeGreaterThan(0);

    selectChildLikeAPick(gid, objChild);
    expect(CB.getContext().kind).toBe('scene-object');
    app.engine.computeAllDisplayGeometry();
    expect(sig(group)).toBe(before);
  });
});
