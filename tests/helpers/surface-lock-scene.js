const { loadVecturaRuntime } = require('./load-vectura-runtime');
const { SCENE3D_FILES } = require('./runtime-profiles');
const { pinLegacySun } = require('./legacy-sun');

/*
 * Shared rig for the surface-locked fill suites (docs/surface-lock-contract.md §14).
 *
 * Every scene is built through engine.addLayer('scene3d'), so it sees ALGO_DEFAULTS, the factory
 * preset and the creation seeds (CLAUDE.md "Where a default actually comes from"). Style overrides are
 * written onto the object3d LEAF the way the panel writes them.
 *
 *   const rt = await loadSurfaceLockRuntime();           // one load per test file; rt.cleanup() in afterAll
 *   const s = buildSurfaceLockScene(rt.V, {
 *     kind: 'sphere' | 'box' | 'two',                    // 'two' = default sphere + a box beside it
 *     markSpace: 'surface' | 'pose' | undefined,         // undefined = whatever the creation seed wrote
 *     mapper, toneLaw, style: { ...extra style params },
 *     camera: { yaw, pitch, ... }, ground: true, shadow: true, profile: { width, height },
 *     legacySun: true,                                   // pin the pre-v7 sun (az 135 / el 45); default = the v7 front key
 *   });
 *   s.setPose({ camYaw, camPitch, objYaw })               // camera and/or first-object yaw
 *   s.composeFull() -> paths                              // fresh full compose (what export reads)
 *   s.composePreview() -> paths                           // one drag frame (engine.generate preview)
 *   s.fills(paths), s.edges(paths)                        // filter by meta.kind
 *
 *   dragEqualsExport(s, poses, { precision }) -> [{ pose, equal, previewSig, fullSig, ... }]
 *     For each pose: a drag frame (preview) and then an independent full compose must serialize
 *     to the same paths. This is the frame == export harness (contract §14 test 2). It is
 *     meaningful only for surface scenes; pose-mode drags use draft tiers and are not expected
 *     to match.
 */

const DEFAULT_PROFILE = { width: 320, height: 220, name: 'surface-lock' };
const clone = (v) => JSON.parse(JSON.stringify(v));

const loadSurfaceLockRuntime = async (options = {}) => {
  const runtime = await loadVecturaRuntime({ ...options, profile: 'feature', files: SCENE3D_FILES });
  return { runtime, V: runtime.window.Vectura, cleanup: () => runtime.cleanup() };
};

const leafStyle = (leaf) => {
  leaf.params.style = leaf.params.style || { penId: null, mapper: 'hatch', params: {} };
  leaf.params.style.params = leaf.params.style.params || {};
  return leaf.params.style;
};

