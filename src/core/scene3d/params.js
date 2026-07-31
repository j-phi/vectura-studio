/**
 * Scene3D.Params — scene3d params schema (CONTRACT A): normalization,
 * sanitization, and the sceneVersion migration slot.
 *
 * The scene lives fully serialized in layer.params (JSON-safe; regenerates
 * from params). `normalizeParams` back-fills every scene noun (objects,
 * lights, ground, backdrop, camera, styleTable, assets, groups), clamps
 * numerics to finite values, and guarantees unique `obj-<n>` object ids —
 * WITHOUT mutating its input. `sanitizeSceneParams` is the engine's import
 * branch: migration first (keyed on params.sceneVersion), then normalization.
 *
 * Dependency chain: Geometry3D → Scene3D.Charts → Scene3D.Mesh →
 * Scene3D.Params → Scene3D.Scene/Edges/Depth/HLR → algorithms/scene3d.js.
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  const Vectura = (globalScope.Vectura = globalScope.Vectura || {});
  const G3 = Vectura.Geometry3D || {};
  const finite = G3.finite || ((value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback));
  const clamp = G3.clamp || ((value, min, max) => Math.max(min, Math.min(max, Number(value) || 0)));

  // Format version of the scene schema INSIDE layer.params (independent of the
  // .vectura engine formatVersion). Bump + add a SCENE_MIGRATIONS step when the
  // scene shape changes incompatibly.
  const SCENE_VERSION = 1;
  // Keyed by SOURCE version: SCENE_MIGRATIONS[n] upgrades an n payload to n+1.
  const SCENE_MIGRATIONS = {};

  const PRIMITIVES = [
    'box', 'plane', 'sphere', 'ellipsoid', 'cylinder', 'cone', 'torus',
    'torusKnot', 'capsule', 'superellipsoid', 'pyramid', 'solid',
  ];

  const MAPPERS = ['none', 'hatch', 'wireframe']; // Phase 1 set; Phase 3 extends.

  // Per-primitive params-bag defaults. Sizes are document mm. For the topoform
  // family (ellipsoid…pyramid) sx/sy/sz feed the Scene3D.Mesh chart builders
  // directly (they interpret them as radius / half-height per chart).
  const PRIMITIVE_PARAM_DEFAULTS = {
    box: { sx: 40, sy: 40, sz: 40 },
    plane: { sx: 120, sz: 120 },
    sphere: { radius: 20, detail: 16 },
    ellipsoid: { sx: 26, sy: 18, sz: 20, detail: 16 },
    cylinder: { sx: 16, sy: 22, sz: 16, detail: 16 },
    cone: { sx: 18, sy: 22, sz: 18, detail: 16 },
    torus: { sx: 30, sy: 22, sz: 22, detail: 16 },
    torusKnot: { sx: 26, sy: 22, sz: 22, detail: 20 },
    capsule: { sx: 14, sy: 24, sz: 14, detail: 16 },
    superellipsoid: { sx: 20, sy: 20, sz: 20, detail: 16 },
    pyramid: { sx: 20, sy: 20, sz: 20, detail: 8 },
    solid: { solidType: 'buckyball', radius: 20, sideCount: 5, depth: 24, frequency: 2, taper: 55, starRatio: 45 },
  };

  const DEFAULT_TRANSFORM = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
  const DEFAULT_CAMERA = {
    projection: 'orthographic', yaw: -30, pitch: 20, roll: 0,
    cameraDistance: 620, focalLength: 520, zoom: 1,
  };
  const DEFAULT_LIGHT = { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true };

  const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

  const normalizeStyle = (style) => {
    const src = isObject(style) ? style : {};
    const params = {};
    if (isObject(src.params)) {
      Object.keys(src.params).forEach((key) => {
        const value = src.params[key];
        if (typeof value === 'number') {
          if (Number.isFinite(value)) params[key] = value;
        } else {
          params[key] = value;
        }
      });
    }
    return {
      penId: typeof src.penId === 'string' && src.penId ? src.penId : null,
      mapper: MAPPERS.includes(src.mapper) ? src.mapper : 'none',
      params,
    };
  };

  const normalizeStyleTable = (table) => {
    const src = isObject(table) ? table : {};
    const mapOf = (bag) => {
      const out = {};
      if (isObject(bag)) {
        Object.keys(bag).forEach((key) => { out[key] = normalizeStyle(bag[key]); });
      }
      return out;
    };
    return {
      scene: normalizeStyle(src.scene),
      byObject: mapOf(src.byObject),
      byFace: mapOf(src.byFace),
    };
  };

  const normalizeTransform = (transform) => {
    const src = isObject(transform) ? transform : {};
    return {
      x: finite(src.x, 0),
      y: finite(src.y, 0),
      z: finite(src.z, 0),
      yaw: finite(src.yaw, 0),
      pitch: finite(src.pitch, 0),
      roll: finite(src.roll, 0),
      scale: Math.max(0.01, finite(src.scale, 1)),
    };
  };

  const normalizePrimitiveParams = (primitive, params) => {
    const defaults = PRIMITIVE_PARAM_DEFAULTS[primitive] || PRIMITIVE_PARAM_DEFAULTS.box;
    const src = isObject(params) ? params : {};
    const out = {};
    // Known keys: coerce to finite numbers (strings like solidType pass through).
    Object.keys(defaults).forEach((key) => {
      const fallback = defaults[key];
      if (typeof fallback === 'number') out[key] = finite(src[key], fallback);
      else out[key] = typeof src[key] === typeof fallback ? src[key] : fallback;
    });
    // Extra keys survive (forward compat), with non-finite numbers dropped.
    Object.keys(src).forEach((key) => {
      if (key in out) return;
      const value = src[key];
      if (typeof value === 'number' && !Number.isFinite(value)) return;
      out[key] = value;
    });
    return out;
  };

  const normalizeObject = (obj, index, usedIds) => {
    if (!isObject(obj)) return null;
    const primitive = PRIMITIVES.includes(obj.primitive) ? obj.primitive : 'box';
    let id = typeof obj.id === 'string' && obj.id ? obj.id : '';
    if (!id || usedIds.has(id)) {
      let n = index + 1;
      while (!id || usedIds.has(id)) { id = `obj-${n}`; n += 1; }
    }
    usedIds.add(id);
    return {
      id,
      name: typeof obj.name === 'string' && obj.name ? obj.name : `Object ${index + 1}`,
      primitive,
      params: normalizePrimitiveParams(primitive, obj.params),
      transform: normalizeTransform(obj.transform),
      visibility: obj.visibility === 'xray' ? 'xray' : 'solid',
    };
  };

  const normalizeLight = (light, index) => {
    const src = isObject(light) ? light : {};
    return {
      id: typeof src.id === 'string' && src.id ? src.id : (index === 0 ? 'sun' : `light-${index + 1}`),
      // A-15: type field is kept verbatim for unknown (future) light types so
      // new kinds round-trip without a format migration; v1 renders directional.
      type: typeof src.type === 'string' && src.type ? src.type : 'directional',
      azimuth: finite(src.azimuth, DEFAULT_LIGHT.azimuth),
      elevation: finite(src.elevation, DEFAULT_LIGHT.elevation),
      castShadows: src.castShadows !== false,
    };
  };

  const normalizeCamera = (camera) => {
    const src = isObject(camera) ? camera : {};
    return {
      projection: src.projection === 'perspective' ? 'perspective' : 'orthographic',
      yaw: finite(src.yaw, DEFAULT_CAMERA.yaw),
      pitch: finite(src.pitch, DEFAULT_CAMERA.pitch),
      roll: finite(src.roll, DEFAULT_CAMERA.roll),
      cameraDistance: Math.max(0, finite(src.cameraDistance, DEFAULT_CAMERA.cameraDistance)),
      focalLength: Math.max(1, finite(src.focalLength, DEFAULT_CAMERA.focalLength)),
      zoom: clamp(finite(src.zoom, 1), 0.05, 40),
    };
  };

  // Pure normalization: returns a NEW params object with every scene noun in
  // canonical shape. Non-scene keys (posX, scaleX, label, …) pass through.
  // `assets` is kept BY REFERENCE (content-hashed table; cloneLayerParams
  // ref-skips it, so normalization must not fork it either).
  const normalizeParams = (params) => {
    const src = isObject(params) ? params : {};
    const out = { ...src };
    out.sceneVersion = Math.max(1, Math.round(finite(src.sceneVersion, SCENE_VERSION)));
    out.seed = finite(src.seed, 0);
    const usedIds = new Set();
    const objects = (Array.isArray(src.objects) ? src.objects : [])
      .map((obj, index) => normalizeObject(obj, index, usedIds))
      .filter(Boolean);
    out.objects = objects.length ? objects : [normalizeObject({ primitive: 'box', name: 'Box 1' }, 0, usedIds)];
    const lights = (Array.isArray(src.lights) ? src.lights : [])
      .filter(isObject)
      .map((light, index) => normalizeLight(light, index));
    out.lights = lights.length ? lights : [{ ...DEFAULT_LIGHT }];
    out.ground = { enabled: isObject(src.ground) ? src.ground.enabled !== false : true };
    out.backdrop = { enabled: isObject(src.backdrop) ? src.backdrop.enabled === true : false };
    out.camera = normalizeCamera(src.camera);
    out.groups = Array.isArray(src.groups) ? src.groups.slice() : [];
    out.assets = isObject(src.assets) ? src.assets : {};
    out.styleTable = normalizeStyleTable(src.styleTable);
    return out;
  };

  // Scene migration chain (keyed on params.sceneVersion), then normalization.
  // Payloads NEWER than SCENE_VERSION load as-is (best-effort forward compat).
  const migrateScene = (params) => {
    let out = isObject(params) ? params : {};
    let version = Math.max(1, Math.round(finite(out.sceneVersion, 1)));
    while (version < SCENE_VERSION) {
      const step = SCENE_MIGRATIONS[version];
      if (typeof step === 'function') out = step(out) || out;
      version += 1;
    }
    return { ...out, sceneVersion: Math.max(version, SCENE_VERSION) };
  };

  // Engine import branch (sanitizeImportedParams → scene3d): migrate, then
  // normalize. Never throws; garbage in → canonical scene out.
  const sanitizeSceneParams = (params) => normalizeParams(migrateScene(params));

  const api = {
    SCENE_VERSION,
    PRIMITIVES,
    MAPPERS,
    PRIMITIVE_PARAM_DEFAULTS,
    DEFAULT_TRANSFORM,
    DEFAULT_CAMERA,
    normalizeStyle,
    normalizeStyleTable,
    normalizeParams,
    migrateScene,
    sanitizeSceneParams,
  };

  Vectura.Scene3D = Object.assign(Vectura.Scene3D || {}, { Params: api });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
