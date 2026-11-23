/**
 * U6 — selecting two or more 3D objects carries the same 3-axis move / rotate / scale gizmo as one object, centred on
 * the centroid of the selection. Move adds one delta to every object; rotate orbits positions about the centroid and
 * adds the angle to each object's matching rotation field; scale scales each offset from the centroid and each scale.
 * One undo entry per gesture, Escape restores every object. A single selection stays on the unchanged code path.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('multi-object transform gizmo (U6)', () => {
  let runtime;
  let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime({ includeRenderer: true }); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  const POS = [{ x: -30, y: 0, z: 0, yaw: 10, pitch: 0, roll: 0 }, { x: 50, y: 20, z: 10, yaw: 40, pitch: 5, roll: 0 }];

  const build = ({ viaLayers = false } = {}) => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    const a = engine.getLayerDescendants(gid).find((l) => l.type === 'object3d');
    const bId = engine.addObjectToScene(gid, 'sphere');
    const b = engine.getLayerById(bId);
    [a, b].forEach((l, i) => { l.params.transform = { ...l.params.transform, ...POS[i], scale: 1 }; });
    engine.generate(gid);
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
    const pushHistory = vi.fn();
    renderer.app = { pushHistory, history: [{}, {}], ui: { buildControls() {}, updateFormula() {} } };
    renderer.draw = () => {}; renderer.updateCursor = () => {};
    renderer.showDragTooltip = () => {}; renderer.hideDragTooltip = () => {};
    renderer.selectedLayerIds = new Set(viaLayers ? [a.id, bId] : [gid]);
    renderer.selectedLayerId = viaLayers ? a.id : gid;
    if (!viaLayers) renderer.setSceneSelection({ layerId: gid, mode: 'object', objectIds: [a.id, bId], faceKeys: [], edgeKeys: [] });
    return { engine, renderer, gid, group: engine.getLayerById(gid), a, b, bId };
  };

  const xf = (l) => ({ ...l.params.transform });
  const centroid = (a, b) => ({
    x: (a.params.transform.x + b.params.transform.x) / 2,
    y: (a.params.transform.y + b.params.transform.y) / 2,
    z: (a.params.transform.z + b.params.transform.z) / 2,
  });

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

  test('two selected objects show the gizmo at their centroid; the corner box is not offered', () => {
    const { renderer, group, a, b } = build();
    const giz = renderer.getSceneObjectGizmo(group);
    expect(giz).toBeTruthy();
    expect(giz.objIds).toEqual([a.id, b.id]);
    const ca = renderer._sceneObjectPathCenter(group, a.id);
    const cb = renderer._sceneObjectPathCenter(group, b.id);
    expect(giz.center.x).toBeCloseTo((ca.x + cb.x) / 2, 6);
    expect(giz.center.y).toBeCloseTo((ca.y + cb.y) / 2, 6);
    const s = renderer.worldToScreen(renderer._sceneResizeBBox(group)?.corners?.nw.x ?? 0, 0);
    expect(renderer._sceneResizeBBox(group)).toBeNull();
    expect(renderer.hitSceneResize(s.x, s.y, group)).toBeNull();
  });

  test('a single selected object keeps the one-object gizmo (no objIds)', () => {
    const { renderer, group, a } = build();
    renderer.setSceneSelection({ layerId: group.id, mode: 'object', objectIds: [a.id], faceKeys: [], edgeKeys: [] });
    const giz = renderer.getSceneObjectGizmo(group);
    expect(giz.objId).toBe(a.id);
    expect(giz.objIds).toBeUndefined();
  });

  test('two object layers selected in the layers panel also get the gizmo', () => {
    const { renderer, group, a, b } = build({ viaLayers: true });
    const giz = renderer.getSceneObjectGizmo(group);
    expect(giz && giz.objIds).toEqual([a.id, b.id]);
  });

  test('move adds the same delta to every object, one undo entry', () => {
    const { renderer, group, a, b } = build();
    const a0 = xf(a); const b0 = xf(b);
    const start = grab(renderer, group, 'move', 'y');
    renderer.app.pushHistory.mockClear();
    renderer._applySceneObjectGizmoDrag({ clientX: start.x, clientY: start.y - 15 });
    renderer._applySceneObjectGizmoDrag({ clientX: start.x, clientY: start.y - 30 });
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);
    const da = a.params.transform.y - a0.y; const db = b.params.transform.y - b0.y;
    expect(da).toBeGreaterThan(5);
    expect(db).toBeCloseTo(da, 6);
    expect(a.params.transform.x).toBe(a0.x);
    expect(b.params.transform.z).toBe(b0.z);
    renderer._endSceneObjectGizmoDrag();
  });

  test('rotate orbits positions about the centroid and adds the angle to each yaw', () => {
    const { renderer, group, a, b } = build();
    const a0 = xf(a); const b0 = xf(b);
    const c0 = centroid(a, b);
    const start = grab(renderer, group, 'rotate', 'y');
    renderer._applySceneObjectGizmoDrag({ clientX: start.x + 30, clientY: start.y + 4 });
    const d = renderer._sceneObjectGizmoDrag.accumDeg;
    expect(Math.abs(d)).toBeGreaterThan(1);
    const wrap = (v) => ((v % 360) + 360) % 360;
    expect(wrap(a.params.transform.yaw - a0.yaw - d)).toBeCloseTo(0, 0);
    expect(wrap(b.params.transform.yaw - b0.yaw - d)).toBeCloseTo(0, 0);
    const c1 = centroid(a, b);
    expect(c1.x).toBeCloseTo(c0.x, 1); expect(c1.z).toBeCloseTo(c0.z, 1); expect(c1.y).toBeCloseTo(c0.y, 1);
    const rad = (t, c) => Math.hypot(t.x - c.x, t.z - c.z);
    expect(rad(a.params.transform, c0)).toBeCloseTo(rad(a0, c0), 1);
    // positions really moved (orbited), y untouched by a yaw orbit
    expect(Math.hypot(a.params.transform.x - a0.x, a.params.transform.z - a0.z)).toBeGreaterThan(0.5);
    expect(a.params.transform.y).toBe(a0.y);
    renderer._endSceneObjectGizmoDrag();
  });

  test('alt (uniform) scale scales offsets from the centroid and each scale by one ratio', () => {
    const { renderer, group, a, b } = build();
    const a0 = xf(a); const b0 = xf(b);
    const c0 = centroid(a, b);
    const start = grab(renderer, group, 'scale', 'x');
    const drag = renderer._sceneObjectGizmoDrag;
    renderer._applySceneObjectGizmoDrag({ clientX: start.x + 30, clientY: start.y, altKey: true });
    const ratio = a.params.transform.scale / a0.scale;
    expect(ratio).toBeGreaterThan(1.05);
    expect(b.params.transform.scale / b0.scale).toBeCloseTo(ratio, 2);
    expect(a.params.transform.x - c0.x).toBeCloseTo((a0.x - c0.x) * ratio, 1);
    expect(b.params.transform.y - c0.y).toBeCloseTo((b0.y - c0.y) * ratio, 1);
    expect(b.params.transform.z - c0.z).toBeCloseTo((b0.z - c0.z) * ratio, 1);
    expect(drag.members.length).toBe(2);
    renderer._endSceneObjectGizmoDrag();
  });

  test('per-axis scale only stretches the grabbed axis (offset and sx)', () => {
    const { renderer, group, a, b } = build();
    const a0 = xf(a); const b0 = xf(b);
    const c0 = centroid(a, b);
    const start = grab(renderer, group, 'scale', 'x');
    renderer._applySceneObjectGizmoDrag({ clientX: start.x + 30, clientY: start.y });
    const ta = a.params.transform; const tb = b.params.transform;
    expect(ta.sx).toBeGreaterThan(1.05);
    expect(tb.sx).toBeCloseTo(ta.sx, 3);
    expect(ta.sy).toBe(1); expect(tb.sz).toBe(1);
    expect(ta.x - c0.x).toBeCloseTo((a0.x - c0.x) * ta.sx, 1);
    expect(tb.y).toBe(b0.y); expect(tb.z).toBe(b0.z);
    renderer._endSceneObjectGizmoDrag();
  });

  test('Escape restores every object and pops the one history entry', () => {
    const { renderer, group, a, b } = build();
    const a0 = JSON.stringify(a.params.transform); const b0 = JSON.stringify(b.params.transform);
    const n = renderer.app.history.length;
    const start = grab(renderer, group, 'scale', 'y');
    renderer._applySceneObjectGizmoDrag({ clientX: start.x, clientY: start.y - 25 });
    expect(JSON.stringify(a.params.transform)).not.toBe(a0);
    expect(renderer._cancelSceneObjectGizmoDrag()).toBe(true);
    expect(JSON.stringify(a.params.transform)).toBe(a0);
    expect(JSON.stringify(b.params.transform)).toBe(b0);
    expect(renderer.app.history.length).toBe(n - 1);
  });

  test('a touch press on the move arrow arms the multi-object drag', () => {
    const { renderer, group } = build();
    renderer.activeTool = 'select'; renderer.ready = true;
    const tip = renderer.getSceneObjectGizmo(group).axes.find((x) => x.key === 'y').tip;
    const p = renderer.worldToScreen(tip.x, tip.y);
    const ev = { clientX: p.x, clientY: p.y, button: 0, pointerType: 'touch', cancelable: true, preventDefault() {}, stopPropagation() {} };
    renderer.down(ev);
    expect(renderer._sceneObjectGizmoDrag && renderer._sceneObjectGizmoDrag.members.length).toBe(2);
    renderer._cancelSceneObjectGizmoDrag();
  });
});
