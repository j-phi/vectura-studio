/**
 * B4 — a combined shape (booleanGroup3d) has the same move / rotate / scale gizmo as an object. Drags write the group's
 * own optional `transform`, one undo entry per gesture, Escape restores the bag to absent, and the operands keep their own
 * transforms.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('boolean group gizmo (B4)', () => {
  let runtime;
  let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime({ includeRenderer: true }); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  const build = () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    const a = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    const bId = engine.addObjectToScene(gid, 'sphere');
    const bg = engine.createBooleanGroupFromSelection([a.id, bId]);
    engine.generate(gid);
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
    const pushHistory = vi.fn();
    renderer.app = { pushHistory, history: [{}, {}], ui: { buildControls() {}, updateFormula() {} } };
    renderer.draw = () => {}; renderer.updateCursor = () => {};
    renderer.showDragTooltip = () => {}; renderer.hideDragTooltip = () => {};
    renderer.selectedLayerIds = new Set([bg]); renderer.selectedLayerId = bg;
    renderer.setSceneSelection({ layerId: gid, mode: 'object', objectIds: [bg], faceKeys: [], edgeKeys: [] });
    return { engine, renderer, gid, bg, group: engine.getLayerById(gid), bl: engine.getLayerById(bg), a, bId };
  };

  const grab = (renderer, group, type, axis) => {
    const giz = renderer.getSceneObjectGizmo(group);
    const ax = giz.axes.find((x) => x.key === axis);
    const pt = type === 'move' ? ax.tip : (type === 'scale' ? ax.scaleBox : ax.ring[3]);
    const start = renderer.worldToScreen(pt.x, pt.y);
    const hit = renderer.hitSceneObjectGizmo(start.x, start.y, group);
    expect(hit && hit.type).toBe(type);
    expect(renderer.beginSceneObjectGizmoDrag(hit, { clientX: start.x, clientY: start.y })).toBe(true);
    return start;
  };

  test('a selected combined shape shows the gizmo, centred on its ink', () => {
    const { renderer, group, bg } = build();
    const giz = renderer.getSceneObjectGizmo(group);
    expect(giz).toBeTruthy();
    expect(giz.objId).toBe(bg);
    expect(Number.isFinite(giz.center.x)).toBe(true);
  });

  test('the move arrow writes the group transform, leaves operands alone, one undo entry', () => {
    const { renderer, group, bl, a, bId, engine } = build();
    const aBefore = JSON.stringify(a.params.transform);
    const bBefore = JSON.stringify(engine.getLayerById(bId).params.transform);
    expect(bl.params.transform).toBeUndefined();
    const start = grab(renderer, group, 'move', 'x');
    renderer.app.pushHistory.mockClear();
    renderer._applySceneObjectGizmoDrag({ clientX: start.x + 25, clientY: start.y });
    renderer._applySceneObjectGizmoDrag({ clientX: start.x + 40, clientY: start.y });
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);
    expect(Math.abs(bl.params.transform.x)).toBeGreaterThan(5);
    expect(JSON.stringify(a.params.transform)).toBe(aBefore);
    expect(JSON.stringify(engine.getLayerById(bId).params.transform)).toBe(bBefore);
    renderer._endSceneObjectGizmoDrag();
  });

  test('rotate ring writes group yaw/pitch/roll and scale box writes group scale', () => {
    const { renderer, group, bl } = build();
    let start = grab(renderer, group, 'rotate', 'y');
    renderer._applySceneObjectGizmoDrag({ clientX: start.x + 30, clientY: start.y + 4 });
    expect(bl.params.transform.yaw).not.toBe(0);
    renderer._endSceneObjectGizmoDrag();
    start = grab(renderer, group, 'scale', 'x');
    renderer._applySceneObjectGizmoDrag({ clientX: start.x + 20, clientY: start.y });
    const t = bl.params.transform;
    expect(t.sx !== undefined || t.scale !== 1).toBe(true);
    renderer._endSceneObjectGizmoDrag();
  });

  test('Escape cancels: the group transform is absent again and the undo entry is popped', () => {
    const { renderer, group, bl } = build();
    const start = grab(renderer, group, 'move', 'x');
    renderer._applySceneObjectGizmoDrag({ clientX: start.x + 30, clientY: start.y });
    expect(bl.params.transform).toBeTruthy();
    const n = renderer.app.history.length;
    expect(renderer._cancelSceneObjectGizmoDrag()).toBe(true);
    expect(bl.params.transform).toBeUndefined();
    expect(renderer.app.history.length).toBe(n - 1);
  });

  test('a click on the carved ink selects the combined shape, not its primary operand', () => {
    const { renderer, group, bg, a } = build();
    renderer.setSceneSelection(null);
    const ink = (renderer.getInteractionPaths(group) || []).find((p) => p && p.meta && p.meta.sceneTarget && Array.isArray(p) && p.length > 1);
    expect(ink).toBeTruthy();
    expect(ink.meta.sceneTarget.objectId).toBe(a.id); // carved ink is tagged with the primary operand
    expect(renderer._sceneInkIds(group, bg).has(a.id)).toBe(true);
    // aim at a point on one of the shape's own edges (the default hatch style leaves edges as the pick surface)
    const edge = (renderer.getInteractionPaths(group) || []).find((p) => Array.isArray(p) && p.meta && p.meta.kind === 'sceneEdge'
      && p.meta.sceneTarget && p.meta.sceneTarget.objectId === a.id && p.length > 1);
    expect(edge).toBeTruthy();
    const mid = { x: (edge[0].x + edge[1].x) / 2, y: (edge[0].y + edge[1].y) / 2 };
    const s = renderer.worldToScreen(mid.x, mid.y);
    renderer._sceneDownSelect(renderer.screenToWorld(s.x, s.y), { clientX: s.x, clientY: s.y }, {});
    const sel = renderer.getSceneSelection();
    expect(sel.objectIds).toEqual([bg]);
  });

  test('drop to ground measures through the group transform', () => {
    const { renderer, group, gid, bl, bg, a, engine } = build();
    bl.params.transform = { x: 0, y: 50, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
    renderer.sceneHasGround = () => true;
    renderer._sceneGroundY = () => 0;
    renderer._sceneRegen = () => {};
    const ok = renderer.dropSceneObjectsToGround(gid, [bg]);
    expect(ok).toBe(true);
    // minY measured through the +50 group move => operands lowered by 50 + their own gap
    expect(Number(a.params.transform.y)).toBeLessThan(50);
  });
});