const buildSurfaceLockScene = (V, opts = {}) => {
  const o = { kind: 'sphere', ground: true, shadow: true, ...opts };
  const eng = new V.VectorEngine();
  eng.currentProfile = { ...DEFAULT_PROFILE, ...(o.profile || {}) };
  const gid = eng.addLayer('scene3d');
  const group = eng.getLayerById(gid);
  const kids = () => eng.getLayerDescendants(gid);
  const objectsOf = () => kids().filter((l) => l && l.type === 'object3d');
  // legacySun: pin the pre-v7 sun (az 135 / el 45) for suites that are not about the default light.
  if (o.legacySun) pinLegacySun(eng, gid);
  if (o.camera) group.params.camera = { ...group.params.camera, ...o.camera };
  const ground = kids().find((l) => l && l.type === 'sceneGround3d');
  if (ground && o.ground === false) ground.visible = false;
  if (o.shadow === false) {
    kids().filter((l) => l && l.type === 'sceneLight3d').forEach((l) => { l.params.castShadows = false; });
    (group.params.lights || []).forEach((l) => { l.castShadows = false; });
  }
  const first = objectsOf()[0];
  if (o.kind === 'box') {
    first.params.primitive = 'box';
    const P = V.Scene3D.Params;
    first.params.params = clone((P.PRIMITIVE_PARAM_DEFAULTS && P.PRIMITIVE_PARAM_DEFAULTS.box) || { sx: 40, sy: 40, sz: 40 });
  }
  if (o.kind === 'two') {
    const id = eng.addObjectToScene(gid, 'box');
    const box = eng.getLayerById(id);
    if (box) box.params.transform = { ...(box.params.transform || {}), x: 45 };
  }
  objectsOf().forEach((leaf) => {
    const st = leafStyle(leaf);
    if (o.mapper) st.mapper = o.mapper;
    if (o.toneLaw) st.params.toneLaw = o.toneLaw;
    if (o.style) Object.assign(st.params, clone(o.style));
    if (o.markSpace === 'surface' || o.markSpace === 'pose') st.params.markSpace = o.markSpace;
  });

  const setPose = (pose = {}) => {
    if (Number.isFinite(pose.camYaw) || Number.isFinite(pose.camPitch)) {
      group.params.camera = {
        ...group.params.camera,
        ...(Number.isFinite(pose.camYaw) ? { yaw: pose.camYaw } : {}),
        ...(Number.isFinite(pose.camPitch) ? { pitch: pose.camPitch } : {}),
      };
    }
    if (Number.isFinite(pose.objYaw)) {
      const leaf = objectsOf()[0];
      leaf.params.transform = { ...(leaf.params.transform || {}), yaw: pose.objYaw };
    }
  };
  const composeFull = () => {
    eng.invalidateSceneCompose(group);
    eng.computeAllDisplayGeometry();
    return eng.getLayerById(gid).scenePaths || [];
  };
  const composePreview = () => {
    eng.generate(gid, { preview: true });
    return eng.getLayerById(gid).scenePaths || [];
  };
  const kindOf = (p) => (p && p.meta && p.meta.kind) || null;
  return {
    V, eng, gid, group, objectsOf, setPose, composeFull, composePreview,
    fills: (paths) => paths.filter((p) => kindOf(p) === 'sceneFill'),
    edges: (paths) => paths.filter((p) => kindOf(p) === 'sceneEdge'),
  };
};

const DEFAULT_POSES = Object.freeze([
  { camYaw: -30, camPitch: 20 }, { camYaw: 0, camPitch: 20 }, { camYaw: 35, camPitch: 10 }, { camYaw: 80, camPitch: 30 },
  { camYaw: 150, camPitch: 5 }, { camYaw: -120, camPitch: 45 }, { camYaw: -30, camPitch: 20, objYaw: 40 },
  { camYaw: -30, camPitch: 20, objYaw: -75 },
]);

// Points AND meta (path-signature's serializePaths drops array-borne meta under JSON.stringify).
const signature = (paths, precision = 9) => {
  const f = Math.pow(10, precision);
  const r = (n) => Math.round(Number(n) * f) / f;
  return JSON.stringify((paths || []).map((p) => ({
    p: Array.isArray(p) ? p.map((pt) => [r(pt.x), r(pt.y)]) : null,
    m: p && p.meta ? JSON.parse(JSON.stringify(p.meta, (_, v) => (typeof v === 'number' ? r(v) : v))) : null,
  })));
};

const dragEqualsExport = (scene, poses = DEFAULT_POSES, { precision = 9 } = {}) => poses.map((pose) => {
  scene.setPose(pose);
  const previewSig = signature(scene.composePreview(), precision);
  const previewPaths = scene.group.scenePaths ? scene.group.scenePaths.length : 0;
  const full = scene.composeFull();
  const fullSig = signature(full, precision);
  return { pose, equal: previewSig === fullSig, previewPaths, fullPaths: full.length, previewSig, fullSig };
});

module.exports = { loadSurfaceLockRuntime, buildSurfaceLockScene, dragEqualsExport, signature, DEFAULT_POSES, DEFAULT_PROFILE };
