/**
 * object3d algorithm — Scene-tree Increment A (data-only leaf layer).
 *
 * An object3d layer holds ONE 3D primitive. It does NOT own the render math:
 * `generate` builds a one-object scene3d params block (this object + the shared
 * scene defaults from ALGO_DEFAULTS.scene3d) and DELEGATES to the existing
 * scene3d algorithm's `generate`. Standalone output is therefore byte-identical
 * to the equivalent one-object scene3d output — there is no forked pipeline.
 *
 * When the layer is CONSUMED by a scene group (Increment B), the engine sets
 * `_sceneConsumed` (on bounds or params, mirroring morph groups' _morphConsumed)
 * and `generate` returns [] — the scene group runs the single shared HLR pass
 * and emits this object's paths itself.
 *
 * Determinism (A-17): scene3d is fully deterministic, so this delegation is too.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  const isConsumed = (params, bounds) =>
    (params && params._sceneConsumed === true) || (bounds && bounds._sceneConsumed === true);

  // Scene-level defaults (camera / lights / tone / shadow / ground / backdrop)
  // for a STANDALONE object come from the scene3d factory block — the single
  // source of truth — so a lone object3d matches a one-object scene3d exactly.
  // Object-level `shadow`/`border` live on the object itself (normalized into
  // the object entry); the scene-level `shadow` block is distinct and always
  // taken from the scene defaults here.
  const sceneDefaults = () => {
    const d = (Vectura.ALGO_DEFAULTS && Vectura.ALGO_DEFAULTS.scene3d) || {};
    const c = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
    return {
      sceneVersion: d.sceneVersion != null ? d.sceneVersion : 1,
      seed: d.seed != null ? d.seed : 0,
      camera: c(d.camera),
      lights: c(d.lights),
      tone: c(d.tone),
      shadow: c(d.shadow),
      ground: c(d.ground),
      backdrop: c(d.backdrop),
    };
  };

  // Map one object3d leaf's params into a one-object scene3d params block. The
  // object's Style becomes the scene-scope style (single object ⇒ equivalent to
  // per-object) and faceStyles become byFace entries keyed `${objectId}/${faceId}`.
  const toSceneParams = (params) => {
    const Params = Vectura.Scene3D && Vectura.Scene3D.Params;
    const norm = Params.normalizeObjectLayerParams(params);
    const { style, faceStyles } = norm;
    const object = {
      id: norm.id,
      name: norm.name,
      primitive: norm.primitive,
      role: norm.role,
      params: norm.params,
      transform: norm.transform,
      visibility: norm.visibility,
      shadow: norm.shadow,
      border: norm.border,
      emissive: norm.emissive,
    };
    const byFace = {};
    Object.keys(faceStyles || {}).forEach((key) => {
      const full = key.indexOf('/') >= 0 ? key : `${object.id}/${key}`;
      byFace[full] = faceStyles[key];
    });
    const d = sceneDefaults();
    return {
      sceneVersion: d.sceneVersion,
      seed: d.seed,
      objects: [object],
      lights: d.lights,
      tone: d.tone,
      shadow: d.shadow,
      ground: d.ground,
      backdrop: d.backdrop,
      camera: d.camera,
      groups: [],
      assets: {},
      styleTable: { scene: style, byObject: {}, byFace },
    };
  };

  window.Vectura.AlgorithmRegistry.object3d = {
    generate: (params = {}, rng, noise, bounds = {}) => {
      // Consumed by a scene group ⇒ the group emits this object's paths.
      if (isConsumed(params, bounds)) return [];
      const scene3d = Vectura.AlgorithmRegistry && Vectura.AlgorithmRegistry.scene3d;
      if (!scene3d || typeof scene3d.generate !== 'function') return [];
      return scene3d.generate(toSceneParams(params), rng, noise, bounds);
    },
    formula: (p = {}) => {
      const primitive = typeof p.primitive === 'string' && p.primitive ? p.primitive : 'box';
      return `3D object: a standalone ${primitive} rendered through the scene3d pipeline (single-object scene).`;
    },
  };
})();
