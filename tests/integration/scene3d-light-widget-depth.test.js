/**
 * U3 (metric M9): the sun widget must show whether the light is in FRONT of or BEHIND the subject.
 * Behind (camera-space z < 0) draws the hollow/dashed variant; in front draws a solid disc; an on-axis
 * light draws at the anchor centre; a drag keeps a back light behind.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const P = (pts, meta) => { const p = pts.map(([x, y]) => ({ x, y })); p.meta = meta; return p; };

describe('sun widget depth cue (M9)', () => {
  let runtime;
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  async function setup(light, camera = {}) {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    engine.generate = () => {};
    const scene = new Layer('scene-1', 'scene3d', 'Scene');
    scene.params = {
      ...scene.params, objects: [],
      lights: [{ id: 'sun', type: 'directional', castShadows: true, ...light }],
      ground: { enabled: true },
      camera: { projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1, ...camera },
    };
    scene.paths = [P([[10, 10], [110, 10], [110, 110], [10, 110], [10, 10]], {
      kind: 'sceneFace', closed: true, sceneTarget: { objectId: 'obj-1', faceId: 'face:+Z', depth: 10, occluded: false },
    })];
    engine.layers.push(scene);
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
    renderer.setSelection([scene.id], scene.id);
    renderer.app = { pushHistory: () => {}, history: [{}, {}] };
    return { renderer, scene };
  }

  // Record what the overlay draws: filled discs, dashed arcs, and text.
  function record(renderer) {
    const calls = { fills: 0, dashedArcs: 0, text: [], arcs: [] };
    const ctx = renderer.ctx;
    let dash = [];
    const orig = { setLineDash: ctx.setLineDash, arc: ctx.arc, fill: ctx.fill, stroke: ctx.stroke, fillText: ctx.fillText };
    let lastArc = null;
    ctx.setLineDash = function (d) { dash = d || []; };
    ctx.arc = function (x, y, r) { lastArc = { x, y, r }; calls.arcs.push(lastArc); };
    ctx.fill = function () { if (lastArc) calls.fills++; };
    ctx.stroke = function () { if (lastArc && dash.length) calls.dashedArcs++; };
    ctx.fillText = function (t) { calls.text.push(t); };
    const restore = () => Object.assign(ctx, orig);
    return { calls, restore };
  }

  test('a light behind the scene draws the hollow dashed variant; a front light draws a solid disc', async () => {
    // az 0, el 45 => toward-sun = (0, .71, +.71): in front. az 180 => behind.
    const front = await setup({ azimuth: 0, elevation: 45 });
    expect(front.renderer.getSceneLightControl(front.scene).behind).toBe(false);
    let rec = record(front.renderer);
    front.renderer.drawSceneLightOverlay();
    rec.restore();
    expect(rec.calls.fills).toBe(1);
    expect(rec.calls.dashedArcs).toBe(0);
    expect(rec.calls.text).toEqual([]);
    runtime.cleanup(); runtime = null;

    const back = await setup({ azimuth: 180, elevation: 45 });
    expect(back.renderer.getSceneLightControl(back.scene).behind).toBe(true);
    rec = record(back.renderer);
    back.renderer.drawSceneLightOverlay();
    rec.restore();
    expect(rec.calls.dashedArcs).toBeGreaterThan(0);
    expect(rec.calls.text).toEqual(['behind']);
  });

  test('an on-axis light (straight at the camera) draws at the anchor centre', async () => {
    // Camera pitch 0, light toward the camera: toward-sun = (0,0,1) => el 0, az 0.
    const { renderer, scene } = await setup({ azimuth: 0, elevation: 0 });
    const c = renderer.getSceneLightControl(scene);
    expect(c.z).toBeCloseTo(1, 5);
    expect(c.pos.x).toBeCloseTo(c.center.x, 5);
    expect(c.pos.y).toBeCloseTo(c.center.y, 5);
  });

  test('dragging a back light keeps it behind (the old elevation hint flipped it to the front)', async () => {
    const { renderer, scene } = await setup({ azimuth: 180, elevation: 45 }, { pitch: -20 });
    const control = renderer.getSceneLightControl(scene);
    expect(control.behind).toBe(true);
    const hit = renderer.hitSceneLight(control.pos.x, control.pos.y, scene);
    expect(renderer.beginSceneLightDrag(hit, { clientX: control.pos.x, clientY: control.pos.y })).toBe(true);
    for (const [fx, fy] of [[0.3, -0.5], [-0.2, -0.2], [0.1, 0.1], [0.5, -0.3]]) {
      renderer._applySceneLightDrag({ clientX: control.center.x + control.baseR * fx, clientY: control.center.y + control.baseR * fy });
      const l = scene.params.lights[0];
      expect(renderer._sceneLightDepth(scene, l)).toBeLessThan(0);
    }
    renderer.endSceneLightDrag();
  });
});

describe('selected-light gizmo depth cue in a real addLayer("scene3d") tree scene (M9)', () => {
  let runtime;
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  async function tree(lightPatch) {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    const gid = engine.addLayer('scene3d');
    engine.generate(gid);
    const group = engine.getLayerById(gid);
    const kids = engine.getLayerDescendants(gid);
    const lightChild = kids.find((l) => l.type === 'sceneLight3d');
    Object.assign(lightChild.params, lightPatch);
    group.params.camera = { ...group.params.camera, yaw: 0, pitch: -20, roll: 0 };
    engine.generate(gid);
    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
    renderer.setSelection([lightChild.id], lightChild.id);
    return { renderer, group, lightChild };
  }

  function record(renderer) {
    const ctx = renderer.ctx; const calls = { dashedArcs: 0, text: [] };
    let dash = []; let arc = false;
    const orig = { setLineDash: ctx.setLineDash, arc: ctx.arc, stroke: ctx.stroke, fillText: ctx.fillText };
    ctx.setLineDash = (d) => { dash = d || []; };
    ctx.arc = () => { arc = true; };
    ctx.stroke = () => { if (arc && dash.length) calls.dashedArcs++; };
    ctx.fillText = (t) => { calls.text.push(t); };
    return { calls, restore: () => Object.assign(ctx, orig) };
  }

  test('the default tree-scene sun (behind) gets the hollow variant; a front sun gets the solid one', async () => {
    const back = await tree({ azimuth: 135, elevation: 45 });
    const g = back.renderer.getSceneLightGizmo();
    expect(g).toBeTruthy();
    expect(g.behind).toBe(true);
    let rec = record(back.renderer);
    back.renderer.drawSceneLightGizmo();
    rec.restore();
    expect(rec.calls.text).toEqual(['behind']);
    expect(rec.calls.dashedArcs).toBeGreaterThan(0);
    runtime.cleanup(); runtime = null;

    const front = await tree({ azimuth: 0, elevation: 45 });
    expect(front.renderer.getSceneLightGizmo().behind).toBe(false);
    rec = record(front.renderer);
    front.renderer.drawSceneLightGizmo();
    rec.restore();
    expect(rec.calls.text).toEqual([]);
  });

  test('a point light behind the scene centre is behind; in front is not', async () => {
    const back = await tree({ type: 'point', position: { x: 0, y: 100, z: -150 } });
    expect(back.renderer.getSceneLightGizmo().behind).toBe(true);
    runtime.cleanup(); runtime = null;
    const front = await tree({ type: 'point', position: { x: 0, y: 100, z: 150 } });
    expect(front.renderer.getSceneLightGizmo().behind).toBe(false);
  });
});
