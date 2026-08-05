/**
 * Scene-tree Increment E — the selected-light 3-axis gizmo arms for a LIGHT
 * CHILD (sceneLight3d) of a scene group, and its drag edits the CHILD's params
 * (which the compositor maps back to lights[]). Reuses the Unit-1b gizmo — the
 * only new wiring is _sceneLightLayer() resolving a selected light child to its
 * owning scene GROUP + _selectedSceneLight returning the child's params.
 *
 * RGR — before E, selecting a sceneLight3d child does not arm the gizmo, so
 * getSceneLightGizmo() returns null here; this file fails on the base branch.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const P = (pts, meta) => {
  const p = pts.map(([x, y]) => ({ x, y }));
  p.meta = meta;
  return p;
};

// A drawn box on the GROUP gives the scene its anchor (bbox).
const makeScenePaths = () => [
  P([[80, 80], [160, 80], [160, 160], [80, 160], [80, 80]], {
    kind: 'sceneFace', closed: true,
    sceneTarget: { objectId: 'obj-1', faceId: 'face:+Z', depth: 10, occluded: false },
  }),
];

describe('Scene-tree Increment E — light-child gizmo arming', () => {
  let runtime;

  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  async function setup() {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    const { VectorEngine, Renderer, Layer } = runtime.window.Vectura;
    const engine = new VectorEngine();
    engine.layers = [];
    engine.generate = () => {}; // isolate from the scene3d algorithm

    // Scene GROUP (inline lights empty — lights live on children).
    const group = new Layer('scene-grp', 'scene3d', 'Scene');
    group.isGroup = true;
    group.containerRole = 'scene';
    group.groupType = 'scene';
    group.params = {
      ...group.params,
      sceneVersion: 1, seed: 0,
      objects: [], groups: [], lights: [], ground: { enabled: false },
      camera: { projection: 'orthographic', yaw: 0, pitch: 0, roll: 0, cameraDistance: 620, focalLength: 520, zoom: 1 },
      styleTable: { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} },
    };
    group.scenePaths = makeScenePaths();
    engine.layers.push(group);

    // A point-light CHILD.
    const lightChild = new Layer('lyr-pt', 'sceneLight3d', 'Point 1');
    lightChild.parentId = group.id;
    lightChild.params = {
      ...lightChild.params,
      type: 'point', position: { x: 120, y: 200, z: 120 }, range: 400, intensity: 1, castShadows: true,
    };
    engine.layers.push(lightChild);

    const renderer = new Renderer('main-canvas', engine);
    renderer.setTool('select');
    renderer.scale = 1; renderer.offsetX = 0; renderer.offsetY = 0;
    // getRenderablePaths for the group returns its composed scene paths so the
    // anchor bbox is available to the gizmo.
    renderer.setSelection([lightChild.id], lightChild.id); // SELECT THE CHILD
    renderer.app = { pushHistory: () => {}, history: [{}, {}], ui: {} };
    return { renderer, engine, group, lightChild };
  }

  test('selecting a light child arms the gizmo on its owning scene group', async () => {
    const { renderer, group } = await setup();
    // _sceneLightLayer resolves the selected child → the group.
    expect(renderer._sceneLightLayer()).toBe(group);
    const giz = renderer.getSceneLightGizmo();
    expect(giz).toBeTruthy();
    expect(giz.lightType).toBe('point');
  });

  test('the selected light is the CHILD params, not a group inline light', async () => {
    const { renderer, group, lightChild } = await setup();
    const light = renderer._selectedSceneLight(group);
    expect(light).toBe(lightChild.params);
  });

  test('dragging the X handle moves the CHILD light position and regens the GROUP', async () => {
    const { renderer, group, lightChild } = await setup();
    const giz = renderer.getSceneLightGizmo();
    const xAxis = giz.axes.find((a) => a.key === 'x');
    const hit = renderer.hitSceneLightGizmo(xAxis.tip.x, xAxis.tip.y);
    expect(hit).toEqual({ type: 'move', axis: 'x' });

    const before = lightChild.params.position.x;
    expect(renderer.beginSceneLightGizmoDrag(hit, { clientX: xAxis.tip.x, clientY: xAxis.tip.y })).toBe(true);
    renderer._applySceneLightGizmoDrag({ clientX: xAxis.tip.x + 40, clientY: xAxis.tip.y });
    expect(lightChild.params.position.x).toBeCloseTo(before + 40, 3);
    // Regen targets the GROUP (its compose maps the child back to lights[]).
    expect(renderer._sceneDragRegenLayerId).toBe(group.id);
    renderer._endSceneLightGizmoDrag();
    expect(renderer._sceneLightGizmoDrag).toBeNull();
  });
});
