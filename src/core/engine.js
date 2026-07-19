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
  const VECTURA_FORMAT_VERSION = 1;

  // Keyed by SOURCE version: STATE_MIGRATIONS[n] upgrades a version-n payload
  // to version n+1. importState walks the chain up to VECTURA_FORMAT_VERSION.
  const STATE_MIGRATIONS = {
    0: (state) => state, // 0 → 1: the field was added; the payload shape is unchanged.
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
    return sanitizeParamTree(params, defaults, { key: null });
  };

  // Deep-clone params for history/serialization, but SHARE the (immutable,
  // potentially large — up to ~12k faces) imported STL mesh by reference rather
  // than JSON-deep-copying it into every undo snapshot. `importedMesh` is only
  // ever replaced wholesale on re-import, never mutated in place, so sharing the
  // reference is safe and avoids hundreds of KB of JSON churn per interaction.
  // JSON.stringify on save still follows the reference, so .vectura round-trips.
  const cloneLayerParams = (params) => {
    if (!params || typeof params !== 'object') return {};
    const mesh = params.importedMesh;
    if (!mesh || typeof mesh !== 'object') return JSON.parse(JSON.stringify(params));
    const rest = JSON.parse(JSON.stringify({ ...params, importedMesh: null }));
    rest.importedMesh = mesh;
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
      layer.params = JSON.parse(JSON.stringify(source.params));
      layer.paramStates = JSON.parse(JSON.stringify(source.paramStates || {}));
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
      if (layer.mask?.enabled && layer.mask?.hideLayer) return [];
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
      this.optimizeLayers(this.layers);
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
      if (layer.isGroup) return;
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
      // Smoothing is corner ROUNDING (Illustrator parity): the same fillet
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
      layer.helperPaths = helperTransformed;
      layer.maskPolygons = transformedMaskPolygons;
      layer.glyphs = transformedGlyphs;
      layer.textFrame = frameSidecar ? frameSidecar.map((pt) => transform(pt)) : null;
      layer.textOverset = oversetSidecar;
      this.computeAllDisplayGeometry();
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
          const penGroups = new Map();
          layersToProcess.forEach((layer) => {
            const penId = layer.penId || 'default';
            if (!penGroups.has(penId)) penGroups.set(penId, []);
            (map.get(layer.id) || []).forEach((path) =>
              penGroups.get(penId).push({ layerId: layer.id, path })
            );
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
          const seenByPen = new Map();
          layersToProcess.forEach((layer) => {
            const penId = layer.penId || 'default';
            if (!seenByPen.has(penId)) seenByPen.set(penId, new Set());
            const seen = seenByPen.get(penId);
            const deduped = [];
            (current.get(layer.id) || []).forEach((path) => {
              const key = pathKey(path);
              if (key && seen.has(key)) return;
              if (key) seen.add(key);
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
        return runPipeline(targetLayers, options.config);
      }

      const combined = new Map();
      targetLayers.forEach((layer) => {
        const config = this.ensureLayerOptimization(layer);
        const map = runPipeline([layer], config);
        map.forEach((paths, id) => {
          combined.set(id, paths);
        });
      });
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
      const dedupe = optimize > 0 ? new Map() : null;
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
      target.forEach((l) => {
        const penId = l.penId || 'default';
        let seen = null;
        if (dedupe) {
          if (!dedupe.has(penId)) dedupe.set(penId, new Set());
          seen = dedupe.get(penId);
        }
        const sourcePaths = this.getRenderablePaths(l, { useOptimized });
        const visiblePaths = [];
        (sourcePaths || []).forEach((p) => {
          if (seen) {
            const key = pathKey(p);
            if (key && seen.has(key)) return;
            if (key) seen.add(key);
          }
          visiblePaths.push(p);
          dist += pathLength(p);
        });
        const count = countPathPoints(visiblePaths);
        lines += count.lines;
        points += count.points;
      });
      const timeSec = dist / 1000 / (SETTINGS.speedDown / 1000);
      const m = Math.floor(timeSec / 60);
      const s = Math.floor(timeSec % 60);
      return { distance: Math.round(dist / 1000) + 'm', time: `${m}:${s.toString().padStart(2, '0')}`, lines, points };
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
