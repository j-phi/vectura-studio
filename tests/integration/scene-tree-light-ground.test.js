const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene-tree Increment E — GROUND & LIGHTS (sun etc.) as scene-group CHILDREN.
 *
 * Lights and the ground move out of the scene group's inline params.lights /
 * params.ground and become thin leaf child layers (sceneLight3d / sceneGround3d).
 * collectSceneParams maps them back to lights[] / ground so the UNCHANGED
 * scene3d compositor still runs. This preserves inline-union back-compat (a
 * monolith with inline lights/ground and no such children renders identically)
 * while making the whole scene read as one tree.
 *
 * RGR — these engine helpers + the collection mapping do not exist before E, so
 * this file fails on the base branch and passes after.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));

describe('Scene-tree Increment E — ground & lights as scene-group children', () => {
  let runtime;
  let V;
  let Params;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Params = V.Scene3D.Params;
  });

  afterAll(() => runtime.cleanup());

  const findLightIds = (assembled) =>
    (Array.isArray(assembled.lights) ? assembled.lights : []).map((l) => l && l.id);

  // ── (collection) light children append to lights[] in tree order ───────────
  test('collectSceneParams maps light children → lights[] (layer id is the light id)', () => {
    const gp = { lights: [], ground: { enabled: false }, styleTable: {} };
    const collected = [
      { kind: 'light', id: 'lyr-sun', params: { type: 'directional', azimuth: 200, elevation: 30, intensity: 1 } },
      { kind: 'light', id: 'lyr-pt', params: { type: 'point', position: { x: 40, y: 90, z: 10 }, range: 300, intensity: 0.8 } },
    ];
    const assembled = Params.collectSceneParams(gp, collected);
    expect(findLightIds(assembled)).toEqual(['lyr-sun', 'lyr-pt']);
    expect(assembled.lights[0].type).toBe('directional');
    expect(assembled.lights[0].azimuth).toBe(200);
    expect(assembled.lights[1].type).toBe('point');
    expect(assembled.lights[1].position).toEqual({ x: 40, y: 90, z: 10 });
  });

  // ── (collection) ground child → ground.enabled true; none ⇒ inline fallback ─
  test('collectSceneParams: a ground child enables ground; none present falls back to inline', () => {
    const withGround = Params.collectSceneParams(
      { ground: { enabled: false }, styleTable: {} },
      [{ kind: 'ground', id: 'lyr-grd', params: { enabled: true } }]
    );
    expect(withGround.ground).toEqual({ enabled: true });

    // No ground child + inline ground.enabled:false (a tree that deleted its
    // ground) ⇒ ground stays OFF.
    const treeNoGround = Params.collectSceneParams({ ground: { enabled: false }, styleTable: {} }, []);
    expect(treeNoGround.ground.enabled).toBe(false);

    // No ground child + inline ground.enabled:true (a legacy monolith) ⇒ ground
    // stays ON (inline back-compat).
    const monolith = Params.collectSceneParams({ ground: { enabled: true }, styleTable: {} }, []);
    expect(monolith.ground.enabled).toBe(true);
  });

  // ── (a) addLightToScene adds a light child that shows up in composed lights[] ─
  test('addLightToScene adds a sceneLight3d child whose params appear in composed lights[]', () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneGroup();
    expect(typeof engine.addLightToScene).toBe('function');

    const lid = engine.addLightToScene(gid, 'point');
    const child = engine.getLayerById(lid);
    expect(child).toBeTruthy();
    expect(child.type).toBe('sceneLight3d');
    expect(child.parentId).toBe(gid);
    expect(child.params.type).toBe('point');

    // Drive the real compose walk: collect the group's descendants exactly like
    // the engine does, then map through collectSceneParams.
    const collected = [];
    engine.getLayerDescendants(gid).forEach((l) => {
      if (l.type === 'sceneLight3d') collected.push({ kind: 'light', id: l.id, params: l.params });
    });
    const assembled = Params.collectSceneParams(engine.getLayerById(gid).params, collected);
    expect(findLightIds(assembled)).toContain(lid);
    const entry = assembled.lights.find((l) => l.id === lid);
    expect(entry.type).toBe('point');
  });

  // ── addGroundToScene: only one ground child allowed ────────────────────────
  test('addGroundToScene adds a ground child once; a second call is a no-op', () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneGroup();
    expect(typeof engine.addGroundToScene).toBe('function');

    const g1 = engine.addGroundToScene(gid);
    expect(g1).toBeTruthy();
    const gl = engine.getLayerById(g1);
    expect(gl.type).toBe('sceneGround3d');
    expect(gl.parentId).toBe(gid);

    const g2 = engine.addGroundToScene(gid);
    expect(g2).toBeNull();
    const grounds = engine.getLayerDescendants(gid).filter((l) => l.type === 'sceneGround3d');
    expect(grounds.length).toBe(1);
  });

  // ── (b) deleting the ground child → ground.enabled=false in the compose ─────
  test('deleting the ground child turns the ground off in the composed params', () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneGroup();
    // A scene group with no children auto-collapses when emptied; keep an object
    // so deleting the ground child leaves the group standing (a real scene has one).
    engine.addObjectToScene(gid, 'box');
    const g1 = engine.addGroundToScene(gid);

    const composeOf = () => {
      const collected = [];
      engine.getLayerDescendants(gid).forEach((l) => {
        if (l.type === 'sceneGround3d') collected.push({ kind: 'ground', id: l.id, params: l.params });
      });
      return Params.collectSceneParams(engine.getLayerById(gid).params, collected);
    };

    expect(composeOf().ground.enabled).toBe(true);
    engine.removeLayer(g1);
    expect(composeOf().ground.enabled).toBe(false);
  });

  // ── addSceneTree seeds a sun + ground child (the whole scene reads as a tree) ─
  test('addSceneTree seeds a sun light child and a ground child under the group', () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const gid = engine.addSceneTree();
    const kids = engine.getLayerDescendants(gid);
    expect(kids.some((l) => l.type === 'sceneLight3d')).toBe(true);
    expect(kids.some((l) => l.type === 'sceneGround3d')).toBe(true);
    // The group's inline lights are emptied and inline ground pre-set OFF so the
    // children are the single source of truth.
    const grp = engine.getLayerById(gid);
    expect(Array.isArray(grp.params.lights) ? grp.params.lights.length : 0).toBe(0);
    expect(grp.params.ground.enabled).toBe(false);
  });

  // ── (d) expandMonolithToTree promotes lights[] + ground into children AND
  //        the expanded tree renders equivalently to the monolith. ────────────
  test('expandMonolithToTree promotes 2 lights + ground into children with an equivalent render', () => {
    // A MONOLITH scene3d leaf with 2 lights + an enabled ground + one object.
    const monoParams = () => ({
      ...clone(V.ALGO_DEFAULTS.scene3d),
      seed: 5,
      objects: [{
        id: 'obj-1', name: 'Box 1', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
        transform: { x: 0, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
        visibility: 'solid', role: 'solid',
      }],
      groups: [],
      lights: [
        { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: true },
        { id: 'p1', type: 'point', position: { x: 120, y: 200, z: 120 }, range: 400, intensity: 0.8, castShadows: true },
      ],
      ground: { enabled: true },
      styleTable: { scene: { penId: null, mapper: 'wireframe', params: {} }, byObject: {}, byFace: {} },
    });

    // Baseline: a PRISTINE monolith on its own engine (kept live so its path
    // arrays retain their `.meta` sidecar — a JSON clone would strip it).
    const baseEngine = new V.VectorEngine();
    const baseMono = new V.Layer('mono-1', 'scene3d', 'Scene');
    baseMono.params = monoParams();
    baseEngine.layers = [baseMono];
    baseEngine.generate(baseMono.id);
    baseEngine.computeAllDisplayGeometry();
    const monoPaths = baseMono.paths || [];
    expect(monoPaths.length).toBeGreaterThan(0);

    // Expand a SECOND identical monolith → tree.
    const engine = new V.VectorEngine();
    const mono = new V.Layer('mono-1', 'scene3d', 'Scene');
    mono.params = monoParams();
    engine.layers = [mono];
    engine.generate(mono.id);
    engine.computeAllDisplayGeometry();

    const gid = engine.expandMonolithToTree(mono.id);
    expect(gid).toBe(mono.id);
    const grp = engine.getLayerById(gid);
    expect(grp.isGroup).toBe(true);

    const lightKids = engine.getLayerDescendants(gid).filter((l) => l.type === 'sceneLight3d');
    const groundKids = engine.getLayerDescendants(gid).filter((l) => l.type === 'sceneGround3d');
    expect(lightKids.length).toBe(2);
    expect(groundKids.length).toBe(1);
    // Light params preserved (types + the point light's position).
    const types = lightKids.map((l) => l.params.type).sort();
    expect(types).toEqual(['directional', 'point']);
    const pt = lightKids.find((l) => l.params.type === 'point');
    expect(pt.params.position).toEqual({ x: 120, y: 200, z: 120 });
    // Inline copies cleared; inline ground pre-set OFF (children own them now).
    expect(Array.isArray(grp.params.lights) ? grp.params.lights.length : 0).toBe(0);
    expect(grp.params.ground.enabled).toBe(false);

    // Equivalent render: the composed scene group paths match the monolith.
    engine.computeAllDisplayGeometry();
    const treePaths = grp.scenePaths;
    expect(Array.isArray(treePaths)).toBe(true);
    expect(treePaths.length).toBe(monoPaths.length);
    expect(treePaths).toEqual(monoPaths);
  });

  // ── back-compat: an inline-only monolith (no light/ground children) is
  //    UNCHANGED by the collection (renders identically). ─────────────────────
  test('inline-only scene group (no light/ground children) keeps its inline lights + ground', () => {
    const gp = {
      lights: [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: true }],
      ground: { enabled: true },
      styleTable: {},
    };
    const assembled = Params.collectSceneParams(gp, []);
    expect(assembled.lights).toEqual(gp.lights);
    expect(assembled.ground).toEqual({ enabled: true });
  });
});
