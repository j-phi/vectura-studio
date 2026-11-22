/**
 * Scene3D ground gizmo — on-canvas size (corner / edge / centre boxes) and
 * height (Y arrow, body drag) for the selected floor. Fixture-driven over the
 * REAL renderer + engine. Asserts the contract:
 *   - the gizmo shows only while the ground is selected (scene selection or the
 *     sceneGround3d leaf) and sits where Scene.projectWorldPoint puts the floor;
 *   - hit priority + touch reach; drags write the bag (leaf params / params.ground)
 *     on the DRAFT regen path (no engine.generate until release);
 *   - one history entry per gesture, Escape restores (and pops it);
 *   - proportional by default, Shift for one axis / independent corners;
 *   - the centre gizmo pins inside the viewport when the floor's corners leave it;
 *   - y = 0 leaves no `y` key; Drop-to-ground rests objects on the raised floor.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const CAMERA = { projection: 'orthographic', yaw: 25, pitch: 40, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 };

describe('Scene3D ground gizmo (size + Y)', () => {
  let runtime; let V;
  beforeAll(async () => { runtime = await loadVecturaRuntime({ includeRenderer: true }); V = runtime.window.Vectura; });
  afterAll(() => runtime.cleanup());

  const monolith = (ground = { enabled: true }, camera = CAMERA) => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const layer = new V.Layer('scene-1', 'scene3d', 'Scene');
    layer.isGroup = false;
    layer.params = {
      ...layer.params,
      objects: [{ id: 'obj-1', name: 'S', primitive: 'sphere', params: { radius: 25 },
        transform: { x: 0, y: 25, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' }],
      lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }],
      ground,
      camera: { ...camera },
    };
    engine.layers.push(layer);
    engine.generate = vi.fn();
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
    renderer.app = { pushHistory: vi.fn(), history: [{}, {}] };
    renderer.setSelection([layer.id], layer.id);
    renderer.setSceneSelection({ layerId: layer.id, mode: 'object', objectIds: ['ground'], faceKeys: [], edgeKeys: [] });
    return { engine, renderer, layer };
  };

  const tree = () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    engine.generate = vi.fn();
    const renderer = new V.Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
    renderer.app = { pushHistory: vi.fn(), history: [{}, {}] };
    const group = engine.getLayerById(gid);
    const leaf = engine.getLayerChildren(gid).find((l) => l.type === 'sceneGround3d');
    renderer.setSelection([leaf.id], leaf.id);
    return { engine, renderer, group, leaf };
  };

  const at = (p) => ({ clientX: p.x, clientY: p.y });
  const grab = (renderer, hitPt, extra = {}) => {
    const hit = renderer.hitSceneGroundGizmo(hitPt.x, hitPt.y, null, 'mouse');
    expect(hit).toBeTruthy();
    expect(renderer.beginSceneGroundGizmoDrag(hit, { ...at(hitPt), ...extra })).toBe(true);
    return hit;
  };

  test('shown only while the ground is selected, and only with a ground', () => {
    const { renderer, layer } = monolith();
    expect(renderer.getSceneGroundGizmo()).toBeTruthy();
    renderer.setSceneSelection({ layerId: layer.id, mode: 'object', objectIds: ['obj-1'], faceKeys: [], edgeKeys: [] });
    expect(renderer.getSceneGroundGizmo()).toBeNull();
    renderer.setSceneSelection({ layerId: layer.id, mode: 'object', objectIds: ['ground'], faceKeys: [], edgeKeys: [] });
    layer.params.ground.enabled = false;
    expect(renderer.getSceneGroundGizmo()).toBeNull();
  });

  test('corners/edges/centre sit where the shared projection puts the floor (also at y != 0)', () => {
    const { renderer, layer } = monolith({ enabled: true, y: 30 });
    const giz = renderer.getSceneGroundGizmo();
    const bounds = renderer.engine.getBounds();
    const span = Math.max(bounds.width, bounds.height) * 0.75;
    const P = (w) => V.Scene3D.Scene.projectWorldPoint(w, layer.params.camera, bounds);
    const c = giz.corners.find((k) => k.sgx === 1 && k.sgz === 1);
    expect(c.pt.x).toBeCloseTo(P({ x: span, y: 30, z: span }).x, 6);
    expect(c.pt.y).toBeCloseTo(P({ x: span, y: 30, z: span }).y, 6);
    expect(giz.centre.x).toBeCloseTo(P({ x: 0, y: 30, z: 0 }).x, 6);
    expect(giz.centre.y).toBeCloseTo(P({ x: 0, y: 30, z: 0 }).y, 6);
    expect(giz.gy).toBe(30);
  });

  test('hit priority + reach: boxes, corners, edges, Y arrow; touch reaches further than mouse', () => {
    const { renderer } = monolith();
    const g = renderer.getSceneGroundGizmo();
    expect(renderer.hitSceneGroundGizmo(g.boxX.x, g.boxX.y, null, 'mouse')).toMatchObject({ kind: 'box', axis: 'x' });
    expect(renderer.hitSceneGroundGizmo(g.boxZ.x, g.boxZ.y, null, 'mouse')).toMatchObject({ kind: 'box', axis: 'z' });
    const k = g.corners[1];
    expect(renderer.hitSceneGroundGizmo(k.pt.x, k.pt.y, null, 'mouse')).toMatchObject({ kind: 'corner', sgx: k.sgx, sgz: k.sgz });
    const e = g.edges[0];
    expect(renderer.hitSceneGroundGizmo(e.pt.x, e.pt.y, null, 'mouse')).toMatchObject({ kind: 'edge', axis: e.axis });
    expect(renderer.hitSceneGroundGizmo(g.arrow.tip.x, g.arrow.tip.y, null, 'mouse')).toMatchObject({ kind: 'y' });
    // Mid-shaft counts as the arrow too.
    const mid = { x: (g.arrow.base.x + g.arrow.tip.x) / 2, y: (g.arrow.base.y + g.arrow.tip.y) / 2 };
    expect(renderer.hitSceneGroundGizmo(mid.x, mid.y, null, 'mouse')).toMatchObject({ kind: 'y' });
    // 15px off a corner: a finger hits, a mouse does not.
    expect(renderer.hitSceneGroundGizmo(k.pt.x + 15, k.pt.y, null, 'mouse')).toBeNull();
    expect(renderer.hitSceneGroundGizmo(k.pt.x + 15, k.pt.y, null, 'touch')).toMatchObject({ kind: 'corner' });
    expect(renderer.hitSceneGroundGizmo(-900, -900, null, 'mouse')).toBeNull();
  });

  test('Y arrow drag: moves the floor along projected world-up, draft regen only, one history entry', () => {
    const { renderer, layer, engine } = monolith();
    const g = renderer.getSceneGroundGizmo();
    grab(renderer, g.arrow.tip);
    const up = g.up; // unit screen dir + doc px per mm
    const drag = { x: g.arrow.tip.x + up.x * up.perMm * 20, y: g.arrow.tip.y + up.y * up.perMm * 20 };
    renderer._applySceneGroundGizmoDrag(at(drag));
    expect(layer.params.ground.y).toBeCloseTo(20, 0);
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);
    expect(renderer._sceneDragRegenLayerId).toBe(layer.id); // scheduled draft regen
    expect(engine.generate).not.toHaveBeenCalled();         // no settled regen / rebake mid-drag
    renderer._applySceneGroundGizmoDrag(at({ x: drag.x, y: drag.y - up.perMm * 10 * -up.y }));
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);
    renderer._endSceneGroundGizmoDrag();
    expect(renderer._sceneGroundGizmoDrag).toBeNull();
    expect(engine.generate).toHaveBeenCalledTimes(1);
  });

  test('Y: Alt = fine 0.1x, snaps to 0 near the origin, clamps to range, y=0 removes the key', () => {
    const { renderer, layer } = monolith();
    const g = renderer.getSceneGroundGizmo();
    const up = g.up;
    const px = (mm) => ({ x: g.arrow.tip.x + up.x * up.perMm * mm, y: g.arrow.tip.y + up.y * up.perMm * mm });
    grab(renderer, g.arrow.tip);
    renderer._applySceneGroundGizmoDrag({ ...at(px(40)), altKey: true });
    expect(layer.params.ground.y).toBeCloseTo(4, 1);
    renderer._applySceneGroundGizmoDrag(at(px(0.4)));
    renderer._applySceneGroundGizmoDrag(at(px(5)));
    renderer._applySceneGroundGizmoDrag(at(px(0.3)));
    expect('y' in layer.params.ground).toBe(false); // snapped to exactly 0 => no key
    renderer._applySceneGroundGizmoDrag(at(px(9999)));
    expect(layer.params.ground.y).toBe(V.Scene3D.Params.GROUND_Y_MAX);
    renderer._applySceneGroundGizmoDrag(at(px(-9999)));
    expect(layer.params.ground.y).toBe(V.Scene3D.Params.GROUND_Y_MIN);
    renderer._endSceneGroundGizmoDrag();
  });

  test('Escape restores the pre-drag height + size and pops the gesture history entry', () => {
    const { renderer, layer, engine } = monolith({ enabled: true, scaleX: 1.5, scaleZ: 1.5 });
    renderer.app.history = [{}, {}, {}];
    const g = renderer.getSceneGroundGizmo();
    grab(renderer, g.arrow.tip);
    renderer._applySceneGroundGizmoDrag(at({ x: g.arrow.tip.x, y: g.arrow.tip.y - 60 }));
    expect(layer.params.ground.y).toBeGreaterThan(10);
    expect(renderer._cancelSceneGroundGizmoDrag()).toBe(true);
    expect('y' in layer.params.ground).toBe(false);
    expect(layer.params.ground.scaleX).toBe(1.5);
    expect(renderer.app.history.length).toBe(2);
    expect(renderer._sceneGroundGizmoDrag).toBeNull();
    expect(engine.generate).toHaveBeenCalledTimes(1); // one settled restore regen
    expect(renderer._cancelSceneGroundGizmoDrag()).toBe(false);
  });

  test('a press without movement writes nothing and pushes no history', () => {
    const { renderer, layer } = monolith();
    const g = renderer.getSceneGroundGizmo();
    grab(renderer, g.arrow.tip);
    renderer._applySceneGroundGizmoDrag(at({ x: g.arrow.tip.x + 0.2, y: g.arrow.tip.y }));
    renderer._endSceneGroundGizmoDrag();
    expect(renderer.app.pushHistory).not.toHaveBeenCalled();
    expect('y' in layer.params.ground).toBe(false);
  });

  test('corner: the handle follows the pointer on the floor; proportional, Shift = independent', () => {
    const { renderer, layer } = monolith();
    let g = renderer.getSceneGroundGizmo();
    const k = g.corners.find((c) => c.sgx === 1 && c.sgz === 1);
    grab(renderer, k.pt);
    // Move the corner to where the 1.5x floor's corner projects: both axes -> 1.5, still proportional.
    const bounds = renderer.engine.getBounds();
    const span = Math.max(bounds.width, bounds.height) * 0.75;
    const P = (w) => V.Scene3D.Scene.projectWorldPoint(w, layer.params.camera, bounds);
    renderer._applySceneGroundGizmoDrag(at(P({ x: span * 1.5, y: 0, z: span * 1.5 })));
    expect(layer.params.ground.scaleX).toBeCloseTo(1.5, 2);
    expect(layer.params.ground.scaleZ).toBeCloseTo(1.5, 2);
    // Independent (Shift): only X reaches 2x, Z stays 1.5x.
    renderer._applySceneGroundGizmoDrag({ ...at(P({ x: span * 2, y: 0, z: span * 1.5 })), shiftKey: true });
    expect(layer.params.ground.scaleX).toBeCloseTo(2, 2);
    expect(layer.params.ground.scaleZ).toBeCloseTo(1.5, 2);
    renderer._endSceneGroundGizmoDrag();
    expect(renderer.app.pushHistory).toHaveBeenCalledTimes(1);
  });

  test('edge: proportional while the lock is on, Shift = that axis only; unlocked inverts', () => {
    const { renderer, layer } = monolith();
    const bounds = renderer.engine.getBounds();
    const span = Math.max(bounds.width, bounds.height) * 0.75;
    const P = (w) => V.Scene3D.Scene.projectWorldPoint(w, layer.params.camera, bounds);
    const edge = (g) => g.edges.find((e) => e.axis === 'x' && e.sgx === 1);
    let g = renderer.getSceneGroundGizmo();
    grab(renderer, edge(g).pt);
    renderer._applySceneGroundGizmoDrag(at(P({ x: span * 2, y: 0, z: 0 })));
    expect(layer.params.ground.scaleX).toBeCloseTo(2, 2);
    expect(layer.params.ground.scaleZ).toBeCloseTo(2, 2);
    renderer._endSceneGroundGizmoDrag();

    layer.params.ground = { enabled: true };
    g = renderer.getSceneGroundGizmo();
    grab(renderer, edge(g).pt);
    renderer._applySceneGroundGizmoDrag({ ...at(P({ x: span * 2, y: 0, z: 0 })), shiftKey: true });
    expect(layer.params.ground.scaleX).toBeCloseTo(2, 2);
    expect(layer.params.ground.scaleZ).toBeCloseTo(1, 2);
    renderer._endSceneGroundGizmoDrag();

    layer.params.ground = { enabled: true, scaleLock: false };
    g = renderer.getSceneGroundGizmo();
    grab(renderer, edge(g).pt);
    renderer._applySceneGroundGizmoDrag(at(P({ x: span * 2, y: 0, z: 0 })));
    expect(layer.params.ground.scaleX).toBeCloseTo(2, 2);
    expect(layer.params.ground.scaleZ).toBeCloseTo(1, 2);
    renderer._applySceneGroundGizmoDrag({ ...at(P({ x: span * 3, y: 0, z: 0 })), shiftKey: true });
    expect(layer.params.ground.scaleX).toBeCloseTo(3, 2);
    expect(layer.params.ground.scaleZ).toBeCloseTo(3, 2);
    renderer._endSceneGroundGizmoDrag();
  });

  test('size clamps to the panel range and stays proportional at the clamp', () => {
    const { renderer, layer } = monolith({ enabled: true, scaleX: 100, scaleZ: 20 });
    const g = renderer.getSceneGroundGizmo();
    grab(renderer, g.boxX);
    renderer._applySceneGroundGizmoDrag(at({ x: g.boxX.x + g.dx.x * 4000, y: g.boxX.y + g.dx.y * 4000 }));
    const Pm = V.Scene3D.Params;
    expect(layer.params.ground.scaleX).toBeLessThanOrEqual(Pm.GROUND_SCALE_MAX);
    // lock on => one shared factor: the ratio survives the clamp.
    expect(layer.params.ground.scaleX / layer.params.ground.scaleZ).toBeCloseTo(5, 2);
    renderer._endSceneGroundGizmoDrag();
  });

  test('centre boxes scale on a log curve (reachable when corners are off-screen)', () => {
    const { renderer, layer } = monolith();
    const g = renderer.getSceneGroundGizmo();
    grab(renderer, g.boxZ);
    const octave = V.UI_CONSTANTS.SCENE_GROUND_GIZMO.boxOctavePx;
    renderer._applySceneGroundGizmoDrag(at({ x: g.boxZ.x + g.dz.x * octave, y: g.boxZ.y + g.dz.y * octave }));
    expect(layer.params.ground.scaleZ).toBeCloseTo(2, 1);
    expect(layer.params.ground.scaleX).toBeCloseTo(2, 1); // lock on
    renderer._endSceneGroundGizmoDrag();
  });

  test('the centre gizmo pins inside the viewport when the floor origin leaves it', () => {
    const { renderer } = monolith({ enabled: true, y: 0 });
    Object.defineProperty(renderer.canvas, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(renderer.canvas, 'clientHeight', { value: 600, configurable: true });
    renderer.offsetX = -5000; renderer.offsetY = 3000; // pan the floor origin far off-canvas
    const g = renderer.getSceneGroundGizmo();
    expect(g.pinned).toBe(true);
    const s = renderer.worldToScreen(g.centre.x, g.centre.y);
    expect(s.x).toBeGreaterThanOrEqual(0); expect(s.x).toBeLessThanOrEqual(800);
    expect(s.y).toBeGreaterThanOrEqual(0); expect(s.y).toBeLessThanOrEqual(600);
    // Still draggable from there: the Y arrow works with the pinned centre.
    const tip = renderer.worldToScreen(g.arrow.tip.x, g.arrow.tip.y);
    const hit = renderer.hitSceneGroundGizmo(tip.x, tip.y, null, 'mouse');
    expect(hit && hit.kind).toBe('y');
  });

  test('body drag (ground already selected) moves Y; an unselected ground press does not', () => {
    const { renderer, layer } = monolith();
    const g = renderer.getSceneGroundGizmo();
    expect(renderer.beginSceneGroundBodyDrag(layer, at(g.centre))).toBe(true);
    const up = g.up;
    renderer._applySceneGroundGizmoDrag(at({ x: g.centre.x + up.x * up.perMm * 12, y: g.centre.y + up.y * up.perMm * 12 }));
    expect(layer.params.ground.y).toBeCloseTo(12, 0);
    renderer._endSceneGroundGizmoDrag();
    renderer.setSceneSelection(null);
    expect(renderer.beginSceneGroundBodyDrag(layer, at(g.centre))).toBe(false);
  });

  test('tree scene: the sceneGround3d leaf is the bag; drags write leaf params', () => {
    const { renderer, leaf, engine, group } = tree();
    const g = renderer.getSceneGroundGizmo();
    expect(g && g.layer.id).toBe(group.id);
    grab(renderer, g.arrow.tip);
    renderer._applySceneGroundGizmoDrag(at({ x: g.arrow.tip.x, y: g.arrow.tip.y - 40 }));
    expect(leaf.params.y).toBeGreaterThan(5);
    expect(group.params.ground && group.params.ground.y).toBeUndefined();
    renderer._cancelSceneGroundGizmoDrag();
    expect('y' in leaf.params).toBe(false);
    expect(engine.generate).toHaveBeenCalled();
  });

  test('_sceneGroundY reads the assembled/params ground height (0 when absent)', () => {
    const { renderer, layer } = monolith({ enabled: true, y: -12 });
    expect(renderer._sceneGroundY(layer)).toBe(-12);
    layer.params.ground = { enabled: true };
    expect(renderer._sceneGroundY(layer)).toBe(0);
  });

  test('Drop to ground rests an object on the RAISED floor', () => {
    const { renderer, layer } = monolith({ enabled: true, y: 30 });
    layer.params.objects[0] = { id: 'obj-1', name: 'B', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
      transform: { x: 0, y: 200, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid' };
    expect(renderer.dropSceneObjectsToGround(layer.id, ['obj-1'])).toBe(true);
    expect(layer.params.objects[0].transform.y).toBeCloseTo(30 + 20, 3); // floor + half-height
  });
});
