const { loadSurfaceLockRuntime, buildSurfaceLockScene } = require('../helpers/surface-lock-scene');

// Receive-shadow toggles (objects plan section C).
//  C1  an object with Cast shadow Off drops no shadow on OTHER objects either (only the ground honoured it).
//  C2  obj.shadow.receive: null follows the scene flag, true forces receiving, false never receives.
//  C3  ground.receiveShadows: false draws no cast shadow on the ground.
// Every case runs through BOTH composition paths: the surface-lock scene frame (v2 tone, receive map) and the pose path.

const clone = (v) => JSON.parse(JSON.stringify(v));

describe('scene3d receive-shadow toggles', () => {
  let rt; let V; let SL; let s;
  beforeAll(async () => {
    rt = await loadSurfaceLockRuntime(); V = rt.V; SL = V.Scene3D.SurfaceLock;
    s = buildSurfaceLockScene(V, { kind: 'sphere', toneLaw: 'ladder', mapper: 'hatch', markSpace: 'surface' });
    const id = s.eng.addObjectToScene(s.gid, 'box');
    const box = s.eng.getLayerById(id);
    box.params.style = clone(s.objectsOf()[0].params.style);
    s.setPose({ camYaw: -30, camPitch: 20 });
  });
  afterAll(() => rt && rt.cleanup());

  // Driven through the engine (hub caches, tone functions, receive map), exactly as the app composes a scene.
  const kids = () => s.eng.getLayerDescendants(s.gid);
  const leaves = () => s.objectsOf();
  const groundLeaf = () => kids().find((l) => l && l.type === 'sceneGround3d');
  const reset = () => {
    const [sph, box] = leaves();
    sph.params.transform = { ...(sph.params.transform || {}), x: 0, y: 75, z: 0 };
    box.params.transform = { ...(box.params.transform || {}), x: 5, y: 0, z: 0 };
    sph.params.shadow = { enabled: null }; box.params.shadow = { enabled: null };
    s.group.params.tone = { ...s.group.params.tone, model: 'v2' };
    s.group.params.shadow = { ...(s.group.params.shadow || {}), shadowReceiveOnObjects: true };
    delete groundLeaf().params.receiveShadows;
    kids().filter((l) => l && l.type === 'sceneLight3d').forEach((l) => { l.params.azimuth = 90; l.params.elevation = 62; l.params.castShadows = true; });
  };
  const bounds = {};
  const gen = (mut, path) => {
    reset();
    if (mut) mut({ sphere: leaves()[0], box: leaves()[1], ground: groundLeaf(), group: s.group });
    SL.stats && (SL.stats.sceneFrames = 0);
    const real = SL.frameable;
    if (path === 'pose') SL.frameable = () => false;
    try { return s.composeFull().slice(); } finally { SL.frameable = real; }
  };
  const meta = (q) => (q && q.meta) || {};
  const fillsOf = (paths, id) => paths.filter((q) => meta(q).kind === 'sceneFill' && (meta(q).sceneTarget || {}).objectId === id);
  const shadowsOf = (paths) => paths.filter((q) => (meta(q).sceneTarget || {}).regionClass === 'castShadow');
  const len = (paths) => paths.reduce((a, q) => { let l = 0; for (let i = 1; i < q.length; i++) l += Math.hypot(q[i].x - q[i - 1].x, q[i].y - q[i - 1].y); return a + l; }, 0);
  const key = (paths) => JSON.stringify(paths.map((q) => q.map((pt) => [Math.round(pt.x * 1e4), Math.round(pt.y * 1e4)])));

  ['locked', 'pose'].forEach((path) => {
    describe(`${path} path`, () => {
      const run = (mut) => gen(mut, path);
      const boxId = () => leaves()[1].id;

      it('sanity: the sphere shadows the box when the scene flag is on (and path is as named)', () => {
        const on = run(); const frames = SL.stats.sceneFrames;
        const off = run((o) => { o.group.params.shadow.shadowReceiveOnObjects = false; });
        if (path === 'locked') expect(frames).toBeGreaterThan(0); else expect(frames).toBe(0);
        expect(key(fillsOf(on, boxId()))).not.toBe(key(fillsOf(off, boxId())));
      });

      it('C1: a Cast-Off sphere no longer shadows the box (Auto still does)', () => {
        const on = run();
        // the sphere moved far out of the box's way, scene flag still on: the box takes no sphere shadow
        const unshadowed = run((o) => { o.sphere.params.transform = { ...o.sphere.params.transform, x: 400 }; });
        expect(key(fillsOf(unshadowed, boxId()))).not.toBe(key(fillsOf(on, boxId())));
        const castOff = run((o) => { o.sphere.params.shadow = { enabled: false }; });
        expect(key(fillsOf(castOff, boxId()))).toBe(key(fillsOf(unshadowed, boxId())));
        const auto = run((o) => { o.sphere.params.shadow = { enabled: null }; });
        expect(key(fillsOf(auto, boxId()))).toBe(key(fillsOf(on, boxId())));
        const forced = run((o) => { o.sphere.params.shadow = { enabled: true }; });
        expect(key(fillsOf(forced, boxId()))).toBe(key(fillsOf(on, boxId())));
      });

      it('C2: receive:false keeps the box unshadowed; receive:true shadows it with the scene flag off', () => {
        const off = run((o) => { o.group.params.shadow.shadowReceiveOnObjects = false; });
        const on = run();
        const recvOff = run((o) => { o.box.params.shadow = { enabled: null, receive: false }; });
        expect(key(fillsOf(recvOff, boxId()))).toBe(key(fillsOf(off, boxId())));
        const recvOn = run((o) => { o.group.params.shadow.shadowReceiveOnObjects = false; o.box.params.shadow = { enabled: null, receive: true }; });
        expect(key(fillsOf(recvOn, boxId()))).toBe(key(fillsOf(on, boxId())));
        const follow = run((o) => { o.box.params.shadow = { enabled: null, receive: null }; });
        expect(key(fillsOf(follow, boxId()))).toBe(key(fillsOf(on, boxId())));
      });

      it('C3: ground.receiveShadows:false draws no cast shadow on the ground', () => {
        const withG = run();
        expect(shadowsOf(withG).length).toBeGreaterThan(0);
        const noG = run((o) => { o.ground.params.receiveShadows = false; });
        expect(shadowsOf(noG).length).toBe(0);
        // the box still takes the sphere's shadow, only the floor stopped receiving
        expect(key(fillsOf(noG, boxId()))).toBe(key(fillsOf(withG, boxId())));
      });
    });
  });

  it('params: receive / receiveShadows are written only when non-default (byte-identical files)', () => {
    const P = V.Scene3D.Params;
    const base0 = clone(V.ALGO_DEFAULTS.scene3d);
    base0.objects = [{ id: 'a', primitive: 'box', params: {}, transform: {} }];
    const n0 = P.normalizeParams(base0);
    expect(n0.objects[0].shadow).toEqual({ enabled: null });
    expect('receiveShadows' in n0.ground).toBe(false);
    base0.objects[0].shadow = { enabled: null, receive: false };
    base0.ground = { enabled: true, receiveShadows: false };
    const n1 = P.normalizeParams(base0);
    expect(n1.objects[0].shadow).toEqual({ enabled: null, receive: false });
    expect(n1.ground.receiveShadows).toBe(false);
    base0.objects[0].shadow = { receive: true }; base0.ground = { enabled: true, receiveShadows: true };
    const n2 = P.normalizeParams(base0);
    expect(n2.objects[0].shadow).toEqual({ enabled: null, receive: true });
    expect('receiveShadows' in n2.ground).toBe(false);
  });

  it('monolith -> tree expansion keeps obj.shadow.receive and ground.receiveShadows (and a default file stays key-free)', () => {
    const mk = (recv, groundRecv) => {
      const eng = new V.VectorEngine();
      const mono = new V.Layer('mono-1', 'scene3d', 'Scene');
      mono.params = {
        ...clone(V.ALGO_DEFAULTS.scene3d), seed: 5, groups: [],
        objects: [{ id: 'o1', name: 'Box', primitive: 'box', params: { sx: 40, sy: 40, sz: 40 }, transform: { x: 0, y: 20, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 }, visibility: 'solid', role: 'solid', shadow: recv === undefined ? { enabled: null } : { enabled: null, receive: recv } }],
        ground: groundRecv === undefined ? { enabled: true } : { enabled: true, receiveShadows: groundRecv },
      };
      eng.layers = [mono];
      eng.expandMonolithToTree(mono.id);
      const kids = eng.getLayerDescendants(mono.id);
      return { leaf: kids.find((l) => l.type === 'object3d'), ground: kids.find((l) => l.type === 'sceneGround3d'), eng, gid: mono.id };
    };
    const off = mk(false, false);
    expect(off.leaf.params.shadow.receive).toBe(false);
    expect(off.ground.params.receiveShadows).toBe(false);
    const dflt = mk(undefined, undefined);
    expect('receive' in dflt.leaf.params.shadow).toBe(false);
    expect('receiveShadows' in dflt.ground.params).toBe(false);
  });
});
