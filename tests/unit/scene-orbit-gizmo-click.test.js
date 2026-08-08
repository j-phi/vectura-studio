/**
 * Regression — clicking the 3D scene's ORBIT gizmo must not teleport it, and
 * must not deselect the scene.
 *
 * Live defect (Jay, v1.3.81): on a fresh "Add Layer → 3D Scene" the FIRST (and
 * only) visible gizmo is the orbit/rotation control, anchored just off the box's
 * top-right corner. Clicking it flung it far off-canvas to the right; clicking
 * it again at the new spot deselected the whole scene and the gizmo vanished.
 *
 * Root cause — an asymmetry between DRAW and HIT:
 *   - the draw path (`draw3DRotationControl`, renderer.js) is explicitly
 *     bounds-optional: a scene layer's geometry lives in scenePaths, so
 *     `getSelectionBounds([sceneGroup])` returns NULL, and the gizmo anchors off
 *     `_sceneGizmoAnchor` instead;
 *   - the `down()` hit path gated `hit3DRotationControl` behind a truthy
 *     `selectionBounds`. With null bounds the drawn gizmo was never hit-tested,
 *     so the click fell through to `_sceneDownSelect`, which picked the huge
 *     GROUND quad underneath. `_sceneGizmoAnchor` then anchors on the SELECTED
 *     object — the ground — whose top-right corner is hundreds of doc-units
 *     away: the teleport. The next click on the relocated gizmo was still not
 *     hit-tested, fell through to an empty-canvas pick, and deselected.
 *
 * Why the earlier tests missed it: every prior scene-gizmo test called
 * `hit3DRotationControl` / `getSceneObjectGizmo` / `_sceneDownSelect` DIRECTLY,
 * skipping `down()` — the exact place the guard lived. These tests drive the
 * real `down()` handler with a synthetic mouse event, which is the only way the
 * guard is exercised.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('3D scene orbit gizmo — a click must not move it or drop the selection', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  // A fresh scene TREE exactly as "Add Layer → 3D Scene" builds it: a scene
  // group + one box object3d child + a sun child + a ground child.
  const build = () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    engine.computeAllDisplayGeometry();
    const group = engine.getLayerById(gid);
    const child = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.app = { pushHistory: () => {}, render: () => {}, history: [{}, {}] };
    renderer.activeTool = 'select';
    renderer.ready = true;
    // State the app leaves after the Add-Layer gesture: the scene GROUP is the
    // sole selected layer and there is no scene sub-selection yet.
    renderer.setSelection([gid], gid);
    renderer.setSceneSelection(null);
    return { engine, renderer, gid, group, child };
  };

  // Synthetic left-button mousedown at a DOC-space point, routed through the
  // same worldToScreen the overlay uses. The jsdom canvas reports a 0,0 origin.
  const clickAt = (renderer, docPoint) => {
    const s = renderer.worldToScreen(docPoint.x, docPoint.y);
    const rect = renderer.canvas.getBoundingClientRect();
    const e = {
      clientX: s.x + rect.left,
      clientY: s.y + rect.top,
      button: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      cancelable: true,
      preventDefault() {},
      stopPropagation() {},
    };
    renderer.down(e);
    if (typeof renderer.up === 'function') renderer.up(e);
    return e;
  };

  // mousedown ONLY (no mouseup), so the armed drag state is still observable.
  const pressAt = (renderer, docPoint) => {
    const s = renderer.worldToScreen(docPoint.x, docPoint.y);
    const rect = renderer.canvas.getBoundingClientRect();
    renderer.down({
      clientX: s.x + rect.left,
      clientY: s.y + rect.top,
      button: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      cancelable: true,
      preventDefault() {},
      stopPropagation() {},
    });
  };

  const orbitCenter = (renderer) => {
    const sel = renderer.getSelectedLayers();
    const control = renderer.get3DRotationControl(sel[0], renderer.getSelectionBounds(sel));
    return control ? { x: control.center.x, y: control.center.y } : null;
  };

  test('a fresh scene draws an orbit gizmo even though the group has no 2D bounds', () => {
    const { renderer, gid } = build();
    // The precondition that made the gizmo un-hittable.
    expect(renderer.getSelectionBounds(renderer.getSelectedLayers())).toBeNull();
    const c = orbitCenter(renderer);
    expect(c).toBeTruthy();
    expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
    expect(renderer.getSelectedLayers().map((l) => l.id)).toEqual([gid]);
  });

  test('the orbit gizmo is HIT-TESTED at its own centre (the guard must not need bounds)', () => {
    const { renderer } = build();
    const c = orbitCenter(renderer);
    const s = renderer.worldToScreen(c.x, c.y);
    const hit = renderer.hit3DRotationControl(s.x, s.y, renderer.getSelectedLayers()[0], null);
    expect(hit).toBeTruthy();
    expect(hit.type).toBe('orbit');

    // …and `down()` must consume that hit rather than falling through to the
    // scene object pick. The armed rotation drag is the observable proof.
    pressAt(renderer, c);
    expect(renderer.rotation3DDrag).toBeTruthy();
    expect(renderer.rotation3DDrag.type).toBe('orbit');
  });

  test('clicking the orbit gizmo does NOT select the ground quad', () => {
    const { renderer } = build();
    const c = orbitCenter(renderer);
    clickAt(renderer, c);
    const sel = renderer.getSceneSelection();
    // Before the fix this was { mode:'object', objectIds:['ground'] }.
    const ids = (sel && sel.objectIds) || [];
    expect(ids).not.toContain('ground');
  });

  test('clicking the orbit gizmo does NOT move it (no teleport)', () => {
    const { renderer } = build();
    const before = orbitCenter(renderer);
    clickAt(renderer, before);
    const after = orbitCenter(renderer);
    expect(after).toBeTruthy();
    // Before the fix the anchor jumped from the box's corner to the ground
    // quad's corner — hundreds of doc units to the right.
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(1);
  });

  test('a second click on the orbit gizmo keeps the scene selected and the gizmo alive', () => {
    const { renderer, gid } = build();
    const c1 = orbitCenter(renderer);
    clickAt(renderer, c1);
    const c2 = orbitCenter(renderer);
    expect(c2).toBeTruthy();
    clickAt(renderer, c2);
    expect(renderer.getSelectedLayers().map((l) => l.id)).toEqual([gid]);
    expect(orbitCenter(renderer)).toBeTruthy();
  });

  // ── Compounding defect: the GROUND must never anchor the gizmo ────────────
  // Independent of the hit gate above. Even a DELIBERATE ground pick (click the
  // ground plane away from the gizmo) used to fling the orbit gizmo to the
  // ground quad's far corner, because _sceneGizmoAnchor honoured `ground` as a
  // selected object while getSceneObjectGizmo refuses it.
  test('_sceneGizmoAnchor ignores a `ground` selection (no fling)', () => {
    const { renderer, gid, group } = build();
    const base = renderer._sceneGizmoAnchor(group);
    expect(base).toBeTruthy();

    renderer.setSceneSelection({
      layerId: gid, mode: 'object', objectIds: ['ground'], faceKeys: [], edgeKeys: [],
    });
    const withGround = renderer._sceneGizmoAnchor(group);
    expect(withGround).toBeTruthy();
    // Before the fix the NE corner jumped by hundreds of doc units.
    expect(Math.hypot(withGround.ne.x - base.ne.x, withGround.ne.y - base.ne.y)).toBeLessThan(1);
  });

  test('deliberately selecting the ground does not move the orbit gizmo', () => {
    const { renderer, gid } = build();
    const before = orbitCenter(renderer);
    renderer.setSceneSelection({
      layerId: gid, mode: 'object', objectIds: ['ground'], faceKeys: [], edgeKeys: [],
    });
    const after = orbitCenter(renderer);
    expect(after).toBeTruthy();
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(1);
  });

  // ── Hover affordance ─────────────────────────────────────────────────────
  // The cursor path had the SAME asymmetry: a `!bounds` early return sat in
  // front of the rotation hit test, so the drawn gizmo gave no hover feedback on
  // a scene tree — which is why the failure felt arbitrary to the user.
  test('hovering the orbit gizmo on a scene tree sets the rotate cursor', () => {
    const { renderer } = build();
    expect(renderer.getSelectionBounds(renderer.getSelectedLayers())).toBeNull();
    const c = orbitCenter(renderer);
    const s = renderer.worldToScreen(c.x, c.y);
    const rect = renderer.canvas.getBoundingClientRect();

    const seen = [];
    const origSet = renderer.setCanvasCursor.bind(renderer);
    renderer.setCanvasCursor = (cursor, mode) => { seen.push({ cursor, mode }); return origSet(cursor, mode); };
    renderer.move({
      clientX: s.x + rect.left,
      clientY: s.y + rect.top,
      button: 0,
      buttons: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      cancelable: true,
      preventDefault() {},
    });
    expect(seen.some((c2) => c2.mode === 'rotate-3d')).toBe(true);
  });

  test('a click on empty canvas away from the gizmo still behaves normally', () => {
    const { renderer } = build();
    const c = orbitCenter(renderer);
    // Far from the gizmo — the orbit branch must not swallow this.
    const away = { x: c.x + 400, y: c.y + 400 };
    const s = renderer.worldToScreen(away.x, away.y);
    const hit = renderer.hit3DRotationControl(s.x, s.y, renderer.getSelectedLayers()[0], null);
    expect(hit).toBeNull();
  });
});
