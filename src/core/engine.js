/**
 * Core vector generation engine.
 */
(() => {
  const {
    MACHINES,
    SETTINGS,
    ALGO_DEFAULTS,
    MODIFIER_DEFAULTS = {},
    Algorithms,
    SeededRNG,
    SimpleNoise,
    Layer,
    GeometryUtils = {},
    OptimizationUtils = {},
    Masking = {},
    Modifiers = {},
  } = window.Vectura || {};

  const applyCurveFit = GeometryUtils.applyCurveFit || ((path) => path);
  const applyCornerRounding = GeometryUtils.applyCornerRounding || ((path) => path);
  const simplifyPath = GeometryUtils.simplifyPath || ((path) => path);
  const simplifyPathVisvalingam = GeometryUtils.simplifyPathVisvalingam || ((path) => path);
  const countPathPoints = GeometryUtils.countPathPoints || (() => ({ lines: 0, points: 0 }));
  const clonePaths =
    GeometryUtils.clonePaths ||
    ((paths) =>
      (paths || []).map((path) => {
        if (!Array.isArray(path)) return path;
        const next = path.map((pt) => ({ ...pt }));
        if (path.meta) next.meta = JSON.parse(JSON.stringify(path.meta));
        return next;
      }));
  const cloneAnchors = GeometryUtils.cloneAnchors || ((a) => (a || []).map((p) => ({ ...p })));
  const pointsToAnchors =
    GeometryUtils.pointsToAnchors ||
    ((pts) => (pts || []).map((p) => ({ x: p.x, y: p.y, in: null, out: null })));
  const buildPolylineFromAnchors =
    GeometryUtils.buildPolylineFromAnchors ||
    ((anchors) => (anchors || []).map((a) => ({ x: a.x, y: a.y })));
  const rebuildShapeAnchors =
    GeometryUtils.rebuildShapeAnchors || ((anchors) => ({ anchors: anchors || [], changed: false }));

  // AUD-02: `.vectura` engine-state schema version. Bump when exportState's
  // shape changes incompatibly, and add a migration step below. Payloads
  // without the field are version 0 (legacy, pre-1.3.x) — identical to
  // version 1 except for the field itself.
  //
  // v2 (Scene-tree Increment F): a saved MONOLITH scene3d layer (inline
  // params.objects/groups/lights/ground, not yet a scene group) expands into
  // the canonical scene TREE on load. The payload SHAPE is unchanged (the
  // expansion is a layer-graph rewrite done post-construction — see
  // _migrateMonolithScenesToTree, gated on the source version so a v2 doc is
  // left alone). Increment B's inline-union compositor keeps any un-expanded
  // monolith rendering byte-identically, so this changes the layer TREE, not
  // the emitted geometry.
  const VECTURA_FORMAT_VERSION = 2;

  // Keyed by SOURCE version: STATE_MIGRATIONS[n] upgrades a version-n payload
  // to version n+1. importState walks the chain up to VECTURA_FORMAT_VERSION.
  const STATE_MIGRATIONS = {
    0: (state) => state, // 0 → 1: the field was added; the payload shape is unchanged.
    1: (state) => state, // 1 → 2: payload shape unchanged; the monolith → tree
    //                            expansion is a layer-graph rewrite applied on
    //                            live layers (_migrateMonolithScenesToTree).
  };

  // Payloads NEWER than this build load as-is (best-effort forward compat);
  // the file-open UI surfaces a non-blocking warning for that case.
  const migrateEngineState = (state) => {
    let version = Number.isFinite(Number(state?.formatVersion)) ? Number(state.formatVersion) : 0;
    let out = state;
    while (version < VECTURA_FORMAT_VERSION) {
      const step = STATE_MIGRATIONS[version];
      if (typeof step === 'function') out = step(out) || out;
      version += 1;
    }
    return out;
  };

  const PRIMITIVE_SHAPE_KINDS = new Set(['circle', 'rect', 'oval', 'polygon', 'star']);
  const isFreeformShapePath = (path) => {
    if (!Array.isArray(path)) return false;
    if (path.meta?.shape) return false;
    if (path.meta?.kind && PRIMITIVE_SHAPE_KINDS.has(path.meta.kind)) return false;
    return true;
  };

  const applyShapeAnchorRebuild = (layer, bounds) => {
    if (!layer || layer.type !== 'shape' || !Array.isArray(layer.sourcePaths)) return;
    const p = layer.params || {};
    const simplify = Math.max(0, Math.min(1, p.simplify ?? 0));
    const smoothing = Math.max(0, Math.min(2, p.smoothing ?? 0));
    const curves = p.curves === true;
    const active = simplify > 0 || smoothing > 0;

    layer.sourcePaths.forEach((path) => {
      if (!isFreeformShapePath(path)) return;
      if (!path.meta) path.meta = {};

      if (active) {
        if (!path.meta.originalAnchors) {
          const baseline = Array.isArray(path.meta.anchors) && path.meta.anchors.length >= 2
            ? cloneAnchors(path.meta.anchors)
            : pointsToAnchors(path);
          path.meta.originalAnchors = baseline;
          path.meta.originalClosed = Boolean(path.meta.closed);
        }
        const result = rebuildShapeAnchors(path.meta.originalAnchors, {
          curves,
          simplify,
          smoothing,
          closed: path.meta.originalClosed,
          bounds,
        });
        path.meta.anchors = result.anchors;
        path.meta.closed = Boolean(path.meta.originalClosed);
        const resampled = buildPolylineFromAnchors(result.anchors, path.meta.originalClosed);
        path.length = 0;
        for (const pt of resampled) path.push(pt);
      } else if (path.meta.originalAnchors) {
        const original = path.meta.originalAnchors;
        const restoredClosed = Boolean(path.meta.originalClosed);
        path.meta.anchors = cloneAnchors(original);
        path.meta.closed = restoredClosed;
        const restored = buildPolylineFromAnchors(original, restoredClosed);
        path.length = 0;
        for (const pt of restored) path.push(pt);
        delete path.meta.originalAnchors;
        delete path.meta.originalClosed;
      }
    });
  };

  const usesManualSourceGeometry = (layer) => Boolean(layer && !layer.isGroup && layer.type === 'shape');

  // On a fitted path the ANCHORS are the geometry — the point array is only a
  // flattened cache, which the simplify pass deliberately leaves alone. Counting
  // that cache made the readout under the Simplify slider stand still while the
  // user dragged it, even though the exported SVG really was thinning (a curved
  // flowfield went 455 -> 160 anchors while the readout sat at 891 -> 891). Both
  // sides of the "a -> b" arrow must be measured with THIS, or they are not
  // comparable quantities.
  const countLayerGeometry = (paths) => {
    let lines = 0;
    let points = 0;
    (paths || []).forEach((path) => {
      if (!Array.isArray(path)) return;
      const anchors = path.meta && path.meta.anchors;
      const fitted = Array.isArray(anchors) && anchors.some((a) => a && (a.in || a.out));
      if (!fitted && !path.length) return;
      lines += 1;
      points += fitted ? anchors.length : path.length;
    });
    return { lines, points };
  };

  const pathLength = OptimizationUtils.pathLength || (() => 0);
  const pathEndpoints = OptimizationUtils.pathEndpoints || (() => ({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }));
  const pathCentroid = OptimizationUtils.pathCentroid || (() => ({ x: 0, y: 0 }));
  const { isClosedPath } = OptimizationUtils;
  const closePathIfNeeded = OptimizationUtils.closePathIfNeeded || ((path) => path);
  const reversePath = OptimizationUtils.reversePath || ((path) => path);
  const offsetPath = OptimizationUtils.offsetPath || ((path) => path);
  const getLayerMaskCapabilities = Masking.getLayerMaskCapabilities || (() => ({ canSource: false, reason: '', sourceType: null }));
  const getLayerSilhouette = Masking.getLayerSilhouette || (() => []);
  const buildMaskUnion = Masking.buildMaskUnion || (() => []);
  const getMaskingAncestors = Masking.getMaskingAncestors || (() => []);
  const buildLayerMaskedPaths = Masking.buildLayerMaskedPaths || ((layer) => clonePaths(layer?.effectivePaths || layer?.paths || []));
  const applyMaskToPaths = Masking.applyMaskToPaths || ((paths) => clonePaths(paths || []));
  const createModifierState = Modifiers.createModifierState || ((type) => ({ type, enabled: true, mirrors: [] }));
  const createMirrorLine = Modifiers.createMirrorLine || ((index) => ({ id: `mirror-${index + 1}`, enabled: true }));
  const isModifierLayer = Modifiers.isModifierLayer || (() => false);
  const applyModifierToPaths = Modifiers.applyModifierToPaths || ((paths) => clonePaths(paths || []));
  const joinLayersAtMirrorAxes = Modifiers.joinLayersAtMirrorAxes || ((layers) => layers);
  const isValidDrawableLayerType = (type) =>
    Boolean(
      type &&
        type !== 'group' &&
        !Object.prototype.hasOwnProperty.call(MODIFIER_DEFAULTS, type) &&
        ((Algorithms && Algorithms[type]) || (ALGO_DEFAULTS && ALGO_DEFAULTS[type]))
    );
  const resolveDrawableLayerType = (type, fallback = 'flowfield') => {
    if (isValidDrawableLayerType(type)) return type;
    if (isValidDrawableLayerType(fallback)) return fallback;
    return 'flowfield';
  };
  const clone = window.Vectura.Utils.clone;

  // Geometry origin (bbox center) of freshly generated raw paths — the pivot
  // for the layer post-transform. Circle primitives contribute their meta
  // extents (their point arrays may be empty). Falls back to the document
  // center when there is no finite geometry.
  const computeGeometryOrigin = (rawPaths, width, height) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    rawPaths.forEach((path) => {
      if (!Array.isArray(path)) return;
      if (path.meta && path.meta.kind === 'circle') {
        const cx = path.meta.cx ?? path.meta.x;
        const cy = path.meta.cy ?? path.meta.y;
        const rx = path.meta.rx ?? path.meta.r;
        const ry = path.meta.ry ?? path.meta.r;
        if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(rx) && Number.isFinite(ry)) {
          minX = Math.min(minX, cx - rx);
          maxX = Math.max(maxX, cx + rx);
          minY = Math.min(minY, cy - ry);
          maxY = Math.max(maxY, cy + ry);
        }
        return;
      }
      path.forEach((pt) => {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      });
    });
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = width;
      maxY = height;
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  };

  // Post-generation layer transform (scale → rotate about the geometry origin,
  // then translate by posX/posY). Factored out of generate() so the morph
  // modifier's parameter-space regeneration (generateParamMorphPaths) applies
  // EXACTLY the same transform semantics as a real layer — any drift here
  // would make morph intermediates jump at the pair endpoints.
  const buildParamPostTransform = (p, origin) => {
    const rot = ((p.rotation ?? 0) * Math.PI) / 180;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const scaleX = p.scaleX ?? 1;
    const scaleY = p.scaleY ?? 1;
    const posX = p.posX ?? 0;
    const posY = p.posY ?? 0;

    const transform = (pt) => {
      let x = pt.x - origin.x;
      let y = pt.y - origin.y;
      x *= scaleX;
      y *= scaleY;
      const rx = x * cosR - y * sinR;
      const ry = x * sinR + y * cosR;
      x = rx + origin.x + posX;
      y = ry + origin.y + posY;
      return { x, y };
    };

    const transformMetaPoint = (pt) => {
      if (!pt || typeof pt !== 'object') return pt;
      const t = transform({ x: pt.x, y: pt.y });
      return { ...pt, x: t.x, y: t.y };
    };
    const transformAnchor = (a) => {
      if (!a || typeof a !== 'object') return a;
      const out = transformMetaPoint(a);
      if (a.in) out.in = transformMetaPoint(a.in);
      if (a.out) out.out = transformMetaPoint(a.out);
      if (a.corner === true) out.corner = true; // preserve the minimal-trace corner flag
      return out;
    };
    const transformMeta = (meta) => {
      if (!meta) return meta;
      if (meta.kind === 'circle') {
        const center = transform({ x: meta.cx, y: meta.cy });
        const baseR = Number.isFinite(meta.r) ? meta.r : Math.max(meta.rx ?? 0, meta.ry ?? 0);
        return {
          ...meta,
          cx: center.x,
          cy: center.y,
          rx: Math.abs(baseR * scaleX),
          ry: Math.abs(baseR * scaleY),
          rotation: rot,
        };
      }
      // Other meta (kind:'shape' ovals/polys, pen paths) carries bezier
      // `anchors` and an embedded `shape` that the renderer's native-cubic
      // tracePath draws from. These live in source space on rawPaths, so they
      // must be carried through the same posX/posY/scale/rotation transform as
      // the sampled points — otherwise the drawn outline stays at the origin
      // while the points (and fill) translate.
      const copy = JSON.parse(JSON.stringify(meta));
      if (Array.isArray(meta.anchors)) copy.anchors = meta.anchors.map(transformAnchor);
      if (meta.shape && typeof meta.shape === 'object') {
        const s = meta.shape;
        const sc = transform({ x: s.cx, y: s.cy });
        copy.shape = { ...s, cx: sc.x, cy: sc.y };
        if (Number.isFinite(s.rx)) copy.shape.rx = Math.abs(s.rx * scaleX);
        if (Number.isFinite(s.ry)) copy.shape.ry = Math.abs(s.ry * scaleY);
        if (Number.isFinite(s.r)) copy.shape.r = Math.abs(s.r * ((Math.abs(scaleX) + Math.abs(scaleY)) / 2));
        copy.shape.rotation = (s.rotation ?? 0) + rot;
      }
      return copy;
    };

    return { transform, transformMeta };
  };

  // Bugs-8: sanitize imported numeric params so corrupted/legacy `.vectura`
  // files cannot inject NaN / Infinity / non-numeric strings into algorithm
  // hot paths (e.g. p.scaleX, p.density, p.amplitude — all of which feed
  // multiplications or divisions without their own Number.isFinite guards).
  //
  // Strategy: walk `data.params` recursively. For every value that *was*
  // a number in the matching default param tree, coerce + clamp to a finite
  // number, falling back to the default when the imported value is junk.
  // Non-numeric keys (strings, booleans, ids, image data) pass through.
  // Always-numeric global keys (posX, posY, scaleX, scaleY, rotation) are
  // enforced regardless of what the defaults declare.
  const ALWAYS_NUMERIC_GLOBALS = {
    posX: 0,
    posY: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    seed: 0,
  };
  const sanitizeFiniteNumber = (value, fallback) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const coerced = Number(value);
      if (Number.isFinite(coerced)) return coerced;
    }
    return Number.isFinite(fallback) ? fallback : 0;
  };
  const sanitizeParamTree = (value, defaults, ctx) => {
    if (Array.isArray(value)) {
      const defaultArray = Array.isArray(defaults) ? defaults : [];
      const template = defaultArray[0] ?? null;
      return value.map((item, idx) =>
        sanitizeParamTree(item, defaultArray[idx] !== undefined ? defaultArray[idx] : template, ctx)
      );
    }
    if (value && typeof value === 'object') {
      const out = {};
      const defaultsObj = defaults && typeof defaults === 'object' && !Array.isArray(defaults) ? defaults : {};
      for (const key of Object.keys(value)) {
        out[key] = sanitizeParamTree(value[key], defaultsObj[key], { ...ctx, key });
      }
      return out;
    }
    // Scalar leaf. Decide based on the default's type (if any), the
    // always-numeric globals table, and the value's own shape — a value
    // that is itself a non-finite number is ALWAYS unsafe to keep, even
    // if the algorithm's defaults don't declare this key.
    const key = ctx?.key;
    const defaultIsNumber = typeof defaults === 'number';
    const isAlwaysNumeric = key && Object.prototype.hasOwnProperty.call(ALWAYS_NUMERIC_GLOBALS, key);
    const valueIsBadNumber = typeof value === 'number' && !Number.isFinite(value);
    if (defaultIsNumber || isAlwaysNumeric || valueIsBadNumber) {
      const fallback = defaultIsNumber
        ? defaults
        : (isAlwaysNumeric ? ALWAYS_NUMERIC_GLOBALS[key] : 0);
      const sanitized = sanitizeFiniteNumber(value, fallback);
      if (sanitized !== value && (typeof value !== 'number' || !Number.isFinite(value))) {
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn(
            `[Engine] Sanitized non-finite param '${key}' on import (received ${JSON.stringify(value)}, clamped to ${sanitized}).`
          );
        }
      }
      return sanitized;
    }
    return value;
  };
  const sanitizeImportedParams = (params, layerType) => {
    if (!params || typeof params !== 'object') return {};
    const defaults = (ALGO_DEFAULTS && ALGO_DEFAULTS[layerType]) || {};
    const sanitized = sanitizeParamTree(params, defaults, { key: null });
    // CONTRACT E (3D Scene Studio): scene3d params carry a whole scene graph.
    // After the generic numeric pass, run the scene-aware sanitizer — clamps
    // scene numerics, restores objects/lights/camera/styleTable shapes, and
    // applies the sceneVersion migration chain (Scene3D.Params owns both).
    if (layerType === 'scene3d') {
      const sceneParams = window.Vectura?.Scene3D?.Params;
      if (sceneParams && typeof sceneParams.sanitizeSceneParams === 'function') {
        return sceneParams.sanitizeSceneParams(sanitized);
      }
    }
    // X-ray fold — scene-TREE layers carry x-ray objects too (an object3d leaf,
    // or a group still holding legacy inline objects[]). Run the scene migration
    // CHAIN (the seed only — these are not whole scenes, so no scene-level
    // normalization) so a v1 x-ray object keeps its dashed hidden edges after
    // the fold. booleanGroup3d has no x-ray object ⇒ the migration is a no-op.
    if (layerType === 'object3d' || layerType === 'sceneGroup3d' || layerType === 'booleanGroup3d') {
      const sceneParams = window.Vectura?.Scene3D?.Params;
      if (sceneParams && typeof sceneParams.migrateScene === 'function') {
        return sceneParams.migrateScene(sanitized);
      }
    }
    return sanitized;
  };

  // Deep-clone params for history/serialization, but SHARE the (immutable,
  // potentially large — up to ~12k faces) imported STL mesh by reference rather
  // than JSON-deep-copying it into every undo snapshot. `importedMesh` is only
  // ever replaced wholesale on re-import, never mutated in place, so sharing the
  // reference is safe and avoids hundreds of KB of JSON churn per interaction.
  // JSON.stringify on save still follows the reference, so .vectura round-trips.
  //
  // CONTRACT E (3D Scene Studio): `params.assets` — the scene3d content-hashed
  // asset table — gets the same ref-skip treatment: history snapshots and
  // duplicates clone references, never mesh blobs (spec A-11/A-16).
  const cloneLayerParams = (params) => {
    if (!params || typeof params !== 'object') return {};
    const mesh = params.importedMesh;
    const assets = params.assets;
    const skipMesh = Boolean(mesh) && typeof mesh === 'object';
    const skipAssets = Boolean(assets) && typeof assets === 'object';
    if (!skipMesh && !skipAssets) return JSON.parse(JSON.stringify(params));
    const shallow = { ...params };
    if (skipMesh) shallow.importedMesh = null;
    if (skipAssets) shallow.assets = null;
    const rest = JSON.parse(JSON.stringify(shallow));
    if (skipMesh) rest.importedMesh = mesh;
    if (skipAssets) rest.assets = assets;
    return rest;
  };
  const cloneParamStates = (states) => {
    if (!states || typeof states !== 'object') return {};
    const out = {};
    for (const key of Object.keys(states)) out[key] = cloneLayerParams(states[key]);
    return out;
  };

  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return generateId() + generateId();
  };

  // Scene-tree Increment C — per-primitive param bags a fresh object3d child is
  // born with when the panel's "+ object" affordance names a primitive. These
  // mirror the panel's PRIMITIVES.defaults() (scene3d-panel.js) — the ONLY keys
  // 1A's buildPrimitiveMesh reads. 'box' is the default (matches ALGO_DEFAULTS).
  const OBJECT3D_PRIMITIVE_DEFAULTS = {
    box: { sx: 40, sy: 40, sz: 40 },
    sphere: { radius: 25, detail: 28 },
    cylinder: { sx: 20, sy: 22, sz: 20, detail: 24 },
    torus: { sx: 34, sy: 9, sz: 9, detail: 24 },
    cone: { sx: 20, sy: 22, sz: 20, detail: 24 },
    plane: { sx: 60, sy: 60 },
    superellipsoid: { sx: 26, sy: 26, sz: 26, detail: 24 },
    torusKnot: { sx: 30, sy: 6, sz: 6, detail: 28 },
    capsule: { sx: 14, sy: 16, sz: 14, detail: 22 },
    // Convert-to-Scene (I2) — a freshly added `solid` object is a parametric
    // polyhedron carrying INERT deformer defaults, so it renders byte-identically
    // until a deformer is dialed in. Mirrors PRIMITIVE_PARAM_DEFAULTS.solid.
    solid: {
      solidType: 'buckyball', radius: 20, sideCount: 5, depth: 24, frequency: 2, taper: 55, starRatio: 45,
      expand: 100, twist: 0, explode: 0, extrude: 0, shard: 0,
    },
  };

  // Scene-tree Increment E — per-type light seeds for addLightToScene. Mirrors
  // the scene3d panel's seedLight + Scene3D.Params.normalizeLight defaults so a
  // freshly added light child is valid before the next compose. The `id` is set
  // to the child LAYER id at compose time (identity contract) — omitted here.
  const SCENE_LIGHT_SEED = {
    directional: { type: 'directional', azimuth: 135, elevation: 45, intensity: 1, castShadows: true },
    point: { type: 'point', position: { x: 120, y: 200, z: 120 }, range: 400, intensity: 1, castShadows: true },
    spot: {
      type: 'spot', position: { x: 120, y: 200, z: 120 }, target: { x: 0, y: 0, z: 0 },
      range: 400, coneAngle: 30, penumbra: 8, intensity: 1, castShadows: true,
    },
    area: { type: 'area', position: { x: 120, y: 200, z: 120 }, size: 120, samples: 6, intensity: 1, castShadows: true },
    ambient: { type: 'ambient', intensity: 0.3, castShadows: false },
  };

  // ── Stroke style model (STR-1) ─────────────────────────────────────────────
  // Import-side sanitizers for the per-layer stroke fields. Prefer the shared
  // config vocabulary (src/config/stroke-options.js); fall back to equivalent
  // local rules so legacy load orders and headless tests stay safe.
  const strokeStyleConfig = () => window.Vectura?.STROKE_STYLE || null;
  const sanitizeLineJoin = (value, fallback) =>
    (['miter', 'round', 'bevel'].includes(value) ? value : (fallback || 'round'));
  const sanitizeMiterLimit = (value, fallback) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return Number.isFinite(fallback) ? fallback : 10;
    return Math.max(1, Math.min(100, num));
  };
  const sanitizeStrokeAlign = (value, fallback) =>
    (['center', 'inside', 'outside'].includes(value) ? value : (fallback || 'center'));
  const sanitizeDashBag = (value) => {
    const cfg = strokeStyleConfig();
    if (cfg?.sanitizeDash) return cfg.sanitizeDash(value);
    if (!value || typeof value !== 'object') return { enabled: false, pattern: [] };
    const pattern = (Array.isArray(value.pattern) ? value.pattern : [])
      .map((entry) => Number(entry))
      .filter((entry) => Number.isFinite(entry) && entry >= 0)
      .slice(0, 6);
    return { enabled: Boolean(value.enabled), pattern };
  };

  // ── Align Stroke (STR-4) ───────────────────────────────────────────────────
  // Display-geometry transform for layer.strokeAlign 'inside' / 'outside':
  // offset every CLOSED path's centerline by ±strokeWidth/2 along the path
  // normal, so the drawn ink sits fully inside / outside the source boundary.
  // Runs inside computeLayerEffectiveGeometry (recomputed on commit, never
  // per-frame) and always re-derives from the source paths — lossless.
  //
  // Machinery: GeometryUtils.miterOffsetClosedRing — the robust closed-outline
  // concentric-band engine (winding-agnostic true miter offset with round
  // needle-corner resolution). Deliberately NOT the parallel-pass thickenPaths,
  // whose inward offsets are collapse-prone (repo memory).
  //
  // Gating (in-lane decision, spec STR-4): open paths stay centered; a
  // degenerate or winding-inverted offset (stroke consumed the shape) falls
  // back to the centered geometry for that path.
  const ringSignedArea2 = (points) => {
    let area2 = 0;
    for (let i = 0, n = points.length; i < n; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % n];
      area2 += a.x * b.y - b.x * a.y;
    }
    return area2;
  };

  const applyStrokeAlignToPaths = (layer, paths) => {
    const align = layer?.strokeAlign;
    if (align !== 'inside' && align !== 'outside') return paths;
    const width = Number(layer.strokeWidth);
    if (!Number.isFinite(width) || width <= 0 || !Array.isArray(paths)) return paths;
    const GU = window.Vectura?.GeometryUtils || {};
    const OU = window.Vectura?.OptimizationUtils || {};
    if (typeof GU.miterOffsetClosedRing !== 'function') return paths;
    const delta = (align === 'outside' ? 1 : -1) * (width / 2);
    const miterLimit = Number.isFinite(layer.miterLimit) && layer.miterLimit > 1 ? layer.miterLimit : 10;
    const smoothedLayer = Boolean(layer.params?.curves);
    const isClosed = (path) => {
      if (path?.meta?.closed === true) return true;
      if (typeof OU.isClosedPath === 'function') return OU.isClosedPath(path);
      if (!Array.isArray(path) || path.length < 3) return false;
      const dx = path[0].x - path[path.length - 1].x;
      const dy = path[0].y - path[path.length - 1].y;
      return dx * dx + dy * dy < 1e-6;
    };

    return paths.map((path) => {
      if (!Array.isArray(path)) return path;
      const meta = path.meta || {};
      // Parametric circles/ellipses (empty point list + kind meta) offset
      // exactly: adjust the radius by ±weight/2.
      if (meta.kind === 'circle') {
        const nextMeta = { ...meta };
        const rx = (nextMeta.rx ?? nextMeta.r ?? 0) + delta;
        const ry = (nextMeta.ry ?? nextMeta.r ?? nextMeta.rx ?? 0) + delta;
        if (rx <= 0 || ry <= 0) return path; // consumed → keep centered
        if (nextMeta.r !== undefined && nextMeta.rx === undefined && nextMeta.ry === undefined) {
          nextMeta.r = nextMeta.r + delta;
        } else {
          if (nextMeta.rx !== undefined) nextMeta.rx = rx;
          if (nextMeta.ry !== undefined) nextMeta.ry = ry;
          if (nextMeta.r !== undefined) nextMeta.r = nextMeta.r + delta;
        }
        const next = path.slice();
        next.meta = nextMeta;
        return next;
      }
      if (path.length < 3 || !isClosed(path)) return path;
      // Curve-smoothed geometry is a sparse control polyline smoothed at
      // render time — offset the FLATTENED curve, not the raw polyline
      // (repo rule: mutations must flatten first).
      const hasHandles = Array.isArray(meta.anchors) && meta.anchors.length >= 2
        && meta.anchors.some((a) => a && (a.in || a.out));
      const shouldFlatten = (smoothedLayer || hasHandles) && typeof GU.flattenSmoothedPath === 'function';
      const source = shouldFlatten ? GU.flattenSmoothedPath(path) : path;
      if (!Array.isArray(source) || source.length < 3) return path;
      const offset = GU.miterOffsetClosedRing(source, delta, { miterLimit, round: true });
      if (!offset || offset.length < 4) return path; // degenerate → keep centered
      // Collapse guard: an inside offset deeper than the shape's inradius
      // inverts the ring. Polygonal swallowtails flip the winding sign; a
      // smooth ring inverted through its own interior keeps the sign but
      // GROWS while shrinking was requested — catch both, render the
      // centered source instead of a phantom.
      const srcArea = ringSignedArea2(source);
      const offArea = ringSignedArea2(offset);
      if (!(Math.abs(offArea) > 0) || Math.sign(offArea) !== Math.sign(srcArea)) return path;
      const shrunk = Math.abs(offArea) < Math.abs(srcArea);
      if (delta < 0 && !shrunk) return path;
      if (delta > 0 && shrunk) return path;
      const nextMeta = { ...((source.meta || path.meta) || {}) };
      // The offset ring is final display geometry — parametric/editing
      // descriptors from the source no longer apply. `baked`, not `straight`:
      // the ring is not made of line segments, it is a flattened CURVE (the
      // source was flattened before offsetting, per the repo rule that mutations
      // flatten first). Both flags mean "render these points verbatim", but only
      // `baked` says why, and conflating the two is what let "this algorithm
      // doesn't do curves" hide inside `straight`.
      delete nextMeta.anchors;
      delete nextMeta.shape;
      nextMeta.baked = true;
      nextMeta.straight = true; // until every consumer reads PathDraw.isVerbatim
      nextMeta.closed = true;
      offset.meta = nextMeta;
      return offset;
    });
  };

  class VectorEngine {
    constructor() {
      this.layers = [];
      this.activeLayerId = null;
      this._layerCounter = 0;
      this.profileKey = SETTINGS.paperSize || 'a4';
      this.currentProfile = this.resolveProfile();
      this.onLayerRemoved = null;
    }

    // Announce every removed layer id to the host (e.g. the on-canvas text
    // editor tears down its session if the edited layer is gone). Fired for the
    // full removal set — target AND cascade descendants — never just the top id.
    _announceRemoval(ids) {
      if (typeof this.onLayerRemoved !== 'function') return;
      for (const rid of ids) {
        try { this.onLayerRemoved(rid); } catch (_) { /* host hook must not block removal */ }
      }
    }

    addLayer(type = 'wavetable') {
      type = resolveDrawableLayerType(type, 'wavetable');
      // Scene-tree Increment D — the "3D Scene" Add-Layer entry now creates a
      // scene TREE (a scene group seeded with one default object3d child), not a
      // monolith. The monolith shape survives ONLY as a load-time form for saved
      // docs (B's inline-union renders it byte-identically); new scenes are trees.
      if (type === 'scene3d') return this.addSceneTree();
      const id = generateId();
      SETTINGS.globalLayerCount = ++this._layerCounter;
      const num = String(this._layerCounter).padStart(2, '0');
      const defaults = ALGO_DEFAULTS && ALGO_DEFAULTS[type];
      const prettyType = defaults && defaults.label ? defaults.label : type.charAt(0).toUpperCase() + type.slice(1);
      const name = `${prettyType} ${num}`;
      const layer = new Layer(id, type, name);
      this.layers.push(layer);
      this.activeLayerId = id;
      this.generate(id);
      return id;
    }

    addShapeLayer(name, paths) {
      const id = generateId();
      SETTINGS.globalLayerCount = ++this._layerCounter;
      const layer = new Layer(id, 'shape', name || `Shape ${String(this._layerCounter).padStart(2, '0')}`);
      layer.sourcePaths = clonePaths(paths || []);
      layer.params.seed = 0;
      layer.params.posX = 0;
      layer.params.posY = 0;
      layer.params.scaleX = 1;
      layer.params.scaleY = 1;
      layer.params.rotation = 0;
      layer.params.curves = false;
      layer.params.smoothing = 0;
      layer.params.simplify = 0;
      this.layers.push(layer);
      this.activeLayerId = id;
      this.generate(id);
      return id;
    }

    addModifierLayer(type = 'mirror') {
      const id = generateId();
      SETTINGS.globalLayerCount = ++this._layerCounter;
      const num = String(this._layerCounter).padStart(2, '0');
      const prettyType = type.charAt(0).toUpperCase() + type.slice(1);
      const layer = new Layer(id, 'group', `${prettyType} Modifier ${num}`);
      layer.isGroup = true;
      layer.containerRole = 'modifier';
      layer.groupType = 'modifier';
      layer.groupCollapsed = false;
      layer.visible = true;
      layer.modifier = type === 'mirror'
        ? createModifierState(type, { mirrors: [createMirrorLine(0)] })
        : createModifierState(type);
      this.layers.push(layer);
      this.activeLayerId = id;
      this.computeAllDisplayGeometry();
      return id;
    }

    // ── Scene-tree Increment C — scene-group tree construction ───────────────
    // A scene GROUP is a scene3d layer flagged with the three container
    // invariants Increment B's compositor gates on (type 'scene3d', isGroup,
    // containerRole 'scene'). Mirrors addModifierLayer. Its inline (monolith)
    // objects/groups arrays start EMPTY so the descendant object3d /
    // booleanGroup3d child layers are the single source of truth; the scene
    // envelope (camera / lights / tone / shadow / ground / backdrop /
    // styleTable.scene) is kept from the scene3d factory defaults.
    addSceneGroup() {
      const id = generateId();
      SETTINGS.globalLayerCount = ++this._layerCounter;
      const num = String(this._layerCounter).padStart(2, '0');
      const layer = new Layer(id, 'scene3d', `3D Scene ${num}`);
      layer.isGroup = true;
      layer.containerRole = 'scene';
      layer.groupType = 'scene';
      layer.groupCollapsed = false;
      layer.visible = true;
      // Empty the inline scene graph — child layers provide objects/groups.
      layer.params.objects = [];
      layer.params.groups = [];
      const st = (layer.params.styleTable && typeof layer.params.styleTable === 'object')
        ? layer.params.styleTable : {};
      layer.params.styleTable = {
        scene: st.scene || { penId: null, mapper: 'wireframe', params: {} },
        byObject: {},
        byFace: {},
      };
      this.layers.push(layer);
      this.activeLayerId = id;
      this.computeAllDisplayGeometry();
      return id;
    }

    // Scene-tree Increment D — the user-facing CREATION entry. Build a whole
    // scene TREE in one gesture: a scene group + ONE default object3d child (a
    // box). Returns the SCENE GROUP id (the group is what "Add Layer → 3D Scene"
    // adds), and leaves the group active so the panel shows scene controls.
    addSceneTree() {
      const groupId = this.addSceneGroup();
      // Scene-tree Increment E — the whole scene reads as ONE tree: a default box
      // object, the sun (a directional light child) and the ground child. Empty
      // the group's inline lights + pre-set inline ground OFF so the CHILDREN are
      // the single source of truth (deleting the ground child turns it off; the
      // sun child owns the light).
      const grp = this.getLayerById(groupId);
      if (grp && grp.params) {
        grp.params.lights = [];
        grp.params.ground = { enabled: false };
      }
      this.addObjectToScene(groupId, 'box');
      this.addLightToScene(groupId, 'directional');
      this.addGroundToScene(groupId);
      this.activeLayerId = groupId;
      this.computeAllDisplayGeometry();
      return groupId;
    }

    // Convert-to-Scene (I1) — turn a STANDALONE polyhedron/topoform layer into a
    // scene TREE so the shared compositor lights/occludes/shadows it. The family
    // generator bakes a FULLY-BUILT (deformed) index mesh; it rides the existing
    // solid/importedMesh object3d path (no new mesh plumbing). A new scene group
    // holds ONE object3d child carrying the mesh, plus a seeded light + ground so
    // it lights immediately; the source layer's pen/style migrates onto the child
    // (expandMonolithToTree's adoption pattern); the standalone view angles map
    // onto the scene camera so the object faces the same way. Returns
    // { ok:true, groupId, childId } on success, or { ok:false, reason[, message] }
    // — 'unsupported' (wrong layer type), 'empty' (no mesh), or 'contours' (the
    // topoform depth-slice mode has no scene analog yet, so it BLOCKS with a
    // user-facing message rather than bake a look-destroying surface). Undo is
    // the caller's responsibility (push history before calling).
    convertAlgoToScene(layerId) {
      const src = this.getLayerById(layerId);
      if (!src) return { ok: false, reason: 'not-found' };
      const type = src.type;
      if (type !== 'polyhedron' && type !== 'topoform') return { ok: false, reason: 'unsupported' };
      const p = (src.params && typeof src.params === 'object') ? src.params : {};
      const fin = (val, dflt) => (Number.isFinite(Number(val)) ? Number(val) : dflt);

      // Topoform contours (the default render mode) has no compositor analog yet
      // — block, don't bake; its depth-slice scene treatment is a later increment.
      if (type === 'topoform' && (p.renderMode || 'contours') === 'contours') {
        return { ok: false, reason: 'contours', message: "Contours mode isn't convertible yet" };
      }

      const algo = Algorithms && Algorithms[type];
      if (!algo || typeof algo.bakeMesh !== 'function') return { ok: false, reason: 'no-baker' };
      const baked = algo.bakeMesh(p) || { vertices: [], faces: [] };
      if (!Array.isArray(baked.vertices) || !baked.vertices.length
        || !Array.isArray(baked.faces) || !baked.faces.length) {
        return { ok: false, reason: 'empty' };
      }

      // Convert-to-Scene (I2) — a parametric polyhedron becomes a LIVE `solid`
      // object carrying its solidType + deformer params, so the compositor
      // re-evaluates the deformers (createSolidMesh + applyDeformers) and the
      // object stays fully editable. Topoform, and a polyhedron whose source is
      // already an STL/importedMesh, have NO live param equivalent yet — they
      // keep the I1 importedMesh bake (the deformed index mesh, frozen).
      const liveSolid = type === 'polyhedron' && (p.solidType || 'buckyball') !== 'importedMesh';

      // Bake path only — normalize to unit max-extent; `radius` carries the real
      // size. The scene's createSolidMesh importedMesh branch multiplies the unit
      // verts back by `radius`, reproducing the baked coordinates exactly.
      let maxExtent = 0;
      baked.vertices.forEach((vt) => {
        const d = Math.hypot(fin(vt.x, 0), fin(vt.y, 0), fin(vt.z, 0));
        if (d > maxExtent) maxExtent = d;
      });
      const radius = maxExtent > 1e-6 ? maxExtent : 1;
      const unit = baked.vertices.map((vt) => ({
        x: fin(vt.x, 0) / radius, y: fin(vt.y, 0) / radius, z: fin(vt.z, 0) / radius,
      }));

      // The LIVE solid params bag: the polyhedron's solidType + parametric size
      // knobs + deformer params, copied straight off the source layer (defaults
      // mirror Scene3D.Mesh.buildSolidBaseMesh / applyVertexEffects). Building the
      // scene mesh from these reproduces bakeMesh(p) exactly, so a converted
      // undeformed solid is geometrically identical to the I1 bake.
      const liveSolidParams = {
        solidType: p.solidType || 'buckyball',
        radius: fin(p.radius, 76),
        sideCount: fin(p.sideCount, 5),
        depth: fin(p.depth, 94),
        frequency: fin(p.frequency, 2),
        taper: fin(p.taper, 55),
        starRatio: fin(p.starRatio, 45),
        expand: fin(p.expand, 100),
        twist: fin(p.twist, 0),
        explode: fin(p.explode, 0),
        extrude: fin(p.extrude, 0),
        shard: fin(p.shard, 0),
      };

      // Standalone view Euler angles → the scene camera, so the converted object
      // faces the same way (the compositor rotates world→camera by these; an
      // identity object transform leaves the mesh matching the standalone view).
      const view = type === 'polyhedron'
        ? { yaw: fin(p.rotate, -18), pitch: fin(p.tilt, 28), roll: fin(p.roll, 0) }
        : { yaw: fin(p.yaw, -28), pitch: fin(p.pitch, 34), roll: fin(p.roll, 0) };

      // New scene group (mirrors addSceneTree's tree seeding) carrying our child.
      const groupId = this.addSceneGroup();
      const group = this.getLayerById(groupId);
      if (group && group.params) {
        group.params.lights = [];
        group.params.ground = { enabled: false };
        const cam = (group.params.camera && typeof group.params.camera === 'object') ? group.params.camera : {};
        group.params.camera = { ...cam, yaw: view.yaw, pitch: view.pitch, roll: view.roll };
      }

      // One object3d child holding the baked mesh. addObjectToScene can't name the
      // 'solid' primitive, so build the child like expandMonolithToTree does.
      const childId = generateId();
      SETTINGS.globalLayerCount = ++this._layerCounter;
      const num = String(this._layerCounter).padStart(2, '0');
      const child = new Layer(childId, 'object3d', src.name ? `${src.name} Mesh` : `Object ${num}`);
      child.parentId = groupId;
      child.params.primitive = 'solid';
      child.params.params = liveSolid
        ? liveSolidParams
        : {
          solidType: 'importedMesh',
          importedMesh: { vertices: unit, faces: baked.faces.map((f) => f.slice()) },
          radius,
        };
      child.params.transform = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 };
      child.params.visibility = 'solid';
      child.params.role = 'solid';
      // Migrate the source pen/style onto the child (adoption pattern). A 'hatch'
      // mapper shows the Lambert shading the seeded light casts on the solid.
      child.params.style = { penId: src.penId || null, mapper: 'hatch', params: {} };
      if (src.penId) child.penId = src.penId;
      if (typeof src.color === 'string') child.color = src.color;
      if (Number.isFinite(src.strokeWidth)) child.strokeWidth = src.strokeWidth;
      this._insertUnderParent(child, groupId);

      // Seed a default light + ground so the converted object lights immediately.
      this.addLightToScene(groupId, 'directional');
      this.addGroundToScene(groupId);

      // Replace the standalone layer with the scene group.
      this.removeLayer(layerId);
      this.activeLayerId = groupId;
      this.computeAllDisplayGeometry();
      return { ok: true, groupId, childId };
    }

    // Scene-tree Increment D/F — expand a MONOLITH scene3d layer (inline
    // params.objects[] / params.groups[]) IN PLACE into a scene TREE: the layer
    // becomes the scene group; each inline object becomes an object3d child and
    // each inline group a booleanGroup3d child. This is the same decomposition
    // Increment F runs on load, factored here so F can reuse it. Idempotent — a
    // layer that is already a scene group (isGroup) is left untouched.
    //
    // IDENTITY CONTRACT (plan §4): each child LAYER adopts the inline entry's id
    // (objects[i].id / groups[i].id) as its layer id, so meta.sceneTarget.objectId
    // + styleTable keys stay valid. Inline arrays are CLEARED afterward so the
    // compositor collects the children only (no double-union). Returns the scene
    // group id, or null when the layer is not an expandable monolith.
    expandMonolithToTree(monolithId) {
      const group = this.getLayerById(monolithId);
      if (!group || group.type !== 'scene3d' || group.isGroup) return null;
      const Params = window.Vectura?.Scene3D?.Params;
      // Normalize first so ids/styleTable are canonical before we split them out.
      const src = (Params && typeof Params.normalizeParams === 'function')
        ? Params.normalizeParams(group.params) : group.params;
      const objects = Array.isArray(src.objects) ? src.objects : [];
      const groups = Array.isArray(src.groups) ? src.groups : [];
      // Scene-tree Increment E — lights + ground promote to children too.
      const lights = Array.isArray(src.lights) ? src.lights : [];
      const groundEnabled = !src.ground || src.ground.enabled !== false;
      const styleTable = (src.styleTable && typeof src.styleTable === 'object') ? src.styleTable : {};
      const byObject = (styleTable.byObject && typeof styleTable.byObject === 'object') ? styleTable.byObject : {};
      const byFace = (styleTable.byFace && typeof styleTable.byFace === 'object') ? styleTable.byFace : {};
      // Per-object EdgeStyle overrides (incl. the X-ray fold's migrated hidden=dash
      // seed) live in edgeStylesByObject on the monolith; they must ride onto each
      // object3d child or an expanded x-ray scene would lose its dashed hidden edges.
      const edgeStylesByObject = (src.edgeStylesByObject && typeof src.edgeStylesByObject === 'object')
        ? src.edgeStylesByObject : {};

      // Promote the layer to a scene group (the three compositor invariants).
      group.isGroup = true;
      group.containerRole = 'scene';
      group.groupType = 'scene';
      group.groupCollapsed = false;

      const groupIndex = this.layers.findIndex((l) => l.id === group.id);
      let insertAt = groupIndex + 1;
      const childIdFor = (entry, fallbackPrefix, i) => {
        const raw = entry && typeof entry.id === 'string' && entry.id ? entry.id : `${fallbackPrefix}-${i + 1}`;
        // Guard against a global id collision with an UNRELATED layer.
        if (this.layers.some((l) => l.id === raw && l.id !== group.id)) return `${group.id}-${raw}`;
        return raw;
      };

      // One object3d child per inline object. Face styles for this object move
      // onto the child (byFace keys are `${objectId}/${faceId}`).
      const objectLayerIds = {};
      objects.forEach((obj, i) => {
        if (!obj || typeof obj !== 'object') return;
        const cid = childIdFor(obj, 'obj', i);
        objectLayerIds[obj.id] = cid;
        const child = new Layer(cid, 'object3d', obj.name || `Object ${i + 1}`);
        child.parentId = group.id;
        child.params.primitive = obj.primitive || 'box';
        child.params.params = (obj.params && typeof obj.params === 'object') ? { ...obj.params } : {};
        if (obj.transform && typeof obj.transform === 'object') child.params.transform = { ...obj.transform };
        child.params.visibility = obj.visibility || 'solid';
        child.params.role = obj.role || 'solid';
        if (obj.shadow && typeof obj.shadow === 'object') child.params.shadow = { ...obj.shadow };
        if (obj.border && typeof obj.border === 'object') child.params.border = { ...obj.border };
        if (obj.emissive && typeof obj.emissive === 'object') child.params.emissive = { ...obj.emissive };
        if (byObject[obj.id]) child.params.style = clone(byObject[obj.id]);
        if (edgeStylesByObject[obj.id]) child.params.edgeStyles = clone(edgeStylesByObject[obj.id]);
        const fs = {};
        Object.keys(byFace).forEach((key) => {
          const slash = key.indexOf('/');
          if (slash > 0 && key.slice(0, slash) === obj.id) fs[key.slice(slash + 1)] = clone(byFace[key]);
        });
        if (Object.keys(fs).length) child.params.faceStyles = fs;
        this.layers.splice(insertAt, 0, child);
        insertAt += 1;
      });

      // One booleanGroup3d child per inline group; its operand object3d children
      // are reparented under it (order preserved for positional subtract).
      groups.forEach((grp, i) => {
        if (!grp || typeof grp !== 'object') return;
        const gid = childIdFor(grp, 'grp', i);
        const bl = new Layer(gid, 'booleanGroup3d', grp.name || `Boolean ${i + 1}`);
        bl.isGroup = true;
        bl.containerRole = 'boolean';
        bl.groupType = 'boolean';
        bl.groupCollapsed = false;
        bl.parentId = group.id;
        bl.params.op = grp.op || 'subtract';
        if (byObject[grp.id]) bl.params.style = clone(byObject[grp.id]);
        this.layers.splice(insertAt, 0, bl);
        insertAt += 1;
        // Reparent this group's operand object3d children (they were inserted as
        // scene-group children above). First operand solid, the rest holes.
        const childIds = Array.isArray(grp.children) ? grp.children : [];
        childIds.forEach((rawChildId, ci) => {
          const layerChildId = objectLayerIds[rawChildId] || rawChildId;
          const operand = this.getLayerById(layerChildId);
          if (operand && operand.type === 'object3d') {
            operand.parentId = gid;
            operand.params.role = ci === 0 ? 'solid' : 'hole';
          }
        });
      });

      // Scene-tree Increment E — one sceneLight3d child per inline light (the
      // child LAYER id adopts the light's id so the identity contract holds), and
      // a single sceneGround3d child when the inline ground was enabled. Names
      // mirror the panel's light display names.
      const lightNameFor = (light, i) => {
        if (!light) return `Light ${i + 1}`;
        if (light.type === 'ambient') return 'Ambient';
        if (light.type === 'point') return `Point ${i + 1}`;
        if (light.type === 'spot') return `Spot ${i + 1}`;
        if (light.type === 'area') return `Area ${i + 1}`;
        return (light.id === 'sun' || i === 0) ? 'Sun' : `Light ${i + 1}`;
      };
      lights.forEach((light, i) => {
        if (!light || typeof light !== 'object') return;
        const cid = childIdFor(light, 'light', i);
        const ll = new Layer(cid, 'sceneLight3d', lightNameFor(light, i));
        ll.parentId = group.id;
        // The child params ARE the lights[] entry (minus id — the layer id is it).
        const lp = clone(light);
        delete lp.id;
        Object.assign(ll.params, lp);
        this.layers.splice(insertAt, 0, ll);
        insertAt += 1;
      });
      if (groundEnabled) {
        const gcid = childIdFor({ id: 'ground' }, 'ground', 0);
        const gl = new Layer(gcid, 'sceneGround3d', 'Ground');
        gl.parentId = group.id;
        gl.params.enabled = true;
        this.layers.splice(insertAt, 0, gl);
        insertAt += 1;
      }

      // Clear the inline arrays — the child layers are now the source of truth
      // (compositor unions inline + children; keeping both would double-render).
      group.params.objects = [];
      group.params.groups = [];
      // Scene-tree Increment E — lights move to children; inline ground pre-set
      // OFF so deleting the ground child turns the ground off (the child owns ON).
      group.params.lights = [];
      group.params.ground = { enabled: false };
      // Keep the scene-scope style; drop the per-object/per-face entries that
      // now live on the children.
      if (group.params.styleTable && typeof group.params.styleTable === 'object') {
        group.params.styleTable = {
          scene: group.params.styleTable.scene || { penId: null, mapper: 'wireframe', params: {} },
          byObject: {},
          byFace: {},
        };
      }
      this.activeLayerId = group.id;
      this.computeAllDisplayGeometry();
      return group.id;
    }

    // Scene-tree Increment F — the format v1 → v2 migration step. Walk every
    // layer and expand each MONOLITH scene3d (type 'scene3d' && !isGroup) into a
    // scene TREE via expandMonolithToTree. Snapshot the ids up front (that call
    // mutates this.layers) and preserve the imported active layer.
    //
    // Idempotent: an already-expanded scene group is skipped (expandMonolithToTree
    // guards on isGroup), and object3d / booleanGroup3d / light / ground children
    // are never scene3d monoliths — so a second run (or a v2 doc) is a no-op.
    // The gate lives at the call site (importState runs this only when the source
    // payload predates v2); the pass itself is safe to run any number of times.
    _migrateMonolithScenesToTree() {
      const savedActive = this.activeLayerId;
      const monolithIds = this.layers
        .filter((l) => l && l.type === 'scene3d' && !l.isGroup)
        .map((l) => l.id);
      if (!monolithIds.length) return;
      monolithIds.forEach((id) => this.expandMonolithToTree(id));
      if (savedActive && this.getLayerById(savedActive)) this.activeLayerId = savedActive;
    }

    // Insert `layer` directly after `parentId` and any of its existing
    // descendants, so array order matches the tree order the panel renders and
    // the compositor walks. Returns the layer's new id.
    _insertUnderParent(layer, parentId) {
      const descIds = new Set(this.getLayerDescendants(parentId).map((l) => l.id));
      let insertIdx = this.layers.findIndex((l) => l.id === parentId);
      for (let i = 0; i < this.layers.length; i += 1) {
        const l = this.layers[i];
        if (l && (l.id === parentId || descIds.has(l.id))) insertIdx = i;
      }
      if (insertIdx < 0) this.layers.push(layer);
      else this.layers.splice(insertIdx + 1, 0, layer);
      return layer.id;
    }

    // Add a new object3d LEAF under a scene group (or a booleanGroup3d nested in
    // one). `primitive` defaults to 'box'. The new Layer is born with a real
    // penId (pen-1) via the Layer constructor, so the scene-group compositor
    // derives correct hatch/fill spacing (risk #1 — a null pen breaks spacing).
    addObjectToScene(sceneGroupId, primitive) {
      const parent = this.getLayerById(sceneGroupId);
      if (!parent) return null;
      const id = generateId();
      SETTINGS.globalLayerCount = ++this._layerCounter;
      const num = String(this._layerCounter).padStart(2, '0');
      const layer = new Layer(id, 'object3d', `Object ${num}`);
      const prim = (typeof primitive === 'string' && OBJECT3D_PRIMITIVE_DEFAULTS[primitive])
        ? primitive : 'box';
      layer.params.primitive = prim;
      layer.params.params = { ...OBJECT3D_PRIMITIVE_DEFAULTS[prim] };
      layer.parentId = sceneGroupId;
      // A boolean-group parent already implies an operand — seed the role.
      if (parent.type === 'booleanGroup3d') this.applyObject3dBooleanRole(layer, null, parent);
      this._insertUnderParent(layer, sceneGroupId);
      if (parent.isGroup) parent.groupCollapsed = false;
      this.activeLayerId = id;
      this.computeAllDisplayGeometry();
      return id;
    }

    // Scene-tree Increment E — add a LIGHT child (sceneLight3d) under a scene
    // group. `type` is 'directional' (default) | 'point' | 'spot' | 'area' |
    // 'ambient'; the child's params carry ONE lights[] entry, seeded to match
    // Scene3D.Params.normalizeLight so a fresh light looks right before the next
    // compose. The child LAYER id is the light's stable id. Returns the id.
    addLightToScene(sceneGroupId, type = 'directional') {
      const parent = this.getLayerById(sceneGroupId);
      if (!parent) return null;
      const id = generateId();
      SETTINGS.globalLayerCount = ++this._layerCounter;
      const num = String(this._layerCounter).padStart(2, '0');
      const nameFor = { directional: 'Sun', point: 'Point', spot: 'Spot', area: 'Area', ambient: 'Ambient' };
      const layer = new Layer(id, 'sceneLight3d', `${nameFor[type] || 'Light'} ${num}`);
      const seed = SCENE_LIGHT_SEED[type] || SCENE_LIGHT_SEED.directional;
      Object.assign(layer.params, JSON.parse(JSON.stringify(seed)));
      layer.parentId = sceneGroupId;
      this._insertUnderParent(layer, sceneGroupId);
      if (parent.isGroup) parent.groupCollapsed = false;
      this.activeLayerId = id;
      this.computeAllDisplayGeometry();
      return id;
    }

    // Scene-tree Increment E — add the GROUND child (sceneGround3d) under a scene
    // group. Only ONE ground child is allowed: a second call is a no-op (returns
    // null). Its presence turns the ground on; deleting it turns the ground off
    // (the group's inline ground stays OFF once the tree owns it). Returns the id.
    addGroundToScene(sceneGroupId) {
      const parent = this.getLayerById(sceneGroupId);
      if (!parent) return null;
      const existing = this.getLayerDescendants(sceneGroupId)
        .some((l) => l && l.type === 'sceneGround3d');
      if (existing) return null;
      const id = generateId();
      SETTINGS.globalLayerCount = ++this._layerCounter;
      const num = String(this._layerCounter).padStart(2, '0');
      const layer = new Layer(id, 'sceneGround3d', `Ground ${num}`);
      layer.params.enabled = true;
      layer.parentId = sceneGroupId;
      // The group's inline ground defers to the child now (deleting it ⇒ off).
      if (parent.params && typeof parent.params === 'object') parent.params.ground = { enabled: false };
      this._insertUnderParent(layer, sceneGroupId);
      if (parent.isGroup) parent.groupCollapsed = false;
      this.activeLayerId = id;
      this.computeAllDisplayGeometry();
      return id;
    }

    // Seed / clear an object3d's boolean role from its parentage. Entering a
    // booleanGroup3d makes it an operand (first operand solid, later ones hole —
    // a meaningful subtract); leaving one restores the plain 'solid' role.
    applyObject3dBooleanRole(obj, oldParent, newParent) {
      if (!obj || obj.type !== 'object3d' || !obj.params) return;
      if (newParent && newParent.type === 'booleanGroup3d') {
        const others = this.getLayerChildren(newParent.id)
          .filter((c) => c && c.type === 'object3d' && c.id !== obj.id);
        obj.params.role = others.length === 0 ? 'solid' : 'hole';
      } else if (oldParent && oldParent.type === 'booleanGroup3d') {
        obj.params.role = 'solid';
      }
    }

    // Reassign one object3d layer's parent, seeding / clearing its boolean role.
    // This is the drag-drop reparent path — the layers-panel routes object3d
    // moves through here so drag and tests share one code path. Reorders the
    // layer to sit under its new parent (tree order === array order).
    setObjectLayerParent(objectId, newParentId) {
      const obj = this.getLayerById(objectId);
      if (!obj || obj.type !== 'object3d') return false;
      const oldParent = obj.parentId ? this.getLayerById(obj.parentId) : null;
      const newParent = newParentId ? this.getLayerById(newParentId) : null;
      // Pull the layer out of the array, retarget, then reinsert in tree order.
      this.layers = this.layers.filter((l) => l.id !== objectId);
      obj.parentId = newParentId ?? null;
      this.applyObject3dBooleanRole(obj, oldParent, newParent);
      if (newParentId && this.getLayerById(newParentId)) this._insertUnderParent(obj, newParentId);
      else this.layers.push(obj);
      if (newParent && newParent.isGroup) newParent.groupCollapsed = false;
      this.computeAllDisplayGeometry();
      return true;
    }

    // Fuse the selected object3d layers into a NEW booleanGroup3d under their
    // shared scene group. Operands are reparented under the boolean group and
    // seeded with roles (first solid, rest hole — a subtract out of the box).
    // Requires at least two object3d operands; returns the new group id, or null.
    createBooleanGroupFromSelection(objectLayerIds) {
      const ids = Array.isArray(objectLayerIds) ? objectLayerIds : [];
      const operands = ids
        .map((id) => this.getLayerById(id))
        .filter((l) => l && l.type === 'object3d');
      if (operands.length < 2) return null;
      // The boolean group inherits the first operand's parent (its scene group).
      // Increment B collects only DIRECT object3d children of a booleanGroup3d,
      // so operands must be plain object3d leaves (no boolean-in-boolean yet).
      const parentId = operands[0].parentId ?? null;
      const gid = generateId();
      SETTINGS.globalLayerCount = ++this._layerCounter;
      const num = String(this._layerCounter).padStart(2, '0');
      const bl = new Layer(gid, 'booleanGroup3d', `Boolean ${num}`);
      bl.isGroup = true;
      bl.containerRole = 'boolean';
      bl.groupType = 'boolean';
      bl.groupCollapsed = false;
      bl.visible = true;
      bl.parentId = parentId;
      bl.params.op = bl.params.op || 'subtract';
      // Insert the boolean group after the last operand (keeps it in the scene
      // subtree), then reparent operands under it and seed roles.
      const lastOperandIdx = operands.reduce((acc, op) => {
        const i = this.layers.findIndex((l) => l.id === op.id);
        return i > acc ? i : acc;
      }, this.layers.findIndex((l) => l.id === parentId));
      if (lastOperandIdx < 0) this.layers.push(bl);
      else this.layers.splice(lastOperandIdx + 1, 0, bl);
      operands.forEach((op, i) => {
        op.parentId = gid;
        op.params.role = i === 0 ? 'solid' : 'hole';
      });
      this.activeLayerId = gid;
      this.computeAllDisplayGeometry();
      return gid;
    }

    expandModifierLayer(modifierId) {
      const modIdx = this.layers.findIndex((l) => l.id === modifierId);
      const modLayer = modIdx >= 0 ? this.layers[modIdx] : null;
      if (!modLayer || !isModifierLayer(modLayer)) return null;

      const bounds = this.getBounds();
      const modifier = modLayer.modifier;

      if (modifier.type === 'morph') {
        // Recompute morph output fresh (group.morphedPaths may be stale or absent).
        const multiFn = Modifiers.applyModifierToMultiChildPaths;
        const morphLeaves = this.getLayerDescendants(modifierId)
          .filter((l) => !l.isGroup && l.visible !== false);
        // Mirror the live preview's source selection + pen stamping (see
        // _computeMorphGroups) so Expand produces byte-identical geometry to
        // what is on the canvas — including baked fills / nested modifiers.
        const pathsPerChild = morphLeaves.map((child) => {
          const src = (Array.isArray(child.effectivePaths) && child.effectivePaths.length)
            ? child.effectivePaths
            : (child.paths && child.paths.length ? child.paths : (child.sourcePaths || []));
          const outline = [];
          const fillPaths = [];
          clonePaths(src).forEach((p) => {
            if (!Array.isArray(p)) return;
            const meta = p.meta ? { ...p.meta } : {};
            if (child.penId) meta.penId = child.penId;
            p.meta = meta;
            (meta.paintBucketFillId ? fillPaths : outline).push(p);
          });
          const fills = Array.isArray(child.fills) ? child.fills.map((rec) => clone(rec)) : [];
          // Same parameter-space morph inputs as _refoldMorphGroup, so Expand
          // bakes the SAME rings the canvas shows (param morph, not a
          // geometry-blend re-derivation).
          const canParamMorph = !usesManualSourceGeometry(child)
            && child.type !== 'compound'
            && Boolean(Algorithms && Algorithms[child.type]
              && typeof Algorithms[child.type].generate === 'function');
          const morphSource = canParamMorph
            ? { type: child.type, params: clone(child.params) }
            : null;
          const regen = canParamMorph
            ? (ip) => this.generateParamMorphPaths(child.type, ip, { penId: child.penId })
            : null;
          return { outline, fillPaths, fills, penId: child.penId || null, morphSource, regen };
        });
        const morphed = (typeof multiFn === 'function'
          ? multiFn(pathsPerChild, modifier, bounds)
          : (modLayer.morphedPaths || [])) || [];
        const firstChild = morphLeaves[0] || {};

        const folderId = generateId();
        SETTINGS.globalLayerCount = ++this._layerCounter;
        const folder = new Layer(folderId, 'group', modLayer.name);
        folder.isGroup = true;
        folder.groupType = 'group';
        folder.groupCollapsed = false;
        folder.parentId = modLayer.parentId ?? null;
        folder.visible = modLayer.visible;

        const pad = String(morphed.length).length;
        const shapeLayers = morphed.map((path, i) => {
          const shapeId = generateId();
          SETTINGS.globalLayerCount = ++this._layerCounter;
          const shape = new Layer(shapeId, 'shape', `${modLayer.name} - Line ${String(i + 1).padStart(pad, '0')}`);
          shape.parentId = folderId;
          shape.sourcePaths = clonePaths([path]);
          shape.params.seed = 0;
          shape.params.posX = 0;
          shape.params.posY = 0;
          shape.params.scaleX = 1;
          shape.params.scaleY = 1;
          shape.params.rotation = 0;
          shape.params.curves = false;
          shape.params.smoothing = 0;
          shape.params.simplify = 0;
          // Prefer the morphed path's stamped penId, else fall back to first child's pen/style.
          const stampedPen = (Array.isArray(path) && path.meta && path.meta.penId) || firstChild.penId;
          shape.penId = stampedPen;
          shape.color = firstChild.color;
          shape.strokeWidth = firstChild.strokeWidth;
          shape.lineCap = firstChild.lineCap;
          shape.lineJoin = firstChild.lineJoin;
          shape.miterLimit = firstChild.miterLimit;
          shape.dash = firstChild.dash ? JSON.parse(JSON.stringify(firstChild.dash)) : { enabled: false, pattern: [] };
          shape.visible = true;
          return shape;
        });

        const descendantIds = new Set(this.getLayerDescendants(modifierId).map((l) => l.id));
        this.layers = this.layers.filter((l) => l.id !== modifierId && !descendantIds.has(l.id));
        this.layers.splice(modIdx, 0, folder, ...shapeLayers);

        shapeLayers.forEach((shape) => this.generate(shape.id));
        this.activeLayerId = folderId;
        this.computeAllDisplayGeometry();
        return folderId;
      }

      const leaves = this.getLayerDescendants(modifierId)
        .filter((l) => !l.isGroup && l.visible !== false);

      const expandedItems = [];
      leaves.forEach((child) => {
        const rawPaths = child.paths?.length ? child.paths : (child.sourcePaths || []);
        const mirrored = applyModifierToPaths(rawPaths, modifier, bounds);
        mirrored.forEach((path) => expandedItems.push({ path, child }));
      });

      const folderId = generateId();
      SETTINGS.globalLayerCount = ++this._layerCounter;
      const folder = new Layer(folderId, 'group', modLayer.name);
      folder.isGroup = true;
      folder.groupType = 'group';
      folder.groupCollapsed = false;
      folder.parentId = modLayer.parentId ?? null;
      folder.visible = modLayer.visible;

      const pad = String(expandedItems.length).length;
      const shapeLayers = expandedItems.map(({ path, child }, i) => {
        const shapeId = generateId();
        SETTINGS.globalLayerCount = ++this._layerCounter;
        const shape = new Layer(shapeId, 'shape', `${modLayer.name} - Line ${String(i + 1).padStart(pad, '0')}`);
        shape.parentId = folderId;
        shape.sourcePaths = clonePaths([path]);
        shape.params.seed = 0;
        shape.params.posX = 0;
        shape.params.posY = 0;
        shape.params.scaleX = 1;
        shape.params.scaleY = 1;
        shape.params.rotation = 0;
        shape.params.curves = false;
        shape.params.smoothing = 0;
        shape.params.simplify = 0;
        shape.penId = child.penId;
        shape.color = child.color;
        shape.strokeWidth = child.strokeWidth;
        shape.lineCap = child.lineCap;
        shape.lineJoin = child.lineJoin;
        shape.miterLimit = child.miterLimit;
        shape.dash = child.dash ? JSON.parse(JSON.stringify(child.dash)) : { enabled: false, pattern: [] };
        shape.visible = true;
        return shape;
      });

      // Join pairs that share a mirror-axis endpoint to reduce plotter pen lifts.
      const joinedLayers = joinLayersAtMirrorAxes(shapeLayers, modifier, bounds);

      // Renumber sequentially after joins may have reduced the count.
      const joinedPad = String(joinedLayers.length).length;
      joinedLayers.forEach((layer, i) => {
        layer.name = `${modLayer.name} - Line ${String(i + 1).padStart(joinedPad, '0')}`;
      });

      const descendantIds = new Set(this.getLayerDescendants(modifierId).map((l) => l.id));
      this.layers = this.layers.filter((l) => l.id !== modifierId && !descendantIds.has(l.id));
      this.layers.splice(modIdx, 0, folder, ...joinedLayers);

      joinedLayers.forEach((shape) => this.generate(shape.id));
      this.activeLayerId = folderId;
      this.computeAllDisplayGeometry();
      return folderId;
    }

    addGroupLayer() {
      const id = generateId();
      SETTINGS.globalLayerCount = ++this._layerCounter;
      const num = String(this._layerCounter).padStart(2, '0');
      const layer = new Layer(id, 'group', `Group ${num}`);
      layer.isGroup = true;
      layer.groupType = 'group';
      layer.groupCollapsed = false;
      this.layers.push(layer);
      this.activeLayerId = id;
      return id;
    }

    addEmptyLayer() {
      const id = generateId();
      SETTINGS.globalLayerCount = ++this._layerCounter;
      const num = String(this._layerCounter).padStart(2, '0');
      const layer = new Layer(id, 'group', `Layer ${num}`);
      layer.isGroup = true;
      layer.groupType = 'layer';
      layer.groupCollapsed = false;
      this.layers.push(layer);
      this.activeLayerId = id;
      return id;
    }

    exportState() {
      return {
        formatVersion: VECTURA_FORMAT_VERSION,
        activeLayerId: this.activeLayerId,
        layers: this.layers.map((layer) => ({
          id: layer.id,
          type: layer.type,
          name: layer.name,
          params: cloneLayerParams(layer.params),
          paramStates: cloneParamStates(layer.paramStates || {}),
          parentId: layer.parentId,
          isGroup: layer.isGroup,
          containerRole: layer.containerRole,
          groupType: layer.groupType,
          groupParams: layer.groupParams ? JSON.parse(JSON.stringify(layer.groupParams)) : null,
          groupCollapsed: layer.groupCollapsed,
          modifier: layer.modifier ? JSON.parse(JSON.stringify(layer.modifier)) : null,
          sourcePaths:
            usesManualSourceGeometry(layer) && layer.sourcePaths
              ? layer.sourcePaths.map((path) =>
                  Array.isArray(path)
                    ? { points: path.map((pt) => ({ x: pt.x, y: pt.y })),
                        meta: path.meta ? JSON.parse(JSON.stringify(path.meta)) : null }
                    : path
                )
              : null,
          compound: layer.type === 'compound' && layer.compound
            ? {
                childIds: Array.isArray(layer.compound.childIds) ? layer.compound.childIds.slice() : [],
                opType: layer.compound.opType || 'unite',
                sourceMode: layer.compound.sourceMode || 'silhouette',
              }
            : null,
          mask: layer.mask ? JSON.parse(JSON.stringify(layer.mask)) : null,
          penId: layer.penId,
          color: layer.color,
          strokeWidth: layer.strokeWidth,
          lineCap: layer.lineCap,
          lineJoin: layer.lineJoin,
          miterLimit: layer.miterLimit,
          dash: layer.dash ? JSON.parse(JSON.stringify(layer.dash)) : null,
          strokeAlign: layer.strokeAlign,
          divisions: layer.divisions ? JSON.parse(JSON.stringify(layer.divisions)) : null,
          visible: layer.visible,
          origin: layer.origin
            ? { x: Number(layer.origin.x) || 0, y: Number(layer.origin.y) || 0 }
            : { x: 0, y: 0 },
          fills: Array.isArray(layer.fills) ? JSON.parse(JSON.stringify(layer.fills)) : [],
          sourceFillRecord: layer.sourceFillRecord ? JSON.parse(JSON.stringify(layer.sourceFillRecord)) : null,
        })),
      };
    }

    importState(state) {
      if (!state) return;
      // Capture the SOURCE format version before the shape-migration walk so the
      // Increment F monolith → tree expansion (a layer-graph rewrite, run after
      // Layer construction below) can be gated on it: only a payload that
      // predates v2 is expanded; a v2 doc is already canonical and left alone.
      const sourceFormatVersion = Number.isFinite(Number(state?.formatVersion))
        ? Number(state.formatVersion) : 0;
      state = migrateEngineState(state);
      this.layers = (state.layers || []).map((data) => {
        // 'compound' is a synthetic type — Layer constructor doesn't know it.
        // Build it as a 'shape' then patch the type + compound bag below.
        const ctorType = data.type === 'compound' ? 'shape' : data.type;
        const layer = new Layer(data.id, ctorType, data.name);
        if (data.type === 'compound') {
          layer.type = 'compound';
          layer.compound = data.compound
            ? {
                childIds: Array.isArray(data.compound.childIds) ? data.compound.childIds.slice() : [],
                opType: data.compound.opType || 'unite',
                sourceMode: data.compound.sourceMode || 'silhouette',
                cache: { signature: null, multiPolygon: null },
              }
            : { childIds: [], opType: 'unite', sourceMode: 'silhouette', cache: { signature: null, multiPolygon: null } };
        }
        // Bugs-8: clamp imported numerics to finite values BEFORE the engine
        // hands them to algorithm generate() functions. Without this, a
        // corrupted/legacy file can poison p.scaleX, p.density, p.amplitude,
        // etc. and propagate NaN through the entire render pipeline.
        layer.params = sanitizeImportedParams(data.params || {}, data.type);
        layer.paramStates = JSON.parse(JSON.stringify(data.paramStates || {}));
        layer.parentId = data.parentId ?? null;
        layer.isGroup = Boolean(data.isGroup);
        layer.containerRole = data.containerRole ?? null;
        layer.groupType = data.groupType ?? null;
        layer.groupParams = data.groupParams ? JSON.parse(JSON.stringify(data.groupParams)) : null;
        layer.groupCollapsed = Boolean(data.groupCollapsed);
        layer.modifier = data.modifier ? JSON.parse(JSON.stringify(data.modifier)) : null;
        layer.sourcePaths =
          usesManualSourceGeometry(layer) && Array.isArray(data.sourcePaths)
            ? data.sourcePaths.map((item) => {
                if (!item) return null;
                if (Array.isArray(item)) {
                  return item.map((pt) => ({ x: pt.x, y: pt.y }));
                }
                const p = (item.points || []).map((pt) => ({ x: pt.x, y: pt.y }));
                if (item.meta) p.meta = item.meta;
                return p;
              })
            : null;
        const importedMask = data.mask ? JSON.parse(JSON.stringify(data.mask)) : null;
        const isLegacySourceMask = Array.isArray(importedMask?.sourceIds) && importedMask.sourceIds.length > 0;
        layer.mask = {
          enabled: false,
          sourceIds: [],
          mode: 'parent',
          hideLayer: false,
          invert: false,
          materialized: false,
          ...(importedMask || {}),
        };
        if (isLegacySourceMask) {
          layer.mask.enabled = false;
          layer.mask.sourceIds = [];
          layer.mask.mode = 'parent';
          layer.mask.invert = false;
        } else if (layer.mask.mode !== 'parent') {
          layer.mask.mode = 'parent';
          layer.mask.sourceIds = [];
          layer.mask.invert = false;
        }
        layer.penId = data.penId ?? layer.penId;
        layer.color = data.color || layer.color;
        layer.strokeWidth = Number.isFinite(data.strokeWidth) ? data.strokeWidth : layer.strokeWidth;
        layer.lineCap = data.lineCap || layer.lineCap;
        // Stroke style model (STR-1) — backward-compatible: legacy payloads
        // without these fields keep the Layer constructor defaults.
        layer.lineJoin = sanitizeLineJoin(data.lineJoin, layer.lineJoin);
        layer.miterLimit = data.miterLimit !== undefined
          ? sanitizeMiterLimit(data.miterLimit, layer.miterLimit)
          : (layer.miterLimit ?? 10);
        layer.dash = data.dash !== undefined && data.dash !== null
          ? sanitizeDashBag(data.dash)
          : (layer.dash || { enabled: false, pattern: [] });
        layer.strokeAlign = sanitizeStrokeAlign(data.strokeAlign, layer.strokeAlign);
        // Stroke division (P0-B) — backward-compatible: legacy payloads
        // without the field keep the constructor defaults; ensureLayerDivisions
        // back-fills and sanitizes either way.
        if (data.divisions !== undefined && data.divisions !== null) {
          layer.divisions = JSON.parse(JSON.stringify(data.divisions));
        }
        this.ensureLayerDivisions(layer);
        layer.visible = data.visible !== false;
        if (data.origin && Number.isFinite(data.origin.x) && Number.isFinite(data.origin.y)) {
          layer.origin = { x: data.origin.x, y: data.origin.y };
        } else {
          layer.origin = { x: 0, y: 0 };
        }
        layer.paths = [];
        layer.fills = Array.isArray(data.fills) ? JSON.parse(JSON.stringify(data.fills)) : [];
        layer.sourceFillRecord = data.sourceFillRecord ? JSON.parse(JSON.stringify(data.sourceFillRecord)) : null;
        layer.displayPaths = [];
        layer.displayMaskActive = false;
        layer.helperPaths = null;
        layer.displayHelperPaths = null;
        layer.maskPolygons = null;
        layer.effectivePaths = [];
        layer.effectiveStats = null;
        return layer;
      });
      this.activeLayerId = state.activeLayerId || (this.layers[0] ? this.layers[0].id : null);
      // Scene-tree Increment F — format v1 → v2: eagerly expand any saved
      // MONOLITH scene3d layer into its canonical child tree so the tree is the
      // single UI state. Runs BEFORE the generate loop below so the new object /
      // boolean / light / ground children are generated + composed this pass.
      // Gated on the source version — a doc already at v2 is left untouched — and
      // idempotent besides. Increment B's inline-union render path stays as the
      // permanent safety net for any monolith that is NOT expanded (v2 presets,
      // forward-compat), so the render is unchanged either way.
      if (sourceFormatVersion < VECTURA_FORMAT_VERSION) {
        this._migrateMonolithScenesToTree();
      }
      // Sync _layerCounter from SETTINGS after applyState has already restored globalLayerCount.
      this._layerCounter = SETTINGS.globalLayerCount ?? this._layerCounter;
      // Snapshot imported origins so generate() (which derives a fresh origin from path
      // bounds) does not clobber the values restored from the saved payload.
      const importedOrigins = new Map(
        this.layers.map((layer) => [layer.id, { x: layer.origin?.x ?? 0, y: layer.origin?.y ?? 0 }])
      );
      this.layers.forEach((l) => this.generate(l.id));
      this.layers.forEach((l) => {
        const snapshot = importedOrigins.get(l.id);
        if (snapshot) l.origin = { x: snapshot.x, y: snapshot.y };
      });
      this.computeAllDisplayGeometry();
    }

    duplicateLayer(id, state = null) {
      const source = this.layers.find((l) => l.id === id);
      if (!source) return null;
      const newId = generateId();
      SETTINGS.globalLayerCount = ++this._layerCounter;
      const baseName = `${source.name} Copy`;
      const existing = new Set(this.layers.map((l) => l.name));
      let dupName = baseName;
      let count = 2;
      while (existing.has(dupName)) {
        dupName = `${baseName} ${count}`;
        count += 1;
      }
      const layer = new Layer(newId, source.type, dupName);
      // CONTRACT E: route through cloneLayerParams/cloneParamStates so large
      // shared blobs (importedMesh, scene3d params.assets) are cloned by
      // reference instead of deep-copied into every duplicate.
      layer.params = cloneLayerParams(source.params);
      layer.paramStates = cloneParamStates(source.paramStates || {});
      layer.parentId = state && state.parentId !== undefined ? state.parentId : (source.parentId ?? null);
      layer.isGroup = source.isGroup;
      layer.containerRole = source.containerRole ?? null;
      layer.groupType = source.groupType ?? null;
      layer.groupParams = source.groupParams ? JSON.parse(JSON.stringify(source.groupParams)) : null;
      layer.groupCollapsed = source.groupCollapsed;
      layer.sourcePaths =
        usesManualSourceGeometry(source) && source.sourcePaths ? clonePaths(source.sourcePaths) : null;
      layer.modifier = source.modifier ? JSON.parse(JSON.stringify(source.modifier)) : null;
      layer.penId = source.penId;
      layer.color = source.color;
      layer.strokeWidth = source.strokeWidth;
      layer.lineCap = source.lineCap;
      layer.lineJoin = source.lineJoin;
      layer.miterLimit = source.miterLimit;
      layer.dash = source.dash ? JSON.parse(JSON.stringify(source.dash)) : { enabled: false, pattern: [] };
      layer.strokeAlign = source.strokeAlign;
      layer.divisions = source.divisions ? JSON.parse(JSON.stringify(source.divisions)) : layer.divisions;
      layer.visible = source.visible;
      layer.paths = clonePaths(source.paths);
      layer.displayPaths = clonePaths(source.displayPaths || source.paths || []);
      layer.maskPolygons = clonePaths(source.maskPolygons || []);
      layer.effectivePaths = clonePaths(source.effectivePaths || source.paths || []);
      layer.mask = source.mask ? JSON.parse(JSON.stringify(source.mask)) : layer.mask;

      let currentState = state;
      if (!currentState) {
        const getDescendantsIds = (parentId) => {
          const out = [];
          const visit = (pid) => {
            this.layers.forEach((l) => {
              if (l.parentId === pid) {
                out.push(l.id);
                visit(l.id);
              }
            });
          };
          visit(parentId);
          return out;
        };
        const descIds = source.isGroup ? getDescendantsIds(source.id) : [];
        const allIds = new Set([source.id, ...descIds]);
        let maxIdx = -1;
        this.layers.forEach((l, i) => {
          if (allIds.has(l.id)) maxIdx = Math.max(maxIdx, i);
        });
        currentState = { insertIndex: maxIdx };
      }

      if (currentState.insertIndex >= 0) {
        currentState.insertIndex++;
        this.layers.splice(currentState.insertIndex, 0, layer);
      } else {
        this.layers.push(layer);
        currentState.insertIndex = this.layers.length - 1;
      }

      if (source.isGroup) {
        const children = this.layers.filter((l) => l.parentId === source.id && l.id !== newId);
        children.forEach((child) => {
          const childState = {
            insertIndex: currentState.insertIndex,
            parentId: newId
          };
          this.duplicateLayer(child.id, childState);
          currentState.insertIndex = childState.insertIndex;
        });
      }

      if (!state) {
        this.activeLayerId = newId;
        this.computeAllDisplayGeometry();
      }
      return layer;
    }

    removeLayer(id) {
      const targetIndex = this.layers.findIndex((l) => l.id === id);
      const target = targetIndex >= 0 ? this.layers[targetIndex] : null;
      if (!target) return;
      const drawableCount = this.layers.filter((l) => !l.isGroup).length;
      const pickNextActiveId = (remainingLayers, removedIndex, preferredIds = []) => {
        for (const preferredId of preferredIds) {
          if (remainingLayers.some((layer) => layer.id === preferredId)) return preferredId;
        }
        if (!remainingLayers.length) return null;
        const boundedIndex = Math.max(0, Math.min(removedIndex, remainingLayers.length - 1));
        return remainingLayers[boundedIndex]?.id || remainingLayers[remainingLayers.length - 1]?.id || null;
      };
      if (target.isGroup && isModifierLayer(target)) {
        const preservedChildren = this.layers.filter((layer) => layer.parentId === id);
        preservedChildren.forEach((child) => {
          child.parentId = null;
        });
        const remainingLayers = this.layers.filter((layer) => layer.id !== id);
        this.layers = remainingLayers;
        this._announceRemoval([id]);
        if (this.activeLayerId === id) {
          this.activeLayerId = pickNextActiveId(remainingLayers, targetIndex, preservedChildren.map((child) => child.id));
        } else if (!remainingLayers.some((layer) => layer.id === this.activeLayerId)) {
          this.activeLayerId = pickNextActiveId(remainingLayers, targetIndex);
        }
        this.computeAllDisplayGeometry();
        return;
      }
      if (target.mask && target.mask.enabled) {
        const preservedChildren = this.layers.filter((layer) => layer.parentId === id);
        preservedChildren.forEach((child) => {
          child.parentId = target.parentId || null;
        });
        const remainingLayers = this.layers.filter((layer) => layer.id !== id);
        this.layers = remainingLayers;
        this._announceRemoval([id]);
        if (this.activeLayerId === id) {
          this.activeLayerId = pickNextActiveId(remainingLayers, targetIndex, preservedChildren.map((c) => c.id));
        } else if (!remainingLayers.some((layer) => layer.id === this.activeLayerId)) {
          this.activeLayerId = pickNextActiveId(remainingLayers, targetIndex);
        }
        this.computeAllDisplayGeometry();
        return;
      }
      const removeIds = new Set([id]);
      const collect = (parentId) => {
        this.layers.forEach((l) => {
          if (l.parentId === parentId) {
            removeIds.add(l.id);
            collect(l.id);
          }
        });
      };
      collect(id);
      if (!target.isGroup && target.parentId) {
        const parentId = target.parentId;
        const remaining = this.layers.filter((l) => l.parentId === parentId && l.id !== id).length;
        const parent = this.layers.find((l) => l.id === parentId);
        if (remaining === 0 && parent && parent.isGroup && !isModifierLayer(parent)) removeIds.add(parentId);
      }
      const remainingLayers = this.layers.filter((l) => !removeIds.has(l.id));
      this.layers = remainingLayers;
      this._announceRemoval(removeIds);
      if (removeIds.has(this.activeLayerId)) {
        this.activeLayerId = pickNextActiveId(remainingLayers, targetIndex);
      }
      this.computeAllDisplayGeometry();
    }

    reorderLayers(layersOrIds) {
      if (!Array.isArray(layersOrIds)) {
        console.warn('[Engine] reorderLayers requires an array');
        return false;
      }
      if (layersOrIds.length !== this.layers.length) {
        console.warn('[Engine] reorderLayers length mismatch with current layer set');
        return false;
      }
      const first = layersOrIds[0];
      const isIdList = typeof first === 'string';
      const ids = isIdList
        ? layersOrIds.map((entry) => (typeof entry === 'string' ? entry : null))
        : layersOrIds.map((entry) => (entry && typeof entry.id === 'string' ? entry.id : null));
      if (ids.some((id) => !id || typeof id !== 'string')) {
        console.warn('[Engine] reorderLayers received invalid entries');
        return false;
      }
      const idSet = new Set(ids);
      if (idSet.size !== this.layers.length) {
        console.warn('[Engine] reorderLayers ids must be unique and match current layer count');
        return false;
      }
      const map = new Map(this.layers.map((layer) => [layer.id, layer]));
      for (const id of ids) {
        if (!map.has(id)) {
          console.warn('[Engine] reorderLayers received unknown id');
          return false;
        }
      }
      this.layers = ids.map((id) => map.get(id));
      return true;
    }

    deleteLayersById(idArray) {
      if (!Array.isArray(idArray)) {
        console.warn('[Engine] deleteLayersById requires an array');
        return false;
      }
      const removeSet = new Set();
      for (const id of idArray) {
        if (typeof id !== 'string' || !id) continue;
        if (this.layers.some((layer) => layer.id === id)) removeSet.add(id);
      }
      if (!removeSet.size) return false;
      this.layers = this.layers.filter((layer) => !removeSet.has(layer.id));
      this._announceRemoval(removeSet);
      if (this.activeLayerId && removeSet.has(this.activeLayerId)) {
        this.activeLayerId = null;
      }
      return true;
    }

    setActiveLayerId(idOrNull) {
      if (idOrNull === null || idOrNull === undefined) {
        this.activeLayerId = null;
        return true;
      }
      if (typeof idOrNull !== 'string') {
        console.warn('[Engine] setActiveLayerId requires a string id or null');
        return false;
      }
      if (!this.layers.some((layer) => layer.id === idOrNull)) {
        console.warn('[Engine] setActiveLayerId received unknown id');
        return false;
      }
      this.activeLayerId = idOrNull;
      return true;
    }

    moveLayer(id, direction) {
      const idx = this.layers.findIndex((l) => l.id === id);
      if (idx === -1) return false;
      const newIdx = idx + direction;
      if (newIdx >= 0 && newIdx < this.layers.length) {
        [this.layers[idx], this.layers[newIdx]] = [this.layers[newIdx], this.layers[idx]];
        this.computeAllDisplayGeometry();
        return true;
      }
      return false;
    }

    getLayerById(id) {
      if (!id) return null;
      return this.layers.find((l) => l.id === id) || null;
    }

    getActiveLayer() {
      return this.layers.find((l) => l.id === this.activeLayerId);
    }

    // Translate a batch of layers by {dx, dy} in world (mm) coordinates.
    // Used by the Align/Distribute panel; one call per button click so the
    // surrounding pushHistory() captures a single undo step.
    //
    // Each touched layer is regenerated so its baked paths pick up the new
    // transform — the same pattern the multi-selection transform inputs use
    // (see the TRANSLATION_KEYS branch in src/ui/panels/algo-config-panel.js).
    applyAlignDeltas(deltaMap) {
      if (!deltaMap) return;
      const touchedIds = [];
      Object.entries(deltaMap).forEach(([layerId, delta]) => {
        if (!delta || (!delta.dx && !delta.dy)) return;
        const layer = this.getLayerById(layerId);
        if (!layer || !layer.params) return;
        layer.params.posX = (layer.params.posX || 0) + (delta.dx || 0);
        layer.params.posY = (layer.params.posY || 0) + (delta.dy || 0);
        window.Vectura?.PaintBucketOps?.translateLayerFills?.(layer, delta.dx || 0, delta.dy || 0);
        touchedIds.push(layerId);
      });
      if (!touchedIds.length) return;
      touchedIds.forEach((id) => this.generate(id));
      this.computeAllDisplayGeometry();
    }

    getBounds() {
      const { width, height } = this.currentProfile;
      const m = SETTINGS.margin;
      return {
        width,
        height,
        m,
        dW: width - m * 2,
        dH: height - m * 2,
        truncate: SETTINGS.truncate,
      };
    }

    refreshMaskCapabilities() {
      const bounds = this.getBounds();
      this.layers.forEach((layer) => {
        layer.maskCapabilities = getLayerMaskCapabilities(layer, this, bounds);
      });
    }

    getMaskEligibleLayers(targetLayerId) {
      return this.layers.filter((layer) => {
        if (!layer || layer.id === targetLayerId) return false;
        return Boolean(layer.maskCapabilities?.canSource);
      });
    }

    getLayerAncestors(layer) {
      const out = [];
      let current = layer;
      while (current?.parentId) {
        const parent = this.layers.find((entry) => entry.id === current.parentId);
        if (!parent) break;
        out.push(parent);
        current = parent;
      }
      return out;
    }

    // True when `layer` lives inside a compound (Pathfinder) container — used by
    // the renderer to suppress drawing the originals whose geometry has been
    // consumed by their compound parent's baked silhouette.
    hasCompoundAncestor(layer) {
      let current = layer;
      while (current?.parentId) {
        const parent = this.layers.find((entry) => entry.id === current.parentId);
        if (!parent) return false;
        if (parent.containerRole === 'compound') return true;
        current = parent;
      }
      return false;
    }

    getAncestorModifiers(layer) {
      return this.getLayerAncestors(layer)
        .filter((entry) => isModifierLayer(entry) && entry.modifier)
        .reverse();
    }

    getAncestorMaskLayers(layer) {
      return this.getLayerAncestors(layer)
        .filter((entry) => entry?.mask?.enabled && entry.maskCapabilities?.canSource)
        .reverse();
    }

    _splitModifiersByMaskBoundary(layer) {
      const allModifiers = this.getAncestorModifiers(layer);
      const maskAncestors = this.getAncestorMaskLayers(layer);
      if (!maskAncestors.length) return { inside: allModifiers, outside: [] };
      const inside = [];
      const outside = [];
      allModifiers.forEach((mod) => {
        const isOutside = maskAncestors.some((maskLayer) =>
          this.getLayerAncestors(maskLayer).some((a) => a.id === mod.id)
        );
        (isOutside ? outside : inside).push(mod);
      });
      return { inside, outside };
    }

    getLayerDepth(layer) {
      return this.getLayerAncestors(layer).length;
    }

    getLayerChildren(layerId) {
      return this.layers.filter((layer) => layer?.parentId === layerId);
    }

    getLayerDescendants(layerId) {
      const out = [];
      const visit = (parentId) => {
        this.getLayerChildren(parentId).forEach((child) => {
          out.push(child);
          visit(child.id);
        });
      };
      visit(layerId);
      return out;
    }

    computeLayerEffectiveGeometry(layerId) {
      const layer = this.layers.find((entry) => entry.id === layerId);
      if (!layer || layer.isGroup) return;
      const basePaths = clonePaths(layer.paths || []);
      const { inside } = this._splitModifiersByMaskBoundary(layer);
      const effective = inside
        .filter((modifierLayer) => modifierLayer.modifier?.type !== 'morph')
        .reduce(
          (current, modifierLayer) => applyModifierToPaths(current, modifierLayer.modifier, this.getBounds()),
          basePaths
        );
      const baseEffective = applyStrokeAlignToPaths(layer, clonePaths(effective || []));
      const fillPaths = window.Vectura?.PaintBucketOps?.generateGeometryForLayer?.(layer) || [];
      layer.effectivePaths = fillPaths.length ? baseEffective.concat(fillPaths) : baseEffective;
      layer.effectiveStats = countPathPoints(layer.effectivePaths);
    }

    computeLayerDisplayGeometry(layerId) {
      const layer = this.layers.find((entry) => entry.id === layerId);
      if (!layer || layer.isGroup) return;
      const sourcePaths = clonePaths(layer.effectivePaths || layer.paths || []);
      layer.displayHelperPaths = clonePaths(layer.helperPaths || []);
      layer.displayMaskActive = false;
      if (!layer.visible) {
        layer.displayPaths = sourcePaths;
        layer.displayStats = countPathPoints(sourcePaths);
        return;
      }
      const ancestorMasks = getMaskingAncestors(layer, this, {});
      const { outside } = this._splitModifiersByMaskBoundary(layer);
      const bounds = this.getBounds();

      let currentPaths = sourcePaths;

      if (ancestorMasks.length) {
        currentPaths = buildLayerMaskedPaths(layer, this, bounds, { sourcePaths });
        layer.displayMaskActive = true;
      }

      const outsideNonMorph = outside.filter((modifierLayer) => modifierLayer.modifier?.type !== 'morph');
      if (outsideNonMorph.length) {
        currentPaths = outsideNonMorph.reduce(
          (current, modifierLayer) => applyModifierToPaths(current, modifierLayer.modifier, bounds),
          currentPaths
        );
      }

      layer.displayPaths = currentPaths;
      layer.displayStats = countPathPoints(currentPaths);
    }

    getRenderablePaths(layer, options = {}) {
      if (!layer) return [];
      if (layer._morphConsumed) return [];
      if (layer.isGroup && Array.isArray(layer.morphedPaths)) return layer.morphedPaths;
      // Scene-tree Increment B: a consumed object3d/booleanGroup3d child emits
      // nothing (the owning scene group emits its paths); a scene group serves
      // the single composed pass. Mirrors the morph checks above.
      if (layer._sceneConsumed) return [];
      if (layer.isGroup && Array.isArray(layer.scenePaths)) return layer.scenePaths;
      if (layer.mask?.enabled && layer.mask?.hideLayer) return [];
      // Stroke division (P0-B): divided fragments are the FINAL renderable
      // geometry — canvas, export, and stats all consume them. Null whenever
      // divisions are disabled (applyStrokeDivision clears it). preDivision
      // callers (before/after optimization stats, pre-optimization previews)
      // opt out of fragments to see the undivided source chain.
      if (!options.preDivision && Array.isArray(layer.dividedPaths)) return layer.dividedPaths;
      const { useOptimized = false } = options;
      if (layer.displayMaskActive && Array.isArray(layer.displayPaths)) return layer.displayPaths;
      if (useOptimized && Array.isArray(layer.optimizedPaths)) return layer.optimizedPaths;
      if (Array.isArray(layer.effectivePaths) && layer.effectivePaths.length) return layer.effectivePaths;
      // Mask source layers whose effective geometry was computed as empty (e.g. a mirror clipped
      // the shape off the source side) must not fall back to layer.paths — that would render the
      // raw outline and produce an empty mask circle with no content inside.
      if (layer.mask?.enabled && layer.effectiveStats !== null) return layer.effectivePaths || [];
      return layer.paths || [];
    }

    computeAllDisplayGeometry() {
      this.layers.forEach((layer) => {
        if (!layer) return;
        if (layer.morphedPaths) delete layer.morphedPaths;
        if (layer._morphConsumed) delete layer._morphConsumed;
        // Scene-tree Increment B: clear last pass's scene compose flags so the
        // consumed markers + composed paths are re-derived deterministically.
        if (layer.scenePaths) delete layer.scenePaths;
        if (layer._sceneConsumed) delete layer._sceneConsumed;
        // Morph groups borrow the first child's pen/style as a render/export
        // fallback. Reset it each pass so a group with no visible children
        // doesn't serialize a stale child's style, and re-derivation is
        // deterministic. (_computeMorphGroups repopulates below.)
        if (layer.isGroup && layer.modifier?.type === 'morph') {
          layer.penId = null;
          layer.color = null;
          layer.strokeWidth = null;
          layer.lineCap = null;
          layer.lineJoin = null;
          layer.miterLimit = null;
          layer.dash = null;
        }
      });
      this.layers.forEach((layer) => {
        if (!layer || layer.isGroup) return;
        this.computeLayerEffectiveGeometry(layer.id);
      });
      this.refreshMaskCapabilities();
      // Compound layers depend on their children's effective geometry, so
      // rebuild their cached multipolygons now — before display geometry.
      if (window.Vectura?.PathfinderOps?.refreshAllCompounds) {
        window.Vectura.PathfinderOps.refreshAllCompounds(this);
      }
      this.layers
        .filter((layer) => layer && !layer.isGroup)
        .slice()
        .sort((a, b) => this.getLayerDepth(a) - this.getLayerDepth(b))
        .forEach((layer) => {
        if (!layer || layer.isGroup) return;
        this.computeLayerDisplayGeometry(layer.id);
      });
      this._computeMorphGroups();
      this._computeSceneGroups();
      // optimizeLayers ends by recutting stroke divisions (the division stage
      // is structurally downstream of optimization; see optimizeLayers tail).
      this.optimizeLayers(this.layers);
    }

    // Stroke division stage (P0-B): after optimization, divide each enabled
    // leaf layer's post-optimization geometry into layer.dividedPaths.
    // getRenderablePaths serves those fragments at top precedence, so the
    // canvas renderer, export, and stats consume them automatically. v1:
    // chain continuation applies WITHIN one parent path (each parent is its
    // own chain) — no cross-path chain detection — but everything routes
    // through divideChain so the continuation semantics exist.
    applyStrokeDivision(layers) {
      const StrokeDivide = window.Vectura?.StrokeDivide;
      (layers || this.layers).forEach((layer) => {
        if (!layer || layer.isGroup) return;
        // Reset first so the source read below sees pre-division geometry.
        layer.dividedPaths = null;
        if (!StrokeDivide) return; // script tag missing — degrade to a no-op
        const divisions = this.ensureLayerDivisions(layer);
        if (!divisions || !divisions.enabled) return;
        const source = this.getRenderablePaths(layer, { useOptimized: true });
        // Whole-list division (Inc-3): the layer's sub-paths divide as ONE
        // continuous arc-length domain, so a stroke stored as several sub-paths
        // dashes as one ruler (fixed phaseMode) instead of restarting each
        // sub-path. The whole-list call also gives weighted-pen + jitter modes a
        // stable per-path index for their deterministic seeded hashes, and the
        // fragment cap is shared natively across the list (a per-LAYER budget).
        const divideOpts = {
          // Layer curve context: curves-on layers smooth plain polylines at
          // render time, so the divider must flatten them before measuring.
          useCurves: Boolean(layer.params && layer.params.curves),
          // Deterministic seed for weighted-pen + jitter: fold the layer's own
          // stable, serialized seed into the division seed so two layers with
          // identical divisions still vary, yet every run is reproducible. No
          // live RNG — both operands are captured in the document.
          seed: this._divisionSeed(layer, divisions),
          maxFragments: StrokeDivide.MAX_FRAGMENTS,
        };
        layer.dividedPaths = StrokeDivide.divideChain(source || [], divisions, divideOpts);
      });
    }

    // Deterministic division seed (Inc-3). Combines the layer's own serialized
    // seed with the division-level seed via an integer mix, so weighted-pen +
    // jitter vary per layer yet reproduce identically on every reload / export.
    // Both operands live in the document — there is NO Math.random / Date.now.
    _divisionSeed(layer, divisions) {
      const layerSeed = Number.isFinite(layer?.params?.seed) ? (layer.params.seed | 0) : 0;
      const divSeed = Number.isFinite(divisions?.seed) ? (divisions.seed | 0) : 0;
      // Map the division seed to a mixing operand. The historical `divSeed || 1`
      // aliased seed 1 onto seed 0 (both -> operand 1), so changing the default
      // seed 0 -> 1 produced no visible change. Keep seed 0 on operand 1 (the
      // default — saved docs stay byte-identical) but route seed 1 to the
      // otherwise-unused 0 operand so it yields a distinct weighted/jitter
      // sequence. Every other seed already maps to its own operand, untouched.
      const mixSeed = divSeed === 1 ? 0 : (divSeed || 1);
      return (layerSeed ^ Math.imul(mixSeed, 0x9e3779b1)) | 0;
    }

    _computeMorphGroups() {
      const multiFn = Modifiers.applyModifierToMultiChildPaths;
      if (typeof multiFn !== 'function') return;
      const bounds = this.getBounds();
      this.layers.forEach((group) => {
        if (!isModifierLayer(group) || group.modifier?.type !== 'morph') return;
        this._refoldMorphGroup(group, bounds);
      });
    }

    // Scene-tree Increment B — compose every scene GROUP once. A scene group is
    // a scene3d layer flagged isGroup + containerRole 'scene'; it COLLECTS its
    // descendant object3d/booleanGroup3d layers back into one assembled scene
    // input and runs the shared compositor over the whole set (occlusion /
    // lighting / shadow are cross-object, so one HLR pass owns every path).
    // Mirrors _computeMorphGroups.
    _computeSceneGroups() {
      this.layers.forEach((group) => {
        if (!group || !group.isGroup) return;
        if (group.type !== 'scene3d' || group.containerRole !== 'scene') return;
        this._composeSceneGroup(group);
      });
    }

    // Compose ONE scene group: walk its descendants in tree order, mark each
    // object3d/booleanGroup3d child _sceneConsumed (so it emits nothing on its
    // own — mirrors morph's _morphConsumed), collect them + any INLINE arrays
    // still on the group into the normalized scene input, and run scene3d's
    // generate ONCE. The composed paths live on group.scenePaths, which
    // getRenderablePaths serves for the group (mirrors group.morphedPaths). The
    // compositor math is untouched — collection only reconstructs its input.
    _composeSceneGroup(group) {
      const Params = window.Vectura?.Scene3D?.Params;
      const algo = Algorithms && Algorithms.scene3d;
      if (!group || !Params || typeof Params.collectSceneParams !== 'function'
        || !algo || typeof algo.generate !== 'function') return;

      const collected = [];
      // Polish P-B — object3d children by layer id, so the post-emit pass can
      // read each one's own layer.divisions bag (an object3d IS a real layer).
      const objectLayers = new Map();
      this.getLayerDescendants(group.id).forEach((layer) => {
        if (!layer) return;
        if (layer.type === 'object3d') {
          layer._sceneConsumed = true;
          if (layer.visible === false) return; // hidden ⇒ contributes nothing
          objectLayers.set(layer.id, layer);
          collected.push({ kind: 'object', id: layer.id, params: layer.params });
        } else if (layer.type === 'booleanGroup3d') {
          layer._sceneConsumed = true;
          if (layer.visible === false) return;
          const children = this.getLayerChildren(layer.id)
            .filter((c) => c && c.type === 'object3d')
            .map((c) => c.id);
          collected.push({ kind: 'boolean', id: layer.id, params: layer.params, children });
        } else if (layer.type === 'sceneLight3d') {
          // Scene-tree Increment E — a light child carries one lights[] entry.
          layer._sceneConsumed = true;
          if (layer.visible === false) return; // hidden ⇒ contributes no light
          collected.push({ kind: 'light', id: layer.id, params: layer.params });
        } else if (layer.type === 'sceneGround3d') {
          // Scene-tree Increment E — a ground child enables the ground fixture.
          layer._sceneConsumed = true;
          if (layer.visible === false) return; // hidden ⇒ ground off (inline fallback)
          collected.push({ kind: 'ground', id: layer.id, params: layer.params });
        }
      });

      const assembled = Params.collectSceneParams(group.params, collected);

      // Bounds built EXACTLY like generate() (penWidth from the group pen), so a
      // scene group renders byte-identically to the equivalent monolith leaf.
      const { width, height } = this.currentProfile;
      const m = SETTINGS.margin;
      const pens = Array.isArray(SETTINGS.pens) ? SETTINGS.pens : [];
      const layerPen = pens.find((pn) => pn && pn.id === group.penId) || pens[0];
      const penWidth = Number(layerPen && layerPen.width) > 0 ? Number(layerPen.width) : 0.35;
      const bounds = {
        width, height, m, dW: width - m * 2, dH: height - m * 2, penWidth,
        truncate: SETTINGS.truncate, fastPreview: false, preview3dQuality: SETTINGS.preview3dQuality,
      };

      const rng = new SeededRNG(group.params.seed);
      const noise = new SimpleNoise(group.params.seed);
      let paths = [];
      try {
        paths = algo.generate(assembled, rng, noise, bounds) || [];
      } catch (err) {
        console.error('[Engine] Scene group compose failed:', err);
        paths = [];
      }
      group.scenePaths = this._applyObjectDivisions(paths, objectLayers);
    }

    // Polish P-B — per-object stroke divisions inside a scene group. A composed
    // scene emits ALL paths on the group (its object3d children are
    // _sceneConsumed, so their own division pass never runs); this reunites each
    // object with its divisions by partitioning the group's paths on
    // meta.sceneTarget.objectId and running the SHARED StrokeDivide.divideChain
    // over that object's subset — NOT a forked divider, so Inc-0 gap-aware dedup
    // + Inc-3 grammar (weighted pen, phase modes, seeded jitter) apply verbatim
    // and a gapped object never suppresses a coincident undivided one. DEFAULT
    // (no object3d child carries divisions.enabled) returns `paths` UNCHANGED by
    // reference — byte-identical to pre-P-B.
    _applyObjectDivisions(paths, objectLayers) {
      const StrokeDivide = window.Vectura?.StrokeDivide;
      if (!StrokeDivide || !Array.isArray(paths) || !paths.length || !objectLayers || !objectLayers.size) {
        return paths;
      }
      const EPS = 1e-6;
      // Objects that carry a NON-DEGENERATE enabled division. An enabled bag whose
      // classes sum to < EPS total length makes divideChain a no-op — it returns
      // its input array UNCHANGED (see divideChain's own `cycleLen < EPS` guard).
      // Such an object must NOT be treated as active: otherwise the partition +
      // regroup below would run for zero ink change, and the "byte-identical
      // default" would only hold when every object is fully off. Mirroring the
      // divider's emptiness check keeps enabled-but-degenerate identical to off.
      const active = new Map();
      objectLayers.forEach((layer, id) => {
        const divisions = this.ensureLayerDivisions(layer);
        if (!divisions || !divisions.enabled) return;
        const cycleLen = typeof StrokeDivide.cycleLengthMm === 'function'
          ? StrokeDivide.cycleLengthMm(divisions) : 0;
        if (!(cycleLen > EPS)) return; // enabled but degenerate ⇒ a divideChain no-op
        active.set(id, { layer, divisions });
      });
      if (!active.size) return paths; // no usable override ⇒ byte-identical passthrough

      // CONTIGUITY CONTRACT: scene3d emits each object3d's paths CONTIGUOUSLY in
      // group.scenePaths — one records.forEach emits that object's faces + edges
      // together, and cast shadows stamp objectId 'ground' (not the caster). We
      // therefore reserve a slot per CONTIGUOUS RUN of an active object and divide
      // that run as ONE chain. In the normal (contiguous) case an object is a
      // SINGLE run, so this is exactly a whole-object divideChain — seam-continuous
      // phase + deterministic per-path fragment hashes, byte-identical to pre-P-B.
      // A per-POSITION splice is NOT an option: divideChain needs the whole run in
      // order for that seam-continuous phase, so fragments must pool at one slot.
      // GUARD (latent-reorder defense): if a future emit change ever interleaves
      // one object's paths with another's, that object appears in MORE THAN ONE
      // run. Pooling all its fragments at the FIRST position would silently pull
      // later blocks forward and corrupt painter's order for opaque fills — so we
      // instead divide EACH contiguous run in place (a safe local fallback that
      // preserves order) and warn. Cross-run phase continuity is the only thing
      // sacrificed, which is meaningless once the runs are interleaved anyway.
      const slots = [];           // [{ oid, paths } | path]  (result skeleton)
      const runCount = new Map(); // oid -> number of contiguous runs seen
      let openRun = null;         // the run slot currently being appended to
      let openOid = null;
      paths.forEach((path) => {
        const oid = path && path.meta && path.meta.sceneTarget && path.meta.sceneTarget.objectId;
        if (oid != null && active.has(oid)) {
          if (openOid !== oid) {
            openRun = { oid, paths: [] };
            slots.push(openRun);
            openOid = oid;
            runCount.set(oid, (runCount.get(oid) || 0) + 1);
          }
          openRun.paths.push(path);
        } else {
          slots.push(path);
          openRun = null;
          openOid = null;
        }
      });
      runCount.forEach((n, oid) => {
        if (n > 1) {
          console.warn(`[Engine] scene object ${oid} emitted non-contiguous paths (${n} runs); dividing each run separately to preserve paint order.`);
        }
      });

      const out = [];
      slots.forEach((item) => {
        if (item && item.oid != null && Array.isArray(item.paths)) {
          const { layer, divisions } = active.get(item.oid);
          const divideOpts = {
            useCurves: Boolean(layer.params && layer.params.curves),
            seed: this._divisionSeed(layer, divisions),
            maxFragments: StrokeDivide.MAX_FRAGMENTS,
          };
          StrokeDivide.divideChain(item.paths, divisions, divideOpts).forEach((f) => out.push(f));
        } else {
          out.push(item);
        }
      });
      return out;
    }

    // Pure parameter-space regeneration for morph intermediates: run an
    // algorithm at arbitrary params and apply the standard layer post-transform
    // (posX/posY/scaleX/scaleY/rotation about the geometry origin) WITHOUT
    // touching any layer. The morph modifier calls this once per blend step
    // with interpolated params, which is what turns a rotated/resized copy
    // into true in-between rotations/sizes instead of a geometry-blend tangle.
    //
    // Raw (untransformed) algorithm output is cached per core-param signature —
    // transform-only changes (child drags/resizes/rotates) reuse the cached
    // geometry and only re-apply the cheap post-transform, keeping the
    // hot-path refold at frame rate even for simulation-heavy algorithms.
    generateParamMorphPaths(type, params, opts = {}) {
      const algo = Algorithms && Algorithms[type];
      if (!algo || typeof algo.generate !== 'function') return [];
      if (!params || typeof params !== 'object') return [];
      const p = type === 'petalisDesigner'
        ? { ...params, lightSource: SETTINGS.lightSource }
        : params;

      const { width, height } = this.currentProfile;
      const m = SETTINGS.margin;
      const pens = Array.isArray(SETTINGS.pens) ? SETTINGS.pens : [];
      const pen = pens.find((pn) => pn && pn.id === opts.penId) || pens[0];
      const penWidth = Number(pen && pen.width) > 0 ? Number(pen.width) : 0.35;
      const bounds = {
        width, height, m, dW: width - m * 2, dH: height - m * 2, penWidth,
        truncate: SETTINGS.truncate, preview3dQuality: SETTINGS.preview3dQuality,
      };

      // Cache key: everything that shapes the RAW output. The post-transform
      // params are excluded — algorithms don't read them (the engine applies
      // them after generation), so a drag must not invalidate the cache.
      const core = { ...p };
      delete core.posX;
      delete core.posY;
      delete core.scaleX;
      delete core.scaleY;
      delete core.rotation;
      let key;
      try {
        key = `${type}|${width}x${height}|${m}|${penWidth}|${SETTINGS.truncate ? 1 : 0}|${JSON.stringify(core)}`;
      } catch (err) {
        key = null; // unserializable params (shouldn't happen) → skip caching
      }
      if (!this._paramMorphCache) this._paramMorphCache = new Map();
      let raw = key ? this._paramMorphCache.get(key) : null;
      if (raw && key) {
        // refresh LRU recency
        this._paramMorphCache.delete(key);
        this._paramMorphCache.set(key, raw);
      }
      if (!raw) {
        const rng = new SeededRNG(p.seed);
        const noise = new SimpleNoise(p.seed);
        try {
          raw = algo.generate(p, rng, noise, bounds) || [];
        } catch (err) {
          raw = [];
        }
        if (key) {
          this._paramMorphCache.set(key, raw);
          while (this._paramMorphCache.size > 64) {
            this._paramMorphCache.delete(this._paramMorphCache.keys().next().value);
          }
        }
      }

      const origin = computeGeometryOrigin(raw, width, height);
      const { transform, transformMeta } = buildParamPostTransform(p, origin);
      const out = [];
      raw.forEach((path) => {
        if (!Array.isArray(path)) return;
        // Circle primitives (e.g. phylla dots) carry their geometry in meta
        // with an EMPTY point array — keep them; only drop true degenerates.
        if (path.length < 2 && !(path.meta && path.meta.kind === 'circle')) return;
        const t = path.map((pt) => transform(pt));
        if (path.meta) t.meta = transformMeta(path.meta);
        out.push(t);
      });
      return out;
    }

    // Refold ONE morph group's blend from its leaves' current effective
    // geometry. Self-contained (sets the consumed flags + pen/style fallback it
    // needs), so it doubles as the hot-path refold during a child drag without
    // re-running the whole document's effective/display/optimize passes.
    //
    // `liveDragIds` (Set, optional): children currently in a live drag preview.
    // The renderer rewrites their layer.paths directly and only commits
    // params.posX/rotation/scale on release, so parameter-space morphing would
    // read STALE params mid-drag and freeze the rings. Those children blend
    // geometry (which tracks the preview) until the release recompute restores
    // the parameter-space rings.
    _refoldMorphGroup(group, bounds, liveDragIds) {
      const multiFn = Modifiers.applyModifierToMultiChildPaths;
      if (typeof multiFn !== 'function' || !group) return;
      const b = bounds || this.getBounds();
      // Direct-and-nested LEAF descendants in tree order (depth-first).
      const leaves = this.getLayerDescendants(group.id).filter((l) => l && !l.isGroup);
      // Mark every leaf consumed so it does not render/export on its own.
      leaves.forEach((l) => { l._morphConsumed = true; });
      // Only VISIBLE leaves participate in the morph chain.
      const visibleLeaves = leaves.filter((l) => l.visible !== false);
      const pathsPerChild = visibleLeaves.map((child) => {
        const src = (Array.isArray(child.effectivePaths) && child.effectivePaths.length)
          ? child.effectivePaths
          : (child.paths || []);
        // effectivePaths mixes outline polylines with paint-bucket fill
        // geometry (fill paths carry meta.paintBucketFillId — see
        // paint-bucket-ops.js). The morph blends OUTLINES only; fill is
        // regenerated per intermediate ring from the child's fill records.
        const outline = [];
        const fillPaths = [];
        clonePaths(src).forEach((p) => {
          if (!Array.isArray(p)) return;
          const meta = p.meta ? { ...p.meta } : {};
          if (child.penId) meta.penId = child.penId;
          p.meta = meta;
          (meta.paintBucketFillId ? fillPaths : outline).push(p);
        });
        const fills = Array.isArray(child.fills)
          ? child.fills.map((rec) => clone(rec))
          : [];
        // Parameter-space morph inputs: algorithm children expose their
        // type+params and a pure regen callback so same-algorithm pairs can
        // interpolate params and regenerate true intermediates. Shape/compound
        // layers (manual geometry) stay geometry-blended.
        const canParamMorph = !usesManualSourceGeometry(child)
          && child.type !== 'compound'
          && !(liveDragIds && liveDragIds.has(child.id))
          && Boolean(Algorithms && Algorithms[child.type]
            && typeof Algorithms[child.type].generate === 'function');
        const morphSource = canParamMorph
          ? { type: child.type, params: clone(child.params) }
          : null;
        const regen = canParamMorph
          ? (ip) => this.generateParamMorphPaths(child.type, ip, { penId: child.penId })
          : null;
        return { outline, fillPaths, fills, penId: child.penId || null, morphSource, regen };
      });
      const morphed = multiFn(pathsPerChild, group.modifier, b) || [];
      group.morphedPaths = morphed;
      // transient pen/style fallback for renderer/export/stats
      const first = visibleLeaves[0];
      if (first) {
        group.penId = first.penId;
        group.color = first.color;
        group.strokeWidth = first.strokeWidth;
        group.lineCap = first.lineCap;
        group.lineJoin = first.lineJoin;
        group.miterLimit = first.miterLimit;
        group.dash = first.dash ? JSON.parse(JSON.stringify(first.dash)) : { enabled: false, pattern: [] };
      }
    }

    // Hot-path refold for a live child drag: refold ONLY the morph groups that
    // own the dragged layers (innermost group first, so a morph nested inside a
    // morph settles before its parent reads it), reusing the leaves' already-
    // updated effective geometry. Skips the full-document effective/display/
    // optimize sweep so the in-between rings track the drag at frame rate; the
    // drag's release path still runs a full computeAllDisplayGeometry().
    refoldMorphGroupsForLayers(layerIds) {
      if (typeof Modifiers.applyModifierToMultiChildPaths !== 'function') return;
      const ids = Array.isArray(layerIds) ? layerIds : [layerIds];
      const groups = new Map();
      ids.forEach((id) => {
        const layer = this.layers.find((l) => l.id === id);
        if (!layer) return;
        this.getAncestorModifiers(layer).forEach((mod) => {
          if (mod?.modifier?.type === 'morph') groups.set(mod.id, mod);
        });
      });
      if (!groups.size) return;
      const bounds = this.getBounds();
      const liveDragIds = new Set(ids);
      [...groups.values()]
        .sort((a, b) => this.getLayerDepth(b) - this.getLayerDepth(a))
        .forEach((group) => this._refoldMorphGroup(group, bounds, liveDragIds));
    }

    resolveProfile() {
      const key = this.profileKey || SETTINGS.paperSize || 'a4';
      const base = MACHINES[key] || MACHINES.a4;
      let width = base.width;
      let height = base.height;
      if (key === 'custom') {
        const customW = SETTINGS.paperWidth;
        const customH = SETTINGS.paperHeight;
        if (Number.isFinite(customW) && customW > 0) width = customW;
        if (Number.isFinite(customH) && customH > 0) height = customH;
      }
      const orientation = SETTINGS.paperOrientation || 'landscape';
      const isLandscape = orientation === 'landscape';
      if (isLandscape && width < height) {
        [width, height] = [height, width];
      }
      if (!isLandscape && width > height) {
        [width, height] = [height, width];
      }
      return { name: base.name, width, height };
    }

    setProfile(key) {
      this.profileKey = key;
      this.currentProfile = this.resolveProfile();
    }

    generate(layerId, options = {}) {
      const layer = this.layers.find((l) => l.id === layerId);
      if (!layer) return;
      if (layer.isGroup) {
        // Scene-tree Increment D — a scene GROUP recomposes its scenePaths on
        // generate() so scene-object drags (which call generate on the owning
        // group) refresh the canvas. Idempotent with computeAllDisplayGeometry's
        // own compose pass; the compositor math is untouched.
        if (layer.type === 'scene3d' && layer.containerRole === 'scene') this._composeSceneGroup(layer);
        return;
      }
      if (layer.type === 'compound') {
        // Compound layers derive geometry from their children via PathfinderOps.
        // computeAllDisplayGeometry() re-runs the refresh once all primitives
        // have generated, so a no-op here keeps the per-layer pass cheap.
        return;
      }

      const rng = new SeededRNG(layer.params.seed);
      const noise = new SimpleNoise(layer.params.seed);

      const { width, height } = this.currentProfile;
      const m = SETTINGS.margin;
      const dW = width - m * 2;
      const dH = height - m * 2;
      const fastPreview = Boolean(options && (options.preview === true || options.fastPreview === true));
      const baseParams =
        layer.type === 'petalisDesigner'
          ? { ...layer.params, lightSource: SETTINGS.lightSource }
          : layer.params;
      const p = fastPreview ? { ...baseParams, fastPreview: true } : baseParams;

      // The physical pen width (mm) of the layer's assigned pen — algorithms
      // that space geometry by the pen (the text banded bold's concentric fill,
      // spacing = penWidth·(1 − inkOverlap)) read it from bounds. Falls back to
      // the first pen, then a fine default, so headless callers stay stable.
      const pens = Array.isArray(SETTINGS.pens) ? SETTINGS.pens : [];
      const layerPen = pens.find((pn) => pn && pn.id === layer.penId) || pens[0];
      const penWidth = Number(layerPen && layerPen.width) > 0 ? Number(layerPen.width) : 0.35;
      const bounds = { width, height, m, dW, dH, penWidth, truncate: SETTINGS.truncate, fastPreview, preview3dQuality: SETTINGS.preview3dQuality };

      // The layer's geometry BEFORE any of this pass touches it. Captured here
      // because applyShapeAnchorRebuild rewrites a shape layer's sourcePaths in
      // place: measuring afterwards counted the already-simplified result on both
      // sides of the readout's arrow, so an expanded spiral simplified down to six
      // chords reported "Points 6 → 6" — a reduction of nothing, from nothing.
      // Count the UNSIMPLIFIED baseline. A shape layer's sourcePaths are rewritten
      // in place by every rebuild, so counting them here would report the previous
      // Simplify setting's output as this one's "before" — the arrow would creep
      // (4000 → 2085, then 2085 → 2084) instead of standing still. `originalAnchors`
      // is the untouched baseline the rebuild keeps precisely for this.
      const preCounts = usesManualSourceGeometry(layer) && Array.isArray(layer.sourcePaths)
        ? countLayerGeometry(layer.sourcePaths.map((path) => {
          const baseline = path && path.meta && path.meta.originalAnchors;
          if (!Array.isArray(baseline)) return path;
          const proxy = baseline.map((a) => ({ x: a.x, y: a.y }));
          proxy.meta = { anchors: baseline };
          return proxy;
        }))
        : null;

      // Shape layers: bake simplify/smoothing destructively into sourcePath anchors
      // (reversible — originalAnchors snapshot lives on path.meta).
      if (usesManualSourceGeometry(layer)) applyShapeAnchorRebuild(layer, bounds);

      const algo = Algorithms[layer.type] || Algorithms.flowfield;
      let rawPaths;
      try {
        rawPaths =
          usesManualSourceGeometry(layer) && layer.sourcePaths
            ? clonePaths(layer.sourcePaths)
            : algo.generate(p, rng, noise, bounds) || [];
      } catch (err) {
        console.error('[Engine] Algorithm generation failed for layer type:', layer.type, err);
        rawPaths = [];
      }
      const helperPaths = rawPaths.helpers ? clonePaths(rawPaths.helpers) : null;
      const maskPolygons = rawPaths.maskPolygons ? clonePaths(rawPaths.maskPolygons) : null;
      // Editor glyph cells (M1 seam): text algorithm sidecar of layout cells as
      // display-space quads. Carried through the SAME transform() as the paths so
      // they land in WORLD space; recomputed every generate(), never serialized.
      const glyphsSidecar = Array.isArray(rawPaths.glyphs) ? rawPaths.glyphs : null;
      // Area-type frame (text algorithm sidecar): four corner points in display
      // space, carried through the SAME transform() as the paths so the rectangle
      // lands in WORLD space. Recomputed every generate(), never serialized.
      const frameSidecar = Array.isArray(rawPaths.textFrame) ? rawPaths.textFrame : null;
      // Area-type overset flag (transient, never serialized): true when the laid
      // text is taller than the frame, so the renderer draws the red "+" out port.
      const oversetSidecar = rawPaths.textOverset === true;
      // For shape layers the rebuild already baked smoothing/simplify into anchors;
      // zero the render-time pass so we don't double-apply on the resampled polyline.
      const isShape = usesManualSourceGeometry(layer);
      // rasterPlane's height-field blur moved to its own `mapBlur` param, so the
      // universal `smoothing` is free to apply to its projected wire output like
      // every other algorithm.
      const smooth = isShape ? 0 : Math.max(0, Math.min(1, p.smoothing ?? 0));
      const simplify = isShape ? 0 : Math.max(0, Math.min(1, p.simplify ?? 0));

      // The universal curve fit. Replaces GeometryUtils.smoothPath, which was a
      // destructive Laplacian pass: it MOVED the algorithm's sample points toward
      // their neighbours' midpoint — degrading the geometry, irreversibly, every
      // regenerate — and produced no beziers at all. What actually curved a 2D
      // layer was the renderer's draw-time midpoint-quadratic, which is not a fit
      // either: it re-anchors the path onto edge MIDPOINTS and uses the samples as
      // control points, so the drawn curve never passed through the algorithm's own
      // geometry, and the canvas and the exporter each re-derived it independently.
      //
      // Now the fit happens ONCE, here, and is carried as real bezier anchors on
      // meta. Every downstream consumer — canvas, SVG export, export preview,
      // masking, the edit verbs — reads those same anchors, so they can no longer
      // disagree about what the curve is. Sample points are never moved.
      //
      // Shape layers are excluded: applyShapeAnchorRebuild (above) already bakes
      // smoothing/simplify into their editable anchors, and double-fitting would
      // fight it. Paths that have declared their point array final (meta.straight
      // for true line segments, meta.baked for already-flattened display geometry)
      // are refused by applyCurveFit itself, which also keeps the cost off the
      // thousands of 2-point spans the 3D algorithms emit.
      // Smoothing is corner ROUNDING: the same fillet
      // mechanism as the toolbar's progressive Smooth slider and the one-shot
      // Object ▸ Smooth… verb — GeometryUtils.roundCornerAnchors: a tight,
      // faithful re-trace plus corner fillets that grow with the slider. It
      // replaces the old smoothing-ramped loose fit, which "smoothed" by
      // RESHAPING — it widened the fit tolerance and raised the corner
      // threshold with the slider, so geometry drifted and thinned instead of
      // its sharp edges rounding. Reduction stays Simplify's verb (it widens
      // the rounding fit's tolerance, never the fillet radius).
      const roundOpts = isShape || !(smooth > 0)
        ? null
        : {
          t: smooth,
          simplify,
          ...(fastPreview ? { fastPreview: true } : {}),
        };
      const curveOpts = isShape || roundOpts || p.curves !== true
        ? null
        : {
          curves: true,
          smoothing: 0,
          // Simplify is absorbed into the fit tolerance rather than run as a
          // separate decimation pass: on a fitted path the anchors ARE the
          // compact representation, and the later polyline simplify step skips
          // anchored paths precisely so it cannot strip them.
          simplify,
          // During a drag the preview may fit LOOSELY — fewer anchors, cheaper
          // fit. This must never pin an absolute tolerance: the committed fit
          // already reaches ~0.024 of the diagonal at high Smoothing/Simplify, so
          // a fixed 0.006 made the drag preview four times TIGHTER than the
          // geometry it was previewing — slower, and visibly different on
          // mouse-up. Scale the real tolerance up instead.
          ...(fastPreview ? { fastPreview: true } : {}),
        };
      const fitCurve = (path) => {
        if (roundOpts) return applyCornerRounding(path, roundOpts);
        return curveOpts ? applyCurveFit(path, curveOpts) : path;
      };

      const origin = computeGeometryOrigin(rawPaths, width, height);
      layer.origin = origin;

      const { transform, transformMeta } = buildParamPostTransform(p, origin);

      const transformed = rawPaths.map((path) => {
        if (!Array.isArray(path)) return path;
        const transformed = path.map((pt) => transform(pt));
        if (path.meta) transformed.meta = transformMeta(path.meta);
        return fitCurve(transformed);
      });
      if (layer.type === 'spiral' && p.close && Array.isArray(transformed[0]) && transformed[0].length > 6) {
        const path = transformed[0];
        const resolveFeather = (val) => {
          const featherVal = Math.max(0, val ?? 0);
          if (featherVal <= 1) return featherVal * 20;
          return featherVal;
        };
        const featherMm = resolveFeather(p.closeFeather);
        const buildConnection = (fromIndex, excludeCount) => {
          const from = path[fromIndex];
          if (!from) return null;
          const fromDir = (() => {
            const nextIdx = fromIndex === 0 ? 1 : fromIndex - 1;
            const next = path[nextIdx] || from;
            const dx = fromIndex === 0 ? next.x - from.x : from.x - next.x;
            const dy = fromIndex === 0 ? next.y - from.y : from.y - next.y;
            const len = Math.hypot(dx, dy) || 1;
            return { x: dx / len, y: dy / len };
          })();
          let best = null;
          for (let i = 0; i < path.length - 1; i++) {
            if (fromIndex === 0 && i < excludeCount) continue;
            if (fromIndex === path.length - 1 && i > path.length - 2 - excludeCount) continue;
            const a = path[i];
            const b = path[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const denom = dx * dx + dy * dy || 1;
            const t = Math.max(0, Math.min(1, ((from.x - a.x) * dx + (from.y - a.y) * dy) / denom));
            const cx = a.x + dx * t;
            const cy = a.y + dy * t;
            const dist = Math.hypot(from.x - cx, from.y - cy);
            if (!best || dist < best.dist) {
              const segLen = Math.hypot(dx, dy) || 1;
              best = {
                x: cx,
                y: cy,
                dist,
                dir: { x: dx / segLen, y: dy / segLen },
              };
            }
          }
          if (!best) return null;
          const dist = best.dist || 1;
          const feather = Math.min(dist * 0.45, featherMm || dist * 0.2);
          const c1 = {
            x: from.x + fromDir.x * feather,
            y: from.y + fromDir.y * feather,
          };
          const c2 = {
            x: best.x - best.dir.x * feather,
            y: best.y - best.dir.y * feather,
          };
          const steps = Math.max(8, Math.floor(dist / 3));
          const curve = [];
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const u = 1 - t;
            const x =
              u * u * u * from.x +
              3 * u * u * t * c1.x +
              3 * u * t * t * c2.x +
              t * t * t * best.x;
            const y =
              u * u * u * from.y +
              3 * u * u * t * c1.y +
              3 * u * t * t * c2.y +
              t * t * t * best.y;
            curve.push({ x, y });
          }
          // Already a densely-sampled cubic — this point array IS the curve.
          // Re-fitting it would be fitting a curve to a curve.
          curve.meta = { baked: true };
          return curve;
        };
        const skip = Math.max(4, Math.floor(path.length * 0.02));
        const endConnect = buildConnection(path.length - 1, skip);
        const startConnect = buildConnection(0, skip);
        if (endConnect) transformed.push(endConnect);
        if (startConnect) transformed.push(startConnect);
      }
      const helperTransformed = helperPaths
        ? helperPaths.map((path) => {
            if (!Array.isArray(path)) return path;
            const transformed = path.map((pt) => transform(pt));
            if (path.meta) transformed.meta = transformMeta(path.meta);
            return fitCurve(transformed);
          })
        : [];
      const transformedMaskPolygons = maskPolygons
        ? maskPolygons.map((polygon) => {
            if (!Array.isArray(polygon)) return polygon;
            const transformedPolygon = polygon.map((pt) => transform(pt));
            if (polygon.meta) transformedPolygon.meta = JSON.parse(JSON.stringify(polygon.meta));
            return transformedPolygon;
          })
        : [];
      const transformedGlyphs = glyphsSidecar
        ? glyphsSidecar.map((g) => ({
            sourceIndex: g.sourceIndex,
            lineIndex: g.lineIndex,
            isSpace: g.isSpace === true,
            quad: Array.isArray(g.quad) ? g.quad.map((pt) => transform(pt)) : [],
          }))
        : [];
      // `preCounts` is set for shape layers, whose sourcePaths applyShapeAnchorRebuild
      // has already rewritten in place — measuring them here would count the
      // simplified result on BOTH sides of the arrow, which is why an expanded
      // spiral reduced to six chords reported "Points 6 -> 6".
      const rawCounts = preCounts || countLayerGeometry(transformed);
      let finalPaths = transformed;
      if (simplify > 0) {
        const tol = simplify * Math.max(dW, dH) * 0.01;
        const useCurves = Boolean(p.curves);
        finalPaths = transformed.map((path) => {
          if (!Array.isArray(path)) return path;
          if (path.meta && path.meta.kind === 'circle') return path;
          // Native-cubic outlines (text glyphs, morph rings, curve shapes) carry
          // the TRUE curve in meta.anchors; the point array is only a flattened
          // cache. Both simplifiers call stripCurveMeta, which drops those
          // handles — degrading a mathematically-smooth curve into the faceted
          // polyline it was cached as. The handle list is already the compact
          // representation, so there is nothing to win here. The export-side
          // `linesimplify` step (simplifyPaths, below) has always guarded this;
          // the display pass did not, so any curved layer lost its curves the
          // moment the Simplify slider left zero.
          if (path.meta && Array.isArray(path.meta.anchors)
            && path.meta.anchors.some((a) => a && (a.in || a.out))) return path;
          return useCurves ? simplifyPathVisvalingam(path, tol) : simplifyPath(path, tol);
        });
      }
      const simplifiedCounts = countLayerGeometry(finalPaths);
      layer.stats = {
        rawLines: rawCounts.lines,
        rawPoints: rawCounts.points,
        simplifiedLines: simplifiedCounts.lines,
        simplifiedPoints: simplifiedCounts.points,
      };
      layer.paths = finalPaths;
      // Provenance: a fastPreview/DRAFT frame emits cheaper geometry — region
      // mappers (spiral/contour/stipple) fall back to a screen-space hatch and
      // scene3d shadows skip their booleans — for live-drag responsiveness.
      // Record it so consumers that bake `layer.paths` into new geometry (the
      // layers panel's expand/flatten) can force a full-quality regenerate
      // rather than freezing the draft cache into their output.
      layer._pathsFromDraft = fastPreview;
      layer.helperPaths = helperTransformed;
      layer.maskPolygons = transformedMaskPolygons;
      layer.glyphs = transformedGlyphs;
      layer.textFrame = frameSidecar ? frameSidecar.map((pt) => transform(pt)) : null;
      layer.textOverset = oversetSidecar;
      this.computeAllDisplayGeometry();
    }

    // Stroke division config normalizer — mirrors ensureLayerOptimization.
    // Back-fills SETTINGS.divisionDefaults on layers that predate the field
    // (legacy .vectura payloads) and sanitizes via StrokeDivide. Tolerates the
    // StrokeDivide script being absent (returns the bag un-sanitized).
    ensureLayerDivisions(layer) {
      if (!layer) return null;
      if (!layer.divisions || typeof layer.divisions !== 'object') {
        layer.divisions = SETTINGS.divisionDefaults
          ? clone(SETTINGS.divisionDefaults)
          : { enabled: false, phaseMm: 0, classes: [] };
      }
      const StrokeDivide = window.Vectura?.StrokeDivide;
      if (StrokeDivide?.sanitizeDivisions) {
        const sanitized = StrokeDivide.sanitizeDivisions(layer.divisions);
        layer.divisions.enabled = sanitized.enabled;
        layer.divisions.phaseMm = sanitized.phaseMm;
        // Deferred grammar (Phase 4A Inc-3) — accepted + defaulted in LOCKSTEP
        // with StrokeDivide.sanitizeDivisions. Defaults are a no-op ('cycle',
        // 'fixed', seed 0, per-class weight 1) so a legacy bag is unchanged.
        layer.divisions.penMode = sanitized.penMode;
        layer.divisions.phaseMode = sanitized.phaseMode;
        layer.divisions.seed = sanitized.seed;
        layer.divisions.classes = sanitized.classes;
      }
      return layer.divisions;
    }

    ensureLayerOptimization(layer) {
      if (!layer) return null;
      if (!layer.optimization) {
        const base = SETTINGS.optimizationDefaults ? clone(SETTINGS.optimizationDefaults) : { bypassAll: false, steps: [] };
        layer.optimization = base;
      }
      if (!Array.isArray(layer.optimization.steps)) layer.optimization.steps = [];
      const defaults = SETTINGS.optimizationDefaults ? clone(SETTINGS.optimizationDefaults) : { bypassAll: false, steps: [] };
      const defaultSteps = Array.isArray(defaults.steps) ? defaults.steps : [];
      const defaultMap = new Map(defaultSteps.map((step) => [step.id, step]));
      const normalized = layer.optimization.steps.map((step) => ({
        ...(defaultMap.get(step.id) || {}),
        ...step,
      }));
      defaultSteps.forEach((step) => {
        if (!normalized.some((s) => s.id === step.id)) {
          normalized.push(clone(step));
        }
      });
      layer.optimization.steps = normalized;
      if (layer.optimization.bypassAll === undefined) layer.optimization.bypassAll = defaults.bypassAll ?? false;
      return layer.optimization;
    }

    optimizeLayers(layers, options = {}) {
      const targetLayers = (layers || this.layers).filter((layer) => layer && !layer.isGroup);
      if (!targetLayers.length) return new Map();
      const includePlotterOptimize = Boolean(options.includePlotterOptimize);
      const runPipeline = (layersToProcess, config) => {
        if (!config) return new Map();
        const steps = Array.isArray(config.steps) ? config.steps : [];
        const shouldRun = !config.bypassAll && steps.some((step) => step && step.enabled && !step.bypass);
        if (!shouldRun) {
          layersToProcess.forEach((layer) => {
            layer.optimizedPaths = null;
            layer.optimizedStats = null;
          });
          return new Map();
        }

        const working = new Map();
        layersToProcess.forEach((layer) => {
          const sourcePaths = this.getAncestorModifiers(layer).length
            ? Array.isArray(layer.effectivePaths) && layer.effectivePaths.length
              ? layer.effectivePaths
              : layer.paths || []
            : layer.paths || [];
          working.set(
            layer.id,
            clonePaths(sourcePaths)
          );
        });

      const simplifyPaths = (paths, step) => {
        const tol = Math.max(0, step.tolerance ?? 0);
        if (!tol) return paths;
        const useCurves = step.mode === 'curve';
        return paths.map((path) => {
          if (!Array.isArray(path)) return path;
          if (path.meta && path.meta.kind === 'circle') return path;
          // Native-cubic outlines (text glyphs, morph rings, curve shapes) carry
          // the TRUE curve in meta.anchors; the point array is only a flattened
          // cache. Visvalingam / Douglas–Peucker both call stripCurveMeta, which
          // drops those handles — degrading a mathematically-smooth curve to a
          // faceted polyline that the draw-order overlay (and the base reveal)
          // then trace as lineTo segments. Keep such paths intact so their
          // anchors survive into optimizedPaths; the handle list is already the
          // compact representation.
          if (path.meta && Array.isArray(path.meta.anchors)
            && path.meta.anchors.some((a) => a && (a.in || a.out))) return path;
          const closed = isClosedPath(path);
          const next = useCurves ? simplifyPathVisvalingam(path, tol) : simplifyPath(path, tol);
          return closePathIfNeeded(next, closed);
        });
      };

      const filterPaths = (paths, step) => {
        const minLen = Math.max(0, step.minLength ?? 0);
        const maxLen = step.maxLength > 0 ? step.maxLength : Infinity;
        const tinyThreshold = step.removeTiny ? Math.max(minLen, 0.5) : minLen;
        return paths.filter((path) => {
          const len = pathLength(path);
          if (len < tinyThreshold) return false;
          if (len > maxLen) return false;
          return true;
        });
      };

      const multipassPaths = (paths, step) => {
        const passes = Math.max(1, Math.round(step.passes ?? 1));
        if (passes <= 1) return paths;
        const offset = Math.max(0, step.offset ?? 0);
        const jitter = Math.max(0, step.jitter ?? 0);
        const seed = step.seed ?? 0;
        const passRng = new SeededRNG(seed);
        const out = [];
        paths.forEach((path) => {
          out.push(path);
          for (let i = 1; i < passes; i++) {
            const angle = (i / passes) * Math.PI * 2;
            let dx = Math.cos(angle) * offset;
            let dy = Math.sin(angle) * offset;
            if (jitter > 0) {
              dx += (passRng.nextFloat() * 2 - 1) * jitter;
              dy += (passRng.nextFloat() * 2 - 1) * jitter;
            }
            out.push(offsetPath(path, dx, dy));
          }
        });
        return out;
      };

      const sortItems = (items, step, origin) => {
        if (!items.length) return items;
        const method = step.method || 'nearest';
        const direction = step.direction || 'none';
        const grouping = step.grouping || 'layer';
        const finalizeSorted = (sortedItems) => {
          sortedItems.forEach((item, index) => {
            if (!Array.isArray(item.path)) return;
            item.path.meta = {
              ...(item.path.meta || {}),
              lineSortOrder: index,
              lineSortGrouping: grouping,
            };
          });
          return sortedItems;
        };
        // "As drawn" preserves the algorithm's natural generation order — no
        // travel-minimizing reorder, no path reversal. It still stamps a
        // sequential lineSortOrder so the print-order overlay and the draw-order
        // reveal track the same order the art was authored in.
        if (method === 'asdrawn') return finalizeSorted(items.slice());
        const getKey = (item) => {
          const center = pathCentroid(item.path);
          if (direction === 'horizontal') return center.x;
          if (direction === 'vertical') return center.y;
          if (direction === 'radial') {
            return Math.atan2(center.y - origin.y, center.x - origin.x);
          }
          return 0;
        };
        const getNearestCandidate = (candidates, current, allowReverse) => {
          let bestIdx = 0;
          let bestDist = Infinity;
          let bestReverse = false;
          for (let i = 0; i < candidates.length; i++) {
            const item = candidates[i];
            if (!current) {
              bestIdx = i;
              bestDist = 0;
              bestReverse = false;
              break;
            }
            const { start, end } = pathEndpoints(item.path);
            const dx = start.x - current.x;
            const dy = start.y - current.y;
            let dist = dx * dx + dy * dy;
            let reverse = false;
            if (allowReverse) {
              const dx2 = end.x - current.x;
              const dy2 = end.y - current.y;
              const dist2 = dx2 * dx2 + dy2 * dy2;
              if (dist2 < dist) {
                dist = dist2;
                reverse = true;
              }
            }
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
              bestReverse = reverse;
            }
          }
          return { index: bestIdx, reverse: bestReverse };
        };
        const buildDirectionalBuckets = (directionalItems) => {
          if (!directionalItems.length) return [];
          const sortedByAxis = directionalItems
            .map((item, index) => ({ item, index, axisKey: getKey(item) }))
            .sort((a, b) => {
              if (a.axisKey !== b.axisKey) return a.axisKey - b.axisKey;
              return a.index - b.index;
            });
          const positiveGaps = [];
          for (let i = 1; i < sortedByAxis.length; i++) {
            const gap = sortedByAxis[i].axisKey - sortedByAxis[i - 1].axisKey;
            if (gap > 1e-6) positiveGaps.push(gap);
          }
          const bandSize = positiveGaps.length
            ? positiveGaps[Math.floor(positiveGaps.length / 2)] * 0.5
            : 1e-6;
          const buckets = [];
          let currentBucket = [];
          let bucketStart = sortedByAxis[0].axisKey;
          sortedByAxis.forEach((entry) => {
            if (!currentBucket.length) {
              currentBucket.push(entry.item);
              bucketStart = entry.axisKey;
              return;
            }
            if (entry.axisKey - bucketStart <= bandSize) {
              currentBucket.push(entry.item);
              return;
            }
            buckets.push(currentBucket);
            currentBucket = [entry.item];
            bucketStart = entry.axisKey;
          });
          if (currentBucket.length) buckets.push(currentBucket);
          return buckets;
        };
        if (method === 'angle' || direction === 'radial') {
          return finalizeSorted(items.slice().sort((a, b) => getKey(a) - getKey(b)));
        }
        if (method === 'greedy' && direction !== 'none') {
          return finalizeSorted(items.slice().sort((a, b) => getKey(a) - getKey(b)));
        }
        const allowReverse = method === 'nearest';
        if (method === 'nearest' && (direction === 'horizontal' || direction === 'vertical')) {
          const sorted = [];
          let current = null;
          buildDirectionalBuckets(items).forEach((bucket) => {
            const remainingBucket = bucket.slice();
            while (remainingBucket.length) {
              const nextCandidate = getNearestCandidate(remainingBucket, current, allowReverse);
              const nextItem = remainingBucket.splice(nextCandidate.index, 1)[0];
              if (nextCandidate.reverse) nextItem.path = reversePath(nextItem.path);
              sorted.push(nextItem);
              current = pathEndpoints(nextItem.path).end;
            }
          });
          return finalizeSorted(sorted);
        }
        const remaining = items.slice();
        const sorted = [];
        let startIndex = 0;
        if (direction !== 'none') {
          let bestVal = Infinity;
          remaining.forEach((item, idx) => {
            const val = getKey(item);
            if (val < bestVal) {
              bestVal = val;
              startIndex = idx;
            }
          });
        }
        let currentItem = remaining.splice(startIndex, 1)[0];
        sorted.push(currentItem);
        let current = pathEndpoints(currentItem.path).end;
        while (remaining.length) {
          const nextCandidate = getNearestCandidate(remaining, current, allowReverse);
          const nextItem = remaining.splice(nextCandidate.index, 1)[0];
          if (nextCandidate.reverse) nextItem.path = reversePath(nextItem.path);
          sorted.push(nextItem);
          current = pathEndpoints(nextItem.path).end;
        }
        return finalizeSorted(sorted);
      };

      const applyLineSort = (map, step) => {
        const grouping = step.grouping || 'layer';
        const center = layersToProcess.reduce(
          (acc, layer) => {
            acc.x += layer.origin?.x ?? 0;
            acc.y += layer.origin?.y ?? 0;
            return acc;
          },
          { x: 0, y: 0 }
        );
        if (layersToProcess.length) {
          center.x /= layersToProcess.length;
          center.y /= layersToProcess.length;
        }
        if (grouping === 'combined') {
          const items = [];
          layersToProcess.forEach((layer) => {
            (map.get(layer.id) || []).forEach((path) => items.push({ layerId: layer.id, path }));
          });
          const sorted = sortItems(items, step, center);
          const nextMap = new Map(layersToProcess.map((layer) => [layer.id, []]));
          sorted.forEach((item) => {
            if (!nextMap.has(item.layerId)) nextMap.set(item.layerId, []);
            nextMap.get(item.layerId).push(item.path);
          });
          return nextMap;
        }
        if (grouping === 'pen') {
          // Effective-pen re-key (P0-B): division fragments (and auto-colorized
          // paths) carry their own meta.penId, so each PATH is bucketed by the
          // pen it will actually plot with — not its layer's pen.
          const penGroups = new Map();
          // Resolve each path's penId against the document pen SET the SAME way
          // the SVG export does (PenValidate.resolveEffectivePenId), so a
          // stale/unknown meta.penId buckets under the pen it will actually
          // plot with instead of a phantom group.
          const penSet = new Set((SETTINGS.pens || []).map((pn) => pn && pn.id));
          const resolvePen = window.Vectura.PenValidate.resolveEffectivePenId;
          layersToProcess.forEach((layer) => {
            (map.get(layer.id) || []).forEach((path) => {
              const penId = resolvePen(path && path.meta, layer.penId, penSet);
              if (!penGroups.has(penId)) penGroups.set(penId, []);
              penGroups.get(penId).push({ layerId: layer.id, path });
            });
          });
          const nextMap = new Map(layersToProcess.map((layer) => [layer.id, []]));
          penGroups.forEach((items) => {
            const sorted = sortItems(items, step, center);
            sorted.forEach((item) => {
              if (!nextMap.has(item.layerId)) nextMap.set(item.layerId, []);
              nextMap.get(item.layerId).push(item.path);
            });
          });
          return nextMap;
        }
        const nextMap = new Map();
        layersToProcess.forEach((layer) => {
          const items = (map.get(layer.id) || []).map((path) => ({ layerId: layer.id, path }));
          const sorted = sortItems(items, step, center);
          nextMap.set(
            layer.id,
            sorted.map((item) => item.path)
          );
        });
        return nextMap;
      };

      let current = working;
      steps.forEach((step) => {
        if (!step || !step.enabled || step.bypass) return;
        switch (step.id) {
          case 'linesimplify': {
            const next = new Map();
            current.forEach((paths, id) => {
              next.set(id, simplifyPaths(paths, step));
            });
            current = next;
            break;
          }
          case 'filter': {
            const next = new Map();
            current.forEach((paths, id) => {
              next.set(id, filterPaths(paths, step));
            });
            current = next;
            break;
          }
          case 'multipass': {
            const next = new Map();
            current.forEach((paths, id) => {
              next.set(id, multipassPaths(paths, step));
            });
            current = next;
            break;
          }
          case 'linesort': {
            current = applyLineSort(current, step);
            break;
          }
          default:
            break;
        }
      });

      if (includePlotterOptimize) {
        const optimize = Math.max(0, SETTINGS.plotterOptimize ?? 0);
        const tol = optimize > 0 ? Math.max(0.001, optimize) : 0;
        if (tol > 0) {
          const quant = (v) => Math.round(v / tol) * tol;
          // Direction-agnostic hash: linesort reverses paths to minimize pen
          // travel, so the same physical line can come out of optimization
          // forward in one layer and reversed in another. Hashing both
          // directions and picking the lexicographically smaller string
          // collapses those into a single key.
          const pathKey = (path) => {
            if (path && path.meta && path.meta.kind === 'circle') {
              const cx = path.meta.cx ?? path.meta.x ?? 0;
              const cy = path.meta.cy ?? path.meta.y ?? 0;
              const r = path.meta.r ?? path.meta.rx ?? 0;
              return `c:${quant(cx)},${quant(cy)},${quant(r)}`;
            }
            if (!Array.isArray(path)) return '';
            const tokens = path.map((pt) => `${quant(pt.x)},${quant(pt.y)}`);
            const fwd = tokens.join('|');
            const rev = tokens.slice().reverse().join('|');
            return fwd <= rev ? fwd : rev;
          };
          // Effective-pen re-key (P0-B) + gap-aware division dedup (Fix-A): each
          // path dedupes in the bucket of the pen it actually plots with. The
          // shared two-pass StrokeDivide deduper keys division fragments at THIS
          // pass's own tolerance (same namespace as pathKey) so a coincident
          // undivided duplicate of a gapless single-pen retrace inks once
          // (order-independent), while a gapped/multi-pen division never
          // suppresses a coincident solid (the solid inks the gaps). All three
          // consumers (here, computeStats, SVG export) drive the same deduper so
          // their surviving sets agree.
          const SD = window.Vectura?.StrokeDivide;
          const deduper = SD ? SD.createPlotDeduper(quant, pathKey) : null;
          // Resolve penId against the pen SET the same way export/computeStats
          // do, so a stale meta.penId dedupes in the bucket it actually plots in.
          const penSet = new Set((SETTINGS.pens || []).map((pn) => pn && pn.id));
          const penOf = (layer, path) => window.Vectura.PenValidate.resolveEffectivePenId(path && path.meta, layer.penId, penSet);
          if (deduper) {
            layersToProcess.forEach((layer) => {
              (current.get(layer.id) || []).forEach((path) => {
                deduper.claim(penOf(layer, path), path && path.meta);
              });
            });
          }
          layersToProcess.forEach((layer) => {
            const deduped = [];
            (current.get(layer.id) || []).forEach((path) => {
              if (deduper && !deduper.keep(penOf(layer, path), layer.id, path && path.meta, path)) return;
              deduped.push(path);
            });
            current.set(layer.id, deduped);
          });
        }
      }

      layersToProcess.forEach((layer) => {
        const next = current.get(layer.id) || [];
        layer.optimizedPaths = next;
        layer.optimizedStats = countPathPoints(next);
      });
      return current;
      };

      if (options.config) {
        const result = runPipeline(targetLayers, options.config);
        // Division is structurally downstream of optimization: recut here so
        // direct optimizeLayers callers (optimization panel, export preview)
        // never serve fragments cut from stale optimizedPaths.
        this.applyStrokeDivision(targetLayers);
        return result;
      }

      const combined = new Map();
      targetLayers.forEach((layer) => {
        const config = this.ensureLayerOptimization(layer);
        const map = runPipeline([layer], config);
        map.forEach((paths, id) => {
          combined.set(id, paths);
        });
      });
      this.applyStrokeDivision(targetLayers);
      return combined;
    }

    getFormula(layerId) {
      const l = this.layers.find((x) => x.id === layerId);
      if (!l) return 'Select a layer...';
      if (isModifierLayer(l)) {
        if (l.modifier?.type === 'morph') {
          const childCount = this.getLayerDescendants(l.id).filter((c) => !c.isGroup && c.visible !== false).length;
          const steps = l.modifier?.steps ?? 6;
          return `Morph Modifier · ${childCount} child${childCount === 1 ? '' : 'ren'} · ${steps} steps per pair · graduated blend in layer order`;
        }
        const mirrorCount = Array.isArray(l.modifier?.mirrors) ? l.modifier.mirrors.length : 0;
        return `Mirror Modifier · ${mirrorCount} axis${mirrorCount === 1 ? '' : 'es'} · child geometry is mirrored top-to-bottom by stack order`;
      }
      const algo = Algorithms[l.type];
      return algo && algo.formula ? algo.formula(l.params) : 'Procedural Vector Generation';
    }

    computeStats(layers, options = {}) {
      const target = (layers || []).filter((l) => l && l.visible);
      const useOptimized = Boolean(options.useOptimized);
      const includePlotterOptimize = options.includePlotterOptimize !== false;
      let dist = 0;
      let lines = 0;
      let points = 0;
      const optimize = includePlotterOptimize ? Math.max(0, SETTINGS.plotterOptimize ?? 0) : 0;
      const tol = optimize > 0 ? Math.max(0.001, optimize) : 0;
      const quant = (v) => (tol ? Math.round(v / tol) * tol : v);
      // Direction-agnostic hash — see runPipeline.pathKey for rationale.
      const pathKey = (path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const cx = path.meta.cx ?? path.meta.x ?? 0;
          const cy = path.meta.cy ?? path.meta.y ?? 0;
          const r = path.meta.r ?? path.meta.rx ?? 0;
          return `c:${quant(cx)},${quant(cy)},${quant(r)}`;
        }
        if (!Array.isArray(path)) return '';
        const tokens = path.map((pt) => `${quant(pt.x)},${quant(pt.y)}`);
        const fwd = tokens.join('|');
        const rev = tokens.slice().reverse().join('|');
        return fwd <= rev ? fwd : rev;
      };
      // Gap-aware division dedup (Fix-A): the SAME shared two-pass deduper the
      // engine plotter-optimize pass and SVG export use, so reported stats match
      // the emitted SVG (order-independent). Only active when plotter-optimize
      // is on (optimize > 0).
      const SD = window.Vectura?.StrokeDivide;
      const deduper = (optimize > 0 && SD) ? SD.createPlotDeduper(quant, pathKey) : null;
      // Resolve penId against the pen SET the same way the SVG export does, so
      // reported stats never count a path under a phantom pen export coerces away.
      const penSet = new Set((SETTINGS.pens || []).map((pn) => pn && pn.id));
      const penOf = (l, p) => window.Vectura.PenValidate.resolveEffectivePenId(p && p.meta, l.penId, penSet);
      const sources = target.map((l) => this.getRenderablePaths(l, {
        useOptimized, preDivision: Boolean(options.preDivision),
      }) || []);
      if (deduper) {
        target.forEach((l, li) => sources[li].forEach((p) => deduper.claim(penOf(l, p), p && p.meta)));
      }
      // Plot-physics readout (Phase 4A Inc-2, READ-ONLY): when requested, retain
      // the SURVIVING paths — grouped by the same resolved effective pen the
      // export/dedup path uses — so we can measure lifts/travel/time on the real
      // plot order without a second, divergent stats pass.
      const wantPhysics = Boolean(options.physics);
      const survivors = wantPhysics ? [] : null;
      target.forEach((l, li) => {
        const visiblePaths = [];
        sources[li].forEach((p) => {
          if (deduper && !deduper.keep(penOf(l, p), l.id, p && p.meta, p)) return;
          visiblePaths.push(p);
          dist += pathLength(p);
          if (survivors) survivors.push({ penId: penOf(l, p), path: p });
        });
        const count = countPathPoints(visiblePaths);
        lines += count.lines;
        points += count.points;
      });
      const timeSec = dist / 1000 / (SETTINGS.speedDown / 1000);
      const m = Math.floor(timeSec / 60);
      const s = Math.floor(timeSec % 60);
      const result = { distance: Math.round(dist / 1000) + 'm', time: `${m}:${s.toString().padStart(2, '0')}`, lines, points };
      if (survivors) {
        const phys = this.computePlotPhysicsFromSurvivors(survivors);
        result.perPen = phys.perPen;
        result.physics = phys.totals;
      }
      return result;
    }

    // Plot-physics reducer (Phase 4A Inc-2, K-05). Takes the surviving
    // { penId, path } records computeStats already resolved + deduped and
    // measures, per effective pen: pen lifts (pen-down stroke count), pen-down
    // draw length, pen-up travel (end→start gap between consecutive strokes in
    // plot order) and an estimated time = draw/speedDown + travel/speedUp +
    // lifts·penLiftTime from the machine feed rates. The K-05 guard counts
    // sub-resolution moves: drawn strokes shorter than minSegmentMm and pen-up
    // gaps shorter than minGapMm. Order within a pen mirrors the SVG export:
    // when line sort grouped by pen/combined, paths are re-ordered by
    // meta.lineSortOrder so the travel number matches the emitted plot.
    // READ-ONLY — it never mutates geometry.
    computePlotPhysicsFromSurvivors(survivors) {
      const drawSpeed = Math.max(1e-6, Number(SETTINGS.speedDown) || 250);
      const travelSpeed = Math.max(1e-6, Number(SETTINGS.speedUp) || 300);
      const liftTime = Math.max(0, Number.isFinite(SETTINGS.penLiftTime) ? SETTINGS.penLiftTime : 0.1);
      const minSeg = Math.max(0, Number.isFinite(SETTINGS.minSegmentMm) ? SETTINGS.minSegmentMm : 0.1);
      const minGap = Math.max(0, Number.isFinite(SETTINGS.minGapMm) ? SETTINGS.minGapMm : 0.1);

      const penOrder = [];
      const groups = new Map();
      (survivors || []).forEach((rec) => {
        if (!groups.has(rec.penId)) {
          groups.set(rec.penId, []);
          penOrder.push(rec.penId);
        }
        groups.get(rec.penId).push(rec.path);
      });

      const penMeta = new Map((SETTINGS.pens || []).map((pn) => [pn && pn.id, pn]));
      const perPen = [];
      const totals = { lifts: 0, draw: 0, travel: 0, total: 0, timeSec: 0, shortSegments: 0, shortGaps: 0 };

      penOrder.forEach((penId) => {
        let paths = groups.get(penId) || [];
        // Match the export's per-pen interleave: only when line sort grouped by
        // pen/combined does the plot order come from meta.lineSortOrder.
        const interleave = paths.some((p) => p && p.meta && (p.meta.lineSortGrouping === 'pen' || p.meta.lineSortGrouping === 'combined'));
        if (interleave) {
          paths = paths.slice().sort((a, b) => {
            const ao = Number.isFinite(a && a.meta && a.meta.lineSortOrder) ? a.meta.lineSortOrder : Number.MAX_SAFE_INTEGER;
            const bo = Number.isFinite(b && b.meta && b.meta.lineSortOrder) ? b.meta.lineSortOrder : Number.MAX_SAFE_INTEGER;
            return ao - bo;
          });
        }
        let draw = 0;
        let travel = 0;
        let shortSegments = 0;
        let shortGaps = 0;
        let prevEnd = null;
        paths.forEach((p) => {
          const len = pathLength(p);
          draw += len;
          if (len > 0 && len < minSeg) shortSegments += 1;
          const ep = pathEndpoints(p);
          if (prevEnd) {
            const gap = Math.hypot(ep.start.x - prevEnd.x, ep.start.y - prevEnd.y);
            travel += gap;
            if (gap > 0 && gap < minGap) shortGaps += 1;
          }
          prevEnd = ep.end;
        });
        const lifts = paths.length;
        const timeSec = draw / drawSpeed + travel / travelSpeed + lifts * liftTime;
        const pen = penMeta.get(penId);
        perPen.push({
          penId,
          name: (pen && pen.name) || (penId === 'default' ? 'Default' : penId),
          color: (pen && pen.color) || '#888888',
          lifts,
          draw,
          travel,
          total: draw + travel,
          timeSec,
          shortSegments,
          shortGaps,
        });
        totals.lifts += lifts;
        totals.draw += draw;
        totals.travel += travel;
        totals.total += draw + travel;
        totals.timeSec += timeSec;
        totals.shortSegments += shortSegments;
        totals.shortGaps += shortGaps;
      });

      return { perPen, totals };
    }

    getStats(options = {}) {
      const layers = options.layers || this.layers;
      return this.computeStats(layers, options);
    }
  }

  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.VectorEngine = VectorEngine;
  // AUD-02: the current `.vectura` engine-state schema version, exposed so the
  // file-open UI can warn when a file comes from a newer build than this one.
  window.Vectura.VECTURA_FORMAT_VERSION = VECTURA_FORMAT_VERSION;
})();
