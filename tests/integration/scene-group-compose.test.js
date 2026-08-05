const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Scene-tree Increment B — scene-GROUP compositor collection (data/engine).
 *
 * A scene3d layer flagged as a group (isGroup + containerRole 'scene') COLLECTS
 * its descendant object3d / booleanGroup3d layers into one assembled scene input
 * (objects[] / groups[] / styleTable), then runs the EXISTING scene3d compositor
 * ONCE so every emitted path lives on the group. This mirrors the morph-group
 * compose (_refoldMorphGroup / _morphConsumed / group.morphedPaths).
 *
 * The load-bearing invariant (A-17 determinism): a scene group with 2 object3d
 * + 1 booleanGroup3d child produces output BYTE-IDENTICAL to the equivalent
 * MONOLITHIC scene3d layer with the same objects/groups in params. Consumed
 * children emit nothing. An inline-only scene group (no children) is unchanged.
 */

const clone = (v) => JSON.parse(JSON.stringify(v));

describe('Scene-tree Increment B — scene-group compositor collection', () => {
  let runtime;
  let V;
  let Params;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    Params = V.Scene3D.Params;
  });

  afterAll(() => runtime.cleanup());

  // Bounds built EXACTLY like Engine.generate() so a direct scene3d.generate()
  // monolith matches the group compose byte-for-byte.
  const composeBounds = (engine, penId = null) => {
    const S = V.SETTINGS;
    const { width, height } = engine.currentProfile;
    const m = S.margin;
    const pens = Array.isArray(S.pens) ? S.pens : [];
    const pen = pens.find((p) => p && p.id === penId) || pens[0];
    const penWidth = Number(pen && pen.width) > 0 ? Number(pen.width) : 0.35;
    return {
      width, height, m, dW: width - m * 2, dH: height - m * 2,
      penWidth, truncate: S.truncate, fastPreview: false,
      preview3dQuality: S.preview3dQuality,
    };
  };

  // The scene-level defaults a fresh scene3d layer is born with (camera / lights
  // / tone / shadow / ground / backdrop), so the monolith and the group share an
  // identical scene envelope.
  const sceneEnvelope = () => {
    const d = clone(V.ALGO_DEFAULTS.scene3d);
    return {
      sceneVersion: d.sceneVersion, seed: 7,
      lights: d.lights, tone: d.tone, shadow: d.shadow,
      ground: d.ground, backdrop: d.backdrop, camera: d.camera,
      assets: {},
    };
  };

  // Two solid objects + a subtract boolean group of two more, expressed as
  // object3d/booleanGroup3d layer params (pre-collection).
  const objA = {
    primitive: 'box', params: { sx: 40, sy: 40, sz: 40 },
    transform: { x: -30, y: 20, z: 0, yaw: 12, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid', role: 'solid',
    shadow: { enabled: null }, border: { enabled: false, strength: 1, penId: null },
    emissive: { enabled: false, intensity: 1, penId: null, halo: 'burst', haloCount: 16, haloRings: 3, coreBlank: true },
    style: { penId: null, mapper: 'wireframe', params: {} },
    faceStyles: {},
  };
  const objB = {
    primitive: 'sphere', params: { radius: 18, detail: 16 },
    transform: { x: 34, y: 22, z: -4, yaw: 0, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid', role: 'solid',
    shadow: { enabled: null }, border: { enabled: false, strength: 1, penId: null },
    emissive: { enabled: false, intensity: 1, penId: null, halo: 'burst', haloCount: 16, haloRings: 3, coreBlank: true },
    style: { penId: null, mapper: 'hatch', params: { fillAngle: 30, fillDensity: 55 } },
    faceStyles: { '0': { penId: null, mapper: 'crosshatch', params: {} } },
  };
  const boolSolid = {
    primitive: 'box', params: { sx: 30, sy: 30, sz: 30 },
    transform: { x: 0, y: 24, z: 20, yaw: 0, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid', role: 'solid',
    shadow: { enabled: null }, border: { enabled: false, strength: 1, penId: null },
    emissive: { enabled: false, intensity: 1, penId: null, halo: 'burst', haloCount: 16, haloRings: 3, coreBlank: true },
    style: { penId: null, mapper: 'wireframe', params: {} }, faceStyles: {},
  };
  const boolHole = {
    primitive: 'sphere', params: { radius: 12, detail: 16 },
    transform: { x: 6, y: 24, z: 20, yaw: 0, pitch: 0, roll: 0, scale: 1 },
    visibility: 'solid', role: 'hole',
    shadow: { enabled: null }, border: { enabled: false, strength: 1, penId: null },
    emissive: { enabled: false, intensity: 1, penId: null, halo: 'burst', haloCount: 16, haloRings: 3, coreBlank: true },
    style: { penId: null, mapper: 'wireframe', params: {} }, faceStyles: {},
  };

  // Map ONE object3d layer's params → a monolith objects[] entry + its style
  // routing, using the LAYER id as the objectId (the identity contract).
  const objectEntry = (layerId, p) => {
    const n = Params.normalizeObjectLayerParams(p);
    const object = {
      id: layerId, name: n.name, primitive: n.primitive, role: n.role,
      params: n.params, transform: n.transform, visibility: n.visibility,
      shadow: n.shadow, border: n.border, emissive: n.emissive,
    };
    const byFace = {};
    Object.keys(n.faceStyles).forEach((fid) => { byFace[`${layerId}/${fid}`] = n.faceStyles[fid]; });
    return { object, style: n.style, byFace };
  };

  const buildTree = (engine) => {
    const grp = new V.Layer('scene-grp', 'scene3d', 'Scene');
    grp.isGroup = true;
    grp.containerRole = 'scene';
    // Scene group owns the envelope; inline object/group arrays are EMPTY (the
    // objects come from child layers).
    grp.params = { ...sceneEnvelope(), objects: [], groups: [],
      styleTable: { scene: { penId: null, mapper: 'wireframe', params: {} }, byObject: {}, byFace: {} } };
    engine.layers.push(grp);

    const la = new V.Layer('obj-a', 'object3d', 'A');
    Object.assign(la.params, clone(objA));
    la.parentId = grp.id;
    engine.layers.push(la);

    const lb = new V.Layer('obj-b', 'object3d', 'B');
    Object.assign(lb.params, clone(objB));
    lb.parentId = grp.id;
    engine.layers.push(lb);

    const lbool = new V.Layer('bool-1', 'booleanGroup3d', 'Bool');
    lbool.isGroup = true;
    lbool.containerRole = 'boolean';
    lbool.params.op = 'subtract';
    lbool.parentId = grp.id;
    engine.layers.push(lbool);

    const lbs = new V.Layer('bool-solid', 'object3d', 'BSolid');
    Object.assign(lbs.params, clone(boolSolid));
    lbs.parentId = lbool.id;
    engine.layers.push(lbs);

    const lbh = new V.Layer('bool-hole', 'object3d', 'BHole');
    Object.assign(lbh.params, clone(boolHole));
    lbh.parentId = lbool.id;
    engine.layers.push(lbh);

    return { grp, la, lb, lbool, lbs, lbh };
  };

  // Assemble the MONOLITH params from the SAME child params, in the SAME
  // depth-first descendant order (A, B, then the boolean group's own children).
  const buildMonolith = (ids) => {
    const eA = objectEntry(ids.la, objA);
    const eB = objectEntry(ids.lb, objB);
    const eBS = objectEntry(ids.lbs, boolSolid);
    const eBH = objectEntry(ids.lbh, boolHole);
    const boolStyle = Params.normalizeStyle({ penId: null, mapper: 'wireframe', params: {} });
    return {
      ...sceneEnvelope(),
      objects: [eA.object, eB.object, eBS.object, eBH.object],
      groups: [{ id: ids.lbool, name: 'Bool', op: 'subtract', children: [ids.lbs, ids.lbh] }],
      styleTable: {
        scene: { penId: null, mapper: 'wireframe', params: {} },
        byObject: { [ids.la]: eA.style, [ids.lb]: eB.style, [ids.lbs]: eBS.style, [ids.lbh]: eBH.style, [ids.lbool]: boolStyle },
        byFace: { ...eA.byFace, ...eB.byFace, ...eBS.byFace, ...eBH.byFace },
      },
    };
  };

  test('collectSceneParams is exported', () => {
    expect(typeof Params.collectSceneParams).toBe('function');
  });

  test('scene group (2 object3d + 1 boolean) === monolith, byte-identical', () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const t = buildTree(engine);
    engine.layers.forEach((l) => { if (!l.isGroup) engine.generate(l.id); });
    engine.computeAllDisplayGeometry();

    const groupPaths = t.grp.scenePaths;
    expect(Array.isArray(groupPaths)).toBe(true);
    expect(groupPaths.length).toBeGreaterThan(0);

    const ids = { la: t.la.id, lb: t.lb.id, lbool: t.lbool.id, lbs: t.lbs.id, lbh: t.lbh.id };
    const monoParams = buildMonolith(ids);
    const rng = new V.SeededRNG(monoParams.seed);
    const noise = new V.SimpleNoise(monoParams.seed);
    const monoPaths = V.AlgorithmRegistry.scene3d.generate(monoParams, rng, noise, composeBounds(engine));

    expect(groupPaths).toEqual(monoPaths);
    // Identity contract: emitted object paths key on the child LAYER id (no
    // lookup table) — each object3d child's id appears as a sceneTarget.objectId.
    const seen = new Set();
    groupPaths.forEach((p) => {
      const oid = p.meta && p.meta.sceneTarget && p.meta.sceneTarget.objectId;
      if (oid != null) seen.add(oid);
    });
    [t.la.id, t.lb.id, t.lbs.id].forEach((cid) => expect(seen.has(cid)).toBe(true));
  });

  test('consumed children emit nothing (getRenderablePaths → [])', () => {
    const engine = new V.VectorEngine();
    engine.layers = [];
    const t = buildTree(engine);
    engine.layers.forEach((l) => { if (!l.isGroup) engine.generate(l.id); });
    engine.computeAllDisplayGeometry();

    [t.la, t.lb, t.lbool, t.lbs, t.lbh].forEach((l) => {
      expect(l._sceneConsumed).toBe(true);
      expect(engine.getRenderablePaths(l)).toEqual([]);
    });
    // The scene group serves the composed paths.
    expect(engine.getRenderablePaths(t.grp)).toBe(t.grp.scenePaths);
  });

  test('inline-only scene group (zero children) === monolith leaf', () => {
    const engine = new V.VectorEngine();
    engine.layers = [];

    // Monolith leaf: a plain scene3d layer with two inline objects.
    const eA = objectEntry('obj-1', objA);
    const eB = objectEntry('obj-2', objB);
    const inlineParams = {
      ...sceneEnvelope(),
      objects: [eA.object, eB.object],
      groups: [],
      styleTable: {
        scene: { penId: null, mapper: 'wireframe', params: {} },
        byObject: { 'obj-1': eA.style, 'obj-2': eB.style },
        byFace: { ...eA.byFace, ...eB.byFace },
      },
    };
    const rng = new V.SeededRNG(inlineParams.seed);
    const noise = new V.SimpleNoise(inlineParams.seed);
    const monoPaths = V.AlgorithmRegistry.scene3d.generate(clone(inlineParams), rng, noise, composeBounds(engine));

    // Same params, but on a scene GROUP with NO child layers (inline arrays).
    const grp = new V.Layer('scene-grp', 'scene3d', 'Scene');
    grp.isGroup = true;
    grp.containerRole = 'scene';
    grp.params = clone(inlineParams);
    engine.layers.push(grp);
    engine.computeAllDisplayGeometry();

    expect(grp.scenePaths).toEqual(monoPaths);
  });
});
