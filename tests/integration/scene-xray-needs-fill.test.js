/**
 * X-ray back-face controls appear only where back faces can actually be drawn.
 *
 * Jay, 2026-08-16: with X-ray genuinely on for a capsule — Back faces On, Back
 * density 0.40, Back line Dashed, Back pen Object pen — no back-face ink
 * rendered. The object was drawn with the WIREFRAME mapper.
 *
 * MECHANISM — x-ray shows the FAR SURFACE through the near one, so its whole
 * control set is FILL ink. scene3d.js emits the back-face family only for a
 * SURFACE-FILL mapper (hatch / crosshatch / contour / spiral / stipple): the
 * faceted path bails on `!SURFACE_FILL.has(style.mapper)`, and the curved path
 * only ever tags `line.back` inside SurfaceFill. Under None / Wireframe /
 * Contour slice the object has no surface to see through, so composed output is
 * byte-identical to solid — measured below on both a faceted and a curved
 * primitive — and all four rows are inert. They are now removed and replaced by
 * a note stating the reason, mirroring Shadow ▸ Angle under Follow light.
 *
 * This was NOT a dead binding, which is what it looked like from outside. The
 * final block pins each of the four controls against composed geometry so the
 * distinction stays provable, and so a future break is caught here rather than
 * by eye.
 *
 * MEASUREMENT — composed scene ink lives on `group.scenePaths`, never
 * `layer.paths`. Back-face ink is counted by `meta.sceneTarget.xrayBack`.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const FULL_STACK = {
  includeRenderer: true, includeUi: true, includeApp: true, includeMain: false, useIndexHtml: true,
};
const nextFrames = (ms = 80) => new Promise((r) => setTimeout(r, ms));

describe('Scene X-ray — back-face controls need a surface fill', () => {
  let runtime; let window; let document; let app; let engine; let renderer; let CB;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime(FULL_STACK);
    ({ window, document } = runtime);
    window.app = new window.Vectura.App();
    app = window.app;
    engine = app.engine;
    renderer = app.renderer;
    app.maxHistory = 100000;
    CB = window.Vectura.UI.ContextBar;
    await nextFrames();
  });
  afterAll(() => { runtime?.cleanup?.(); runtime = null; });

  const buildScene = (primitive) => {
    engine.layers = engine.layers.filter((l) => l.type !== 'scene3d' && !l.parentId);
    const gid = engine.addSceneTree();
    const obj = engine.getLayerChildren(gid).find((k) => k.type === 'object3d');
    if (primitive) obj.params.primitive = primitive;
    return { gid, group: engine.getLayerById(gid), obj };
  };

  const select = (gid, objectIds) => {
    renderer.setSelection([gid], gid);
    renderer.setSceneSelection({ layerId: gid, mode: 'object', objectIds, faceKeys: [], edgeKeys: [] });
    CB.restoreState();
  };

  // CONTRACT C — whole-style writes, no per-field merge across scopes, so the
  // caller assembles the full params bag from the resolved style.
  const setStyle = (gid, id, mapper, extra) => {
    const cur = renderer.getSceneObjectResolvedStyle(gid, id) || { params: {} };
    renderer.setSceneObjectStyle(gid, [id], {
      mapper, params: { ...(cur.params || {}), ...(extra || {}) },
    });
  };
  const xrayOn = (gid, id) => renderer.setSceneObjectField(gid, [id], 'visibility', 'xray');

  const host = () => CB.getContentHost();
  const pills = () => Array.from(host().querySelectorAll('.ctxbar-scene-field'));
  const pillByLabel = (t) => pills().find((f) => (f.querySelector('.ctxbar-text-fieldlabel') || {}).textContent === t);
  const openFly = () => document.querySelector('.ctxbar-scene-flyout.is-open');
  const rowCtl = (fly, label) => {
    const row = Array.from(fly.querySelectorAll('.ctxbar-fly-row'))
      .find((r) => (r.querySelector('.ctxbar-fly-label') || {}).textContent === label);
    return row ? row.querySelector('.ctxbar-fly-ctl') : null;
  };
  const flyNotes = (fly) => Array.from(fly.querySelectorAll('.ctxbar-fly-note')).map((n) => n.textContent);
  const outsideClick = () => {
    document.body.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
  };
  const BACK_ROWS = ['Back faces', 'Back density', 'Back line', 'Back pen'];

  const ownPaths = (group, objId) => {
    engine.computeAllDisplayGeometry();
    return (group.scenePaths || []).filter((p) => {
      const t = p && p.meta && p.meta.sceneTarget;
      return t && t.objectId === objId;
    });
  };
  const backPaths = (group, objId) => ownPaths(group, objId)
    .filter((p) => p.meta.sceneTarget.xrayBack === true);

  // ── the engine claim the UI note rests on ─────────────────────────────────
  // If this ever changes, the note is lying and this test says so first.
  describe('engine', () => {
    test.each([
      ['box', 'none'], ['box', 'wireframe'], ['box', 'contourSlice'],
      ['capsule', 'none'], ['capsule', 'wireframe'], ['capsule', 'contourSlice'],
    ])('a %s with mapper %s renders x-ray identically to solid (zero back-face ink)', (prim, mapper) => {
      const { gid, group, obj } = buildScene(prim);
      setStyle(gid, obj.id, mapper);

      renderer.setSceneObjectField(gid, [obj.id], 'visibility', 'solid');
      const solid = ownPaths(group, obj.id).length;
      xrayOn(gid, obj.id);
      expect(ownPaths(group, obj.id).length).toBe(solid);
      expect(backPaths(group, obj.id).length).toBe(0);
    });

    test.each(['box', 'capsule'])('a %s with a fill mapper DOES render back-face ink', (prim) => {
      const { gid, group, obj } = buildScene(prim);
      setStyle(gid, obj.id, 'hatch');
      xrayOn(gid, obj.id);
      expect(backPaths(group, obj.id).length).toBeGreaterThan(0);
    });
  });

  // ── the flyout ────────────────────────────────────────────────────────────
  describe('the X-ray flyout', () => {
    test('a WIREFRAME object in x-ray shows the mode segment, no back-face rows, and says why', () => {
      const { gid, obj } = buildScene('capsule');
      setStyle(gid, obj.id, 'wireframe');
      xrayOn(gid, obj.id);
      select(gid, [obj.id]);

      pillByLabel('X-ray').click();
      const fly = openFly();
      // The object property itself stays settable — `visibility` is persisted
      // and takes effect the moment a fill is chosen.
      expect(rowCtl(fly, 'X-ray')).toBeTruthy();
      // The four dead rows are gone…
      BACK_ROWS.forEach((label) => expect(rowCtl(fly, label)).toBeNull());
      // …and replaced by an explicit reason, not silence.
      const hint = window.Vectura.CONTEXT_BAR.sceneFlyouts.xray.needsFillHint;
      expect(typeof hint).toBe('string');
      expect(flyNotes(fly)).toContain(hint);
      outsideClick();
    });

    test('switching that object to a fill mapper brings the four rows back', () => {
      const { gid, obj } = buildScene('capsule');
      setStyle(gid, obj.id, 'hatch');
      xrayOn(gid, obj.id);
      select(gid, [obj.id]);

      pillByLabel('X-ray').click();
      const fly = openFly();
      BACK_ROWS.forEach((label) => expect(rowCtl(fly, label)).toBeTruthy());
      expect(flyNotes(fly)).not.toContain(window.Vectura.CONTEXT_BAR.sceneFlyouts.xray.needsFillHint);
      outsideClick();
    });

    test('x-ray OFF still shows only the mode segment plus its own hint', () => {
      const { gid, obj } = buildScene('capsule');
      setStyle(gid, obj.id, 'hatch');
      renderer.setSceneObjectField(gid, [obj.id], 'visibility', 'solid');
      select(gid, [obj.id]);

      pillByLabel('X-ray').click();
      const fly = openFly();
      expect(rowCtl(fly, 'Back faces')).toBeNull();
      expect(flyNotes(fly)).toContain(window.Vectura.CONTEXT_BAR.sceneFlyouts.xray.disabledHint);
      outsideClick();
    });
  });

  // ── the controls are genuinely bound (this was NOT a dead binding) ────────
  describe('under a fill mapper, every back-face control reaches the engine', () => {
    test('Back faces on/off gates the far-surface family', () => {
      const { gid, group, obj } = buildScene('capsule');
      xrayOn(gid, obj.id);
      setStyle(gid, obj.id, 'hatch', { xrayBackFaces: true });
      expect(backPaths(group, obj.id).length).toBeGreaterThan(0);
      setStyle(gid, obj.id, 'hatch', { xrayBackFaces: false });
      expect(backPaths(group, obj.id).length).toBe(0);
    });

    test('Back density changes how much far-surface ink is drawn', () => {
      const { gid, group, obj } = buildScene('capsule');
      xrayOn(gid, obj.id);
      setStyle(gid, obj.id, 'hatch', { xrayBackFaces: true, xrayBackDensity: 0.2 });
      const sparse = backPaths(group, obj.id).length;
      setStyle(gid, obj.id, 'hatch', { xrayBackFaces: true, xrayBackDensity: 1 });
      expect(backPaths(group, obj.id).length).toBeGreaterThan(sparse);
    });

    test('Back line type reaches the stroke treatment', () => {
      const { gid, group, obj } = buildScene('capsule');
      xrayOn(gid, obj.id);
      setStyle(gid, obj.id, 'hatch', { xrayBackFaces: true, xrayBackLineType: 'dashed' });
      const dashed = JSON.stringify(backPaths(group, obj.id)[0].meta.strokeDash);
      setStyle(gid, obj.id, 'hatch', { xrayBackFaces: true, xrayBackLineType: 'dotted' });
      const dotted = JSON.stringify(backPaths(group, obj.id)[0].meta.strokeDash);
      expect(dotted).not.toBe(dashed);
    });

    test('Back pen reaches the emitted meta', () => {
      const { gid, group, obj } = buildScene('capsule');
      xrayOn(gid, obj.id);
      setStyle(gid, obj.id, 'hatch', { xrayBackFaces: true, xrayBackPenId: 'pen-3' });
      expect([...new Set(backPaths(group, obj.id).map((p) => p.meta.penId))]).toEqual(['pen-3']);
    });
  });
});
