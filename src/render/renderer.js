/**
 * Canvas renderer for vector paths.
 */
(() => {
  const { SETTINGS, Modifiers = {}, Masking = {}, UnitUtils = {}, UI_CONSTANTS = {} } = window.Vectura || {};
  const isModifierLayer = Modifiers.isModifierLayer || (() => false);
  const getMirrorAxis = Modifiers.getMirrorAxis || (() => null);
  const buildAxisFromAngle = Modifiers.buildAxisFromAngle || (() => null);
  const clipInfiniteAxisToBounds = Modifiers.clipInfiniteAxisToBounds || (() => null);
  const reflectPointAcrossAxis = Modifiers.reflectPointAcrossAxis || ((pt) => pt);
  const getLayerSilhouette = Masking.getLayerSilhouette || (() => []);
  const buildLayerMaskedPaths = Masking.buildLayerMaskedPaths || ((layer) => layer?.effectivePaths || layer?.paths || []);
  const applyMaskToPaths = Masking.applyMaskToPaths || ((paths) => paths || []);
  const getMaskingAncestors = Masking.getMaskingAncestors || (() => []);
  const normalizeDocumentUnits = UnitUtils.normalizeDocumentUnits || ((value) => (`${value || ''}`.trim().toLowerCase() === 'imperial' ? 'imperial' : 'metric'));
  const formatDocumentLength = UnitUtils.formatDocumentLength || ((valueMm, units, options = {}) => {
    const resolvedUnits = normalizeDocumentUnits(units);
    const precision = Number.isFinite(options.precision) ? options.precision : (resolvedUnits === 'imperial' ? 2 : 1);
    const unit = resolvedUnits === 'imperial' ? 'in' : 'mm';
    const value = resolvedUnits === 'imperial' ? Number(valueMm || 0) / 25.4 : Number(valueMm || 0);
    let text = Number.isFinite(value) ? value.toFixed(precision) : '0';
    if (options.trimTrailingZeros && text.includes('.')) text = text.replace(/\.?0+$/, '');
    return `${text}${options.spaceBeforeUnit ? ' ' : ''}${unit}`;
  });
  const TAU = Math.PI * 2;
  const ELLIPSE_KAPPA = 0.5522847498307936;
  // Live Corners drag readout in document units (source units are mm), e.g.
  // "R: 12.50 mm" / "R: 0.49 in" — matches the dialog instead of hardcoding px.
  const cornerRadiusLabel = (valueMm) =>
    `R: ${formatDocumentLength(valueMm, SETTINGS?.documentUnits, { precision: 2, spaceBeforeUnit: true })}`;
  const {
    SHAPE_CORNER_HANDLE_MIN = 8,
    MASK_PREVIEW_ALPHA = 0.2,
    ROTATE_ARROW_OFFSET = 9,
    ROTATE_TRIANGLE_LIFT = 9,
    ROTATE_TRIANGLE_HALF_WIDTH = 12.2,
    ROTATE_TRIANGLE_UNDERLAY_HALF_WIDTH = 15.6,
    ROTATE_TRIANGLE_TIP_LENGTH = 10.8,
    ROTATE_TRIANGLE_UNDERLAY_TIP_LENGTH = 13.8,
  } = UI_CONSTANTS;
  const makeShapeReticleCursor = (color = 'white') => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">`
      + `<g fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round">`
      + `<path d="M16 4.5v4M16 23.5v4M4.5 16h4M23.5 16h4"/>`
      + `</g>`
      + `<circle cx="16" cy="16" r="1.75" fill="${color}"/>`
      + `</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, crosshair`;
  };
  const { clamp } = window.Vectura.AlgorithmUtils;
  const ROTATION_3D_SPECS = {
    spiralizer: {
      yawParam: 'yaw',
      pitchParam: 'pitch',
      rollParam: 'roll',
      yawDefault: 0,
      pitchDefault: 30,
      rollDefault: 0,
      pitchMin: -90,
      pitchMax: 90,
    },
    polyhedron: {
      yawParam: 'rotate',
      pitchParam: 'tilt',
      rollParam: 'roll',
      yawDefault: -18,
      pitchDefault: 28,
      rollDefault: 0,
      pitchMin: 0,
      pitchMax: 89,
    },
    topoform: {
      yawParam: 'yaw',
      pitchParam: 'pitch',
      rollParam: 'roll',
      yawDefault: -28,
      pitchDefault: 34,
      rollDefault: 0,
      pitchMin: -90,
      pitchMax: 90,
    },
    rasterPlane: {
      yawParam: 'rotate',
      pitchParam: 'tilt',
      rollParam: 'roll',
      yawDefault: -45,
      pitchDefault: 60,
      rollDefault: 0,
      pitchMin: 0,
      pitchMax: 89,
    },
    terrain: {
      // Terrain is only 3D-rotatable in its 'free-3d' perspective mode; the
      // legacy vanishing-point modes have no yaw/pitch/roll, so the on-canvas
      // rotation helper is gated to free-3d via appliesIf.
      yawParam: 'yaw',
      pitchParam: 'pitch',
      rollParam: 'roll',
      yawDefault: -25,
      pitchDefault: 58,
      rollDefault: 0,
      pitchMin: -90,
      pitchMax: 90,
      appliesIf: (params) => (params && params.perspectiveMode) === 'free-3d',
    },
    scene3d: {
      // 3D Scene Studio (Phase 1C): the orbit gizmo routes through a NESTED
      // spec — scene3d keeps its rotation state in params.camera.{yaw,pitch,
      // roll} (CONTRACT A) or, when exactly one scene OBJECT is selected
      // (CONTRACT D), in that object's transform. Flat `layer.params[param]`
      // writes cannot reach either, so nested specs carry get/set accessors
      // and the gizmo plumbing takes a tiny `spec.nested` branch; flat specs
      // are untouched (byte-identical behavior).
      nested: true,
      yawDefault: -30,
      pitchDefault: -20,
      rollDefault: 0,
      pitchMin: -90,
      pitchMax: 90,
      get(layer, renderer) {
        const params = (layer && layer.params) || {};
        const sel = renderer && renderer.getSceneSelection ? renderer.getSceneSelection() : null;
        // Scene-tree Increment D — resolve the selected object through
        // _sceneObjectById (child-layer aware), not just inline params.objects.
        const obj = sel && sel.layerId === layer.id && sel.mode === 'object' && sel.objectIds.length === 1
          ? (renderer && renderer._sceneObjectById ? renderer._sceneObjectById(layer, sel.objectIds[0]) : null)
          : null;
        if (obj) {
          const t = obj.transform || {};
          return { target: 'object', yaw: finiteNumber(t.yaw, 0), pitch: finiteNumber(t.pitch, 0), roll: finiteNumber(t.roll, 0) };
        }
        const cam = params.camera || {};
        return {
          target: 'camera',
          yaw: finiteNumber(cam.yaw, -30),
          pitch: finiteNumber(cam.pitch, -20),
          roll: finiteNumber(cam.roll, 0),
        };
      },
      set(layer, renderer, next) {
        const params = (layer && layer.params) || {};
        const sel = renderer && renderer.getSceneSelection ? renderer.getSceneSelection() : null;
        // Scene-tree Increment D — write to the selected object's transform via
        // _sceneObjectById (child-layer aware), not just inline params.objects.
        const obj = sel && sel.layerId === layer.id && sel.mode === 'object' && sel.objectIds.length === 1
          ? (renderer && renderer._sceneObjectById ? renderer._sceneObjectById(layer, sel.objectIds[0]) : null)
          : null;
        if (obj) {
          const t = obj.transform || (obj.transform = {});
          if (next.yaw !== undefined) t.yaw = next.yaw;
          if (next.pitch !== undefined) t.pitch = next.pitch;
          if (next.roll !== undefined) t.roll = next.roll;
          return;
        }
        const cam = params.camera || (params.camera = {});
        if (next.yaw !== undefined) cam.yaw = next.yaw;
        if (next.pitch !== undefined) cam.pitch = next.pitch;
        if (next.roll !== undefined) cam.roll = next.roll;
      },
    },
  };
  const finiteNumber = (value, fallback = 0) => {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
  };
  const normalizeDegrees = (value) => {
    let next = finiteNumber(value, 0) % 360;
    if (next > 180) next -= 360;
    if (next < -180) next += 360;
    return Object.is(next, -0) ? 0 : next;
  };
  const tidyDegrees = (value) => {
    const next = Math.round(finiteNumber(value, 0) * 10) / 10;
    return Object.is(next, -0) ? 0 : next;
  };

  // Theme-token cache: every renderer read consults a canonical `--ui-*` token
  // directly. The legacy `--color-*` alias indirection was removed in Meridian
  // Step 3.3b (2026-05-20) once the last JS caller migrated; every skin file
  // under src/ui/skin/ now declares the `--ui-*` palette as ground truth.
  //
  // Invalidation is wired to two mechanisms so stale values can never persist:
  //   1. Synchronous key check: getThemeToken reads data-ui-skin on every call
  //      and clears the cache when the active skin id changes. applyTheme sets
  //      data-ui-skin before calling render(), so draw() always sees fresh values.
  //   2. vectura:skin-change event (fired one rAF after SkinManager.activate):
  //      catches late-loaded stylesheet tokens that weren't yet in getComputedStyle
  //      when draw() ran synchronously.
  //
  // The tokens helper from src/ui/skin/tokens.js (`window.Vectura.UI.tokens.get`)
  // would also work but performs no caching; the renderer reads the same tokens
  // many times per frame, so we keep the per-renderer Map<name, value> cache.
  // The cache surface is mirrored on `Renderer.__tokenCache` so unit tests can
  // exercise it without instantiating a full Renderer.
  const _themeTokenCache = new Map();
  let _themeTokenCacheKey = null;
  const _readVar = (name) => {
    if (typeof document === 'undefined' || !document.documentElement) return '';
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  };
  const getThemeToken = (name, fallback = '') => {
    if (typeof document === 'undefined' || !document.documentElement) return fallback;
    // Synchronously invalidate when skin id changes. applyTheme sets data-ui-skin
    // before calling render(), so this always reflects the incoming theme.
    const themeKey = document.documentElement.dataset.uiSkin || '';
    if (themeKey !== _themeTokenCacheKey) {
      _themeTokenCache.clear();
      _themeTokenCacheKey = themeKey;
    }
    if (_themeTokenCache.has(name)) return _themeTokenCache.get(name);
    const value = _readVar(name);
    const result = value || fallback;
    _themeTokenCache.set(name, result);
    return result;
  };
  const invalidateThemeTokenCache = () => { _themeTokenCache.clear(); };
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('vectura:skin-change', invalidateThemeTokenCache);
  }
  const distance = (a, b) => Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0));
  const clonePoint = (pt) => ({ x: pt.x, y: pt.y });
  const cloneHandle = (pt) => (pt ? { x: pt.x, y: pt.y } : null);
  const cloneAnchor = (anchor) => {
    const c = {
      x: anchor.x,
      y: anchor.y,
      in: cloneHandle(anchor.in),
      out: cloneHandle(anchor.out),
    };
    if (anchor.corner === true) c.corner = true;
    if (anchor.cornerType) c.cornerType = anchor.cornerType;
    if (anchor.liveCorner) c.liveCorner = JSON.parse(JSON.stringify(anchor.liveCorner));
    return c;
  };
  const normalizePoint = (pt) => {
    const len = Math.hypot(pt?.x ?? 0, pt?.y ?? 0);
    if (!len) return { x: 0, y: 0 };
    return { x: pt.x / len, y: pt.y / len };
  };
  const dot = (a, b) => (a?.x ?? 0) * (b?.x ?? 0) + (a?.y ?? 0) * (b?.y ?? 0);
  // True departure/arrival tangent at `anchor`, heading toward `neighbor`. A
  // corner adjacent to a curved segment (e.g. the top of a capital "S") often
  // has only ONE handle at the vertex itself — the "single-handle bezier"
  // case — so the tangent there is bent by the curve even though `anchor`
  // carries no handle on that side. Preference order mirrors cubic-bezier
  // degenerate-control-point tangent rules: the anchor's own handle first,
  // then the far anchor's opposite handle, then the straight chord.
  const CORNER_TANGENT_EPS = 1e-6;
  const cornerTangentDir = (anchor, neighbor, ownKey, neighborKey) => {
    const own = anchor?.[ownKey];
    if (own && (Math.abs(own.x - anchor.x) > CORNER_TANGENT_EPS || Math.abs(own.y - anchor.y) > CORNER_TANGENT_EPS)) {
      return normalizePoint({ x: own.x - anchor.x, y: own.y - anchor.y });
    }
    const far = neighbor?.[neighborKey];
    if (far && (Math.abs(far.x - anchor.x) > CORNER_TANGENT_EPS || Math.abs(far.y - anchor.y) > CORNER_TANGENT_EPS)) {
      return normalizePoint({ x: far.x - anchor.x, y: far.y - anchor.y });
    }
    return normalizePoint({ x: neighbor.x - anchor.x, y: neighbor.y - anchor.y });
  };
  // Cubic-bezier point-at-t and De Casteljau split — used to trim the curve
  // adjacent to a corner being rounded so the ADJACENT anchor's own handle
  // shortens to meet the new fillet endpoint exactly, instead of keeping its
  // original (now too-long) handle aimed at the discarded corner vertex. The
  // latter is what produces a visible kink where a fillet meets a curve.
  const cubicPointAt = (p0, c1, c2, p3, t) => {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return { x: a * p0.x + b * c1.x + c * c2.x + d * p3.x, y: a * p0.y + b * c1.y + c * c2.y + d * p3.y };
  };
  const cubicSplitAt = (p0, c1, c2, p3, t) => {
    const lerp = (a, b, tt) => ({ x: a.x + (b.x - a.x) * tt, y: a.y + (b.y - a.y) * tt });
    const q1 = lerp(p0, c1, t);
    const q2 = lerp(c1, c2, t);
    const q3 = lerp(c2, p3, t);
    const r1 = lerp(q1, q2, t);
    const r2 = lerp(q2, q3, t);
    const s = lerp(r1, r2, t);
    return { left: [p0, q1, r1, s], right: [s, r2, q3, p3] };
  };
  // Finds t where the curve point's distance to one endpoint equals `targetDist`.
  // `fromEnd=true` measures distance to p3 (searching toward t=1, decreasing);
  // `fromEnd=false` measures distance to p0 (searching toward t=0, increasing).
  const cubicParamAtDistance = (p0, c1, c2, p3, targetDist, fromEnd) => {
    const ref = fromEnd ? p3 : p0;
    let lo = 0, hi = 1;
    for (let iter = 0; iter < 30; iter++) {
      const mid = (lo + hi) / 2;
      const pt = cubicPointAt(p0, c1, c2, p3, mid);
      const d = Math.hypot(pt.x - ref.x, pt.y - ref.y);
      // Both branches converge by raising `lo` while the target hasn't been
      // reached yet: fromEnd shrinks distance-to-p3 as t grows, the other
      // grows distance-to-p0 as t grows.
      const needsLargerT = fromEnd ? d > targetDist : d < targetDist;
      if (needsLargerT) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const polygonArea = (vertices = []) => {
    let area = 0;
    for (let i = 0; i < vertices.length; i++) {
      const current = vertices[i];
      const next = vertices[(i + 1) % vertices.length];
      area += current.x * next.y - next.x * current.y;
    }
    return area * 0.5;
  };
  const buildRectangleVertices = (shape) => {
    const minX = Math.min(shape.x1, shape.x2);
    const minY = Math.min(shape.y1, shape.y2);
    const maxX = Math.max(shape.x1, shape.x2);
    const maxY = Math.max(shape.y1, shape.y2);
    return [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];
  };
  const buildPolygonVertices = (shape) => {
    const sides = Math.max(3, Math.round(shape.sides ?? 6));
    const radius = Math.max(0.1, shape.radius ?? 0.1);
    const rotation = shape.rotation ?? -Math.PI / 2;
    const vertices = [];
    for (let i = 0; i < sides; i++) {
      const theta = rotation + (i / sides) * TAU;
      vertices.push({
        x: shape.cx + Math.cos(theta) * radius,
        y: shape.cy + Math.sin(theta) * radius,
      });
    }
    return vertices;
  };
  const getShapeVertices = (shape) => {
    if (!shape || typeof shape !== 'object') return [];
    if (shape.type === 'rect') return buildRectangleVertices(shape);
    if (shape.type === 'polygon') return buildPolygonVertices(shape);
    return [];
  };
  const getShapeRadii = (shape, vertexCount) => {
    if (!shape || shape.type === 'oval') return [];
    const base = Array.isArray(shape.cornerRadii) ? shape.cornerRadii.slice(0, vertexCount) : [];
    while (base.length < vertexCount) base.push(base.length ? base[base.length - 1] : 0);
    return base.map((value) => Math.max(0, Number(value) || 0));
  };
  // Live Corners: the three corner styles, in the order
  // Option/Alt+click cycles them (Round → Inverted Round → Chamfer → Round).
  const CORNER_TYPES = ['round', 'invert', 'chamfer'];
  const normalizeCornerType = (value) => (CORNER_TYPES.includes(value) ? value : 'round');
  const nextCornerType = (value, step = 1) => {
    const idx = CORNER_TYPES.indexOf(normalizeCornerType(value));
    return CORNER_TYPES[(idx + step + CORNER_TYPES.length) % CORNER_TYPES.length];
  };
  const getShapeCornerTypes = (shape, vertexCount) => {
    if (!shape || shape.type === 'oval') return [];
    const base = Array.isArray(shape.cornerTypes) ? shape.cornerTypes.slice(0, vertexCount) : [];
    while (base.length < vertexCount) base.push(base.length ? base[base.length - 1] : 'round');
    return base.map(normalizeCornerType);
  };
  const getCornerDescriptors = (shape) => {
    const vertices = getShapeVertices(shape);
    if (!vertices.length) return [];
    const area = polygonArea(vertices);
    const radii = getShapeRadii(shape, vertices.length);
    const types = getShapeCornerTypes(shape, vertices.length);
    return vertices.map((vertex, index) => {
      const prev = vertices[(index - 1 + vertices.length) % vertices.length];
      const next = vertices[(index + 1) % vertices.length];
      const prevDir = normalizePoint({ x: prev.x - vertex.x, y: prev.y - vertex.y });
      const nextDir = normalizePoint({ x: next.x - vertex.x, y: next.y - vertex.y });
      let inward = normalizePoint({ x: prevDir.x + nextDir.x, y: prevDir.y + nextDir.y });
      if (!inward.x && !inward.y) {
        inward = normalizePoint({ x: next.y - prev.y, y: prev.x - next.x });
      }
      const centroid = vertices.reduce((acc, pt) => ({ x: acc.x + pt.x, y: acc.y + pt.y }), { x: 0, y: 0 });
      centroid.x /= vertices.length;
      centroid.y /= vertices.length;
      const toCenter = normalizePoint({ x: centroid.x - vertex.x, y: centroid.y - vertex.y });
      if (dot(inward, toCenter) < 0) inward = { x: -inward.x, y: -inward.y };
      if (area < 0) inward = { x: -inward.x, y: -inward.y };
      const edgeAngle = Math.acos(clamp(dot(prevDir, nextDir), -1, 1));
      const halfAngle = Math.max(1e-4, edgeAngle * 0.5);
      const sinHalf = Math.sin(halfAngle);
      const tanHalf = Math.tan(halfAngle);
      const prevLen = distance(vertex, prev);
      const nextLen = distance(vertex, next);
      const maxRadius = tanHalf > 1e-4 ? Math.min(prevLen, nextLen) * tanHalf * 0.5 : 0;
      return {
        index,
        vertex,
        inward,
        sinHalf,
        tanHalf,
        prevDir,
        nextDir,
        prevLen,
        nextLen,
        radius: Math.min(radii[index] || 0, maxRadius),
        maxRadius,
        cornerType: types[index] || 'round',
      };
    });
  };
  const buildEllipseAnchors = (shape) => {
    const rx = Math.max(0.1, Math.abs(shape.rx ?? 0));
    const ry = Math.max(0.1, Math.abs(shape.ry ?? 0));
    const cx = shape.cx ?? 0;
    const cy = shape.cy ?? 0;
    const ox = rx * ELLIPSE_KAPPA;
    const oy = ry * ELLIPSE_KAPPA;
    return [
      { x: cx, y: cy - ry, in: { x: cx - ox, y: cy - ry }, out: { x: cx + ox, y: cy - ry } },
      { x: cx + rx, y: cy, in: { x: cx + rx, y: cy - oy }, out: { x: cx + rx, y: cy + oy } },
      { x: cx, y: cy + ry, in: { x: cx + ox, y: cy + ry }, out: { x: cx - ox, y: cy + ry } },
      { x: cx - rx, y: cy, in: { x: cx - rx, y: cy + oy }, out: { x: cx - rx, y: cy - oy } },
    ];
  };
  // Shared tangent-circle-fillet math: the two spliced anchor points (with
  // their bezier handles) for reshaping `descriptor`'s corner to `radius`
  // in one of the three Live Corner styles:
  //   round   — convex arc tangent to both edges (circle center inside the shape)
  //   invert  — concave arc through the same setback points (circle center at
  //             the original vertex, bulging toward it)
  //   chamfer — straight cut between the setback points (no handles)
  // Used both to build the actual reshaped geometry and to preview the corner
  // as an overlay (e.g. the max-radius highlight) without mutating the path.
  const buildFilletArc = (descriptor, radius, cornerType = 'round') => {
    if (!descriptor || radius <= 1e-4 || descriptor.tanHalf <= 1e-4) return null;
    const tangentDistance = Math.min(
      descriptor.prevLen * 0.5,
      descriptor.nextLen * 0.5,
      radius / descriptor.tanHalf
    );
    const start = {
      x: descriptor.vertex.x + descriptor.prevDir.x * tangentDistance,
      y: descriptor.vertex.y + descriptor.prevDir.y * tangentDistance,
    };
    const end = {
      x: descriptor.vertex.x + descriptor.nextDir.x * tangentDistance,
      y: descriptor.vertex.y + descriptor.nextDir.y * tangentDistance,
    };
    const type = normalizeCornerType(cornerType);
    if (type === 'chamfer') {
      return { start, startOut: null, end, endIn: null };
    }
    if (type === 'invert') {
      // Arc centered at the original vertex, radius = setback distance. The
      // tangents at the setback points are perpendicular to the spokes
      // (prevDir/nextDir), oriented toward the opposite setback point.
      const chord = normalizePoint({ x: end.x - start.x, y: end.y - start.y });
      const perpToward = (dir) => {
        const p = { x: -dir.y, y: dir.x };
        return dot(p, chord) >= 0 ? p : { x: -p.x, y: -p.y };
      };
      const startTan = perpToward(descriptor.prevDir);
      const endTan = perpToward(descriptor.nextDir);
      // The vertex-centered arc spans the wedge angle between the two spokes.
      const arcAngle = Math.max(1e-4, Math.acos(clamp(dot(descriptor.prevDir, descriptor.nextDir), -1, 1)));
      const handleLength = (4 / 3) * Math.tan(arcAngle / 4) * tangentDistance;
      return {
        start,
        startOut: { x: start.x + startTan.x * handleLength, y: start.y + startTan.y * handleLength },
        end,
        endIn: { x: end.x - endTan.x * handleLength, y: end.y - endTan.y * handleLength },
      };
    }
    const arcAngle = Math.PI - Math.max(1e-4, Math.acos(clamp(dot(descriptor.prevDir, descriptor.nextDir), -1, 1)));
    const handleLength = (4 / 3) * Math.tan(arcAngle / 4) * radius;
    return {
      start,
      startOut: { x: start.x - descriptor.prevDir.x * handleLength, y: start.y - descriptor.prevDir.y * handleLength },
      end,
      endIn: { x: end.x - descriptor.nextDir.x * handleLength, y: end.y - descriptor.nextDir.y * handleLength },
    };
  };
  const buildRoundedPolygonAnchors = (shape) => {
    const descriptors = getCornerDescriptors(shape);
    if (!descriptors.length) return [];
    const anchors = [];
    descriptors.forEach((descriptor) => {
      const arc = buildFilletArc(descriptor, descriptor.radius, descriptor.cornerType);
      if (!arc) {
        anchors.push({ x: descriptor.vertex.x, y: descriptor.vertex.y, in: null, out: null });
        return;
      }
      anchors.push({ x: arc.start.x, y: arc.start.y, in: null, out: arc.startOut });
      anchors.push({ x: arc.end.x, y: arc.end.y, in: arc.endIn, out: null });
    });
    return anchors;
  };
  const buildLineAnchors = (shape) => {
    const x1 = Number.isFinite(shape?.x1) ? shape.x1 : 0;
    const y1 = Number.isFinite(shape?.y1) ? shape.y1 : 0;
    const x2 = Number.isFinite(shape?.x2) ? shape.x2 : 0;
    const y2 = Number.isFinite(shape?.y2) ? shape.y2 : 0;
    return [
      { x: x1, y: y1, in: null, out: null },
      { x: x2, y: y2, in: null, out: null },
    ];
  };
  const isOpenShape = (shape) => shape?.type === 'line';
  const buildShapeAnchors = (shape) => {
    if (!shape || typeof shape !== 'object') return [];
    if (shape.type === 'oval') return buildEllipseAnchors(shape);
    if (shape.type === 'rect' || shape.type === 'polygon') return buildRoundedPolygonAnchors(shape);
    if (shape.type === 'line') return buildLineAnchors(shape);
    return [];
  };
  const cloneShape = (shape) => (shape ? JSON.parse(JSON.stringify(shape)) : null);
  // Distance from the corner vertex to the ⊙ widget along the inward bisector:
  // the widget rides the corner geometry itself (arc / cut midpoint) —
  // NOT the fillet circle center. Widgets therefore stay near
  // their corners and never converge into one point at max radius.
  //   round   — arc midpoint: r·(1−sinHalf)/sinHalf
  //   invert  — vertex-centered arc midpoint: setback distance r/tanHalf
  //   chamfer — cut midpoint: (r/tanHalf)·cos(halfAngle)
  const cornerWidgetDistance = (radius, sinHalf, tanHalf, cornerType) => {
    if (!(radius > 1e-9)) return 0;
    const type = normalizeCornerType(cornerType);
    if (type === 'invert') return tanHalf > 1e-4 ? radius / tanHalf : 0;
    if (type === 'chamfer') {
      if (tanHalf <= 1e-4) return 0;
      return (radius / tanHalf) * Math.cos(Math.atan(tanHalf));
    }
    return sinHalf > 1e-4 ? (radius * (1 - sinHalf)) / sinHalf : 0;
  };
  // Radius gained per unit of pointer travel along the bisector — the slope
  // of the ROUND widget-position mapping, so the widget tracks the pointer.
  // One slope for every style (drags are delta-based from the grab point), so
  // cycling styles mid-drag never jumps the radius under the pointer.
  const cornerDragSlope = (sinHalf) => {
    if (!(sinHalf > 1e-4)) return 0;
    return sinHalf < 1 - 1e-9 ? sinHalf / (1 - sinHalf) : sinHalf;
  };
  const getShapeCornerHandlePosition = (descriptor, scale = 1) => {
    if (!descriptor) return null;
    const minDist = SHAPE_CORNER_HANDLE_MIN / Math.max(scale || 1, 0.01);
    const arcDist = cornerWidgetDistance(descriptor.radius, descriptor.sinHalf, descriptor.tanHalf, descriptor.cornerType);
    const dist = Math.max(minDist, arcDist);
    return {
      x: descriptor.vertex.x + descriptor.inward.x * dist,
      y: descriptor.vertex.y + descriptor.inward.y * dist,
    };
  };
  const buildBoundsFromVertices = (vertices, origin, rotation) => {
    if (!Array.isArray(vertices) || !vertices.length || !origin) return null;
    const cosR = Math.cos(rotation || 0);
    const sinR = Math.sin(rotation || 0);
    const unrotate = (pt) => {
      const dx = pt.x - origin.x;
      const dy = pt.y - origin.y;
      return {
        x: dx * cosR + dy * sinR,
        y: -dx * sinR + dy * cosR,
      };
    };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    vertices.forEach((pt) => {
      const local = unrotate(pt);
      minX = Math.min(minX, local.x);
      minY = Math.min(minY, local.y);
      maxX = Math.max(maxX, local.x);
      maxY = Math.max(maxY, local.y);
    });
    if (!Number.isFinite(minX)) return null;
    const toWorld = (local) => ({
      x: origin.x + local.x * cosR - local.y * sinR,
      y: origin.y + local.x * sinR + local.y * cosR,
    });
    const center = toWorld({ x: (minX + maxX) * 0.5, y: (minY + maxY) * 0.5 });
    return {
      minX,
      minY,
      maxX,
      maxY,
      rotation: rotation || 0,
      origin,
      center,
      corners: {
        nw: toWorld({ x: minX, y: minY }),
        ne: toWorld({ x: maxX, y: minY }),
        se: toWorld({ x: maxX, y: maxY }),
        sw: toWorld({ x: minX, y: maxY }),
      },
    };
  };

  class Renderer {
    constructor(id, engine) {
      this.canvas = document.getElementById(id);
      this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
      this.engine = engine;
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      this.userHasManipulated = false;
      this.isPan = false;
      this.isLayerDrag = false;
      this.dragMode = null;
      this.activeHandle = null;
      this.dragStart = { x: 0, y: 0 };
      this.startBounds = null;
      this.tempTransform = null;
      this.rotateOrigin = null;
      this.rotateStartAngle = 0;
      this.rotateStart = 0;
      this.rotation3DDrag = null;
      this.guides = null;
      // SEL-4/SG-2/SG-5 hover feedback state (test-visible hooks).
      this.hoverReadout = null;
      this.hoverHighlight = null;
      this.hoverCenter = null;
      this.lastTooltipText = null;
      this.selectedLayerId = null;
      this.selectedLayerIds = new Set();
      // "key object" — the anchor that Align-To: Key Object
      // uses as its reference rect. Cleared whenever the layer leaves the
      // selection or selection drops below 2 layers.
      this.keyObjectId = null;
      this.isSelecting = false;
      this.selectionStart = null;
      this.selectionRect = null;
      this.selectionPath = null;
      this.lassoPath = null;
      this.isLassoSelecting = false;
      this.activeTool = SETTINGS.activeTool || 'select';
      // 3D Scene Studio (Phase 1C) — scene selection state (CONTRACT D).
      // sceneSelection: null | { layerId, mode:'object'|'face'|'edge',
      // objectIds:[], faceKeys:[], edgeKeys:[] }. sceneComponentMode is the
      // A-tool submode ('a' again cycles face<->edge on scene layers).
      this.sceneSelection = null;
      this.sceneComponentMode = 'face';
      // Alt-click depth-cycle cache: { key, index, total } for the candidate
      // stack under the last scene click (context bar shows "2 of 3").
      this.sceneCandidateStack = null;
      // Hover silhouette hint (overlay only): the object/face a click WOULD
      // select under the cursor, recomputed on plain mouse-move (rAF-throttled)
      // and drawn as a subtle accent outline. Never touches exported geometry.
      // sceneHoverPick: null | { layerId, mode:'object'|'face', objectId,
      // faceId, key }.
      this.sceneHoverPick = null;
      this._sceneHoverRaf = null;
      this._sceneHoverPointer = null;
      this._sceneDrag = null;
      // 3D Scene Studio (Phase 2) — sun-widget / shadow-handle drag state.
      // null | { mode:'widget'|'shadow', layerId, lightIndex, startLight,
      // origin, camYaw, unit, historyPushed, moved }.
      this._sceneLightDrag = null;
      // Unified per-object transform-gizmo drag state.
      // null | { layerId, objectId, type:'move'|'rotate'|'scale', axis:'x'|'y'|'z',
      // center, startWorld, startAngle, startDist, camYaw, start{…}, historyPushed, moved }.
      this._sceneObjectGizmoDrag = null;
      // Selected-light 3-axis translate gizmo drag state (Unit 1b).
      // null | { layerId, lightId, lightType, axis, startWorld, camYaw, startPos,
      // startToward, startLight, historyPushed, moved }.
      this._sceneLightGizmoDrag = null;
      // On-canvas uniform-scale gizmo drag state.
      // null | { layerId, objectId, handle, center, startDist, startScale,
      // historyPushed, moved }.
      this._sceneResizeDrag = null;
      // Box face-pull drag state.
      // null | { layerId, objectId, axisKey, center, startDist, startDim,
      // historyPushed, moved }.
      this._sceneFacePullDrag = null;
      this._sceneMarqueePending = null;
      this._sceneLastClick = null;
      this.paintBucketStack = null;
      this.paintBucketScopeIndex = 0;
      this.paintBucketStackKey = null;
      this.patternFillPreviewInnerPolygon = null;
      this.lastPourLoopId = null;
      // Refs to the fill records in the "active batch" — the set that panel
      // slider/variant edits retarget in place. Empty means no active batch
      // (panel mutations only update the template for the next pour).
      // Lifecycle: plain click resets to a 1-fill batch; Shift+drag accumulates
      // within one drag; CMD+click adopts an existing fill; Esc / Done /
      // tool switch commits (clears) the batch.
      this.lastPaintedFillRefs = [];
      this.scissorMode = SETTINGS.scissorMode || 'line';
      this.penMode = SETTINGS.penMode || 'draw';
      this.penPurpose = 'draw';
      this.penDraft = null;
      this.penPreview = null;
      this.isPenDragging = false;
      this.isPenCloseDragging = false;
      this.penDragAnchor = null;
      this.penDragStart = null;
      this.penDragMirrorLock = null;
      this._penLastClick = null;
      this.penSnapToOrigin = false;
      this.groupEditMode = null;
      this._selectLastClick = null;
      // Type-tool multi-click (word/paragraph) timing + active press-drag state.
      this._typeLastClick = null;
      this._typeDrag = null;
      // Type-tool empty-canvas click-vs-drag creation (point vs area frame).
      this._areaCreate = null;
      this.shapeDraft = null;
      this.shapeDraftSides = 6;
      this.shapeCornerDrag = null;
      this.freeformCornerDrag = null;
      this.algoDraft = null;
      this.algoDraftType = 'wavetable';
      this._lastAlgoTap = { time: 0, x: 0, y: 0 };
      this.directSelection = null;
      this.directDrag = null;
      this.penAnchorDrag = null;
      this.directAuxSelections = [];
      this.isDirectMarquee = false;
      this.directMarqueeStart = null;
      this.directMarqueeRect = null;
      this.maskPreview = null;
      this.mirrorDragState = null;
      // When the active mirror drag includes a layer nested under a morph
      // modifier, the parent's morphed output must be recomputed during the
      // drag so in-between rings track the child live. Coalesced to one
      // recompute per animation frame to keep dragging responsive.
      this._morphDragActive = false;
      this._morphDragRaf = null;
      // Morph group ids whose blend should ghost-dim while their child is dragged.
      this._morphDragGroupIds = new Set();
      this.scissorStart = null;
      this.scissorEnd = null;
      this.isScissor = false;
      this.lightSource = SETTINGS.lightSource || null;
      this.lightSourceSelected = false;
      this.lightSourcePlacement = false;
      this.isLightDrag = false;
      this.lightDragOffset = { x: 0, y: 0 };
      this.modifierDrag = null;
      this.onSelectLayer = null;
      this.onPenComplete = null;
      this.onShapeComplete = null;
      this.onScissor = null;
      this.onDirectEditStart = null;
      this.onDirectEditCommit = null;
      this.onPatternFill = null;
      this.patternFillPreviewPolygon = null;
      this.isLayerLocked = null;
      this.lastM = { x: 0, y: 0 };
      this.snap = null;
      this.snapAllowed = true;
      this.activePointerId = null;
      this.touchPointers = new Map();
      this.touchGesture = null;
      this.touchHoldTimer = null;
      this.touchHoldPending = null;
      this.touchHoldStartClient = null;
      this.exportModalOpen = false;
      this.ready = Boolean(this.canvas && this.ctx);

      if (!this.ready) {
        console.warn(`[Renderer] Missing canvas or context for #${id}`);
        return;
      }

      const parent = this.canvas.parentElement;
      if (!parent) {
        console.warn('[Renderer] Canvas has no parent element.');
        this.ready = false;
        return;
      }

      new ResizeObserver(() => this.resize()).observe(parent);
      this.canvas.addEventListener('pointerenter', () => this.updateCursor());
      this.canvas.addEventListener('pointerleave', () => { this._paintBucketClearHover(); this._clearSceneHoverHint(); });
      this.canvas.addEventListener('mouseleave', () => { this._paintBucketClearHover(); this._clearSceneHoverHint(); });
      this.canvas.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
      this._boundMove = (e) => this.move(e);
      this._boundUp = (e) => this.up(e);
      if (window.PointerEvent) {
        this.canvas.addEventListener('pointerdown', (e) => this.down(e));
        window.addEventListener('pointermove', this._boundMove);
        window.addEventListener('pointerup', this._boundUp);
        window.addEventListener('pointercancel', this._boundUp);
      } else {
        this._boundMouseMove = (e) => this.move(e);
        this._boundMouseUp = (e) => this.up(e);
        this.canvas.addEventListener('mousedown', (e) => this.down(e));
        window.addEventListener('mousemove', this._boundMouseMove);
        window.addEventListener('mouseup', this._boundMouseUp);
      }

      // Track Alt/Meta key state at the document level so we can swap the
      // canvas cursor (e.g. select→copy-plus on Alt, fill→microscope on CMD)
      // even when the mouse hasn't moved.
      this._modState = { alt: false, meta: false };
      this._onModKeyChange = (e) => {
        const alt = Boolean(e.altKey);
        const meta = Boolean(e.metaKey || e.ctrlKey);
        if (alt === this._modState.alt && meta === this._modState.meta) return;
        const wasMeta = this._modState.meta;
        this._modState.alt = alt;
        this._modState.meta = meta;
        // CMD released while the panel is showing the sample-empty prompt —
        // restore the normal Paint Bucket controls.
        if (wasMeta && !meta) {
          this.app?.paintBucketPanel?.setSampleEmptyMode?.(false);
        }
        // Reset to the tool-default cursor first, then refine via hover. This
        // matters when the active branch of updateHoverCursor early-returns
        // (e.g. fill tool relies on updateCursor to set the bucket).
        this.updateCursor();
        if (this._lastPointerEvent && !this.isLayerDrag && !this.isSelecting) {
          this.updateHoverCursor(this._lastPointerEvent);
        }
      };
      this._onWindowBlur = () => {
        if (!this._modState.alt && !this._modState.meta) return;
        this._modState.alt = false;
        this._modState.meta = false;
        this.app?.paintBucketPanel?.setSampleEmptyMode?.(false);
        this.updateCursor();
      };
      document.addEventListener('keydown', this._onModKeyChange);
      document.addEventListener('keyup', this._onModKeyChange);
      window.addEventListener('blur', this._onWindowBlur);
      // SEL-2: Escape cancels an in-flight layer drag (removing any alt-drag
      // duplicates). Capture phase so tool-level Escape shortcuts don't race.
      this._onDragCancelKey = (e) => {
        if (e.key !== 'Escape') return;
        // Escape mid transform-gizmo drag restores the pre-drag transform.
        if (this._sceneObjectGizmoDrag) {
          if (this._cancelSceneObjectGizmoDrag()) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        // Escape mid light-translate gizmo drag restores the pre-drag light.
        if (this._sceneLightGizmoDrag) {
          if (this._cancelSceneLightGizmoDrag()) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        // Escape mid resize-gizmo drag restores the pre-drag scale.
        if (this._sceneResizeDrag) {
          if (this._cancelSceneResizeDrag()) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        // Escape mid face-pull drag restores the pre-drag dimension.
        if (this._sceneFacePullDrag) {
          if (this._cancelSceneFacePullDrag()) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        // Escape mid sun-widget / shadow drag restores the pre-drag light.
        if (this._sceneLightDrag) {
          if (this._cancelSceneLightDrag()) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        // Escape mid scene ground-drag restores the pre-drag transforms.
        if (this._sceneDrag) {
          if (this._cancelSceneGroundDrag()) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        if (!this.isLayerDrag) return;
        if (this.cancelLayerDrag()) {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      document.addEventListener('keydown', this._onDragCancelKey, true);
      // I10: Delete/Backspace on an active scene-internal selection removes the
      // selected object(s) / clears the selected face(s) — NOT the whole scene3d
      // layer. Capture phase so it runs before the global layer-delete shortcut
      // (shortcuts.js, window bubble); it only stops the event when it actually
      // consumed a scene selection, so a bare layer selection still falls through
      // to the normal layer delete.
      this._onSceneDeleteKey = (e) => {
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
          || t.tagName === 'SELECT' || t.isContentEditable)) return;
        const overlays = (typeof window !== 'undefined' && window.Vectura
          && window.Vectura.UI) ? window.Vectura.UI.overlays : null;
        if (overlays && overlays.Modal && typeof overlays.Modal.anyOpen === 'function'
          && overlays.Modal.anyOpen()) return;
        if (typeof document !== 'undefined') {
          const legacy = document.getElementById('modal-overlay');
          if (legacy && legacy.classList.contains('open')) return;
        }
        if (this.deleteSceneSelection()) {
          e.preventDefault();
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
        }
      };
      document.addEventListener('keydown', this._onSceneDeleteKey, true);
    }

    destroy() {
      if (this._boundMove) {
        window.removeEventListener('pointermove', this._boundMove);
        window.removeEventListener('pointerup', this._boundUp);
        window.removeEventListener('pointercancel', this._boundUp);
      }
      if (this._boundMouseMove) {
        window.removeEventListener('mousemove', this._boundMouseMove);
        window.removeEventListener('mouseup', this._boundMouseUp);
      }
      if (this._onModKeyChange) {
        document.removeEventListener('keydown', this._onModKeyChange);
        document.removeEventListener('keyup', this._onModKeyChange);
      }
      if (this._onDragCancelKey) {
        document.removeEventListener('keydown', this._onDragCancelKey, true);
      }
      if (this._onSceneDeleteKey) {
        document.removeEventListener('keydown', this._onSceneDeleteKey, true);
      }
      if (this._onWindowBlur) {
        window.removeEventListener('blur', this._onWindowBlur);
      }
    }

    getOptimizationTargetIds() {
      const scope = SETTINGS.optimizationScope || 'all';
      let ids = [];
      if (scope === 'selected') {
        ids = Array.from(this.selectedLayerIds || []).filter((id) =>
          this.engine.layers.some((layer) => layer && !layer.isGroup && layer.id === id)
        );
      } else if (scope === 'active') {
        const activeId = this.engine.activeLayerId;
        if (activeId && this.engine.layers.some((layer) => layer && !layer.isGroup && layer.id === activeId)) {
          ids = [activeId];
        }
      } else {
        ids = this.engine.layers.filter((layer) => layer && !layer.isGroup).map((layer) => layer.id);
      }
      if (!ids.length) {
        const activeId = this.engine.activeLayerId;
        if (activeId && this.engine.layers.some((layer) => layer && !layer.isGroup && layer.id === activeId)) {
          ids = [activeId];
        }
      }
      return new Set(ids);
    }

    // Build the plot records for the whole document — one record per path the
    // plotter will lay down, in raw layer/stack order. `Renderer.buildPlotSequence`
    // turns these into the actual print order.
    //
    // The path SOURCE is engine.getRenderablePaths (not layer.optimizedPaths):
    // that is what the base draw, the reveal and the SVG export all consume, so
    // stroke-division fragments / mask display geometry / composed group geometry
    // are the objects that end up in the sequence. Keying the colour preview off
    // layer.optimizedPaths instead used to hand it path objects that were never
    // in the reveal map at all, so the preview stopped revealing in lock-step.
    //
    // Effective-pen rule, matching UI.getExportSnapshot: a known per-path
    // meta.penId wins, unknown ids fall back to the layer pen.
    buildPlotRecords(optimizationTargetIds) {
      const targetIds = optimizationTargetIds || this.getOptimizationTargetIds();
      const PU = window.Vectura?.OptimizationUtils;
      const pathEnds = (path) => (PU?.pathEndpoints
        ? PU.pathEndpoints(path)
        : (Array.isArray(path) && path.length
          ? { start: path[0], end: path[path.length - 1] }
          : { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }));
      const knownPenIds = new Set((SETTINGS.pens || []).map((p) => p.id));
      const records = [];
      this.engine.layers.forEach((l, layerSeq) => {
        if (!l.visible || this.shouldSkipLayerForMaskPreview(l) || this.engine.hasCompoundAncestor?.(l)) return;
        const optimized = targetIds.has(l.id);
        const lp = this.engine.getRenderablePaths
          ? this.engine.getRenderablePaths(l, { useOptimized: optimized })
          : l.paths;
        (lp || []).forEach((path, pathIndex) => {
          const ends = pathEnds(path);
          records.push({
            path,
            layer: l,
            layerId: l.id,
            penKey: (path && path.meta && path.meta.penId && knownPenIds.has(path.meta.penId)
              ? path.meta.penId
              : l.penId) || 'default',
            layerSeq,
            pathIndex,
            length: Renderer.revealPathLength(path),
            start: ends.start,
            end: ends.end,
            lineSortOrder: path && path.meta ? path.meta.lineSortOrder : undefined,
            lineSortGrouping: path && path.meta ? path.meta.lineSortGrouping : undefined,
            optimized,
          });
        });
      });
      return records;
    }

    // The document's plot order, as an array of plot records. Exposed so the
    // draw-order colour preview, the playback reveal and any test can assert on
    // the SAME sequence the SVG export emits.
    getDrawOrderSequence(optimizationTargetIds) {
      return Renderer.buildPlotSequence(this.buildPlotRecords(optimizationTargetIds));
    }

    // The items the on-canvas Draw Order colour overlay paints, in the order it
    // colours them (first item = gradient start). Returns
    // [{ layer, path, useCurves }]. Ordered through getDrawOrderSequence so the
    // colours describe the SAME plot order playback follows and export emits.
    //
    // POSITION CONTRACT (pinned by
    // tests/integration/draw-order-overlay-geometry-position.test.js): every
    // item's `path` must be a member of `item.layer`'s OWN renderable set. The
    // overlay traces each item with `traceLayerPath(path, item.layer, …)`, so a
    // path attributed to the wrong layer is drawn under the wrong transform —
    // that is how an earlier attempt at this fix put a coloured ghost capsule
    // beside the real one. The `eligible` map is keyed by layer id and the paths
    // come from buildPlotRecords (which builds each record FROM that layer's
    // getRenderablePaths), so ownership is preserved by construction.
    //
    // GROUPS ARE DELIBERATELY EXCLUDED — see the guard below.
    getDrawOrderPreviewItems(optimizationTargetIds) {
      const targetIds = optimizationTargetIds || this.getOptimizationTargetIds();
      const eligible = new Map();
      const targetLayers = [];
      this.engine.layers.forEach((l) => {
        if (this.shouldSkipLayerForMaskPreview(l)) return;
        // A GROUP is never an optimization target: engine.optimizeLayers filters
        // `!layer.isGroup`, so a group has no optimizedPaths and none of its
        // paths ever carry meta.lineSortOrder. Colouring a group would therefore
        // fabricate a draw order the plotter has no notion of — a 3D scene
        // group's composed scenePaths are ordered by COMPOSITION, not by any
        // line sort. Giving scenes a real draw order is a separate unit; until
        // then the honest preview for a scene is empty. This guard is explicit
        // (not merely implied by targetIds) so a future widening of
        // getOptimizationTargetIds cannot silently pull group geometry into the
        // colour overlay.
        if (l.isGroup) return;
        if (!targetIds.has(l.id)) return;
        targetLayers.push(l);
        if (!l.visible || (l.mask?.enabled && l.mask?.hideLayer)) return;
        if (!l.optimizedPaths || !l.optimizedPaths.length) return;
        eligible.set(l.id, { layer: l, useCurves: Boolean(l.params && l.params.curves) });
      });
      const items = [];
      this.getDrawOrderSequence(targetIds).forEach((rec) => {
        const slot = eligible.get(rec.layerId);
        if (!slot) return;
        items.push({ layer: slot.layer, path: rec.path, useCurves: slot.useCurves });
      });
      return { items, targetLayers };
    }

    setTool(tool) {
      if (!tool) return;
      // 3D Scene Studio (§5.4): pressing A while the direct tool is already
      // active on a scene3d layer cycles the component submode (face <-> edge)
      // instead of re-entering the tool. The shortcut handler simply calls
      // setActiveTool('direct') again, so the cycle lives here at the tool
      // seam (documented in src/ui/shortcuts.js).
      if (tool === 'direct' && this.activeTool === 'direct' && this.getSceneShortcutLayer?.()) {
        this.sceneComponentMode = this.sceneComponentMode === 'face' ? 'edge' : 'face';
        const sel = this.sceneSelection;
        if (sel && (sel.mode === 'face' || sel.mode === 'edge')) {
          this.setSceneSelection({ ...sel, mode: this.sceneComponentMode });
        } else {
          this.draw();
        }
        return;
      }
      this.clearMaskPreview();
      if (tool !== 'pen') {
        this.penDraft = null;
        this.penPreview = null;
        this.isPenDragging = false;
        this.isPenCloseDragging = false;
        this.penDragAnchor = null;
        this.penDragStart = null;
        this.penDragMirrorLock = null;
        this.penPurpose = 'draw';
        this.penAnchorDrag = null;
      }
      if (!`${tool}`.startsWith('shape-')) {
        this.shapeDraft = null;
      }
      if (tool !== 'direct') {
        this.directDrag = null;
        this.directAuxSelections = [];
        this.isDirectMarquee = false;
        this.directMarqueeStart = null;
        this.directMarqueeRect = null;
      }
      if (tool !== 'scissor') {
        this.isScissor = false;
        this.scissorStart = null;
        this.scissorEnd = null;
      }
      if (tool !== 'lasso') {
        this.isLassoSelecting = false;
        this.lassoPath = null;
      }
      if (tool !== 'type' && this.app && this.app.textEdit && this.app.textEdit.isActive()) {
        this.app.textEdit.end();
      }
      this.activeTool = tool;
      // Entering direct-select while a morph end is isolated: the active child's
      // geometry is consumed (findPathHitAtPoint can't grab it), so establish a
      // direct selection on it directly so its anchors and shape (bevel) corner
      // handles are immediately visible and editable. Edits refold the blend via
      // engine.generate() -> computeAllDisplayGeometry().
      if (tool === 'direct' && this.groupEditMode?.kind === 'morph') {
        const child = this.engine.layers.find((l) => l.id === this.groupEditMode.activeLayerId);
        if (child && !child.isGroup && this.directSelection?.layerId !== child.id) {
          this.setDirectSelection(child, 0);
        }
      } else if (tool === 'direct') {
        // Entering direct-select on a layer already picked with the Select tool
        // (e.g. the contextual task bar's Edit Path button): show its anchors
        // and bezier handles immediately, matching the morph case above,
        // instead of requiring a fresh canvas click to populate directSelection.
        const layers = this.getSelectedLayers ? this.getSelectedLayers() : [];
        const layer = layers.length === 1 ? layers[0] : null;
        if (layer && this.canEditSourceGeometry(layer) && this.directSelection?.layerId !== layer.id) {
          this.setDirectSelection(layer, 0);
        }
      }
      this.updateCursor();
      if (!['fill', 'fill-erase', 'fill-pattern', 'fill-pattern-erase'].includes(tool)) {
        this.hideFillLoupe?.();
        this.patternFillPreviewPolygon = null;
        this.patternFillPreviewInnerPolygon = null;
      }
      if (tool !== 'fill' && tool !== 'fill-erase') {
        this.paintBucketStack = null;
        this.paintBucketScopeIndex = 0;
        this.paintBucketStackKey = null;
        this.patternFillPreviewInnerPolygon = null;
        this.lastPourLoopId = null;
        // Commit any active batch when leaving the fill tool. This clears the
        // panel chip and outline overlay; the fill records themselves stay
        // on the layer.
        if (Array.isArray(this.lastPaintedFillRefs) && this.lastPaintedFillRefs.length) {
          this.commitActiveBatch();
        }
      }
      this.draw();
    }

    setPenMode(mode) {
      if (!mode) return;
      this.penMode = mode;
      SETTINGS.penMode = mode;
      this.updateCursor();
      this.draw();
    }

    setScissorMode(mode) {
      if (!mode) return;
      this.scissorMode = mode;
      this.draw();
    }

    setLightSourceMode(active) {
      this.lightSourcePlacement = Boolean(active);
      if (this.lightSourcePlacement) {
        this.lightSourceSelected = false;
        this.clearSelection();
      }
      this.draw();
    }

    setLightSource(point) {
      if (!point) return;
      this.lightSource = { x: point.x, y: point.y };
      SETTINGS.lightSource = { x: point.x, y: point.y };
      this.lightSourceSelected = true;
      this.draw();
    }

    clearLightSource() {
      this.lightSource = null;
      SETTINGS.lightSource = null;
      this.lightSourceSelected = false;
      this.lightSourcePlacement = false;
      this.draw();
    }

    hitLightSource(world) {
      if (!this.lightSource || !world) return false;
      const r = 6 / this.scale;
      const dx = world.x - this.lightSource.x;
      const dy = world.y - this.lightSource.y;
      return dx * dx + dy * dy <= r * r;
    }

    setCanvasCursor(cursor = 'crosshair', mode = '') {
      if (!this.canvas) return;
      this.canvas.style.cursor = cursor;
      const isKeyword = typeof cursor === 'string' && !cursor.includes('(');
      this.canvas.dataset.cursorMode = mode || (isKeyword ? cursor : '') || 'default';
    }

    cursorDataUrl(name, hotX = 0, hotY = 0, fallback = 'auto', ...factoryArgs) {
      const factory = window.Vectura?.Icons?.cursor?.[name];
      if (typeof factory !== 'function') return fallback;
      const svg = factory(...factoryArgs);
      const encoded = encodeURIComponent(svg)
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29');
      return `url("data:image/svg+xml;utf8,${encoded}") ${hotX} ${hotY}, ${fallback}`;
    }

    ensureDragTooltip() {
      if (this._dragTooltipEl) return this._dragTooltipEl;
      const el = document.createElement('div');
      el.className = 'drag-value-tooltip';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      this._dragTooltipEl = el;
      return el;
    }

    showDragTooltip(text, clientX, clientY) {
      const el = this.ensureDragTooltip();
      el.textContent = text;
      el.style.left = `${clientX + 14}px`;
      el.style.top = `${clientY - 10}px`;
      el.style.display = 'block';
      // Test-visible hook (SEL-4): integration tests observe the chip content
      // here instead of scraping the DOM element.
      this.lastTooltipText = text;
    }

    hideDragTooltip() {
      if (this._dragTooltipEl) this._dragTooltipEl.style.display = 'none';
      this.lastTooltipText = null;
      this.hideAnchorLabel();
    }

    // Small pink feature label (e.g. "anchor") drawn at the point itself, above
    // the gray measurement chip — smart-guide parity. Positioned in
    // client (fixed) coordinates from the anchor's on-screen location.
    ensureAnchorLabel() {
      if (this._anchorLabelEl) return this._anchorLabelEl;
      const el = document.createElement('div');
      el.className = 'drag-anchor-label';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      this._anchorLabelEl = el;
      return el;
    }

    showAnchorLabel(text, clientX, clientY) {
      const el = this.ensureAnchorLabel();
      el.textContent = text;
      el.style.left = `${clientX + 8}px`;
      el.style.top = `${clientY - 16}px`;
      el.style.display = 'block';
      this.lastAnchorLabelText = text;
    }

    hideAnchorLabel() {
      if (this._anchorLabelEl) this._anchorLabelEl.style.display = 'none';
      this.lastAnchorLabelText = null;
    }

    // ——— SEL-4: live measurement chips (hover X/Y, move dX/dY) ———————————
    // All thresholds/vocabulary come from src/config/smart-guides.js; when the
    // config is absent the chips quietly stay off (late-loading tolerance).

    _smartGuidesConfig() {
      return (window.Vectura && window.Vectura.SMART_GUIDES) || null;
    }

    // Nearest visible object's bounding-box center within the screen-px hit
    // radius, or null. Considers ALL objects (not just the selection) so the
    // center helper point is available for every object.
    _hitObjectCenter(sx, sy, cfg) {
      const tol = cfg?.centerHitScreenPx ?? 7;
      let best = null;
      let bestD = tol;
      for (const layer of this.engine.layers) {
        if (!layer.visible || layer.isGroup || this.isLayerLocked?.(layer.id)) continue;
        if (this.engine.hasCompoundAncestor?.(layer)) continue;
        const b = this.getLayerBounds(layer, null);
        if (!b) continue;
        const c = b.center || { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
        if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
        const s = this.worldToScreen(c.x, c.y);
        const d = Math.hypot(s.x - sx, s.y - sy);
        if (d <= bestD) { bestD = d; best = { x: c.x, y: c.y }; }
      }
      return best;
    }

    // User preference (Settings ▸ Guides & Display ▸ "Coordinate readout"):
    // gates every X/Y & dX/dY measurement chip (hover, move-delta, anchor drag).
    // Default ON. Transient action feedback (rotate °, resize W×H) is unaffected.
    _coordinateReadoutEnabled() {
      const settings = (window.Vectura && window.Vectura.SETTINGS) || SETTINGS || {};
      return settings.showCoordinateReadout !== false;
    }

    _formatChipText(kind, values) {
      if (!this._coordinateReadoutEnabled()) return null;
      const cfg = this._smartGuidesConfig();
      if (!cfg || !cfg.chip) return null;
      const settings = (window.Vectura && window.Vectura.SETTINGS) || SETTINGS || {};
      const units = normalizeDocumentUnits(settings.documentUnits);
      const precision = Number.isFinite(cfg.chipPrecision) ? cfg.chipPrecision : 2;
      const fmt = (v) => formatDocumentLength(v, units, {
        includeUnit: false,
        precision,
        trimTrailingZeros: true,
      });
      const unitLabel = typeof UnitUtils.getDocumentUnitLabel === 'function'
        ? UnitUtils.getDocumentUnitLabel(units)
        : (units === 'imperial' ? 'in' : 'mm');
      const sep = cfg.chip.labelSeparator ?? ': ';
      // two-line readout: each axis on its own line with its
      // own unit suffix (rendered in the gray chip via `white-space: pre`).
      if (kind === 'delta') {
        return `${cfg.chip.dx}${sep}${fmt(values.dx)} ${unitLabel}\n${cfg.chip.dy}${sep}${fmt(values.dy)} ${unitLabel}`;
      }
      return `${cfg.chip.x}${sep}${fmt(values.x)} ${unitLabel}\n${cfg.chip.y}${sep}${fmt(values.y)} ${unitLabel}`;
    }

    _showMoveDeltaChip(dx, dy, e) {
      const text = this._formatChipText('delta', { dx, dy });
      if (text == null) return;
      this.showDragTooltip(text, e.clientX ?? 0, e.clientY ?? 0);
    }

    // Hover feedback while no drag is active: X/Y chip over anchors/bezier
    // handles (editing tools) and selection handles (Select tool). Exposes
    // `hoverReadout` ({x, y, label}) as the integration-test hook.
    _updateHoverFeedback(e) {
      const cfg = this._smartGuidesConfig();
      if (!cfg) return;
      let chipPoint = null;
      let label = null;
      let hoverHighlight = null;
      let nextCenter = null;
      const busy = this.isLayerDrag || this.isPan || this.isSelecting || this.directDrag
        || this.penAnchorDrag || this.touchGesture || this.shapeCornerDrag || this.freeformCornerDrag || this.modifierDrag;
      if (!busy && this.canvas) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = (e.clientX ?? 0) - rect.left;
        const sy = (e.clientY ?? 0) - rect.top;
        const world = this.screenToWorld(sx, sy);
        const tool = this.activeTool;
        const settingsRef = (window.Vectura && window.Vectura.SETTINGS) || SETTINGS || {};
        let overControlOrHandle = false;
        if (tool === 'direct' || (tool === 'pen' && this.penMode !== 'draw')) {
          const control = this.hitDirectControl(world);
          if (control) {
            overControlOrHandle = true;
            const data = control.auxIdx >= 0
              ? this._selectionWorldAnchors(this.directAuxSelections[control.auxIdx])
              : this.getDirectSelectionWorldAnchors();
            const anchor = data?.anchors?.[control.index];
            if (anchor) {
              const pt = control.type === 'anchor' ? anchor : (anchor[control.type] || anchor);
              chipPoint = { x: pt.x, y: pt.y };
              if (control.type === 'anchor') label = cfg.labels?.anchor ?? null;
            }
          }
        } else if (tool === 'select') {
          const activeLayers = this.getSelectedLayers();
          const bounds = activeLayers.length
            ? this.getSelectionBounds(activeLayers, this.tempTransform)
            : null;
          if (bounds && !activeLayers.some((l) => this.isLayerLocked?.(l.id))) {
            const handle = this.hitHandle(sx, sy, bounds);
            if (handle && !handle.startsWith('rotate')) {
              overControlOrHandle = true;
              chipPoint = this.getHandlePoint(handle, bounds);
            } else if (bounds && this.pointInBounds(world, bounds)) {
              // Hovering inside the current selection's own bounds — no
              // unselected-path highlight (avoids flicker over the selection).
              overControlOrHandle = true;
            }
          }
        }
        // Center helper point: hovering near ANY object's center reveals a
        // marker + "center" label + X/Y chip. Runs for all
        // visible objects, not just the selection, when no anchor/handle is
        // grabbed. Gated by Settings ▸ Guides & Display ▸ "Center point".
        if (!chipPoint && (tool === 'select' || tool === 'direct')
            && (settingsRef.showCenterPoint !== false)) {
          const c = this._hitObjectCenter(sx, sy, cfg);
          if (c) {
            overControlOrHandle = true;
            chipPoint = c;
            label = cfg.labels?.center ?? null;
            nextCenter = c;
          }
        }
        // SG-5: highlight an unselected path under Selection/Direct tools so
        // click targets read before clicking (magenta outline + `path` label).
        if (!overControlOrHandle && (tool === 'select' || tool === 'direct')) {
          const hit = tool === 'direct'
            ? this.findLayerAtPointPrecise?.(world)
            : this.findLayerAtPoint(world);
          if (hit && !this.selectedLayerIds?.has(hit.id) && !this.isLayerLocked?.(hit.id)) {
            // scene3d: skip the whole-LAYER highlight (it would light up every
            // object in the scene). The per-OBJECT hover hint (drawSceneHoverHint,
            // driven by _updateSceneHoverHint) shows just the object under the
            // cursor instead, which is what a click selects.
            const hitLayer = this.engine.layers.find((l) => l.id === hit.id);
            if (!(hitLayer && hitLayer.type === 'scene3d')) {
              hoverHighlight = { layerId: hit.id, label: cfg.labels?.path ?? 'path' };
            }
          }
        }
      }
      // SG-5 hover-highlight state + redraw only on change (avoid churn).
      const prevHL = this._hoverHighlightKey || null;
      const nextHL = hoverHighlight ? `${hoverHighlight.layerId}` : null;
      this.hoverHighlight = hoverHighlight;
      this._hoverHighlightKey = nextHL;
      // Center helper marker state + redraw only on change.
      const prevCenter = this._hoverCenterKey || null;
      const nextCenterKey = nextCenter ? `${nextCenter.x.toFixed(2)},${nextCenter.y.toFixed(2)}` : null;
      this.hoverCenter = nextCenter;
      this._hoverCenterKey = nextCenterKey;
      if (prevHL !== nextHL || prevCenter !== nextCenterKey) this.draw();
      if (chipPoint) {
        this.hoverReadout = { x: chipPoint.x, y: chipPoint.y, label };
        const text = this._formatChipText('position', chipPoint);
        if (text != null) {
          this._hoverChipActive = true;
          this.showDragTooltip(text, e.clientX ?? 0, e.clientY ?? 0);
          // Pink feature label pinned at the point itself (e.g. "anchor").
          if (label && this.canvas) {
            const rect = this.canvas.getBoundingClientRect();
            const s = this.worldToScreen(chipPoint.x, chipPoint.y);
            this.showAnchorLabel(label, rect.left + s.x, rect.top + s.y);
          } else {
            this.hideAnchorLabel();
          }
        }
      } else {
        this.hoverReadout = null;
        if (this._hoverChipActive) {
          this._hoverChipActive = false;
          this.hideDragTooltip();
        }
      }
    }

    ensureFillLoupe() {
      if (this.fillLoupeEl) return this.fillLoupeEl;
      if (!this.canvas) return null;
      const root = document.createElement('div');
      root.className = 'fill-loupe';
      root.setAttribute('aria-hidden', 'true');
      const loupe = document.createElement('canvas');
      loupe.className = 'fill-loupe-magnifier';
      loupe.width = 96;
      loupe.height = 96;
      root.appendChild(loupe);
      document.body.appendChild(root);
      this.fillLoupeEl = root;
      this.fillLoupeMagEl = loupe;
      this.fillLoupeMagCtx = loupe.getContext('2d');
      return root;
    }

    hideFillLoupe() {
      if (this.fillLoupeEl) this.fillLoupeEl.style.display = 'none';
    }

    showFillLoupe(clientX, clientY) {
      const fillTools = ['fill', 'fill-erase', 'fill-pattern', 'fill-pattern-erase'];
      if (!fillTools.includes(this.activeTool)) {
        this.hideFillLoupe();
        return;
      }
      const root = this.ensureFillLoupe();
      if (!root || !this.canvas) return;
      const canvasRect = this.canvas.getBoundingClientRect();
      const inside =
        clientX >= canvasRect.left &&
        clientX <= canvasRect.right &&
        clientY >= canvasRect.top &&
        clientY <= canvasRect.bottom;
      if (!inside) {
        this.hideFillLoupe();
        return;
      }
      root.style.display = 'block';
      // position: fixed so clientX/clientY map directly — no parent-offset confusion
      root.style.left = `${clientX}px`;
      root.style.top = `${clientY}px`;

      // Render the magnifier with content sampled around the cursor.
      const ctx = this.fillLoupeMagCtx;
      const mag = this.fillLoupeMagEl;
      if (ctx && mag) {
        const ZOOM = 4;
        const mw = mag.width;
        const mh = mag.height;
        const sw = mw / ZOOM;
        const sh = mh / ZOOM;
        // canvas pixel coords under the cursor
        const cssX = clientX - canvasRect.left;
        const cssY = clientY - canvasRect.top;
        const ratioX = this.canvas.width / Math.max(1, canvasRect.width);
        const ratioY = this.canvas.height / Math.max(1, canvasRect.height);
        const srcX = cssX * ratioX - sw / 2;
        const srcY = cssY * ratioY - sh / 2;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, mw, mh);
        try {
          const src = this._loupeCleanCanvas || this.canvas;
          ctx.drawImage(src, srcX, srcY, sw, sh, 0, 0, mw, mh);
        } catch (_) {
          // Canvas not ready; ignore.
        }
        // Crosshair at the loupe center marking the fill point.
        ctx.save();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mw / 2 - 6, mh / 2);
        ctx.lineTo(mw / 2 + 6, mh / 2);
        ctx.moveTo(mw / 2, mh / 2 - 6);
        ctx.lineTo(mw / 2, mh / 2 + 6);
        ctx.stroke();
        ctx.restore();
      }

      // Place the magnifier in the canvas quadrant with the most space.
      // Root is at the cursor (0,0 = cursor), so offsets are from that point.
      const magW = this.fillLoupeMagEl?.width || 96;
      const magH = this.fillLoupeMagEl?.height || 96;
      const GAP = 18;
      const spaceRight = canvasRect.right - clientX;
      const spaceLeft = clientX - canvasRect.left;
      const spaceBelow = canvasRect.bottom - clientY;
      const spaceAbove = clientY - canvasRect.top;
      const placeRight = spaceRight >= magW + GAP || spaceRight >= spaceLeft;
      const placeBelow = spaceBelow >= magH + GAP || spaceBelow >= spaceAbove;
      const magEl = this.fillLoupeMagEl;
      if (magEl) {
        magEl.style.left = placeRight ? `${GAP}px` : `${-magW - GAP}px`;
        magEl.style.right = '';
        magEl.style.top = placeBelow ? `${GAP}px` : `${-magH - GAP}px`;
      }
    }

    isPrimitiveShapeType(type) {
      return type === 'rect' || type === 'oval' || type === 'polygon' || type === 'line';
    }

    getSelectedPrimitiveShapeLayer() {
      const layer = this.getSelectedShapeLayer();
      if (layer?.mask?.enabled) return null;
      const shapeType = this.getShapeMetaForLayer(layer, 0)?.shape?.type;
      return this.isPrimitiveShapeType(shapeType) ? layer : null;
    }

    // Arch-5: Pure cursor decision function. Returns `{ cursor, mode }` for
    // every branch the cooperative trio (updateCursor + updateHoverCursor +
    // _applyModifierCursorOverride) used to handle independently. The
    // existing entry points are thin wrappers that gather inputs, call this,
    // and write to the DOM.
    //
    // Branches covered:
    //   1. Modifier overrides (Alt+select → copy-plus, CMD+fill → microscope).
    //   2. Tool-default cursor (the original updateCursor() decision tree).
    //
    // The `shape-*` branch returns a sentinel { cursor: 'crosshair',
    // mode: 'shape-reticle' } — the live entry point still calls
    // `makeShapeReticleCursor(getThemeToken(...))` to honor the active theme,
    // since baking the data-URL here would couple this pure function to the
    // theme cache.
    recomputeCursor({
      tool,
      isPan = false,
      isLayerDrag = false,
      isSelecting = false,
      modState = { alt: false, meta: false },
    } = {}) {
      // 1. Modifier overrides (mirrors _applyModifierCursorOverride).
      const altHeld = Boolean(modState && modState.alt);
      const metaHeld = Boolean(modState && modState.meta);
      if (altHeld && tool === 'select' && !isLayerDrag && !isSelecting) {
        return { cursor: this.cursorDataUrl('copyPlus', 4, 4, 'copy'), mode: 'select-copy' };
      }
      if (metaHeld && tool === 'fill' && !isLayerDrag) {
        return { cursor: this.cursorDataUrl('microscope', 10, 14, 'crosshair'), mode: 'fill-pickup' };
      }
      // 2. Tool-default branches (mirrors original updateCursor()).
      if (tool === 'hand') {
        return { cursor: isPan ? 'grabbing' : 'grab', mode: 'hand' };
      }
      if (tool === 'pen') {
        return { cursor: this.cursorDataUrl('pen', 2, 19, 'crosshair'), mode: 'pen' };
      }
      if (`${tool}`.startsWith('shape-')) {
        // Sentinel — caller resolves the themed reticle cursor.
        return { cursor: 'crosshair', mode: 'shape-reticle' };
      }
      if (tool === 'algo-draw') {
        return { cursor: 'crosshair', mode: 'algo-draw' };
      }
      if (tool === 'type') {
        // I-beam for both contexts (over-text = edit, empty = create).
        return { cursor: 'text', mode: 'type' };
      }
      if (tool === 'scissor') {
        return { cursor: 'crosshair', mode: 'scissor' };
      }
      if (tool === 'fill' || tool === 'fill-erase' ||
          tool === 'fill-pattern' || tool === 'fill-pattern-erase') {
        return { cursor: this.cursorDataUrl('bucket', 20, 22, 'crosshair'), mode: 'fill' };
      }
      if (tool === 'direct') {
        return { cursor: this.cursorDataUrl('outline', 4, 4, 'auto'), mode: 'direct' };
      }
      if (tool === 'select') {
        return { cursor: this.cursorDataUrl('filled', 4, 4, 'auto'), mode: 'select' };
      }
      return { cursor: 'crosshair', mode: '' };
    }

    _gatherCursorInputs() {
      return {
        tool: this.activeTool,
        isPan: this.isPan,
        isLayerDrag: this.isLayerDrag,
        isSelecting: this.isSelecting,
        modState: this._modState || { alt: false, meta: false },
      };
    }

    updateCursor() {
      if (!this.canvas) return;
      const result = this.recomputeCursor(this._gatherCursorInputs());
      // Shape-reticle branch needs the live theme token; resolve it here so
      // recomputeCursor stays pure with respect to DOM/theme state.
      if (result.mode === 'shape-reticle') {
        this.setCanvasCursor(
          makeShapeReticleCursor(getThemeToken('--render-cursor-stroke', 'white')),
          'shape-reticle'
        );
        return;
      }
      this.setCanvasCursor(result.cursor, result.mode);
    }

    hexToRgb(hex) {
      if (typeof hex !== 'string') return { r: 56, g: 189, b: 248 };
      const raw = hex.trim().replace('#', '');
      const value =
        raw.length === 3
          ? raw
              .split('')
              .map((c) => `${c}${c}`)
              .join('')
          : raw;
      if (!/^[0-9a-fA-F]{6}$/.test(value)) return { r: 56, g: 189, b: 248 };
      return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16),
      };
    }

    // Parse a hex (#rgb/#rrggbb) OR an rgb()/rgba() string into {r,g,b}. The Draw-Order
    // stops can arrive as either form (hex from per-layer overlay colours, rgba() from
    // the renderer's own legend pass), so the halo needs to handle both.
    parseCssColor(str) {
      if (typeof str !== 'string') return { r: 56, g: 189, b: 248 };
      const m = str.trim().match(/rgba?\(([^)]+)\)/i);
      if (m) {
        const p = m[1].split(',').map((v) => parseFloat(v));
        return { r: Math.round(p[0]) || 0, g: Math.round(p[1]) || 0, b: Math.round(p[2]) || 0 };
      }
      return this.hexToRgb(str);
    }

    // Tint the slider thumb's ring/glow with the gradient colour at the current stop,
    // so the handle reads as the colour of the line being plotted right now.
    refreshDrawOrderHalo() {
      const slider = document.getElementById('draw-order-input');
      if (!slider) return;
      const start = this._drawOrderStartRgb || { r: 56, g: 189, b: 248 };
      const end = this._drawOrderEndRgb || { r: 245, g: 158, b: 11 };
      const fillRaw = slider.style.getPropertyValue('--draw-order-fill');
      const frac = fillRaw ? Math.max(0, Math.min(1, parseFloat(fillRaw) / 100)) : 1;
      const halo = this.mixRgb(start, end, frac);
      const haloCss = this.rgbToCss(halo, 1);
      slider.style.setProperty('--draw-order-halo', haloCss);
      this.updateDrawOrderThumbShape(slider, haloCss);
    }

    // Below 100% the handle swaps from a plain circle to a rounded "play" triangle
    // (so the bar reads as "there's more to reveal"), built from a tiny inline SVG since
    // ::-webkit-slider-thumb is a single pseudo-element — a background-image is the only
    // way to draw a shape whose fill/ring hug a non-circular silhouette the way the
    // circle's border hugs the circle. The path fills its 13x13 viewBox edge-to-edge —
    // the SAME way border-radius:50% fills the circle's own box — so there's no dead
    // transparent margin around it for the track to show through at low values (a
    // regression an earlier oversized-canvas version had). The outer glow is a CSS
    // `filter: drop-shadow` on the thumb (see components.css) instead of anything baked
    // into this SVG: drop-shadow follows the rendered silhouette and, like box-shadow,
    // isn't clipped to the box, so it can bleed outward the same way the circle's glow
    // does regardless of how big the (CSS-controlled) thumb box itself is. The two
    // stacked copies of the path below are just the ring: a dark separation stroke
    // behind (the circle's "0 0 0 2px black" ring) and the crisp halo-stroke + white
    // fill on top (the circle's border + background).
    updateDrawOrderThumbShape(slider, haloCss) {
      const pct = Number(slider.value);
      const isProgress = Number.isFinite(pct) && pct < 100;
      slider.classList.toggle('is-progress', isProgress);
      if (!isProgress) return;
      const fill = getThemeToken('--ui-text', '#ffffff');
      const path =
        'M0.8,2.3 L0.8,10.7 Q0.8,12 1.973,11.439 L11.488,6.888 ' +
        'Q12.3,6.5 11.488,6.112 L1.973,1.561 Q0.8,1 0.8,2.3 Z';
      const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 13 13'>` +
        `<path d='${path}' fill='${fill}' stroke='rgba(0,0,0,0.45)' stroke-width='2.2' stroke-linejoin='round'/>` +
        `<path d='${path}' fill='${fill}' stroke='${haloCss}' stroke-width='1.2' stroke-linejoin='round'/>` +
        `</svg>`;
      slider.style.setProperty('--draw-order-thumb-icon', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
    }

    mixRgb(a, b, t) {
      const clampT = Math.max(0, Math.min(1, t));
      return {
        r: Math.round(a.r + (b.r - a.r) * clampT),
        g: Math.round(a.g + (b.g - a.g) * clampT),
        b: Math.round(a.b + (b.b - a.b) * clampT),
      };
    }

    rgbToCss(rgb, alpha = 1) {
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    }

    getComplementRgb(rgb) {
      return {
        r: 255 - rgb.r,
        g: 255 - rgb.g,
        b: 255 - rgb.b,
      };
    }

    getLineSortStep(layer) {
      if (!layer || !layer.optimization || layer.optimization.bypassAll) return null;
      const steps = Array.isArray(layer.optimization.steps) ? layer.optimization.steps : [];
      return steps.find((step) => step && step.id === 'linesort') || null;
    }

    isLineSortApplied(layer) {
      const lineSort = this.getLineSortStep(layer);
      return Boolean(lineSort && lineSort.enabled && !lineSort.bypass);
    }

    hasLineSortOrderMetadata(path) {
      return Number.isFinite(path?.meta?.lineSortOrder);
    }

    getLineSortOverlaySecondaryColor(layers = []) {
      for (const layer of layers) {
        const step = this.getLineSortStep(layer);
        if (!step || !step.enabled || step.bypass) continue;
        if (typeof step.overlaySecondaryColor !== 'string') continue;
        const color = step.overlaySecondaryColor.trim();
        if (color) return color;
      }
      return '';
    }

    updateOptimizationOverlayLegend(show, startColor = '', endColor = '') {
      // The on-canvas legend has been retired in favour of the Draw-Order bar, which now
      // carries the start→end gradient (and whose palette button owns the colour
      // controls). Keep the legend element permanently hidden, but still resolve and
      // propagate the colours so the Draw-Order bar + eye stay in lock-step every render.
      const legend = document.getElementById('optimization-overlay-legend');
      if (legend) legend.classList.add('hidden');
      this.updateDrawOrderOverlayToggle(startColor, endColor);
    }

    // Eye toggle on the Draw-Order subpanel: closed + grey when the line-sort overlay is
    // off, an open eye outlined with the start→end print-order gradient when on. Colours
    // fall back to the overlay colour (and its complement) so they track the Settings
    // overlay colour even when no per-layer secondary colour is set.
    updateDrawOrderOverlayToggle(startColor = '', endColor = '') {
      // Resolve the start→end print-order colour pair the overlay legend uses:
      // explicit args win, else overlay colour → secondary override/complement.
      const baseRgb = this.hexToRgb(SETTINGS.optimizationOverlayColor || '#38bdf8');
      const override = (SETTINGS.optimizationOverlaySecondaryColor || '').trim();
      const start = startColor || this.rgbToCss(baseRgb, 1);
      const end = endColor || this.rgbToCss(override ? this.hexToRgb(override) : this.getComplementRgb(baseRgb), 1);

      // Paint the always-visible Draw-Order slider bar with that same start→end
      // gradient so the bar itself is identical to the legend.
      const slider = document.getElementById('draw-order-input');
      if (slider) {
        slider.style.setProperty('--draw-order-start', start);
        slider.style.setProperty('--draw-order-end', end);
      }
      // Remember the stops as parsed RGB so the thumb halo can sample the gradient
      // colour at whatever fraction the handle is currently parked on.
      this._drawOrderStartRgb = this.parseCssColor(start);
      this._drawOrderEndRgb = this.parseCssColor(end);
      this.refreshDrawOrderHalo();

      const eye = document.getElementById('draw-order-overlay-toggle');
      if (!eye) return;
      const on = SETTINGS.lineSortOverlayVisible === true;
      eye.classList.toggle('is-on', on);
      eye.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (!on) return;
      const s = document.getElementById('draw-order-eye-grad-start');
      const e = document.getElementById('draw-order-eye-grad-end');
      if (s) s.setAttribute('stop-color', start);
      if (e) e.setAttribute('stop-color', end);
    }

    getModifierState(e = {}) {
      const mods = SETTINGS.touchModifiers || {};
      const isTouchPointer = e.pointerType && e.pointerType !== 'mouse';
      const touchShift = isTouchPointer && Boolean(mods.shift);
      const touchAlt = isTouchPointer && Boolean(mods.alt);
      const touchMeta = isTouchPointer && Boolean(mods.meta);
      const touchCtrl = isTouchPointer && Boolean(mods.ctrl);
      const touchPan = isTouchPointer && Boolean(mods.pan);
      return {
        shift: Boolean(e.shiftKey || touchShift),
        alt: Boolean(e.altKey || touchAlt),
        meta: Boolean(e.metaKey || e.ctrlKey || touchMeta || touchCtrl),
        ctrl: Boolean(e.ctrlKey || touchCtrl),
        pan: Boolean(touchPan),
      };
    }

    wantsPan(e, modifiers = this.getModifierState(e)) {
      return this.activeTool === 'hand' || modifiers.pan || e.button === 1;
    }

    isTouchPointer(e) {
      return e?.pointerType === 'touch';
    }

    updateTouchPointer(e) {
      if (!this.isTouchPointer(e)) return;
      this.touchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    removeTouchPointer(e) {
      if (!this.isTouchPointer(e)) return;
      this.touchPointers.delete(e.pointerId);
    }

    canStartTouchGesture() {
      return !(
        this.isLayerDrag ||
        this.isSelecting ||
        this.isLassoSelecting ||
        this.isScissor ||
        this.shapeCornerDrag ||
        this.directDrag ||
        this.isDirectMarquee ||
        this.isPenDragging ||
        this.isLightDrag
      );
    }

    getTouchGesturePair() {
      if (this.touchPointers.size < 2) return null;
      const points = Array.from(this.touchPointers.values());
      return [points[0], points[1]];
    }

    startTouchGesture() {
      const pair = this.getTouchGesturePair();
      if (!pair) return false;
      const [a, b] = pair;
      const center = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
      const distance = Math.max(8, Math.hypot(b.x - a.x, b.y - a.y));
      this.cancelActiveInteractionsForTouchGesture();
      this.touchGesture = {
        startDistance: distance,
        startScale: this.scale,
        worldCenter: {
          x: (center.x - this.offsetX) / this.scale,
          y: (center.y - this.offsetY) / this.scale,
        },
      };
      return true;
    }

    updateTouchGesture() {
      const pair = this.getTouchGesturePair();
      if (!this.touchGesture || !pair) return false;
      const [a, b] = pair;
      const center = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
      const distance = Math.max(8, Math.hypot(b.x - a.x, b.y - a.y));
      const ratio = distance / Math.max(1e-6, this.touchGesture.startDistance);
      const nextScale = Math.max(0.1, Math.min(this.touchGesture.startScale * ratio, 20));
      this.scale = nextScale;
      this.offsetX = center.x - this.touchGesture.worldCenter.x * nextScale;
      this.offsetY = center.y - this.touchGesture.worldCenter.y * nextScale;
      this.draw();
      return true;
    }

    stopTouchGesture() {
      this.touchGesture = null;
      this.updateCursor();
    }

    clearTouchHold() {
      if (this.touchHoldTimer) {
        clearTimeout(this.touchHoldTimer);
        this.touchHoldTimer = null;
      }
      this.touchHoldPending = null;
      this.touchHoldStartClient = null;
    }

    cancelActiveInteractionsForTouchGesture() {
      this.clearTouchHold();
      this.isPan = false;
      this.isLayerDrag = false;
      this._clearMorphDrag();
      this.dragMode = null;
      this.activeHandle = null;
      this.tempTransform = null;
      this.snap = null;
      this.guides = null;
      this.isLightDrag = false;
      this.isPenDragging = false;
      this.isPenCloseDragging = false;
      this.penDragAnchor = null;
      this.penDragStart = null;
      this.penDragMirrorLock = null;
      this.shapeCornerDrag = null;
      this.freeformCornerDrag = null;
      this.directDrag = null;
      this.isScissor = false;
      this.scissorStart = null;
      this.scissorEnd = null;
      this.isSelecting = false;
      this.selectionRect = null;
      this.selectionStart = null;
      this.isLassoSelecting = false;
      this.lassoPath = null;
      this.isDirectMarquee = false;
      this.directMarqueeStart = null;
      this.directMarqueeRect = null;
    }

    snapPenAngle(from, to) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      if (!dist) return { ...to };
      const step = Math.PI / 4;
      const angle = Math.atan2(dy, dx);
      const snapped = Math.round(angle / step) * step;
      return { x: from.x + Math.cos(snapped) * dist, y: from.y + Math.sin(snapped) * dist };
    }

    snapScissorAngle(from, to, stepDeg = 15) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      if (!dist) return { ...to };
      const step = (stepDeg * Math.PI) / 180;
      const angle = Math.atan2(dy, dx);
      const snapped = Math.round(angle / step) * step;
      return { x: from.x + Math.cos(snapped) * dist, y: from.y + Math.sin(snapped) * dist };
    }

    _attachShiftDragListener() {
      this._detachShiftDragListener();
      this._shiftKeyUpHandler = (ev) => {
        if (ev.key !== 'Shift') return;
        if (!this.isLayerDrag || this.dragMode !== 'move' || !this.lastDragWorld) return;
        const dx = this.lastDragWorld.x - this.dragStart.x;
        const dy = this.lastDragWorld.y - this.dragStart.y;
        this.tempTransform = { dx, dy, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };
        this.draw();
      };
      document.addEventListener('keyup', this._shiftKeyUpHandler);
    }

    _detachShiftDragListener() {
      if (this._shiftKeyUpHandler) {
        document.removeEventListener('keyup', this._shiftKeyUpHandler);
        this._shiftKeyUpHandler = null;
      }
    }

    createAnchor(point) {
      return { x: point.x, y: point.y, in: null, out: null };
    }

    setAnchorHandles(anchor, target) {
      if (!anchor || !target) return;
      const vec = { x: target.x - anchor.x, y: target.y - anchor.y };
      anchor.out = { x: anchor.x + vec.x, y: anchor.y + vec.y };
      anchor.in = { x: anchor.x - vec.x, y: anchor.y - vec.y };
    }

    cubicAt(p0, c1, c2, p1, t) {
      const u = 1 - t;
      const tt = t * t;
      const uu = u * u;
      const uuu = uu * u;
      const ttt = tt * t;
      return {
        x: uuu * p0.x + 3 * uu * t * c1.x + 3 * u * tt * c2.x + ttt * p1.x,
        y: uuu * p0.y + 3 * uu * t * c1.y + 3 * u * tt * c2.y + ttt * p1.y,
      };
    }

    sampleCubic(p0, c1, c2, p1) {
      const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const handles = Math.hypot(c1.x - p0.x, c1.y - p0.y) + Math.hypot(c2.x - p1.x, c2.y - p1.y);
      const rough = Math.max(dist, handles);
      const steps = Math.min(120, Math.max(8, Math.round(rough / 4)));
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        pts.push(this.cubicAt(p0, c1, c2, p1, i / steps));
      }
      return pts;
    }

    buildPenPathFromAnchors(anchors, closed = false) {
      const shared = window.Vectura?.GeometryUtils?.buildPolylineFromAnchors;
      if (shared) return shared(anchors, closed);
      if (!Array.isArray(anchors) || anchors.length < 2) return [];
      const pts = [];
      const count = anchors.length;
      const emit = (a, b) => {
        let seg;
        if (!a.out && !b.in) seg = [a, b];
        else seg = this.sampleCubic(a, a.out || a, b.in || b, b);
        if (pts.length) seg.shift();
        pts.push(...seg);
      };
      for (let i = 0; i < count - 1; i++) emit(anchors[i], anchors[i + 1]);
      if (closed && count >= 2) emit(anchors[count - 1], anchors[0]);
      return pts;
    }

    handlePenDown(world, e) {
      if (!world) return;
      const modifiers = this.getModifierState(e);
      const closeTol = 12 / this.scale;

      // Manual double-click detection — pointerdown does not reliably carry e.detail > 1
      const now = performance.now();
      const prev = this._penLastClick;
      const screenX = e.clientX ?? 0;
      const screenY = e.clientY ?? 0;
      const isDoubleClick = prev &&
        (now - prev.time) < 400 &&
        Math.hypot(screenX - prev.x, screenY - prev.y) < 8;
      this._penLastClick = { time: now, x: screenX, y: screenY };

      if (!this.penDraft) {
        this.penDraft = { anchors: [this.createAnchor(this.snapPointToGrid(world))], closed: false };
        this.isPenDragging = true;
        this.penDragAnchor = 0;
        this.penDragStart = world;
        this.penDragMirrorLock = null;
        this.penPreview = null;
        this.canvas?.focus();
        this.draw();
        return;
      }

      const anchors = this.penDraft.anchors || [];
      if (!anchors.length) {
        anchors.push(this.createAnchor(world));
        this.penDraft.anchors = anchors;
        this.isPenDragging = true;
        this.penDragAnchor = anchors.length - 1;
        this.penDragStart = world;
        this.penDragMirrorLock = null;
        this.draw();
        return;
      }

      const first = anchors[0];
      const lastAnchor = anchors[anchors.length - 1];
      let next = this.snapPointToGrid({ x: world.x, y: world.y });
      if (modifiers.shift) next = this.snapPenAngle(lastAnchor, next);
      const distToStart = Math.hypot(next.x - first.x, next.y - first.y);
      const snapTol = 5 / this.scale;
      const isSnapClose = !modifiers.meta && anchors.length >= 2 &&
        Math.hypot(world.x - first.x, world.y - first.y) <= snapTol;

      if (anchors.length >= 2 && (isSnapClose || (distToStart <= closeTol && isDoubleClick))) {
        // Remove the phantom anchor added on the first click of this double-click if it
        // landed near the origin — it was not intended as a real point.
        if (isDoubleClick && anchors.length > 2) {
          const phantom = anchors[anchors.length - 1];
          if (Math.hypot(phantom.x - first.x, phantom.y - first.y) <= closeTol) {
            anchors.pop();
            this.penDraft.anchors = anchors;
          }
        }
        this.penDraft.closed = true;
        // Enter close-drag: user can drag to curve the closing segment before commit.
        this.isPenDragging = true;
        this.isPenCloseDragging = true;
        this.penDragAnchor = 0;
        this.penDragStart = { x: first.x, y: first.y };
        this.penDragMirrorLock = null;
        this.draw();
        return;
      }
      const anchor = this.createAnchor(next);
      anchors.push(anchor);
      this.penDraft.anchors = anchors;
      this.isPenDragging = true;
      this.penDragAnchor = anchors.length - 1;
      this.penDragStart = next;
      this.penDragMirrorLock = null;
      if (isDoubleClick) {
        this.commitPenPath();
        return;
      }
      this.draw();
    }

    commitPenPath() {
      const anchors = this.penDraft?.anchors || [];
      if (!this.penDraft || anchors.length < 2) {
        this.cancelPenPath();
        return;
      }
      if (this.penPurpose === 'select') {
        if (anchors.length < 3) {
          this.cancelPenPath();
          return;
        }
        const path = this.buildPenPathFromAnchors(anchors, true);
        this.selectLayersByPolygon(path);
        this.penPurpose = 'draw';
      } else {
        const path = this.buildPenPathFromAnchors(anchors, this.penDraft.closed);
        if (this.onPenComplete) {
          const anchorPayload = anchors.map((anchor) => ({
            x: anchor.x,
            y: anchor.y,
            in: anchor.in ? { x: anchor.in.x, y: anchor.in.y } : null,
            out: anchor.out ? { x: anchor.out.x, y: anchor.out.y } : null,
          }));
          this.onPenComplete({
            path,
            anchors: anchorPayload,
            closed: Boolean(this.penDraft.closed),
          });
        }
      }
      this.penDraft = null;
      this.penPreview = null;
      this.isPenDragging = false;
      this.isPenCloseDragging = false;
      this.penDragAnchor = null;
      this.penDragStart = null;
      this.penDragMirrorLock = null;
      this._penLastClick = null;
      this.penSnapToOrigin = false;
      this.draw();
    }

    cancelPenPath() {
      this.penDraft = null;
      this.penPreview = null;
      this.isPenDragging = false;
      this.isPenCloseDragging = false;
      this.penDragAnchor = null;
      this.penDragStart = null;
      this.penDragMirrorLock = null;
      this._penLastClick = null;
      this.penSnapToOrigin = false;
      this.penPurpose = 'draw';
      this.draw();
    }

    undoPenPoint() {
      if (!this.penDraft || !this.penDraft.anchors || !this.penDraft.anchors.length) return;
      this.penDraft.anchors.pop();
      if (!this.penDraft.anchors.length) this.penDraft = null;
      this.draw();
    }

    isShapeTool(tool = this.activeTool) {
      return tool === 'shape-rect' || tool === 'shape-oval' || tool === 'shape-polygon' || tool === 'shape-line';
    }

    getShapeKindForTool(tool = this.activeTool) {
      if (tool === 'shape-rect') return 'rect';
      if (tool === 'shape-oval') return 'oval';
      if (tool === 'shape-polygon') return 'polygon';
      if (tool === 'shape-line') return 'line';
      return null;
    }

    buildShapeFromDraft(start, end, modifiers = {}, options = {}) {
      const kind = options.kind || this.getShapeKindForTool();
      if (!start || !end || !kind) return null;
      const fromCenter = Boolean(modifiers.alt || modifiers.meta);
      const constrain = Boolean(modifiers.shift);
      if (kind === 'rect') {
        let x1 = start.x;
        let y1 = start.y;
        let x2 = end.x;
        let y2 = end.y;
        if (fromCenter) {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          x1 = start.x - dx;
          y1 = start.y - dy;
          x2 = start.x + dx;
          y2 = start.y + dy;
        }
        if (constrain) {
          const width = x2 - x1;
          const height = y2 - y1;
          const size = Math.max(Math.abs(width), Math.abs(height));
          x2 = x1 + Math.sign(width || 1) * size;
          y2 = y1 + Math.sign(height || 1) * size;
        }
        return {
          type: 'rect',
          x1,
          y1,
          x2,
          y2,
          cornerRadii: [0, 0, 0, 0],
        };
      }
      if (kind === 'oval') {
        const cx = fromCenter ? start.x : (start.x + end.x) * 0.5;
        const cy = fromCenter ? start.y : (start.y + end.y) * 0.5;
        let rx = Math.abs(fromCenter ? end.x - start.x : (end.x - start.x) * 0.5);
        let ry = Math.abs(fromCenter ? end.y - start.y : (end.y - start.y) * 0.5);
        if (constrain) {
          const radius = Math.max(rx, ry);
          rx = radius;
          ry = radius;
        }
        return { type: 'oval', cx, cy, rx, ry };
      }
      if (kind === 'polygon') {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        return {
          type: 'polygon',
          cx: start.x,
          cy: start.y,
          radius: Math.max(0.1, Math.hypot(dx, dy)),
          rotation: constrain ? Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12) : Math.atan2(dy, dx),
          sides: Math.max(3, Math.round(this.shapeDraftSides || 6)),
          cornerRadii: new Array(Math.max(3, Math.round(this.shapeDraftSides || 6))).fill(0),
        };
      }
      if (kind === 'line') {
        let x2 = end.x;
        let y2 = end.y;
        if (constrain) {
          const dx = end.x - start.x;
          const dy = end.y - start.y;
          const angle = Math.atan2(dy, dx);
          const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          const length = Math.hypot(dx, dy);
          x2 = start.x + Math.cos(snappedAngle) * length;
          y2 = start.y + Math.sin(snappedAngle) * length;
        }
        return { type: 'line', x1: start.x, y1: start.y, x2, y2 };
      }
      return null;
    }

    buildShapePath(shape) {
      const normalizedShape = cloneShape(shape);
      const anchors = buildShapeAnchors(normalizedShape);
      if (!anchors.length) return null;
      const closed = !isOpenShape(normalizedShape);
      const path = this.buildPenPathFromAnchors(anchors, closed);
      path.meta = {
        kind: 'shape',
        closed,
        anchors: anchors.map((anchor) => cloneAnchor(anchor)),
        shape: normalizedShape,
      };
      return path;
    }

    setShapePathFromMeta(meta) {
      if (!this.directSelection || !meta?.shape) return false;
      const path = this.buildShapePath(meta.shape);
      if (!path?.meta) return false;
      this.directSelection.anchors = path.meta.anchors.map((anchor) => cloneAnchor(anchor));
      this.directSelection.closed = path.meta.closed !== false;
      this.directSelection.meta = { ...this.directSelection.meta, ...path.meta };
      this.applyDirectPath();
      return true;
    }

    startShapeDraft(world, e) {
      const modifiers = this.getModifierState(e);
      const kind = this.getShapeKindForTool();
      if (!kind || !world) return false;
      this.shapeDraft = {
        kind,
        start: { x: world.x, y: world.y },
        end: { x: world.x, y: world.y },
        modifiers,
      };
      if (kind === 'polygon') this.shapeDraftSides = Math.max(3, this.shapeDraftSides || 6);
      this.draw();
      return true;
    }

    updateShapeDraft(world, e) {
      if (!this.shapeDraft || !world) return false;
      this.shapeDraft.end = { x: world.x, y: world.y };
      this.shapeDraft.modifiers = this.getModifierState(e);
      this.draw();
      return true;
    }

    adjustShapeDraftSides(delta) {
      if (!this.shapeDraft || this.shapeDraft.kind !== 'polygon') return false;
      this.shapeDraftSides = Math.max(3, Math.min(32, Math.round((this.shapeDraftSides || 6) + delta)));
      this.draw();
      return true;
    }

    getDraftShape() {
      if (!this.shapeDraft) return null;
      return this.buildShapeFromDraft(this.shapeDraft.start, this.shapeDraft.end, this.shapeDraft.modifiers, {
        kind: this.shapeDraft.kind,
      });
    }

    commitShapeDraft() {
      const shape = this.getDraftShape();
      if (!shape) {
        this.cancelShapeDraft();
        return;
      }
      const path = this.buildShapePath(shape);
      if (path && this.onShapeComplete) {
        this.onShapeComplete({
          path,
          closed: path.meta?.closed !== false,
          shape,
        });
      }
      this.shapeDraft = null;
      this.draw();
      if (this.onClearTransientModifiers) this.onClearTransientModifiers();
    }

    cancelShapeDraft() {
      this.shapeDraft = null;
      this.draw();
      if (this.onClearTransientModifiers) this.onClearTransientModifiers();
    }

    isAlgoDrawTool(tool = this.activeTool) {
      return tool === 'algo-draw';
    }

    startAlgoDraft(world) {
      this.algoDraft = { start: { x: world.x, y: world.y }, end: { x: world.x, y: world.y } };
      this.draw();
      return true;
    }

    updateAlgoDraft(world) {
      if (!this.algoDraft) return false;
      this.algoDraft.end = { x: world.x, y: world.y };
      this.draw();
      return true;
    }

    commitAlgoDraft() {
      const d = this.algoDraft;
      if (!d) return;
      const x = Math.min(d.start.x, d.end.x);
      const y = Math.min(d.start.y, d.end.y);
      const w = Math.abs(d.end.x - d.start.x);
      const h = Math.abs(d.end.y - d.start.y);
      this.algoDraft = null;
      if (this.onAlgoDrawComplete && w > 5 && h > 5) {
        this.onAlgoDrawComplete({ algoType: this.algoDraftType, rect: { x, y, w, h } });
      }
      this.draw();
    }

    cancelAlgoDraft() {
      this.algoDraft = null;
      this.draw();
    }

    canEditSourceGeometry(layer) {
      return Boolean(layer && !layer.isGroup && layer.type === 'shape');
    }

    getShapeMetaForLayer(layer, pathIndex = 0) {
      if (!layer) return null;
      const sourcePath = this.canEditSourceGeometry(layer) && Array.isArray(layer.sourcePaths)
        ? layer.sourcePaths[pathIndex]
        : null;
      if (sourcePath?.meta?.shape) return sourcePath.meta;
      const path = Array.isArray(layer.paths) ? layer.paths[pathIndex] : null;
      if (path?.meta?.shape) return path.meta;
      const displayPath = Array.isArray(layer.displayPaths) ? layer.displayPaths[pathIndex] : null;
      if (displayPath?.meta?.shape) return displayPath.meta;
      return null;
    }

    getSelectedShapeLayer() {
      const layers = this.getSelectedLayers();
      if (layers.length !== 1) return null;
      const layer = layers[0];
      return this.getShapeMetaForLayer(layer, 0)?.shape ? layer : null;
    }

    getShapeCornerHandles(layer, pathIndex = 0, temp = null) {
      const meta = this.getShapeMetaForLayer(layer, pathIndex);
      if (!meta?.shape) return [];
      const descriptors = getCornerDescriptors(meta.shape);
      return descriptors.map((descriptor) => ({
        ...descriptor,
        vertex: this.transformShapeSourcePoint(descriptor.vertex, layer, temp),
        inward: this.transformShapeDirection(descriptor, layer, temp),
        point: this.transformShapeSourcePoint(getShapeCornerHandlePosition(descriptor, this.scale), layer, temp),
      }));
    }

    hitShapeCornerHandle(world, layer, pathIndex = 0) {
      const handles = this.getShapeCornerHandles(layer, pathIndex);
      const tolSq = Math.pow(7 / this.scale, 2);
      for (let i = 0; i < handles.length; i++) {
        if (this.distanceToPointSq(world, handles[i].point) <= tolSq) return handles[i];
      }
      return null;
    }

    // Vertex indices whose corner is part of the current direct multi-selection.
    // Selected anchors map to their nearest shape vertex, so this works even
    // when some corners are rounded (a rounded corner is 2 anchors, both nearest
    // their shared vertex).
    _selectedCornerIndices(shape) {
      const sel = this.directSelection;
      if (!shape || !sel?.selectedIndices?.size || !Array.isArray(sel.anchors)) return new Set();
      const descriptors = getCornerDescriptors(shape);
      if (!descriptors.length) return new Set();
      const set = new Set();
      for (const ai of sel.selectedIndices) {
        const a = sel.anchors[ai];
        if (!a) continue;
        let best = -1;
        let bd = Infinity;
        descriptors.forEach((d, i) => {
          const dx = d.vertex.x - a.x;
          const dy = d.vertex.y - a.y;
          const dd = dx * dx + dy * dy;
          if (dd < bd) { bd = dd; best = i; }
        });
        if (best >= 0) set.add(best);
      }
      return set;
    }

    // After a rounded-corner rebuild the anchor count changes, so re-derive the
    // selected-anchor set from the persistent vertex set (keeps the multi-corner
    // selection visually intact through the drag).
    _reselectCornerAnchors(cornerSet, shape = this.shapeCornerDrag?.shape) {
      const sel = this.directSelection;
      if (!sel || !Array.isArray(sel.anchors) || !cornerSet) return;
      const descriptors = getCornerDescriptors(shape);
      if (!descriptors.length) return;
      const next = new Set();
      sel.anchors.forEach((a, ai) => {
        let best = -1;
        let bd = Infinity;
        descriptors.forEach((d, i) => {
          const dx = d.vertex.x - a.x;
          const dy = d.vertex.y - a.y;
          const dd = dx * dx + dy * dy;
          if (dd < bd) { bd = dd; best = i; }
        });
        if (best >= 0 && cornerSet.has(best)) next.add(ai);
      });
      sel.selectedIndices = next;
    }

    beginShapeCornerDrag(layer, pathIndex, corner, scope = 'all', cornerSet = null, world = null) {
      if (!layer || !corner) return false;
      const meta = this.getShapeMetaForLayer(layer, pathIndex);
      if (!meta?.shape) return false;
      this.shapeCornerDrag = {
        layerId: layer.id,
        pathIndex,
        scope,
        cornerIndex: corner.index,
        cornerSet: scope === 'selected' && cornerSet ? new Set(cornerSet) : null,
        shape: cloneShape(meta.shape),
        historyPushed: false,
      };
      // Delta-based drag mapping, anchored at the grab point: the grabbed
      // corner keeps its current radius until the pointer actually moves, so
      // a re-grab of an already-reshaped corner never jumps. When the grab
      // position isn't known (API callers), assume the pointer sits exactly
      // on the drawn widget.
      const descriptor = getCornerDescriptors(this.shapeCornerDrag.shape)[corner.index];
      if (descriptor) {
        this.shapeCornerDrag.startRadius = descriptor.radius;
        const drawnDist = Math.max(
          SHAPE_CORNER_HANDLE_MIN / Math.max(this.scale, 0.01),
          cornerWidgetDistance(descriptor.radius, descriptor.sinHalf, descriptor.tanHalf, descriptor.cornerType)
        );
        if (world) {
          const localWorld = this.inverseShapeSourcePoint(world, layer);
          this.shapeCornerDrag.pointerBase = dot(
            { x: localWorld.x - descriptor.vertex.x, y: localWorld.y - descriptor.vertex.y },
            descriptor.inward
          );
        } else {
          this.shapeCornerDrag.pointerBase = drawnDist;
        }
      }
      if (scope === 'single') {
        this.selectLayer(layer);
        this.setDirectSelection(layer, pathIndex);
      } else if (scope === 'selected') {
        // Keep the existing multi-corner direct selection intact.
        this.selectLayer(layer);
      } else {
        this.selectLayer(layer);
      }
      return true;
    }

    updateShapeCornerDrag(world) {
      if (!this.shapeCornerDrag || !world) return false;
      const layer = this.engine.layers.find((entry) => entry.id === this.shapeCornerDrag.layerId);
      if (!layer) return false;
      this.shapeCornerDrag.lastWorld = { x: world.x, y: world.y };
      // A real drag is not the first click of a double-click.
      this._cornerWidgetLastClick = null;
      const descriptors = getCornerDescriptors(this.shapeCornerDrag.shape);
      const descriptor = descriptors[this.shapeCornerDrag.cornerIndex];
      if (!descriptor) return false;
      const localWorld = this.inverseShapeSourcePoint(world, layer);
      const projected = Math.max(0, dot(
        { x: localWorld.x - descriptor.vertex.x, y: localWorld.y - descriptor.vertex.y },
        descriptor.inward
      ));
      if (this.shapeCornerDrag.pointerBase == null) this.shapeCornerDrag.pointerBase = projected;
      const nextRadius = Math.max(0,
        (this.shapeCornerDrag.startRadius || 0) +
        (projected - this.shapeCornerDrag.pointerBase) * cornerDragSlope(descriptor.sinHalf));
      const currentRadii = getShapeRadii(this.shapeCornerDrag.shape, descriptors.length);
      if (this.shapeCornerDrag.scope === 'single') {
        currentRadii[this.shapeCornerDrag.cornerIndex] = clamp(nextRadius, 0, descriptor.maxRadius);
      } else if (this.shapeCornerDrag.scope === 'selected') {
        // Round every selected corner to the same dragged radius (each clamped
        // to its own geometric maximum). Already-rounded corners snap to it.
        const set = this.shapeCornerDrag.cornerSet || new Set([this.shapeCornerDrag.cornerIndex]);
        descriptors.forEach((entry, index) => {
          if (set.has(index)) currentRadii[index] = clamp(nextRadius, 0, entry.maxRadius);
        });
      } else {
        descriptors.forEach((entry, index) => {
          currentRadii[index] = clamp(nextRadius, 0, entry.maxRadius);
        });
      }
      this.shapeCornerDrag.shape.cornerRadii = currentRadii;
      if (this._dragCursorPos) {
        const _dr = clamp(nextRadius, 0, descriptor.maxRadius);
        this.showDragTooltip(cornerRadiusLabel(_dr), this._dragCursorPos.x, this._dragCursorPos.y);
      }
      // Flag whichever corner(s) this drag actually touches that have hit
      // their geometric max, so the draw pass can highlight the fillet red.
      const touchedIndices = this.shapeCornerDrag.scope === 'single'
        ? [this.shapeCornerDrag.cornerIndex]
        : this.shapeCornerDrag.scope === 'selected'
          ? Array.from(this.shapeCornerDrag.cornerSet || [this.shapeCornerDrag.cornerIndex])
          : descriptors.map((_, index) => index);
      const maxArcs = [];
      touchedIndices.forEach((index) => {
        const entry = descriptors[index];
        if (!entry) return;
        const rEff = currentRadii[index] || 0;
        if (rEff > 1e-4 && entry.maxRadius > 1e-4 && rEff >= entry.maxRadius - 1e-3) {
          const arc = buildFilletArc(entry, rEff, entry.cornerType);
          if (arc) maxArcs.push(arc);
        }
      });
      this.shapeCornerDrag.maxArcs = maxArcs;
      return this._flushShapeCornerDragShape();
    }

    // Push-once history + apply for the in-progress shape corner drag's
    // snapshot shape. Split out of updateShapeCornerDrag so a mid-drag style
    // cycle (Up/Down) can flush even before the first pointer move.
    _flushShapeCornerDragShape() {
      const drag = this.shapeCornerDrag;
      if (!drag) return false;
      const layer = this.engine.layers.find((entry) => entry.id === drag.layerId);
      if (!layer) return false;
      if (!drag.historyPushed) {
        if ((drag.scope === 'single' || drag.scope === 'selected') && this.onDirectEditStart) this.onDirectEditStart();
        if (drag.scope === 'all' && this.onCommitTransform) this.onCommitTransform();
        drag.historyPushed = true;
      }
      if (drag.scope === 'single' || drag.scope === 'selected') {
        const nextMeta = this.directSelection?.meta ? { ...this.directSelection.meta, shape: cloneShape(drag.shape) } : null;
        if (!nextMeta) return false;
        this.setShapePathFromMeta(nextMeta);
        if (drag.scope === 'selected') this._reselectCornerAnchors(drag.cornerSet, drag.shape);
      } else {
        const meta = this.getShapeMetaForLayer(layer, drag.pathIndex);
        if (!meta?.shape) return false;
        meta.shape = cloneShape(drag.shape);
        const nextPath = this.buildShapePath(meta.shape);
        const sourcePaths = this.ensureLayerSourcePaths(layer);
        sourcePaths[drag.pathIndex] = nextPath;
        layer.sourcePaths = sourcePaths;
        this.engine.generate(layer.id);
      }
      this.draw();
      return true;
    }

    endShapeCornerDrag() {
      if (!this.shapeCornerDrag) return;
      // Commit only when the drag actually changed something (historyPushed) —
      // a plain widget click must stay cheap so the second click of a
      // double-click lands inside the detection window. Fires for every scope;
      // 'selected' previously skipped the refresh, leaving panels stale.
      const changed = this.shapeCornerDrag.historyPushed;
      this.shapeCornerDrag = null;
      if (changed && this.onDirectEditCommit) this.onDirectEditCommit();
      this.hideDragTooltip();
      this.draw();
    }

    // True while a Live Corner widget drag (shape or freeform) is in progress —
    // gates the Up/Down arrow-key corner-style cycling in shortcuts.js.
    isCornerDragActive() {
      return Boolean(this.shapeCornerDrag || this.freeformCornerDrag);
    }

    // Live Corners: pressing Up/Down while dragging a corner
    // widget cycles the corner style mid-drag; the cursor swaps to show the
    // style now being applied and the in-progress radius is re-applied with
    // the new geometry.
    cycleActiveCornerDragType(step = 1) {
      if (this.shapeCornerDrag) {
        const drag = this.shapeCornerDrag;
        const descriptors = getCornerDescriptors(drag.shape);
        if (!descriptors.length) return false;
        const types = getShapeCornerTypes(drag.shape, descriptors.length);
        const next = nextCornerType(types[drag.cornerIndex], step);
        const touched = drag.scope === 'single'
          ? [drag.cornerIndex]
          : drag.scope === 'selected'
            ? Array.from(drag.cornerSet || [drag.cornerIndex])
            : descriptors.map((_, index) => index);
        touched.forEach((index) => {
          if (index >= 0 && index < types.length) types[index] = next;
        });
        drag.shape.cornerTypes = types;
        this.setCanvasCursor(this.cursorDataUrl('cornerRadius', 4, 4, 'pointer', next));
        // No pointer move yet: still flush the style change through the live
        // meta (with its history push) — otherwise a cycle-then-release would
        // silently discard the edit.
        if (drag.lastWorld) this.updateShapeCornerDrag(drag.lastWorld);
        else this._flushShapeCornerDragShape();
        return true;
      }
      if (this.freeformCornerDrag) {
        const drag = this.freeformCornerDrag;
        const next = nextCornerType(drag.cornerType, step);
        drag.cornerType = next;
        (drag.corners || []).forEach((corner) => {
          corner.cornerType = next;
          // Persist on the drag's source anchors too, so releasing at radius 0
          // still keeps the chosen style for the next drag.
          const anchor = drag.originalAnchors?.[corner.anchorIndex];
          if (anchor) anchor.cornerType = next;
        });
        this.setCanvasCursor(this.cursorDataUrl('cornerRadius', 4, 4, 'pointer', next));
        // lastRawRadius ?? 0 so a cycle before the first pointer move still
        // persists the style (radius-0 apply keeps the anchors, pushes history).
        this._applyFreeformCornerRadius(drag.lastRawRadius ?? 0);
        return true;
      }
      return false;
    }

    // Manual double-click tracking for corner widgets — pointerdown does not
    // reliably carry e.detail > 1 (same rationale as the pen tool's detector).
    // Keyed per-widget so two quick clicks on different corners don't count.
    _isCornerWidgetDoubleClick(e, key) {
      const now = performance.now();
      const prev = this._cornerWidgetLastClick;
      const x = e.clientX ?? 0;
      const y = e.clientY ?? 0;
      const isDouble = Boolean(prev && prev.key === key &&
        (now - prev.time) < 400 && Math.hypot(x - prev.x, y - prev.y) < 8);
      this._cornerWidgetLastClick = isDouble ? null : { key, time: now, x, y };
      return isDouble;
    }

    // Corner indices a Live Corner edit applies to, mirroring drag scoping:
    // 'selected' → the multi-corner selection, 'all' → every corner,
    // otherwise just the clicked corner.
    _shapeCornerTargets(scope, cornerSet, cornerIndex, count) {
      const setSize = cornerSet ? (cornerSet.size ?? cornerSet.length ?? 0) : 0;
      if (scope === 'selected' && setSize) return Array.from(cornerSet);
      if (scope === 'all') return Array.from({ length: count }, (_, index) => index);
      return [cornerIndex];
    }

    // Shared history + apply plumbing for non-drag shape corner edits
    // (Alt+click style cycling, Corners dialog). `mutate(shape, descriptors)`
    // edits the cloned shape in place; the same undo/apply contract as the
    // corresponding corner-drag scope is honored.
    _applyShapeCornerMutation(layer, pathIndex, scope, cornerSet, mutate) {
      if (!layer) return false;
      // Dialog payloads carry the corner set as a plain Array (JSON-safe);
      // everything below (incl. _reselectCornerAnchors) expects a Set.
      if (cornerSet && !(cornerSet instanceof Set)) cornerSet = new Set(cornerSet);
      const meta = this.getShapeMetaForLayer(layer, pathIndex);
      if (!meta?.shape) return false;
      const shape = cloneShape(meta.shape);
      const descriptors = getCornerDescriptors(shape);
      if (!descriptors.length) return false;
      mutate(shape, descriptors);
      if (scope === 'all') {
        const liveMeta = this.getShapeMetaForLayer(layer, pathIndex);
        if (!liveMeta?.shape) return false;
        if (this.onCommitTransform) this.onCommitTransform();
        liveMeta.shape = cloneShape(shape);
        const nextPath = this.buildShapePath(liveMeta.shape);
        const sourcePaths = this.ensureLayerSourcePaths(layer);
        sourcePaths[pathIndex] = nextPath;
        layer.sourcePaths = sourcePaths;
        this.engine.generate(layer.id);
      } else {
        if (this.onDirectEditStart) this.onDirectEditStart();
        this.selectLayer(layer);
        if (!this.directSelection || this.directSelection.layerId !== layer.id) {
          this.setDirectSelection(layer, pathIndex);
        }
        const nextMeta = this.directSelection?.meta ? { ...this.directSelection.meta, shape: cloneShape(shape) } : null;
        if (!nextMeta) return false;
        this.setShapePathFromMeta(nextMeta);
        if (scope === 'selected' && cornerSet) {
          this._reselectCornerAnchors(cornerSet, shape);
        }
      }
      if (this.onDirectEditCommit) this.onDirectEditCommit();
      this.draw();
      return true;
    }

    // Live Corners: Option/Alt+click on a corner widget switches
    // the corner style (Round → Inverted Round → Chamfer → Round). When the
    // clicked widget belongs to a 2+ multi-corner selection the whole set
    // switches together, mirroring the drag scoping.
    cycleShapeCornerType(layer, pathIndex, corner, scope = 'single', cornerSet = null, step = 1) {
      if (!layer || !corner) return false;
      return this._applyShapeCornerMutation(layer, pathIndex, scope, cornerSet, (shape, descriptors) => {
        const types = getShapeCornerTypes(shape, descriptors.length);
        const next = nextCornerType(types[corner.index], step);
        const targets = this._shapeCornerTargets(scope, cornerSet, corner.index, descriptors.length);
        targets.forEach((index) => {
          if (index >= 0 && index < types.length) types[index] = next;
        });
        shape.cornerTypes = types;
      });
    }

    // Fresh radius/style readout for the Corners dialog target (re-read from
    // the live geometry, never from the stale double-click payload).
    getCornerDialogState(payload) {
      if (!payload) return null;
      const layer = this.engine.layers.find((entry) => entry.id === payload.layerId);
      if (!layer) return null;
      if (payload.kind === 'shape') {
        const meta = this.getShapeMetaForLayer(layer, payload.pathIndex || 0);
        if (!meta?.shape) return null;
        const descriptors = getCornerDescriptors(meta.shape);
        const targets = this._shapeCornerTargets(payload.scope, payload.cornerSet, payload.cornerIndex, descriptors.length)
          .filter((index) => index >= 0 && index < descriptors.length);
        if (!targets.length) return null;
        const radii = targets.map((index) => descriptors[index].radius);
        const types = targets.map((index) => descriptors[index].cornerType);
        return {
          radius: radii[0],
          radiusMixed: radii.some((value) => Math.abs(value - radii[0]) > 1e-6),
          cornerType: types[0],
          typeMixed: types.some((value) => value !== types[0]),
          maxRadius: Math.max(...targets.map((index) => descriptors[index].maxRadius)),
        };
      }
      const handle = this._findFreeformDialogHandle(payload);
      if (!handle) return null;
      // Aggregate over the same selection-expanded set an edit will touch, so
      // the dialog never displays one corner while editing several.
      const set = this._freeformDialogTargets(handle);
      const radii = set.map((h) => h.radius || 0);
      const types = set.map((h) => h.cornerType);
      return {
        radius: handle.radius || 0,
        radiusMixed: radii.some((value) => Math.abs(value - radii[0]) > 1e-6),
        cornerType: handle.cornerType,
        typeMixed: types.some((value) => value !== types[0]),
        maxRadius: Math.max(...set.map((h) => h.maxRadius || 0)),
      };
    }

    // Resolve a freeform Corners-dialog payload to its live handle. Corners
    // are matched by vertex position — stable across bake/unbake, unlike
    // anchor indices which shift as pairs splice in and out.
    _findFreeformDialogHandle(payload) {
      const handles = this._getFreeformCornerHandles();
      if (payload.vertex) {
        const byVertex = handles.find((h) =>
          Math.hypot(h.sourceVertex.x - payload.vertex.x, h.sourceVertex.y - payload.vertex.y) < 1e-6);
        if (byVertex) return byVertex;
      }
      if (payload.anchorIndex != null) {
        return handles.find((h) => !h.baked && h.anchorIndex === payload.anchorIndex) || null;
      }
      return null;
    }

    _freeformDialogTargets(handle) {
      const sel = this.directSelection;
      if (sel?.selectedIndices?.size >= 2 && this._freeformHandleSelected(handle, sel.selectedIndices)) {
        const matched = this._getFreeformCornerHandles().filter((h) => this._freeformHandleSelected(h, sel.selectedIndices));
        if (matched.length >= 2) return matched;
      }
      return [handle];
    }

    // Corners dialog commit: set radius and/or style on the payload's target
    // corners as one undo step. Freeform corners persist the style on the
    // anchor; a radius > 0 reshapes the corner exactly like a widget drag.
    applyCornerDialogEdit(payload, edit = {}) {
      if (!payload) return false;
      const layer = this.engine.layers.find((entry) => entry.id === payload.layerId);
      if (!layer) return false;
      if (payload.kind === 'shape') {
        return this._applyShapeCornerMutation(layer, payload.pathIndex || 0, payload.scope, payload.cornerSet, (shape, descriptors) => {
          const radii = getShapeRadii(shape, descriptors.length);
          const types = getShapeCornerTypes(shape, descriptors.length);
          const targets = this._shapeCornerTargets(payload.scope, payload.cornerSet, payload.cornerIndex, descriptors.length);
          targets.forEach((index) => {
            if (index < 0 || index >= descriptors.length) return;
            if (Number.isFinite(edit.radius)) radii[index] = clamp(edit.radius, 0, descriptors[index].maxRadius);
            if (edit.cornerType) types[index] = normalizeCornerType(edit.cornerType);
          });
          shape.cornerRadii = radii;
          shape.cornerTypes = types;
        });
      }
      const handle = this._findFreeformDialogHandle(payload);
      if (!handle) return false;
      // Style-only edit: each corner keeps its own radius.
      if (edit.cornerType && !Number.isFinite(edit.radius)) {
        return this._setFreeformCornerType(handle, edit.cornerType);
      }
      if (!Number.isFinite(edit.radius)) return false;
      if (!this.beginFreeformCornerDrag(handle)) return false;
      const drag = this.freeformCornerDrag;
      if (edit.cornerType) {
        // Explicit style + radius: stamp the style on every target corner.
        // A radius-only commit leaves each corner's own style untouched.
        const type = normalizeCornerType(edit.cornerType);
        drag.cornerType = type;
        (drag.corners || []).forEach((corner) => {
          corner.cornerType = type;
          const anchor = drag.originalAnchors?.[corner.anchorIndex];
          if (anchor) anchor.cornerType = type;
        });
      }
      // Radius 0 unbakes back to a square corner — the widget survives either way.
      this._applyFreeformCornerRadius(edit.radius);
      this.endFreeformCornerDrag();
      return true;
    }

    // Source-space Live Corner data for the hard-corner anchor at index `i`
    // of `anchors` — everything a drag needs to reshape that corner (tangent
    // dirs, wedge trig, max radius, adjacent-segment control data for the
    // De Casteljau trims). Returns null when `i` is not a reshapeable corner.
    _freeformCornerDataAt(anchors, closed, i) {
      const n = anchors.length;
      if (n < 3) return null;
      const sa = anchors[i];
      if (!sa) return null;
      if (!(sa.corner === true || (sa.in === null && sa.out === null))) return null;
      if (!closed && (i === 0 || i === n - 1)) return null;
      const prevS = anchors[(i - 1 + n) % n];
      const nextS = anchors[(i + 1) % n];
      const prevLen = Math.hypot(prevS.x - sa.x, prevS.y - sa.y);
      const nextLen = Math.hypot(nextS.x - sa.x, nextS.y - sa.y);
      if (prevLen < 1e-9 || nextLen < 1e-9) return null;
      // Tangent direction, NOT the straight chord — a corner beside a curved
      // segment (single-handle bezier) has its wedge bent by the curve.
      const prevDirS = cornerTangentDir(sa, prevS, 'in', 'out');
      const nextDirS = cornerTangentDir(sa, nextS, 'out', 'in');
      const sbx = prevDirS.x + nextDirS.x, sby = prevDirS.y + nextDirS.y;
      const sbl = Math.hypot(sbx, sby);
      if (sbl < 1e-6) return null;
      const inwardS = { x: sbx / sbl, y: sby / sbl };
      const cosAng = clamp(prevDirS.x * nextDirS.x + prevDirS.y * nextDirS.y, -1, 1);
      const edgeAngle = Math.acos(cosAng);
      const halfAngle = Math.max(1e-4, edgeAngle * 0.5);
      const sinHalf = Math.sin(halfAngle);
      const tanHalf = Math.tan(halfAngle);
      const maxRadius = tanHalf > 1e-4 ? Math.min(prevLen, nextLen) * tanHalf * 0.5 : 0;
      return {
        anchorIndex: i,
        cornerType: normalizeCornerType(sa.cornerType),
        vertexCorner: sa.corner === true,
        sourceVertex: { x: sa.x, y: sa.y },
        sourcePrevDir: prevDirS,
        sourceNextDir: nextDirS,
        sourceInward: inwardS,
        sinHalf, tanHalf,
        prevLen, nextLen,
        maxRadius,
        // Raw handle/position data for the adjacent segments, so a drag can
        // trim (De Casteljau split) whichever side is a real curve rather
        // than assuming both sides are straight lines.
        cornerIn: sa.in ? { x: sa.in.x, y: sa.in.y } : null,
        cornerOut: sa.out ? { x: sa.out.x, y: sa.out.y } : null,
        prevPos: { x: prevS.x, y: prevS.y },
        nextPos: { x: nextS.x, y: nextS.y },
        prevControlOut: prevS.out ? { x: prevS.out.x, y: prevS.out.y } : null,
        nextControlIn: nextS.in ? { x: nextS.in.x, y: nextS.in.y } : null,
      };
    }

    // Baked Live Corner pairs in `anchors`: start-role records whose pair is
    // intact and whose anchors still sit exactly where the bake left them.
    // A pair the user has manually disturbed loses its widget — the
    // "roundness lost" rule.
    _liveCornerPairsIn(anchors) {
      const n = anchors.length;
      const pairs = [];
      for (let i = 0; i < n - 1; i++) {
        const rec = anchors[i]?.liveCorner;
        if (!rec || rec.role !== 'start') continue;
        const end = anchors[i + 1];
        if (!end?.liveCorner || end.liveCorner.role !== 'end') continue;
        if (Math.hypot(anchors[i].x - rec.bakedStart.x, anchors[i].y - rec.bakedStart.y) > 1e-6) continue;
        if (Math.hypot(end.x - rec.bakedEnd.x, end.y - rec.bakedEnd.y) > 1e-6) continue;
        pairs.push({ pairIndex: i, rec });
      }
      return pairs;
    }

    // Returns draggable corner handles for freeform (non-parametric) paths:
    // fresh hard corners (corner:true from reduceAnchors, or no bezier
    // handles) AND baked live corners, whose widget rides the reshaped corner
    // and stays draggable/cyclable — Live Corners.
    _getFreeformCornerHandles() {
      const sel = this.directSelection;
      if (!sel || sel.meta?.shape) return [];
      const data = this.getDirectSelectionWorldAnchors();
      if (!data) return [];
      const worldAnchors = data.anchors;
      const srcAnchors = sel.anchors;
      const n = srcAnchors.length;
      if (n < 3) return [];
      const layer = this.getDirectSelectionLayer();
      const result = [];
      const off = SHAPE_CORNER_HANDLE_MIN / Math.max(this.scale, 0.01);
      for (let i = 0; i < n; i++) {
        const cornerData = this._freeformCornerDataAt(srcAnchors, sel.closed, i);
        if (!cornerData) continue;
        const wa = worldAnchors[i];
        const prevW = worldAnchors[(i - 1 + n) % n];
        const nextW = worldAnchors[(i + 1) % n];
        const prevDirW = cornerTangentDir(wa, prevW, 'in', 'out');
        const nextDirW = cornerTangentDir(wa, nextW, 'out', 'in');
        const wbx = prevDirW.x + nextDirW.x, wby = prevDirW.y + nextDirW.y;
        const wbl = Math.hypot(wbx, wby);
        if (wbl < 1e-6) continue;
        const inwardW = { x: wbx / wbl, y: wby / wbl };
        result.push({
          ...cornerData,
          baked: false,
          radius: 0,
          worldVertex: wa,
          worldPoint: { x: wa.x + inwardW.x * off, y: wa.y + inwardW.y * off },
          worldInward: inwardW,
        });
      }
      // Baked live corners: widget at the arc/cut midpoint of the reshaped
      // corner, along the bisector from the stored (discarded) vertex.
      this._liveCornerPairsIn(srcAnchors).forEach(({ pairIndex, rec }) => {
        const v = rec.vertex;
        const start = srcAnchors[pairIndex];
        const end = srcAnchors[pairIndex + 1];
        const spokeS = normalizePoint({ x: start.x - v.x, y: start.y - v.y });
        const spokeE = normalizePoint({ x: end.x - v.x, y: end.y - v.y });
        const bx = spokeS.x + spokeE.x, by = spokeS.y + spokeE.y;
        const bl = Math.hypot(bx, by);
        if (bl < 1e-6) return;
        const inwardS = { x: bx / bl, y: by / bl };
        const wedge = Math.max(1e-4, Math.acos(clamp(spokeS.x * spokeE.x + spokeS.y * spokeE.y, -1, 1)));
        const halfAngle = Math.max(1e-4, wedge * 0.5);
        const sinHalf = Math.sin(halfAngle);
        const tanHalf = Math.tan(halfAngle);
        const dist = Math.max(off, cornerWidgetDistance(rec.radius, sinHalf, tanHalf, rec.cornerType));
        const srcPoint = { x: v.x + inwardS.x * dist, y: v.y + inwardS.y * dist };
        const worldPoint = layer ? this.sourceToWorldPoint(layer, srcPoint) : srcPoint;
        const worldVertex = layer ? this.sourceToWorldPoint(layer, v) : { x: v.x, y: v.y };
        result.push({
          baked: true,
          pairIndex,
          anchorIndex: null,
          cornerType: normalizeCornerType(rec.cornerType),
          radius: rec.radius,
          maxRadius: rec.maxRadius,
          sinHalf, tanHalf,
          sourceVertex: { x: v.x, y: v.y },
          sourceInward: inwardS,
          worldVertex,
          worldPoint,
        });
      });
      return result;
    }

    hitFreeformCornerHandle(world) {
      const handles = this._getFreeformCornerHandles();
      const tolSq = Math.pow(7 / this.scale, 2);
      for (const h of handles) {
        const dx = world.x - h.worldPoint.x, dy = world.y - h.worldPoint.y;
        if (dx * dx + dy * dy <= tolSq) return h;
      }
      return null;
    }

    // Fold a baked live-corner pair (start at `i`, end at `i+1`) back into its
    // original single vertex anchor, restoring any neighbor handles the bake
    // trimmed. Mutates `anchors` in place; returns the vertex anchor's index
    // (or -1 if `i` is not a valid pair start).
    _restoreLiveCornerPair(anchors, i) {
      const rec = anchors[i]?.liveCorner;
      if (!rec || rec.role !== 'start') return -1;
      const end = anchors[i + 1];
      if (!end?.liveCorner || end.liveCorner.role !== 'end') return -1;
      const vertexAnchor = {
        x: rec.vertex.x,
        y: rec.vertex.y,
        in: rec.vertexIn ? { x: rec.vertexIn.x, y: rec.vertexIn.y } : null,
        out: rec.vertexOut ? { x: rec.vertexOut.x, y: rec.vertexOut.y } : null,
      };
      if (rec.vertexCorner) vertexAnchor.corner = true;
      vertexAnchor.cornerType = normalizeCornerType(rec.cornerType);
      anchors.splice(i, 2, vertexAnchor);
      const m = anchors.length;
      // Only sides the bake actually trimmed get their handles restored —
      // a side shared with an adjacent live corner was never trimmed.
      if (rec.prevTrimmed) {
        const prev = anchors[(i - 1 + m) % m];
        if (prev) prev.out = rec.prevOut ? { x: rec.prevOut.x, y: rec.prevOut.y } : null;
      }
      if (rec.nextTrimmed) {
        const next = anchors[(i + 1) % m];
        if (next) next.in = rec.nextIn ? { x: rec.nextIn.x, y: rec.nextIn.y } : null;
      }
      return i;
    }

    // Is this handle part of the current multi-corner selection? A baked
    // corner counts as selected when either of its pair anchors is selected.
    _freeformHandleSelected(handle, selectedIndices) {
      if (!handle || !selectedIndices) return false;
      if (handle.baked) {
        return selectedIndices.has(handle.pairIndex) || selectedIndices.has(handle.pairIndex + 1);
      }
      return selectedIndices.has(handle.anchorIndex);
    }

    beginFreeformCornerDrag(handle, world = null) {
      if (!handle || !this.directSelection) return false;
      const layer = this.engine.layers.find((l) => l.id === this.directSelection.layerId);
      if (!layer) return false;
      const sel = this.directSelection;
      // Multi-corner: if 2+ corners are selected and the grabbed handle is one
      // of them, reshape the whole set together; else just this corner.
      let targetHandles = [handle];
      if (sel.selectedIndices && sel.selectedIndices.size >= 2 && this._freeformHandleSelected(handle, sel.selectedIndices)) {
        const matched = this._getFreeformCornerHandles().filter((h) => this._freeformHandleSelected(h, sel.selectedIndices));
        if (matched.length >= 2) targetHandles = matched;
      }
      // Unbake every baked corner in the target set on a working copy of the
      // anchors — the drag then reshapes restored vertices exactly like fresh
      // ones, which is what keeps live corners re-draggable. The on-screen
      // anchors stay baked until the first pointer move re-applies them.
      const working = this.cloneAnchors(sel.anchors);
      const bakedTargets = targetHandles.filter((h) => h.baked).sort((a, b) => b.pairIndex - a.pairIndex);
      const targetIndices = targetHandles.filter((h) => !h.baked).map((h) => h.anchorIndex);
      const restoredRadii = new Map(); // restored vertex index → its pre-drag radius
      for (const bh of bakedTargets) {
        const vi = this._restoreLiveCornerPair(working, bh.pairIndex);
        if (vi < 0) continue;
        // Restoring removes one anchor at pairIndex — shift indices above it.
        for (let k = 0; k < targetIndices.length; k++) {
          if (targetIndices[k] > bh.pairIndex) targetIndices[k] -= 1;
        }
        const shifted = new Map();
        restoredRadii.forEach((radius, index) => {
          shifted.set(index > bh.pairIndex ? index - 1 : index, radius);
        });
        restoredRadii.clear();
        shifted.forEach((radius, index) => restoredRadii.set(index, radius));
        targetIndices.push(vi);
        restoredRadii.set(vi, bh.radius);
      }
      const corners = targetIndices
        .sort((a, b) => a - b)
        .map((index) => {
          const data = this._freeformCornerDataAt(working, sel.closed, index);
          if (data && restoredRadii.has(index)) data.currentRadius = restoredRadii.get(index);
          return data;
        })
        .filter(Boolean);
      if (!corners.length) return false;
      // The grabbed corner's restored data drives the pointer→radius mapping.
      // Match by vertex position — index spaces differ between the on-screen
      // (baked) anchors and the restored working copy.
      const grabbed = corners.find((c) =>
        Math.hypot(c.sourceVertex.x - handle.sourceVertex.x, c.sourceVertex.y - handle.sourceVertex.y) < 1e-6);
      const anchor = grabbed || corners[0];
      this.freeformCornerDrag = {
        layerId: sel.layerId,
        pathIndex: sel.pathIndex,
        anchorIndex: anchor.anchorIndex,
        cornerType: anchor.cornerType,
        sourceVertex: anchor.sourceVertex,
        sourcePrevDir: anchor.sourcePrevDir,
        sourceNextDir: anchor.sourceNextDir,
        sourceInward: anchor.sourceInward,
        sinHalf: anchor.sinHalf,
        tanHalf: anchor.tanHalf,
        prevLen: anchor.prevLen,
        nextLen: anchor.nextLen,
        maxRadius: anchor.maxRadius,
        startRadius: handle.baked ? handle.radius : 0,
        currentRadius: handle.baked ? handle.radius : 0,
        corners,
        originalAnchors: working,
        historyPushed: false,
      };
      // Delta-based drag mapping anchored at the grab point (or, for API
      // callers with no pointer, at the drawn widget position) — a re-grab of
      // a live corner continues from its current radius with no jump.
      const drag = this.freeformCornerDrag;
      if (world) {
        const srcPt = this.worldToSourcePoint(layer, world);
        drag.pointerBase = (srcPt.x - drag.sourceVertex.x) * drag.sourceInward.x +
          (srcPt.y - drag.sourceVertex.y) * drag.sourceInward.y;
      } else {
        drag.pointerBase = Math.max(
          SHAPE_CORNER_HANDLE_MIN / Math.max(this.scale, 0.01),
          cornerWidgetDistance(drag.startRadius || 0, drag.sinHalf, drag.tanHalf, drag.cornerType)
        );
      }
      return true;
    }

    updateFreeformCornerDrag(world) {
      const drag = this.freeformCornerDrag;
      if (!drag || !world) return false;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (!layer) return false;
      const srcPt = this.worldToSourcePoint(layer, world);
      const dx = srcPt.x - drag.sourceVertex.x, dy = srcPt.y - drag.sourceVertex.y;
      const projected = Math.max(0, dx * drag.sourceInward.x + dy * drag.sourceInward.y);
      // A real drag is not the first click of a double-click.
      this._cornerWidgetLastClick = null;
      // Delta-based mapping anchored at the grab point (see beginFreeformCornerDrag).
      if (drag.pointerBase == null) drag.pointerBase = projected;
      const rawRadius = Math.max(0,
        (drag.startRadius || 0) + (projected - drag.pointerBase) * cornerDragSlope(drag.sinHalf));
      drag.lastRawRadius = rawRadius;
      return this._applyFreeformCornerRadius(rawRadius);
    }

    // Core of the freeform corner reshape: rebuilds the selection's anchors
    // from the drag's original snapshot with each dragged corner spliced into
    // its Live Corner geometry at `rawRadius` (clamped per corner). Shared by
    // pointer drags, mid-drag arrow-key style cycling, and the Corners dialog.
    _applyFreeformCornerRadius(rawRadius) {
      const drag = this.freeformCornerDrag;
      if (!drag) return false;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (!layer) return false;
      const r = clamp(rawRadius, 0, drag.maxRadius);
      drag.currentRadius = r;
      if (this._dragCursorPos) this.showDragTooltip(cornerRadiusLabel(r), this._dragCursorPos.x, this._dragCursorPos.y);
      if (!drag.historyPushed) {
        if (this.onDirectEditStart) this.onDirectEditStart();
        this.markDirectSelectionAsCustomPath();
        drag.historyPushed = true;
      }
      const anchors = this.cloneAnchors(drag.originalAnchors);
      const corners = drag.corners || [];
      const newSelected = new Set();
      // corners is sorted ascending by original anchorIndex; each rounded
      // corner inserts one extra anchor, so later corners' splice positions
      // must be shifted by every insertion made so far.
      let offset = 0;
      const maxArcs = [];
      const n0 = drag.originalAnchors.length;
      for (const corner of corners) {
        const i = corner.anchorIndex + offset;
        // radiusOverride: style-only edits (Alt+click, dialog style buttons)
        // re-bake each corner at its own current radius instead of the shared
        // dragged radius.
        const rc = clamp(corner.radiusOverride ?? rawRadius, 0, corner.maxRadius);
        if (rc > 1e-4 && corner.tanHalf > 1e-4) {
          const tDist = Math.min(corner.prevLen * 0.5, corner.nextLen * 0.5, rc / corner.tanHalf);
          const v = corner.sourceVertex;
          // pd/nd start as the tangent-at-vertex approximation (used to place
          // the setback point and, for straight sides, the final handle
          // direction) but get OVERWRITTEN below with the exact tangent AT
          // THE SPLIT POINT wherever a side is trimmed from a real curve —
          // otherwise the fillet's own kappa handle and the trimmed curve's
          // handle point in slightly different directions, which is a corner
          // (non-collinear handles) rather than a smooth point, and still
          // reads as a kink even though both curves meet at the same spot.
          let pd = corner.sourcePrevDir;
          let nd = corner.sourceNextDir;

          // Prev side: if the adjacent segment is a real curve (not a straight
          // edge), trim it via De Casteljau split so its OWN handle shortens to
          // land exactly on the new fillet start — otherwise the old handle
          // keeps aiming at the discarded vertex and the join kinks visibly.
          let startPt = { x: v.x + pd.x * tDist, y: v.y + pd.y * tDist };
          let startIn = null;
          let prevTrimmed = false;
          let nextTrimmed = false;
          const prevOriginalIdx = (corner.anchorIndex - 1 + n0) % n0;
          const prevShared = corners.some((c) => c !== corner && c.anchorIndex === prevOriginalIdx);
          if (!prevShared && (corner.cornerIn || corner.prevControlOut)) {
            const p0 = corner.prevPos, c1 = corner.prevControlOut || corner.prevPos, c2 = corner.cornerIn || v;
            const t = cubicParamAtDistance(p0, c1, c2, v, tDist, true);
            const { left } = cubicSplitAt(p0, c1, c2, v, t);
            const prevAnchorObj = anchors[prevOriginalIdx + offset];
            if (prevAnchorObj) {
              prevAnchorObj.out = { x: left[1].x, y: left[1].y };
              startPt = { x: left[3].x, y: left[3].y };
              startIn = { x: left[2].x, y: left[2].y };
              pd = normalizePoint({ x: startIn.x - startPt.x, y: startIn.y - startPt.y });
              prevTrimmed = true;
            }
          }

          // Next side: same trim, mirrored.
          let endPt = { x: v.x + nd.x * tDist, y: v.y + nd.y * tDist };
          let endOut = null;
          const nextOriginalIdx = (corner.anchorIndex + 1) % n0;
          const nextShared = corners.some((c) => c !== corner && c.anchorIndex === nextOriginalIdx);
          if (!nextShared && (corner.cornerOut || corner.nextControlIn)) {
            const p0 = v, c1 = corner.cornerOut || v, c2 = corner.nextControlIn || corner.nextPos, p3 = corner.nextPos;
            const t = cubicParamAtDistance(p0, c1, c2, p3, tDist, false);
            const { right } = cubicSplitAt(p0, c1, c2, p3, t);
            const nextAnchorObj = anchors[nextOriginalIdx + offset];
            if (nextAnchorObj) {
              nextAnchorObj.in = { x: right[2].x, y: right[2].y };
              endPt = { x: right[0].x, y: right[0].y };
              endOut = { x: right[1].x, y: right[1].y };
              nd = normalizePoint({ x: endOut.x - endPt.x, y: endOut.y - endPt.y });
              nextTrimmed = true;
            }
          }

          // Corner-style geometry between the two setback points:
          //   round   — kappa arc handles opposing whichever tangents (refined
          //             or vertex-approximate) govern each side, so the fillet
          //             departs/arrives exactly opposite its neighboring handle.
          //   invert  — concave arc centered on the discarded vertex; tangents
          //             are perpendicular to the vertex spokes.
          //   chamfer — straight cut, no handles.
          const cornerType = normalizeCornerType(corner.cornerType);
          let startOut = null;
          let endIn = null;
          if (cornerType === 'round') {
            const arcAngle = Math.PI - Math.max(1e-4, Math.acos(clamp(pd.x * nd.x + pd.y * nd.y, -1, 1)));
            const handleLen = (4 / 3) * Math.tan(arcAngle / 4) * rc;
            startOut = { x: startPt.x - pd.x * handleLen, y: startPt.y - pd.y * handleLen };
            endIn = { x: endPt.x - nd.x * handleLen, y: endPt.y - nd.y * handleLen };
          } else if (cornerType === 'invert') {
            const spokeS = normalizePoint({ x: startPt.x - v.x, y: startPt.y - v.y });
            const spokeE = normalizePoint({ x: endPt.x - v.x, y: endPt.y - v.y });
            const chord = normalizePoint({ x: endPt.x - startPt.x, y: endPt.y - startPt.y });
            const perpToward = (dir) => {
              const p = { x: -dir.y, y: dir.x };
              return (p.x * chord.x + p.y * chord.y) >= 0 ? p : { x: -p.x, y: -p.y };
            };
            const startTan = perpToward(spokeS);
            const endTan = perpToward(spokeE);
            const wedge = Math.max(1e-4, Math.acos(clamp(spokeS.x * spokeE.x + spokeS.y * spokeE.y, -1, 1)));
            const k = (4 / 3) * Math.tan(wedge / 4);
            const hStart = k * Math.hypot(startPt.x - v.x, startPt.y - v.y);
            const hEnd = k * Math.hypot(endPt.x - v.x, endPt.y - v.y);
            startOut = { x: startPt.x + startTan.x * hStart, y: startPt.y + startTan.y * hStart };
            endIn = { x: endPt.x - endTan.x * hEnd, y: endPt.y - endTan.y * hEnd };
          }
          // Live Corner record: everything needed to resurrect the widget on
          // the baked pair, restore the original vertex neighborhood for a
          // re-drag/style change, and detect manual disturbance (widget death).
          const startAnchor = {
            x: startPt.x, y: startPt.y, in: startIn, out: startOut,
            liveCorner: {
              role: 'start',
              radius: rc,
              cornerType,
              maxRadius: corner.maxRadius,
              vertex: { x: v.x, y: v.y },
              vertexIn: corner.cornerIn ? { x: corner.cornerIn.x, y: corner.cornerIn.y } : null,
              vertexOut: corner.cornerOut ? { x: corner.cornerOut.x, y: corner.cornerOut.y } : null,
              vertexCorner: corner.vertexCorner === true,
              prevTrimmed,
              nextTrimmed,
              prevOut: corner.prevControlOut ? { x: corner.prevControlOut.x, y: corner.prevControlOut.y } : null,
              nextIn: corner.nextControlIn ? { x: corner.nextControlIn.x, y: corner.nextControlIn.y } : null,
              bakedStart: { x: startPt.x, y: startPt.y },
              bakedEnd: { x: endPt.x, y: endPt.y },
            },
          };
          const endAnchor = { x: endPt.x, y: endPt.y, out: endOut, in: endIn, liveCorner: { role: 'end' } };
          anchors.splice(i, 1, startAnchor, endAnchor);
          newSelected.add(i);
          newSelected.add(i + 1);
          offset += 1;
          // Max-radius reached for this corner — flag the fillet arc so the
          // draw pass can highlight it (the red "can't go further" cue).
          if (corner.maxRadius > 1e-4 && rc >= corner.maxRadius - 1e-3) {
            maxArcs.push({ start: startPt, startOut, end: endPt, endIn });
          }
        } else {
          newSelected.add(i);
        }
      }
      drag.maxArcs = maxArcs;
      if (this.directSelection) {
        this.directSelection.anchors = anchors;
        if (corners.length > 1) this.directSelection.selectedIndices = newSelected;
        this.applyDirectPath();
      }
      this.draw();
      return true;
    }

    endFreeformCornerDrag() {
      if (!this.freeformCornerDrag) return;
      // Same as endShapeCornerDrag: no-change clicks skip the commit rebuild.
      const changed = this.freeformCornerDrag.historyPushed;
      this.freeformCornerDrag = null;
      if (changed && this.onDirectEditCommit) this.onDirectEditCommit();
      this.hideDragTooltip();
      this.draw();
    }

    // Option/Alt+click on a freeform corner widget: switch that corner's Live
    // Corner style (Round → Inverted Round → Chamfer). The style is stored on
    // the anchor and consumed by the next widget drag; when the clicked widget
    // is part of a 2+ multi-corner selection the whole set switches together.
    cycleFreeformCornerType(handle, step = 1) {
      if (!handle) return false;
      return this._setFreeformCornerType(handle, nextCornerType(handle.cornerType, step));
    }

    _setFreeformCornerType(handle, type) {
      const sel = this.directSelection;
      if (!handle || !sel || !Array.isArray(sel.anchors)) return false;
      const next = normalizeCornerType(type);
      // One code path for fresh and baked corners: unbake targets into a drag
      // snapshot, stamp the style, then re-apply each corner at ITS OWN
      // current radius (radiusOverride) — a baked corner keeps its radius with
      // the new style, an unrounded corner just stores the style for later.
      if (!this.beginFreeformCornerDrag(handle)) return false;
      const drag = this.freeformCornerDrag;
      drag.cornerType = next;
      (drag.corners || []).forEach((corner) => {
        corner.cornerType = next;
        corner.radiusOverride = corner.currentRadius || 0;
        const anchor = drag.originalAnchors?.[corner.anchorIndex];
        if (anchor) anchor.cornerType = next;
      });
      this._applyFreeformCornerRadius(0);
      this.endFreeformCornerDrag();
      return true;
    }


    // ── SHP-1/2/3 — live shape-property plumbing ──────────────────────────────
    // Reads/writes the persisted live-shape params (`cornerRadii`, `sides`) that
    // the polygon/rect rounding pipeline (getShapeRadii / getCornerDescriptors /
    // buildRoundedPolygonAnchors) and the on-canvas corner widget (shapeCornerDrag)
    // already consume. This is param plumbing for the Task Bar's Shape Properties
    // popover — no new geometry. Uniform corner mode only (per-corner stays on the
    // canvas widget); the same push-before-change history contract as the "all"
    // scope corner drag (onDirectEditStart snapshots once per gesture).
    getShapePropsState() {
      const layer = this.getSelectedShapeLayer();
      if (!layer) return null;
      const meta = this.getShapeMetaForLayer(layer, 0);
      const shape = meta?.shape;
      if (!shape) return null;
      const type = shape.type;
      const supportsCornerRadius = type === 'rect' || type === 'polygon';
      const supportsSides = type === 'polygon';
      const descriptors = supportsCornerRadius ? getCornerDescriptors(shape) : [];
      const radii = descriptors.length ? getShapeRadii(shape, descriptors.length) : [];
      const uniform = radii.length ? Math.max.apply(null, radii) : 0;
      const first = radii.length ? radii[0] : 0;
      const allEqual = radii.every((r) => Math.abs(r - first) < 1e-4);
      const maxCorner = descriptors.length
        ? Math.min.apply(null, descriptors.map((d) => d.maxRadius))
        : 0;
      return {
        layerId: layer.id,
        pathIndex: 0,
        type,
        supportsCornerRadius,
        supportsSides,
        cornerRadiusMm: uniform,
        cornerRadiusMixed: radii.length > 0 && !allEqual,
        maxCornerRadiusMm: Number.isFinite(maxCorner) ? maxCorner : 0,
        sides: supportsSides ? Math.max(3, Math.round(shape.sides ?? descriptors.length ?? 3)) : null,
      };
    }

    beginShapePropsEdit() {
      const layer = this.getSelectedShapeLayer();
      if (!layer) return false;
      this._shapePropsEdit = { layerId: layer.id, historyPushed: false };
      return true;
    }

    _applyShapePropsMutation(mutator) {
      const layer = this.getSelectedShapeLayer();
      if (!layer) return null;
      const meta = this.getShapeMetaForLayer(layer, 0);
      if (!meta?.shape) return null;
      // Push-before-change: one undo step per gesture. If no explicit gesture was
      // opened (a discrete stepper click / field commit), snapshot once here.
      if (this._shapePropsEdit && this._shapePropsEdit.layerId === layer.id) {
        if (!this._shapePropsEdit.historyPushed) {
          if (this.onDirectEditStart) this.onDirectEditStart();
          this._shapePropsEdit.historyPushed = true;
        }
      } else if (this.onDirectEditStart) {
        this.onDirectEditStart();
      }
      const shape = cloneShape(meta.shape);
      mutator(shape);
      meta.shape = shape;
      const nextPath = this.buildShapePath(shape);
      const sourcePaths = this.ensureLayerSourcePaths(layer);
      sourcePaths[0] = nextPath;
      layer.sourcePaths = sourcePaths;
      this.engine.generate(layer.id);
      this.draw();
      return this.getShapePropsState();
    }

    setShapeUniformCornerRadius(mm) {
      const value = Math.max(0, Number(mm) || 0);
      return this._applyShapePropsMutation((shape) => {
        if (shape.type !== 'rect' && shape.type !== 'polygon') return;
        const vertexCount = getShapeVertices(shape).length;
        shape.cornerRadii = new Array(vertexCount).fill(value);
      });
    }

    setShapeSides(sides) {
      const n = Math.max(3, Math.round(Number(sides) || 3));
      return this._applyShapePropsMutation((shape) => {
        if (shape.type !== 'polygon') return;
        const radii = getShapeRadii(shape, getShapeVertices(shape).length);
        const uniform = radii.length ? Math.max.apply(null, radii) : 0;
        shape.sides = n;
        shape.cornerRadii = new Array(n).fill(uniform);
      });
    }

    endShapePropsEdit() {
      const pushed = Boolean(this._shapePropsEdit && this._shapePropsEdit.historyPushed);
      this._shapePropsEdit = null;
      if (pushed && this.onDirectEditCommit) this.onDirectEditCommit();
      this.draw();
      return pushed;
    }

    cancelScissor() {
      if (!this.isScissor) return;
      this.isScissor = false;
      this.scissorStart = null;
      this.scissorEnd = null;
      this.draw();
    }

    cloneAnchor(anchor) {
      if (!anchor) return null;
      const c = {
        x: anchor.x,
        y: anchor.y,
        in: anchor.in ? { x: anchor.in.x, y: anchor.in.y } : null,
        out: anchor.out ? { x: anchor.out.x, y: anchor.out.y } : null,
      };
      // Minimal-trace corner flag: a corner anchor whose flat side carries no
      // handle draws the "drag me into a curve" affordance in the node overlay.
      if (anchor.corner === true) c.corner = true;
      // Live Corners style chosen via Option/Alt+click on the corner widget.
      if (anchor.cornerType) c.cornerType = anchor.cornerType;
      // Baked live-corner record — keeps the widget re-editable after a bake.
      if (anchor.liveCorner) c.liveCorner = JSON.parse(JSON.stringify(anchor.liveCorner));
      return c;
    }

    cloneAnchors(anchors) {
      return (anchors || []).map((anchor) => this.cloneAnchor(anchor));
    }

    expandCircleMeta(meta, segments = 72) {
      if (!meta) return [];
      const cx = meta.cx ?? meta.x ?? 0;
      const cy = meta.cy ?? meta.y ?? 0;
      const rx = meta.rx ?? meta.r ?? 0;
      const ry = meta.ry ?? meta.r ?? 0;
      const rot = meta.rotation ?? 0;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const pts = [];
      for (let i = 0; i < segments; i++) {
        const t = (i / segments) * Math.PI * 2;
        const ex = Math.cos(t) * rx;
        const ey = Math.sin(t) * ry;
        pts.push({
          x: cx + ex * cosR - ey * sinR,
          y: cy + ex * sinR + ey * cosR,
        });
      }
      if (pts.length) pts.push({ ...pts[0] });
      return pts;
    }

    getLayerTransformParams(layer) {
      const profile = this.engine.currentProfile;
      const origin = {
        x: (layer?.origin?.x ?? profile.width / 2) + (layer?.params?.posX ?? 0),
        y: (layer?.origin?.y ?? profile.height / 2) + (layer?.params?.posY ?? 0),
      };
      const scaleX = layer?.params?.scaleX ?? 1;
      const scaleY = layer?.params?.scaleY ?? 1;
      const rot = ((layer?.params?.rotation ?? 0) * Math.PI) / 180;
      return { origin, scaleX, scaleY, rot, cosR: Math.cos(rot), sinR: Math.sin(rot) };
    }

    sourceToWorldPoint(layer, point) {
      if (!layer || !point) return point;
      const { origin, scaleX, scaleY, cosR, sinR } = this.getLayerTransformParams(layer);
      let x = point.x - (layer.origin?.x ?? 0);
      let y = point.y - (layer.origin?.y ?? 0);
      x *= scaleX;
      y *= scaleY;
      const rx = x * cosR - y * sinR;
      const ry = x * sinR + y * cosR;
      return { x: rx + origin.x, y: ry + origin.y };
    }

    worldToSourcePoint(layer, point) {
      if (!layer || !point) return point;
      const baseOrigin = layer.origin || { x: 0, y: 0 };
      const { origin, scaleX, scaleY, cosR, sinR } = this.getLayerTransformParams(layer);
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const ux = dx * cosR + dy * sinR;
      const uy = -dx * sinR + dy * cosR;
      const safeX = Math.abs(scaleX) < 1e-6 ? (Math.sign(scaleX) || 1) * 1e-6 : scaleX;
      const safeY = Math.abs(scaleY) < 1e-6 ? (Math.sign(scaleY) || 1) * 1e-6 : scaleY;
      return { x: ux / safeX + baseOrigin.x, y: uy / safeY + baseOrigin.y };
    }

    ensureLayerSourcePaths(layer) {
      if (!layer) return [];
      if (!this.canEditSourceGeometry(layer)) return Array.isArray(layer.sourcePaths) ? layer.sourcePaths : [];
      if (Array.isArray(layer.sourcePaths) && layer.sourcePaths.length) return layer.sourcePaths;
      const paths = (layer.paths || []).map((path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const expanded = this.expandCircleMeta(path.meta, 72);
          const srcExpanded = expanded.map((pt) => this.worldToSourcePoint(layer, pt));
          srcExpanded.meta = { kind: 'poly', closed: true };
          return srcExpanded;
        }
        if (!Array.isArray(path)) return [];
        const src = path.map((pt) => this.worldToSourcePoint(layer, pt));
        if (path.meta) {
          const meta = { ...path.meta };
          delete meta.cx;
          delete meta.cy;
          delete meta.rx;
          delete meta.ry;
          delete meta.r;
          delete meta.rotation;
          src.meta = meta;
        }
        return src;
      });
      layer.sourcePaths = paths;
      layer.params.smoothing = 0;
      layer.params.simplify = 0;
      return layer.sourcePaths;
    }

    getDirectSelectionLayer() {
      if (!this.directSelection) return null;
      return this.engine.layers.find((layer) => layer.id === this.directSelection.layerId) || null;
    }

    pathToAnchors(path) {
      if (!Array.isArray(path) || path.length < 2) return { anchors: [], closed: false };
      const closedByPoints = (() => {
        const first = path[0];
        const last = path[path.length - 1];
        if (!first || !last) return false;
        const dx = first.x - last.x;
        const dy = first.y - last.y;
        return dx * dx + dy * dy < 1e-6;
      })();
      let anchors;
      // An explicit meta.closed === false is authoritative: a closed ring cut
      // at one anchor (scissors) is an OPEN path that legitimately starts and
      // ends at the same point — coincident endpoints must not force `closed`
      // or the seam re-welds on the next parse (mirrors parsePathAnchors in
      // path-edit-ops.js).
      let closed = path.meta?.closed === false
        ? false
        : (closedByPoints || Boolean(path.meta?.closed));
      if (Array.isArray(path.meta?.anchors) && path.meta.anchors.length >= 2) {
        anchors = this.cloneAnchors(path.meta.anchors);
      } else {
        const points = closed && path.length > 2 ? path.slice(0, -1) : path;
        anchors = points.map((pt) => ({ x: pt.x, y: pt.y, in: null, out: null }));
      }
      if (closed && anchors.length >= 2) {
        const first = anchors[0];
        const last = anchors[anchors.length - 1];
        const dx = first.x - last.x;
        const dy = first.y - last.y;
        if (dx * dx + dy * dy < 1e-6) anchors = anchors.slice(0, -1);
      }
      if (anchors.length < 2) closed = false;
      return { anchors, closed };
    }

    findPathHitAtPoint(world, options = {}) {
      if (!world) return null;
      const { restrictToLayerId = null } = options;
      const layers = this.engine.layers.slice().reverse();
      let best = null;
      let bestDistSq = Infinity;
      layers.forEach((layer) => {
        if (!layer || layer.isGroup || !layer.visible) return;
        if (restrictToLayerId && layer.id !== restrictToLayerId) return;
        const stroke = layer.strokeWidth ?? SETTINGS.strokeWidth ?? 0.3;
        const tol = Math.max(2.5 / this.scale, stroke * 2);
        const tolSq = tol * tol;
        this.getInteractionPaths(layer).forEach((path, pathIndex) => {
          if (path && path.meta && path.meta.kind === 'circle') {
            const cx = path.meta.cx ?? path.meta.x ?? 0;
            const cy = path.meta.cy ?? path.meta.y ?? 0;
            const r = path.meta.r ?? Math.max(path.meta.rx ?? 0, path.meta.ry ?? 0);
            const dist = Math.abs(Math.hypot(world.x - cx, world.y - cy) - r);
            const dSq = dist * dist;
            if (dSq <= tolSq && dSq < bestDistSq) {
              bestDistSq = dSq;
              best = { layer, pathIndex, path, segmentIndex: 0, point: { x: world.x, y: world.y }, distSq: dSq };
            }
            return;
          }
          if (!Array.isArray(path) || path.length < 2) return;
          for (let i = 0; i < path.length - 1; i++) {
            const a = path[i];
            const b = path[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq < 1e-9) continue;
            const t = Math.max(0, Math.min(1, ((world.x - a.x) * dx + (world.y - a.y) * dy) / lenSq));
            const px = a.x + t * dx;
            const py = a.y + t * dy;
            const ox = world.x - px;
            const oy = world.y - py;
            const dSq = ox * ox + oy * oy;
            if (dSq <= tolSq && dSq < bestDistSq) {
              bestDistSq = dSq;
              best = {
                layer,
                pathIndex,
                path,
                segmentIndex: i,
                segmentT: t,
                point: { x: px, y: py },
                distSq: dSq,
              };
            }
          }
        });
      });
      return best;
    }

    setDirectSelection(layer, pathIndex) {
      if (!layer || !Number.isInteger(pathIndex)) return null;
      if (!this.canEditSourceGeometry(layer)) return null;
      const sourcePaths = this.ensureLayerSourcePaths(layer);
      const sourcePath = sourcePaths[pathIndex];
      if (!Array.isArray(sourcePath) || sourcePath.length < 2) return null;
      const parsed = this.pathToAnchors(sourcePath);
      if (!parsed.anchors.length) return null;
      this.directAuxSelections = [];
      this.directSelection = {
        layerId: layer.id,
        pathIndex,
        anchors: this.cloneAnchors(parsed.anchors),
        closed: parsed.closed,
        meta: sourcePath.meta ? { ...sourcePath.meta } : {},
        selectedIndices: new Set(),
      };
      return this.directSelection;
    }

    clearDirectSelection() {
      this.directSelection = null;
      this.directDrag = null;
      this.directAuxSelections = [];
      this.draw();
    }

    refreshDirectSelection() {
      const sel = this.directSelection;
      if (!sel) return;
      if (this.directDrag) return;
      const layer = this.engine.layers.find((l) => l.id === sel.layerId);
      if (!layer) {
        this.directSelection = null;
        this.directAuxSelections = [];
        return;
      }
      const sourcePath = layer.sourcePaths?.[sel.pathIndex];
      if (!Array.isArray(sourcePath)) {
        this.directSelection = null;
        this.directAuxSelections = [];
        return;
      }
      const parsed = this.pathToAnchors(sourcePath);
      const next = new Set();
      for (const i of sel.selectedIndices) {
        if (i < parsed.anchors.length) next.add(i);
      }
      sel.anchors = this.cloneAnchors(parsed.anchors);
      sel.closed = parsed.closed;
      sel.selectedIndices = next;
      sel.meta = sourcePath.meta ? { ...sourcePath.meta } : {};
    }

    // industry-parity edit-path toolbar: expose the current anchor selection
    // as stable refs ({layerId, pathIndex, anchorIndex}) across the primary and
    // auxiliary direct selections, so the contextual task bar can gate its
    // anchor verbs (delete / cut / corner / smooth / connect) on what is
    // actually selected. Read-only — never mutates state.
    getSelectedAnchorRefs() {
      const refs = [];
      const collect = (sel) => {
        if (!sel || !sel.selectedIndices) return;
        for (const i of sel.selectedIndices) {
          refs.push({ layerId: sel.layerId, pathIndex: sel.pathIndex, anchorIndex: i });
        }
      };
      collect(this.directSelection);
      (this.directAuxSelections || []).forEach(collect);
      return refs;
    }

    // An anchor is "smooth" when it carries a bezier handle (in or out), else a
    // "corner" (handle-less). Used to make Convert-to-Corner / Convert-to-Smooth
    // behave as a toggle.
    _anchorIsSmooth(a) {
      return !!(a && (a.in || a.out));
    }

    // Summarize the selected anchors' types across the primary + aux selections:
    // { hasCorner, hasSmooth, count }. Read-only.
    getSelectedAnchorTypes() {
      let hasCorner = false;
      let hasSmooth = false;
      let count = 0;
      const scan = (sel) => {
        if (!sel || !sel.selectedIndices || !Array.isArray(sel.anchors)) return;
        for (const i of sel.selectedIndices) {
          const a = sel.anchors[i];
          if (!a) continue;
          count += 1;
          if (this._anchorIsSmooth(a)) hasSmooth = true; else hasCorner = true;
        }
      };
      scan(this.directSelection);
      (this.directAuxSelections || []).forEach(scan);
      return { hasCorner, hasSmooth, count };
    }

    // Cheap change-detector for the RAF-driven task bar: a string that changes
    // whenever the anchor selection changes — layer/path, sorted indices, AND
    // each selected anchor's type (so a corner↔smooth conversion re-renders the
    // toggle even though the index set is unchanged).
    getSelectedAnchorSignature() {
      const parts = [];
      const enc = (sel) => {
        if (!sel || !sel.selectedIndices) return;
        const anchors = Array.isArray(sel.anchors) ? sel.anchors : [];
        const idx = [...sel.selectedIndices].sort((a, b) => a - b)
          .map((i) => `${i}${this._anchorIsSmooth(anchors[i]) ? 's' : 'c'}`)
          .join('.');
        parts.push(`${sel.layerId}:${sel.pathIndex}:${idx}`);
      };
      enc(this.directSelection);
      (this.directAuxSelections || []).forEach(enc);
      return parts.join('|');
    }

    _applyDirectLasso(poly) {
      if (!Array.isArray(poly) || poly.length < 3) return;
      this.directSelection = null;
      this.directAuxSelections = [];
      for (const layer of this.engine.layers) {
        if (!layer || layer.isGroup || !layer.visible) continue;
        if (this.isLayerLocked?.(layer.id)) continue;
        if (!this.canEditSourceGeometry(layer)) continue;
        const sourcePaths = this.ensureLayerSourcePaths(layer);
        sourcePaths.forEach((sourcePath, pathIndex) => {
          if (!Array.isArray(sourcePath) || sourcePath.length < 2) return;
          const parsed = this.pathToAnchors(sourcePath);
          if (!parsed.anchors.length) return;
          const selectedIndices = new Set();
          parsed.anchors.forEach((anchor, i) => {
            const w = this.sourceToWorldPoint(layer, anchor);
            if (this.pointInPoly(w, poly)) selectedIndices.add(i);
          });
          if (!selectedIndices.size) return;
          const sel = {
            layerId: layer.id,
            pathIndex,
            anchors: this.cloneAnchors(parsed.anchors),
            closed: parsed.closed,
            meta: sourcePath.meta ? { ...sourcePath.meta } : {},
            selectedIndices,
          };
          if (!this.directSelection) {
            this.directSelection = sel;
          } else {
            this.directAuxSelections.push(sel);
          }
        });
      }
      if (this.directSelection) {
        const pl = this.engine.layers.find((l) => l.id === this.directSelection.layerId);
        if (pl && !this.selectedLayerIds.has(pl.id)) this.selectLayer(pl);
      }
    }

    _applyDirectMarquee(rect) {
      const minX = rect.x;
      const maxX = rect.x + rect.w;
      const minY = rect.y;
      const maxY = rect.y + rect.h;
      this.directSelection = null;
      this.directAuxSelections = [];
      for (const layer of this.engine.layers) {
        if (!layer || layer.isGroup || !layer.visible) continue;
        if (this.isLayerLocked?.(layer.id)) continue;
        if (!this.canEditSourceGeometry(layer)) continue;
        const sourcePaths = this.ensureLayerSourcePaths(layer);
        sourcePaths.forEach((sourcePath, pathIndex) => {
          if (!Array.isArray(sourcePath) || sourcePath.length < 2) return;
          const parsed = this.pathToAnchors(sourcePath);
          if (!parsed.anchors.length) return;
          const selectedIndices = new Set();
          parsed.anchors.forEach((anchor, i) => {
            const w = this.sourceToWorldPoint(layer, anchor);
            if (w.x >= minX && w.x <= maxX && w.y >= minY && w.y <= maxY) selectedIndices.add(i);
          });
          if (!selectedIndices.size) return;
          const sel = {
            layerId: layer.id,
            pathIndex,
            anchors: this.cloneAnchors(parsed.anchors),
            closed: parsed.closed,
            meta: sourcePath.meta ? { ...sourcePath.meta } : {},
            selectedIndices,
          };
          if (!this.directSelection) {
            this.directSelection = sel;
          } else {
            this.directAuxSelections.push(sel);
          }
        });
      }
      if (this.directSelection) {
        const pl = this.engine.layers.find((l) => l.id === this.directSelection.layerId);
        if (pl && !this.selectedLayerIds.has(pl.id)) this.selectLayer(pl);
      }
    }

    buildMaskPreviewState(layer, { excludeLayerIds } = {}) {
      if (!layer) return null;
      if (layer.mask?.enabled && this.engine?.getLayerDescendants) {
        // Descendants that move rigidly with the mask (selected alongside it) are
        // excluded from the preview: they render normally with tempTransform, so the
        // masked geometry simply translates as-is instead of being re-clipped.
        const skip = excludeLayerIds instanceof Set ? excludeLayerIds : null;
        const descendants = this.engine
          .getLayerDescendants(layer.id)
          .filter((entry) => entry && !entry.isGroup && !(skip && skip.has(entry.id)));
        if (!descendants.length) return null;
        const bounds = this.engine.getBounds ? this.engine.getBounds() : this.engine.currentProfile;
        const entries = descendants
          .filter((entry) => entry.visible && !(entry.mask?.enabled && entry.mask?.hideLayer))
          .map((entry) => ({
            layerId: entry.id,
            paths: buildLayerMaskedPaths(entry, this.engine, bounds, { excludeMaskLayerId: layer.id }),
          }))
          .filter((entry) => Array.isArray(entry.paths) && entry.paths.length);
        return {
          maskLayerId: layer.id,
          descendantIds: new Set(descendants.map((entry) => entry.id)),
          entries,
        };
      }
      if (this.engine) {
        const maskingAncestors = getMaskingAncestors(layer, this.engine);
        if (maskingAncestors.length) {
          const lockedMask = this.isLayerLocked
            ? maskingAncestors.find((a) => this.isLayerLocked?.(a.id))
            : null;
          const closestMask = lockedMask || maskingAncestors[maskingAncestors.length - 1];
          const bounds = this.engine.getBounds ? this.engine.getBounds() : this.engine.currentProfile;
          const paths = buildLayerMaskedPaths(layer, this.engine, bounds, { excludeMaskLayerId: closestMask.id });
          if (!paths.length) return null;
          return {
            maskLayerId: closestMask.id,
            descendantIds: new Set([layer.id]),
            entries: [{ layerId: layer.id, paths }],
            isChildDrag: true,
          };
        }
      }
      return null;
    }

    startMaskPreview(layer, opts) {
      this.maskPreview = this.buildMaskPreviewState(layer, opts);
      return this.maskPreview;
    }

    startMaskPreviewForSelection(layers) {
      if (this.activeTool !== 'select' || !Array.isArray(layers) || !layers.length) {
        this.clearMaskPreview();
        return;
      }
      if (layers.length === 1) {
        this.startMaskPreview(layers[0]);
        return;
      }
      const maskRoot = layers.find((l) => l?.mask?.enabled && l?.maskCapabilities?.canSource);
      if (maskRoot) {
        const excludeLayerIds = new Set(layers.map((l) => l.id).filter((id) => id !== maskRoot.id));
        this.startMaskPreview(maskRoot, { excludeLayerIds });
      } else {
        this.clearMaskPreview();
      }
    }

    clearMaskPreview() {
      this.maskPreview = null;
    }

    shouldSkipLayerForMaskPreview(layer) {
      return Boolean(layer && this.maskPreview?.descendantIds?.has(layer.id));
    }

    _getMirrorDragPreviewLayerIds(selectedIds) {
      if (!selectedIds?.size || !this.engine?.getAncestorModifiers) return null;
      const ids = [...selectedIds].filter((id) => {
        const layer = this.engine.layers.find((l) => l.id === id);
        return layer && this.engine.getAncestorModifiers(layer).length > 0;
      });
      return ids.length ? new Set(ids) : null;
    }

    _startMirrorDrag(layers) {
      const ids = this._getMirrorDragPreviewLayerIds(new Set(layers.map((l) => l.id)));
      if (!ids) { this.mirrorDragState = null; this._morphDragActive = false; this._morphDragGroupIds = new Set(); return; }
      const state = new Map();
      ids.forEach((id) => {
        const layer = this.engine.layers.find((l) => l.id === id);
        if (!layer) return;
        state.set(id, {
          basePaths: (layer.paths || []).map((path) => {
            if (!Array.isArray(path)) return path;
            const clone = path.map((pt) => ({ ...pt }));
            if (path.meta) clone.meta = { ...path.meta };
            return clone;
          }),
        });
      });
      this.mirrorDragState = state.size ? state : null;
      // Cache morph-ancestor detection once at drag start so the per-pointermove
      // hot path never walks the layer tree.
      this._morphDragActive = this._dragHasMorphAncestor(layers);
      // Record which morph group(s) the dragged children belong to so draw() can
      // ghost-dim those blends during the drag (the preview reads as "not yet
      // committed"), even when we're not inside morph edit isolation.
      this._morphDragGroupIds = new Set();
      if (this._morphDragActive && this.engine?.getAncestorModifiers) {
        layers.forEach((layer) => {
          this.engine.getAncestorModifiers(layer).forEach((mod) => {
            if (mod?.modifier?.type === 'morph') this._morphDragGroupIds.add(mod.id);
          });
        });
      }
    }

    _dragHasMorphAncestor(layers) {
      if (!this.engine?.getAncestorModifiers) return false;
      return layers.some((layer) =>
        this.engine.getAncestorModifiers(layer).some(
          (mod) => mod?.modifier?.type === 'morph'
        )
      );
    }

    // SEL-2: duplicate the current selection at alt-drag start and retarget the
    // drag onto the copies. Duplicates only the top-most selected roots (a
    // selected group deep-duplicates its children via engine.duplicateLayer).
    // History: exactly ONE push-before-change snapshot (via onDuplicateLayer);
    // the commit-time push is suppressed so the whole duplicate+move is a
    // single undo step on drop.
    _beginAltDragDuplicate(selectedLayers, world, bounds) {
      if (!this.engine?.duplicateLayer) return false;
      const selectedIds = new Set(selectedLayers.map((l) => l.id));
      const roots = selectedLayers.filter((layer) => {
        let pid = layer.parentId;
        while (pid) {
          if (selectedIds.has(pid)) return false;
          pid = this.engine.layers.find((l) => l.id === pid)?.parentId ?? null;
        }
        return true;
      });
      if (!roots.length) return false;
      this._altDupHistoryLen = this.app?.history?.length ?? null;
      if (this.onDuplicateLayer) this.onDuplicateLayer();
      const dups = roots.map((layer) => this.engine.duplicateLayer(layer.id)).filter(Boolean);
      if (!dups.length) {
        this._altDupHistoryLen = null;
        return false;
      }
      this._altDragDup = {
        dupIds: dups.map((d) => d.id),
        originalIds: [...selectedIds],
        primaryId: this.selectedLayerId,
      };
      // Include descendants of duplicated groups in the new selection so the
      // move drag fans out exactly like dragging the originals would.
      const dupSelection = [];
      const collectWithDescendants = (id) => {
        dupSelection.push(id);
        this.engine.layers.forEach((l) => {
          if (l.parentId === id) collectWithDescendants(l.id);
        });
      };
      this._altDragDup.dupIds.forEach(collectWithDescendants);
      this.setSelection(dupSelection, dupSelection[0]);
      const dupLayers = this.getSelectedLayers();
      this.dragStart = world;
      this.startBounds = this.getSelectionBounds(dupLayers) || bounds;
      // Re-arm mirror/morph drag previews for the copies (they were armed for
      // the originals before the duplicate swap).
      this._startMirrorDrag(dupLayers);
      this._skipCommitHistory = true;
      return true;
    }

    // Cancel an in-flight layer drag (SEL-2: Escape mid-drag). Restores any
    // live-mutated mirror-drag geometry, removes alt-drag duplicates, restores
    // the pre-drag selection, and pops the pre-duplicate history snapshot when
    // it is still the stack top (the live state is identical to it again).
    cancelLayerDrag() {
      if (!this.isLayerDrag) return false;
      if (this.mirrorDragState) {
        this.mirrorDragState.forEach((state, layerId) => {
          const layer = this.engine.layers.find((l) => l.id === layerId);
          if (!layer) return;
          layer.paths = state.basePaths;
          if (this.engine.computeLayerEffectiveGeometry) this.engine.computeLayerEffectiveGeometry(layer.id);
          if (this.engine.computeLayerDisplayGeometry) this.engine.computeLayerDisplayGeometry(layer.id);
          if (this.engine.applyStrokeDivision) this.engine.applyStrokeDivision([layer]);
        });
      }
      this._clearMorphDrag();
      const dup = this._altDragDup;
      if (dup) {
        dup.dupIds.forEach((id) => this.engine.removeLayer?.(id));
        const originals = dup.originalIds.filter((id) =>
          this.engine.layers.some((l) => l.id === id));
        if (originals.length) {
          this.setSelection(originals, dup.primaryId || originals[originals.length - 1]);
        }
        if (this.app?.history && this._altDupHistoryLen != null
            && this.app.history.length === this._altDupHistoryLen + 1) {
          this.app.history.pop();
        }
      }
      this._altDragDup = null;
      this._altDupHistoryLen = null;
      this._guideCandidates = null;
      this._objectGuideMatches = null;
      this._spacingHints = null;
      this._pendingSingleSelect = null;
      this.isLayerDrag = false;
      this.dragMode = null;
      this.activeHandle = null;
      this.tempTransform = null;
      this.rotateOrigin = null;
      this.startBounds = null;
      this.lastDragWorld = null;
      this._areaResize = null;
      this._skipCommitHistory = false;
      this._detachShiftDragListener();
      this.clearMaskPreview();
      this.mirrorDragState = null;
      this.snap = null;
      this.guides = null;
      this.hideDragTooltip();
      this.updateCursor();
      this.draw();
      return true;
    }

    // Schedules at most one morph refold per animation frame so a morph parent's
    // morphedPaths refresh live while a descendant is dragged, without queueing a
    // recompute per pointermove. Refolds ONLY the dragged children's morph
    // group(s) from their already-updated effective geometry (the move/preview
    // branches refresh each dragged leaf before scheduling); falls back to a full
    // recompute only when the targeted path is unavailable.
    _scheduleMorphDragRecompute() {
      if (this._morphDragRaf != null) return;
      this._morphDragRaf = requestAnimationFrame(() => {
        this._morphDragRaf = null;
        if (!this._morphDragActive || !this.isLayerDrag) return;
        const ids = this.mirrorDragState ? [...this.mirrorDragState.keys()] : [];
        if (ids.length && typeof this.engine.refoldMorphGroupsForLayers === 'function') {
          this.engine.refoldMorphGroupsForLayers(ids);
        } else if (this.onComputeDisplayGeometry) {
          this.onComputeDisplayGeometry();
        } else {
          this.engine.computeAllDisplayGeometry();
        }
        this.draw();
      });
    }

    // Re-derive each drag-snapshot layer's geometry under the FULL temp
    // transform (resize/rotate, not just translate) and refold the morph blend.
    // The move branch has its own translate-only fast path; this generalizes it
    // for scale/rotate so an isolated morph child previews live.
    _previewMirrorDragWithTemp(temp) {
      if (!this.mirrorDragState || !temp) return;
      this.mirrorDragState.forEach((state, layerId) => {
        const layer = this.engine.layers.find((l) => l.id === layerId);
        if (!layer) return;
        layer.paths = (state.basePaths || []).map((path) => {
          if (path && path.meta && path.meta.kind === 'circle') {
            const pts = Array.isArray(path) ? path.map((pt) => this.transformPoint(pt, temp)) : [];
            pts.meta = this.transformCircleMeta(path.meta, temp);
            return pts;
          }
          if (!Array.isArray(path)) return path;
          const t = path.map((pt) => this.transformPoint(pt, temp));
          if (path.meta) t.meta = { ...path.meta };
          return t;
        });
        if (this.engine.computeLayerEffectiveGeometry) this.engine.computeLayerEffectiveGeometry(layer.id);
        if (this.engine.computeLayerDisplayGeometry) this.engine.computeLayerDisplayGeometry(layer.id);
        // Divided layers: recut from the fresh geometry so the preview tracks
        // the drag instead of serving pre-drag fragments.
        if (this.engine.applyStrokeDivision) this.engine.applyStrokeDivision([layer]);
      });
      this._scheduleMorphDragRecompute();
    }

    _clearMorphDrag() {
      this._morphDragActive = false;
      this._morphDragGroupIds = new Set();
      if (this._morphDragRaf != null) {
        cancelAnimationFrame(this._morphDragRaf);
        this._morphDragRaf = null;
      }
    }

    getMaskPreviewLayer() {
      if (!this.maskPreview?.maskLayerId) return null;
      return this.engine?.layers?.find((layer) => layer.id === this.maskPreview.maskLayerId) || null;
    }

    getDirectSelectionWorldAnchors() {
      return this._selectionWorldAnchors(this.directSelection);
    }

    _selectionWorldAnchors(sel) {
      if (!sel?.anchors?.length) return null;
      const layer = this.engine.layers.find((l) => l.id === sel.layerId);
      if (!layer) return null;
      const anchors = sel.anchors.map((anchor) => ({
        x: this.sourceToWorldPoint(layer, anchor).x,
        y: this.sourceToWorldPoint(layer, anchor).y,
        in: anchor.in ? this.sourceToWorldPoint(layer, anchor.in) : null,
        out: anchor.out ? this.sourceToWorldPoint(layer, anchor.out) : null,
        corner: anchor.corner === true, // carry the minimal-trace corner affordance flag to world space
      }));
      return { layer, anchors };
    }

    _hitControlInAnchors(world, anchors) {
      const handleTol = 5 / this.scale;
      const handleTolSq = handleTol * handleTol;
      for (let i = 0; i < anchors.length; i++) {
        const anchor = anchors[i];
        if (anchor.in) {
          const dx = world.x - anchor.in.x; const dy = world.y - anchor.in.y;
          if (dx * dx + dy * dy <= handleTolSq) return { type: 'in', index: i };
        }
        if (anchor.out) {
          const dx = world.x - anchor.out.x; const dy = world.y - anchor.out.y;
          if (dx * dx + dy * dy <= handleTolSq) return { type: 'out', index: i };
        }
      }
      const anchorTol = 6 / this.scale;
      const anchorTolSq = anchorTol * anchorTol;
      for (let i = 0; i < anchors.length; i++) {
        const anchor = anchors[i];
        const dx = world.x - anchor.x; const dy = world.y - anchor.y;
        if (dx * dx + dy * dy <= anchorTolSq) return { type: 'anchor', index: i };
      }
      return null;
    }

    _selectSegmentAnchors(sel, segmentIndex, additive = false) {
      const seg = Math.max(0, Math.min(segmentIndex, sel.anchors.length - 1));
      const nextSeg = sel.closed
        ? (seg + 1) % sel.anchors.length
        : Math.min(seg + 1, sel.anchors.length - 1);
      if (additive) {
        if (sel.selectedIndices.has(seg) && sel.selectedIndices.has(nextSeg)) {
          sel.selectedIndices.delete(seg);
          sel.selectedIndices.delete(nextSeg);
        } else {
          sel.selectedIndices.add(seg);
          if (nextSeg !== seg) sel.selectedIndices.add(nextSeg);
        }
      } else {
        sel.selectedIndices = new Set(nextSeg !== seg ? [seg, nextSeg] : [seg]);
      }
      return { seg, nextSeg };
    }

    hitDirectControl(world) {
      const mainData = this.getDirectSelectionWorldAnchors();
      if (mainData) {
        const hit = this._hitControlInAnchors(world, mainData.anchors);
        if (hit) return { ...hit, auxIdx: -1 };
      }
      const auxSels = this.directAuxSelections || [];
      for (let ai = 0; ai < auxSels.length; ai++) {
        const data = this._selectionWorldAnchors(auxSels[ai]);
        if (data) {
          const hit = this._hitControlInAnchors(world, data.anchors);
          if (hit) return { ...hit, auxIdx: ai };
        }
      }
      return null;
    }

    _applySelectionPath(sel) {
      if (!sel) return;
      const layer = this.engine.layers.find((l) => l.id === sel.layerId);
      if (!layer) return;
      const sourcePaths = this.ensureLayerSourcePaths(layer);
      const path = this.buildPenPathFromAnchors(sel.anchors, sel.closed);
      // Direct edits are the new source-of-truth: rebase the originalAnchors snapshot
      // that applyShapeAnchorRebuild uses, otherwise a stale null-handle baseline
      // overwrites the user's handle drag on the next regen.
      const meta = this.normalizeEditedPathMeta({
        ...(sel.meta || {}),
        anchors: this.cloneAnchors(sel.anchors),
        originalAnchors: this.cloneAnchors(sel.anchors),
        originalClosed: Boolean(sel.closed),
        closed: Boolean(sel.closed),
      });
      path.meta = meta;
      sourcePaths[sel.pathIndex] = path;
      layer.sourcePaths = sourcePaths;
      // Identify fills inside the current (pre-edit) world path before engine.generate()
      // overwrites layer.paths with the new geometry.
      const fillsToSync = (sel.closed && layer.fills?.length)
        ? this._findFillsForPath(layer, sel.pathIndex)
        : [];
      this.engine.generate(layer.id);
      if (fillsToSync.length) {
        this._applyNewPathToFills(layer, sel.pathIndex, fillsToSync);
        // engine.generate() ran computeAllDisplayGeometry() with the old rec.region.
        // Now that rec.region is updated, regenerate effective geometry so the renderer
        // shows fill paths clipped to the new boundary, not the previous one.
        this.engine.computeLayerEffectiveGeometry?.(layer.id);
      }
      sel.meta = meta;
    }

    _findFillsForPath(layer, pathIndex) {
      const worldPath = layer.paths?.[pathIndex];
      if (!Array.isArray(worldPath) || worldPath.length < 3) return [];
      const containsFn = window.Vectura?.PaintBucketOps?.polyContainsPoint;
      if (typeof containsFn !== 'function') return [];
      return (layer.fills || []).filter((rec) => {
        if (!rec?.region?.length) return false;
        const { x: cx, y: cy } = this._areaPolygonCentroid(rec.region);
        return containsFn(worldPath, cx, cy);
      });
    }

    // Shoelace area centroid — lies inside the enclosed area even for concave polygons,
    // unlike the simple boundary-point average which falls in the void for thin crescents.
    _areaPolygonCentroid(poly) {
      let ax = 0, ay = 0, area = 0;
      const n = poly.length;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const cross = poly[j].x * poly[i].y - poly[i].x * poly[j].y;
        ax += (poly[j].x + poly[i].x) * cross;
        ay += (poly[j].y + poly[i].y) * cross;
        area += cross;
      }
      area /= 2;
      if (Math.abs(area) < 1e-9) {
        // Degenerate polygon — fall back to boundary average
        return {
          x: poly.reduce((s, p) => s + p.x, 0) / n,
          y: poly.reduce((s, p) => s + p.y, 0) / n,
        };
      }
      return { x: ax / (6 * area), y: ay / (6 * area) };
    }

    _applyNewPathToFills(layer, pathIndex, fills) {
      const newWorldPath = layer.paths?.[pathIndex];
      if (!Array.isArray(newWorldPath) || newWorldPath.length < 2) return;
      const newRegion = newWorldPath.map((p) => ({ x: p.x, y: p.y }));
      for (const rec of fills) {
        rec.region = newRegion;
        rec.innerRegion = null;
      }
    }

    _penAnchorsToPolygon(anchors, closed, stepsPerSegment = 24) {
      if (!anchors?.length) return [];
      const pts = [];
      const n = anchors.length;
      const segments = closed ? n : n - 1;
      for (let i = 0; i < segments; i++) {
        const a = anchors[i];
        const b = anchors[(i + 1) % n];
        const cp1 = a.out ?? a;
        const cp2 = b.in ?? b;
        for (let s = 0; s < stepsPerSegment; s++) {
          const t = s / stepsPerSegment;
          const mt = 1 - t;
          pts.push({
            x: mt ** 3 * a.x + 3 * mt ** 2 * t * cp1.x + 3 * mt * t ** 2 * cp2.x + t ** 3 * b.x,
            y: mt ** 3 * a.y + 3 * mt ** 2 * t * cp1.y + 3 * mt * t ** 2 * cp2.y + t ** 3 * b.y,
          });
        }
      }
      return pts;
    }

    applyDirectPath() {
      this._applySelectionPath(this.directSelection);
    }

    normalizeEditedPathMeta(meta) {
      const next = { ...(meta || {}) };
      // A user-driven edit invalidates the pre-curve baseline snapshot; the
      // next applyShapeAnchorRebuild must re-baseline from the edited anchors,
      // otherwise the rebuild snaps geometry back to the pre-edit shape.
      delete next.originalAnchors;
      delete next.originalClosed;
      if (next.kind === 'circle') {
        next.kind = 'poly';
      } else if (!next.shape && next.kind === 'shape') {
        next.kind = 'poly';
      } else if (next.shape) {
        return next;
      }
      delete next.cx;
      delete next.cy;
      delete next.rx;
      delete next.ry;
      delete next.r;
      delete next.rotation;
      return next;
    }

    markDirectSelectionAsCustomPath() {
      if (!this.directSelection) return;
      this.directSelection.meta = this.normalizeEditedPathMeta({
        ...(this.directSelection.meta || {}),
        shape: undefined,
      });
      delete this.directSelection.meta.shape;
    }

    startDirectDrag(control, e = {}) {
      // If the control is in an aux selection, promote it to the primary
      const auxIdx = control?.auxIdx ?? -1;
      if (auxIdx >= 0) {
        const auxSels = this.directAuxSelections || [];
        if (auxSels[auxIdx]) {
          const promoted = auxSels[auxIdx];
          const newAux = [];
          if (this.directSelection) newAux.push(this.directSelection);
          for (let i = 0; i < auxSels.length; i++) {
            if (i !== auxIdx) newAux.push(auxSels[i]);
          }
          this.directSelection = promoted;
          this.directAuxSelections = newAux;
        }
      }
      if (!control || !this.directSelection) return false;
      const modifiers = this.getModifierState ? this.getModifierState(e) : { alt: e.altKey, shift: e.shiftKey };
      const sel = this.directSelection;

      if (control.type === 'anchor') {
        if (control.preserveSelection) {
          // Drag started inside an existing multi-selection — keep all selected anchors as-is
        } else if (modifiers.shift) {
          // Multi-select: shift+click toggles anchor in/out of selection
          if (sel.selectedIndices.has(control.index)) sel.selectedIndices.delete(control.index);
          else sel.selectedIndices.add(control.index);
        } else if (!sel.selectedIndices.has(control.index)) {
          sel.selectedIndices = new Set([control.index]);
        }

        // Alt+drag: duplicate the anchor and drag the copy
        if (modifiers.alt) {
          const orig = sel.anchors[control.index];
          const dup = { x: orig.x, y: orig.y, in: orig.in ? { ...orig.in } : null, out: orig.out ? { ...orig.out } : null };
          const insertIdx = control.index + 1;
          sel.anchors.splice(insertIdx, 0, dup);
          sel.selectedIndices = new Set([insertIdx]);
          control = { type: 'anchor', index: insertIdx };
          if (this.onDirectEditStart) { this.onDirectEditStart(); }
        }
      }

      // Record start positions for angle-constrain and multi-move
      const anchor = sel.anchors[control.index];
      const otherStarts = control.type === 'anchor'
        ? [...sel.selectedIndices].filter(i => i !== control.index).map(i => {
            const a = sel.anchors[i];
            return a ? { index: i, x: a.x, y: a.y, inX: a.in?.x, inY: a.in?.y, outX: a.out?.x, outY: a.out?.y } : null;
          }).filter(Boolean)
        : [];

      this.directDrag = {
        type: control.type,
        index: control.index,
        moved: false,
        historyPushed: modifiers.alt, // already pushed above for alt-dup
        anchorStart: anchor ? { x: anchor.x, y: anchor.y } : null,
        otherStarts,
        mergeTarget: null,
        oldPathPolygon: (sel.closed && sel.anchors?.length)
          ? this._penAnchorsToPolygon(sel.anchors, true)
          : null,
      };
      return true;
    }

    updateDirectDrag(world, e) {
      if (!this.directDrag || !this.directSelection) return false;
      const layer = this.getDirectSelectionLayer();
      if (!layer) return false;
      const drag = this.directDrag;
      const anchor = this.directSelection.anchors[drag.index];
      if (!anchor) return false;
      let next = this.worldToSourcePoint(layer, world);
      if (!drag.historyPushed && this.onDirectEditStart) {
        this.onDirectEditStart();
        drag.historyPushed = true;
      }
      if (drag.type !== 'corner') {
        this.markDirectSelectionAsCustomPath();
      }
      if (drag.type === 'anchor') {
        // Shift: angle-constrain movement relative to drag start (adjusted for grab offset)
        if (e?.shiftKey && drag.anchorStart) {
          const snapStart = drag.grabOffset
            ? { x: drag.anchorStart.x + drag.grabOffset.x, y: drag.anchorStart.y + drag.grabOffset.y }
            : drag.anchorStart;
          next = this.snapScissorAngle(snapStart, next, 15);
        }
        // grabOffset: when dragging a segment from its midpoint, offset next so the delta is relative
        // to the grab point rather than the anchor corner, preventing a jump on the first frame
        let effective = drag.grabOffset ? { x: next.x - drag.grabOffset.x, y: next.y - drag.grabOffset.y } : next;
        // Endpoint snapping: snap first/last anchor of an open path to nearby endpoints on other paths
        drag.endpointSnapTarget = null;
        if (!this.directSelection.closed &&
            (drag.index === 0 || drag.index === this.directSelection.anchors.length - 1)) {
          const snapThresholdSq = (8 / this.scale) ** 2;
          // Compare from the anchor's world position (accounts for grabOffset) rather than raw cursor
          const effectiveWorld = this.sourceToWorldPoint(layer, effective);
          let closestSq = Infinity, bestSnapWorld = null;
          for (const cl of this.engine.layers) {
            if (!cl.visible || cl.isGroup || this.engine.hasCompoundAncestor?.(cl)) continue;
            const paths = this.engine.getRenderablePaths(cl) || cl.paths || [];
            paths.forEach((path, pi) => {
              if (cl.id === this.directSelection.layerId && pi === this.directSelection.pathIndex) return;
              if (!Array.isArray(path) || path.length < 2) return;
              for (const pt of [path[0], path[path.length - 1]]) {
                const dsq = (effectiveWorld.x - pt.x) ** 2 + (effectiveWorld.y - pt.y) ** 2;
                if (dsq < snapThresholdSq && dsq < closestSq) { closestSq = dsq; bestSnapWorld = pt; }
              }
            });
          }
          if (bestSnapWorld) {
            drag.endpointSnapTarget = { world: bestSnapWorld };
            effective = this.worldToSourcePoint(layer, bestSnapWorld);
          }
        }
        const dx = effective.x - anchor.x;
        const dy = effective.y - anchor.y;
        anchor.x = effective.x;
        anchor.y = effective.y;
        if (anchor.in) { anchor.in.x += dx; anchor.in.y += dy; }
        if (anchor.out) { anchor.out.x += dx; anchor.out.y += dy; }
        // Move all other selected anchors by the same delta
        for (const other of drag.otherStarts || []) {
          const oa = this.directSelection.anchors[other.index];
          if (!oa) continue;
          oa.x += dx; oa.y += dy;
          if (oa.in) { oa.in.x += dx; oa.in.y += dy; }
          if (oa.out) { oa.out.x += dx; oa.out.y += dy; }
        }
        // Also move all selected anchors in aux selections by the same delta
        for (const auxSel of this.directAuxSelections || []) {
          for (const ai of auxSel.selectedIndices) {
            const oa = auxSel.anchors[ai];
            if (!oa) continue;
            oa.x += dx; oa.y += dy;
            if (oa.in) { oa.in.x += dx; oa.in.y += dy; }
            if (oa.out) { oa.out.x += dx; oa.out.y += dy; }
          }
        }
        // Merge-target detection: show snap ring when hovering over another anchor (path must have 3+ nodes)
        drag.mergeTarget = null;
        if (this.directSelection.anchors.length > 2) {
          const wdata = this.getDirectSelectionWorldAnchors();
          if (wdata) {
            const mergeTol = 5 / this.scale;
            const mergeTolSq = mergeTol * mergeTol;
            const mLastIdx = this.directSelection.anchors.length - 1;
            // When dragging an endpoint of an open path, only snap-merge with the
            // other endpoint — intermediate anchors must not be detected first just
            // because the loop happens to reach them before the far endpoint.
            const isEndpointDrag = !this.directSelection.closed && (drag.index === 0 || drag.index === mLastIdx);
            // A candidate COINCIDENT with the drag's start position (the twin
            // seam endpoint a scissors cut leaves behind) must not merge until
            // the pointer has actually LEFT that spot — otherwise a click with
            // sub-pixel jitter on the seam re-welds the cut. Dragging away and
            // dropping back onto the twin still joins (leftStartRegion latches).
            const startWorld = drag.anchorStart ? this.sourceToWorldPoint(layer, drag.anchorStart) : null;
            if (!drag.leftStartRegion && startWorld) {
              const sdx = world.x - startWorld.x;
              const sdy = world.y - startWorld.y;
              if (sdx * sdx + sdy * sdy > mergeTolSq) drag.leftStartRegion = true;
            }
            for (let i = 0; i < wdata.anchors.length; i++) {
              if (i === drag.index) continue;
              if (isEndpointDrag && i !== 0 && i !== mLastIdx) continue;
              const wa = wdata.anchors[i];
              if (!drag.leftStartRegion && startWorld) {
                const cdx = wa.x - startWorld.x;
                const cdy = wa.y - startWorld.y;
                if (cdx * cdx + cdy * cdy <= mergeTolSq) continue;
              }
              const ddx = world.x - wa.x;
              const ddy = world.y - wa.y;
              if (ddx * ddx + ddy * ddy <= mergeTolSq) { drag.mergeTarget = i; break; }
            }
          }
        }
      } else {
        const modifiers = this.getModifierState(e);
        if (modifiers.shift) next = this.snapPenAngle(anchor, next);
        anchor[drag.type] = { x: next.x, y: next.y };
        const mirror = drag.type === 'in' ? 'out' : 'in';
        if (!modifiers.alt && anchor[mirror] !== null) {
          const dx = anchor.x - next.x;
          const dy = anchor.y - next.y;
          anchor[mirror] = { x: anchor.x + dx, y: anchor.y + dy };
        }
        drag.lastWorld = world;
        drag.mirroring = !modifiers.alt && anchor[mirror] !== null;
      }
      drag.moved = true;
      this.applyDirectPath();
      for (const auxSel of this.directAuxSelections || []) {
        this._applySelectionPath(auxSel);
      }
      // Live measurement chip: while dragging, the gray box shows the relative
      // delta dX/dY from the drag start — no pink feature
      // label during the drag. Gated by the "Coordinate readout" setting via
      // _formatChipText → null. Skips synthetic events with no clientX/Y.
      if (e && (e.clientX != null || e.clientY != null) && drag.anchorStart) {
        const dragged = this.directSelection.anchors[drag.index];
        const startW = this.sourceToWorldPoint(layer, drag.anchorStart);
        const nowW = this.sourceToWorldPoint(layer, dragged);
        this.hoverReadout = { x: nowW.x, y: nowW.y, label: null };
        this.hideAnchorLabel();
        const text = this._formatChipText('delta', { dx: nowW.x - startW.x, dy: nowW.y - startW.y });
        if (text != null) this.showDragTooltip(text, e.clientX ?? 0, e.clientY ?? 0);
      }
      this.draw();
      return true;
    }

    endDirectDrag() {
      if (!this.directDrag) return;
      const drag = this.directDrag;
      const moved = drag.moved;
      if (moved && (drag.type === 'in' || drag.type === 'out') && drag.lastWorld && this.directSelection) {
        const layer = this.getDirectSelectionLayer();
        const anchor = this.directSelection.anchors[drag.index];
        if (layer && anchor) {
          const anchorWorld = this.sourceToWorldPoint(layer, anchor);
          const snapTol = 3 / this.scale;
          if (Math.hypot(drag.lastWorld.x - anchorWorld.x, drag.lastWorld.y - anchorWorld.y) <= snapTol) {
            if (!drag.historyPushed && this.onDirectEditStart) this.onDirectEditStart();
            if (drag.mirroring) {
              anchor.in = null;
              anchor.out = null;
            } else {
              anchor[drag.type] = null;
            }
            this.applyDirectPath();
          }
        }
      }
      if (moved && drag.mergeTarget != null && this.directSelection) {
        this.markDirectSelectionAsCustomPath();
        const sel = this.directSelection;
        const lastIdx = sel.anchors.length - 1;
        const isEndpointMerge = !sel.closed && (
          (drag.index === 0 && drag.mergeTarget === lastIdx) ||
          (drag.index === lastIdx && drag.mergeTarget === 0)
        );
        // Remove the dragged endpoint and close the path at the target endpoint.
        // For endpoint→endpoint merges this closes the path; for node merges it
        // removes the node and leaves the path in its current closed/open state.
        sel.anchors.splice(drag.index, 1);
        if (isEndpointMerge) {
          sel.closed = sel.anchors.length >= 3;
        } else if (sel.closed && sel.anchors.length < 3) {
          sel.closed = false;
        }
        const nextIndices = new Set();
        for (const i of sel.selectedIndices) {
          if (i < drag.index) nextIndices.add(i);
          else if (i > drag.index) nextIndices.add(i - 1);
        }
        sel.selectedIndices = nextIndices;
        this.applyDirectPath();
        if (this.onDirectEditCommit) this.onDirectEditCommit();
        this.directDrag = null;
        this.draw();
        return;
      }
      this.directDrag = null;
      if (moved && this.onDirectEditCommit) this.onDirectEditCommit();
      this.draw();
    }

    makeAnchorSmooth(index) {
      if (!this.directSelection?.anchors?.length) return;
      const anchors = this.directSelection.anchors;
      const count = anchors.length;
      const anchor = anchors[index];
      if (!anchor) return;
      const prev = anchors[(index - 1 + count) % count] || anchor;
      const next = anchors[(index + 1) % count] || anchor;
      const vx = next.x - prev.x;
      const vy = next.y - prev.y;
      const len = Math.hypot(vx, vy) || 1;
      const ux = vx / len;
      const uy = vy / len;
      const scale = Math.max(0.8, Math.min(10, len * 0.2));
      anchor.in = { x: anchor.x - ux * scale, y: anchor.y - uy * scale };
      anchor.out = { x: anchor.x + ux * scale, y: anchor.y + uy * scale };
    }

    insertAnchorFromWorld(world, hit = null) {
      const baseHit = hit || this.findPathHitAtPoint(world, {
        restrictToLayerId: this.directSelection?.layerId || null,
      });
      if (!baseHit) return false;
      this.selectLayer(baseHit.layer);
      const selection = this.setDirectSelection(baseHit.layer, baseHit.pathIndex);
      if (!selection) return false;
      if (this.onDirectEditStart) this.onDirectEditStart();
      this.markDirectSelectionAsCustomPath();
      const insertIndex = Math.max(0, Math.min(selection.anchors.length, (baseHit.segmentIndex ?? 0) + 1));
      const sourcePoint = this.worldToSourcePoint(baseHit.layer, baseHit.point || world);
      selection.anchors.splice(insertIndex, 0, {
        x: sourcePoint.x,
        y: sourcePoint.y,
        in: null,
        out: null,
      });
      this.applyDirectPath();
      if (this.onDirectEditCommit) this.onDirectEditCommit();
      this.draw();
      return true;
    }

    removeAnchorFromWorld(world) {
      if (!this.directSelection) {
        const hitPath = this.findPathHitAtPoint(world);
        if (!hitPath) return false;
        this.selectLayer(hitPath.layer);
        if (!this.setDirectSelection(hitPath.layer, hitPath.pathIndex)) return false;
      }
      const hit = this.hitDirectControl(world);
      if (!hit || hit.type !== 'anchor') return false;
      if (this.directSelection.anchors.length <= 2) return false;
      if (this.onDirectEditStart) this.onDirectEditStart();
      this.markDirectSelectionAsCustomPath();
      this.directSelection.anchors.splice(hit.index, 1);
      if (this.directSelection.closed && this.directSelection.anchors.length < 3) {
        this.directSelection.closed = false;
      }
      this.applyDirectPath();
      if (this.onDirectEditCommit) this.onDirectEditCommit();
      this.draw();
      return true;
    }

    toggleAnchorFromWorld(world) {
      if (!this.directSelection) {
        const hit = this.findPathHitAtPoint(world);
        if (!hit) return false;
        this.selectLayer(hit.layer);
        if (!this.setDirectSelection(hit.layer, hit.pathIndex)) return false;
      }
      let control = this.hitDirectControl(world);
      if (!control || control.type !== 'anchor') {
        const hitPath = this.findPathHitAtPoint(world, {
          restrictToLayerId: this.directSelection?.layerId || null,
        });
        if (!hitPath || !this.directSelection?.anchors?.length) return false;
        const seg = Math.max(0, Math.min((hitPath.segmentIndex ?? 0), this.directSelection.anchors.length - 1));
        let idx = seg;
        if (Array.isArray(hitPath.path) && hitPath.path[seg + 1]) {
          const a = hitPath.path[seg];
          const b = hitPath.path[seg + 1];
          const da = Math.hypot(world.x - a.x, world.y - a.y);
          const db = Math.hypot(world.x - b.x, world.y - b.y);
          idx = db < da ? Math.min(this.directSelection.anchors.length - 1, seg + 1) : seg;
        }
        control = { type: 'anchor', index: idx };
      }
      const anchor = this.directSelection.anchors[control.index];
      if (!anchor) return false;
      if (this.onDirectEditStart) this.onDirectEditStart();
      this.markDirectSelectionAsCustomPath();
      if (anchor.in || anchor.out) {
        anchor.in = null;
        anchor.out = null;
      } else {
        this.makeAnchorSmooth(control.index);
      }
      this.applyDirectPath();
      if (this.onDirectEditCommit) this.onDirectEditCommit();
      this.draw();
      return true;
    }

    _handlePenAnchorDown(world, e) {
      if (!this.directSelection) {
        const hit = this.findPathHitAtPoint(world);
        if (hit) {
          this.selectLayer(hit.layer);
          this.setDirectSelection(hit.layer, hit.pathIndex);
          this.draw();
        }
        return true;
      }
      const control = this.hitDirectControl(world);
      if (control) {
        if (control.type === 'in' || control.type === 'out') {
          this.startDirectDrag(control, e);
          return true;
        }
        if (control.type === 'anchor') {
          this.penAnchorDrag = { index: control.index, historyPushed: false, moved: false };
          return true;
        }
      }
      return this.toggleAnchorFromWorld(world);
    }

    resize() {
      if (!this.ready || !this.canvas || !this.ctx) return;
      const p = this.canvas.parentElement.getBoundingClientRect();
      this.canvas.width = p.width * window.devicePixelRatio;
      this.canvas.height = p.height * window.devicePixelRatio;
      this.canvas.style.width = `${p.width}px`;
      this.canvas.style.height = `${p.height}px`;
      this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      // Auto-fit only when the canvas pixel dimensions actually changed (e.g. window
      // resize, pane toggle). ResizeObserver also fires for content-layout shifts that
      // don't change canvas size (layers panel content height, etc.); those must not
      // snap the viewport — that was the original "click-on-canvas zooms in" tutorial bug.
      const sizeChanged = this._lastCanvasW !== p.width || this._lastCanvasH !== p.height;
      this._lastCanvasW = p.width;
      this._lastCanvasH = p.height;
      if (sizeChanged && !this.userHasManipulated) this.center();
      this.draw();
    }

    center() {
      if (!this.ready || !this.canvas) return;
      this.userHasManipulated = false;
      const p = this.engine.currentProfile;
      const r = this.canvas.getBoundingClientRect();
      const sx = (r.width - 60) / p.width;
      const sy = (r.height - 60) / p.height;
      this.scale = Math.min(sx, sy);
      this.offsetX = (r.width - p.width * this.scale) / 2;
      this.offsetY = (r.height - p.height * this.scale) / 2;
    }

    draw() {
      if (!this.ready || !this.canvas || !this.ctx) return;
      const w = this.canvas.width / window.devicePixelRatio;
      const h = this.canvas.height / window.devicePixelRatio;
      this.ctx.clearRect(0, 0, w, h);
      this.ctx.fillStyle = getThemeToken('--render-canvas', '#121214');
      this.ctx.fillRect(0, 0, w, h);
      this.ctx.save();
      this.ctx.translate(this.offsetX, this.offsetY);
      this.ctx.scale(this.scale, this.scale);
      const prof = this.engine.currentProfile;
      this.ctx.fillStyle = SETTINGS.bgColor;
      this.ctx.shadowColor = getThemeToken('--render-shadow', 'rgba(0,0,0,0.5)');
      this.ctx.shadowBlur = 20;
      this.ctx.fillRect(0, 0, prof.width, prof.height);
      this.ctx.shadowBlur = 0;
      if (SETTINGS.gridType && SETTINGS.gridType !== 'none') this.drawGridOverlay(prof);
      this.ctx.strokeStyle = getThemeToken('--render-paper-outline', '#333');
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.strokeRect(0, 0, prof.width, prof.height);

      this.ctx.lineJoin = 'round';

      const selectedLayer = this.getSelectedLayer();
      const selectedLayers = this.getSelectedLayers();
      const m = SETTINGS.margin;
      const innerW = prof.width - m * 2;
      const innerH = prof.height - m * 2;
      const previewMode = SETTINGS.optimizationPreview || 'off';
      const useOptimized = previewMode === 'replace';
      // The canvas line-sort overlay rides its own (non-persisted) flag, toggled by the
      // Draw Order eye, so it stays off by default and isn't turned on by the export
      // modal / optimization-preview state.
      const showOptimizedOverlay = SETTINGS.lineSortOverlayVisible === true;
      const optimizationTargetIds = this.getOptimizationTargetIds();
      const optimize = Math.max(0, SETTINGS.plotterOptimize ?? 0);
      const tol = optimize > 0 ? Math.max(0.001, optimize) : 0;
      const dedupe = optimize > 0 ? new Map() : null;
      const quant = (v) => (tol ? Math.round(v / tol) * tol : v);
      const pathKey = (path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const cx = path.meta.cx ?? path.meta.x ?? 0;
          const cy = path.meta.cy ?? path.meta.y ?? 0;
          const r = path.meta.r ?? path.meta.rx ?? 0;
          return `c:${quant(cx)},${quant(cy)},${quant(r)}`;
        }
        if (!Array.isArray(path)) return '';
        return path
          .map((pt) => `${quant(pt.x)},${quant(pt.y)}`)
          .join('|');
      };
      // Drawing-order reveal (plot progress): renders the document up to the
      // first `drawProgress` fraction of the total PLOT TIME — pen-down draw time
      // (length ÷ draw speed) plus pen-up travel time between paths (gap ÷ travel
      // speed) — walked in true print order (pen grouping + line sort), and
      // truncated mid-path at the time cutoff by arc length. This makes the slider
      // a faithful "watch the plotter draw" preview rather than a vertex-count
      // sweep. drawProgress == 1 (or unset) disables it.
      const revealActive = this.drawProgress != null && this.drawProgress < 1;
      // While the reveal is engaged, draw the OPTIMIZED (export) geometry for
      // every optimization target — that is what the plotter actually lays down,
      // and it carries the lineSortOrder the print order depends on. Outside the
      // reveal we honor the user's optimization-preview mode unchanged.
      const layerDrawOptimized = (l) => (useOptimized || revealActive) && optimizationTargetIds.has(l.id);
      // Drawing-order reveal: build the same plot order the SVG export uses
      // (pen grouping + line-sort interleave) across exactly the optimized paths
      // we are about to draw, then pace by plot time — so the slider reveals the
      // document the way the plotter will actually print it. Computed once here so
      // both the base layer draw AND the line-sort overlay reveal in lock-step.
      let reveal = null;
      if (revealActive) {
        // Same records the colour preview orders by (buildPlotRecords), so the
        // reveal and the overlay can never walk two different sequences.
        const records = this.buildPlotRecords(optimizationTargetIds);
        reveal = Renderer.computePlotRevealOrder(records, {
          drawProgress: this.drawProgress,
          drawSpeed: SETTINGS.speedDown,
          travelSpeed: SETTINGS.speedUp,
        });
      }
      // Apply the plot-time reveal to a single path: returns the path truncated by
      // arc length (or unchanged), or null when the pen hasn't reached it yet.
      // Mirrors the per-path reveal logic in the base layer draw loop so the
      // line-sort overlay adds/removes the same lines in lock-step.
      const applyReveal = (path) => {
        if (!revealActive || !reveal) return path;
        const info = reveal.info.get(path);
        // Unmapped path (reference drift) → draw it rather than silently drop
        // geometry; the plot-order build covers every drawn path.
        if (!info) return path;
        const drawnTime = reveal.threshold - info.drawStart;
        if (drawnTime <= 0) return null;
        if (info.penDownTime > 0 && drawnTime < info.penDownTime
          && Array.isArray(path) && !(path.meta && path.meta.kind === 'circle')) {
          const revealLen = info.length * (drawnTime / info.penDownTime);
          return Renderer.sliceRevealPath(path, revealLen);
        }
        return path;
      };
      const drawLayers = () => {
        this.engine.layers.forEach((l) => {
          if (!l.visible) return;
          if (this.shouldSkipLayerForMaskPreview(l)) return;
          // Children nested inside a compound (Pathfinder) group are consumed
          // by their parent's baked silhouette — don't draw them separately.
          if (this.engine.hasCompoundAncestor?.(l)) return;
          // Plain-group isolation greys the rest of the document. Morph
          // isolation must NOT (its leaves are consumed, and unrelated layers
          // should stay normal); instead we dim only the morph blend so the
          // active source child stands out.
          const fadeLayer = this.groupEditMode?.kind === 'group' && !l.isGroup
            && l.id !== this.groupEditMode.activeLayerId;
          // Ghost-dim the morph blend so its live-refolding in-between rings read
          // as a preview of the result rather than the committed art: while a
          // child is isolated in morph edit mode, AND while a child is actively
          // being dragged/resized/rotated (even outside isolation — e.g. a child
          // selected from the layers panel).
          const dimMorphBlend = l.isGroup && l.modifier?.type === 'morph' && (
            (this.groupEditMode?.kind === 'morph' && l.id === this.groupEditMode.groupId)
            || (this._morphDragActive && this.isLayerDrag && this._morphDragGroupIds?.has(l.id))
          );
          if (fadeLayer || dimMorphBlend) {
            this.ctx.save();
            this.ctx.globalAlpha = dimMorphBlend ? 0.35 : 0.2;
          }
          const layerPen = SETTINGS.pens?.find((p) => p.id === l.penId) || null;
          const defaultPenId = l.penId || layerPen?.id || 'default';

          let currentPenId = defaultPenId;
          let currentStrokeWidth = layerPen?.width ?? l.strokeWidth ?? SETTINGS.strokeWidth;
          let currentStrokeStyle = layerPen?.color || l.color;

          // L5: paper-color pen-true preview forces the raw pen color/width (no
          // display substitution). Guarded by a default-false flag — identical
          // to the line above when off, so existing behavior is unchanged.
          if (this.paperPreviewActive()) {
            const pp = this.resolvePenStroke(defaultPenId, l);
            currentStrokeStyle = pp.color;
            currentStrokeWidth = pp.width;
          }

          this.ctx.lineWidth = currentStrokeWidth;
          // Lane B: per-layer cap/join/miter + layer-level dash (document units
          // → world mm). The layer dash becomes the batch default; per-path
          // dash/weight/fill branches save/restore around it, so it persists.
          this._applyLayerStrokeCtx(l);
          const layerDash = this._layerDashPattern(l);
          this.ctx.setLineDash(layerDash || []);
          this.ctx.beginPath();
          this.ctx.strokeStyle = currentStrokeStyle;

          const useCurves = Boolean(l.params && l.params.curves);
          const useLayerOptimized = layerDrawOptimized(l);
          const paths = this.engine.getRenderablePaths
            ? this.engine.getRenderablePaths(l, { useOptimized: useLayerOptimized })
            : l.paths;
          const isMirrorDrag = this.mirrorDragState?.has(l.id);
          const temp = !isMirrorDrag && this.selectedLayerIds?.has(l.id) && this.tempTransform
            ? this.tempTransform
            : null;
          (paths || []).forEach((path) => {
            // Drawing-order reveal: reveal each path by where it sits on the plot
            // TIMELINE (decoupled from this layer-by-layer draw loop). The path is
            // hidden until the pen reaches it, fully drawn once the cutoff clears
            // its pen-down window, and truncated by arc length for the single path
            // the cutoff lands inside.
            if (revealActive && reveal) {
              const revealed = applyReveal(path);
              if (revealed == null) return;
              path = revealed;
            }
            const next = path && path.meta && path.meta.kind === 'circle'
              ? { meta: temp ? this.transformCircleMeta(path.meta, temp) : path.meta }
              : temp ? this.transformPath(path, temp) : path;
              
            const pathPenId = (path.meta && path.meta.penId) || defaultPenId;
            if (pathPenId !== currentPenId) {
              this.ctx.stroke();
              currentPenId = pathPenId;
              const pPen = SETTINGS.pens?.find((p) => p.id === pathPenId) || null;
              currentStrokeWidth = pPen?.width ?? l.strokeWidth ?? SETTINGS.strokeWidth;
              currentStrokeStyle = pPen?.color || l.color;
              // L5: pen-true preview (see the batch-default branch above).
              if (this.paperPreviewActive()) {
                const pp = this.resolvePenStroke(pathPenId, l);
                currentStrokeStyle = pp.color;
                currentStrokeWidth = pp.width;
              }
              this.ctx.lineWidth = currentStrokeWidth;
              this.ctx.strokeStyle = currentStrokeStyle;
              this.ctx.beginPath();
            }

            let seen = null;
            if (dedupe) {
              if (!dedupe.has(currentPenId)) dedupe.set(currentPenId, new Set());
              seen = dedupe.get(currentPenId);
            }
            if (seen) {
              const key = pathKey(next);
              if (key && seen.has(key)) return;
              if (key) seen.add(key);
            }
            // Filled glyphs (e.g. spiralizer "Points" solid discs) carry meta.fill.
            // Flush the batched stroke group, then fill this path in isolation
            // with the active stroke color so the marker reads as a solid dot.
            if (path?.meta?.fill) {
              this.ctx.stroke();
              this.ctx.save();
              this.ctx.beginPath();
              this.traceLayerPath(path, l, temp, useCurves);
              this.ctx.fillStyle = currentStrokeStyle;
              this.ctx.fill();
              this.ctx.restore();
              this.ctx.beginPath();
              this.ctx.lineWidth = currentStrokeWidth;
              this.ctx.strokeStyle = currentStrokeStyle;
              this._applyLayerStrokeCtx(l);
              return;
            }
            const dash = this.getPathStrokeDash(path);
            // Variable line weight (silhouette / crease emphasis). A path carrying
            // meta.weightScale != 1 is stroked in isolation at a scaled width
            // (clamped to 6x) so it doesn't disturb the batched pen-group stroke.
            const rawWeight = Number(path?.meta?.weightScale);
            const weightScale = Number.isFinite(rawWeight) && rawWeight !== 1
              ? Math.max(0.1, Math.min(6, rawWeight))
              : 1;
            if (dash || weightScale !== 1) {
              this.ctx.stroke();
              this.ctx.save();
              if (dash) this.ctx.setLineDash(dash);
              if (weightScale !== 1) this.ctx.lineWidth = currentStrokeWidth * weightScale;
              this.ctx.beginPath();
              this.traceLayerPath(path, l, temp, useCurves);
              this.ctx.stroke();
              this.ctx.restore();
              this.ctx.beginPath();
              this.ctx.lineWidth = currentStrokeWidth;
              this.ctx.strokeStyle = currentStrokeStyle;
              this._applyLayerStrokeCtx(l);
              return;
            }
            this.traceLayerPath(path, l, temp, useCurves);
          });
          this.ctx.stroke();
          // Lane B: clear the layer-level dash so it can't leak into the next
          // layer's batch or the overlays drawn after this loop.
          if (layerDash) this.ctx.setLineDash([]);
          if (fadeLayer || dimMorphBlend) { this.ctx.restore(); }

          // Active morph child: its own geometry is consumed (drew nothing
          // above), so outline the editable source shape in the selection color.
          if (this.groupEditMode?.kind === 'morph' && l._morphConsumed
              && l.id === this.groupEditMode.activeLayerId) {
            const src = (l.effectivePaths?.length ? l.effectivePaths : l.paths) || [];
            if (src.length) {
              // During a live drag the child's effectivePaths are already
              // rewritten under the transform (mirrorDragState), so applying
              // tempTransform here too would double-offset the outline. Mirror
              // the main render's isMirrorDrag guard (line ~2862).
              const childTemp = !this.mirrorDragState?.has(l.id)
                && this.selectedLayerIds?.has(l.id) && this.tempTransform ? this.tempTransform : null;
              this.ctx.save();
              this.ctx.setLineDash([4 / this.scale, 3 / this.scale]);
              this.ctx.lineWidth = Math.max(0.4, 1 / this.scale);
              this.ctx.strokeStyle = outlineColor;
              this.ctx.beginPath();
              src.forEach((path) => {
                if (path && path.meta && path.meta.kind === 'circle') {
                  this.traceCircle(childTemp ? this.transformCircleMeta(path.meta, childTemp) : path.meta);
                } else {
                  this.tracePath(childTemp ? this.transformPath(path, childTemp) : path, false);
                }
              });
              this.ctx.stroke();
              this.ctx.setLineDash([]);
              this.ctx.restore();
            }
          }
        });
      };
      const drawOptimizedOverlay = () => {
        if (!showOptimizedOverlay || this.exportModalOpen) return;
        const overlayColor = SETTINGS.optimizationOverlayColor || '#38bdf8';
        const overlayWidth = Math.max(0.05, SETTINGS.optimizationOverlayWidth ?? 0.2);
        // Preview order == playback order == export order: all three read the
        // one plot sequence (pen groups first, then the line-sort interleave).
        const { items: overlayItems, targetLayers } = this.getDrawOrderPreviewItems(optimizationTargetIds);
        const hasLineSort = overlayItems.some((item) => this.hasLineSortOrderMetadata(item.path));
        const secondaryOverride = (SETTINGS.optimizationOverlaySecondaryColor || '').trim();
        const lineSortSecondary = secondaryOverride || this.getLineSortOverlaySecondaryColor(targetLayers);
        const shouldUseGradient = hasLineSort && overlayItems.length >= 1;
        const base = this.hexToRgb(overlayColor);
        const startRgb = base;
        const endRgb = lineSortSecondary ? this.hexToRgb(lineSortSecondary) : this.getComplementRgb(base);
        if (shouldUseGradient) {
          // Reveal in lock-step with the base draw first (skip lines the pen
          // hasn't reached, truncate the in-progress one by arc length), THEN
          // split each revealed path into point-count chunks so the gradient
          // sweeps across a single very-long path (e.g. one 6000-point
          // Pendula/Attractor trace) the same way it already does across many
          // short ones — see Renderer.buildLineSortGradientChunks.
          const revealedItems = [];
          overlayItems.forEach((item) => {
            const revealed = applyReveal(item.path);
            if (revealed == null) return;
            revealedItems.push({ layer: item.layer, useCurves: item.useCurves, path: revealed });
          });
          const chunks = Renderer.buildLineSortGradientChunks(revealedItems);
          chunks.forEach(({ layer: l, useCurves, path, t }) => {
            const color = this.mixRgb(startRgb, endRgb, t);
            this.ctx.save();
            this.ctx.lineWidth = overlayWidth;
            this.ctx.lineCap = l.lineCap || 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.strokeStyle = this.rgbToCss(color, 0.9);
            this.ctx.beginPath();
            const temp = this.selectedLayerIds?.has(l.id) && this.tempTransform ? this.tempTransform : null;
            this.traceLayerPath(path, l, temp, useCurves);
            this.ctx.stroke();
            this.ctx.restore();
          });
          this.updateOptimizationOverlayLegend(true, this.rgbToCss(startRgb, 1), this.rgbToCss(endRgb, 1));
          return;
        }
        this.updateOptimizationOverlayLegend(false);
        this.engine.layers.forEach((l) => {
          if (this.shouldSkipLayerForMaskPreview(l)) return;
          if (!optimizationTargetIds.has(l.id)) return;
          if (!l.visible || (l.mask?.enabled && l.mask?.hideLayer) || !l.optimizedPaths || !l.optimizedPaths.length) return;
          const useCurves = Boolean(l.params && l.params.curves);
          this.ctx.save();
          this.ctx.lineWidth = overlayWidth;
          this.ctx.lineCap = l.lineCap || 'round';
          this.ctx.lineJoin = 'round';
          this.ctx.strokeStyle = overlayColor;
          this.ctx.globalAlpha = 0.8;
          this.ctx.beginPath();
          const temp = this.selectedLayerIds?.has(l.id) && this.tempTransform ? this.tempTransform : null;
          l.optimizedPaths.forEach((path) => {
            // Reveal in lock-step with the base draw — skip un-reached lines and
            // truncate the in-progress one by arc length.
            const revealed = applyReveal(path);
            if (revealed == null) return;
            this.traceLayerPath(revealed, l, temp, useCurves);
          });
          this.ctx.stroke();
          this.ctx.restore();
        });
      };
      const drawHelperOverlays = () => {
        this.engine.layers.forEach((l) => {
          if (this.shouldSkipLayerForMaskPreview(l)) return;
          if (!l.visible || !l.params?.showPendulumGuides) return;
          const helperPaths = l.displayHelperPaths?.length ? l.displayHelperPaths : l.helperPaths;
          if (!helperPaths || !helperPaths.length) return;
          const color = l.params.pendulumGuideColor || '#f59e0b';
          const width = l.params.pendulumGuideWidth ?? 0.25;
          const useCurves = Boolean(l.params && l.params.curves);
          helperPaths.forEach((path, index) => {
            if (!Array.isArray(path) || path.length < 2) return;
            const next =
              this.selectedLayerIds?.has(l.id) && this.tempTransform ? this.transformPath(path, this.tempTransform) : path;
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            next.forEach((pt) => {
              minX = Math.min(minX, pt.x);
              minY = Math.min(minY, pt.y);
              maxX = Math.max(maxX, pt.x);
              maxY = Math.max(maxY, pt.y);
            });
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;

            this.ctx.save();
            this.ctx.lineWidth = width;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.strokeStyle = color;
            this.ctx.globalAlpha = 0.65;
            this.ctx.beginPath();
            this.tracePath(next, useCurves);
            this.ctx.stroke();

            this.ctx.globalAlpha = 0.5;
            this.ctx.setLineDash([1.5, 1.5]);
            this.ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
            this.ctx.setLineDash([]);

            this.ctx.globalAlpha = 0.35;
            this.ctx.setLineDash([2, 2]);
            this.ctx.beginPath();
            this.ctx.moveTo(minX, centerY);
            this.ctx.lineTo(maxX, centerY);
            this.ctx.moveTo(centerX, minY);
            this.ctx.lineTo(centerX, maxY);
            this.ctx.stroke();
            this.ctx.setLineDash([]);

            this.ctx.globalAlpha = 0.7;
            this.ctx.fillStyle = color;
            const marker = 1.4;
            [
              [minX, centerY],
              [maxX, centerY],
              [centerX, minY],
              [centerX, maxY],
            ].forEach(([mx, my]) => {
              this.ctx.beginPath();
              this.ctx.arc(mx, my, marker, 0, Math.PI * 2);
              this.ctx.fill();
            });

            this.ctx.globalAlpha = 0.8;
            const cross = 2.5;
            this.ctx.beginPath();
            this.ctx.moveTo(centerX - cross, centerY);
            this.ctx.lineTo(centerX + cross, centerY);
            this.ctx.moveTo(centerX, centerY - cross);
            this.ctx.lineTo(centerX, centerY + cross);
            this.ctx.stroke();

            const start = next[0];
            const nextPt = next[1] || start;
            const dirX = nextPt.x - start.x;
            const dirY = nextPt.y - start.y;
            const mag = Math.hypot(dirX, dirY) || 1;
            const ux = dirX / mag;
            const uy = dirY / mag;
            const arrowLen = 6;
            this.ctx.beginPath();
            this.ctx.moveTo(start.x, start.y);
            this.ctx.lineTo(start.x + ux * arrowLen, start.y + uy * arrowLen);
            this.ctx.stroke();

            this.ctx.fillStyle = color;
            this.ctx.globalAlpha = 0.9;
            this.ctx.beginPath();
            this.ctx.arc(start.x, start.y, 1.2, 0, Math.PI * 2);
            this.ctx.fill();

            const label = `P${index + 1}`;
            this.ctx.font = '3px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
            this.ctx.textBaseline = 'middle';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(label, start.x + 4, start.y - 4);

            this.ctx.restore();
          });
        });
      };
      const drawModifierGuides = () => {
        const guides = this.getMirrorGuides().filter((guide) => guide.visible);
        const underlay = getThemeToken('--render-underlay-fill', 'rgba(15, 23, 42, 0.92)');
        const dash = 2 / this.scale;

        const drawTriangle = (tri, color) => {
          this.ctx.save();
          this.ctx.fillStyle = underlay;
          this.ctx.beginPath();
          this.ctx.moveTo(tri.tipUnderlay.x, tri.tipUnderlay.y);
          this.ctx.lineTo(tri.leftUnderlay.x, tri.leftUnderlay.y);
          this.ctx.lineTo(tri.rightUnderlay.x, tri.rightUnderlay.y);
          this.ctx.closePath();
          this.ctx.fill();
          this.ctx.fillStyle = color;
          this.ctx.strokeStyle = getThemeToken('--render-underlay-stroke', 'rgba(15, 23, 42, 1)');
          this.ctx.lineWidth = 0.8 / this.scale;
          this.ctx.beginPath();
          this.ctx.moveTo(tri.tip.x, tri.tip.y);
          this.ctx.lineTo(tri.left.x, tri.left.y);
          this.ctx.lineTo(tri.right.x, tri.right.y);
          this.ctx.closePath();
          this.ctx.fill();
          this.ctx.stroke();
          this.ctx.restore();
        };

        const drawCenterHandle = (cx, cy, color) => {
          const r = 5 / this.scale;
          this.ctx.save();
          this.ctx.fillStyle = underlay;
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, r + 2 / this.scale, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.strokeStyle = color;
          this.ctx.fillStyle = color;
          this.ctx.lineWidth = 1 / this.scale;
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
          this.ctx.stroke();
          const c = 2.5 / this.scale;
          this.ctx.beginPath();
          this.ctx.moveTo(cx - c, cy); this.ctx.lineTo(cx + c, cy);
          this.ctx.moveTo(cx, cy - c); this.ctx.lineTo(cx, cy + c);
          this.ctx.stroke();
          this.ctx.restore();
        };

        guides.forEach((guide) => {
          const color = guide.mirror.color || '#56b4e9';
          const alpha = guide.locked ? 0.45 : 0.8;
          this.ctx.save();
          this.ctx.globalAlpha = alpha;

          if (guide.guideType === 'radial') {
            const { center, wedgeLines, sourceWedge } = guide;
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 0.45;
            this.ctx.setLineDash([dash, dash]);
            wedgeLines.forEach((ln) => {
              this.ctx.beginPath();
              this.ctx.moveTo(ln.x1, ln.y1);
              this.ctx.lineTo(ln.x2, ln.y2);
              this.ctx.stroke();
            });
            this.ctx.setLineDash([]);
            this.ctx.fillStyle = color;
            this.ctx.globalAlpha = alpha * 0.12;
            this.ctx.beginPath();
            this.ctx.moveTo(center.x, center.y);
            this.ctx.arc(center.x, center.y, sourceWedge.radius, sourceWedge.startAngle, sourceWedge.endAngle);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.globalAlpha = alpha;
            drawCenterHandle(center.x, center.y, color);
            this.ctx.restore();
            return;
          }

          if (guide.guideType === 'wallpaper') {
            const { fundamentalDomain, origin, latticeA, latticeB } = guide;
            if (fundamentalDomain && fundamentalDomain.length >= 3) {
              this.ctx.strokeStyle = color;
              this.ctx.lineWidth = 0.45;
              this.ctx.setLineDash([dash, dash]);
              this.ctx.beginPath();
              this.ctx.moveTo(fundamentalDomain[0].x, fundamentalDomain[0].y);
              for (let i = 1; i < fundamentalDomain.length; i++) {
                this.ctx.lineTo(fundamentalDomain[i].x, fundamentalDomain[i].y);
              }
              this.ctx.closePath();
              this.ctx.stroke();
              this.ctx.setLineDash([]);
              this.ctx.fillStyle = color;
              this.ctx.globalAlpha = alpha * 0.10;
              this.ctx.beginPath();
              this.ctx.moveTo(fundamentalDomain[0].x, fundamentalDomain[0].y);
              for (let i = 1; i < fundamentalDomain.length; i++) {
                this.ctx.lineTo(fundamentalDomain[i].x, fundamentalDomain[i].y);
              }
              this.ctx.closePath();
              this.ctx.fill();
              this.ctx.globalAlpha = alpha;
            }
            // Rotate ring (dashed circle) + rotate handle puck on the ring.
            if (guide.rotateRadius > 0) {
              this.ctx.save();
              this.ctx.strokeStyle = color;
              this.ctx.lineWidth = 0.6 / this.scale;
              this.ctx.setLineDash([dash * 0.6, dash * 0.6]);
              this.ctx.beginPath();
              this.ctx.arc(origin.x, origin.y, guide.rotateRadius, 0, Math.PI * 2);
              this.ctx.stroke();
              this.ctx.setLineDash([]);
              const rh = guide.rotateHandle;
              this.ctx.fillStyle = underlay;
              this.ctx.beginPath();
              this.ctx.arc(rh.x, rh.y, guide.rotateHandleR + 1.5 / this.scale, 0, Math.PI * 2);
              this.ctx.fill();
              this.ctx.strokeStyle = color;
              this.ctx.lineWidth = 1.4 / this.scale;
              this.ctx.beginPath();
              this.ctx.arc(rh.x, rh.y, guide.rotateHandleR, 0, Math.PI * 2);
              this.ctx.stroke();
              this.ctx.restore();
            }
            if (latticeA && latticeB) {
              const p10 = { x: origin.x + latticeA.x, y: origin.y + latticeA.y };
              const p01 = { x: origin.x + latticeB.x, y: origin.y + latticeB.y };
              [p10, p01].forEach((pt) => {
                this.ctx.save();
                this.ctx.fillStyle = underlay;
                this.ctx.beginPath();
                this.ctx.arc(pt.x, pt.y, 4 / this.scale, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = 1 / this.scale;
                this.ctx.beginPath();
                this.ctx.arc(pt.x, pt.y, 3.5 / this.scale, 0, Math.PI * 2);
                this.ctx.stroke();
                this.ctx.restore();
              });
            }
            // Center puck (draggable symmetry center) — solid filled dot drawn last so it
            // reads above the ring and lattice handles.
            this.ctx.save();
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(origin.x, origin.y, 4.5 / this.scale, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = underlay;
            this.ctx.lineWidth = 1.2 / this.scale;
            this.ctx.beginPath();
            this.ctx.arc(origin.x, origin.y, 4.5 / this.scale, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
            this.ctx.restore();
            return;
          }

          if (guide.guideType === 'arc') {
            const { center, radius, arcStartRad, arcEndRad, flipTriangle: ft, radiusHandle } = guide;
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 0.45;
            this.ctx.setLineDash([dash, dash]);
            this.ctx.beginPath();
            this.ctx.arc(center.x, center.y, radius, arcStartRad, arcEndRad);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            drawTriangle(ft, color);
            drawCenterHandle(center.x, center.y, color);
            // Radius drag handle at arc start point
            this.ctx.save();
            this.ctx.fillStyle = underlay;
            this.ctx.beginPath();
            this.ctx.arc(radiusHandle.x, radiusHandle.y, 4 / this.scale, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 1 / this.scale;
            this.ctx.beginPath();
            this.ctx.arc(radiusHandle.x, radiusHandle.y, 3.5 / this.scale, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
            this.ctx.restore();
            return;
          }

          // line guide (existing)
          const lineWidth = 0.45;
          this.ctx.strokeStyle = color;
          this.ctx.fillStyle = color;
          this.ctx.lineWidth = lineWidth;
          this.ctx.setLineDash([dash, dash]);
          this.ctx.beginPath();
          this.ctx.moveTo(guide.start.x, guide.start.y);
          this.ctx.lineTo(guide.end.x, guide.end.y);
          this.ctx.stroke();
          this.ctx.setLineDash([]);

          const drawRotateHandle = (center, direction = 'right') => {
            const rRadius = guide.rotateRadius;
            this.ctx.save();
            this.ctx.fillStyle = underlay;
            this.ctx.beginPath();
            this.ctx.arc(center.x, center.y, rRadius + 3.3 / this.scale, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.translate(center.x, center.y);
            const sc = rRadius / 11.5;
            this.ctx.scale(direction === 'left' ? -sc : sc, sc);
            this.ctx.strokeStyle = color;
            this.ctx.fillStyle = color;
            this.ctx.lineWidth = 2.25;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 7.6, Math.PI * 1.08, Math.PI * 0.18, true);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(7.2, -7.8);
            this.ctx.lineTo(11.6, -7.2);
            this.ctx.lineTo(9.4, -3.2);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 3.9, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
          };

          drawTriangle(guide.flipTriangle, color);
          drawRotateHandle(guide.rotateStart, 'left');
          drawRotateHandle(guide.rotateEnd, 'right');
          this.ctx.restore();
        });

      };
      const outlineEnabled = SETTINGS.selectionOutline !== false;
      const outlineColor = SETTINGS.selectionOutlineColor || '#ef4444';
      const drawSelectionOutline = () => {
        if (!outlineEnabled || !selectedLayers.length) return;
        selectedLayers.forEach((l) => {
          if (!l.visible || (l.mask?.enabled && l.mask?.hideLayer)) return;
          if (l.isGroup) return;
          if (this.shouldSkipLayerForMaskPreview(l)) return;
          if (SETTINGS.selectionOutlineHide3d !== false && this.get3DRotationSpec(l)) return;
          const pen = SETTINGS.pens?.find((p) => p.id === l.penId) || null;
          const strokeWidth = pen?.width ?? l.strokeWidth ?? SETTINGS.strokeWidth;
          const useCurves = Boolean(l.params && l.params.curves);
          const outlineWidth = SETTINGS.selectionOutlineWidth ?? 0.4;
          this.ctx.lineWidth = Math.max(0.1, strokeWidth + outlineWidth);
          this.ctx.lineCap = l.lineCap || 'round';
          this.ctx.strokeStyle = outlineColor;
          this.ctx.beginPath();
          this.getInteractionPaths(l).forEach((path) => {
            if (path && path.meta && path.meta.kind === 'circle') {
              const meta =
                this.selectedLayerIds?.has(l.id) && this.tempTransform
                  ? this.transformCircleMeta(path.meta, this.tempTransform)
                  : path.meta;
              this.traceCircle(meta);
            } else {
              const next =
                this.selectedLayerIds?.has(l.id) && this.tempTransform ? this.transformPath(path, this.tempTransform) : path;
              this.tracePath(next, useCurves);
            }
          });
          this.ctx.stroke();
        });
      };

      // Render artboard-only snapshot for fill loupe (no selection handles or UI overlays).
      const fillToolActive = ['fill', 'fill-erase', 'fill-pattern', 'fill-pattern-erase'].includes(this.activeTool);
      if (fillToolActive) {
        const cw = this.canvas.width;
        const ch = this.canvas.height;
        const dpr = window.devicePixelRatio;
        if (!this._loupeCleanCanvas) {
          this._loupeCleanCanvas = document.createElement('canvas');
          this._loupeCleanCanvas.width = cw;
          this._loupeCleanCanvas.height = ch;
          this._loupeCleanCtx = this._loupeCleanCanvas.getContext('2d');
          this._loupeCleanCtx.scale(dpr, dpr);
        } else if (this._loupeCleanCanvas.width !== cw || this._loupeCleanCanvas.height !== ch) {
          this._loupeCleanCanvas.width = cw;
          this._loupeCleanCanvas.height = ch;
          this._loupeCleanCtx.scale(dpr, dpr);
        }
        const mainCtx = this.ctx;
        this.ctx = this._loupeCleanCtx;
        this.ctx.clearRect(0, 0, w, h);
        this.ctx.fillStyle = getThemeToken('--render-canvas', '#121214');
        this.ctx.fillRect(0, 0, w, h);
        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);
        this.ctx.fillStyle = SETTINGS.bgColor;
        this.ctx.shadowColor = getThemeToken('--render-shadow', 'rgba(0,0,0,0.5)');
        this.ctx.shadowBlur = 20;
        this.ctx.fillRect(0, 0, prof.width, prof.height);
        this.ctx.shadowBlur = 0;
        this.ctx.strokeStyle = getThemeToken('--render-paper-outline', '#333');
        this.ctx.lineWidth = 1 / this.scale;
        this.ctx.strokeRect(0, 0, prof.width, prof.height);
        this.ctx.lineJoin = 'round';
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(m, m, innerW, innerH);
        this.ctx.clip();
        drawLayers();
        this.ctx.restore();
        this.ctx.restore();
        this.ctx = mainCtx;
      }

      if (SETTINGS.truncate) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(m, m, innerW, innerH);
        this.ctx.clip();
        drawSelectionOutline();
        drawLayers();
        drawOptimizedOverlay();
        drawHelperOverlays();
        drawModifierGuides();
        this.drawMaskPreviewOverlay();
        if (this.patternFillPreviewPolygon) this.drawPatternFillPreview();
        this.drawActiveBatchOutline();
        // 3D Scene Studio: hover silhouette hint — outlines just the object/face
        // a click would select, drawn UNDER the selection overlay (no-op without
        // a hover pick; overlay-only, never emitted to layer.paths). The crude
        // whole-layer SG-5 highlight is suppressed for scene3d in
        // _updateHoverFeedback so only this per-object hint shows.
        this.drawSceneHoverHint();
        // 3D Scene Studio: highlight the selected scene faces/objects on top
        // of the drawn geometry (no-op without a scene selection).
        this.drawSceneSelectionOverlay();
        // On-canvas resize gizmo (no-op unless a single scene object is selected).
        this.drawSceneResizeControl();
        // Box face-pull handle (no-op unless a single box face is selected).
        this.drawSceneFacePullHandle();
        // Unified per-object transform gizmo (move/rotate/scale; no-op unless a
        // single scene object is selected — supersedes the corner-scale handle).
        this.drawSceneObjectGizmo();
        // Unit 1b: the selected-light 3-axis translate gizmo (no-op unless a
        // light is selected). Suppresses the legacy sun disc while it shows.
        this.drawSceneLightGizmo();
        // Phase 2: the sun widget (no-op without a selected scene3d layer).
        this.drawSceneLightOverlay();
        this.ctx.restore();
      } else {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(m, m, innerW, innerH);
        this.ctx.clip();
        drawSelectionOutline();
        drawLayers();
        drawOptimizedOverlay();
        drawHelperOverlays();
        drawModifierGuides();
        this.drawMaskPreviewOverlay();
        if (this.patternFillPreviewPolygon) this.drawPatternFillPreview();
        this.drawActiveBatchOutline();
        // 3D Scene Studio: hover silhouette hint — outlines just the object/face
        // a click would select, drawn UNDER the selection overlay (no-op without
        // a hover pick; overlay-only, never emitted to layer.paths). The crude
        // whole-layer SG-5 highlight is suppressed for scene3d in
        // _updateHoverFeedback so only this per-object hint shows.
        this.drawSceneHoverHint();
        // 3D Scene Studio: highlight the selected scene faces/objects on top
        // of the drawn geometry (no-op without a scene selection).
        this.drawSceneSelectionOverlay();
        // On-canvas resize gizmo (no-op unless a single scene object is selected).
        this.drawSceneResizeControl();
        // Box face-pull handle (no-op unless a single box face is selected).
        this.drawSceneFacePullHandle();
        // Unified per-object transform gizmo (move/rotate/scale; no-op unless a
        // single scene object is selected — supersedes the corner-scale handle).
        this.drawSceneObjectGizmo();
        // Unit 1b: the selected-light 3-axis translate gizmo (no-op unless a
        // light is selected). Suppresses the legacy sun disc while it shows.
        this.drawSceneLightGizmo();
        // Phase 2: the sun widget (no-op without a selected scene3d layer).
        this.drawSceneLightOverlay();
        this.ctx.restore();

        const outsideAlpha = SETTINGS.outsideOpacity ?? 0.5;
        if (outsideAlpha > 0) {
          this.ctx.save();
          this.ctx.globalAlpha = outsideAlpha;
          this.ctx.beginPath();
          this.ctx.rect(0, 0, prof.width, prof.height);
          this.ctx.rect(m, m, innerW, innerH);
          this.ctx.clip('evenodd');
          drawLayers();
          this.ctx.restore();
        }
      }

      if (SETTINGS.marginLineVisible) {
        this.ctx.save();
        this.ctx.strokeStyle = SETTINGS.marginLineColor || '#52525b';
        this.ctx.lineWidth = SETTINGS.marginLineWeight ?? 0.2;
        const dotting = SETTINGS.marginLineDotting ?? 0;
        if (dotting > 0) this.ctx.setLineDash([dotting, dotting]);
        this.ctx.strokeRect(m, m, innerW, innerH);
        this.ctx.setLineDash([]);
        this.ctx.restore();
      }

      if (SETTINGS.showDocumentDimensions) {
        this.drawDocumentDimensions(prof);
      }

      if (SETTINGS.showGuides && this.guides) this.drawGuides(this.guides);
      // SG-3: equal-spacing hint chips + connecting guide during a move-drag.
      if (SETTINGS.showGuides && this._spacingHints) this.drawSpacingHints();
      // SG-5: outline the hovered unselected path (magenta) beneath the
      // selection box so click targets are legible before clicking.
      if (this.hoverHighlight) this.drawHoverHighlight();
      if (this.hoverCenter) this.drawCenterMarker();
      const selectionLayersForBox = this.tempTransform
        ? selectedLayers.filter((l) =>
            !l.displayMaskActive &&
            !(l.mask?.enabled && l.maskCapabilities?.canSource) &&
            !this.shouldSkipLayerForMaskPreview(l)
          )
        : selectedLayers;
      const showBoundingBox = this.activeTool !== 'pen' && this.activeTool !== 'direct';
      if (showBoundingBox && selectionLayersForBox.length) {
        let bounds;
        if (this.dragMode === 'rotate' && this.startBounds && this.tempTransform?.rotation != null) {
          bounds = this.applyRotationToBounds(this.startBounds, this.tempTransform.rotation);
        } else {
          bounds = this.getSelectionBounds(selectionLayersForBox, this.tempTransform);
        }
        const anyLocked = selectionLayersForBox.some((l) => this.isLayerLocked?.(l.id));
        const showHandles = !anyLocked;
        // 3D Scene Studio (§5.1): a sole selected scene layer suppresses the
        // 2D transform box/handles (no dual-meaning drags) but keeps the orbit
        // gizmo, which routes to the camera or the selected scene object.
        // Scene-tree Increment D — object3d / booleanGroup3d children are
        // scene-managed (no independent 2D transform box); the composed scene
        // group draws their gizmo. Suppress the 2D box + handles for them too.
        const soleSceneType = (l) => l && (l.type === 'scene3d' || l.type === 'object3d' || l.type === 'booleanGroup3d');
        const soleScene = selectionLayersForBox.length === 1 && soleSceneType(selectionLayersForBox[0]);
        if (bounds && !soleScene) this.drawSelection(bounds, { showHandles });
        // BUG 3 — the orbit gizmo is drawn even when `bounds` is null: a selected
        // scene object3d/booleanGroup3d child has no independent 2D bounds (its
        // geometry lives on the composed group), so get3DRotationControl resolves
        // the owning scene group and anchors off its scenePaths. Non-scene layers
        // always carry real bounds, so this is a no-op for them.
        if (showHandles && selectionLayersForBox.length === 1) {
          this.draw3DRotationControl(selectionLayersForBox[0], bounds || null);
        }
      }
      // Key-object emphasis: when an key object is set,
      // overlay its individual bbox with a thicker, solid stroke so the
      // anchor is visually distinguishable from sibling selection outlines.
      if (this.keyObjectId && this.selectedLayerIds.size > 1) {
        const keyLayer = this.engine.layers.find((l) => l.id === this.keyObjectId);
        if (keyLayer && keyLayer.visible !== false) {
          const keyBounds = this.getLayerBounds(keyLayer, this.tempTransform);
          if (keyBounds) this.drawKeyObjectOutline(keyBounds);
        }
      }
      if (this.selectionRect) this.drawSelectionRect(this.selectionRect);
      if (this.directMarqueeRect) this.drawSelectionRect(this.directMarqueeRect);
      if (this.algoDraft) this.drawAlgoDraftRect(this.algoDraft);
      if (this.lassoPath) this.drawSelectionPath(this.lassoPath);
      if (this.directSelection || this.directAuxSelections?.length) this.drawDirectSelection();
      if (!this.directSelection) {
        // Corner-radius handles persist across tools: drawn whenever a single shape layer is
        // selected (independent of showBoundingBox so they stay visible in pen/direct tools too).
        const shapeLayer = this.getSelectedShapeLayer();
        if (shapeLayer) this.drawShapeCornerHandles(shapeLayer, 0, 'all', this.tempTransform);
      }
      if (this.penDraft) this.drawPenPreview();
      if (this.shapeDraft) this.drawShapePreview();
      if (this.isScissor && this.scissorStart && this.scissorEnd) this.drawScissorPreview();
      if (this.lightSource) this.drawLightSource();
      // Type-tool caret rides the same world-transformed overlay pass as the
      // selection handles, so it tracks pan/zoom and the layer transform for free
      // (its segment is derived from world-space layer.glyphs). The selection
      // highlight draws first so the caret rides above it.
      this.drawTextFrame();
      this.drawTextModeWidget();
      this.drawAreaCreatePreview();
      this.drawTextSelection();
      this.drawTextCaret();
      this.ctx.restore();
      if (!showOptimizedOverlay || this.exportModalOpen) this.updateOptimizationOverlayLegend(false);
    }

    // ── Type tool ────────────────────────────────────────────────────────────
    // Dispatch a Type-tool click: edit the text layer under the cursor, else
    // create a new point-type text layer there. The TextEditController owns all
    // caret / selection math and the jitter / mutation gates.
    //
    // Multi-click granularity (M4): a 2nd click within 400ms and 8px selects the
    // WORD; a 3rd selects the PARAGRAPH. Shift-click EXTENDS the selection. A
    // plain single click arms a press-drag whose range is applied in move().
    handleTypeToolDown(world, e) {
      const te = this.app && this.app.textEdit;
      if (!te) return;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const sX = e && e.clientX != null ? e.clientX : 0;
      const sY = e && e.clientY != null ? e.clientY : 0;
      const prev = this._typeLastClick;
      const isMulti = prev && (now - prev.time) < 400 && Math.hypot(sX - prev.x, sY - prev.y) < 8;
      const count = isMulti ? Math.min((prev.count || 1) + 1, 3) : 1;
      this._typeLastClick = { time: now, x: sX, y: sY, count };
      this._typeDrag = null;

      const hit = this.findLayerAtPoint(world);
      if (hit && hit.type === 'text') {
        this.selectLayer(hit);
        // Granularity / extend gestures require an existing session on THIS layer
        // (the sequence's first click began it). Otherwise place a fresh caret and
        // arm a press-drag; re-placing avoids tearing down an active same-layer
        // session (which could discard an empty just-created layer).
        const active = te.getActiveLayer && te.getActiveLayer();
        const sameSession = !!(active && active.id === hit.id);
        if (count >= 3 && sameSession) {
          te.selectParagraphAtWorld?.(world.x, world.y);
        } else if (count === 2 && sameSession) {
          te.selectWordAtWorld?.(world.x, world.y);
        } else if (e && e.shiftKey && sameSession) {
          te.extendSelectionToWorld?.(world.x, world.y);
        } else {
          te.placeCaretAtWorld(hit, world.x, world.y);
          // Arm a press-drag: move() extends the selection once the pointer
          // travels past the screen-space threshold.
          this._typeDrag = { startX: sX, startY: sY, layerId: hit.id, dragging: false };
        }
      } else {
        // Empty canvas: DEFER creation until release so we can distinguish a plain
        // click (→ POINT type) from a click-drag (→ AREA type frame). Arm an
        // area-create gesture; move() grows the live frame, up() commits point vs
        // area by the drag distance. (This is distinct from `_typeDrag`, which is a
        // range-select drag WITHIN an existing session.)
        this._areaCreate = {
          startX: sX, startY: sY,
          x0: world.x, y0: world.y,
          curX: world.x, curY: world.y,
          dragging: false,
        };
      }
      this.draw();
    }

    // Live Type-tool area-create drag on empty canvas: grow the frame rectangle
    // and flag `dragging` once the pointer passes the drag threshold. The frame +
    // W/H readout are drawn by drawAreaCreatePreview() in the overlay pass.
    handleAreaCreateDrag(world, e) {
      const ac = this._areaCreate;
      if (!ac) return;
      const te = this.app && this.app.textEdit;
      const sX = e && e.clientX != null ? e.clientX : 0;
      const sY = e && e.clientY != null ? e.clientY : 0;
      ac.curX = world.x;
      ac.curY = world.y;
      if (!ac.dragging && te && te.exceedsDragThreshold(ac.startX, ac.startY, sX, sY)) {
        ac.dragging = true;
      }
      this.draw();
    }

    // Release of a Type-tool empty-canvas gesture: a drag beyond the threshold that
    // spans a usable rectangle creates AREA type; anything smaller falls back to
    // POINT type at the press point (so a 0-size or accidental micro-drag never
    // makes a degenerate frame).
    finishAreaCreate() {
      const te = this.app && this.app.textEdit;
      const ac = this._areaCreate;
      this._areaCreate = null;
      if (!te || !ac) return;
      const w = Math.abs(ac.curX - ac.x0);
      const h = Math.abs(ac.curY - ac.y0);
      // Minimum usable frame (world mm) — below this a drag reads as a click.
      const MIN_FRAME = 4;
      let created = null;
      if (ac.dragging && w >= MIN_FRAME && h >= MIN_FRAME) {
        created = te.beginNewAtArea(ac.x0, ac.y0, ac.curX, ac.curY);
      } else {
        created = te.beginNewAt(ac.x0, ac.y0);
      }
      if (created) this.selectLayer(created);
      this.draw();
    }

    // Live Type-tool press-drag: extend the selection to the cursor once the
    // drag distance passes the controller's screen threshold. (Pointer plumbing
    // is exercised by e2e.)
    handleTypeToolDrag(world, e) {
      const te = this.app && this.app.textEdit;
      const drag = this._typeDrag;
      if (!te || !drag || !te.isActive || !te.isActive()) return;
      const sX = e && e.clientX != null ? e.clientX : 0;
      const sY = e && e.clientY != null ? e.clientY : 0;
      if (!drag.dragging && !te.exceedsDragThreshold(drag.startX, drag.startY, sX, sY)) return;
      drag.dragging = true;
      te.updateSelectionDragToWorld?.(world.x, world.y);
      this.draw();
    }

    // M5: enter Type editing from a Selection / Direct-Selection double-click on a
    // text layer. Switches the active tool to Type (keeping the toolbar in sync
    // via ui.setActiveTool) and places the caret at the clicked boundary. The
    // tool switches whenever the hit is a text layer; the return value reports
    // whether an edit SESSION actually began (false when the jitter gate blocks
    // it, even though the tool still switched).
    _beginTextEditFromHit(hitLayer, world) {
      const te = this.app && this.app.textEdit;
      if (!te || !hitLayer || hitLayer.type !== 'text') return false;
      const setActiveTool = this.app && this.app.ui && this.app.ui.setActiveTool;
      if (typeof setActiveTool === 'function') setActiveTool.call(this.app.ui, 'type');
      else this.setTool('type');
      this.selectLayer(hitLayer);
      return te.placeCaretAtWorld(hitLayer, world.x, world.y);
    }

    // Draw the blinking insertion caret for an active edit session. The ctx is
    // already in world space (translate+scale applied) in the overlay pass. The
    // caret is hidden while a non-empty range is highlighted.
    drawTextCaret() {
      const te = this.app && this.app.textEdit;
      if (!te || !te.isActive() || !te.getCaretVisible()) return;
      if (te.hasSelection && te.hasSelection()) return;
      const seg = te.getCaretSegment();
      if (!seg) return;
      this.ctx.save();
      this.ctx.strokeStyle = getThemeToken('--render-selection-handle-stroke', '#f8fafc');
      this.ctx.lineWidth = Math.max(0.4, 1.4 / this.scale);
      this.ctx.lineCap = 'butt';
      this.ctx.beginPath();
      this.ctx.moveTo(seg.x0, seg.y0);
      this.ctx.lineTo(seg.x1, seg.y1);
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Draw the selection highlight (M4): fill each selected cell's world-space
    // quad. Rides the same world-transformed overlay pass as the caret, so it
    // tracks pan/zoom and the layer transform for free. Only ever draws during an
    // active edit session with a non-empty range — baselines never trigger it.
    drawTextSelection() {
      const te = this.app && this.app.textEdit;
      if (!te || !te.isActive() || !te.hasSelection || !te.hasSelection()) return;
      const quads = te.getSelectionQuads ? te.getSelectionQuads() : [];
      if (!quads.length) return;
      this.ctx.save();
      this.ctx.fillStyle = getThemeToken('--render-selection-fill', 'rgba(96, 165, 250, 0.35)');
      for (const q of quads) {
        this.ctx.beginPath();
        this.ctx.moveTo(q[0].x, q[0].y);
        this.ctx.lineTo(q[1].x, q[1].y);
        this.ctx.lineTo(q[2].x, q[2].y);
        this.ctx.lineTo(q[3].x, q[3].y);
        this.ctx.closePath();
        this.ctx.fill();
      }
      this.ctx.restore();
    }

    // Draw the AREA-type frame rectangle (thin outline) for the layer currently
    // being edited OR the selected area layer. Point type draws no frame. The ctx
    // is already in world space (the overlay pass), so the engine-transformed
    // world corners (layer.textFrame) draw directly.
    //
    // TODO(area-type, deferred): frame RESIZE-reflow. Add drag handles on the four
    // corners/edges of layer.textFrame here (mirror drawShapeCornerHandles); on
    // drag, write params.frameWidth/frameHeight (local mm = handle delta / scale)
    // and regenerate so the text re-wraps live. Also deferred: an overset red "+"
    // indicator when laid height exceeds frameHeight (+ threading), and a
    // point↔area conversion widget. Web-font area editing stays gated in
    // TextEditController.canMutate.
    // Point↔Area conversion widget — the baseline dot. Shown at the
    // right-middle of a single selected text layer (Select tool, not mid-edit):
    // HOLLOW ring = point type, FILLED dot = area type. Double-clicking it toggles
    // the mode (see the down() dbl-click path). Returns {layer, point, isArea}.
    _textModeWidgetInfo() {
      const te = this.app && this.app.textEdit;
      if (te && te.isActive && te.isActive()) return null;      // hidden while editing
      if (this.activeTool !== 'select') return null;
      const sel = this.getSelectedLayers ? this.getSelectedLayers() : [];
      if (sel.length !== 1) return null;
      const layer = sel[0];
      if (!layer || layer.type !== 'text' || !layer.params) return null;
      const bounds = this.getSelectionBounds([layer]);
      if (!bounds || !bounds.corners) return null;
      const { ne, se } = bounds.corners;
      const off = 14 / this.scale;
      return {
        layer,
        point: { x: (ne.x + se.x) / 2 + off, y: (ne.y + se.y) / 2 },
        isArea: layer.params.textMode === 'area',
      };
    }

    drawTextModeWidget() {
      const info = this._textModeWidgetInfo();
      if (!info) return;
      const r = 5 / this.scale;
      const { x, y } = info.point;
      this.ctx.save();
      const stroke = getThemeToken('--render-selection-handle-stroke', '#60a5fa');
      this.ctx.strokeStyle = stroke;
      // Filled dot = area; background-filled (reads hollow) = point.
      this.ctx.fillStyle = info.isArea ? stroke : (getThemeToken('--render-canvas-bg', '#0b0e14') || '#0b0e14');
      this.ctx.lineWidth = Math.max(0.3, 1.4 / this.scale);
      this.ctx.beginPath();
      this.ctx.arc(x, y, r, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Hit-test the conversion widget at canvas-relative screen (sx,sy).
    _hitTextModeWidget(sx, sy) {
      const info = this._textModeWidgetInfo();
      if (!info) return null;
      const sc = this.worldToScreen(info.point.x, info.point.y);
      return Math.hypot(sx - sc.x, sy - sc.y) <= 10 ? info.layer : null;
    }

    drawTextFrame() {
      const layer = this._areaFrameLayer();
      if (!layer) return;
      const f = layer.textFrame;
      this.ctx.save();
      this.ctx.strokeStyle = getThemeToken('--render-selection-handle-stroke', '#60a5fa');
      this.ctx.lineWidth = Math.max(0.3, 1 / this.scale);
      this.ctx.beginPath();
      this.ctx.moveTo(f[0].x, f[0].y);
      for (let i = 1; i < f.length; i += 1) this.ctx.lineTo(f[i].x, f[i].y);
      this.ctx.closePath();
      this.ctx.stroke();
      // Overset out-port: a red square with a "+" at the frame's bottom-right
      // (f[2]) when the laid text is taller than the frame — the standard signal
      // that some text is hidden. Threading the overflow to a linked frame is
      // deferred; this is the indicator only.
      if (layer.textOverset) {
        const s = 8 / this.scale;      // constant on-screen size
        const br = f[2];               // bottom-right corner
        const x = br.x - s;
        const y = br.y - s;
        this.ctx.fillStyle = '#ef4444';
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = Math.max(0.2, 1 / this.scale);
        this.ctx.fillRect(x, y, s, s);
        this.ctx.strokeRect(x, y, s, s);
        // white "+"
        const pad = s * 0.25;
        this.ctx.beginPath();
        this.ctx.moveTo(x + pad, y + s / 2);
        this.ctx.lineTo(x + s - pad, y + s / 2);
        this.ctx.moveTo(x + s / 2, y + pad);
        this.ctx.lineTo(x + s / 2, y + s - pad);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    // The area-type layer whose frame should be drawn: ONLY the layer being
    // actively edited on canvas, so the wrap boundary is visible while typing.
    // A merely-selected area layer draws NO frame — its transform bounding box
    // already conveys extent, and the extra solid rectangle read as redundant
    // helper-box noise (pro editors show the type frame while editing, not as a
    // persistent selection overlay).
    _areaFrameLayer() {
      const te = this.app && this.app.textEdit;
      const active = te && te.getActiveLayer && te.getActiveLayer();
      const isArea = (l) => l && l.type === 'text' && l.params && l.params.textMode === 'area'
        && Array.isArray(l.textFrame) && l.textFrame.length === 4;
      return isArea(active) ? active : null;
    }

    // Live preview during a Type-tool area-frame creation drag: the frame rectangle
    // plus a W/H readout (document units) near the cursor. Only draws once the drag
    // passes the threshold (a plain click stays a point-type creation).
    drawAreaCreatePreview() {
      const ac = this._areaCreate;
      if (!ac || !ac.dragging) return;
      const x = Math.min(ac.x0, ac.curX);
      const y = Math.min(ac.y0, ac.curY);
      const w = Math.abs(ac.curX - ac.x0);
      const h = Math.abs(ac.curY - ac.y0);
      this.ctx.save();
      this.ctx.strokeStyle = getThemeToken('--render-selection-handle-stroke', '#60a5fa');
      this.ctx.lineWidth = Math.max(0.3, 1 / this.scale);
      this.ctx.setLineDash([4 / this.scale, 3 / this.scale]);
      this.ctx.strokeRect(x, y, w, h);
      this.ctx.setLineDash([]);
      // W/H readout near the cursor. Font/offsets are divided by scale so the text
      // stays a constant on-screen size regardless of zoom.
      const label = `${w.toFixed(1)} × ${h.toFixed(1)}`;
      const fontPx = 12 / this.scale;
      const pad = 4 / this.scale;
      this.ctx.font = `${fontPx}px sans-serif`;
      this.ctx.textBaseline = 'top';
      const tw = this.ctx.measureText(label).width;
      const bx = ac.curX + pad;
      const by = ac.curY + pad;
      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      this.ctx.fillRect(bx, by, tw + pad * 2, fontPx + pad * 2);
      this.ctx.fillStyle = getThemeToken('--render-selection-handle-stroke', '#f8fafc');
      this.ctx.fillText(label, bx + pad, by + pad);
      this.ctx.restore();
    }

    _drawGridLayer(w, h, spacing, style, color, opacity, lineWidth) {
      if (spacing <= 0) return;
      this.ctx.save();
      this.ctx.globalAlpha = opacity;
      this.ctx.strokeStyle = color;
      this.ctx.fillStyle = color;
      this.ctx.lineWidth = lineWidth;
      this.ctx.beginPath();

      if (style.includes('cartesian')) {
        if (style === 'cartesian') {
          for (let x = 0; x <= w; x += spacing) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, h);
          }
          for (let y = 0; y <= h; y += spacing) {
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(w, y);
          }
          this.ctx.stroke();
        } else if (style === 'cartesian-dot') {
          for (let x = 0; x <= w; x += spacing) {
            for (let y = 0; y <= h; y += spacing) {
              this.ctx.moveTo(x, y);
              this.ctx.arc(x, y, 0.35, 0, Math.PI * 2);
            }
          }
          this.ctx.fill();
        }
      } else if (style.includes('isometric')) {
        const L = spacing;
        const dx = L * Math.cos(Math.PI / 6);
        const dy = L * Math.sin(Math.PI / 6);
        if (style === 'isometric') {
          const tan30 = Math.tan(Math.PI / 6);
          for (let x = 0; x <= w; x += dx) {
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, h);
          }
          const minDnY = Math.floor((-w * tan30) / L) * L;
          const maxDnY = Math.ceil(h / L) * L;
          for (let yInt = minDnY; yInt <= maxDnY; yInt += L) {
            this.ctx.moveTo(0, yInt);
            this.ctx.lineTo(w, yInt + w * tan30);
          }
          const maxUpY = Math.ceil((h + w * tan30) / L) * L;
          for (let yInt = 0; yInt <= maxUpY; yInt += L) {
            this.ctx.moveTo(0, yInt);
            this.ctx.lineTo(w, yInt - w * tan30);
          }
          this.ctx.stroke();
        } else if (style === 'isometric-dot') {
          let row = 0;
          for (let y = 0; y <= h + dy; y += dy) {
            const offsetX = (row % 2 === 1) ? dx : 0;
            for (let x = offsetX; x <= w + dx; x += dx * 2) {
              this.ctx.moveTo(x, y);
              this.ctx.arc(x, y, 0.35, 0, Math.PI * 2);
            }
            row++;
          }
          this.ctx.fill();
        }
      }
      this.ctx.restore();
    }

    drawGridOverlay(profile) {
      if (!profile) return;
      const style = SETTINGS.gridStyle || 'cartesian';
      const w = profile.width;
      const h = profile.height;
      const gridType = SETTINGS.gridType || 'none';

      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(0, 0, w, h);
      this.ctx.clip();

      if (gridType === 'major-minor') {
        const minorSpacing = SETTINGS.gridMinorSize || 5;
        const minorOpacity = SETTINGS.gridMinorOpacity ?? 0.08;
        const minorColor = SETTINGS.gridMinorColor || '#ffffff';
        this._drawGridLayer(w, h, minorSpacing, style, minorColor, minorOpacity, 0.1);
      }

      const spacing = SETTINGS.gridSize || 10;
      const opacity = SETTINGS.gridOpacity ?? 0.2;
      const color = SETTINGS.gridColor || '#ffffff';
      this._drawGridLayer(w, h, spacing, style, color, opacity, 0.15);

      this.ctx.restore();
    }

    snapPointToGrid(pt) {
      if (!SETTINGS.gridSnapEnabled) return pt;
      const gridType = SETTINGS.gridType || 'none';
      if (gridType === 'none') return pt;
      const sensitivity = SETTINGS.gridSnapSensitivity ?? 50;
      if (sensitivity <= 0) return pt;
      const majorSpacing = SETTINGS.gridSize || 10;
      const snapRadius = (sensitivity / 100) * (majorSpacing / 2);
      const snapMajorX = Math.round(pt.x / majorSpacing) * majorSpacing;
      const snapMajorY = Math.round(pt.y / majorSpacing) * majorSpacing;
      const dxMajor = Math.abs(pt.x - snapMajorX);
      const dyMajor = Math.abs(pt.y - snapMajorY);
      if (gridType === 'major-minor') {
        const minorSpacing = SETTINGS.gridMinorSize || 5;
        const snapMinorX = Math.round(pt.x / minorSpacing) * minorSpacing;
        const snapMinorY = Math.round(pt.y / minorSpacing) * minorSpacing;
        const dxMinor = Math.abs(pt.x - snapMinorX);
        const dyMinor = Math.abs(pt.y - snapMinorY);
        if (Math.hypot(dxMinor, dyMinor) <= Math.hypot(dxMajor, dyMajor)) {
          if (dxMinor <= snapRadius && dyMinor <= snapRadius) {
            return { x: snapMinorX, y: snapMinorY };
          }
        }
      }
      if (dxMajor <= snapRadius && dyMajor <= snapRadius) {
        return { x: snapMajorX, y: snapMajorY };
      }
      return pt;
    }

    drawDocumentDimensions(profile) {
      if (!profile) return;
      const units = normalizeDocumentUnits(SETTINGS.documentUnits);
      const labelColor = getThemeToken('--render-guide-faint', 'rgba(248, 250, 252, 0.75)');
      const lineColor = getThemeToken('--render-frame-stroke', 'rgba(255,255,255,0.08)');
      const badgeFill = getThemeToken('--render-underlay-fill', 'rgba(15, 23, 42, 0.92)');
      const badgeStroke = getThemeToken('--render-underlay-stroke', 'rgba(15, 23, 42, 1)');
      const widthText = formatDocumentLength(profile.width, units, {
        precision: units === 'imperial' ? 2 : 1,
        trimTrailingZeros: true,
        spaceBeforeUnit: true,
      });
      const heightText = formatDocumentLength(profile.height, units, {
        precision: units === 'imperial' ? 2 : 1,
        trimTrailingZeros: true,
        spaceBeforeUnit: true,
      });
      const scale = Math.max(this.scale || 1, 0.01);
      const fontSize = 10 / scale;
      const offset = 16 / scale;
      const tick = 6 / scale;
      const badgePadX = 6 / scale;
      const badgePadY = 3 / scale;
      const topY = -offset;
      const leftX = -offset;
      const drawBadge = (text, x, y, rotation = 0) => {
        this.ctx.save();
        this.ctx.translate(x, y);
        if (rotation) this.ctx.rotate(rotation);
        this.ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const metrics = this.ctx.measureText(text);
        const width = metrics.width + badgePadX * 2;
        const height = fontSize + badgePadY * 2;
        this.ctx.fillStyle = badgeFill;
        this.ctx.strokeStyle = badgeStroke;
        this.ctx.lineWidth = 1 / scale;
        this.ctx.beginPath();
        this.ctx.rect(-width / 2, -height / 2, width, height);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.fillStyle = labelColor;
        this.ctx.fillText(text, 0, 0);
        this.ctx.restore();
      };

      this.ctx.save();
      this.ctx.strokeStyle = lineColor;
      this.ctx.lineWidth = 0.8 / scale;
      this.ctx.beginPath();
      this.ctx.moveTo(0, topY + tick);
      this.ctx.lineTo(0, topY);
      this.ctx.lineTo(profile.width, topY);
      this.ctx.lineTo(profile.width, topY + tick);
      this.ctx.moveTo(leftX + tick, 0);
      this.ctx.lineTo(leftX, 0);
      this.ctx.lineTo(leftX, profile.height);
      this.ctx.lineTo(leftX + tick, profile.height);
      this.ctx.stroke();

      drawBadge(widthText, profile.width / 2, topY);
      drawBadge(heightText, leftX, profile.height / 2, -Math.PI / 2);
      this.ctx.restore();
    }

    wheel(e) {
      if (!this.ready) return;
      e.preventDefault();
      // Paint bucket: wheel cycles through the ancestor stack of containing
      // closed loops without modifier keys; held modifiers still pan/zoom.
      if ((this.activeTool === 'fill' || this.activeTool === 'fill-erase') &&
          !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey &&
          Array.isArray(this.paintBucketStack) && this.paintBucketStack.length > 1) {
        const dir = e.deltaY > 0 ? -1 : 1;
        const next = Math.max(0, Math.min(this.paintBucketStack.length - 1, this.paintBucketScopeIndex + dir));
        if (next !== this.paintBucketScopeIndex) {
          this.paintBucketScopeIndex = next;
          const entry = this.paintBucketStack[next];
          this.patternFillPreviewPolygon = entry?.polygon || null;
          this.patternFillPreviewInnerPolygon = entry?.innerPolygon || null;
          if (this.app?.ui?.setPaintBucketHint && entry) {
            if (entry.isDocBounds) {
              this.app.ui.setPaintBucketHint('Scope: document bounds — click to fill background');
            } else {
              const params = this.app?.paintBucketPanel?.getFillParams?.() || {};
              const scope = params.fillScope || 'all-objects';
              const label = scope === 'single-object' ? 'Path' : 'Scope';
              const scrollHint = scope === 'single-object' ? 'scroll to change path' : 'scroll to widen';
              this.app.ui.setPaintBucketHint(`${label} ${next + 1}/${this.paintBucketStack.length - 1} · ${scrollHint}`);
            }
          }
          this.draw();
        }
        return;
      }
      if (e.shiftKey) {
        this.offsetX += e.deltaX || e.deltaY;
        this.userHasManipulated = true;
        this.draw();
        return;
      }
      if (e.metaKey) {
        this.offsetY += e.deltaY;
        this.userHasManipulated = true;
        this.draw();
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = (mx - this.offsetX) / this.scale;
      const wy = (my - this.offsetY) / this.scale;
      const zoom = e.deltaY > 0 ? 0.9 : 1.1;
      const nextScale = Math.max(0.1, Math.min(this.scale * zoom, 1000));
      this.offsetX = mx - wx * nextScale;
      this.offsetY = my - wy * nextScale;
      this.scale = nextScale;
      this.userHasManipulated = true;
      this.draw();
    }

    down(e) {
      if (!this.ready) return;
      if (this.isTouchPointer(e)) {
        this.updateTouchPointer(e);
        if (this.touchPointers.size >= 2) {
          if (!this.touchGesture && this.canStartTouchGesture()) this.startTouchGesture();
          if (this.touchGesture) {
            if (e.cancelable) e.preventDefault();
            return;
          }
        }
      }

      if (this.touchGesture) return;
      if (this.activePointerId !== null && e.pointerId !== undefined && e.pointerId !== this.activePointerId && e.pointerType !== 'mouse') {
        return;
      }
      if (e.pointerId !== undefined) {
        this.activePointerId = e.pointerId;
        if (this.canvas.setPointerCapture) {
          try {
            this.canvas.setPointerCapture(e.pointerId);
          } catch (err) {
            // Ignore pointer capture issues on unsupported combinations.
          }
        }
      }

      const modifiers = this.getModifierState(e);
      // Scene marquee metadata never survives across gestures (armed fresh by
      // the scene-branch handlers below, consumed in up()).
      this._sceneMarqueePending = null;
      if (this.wantsPan(e, modifiers)) {
        this.isPan = true;
        this.lastM = { x: e.clientX, y: e.clientY };
        this.setCanvasCursor('grabbing');
        if (e.cancelable) e.preventDefault();
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.screenToWorld(sx, sy);
      if (e.button !== undefined && e.button !== 0) return;

      if (this.lightSourcePlacement) {
        this.setLightSource(world);
        this.lightSourcePlacement = false;
        return;
      }

      if (this.hitLightSource(world)) {
        this.lightSourceSelected = true;
        this.isLightDrag = true;
        this.lightDragOffset = { x: world.x - this.lightSource.x, y: world.y - this.lightSource.y };
        this.clearSelection();
        this.setCanvasCursor('grabbing');
        return;
      }

      this.lightSourceSelected = false;

      // ── Type tool ──────────────────────────────────────────────────────────
      // Single click: over a text layer → place caret + edit; over empty canvas
      // → create a new point-type text layer and edit it. All caret math lives in
      // the TextEditController (it reads world-space layer.glyphs only).
      if (this.activeTool === 'type') {
        this.handleTypeToolDown(world, e);
        if (e.cancelable) e.preventDefault();
        return;
      }

      if (this.activeTool === 'select' && this.getActiveModifierLayer()) {
        const hitGuide = this.hitModifierGuide(world);
        if (hitGuide) {
          if (hitGuide.guide.locked) {
            e.preventDefault();
            return;
          }
          if (hitGuide.type === 'flip') {
            const m = hitGuide.guide.mirror;
            if (m.type === 'arc') {
              m.replacedSide = m.replacedSide === 'outer' ? 'inner' : 'outer';
            } else {
              m.replacedSide = m.replacedSide === 'negative' ? 'positive' : 'negative';
            }
            this.onComputeDisplayGeometry ? this.onComputeDisplayGeometry() : this.engine.computeAllDisplayGeometry();
            if (this.onCommitTransform) this.onCommitTransform();
            this.draw();
            e.preventDefault();
            return;
          }
          const hitMirror = hitGuide.guide.mirror;
          const hitHandleId = hitGuide.handleId;
          this.modifierDrag = {
            type: hitGuide.type,
            guide: hitGuide.guide,
            handleId: hitHandleId || null,
            startWorld: { x: world.x, y: world.y },
            startAngle: hitMirror.angle ?? 0,
            startShiftX: hitMirror.xShift ?? 0,
            startShiftY: hitMirror.yShift ?? 0,
            startCenterX: hitMirror.centerX ?? 0,
            startCenterY: hitMirror.centerY ?? 0,
            startRadius: hitMirror.radius ?? 100,
            axisPoint: hitGuide.guide.axis?.point ? { ...hitGuide.guide.axis.point } : { x: world.x, y: world.y },
            startOrigin: hitGuide.guide.origin ? { ...hitGuide.guide.origin } : null,
            startRotation: hitMirror.rotation ?? 0,
          };
          this.setCanvasCursor(
            hitGuide.type === 'rotate' ? 'grabbing' :
            (hitGuide.type === 'latticeA' || hitGuide.type === 'latticeB' || hitGuide.type === 'mirrorAxisRotate' || hitGuide.type === 'wallpaperRotate') ? 'crosshair' : 'move'
          );
          e.preventDefault();
          return;
        }
      }

      if (this.isShapeTool()) {
        this.startShapeDraft(this.snapPointToGrid(world), e);
        return;
      }

      if (this.isAlgoDrawTool()) {
        const now = performance.now();
        const dt = now - this._lastAlgoTap.time;
        const dist = Math.hypot(e.clientX - this._lastAlgoTap.x, e.clientY - this._lastAlgoTap.y);
        this._lastAlgoTap = { time: now, x: e.clientX, y: e.clientY };
        if (dt < 400 && dist < 30) {
          this._lastAlgoTap.time = 0;
          if (this.onAlgoDrawComplete) {
            this.onAlgoDrawComplete({ algoType: this.algoDraftType, rect: { x: 0, y: 0, w: 0, h: 0 } });
          }
          return;
        }
        this.startAlgoDraft(this.snapPointToGrid(world));
        return;
      }

      const penSelectOverride = this.activeTool === 'pen' && modifiers.meta;
      const allowSelection = this.activeTool !== 'pen' || penSelectOverride;

      if (this.activeTool === 'pen' && !penSelectOverride) {
        if (this.penMode === 'draw') {
          this.handlePenDown(world, e);
          return;
        }
        let handled = false;
        if (this.penMode === 'add') handled = this.insertAnchorFromWorld(world);
        if (this.penMode === 'delete') handled = this.removeAnchorFromWorld(world);
        if (this.penMode === 'anchor') handled = this._handlePenAnchorDown(world, e);
        if (!handled) {
          const hit = this.findPathHitAtPoint(world);
          if (hit) {
            if (!this.selectedLayerIds.has(hit.layer.id)) this.selectLayer(hit.layer);
            this.setDirectSelection(hit.layer, hit.pathIndex);
            this.draw();
          }
        }
        return;
      }
      if (this.activeTool === 'scissor') {
        this.isScissor = true;
        this.scissorStart = world;
        this.scissorEnd = world;
        this.draw();
        return;
      }

      // Pattern Fill / Erase Pattern Fill has two very different targets:
      // - active layer IS a Pattern-algorithm layer → fill one tile-topology
      //   sub-region within its own repeating geometry (unchanged, below).
      // - any other layer type → stamp the configured pattern's tile grid
      //   into whatever closed shape was clicked, exactly like solid Fill's
      //   region detection, tagged with fillType 'patternTile' so the
      //   generator (pattern.js `_generatePatternTileFill`) clips it to the
      //   shape boundary. Erase is unaffected — applyFillAtPoint's erase mode
      //   already removes whatever fill record is under the point regardless
      //   of fillType.
      const patternToolOnNonPatternLayer =
        (this.activeTool === 'fill-pattern' || this.activeTool === 'fill-pattern-erase') &&
        this.engine?.getActiveLayer?.()?.type !== 'pattern';

      if (this.activeTool === 'fill-pattern' || this.activeTool === 'fill-pattern-erase') {
        if (!this._isWorldInsidePaper(world)) {
          if (e.cancelable) e.preventDefault();
          return;
        }
        if (!patternToolOnNonPatternLayer) {
          const poly = this._computeFillPreviewPolygon(world.x, world.y);
          if (poly && this.onPatternFill) {
            this.onPatternFill({ tool: this.activeTool, polygon: poly, worldX: world.x, worldY: world.y });
          }
          if (e.cancelable) e.preventDefault();
          return;
        }
        // Fall through to the shared solid-fill region-detection path below.
      }

      if (this.activeTool === 'fill' || this.activeTool === 'fill-erase' || patternToolOnNonPatternLayer) {
        if (!this._isWorldInsidePaper(world)) {
          if (e.cancelable) e.preventDefault();
          return;
        }
        // CMD/Ctrl+click on an existing fill adopts it as the active batch so
        // the user can tweak its params via the panel. Only meaningful in
        // pour mode; in erase mode CMD acts like a plain click.
        if (this.activeTool === 'fill' && (e.metaKey || e.ctrlKey) && !e.altKey) {
          // CMD/Ctrl is a sample gesture, not a pour. If there is no fill
          // under the cursor (empty shape or empty canvas) leave the shape
          // empty rather than falling through to a normal pour.
          this._paintBucketAdoptAtPoint(world);
          if (e.cancelable) e.preventDefault();
          return;
        }
        const patternTileParams = patternToolOnNonPatternLayer
          ? this.app?.ui?.getPatternTileFillParams?.()
          : null;
        this._paintBucketHover(world, patternTileParams);
        const mode = (this.activeTool === 'fill-erase' || this.activeTool === 'fill-pattern-erase')
          ? 'erase' : 'pour';
        this._paintBucketPour(world, mode, { startBatch: true, fillParamsOverride: patternTileParams });
        if (e.cancelable) e.preventDefault();
        return;
      }

      this._pendingSingleSelect = null;
      if (allowSelection) {
        if (this.activeTool === 'direct') {
          // 3D Scene Studio (§5.1 A / component mode): scene face/edge picks
          // and the scene A-marquee run before the 2D direct-select flow. Pure
          // meta lookup over CONTRACT B sceneTarget paths — returns false for
          // anything that is not a scene3d interaction, leaving the 2D path
          // byte-identical.
          if (this._sceneDownDirect(world, e, modifiers)) {
            if (e.cancelable) e.preventDefault();
            return;
          }
          const selectedShape = this.getSelectedShapeLayer();
          if (selectedShape) {
            const shapeCorner = this.hitShapeCornerHandle(world, selectedShape, 0);
            if (shapeCorner) {
              // Multi-corner round: if 2+ corners are selected and the grabbed
              // handle is one of them, round the whole set together; else single.
              const shapeMeta = this.getShapeMetaForLayer(selectedShape, 0);
              const cornerSet = shapeMeta?.shape ? this._selectedCornerIndices(shapeMeta.shape) : new Set();
              const multi = cornerSet.size >= 2 && cornerSet.has(shapeCorner.index);
              const scope = multi ? 'selected' : 'single';
              // Option/Alt+click switches the corner style instead of dragging.
              if (this.getModifierState(e).alt) {
                this.cycleShapeCornerType(selectedShape, 0, shapeCorner, scope, cornerSet);
                return;
              }
              // Double-click on the widget opens the Corners dialog.
              if (this._isCornerWidgetDoubleClick(e, `${selectedShape.id}:shape:${shapeCorner.index}`)) {
                if (this.onCornerDialogRequest) {
                  this.onCornerDialogRequest({
                    kind: 'shape',
                    layerId: selectedShape.id,
                    pathIndex: 0,
                    cornerIndex: shapeCorner.index,
                    scope,
                    cornerSet: Array.from(cornerSet),
                    cornerType: shapeCorner.cornerType,
                    radius: shapeCorner.radius,
                    maxRadius: shapeCorner.maxRadius,
                    clientX: e.clientX,
                    clientY: e.clientY,
                  });
                  return;
                }
              }
              if (this.beginShapeCornerDrag(selectedShape, 0, shapeCorner, scope, cornerSet, world)) return;
            }
          }
          if (!selectedShape && this.directSelection && !this.directSelection.meta?.shape) {
            const freeformCorner = this.hitFreeformCornerHandle(world);
            if (freeformCorner) {
              if (this.getModifierState(e).alt) {
                this.cycleFreeformCornerType(freeformCorner);
                return;
              }
              const widgetKey = `${this.directSelection.layerId}:freeform:${freeformCorner.sourceVertex.x},${freeformCorner.sourceVertex.y}`;
              if (this._isCornerWidgetDoubleClick(e, widgetKey)) {
                if (this.onCornerDialogRequest) {
                  this.onCornerDialogRequest({
                    kind: 'freeform',
                    layerId: this.directSelection.layerId,
                    pathIndex: this.directSelection.pathIndex,
                    vertex: { x: freeformCorner.sourceVertex.x, y: freeformCorner.sourceVertex.y },
                    cornerType: freeformCorner.cornerType,
                    radius: freeformCorner.radius || 0,
                    maxRadius: freeformCorner.maxRadius,
                    clientX: e.clientX,
                    clientY: e.clientY,
                  });
                  return;
                }
              }
              if (this.beginFreeformCornerDrag(freeformCorner, world)) return;
            }
          }
          const directControl = this.hitDirectControl(world);
          if (directControl) {
            this.startDirectDrag(directControl, e);
            return;
          }
          // Fall back to the isolated morph end's consumed geometry so the direct
          // tool can engage it (findPathHitAtPoint reads getInteractionPaths,
          // which is empty for a morph child).
          const hit = this.findPathHitAtPoint(world) || this._morphChildPathHit(world);
          if (hit) {
            if (!this.selectedLayerIds.has(hit.layer.id)) this.selectLayer(hit.layer);
            const modifiers = this.getModifierState ? this.getModifierState(e) : { shift: e.shiftKey };
            const alreadySamePath = this.directSelection?.layerId === hit.layer.id
              && this.directSelection?.pathIndex === hit.pathIndex;
            // Determine if this click lands on a segment connecting two already-selected anchors.
            // In that case the whole selection stays intact and moves as a unit.
            let segInSelection = false;
            let precomputedSeg = -1;
            if (alreadySamePath && this.directSelection.selectedIndices.size >= 2) {
              const n = this.directSelection.anchors.length;
              const s = Math.max(0, Math.min(hit.segmentIndex ?? 0, n - 1));
              const sn = this.directSelection.closed ? (s + 1) % n : Math.min(s + 1, n - 1);
              if (this.directSelection.selectedIndices.has(s) && this.directSelection.selectedIndices.has(sn)) {
                segInSelection = true;
                precomputedSeg = s;
              }
            }
            const selection = (segInSelection || (modifiers.shift && alreadySamePath))
              ? this.directSelection
              : this.setDirectSelection(hit.layer, hit.pathIndex);
            if (selection && selection.anchors.length) {
              const worldAnchors = this.getDirectSelectionWorldAnchors();
              const anchorTol = 6 / this.scale;
              const anchorTolSq = anchorTol * anchorTol;
              let nearestIdx = -1;
              let nearestDistSq = Infinity;
              if (worldAnchors) {
                worldAnchors.anchors.forEach((anchor, i) => {
                  const dx = world.x - anchor.x;
                  const dy = world.y - anchor.y;
                  const dSq = dx * dx + dy * dy;
                  if (dSq < nearestDistSq) { nearestDistSq = dSq; nearestIdx = i; }
                });
              }
              if (nearestIdx >= 0 && nearestDistSq <= anchorTolSq) {
                // Near an endpoint — select just that anchor (shift toggle handled in startDirectDrag)
                if (!modifiers.shift) selection.selectedIndices = new Set([nearestIdx]);
                this.startDirectDrag({ type: 'anchor', index: nearestIdx }, e);
              } else {
                // On segment body
                let seg;
                if (segInSelection) {
                  // Clicked inside the existing multi-selection — drag all selected anchors
                  seg = precomputedSeg;
                  this.startDirectDrag({ type: 'anchor', index: seg, preserveSelection: true }, e);
                } else {
                  // Clicked on an unselected segment — select both endpoints
                  ({ seg } = this._selectSegmentAnchors(selection, hit.segmentIndex ?? 0, modifiers.shift));
                  this.startDirectDrag({ type: 'anchor', index: seg }, e);
                }
                // grabOffset: drag tracks from the click point, not the anchor corner
                if (this.directDrag) {
                  const dragLayer = this.getDirectSelectionLayer();
                  if (dragLayer) {
                    const grabSrc = this.worldToSourcePoint(dragLayer, world);
                    const a = selection.anchors[seg];
                    this.directDrag.grabOffset = { x: grabSrc.x - a.x, y: grabSrc.y - a.y };
                  }
                }
              }
            }
            this.draw();
            return;
          }
          // No path or anchor hit — start marquee to select anchors
          this.clearDirectSelection();
          this.isDirectMarquee = true;
          this.directMarqueeStart = world;
          this.directMarqueeRect = { x: world.x, y: world.y, w: 0, h: 0 };
          this.draw();
          return;
        }
        if (this.activeTool === 'lasso') {
          this.isLassoSelecting = true;
          this.lassoPath = [world];
          this.clearSelection();
          this.draw();
          return;
        }
        const selectedLayers = this.getSelectedLayers();
        const selectionBounds = this.getSelectionBounds(selectedLayers);
        if (this.activeTool === 'select' && selectedLayers.length === 1 && !this.isLayerLocked?.(selectedLayers[0].id)) {
          const shapeLayer = this.getSelectedShapeLayer();
          if (shapeLayer) {
            const shapeCorner = this.hitShapeCornerHandle(world, shapeLayer, 0);
            if (shapeCorner) {
              // Option/Alt+click switches the corner style for every corner
              // (Select-tool scope is always the whole shape).
              if (this.getModifierState(e).alt) {
                this.cycleShapeCornerType(shapeLayer, 0, shapeCorner, 'all');
                return;
              }
              if (this._isCornerWidgetDoubleClick(e, `${shapeLayer.id}:shape:${shapeCorner.index}`)) {
                if (this.onCornerDialogRequest) {
                  this.onCornerDialogRequest({
                    kind: 'shape',
                    layerId: shapeLayer.id,
                    pathIndex: 0,
                    cornerIndex: shapeCorner.index,
                    scope: 'all',
                    cornerSet: [],
                    cornerType: shapeCorner.cornerType,
                    radius: shapeCorner.radius,
                    maxRadius: shapeCorner.maxRadius,
                    clientX: e.clientX,
                    clientY: e.clientY,
                  });
                  return;
                }
              }
              if (this.beginShapeCornerDrag(shapeLayer, 0, shapeCorner, 'all', null, world)) return;
            }
          }
        }
        // BUG 3 (hit half) — the orbit gizmo is DRAWN with null bounds for a
        // scene layer (see draw3DRotationControl's call site above), so its HIT
        // test must accept null bounds too. Requiring `selectionBounds` here
        // left the drawn gizmo un-hittable on a scene GROUP, whose geometry
        // lives in scenePaths so getSelectionBounds yields null: the click fell
        // through to _sceneDownSelect, picked the huge ground quad underneath,
        // and _sceneGizmoAnchor re-anchored on the ground's far corner — the
        // gizmo "teleported" off-canvas, and the next click deselected the
        // scene. get3DRotationControl still returns null for a NON-scene layer
        // without bounds.corners, so 2D layers stay byte-identical.
        const rotationBoundsOptional = selectedLayers.length === 1
          && !!this._sceneRotationOwner(selectedLayers[0]);
        if (
          this.activeTool === 'select' &&
          (selectionBounds || rotationBoundsOptional) &&
          selectedLayers.length === 1 &&
          !this.isLayerLocked?.(selectedLayers[0].id)
        ) {
          const rotation3DHit = this.hit3DRotationControl(sx, sy, selectedLayers[0], selectionBounds);
          if (rotation3DHit && this.begin3DRotationDrag(rotation3DHit, e)) {
            e.preventDefault();
            return;
          }
        }
        // 3D Scene Studio (Phase 2): the sun widget + shadow handle win over
        // object selection so the light can be dragged where it overlaps art.
        // Runs after the orbit gizmo (orbit still wins) and before selection.
        // Scene-tree Increment D — resolve the scene layer the gizmos act on:
        // the sole selected scene3d, OR (when an object3d / booleanGroup3d CHILD
        // is selected) its owning scene GROUP via the scene selection. This lets
        // the transform gizmo arm for a tree object even though the selected 2D
        // layer is the child, not the group.
        const gizmoSceneLayer = this.activeTool === 'select' ? this._sceneLightLayer() : null;
        if (
          gizmoSceneLayer &&
          !this.isLayerLocked?.(gizmoSceneLayer.id)
        ) {
          const sceneLayer = gizmoSceneLayer;
          // Selected-light 3-axis translate gizmo wins over everything (the
          // panel put a light in focus; the legacy sun disc is suppressed while
          // it shows).
          const lightGizmoHit = this.hitSceneLightGizmo(sx, sy, sceneLayer);
          if (lightGizmoHit && this.beginSceneLightGizmoDrag(lightGizmoHit, e)) {
            if (e.cancelable) e.preventDefault();
            return;
          }
          const lightHit = this.hitSceneLight(sx, sy, sceneLayer);
          if (lightHit && this.beginSceneLightDrag(lightHit, e)) {
            if (e.cancelable) e.preventDefault();
            return;
          }
          const shadowHit = this._hitSceneShadow(world, sceneLayer);
          if (shadowHit && this.beginSceneShadowDrag(shadowHit, e)) {
            if (e.cancelable) e.preventDefault();
            return;
          }
          // The unified transform gizmo (move/rotate/scale) wins over an object
          // re-pick underneath it — runs after sun/shadow, before the legacy
          // corner-scale/face-pull (which it supersedes for a selected object).
          const gizmoHit = this.hitSceneObjectGizmo(sx, sy, sceneLayer);
          if (gizmoHit && this.beginSceneObjectGizmoDrag(gizmoHit, e)) {
            if (e.cancelable) e.preventDefault();
            return;
          }
          // A corner scale handle wins over an object re-pick underneath it.
          const resizeHit = this.hitSceneResize(sx, sy, sceneLayer);
          if (resizeHit && this.beginSceneResizeDrag(resizeHit, e)) {
            if (e.cancelable) e.preventDefault();
            return;
          }
          // A box face-pull knob wins over a face re-pick underneath it.
          const facePullHit = this.hitSceneFacePull(sx, sy, sceneLayer);
          if (facePullHit && this.beginSceneFacePullDrag(facePullHit, e)) {
            if (e.cancelable) e.preventDefault();
            return;
          }
        }
        // 3D Scene Studio (§5.1 V / object mode): scene object picks +
        // ground-drag arming run after the gizmo (orbit wins) but before the
        // 2D handle/selection flow. Returns false when nothing scene-related
        // is under the cursor, so 2D behavior stays byte-identical.
        if (this.activeTool === 'select' && this._sceneDownSelect(world, e, modifiers)) {
          if (e.cancelable) e.preventDefault();
          return;
        }
        // Scene layers suppress the 2D transform handles (no dual-meaning
        // drags — §5.1); their resize/rotate grips are never drawn, so a hit
        // on the invisible handle geometry must not arm a 2D resize.
        const soleSceneSelected = selectedLayers.length === 1
          && (selectedLayers[0].type === 'scene3d' || selectedLayers[0].type === 'object3d'
            || selectedLayers[0].type === 'booleanGroup3d');
        if (selectionBounds && !soleSceneSelected && !selectedLayers.some(l => this.isLayerLocked?.(l.id))) {
          const handle = this.hitHandle(sx, sy, selectionBounds);
          if (handle) {
            this.isLayerDrag = true;
            this.snapAllowed = true;
            this.activeHandle = handle;
            this.dragStart = world;
            this.startBounds = selectionBounds;
            this.startMaskPreviewForSelection(selectedLayers);
            // Snapshot geometry so a morph blend can refold live while an
            // isolated child is resized/rotated (the move path arms this in its
            // own branch). Gated to morph ancestors so mirror-child resize and
            // rotate keep their existing tempTransform-only preview untouched.
            if (this._dragHasMorphAncestor(selectedLayers)) this._startMirrorDrag(selectedLayers);
            if (handle === 'rotate' || handle.startsWith('rotate-')) {
              this.dragMode = 'rotate';
              this.rotateOrigin = this.getBoundsCenter(selectionBounds);
              this.rotateStart = this.selectedLayerId ? this.getSelectedLayer()?.params.rotation ?? 0 : 0;
              this.rotateStartAngle = Math.atan2(world.y - this.rotateOrigin.y, world.x - this.rotateOrigin.x);
              this.tempTransform = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, origin: this.rotateOrigin, rotation: 0 };
              this.setCanvasCursor('grabbing');
            } else {
              this.dragMode = 'resize';
              // Area-type text resizes its FRAME (reflow), not its glyphs. Capture
              // the start frame dims so the move handler can scale them by the
              // handle drag and re-wrap live instead of scaling the letterforms.
              this._areaResize = null;
              const only = selectedLayers[0];
              if (only && only.type === 'text' && only.params && only.params.textMode === 'area') {
                this._areaResize = {
                  layerId: only.id,
                  startW: Math.max(1, Number(only.params.frameWidth) || 0),
                  startH: Math.max(1, Number(only.params.frameHeight) || 0),
                };
              }
              this.setCanvasCursor(this.handleCursor(handle, selectionBounds), 'resize');
            }
            e.preventDefault();
            return;
          }
        }

        const topLayer =
          this.activeTool === 'direct' ? this.findLayerAtPointPrecise(world) : this.findLayerAtPoint(world);

        // M5: double-clicking a text layer with the Selection OR Direct-Selection
        // tool enters Type editing (switches tool + places the caret). The direct
        // tool doesn't run the select branch below, so maintain its own dbl-click
        // timing here; the select branch keeps its own `_selectLastClick`.
        if ((this.activeTool === 'select' || this.activeTool === 'direct') && this.app && this.app.textEdit) {
          const nowT = performance.now();
          const prevT = this._selectLastClick;
          const sXT = e.clientX ?? 0;
          const sYT = e.clientY ?? 0;
          const isDblText = !!(prevT && (nowT - prevT.time) < 400 && Math.hypot(sXT - prevT.x, sYT - prevT.y) < 8);
          if (this.activeTool === 'direct') this._selectLastClick = { time: nowT, x: sXT, y: sYT };
          // Clicking the point↔area conversion dot toggles the mode. It sits
          // OUTSIDE the layer bounds, so a double-click's first click would
          // deselect (hiding the widget) — a SINGLE click is used, and it runs
          // before any deselect/marquee logic so the layer stays selected.
          if (this.activeTool === 'select') {
            const widgetLayer = this._hitTextModeWidget(sx, sy);
            if (widgetLayer) {
              const b = this.getSelectionBounds([widgetLayer]);
              const sX = Math.abs(widgetLayer.params.scaleX) || 1;
              const sY = Math.abs(widgetLayer.params.scaleY) || 1;
              const dims = b ? { width: (b.maxX - b.minX) / sX, height: (b.maxY - b.minY) / sY } : undefined;
              this.app.textEdit.convertTextMode(widgetLayer, 'toggle', dims);
              if (e.cancelable) e.preventDefault();
              return;
            }
          }
          if (isDblText && topLayer && topLayer.type === 'text') {
            this._beginTextEditFromHit(topLayer, world);
            if (e.cancelable) e.preventDefault();
            return;
          }
        }

        // Group-aware selection: group move and sublayer edit mode
        let _groupHandled = false;
        if (this.activeTool === 'select') {
          const now = performance.now();
          const prev = this._selectLastClick;
          const sX = e.clientX ?? 0;
          const sY = e.clientY ?? 0;
          const isDoubleClick = prev && (now - prev.time) < 400 && Math.hypot(sX - prev.x, sY - prev.y) < 8;
          this._selectLastClick = { time: now, x: sX, y: sY };

          if (this.groupEditMode) {
            if (this.groupEditMode.kind === 'morph') {
              // Morph children are consumed (not returned by findLayerAtPoint),
              // so resolve clicks against the source geometry directly. Bounds-aware
              // so pressing a child's filled INTERIOR grabs it (the outline-only
              // findMorphChildAtPoint would miss and previously exited isolation).
              const container = this.engine.layers.find(l => l.id === this.groupEditMode.groupId);
              const child = container
                ? this._morphChildAtPointOrBounds(world, container.id, this.groupEditMode.activeLayerId)
                : null;
              if (child) {
                this.groupEditMode.activeLayerId = child.id;
                this.setSelection([child.id], child.id);
                this.draw();
                _groupHandled = true;
              } else if (this.findMorphContainerAtPoint(world)) {
                // Clicked the blend but no source child → stay isolated (no-op).
                _groupHandled = true;
              } else {
                this.exitGroupEditMode();
              }
            } else {
              // Isolation-scoped hit test: only objects inside the isolated
              // group are selectable, and a foreground foreign layer never
              // shadows a group member. Clicking outside the group is swallowed
              // (stay isolated) — the user must press Escape / use the
              // breadcrumb to leave. Nested descendants resolve to the
              // immediate child of the isolated group.
              const member = this._findIsolatedMemberAtPoint(world);
              if (member) {
                const additiveInGroup = modifiers.shift || modifiers.meta || modifiers.ctrl;
                this.groupEditMode.activeLayerId = member.id;
                if (additiveInGroup) {
                  // Shift/Cmd-click extends the multi-selection WITHIN the
                  // isolated group; discrete action, so return before drag-init.
                  this.selectLayer(member, { toggle: true });
                  this.draw();
                  if (e.cancelable) e.preventDefault();
                  return;
                }
                this.setSelection([member.id], member.id);
                this.draw();
                _groupHandled = true;
                // fall through so a press-drag moves the member
              } else {
                if (e.cancelable) e.preventDefault();
                this.draw();
                return;
              }
            }
          }
          if (!_groupHandled && !modifiers.shift && !modifiers.meta && !modifiers.ctrl) {
            // A morph's blended output is only reachable when no normal layer is
            // under the cursor (children consumed, container skipped by
            // findLayerAtPoint), so probe it only when topLayer is null.
            const morph = !topLayer ? this.findMorphContainerAtPoint(world) : null;
            // Double-click → isolate a child. findMorphContainerAtPoint and
            // findMorphChildAtPoint are BOTH outline-only, so double-clicking the
            // filled body/centroid of a child (off every line) would otherwise miss
            // entirely and never isolate. Resolve the child by bounds across all
            // morph containers so double-clicking anywhere on a child isolates it.
            let justIsolated = false;
            if (isDoubleClick && !topLayer) {
              const dbl = morph
                ? { child: this._morphChildAtPointOrBounds(world, morph.id), container: morph }
                : this._morphChildByBounds(world);
              if (dbl && dbl.child) {
                this.enterMorphEditMode(dbl.child, dbl.container);
                e.preventDefault();
                _groupHandled = true;
                // Do NOT return: fall through to drag-init so a one-motion
                // double-click-drag (the 2nd press held and dragged) moves the
                // freshly-isolated child and the blend ghost-previews live. A
                // return here swallowed the held drag (isLayerDrag never armed).
                justIsolated = true;
              }
            }
            if (morph && !justIsolated) {
              // A morph child already selected (e.g. from the layers panel) and
              // pressed within its bounds must DRAG — not snap selection back to
              // the container. Keep it selected so the drag-init below arms
              // _startMirrorDrag([child]) and the blend ghost-previews live.
              // (findMorphChildAtPoint only hits the sparse outline, so we gate on
              // the selected child's bounds — pressing its filled interior counts,
              // matching how an isolated child drags in morph edit mode.)
              const soleSelId = this.selectedLayerIds.size === 1 ? [...this.selectedLayerIds][0] : null;
              const soleSel = soleSelId ? this.engine.layers.find((l) => l.id === soleSelId) : null;
              const selIsMorphChild = soleSel && !soleSel.isGroup
                && this.engine.getLayerAncestors(soleSel).some((a) => a.id === morph.id);
              const selChildBounds = selIsMorphChild ? this.getSelectionBounds([soleSel]) : null;
              const draggingSelectedChild = selIsMorphChild && selChildBounds
                && this.pointInBounds(world, selChildBounds)
                && !this.isLayerLocked?.(soleSel.id);
              if (draggingSelectedChild) {
                // Leave the child selected; fall through to drag-init.
                _groupHandled = true;
              } else {
                // Single click (or double-click off any source child): select the
                // morph container as one object.
                this.setSelection([morph.id], morph.id);
                _groupHandled = true;
              }
            } else if (topLayer) {
              const parentLayer = topLayer.parentId
                ? this.engine.layers.find(l => l.id === topLayer.parentId)
                : null;
              if (parentLayer?.isGroup && parentLayer.groupType === 'group') {
                if (isDoubleClick && !this.isLayerLocked?.(topLayer.id)) {
                  this.enterGroupEditMode(topLayer);
                  e.preventDefault();
                  return;
                }
                const siblings = this.engine.getLayerChildren(topLayer.parentId)
                  .filter(l => l.visible && !this.isLayerLocked?.(l.id));
                if (siblings.length > 1) {
                  this.setSelection(siblings.map(l => l.id), topLayer.id);
                  _groupHandled = true;
                }
              }
            }
          }
        }

        if (!_groupHandled) {
          const additive = modifiers.shift || modifiers.meta || modifiers.ctrl;
          if (additive && topLayer) {
            // SEL: Shift/Cmd-click toggles the clicked object in or out of the
            // multi-selection. This is a DISCRETE action —
            // return before the drag-init below so a jittery shift-click never
            // arms a move of the whole selection.
            this.selectLayer(topLayer, { toggle: true });
            this._pendingSingleSelect = null;
            if (e.cancelable) e.preventDefault();
            return;
          } else if (topLayer && !this.selectedLayerIds.has(topLayer.id)) {
            // If the clicked layer's mask ancestor is already selected, keep the existing
            // selection rather than auto-expanding to the whole mask group. The user is
            // dragging within the mask parent's bounds, not trying to re-select.
            const maskAncestors = this.engine.getAncestorMaskLayers?.(topLayer) ?? [];
            const maskAncestorSelected = maskAncestors.some((a) => this.selectedLayerIds.has(a.id));
            if (!maskAncestorSelected) {
              const maskGroup = this._getMaskGroupLayers(topLayer);
              if (maskGroup && maskGroup.length > 1) {
                this.setSelection(maskGroup.map(l => l.id), topLayer.id);
              } else {
                this.selectLayer(topLayer);
              }
            }
          } else if (topLayer && this.selectedLayerIds.size > 1 && !modifiers.shift && !modifiers.meta && !modifiers.ctrl) {
            this._pendingSingleSelect = topLayer;
          }
        }
        const updatedSelected = this.getSelectedLayers();
        const bounds = this.getSelectionBounds(updatedSelected);
        // Scene layers never bounds-drag as a whole 2D object (§5.1) — object
        // moves are ground-drags handled by _sceneDownSelect above; a press on
        // empty scene space falls through to the marquee below.
        const sceneBoundsDragSuppressed = updatedSelected.length === 1 && updatedSelected[0].type === 'scene3d';
        if (bounds && !sceneBoundsDragSuppressed && this.pointInBounds(world, bounds) && !updatedSelected.some(l => this.isLayerLocked?.(l.id))) {
          if (this.isTouchPointer(e) && !modifiers.alt) {
            // Touch: hold to lift — defer drag until finger has been held still for 350ms
            this._pendingSingleSelect = null;
            this.touchHoldStartClient = { x: e.clientX, y: e.clientY };
            this.touchHoldPending = { world, updatedSelected, bounds };
            this.touchHoldTimer = setTimeout(() => {
              this.touchHoldTimer = null;
              if (!this.touchHoldPending) return;
              const { world: w, updatedSelected: layers, bounds: b } = this.touchHoldPending;
              this.touchHoldPending = null;
              this.isLayerDrag = true;
              this.snapAllowed = true;
              this.dragMode = 'move';
              this.dragStart = w;
              this.startBounds = b;
              this.startMaskPreviewForSelection(layers);
              this._startMirrorDrag(layers);
              this.setCanvasCursor(layers.length > 1 ? 'grabbing' : 'move');
              this._attachShiftDragListener();
              if (navigator.vibrate) navigator.vibrate(30);
              this.draw();
            }, 350);
          } else {
            this.isLayerDrag = true;
            this.snapAllowed = true;
            this.dragMode = 'move';
            this.dragStart = world;
            this.startBounds = bounds;
            this.startMaskPreviewForSelection(updatedSelected);
            this._startMirrorDrag(updatedSelected);
            this.setCanvasCursor(updatedSelected.length > 1 ? 'grabbing' : 'move');
            this._attachShiftDragListener();
            if (modifiers.alt && updatedSelected.length) {
              // SEL-2: Alt/Option-drag duplicates the whole selection (single or
              // multi) and drags the copies. Never CMD/Ctrl — macOS Chrome
              // cancels drops on that modifier.
              this._beginAltDragDuplicate(updatedSelected, world, bounds);
            }
          }
          e.preventDefault();
        } else if (topLayer) {
          // no-op
        } else {
          // A click on a morph's blended output must not clear the selection or
          // start a marquee (the container is not returned by findLayerAtPoint).
          if (!this.findLayerAtPoint(world, true) && !this.findMorphContainerAtPoint(world)) {
            this.clearMaskPreview();
            this.isSelecting = true;
            this.selectionStart = world;
            this.selectionRect = { x: world.x, y: world.y, w: 0, h: 0 };
            // SEL: a Shift/Cmd marquee is additive — preserve the existing
            // selection and union the marquee hits on commit. A plain marquee
            // clears first (replace semantics).
            this._marqueeAdditive = !!(modifiers.shift || modifiers.meta || modifiers.ctrl);
            this._marqueeBaseIds = this._marqueeAdditive ? new Set(this.selectedLayerIds) : null;
            if (!this._marqueeAdditive) this.clearSelection();
          }
        }
      }
    }

    move(e) {
      if (!this.ready) return;
      // Type-tool press-drag → live selection (M4). Only while the primary button
      // is held and a drag was armed on down().
      if (this.activeTool === 'type' && this._typeDrag && (e.buttons === undefined || (e.buttons & 1))) {
        const rect = this.canvas.getBoundingClientRect();
        const world = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        this.handleTypeToolDrag(world, e);
        return;
      }
      // Type-tool area-frame creation drag on empty canvas (distinct from the
      // within-session range-select `_typeDrag` above).
      if (this.activeTool === 'type' && this._areaCreate && (e.buttons === undefined || (e.buttons & 1))) {
        const rect = this.canvas.getBoundingClientRect();
        const world = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        this.handleAreaCreateDrag(world, e);
        return;
      }
      const moveIsPatternToolOnNonPatternLayer =
        (this.activeTool === 'fill-pattern' || this.activeTool === 'fill-pattern-erase') &&
        this.engine?.getActiveLayer?.()?.type !== 'pattern';

      if (this.activeTool === 'fill' || this.activeTool === 'fill-erase' || moveIsPatternToolOnNonPatternLayer) {
        const rect = this.canvas.getBoundingClientRect();
        // `move` is wired to the window, so it fires even after the cursor
        // leaves the canvas. Without this guard the hover would re-find a
        // region under the off-canvas coordinate and re-paint the blue
        // preview overlay we just cleared on pointerleave.
        const inside =
          e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom;
        if (!inside) {
          this._paintBucketClearHover();
          return;
        }
        const world = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        // Once the cursor crosses out of the paper rectangle into the
        // surrounding canvas margin, drop the blue fill preview and bail
        // before any pour logic — clicks in the margin must not fill.
        if (!this._isWorldInsidePaper(world)) {
          this._paintBucketClearHover();
          return;
        }
        const patternTileParams = moveIsPatternToolOnNonPatternLayer
          ? this.app?.ui?.getPatternTileFillParams?.()
          : null;
        this._paintBucketHover(world, patternTileParams);
        this.showFillLoupe(e.clientX, e.clientY);
        // Drag-pour: while the primary button AND Shift are held and we
        // cross into a new region's loopId, pour again. lastPourLoopId is
        // reset on up(). Shift gating keeps a plain click from accidentally
        // filling adjacent regions when the mouse jiggles before release.
        if ((e.buttons & 1) && e.shiftKey && this.paintBucketStack?.length) {
          const target = this.paintBucketStack[this.paintBucketScopeIndex];
          if (target && target.loopId !== this.lastPourLoopId) {
            const mode = (this.activeTool === 'fill-erase' || this.activeTool === 'fill-pattern-erase')
              ? 'erase' : 'pour';
            this._paintBucketPour(world, mode, { startBatch: false, fillParamsOverride: patternTileParams });
          }
        }
        this.draw();
      } else if (this.activeTool === 'fill-pattern' || this.activeTool === 'fill-pattern-erase') {
        const rect = this.canvas.getBoundingClientRect();
        const world = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        if (!this._isWorldInsidePaper(world)) {
          this.patternFillPreviewPolygon = null;
          this.hideFillLoupe?.();
          this.draw();
          return;
        }
        this.patternFillPreviewPolygon = this._computeFillPreviewPolygon(world.x, world.y);
        this.showFillLoupe(e.clientX, e.clientY);
        this.draw();
      }
      if (this.isTouchPointer(e)) this.updateTouchPointer(e);
      if (this.touchGesture) {
        if (this.touchPointers.size >= 2) {
          this.updateTouchGesture();
          if (e.cancelable) e.preventDefault();
        }
        return;
      }
      if (this.activePointerId !== null && e.pointerId !== undefined && e.pointerId !== this.activePointerId && e.pointerType !== 'mouse') {
        return;
      }
      const modifiers = this.getModifierState(e);
      if (this.touchHoldPending && this.isTouchPointer(e)) {
        const dx = e.clientX - this.touchHoldStartClient.x;
        const dy = e.clientY - this.touchHoldStartClient.y;
        if (Math.hypot(dx, dy) > 12) {
          this.clearTouchHold();
          this.isPan = true;
          this.lastM = { x: e.clientX, y: e.clientY };
          this.setCanvasCursor('grabbing');
        } else {
          return;
        }
      }
      if (this.isPan) {
        this.offsetX += e.clientX - this.lastM.x;
        this.offsetY += e.clientY - this.lastM.y;
        this.lastM = { x: e.clientX, y: e.clientY };
        this.userHasManipulated = true;
        this.draw();
        return;
      }

      if (this.isLightDrag && this.lightSource) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        this.lightSource = {
          x: world.x - this.lightDragOffset.x,
          y: world.y - this.lightDragOffset.y,
        };
        SETTINGS.lightSource = { ...this.lightSource };
        this.draw();
        return;
      }

      if (this.shapeCornerDrag) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        this._dragCursorPos = { x: e.clientX, y: e.clientY };
        this.updateShapeCornerDrag(world);
        return;
      }

      if (this.freeformCornerDrag) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        this._dragCursorPos = { x: e.clientX, y: e.clientY };
        this.updateFreeformCornerDrag(world);
        return;
      }

      if (this.penAnchorDrag && this.activeTool === 'pen' && this.penMode === 'anchor') {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        const drag = this.penAnchorDrag;
        const layer = this.getDirectSelectionLayer();
        const anchor = this.directSelection?.anchors[drag.index];
        if (layer && anchor) {
          if (!drag.historyPushed) {
            if (this.onDirectEditStart) this.onDirectEditStart();
            this.markDirectSelectionAsCustomPath();
            drag.historyPushed = true;
          }
          const modifiers = this.getModifierState(e);
          const anchorWorld = this.sourceToWorldPoint(layer, anchor);
          const distWorld = Math.hypot(world.x - anchorWorld.x, world.y - anchorWorld.y);
          const minDist = 2 / this.scale;
          if (distWorld <= minDist) {
            anchor.out = null;
            anchor.in = null;
          } else {
            let next = this.worldToSourcePoint(layer, world);
            if (modifiers.shift) next = this.snapPenAngle(anchor, next);
            anchor.out = { x: next.x, y: next.y };
            if (!modifiers.alt) {
              const dx = next.x - anchor.x;
              const dy = next.y - anchor.y;
              anchor.in = { x: anchor.x - dx, y: anchor.y - dy };
            }
          }
          drag.moved = true;
          this.applyDirectPath();
          this.draw();
        }
        return;
      }

      if (this.directDrag) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        this.updateDirectDrag(world, e);
        return;
      }

      if (this.modifierDrag) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        const drag = this.modifierDrag;
        const mirror = drag.guide.mirror;
        if (drag.type === 'move') {
          const dx = world.x - drag.startWorld.x;
          const dy = world.y - drag.startWorld.y;
          if (mirror.type === 'radial' || mirror.type === 'arc' || mirror.type === 'wallpaper') {
            mirror.centerX = drag.startCenterX + dx;
            mirror.centerY = drag.startCenterY + dy;
          } else {
            mirror.xShift = drag.startShiftX + dx;
            mirror.yShift = drag.startShiftY + dy;
          }
        } else if (drag.type === 'rotate') {
          const startAngle = Math.atan2(drag.startWorld.y - drag.axisPoint.y, drag.startWorld.x - drag.axisPoint.x);
          const nextAngle = Math.atan2(world.y - drag.axisPoint.y, world.x - drag.axisPoint.x);
          let delta = ((nextAngle - startAngle) * 180) / Math.PI;
          if (modifiers.shift) delta = Math.round(delta / 15) * 15;
          mirror.angle = drag.startAngle + delta;
        } else if (drag.type === 'resize') {
          const dx = world.x - drag.startWorld.x;
          const dy = world.y - drag.startWorld.y;
          const center = drag.guide.center;
          const hdx = drag.startWorld.x - center.x;
          const hdy = drag.startWorld.y - center.y;
          const hlen = Math.hypot(hdx, hdy);
          const delta = hlen > 0 ? (dx * hdx + dy * hdy) / hlen : Math.hypot(dx, dy) * (dx >= 0 ? 1 : -1);
          mirror.radius = Math.max(1, drag.startRadius + delta);
          this.showDragTooltip(`r ${mirror.radius.toFixed(1)}`, e.clientX, e.clientY);
        } else if (drag.type === 'latticeA') {
          const origin = drag.startOrigin;
          const vec = { x: world.x - origin.x, y: world.y - origin.y };
          const len = Math.hypot(vec.x, vec.y);
          if (len > 0.5) {
            let newRot = Math.atan2(vec.y, vec.x) * 180 / Math.PI;
            if (modifiers.shift) newRot = Math.round(newRot / 15) * 15;
            mirror.tileWidth = Math.max(1, len);
            mirror.rotation = newRot;
          }
        } else if (drag.type === 'latticeB') {
          const origin = drag.startOrigin;
          const vec = { x: world.x - origin.x, y: world.y - origin.y };
          const len = Math.hypot(vec.x, vec.y);
          if (len > 0.5) {
            const absAngle = Math.atan2(vec.y, vec.x) * 180 / Math.PI;
            let newTileAngle = absAngle - mirror.rotation;
            if (modifiers.shift) newTileAngle = Math.round(newTileAngle / 15) * 15;
            mirror.tileHeight = Math.max(1, len);
            mirror.tileAngle = newTileAngle;
          }
        } else if (drag.type === 'wallpaperCenter') {
          const canvasCenter = drag.guide.canvasCenter || { x: 0, y: 0 };
          const { centerX, centerY } = this.wallpaperCenterFromWorld(world, canvasCenter, { shift: modifiers.shift });
          mirror.centerX = centerX;
          mirror.centerY = centerY;
        } else if (drag.type === 'wallpaperRotate') {
          const origin = drag.startOrigin || drag.guide.origin;
          mirror.rotation = this.wallpaperRotationFromWorld(world, origin, { shift: modifiers.shift });
        }
        this.onComputeDisplayGeometry ? this.onComputeDisplayGeometry() : this.engine.computeAllDisplayGeometry();
        this.draw();
        return;
      }

      if (this.rotation3DDrag) {
        this.apply3DRotationDrag(e);
        return;
      }

      // 3D Scene Studio: live unified transform-gizmo drag (move/rotate/scale).
      if (this._sceneObjectGizmoDrag) {
        this._applySceneObjectGizmoDrag(e);
        return;
      }

      // 3D Scene Studio (Unit 1b): live selected-light 3-axis translate drag.
      if (this._sceneLightGizmoDrag) {
        this._applySceneLightGizmoDrag(e);
        return;
      }

      // 3D Scene Studio: live uniform-scale gizmo drag.
      if (this._sceneResizeDrag) {
        this._applySceneResizeDrag(e);
        return;
      }

      // 3D Scene Studio: live box face-pull drag.
      if (this._sceneFacePullDrag) {
        this._applySceneFacePullDrag(e);
        return;
      }

      // 3D Scene Studio (Phase 2): live sun-widget / shadow-handle drag.
      if (this._sceneLightDrag) {
        this._applySceneLightDrag(e);
        return;
      }

      // 3D Scene Studio: live ground-drag of the selected scene object(s).
      if (this._sceneDrag) {
        this._applySceneGroundDrag(e);
        return;
      }

      if (this.isLayerDrag) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        if (this.dragMode === 'move') {
          this.lastDragWorld = world;
          let dx = world.x - this.dragStart.x;
          let dy = world.y - this.dragStart.y;
          if (modifiers.shift && this.startBounds) {
            const oc = this.startBounds.center || this.startBounds.origin;
            const mrx = world.x - oc.x;
            const mry = world.y - oc.y;
            const step = Math.PI / 4;
            const snapped = Math.round(Math.atan2(mry, mrx) / step) * step;
            const ux = Math.cos(snapped);
            const uy = Math.sin(snapped);
            const proj = mrx * ux + mry * uy;
            dx = ux * proj;
            dy = uy * proj;
          }
          // SG-1/SG-4: object-to-object alignment snap (edges, centers, and
          // nearby anchors/endpoints), composed with grid snap (nearest wins).
          // Applied live so the drag lands on the matched position; guide lines
          // for the matched axes are stashed for computeGuides to draw.
          this._objectGuideMatches = null;
          this._spacingHints = null;
          if (this._smartGuidesConfig() && this.startBounds
              && (SETTINGS.showGuides || SETTINGS.snapGuides) && !modifiers.shift) {
            const cand = this._ensureGuideCandidates(this.getSelectedLayers());
            if (cand) {
              const s = this._boundsExtents(this.startBounds);
              const ext = {
                minX: s.minX + dx, maxX: s.maxX + dx, midX: s.midX + dx,
                minY: s.minY + dy, maxY: s.maxY + dy, midY: s.midY + dy,
              };
              const snap = this._computeObjectSnap(ext);
              if (snap) {
                if (SETTINGS.snapGuides && !modifiers.meta) { dx += snap.dx; dy += snap.dy; }
                if (SETTINGS.showGuides && (snap.matchX || snap.matchY)) {
                  this._objectGuideMatches = { x: snap.matchX, y: snap.matchY };
                }
                // SG-3: equal-spacing detection on the (post edge/center-snap)
                // extents, only on an axis that edge/center snap didn't claim.
                this._spacingHints = null;
                const snappedExt = {
                  minX: ext.minX + (SETTINGS.snapGuides && !modifiers.meta ? snap.dx : 0),
                  maxX: ext.maxX + (SETTINGS.snapGuides && !modifiers.meta ? snap.dx : 0),
                  minY: ext.minY + (SETTINGS.snapGuides && !modifiers.meta ? snap.dy : 0),
                  maxY: ext.maxY + (SETTINGS.snapGuides && !modifiers.meta ? snap.dy : 0),
                };
                const spacing = this._computeEqualSpacing(snappedExt);
                if (spacing && ((spacing.axis === 'y' && !snap.matchY) || (spacing.axis === 'x' && !snap.matchX))) {
                  if (SETTINGS.snapGuides && !modifiers.meta) {
                    if (spacing.axis === 'y') { dy += spacing.delta; snappedExt.minY += spacing.delta; snappedExt.maxY += spacing.delta; }
                    else { dx += spacing.delta; snappedExt.minX += spacing.delta; snappedExt.maxX += spacing.delta; }
                  }
                  if (SETTINGS.showGuides) this._spacingHints = this._buildSpacingHints(spacing, snappedExt);
                }
              }
            }
          }
          this.tempTransform = { dx, dy, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };
          // SEL-4: live relative-delta chip while a move-drag is in progress.
          this._showMoveDeltaChip(dx, dy, e);
          if (this.mirrorDragState) {
            this.mirrorDragState.forEach((state, layerId) => {
              const layer = this.engine.layers.find((l) => l.id === layerId);
              if (!layer) return;
              layer.paths = state.basePaths.map((path) => {
                if (!Array.isArray(path)) return path;
                const t = path.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
                if (path.meta) {
                  t.meta = { ...path.meta };
                  if (typeof path.meta.cx === 'number') t.meta.cx = path.meta.cx + dx;
                  if (typeof path.meta.cy === 'number') t.meta.cy = path.meta.cy + dy;
                }
                return t;
              });
              if (this.engine.computeLayerEffectiveGeometry) this.engine.computeLayerEffectiveGeometry(layer.id);
              if (this.engine.computeLayerDisplayGeometry) this.engine.computeLayerDisplayGeometry(layer.id);
              // Divided layers: recut fragments from the fresh geometry, or
              // getRenderablePaths keeps serving pre-drag fragments (frozen
              // layer for the whole drag). Resets dividedPaths first, so this
              // is safe per pointermove.
              if (this.engine.applyStrokeDivision) this.engine.applyStrokeDivision([layer]);
            });
            // When a dragged layer sits under a morph modifier, the cheap
            // per-layer recompute above does not refresh the parent's morphed
            // output. Schedule a coalesced refold so the in-between rings track
            // the drag live (matches the released result).
            if (this._morphDragActive) this._scheduleMorphDragRecompute();
          }
        } else if (this.dragMode === 'resize' && this.startBounds && this.activeHandle) {
          const fromCenter = modifiers.alt || modifiers.meta;
          const origin = fromCenter ? this.getBoundsCenter(this.startBounds) : this.getResizeAnchor(this.activeHandle, this.startBounds);
          const handlePoint = this.getHandlePoint(this.activeHandle, this.startBounds);
          const startVec = { x: handlePoint.x - origin.x, y: handlePoint.y - origin.y };
          const currVec = { x: world.x - origin.x, y: world.y - origin.y };
          const rot = -(this.startBounds.rotation || 0);
          const cosR = Math.cos(rot);
          const sinR = Math.sin(rot);
          const startVecLocal = { x: startVec.x * cosR - startVec.y * sinR, y: startVec.x * sinR + startVec.y * cosR };
          const currVecLocal = { x: currVec.x * cosR - currVec.y * sinR, y: currVec.x * sinR + currVec.y * cosR };
          const safeX = Math.abs(startVecLocal.x) < 0.001 ? 0.001 : startVecLocal.x;
          const safeY = Math.abs(startVecLocal.y) < 0.001 ? 0.001 : startVecLocal.y;
          let scaleX = currVecLocal.x / safeX;
          let scaleY = currVecLocal.y / safeY;
          // SEL-1: edge-midpoint handles resize along one axis only (opposite
          // edge fixed); Shift constrains proportions to the driven axis.
          const edgeAxis = (this.activeHandle === 'n' || this.activeHandle === 's')
            ? 'y'
            : (this.activeHandle === 'e' || this.activeHandle === 'w') ? 'x' : null;
          if (edgeAxis) {
            const driven = edgeAxis === 'y' ? scaleY : scaleX;
            scaleX = edgeAxis === 'x' || modifiers.shift ? driven : 1;
            scaleY = edgeAxis === 'y' || modifiers.shift ? driven : 1;
          } else if (modifiers.shift) {
            const uni = Math.abs(scaleX) > Math.abs(scaleY) ? scaleX : scaleY;
            scaleX = uni;
            scaleY = uni;
          }
          scaleX = Math.max(0.05, Math.min(Math.abs(scaleX), 20));
          scaleY = Math.max(0.05, Math.min(Math.abs(scaleY), 20));
          const areaResizeLayer = this._areaResize
            ? this.engine.layers.find((l) => l.id === this._areaResize.layerId) : null;
          if (areaResizeLayer) {
            // Reflow: reinterpret the handle scale as new frame dimensions (local
            // mm), keep glyph size/scale unchanged, and regenerate so the text
            // re-wraps live. tempTransform stays identity so glyphs don't scale.
            // History: the frame is mutated live during the drag, so snapshot the
            // PRE-change state once (before the first mutation) and suppress the
            // release-time commit push (which would capture the post-change state).
            if (!this._areaResize.pushed) {
              this._areaResize.pushed = true;
              this._skipCommitHistory = true;
              if (this.app && typeof this.app.pushHistory === 'function') this.app.pushHistory();
            }
            areaResizeLayer.params.frameWidth = Math.max(4, this._areaResize.startW * scaleX);
            areaResizeLayer.params.frameHeight = Math.max(4, this._areaResize.startH * scaleY);
            this.engine.generate(areaResizeLayer.id);
            this.tempTransform = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, origin };
            this.showDragTooltip(
              `${Math.round(areaResizeLayer.params.frameWidth)} × ${Math.round(areaResizeLayer.params.frameHeight)} mm`,
              e.clientX, e.clientY,
            );
          } else {
            this.tempTransform = { dx: 0, dy: 0, scaleX, scaleY, origin };
            const _tw = Math.round(Math.abs((this.startBounds.maxX - this.startBounds.minX) * scaleX));
            const _th = Math.round(Math.abs((this.startBounds.maxY - this.startBounds.minY) * scaleY));
            this.showDragTooltip(`${_tw} × ${_th}`, e.clientX, e.clientY);
          }
          // Live-refold a morph blend while a descendant child is resized.
          if (this.mirrorDragState && this._morphDragActive) this._previewMirrorDragWithTemp(this.tempTransform);
        } else if (this.dragMode === 'rotate' && this.rotateOrigin) {
          const angle = Math.atan2(world.y - this.rotateOrigin.y, world.x - this.rotateOrigin.x);
          let delta = ((angle - this.rotateStartAngle) * 180) / Math.PI;
          if (modifiers.shift) {
            const snap = 15;
            delta = Math.round(delta / snap) * snap;
          }
          this.tempTransform = { dx: 0, dy: 0, scaleX: 1, scaleY: 1, origin: this.rotateOrigin, rotation: delta };
          this.showDragTooltip(`${Math.round(delta)}°`, e.clientX, e.clientY);
          // Live-refold a morph blend while a descendant child is rotated.
          if (this.mirrorDragState && this._morphDragActive) this._previewMirrorDragWithTemp(this.tempTransform);
        }
        const activeLayers = this.getSelectedLayers();
        const bounds = activeLayers.length ? this.getSelectionBounds(activeLayers, this.tempTransform) : null;
        const needsGuides = SETTINGS.showGuides || SETTINGS.snapGuides;
        this.snapAllowed = !modifiers.meta;
        this.guides = needsGuides && bounds ? this.computeGuides(activeLayers, bounds) : null;
        this.snap = SETTINGS.snapGuides && bounds ? this.computeSnap(activeLayers, bounds) : null;
        this.draw();
        return;
      }

      if (this.activeTool === 'pen' && this.penDraft) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const next = this.screenToWorld(sx, sy);
        const anchors = this.penDraft.anchors || [];
        if (this.isPenDragging && this.penDragAnchor !== null) {
          const anchor = anchors[this.penDragAnchor];
          if (anchor) {
            const target = modifiers.shift ? this.snapPenAngle(anchor, next) : next;
            const dist = Math.hypot(target.x - anchor.x, target.y - anchor.y);
            const minDist = 2 / this.scale;
            if (this.isPenCloseDragging) {
              // Only update anchor[0].in — controls the incoming curve of the closing segment.
              // Do not touch anchor[0].out (set when the path was started).
              if (dist <= minDist) {
                anchor.in = null;
              } else {
                const vec = { x: target.x - anchor.x, y: target.y - anchor.y };
                anchor.in = { x: anchor.x - vec.x, y: anchor.y - vec.y };
              }
            } else {
              if (dist <= minDist) {
                anchor.out = null;
                if (modifiers.alt) {
                  if (!this.penDragMirrorLock || this.penDragMirrorLock.index !== this.penDragAnchor) {
                    this.penDragMirrorLock = { index: this.penDragAnchor, handle: cloneHandle(anchor.in) };
                  }
                  anchor.in = cloneHandle(this.penDragMirrorLock.handle);
                } else {
                  anchor.in = null;
                  this.penDragMirrorLock = null;
                }
              } else {
                if (modifiers.alt) {
                  if (!this.penDragMirrorLock || this.penDragMirrorLock.index !== this.penDragAnchor) {
                    this.penDragMirrorLock = { index: this.penDragAnchor, handle: cloneHandle(anchor.in) };
                  }
                  anchor.out = { x: target.x, y: target.y };
                  anchor.in = cloneHandle(this.penDragMirrorLock.handle);
                } else {
                  this.penDragMirrorLock = null;
                  this.setAnchorHandles(anchor, target);
                }
              }
              this.penPreview = target;
            }
          }
        } else {
          const last = anchors[anchors.length - 1];
          const snapped = this.snapPointToGrid(next);
          let preview = modifiers.shift && last ? this.snapPenAngle(last, snapped) : snapped;
          const first = anchors[0];
          const snapTol = 5 / this.scale;
          if (!modifiers.meta && anchors.length >= 2 && first &&
              Math.hypot(next.x - first.x, next.y - first.y) <= snapTol) {
            preview = { x: first.x, y: first.y };
            this.penSnapToOrigin = true;
          } else {
            this.penSnapToOrigin = false;
          }
          this.penPreview = preview;
        }
        this.draw();
        return;
      }

      if (this.isShapeTool() && this.shapeDraft) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const next = this.screenToWorld(sx, sy);
        this.updateShapeDraft(this.snapPointToGrid(next), e);
        return;
      }

      if (this.algoDraft) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const next = this.screenToWorld(sx, sy);
        this.updateAlgoDraft(this.snapPointToGrid(next));
        return;
      }

      if (this.activeTool === 'scissor' && this.isScissor) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const next = this.screenToWorld(sx, sy);
        this.scissorEnd =
          this.scissorMode === 'line' && modifiers.shift && this.scissorStart
            ? this.snapScissorAngle(this.scissorStart, next, 15)
            : next;
        this.draw();
        return;
      }

      if (this.isLassoSelecting && this.lassoPath) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        const last = this.lassoPath[this.lassoPath.length - 1];
        const minDist = 2 / this.scale;
        if (!last || Math.hypot(world.x - last.x, world.y - last.y) >= minDist) {
          this.lassoPath.push(world);
        }
        this.draw();
        return;
      }

      if (this.isDirectMarquee && this.directMarqueeStart) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        this.directMarqueeRect = {
          x: Math.min(this.directMarqueeStart.x, world.x),
          y: Math.min(this.directMarqueeStart.y, world.y),
          w: Math.abs(world.x - this.directMarqueeStart.x),
          h: Math.abs(world.y - this.directMarqueeStart.y),
        };
        this.draw();
        return;
      }

      if (this.isSelecting && this.selectionStart) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const world = this.screenToWorld(sx, sy);
        const dx = world.x - this.selectionStart.x;
        const dy = world.y - this.selectionStart.y;
        let w = Math.abs(dx);
        let h = Math.abs(dy);
        let x = Math.min(this.selectionStart.x, world.x);
        let y = Math.min(this.selectionStart.y, world.y);
        if (modifiers.meta) {
          const size = Math.max(w, h);
          w = size;
          h = size;
          x = this.selectionStart.x + (dx < 0 ? -size : 0);
          y = this.selectionStart.y + (dy < 0 ? -size : 0);
        }
        this.selectionRect = { x, y, w, h };
        this.draw();
        return;
      }

      if (!this.isTouchPointer(e)) {
        this._lastPointerEvent = e;
        this.updateHoverCursor(e);
        // SEL-4/SG-2/SG-5: hover chips, semantic labels, and hover highlight.
        this._updateHoverFeedback(e);
        // 3D Scene Studio: hover silhouette hint (overlay only). Reached only on
        // the plain-hover tail — every drag/orbit/pan branch returns above — so
        // the hint is naturally skipped while manipulating.
        this._updateSceneHoverHint(e);
      }
    }

    up(e = {}) {
      if (!this.ready || !this.canvas) return;
      // Commit a Type-tool empty-canvas creation gesture: drag → area frame,
      // click → point type. Runs before other up() handling and consumes the event.
      if (this.activeTool === 'type' && this._areaCreate) {
        this.finishAreaCreate();
        this.removeTouchPointer(e);
        this.activePointerId = null;
        return;
      }
      // End any active Type-tool press-drag (the selection is already applied).
      this._typeDrag = null;
      this.lastPourLoopId = null;
      this.removeTouchPointer(e);
      const clearActivePointer = () => {
        if (e.pointerId !== undefined && this.canvas.releasePointerCapture) {
          try {
            if (this.canvas.hasPointerCapture && this.canvas.hasPointerCapture(e.pointerId)) {
              this.canvas.releasePointerCapture(e.pointerId);
            }
          } catch (err) {
            // Ignore pointer capture release issues.
          }
        }
        this.activePointerId = null;
      };
      if (this.touchGesture) {
        if (this.touchPointers.size >= 2) {
          this.updateTouchGesture();
          return;
        }
        this.stopTouchGesture();
        if (this.touchPointers.size > 0) {
          clearActivePointer();
          return;
        }
      }
      if (this.activePointerId !== null && e.pointerId !== undefined && e.pointerId !== this.activePointerId && e.pointerType !== 'mouse') {
        return;
      }
      if (this.touchHoldPending) {
        this.clearTouchHold();
        clearActivePointer();
        this.updateCursor();
        this.draw();
        return;
      }
      if (this.isLightDrag) {
        this.isLightDrag = false;
        this.updateCursor();
      }
      if (this.isPenDragging) {
        const wasCloseDrag = this.isPenCloseDragging;
        this.isPenDragging = false;
        this.isPenCloseDragging = false;
        this.penDragAnchor = null;
        this.penDragStart = null;
        this.penDragMirrorLock = null;
        if (wasCloseDrag) {
          this.commitPenPath();
          clearActivePointer();
          return;
        }
      }
      if (this.penAnchorDrag) {
        const drag = this.penAnchorDrag;
        this.penAnchorDrag = null;
        if (drag.moved && this.onDirectEditCommit) this.onDirectEditCommit();
        this.draw();
        clearActivePointer();
        return;
      }
      if (this.algoDraft) {
        this.commitAlgoDraft();
        clearActivePointer();
        return;
      }
      if (this.shapeDraft) {
        this.commitShapeDraft();
        clearActivePointer();
        return;
      }
      if (this.shapeCornerDrag) {
        this.endShapeCornerDrag();
        clearActivePointer();
        return;
      }
      if (this.freeformCornerDrag) {
        this.endFreeformCornerDrag();
        clearActivePointer();
        return;
      }
      if (this.directDrag) {
        this.endDirectDrag();
        clearActivePointer();
        return;
      }
      if (this.isScissor) {
        const start = this.scissorStart;
        const end = this.scissorEnd;
        if (start && end && this.onScissor) {
          if (this.scissorMode === 'rect') {
            const x = Math.min(start.x, end.x);
            const y = Math.min(start.y, end.y);
            const w = Math.abs(end.x - start.x);
            const h = Math.abs(end.y - start.y);
            this.onScissor({ mode: 'rect', rect: { x, y, w, h }, start, end });
          } else if (this.scissorMode === 'circle') {
            const r = Math.hypot(end.x - start.x, end.y - start.y);
            this.onScissor({ mode: 'circle', circle: { x: start.x, y: start.y, r }, start, end });
          } else {
            this.onScissor({ mode: 'line', line: { a: start, b: end }, start, end });
          }
        }
        this.isScissor = false;
        this.scissorStart = null;
        this.scissorEnd = null;
        this.draw();
        clearActivePointer();
        return;
      }
      if (this.isLassoSelecting) {
        if (this.lassoPath && this.lassoPath.length > 2) {
          this._applyDirectLasso(this.lassoPath);
        }
        this.isLassoSelecting = false;
        this.lassoPath = null;
        this.draw();
        clearActivePointer();
        return;
      }
      if (this.modifierDrag) {
        this.modifierDrag = null;
        this.hideDragTooltip();
        this.updateCursor();
        this.draw();
        clearActivePointer();
        return;
      }
      if (this.rotation3DDrag) {
        this.end3DRotationDrag();
        clearActivePointer();
        return;
      }
      // 3D Scene Studio: commit a unified transform-gizmo drag (full regen on
      // release; history pushed once on first movement).
      if (this._sceneObjectGizmoDrag) {
        this._endSceneObjectGizmoDrag();
        this.draw();
        clearActivePointer();
        return;
      }
      // 3D Scene Studio (Unit 1b): commit a selected-light translate drag.
      if (this._sceneLightGizmoDrag) {
        this._endSceneLightGizmoDrag();
        this.draw();
        clearActivePointer();
        return;
      }
      // 3D Scene Studio: commit a uniform-scale gizmo drag (full regen on
      // release; history pushed once on first movement).
      if (this._sceneResizeDrag) {
        this._endSceneResizeDrag();
        this.draw();
        clearActivePointer();
        return;
      }
      if (this._sceneFacePullDrag) {
        this._endSceneFacePullDrag();
        this.draw();
        clearActivePointer();
        return;
      }
      // 3D Scene Studio (Phase 2): commit a sun-widget / shadow-handle drag
      // (full regen on release; history pushed once on first movement).
      if (this._sceneLightDrag) {
        this.endSceneLightDrag();
        this.draw();
        clearActivePointer();
        return;
      }
      // 3D Scene Studio: commit a ground-drag (full regen on release; history
      // was pushed once on the first movement, mirroring the 3D gizmo).
      if (this._sceneDrag) {
        this._endSceneGroundDrag();
        this.draw();
        clearActivePointer();
        return;
      }
      if (this.isLayerDrag) {
        const selectedLayers = this.getSelectedLayers();
        if (selectedLayers.length && this.tempTransform) {
          if (this.onCommitTransform) this.onCommitTransform();
          // Expand morph containers to their leaves so a container transform
          // fans out; directly-selected leaves pass through unchanged.
          const { targets, expandedMorph } = this._expandTransformTargets(selectedLayers);
          if (this.dragMode === 'move') {
            const snapDx = this.snapAllowed && this.snap ? this.snap.dx || 0 : 0;
            const snapDy = this.snapAllowed && this.snap ? this.snap.dy || 0 : 0;
            const committedDx = this.tempTransform.dx + snapDx;
            const committedDy = this.tempTransform.dy + snapDy;
            const moveTemp = { dx: committedDx, dy: committedDy, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };
            targets.forEach((layer) =>
              this._applyCommittedTransformToLeaf(layer, 'move', { dx: committedDx, dy: committedDy, moveTemp }));
          } else if (this.dragMode === 'resize' && selectedLayers.length) {
            let scaleX = this.tempTransform.scaleX;
            let scaleY = this.tempTransform.scaleY;
            if (selectedLayers.length === 1 && this.snapAllowed && this.snap) {
              if (this.snap.scaleX) scaleX *= this.snap.scaleX;
              if (this.snap.scaleY) scaleY *= this.snap.scaleY;
            }
            const prof = this.engine.currentProfile;
            targets.forEach((layer) =>
              this._applyCommittedTransformToLeaf(layer, 'resize', { scaleX, scaleY, prof }));
          } else if (this.dragMode === 'rotate') {
            const delta = this.tempTransform.rotation ?? 0;
            const origin = this.rotateOrigin || (this.startBounds ? this.startBounds.origin : null);
            targets.forEach((layer) =>
              this._applyCommittedTransformToLeaf(layer, 'rotate', { delta, origin }));
          }
          // Refold the blend if a morph container was fanned out or a morph
          // descendant (isolation-mode child) was the drag target.
          if (expandedMorph || this._dragHasMorphAncestor(selectedLayers)) {
            this._refreshMorphGeometry();
          }
          const primary = this.getSelectedLayer();
          const effectivePrimary = (primary?.isGroup)
            ? selectedLayers.find((l) => !l.isGroup) || primary
            : primary;
          if (effectivePrimary) this.updateTransformInputs(effectivePrimary);
        }
        if (!this.tempTransform && this._pendingSingleSelect) {
          const pending = this._pendingSingleSelect;
          // Standard semantics: when multi-selected and the user clicks
          // (without modifiers) on a layer that's already in the selection,
          // promote it to the Key Object instead of collapsing the selection.
          // Click again on the same key → unset; click on a different selected
          // layer → re-promote.
          if (this.selectedLayerIds.size > 1 && this.selectedLayerIds.has(pending.id)) {
            if (this.keyObjectId === pending.id) {
              this.clearKeyObject();
            } else {
              this.setKeyObject(pending.id);
            }
          } else {
            this.selectLayer(pending);
          }
        }
        this.clearMaskPreview();
        this.mirrorDragState = null;
        this.tempTransform = null;
        this.rotateOrigin = null;
        this.snap = null;
        // SEL-2: alt-drag duplicate bookkeeping ends with the drop.
        this._altDragDup = null;
        this._altDupHistoryLen = null;
        // SG-1: object-guide candidate cache lives for one drag session only.
        this._guideCandidates = null;
        this._objectGuideMatches = null;
        this._spacingHints = null;
      }
      // Release flow already recomputes morph via engine.generate() →
      // computeAllDisplayGeometry(); drop the live-preview flag and any pending
      // frame so it can't leak into the next (possibly non-morph) drag.
      this._clearMorphDrag();
      this._pendingSingleSelect = null;
      this.isPan = false;
      this.isLayerDrag = false;
      this._detachShiftDragListener();
      this.lastDragWorld = null;
      this.dragMode = null;
      this.activeHandle = null;
      // Area-type frame-resize bookkeeping ends with the drag.
      this._areaResize = null;
      this._skipCommitHistory = false;
      this.hideDragTooltip();
      this.updateCursor();
      this.guides = null;
      if (this.isDirectMarquee) {
        const rect = this.directMarqueeRect;
        if (rect && (rect.w > 2 / this.scale || rect.h > 2 / this.scale)) {
          this._applyDirectMarquee(rect);
        }
        this.isDirectMarquee = false;
        this.directMarqueeStart = null;
        this.directMarqueeRect = null;
        this.draw();
        clearActivePointer();
        return;
      }
      // 3D Scene Studio (§5.1): scene marquee commit. V mode collects OBJECTS
      // intersecting the rect; A mode collects FACES (front faces only; Alt
      // includes occluded ones). Shift marquees union into the base selection.
      // When a V marquee catches no scene objects it falls through to the
      // plain layer-marquee commit below.
      if (this.isSelecting && this._sceneMarqueePending) {
        const pending = this._sceneMarqueePending;
        this._sceneMarqueePending = null;
        const rect = this.selectionRect;
        const sceneLayer = this.engine.layers.find((l) => l.id === pending.layerId);
        const bigEnough = rect && (rect.w > 2 / this.scale || rect.h > 2 / this.scale);
        const clearMarquee = () => {
          this.isSelecting = false;
          this.selectionStart = null;
          this.selectionRect = null;
          this._marqueeAdditive = false;
          this._marqueeBaseIds = null;
          this.draw();
          clearActivePointer();
        };
        if (sceneLayer && bigEnough) {
          const includeOccluded = Boolean(pending.alt || e.altKey);
          if (pending.mode === 'object') {
            const ids = this._sceneObjectsInRect(sceneLayer, rect, { includeOccluded });
            if (ids.length) {
              const base = pending.additive && pending.base && pending.base.layerId === sceneLayer.id
                && pending.base.mode === 'object' ? pending.base.objectIds : [];
              this.setSceneSelection({
                layerId: sceneLayer.id,
                mode: 'object',
                objectIds: [...new Set([...base, ...ids])],
                faceKeys: [],
                edgeKeys: [],
              });
              if (!this.selectedLayerIds.has(sceneLayer.id)) this.selectLayer(sceneLayer);
              clearMarquee();
              return;
            }
            // No objects caught — fall through to the plain layer marquee.
          } else {
            const faceKeys = this._sceneFacesInRect(sceneLayer, rect, { includeOccluded });
            const base = pending.additive && pending.base && pending.base.layerId === sceneLayer.id
              && pending.base.mode === 'face' ? pending.base.faceKeys : [];
            const merged = [...new Set([...base, ...faceKeys])];
            if (merged.length) {
              this.setSceneSelection({
                layerId: sceneLayer.id,
                mode: 'face',
                objectIds: [],
                faceKeys: merged,
                edgeKeys: [],
              });
              if (!this.selectedLayerIds.has(sceneLayer.id)) this.selectLayer(sceneLayer);
            }
            // A-mode marquees never fall through to layer selection.
            clearMarquee();
            return;
          }
        } else if (pending.mode !== 'object') {
          // A-tool click on empty scene space (marquee never grew): the
          // selection was already cleared on down; just tidy up.
          clearMarquee();
          return;
        }
      }
      if (this.isSelecting) {
        const rect = this.selectionRect;
        if (rect) {
          const selected = this.engine.layers.filter((layer) => this.layerIntersectsRect(layer, rect));
          if (this._marqueeAdditive && this._marqueeBaseIds) {
            // Union the marquee hits into the preserved base selection.
            const ids = new Set(this._marqueeBaseIds);
            selected.forEach((layer) => ids.add(layer.id));
            if (ids.size) {
              const primary = selected.length ? selected[selected.length - 1].id : this.selectedLayerId;
              this.setSelection([...ids], primary);
            }
          } else if (selected.length) {
            this.setSelection(
              selected.map((layer) => layer.id),
              selected[selected.length - 1].id
            );
          }
        }
        this.isSelecting = false;
        this.selectionStart = null;
        this.selectionRect = null;
        this._marqueeAdditive = false;
        this._marqueeBaseIds = null;
      }
      this.draw();
      clearActivePointer();
    }

    // ——— SG-1/SG-4: object-to-object alignment guides + snap ————————————
    // Extends the existing computeGuides/computeSnap subsystem (single guide
    // system in the pointermove path). All thresholds live in
    // src/config/smart-guides.js; absent config → object guides quietly off.

    _boundsExtents(bounds) {
      const xs = Object.values(bounds.corners).map((pt) => pt.x);
      const ys = Object.values(bounds.corners).map((pt) => pt.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return { minX, maxX, minY, maxY, midX: (minX + maxX) / 2, midY: (minY + maxY) / 2 };
    }

    // Candidate bounds/anchor cache — built once per drag session (cleared on
    // up()/cancel), NOT per pointermove, to hold the drag frame budget with
    // dense documents. Above cfg.maxCandidateLayers visible layers, only the
    // cfg.nearestCandidateCount nearest (to the drag-start bounds) participate.
    _ensureGuideCandidates(activeLayers) {
      if (this._guideCandidates) return this._guideCandidates;
      const cfg = this._smartGuidesConfig();
      if (!cfg) return null;
      const activeIds = new Set(activeLayers.map((l) => l.id));
      const ancestorIds = new Set(
        activeLayers.flatMap((l) => getMaskingAncestors(l, this.engine).map((a) => a.id))
      );
      const isUnderActive = (layer) => {
        let pid = layer.parentId;
        while (pid) {
          if (activeIds.has(pid)) return true;
          pid = this.engine.layers.find((x) => x.id === pid)?.parentId ?? null;
        }
        return false;
      };
      let boxes = [];
      this.engine.layers.forEach((layer) => {
        if (activeIds.has(layer.id) || !layer.visible || ancestorIds.has(layer.id)) return;
        if (isUnderActive(layer)) return;
        const b = this.getLayerBounds(layer);
        if (!b || !b.corners) return;
        const ext = this._boundsExtents(b);
        boxes.push({ layerId: layer.id, isGroup: Boolean(layer.isGroup), ...ext });
      });
      const maxLayers = cfg.maxCandidateLayers ?? 40;
      if (boxes.length > maxLayers) {
        const ref = this.startBounds?.center
          || (activeLayers.length ? this.getSelectionBounds(activeLayers)?.center : null)
          || { x: 0, y: 0 };
        boxes = boxes
          .map((box) => ({ box, d: Math.hypot(box.midX - ref.x, box.midY - ref.y) }))
          .sort((a, b) => a.d - b.d)
          .slice(0, cfg.nearestCandidateCount ?? 16)
          .map((entry) => entry.box);
      }
      // Axis value lists (precomputed once so the per-frame scan is flat).
      // For an x entry, refMin/refMax are the candidate's Y extent (guide span).
      const xValues = [];
      const yValues = [];
      boxes.forEach((box) => {
        [['min', box.minX], ['mid', box.midX], ['max', box.maxX]].forEach(([kind, value]) => {
          xValues.push({ value, kind, refMin: box.minY, refMax: box.maxY, label: kind === 'mid' ? (cfg.labels?.midpoint ?? null) : null, source: 'box' });
        });
        [['min', box.minY], ['mid', box.midY], ['max', box.maxY]].forEach(([kind, value]) => {
          yValues.push({ value, kind, refMin: box.minX, refMax: box.maxX, label: kind === 'mid' ? (cfg.labels?.midpoint ?? null) : null, source: 'box' });
        });
      });
      // Canvas-center snap folds into the same resolution (synthetic: keeps
      // the legacy dashed center guide as its visual, no object guide line).
      const prof = this.engine.currentProfile;
      if (prof) {
        xValues.push({ value: prof.width / 2, kind: 'mid', refMin: 0, refMax: prof.height, label: null, source: 'canvas', synthetic: true });
        yValues.push({ value: prof.height / 2, kind: 'mid', refMin: 0, refMax: prof.width, label: null, source: 'canvas', synthetic: true });
      }
      // SG-4: anchor/endpoint points of nearby paths join the candidate set.
      const maxTotal = cfg.maxAnchorCandidates ?? 600;
      const perLayer = cfg.maxAnchorsPerLayer ?? 24;
      const endpointLabel = cfg.labels?.endpoint ?? null;
      const anchorLabel = cfg.labels?.anchor ?? null;
      const boxIds = new Set(boxes.filter((b) => !b.isGroup).map((b) => b.layerId));
      let anchorCount = 0;
      for (const layer of this.engine.layers) {
        if (anchorCount >= maxTotal) break;
        if (!boxIds.has(layer.id)) continue;
        const paths = this.getInteractionPaths(layer) || [];
        let taken = 0;
        const pushPoint = (pt, label) => {
          if (!pt || taken >= perLayer || anchorCount >= maxTotal) return;
          xValues.push({ value: pt.x, kind: 'point', refMin: pt.y, refMax: pt.y, label, source: 'anchor' });
          yValues.push({ value: pt.y, kind: 'point', refMin: pt.x, refMax: pt.x, label, source: 'anchor' });
          taken += 1;
          anchorCount += 1;
        };
        for (const path of paths) {
          if (taken >= perLayer || anchorCount >= maxTotal) break;
          if (!Array.isArray(path) || path.length < 2) continue;
          const closed = path.meta?.closed === true
            || Boolean(window.Vectura?.OptimizationUtils?.isClosedPath?.(path));
          if (!closed) {
            pushPoint(path[0], endpointLabel);
            pushPoint(path[path.length - 1], endpointLabel);
            if (path.length <= perLayer) {
              for (let i = 1; i < path.length - 1; i++) pushPoint(path[i], anchorLabel);
            }
          } else if (path.length <= perLayer + 1) {
            const last = path.length - 1;
            const dupClose = path[0].x === path[last].x && path[0].y === path[last].y;
            for (let i = 0; i < (dupClose ? last : path.length); i++) pushPoint(path[i], anchorLabel);
          }
        }
      }
      this._guideCandidates = { boxes, xValues, yValues };
      return this._guideCandidates;
    }

    // Per-axis grid snap candidate (mirrors snapPointToGrid's spacing/radius
    // rules but per-axis, so it can compose with object snap — nearest wins).
    _gridAxisSnapDiff(values) {
      if (!SETTINGS.gridSnapEnabled) return null;
      const gridType = SETTINGS.gridType || 'none';
      if (gridType === 'none') return null;
      const sensitivity = SETTINGS.gridSnapSensitivity ?? 50;
      if (sensitivity <= 0) return null;
      let best = null;
      const evalSpacing = (spacing) => {
        if (!spacing || spacing <= 0) return;
        const radius = (sensitivity / 100) * (spacing / 2);
        values.forEach((v) => {
          const diff = Math.round(v / spacing) * spacing - v;
          if (Math.abs(diff) <= radius && (best === null || Math.abs(diff) < Math.abs(best))) {
            best = diff;
          }
        });
      };
      evalSpacing(SETTINGS.gridSize || 10);
      if (gridType === 'major-minor') evalSpacing(SETTINGS.gridMinorSize || 5);
      return best;
    }

    // Resolve the best snap adjustment per axis for the moved extents.
    // Priority on (near-)equal distance: center↔center > anchor/endpoint >
    // edge matches; grid composes afterwards (nearest wins, no guide line).
    _computeObjectSnap(ext) {
      const cfg = this._smartGuidesConfig();
      const cand = this._guideCandidates;
      if (!cfg || !cand) return null;
      const tol = (cfg.toleranceScreenPx ?? 6) / Math.max(this.scale || 1, 1e-6);
      const EPS = 1e-6;
      const resolveAxis = (entries, dragVals) => {
        let best = null;
        for (const entry of entries) {
          for (const d of dragVals) {
            const diff = entry.value - d.v;
            const abs = Math.abs(diff);
            if (abs > tol) continue;
            const priority = (entry.kind === 'mid' && d.kind === 'mid' && entry.source === 'box') ? 2
              : entry.source === 'anchor' ? 1 : 0;
            if (!best || abs < best.abs - EPS || (abs <= best.abs + EPS && priority > best.priority)) {
              best = {
                diff,
                abs,
                priority,
                value: entry.value,
                label: entry.label ?? null,
                refMin: entry.refMin,
                refMax: entry.refMax,
                synthetic: entry.synthetic === true,
              };
            }
          }
        }
        return best;
      };
      let matchX = resolveAxis(cand.xValues, [
        { kind: 'mid', v: ext.midX }, { kind: 'min', v: ext.minX }, { kind: 'max', v: ext.maxX },
      ]);
      let matchY = resolveAxis(cand.yValues, [
        { kind: 'mid', v: ext.midY }, { kind: 'min', v: ext.minY }, { kind: 'max', v: ext.maxY },
      ]);
      // Grid composition — nearest wins per axis; grid wins draw no guide.
      const gridX = this._gridAxisSnapDiff([ext.midX, ext.minX, ext.maxX]);
      const gridY = this._gridAxisSnapDiff([ext.midY, ext.minY, ext.maxY]);
      let dx = matchX ? matchX.diff : 0;
      let dy = matchY ? matchY.diff : 0;
      if (gridX !== null && (!matchX || Math.abs(gridX) < matchX.abs)) {
        dx = gridX;
        matchX = null;
      }
      if (gridY !== null && (!matchY || Math.abs(gridY) < matchY.abs)) {
        dy = gridY;
        matchY = null;
      }
      if (matchX?.synthetic) matchX = null;
      if (matchY?.synthetic) matchY = null;
      return { dx, dy, matchX, matchY };
    }

    // Convert the current drag's object-snap matches into drawable guide
    // lines: full-length along the matched axis, spanning the dragged bounds
    // and the matched object plus a screen-space overhang (SG-1), carrying the
    // SG-2 semantic label.
    _buildObjectGuideLines(bounds) {
      const cfg = this._smartGuidesConfig();
      const matches = this._objectGuideMatches;
      if (!cfg || !matches) return [];
      const ext = this._boundsExtents(bounds);
      const overhang = (cfg.guideOverhangScreenPx ?? 12) / Math.max(this.scale || 1, 1e-6);
      const lines = [];
      if (matches.x) {
        lines.push({
          axis: 'x',
          x1: matches.x.value,
          x2: matches.x.value,
          y1: Math.min(ext.minY, matches.x.refMin) - overhang,
          y2: Math.max(ext.maxY, matches.x.refMax) + overhang,
          label: matches.x.label ?? null,
        });
      }
      if (matches.y) {
        lines.push({
          axis: 'y',
          y1: matches.y.value,
          y2: matches.y.value,
          x1: Math.min(ext.minX, matches.y.refMin) - overhang,
          x2: Math.max(ext.maxX, matches.y.refMax) + overhang,
          label: matches.y.label ?? null,
        });
      }
      return lines;
    }

    // SG-3: equal-spacing detection. For the moved extents, find the nearest
    // neighbor above/below (and left/right) among cached candidate boxes that
    // overlap on the cross axis; when the two gaps are equal within tolerance,
    // return the axis, the equalizing snap delta, the common gap, and the two
    // chip anchors. Bounded (nearest neighbor each side) — cheap per frame.
    _computeEqualSpacing(ext) {
      const cfg = this._smartGuidesConfig();
      const cand = this._guideCandidates;
      if (!cfg || !cfg.spacing || cfg.spacing.enabled === false || !cand) return null;
      const tol = (cfg.spacing.toleranceScreenPx ?? 6) / Math.max(this.scale || 1, 1e-6);
      const maxGap = cfg.spacing.maxGapWorld ?? Infinity;
      const evalAxis = (axis) => {
        const isY = axis === 'y';
        const lo = isY ? ext.minY : ext.minX;
        const hi = isY ? ext.maxY : ext.maxX;
        const crossLo = isY ? ext.minX : ext.minY;
        const crossHi = isY ? ext.maxX : ext.maxY;
        let above = null; // largest box-hi below lo
        let below = null; // smallest box-lo above hi
        for (const box of cand.boxes) {
          const bLo = isY ? box.minY : box.minX;
          const bHi = isY ? box.maxY : box.maxX;
          const bcLo = isY ? box.minX : box.minY;
          const bcHi = isY ? box.maxX : box.maxY;
          if (bcHi <= crossLo || bcLo >= crossHi) continue; // must overlap cross axis
          if (bHi <= lo) { if (!above || bHi > above.hi) above = { hi: bHi, box }; }
          else if (bLo >= hi) { if (!below || bLo < below.lo) below = { lo: bLo, box }; }
        }
        if (!above || !below) return null;
        const gapAbove = lo - above.hi;
        const gapBelow = below.lo - hi;
        if (gapAbove < 0 || gapBelow < 0) return null;
        if (gapAbove > maxGap || gapBelow > maxGap) return null;
        if (Math.abs(gapAbove - gapBelow) > tol) return null;
        const delta = (gapBelow - gapAbove) / 2; // move toward the larger gap
        const gap = (gapAbove + gapBelow) / 2;
        return { axis, delta, gap, above, below, absDiff: Math.abs(gapAbove - gapBelow) };
      };
      const y = evalAxis('y');
      const x = evalAxis('x');
      let best = null;
      if (y) best = y;
      if (x && (!best || x.absDiff < best.absDiff)) best = x;
      return best;
    }

    // Build the two chip anchors + connecting guide line for an equal-spacing
    // match, after the equalizing snap has been applied (uses final ext).
    _buildSpacingHints(match, ext) {
      const cfg = this._smartGuidesConfig();
      const settings = (window.Vectura && window.Vectura.SETTINGS) || SETTINGS || {};
      const units = normalizeDocumentUnits(settings.documentUnits);
      const text = formatDocumentLength(match.gap, units, {
        includeUnit: true, trimTrailingZeros: true,
        precision: Number.isFinite(cfg?.chipPrecision) ? cfg.chipPrecision : 2,
      });
      if (match.axis === 'y') {
        const cx = (ext.minX + ext.maxX) / 2;
        const midAbove = (match.above.hi + ext.minY) / 2;
        const midBelow = (ext.maxY + match.below.lo) / 2;
        return {
          axis: 'y', gap: match.gap, text,
          chips: [{ x: cx, y: midAbove, text }, { x: cx, y: midBelow, text }],
          guide: { x1: cx, y1: match.above.hi, x2: cx, y2: match.below.lo },
        };
      }
      const cy = (ext.minY + ext.maxY) / 2;
      const midLeft = (match.above.hi + ext.minX) / 2;
      const midRight = (ext.maxX + match.below.lo) / 2;
      return {
        axis: 'x', gap: match.gap, text,
        chips: [{ x: midLeft, y: cy, text }, { x: midRight, y: cy, text }],
        guide: { x1: match.above.hi, y1: cy, x2: match.below.lo, y2: cy },
      };
    }

    // SG-3: draw the equal-spacing connecting guide + the two matching chips.
    drawSpacingHints() {
      const hints = this._spacingHints;
      if (!hints) return;
      const accent = getThemeToken('--render-smart-guide', '#e6007e');
      this.ctx.save();
      this.ctx.setLineDash([]);
      this.ctx.strokeStyle = accent;
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.beginPath();
      this.ctx.moveTo(hints.guide.x1, hints.guide.y1);
      this.ctx.lineTo(hints.guide.x2, hints.guide.y2);
      this.ctx.stroke();
      this.ctx.restore();
      const cfg = this._smartGuidesConfig();
      const fontPx = cfg?.labelFontPx ?? 10;
      const family = cfg?.labelFontFamily ?? 'system-ui, sans-serif';
      // worldToScreen yields CSS pixels; the canvas base transform is
      // scale(dpr,dpr). Reset to the dpr base (NOT identity) so labels land at
      // the correct CSS position on HiDPI displays and stay zoom-invariant.
      const dpr = window.devicePixelRatio || 1;
      hints.chips.forEach((chip) => {
        const screen = this.worldToScreen(chip.x, chip.y);
        this.ctx.save();
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.ctx.font = `${fontPx}px ${family}`;
        this.ctx.textBaseline = 'middle';
        const padX = 4;
        const w = this.ctx.measureText(chip.text).width + padX * 2;
        const h = fontPx + 4;
        const bx = screen.x + 6;
        const by = screen.y - h / 2;
        this.ctx.fillStyle = getThemeToken('--render-smart-guide-label', accent);
        this.ctx.fillRect(bx, by, w, h);
        this.ctx.fillStyle = getThemeToken('--render-smart-guide-label-text', '#ffffff');
        this.ctx.fillText(chip.text, bx + padX, by + h / 2);
        this.ctx.restore();
      });
    }

    computeGuides(activeLayers, bounds) {
      const prof = this.engine.currentProfile;
      const guides = { center: [], size: [] };
      const centerX = prof.width / 2;
      const centerY = prof.height / 2;
      const tol = 2;

      if (Math.abs(bounds.center.x - centerX) <= tol) {
        guides.center.push({ x1: centerX, y1: 0, x2: centerX, y2: prof.height });
      }
      if (Math.abs(bounds.center.y - centerY) <= tol) {
        guides.center.push({ x1: 0, y1: centerY, x2: prof.width, y2: centerY });
      }

      const targetW = bounds.maxX - bounds.minX;
      const targetH = bounds.maxY - bounds.minY;
      let widthMatch = false;
      let heightMatch = false;
      const activeIds = new Set(activeLayers.map((layer) => layer.id));
      const ancestorIds = new Set(
        activeLayers.flatMap((l) => getMaskingAncestors(l, this.engine).map((a) => a.id))
      );
      this.engine.layers.forEach((layer) => {
        if (activeIds.has(layer.id) || !layer.visible) return;
        if (ancestorIds.has(layer.id)) return;
        const otherBounds = this.getLayerBounds(layer);
        if (!otherBounds) return;
        const w = otherBounds.maxX - otherBounds.minX;
        const h = otherBounds.maxY - otherBounds.minY;
        if (Math.abs(w - targetW) <= tol) widthMatch = true;
        if (Math.abs(h - targetH) <= tol) heightMatch = true;
      });

      if (widthMatch) {
        guides.size.push({ x1: bounds.corners.nw.x, y1: bounds.corners.nw.y, x2: bounds.corners.sw.x, y2: bounds.corners.sw.y });
        guides.size.push({ x1: bounds.corners.ne.x, y1: bounds.corners.ne.y, x2: bounds.corners.se.x, y2: bounds.corners.se.y });
      }
      if (heightMatch) {
        guides.size.push({ x1: bounds.corners.nw.x, y1: bounds.corners.nw.y, x2: bounds.corners.ne.x, y2: bounds.corners.ne.y });
        guides.size.push({ x1: bounds.corners.sw.x, y1: bounds.corners.sw.y, x2: bounds.corners.se.x, y2: bounds.corners.se.y });
      }

      // SG-1/SG-2: object-to-object alignment guide lines for the active
      // move-drag's snap matches (magenta, labeled).
      const objectLines = this._buildObjectGuideLines(bounds);
      if (objectLines.length) guides.object = objectLines;

      return guides.center.length || guides.size.length || objectLines.length ? guides : null;
    }

    computeSnap(activeLayers, bounds) {
      const prof = this.engine.currentProfile;
      const centerX = prof.width / 2;
      const centerY = prof.height / 2;
      const tol = 2;
      const snap = { dx: 0, dy: 0, scaleX: 0, scaleY: 0 };

      if (Math.abs(bounds.center.x - centerX) <= tol) {
        snap.dx = centerX - bounds.center.x;
      }
      if (Math.abs(bounds.center.y - centerY) <= tol) {
        snap.dy = centerY - bounds.center.y;
      }

      const targetW = bounds.maxX - bounds.minX;
      const targetH = bounds.maxY - bounds.minY;
      let bestWidth = null;
      let bestHeight = null;
      let bestWDiff = Infinity;
      let bestHDiff = Infinity;
      const activeIds = new Set(activeLayers.map((layer) => layer.id));
      this.engine.layers.forEach((layer) => {
        if (activeIds.has(layer.id) || !layer.visible) return;
        const otherBounds = this.getLayerBounds(layer);
        if (!otherBounds) return;
        const w = otherBounds.maxX - otherBounds.minX;
        const h = otherBounds.maxY - otherBounds.minY;
        const wDiff = Math.abs(w - targetW);
        const hDiff = Math.abs(h - targetH);
        if (wDiff <= tol && wDiff < bestWDiff) {
          bestWDiff = wDiff;
          bestWidth = w;
        }
        if (hDiff <= tol && hDiff < bestHDiff) {
          bestHDiff = hDiff;
          bestHeight = h;
        }
      });
      if (bestWidth && targetW > 0) snap.scaleX = bestWidth / targetW;
      if (bestHeight && targetH > 0) snap.scaleY = bestHeight / targetH;

      return snap;
    }

    // SG-5: stroke the currently hover-highlighted unselected path in the
    // smart-guide accent. Reads live interaction geometry so it tracks the
    // real, on-screen shape (including circle-meta primitives).
    drawHoverHighlight() {
      const hl = this.hoverHighlight;
      if (!hl) return;
      const layer = this.engine.layers.find((l) => l.id === hl.layerId);
      if (!layer || !layer.visible) { this.hoverHighlight = null; return; }
      const paths = this.getInteractionPaths(layer) || [];
      if (!paths.length) return;
      const accent = getThemeToken('--render-smart-guide', '#e6007e');
      this.ctx.save();
      this.ctx.setLineDash([]);
      this.ctx.lineWidth = Math.max(0.6, 1.5 / this.scale);
      this.ctx.strokeStyle = accent;
      const useCurves = Boolean(layer.params && layer.params.curves);
      paths.forEach((path) => {
        this.ctx.beginPath();
        if (path && path.meta && path.meta.kind === 'circle') {
          this.traceCircle(path.meta);
        } else {
          this.tracePath(path, useCurves);
        }
        this.ctx.stroke();
      });
      this.ctx.restore();
    }

    // Small blue diamond drawn at the selection center while it's hovered
    // (paired with the "center" label + X/Y chip). Drawn in world space, so the
    // size is divided by scale to stay a constant ~8px on screen.
    drawCenterMarker() {
      const c = this.hoverCenter;
      if (!c) return;
      const ctx = this.ctx;
      const h = 4 / this.scale;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(c.x, c.y - h);
      ctx.lineTo(c.x + h, c.y);
      ctx.lineTo(c.x, c.y + h);
      ctx.lineTo(c.x - h, c.y);
      ctx.closePath();
      ctx.fillStyle = getThemeToken('--render-selection-accent', '#2b6cff');
      ctx.fill();
      ctx.lineWidth = Math.max(0.5, 1 / this.scale);
      ctx.strokeStyle = getThemeToken('--render-selection-accent-strong', '#1d4ed8');
      ctx.stroke();
      ctx.restore();
    }

    drawGuides(guides) {
      if (!guides) return;
      this.ctx.save();
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([6 / this.scale, 4 / this.scale]);
      this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      guides.center.forEach((line) => {
        this.ctx.beginPath();
        this.ctx.moveTo(line.x1, line.y1);
        this.ctx.lineTo(line.x2, line.y2);
        this.ctx.stroke();
      });
      this.ctx.setLineDash([]);
      this.ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
      guides.size.forEach((line) => {
        this.ctx.beginPath();
        this.ctx.moveTo(line.x1, line.y1);
        this.ctx.lineTo(line.x2, line.y2);
        this.ctx.stroke();
      });
      // SG-1/SG-2: object-to-object alignment guides — solid magenta with an
      // optional semantic label near the guide's end.
      if (Array.isArray(guides.object) && guides.object.length) {
        const accent = getThemeToken('--render-smart-guide', '#e6007e');
        this.ctx.setLineDash([]);
        this.ctx.strokeStyle = accent;
        this.ctx.lineWidth = 1 / this.scale;
        guides.object.forEach((line) => {
          this.ctx.beginPath();
          this.ctx.moveTo(line.x1, line.y1);
          this.ctx.lineTo(line.x2, line.y2);
          this.ctx.stroke();
        });
        guides.object.forEach((line) => {
          if (line.label) this._drawGuideLabel(line, accent);
        });
      }
      this.ctx.restore();
    }

    // SG-2: draw a small magenta label chip at the far end of an object guide.
    // Text is screen-px sized (zoom-invariant) via a temporary reset transform.
    _drawGuideLabel(line, accent) {
      const cfg = this._smartGuidesConfig();
      const ctx = this.ctx;
      const fontPx = cfg?.labelFontPx ?? 10;
      const family = cfg?.labelFontFamily ?? 'system-ui, sans-serif';
      const anchorWorld = line.axis === 'x'
        ? { x: line.x1, y: line.y2 }
        : { x: line.x2, y: line.y1 };
      const screen = this.worldToScreen(anchorWorld.x, anchorWorld.y);
      // worldToScreen yields CSS pixels; reset to the dpr base transform (NOT
      // identity) so the label lands at the correct CSS position on HiDPI
      // displays instead of drifting to half-position toward the top-left.
      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${fontPx}px ${family}`;
      ctx.textBaseline = 'middle';
      const padX = 4;
      const w = ctx.measureText(line.label).width + padX * 2;
      const h = fontPx + 4;
      const bx = screen.x + 6;
      const by = screen.y + 6;
      ctx.fillStyle = getThemeToken('--render-smart-guide-label', accent);
      ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = getThemeToken('--render-smart-guide-label-text', '#ffffff');
      ctx.fillText(line.label, bx + padX, by + h / 2);
      ctx.restore();
    }

    // The curve branch — native cubics from bezier handles, verbatim segments,
    // or the draw-time midpoint quadratic — is decided by PathDraw, the single
    // source of truth shared with SVG export, the export preview, and the
    // masking flattener. Those four had each grown their own hand-synced copy of
    // this decision and drifted. Do not re-inline it here.
    //
    // Two deliberate omissions, both preserving long-standing renderer behavior:
    //   - Parametric circles are intercepted by traceCircle in traceLayerPath
    //     before they ever reach here; PathDraw does not handle them.
    //   - `sharpEdges` (the per-point `_tileEdge` branch) is not passed: it has
    //     always been export-only, and the canvas has never honoured it.
    //
    // Emits no beginPath/stroke — callers batch many paths into one canvas path.
    tracePath(path, useCurves) {
      window.Vectura.PathDraw.toCanvas(this.ctx, path, { useCurves });
    }

    traceCircle(meta) {
      if (!meta) return;
      const cx = meta.cx ?? meta.x;
      const cy = meta.cy ?? meta.y;
      const rx = meta.rx ?? meta.r;
      const ry = meta.ry ?? meta.r;
      const rotation = meta.rotation ?? 0;
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rx) || !Number.isFinite(ry)) return;
      if (rx <= 0 || ry <= 0) return;
      this.ctx.moveTo(cx + rx, cy);
      if (Math.abs(rx - ry) < 0.001) {
        this.ctx.arc(cx, cy, rx, 0, Math.PI * 2);
        return;
      }
      this.ctx.ellipse(cx, cy, rx, ry, rotation, 0, Math.PI * 2);
    }

    getSelectedLayer() {
      return this.engine.layers.find((l) => l.id === this.selectedLayerId) || null;
    }

    getSelectedLayers() {
      return this.engine.layers.filter((l) => this.selectedLayerIds.has(l.id));
    }

    getInteractionPaths(layer) {
      return this.engine.getRenderablePaths ? this.engine.getRenderablePaths(layer, { useOptimized: false }) : layer?.paths || [];
    }

    // CONTRACT L5 — paper-color pen-true preview. When SETTINGS.paperPreview is
    // on, the draw loop resolves every stroke to its raw pen color/width with no
    // display substitution, so dark-stock (dark bgColor) previews render true.
    // The flag is added to defaults.js by stream 2A; undefined is treated as
    // false (Phase-1 behavior), so absence never changes rendering.
    paperPreviewActive() {
      const S = (window.Vectura && window.Vectura.SETTINGS) || SETTINGS || {};
      return Boolean(S.paperPreview);
    }

    // Raw {color, width} for a pen id, falling back to the layer's own color /
    // width then the document stroke width — the pen-true resolution the paper
    // preview forces. Pure (no ctx side effects) so tests can assert it.
    resolvePenStroke(penId, layer) {
      const S = (window.Vectura && window.Vectura.SETTINGS) || SETTINGS || {};
      const pen = (Array.isArray(S.pens) ? S.pens : []).find((p) => p && p.id === penId) || null;
      const color = (pen && pen.color) || (layer && layer.color) || S.strokeColor || '#000000';
      const width = (pen && pen.width != null) ? pen.width
        : (layer && layer.strokeWidth != null) ? layer.strokeWidth
        : S.strokeWidth;
      return { color, width };
    }

    getActiveModifierLayer() {
      const layer = this.engine.getActiveLayer ? this.engine.getActiveLayer() : null;
      return isModifierLayer(layer) ? layer : null;
    }

    getMirrorGuides(layer = null) {
      const modifierLayer = layer || this.getActiveModifierLayer();
      if (!modifierLayer || !isModifierLayer(modifierLayer)) return [];
      const modifier = modifierLayer.modifier || {};
      if (modifier.enabled === false) return [];
      const bounds = this.engine.getBounds ? this.engine.getBounds() : this.engine.currentProfile;
      const profileBounds = {
        width: bounds.width,
        height: bounds.height,
      };
      const guideBounds = SETTINGS.cropExports !== false
        ? {
            x: bounds.m || 0,
            y: bounds.m || 0,
            width: bounds.dW ?? bounds.width,
            height: bounds.dH ?? bounds.height,
          }
        : profileBounds;
      return (modifier.mirrors || []).map((mirror, index) => {
        const locked = Boolean(modifier.guidesLocked || mirror.locked);
        const visible = modifier.guidesVisible !== false && mirror.guideVisible !== false;

        if (mirror.type === 'radial') {
          const count = Math.max(2, Math.round(mirror.count ?? 6));
          const mode = mirror.mode ?? 'dihedral';
          const cx = (profileBounds.width ?? 0) / 2 + (mirror.centerX ?? 0);
          const cy = (profileBounds.height ?? 0) / 2 + (mirror.centerY ?? 0);
          const baseAngleRad = ((mirror.angle ?? 0) * Math.PI) / 180;
          const fullWedgeRad = (2 * Math.PI) / count;
          const halfWedgeRad = fullWedgeRad / 2;
          const guideR = Math.min(profileBounds.width, profileBounds.height ?? profileBounds.width) * 0.55;
          const wedgeCount = mode === 'dihedral' ? count * 2 : count;
          const divAngle = (2 * Math.PI) / wedgeCount;
          const wedgeLines = [];
          for (let k = 0; k < wedgeCount; k += 1) {
            const a = baseAngleRad + k * divAngle;
            wedgeLines.push({
              x1: cx, y1: cy,
              x2: cx + Math.cos(a) * guideR,
              y2: cy + Math.sin(a) * guideR,
            });
          }
          const srcEnd = mode === 'dihedral' ? baseAngleRad + halfWedgeRad : baseAngleRad + fullWedgeRad;
          return {
            guideType: 'radial',
            layer: modifierLayer, mirror, index, visible, locked,
            center: { x: cx, y: cy },
            wedgeLines,
            sourceWedge: { startAngle: baseAngleRad, endAngle: srcEnd, radius: guideR },
          };
        }

        if (mirror.type === 'wallpaper') {
          const WallpaperGroups = window.Vectura?.WallpaperGroups;
          const groupDef = WallpaperGroups?.GROUPS?.[mirror.group || 'p4m'];
          if (!groupDef) return null;
          const W = Math.max(1, mirror.tileWidth ?? 60);
          const H = Math.max(1, mirror.tileHeight ?? 60);
          const tileAngle = mirror.tileAngle ?? 90;
          const rotDeg = mirror.rotation ?? 0;
          const cx = (profileBounds.width ?? 0) / 2 + (mirror.centerX ?? 0);
          const cy = (profileBounds.height ?? 0) / 2 + (mirror.centerY ?? 0);
          const { latticeA, latticeB, fundamentalDomain } = groupDef.getOps(W, H, tileAngle, cx, cy, rotDeg);
          // Rotate ring radius: sit just outside the larger lattice vector so it never
          // collides with the latticeA/latticeB endpoint handles.
          const latLen = Math.max(Math.hypot(latticeA.x, latticeA.y), Math.hypot(latticeB.x, latticeB.y));
          const rotateRadius = latLen + ROTATE_ARROW_OFFSET / this.scale;
          const rotRad = rotDeg * Math.PI / 180;
          return {
            guideType: 'wallpaper',
            layer: modifierLayer, mirror, index, visible, locked,
            fundamentalDomain,
            latticeA,
            latticeB,
            origin: { x: cx, y: cy },
            canvasCenter: { x: (profileBounds.width ?? 0) / 2, y: (profileBounds.height ?? 0) / 2 },
            rotateRadius,
            // Rotate handle sits on the ring along the current global rotation direction.
            rotateHandle: { x: cx + Math.cos(rotRad) * rotateRadius, y: cy + Math.sin(rotRad) * rotateRadius },
            rotateHandleR: 5 / this.scale,
          };
        }

        if (mirror.type === 'arc') {
          const cx = (profileBounds.width ?? 0) / 2 + (mirror.centerX ?? 0);
          const cy = (profileBounds.height ?? 0) / 2 + (mirror.centerY ?? 0);
          const R = Math.max(1, mirror.radius ?? 80);
          const startDeg = mirror.arcStart ?? -180;
          const endDeg = mirror.arcEnd ?? 180;
          const startRad = (startDeg * Math.PI) / 180;
          const endRad = (endDeg * Math.PI) / 180;
          const midRad = (startRad + endRad) / 2;
          const replacedOutside = (mirror.replacedSide ?? 'outer') === 'outer';
          const flipSign = replacedOutside ? 1 : -1;
          const arrowOffset = ROTATE_ARROW_OFFSET / this.scale;
          const triangleLift = ROTATE_TRIANGLE_LIFT / this.scale;
          const triangleHalfWidth = ROTATE_TRIANGLE_HALF_WIDTH / this.scale;
          const triangleUnderlayHalfWidth = ROTATE_TRIANGLE_UNDERLAY_HALF_WIDTH / this.scale;
          const triangleTipLength = ROTATE_TRIANGLE_TIP_LENGTH / this.scale;
          const triangleUnderlayTipLength = ROTATE_TRIANGLE_UNDERLAY_TIP_LENGTH / this.scale;
          const nRad = { x: Math.cos(midRad), y: Math.sin(midRad) };
          const tRad = { x: -Math.sin(midRad), y: Math.cos(midRad) };
          const midArc = { x: cx + nRad.x * R, y: cy + nRad.y * R };
          const triBase = {
            x: midArc.x + nRad.x * (arrowOffset + triangleLift) * flipSign,
            y: midArc.y + nRad.y * (arrowOffset + triangleLift) * flipSign,
          };
          return {
            guideType: 'arc',
            layer: modifierLayer, mirror, index, visible, locked,
            center: { x: cx, y: cy },
            radius: R,
            arcStartRad: startRad,
            arcEndRad: endRad,
            radiusHandle: { x: cx + Math.cos(startRad) * R, y: cy + Math.sin(startRad) * R },
            flipTriangle: {
              tip: { x: midArc.x + nRad.x * flipSign * (arrowOffset + triangleLift + triangleTipLength), y: midArc.y + nRad.y * flipSign * (arrowOffset + triangleLift + triangleTipLength) },
              tipUnderlay: { x: midArc.x + nRad.x * flipSign * (arrowOffset + triangleLift + triangleUnderlayTipLength), y: midArc.y + nRad.y * flipSign * (arrowOffset + triangleLift + triangleUnderlayTipLength) },
              baseCenter: triBase,
              left: { x: triBase.x - tRad.x * triangleHalfWidth, y: triBase.y - tRad.y * triangleHalfWidth },
              right: { x: triBase.x + tRad.x * triangleHalfWidth, y: triBase.y + tRad.y * triangleHalfWidth },
              leftUnderlay: { x: triBase.x - tRad.x * triangleUnderlayHalfWidth, y: triBase.y - tRad.y * triangleUnderlayHalfWidth },
              rightUnderlay: { x: triBase.x + tRad.x * triangleUnderlayHalfWidth, y: triBase.y + tRad.y * triangleUnderlayHalfWidth },
            },
          };
        }

        const axis = getMirrorAxis(mirror, profileBounds);
        const segment = axis ? clipInfiniteAxisToBounds(axis, guideBounds) : null;
        if (!axis || !segment) return null;
        const [start, end] = segment;
        const tangent = axis.tangent;
        const normal = axis.normal;
        const arrowOffset = ROTATE_ARROW_OFFSET / this.scale;
        const triangleLift = ROTATE_TRIANGLE_LIFT / this.scale;
        const replacedSign = axis.replacedSign || 1;
        const mid = {
          x: (start.x + end.x) * 0.5,
          y: (start.y + end.y) * 0.5,
        };
        const triangleBaseCenter = {
          x: mid.x + normal.x * (arrowOffset + triangleLift) * replacedSign,
          y: mid.y + normal.y * (arrowOffset + triangleLift) * replacedSign,
        };
        const triangleHalfWidth = ROTATE_TRIANGLE_HALF_WIDTH / this.scale;
        const triangleUnderlayHalfWidth = ROTATE_TRIANGLE_UNDERLAY_HALF_WIDTH / this.scale;
        const triangleTipLength = ROTATE_TRIANGLE_TIP_LENGTH / this.scale;
        const triangleUnderlayTipLength = ROTATE_TRIANGLE_UNDERLAY_TIP_LENGTH / this.scale;
        return {
          guideType: 'line',
          layer: modifierLayer,
          mirror,
          index,
          axis,
          start,
          end,
          visible,
          locked,
          rotateRadius: 13.6 / this.scale,
          rotateStart: { x: start.x, y: start.y },
          rotateEnd: { x: end.x, y: end.y },
          flipTriangle: {
            tip: {
              x: mid.x + normal.x * replacedSign * (arrowOffset + triangleLift + triangleTipLength),
              y: mid.y + normal.y * replacedSign * (arrowOffset + triangleLift + triangleTipLength),
            },
            tipUnderlay: {
              x: mid.x + normal.x * replacedSign * (arrowOffset + triangleLift + triangleUnderlayTipLength),
              y: mid.y + normal.y * replacedSign * (arrowOffset + triangleLift + triangleUnderlayTipLength),
            },
            baseCenter: triangleBaseCenter,
            left: {
              x: triangleBaseCenter.x - tangent.x * triangleHalfWidth,
              y: triangleBaseCenter.y - tangent.y * triangleHalfWidth,
            },
            right: {
              x: triangleBaseCenter.x + tangent.x * triangleHalfWidth,
              y: triangleBaseCenter.y + tangent.y * triangleHalfWidth,
            },
            leftUnderlay: {
              x: triangleBaseCenter.x - tangent.x * triangleUnderlayHalfWidth,
              y: triangleBaseCenter.y - tangent.y * triangleUnderlayHalfWidth,
            },
            rightUnderlay: {
              x: triangleBaseCenter.x + tangent.x * triangleUnderlayHalfWidth,
              y: triangleBaseCenter.y + tangent.y * triangleUnderlayHalfWidth,
            },
          },
        };
      }).filter(Boolean);
    }

    hitModifierGuide(world) {
      const guides = this.getMirrorGuides().filter((guide) => guide.visible);
      if (!guides.length) return null;
      const lineTolSq = Math.pow(6 / this.scale, 2);
      const centerTolSq = Math.pow(8 / this.scale, 2);
      for (let i = guides.length - 1; i >= 0; i -= 1) {
        const guide = guides[i];
        if (guide.guideType === 'radial') {
          if (this.distanceToPointSq(world, guide.center) <= centerTolSq) return { guide, type: 'move' };
          continue;
        }
        if (guide.guideType === 'arc') {
          if (this.distanceToPointSq(world, guide.center) <= centerTolSq) return { guide, type: 'move' };
          const rHandleTolSq = Math.pow(7 / this.scale, 2);
          if (this.distanceToPointSq(world, guide.radiusHandle) <= rHandleTolSq) return { guide, type: 'resize' };
          const flipTri = guide.flipTriangle;
          if (this.pointInTriangle(world, flipTri.tip, flipTri.left, flipTri.right)
              || this.distanceToPointSq(world, flipTri.baseCenter) <= Math.pow(12 / this.scale, 2)) {
            return { guide, type: 'flip' };
          }
          continue;
        }
        if (guide.guideType === 'wallpaper') {
          // Center puck — symmetry-center drag.
          if (this.distanceToPointSq(world, guide.origin) <= centerTolSq) return { guide, type: 'wallpaperCenter' };
          // Tile-vector endpoint handles.
          const p10 = { x: guide.origin.x + guide.latticeA.x, y: guide.origin.y + guide.latticeA.y };
          if (this.distanceToPointSq(world, p10) <= centerTolSq) return { guide, type: 'latticeA' };
          const p01 = { x: guide.origin.x + guide.latticeB.x, y: guide.origin.y + guide.latticeB.y };
          if (this.distanceToPointSq(world, p01) <= centerTolSq) return { guide, type: 'latticeB' };
          // Rotate handle puck on the ring, then the ring band itself.
          if (guide.rotateHandle && this.distanceToPointSq(world, guide.rotateHandle) <= centerTolSq) {
            return { guide, type: 'wallpaperRotate' };
          }
          if (guide.rotateRadius > 0) {
            const ringBand = 5 / this.scale;
            const distToCenter = Math.hypot(world.x - guide.origin.x, world.y - guide.origin.y);
            if (Math.abs(distToCenter - guide.rotateRadius) <= ringBand) {
              return { guide, type: 'wallpaperRotate' };
            }
          }
          continue;
        }
        // line guide
        const rotateTolSq = Math.pow(guide.rotateRadius + 5 / this.scale, 2);
        const onStartHandle = this.distanceToPointSq(world, guide.rotateStart) <= rotateTolSq;
        const onEndHandle = this.distanceToPointSq(world, guide.rotateEnd) <= rotateTolSq;
        if (onStartHandle || onEndHandle) return { guide, type: 'rotate' };
        const flipTri = guide.flipTriangle;
        if (this.pointInTriangle(world, flipTri.tip, flipTri.left, flipTri.right)
            || this.distanceToPointSq(world, flipTri.baseCenter) <= Math.pow(12 / this.scale, 2)) {
          return { guide, type: 'flip' };
        }
        if (this.distanceToSegmentSq(world, guide.start, guide.end) <= lineTolSq) return { guide, type: 'move' };
      }
      return null;
    }

    selectLayer(layer, options = {}) {
      if (!layer) return;
      const { additive = false, toggle = false } = options;
      if (!additive && !toggle) {
        this.selectedLayerIds.clear();
      }
      if (toggle) {
        if (this.selectedLayerIds.has(layer.id)) {
          this.selectedLayerIds.delete(layer.id);
        } else {
          this.selectedLayerIds.add(layer.id);
        }
      } else {
        this.selectedLayerIds.add(layer.id);
      }
      if (this.selectedLayerIds.size === 0) {
        this.selectedLayerId = null;
        if (this.onSelectLayer) this.onSelectLayer(null);
      } else {
        this.selectedLayerId = this.selectedLayerIds.has(layer.id)
          ? layer.id
          : this.selectedLayerIds.values().next().value;
        if (this.onSelectLayer) this.onSelectLayer(this.getSelectedLayer());
      }
      if (this.keyObjectId && (!this.selectedLayerIds.has(this.keyObjectId) || this.selectedLayerIds.size < 2)) {
        this.keyObjectId = null;
      }
      if (this.directSelection && this.directSelection.layerId !== this.selectedLayerId) {
        this.directSelection = null;
        this.directDrag = null;
        this.directAuxSelections = [];
      }
      this.draw();
    }

    setSelection(ids, primaryId) {
      this.selectedLayerIds = new Set(ids || []);
      if (primaryId && this.selectedLayerIds.has(primaryId)) {
        this.selectedLayerId = primaryId;
      } else {
        this.selectedLayerId = this.selectedLayerIds.values().next().value || null;
      }
      if (this.keyObjectId && (!this.selectedLayerIds.has(this.keyObjectId) || this.selectedLayerIds.size < 2)) {
        this.keyObjectId = null;
      }
      if (this.directSelection && this.directSelection.layerId !== this.selectedLayerId) {
        this.directSelection = null;
        this.directDrag = null;
        this.directAuxSelections = [];
      }
      if (this.onSelectLayer) {
        const layer = this.getSelectedLayer();
        this.onSelectLayer(layer || null);
      }
      this.draw();
    }

    setKeyObject(id) {
      if (!id || !this.selectedLayerIds.has(id)) return;
      if (this.selectedLayerIds.size < 2) return;
      this.keyObjectId = id;
      this.selectedLayerId = id;
      if (this.onSelectLayer) this.onSelectLayer(this.getSelectedLayer() || null);
      this.draw();
    }

    clearKeyObject() {
      if (!this.keyObjectId) return;
      this.keyObjectId = null;
      if (this.onSelectLayer) this.onSelectLayer(this.getSelectedLayer() || null);
      this.draw();
    }

    clearSelection() {
      this.selectedLayerIds.clear();
      this.selectedLayerId = null;
      this.keyObjectId = null;
      this.directSelection = null;
      this.directDrag = null;
      this.directAuxSelections = [];
      this.clearMaskPreview();
      if (this.onSelectLayer) this.onSelectLayer(null);
      this.draw();
    }

    _computeFillPreviewPolygon(worldX, worldY) {
      const layer = this.engine?.getActiveLayer?.();
      if (!layer) return null;
      const AR = window.Vectura?.AlgorithmRegistry;
      if (!AR) return null;

      if (layer.type === 'pattern') {
        const patternId = layer.params?.patternId;
        if (!patternId) return null;
        const data = AR.patternGetGroups?.(patternId);
        if (!data) return null;
        const { vbW, vbH } = data;
        const scale = layer.params?.scale ?? 1;
        const originX = layer.params?.originX ?? 0;
        const originY = layer.params?.originY ?? 0;
        const tileSpacingX = layer.params?.tileSpacingX ?? 0;
        const tileSpacingY = layer.params?.tileSpacingY ?? 0;
        const scaledW = (vbW + tileSpacingX) * scale;
        const scaledH = (vbH + tileSpacingY) * scale;
        if (scaledW <= 0 || scaledH <= 0) return null;
        const tileX = (((worldX - originX) % scaledW) + scaledW) % scaledW / scale;
        const tileY = (((worldY - originY) % scaledH) + scaledH) % scaledH / scale;
        const hit = AR.patternGetFillTargetsAtPoint?.(patternId, tileX, tileY, { cache: true });
        const target = hit?.smallest;
        if (!target) return null;
        const tilePoly = target.outer;
        if (!Array.isArray(tilePoly) || !tilePoly.length) return null;
        const tileCol = Math.floor((worldX - originX) / scaledW);
        const tileRow = Math.floor((worldY - originY) / scaledH);
        const tileOriginX = originX + tileCol * scaledW;
        const tileOriginY = originY + tileRow * scaledH;
        return tilePoly.map((pt) => ({ x: tileOriginX + pt.x * scale, y: tileOriginY + pt.y * scale }));
      }

      const paths = this.engine.getDisplayPaths?.(layer) || layer.paths || [];
      let best = null;
      let bestArea = Infinity;
      for (const path of paths) {
        if (!Array.isArray(path) || path.length < 3) continue;
        const first = path[0]; const last = path[path.length - 1];
        if (Math.hypot(first.x - last.x, first.y - last.y) > 0.5) continue;
        if (!AR._polyContainsPoint?.(path, worldX, worldY)) continue;
        let area = 0;
        for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
          area += (path[j].x + path[i].x) * (path[j].y - path[i].y);
        }
        area = Math.abs(area) / 2;
        if (area < bestArea) { bestArea = area; best = path; }
      }
      return best;
    }

    _isWorldInsidePaper(world) {
      const prof = this.engine?.currentProfile;
      if (!prof || !world) return false;
      const m = Math.max(0, SETTINGS.margin || 0);
      return world.x >= m && world.x <= prof.width - m && world.y >= m && world.y <= prof.height - m;
    }

    // fillParamsOverride (used by Pattern Fill on a non-pattern layer) is
    // layered on top of the normal panel params — scope/sensitivity/pens stay
    // universal, only fillType + pattern-tile knobs are replaced.
    _paintBucketHover(world, fillParamsOverride) {
      const PBO = window.Vectura?.PaintBucketOps;
      if (!PBO) { this.paintBucketStack = null; this.patternFillPreviewPolygon = null; return; }
      const params = { ...(this.app?.paintBucketPanel?.getFillParams?.() || {}), ...(fillParamsOverride || {}) };
      const scope = params.fillScope || 'all-objects';
      const sensitivity = params.fillSensitivity ?? 5;
      const { stack } = PBO.findFillTargetStack(this.engine, world.x, world.y, { scope, sensitivity });
      if (!Array.isArray(stack) || !stack.length) {
        this.paintBucketStack = null;
        this.paintBucketStackKey = null;
        this.paintBucketScopeIndex = 0;
        this.patternFillPreviewPolygon = null;
        this.patternFillPreviewInnerPolygon = null;
        return;
      }
      const stackKey = stack.map((e) => e.loopId).join('|');
      if (stackKey !== this.paintBucketStackKey) {
        this.paintBucketStackKey = stackKey;
        this.paintBucketScopeIndex = 0;
      }
      this.paintBucketStack = stack;
      this.paintBucketScopeIndex = Math.min(this.paintBucketScopeIndex, stack.length - 1);
      const entry = stack[this.paintBucketScopeIndex];
      this.patternFillPreviewPolygon = entry?.polygon || null;
      this.patternFillPreviewInnerPolygon = entry?.innerPolygon || null;
      if (entry && this.app?.ui?.setPaintBucketHint) {
        if (entry.isDocBounds) {
          this.app.ui.setPaintBucketHint('Scope: document bounds — click to fill background');
        } else if (stack.length > 1) {
          const label = scope === 'single-object' ? 'Path' : 'Scope';
          const scrollHint = scope === 'single-object' ? 'scroll to change path' : 'scroll to widen';
          this.app.ui.setPaintBucketHint(`${label} ${this.paintBucketScopeIndex + 1}/${stack.length - 1} · ${scrollHint}`);
        } else {
          this.app.ui.setPaintBucketHint('Click to fill · Alt-click to remove · Shift+drag to pour multiple');
        }
      }
    }

    clearPaintBucketHoverState() {
      this.paintBucketStack = null;
      this.paintBucketStackKey = null;
      this.paintBucketScopeIndex = 0;
      this.patternFillPreviewPolygon = null;
      this.patternFillPreviewInnerPolygon = null;
      this.draw();
    }

    _paintBucketPour(world, mode = 'pour', opts = {}) {
      const PBO = window.Vectura?.PaintBucketOps;
      if (!PBO) return null;
      const { startBatch = false, fillParamsOverride } = opts;
      const params = { ...(this.app?.paintBucketPanel?.getFillParams?.() || {}), ...(fillParamsOverride || {}) };
      const result = PBO.applyFillAtPoint(this.engine, this.app, world.x, world.y, {
        scopeIndex: this.paintBucketScopeIndex,
        mode,
        fillParams: params,
      });
      if (result) {
        this.lastPourLoopId = result.loopId;
        if (mode === 'pour' && result.fillId && result.layerId) {
          if (startBatch || !Array.isArray(this.lastPaintedFillRefs)) {
            this.lastPaintedFillRefs = [];
          }
          this.lastPaintedFillRefs.push({ layerId: result.layerId, fillId: result.fillId });
          this._notifyBatchState();
        } else if (mode === 'erase' && result.fillId) {
          // Fine-grained: only drop the erased fill from the batch. If the
          // batch becomes empty, that's an implicit commit.
          if (Array.isArray(this.lastPaintedFillRefs) && this.lastPaintedFillRefs.length) {
            const before = this.lastPaintedFillRefs.length;
            this.lastPaintedFillRefs = this.lastPaintedFillRefs.filter(
              (ref) => ref.fillId !== result.fillId
            );
            if (this.lastPaintedFillRefs.length !== before) this._notifyBatchState();
          }
        }
        this.draw();
        if (this.app?.ui?.renderLayers) this.app.ui.renderLayers();
      }
      return result;
    }

    // Commit the active batch: clear retarget refs and hide the panel chip
    // and canvas outline. Fill records themselves remain on the layer.
    commitActiveBatch() {
      if (!Array.isArray(this.lastPaintedFillRefs) || !this.lastPaintedFillRefs.length) {
        return false;
      }
      this.lastPaintedFillRefs = [];
      this._notifyBatchState();
      this.draw();
      return true;
    }

    // CMD+click adoption: find the smallest fill under the cursor, commit
    // any prior batch silently, and make this fill the new 1-element batch.
    // The panel mirror loads the fill's params (suppressed retarget).
    _paintBucketAdoptAtPoint(world) {
      const PBO = window.Vectura?.PaintBucketOps;
      const panel = this.app?.paintBucketPanel;
      if (!PBO?.findFillAtPoint) {
        panel?.setNoFillMode?.();
        return false;
      }
      const hit = PBO.findFillAtPoint(this.engine, world.x, world.y);
      if (!hit?.rec || !hit.layer?.id) {
        // Nothing to sample — switch the panel to "No Fill" mode.
        // If the user was hovering over a visible region (patternFillPreviewPolygon
        // is set), pour a fillType:'none' placeholder there so that region
        // becomes the active batch target. Picking a fill type will then
        // update that record rather than retargeting any prior fill.
        // Guard with patternFillPreviewPolygon: no hover region = no pour
        // (protects against accidental doc-bounds pours on empty canvas).
        panel?.setNoFillMode?.();
        if (this.patternFillPreviewPolygon) {
          this._paintBucketPour(world, 'pour', { startBatch: true });
        } else {
          this.draw();
        }
        return false;
      }
      panel?.setSampleEmptyMode?.(false);
      // Replace any active batch with the adopted fill. This is a silent
      // commit: there is no "unsaved" work because slider edits already
      // retarget live as they happen.
      this.lastPaintedFillRefs = [{ layerId: hit.layer.id, fillId: hit.rec.id }];
      panel?.loadParamsFromFill?.(hit.rec);
      this._notifyBatchState();
      this.draw();
      return true;
    }

    _notifyBatchState() {
      const count = Array.isArray(this.lastPaintedFillRefs)
        ? this.lastPaintedFillRefs.length
        : 0;
      this.app?.paintBucketPanel?.onBatchStateChange?.({ activeCount: count });
    }

    _paintBucketClearHover() {
      if (this.activeTool !== 'fill' && this.activeTool !== 'fill-erase') return;
      // Clear hover preview + stack so the highlighted region under the
      // cursor disappears once the mouse leaves the canvas. `lastPaintedFillRefs`
      // is kept so panel edits still retarget the most recent pour(s).
      this.paintBucketStack = null;
      this.paintBucketStackKey = null;
      this.paintBucketScopeIndex = 0;
      this.patternFillPreviewPolygon = null;
      this.patternFillPreviewInnerPolygon = null;
      this.lastPourLoopId = null;
      this.hideFillLoupe?.();
      if (this.app?.ui?.setPaintBucketHint) {
        this.app.ui.setPaintBucketHint('Click to fill · Alt-click to remove · Shift+drag to pour multiple');
      }
      this.draw();
    }

    updateLastPaintedFills(fillParams) {
      if (!Array.isArray(this.lastPaintedFillRefs) || !this.lastPaintedFillRefs.length) return false;
      const engine = this.engine;
      if (!engine?.layers) return false;
      const FIELD_MAP = [
        ['fillType',            'fillMode'],
        ['density',             'fillDensity'],
        ['angle',               'fillAngle'],
        ['amplitude',           'fillAmplitude'],
        ['waveSmoothing',       'fillWaveSmoothing'],
        ['waveFrequency',       'fillWaveFrequency'],
        ['dotLength',           'fillDotLength'],
        ['dotRotation',         'fillDotRotation'],
        ['padding',             'fillPadding'],
        ['shiftX',              'fillShiftX'],
        ['shiftY',              'fillShiftY'],
        ['dotPattern',          'fillDotPattern'],
        ['dotShape',            'fillDotShape'],
        ['dotJitter',           'fillDotJitter'],
        ['axes',                'fillAxes'],
        ['polyTile',            'fillPolyTile'],
        ['radialSkip',          'fillRadialSkip'],
        ['sensitivity',         'fillSensitivity'],
        ['penId',               'penId'],
        ['contourDirection',    'fillContourDirection'],
        ['contourStepVariance', 'fillContourStepVariance'],
        ['contourSimplify',     'fillContourSimplify'],
        ['contourCenterPadding','fillContourCenterPadding'],
        ['spiralTightness',     'fillSpiralTightness'],
        ['spiralDirection',     'fillSpiralDirection'],
        ['lineCount',           'fillLineCount'],
        ['polyPadding',         'fillPolyPadding'],
        ['polyRotation',        'fillPolyRotation'],
        ['polyRotationStep',    'fillPolyRotationStep'],
        ['polyScale',           'fillPolyScale'],
        // B3 Truchet
        ['truchetTileSet',      'fillTruchetTileSet'],
        ['truchetTileSize',     'fillTruchetTileSize'],
        ['truchetSeed',         'fillTruchetSeed'],
        ['truchetRotations',    'fillTruchetRotations'],
        // B4 Maze
        ['mazeCellSize',        'fillMazeCellSize'],
        ['mazeAlgorithm',       'fillMazeAlgorithm'],
        ['mazeBranchBias',      'fillMazeBranchBias'],
        ['mazeSeed',            'fillMazeSeed'],
        ['mazeWallMode',        'fillMazeWallMode'],
        // B8 Stripes
        ['stripeBandWidth',     'fillStripeBandWidth'],
        ['stripeGap',           'fillStripeGap'],
        ['stripeAngle',         'fillStripeAngle'],
        ['stripePrimary',       'fillStripePrimary'],
        ['stripeSecondary',     'fillStripeSecondary'],
        ['stripeSecondaryDensity', 'fillStripeSecondaryDensity'],
        // B10 Weave
        ['weavePattern',        'fillWeavePattern'],
        ['weaveStrandWidth',    'fillWeaveStrandWidth'],
        ['weaveGap',            'fillWeaveGap'],
        ['weaveAngle',          'fillWeaveAngle'],
        ['weaveOver',           'fillWeaveOver'],
        ['weaveUnder',          'fillWeaveUnder'],
      ];
      let changed = false;
      const surviving = [];
      for (const ref of this.lastPaintedFillRefs) {
        const layer = engine.layers.find((l) => l && l.id === ref.layerId);
        if (!layer || !Array.isArray(layer.fills)) continue;
        const rec = layer.fills.find((f) => f && f.id === ref.fillId);
        if (!rec) continue;
        surviving.push(ref);
        for (const [recKey, paramKey] of FIELD_MAP) {
          const v = fillParams[paramKey];
          if (v !== undefined && rec[recKey] !== v) {
            rec[recKey] = v;
            changed = true;
          }
        }
      }
      const prevLen = this.lastPaintedFillRefs.length;
      this.lastPaintedFillRefs = surviving;
      if (changed) engine.computeAllDisplayGeometry?.();
      if (surviving.length !== prevLen) this._notifyBatchState();
      return changed;
    }

    // Stroke the region polygon of each fill in the active batch so the user
    // sees exactly which fills will be rewritten by the next panel change.
    // Drawn only while the fill tool is active and the batch is non-empty.
    drawActiveBatchOutline() {
      if (this.activeTool !== 'fill' && this.activeTool !== 'fill-erase') return;
      const refs = this.lastPaintedFillRefs;
      if (!Array.isArray(refs) || !refs.length) return;
      const layers = this.engine?.layers;
      if (!Array.isArray(layers) || !layers.length) return;
      const ctx = this.ctx;
      ctx.save();
      ctx.lineWidth = 1.4 / this.scale;
      ctx.setLineDash([4 / this.scale, 3 / this.scale]);
      ctx.strokeStyle = 'rgba(34,197,94,0.85)';
      for (const ref of refs) {
        const layer = layers.find((l) => l && l.id === ref.layerId);
        if (!layer || !Array.isArray(layer.fills)) continue;
        const rec = layer.fills.find((f) => f && f.id === ref.fillId);
        if (!rec?.region || rec.region.length < 3) continue;
        ctx.beginPath();
        this.tracePolygonPath(rec.region);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    drawPatternFillPreview() {
      const poly = this.patternFillPreviewPolygon;
      if (!Array.isArray(poly) || poly.length < 3) return;
      const innerPoly = this.patternFillPreviewInnerPolygon;
      const hasHole = Array.isArray(innerPoly) && innerPoly.length >= 3;
      const isErase = this.activeTool === 'fill-pattern-erase' || this.activeTool === 'fill-erase';
      this.ctx.save();
      this.ctx.beginPath();
      this.tracePolygonPath(poly);
      if (hasHole) this.tracePolygonPath(innerPoly);
      this.ctx.fillStyle = isErase ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)';
      // Even-odd rule makes the inner polygon a transparent hole in the fill.
      this.ctx.fill(hasHole ? 'evenodd' : 'nonzero');
      this.ctx.strokeStyle = isErase ? 'rgba(239,68,68,0.65)' : 'rgba(59,130,246,0.65)';
      this.ctx.lineWidth = 1.5 / this.scale;
      this.ctx.setLineDash([3 / this.scale, 2 / this.scale]);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.restore();
    }

    // Walks up the layer tree from `layer` and returns the immediate child of
    // the currently-isolated group that contains it (or `layer` itself when it
    // is a direct child). Returns null when `layer` is outside the isolated
    // group, or when no group is isolated.
    _isolatedGroupMember(layer) {
      if (!this.groupEditMode || !layer) return null;
      const groupId = this.groupEditMode.groupId;
      let cur = layer;
      let guard = 0;
      while (cur && guard++ < 64) {
        if (cur.parentId === groupId) return cur;
        cur = cur.parentId ? this.engine.layers.find((l) => l.id === cur.parentId) : null;
      }
      return null;
    }

    // Isolation-scoped hit test: returns the immediate child of the isolated
    // group under `world`, ignoring every layer outside that group (so
    // foreground foreign layers never shadow group members). Null when the
    // click misses every group member.
    _findIsolatedMemberAtPoint(world) {
      if (!this.groupEditMode) return null;
      const hit = this.findLayerAtPoint(world, false, (l) => this._isolatedGroupMember(l) !== null);
      return hit ? this._isolatedGroupMember(hit) : null;
    }

    findLayerAtPoint(world, includeLocked = false, filterFn = null) {
      const layers = this.engine.layers.slice().reverse();
      let best = null;
      let bestDist = Infinity;
      layers.forEach((layer) => {
        if (!layer.visible) return;
        if (filterFn && !filterFn(layer)) return;
        // Compound (Pathfinder) groups expose baked geometry — let them be hit
        // even though `isGroup` is true; other groups stay non-selectable.
        const isCompound = layer.containerRole === 'compound';
        if (!isCompound && layer.isGroup) return;
        if (layer.mask?.enabled && layer.mask?.hideLayer) return;
        // Children inside a compound are consumed by their parent; clicks on
        // the unified silhouette should select the compound, not a child.
        if (this.engine.hasCompoundAncestor?.(layer)) return;
        if (!includeLocked && this.isLayerLocked?.(layer.id)) return;
        const stroke = layer.strokeWidth ?? SETTINGS.strokeWidth ?? 0.3;
        const tol = Math.max(5 / (this.scale || 1), stroke * 2);
        const tolSq = tol * tol;
        this.getInteractionPaths(layer).forEach((path) => {
          if (path && path.meta && path.meta.kind === 'circle') {
            const cx = path.meta.cx ?? path.meta.x ?? 0;
            const cy = path.meta.cy ?? path.meta.y ?? 0;
            const r = path.meta.r ?? path.meta.rx ?? 0;
            const dist = Math.abs(Math.hypot(world.x - cx, world.y - cy) - r);
            if (dist * dist <= tolSq && dist < bestDist) {
              bestDist = dist;
              best = layer;
            }
            return;
          }
          if (!Array.isArray(path) || path.length < 2) return;
          for (let i = 0; i < path.length - 1; i++) {
            const d = this.distanceToSegmentSq(world, path[i], path[i + 1]);
            if (d <= tolSq && d < bestDist) {
              bestDist = d;
              best = layer;
              break;
            }
          }
        });
      });
      return best;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3D Scene Studio — Phase 1C: scene selection (CONTRACT D), hit testing
    // over CONTRACT B path meta, ground-drag, and scene object verbs.
    //
    // Everything here keys off layer.type === 'scene3d' and
    // path.meta.sceneTarget (kind 'sceneFace' | 'sceneEdge' | 'sceneFill') —
    // pure meta lookup, no projection math of its own.
    // ═══════════════════════════════════════════════════════════════════

    // ——— CONTRACT D API ————————————————————————————————————————————————

    getSceneSelection() {
      // Self-heal against stale references: undo/redo, layer delete, or a type
      // change can leave sceneSelection pointing at a layer that no longer
      // exists or is no longer a scene — never leak that into hit-tests, the
      // context bar, or a 2D marquee.
      const sel = this.sceneSelection;
      if (sel) {
        const layer = this.engine && this.engine.layers
          ? this.engine.layers.find((l) => l.id === sel.layerId) : null;
        if (!layer || layer.type !== 'scene3d') {
          this.sceneSelection = null;
          this.sceneCandidateStack = null;
        }
      }
      return this.sceneSelection || null;
    }

    setSceneSelection(sel, { silent } = {}) {
      this.sceneSelection = this._normalizeSceneSelection(sel);
      if (!this.sceneSelection) this.sceneCandidateStack = null;
      this.draw();
      if (!silent && typeof window !== 'undefined' && typeof window.CustomEvent === 'function') {
        try {
          window.dispatchEvent(new window.CustomEvent('vectura:scene-selection', { detail: this.sceneSelection }));
        } catch (_e) { /* non-DOM context */ }
      }
      return this.sceneSelection;
    }

    _normalizeSceneSelection(sel) {
      if (!sel || !sel.layerId) return null;
      const mode = sel.mode === 'face' || sel.mode === 'edge' ? sel.mode : 'object';
      const strings = (list) => [...new Set((Array.isArray(list) ? list : [])
        .filter((v) => typeof v === 'string' && v.length))];
      const next = {
        layerId: String(sel.layerId),
        mode,
        objectIds: strings(sel.objectIds),
        faceKeys: strings(sel.faceKeys),
        edgeKeys: strings(sel.edgeKeys),
      };
      if (!next.objectIds.length && !next.faceKeys.length && !next.edgeKeys.length) return null;
      return next;
    }

    // Cheap change signature for the context bar's RAF ticker.
    getSceneSelectionSignature() {
      const sel = this.sceneSelection;
      if (!sel) return '';
      const cand = this.sceneCandidateStack;
      return `${sel.layerId}|${sel.mode}|${sel.objectIds.join(',')}|${sel.faceKeys.join(',')}|`
        + `${sel.edgeKeys.join(',')}|${cand ? `${cand.index}/${cand.total}` : ''}`;
    }

    // {index, total} for the context bar's "2 of 3" alt-cycle readout (1-based;
    // null when there is no stack or nothing to cycle through).
    getSceneCandidateReadout() {
      const s = this.sceneCandidateStack;
      if (!s || !(s.total > 1)) return null;
      return { index: s.index + 1, total: s.total };
    }

    // The scene3d layer that scene-scoped shortcuts (§5.4) act on: the scene
    // selection's layer, else the sole selected scene layer, else the engine's
    // active layer when it is a scene. Null disables all scene key gating.
    getSceneShortcutLayer() {
      // Scene-tree Increment D — a scene GROUP (isGroup + containerRole 'scene')
      // is a valid scene target alongside a monolith; only booleanGroup3d and
      // non-scene groups are excluded.
      const isScene = (l) => Boolean(l && l.type === 'scene3d'
        && (!l.isGroup || l.containerRole === 'scene')
        && l.visible !== false && !(this.isLayerLocked && this.isLayerLocked(l.id)));
      if (this.sceneSelection) {
        const l = this.engine.layers.find((x) => x.id === this.sceneSelection.layerId);
        if (isScene(l)) return l;
      }
      const selected = this.getSelectedLayers();
      if (selected.length === 1 && isScene(selected[0])) return selected[0];
      const active = this.engine.getActiveLayer ? this.engine.getActiveLayer() : null;
      return isScene(active) ? active : null;
    }

    // ——— hit testing (CONTRACT B meta) —————————————————————————————————

    _sceneObjects(layer) {
      return layer && layer.params && Array.isArray(layer.params.objects) ? layer.params.objects : [];
    }

    // Gizmo anchor for a scene layer: the 2D bbox of the SELECTED object's
    // rendered paths (or all scene paths when nothing/only the camera is the
    // target), returned as { center, ne } in world coords. ne = screen-top-right
    // corner (max x, min y). Falls through to null if no geometry is present.
    _sceneGizmoAnchor(layer) {
      const sel = this.getSceneSelection();
      let objId = sel && sel.layerId === layer.id && sel.mode === 'object' && sel.objectIds.length === 1
        ? sel.objectIds[0] : null;
      // The GROUND quad is never a gizmo anchor. It is a scene fixture that
      // spans the whole view, so anchoring on it throws the orbit gizmo hundreds
      // of doc units out to the quad's far corner — off-canvas. Mirrors
      // getSceneObjectGizmo's `objId === 'ground'` refusal; a ground selection
      // falls back to the whole-scene anchor (which already skips the ground).
      if (objId === 'ground') objId = null;
      const paths = this.getInteractionPaths(layer);
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      let found = false;
      (paths || []).forEach((path) => {
        const target = path && path.meta && path.meta.sceneTarget;
        if (!target || !Array.isArray(path)) return;
        if (objId && target.objectId !== objId) return;
        if (!objId && target.objectId === 'ground') return; // camera anchor skips the ground quad
        for (let i = 0; i < path.length; i++) {
          const pt = path[i];
          if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
          found = true;
        }
      });
      if (!found) return null;
      return {
        center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
        ne: { x: maxX, y: minY },
      };
    }

    // A scene layer accepts selection/mutation only when it is visible and not
    // locked (directly or via a locked ancestor) — matching 2D layer rules.
    _isSceneLayerEditable(layer) {
      if (!layer || layer.type !== 'scene3d' || layer.visible === false) return false;
      if (this.isLayerLocked && this.isLayerLocked(layer.id)) return false;
      return true;
    }

    _sceneObjectById(layer, id) {
      const inline = this._sceneObjects(layer).find((o) => o && o.id === id);
      if (inline) return inline;
      // Scene-tree Increment D — a scene GROUP's objects live on CHILD LAYERS.
      // The child layer id === the object id (identity contract), and its params
      // carry the same {primitive, params, transform, visibility, role, ...}
      // shape, so gizmo / resize / face-pull drags mutate them directly and the
      // compositor re-collects them on the next generate().
      if (layer && layer.isGroup && id) {
        const child = this.engine.getLayerById ? this.engine.getLayerById(id) : null;
        if (child && child.type === 'object3d' && child.params) {
          if (child.params.id !== id) child.params.id = id;
          return child.params;
        }
      }
      return null;
    }

    // Scene-tree Increment D — resolve the CHILD LAYER that an object pick maps
    // to inside a scene GROUP. sceneTarget.objectId === child layer id (identity
    // contract), so this is a direct id lookup restricted to descendants of the
    // group. Returns the object3d / booleanGroup3d layer, or null (a monolith's
    // inline object, the ground quad, or an unknown id).
    _sceneChildLayerFor(group, objectId) {
      if (!group || !group.isGroup || !objectId || objectId === 'ground') return null;
      const child = this.engine.getLayerById ? this.engine.getLayerById(objectId) : null;
      if (!child || (child.type !== 'object3d' && child.type !== 'booleanGroup3d')) return null;
      // Confirm it actually lives under this group (never cross-select). Walk up
      // the parent chain; a match on the group id means it is a descendant.
      const seen = new Set();
      let p = child;
      while (p && !seen.has(p.id)) {
        seen.add(p.id);
        if (p.parentId === group.id) return child;
        p = p.parentId ? this.engine.getLayerById(p.parentId) : null;
      }
      return null;
    }

    // Child-aware enumeration of the TOP-LEVEL object records in a scene layer —
    // the live mutable object-def views. For a monolith this is the inline
    // params.objects array; for a scene GROUP it is each DIRECT child object3d
    // layer's params (with .id pinned to the child layer id). This mirrors the
    // monolith's params.objects semantics — top-level objects only. It must NOT
    // recurse into a booleanGroup3d's operand grandchildren (a boolean group has
    // no transform of its own, so its operands are never ground-drag targets;
    // enumerating them would snap to operand origins and write child.params.id
    // onto operands). Used where a bridge iterates every top-level object (e.g.
    // the ground-drag vertex-inference snap), not just one by id. _sceneObjects
    // stays inline-only by design; this is the tree-aware sibling.
    _allSceneObjectRecords(layer) {
      if (!layer) return [];
      if (layer.isGroup && this.engine.getLayerChildren) {
        const out = [];
        this.engine.getLayerChildren(layer.id).forEach((child) => {
          if (child && child.type === 'object3d' && child.params) {
            if (child.params.id !== child.id) child.params.id = child.id;
            out.push(child.params);
          }
        });
        return out;
      }
      return this._sceneObjects(layer);
    }

    // CONTRACT B carries no stable edge id, so edge keys are derived from the
    // edge's per-object ordinal in path order (deterministic for fixed params):
    // '<objectId>/<faceId|edge>:<edgeClass>:<ordinal>'. Documented contract gap.
    _sceneEdgeOrdinals(paths) {
      const counters = new Map();
      const ordinals = new Map();
      (paths || []).forEach((path) => {
        const meta = path && path.meta;
        const target = meta && meta.sceneTarget;
        if (!target || meta.kind !== 'sceneEdge') return;
        const n = counters.get(target.objectId) || 0;
        counters.set(target.objectId, n + 1);
        ordinals.set(path, n);
      });
      return ordinals;
    }

    _sceneEdgeKeyFor(target, ordinal) {
      return `${target.objectId}/${target.faceId || 'edge'}:${target.edgeClass || 'edge'}:${ordinal}`;
    }

    _sceneFaceKeyFor(target) {
      return `${target.objectId}/${target.faceId}`;
    }

    // Depth-sorted candidate stack under `world` for the given pick mode
    // ('object' | 'face' | 'edge'). Topmost scene3d layer with any hit wins.
    // Sorting: non-occluded before occluded, then nearest camera depth; in
    // edge mode, edges within tolerance outrank faces (edges win — §5.1).
    _sceneCandidatesAtPoint(world, mode = 'object') {
      const layers = this.engine.layers.slice().reverse();
      for (const layer of layers) {
        // Scene-tree Increment D — a scene GROUP (type 'scene3d' + isGroup +
        // containerRole 'scene') owns the composed scenePaths, so its objects are
        // pickable too. A monolith (!isGroup) still qualifies. Boolean groups
        // (type 'booleanGroup3d') are consumed — they never carry scenePaths.
        if (!layer || layer.type !== 'scene3d' || !layer.visible) continue;
        if (this.isLayerLocked?.(layer.id)) continue;
        const stroke = layer.strokeWidth ?? SETTINGS.strokeWidth ?? 0.3;
        // Sparse-wireframe primitives (a box has only 9 edges + 3 faces) are a
        // thin target; a slightly wider edge-grab makes clicking near an edge or
        // corner land on the object rather than the ground behind it.
        const tol = Math.max(9 / (this.scale || 1), stroke * 2);
        const tolSq = tol * tol;
        const paths = this.getInteractionPaths(layer);
        const edgeOrdinals = this._sceneEdgeOrdinals(paths);
        const candidates = [];
        const byKey = new Map();
        const push = (cand) => {
          const prev = byKey.get(cand.key);
          if (prev) {
            if (cand.depth < prev.depth) prev.depth = cand.depth;
            if (cand.dist < prev.dist) prev.dist = cand.dist;
            if (!cand.occluded) prev.occluded = false;
            return;
          }
          byKey.set(cand.key, cand);
          candidates.push(cand);
        };
        // I12: per-object projected points, so an object with no pickable face
        // covering the interior (a sphere/torus is drawn as edges + hatch fill)
        // is still selectable anywhere inside its projected silhouette (below).
        const objPoints = mode === 'object' ? new Map() : null;
        paths.forEach((path) => {
          const meta = path && path.meta;
          const target = meta && meta.sceneTarget;
          if (!target || !Array.isArray(path) || path.length < 2) return;
          const kind = meta.kind;
          const depth = Number.isFinite(target.depth) ? target.depth : 0;
          const occluded = Boolean(target.occluded);
          if (objPoints && target.objectId) {
            let rec = objPoints.get(target.objectId);
            if (!rec) { rec = { pts: [], depth: Infinity, occluded: true }; objPoints.set(target.objectId, rec); }
            for (let pi = 0; pi < path.length; pi++) {
              const pt = path[pi];
              if (pt && Number.isFinite(pt.x) && Number.isFinite(pt.y)) rec.pts.push(pt);
            }
            if (depth < rec.depth) rec.depth = depth;
            if (!occluded) rec.occluded = false;
          }
          // Partially-occluded faces emit OPEN visible runs; 1A stamps the full
          // closed outline as target.pickPolygon so point-in-poly still hits the
          // whole face. Fully-visible faces are closed paths (poly === path).
          // A face is point-in-poly pickable when it is a sceneFace, OR a
          // sceneFill (hatch) that carries the face outline as pickPolygon —
          // surface-filled faces suppress their outline, so the fill lines are
          // the face's pick surface.
          const facePickable = kind === 'sceneFace'
            || (kind === 'sceneFill' && Array.isArray(target.pickPolygon));
          const pickPoly = facePickable && Array.isArray(target.pickPolygon)
            ? target.pickPolygon : path;
          const inPoly = facePickable ? this.pointInPoly(world, pickPoly) : false;
          let distSq = Infinity;
          if (!inPoly) {
            for (let i = 0; i < path.length - 1; i++) {
              const d = this.distanceToSegmentSq(world, path[i], path[i + 1]);
              if (d < distSq) distSq = d;
            }
          } else {
            distSq = 0;
          }
          const withinTol = inPoly || distSq <= tolSq;
          if (!withinTol) return;
          if (mode === 'object') {
            push({
              layer, kind: 'object', key: target.objectId, objectId: target.objectId,
              faceId: target.faceId ?? null, depth, dist: distSq, occluded, rank: 0,
            });
            return;
          }
          if (mode === 'face') {
            if (!facePickable || !inPoly) return;
            push({
              layer, kind: 'face', key: this._sceneFaceKeyFor(target), objectId: target.objectId,
              faceId: target.faceId, depth, dist: 0, occluded, rank: 0,
            });
            return;
          }
          // mode === 'edge': edges within tolerance win over faces.
          if (kind === 'sceneEdge') {
            push({
              layer, kind: 'edge',
              key: this._sceneEdgeKeyFor(target, edgeOrdinals.get(path) ?? 0),
              objectId: target.objectId, faceId: target.faceId ?? null,
              edgeClass: target.edgeClass ?? null, depth, dist: distSq, occluded, rank: 0,
            });
          } else if (kind === 'sceneFace' && inPoly) {
            push({
              layer, kind: 'face', key: this._sceneFaceKeyFor(target), objectId: target.objectId,
              faceId: target.faceId, depth, dist: 0, occluded, rank: 1,
            });
          }
        });
        // Real projected-face pass (per-pixel depth). For object/face picks,
        // raycast the cursor against the object's REAL front faces and use the
        // barycentric-interpolated surface depth as the AUTHORITATIVE depth. This
        // fixes both a 'none'-mapper box (no emitted face, so it only had the
        // coarse silhouette fallback below) and the ground plane (whose single
        // face-centroid depth read as spuriously near). Overrides any path-
        // derived depth for the same object/face key; edge mode is untouched.
        if (mode !== 'edge') {
          const pickFaces = this._scenePickFaces(layer);
          const realDepth = new Map();
          for (let fi = 0; fi < pickFaces.length; fi++) {
            const pf = pickFaces[fi];
            const z = this._scenePolyDepthAt(pf.poly, world.x, world.y);
            if (z === null) continue;
            const depth = -z; // CONTRACT B: bigger z = nearer camera → smaller depth
            const key = mode === 'face' ? this._sceneFaceKeyFor(pf) : pf.objectId;
            const prev = realDepth.get(key);
            if (!prev || depth < prev.depth) {
              realDepth.set(key, { depth, objectId: pf.objectId, faceId: pf.faceId });
            }
          }
          realDepth.forEach((rec, key) => {
            const existing = byKey.get(key);
            if (existing) {
              existing.depth = rec.depth;
              existing.dist = 0;
              existing.occluded = false;
            } else {
              push({
                layer, kind: mode === 'face' ? 'face' : 'object', key,
                objectId: rec.objectId, faceId: rec.faceId,
                depth: rec.depth, dist: 0, occluded: false, rank: 0,
              });
            }
          });
        }
        // I12 silhouette fallback: an object drawn as wireframe + hatch (a
        // sphere/torus emits edges, a single face and hatch fill — no pickable
        // face over its interior) is unselectable when the click lands in a
        // hatch gap; the ground plane behind it wins instead. For every object
        // that got NO direct edge/face hit here, test the click against its
        // projected silhouette (convex hull of its path points) and, if inside,
        // add an object candidate at the object's NEAREST path depth. Objects
        // already hit directly (the ground, any solid face) keep their true
        // per-face depth untouched — critical, since merging a large plane's
        // min depth would wrongly float it in front of everything.
        if (objPoints) {
          const directHitIds = new Set(candidates.map((c) => c.objectId));
          objPoints.forEach((rec, objectId) => {
            if (directHitIds.has(objectId) || rec.pts.length < 3) return;
            const hull = this._convexHull2D(rec.pts);
            if (hull.length >= 3 && this.pointInPoly(world, hull)) {
              push({
                layer, kind: 'object', key: objectId, objectId, faceId: null,
                depth: rec.depth === Infinity ? 0 : rec.depth, dist: 0, occluded: rec.occluded, rank: 0,
              });
            }
          });
        }
        if (candidates.length) {
          candidates.sort((a, b) =>
            (a.rank - b.rank)
            || ((a.occluded ? 1 : 0) - (b.occluded ? 1 : 0))
            || (a.depth - b.depth)
            || (a.dist - b.dist));
          return candidates;
        }
      }
      return [];
    }

    // Monotone-chain convex hull of 2D points (screen space). Used as the
    // object-selection silhouette so meshes drawn as wireframe + hatch (sphere,
    // torus) are pickable across their whole footprint. Returns a ring of the
    // hull vertices, or the input when there are fewer than 3 points.
    _convexHull2D(input) {
      const pts = (input || [])
        .filter((pt) => pt && Number.isFinite(pt.x) && Number.isFinite(pt.y))
        .map((pt) => ({ x: pt.x, y: pt.y }));
      if (pts.length < 3) return pts;
      pts.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
      const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
      const lower = [];
      for (let i = 0; i < pts.length; i++) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], pts[i]) <= 0) lower.pop();
        lower.push(pts[i]);
      }
      const upper = [];
      for (let i = pts.length - 1; i >= 0; i--) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], pts[i]) <= 0) upper.pop();
        upper.push(pts[i]);
      }
      lower.pop();
      upper.pop();
      return lower.concat(upper);
    }

    // Real projected FRONT faces for per-pixel-depth picking, built from the
    // scene mesh through the SINGLE projection source (Scene3D.Scene.assembleScene)
    // so pick depth matches the drawn geometry exactly. Two failure modes drove
    // this: a 'none'-mapper box emits ONLY edges (no pickable face over its
    // interior — clicks fell through to whatever was behind), and a huge ground
    // plane's single face-centroid depth is a poor stand-in for its depth AT the
    // cursor (it read as spuriously "near" and stole every click). Cached per
    // layer generation — invalidated when engine.generate replaces layer.paths.
    // Only faces whose object actually appears in the emitted paths are kept, so
    // a hand-authored test fixture (paths that do not match its params) is never
    // polluted, and boolean/CSG units that don't map 1:1 fall back cleanly.
    _scenePickFaces(layer) {
      if (!layer || layer.type !== 'scene3d' || !layer.params) return [];
      const cache = this._scenePickFaceCache;
      // A scene GROUP's composed geometry lives on scenePaths (layer.paths stays
      // stale for it), so key the cache on whichever array the compose pass
      // actually replaced — otherwise a tree's faces never invalidate.
      const pathsRef = layer.scenePaths || layer.paths;
      if (cache && cache.layerId === layer.id && cache.pathsRef === pathsRef) return cache.faces;
      let faces = [];
      try {
        const S3 = window.Vectura && window.Vectura.Scene3D;
        const Scene = S3 && S3.Scene;
        const Params = S3 && S3.Params;
        if (Scene && typeof Scene.assembleScene === 'function' && this.engine && this.engine.getBounds) {
          // Scene-tree — a group's objects live on CHILD object3d layers, so its
          // OWN params carry an empty objects[] and a disabled ground. Re-deriving
          // from those yields zero pick faces, which silently kills the per-pixel
          // depth pass and lets the ground's coarse centroid depth steal every
          // click. Prefer the collected input the compositor actually drew
          // (_composeSceneGroup publishes it); a monolith has none and keeps
          // using its own params, byte-identically.
          const source = layer._sceneAssembled || layer.params;
          const norm = (Params && typeof Params.normalizeParams === 'function')
            ? Params.normalizeParams(source) : source;
          const asm = Scene.assembleScene(norm, this.engine.getBounds());
          const present = new Set();
          (this.getInteractionPaths(layer) || []).forEach((p) => {
            const t = p && p.meta && p.meta.sceneTarget;
            if (t && t.objectId) present.add(t.objectId);
          });
          const records = Array.isArray(asm.objects) ? asm.objects.slice() : [];
          if (asm.ground) records.push(asm.ground);
          records.forEach((rec) => {
            if (!rec || !present.has(rec.id)) return;
            (rec.faces || []).forEach((face) => {
              if (!face || !face.front || !Array.isArray(face.polygon) || face.polygon.length < 3) return;
              faces.push({ objectId: rec.id, faceId: face.faceId, poly: face.polygon });
            });
          });
        }
      } catch (_e) {
        faces = [];
      }
      this._scenePickFaceCache = { layerId: layer.id, pathsRef, faces };
      return faces;
    }

    // Point-in-face (2D) with barycentric-interpolated camera-space depth. The
    // projected polygon carries {x, y, z}; z is camera depth (bigger = nearer).
    // Fan-triangulate so a large quad (the ground) interpolates LOCALLY at the
    // cursor instead of fitting one plane across its whole span. Returns the
    // interpolated z, or null when the cursor is outside every triangle.
    _scenePolyDepthAt(poly, px, py) {
      const n = poly.length;
      for (let i = 1; i < n - 1; i++) {
        const A = poly[0]; const B = poly[i]; const C = poly[i + 1];
        const v0x = B.x - A.x; const v0y = B.y - A.y;
        const v1x = C.x - A.x; const v1y = C.y - A.y;
        const den = v0x * v1y - v1x * v0y;
        if (Math.abs(den) < 1e-9) continue;
        const v2x = px - A.x; const v2y = py - A.y;
        const b1 = (v2x * v1y - v1x * v2y) / den; // weight for B
        const b2 = (v0x * v2y - v2x * v0y) / den; // weight for C
        const b0 = 1 - b1 - b2; // weight for A
        if (b0 >= -1e-6 && b1 >= -1e-6 && b2 >= -1e-6) {
          const az = Number.isFinite(A.z) ? A.z : 0;
          const bz = Number.isFinite(B.z) ? B.z : 0;
          const cz = Number.isFinite(C.z) ? C.z : 0;
          return b0 * az + b1 * bz + b2 * cz;
        }
      }
      return null;
    }

    // Single-shot scene hit for external callers (context menu): the top
    // candidate at `world`, or null. opts.mode defaults to the current tool's
    // natural target ('object' for select, component submode for direct).
    _sceneHitAtPoint(world, opts = {}) {
      const mode = opts.mode
        || (this.activeTool === 'direct' ? (this.sceneComponentMode || 'face') : 'object');
      const stack = this._sceneCandidatesAtPoint(world, mode);
      return stack.length ? stack[0] : null;
    }

    // Pick from the candidate stack with Alt-click depth cycling: a plain
    // click resets to the top candidate; repeated Alt-clicks on (nearly) the
    // same point advance near -> far through the same stack.
    _scenePickCandidate(stack, world, mode, altHeld) {
      const layerId = stack[0].layer.id;
      const key = `${layerId}|${mode}|${Math.round(world.x / 2)},${Math.round(world.y / 2)}|`
        + stack.map((c) => c.key).join('¦');
      let index = 0;
      if (altHeld && this.sceneCandidateStack && this.sceneCandidateStack.key === key) {
        index = (this.sceneCandidateStack.index + 1) % stack.length;
      }
      this.sceneCandidateStack = { key, index, total: stack.length };
      return stack[index];
    }

    // ——— pointer-down handlers (called from down()) ————————————————————

    // V / select tool on a scene3d layer. Returns true when the event was a
    // scene interaction (selection updated and/or ground-drag armed).
    _sceneDownSelect(world, e, modifiers) {
      const stack = this._sceneCandidatesAtPoint(world, 'object')
        .filter((c) => this._isSceneLayerEditable(c.layer));
      const sceneLayer = stack.length ? stack[0].layer : this.getSceneShortcutLayer();
      if (!sceneLayer || !this._isSceneLayerEditable(sceneLayer)) return false;
      const additive = Boolean(modifiers.shift || modifiers.meta || modifiers.ctrl);
      if (!stack.length) {
        // Empty scene click: a plain click clears the scene selection; the
        // normal empty-click flow below owns the marquee. Stash the scene
        // marquee intent so up() can collect objects instead of layers.
        const base = this.sceneSelection;
        if (!additive && this.sceneSelection) this.setSceneSelection(null);
        this._sceneMarqueePending = {
          layerId: sceneLayer.id,
          mode: 'object',
          additive,
          alt: Boolean(modifiers.alt),
          base,
        };
        return false;
      }
      // A 2D layer stacked ABOVE the scene layer keeps priority for clicks on
      // its strokes.
      const top2d = this.findLayerAtPoint(world);
      if (top2d && top2d.type !== 'scene3d'
        && this.engine.layers.indexOf(top2d) > this.engine.layers.indexOf(stack[0].layer)) {
        return false;
      }
      const layer = stack[0].layer;
      const cand = this._scenePickCandidate(stack, world, 'object', modifiers.alt);
      const now = performance.now();
      const prev = this._sceneLastClick;
      const isDbl = Boolean(prev && (now - prev.time) < 400
        && Math.hypot((e.clientX ?? 0) - prev.x, (e.clientY ?? 0) - prev.y) < 8);
      this._sceneLastClick = { time: now, x: e.clientX ?? 0, y: e.clientY ?? 0 };
      // Scene-tree Increment D — clicking an object inside a scene GROUP selects
      // that object's CHILD LAYER in the tree (sceneTarget.objectId === child
      // layer id, no lookup table). A monolith's inline object has no child
      // layer → select the scene layer itself (legacy behavior).
      const pickedChild = layer.isGroup ? this._sceneChildLayerFor(layer, cand.objectId) : null;
      const layerToSelect = pickedChild || layer;
      if (!this.selectedLayerIds.has(layerToSelect.id)) this.selectLayer(layerToSelect);
      const sel = this.sceneSelection && this.sceneSelection.layerId === layer.id ? this.sceneSelection : null;
      if (isDbl && !additive && !modifiers.alt) {
        // Double-click enters A / face mode on the clicked object (§5.1).
        this.sceneComponentMode = 'face';
        const faceStack = this._sceneCandidatesAtPoint(world, 'face');
        const face = faceStack.find((c) => c.objectId === cand.objectId) || faceStack[0] || null;
        this.setSceneSelection({
          layerId: layer.id,
          mode: 'face',
          objectIds: [],
          faceKeys: face ? [face.key] : [],
          edgeKeys: [],
        });
        if (this.app?.ui?.setActiveTool) this.app.ui.setActiveTool('direct');
        else this.setTool('direct');
        return true;
      }
      if (additive && sel && sel.mode === 'object') {
        // Shift-click toggles membership (discrete — no drag).
        const ids = new Set(sel.objectIds);
        if (ids.has(cand.objectId)) ids.delete(cand.objectId);
        else ids.add(cand.objectId);
        this.setSceneSelection(ids.size ? { ...sel, objectIds: [...ids] } : null);
        return true;
      }
      const already = Boolean(sel && sel.mode === 'object' && sel.objectIds.includes(cand.objectId));
      const objectIds = already && !modifiers.alt ? sel.objectIds : [cand.objectId];
      this.setSceneSelection({ layerId: layer.id, mode: 'object', objectIds, faceKeys: [], edgeKeys: [] });
      if (modifiers.alt) return true; // alt-cycle is discrete
      this._beginSceneGroundDrag(layer, objectIds, world);
      return true;
    }

    // A / direct tool on a scene3d layer (face or edge submode).
    _sceneDownDirect(world, e, modifiers) {
      const mode = this.sceneComponentMode === 'edge' ? 'edge' : 'face';
      const stack = this._sceneCandidatesAtPoint(world, mode)
        .filter((c) => this._isSceneLayerEditable(c.layer));
      const additive = Boolean(modifiers.shift || modifiers.meta || modifiers.ctrl);
      if (!stack.length) {
        const sceneLayer = this.getSceneShortcutLayer();
        if (!sceneLayer || !this._isSceneLayerEditable(sceneLayer)) return false;
        // A 2D path under the cursor keeps plain direct-select behavior.
        if (this.findPathHitAtPoint && this.findPathHitAtPoint(world)) return false;
        const base = this.sceneSelection;
        if (!additive && this.sceneSelection) this.setSceneSelection(null);
        this._sceneMarqueePending = {
          layerId: sceneLayer.id,
          mode,
          additive,
          alt: Boolean(modifiers.alt),
          base,
        };
        this.isSelecting = true;
        this.selectionStart = world;
        this.selectionRect = { x: world.x, y: world.y, w: 0, h: 0 };
        this.draw();
        return true;
      }
      const top2d = this.findLayerAtPoint(world);
      if (top2d && top2d.type !== 'scene3d'
        && this.engine.layers.indexOf(top2d) > this.engine.layers.indexOf(stack[0].layer)) {
        return false;
      }
      const layer = stack[0].layer;
      const cand = this._scenePickCandidate(stack, world, mode, modifiers.alt);
      // Scene-tree Increment D — face/edge picks inside a scene GROUP also route
      // layer selection to the object's child layer (same identity contract).
      const pickedChild = layer.isGroup ? this._sceneChildLayerFor(layer, cand.objectId) : null;
      const layerToSelect = pickedChild || layer;
      if (!this.selectedLayerIds.has(layerToSelect.id)) this.selectLayer(layerToSelect);
      const selMode = cand.kind === 'edge' ? 'edge' : 'face';
      const listKey = selMode === 'edge' ? 'edgeKeys' : 'faceKeys';
      const sel = this.sceneSelection && this.sceneSelection.layerId === layer.id ? this.sceneSelection : null;
      if (additive && sel && sel.mode === selMode) {
        const keys = new Set(sel[listKey]);
        if (keys.has(cand.key)) keys.delete(cand.key);
        else keys.add(cand.key);
        this.setSceneSelection(keys.size ? { ...sel, [listKey]: [...keys] } : null);
      } else {
        this.setSceneSelection({
          layerId: layer.id,
          mode: selMode,
          objectIds: [],
          faceKeys: selMode === 'face' ? [cand.key] : [],
          edgeKeys: selMode === 'edge' ? [cand.key] : [],
        });
      }
      return true;
    }

    // ——— marquee collection ————————————————————————————————————————————

    _scenePathTouchesRect(path, rect) {
      if (!Array.isArray(path) || path.length < 2) return false;
      if (this.pathIntersectsRect(path, rect)) return true;
      // Fully-contained path (no segment crosses the rect boundary).
      if (this.rectContainsPoint(rect, path[0])) return true;
      // Rect fully inside a closed face polygon.
      if (path.meta && path.meta.kind === 'sceneFace' && this.pointInPoly({ x: rect.x, y: rect.y }, path)) {
        return true;
      }
      return false;
    }

    // Face keys of the layer's closed face polygons intersecting `rect`.
    // Front faces only unless includeOccluded (Alt-marquee — §5.1).
    _sceneFacesInRect(layer, rect, { includeOccluded = false } = {}) {
      const keys = [];
      this.getInteractionPaths(layer).forEach((path) => {
        const meta = path && path.meta;
        const target = meta && meta.sceneTarget;
        if (!target || meta.kind !== 'sceneFace') return;
        if (target.occluded && !includeOccluded) return;
        if (!this._scenePathTouchesRect(path, rect)) return;
        const key = this._sceneFaceKeyFor(target);
        if (!keys.includes(key)) keys.push(key);
      });
      return keys;
    }

    // Object ids of scene objects any of whose paths intersect `rect`.
    _sceneObjectsInRect(layer, rect, { includeOccluded = false } = {}) {
      const ids = [];
      this.getInteractionPaths(layer).forEach((path) => {
        const meta = path && path.meta;
        const target = meta && meta.sceneTarget;
        if (!target) return;
        if (target.occluded && !includeOccluded) return;
        if (ids.includes(target.objectId)) return;
        if (this._scenePathTouchesRect(path, rect)) ids.push(target.objectId);
      });
      return ids;
    }

    // ——— ground-drag (V move in the ground plane; Shift lifts) ——————————

    _beginSceneGroundDrag(layer, objectIds, world) {
      // Child-aware — a scene GROUP's objects live on child object3d layers.
      const objects = this._allSceneObjectRecords(layer);
      const start = new Map();
      (objectIds || []).forEach((id) => {
        const obj = objects.find((o) => o && o.id === id);
        if (!obj) return;
        const t = obj.transform || (obj.transform = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 });
        start.set(id, {
          x: Number(t.x) || 0,
          y: Number(t.y) || 0,
          z: Number(t.z) || 0,
        });
      });
      if (!start.size) return;
      this._sceneDrag = {
        layerId: layer.id,
        objectIds: [...start.keys()],
        startWorld: { x: world.x, y: world.y },
        start,
        historyPushed: false,
        moved: false,
      };
      this.setCanvasCursor('move');
    }

    _applySceneGroundDrag(e = {}) {
      const drag = this._sceneDrag;
      if (!drag) return;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (!layer || !layer.params) {
        this._sceneDrag = null;
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      const world = this.screenToWorld((e.clientX ?? 0) - rect.left, (e.clientY ?? 0) - rect.top);
      const dx = world.x - drag.startWorld.x;
      const dy = world.y - drag.startWorld.y;
      if (!drag.moved && Math.hypot(dx, dy) < 1 / (this.scale || 1)) return;
      if (!drag.historyPushed) {
        // One history entry per gesture (app-wide contract), pushed before the
        // first actual movement — mirrors apply3DRotationDrag.
        if (this.app?.pushHistory) this.app.pushHistory();
        else if (this.onCommitTransform) this.onCommitTransform();
        drag.historyPushed = true;
      }
      drag.moved = true;
      const modifiers = this.getModifierState(e);
      const lift = Boolean(modifiers.shift);
      const cam = layer.params.camera || {};
      const yawRad = ((Number(cam.yaw) || 0) * Math.PI) / 180;
      // Ground mapping v1 (documented simplification): the world-space drag
      // delta is rotated by the camera YAW only into ground x/z — pitch
      // foreshortening and perspective scaling are ignored, so 1mm of screen
      // drag maps to ~1mm on the ground plane.
      const groundDX = dx * Math.cos(yawRad) + dy * Math.sin(yawRad);
      const groundDZ = -dx * Math.sin(yawRad) + dy * Math.cos(yawRad);
      const objects = this._allSceneObjectRecords(layer);
      const inferTol = 6 / (this.scale || 1);
      drag.objectIds.forEach((id) => {
        const obj = objects.find((o) => o && o.id === id);
        const s = drag.start.get(id);
        if (!obj || !s) return;
        const t = obj.transform || (obj.transform = {});
        if (lift) {
          // Shift-drag lifts vertically: screen up = +y (world up).
          t.y = Math.round((s.y - dy) * 100) / 100;
          return;
        }
        let nx = s.x + groundDX;
        let nz = s.z + groundDZ;
        // Grid snap reuses snapPointToGrid on the ground plane (x -> x, z -> y).
        const snapped = this.snapPointToGrid({ x: nx, y: nz });
        nx = snapped.x;
        nz = snapped.y;
        // Vertex-inference v1 (documented simplification): per-axis snap to
        // OTHER objects' transform origins within a screen-px tolerance.
        objects.forEach((other) => {
          if (!other || !other.transform || drag.objectIds.includes(other.id)) return;
          const ox = Number(other.transform.x) || 0;
          const oz = Number(other.transform.z) || 0;
          if (Math.abs(ox - nx) <= inferTol) nx = ox;
          if (Math.abs(oz - nz) <= inferTol) nz = oz;
        });
        t.x = Math.round(nx * 100) / 100;
        t.z = Math.round(nz * 100) / 100;
      });
      this._scheduleSceneDragRegen(layer.id);
      const first = objects.find((o) => o && o.id === drag.objectIds[0]);
      if (first && first.transform) {
        const t = first.transform;
        this.showDragTooltip(
          lift ? `Y ${t.y ?? 0}` : `X ${t.x ?? 0}  Z ${t.z ?? 0}`,
          e.clientX ?? 0,
          e.clientY ?? 0
        );
      }
    }

    // Coalesce drag regens on rAF at DRAFT detail: pointermove events outrun
    // regen time on populated scenes (12-object gate: ~130ms at balanced vs
    // ~33ms at draft), so per-move synchronous regens stall the drag. At most
    // one draft-quality regen per animation frame; release does the full one.
    _scheduleSceneDragRegen(layerId) {
      this._sceneDragRegenLayerId = layerId;
      if (this._sceneDragRegenRaf != null) return;
      const raf = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (fn) => setTimeout(fn, 16);
      this._sceneDragRegenRaf = raf(() => {
        this._sceneDragRegenRaf = null;
        const id = this._sceneDragRegenLayerId;
        if (!id) return;
        const SETTINGS = window.Vectura && window.Vectura.SETTINGS;
        const savedQuality = SETTINGS ? SETTINGS.preview3dQuality : undefined;
        if (SETTINGS) SETTINGS.preview3dQuality = 'draft';
        try {
          this.engine.generate(id, { preview: true });
        } finally {
          if (SETTINGS) SETTINGS.preview3dQuality = savedQuality;
        }
        this.draw();
      });
    }

    _endSceneGroundDrag() {
      const drag = this._sceneDrag;
      this._sceneDrag = null;
      this.hideDragTooltip();
      if (this._sceneDragRegenRaf != null) {
        const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
        cancel(this._sceneDragRegenRaf);
        this._sceneDragRegenRaf = null;
      }
      this._sceneDragRegenLayerId = null;
      if (!drag) return;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (layer && drag.moved) {
        this.engine.generate(layer.id);
        this.app?.ui?.updateFormula?.();
      }
      this.updateCursor();
    }

    // Escape mid-drag: restore the captured pre-drag transforms and pop the
    // one gesture history snapshot (if it was pushed) so the move fully reverts.
    _cancelSceneGroundDrag() {
      const drag = this._sceneDrag;
      if (!drag) return false;
      this._sceneDrag = null;
      this.hideDragTooltip();
      if (this._sceneDragRegenRaf != null) {
        const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
        cancel(this._sceneDragRegenRaf);
        this._sceneDragRegenRaf = null;
      }
      this._sceneDragRegenLayerId = null;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (layer) {
        const objects = this._allSceneObjectRecords(layer);
        drag.objectIds.forEach((id) => {
          const obj = objects.find((o) => o && o.id === id);
          const s = drag.start.get(id);
          if (!obj || !s || !obj.transform) return;
          obj.transform.x = s.x;
          obj.transform.y = s.y;
          obj.transform.z = s.z;
        });
        if (drag.moved) {
          // Pop the one gesture snapshot pushed on first movement (mirrors the
          // 2D cancelLayerDrag history handling).
          if (this.app && Array.isArray(this.app.history) && this.app.history.length > 1) {
            this.app.history.pop();
          }
          this.engine.generate(layer.id);
        }
      }
      this.draw();
      this.updateCursor();
      return true;
    }

    // ——— On-canvas resize: uniform scale gizmo + box face-pull ——————————————
    //
    // The renderer only sees the object's PROJECTED 2D silhouette, so a corner
    // gizmo scales the object uniformly (transform.scale) about its bbox center.
    // A box face selection (A-mode) adds a face-pull handle that resizes that
    // face's own dimension (faceId → sx/sy/sz), honoring the DIMENSIONS linkage.

    // Full screen-projected bbox of the single selected scene object (or null),
    // with named corners — the anchor for the scale gizmo.
    _sceneResizeBBox(layer) {
      if (!this._isSceneLayerEditable(layer)) return null;
      const sel = this.getSceneSelection();
      if (!sel || sel.layerId !== layer.id || sel.mode !== 'object' || sel.objectIds.length !== 1) return null;
      const objId = sel.objectIds[0];
      if (objId === 'ground') return null;
      const paths = this.getInteractionPaths(layer);
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      let found = false;
      (paths || []).forEach((path) => {
        const t = path && path.meta && path.meta.sceneTarget;
        if (!t || !Array.isArray(path) || t.objectId !== objId) return;
        for (let i = 0; i < path.length; i++) {
          const pt = path[i];
          if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
          found = true;
        }
      });
      if (!found) return null;
      return {
        objId,
        minX, minY, maxX, maxY,
        center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
        corners: {
          nw: { x: minX, y: minY }, ne: { x: maxX, y: minY },
          se: { x: maxX, y: maxY }, sw: { x: minX, y: maxY },
        },
      };
    }

    drawSceneResizeControl() {
      // Superseded by the unified transform gizmo (its scale boxes own scaling).
      if (this.getSceneObjectGizmo()) return;
      const sel = this.getSceneSelection();
      if (!sel) return;
      const layer = this.engine.layers.find((l) => l.id === sel.layerId);
      const bbox = layer && this._sceneResizeBBox(layer);
      if (!bbox) return;
      const unit = 1 / Math.max(this.scale || 1, 0.001);
      const ctx = this.ctx;
      const stroke = getThemeToken('--render-selection-stroke', '#38bdf8');
      const fill = getThemeToken('--render-selection-handle-fill', '#ffffff');
      ctx.save();
      ctx.lineJoin = 'round';
      // Faint dashed bbox to read the gizmo as a resize frame (not the solid
      // selection outline, which drawSceneSelectionOverlay already draws).
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1 * unit;
      ctx.setLineDash([4 * unit, 3 * unit]);
      ctx.strokeRect(bbox.minX, bbox.minY, bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
      ctx.setLineDash([]);
      // Corner scale handles.
      ctx.globalAlpha = 1;
      const hs = 4.5 * unit;
      ctx.lineWidth = 1.2 * unit;
      ['nw', 'ne', 'se', 'sw'].forEach((k) => {
        const p = bbox.corners[k];
        ctx.fillStyle = fill;
        ctx.strokeStyle = stroke;
        ctx.beginPath();
        ctx.rect(p.x - hs, p.y - hs, hs * 2, hs * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }

    // Screen-px hit-test of the four corner handles → { handle, layer, bbox }.
    hitSceneResize(sx, sy, layer) {
      // Superseded by the unified transform gizmo for a single selected object.
      if (this.getSceneObjectGizmo(layer)) return null;
      const bbox = this._sceneResizeBBox(layer);
      if (!bbox) return null;
      const R = 10;
      const keys = ['nw', 'ne', 'se', 'sw'];
      for (let i = 0; i < keys.length; i++) {
        const s = this.worldToScreen(bbox.corners[keys[i]].x, bbox.corners[keys[i]].y);
        if (Math.hypot(sx - s.x, sy - s.y) <= R) return { handle: keys[i], layer, bbox };
      }
      return null;
    }

    beginSceneResizeDrag(hit, event) {
      if (!hit || !hit.layer) return false;
      const layer = hit.layer;
      const obj = this._sceneObjectById(layer, hit.bbox.objId);
      if (!obj || !obj.transform) return false;
      const center = hit.bbox.center;
      // Anchor the ratio on the POINTER's grab position (not the exact corner)
      // so the ratio reads 1.0 at grab — grabbing anywhere inside the handle's
      // hit radius never snaps the scale on the first move.
      const rect = this.canvas.getBoundingClientRect();
      const grab = this.screenToWorld((event?.clientX ?? 0) - rect.left, (event?.clientY ?? 0) - rect.top);
      const startDist = Math.hypot(grab.x - center.x, grab.y - center.y) || 1e-6;
      this._sceneResizeDrag = {
        layerId: layer.id,
        objectId: obj.id,
        handle: hit.handle,
        center: { ...center },
        startDist,
        startScale: finiteNumber(obj.transform.scale, 1),
        historyPushed: false,
        moved: false,
      };
      this.setCanvasCursor(this.handleCursor ? this.handleCursor(hit.handle, hit.bbox) : 'nwse-resize', 'resize');
      return true;
    }

    _applySceneResizeDrag(event = {}) {
      const drag = this._sceneResizeDrag;
      if (!drag) return false;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (!layer) { this._sceneResizeDrag = null; return false; }
      const obj = this._sceneObjectById(layer, drag.objectId);
      if (!obj || !obj.transform) { this._sceneResizeDrag = null; return false; }
      const rect = this.canvas.getBoundingClientRect();
      const world = this.screenToWorld((event.clientX ?? 0) - rect.left, (event.clientY ?? 0) - rect.top);
      const curDist = Math.hypot(world.x - drag.center.x, world.y - drag.center.y);
      if (!drag.moved && Math.abs(curDist - drag.startDist) < 1 / (this.scale || 1)) return true;
      if (!drag.historyPushed) {
        if (this.app?.pushHistory) this.app.pushHistory();
        drag.historyPushed = true;
      }
      drag.moved = true;
      // Scale about the bbox centre by the corner's distance ratio (drag out =
      // grow). startDist/center are FIXED for the gesture, so it can't feedback.
      const ratio = curDist / drag.startDist;
      // Clamp to the inspector Scale slider's own range so the dragged value
      // round-trips to the slider on release (a wider range would silently snap).
      obj.transform.scale = Math.round(clamp(drag.startScale * ratio, 0.1, 5) * 1000) / 1000;
      this._scheduleSceneDragRegen(layer.id);
      return true;
    }

    _endSceneResizeDrag() {
      const drag = this._sceneResizeDrag;
      this._sceneResizeDrag = null;
      if (this._sceneDragRegenRaf != null) {
        const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
        cancel(this._sceneDragRegenRaf);
        this._sceneDragRegenRaf = null;
      }
      this._sceneDragRegenLayerId = null;
      if (!drag) return;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (layer && drag.moved) {
        this.engine.generate(layer.id);
        this.app?.ui?.updateFormula?.();
        // Rebuild the panel so the Scale slider reflects the dragged value.
        this.app?.ui?.buildControls?.(layer);
      }
      this.updateCursor();
    }

    _cancelSceneResizeDrag() {
      const drag = this._sceneResizeDrag;
      if (!drag) return false;
      this._sceneResizeDrag = null;
      if (this._sceneDragRegenRaf != null) {
        const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
        cancel(this._sceneDragRegenRaf);
        this._sceneDragRegenRaf = null;
      }
      this._sceneDragRegenLayerId = null;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      const obj = layer && this._sceneObjectById(layer, drag.objectId);
      if (obj && obj.transform) obj.transform.scale = drag.startScale;
      if (drag.moved && this.app && Array.isArray(this.app.history) && this.app.history.length > 1) {
        this.app.history.pop();
      }
      if (layer && drag.moved) this.engine.generate(layer.id);
      this.draw();
      this.updateCursor();
      return true;
    }

    // ——— Box face-pull: drag a face to resize that axis's dimension —————————
    //
    // Only boxes (A-06 semantic face ids) get a clean faceId → sx/sy/sz mapping,
    // so face-pull is box-only for v1; other primitives resize via the uniform
    // scale gizmo + the inspector's per-dimension sliders. The pull magnitude is
    // the same self-calibrating distance ratio as the scale gizmo, applied to
    // ONE dimension — pull the face twice as far from centre → dimension doubles.
    _sceneFacePull(layer) {
      if (!this._isSceneLayerEditable(layer)) return null;
      const sel = this.getSceneSelection();
      if (!sel || sel.layerId !== layer.id || sel.mode !== 'face'
        || !sel.faceKeys || sel.faceKeys.length !== 1) return null;
      const faceKey = sel.faceKeys[0];
      const slash = faceKey.indexOf('/');
      if (slash < 0) return null;
      const objId = faceKey.slice(0, slash);
      const faceId = faceKey.slice(slash + 1);
      const obj = this._sceneObjectById(layer, objId);
      if (!obj || obj.primitive !== 'box') return null;
      const AXIS = {
        'face:+X': 'sx', 'face:-X': 'sx', 'face:+Y': 'sy',
        'face:-Y': 'sy', 'face:+Z': 'sz', 'face:-Z': 'sz',
      };
      const axisKey = AXIS[faceId];
      if (!axisKey) return null;
      // Knob position = the face polygon's BBOX centre (duplicate-vertex proof —
      // a closed face repeats its first point, which would skew a vertex mean).
      const paths = this.getInteractionPaths(layer);
      let fMinX = Infinity; let fMinY = Infinity; let fMaxX = -Infinity; let fMaxY = -Infinity;
      let found = false;
      (paths || []).forEach((path) => {
        const t = path && path.meta && path.meta.sceneTarget;
        // Any geometry of this face (outline, surface fill, or edges) bounds it —
        // a hatch/pattern mapper emits sceneFill, not sceneFace, so keying on
        // 'sceneFace' alone would hide the knob for a styled face.
        if (!t || !Array.isArray(path) || t.objectId !== objId || t.faceId !== faceId) return;
        for (let i = 0; i < path.length; i++) {
          const pt = path[i];
          if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
          if (pt.x < fMinX) fMinX = pt.x;
          if (pt.x > fMaxX) fMaxX = pt.x;
          if (pt.y < fMinY) fMinY = pt.y;
          if (pt.y > fMaxY) fMaxY = pt.y;
          found = true;
        }
      });
      if (!found) return null;
      const center = this._sceneObjectPathCenter(layer, objId);
      if (!center) return null;
      const centroid = { x: (fMinX + fMaxX) / 2, y: (fMinY + fMaxY) / 2 };
      // Suppress the knob when the face projects face-on (its outward screen
      // direction collapses toward the object centre): a near-zero pull radius
      // makes the drag hypersensitive, and you cannot meaningfully pull a face
      // along the view axis. ~10 screen px of separation is the floor.
      const outwardPx = Math.hypot(centroid.x - center.x, centroid.y - center.y) * Math.max(this.scale || 1, 0.001);
      if (outwardPx < 10) return null;
      return { objId, faceId, axisKey, centroid, center };
    }

    drawSceneFacePullHandle() {
      const sel = this.getSceneSelection();
      if (!sel) return;
      const layer = this.engine.layers.find((l) => l.id === sel.layerId);
      const fp = layer && this._sceneFacePull(layer);
      if (!fp) return;
      const unit = 1 / Math.max(this.scale || 1, 0.001);
      const ctx = this.ctx;
      ctx.save();
      ctx.lineJoin = 'round';
      // A dashed spoke from the object centre through the face + a round push-pull
      // knob at the face centroid (distinct from the square scale handles).
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = getThemeToken('--render-gizmo-y', '#34d399');
      ctx.lineWidth = 1 * unit;
      ctx.setLineDash([3 * unit, 3 * unit]);
      ctx.beginPath();
      ctx.moveTo(fp.center.x, fp.center.y);
      ctx.lineTo(fp.centroid.x, fp.centroid.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = getThemeToken('--render-gizmo-y', '#34d399');
      ctx.strokeStyle = getThemeToken('--render-selection-handle-stroke', '#ffffff');
      ctx.lineWidth = 1.2 * unit;
      ctx.beginPath();
      ctx.arc(fp.centroid.x, fp.centroid.y, 5 * unit, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    hitSceneFacePull(sx, sy, layer) {
      const fp = this._sceneFacePull(layer);
      if (!fp) return null;
      const s = this.worldToScreen(fp.centroid.x, fp.centroid.y);
      if (Math.hypot(sx - s.x, sy - s.y) <= 12) return { layer, fp };
      return null;
    }

    beginSceneFacePullDrag(hit, event) {
      if (!hit || !hit.layer) return false;
      const { layer, fp } = hit;
      const obj = this._sceneObjectById(layer, fp.objId);
      if (!obj || !obj.params) return false;
      // Anchor the ratio on the POINTER's grab (not the knob centre) so it reads
      // 1.0 at grab and never snaps the dimension on the first move.
      const rect = this.canvas.getBoundingClientRect();
      const grab = this.screenToWorld((event?.clientX ?? 0) - rect.left, (event?.clientY ?? 0) - rect.top);
      const startDist = Math.hypot(grab.x - fp.center.x, grab.y - fp.center.y) || 1e-6;
      this._sceneFacePullDrag = {
        layerId: layer.id,
        objectId: obj.id,
        axisKey: fp.axisKey,
        center: { ...fp.center },
        startDist,
        startDim: finiteNumber(obj.params[fp.axisKey], 40),
        historyPushed: false,
        moved: false,
      };
      this.setCanvasCursor('move', 'resize');
      return true;
    }

    _applySceneFacePullDrag(event = {}) {
      const drag = this._sceneFacePullDrag;
      if (!drag) return false;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (!layer) { this._sceneFacePullDrag = null; return false; }
      const obj = this._sceneObjectById(layer, drag.objectId);
      if (!obj || !obj.params) { this._sceneFacePullDrag = null; return false; }
      const rect = this.canvas.getBoundingClientRect();
      const world = this.screenToWorld((event.clientX ?? 0) - rect.left, (event.clientY ?? 0) - rect.top);
      const curDist = Math.hypot(world.x - drag.center.x, world.y - drag.center.y);
      if (!drag.moved && Math.abs(curDist - drag.startDist) < 1 / (this.scale || 1)) return true;
      if (!drag.historyPushed) {
        if (this.app?.pushHistory) this.app.pushHistory();
        drag.historyPushed = true;
      }
      drag.moved = true;
      const ratio = curDist / drag.startDist;
      obj.params[drag.axisKey] = Math.round(clamp(drag.startDim * ratio, 2, 200) * 100) / 100;
      this._scheduleSceneDragRegen(layer.id);
      return true;
    }

    _endSceneFacePullDrag() {
      const drag = this._sceneFacePullDrag;
      this._sceneFacePullDrag = null;
      if (this._sceneDragRegenRaf != null) {
        const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
        cancel(this._sceneDragRegenRaf);
        this._sceneDragRegenRaf = null;
      }
      this._sceneDragRegenLayerId = null;
      if (!drag) return;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (layer && drag.moved) {
        this.engine.generate(layer.id);
        this.app?.ui?.updateFormula?.();
        this.app?.ui?.buildControls?.(layer);
      }
      this.updateCursor();
    }

    _cancelSceneFacePullDrag() {
      const drag = this._sceneFacePullDrag;
      if (!drag) return false;
      this._sceneFacePullDrag = null;
      if (this._sceneDragRegenRaf != null) {
        const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
        cancel(this._sceneDragRegenRaf);
        this._sceneDragRegenRaf = null;
      }
      this._sceneDragRegenLayerId = null;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      const obj = layer && this._sceneObjectById(layer, drag.objectId);
      if (obj && obj.params) obj.params[drag.axisKey] = drag.startDim;
      if (drag.moved && this.app && Array.isArray(this.app.history) && this.app.history.length > 1) {
        this.app.history.pop();
      }
      if (layer && drag.moved) this.engine.generate(layer.id);
      this.draw();
      this.updateCursor();
      return true;
    }

    // ——— Phase 2: sun widget + shadow handle (CONTRACT L1/L2) ——————————————
    //
    // The sun handle is the light-editing peer of the 3D rotation gizmo: it
    // floats near the scene, is dragged to re-aim the sun, and reads back a
    // tooltip. Shadows are a second handle onto the same light — dragging a
    // cast-shadow fill (regionClass 'castShadow', L2) re-derives azimuth +
    // elevation from the caster→tip vector. Both funnel writes through
    // _writeSceneLight → draft regen → one history entry per gesture, mirroring
    // _applySceneGroundDrag / apply3DRotationDrag. Every branch is ADDITIVE:
    // absent a scene selection nothing draws or hit-tests.

    // The scene3d layer the light affordances act on: the sole selected scene
    // layer, else the scene-selection's layer. Null disables the widget.
    _sceneLightLayer() {
      const sel = this.getSelectedLayers ? this.getSelectedLayers() : [];
      if (sel.length === 1 && sel[0]) {
        const s = sel[0];
        // Scene-tree Increment E — a selected sceneLight3d CHILD arms the gizmo
        // on its owning scene GROUP (the child carries one lights[] entry). Record
        // which child is armed so _selectedSceneLight resolves the child's params.
        if (s.type === 'sceneLight3d') {
          const group = this._sceneGroupOfChild(s);
          if (group && group.visible !== false && !this.isLayerLocked?.(group.id)) {
            group._selectedLightChildId = s.id;
            return group;
          }
          return null;
        }
        if (s.type === 'scene3d' && s.visible !== false && !this.isLayerLocked?.(s.id)) {
          // A directly-selected scene layer uses its own _selectedLightId (the
          // legacy in-panel light tree); no light CHILD is armed.
          s._selectedLightChildId = null;
          return s;
        }
      }
      const ss = this.getSceneSelection && this.getSceneSelection();
      if (ss) {
        const l = this.engine.layers.find((x) => x.id === ss.layerId);
        if (l && l.type === 'scene3d' && l.visible !== false && !this.isLayerLocked?.(l.id)) return l;
      }
      return null;
    }

    // Scene-tree Increment E — walk up to the owning scene GROUP of a child layer
    // (type 'scene3d' + isGroup), or null.
    _sceneGroupOfChild(layer) {
      const seen = new Set();
      let p = layer;
      while (p && p.parentId && !seen.has(p.id)) {
        seen.add(p.id);
        p = this.engine.layers.find((l) => l.id === p.parentId);
        if (p && p.type === 'scene3d' && p.isGroup) return p;
      }
      return null;
    }

    // Scene-tree Increment E — the armed sceneLight3d CHILD of a scene group (set
    // by _sceneLightLayer when a light child is selected), or null.
    _armedLightChild(group) {
      const cid = group && group._selectedLightChildId;
      if (!cid) return null;
      const child = this.engine.layers.find(
        (l) => l && l.id === cid && l.type === 'sceneLight3d' && l.parentId === group.id
      );
      return child || null;
    }

    // The light object the gizmo edits for `group`: the armed CHILD's params (its
    // params ARE one lights[] entry) when a light child is selected, else the
    // inline group light by id (the legacy monolith / in-panel-tree path).
    _gizmoLight(group, lightId) {
      const child = this._armedLightChild(group);
      if (child) return child.params;
      return this._lightById(group, lightId);
    }

    // The layer whose controls should rebuild after a light edit: the armed light
    // child (so its focused panel refreshes), else the group itself.
    _lightPanelLayer(group) {
      return this._armedLightChild(group) || group;
    }

    // params.lights[0] (single directional sun — L1). Never mutates on read; a
    // synthesized default is returned when the array is absent so the widget
    // still draws before 2A's normalizeParams runs.
    _sceneLight(layer, ensure = false) {
      const params = (layer && layer.params) || {};
      if (!Array.isArray(params.lights) || !params.lights.length) {
        if (ensure) {
          params.lights = [{ id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true }];
          return params.lights[0];
        }
        return { id: 'sun', type: 'directional', azimuth: 135, elevation: 45, castShadows: true };
      }
      return params.lights[0];
    }

    // World light DIRECTION (travel, pointing away from the sun toward the
    // scene, d.y < 0) per L1. Uses 2A's exported helper when present so the
    // widget and the shadow projection agree; else an identical local fallback.
    _lightWorldDir(light) {
      const L = window.Vectura && window.Vectura.Scene3D && window.Vectura.Scene3D.Lighting;
      if (L && typeof L.lightWorldDir === 'function') {
        try {
          const v = L.lightWorldDir(light);
          if (v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)) return v;
        } catch (_e) { /* fall through to local */ }
      }
      const az = ((light && light.azimuth) || 0) * Math.PI / 180;
      const el = clamp((light && light.elevation) || 0, 0, 90) * Math.PI / 180;
      return {
        x: -Math.cos(el) * Math.sin(az),
        y: -Math.sin(el),
        z: -Math.cos(el) * Math.cos(az),
      };
    }

    // Scene-wide anchor (bbox center of all non-ground scene paths, world
    // coords) — independent of the object selection so the sun stays put while
    // objects are picked. Null when the layer has no drawn geometry.
    _sceneLightAnchor(layer) {
      const paths = this.getInteractionPaths(layer) || [];
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      let found = false;
      paths.forEach((path) => {
        const target = path && path.meta && path.meta.sceneTarget;
        if (!target || !Array.isArray(path)) return;
        if (target.objectId === 'ground') return;
        for (let i = 0; i < path.length; i++) {
          const pt = path[i];
          if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
          found = true;
        }
      });
      if (!found) return null;
      return { center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, radius: Math.max(maxX - minX, maxY - minY) / 2 };
    }

    // Camera-space rotation matching Geometry3D.rotatePoint (yaw→pitch→roll) and
    // its exact inverse. Angles in DEGREES. Used to place the sun handle where
    // the sun actually is in the current view (and to invert a drag).
    _rotateCam(pt, cam) {
      let { x, y, z } = pt;
      const yaw = ((cam && cam.yaw) || 0) * Math.PI / 180;
      const pitch = ((cam && cam.pitch) || 0) * Math.PI / 180;
      const roll = ((cam && cam.roll) || 0) * Math.PI / 180;
      let c = Math.cos(yaw); let s = Math.sin(yaw);
      [x, z] = [x * c + z * s, -x * s + z * c];
      c = Math.cos(pitch); s = Math.sin(pitch);
      [y, z] = [y * c - z * s, y * s + z * c];
      c = Math.cos(roll); s = Math.sin(roll);
      [x, y] = [x * c - y * s, x * s + y * c];
      return { x, y, z };
    }

    _unrotateCam(pt, cam) {
      let { x, y, z } = pt;
      const yaw = ((cam && cam.yaw) || 0) * Math.PI / 180;
      const pitch = ((cam && cam.pitch) || 0) * Math.PI / 180;
      const roll = ((cam && cam.roll) || 0) * Math.PI / 180;
      let c = Math.cos(roll); let s = Math.sin(roll);
      [x, y] = [x * c + y * s, -x * s + y * c];
      c = Math.cos(pitch); s = Math.sin(pitch);
      [y, z] = [y * c + z * s, -y * s + z * c];
      c = Math.cos(yaw); s = Math.sin(yaw);
      [x, z] = [x * c - z * s, x * s + z * c];
      return { x, y, z };
    }

    // Forward map: light → screen offset (dx,dy from the anchor center) of the
    // sun handle. The toward-sun unit vector is rotated through the SAME camera
    // as the scene and projected (screen x = +camX, screen y = −camY, per
    // Geometry3D.projectPoint), so the disc sits where the sun is in the view:
    // azimuth sets the bearing, elevation sets the on-screen HEIGHT (a higher
    // sun sits higher on screen; a smaller elevation number sits lower),
    // foreshortened by camera pitch. Radius ∝ how far off the view axis the sun
    // points. Invertible by _lightFromHandleOffset.
    _lightHandleOffset(layer, light, baseR) {
      const d = this._lightWorldDir(light);
      const cam = (layer && layer.params && layer.params.camera) || {};
      const rot = this._rotateCam({ x: -d.x, y: -d.y, z: -d.z }, cam); // toward-sun, camera space
      return { dx: rot.x * baseR, dy: -rot.y * baseR };
    }

    // Inverse of _lightHandleOffset: a screen handle offset → {azimuth,elevation}.
    // Reconstruct the camera-space toward-sun unit vector from (x = dx/R,
    // y = −dy/R) plus the unit-length constraint (z = ±√(1−x²−y²)). Two depths
    // project to the same screen point (front/back of the view sphere); which is
    // real is unrecoverable from 2D alone, so pick the branch nearest the current
    // elevation (hintEl) for smooth dragging — defaulting to the front hemisphere
    // (correct for the common mid/high-elevation sun). Un-rotate → az/el.
    _lightFromHandleOffset(dx, dy, cam, baseR, hintEl) {
      const R = Math.max(baseR, 1e-6);
      let rx = clamp(dx / R, -1, 1);
      let ry = clamp(-dy / R, -1, 1);
      const planar = Math.hypot(rx, ry);
      if (planar > 1) { rx /= planar; ry /= planar; } // clamp onto the unit disc
      const rz = Math.sqrt(Math.max(0, 1 - rx * rx - ry * ry));
      const solve = (z) => {
        const w = this._unrotateCam({ x: rx, y: ry, z }, cam); // toward-sun, world
        const len = Math.hypot(w.x, w.y, w.z) || 1;
        const ny = clamp(w.y / len, -1, 1);
        return {
          azimuth: (Math.atan2(w.x, w.z) * 180 / Math.PI + 360) % 360,
          elevation: Math.asin(ny) * 180 / Math.PI,
        };
      };
      const front = solve(rz); const back = solve(-rz);
      let best;
      if (Number.isFinite(hintEl)) {
        best = Math.abs(front.elevation - hintEl) <= Math.abs(back.elevation - hintEl) ? front : back;
      } else {
        best = front; // front hemisphere: correct for the common mid/high sun
      }
      return {
        azimuth: Math.round(best.azimuth * 10) / 10,
        elevation: Math.round(clamp(best.elevation, 0, 90) * 10) / 10,
      };
    }

    // Handle geometry (world coords) for the current sun, or null when the
    // scene has no anchor. baseR scales with the scene so the handle stays close.
    getSceneLightControl(layer) {
      const target = layer || this._sceneLightLayer();
      if (!target) return null;
      // Scene-tree Increment E — a scene group whose lights live on CHILD layers
      // is child-managed: the per-light 3-axis gizmo is the affordance, so the
      // legacy 2D sun disc is retired (it would otherwise inject a phantom sun
      // into the group's empty inline lights via _sceneLight(.., true)).
      if (target.isGroup && this.engine && Array.isArray(this.engine.layers)
        && this.engine.layers.some((l) => l && l.type === 'sceneLight3d' && l.parentId === target.id)) {
        return null;
      }
      // Lightless-scene guard: a scene can now hold zero lights. The sun handle
      // represents a DIRECTIONAL (sun) light — when the lights array is present
      // but carries no directional light, there is no sun to place, so suppress
      // the phantom handle (both draw AND hit-test route through this control).
      // An ABSENT lights array is left to _sceneLight's pre-normalize synthesis
      // so the widget still draws before normalizeParams first runs.
      const lights = target.params && target.params.lights;
      if (Array.isArray(lights)
        && !lights.some((l) => l && (l.type === 'directional' || l.type === 'sun'))) {
        return null;
      }
      const anchor = this._sceneLightAnchor(target);
      if (!anchor) return null;
      const unit = 1 / Math.max(this.scale || 1, 0.001);
      const baseR = Math.max(anchor.radius * 1.5, 60 * unit);
      const light = this._sceneLight(target);
      const off = this._lightHandleOffset(target, light, baseR);
      return {
        layer: target,
        center: { ...anchor.center },
        pos: { x: anchor.center.x + off.dx, y: anchor.center.y + off.dy },
        baseR,
        unit,
        light,
      };
    }

    // ─── Unified per-object transform gizmo (move · rotate · scale, all shown at
    // once — Cinema4D-style). Anchored on the selected scene object; axes are
    // world X/Y/Z rotated through the scene camera (orientation-only, the same v1
    // simplification the sun handle and ground drag use — no per-point
    // perspective). Drives params.objects[i].transform and supersedes the legacy
    // corner-scale handle for a single selected object. ─────────────────────────
    _gizmoSegDist(p, a, b) {
      const vx = b.x - a.x; const vy = b.y - a.y;
      const L2 = vx * vx + vy * vy || 1e-9;
      let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
    }

    getSceneObjectGizmo(layer) {
      const target = layer || this._sceneLightLayer();
      if (!target || target.type !== 'scene3d') return null;
      const sel = this.getSceneSelection();
      if (!sel || sel.mode !== 'object' || !Array.isArray(sel.objectIds) || sel.objectIds.length !== 1) return null;
      const objId = sel.objectIds[0];
      if (!objId || objId === 'ground') return null;
      const center = this._sceneObjectPathCenter(target, objId);
      if (!center) return null;
      const cam = (target.params && target.params.camera) || {};
      const unit = 1 / Math.max(this.scale || 1, 0.001);
      const R = 60 * unit;         // move-arrow length (doc units → constant on-screen)
      const ringR = R * 0.92;
      const project = (w) => { const r = this._rotateCam(w, cam); return { x: r.x, y: -r.y, z: r.z }; };
      const AX = [
        { key: 'x', world: { x: 1, y: 0, z: 0 }, perp: [{ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }] },
        { key: 'y', world: { x: 0, y: 1, z: 0 }, perp: [{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 0 }] },
        { key: 'z', world: { x: 0, y: 0, z: 1 }, perp: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }] },
      ];
      const axes = AX.map((ax) => {
        const p = project(ax.world);
        const len = Math.hypot(p.x, p.y) || 1e-6;
        const u = { x: p.x / len, y: p.y / len };
        const ring = [];
        const N = 40;
        for (let i = 0; i <= N; i++) {
          const th = (i / N) * TAU;
          const c = Math.cos(th); const s = Math.sin(th);
          const w = {
            x: ax.perp[0].x * c + ax.perp[1].x * s,
            y: ax.perp[0].y * c + ax.perp[1].y * s,
            z: ax.perp[0].z * c + ax.perp[1].z * s,
          };
          const pr = project(w);
          ring.push({ x: center.x + pr.x * ringR, y: center.y + pr.y * ringR });
        }
        return {
          key: ax.key,
          dir: u,
          depth: p.z,
          tip: { x: center.x + u.x * R, y: center.y + u.y * R },
          scaleBox: { x: center.x + u.x * R * 1.16, y: center.y + u.y * R * 1.16 },
          ring,
        };
      });
      return { objId, center, R, ringR, unit, axes };
    }

    hitSceneObjectGizmo(sx, sy, layer) {
      const giz = this.getSceneObjectGizmo(layer);
      if (!giz) return null;
      const world = this.screenToWorld(sx, sy);
      const tol = 9 * giz.unit;
      const near = (a) => Math.hypot(world.x - a.x, world.y - a.y) <= tol;
      // Scale boxes first (small, specific), then move arrows, then rotate rings.
      for (const ax of giz.axes) if (near(ax.scaleBox)) return { type: 'scale', axis: ax.key };
      for (const ax of giz.axes) {
        if (near(ax.tip)) return { type: 'move', axis: ax.key };
        if (this._gizmoSegDist(world, giz.center, ax.tip) <= tol * 0.8) return { type: 'move', axis: ax.key };
      }
      for (const ax of giz.axes) {
        for (let i = 1; i < ax.ring.length; i++) {
          if (this._gizmoSegDist(world, ax.ring[i - 1], ax.ring[i]) <= tol * 0.8) return { type: 'rotate', axis: ax.key };
        }
      }
      return null;
    }

    beginSceneObjectGizmoDrag(hit, e = {}) {
      const layer = this._sceneLightLayer();
      if (!layer || !hit) return false;
      const giz = this.getSceneObjectGizmo(layer);
      if (!giz) return false;
      const obj = this._sceneObjectById(layer, giz.objId);
      if (!obj) return false;
      const t = obj.transform || (obj.transform = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 });
      const rect = this.canvas.getBoundingClientRect();
      const world = this.screenToWorld((e.clientX ?? 0) - rect.left, (e.clientY ?? 0) - rect.top);
      this._sceneObjectGizmoDrag = {
        layerId: layer.id,
        objectId: giz.objId,
        type: hit.type,
        axis: hit.axis,
        center: { ...giz.center },
        startWorld: { x: world.x, y: world.y },
        startAngle: Math.atan2(world.y - giz.center.y, world.x - giz.center.x),
        startDist: Math.max(1e-3, Math.hypot(world.x - giz.center.x, world.y - giz.center.y)),
        camYaw: ((layer.params && layer.params.camera && layer.params.camera.yaw) || 0) * Math.PI / 180,
        start: {
          x: Number(t.x) || 0, y: Number(t.y) || 0, z: Number(t.z) || 0,
          yaw: Number(t.yaw) || 0, pitch: Number(t.pitch) || 0, roll: Number(t.roll) || 0,
          scale: Number(t.scale) || 1,
          // Effective per-axis start (I23). Falls back to the uniform scale so a
          // legacy scale-only object drags cleanly.
          sx: Number.isFinite(t.sx) ? t.sx : (Number(t.scale) || 1),
          sy: Number.isFinite(t.sy) ? t.sy : (Number(t.scale) || 1),
          sz: Number.isFinite(t.sz) ? t.sz : (Number(t.scale) || 1),
        },
        // Whether the object was ALREADY non-uniform at grab time. A uniform
        // object stays uniform on Escape (no spurious sx/sy/sz left behind).
        startHadAxis: Number.isFinite(t.sx) || Number.isFinite(t.sy) || Number.isFinite(t.sz),
        historyPushed: false,
        moved: false,
      };
      this.setCanvasCursor(hit.type === 'rotate' ? 'grabbing' : 'move');
      return true;
    }

    _gizmoTooltip(type, t) {
      if (type === 'move') return `X ${Math.round(t.x)}  Y ${Math.round(t.y)}  Z ${Math.round(t.z)}`;
      if (type === 'rotate') return `X ${Math.round(t.pitch)}°  Y ${Math.round(t.yaw)}°  Z ${Math.round(t.roll)}°`;
      // Scale: show one figure when uniform, per-axis figures when stretched.
      const s = Number.isFinite(t.scale) ? t.scale : 1;
      const sx = Number.isFinite(t.sx) ? t.sx : s;
      const sy = Number.isFinite(t.sy) ? t.sy : s;
      const sz = Number.isFinite(t.sz) ? t.sz : s;
      if (sx === sy && sy === sz) return `Scale ${Number(sx).toFixed(2)}×`;
      return `X ${sx.toFixed(2)}  Y ${sy.toFixed(2)}  Z ${sz.toFixed(2)}`;
    }

    _applySceneObjectGizmoDrag(e = {}) {
      const drag = this._sceneObjectGizmoDrag;
      if (!drag) return false;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (!layer || !layer.params) { this._sceneObjectGizmoDrag = null; return false; }
      const obj = this._sceneObjectById(layer, drag.objectId);
      if (!obj || !obj.transform) { this._sceneObjectGizmoDrag = null; return false; }
      const rect = this.canvas.getBoundingClientRect();
      const world = this.screenToWorld((e.clientX ?? 0) - rect.left, (e.clientY ?? 0) - rect.top);
      const dx = world.x - drag.startWorld.x;
      const dy = world.y - drag.startWorld.y;
      if (!drag.moved && Math.hypot(dx, dy) < 1 / (this.scale || 1)) return true;
      if (!drag.historyPushed) {
        if (this.app?.pushHistory) this.app.pushHistory();
        else if (this.onCommitTransform) this.onCommitTransform();
        drag.historyPushed = true;
      }
      drag.moved = true;
      const t = obj.transform;
      const s = drag.start;
      const round2 = (val) => Math.round(val * 100) / 100;
      if (drag.type === 'move') {
        // Ground-drag mapping (yaw-rotated screen delta), constrained to the axis.
        const cy = Math.cos(drag.camYaw); const sy = Math.sin(drag.camYaw);
        if (drag.axis === 'x') t.x = round2(s.x + (dx * cy + dy * sy));
        else if (drag.axis === 'z') t.z = round2(s.z + (-dx * sy + dy * cy));
        else t.y = round2(s.y - dy); // screen up = world +y
      } else if (drag.type === 'rotate') {
        const ang = Math.atan2(world.y - drag.center.y, world.x - drag.center.x);
        const dDeg = (ang - drag.startAngle) * 180 / Math.PI;
        const modifiers = this.getModifierState(e);
        const apply = (base) => {
          let val = base + dDeg;
          if (modifiers.shift) val = Math.round(val / 15) * 15;
          return Math.round(val * 10) / 10;
        };
        if (drag.axis === 'y') t.yaw = apply(s.yaw);
        else if (drag.axis === 'x') t.pitch = apply(s.pitch);
        else t.roll = apply(s.roll);
      } else { // scale
        const dist = Math.max(1e-3, Math.hypot(world.x - drag.center.x, world.y - drag.center.y));
        const ratio = dist / drag.startDist;
        const cs = (val) => Math.round(clamp(val, 0.1, 5) * 1000) / 1000;
        const modifiers = this.getModifierState(e);
        // Was the object non-uniform at grab time? (start sx/sy/sz diverge.)
        const wasNonUniform = !(s.sx === s.scale && s.sy === s.scale && s.sz === s.scale);
        if (modifiers.alt) {
          // I23 — Alt = UNIFORM: every axis scales by the same ratio. (Alt, not
          // Cmd/Ctrl — Cmd cancels drops on macOS Chrome.) A uniform object
          // stays scale-only (byte-identical old path); a non-uniform object
          // keeps its proportions, each axis multiplied by the same ratio.
          t.scale = cs(s.scale * ratio);
          if (wasNonUniform) {
            t.sx = cs(s.sx * ratio);
            t.sy = cs(s.sy * ratio);
            t.sz = cs(s.sz * ratio);
          }
        } else {
          // Default = PER-AXIS: only the dragged handle's axis changes; the
          // others hold their start value, making the object non-uniform.
          t.sx = drag.axis === 'x' ? cs(s.sx * ratio) : cs(s.sx);
          t.sy = drag.axis === 'y' ? cs(s.sy * ratio) : cs(s.sy);
          t.sz = drag.axis === 'z' ? cs(s.sz * ratio) : cs(s.sz);
        }
      }
      this._scheduleSceneDragRegen(layer.id);
      this.showDragTooltip(this._gizmoTooltip(drag.type, t), e.clientX ?? 0, e.clientY ?? 0);
      return true;
    }

    _endSceneObjectGizmoDrag() {
      const drag = this._sceneObjectGizmoDrag;
      this._sceneObjectGizmoDrag = null;
      this.hideDragTooltip();
      if (this._sceneDragRegenRaf != null) {
        const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
        cancel(this._sceneDragRegenRaf);
        this._sceneDragRegenRaf = null;
      }
      this._sceneDragRegenLayerId = null;
      if (!drag) return;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (layer && drag.moved) {
        this.engine.generate(layer.id);
        this.app?.ui?.updateFormula?.();
        this.app?.ui?.buildControls?.(layer);
      }
      this.updateCursor();
    }

    _cancelSceneObjectGizmoDrag() {
      const drag = this._sceneObjectGizmoDrag;
      if (!drag) return false;
      this._sceneObjectGizmoDrag = null;
      this.hideDragTooltip();
      if (this._sceneDragRegenRaf != null) {
        const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
        cancel(this._sceneDragRegenRaf);
        this._sceneDragRegenRaf = null;
      }
      this._sceneDragRegenLayerId = null;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      const obj = layer && this._sceneObjectById(layer, drag.objectId);
      if (obj && obj.transform) {
        Object.assign(obj.transform, drag.start);
        // If the object was uniform when grabbed, a per-axis drag added sx/sy/sz;
        // strip them so Escape restores the exact pre-drag (scale-only) shape.
        if (!drag.startHadAxis) {
          delete obj.transform.sx;
          delete obj.transform.sy;
          delete obj.transform.sz;
        }
      }
      if (drag.moved && this.app && Array.isArray(this.app.history) && this.app.history.length > 1) this.app.history.pop();
      if (layer) this.engine.generate(layer.id);
      this.updateCursor();
      this.draw();
      return true;
    }

    drawSceneObjectGizmo() {
      const giz = this.getSceneObjectGizmo();
      if (!giz) return;
      const ctx = this.ctx;
      const unit = giz.unit;
      const colors = {
        x: getThemeToken('--render-gizmo-x', '#fbbf24'),
        y: getThemeToken('--render-gizmo-y', '#a78bfa'),
        z: getThemeToken('--render-gizmo-z', '#22d3ee'),
      };
      const stroke = getThemeToken('--render-selection-handle-stroke', '#f8fafc');
      const fillBg = getThemeToken('--render-selection-handle-fill', '#111827');
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Far axes first so nearer handles overprint them.
      [...giz.axes].sort((a, b) => a.depth - b.depth).forEach((ax) => {
        const col = colors[ax.key];
        const dim = ax.depth < -0.2 ? 0.4 : 0.95;
        // rotate ring (projected ellipse)
        ctx.globalAlpha = dim * 0.8;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.3 * unit;
        ctx.beginPath();
        ax.ring.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
        // move arrow
        ctx.globalAlpha = dim;
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.moveTo(giz.center.x, giz.center.y);
        ctx.lineTo(ax.tip.x, ax.tip.y);
        ctx.stroke();
        const a = Math.atan2(ax.tip.y - giz.center.y, ax.tip.x - giz.center.x);
        const ah = 6 * unit;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(ax.tip.x, ax.tip.y);
        ctx.lineTo(ax.tip.x - Math.cos(a - 0.42) * ah, ax.tip.y - Math.sin(a - 0.42) * ah);
        ctx.lineTo(ax.tip.x - Math.cos(a + 0.42) * ah, ax.tip.y - Math.sin(a + 0.42) * ah);
        ctx.closePath();
        ctx.fill();
        // scale box
        const bs = 3.4 * unit;
        ctx.fillStyle = fillBg;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.4 * unit;
        ctx.beginPath();
        ctx.rect(ax.scaleBox.x - bs, ax.scaleBox.y - bs, bs * 2, bs * 2);
        ctx.fill();
        ctx.stroke();
      });
      // center pivot
      ctx.globalAlpha = 1;
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(giz.center.x, giz.center.y, 2.4 * unit, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    drawSceneLightOverlay() {
      const layer = this._sceneLightLayer();
      if (!layer) return;
      // The 3-axis gizmo (a light is explicitly selected) supersedes the legacy
      // 2D sun disc — don't draw both.
      if (this.getSceneLightGizmo(layer)) return;
      const control = this.getSceneLightControl(layer);
      if (!control) return;
      const { center, pos, unit } = control;
      const accent = getThemeToken('--render-gizmo-x', '#fbbf24'); // amber sun
      const line = getThemeToken('--render-selection-handle-stroke', '#f8fafc');
      this.ctx.save();
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      // Ray from the anchor toward the sun.
      this.ctx.globalAlpha = 0.55;
      this.ctx.strokeStyle = line;
      this.ctx.lineWidth = 1 * unit;
      this.ctx.setLineDash([3 * unit, 3 * unit]);
      this.ctx.beginPath();
      this.ctx.moveTo(center.x, center.y);
      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      // Sun disc.
      this.ctx.globalAlpha = 0.95;
      this.ctx.fillStyle = accent;
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, 4.2 * unit, 0, TAU);
      this.ctx.fill();
      // Sun rays.
      this.ctx.strokeStyle = accent;
      this.ctx.lineWidth = 1.1 * unit;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const rx = Math.cos(a); const ry = Math.sin(a);
        this.ctx.beginPath();
        this.ctx.moveTo(pos.x + rx * 6 * unit, pos.y + ry * 6 * unit);
        this.ctx.lineTo(pos.x + rx * 9 * unit, pos.y + ry * 9 * unit);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    hitSceneLight(sx, sy, layer = null) {
      const target = layer || this._sceneLightLayer();
      if (!target) return null;
      const control = this.getSceneLightControl(target);
      if (!control) return null;
      const world = this.screenToWorld(sx, sy);
      const dist = Math.hypot(world.x - control.pos.x, world.y - control.pos.y);
      if (dist <= 11 * control.unit) {
        return { type: 'widget', layer: target, control };
      }
      return null;
    }

    beginSceneLightDrag(hit, event) {
      if (!hit || !hit.layer) return false;
      const layer = hit.layer;
      const light = this._sceneLight(layer, true);
      const control = hit.control || this.getSceneLightControl(layer);
      if (!control) return false;
      this._sceneLightDrag = {
        mode: 'widget',
        layerId: layer.id,
        lightIndex: 0,
        center: { ...control.center },
        baseR: control.baseR,
        camYaw: ((layer.params && layer.params.camera && layer.params.camera.yaw) || 0) * Math.PI / 180,
        cam: {
          yaw: (layer.params && layer.params.camera && layer.params.camera.yaw) || 0,
          pitch: (layer.params && layer.params.camera && layer.params.camera.pitch) || 0,
          roll: (layer.params && layer.params.camera && layer.params.camera.roll) || 0,
        },
        startLight: { azimuth: light.azimuth, elevation: light.elevation },
        historyPushed: false,
        moved: false,
      };
      this.setCanvasCursor('grabbing', 'rotate-3d');
      return true;
    }

    // The cast-shadow fill under `world`, or null (CONTRACT L2). Fills without a
    // 'castShadow' regionClass (tone-band face fills) are ignored.
    _hitSceneShadow(world, layer = null) {
      const target = layer || this._sceneLightLayer();
      if (!target) return null;
      const paths = this.getInteractionPaths(target) || [];
      for (const path of paths) {
        const meta = path && path.meta;
        const st = meta && meta.sceneTarget;
        if (!st || meta.kind !== 'sceneFill' || st.regionClass !== 'castShadow') continue;
        const poly = Array.isArray(st.pickPolygon) ? st.pickPolygon : null;
        if (poly && poly.length >= 3 && this.pointInPoly(world, poly)) {
          return { layer: target, path, casterId: st.casterId || null, pickPolygon: poly };
        }
      }
      return null;
    }

    // A shadow drag is a second way to aim the same light: the drag origin is
    // the caster's ground anchor and the cursor is the shadow tip. Direction →
    // sun azimuth (opposite the shadow); tip length → elevation (longer = lower).
    beginSceneShadowDrag(hit, event) {
      if (!hit || !hit.layer) return false;
      const layer = hit.layer;
      const light = this._sceneLight(layer, true);
      // Origin: the caster object's path-bbox center; falls back to the shadow
      // polygon centroid for a merged (casterId null) union shadow.
      let origin = null;
      if (hit.casterId) origin = this._sceneObjectPathCenter(layer, hit.casterId);
      if (!origin && Array.isArray(hit.pickPolygon)) origin = this._polygonCentroid(hit.pickPolygon);
      if (!origin) return false;
      this._sceneLightDrag = {
        mode: 'shadow',
        layerId: layer.id,
        lightIndex: 0,
        origin,
        camYaw: ((layer.params && layer.params.camera && layer.params.camera.yaw) || 0) * Math.PI / 180,
        startLight: { azimuth: light.azimuth, elevation: light.elevation },
        historyPushed: false,
        moved: false,
      };
      this.setCanvasCursor('grabbing', 'rotate-3d');
      return true;
    }

    _sceneObjectPathCenter(layer, objectId) {
      const paths = this.getInteractionPaths(layer) || [];
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      let found = false;
      paths.forEach((path) => {
        const target = path && path.meta && path.meta.sceneTarget;
        if (!target || target.objectId !== objectId || !Array.isArray(path)) return;
        for (let i = 0; i < path.length; i++) {
          const pt = path[i];
          if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
          found = true;
        }
      });
      if (!found) return null;
      return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }

    _polygonCentroid(poly) {
      if (!Array.isArray(poly) || !poly.length) return null;
      let sx = 0; let sy = 0; let n = 0;
      poly.forEach((p) => {
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) { sx += p.x; sy += p.y; n++; }
      });
      if (!n) return null;
      return { x: sx / n, y: sy / n };
    }

    _writeSceneLight(layer, patch) {
      const light = this._sceneLight(layer, true);
      if (patch.azimuth !== undefined) light.azimuth = patch.azimuth;
      if (patch.elevation !== undefined) light.elevation = patch.elevation;
    }

    _applySceneLightDrag(event = {}) {
      const drag = this._sceneLightDrag;
      if (!drag) return false;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (!layer || !layer.params) { this._sceneLightDrag = null; return false; }
      const rect = this.canvas.getBoundingClientRect();
      const world = this.screenToWorld((event.clientX ?? 0) - rect.left, (event.clientY ?? 0) - rect.top);
      let dx; let dy;
      let next;
      if (drag.mode === 'shadow') {
        dx = world.x - drag.origin.x;
        dy = world.y - drag.origin.y;
      } else {
        dx = world.x - drag.center.x;
        dy = world.y - drag.center.y;
      }
      if (!drag.moved && Math.hypot(dx, dy) < 1 / (this.scale || 1)) return true;
      if (!drag.historyPushed) {
        if (this.app?.pushHistory) this.app.pushHistory();
        else if (this.onCommitTransform) this.onCommitTransform();
        drag.historyPushed = true;
      }
      drag.moved = true;
      if (drag.mode === 'shadow') {
        // Screen shadow delta → ground direction (camera-yaw math, matching
        // _applySceneGroundDrag). Sun azimuth is opposite the shadow; elevation
        // falls as the shadow lengthens.
        const cy = Math.cos(drag.camYaw); const sy = Math.sin(drag.camYaw);
        const gx = dx * cy + dy * sy;
        const gz = -dx * sy + dy * cy;
        const len = Math.hypot(dx, dy);
        let az = Math.atan2(-gx, -gz) * 180 / Math.PI;
        if (az < 0) az += 360;
        const ref = 80 / (this.scale || 1);
        const el = clamp(Math.atan2(ref, Math.max(len, 1e-3)) * 180 / Math.PI, 2, 88);
        next = { azimuth: Math.round(az * 10) / 10, elevation: Math.round(el * 10) / 10 };
      } else {
        next = this._lightFromHandleOffset(dx, dy, drag.cam, drag.baseR,
          (this._sceneLight(layer) || drag.startLight || {}).elevation);
      }
      this._writeSceneLight(layer, next);
      this._scheduleSceneDragRegen(layer.id);
      this.showDragTooltip(
        `Az ${Math.round(next.azimuth)}°  El ${Math.round(next.elevation)}°`,
        event.clientX ?? 0,
        event.clientY ?? 0,
      );
      return true;
    }

    endSceneLightDrag() {
      const drag = this._sceneLightDrag;
      this._sceneLightDrag = null;
      this.hideDragTooltip();
      if (this._sceneDragRegenRaf != null) {
        const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
        cancel(this._sceneDragRegenRaf);
        this._sceneDragRegenRaf = null;
      }
      this._sceneDragRegenLayerId = null;
      if (!drag) return;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (layer && drag.moved) {
        this.engine.generate(layer.id);
        this.app?.ui?.buildControls?.();
        this.app?.ui?.updateFormula?.();
      }
      this.updateCursor();
    }

    // Escape mid light/shadow drag: restore the captured azimuth/elevation and
    // pop the one gesture history snapshot (mirrors _cancelSceneGroundDrag).
    _cancelSceneLightDrag() {
      const drag = this._sceneLightDrag;
      if (!drag) return false;
      this._sceneLightDrag = null;
      this.hideDragTooltip();
      if (this._sceneDragRegenRaf != null) {
        const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
        cancel(this._sceneDragRegenRaf);
        this._sceneDragRegenRaf = null;
      }
      this._sceneDragRegenLayerId = null;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (layer) {
        this._writeSceneLight(layer, drag.startLight);
        if (drag.moved) {
          if (this.app && Array.isArray(this.app.history) && this.app.history.length > 1) {
            this.app.history.pop();
          }
          this.engine.generate(layer.id);
        }
      }
      this.draw();
      this.updateCursor();
      return true;
    }

    // ─── Multi-light 3-axis TRANSLATE gizmo (Unit 1b) ────────────────────────
    // The panel selects a light as sel.objectId='light:<id>' and mirrors it to
    // the renderer via setSelectedSceneLight → layer._selectedLightId. The gizmo
    // shows for that selected light only (the legacy 2D sun disc stays as the
    // quick affordance when no light is explicitly selected). Point/spot lights
    // translate their world `position`; the directional sun re-derives az/el from
    // the moved handle. Reuses the object gizmo's world-axis-constrained
    // ground-drag math and visual language.
    setSelectedSceneLight(layerId, lightId) {
      const layer = this.engine && this.engine.layers
        ? this.engine.layers.find((l) => l.id === layerId) : null;
      if (!layer) return;
      layer._selectedLightId = lightId || null;
      this.draw();
    }

    _lightById(layer, id) {
      const lights = layer && layer.params && Array.isArray(layer.params.lights) ? layer.params.lights : [];
      return lights.find((l) => l && l.id === id) || null;
    }

    // The explicitly-selected light for `layer` (null unless the panel mirrored a
    // selection here). Never falls back to lights[0] — a null keeps the gizmo off
    // and the legacy sun disc live.
    _selectedSceneLight(layer) {
      // Scene-tree Increment E — an armed light CHILD's params ARE the selected
      // light (its params carry one lights[] entry).
      const child = this._armedLightChild(layer);
      if (child) return child.params;
      const id = layer && layer._selectedLightId;
      if (!id) return null;
      return this._lightById(layer, id);
    }

    // Project a WORLD point → document (renderer world) coords through the same
    // camera the scene mesh uses, so the gizmo sits exactly where a positional
    // light renders. Delegates to Scene3D.Scene.projectWorldPoint — the SINGLE
    // shared projection (buildProjOpts) that assembleScene also uses, so the
    // overlay and the mesh cannot drift. (Was a hand-copied re-implementation.)
    _sceneProjectWorld(layer, world) {
      const Scene = window.Vectura && window.Vectura.Scene3D && window.Vectura.Scene3D.Scene;
      if (!Scene || typeof Scene.projectWorldPoint !== 'function') return null;
      const cam = (layer && layer.params && layer.params.camera) || {};
      let bounds = {};
      try { if (this.engine && this.engine.getBounds) bounds = this.engine.getBounds() || {}; } catch (_e) { bounds = {}; }
      return Scene.projectWorldPoint(world, cam, bounds);
    }

    // Gizmo geometry (doc coords) for the selected light, or null. Point/spot are
    // anchored at their projected world position (+ a cone-axis line for spot);
    // the directional sun sits at its projected handle. Axes are world X/Y/Z
    // rotated through the camera (orientation-only, matching the object gizmo).
    getSceneLightGizmo(layer) {
      const target = layer || this._sceneLightLayer();
      if (!target || target.type !== 'scene3d') return null;
      const light = this._selectedSceneLight(target);
      if (!light) return null;
      const cam = (target.params && target.params.camera) || {};
      const unit = 1 / Math.max(this.scale || 1, 0.001);
      const R = 60 * unit;
      const project = (w) => { const r = this._rotateCam(w, cam); return { x: r.x, y: -r.y, z: r.z }; };
      let center = null;
      let coneTip = null;
      let baseR = null;
      let anchorCenter = null;
      if (light.type === 'point' || light.type === 'spot' || light.type === 'area') {
        center = this._sceneProjectWorld(target, light.position || { x: 120, y: 200, z: 120 });
        if (!center) return null;
        if (light.type === 'spot') coneTip = this._sceneProjectWorld(target, light.target || { x: 0, y: 0, z: 0 });
      } else if (light.type === 'directional') {
        const anchor = this._sceneLightAnchor(target);
        if (!anchor) return null;
        baseR = Math.max(anchor.radius * 1.5, 60 * unit);
        anchorCenter = { ...anchor.center };
        const off = this._lightHandleOffset(target, light, baseR);
        center = { x: anchor.center.x + off.dx, y: anchor.center.y + off.dy };
      } else {
        return null; // ambient — nothing to translate
      }
      const AX = [
        { key: 'x', world: { x: 1, y: 0, z: 0 } },
        { key: 'y', world: { x: 0, y: 1, z: 0 } },
        { key: 'z', world: { x: 0, y: 0, z: 1 } },
      ];
      const axes = AX.map((ax) => {
        const p = project(ax.world);
        const len = Math.hypot(p.x, p.y) || 1e-6;
        const u = { x: p.x / len, y: p.y / len };
        return { key: ax.key, dir: u, depth: p.z, tip: { x: center.x + u.x * R, y: center.y + u.y * R } };
      });
      // Restore dot: a small handle offset up-right of the gizmo (checked after
      // the axes, so an overlapping axis still wins the drag).
      const restore = { x: center.x + R * 1.28, y: center.y - R * 1.28 };
      return { lightId: light.id, lightType: light.type, center, coneTip, R, unit, axes, restore, baseR, anchorCenter };
    }

    hitSceneLightGizmo(sx, sy, layer) {
      const giz = this.getSceneLightGizmo(layer);
      if (!giz) return null;
      const world = this.screenToWorld(sx, sy);
      const tol = 9 * giz.unit;
      const near = (a) => Boolean(a) && Math.hypot(world.x - a.x, world.y - a.y) <= tol;
      for (const ax of giz.axes) {
        if (near(ax.tip)) return { type: 'move', axis: ax.key };
        if (this._gizmoSegDist(world, giz.center, ax.tip) <= tol * 0.8) return { type: 'move', axis: ax.key };
      }
      if (near(giz.restore)) return { type: 'restore' };
      return null;
    }

    beginSceneLightGizmoDrag(hit, e = {}) {
      const layer = this._sceneLightLayer();
      if (!layer || !hit) return false;
      const light = this._selectedSceneLight(layer);
      if (!light) return false;
      if (hit.type === 'restore') { this.restoreSceneLight(layer, light.id); return true; }
      const giz = this.getSceneLightGizmo(layer);
      if (!giz) return false;
      const cam = (layer.params && layer.params.camera) || {};
      const rect = this.canvas.getBoundingClientRect();
      const world = this.screenToWorld((e.clientX ?? 0) - rect.left, (e.clientY ?? 0) - rect.top);
      let startToward = null;
      if (light.type === 'directional') {
        const d = this._lightWorldDir(light); // travel
        const R = giz.baseR || (60 / (this.scale || 1));
        startToward = { x: -d.x * R, y: -d.y * R, z: -d.z * R }; // toward-sun × radius
      }
      this._sceneLightGizmoDrag = {
        layerId: layer.id,
        lightId: light.id,
        lightType: light.type,
        axis: hit.axis,
        startWorld: { x: world.x, y: world.y },
        camYaw: ((cam.yaw) || 0) * Math.PI / 180,
        startPos: light.position ? { ...light.position } : null,
        startToward,
        startLight: { azimuth: light.azimuth, elevation: light.elevation },
        historyPushed: false,
        moved: false,
      };
      this.setCanvasCursor('move');
      return true;
    }

    _applySceneLightGizmoDrag(e = {}) {
      const drag = this._sceneLightGizmoDrag;
      if (!drag) return false;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (!layer || !layer.params) { this._sceneLightGizmoDrag = null; return false; }
      // Scene-tree Increment E — resolve the armed light CHILD's params when a
      // light child is selected, else the inline group light by id.
      const light = this._gizmoLight(layer, drag.lightId);
      if (!light) { this._sceneLightGizmoDrag = null; return false; }
      const rect = this.canvas.getBoundingClientRect();
      const world = this.screenToWorld((e.clientX ?? 0) - rect.left, (e.clientY ?? 0) - rect.top);
      const dx = world.x - drag.startWorld.x;
      const dy = world.y - drag.startWorld.y;
      if (!drag.moved && Math.hypot(dx, dy) < 1 / (this.scale || 1)) return true;
      if (!drag.historyPushed) { this._scenePushHistory(); drag.historyPushed = true; }
      drag.moved = true;
      // Screen doc-delta → world delta along the chosen axis (object-gizmo math).
      const cy = Math.cos(drag.camYaw); const sy = Math.sin(drag.camYaw);
      let dWorld;
      if (drag.axis === 'x') dWorld = dx * cy + dy * sy;
      else if (drag.axis === 'z') dWorld = -dx * sy + dy * cy;
      else dWorld = -dy; // screen up = world +y
      let tip = '';
      if (drag.lightType === 'point' || drag.lightType === 'spot' || drag.lightType === 'area') {
        if (!light.position) light.position = { x: 120, y: 200, z: 120 };
        const base = drag.startPos || light.position;
        light.position[drag.axis] = Math.round((base[drag.axis] + dWorld) * 100) / 100;
        const p = light.position;
        tip = `X ${Math.round(p.x)}  Y ${Math.round(p.y)}  Z ${Math.round(p.z)}`;
      } else if (drag.lightType === 'directional' && drag.startToward) {
        const t = { ...drag.startToward };
        t[drag.axis] += dWorld;
        const len = Math.hypot(t.x, t.y, t.z) || 1;
        let az = Math.atan2(t.x, t.z) * 180 / Math.PI;
        if (az < 0) az += 360;
        const el = clamp(Math.asin(clamp(t.y / len, -1, 1)) * 180 / Math.PI, 0, 90);
        light.azimuth = Math.round(az * 10) / 10;
        light.elevation = Math.round(el * 10) / 10;
        tip = `Az ${Math.round(light.azimuth)}°  El ${Math.round(light.elevation)}°`;
      }
      this._scheduleSceneDragRegen(layer.id);
      this.showDragTooltip(tip, e.clientX ?? 0, e.clientY ?? 0);
      return true;
    }

    _endSceneLightGizmoDrag() {
      const drag = this._sceneLightGizmoDrag;
      this._sceneLightGizmoDrag = null;
      this.hideDragTooltip();
      if (this._sceneDragRegenRaf != null) {
        const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
        cancel(this._sceneDragRegenRaf);
        this._sceneDragRegenRaf = null;
      }
      this._sceneDragRegenLayerId = null;
      if (!drag) return;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (layer && drag.moved) {
        this.engine.generate(layer.id);
        // Rebuild the ARMED light child's focused panel (or the group's) so the
        // panel sliders reflect the canvas drag.
        this.app?.ui?.buildControls?.(this._lightPanelLayer(layer));
        this.app?.ui?.updateFormula?.();
      }
      this.updateCursor();
    }

    _cancelSceneLightGizmoDrag() {
      const drag = this._sceneLightGizmoDrag;
      if (!drag) return false;
      this._sceneLightGizmoDrag = null;
      this.hideDragTooltip();
      if (this._sceneDragRegenRaf != null) {
        const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
        cancel(this._sceneDragRegenRaf);
        this._sceneDragRegenRaf = null;
      }
      this._sceneDragRegenLayerId = null;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      const light = layer && this._gizmoLight(layer, drag.lightId);
      if (light) {
        if (drag.startPos && light.position) Object.assign(light.position, drag.startPos);
        if (drag.startLight) {
          if (Number.isFinite(drag.startLight.azimuth)) light.azimuth = drag.startLight.azimuth;
          if (Number.isFinite(drag.startLight.elevation)) light.elevation = drag.startLight.elevation;
        }
      }
      if (drag.moved && this.app && Array.isArray(this.app.history) && this.app.history.length > 1) this.app.history.pop();
      if (layer) this.engine.generate(layer.id);
      this.updateCursor();
      this.draw();
      return true;
    }

    // Restore the selected light to its factory default (sun → az135/el45;
    // point/spot → position {120,200,120}, range 400, spot target/cone/penumbra).
    // Used by the on-canvas restore handle AND the panel "Reset light" button.
    restoreSceneLight(layer, lightId) {
      const target = layer || this._sceneLightLayer();
      if (!target) return false;
      const light = (lightId && this._lightById(target, lightId)) || this._selectedSceneLight(target);
      if (!light) return false;
      this._scenePushHistory();
      if (light.type === 'directional') {
        light.azimuth = 135;
        light.elevation = 45;
      } else if (light.type === 'point' || light.type === 'spot' || light.type === 'area') {
        light.position = { x: 120, y: 200, z: 120 };
        if (light.type === 'area') {
          light.size = 120;
          light.samples = 6;
        } else {
          light.range = 400;
          if (light.type === 'spot') {
            light.target = { x: 0, y: 0, z: 0 };
            light.coneAngle = 30;
            light.penumbra = 8;
          }
        }
      } else {
        return false;
      }
      this.engine.generate(target.id);
      this.app?.ui?.buildControls?.(this._lightPanelLayer(target));
      this.app?.ui?.updateFormula?.();
      this.draw();
      return true;
    }

    // Draws the selected light's 3-axis translate gizmo (+ spot cone-axis line
    // and a restore handle). No-op unless a light is selected.
    drawSceneLightGizmo() {
      const giz = this.getSceneLightGizmo();
      if (!giz) return;
      const ctx = this.ctx;
      const unit = giz.unit;
      const colors = {
        x: getThemeToken('--render-gizmo-x', '#fbbf24'),
        y: getThemeToken('--render-gizmo-y', '#a78bfa'),
        z: getThemeToken('--render-gizmo-z', '#22d3ee'),
      };
      const stroke = getThemeToken('--render-selection-handle-stroke', '#f8fafc');
      const fillBg = getThemeToken('--render-selection-handle-fill', '#111827');
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Spot cone axis: a thin dashed line from position toward target.
      if (giz.coneTip) {
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = colors.x;
        ctx.lineWidth = 1.2 * unit;
        ctx.setLineDash([4 * unit, 3 * unit]);
        ctx.beginPath();
        ctx.moveTo(giz.center.x, giz.center.y);
        ctx.lineTo(giz.coneTip.x, giz.coneTip.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      [...giz.axes].sort((a, b) => a.depth - b.depth).forEach((ax) => {
        const col = colors[ax.key];
        const dim = ax.depth < -0.2 ? 0.4 : 0.95;
        ctx.globalAlpha = dim;
        ctx.strokeStyle = col;
        ctx.lineWidth = 2 * unit;
        ctx.beginPath();
        ctx.moveTo(giz.center.x, giz.center.y);
        ctx.lineTo(ax.tip.x, ax.tip.y);
        ctx.stroke();
        const a = Math.atan2(ax.tip.y - giz.center.y, ax.tip.x - giz.center.x);
        const ah = 6 * unit;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(ax.tip.x, ax.tip.y);
        ctx.lineTo(ax.tip.x - Math.cos(a - 0.42) * ah, ax.tip.y - Math.sin(a - 0.42) * ah);
        ctx.lineTo(ax.tip.x - Math.cos(a + 0.42) * ah, ax.tip.y - Math.sin(a + 0.42) * ah);
        ctx.closePath();
        ctx.fill();
      });
      // Center pivot.
      ctx.globalAlpha = 1;
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(giz.center.x, giz.center.y, 2.6 * unit, 0, TAU);
      ctx.fill();
      // Restore handle: a small ringed dot with a curved arrow feel (a plain
      // circle keeps it cheap; the tooltip/cursor explains it).
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = fillBg;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.3 * unit;
      ctx.beginPath();
      ctx.arc(giz.restore.x, giz.restore.y, 4 * unit, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.1 * unit;
      ctx.beginPath();
      ctx.arc(giz.restore.x, giz.restore.y, 2 * unit, Math.PI * 0.25, Math.PI * 1.75);
      ctx.stroke();
      ctx.restore();
    }

    // ——— scene object verbs (context bar / context menu / shortcuts) ————

    _scenePushHistory() {
      if (this.app?.pushHistory) this.app.pushHistory();
      else if (this.onCommitTransform) this.onCommitTransform();
    }

    _sceneRegen(layer) {
      this.engine.generate(layer.id);
      if (this.app?.render) this.app.render();
      else this.draw();
    }

    _sceneNextObjectId(layer) {
      let max = 0;
      this._sceneObjects(layer).forEach((o) => {
        const m = o && typeof o.id === 'string' ? o.id.match(/^obj-(\d+)$/) : null;
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      return `obj-${max + 1}`;
    }

    // Drop-to-ground v1 (documented simplification): CONTRACT A defines the
    // ground plane at y = 0 with objects resting on it at transform.y = 0.
    // Computing the true world min-y needs the mesh (1A-owned), so v1 sets
    // transform.y = 0 directly.
    dropSceneObjectsToGround(layerId, objectIds) {
      const layer = this.engine.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'scene3d') return false;
      // Scene-tree — resolve each target through _sceneObjectById so the drop
      // reaches a CHILD object3d layer's transform (params live at child.params);
      // a monolith returns its inline object. Mutating the view writes through.
      const targets = (objectIds || [])
        .map((id) => this._sceneObjectById(layer, id))
        .filter(Boolean);
      if (!targets.length) return false;
      this._scenePushHistory();
      targets.forEach((o) => {
        (o.transform || (o.transform = {})).y = 0;
      });
      this._sceneRegen(layer);
      return true;
    }

    // Keyboard 'D' path: drop whatever the scene selection resolves to (object
    // mode directly; face/edge modes drop the owning objects).
    dropSceneSelectionToGround() {
      const sel = this.sceneSelection;
      if (!sel) return false;
      const ids = sel.mode === 'object'
        ? sel.objectIds
        : [...new Set([...sel.faceKeys, ...sel.edgeKeys].map((k) => String(k).split('/')[0]))];
      return this.dropSceneObjectsToGround(sel.layerId, ids);
    }

    duplicateSceneObjects(layerId, objectIds) {
      const layer = this.engine.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'scene3d') return [];
      // Scene-tree — a scene GROUP's objects are CHILD object3d layers, so a
      // duplicate must clone the child LAYER (new id, same scene-group parent)
      // via the engine — NOT push onto params.objects, which would corrupt the
      // tree. The clone's own transform is nudged so it sits beside the source.
      if (layer.isGroup) {
        const sources = (objectIds || [])
          .map((id) => this._sceneChildLayerFor(layer, id))
          .filter(Boolean);
        if (!sources.length) return [];
        this._scenePushHistory();
        const newIds = [];
        sources.forEach((src) => {
          const clone = this.engine.duplicateLayer(src.id);
          if (!clone) return;
          if (clone.type === 'booleanGroup3d') {
            // A booleanGroup3d has NO positional transform of its own — the
            // compositor emits only {id,name,op,children} for it, so nudging the
            // group's params.transform is ignored and the copy stacks exactly on
            // the original. Its position lives entirely on its OPERAND object3d
            // children (deep-cloned with new ids under the clone by
            // duplicateLayer), so offset THOSE instead.
            const operands = (this.engine.getLayerChildren
              ? this.engine.getLayerChildren(clone.id)
              : []).filter((c) => c && c.type === 'object3d' && c.params);
            if (!operands.length) return;
            operands.forEach((op) => {
              const ot = op.params.transform || (op.params.transform = {});
              ot.x = (Number(ot.x) || 0) + 10;
              ot.z = (Number(ot.z) || 0) + 10;
            });
            newIds.push(clone.id);
            return;
          }
          if (!clone.params) return;
          const t = clone.params.transform || (clone.params.transform = {});
          t.x = (Number(t.x) || 0) + 10;
          t.z = (Number(t.z) || 0) + 10;
          newIds.push(clone.id);
        });
        if (!newIds.length) return [];
        this.setSceneSelection({ layerId: layer.id, mode: 'object', objectIds: newIds, faceKeys: [], edgeKeys: [] });
        this._sceneRegen(layer);
        return newIds;
      }
      const objects = this._sceneObjects(layer);
      const sources = objects.filter((o) => o && (objectIds || []).includes(o.id));
      if (!sources.length) return [];
      this._scenePushHistory();
      const deepClone = window.Vectura?.Utils?.clone || ((v) => JSON.parse(JSON.stringify(v)));
      const newIds = [];
      sources.forEach((src) => {
        const copy = deepClone(src);
        copy.id = this._sceneNextObjectId(layer);
        copy.name = `${src.name || src.id} copy`;
        // Nudge the copy so it is visible beside the original.
        copy.transform = copy.transform || {};
        copy.transform.x = (Number(copy.transform.x) || 0) + 10;
        copy.transform.z = (Number(copy.transform.z) || 0) + 10;
        objects.push(copy);
        newIds.push(copy.id);
      });
      this.setSceneSelection({ layerId: layer.id, mode: 'object', objectIds: newIds, faceKeys: [], edgeKeys: [] });
      this._sceneRegen(layer);
      return newIds;
    }

    // Prune style entries owned by the removed objects (CONTRACT C shape).
    _pruneSceneStyleEntries(layer, ids) {
      const table = layer && layer.params && layer.params.styleTable;
      if (!table || typeof table !== 'object') return;
      ids.forEach((id) => {
        if (table.byObject && table.byObject[id]) delete table.byObject[id];
        if (table.byFace) {
          Object.keys(table.byFace).forEach((key) => {
            if (key.startsWith(`${id}/`)) delete table.byFace[key];
          });
        }
      });
    }

    deleteSceneObjects(layerId, objectIds) {
      const layer = this.engine.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'scene3d') return false;
      const ids = new Set(objectIds || []);
      if (!ids.size) return false;
      // Scene-tree — a scene GROUP's objects are CHILD LAYERS, so delete removes
      // the child object3d/booleanGroup3d LAYER(s) via the engine (which prunes
      // descendants). Reassigning params.objects would corrupt the tree.
      if (layer.isGroup) {
        const childLayers = [...ids]
          .map((id) => this._sceneChildLayerFor(layer, id))
          .filter(Boolean);
        if (!childLayers.length) return false;
        this._scenePushHistory();
        this._pruneSceneStyleEntries(layer, ids);
        childLayers.forEach((cl) => this.engine.removeLayer(cl.id));
        this.setSceneSelection(null);
        // removeLayer folds the group away if the deleted object was its last
        // child — only regen when the group survives; otherwise just repaint.
        if (this.engine.getLayerById(layer.id)) this._sceneRegen(layer);
        else if (this.app?.render) this.app.render();
        else this.draw();
        return true;
      }
      const objects = this._sceneObjects(layer);
      if (!objects.some((o) => o && ids.has(o.id))) return false;
      this._scenePushHistory();
      layer.params.objects = objects.filter((o) => !o || !ids.has(o.id));
      this._pruneSceneStyleEntries(layer, ids);
      this.setSceneSelection(null);
      this._sceneRegen(layer);
      return true;
    }

    // I10: keyboard Delete/Backspace routed through the renderer's capture-phase
    // listener when a scene-internal selection is active. Object mode removes the
    // selected object(s) (reusing deleteSceneObjects); face/edge mode clears just
    // those components (the layer + object stay). Returns true when it consumed
    // the selection — the caller then stops the event so the global layer-delete
    // shortcut never fires. Returns false with no scene selection, letting the
    // normal layer delete proceed.
    deleteSceneSelection() {
      const sel = this.getSceneSelection && this.getSceneSelection();
      if (!sel || !sel.layerId) return false;
      const layer = this.engine.layers.find((l) => l.id === sel.layerId);
      if (!layer || layer.type !== 'scene3d') return false;
      if (sel.mode === 'object') {
        const ids = Array.isArray(sel.objectIds) ? sel.objectIds.slice() : [];
        if (!ids.length) return false;
        return this.deleteSceneObjects(sel.layerId, ids);
      }
      // face / edge selection → clear just those components; object + layer stay.
      const listKey = sel.mode === 'edge' ? 'edgeKeys' : 'faceKeys';
      const keys = Array.isArray(sel[listKey]) ? sel[listKey] : [];
      if (!keys.length) return false;
      this.setSceneSelection(null);
      if (this.app && this.app.render) this.app.render(); else this.draw();
      return true;
    }

    // visibility: 'solid' | 'xray' | undefined (toggle).
    setSceneObjectVisibility(layerId, objectIds, visibility) {
      const layer = this.engine.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'scene3d') return false;
      // Scene-tree — resolve each target through _sceneObjectById so the toggle
      // writes child.params.visibility on a CHILD object3d layer (a monolith
      // returns its inline object). Mutating the view writes straight through.
      const targets = (objectIds || [])
        .map((id) => this._sceneObjectById(layer, id))
        .filter(Boolean);
      if (!targets.length) return false;
      this._scenePushHistory();
      targets.forEach((o) => {
        o.visibility = visibility || (o.visibility === 'xray' ? 'solid' : 'xray');
      });
      this._sceneRegen(layer);
      return true;
    }

    // I22 — swap the primitive of each selected object (box → sphere → …). The
    // geometry bag is REBUILT through the shared creation contract
    // (Scene3D.Params.buildPrimitiveParams: PRIMITIVE_CREATE_DEFAULTS + a
    // size-preserving rescale + an importedMesh carry-over), never copied
    // wholesale from PRIMITIVE_PARAM_DEFAULTS — that DESERIALIZATION table has
    // no mesh payload, so the old code irreversibly destroyed an imported mesh
    // and made a ctxbar swap disagree with a panel swap.
    //
    // A TREE CHILD delegates straight to engine.setObjectPrimitive (the panel's
    // own path) so both surfaces run one implementation; a legacy INLINE
    // monolith object — which has no layer to delegate to — is swapped in place
    // through the same buildPrimitiveParams contract.
    //
    // One history entry + regen, plus a 'vectura:scene-object-primitive' event
    // so the docked panel can re-render the new geometry's controls at once.
    // Rejects an unknown primitive name and a pure no-op (every target already
    // on that primitive) so no empty undo step is ever recorded.
    setSceneObjectPrimitive(layerId, objectIds, primitive) {
      const layer = this.engine.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'scene3d') return false;
      const P = window.Vectura?.Scene3D?.Params;
      const valid = P && Array.isArray(P.PRIMITIVES) ? P.PRIMITIVES : null;
      if (valid && valid.indexOf(primitive) === -1) return false;
      // Resolve each target the child-aware way, keeping _sceneObjectById's
      // precedence: a legacy inline record wins, else the CHILD object3d layer
      // whose LAYER id is the object id (identity contract).
      const inline = [];
      const children = [];
      (objectIds || []).forEach((id) => {
        const rec = this._sceneObjects(layer).find((o) => o && o.id === id);
        if (rec) { if (rec.primitive !== primitive) inline.push(rec); return; }
        const child = this._sceneChildLayerFor(layer, id);
        if (child && child.type === 'object3d' && child.params
          && child.params.primitive !== primitive) children.push(child);
      });
      if (!inline.length && !children.length) return false;
      this._scenePushHistory();
      inline.forEach((o) => {
        const next = (P && typeof P.buildPrimitiveParams === 'function')
          ? P.buildPrimitiveParams(primitive, o.primitive || 'box', o.params)
          : null;
        o.primitive = primitive;
        if (next) o.params = next;
      });
      // `recompute: false` — _sceneRegen below composes once for the whole swap.
      children.forEach((c) => this.engine.setObjectPrimitive(c.id, primitive, { recompute: false }));
      this._sceneRegen(layer);
      this._emitScenePrimitiveChange(
        layer,
        inline.map((o) => o.id).concat(children.map((c) => c.id)),
        primitive,
      );
      return true;
    }

    // Announce a primitive swap made from the canvas ctxbar. The docked object
    // panel rebuilds its geometry controls from this instead of waiting for its
    // pointerenter/focusin drift guard (which stays as the belt-and-braces
    // fallback for any surface that swaps without emitting).
    _emitScenePrimitiveChange(layer, objectIds, primitive) {
      try {
        window.dispatchEvent(new window.CustomEvent('vectura:scene-object-primitive', {
          detail: { layerId: layer.id, objectIds: (objectIds || []).slice(), primitive },
        }));
      } catch (_e) { /* noop — the swap already landed */ }
    }

    // ——— ctxbar scene-object flyout bridges (ask #8) —————————————————————
    // Thin read/write plumbing the persistent Style / Shadow / Highlight /
    // X-ray flyouts drive. Writes never call ContextBar.restoreState() (that
    // would tear an open flyout down): they mutate + regen only, and the scene
    // selection signature is unchanged so the rAF refresh leaves the flyout up.
    //
    // Gesture history (opts):
    //   opts.gesture:true  → one history push on the FIRST write of a drag, then
    //                        draft regen (opts.preview) on each subsequent write.
    //   (no gesture)       → a discrete change: push history + full regen, unless
    //                        it lands mid-gesture (a slider's onCommit), which
    //                        closes the gesture and does a full regen, no push.
    _sceneBeginWrite(opts) {
      const o = opts || {};
      if (o.gesture === true) {
        if (!this._sceneWriteGesture) { this._scenePushHistory(); this._sceneWriteGesture = true; }
      } else if (this._sceneWriteGesture) {
        this._sceneWriteGesture = false; // gesture commit — history already pushed
      } else {
        this._scenePushHistory();
      }
    }

    _sceneEndWrite(layer, opts) {
      const o = opts || {};
      if (o.gesture === true && o.preview === true) {
        this.engine.generate(layer.id, { preview: true });
        if (this.app?.render) this.app.render(); else this.draw();
      } else {
        this._sceneRegen(layer);
      }
    }

    _sceneStyleTable(layer) {
      if (!layer.params.styleTable || typeof layer.params.styleTable !== 'object') {
        layer.params.styleTable = { scene: { penId: null, mapper: 'none', params: {} }, byObject: {}, byFace: {} };
      }
      return layer.params.styleTable;
    }

    getSceneObjectRecord(layerId, objectId) {
      const layer = this.engine.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'scene3d') return null;
      return this._sceneObjectById(layer, objectId);
    }

    getSceneObjectResolvedStyle(layerId, objectId) {
      const layer = this.engine.layers.find((l) => l.id === layerId);
      const SC = window.Vectura?.Scene3D?.StyleCascade;
      if (!layer || layer.type !== 'scene3d' || !SC) return null;
      return SC.resolve(this._sceneStyleTable(layer), { objectId });
    }

    // Where an object's STYLE actually lives — the child-aware sibling of
    // _sceneStyleTable, mirroring _sceneObjectById / _allSceneObjectRecords.
    //
    // On a scene TREE the compositor's collect step (Scene3D.Params
    // .collectSceneParams) republishes `styleTable.byObject[id]` from the CHILD
    // layer's `params.style` on EVERY compose, so a write into the GROUP's table
    // is discarded before the scene ever renders — the ctxbar Style flyout was
    // dead while the object panel's Style tab (which writes the child) worked.
    // Returns the child object3d / booleanGroup3d LAYER for a tree object, or
    // null for a legacy INLINE monolith object, whose style stays in the group
    // table exactly as before (inline objects are collected from `gp.styleTable`
    // and are never overwritten, so that path must not change).
    _sceneStyleOwnerLayer(layer, objectId) {
      if (!layer || !objectId) return null;
      if (this._sceneObjects(layer).some((o) => o && o.id === objectId)) return null;
      const child = this._sceneChildLayerFor(layer, objectId);
      return (child && child.params) ? child : null;
    }

    // Whole-style write at object scope (CONTRACT C — no per-field merge across
    // scopes; the caller assembles the full style.params). `patch` keys replace
    // the resolved style's keys (penId / mapper / params), exactly like the
    // docked panel's commitStyle. `opts.clear` removes the byObject override.
    //
    // Scene-tree: the group's styleTable is NOT the source of truth for a child
    // object — the collect step re-derives it from `child.params.style` on every
    // compose (see _sceneStyleOwnerLayer). Each write therefore lands on the
    // CHILD LAYER as well as the group table: the child is what actually
    // renders, and the mirrored table entry keeps a pre-compose read
    // (getSceneObjectResolvedStyle, which the flyout rebuild uses) in sync. Both
    // hold the same value, so nothing stale can be resurrected. A legacy inline
    // monolith object has no owner layer and keeps the group-table-only path.
    setSceneObjectStyle(layerId, objectIds, patch, opts) {
      const layer = this.engine.layers.find((l) => l.id === layerId);
      const SC = window.Vectura?.Scene3D?.StyleCascade;
      if (!layer || layer.type !== 'scene3d' || !SC) return false;
      const ids = (objectIds || []).filter(Boolean);
      if (!ids.length) return false;
      const table = this._sceneStyleTable(layer);
      const o = opts || {};
      const plain = (s) => ({ penId: s.penId, mapper: s.mapper, params: { ...(s.params || {}) } });
      this._sceneBeginWrite(o);
      ids.forEach((id) => {
        const owner = this._sceneStyleOwnerLayer(layer, id);
        if (o.clear === true) {
          SC.clearStyle(table, 'object', id);
          // A tree child has no "override absent" state (its style is always
          // republished), so the on-screen meaning of clearing — fall through to
          // the SCENE style — is written onto the child explicitly.
          if (owner) owner.params.style = plain(SC.resolve(table, {}));
          return;
        }
        const cur = SC.resolve(table, { objectId: id });
        const style = { penId: cur.penId, mapper: cur.mapper, params: { ...(cur.params || {}) } };
        Object.keys(patch || {}).forEach((k) => { style[k] = patch[k]; });
        SC.setStyle(table, 'object', id, style);
        if (owner) owner.params.style = plain(style);
      });
      this._sceneEndWrite(layer, o);
      return true;
    }

    // Resolve the effective style for a single face key ('objectId/faceId').
    // byFace > byObject > scene, mirroring getSceneObjectResolvedStyle.
    getSceneFaceResolvedStyle(layerId, faceKey) {
      const layer = this.engine.layers.find((l) => l.id === layerId);
      const SC = window.Vectura?.Scene3D?.StyleCascade;
      if (!layer || layer.type !== 'scene3d' || !SC) return null;
      const key = String(faceKey);
      const slash = key.indexOf('/');
      const objectId = slash >= 0 ? key.slice(0, slash) : key;
      const faceId = slash >= 0 ? key.slice(slash + 1) : null;
      return SC.resolve(this._sceneStyleTable(layer), { objectId, faceId });
    }

    // Whole-style write at FACE scope (I20 — pen/style from the ctxbar must
    // target ONLY the selected faceKeys, writing styleTable.byFace, never the
    // layer pen or the scene-wide style). `faceKeys` are 'objectId/faceId'
    // strings. Shape/semantics mirror setSceneObjectStyle: `patch` keys replace
    // the resolved style's keys; `opts.clear` removes the byFace override.
    setSceneFaceStyle(layerId, faceKeys, patch, opts) {
      const layer = this.engine.layers.find((l) => l.id === layerId);
      const SC = window.Vectura?.Scene3D?.StyleCascade;
      if (!layer || layer.type !== 'scene3d' || !SC) return false;
      const keys = (faceKeys || []).filter(Boolean).map(String);
      if (!keys.length) return false;
      const table = this._sceneStyleTable(layer);
      const o = opts || {};
      this._sceneBeginWrite(o);
      keys.forEach((key) => {
        if (o.clear === true) { SC.clearStyle(table, 'face', key); return; }
        const slash = key.indexOf('/');
        const objectId = slash >= 0 ? key.slice(0, slash) : key;
        const faceId = slash >= 0 ? key.slice(slash + 1) : null;
        const cur = SC.resolve(table, { objectId, faceId });
        const style = { penId: cur.penId, mapper: cur.mapper, params: { ...(cur.params || {}) } };
        Object.keys(patch || {}).forEach((k) => { style[k] = patch[k]; });
        SC.setStyle(table, 'face', key, style);
      });
      this._sceneEndWrite(layer, o);
      return true;
    }

    // Set a dotted path on each selected object (visibility / shadow.enabled /
    // border.enabled|strength|penId). Intermediate objects are created.
    setSceneObjectField(layerId, objectIds, path, value, opts) {
      const layer = this.engine.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'scene3d') return false;
      // Scene-tree — resolve each target through _sceneObjectById so the flyout
      // writes the CHILD object3d layer's def (params.*); a monolith returns its
      // inline object. Intermediate objects on the dotted path are created.
      const targets = (objectIds || [])
        .map((id) => this._sceneObjectById(layer, id))
        .filter(Boolean);
      if (!targets.length) return false;
      const keys = String(path).split('.');
      this._sceneBeginWrite(opts);
      targets.forEach((o) => {
        let node = o;
        for (let i = 0; i < keys.length - 1; i++) {
          const k = keys[i];
          if (!node[k] || typeof node[k] !== 'object') node[k] = {};
          node = node[k];
        }
        node[keys[keys.length - 1]] = value;
      });
      this._sceneEndWrite(layer, opts);
      return true;
    }

    // Set a dotted path on the SCENE (layer.params) itself — the Shadow flyout's
    // scene-wide bag (`shadow.shadowDensity`, …) and the sun bearing
    // (`lights.0.azimuth`). Numeric array indices in the path are honored.
    setSceneParam(layerId, path, value, opts) {
      const layer = this.engine.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'scene3d' || !layer.params) return false;
      const keys = String(path).split('.');
      this._sceneBeginWrite(opts);
      let node = layer.params;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!node[k] || typeof node[k] !== 'object') node[k] = {};
        node = node[k];
      }
      node[keys[keys.length - 1]] = value;
      this._sceneEndWrite(layer, opts);
      return true;
    }

    // Appends a CONTRACT A object to params.objects (one history entry +
    // regen). New objects land at the origin (documented simplification —
    // mapping a click to a ground point needs the camera projection, which is
    // 1A-owned). Per-primitive params for sphere/cylinder are 1C's provisional
    // guesses; CONTRACT A only pins the box bag.
    addSceneObject(layerId, primitive = 'box') {
      const layer = this.engine.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'scene3d' || !layer.params) return null;
      const defs = {
        box: { name: 'Box', params: { sx: 40, sy: 40, sz: 40 } },
        sphere: { name: 'Sphere', params: { radius: 25, detail: 2 } },
        cylinder: { name: 'Cylinder', params: { radius: 20, height: 40, segments: 16 } },
      };
      const def = defs[primitive] || defs.box;
      const kind = defs[primitive] ? primitive : 'box';
      this._scenePushHistory();
      if (!Array.isArray(layer.params.objects)) layer.params.objects = [];
      const objects = layer.params.objects;
      const id = this._sceneNextObjectId(layer);
      const count = objects.filter((o) => o && o.primitive === kind).length + 1;
      const obj = {
        id,
        name: `${def.name} ${count}`,
        primitive: kind,
        params: { ...def.params },
        transform: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
        visibility: 'solid',
      };
      objects.push(obj);
      this.setSceneSelection({ layerId: layer.id, mode: 'object', objectIds: [id], faceKeys: [], edgeKeys: [] });
      this._sceneRegen(layer);
      return obj;
    }

    selectAllSceneFacesOfObject(layerId, objectId) {
      const layer = this.engine.layers.find((l) => l.id === layerId);
      if (!layer || layer.type !== 'scene3d') return false;
      const keys = [];
      this.getInteractionPaths(layer).forEach((path) => {
        const meta = path && path.meta;
        const target = meta && meta.sceneTarget;
        if (!target || meta.kind !== 'sceneFace' || target.objectId !== objectId) return;
        const key = this._sceneFaceKeyFor(target);
        if (!keys.includes(key)) keys.push(key);
      });
      if (!keys.length) return false;
      this.sceneComponentMode = 'face';
      this.setSceneSelection({ layerId: layer.id, mode: 'face', objectIds: [], faceKeys: keys, edgeKeys: [] });
      return true;
    }

    // ——— selection overlay ————————————————————————————————————————————

    // Highlight stroke over the selected scene targets: object mode strokes
    // every face/edge path of the selected objects; face/edge modes stroke
    // (and faintly fill, for faces) just the selected components.
    drawSceneSelectionOverlay() {
      const sel = this.sceneSelection;
      if (!sel) return;
      const layer = this.engine.layers.find((l) => l.id === sel.layerId);
      if (!layer || !layer.visible) return;
      const paths = this.getInteractionPaths(layer);
      if (!paths.length) return;
      const edgeOrdinals = this._sceneEdgeOrdinals(paths);
      const objSet = new Set(sel.objectIds);
      const faceSet = new Set(sel.faceKeys);
      const edgeSet = new Set(sel.edgeKeys);
      const color = SETTINGS.selectionOutlineColor || '#ef4444';
      const unit = 1 / Math.max(this.scale || 1, 0.001);
      const strokePaths = [];
      const fillPaths = [];
      paths.forEach((path) => {
        const meta = path && path.meta;
        const target = meta && meta.sceneTarget;
        if (!target || !Array.isArray(path) || path.length < 2) return;
        if (sel.mode === 'object') {
          if (meta.kind !== 'sceneFill' && objSet.has(target.objectId)) strokePaths.push(path);
          return;
        }
        if (meta.kind === 'sceneFace' && faceSet.has(this._sceneFaceKeyFor(target))) {
          strokePaths.push(path);
          fillPaths.push(path);
          return;
        }
        if (meta.kind === 'sceneEdge'
          && edgeSet.has(this._sceneEdgeKeyFor(target, edgeOrdinals.get(path) ?? 0))) {
          strokePaths.push(path);
        }
      });
      if (!strokePaths.length && !fillPaths.length) return;
      this.ctx.save();
      this.ctx.lineJoin = 'round';
      this.ctx.lineCap = 'round';
      if (fillPaths.length) {
        this.ctx.globalAlpha = 0.14;
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        fillPaths.forEach((path) => this.tracePath(path, false));
        this.ctx.fill();
        this.ctx.globalAlpha = 1;
      }
      if (strokePaths.length) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = Math.max(0.35, 1.4 * unit);
        this.ctx.beginPath();
        strokePaths.forEach((path) => this.tracePath(path, false));
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    // ——— hover silhouette hint (deliverable B) ——————————————————————————
    // Arm the hover hint on a plain mouse-move. Stores the canvas-local pointer
    // and defers the pick to rAF (cheap on rapid moves); the actual recompute +
    // redraw runs in _recomputeSceneHoverHint. Only the object/component tools
    // hint; other tools clear it.
    _updateSceneHoverHint(e) {
      if (!this.canvas) return;
      if (this.activeTool !== 'select' && this.activeTool !== 'direct') {
        this._clearSceneHoverHint();
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right
        && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inside) { this._clearSceneHoverHint(); return; }
      this._sceneHoverPointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (this._sceneHoverRaf) return;
      const schedule = (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
        ? window.requestAnimationFrame.bind(window)
        : (fn) => setTimeout(fn, 16);
      this._sceneHoverRaf = schedule(() => {
        this._sceneHoverRaf = null;
        this._recomputeSceneHoverHint();
      });
    }

    // Recompute the hovered pick from the stored pointer and redraw only when the
    // target changes. In face-entered mode the hint tracks the frontmost FACE.
    _recomputeSceneHoverHint() {
      const ptr = this._sceneHoverPointer;
      if (!ptr) return;
      const world = this.screenToWorld(ptr.x, ptr.y);
      const sel = this.sceneSelection;
      const mode = (sel && sel.mode === 'face')
        ? 'face'
        : (this.activeTool === 'direct' ? (this.sceneComponentMode || 'face') : 'object');
      const hit = this._sceneHitAtPoint(world, { mode });
      const next = hit
        ? { layerId: hit.layer.id, mode: hit.kind, objectId: hit.objectId, faceId: hit.faceId || null, key: hit.key }
        : null;
      const prev = this.sceneHoverPick;
      const changed = (!!prev !== !!next)
        || (prev && next && (prev.key !== next.key || prev.layerId !== next.layerId || prev.mode !== next.mode));
      if (!changed) return;
      this.sceneHoverPick = next;
      this.draw();
    }

    // Immediate synchronous flush of a pending hover recompute (tests / down()).
    _flushSceneHoverHint() {
      if (this._sceneHoverRaf && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(this._sceneHoverRaf);
      }
      this._sceneHoverRaf = null;
      this._recomputeSceneHoverHint();
    }

    _clearSceneHoverHint() {
      if (this._sceneHoverRaf && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(this._sceneHoverRaf);
      }
      this._sceneHoverRaf = null;
      this._sceneHoverPointer = null;
      if (this.sceneHoverPick) { this.sceneHoverPick = null; this.draw(); }
    }

    // Draw the hover hint: a subtle accent outline of the object/face a click
    // would select. Reuses the target's ALREADY-EMITTED world-space paths (never
    // a new path pushed to layer.paths), so it can never appear in SVG export or
    // expand-to-layers. A face with no emitted outline ('none'-mapper box) falls
    // back to its real projected face polygon (still overlay-only geometry).
    drawSceneHoverHint() {
      const hover = this.sceneHoverPick;
      if (!hover) return;
      const layer = this.engine.layers.find((l) => l.id === hover.layerId);
      if (!layer || !layer.visible) return;
      // Don't shadow an active selection of the same target — the selection
      // overlay already outlines it.
      const sel = this.sceneSelection;
      if (sel && sel.layerId === hover.layerId) {
        if (hover.mode === 'object' && Array.isArray(sel.objectIds) && sel.objectIds.includes(hover.objectId)) return;
        if (hover.mode === 'face' && Array.isArray(sel.faceKeys) && sel.faceKeys.includes(hover.key)) return;
      }
      const paths = this.getInteractionPaths(layer);
      const strokePaths = [];
      (paths || []).forEach((path) => {
        const meta = path && path.meta;
        const t = meta && meta.sceneTarget;
        if (!t || !Array.isArray(path) || path.length < 2) return;
        if (hover.mode === 'object') {
          if (meta.kind !== 'sceneFill' && t.objectId === hover.objectId) strokePaths.push(path);
        } else if (hover.mode === 'face') {
          if (meta.kind === 'sceneFace' && this._sceneFaceKeyFor(t) === hover.key) strokePaths.push(path);
        }
      });
      // Face-mode fallback: outline the real projected face polygon when no
      // sceneFace outline was emitted for it.
      if (hover.mode === 'face' && !strokePaths.length) {
        const pf = this._scenePickFaces(layer)
          .find((f) => this._sceneFaceKeyFor(f) === hover.key);
        if (pf && Array.isArray(pf.poly) && pf.poly.length >= 3) {
          const ring = pf.poly.map((p) => ({ x: p.x, y: p.y }));
          ring.push({ x: pf.poly[0].x, y: pf.poly[0].y });
          strokePaths.push(ring);
        }
      }
      if (!strokePaths.length) return;
      const color = getThemeToken('--render-selection-accent', '#2b6cff');
      const unit = 1 / Math.max(this.scale || 1, 0.001);
      this.ctx.save();
      this.ctx.lineJoin = 'round';
      this.ctx.lineCap = 'round';
      this.ctx.globalAlpha = 0.5;
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = Math.max(0.3, 1.1 * unit);
      this.ctx.beginPath();
      strokePaths.forEach((path) => this.tracePath(path, false));
      this.ctx.stroke();
      this.ctx.restore();
    }

    enterGroupEditMode(layer) {
      this.clearTouchHold();
      this.groupEditMode = { groupId: layer.parentId, activeLayerId: layer.id, kind: 'group' };
      this.setSelection([layer.id], layer.id);
      this.draw();
      this._emitIsolationChanged();
    }

    // Lane I (breadcrumb) listens for this so it can render event-driven instead
    // of polling groupEditMode on a rAF loop. Fires whenever isolation enters or
    // exits (group or morph). Guarded for non-DOM test contexts; no detail.
    _emitIsolationChanged() {
      if (typeof document === 'undefined' || typeof CustomEvent !== 'function') return;
      try { document.dispatchEvent(new CustomEvent('vectura:isolation-changed')); } catch (_e) { /* noop */ }
    }

    // Isolation for a MORPH modifier child. Unlike a plain group, the child's
    // own geometry is consumed (_morphConsumed) and the morph container is the
    // logical parent even when the leaf is nested under a sub-group, so the
    // isolation is keyed on the container id with kind 'morph'. Escape returns
    // to the container (see exitGroupEditMode), not to the consumed children.
    enterMorphEditMode(child, container) {
      this.clearTouchHold();
      this.groupEditMode = { groupId: container.id, activeLayerId: child.id, kind: 'morph' };
      this.setSelection([child.id], child.id);
      this.draw();
      this._emitIsolationChanged();
    }

    exitGroupEditMode() {
      if (!this.groupEditMode) return;
      const groupId = this.groupEditMode.groupId;
      const kind = this.groupEditMode.kind;
      this.groupEditMode = null;
      if (kind === 'morph') {
        // Re-select the morph container as a single object (its children are
        // consumed and would be invisible/non-selectable).
        const container = this.engine.layers.find((l) => l.id === groupId);
        if (container) this.setSelection([container.id], container.id);
        this.draw();
        this._emitIsolationChanged();
        return;
      }
      const siblings = this.engine.getLayerChildren(groupId) || [];
      const selectable = siblings.filter(l => l.visible && !this.isLayerLocked?.(l.id));
      if (selectable.length > 0) {
        this.setSelection(selectable.map(l => l.id), selectable[0].id);
      }
      this.draw();
      this._emitIsolationChanged();
    }

    // Shared point/paths hit-test mirroring the circle/segment distance loop in
    // findLayerAtPoint, but operating on an explicit `paths` array so it can run
    // over geometry that getInteractionPaths would suppress (a morph container's
    // morphedPaths, or a consumed child's effectivePaths). Returns the nearest
    // squared distance, or Infinity if nothing is within `tolSq`.
    _nearestPathDistSq(world, paths, tolSq) {
      let best = Infinity;
      (paths || []).forEach((path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const cx = path.meta.cx ?? path.meta.x ?? 0;
          const cy = path.meta.cy ?? path.meta.y ?? 0;
          const r = path.meta.r ?? path.meta.rx ?? 0;
          const dist = Math.abs(Math.hypot(world.x - cx, world.y - cy) - r);
          const dSq = dist * dist;
          if (dSq <= tolSq && dSq < best) best = dSq;
          return;
        }
        if (!Array.isArray(path) || path.length < 2) return;
        for (let i = 0; i < path.length - 1; i++) {
          const d = this.distanceToSegmentSq(world, path[i], path[i + 1]);
          if (d <= tolSq && d < best) best = d;
        }
      });
      return best;
    }

    // Hit-test the rendered output (morphedPaths) of an outermost morph modifier.
    // The container is skipped by findLayerAtPoint (isGroup && !compound), so a
    // click on the blend would otherwise select nothing. Returns the nearest
    // morph container under `world`, or null.
    findMorphContainerAtPoint(world) {
      const layers = this.engine.layers.slice().reverse();
      let best = null;
      let bestDist = Infinity;
      layers.forEach((layer) => {
        if (!layer || !layer.visible || !layer.isGroup) return;
        if (layer.modifier?.type !== 'morph') return;
        if (!Array.isArray(layer.morphedPaths) || !layer.morphedPaths.length) return;
        if (this.isLayerLocked?.(layer.id)) return;
        // Only the OUTERMOST morph is the click target (a nested morph's output
        // is consumed by its ancestor morph).
        if (this.engine.getAncestorModifiers?.(layer)?.some((m) => m.modifier?.type === 'morph')) return;
        const stroke = layer.strokeWidth ?? SETTINGS.strokeWidth ?? 0.3;
        const tol = Math.max(5 / (this.scale || 1), stroke * 2);
        const d = this._nearestPathDistSq(world, layer.morphedPaths, tol * tol);
        if (d < bestDist) {
          bestDist = d;
          best = layer;
        }
      });
      return best;
    }

    // Hit-test the SOURCE geometry of a morph container's leaf descendants so a
    // double-click can resolve which child to isolate. The children are consumed
    // (getInteractionPaths returns []), so read effectivePaths/paths directly.
    // Locked / invisible leaves (and leaves under a locked ancestor) are skipped.
    findMorphChildAtPoint(world, containerId) {
      const leaves = (this.engine.getLayerDescendants(containerId) || []).filter((l) => {
        if (!l || l.isGroup || l.visible === false) return false;
        if (this.isLayerLocked?.(l.id)) return false;
        if ((this.engine.getLayerAncestors?.(l) || []).some((a) => this.isLayerLocked?.(a.id))) return false;
        return true;
      });
      let best = null;
      let bestDist = Infinity;
      leaves.forEach((leaf) => {
        const src = (leaf.effectivePaths?.length ? leaf.effectivePaths : leaf.paths) || [];
        const stroke = leaf.strokeWidth ?? SETTINGS.strokeWidth ?? 0.3;
        const tol = Math.max(5 / (this.scale || 1), stroke * 2);
        const d = this._nearestPathDistSq(world, src, tol * tol);
        if (d < bestDist) {
          bestDist = d;
          best = leaf;
        }
      });
      return best;
    }

    // Resolve which morph-source child a press targets. findMorphChildAtPoint
    // only hits a child's sparse OUTLINE, so pressing/double-clicking a child's
    // filled INTERIOR (the natural way to grab a shape) misses it — which made
    // double-click never isolate, and an in-isolation body press exit isolation.
    // Fall back to a bounds hit over the container's leaves (preferring the
    // currently-active child on overlap) so the body of a child counts.
    _morphChildAtPointOrBounds(world, containerId, preferActiveId = null) {
      const outlineHit = this.findMorphChildAtPoint(world, containerId);
      if (outlineHit) return outlineHit;
      const leaves = (this.engine.getLayerDescendants(containerId) || [])
        .filter((l) => l && !l.isGroup && l.visible !== false);
      const hitByBounds = (l) => {
        if (!l || this.isLayerLocked?.(l.id)) return false;
        const b = this.getSelectionBounds([l]);
        return b && this.pointInBounds(world, b);
      };
      const active = preferActiveId ? leaves.find((l) => l.id === preferActiveId) : null;
      if (active && hitByBounds(active)) return active;
      return leaves.find(hitByBounds) || null;
    }

    // Resolve a morph child purely by BOUNDS across every OUTERMOST morph
    // container, so double-clicking the filled body of a child (off all lines —
    // findMorphContainerAtPoint and findMorphChildAtPoint are both outline-only)
    // still isolates it. Returns { child, container } or null.
    _morphChildByBounds(world) {
      const containers = this.engine.layers.filter((l) =>
        l && l.isGroup && l.visible && l.modifier?.type === 'morph'
        && Array.isArray(l.morphedPaths) && l.morphedPaths.length
        && !this.isLayerLocked?.(l.id)
        && !(this.engine.getAncestorModifiers?.(l) || []).some((m) => m.modifier?.type === 'morph'));
      for (let i = containers.length - 1; i >= 0; i -= 1) {
        const child = this._morphChildAtPointOrBounds(world, containers[i].id);
        if (child) return { child, container: containers[i] };
      }
      return null;
    }

    // Hit-test the ACTIVE isolated morph end's own (consumed) geometry so the
    // direct-select tool can engage it: findPathHitAtPoint reads
    // getInteractionPaths, which is empty for a _morphConsumed child. Returns a
    // findPathHitAtPoint-shaped result on the active child, or null. pathIndex is
    // forced to 0 (a morph end is a single source shape) so it maps to the
    // child's sourcePaths for setDirectSelection.
    _morphChildPathHit(world) {
      if (this.groupEditMode?.kind !== 'morph' || !world) return null;
      const child = this.engine.layers.find((l) => l.id === this.groupEditMode.activeLayerId);
      if (!child || child.isGroup) return null;
      if (this.isLayerLocked?.(child.id)) return null;
      const paths = (child.effectivePaths?.length ? child.effectivePaths : child.paths) || [];
      const stroke = child.strokeWidth ?? SETTINGS.strokeWidth ?? 0.3;
      const tol = Math.max(2.5 / (this.scale || 1), stroke * 2);
      const tolSq = tol * tol;
      let best = null;
      let bestDistSq = Infinity;
      paths.forEach((path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const cx = path.meta.cx ?? path.meta.x ?? 0;
          const cy = path.meta.cy ?? path.meta.y ?? 0;
          const r = path.meta.r ?? Math.max(path.meta.rx ?? 0, path.meta.ry ?? 0);
          const dist = Math.abs(Math.hypot(world.x - cx, world.y - cy) - r);
          const dSq = dist * dist;
          if (dSq <= tolSq && dSq < bestDistSq) {
            bestDistSq = dSq;
            best = { layer: child, pathIndex: 0, path, segmentIndex: 0, point: { x: world.x, y: world.y }, distSq: dSq };
          }
          return;
        }
        if (!Array.isArray(path) || path.length < 2) return;
        for (let i = 0; i < path.length - 1; i++) {
          const d = this.distanceToSegmentSq(world, path[i], path[i + 1]);
          if (d <= tolSq && d < bestDistSq) {
            bestDistSq = d;
            best = { layer: child, pathIndex: 0, path, segmentIndex: i, point: { x: world.x, y: world.y }, distSq: d };
          }
        }
      });
      return best;
    }

    // Axis-aligned (rotation 0) bounds object built from a raw paths array,
    // matching the shape returned by getSelectionBounds. Used for the morph
    // container (morphedPaths, already world-space) and consumed children.
    _boundsFromPaths(paths, temp) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      (paths || []).forEach((path) => {
        if (path?.meta?.kind === 'circle') {
          const meta = temp ? this.transformCircleMeta(path.meta, temp) : path.meta;
          const cx = meta.cx ?? meta.x;
          const cy = meta.cy ?? meta.y;
          const rx = meta.rx ?? meta.r;
          const ry = meta.ry ?? meta.r;
          if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
          minX = Math.min(minX, cx - rx); maxX = Math.max(maxX, cx + rx);
          minY = Math.min(minY, cy - ry); maxY = Math.max(maxY, cy + ry);
          return;
        }
        if (!Array.isArray(path)) return;
        path.forEach((pt) => {
          const next = temp ? this.transformPoint(pt, temp) : pt;
          minX = Math.min(minX, next.x); minY = Math.min(minY, next.y);
          maxX = Math.max(maxX, next.x); maxY = Math.max(maxY, next.y);
        });
      });
      if (!Number.isFinite(minX)) return null;
      const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      const localMinX = minX - center.x;
      const localMinY = minY - center.y;
      const localMaxX = maxX - center.x;
      const localMaxY = maxY - center.y;
      const toWorld = (local) => ({ x: center.x + local.x, y: center.y + local.y });
      return {
        minX: localMinX,
        minY: localMinY,
        maxX: localMaxX,
        maxY: localMaxY,
        rotation: 0,
        origin: center,
        center,
        corners: {
          nw: toWorld({ x: localMinX, y: localMinY }),
          ne: toWorld({ x: localMaxX, y: localMinY }),
          se: toWorld({ x: localMaxX, y: localMaxY }),
          sw: toWorld({ x: localMinX, y: localMaxY }),
        },
      };
    }

    _getMaskGroupLayers(layer) {
      if (!this.engine) return null;
      let maskRoot = null;
      const ancestorMasks = this.engine.getAncestorMaskLayers?.(layer);
      if (ancestorMasks && ancestorMasks.length > 0) {
        maskRoot = ancestorMasks[0];
      } else if (layer.mask?.enabled && layer.maskCapabilities?.canSource) {
        maskRoot = layer;
      }
      if (!maskRoot) return null;
      const descendants = this.engine.getLayerDescendants(maskRoot.id);
      if (!descendants || descendants.length === 0) return null;
      return [maskRoot, ...descendants].filter(l => !this.isLayerLocked?.(l.id));
    }

    distanceToSegmentSq(p, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx === 0 && dy === 0) {
        const px = p.x - a.x;
        const py = p.y - a.y;
        return px * px + py * py;
      }
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
      const clamped = Math.max(0, Math.min(1, t));
      const cx = a.x + clamped * dx;
      const cy = a.y + clamped * dy;
      const ox = p.x - cx;
      const oy = p.y - cy;
      return ox * ox + oy * oy;
    }

    distanceToPointSq(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return dx * dx + dy * dy;
    }

    // --- Wallpaper handle math (pure; extracted for unit testing) ---
    // Map a dragged world point to the wallpaper mirror's centerX/centerY.
    // The guide build computes origin = canvasCenter + {centerX, centerY}, so we invert
    // that here: centerX = world.x - canvasCenter.x. Snap to the canvas center when the
    // pointer is within `snapDist` of it, or when `shift` is held.
    wallpaperCenterFromWorld(world, canvasCenter, { shift = false, snapDist = 8 } = {}) {
      let centerX = world.x - canvasCenter.x;
      let centerY = world.y - canvasCenter.y;
      const tol = shift ? Infinity : snapDist;
      if (Math.abs(centerX) <= tol && Math.abs(centerY) <= tol) {
        if (shift || Math.hypot(centerX, centerY) <= snapDist) {
          centerX = 0;
          centerY = 0;
        }
      }
      return { centerX, centerY };
    }

    // Map a dragged world point to the wallpaper mirror's global rotation (0–360 degrees):
    // the angle from the symmetry origin to the pointer. Shift snaps to 15° increments
    // (matching the lattice/dial snap convention).
    wallpaperRotationFromWorld(world, origin, { shift = false } = {}) {
      let deg = Math.atan2(world.y - origin.y, world.x - origin.x) * 180 / Math.PI;
      if (shift) deg = Math.round(deg / 15) * 15;
      deg = ((deg % 360) + 360) % 360;
      return deg;
    }

    pointInTriangle(p, a, b, c) {
      const area = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
      const d1 = area(p, a, b);
      const d2 = area(p, b, c);
      const d3 = area(p, c, a);
      const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
      const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
      return !(hasNeg && hasPos);
    }

    findLayerAtPointPrecise(world) {
      const layers = this.engine.layers.slice().reverse();
      let best = null;
      let bestDist = Infinity;
      layers.forEach((layer) => {
        if (!layer.visible) return;
        const isCompound = layer.containerRole === 'compound';
        if (!isCompound && layer.isGroup) return;
        if (layer.mask?.enabled && layer.mask?.hideLayer) return;
        if (this.engine.hasCompoundAncestor?.(layer)) return;
        if (this.isLayerLocked?.(layer.id)) return;
        const stroke = layer.strokeWidth ?? SETTINGS.strokeWidth ?? 0.3;
        const tol = Math.max(1.5, stroke * 2);
        const tolSq = tol * tol;
        this.getInteractionPaths(layer).forEach((path) => {
          if (path && path.meta && path.meta.kind === 'circle') {
            const cx = path.meta.cx ?? path.meta.x ?? 0;
            const cy = path.meta.cy ?? path.meta.y ?? 0;
            const r = path.meta.r ?? path.meta.rx ?? 0;
            const dist = Math.abs(Math.hypot(world.x - cx, world.y - cy) - r);
            if (dist * dist <= tolSq && dist < bestDist) {
              bestDist = dist;
              best = layer;
            }
            return;
          }
          if (!Array.isArray(path) || path.length < 2) return;
          for (let i = 0; i < path.length - 1; i++) {
            const d = this.distanceToSegmentSq(world, path[i], path[i + 1]);
            if (d <= tolSq && d < bestDist) {
              bestDist = d;
              best = layer;
              break;
            }
          }
        });
      });
      return best;
    }

    getSelectionBounds(layers, temp) {
      if (!layers || layers.length === 0) return null;
      if (layers.length === 1) {
        return this.getLayerBounds(layers[0], temp);
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      layers.forEach((layer) => {
        const primBounds = this.getPrimitiveShapeBounds(layer, temp);
        if (primBounds) {
          Object.values(primBounds.corners).forEach((pt) => {
            minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
          });
          return;
        }
        // A morph container in a multi-selection is not consumed and exposes no
        // own paths; bound its blend so the union box includes it.
        const basePaths = layer?._morphConsumed
          ? ((layer.effectivePaths?.length ? layer.effectivePaths : layer.paths) || [])
          : (layer?.isGroup && layer.modifier?.type === 'morph' && Array.isArray(layer.morphedPaths))
            ? layer.morphedPaths
            : this.getInteractionPaths(layer);
        if (!Array.isArray(basePaths)) return;
        basePaths.forEach((path) => {
          if (path?.meta?.kind === 'circle') {
            const meta = temp ? this.transformCircleMeta(path.meta, temp) : path.meta;
            const cx = meta.cx ?? meta.x;
            const cy = meta.cy ?? meta.y;
            const rx = meta.rx ?? meta.r;
            const ry = meta.ry ?? meta.r;
            if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
            minX = Math.min(minX, cx - rx); maxX = Math.max(maxX, cx + rx);
            minY = Math.min(minY, cy - ry); maxY = Math.max(maxY, cy + ry);
            return;
          }
          if (!Array.isArray(path)) return;
          path.forEach((pt) => {
            const next = temp ? this.transformPoint(pt, temp) : pt;
            minX = Math.min(minX, next.x); minY = Math.min(minY, next.y);
            maxX = Math.max(maxX, next.x); maxY = Math.max(maxY, next.y);
          });
        });
      });
      if (!Number.isFinite(minX)) return null;
      const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      const localMinX = minX - center.x;
      const localMinY = minY - center.y;
      const localMaxX = maxX - center.x;
      const localMaxY = maxY - center.y;
      const toWorld = (local) => ({ x: center.x + local.x, y: center.y + local.y });
      return {
        minX: localMinX,
        minY: localMinY,
        maxX: localMaxX,
        maxY: localMaxY,
        rotation: 0,
        origin: center,
        center,
        corners: {
          nw: toWorld({ x: localMinX, y: localMinY }),
          ne: toWorld({ x: localMaxX, y: localMinY }),
          se: toWorld({ x: localMaxX, y: localMaxY }),
          sw: toWorld({ x: localMinX, y: localMaxY }),
        },
      };
    }

    // Phase-2 (Contextual Task Bar) read API: axis-aligned screen-space bbox
    // of the current selection (accounting for any live tempTransform), or
    // null when nothing is selected. Returned in CSS px relative to the canvas
    // top-left so a floating bar can anchor under/over the selection. Stable
    // shape: { minX, minY, maxX, maxY, width, height, centerX, centerY }.
    getSelectionScreenBounds() {
      const layers = this.getSelectedLayers();
      if (!layers.length) return null;
      const bounds = this.getSelectionBounds(layers, this.tempTransform);
      if (!bounds || !bounds.corners) return null;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      Object.values(bounds.corners).forEach((pt) => {
        const s = this.worldToScreen(pt.x, pt.y);
        minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
        maxX = Math.max(maxX, s.x); maxY = Math.max(maxY, s.y);
      });
      if (!Number.isFinite(minX)) return null;
      return {
        minX, minY, maxX, maxY,
        width: maxX - minX,
        height: maxY - minY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
      };
    }

    // ── Phase-3 Lane K (SEL-5 / SG-6): transform-panel read/write model ────
    // The transform panel (src/ui/panels/transform-panel.js) consumes these to
    // show true X/Y/W/H for manual (shape/text) layers, a link W/H scale, and a
    // single-anchor readout under the Direct-Selection tool. All coordinates are
    // WORLD (document-mm) space; the panel formats to document units for display.

    // Read model for the transform panel. Returns one of:
    //   { mode:'none' }
    //   { mode:'anchor', anchorX, anchorY, index }   — one anchor, Direct tool
    //   { mode:'object', manual, count, x, y, width, height, rotation }
    // where (x,y) is the top-left of the combined selection bounding box.
    getTransformPanelModel() {
      const anchor = this.getSelectedAnchorState();
      if (anchor) {
        return { mode: 'anchor', anchorX: anchor.x, anchorY: anchor.y, index: anchor.index };
      }
      const layers = this.getSelectedLayers();
      if (!layers.length) return { mode: 'none' };
      const bounds = this.getSelectionBounds(layers, this.tempTransform);
      if (!bounds || !bounds.corners) return { mode: 'none' };
      const xs = Object.values(bounds.corners).map((p) => p.x);
      const ys = Object.values(bounds.corners).map((p) => p.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const manual = layers.every((l) => l && !l.isGroup && (l.type === 'shape' || l.type === 'text'));
      const rotation = (layers.length === 1 && layers[0].params)
        ? (layers[0].params.rotation ?? 0)
        : null;
      return {
        mode: 'object',
        manual,
        count: layers.length,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        rotation,
      };
    }

    // SG-6: the single selected direct-selection anchor in world space, or null
    // (wrong tool, no direct selection, or ≠1 anchor selected).
    getSelectedAnchorState() {
      if (this.activeTool !== 'direct') return null;
      const sel = this.directSelection;
      if (!sel || !sel.selectedIndices || sel.selectedIndices.size !== 1) return null;
      const idx = [...sel.selectedIndices][0];
      const data = this._selectionWorldAnchors(sel);
      const a = data && data.anchors ? data.anchors[idx] : null;
      if (!a) return null;
      return { x: a.x, y: a.y, index: idx };
    }

    // SEL-5: resize + reposition the current selection so its combined bounding
    // box matches the given WORLD box, as ONE undo step. Any of x/y/width/height
    // may be null/undefined to leave that dimension unchanged. Resizing keeps the
    // box's top-left fixed (the default reference point), then the
    // optional x/y translate moves the top-left to its new location. The panel
    // pre-applies the link-W/H ratio; the renderer just honours the target box.
    applySelectionBox(box = {}) {
      const layers = this.getSelectedLayers();
      if (!layers.length) return false;
      const model = this.getTransformPanelModel();
      if (!model || model.mode !== 'object') return false;
      const EPS = 1e-6;
      const curW = model.width;
      const curH = model.height;
      let sx = (Number.isFinite(box.width) && box.width > EPS && curW > EPS) ? box.width / curW : 1;
      let sy = (Number.isFinite(box.height) && box.height > EPS && curH > EPS) ? box.height / curH : 1;
      // clamp scale to the same envelope handle-resize uses
      const clampScale = (s) => Math.max(0.05, Math.min(Math.abs(s), 20)) * (s < 0 ? -1 : 1);
      sx = clampScale(sx);
      sy = clampScale(sy);
      const doResize = Math.abs(sx - 1) > EPS || Math.abs(sy - 1) > EPS;
      const targetX = Number.isFinite(box.x) ? box.x : model.x;
      const targetY = Number.isFinite(box.y) ? box.y : model.y;
      // top-left stays fixed through the resize, so the translate is measured
      // from the current top-left.
      const dx = targetX - model.x;
      const dy = targetY - model.y;
      const doMove = Math.abs(dx) > EPS || Math.abs(dy) > EPS;
      if (!doResize && !doMove) return false;

      if (this.app && typeof this.app.pushHistory === 'function') this.app.pushHistory();
      const { targets, expandedMorph } = this._expandTransformTargets(layers);
      const prof = this.engine.currentProfile;

      if (doResize) {
        const resizeOrigin = { x: model.x, y: model.y };
        const prevTemp = this.tempTransform;
        this.tempTransform = { dx: 0, dy: 0, scaleX: sx, scaleY: sy, origin: resizeOrigin };
        targets.forEach((layer) =>
          this._applyCommittedTransformToLeaf(layer, 'resize', { scaleX: sx, scaleY: sy, prof }));
        this.tempTransform = prevTemp;
      }
      if (doMove) {
        const moveTemp = { dx, dy, scaleX: 1, scaleY: 1, origin: { x: 0, y: 0 } };
        targets.forEach((layer) =>
          this._applyCommittedTransformToLeaf(layer, 'move', { dx, dy, moveTemp }));
      }

      if (expandedMorph || this._dragHasMorphAncestor(layers)) this._refreshMorphGeometry();
      const primary = this.getSelectedLayer();
      const effectivePrimary = (primary?.isGroup)
        ? layers.find((l) => !l.isGroup) || primary
        : primary;
      if (effectivePrimary) this.updateTransformInputs?.(effectivePrimary);
      this.draw();
      return true;
    }

    // SG-6: move the single selected direct-selection anchor to a WORLD point,
    // dragging its bezier handles with it, as ONE undo step.
    applySelectedAnchorPosition(point = {}) {
      const state = this.getSelectedAnchorState();
      if (!state) return false;
      if (!Number.isFinite(point.x) && !Number.isFinite(point.y)) return false;
      const sel = this.directSelection;
      const layer = this.engine.layers.find((l) => l.id === sel.layerId);
      if (!layer) return false;
      const targetWorld = {
        x: Number.isFinite(point.x) ? point.x : state.x,
        y: Number.isFinite(point.y) ? point.y : state.y,
      };
      const src = this.worldToSourcePoint(layer, targetWorld);
      const anchor = sel.anchors[state.index];
      if (!anchor) return false;
      const ddx = src.x - anchor.x;
      const ddy = src.y - anchor.y;
      if (Math.abs(ddx) < 1e-6 && Math.abs(ddy) < 1e-6) return false;
      if (this.app && typeof this.app.pushHistory === 'function') this.app.pushHistory();
      anchor.x = src.x;
      anchor.y = src.y;
      if (anchor.in) { anchor.in.x += ddx; anchor.in.y += ddy; }
      if (anchor.out) { anchor.out.x += ddx; anchor.out.y += ddy; }
      this._applySelectionPath(sel);
      this.draw();
      return true;
    }

    applyRotationToBounds(bounds, deltaAngleDeg) {
      const deltaRad = (deltaAngleDeg * Math.PI) / 180;
      const cosD = Math.cos(deltaRad);
      const sinD = Math.sin(deltaRad);
      const ox = bounds.origin.x;
      const oy = bounds.origin.y;
      const rotPt = (pt) => {
        const dx = pt.x - ox;
        const dy = pt.y - oy;
        return { x: ox + dx * cosD - dy * sinD, y: oy + dx * sinD + dy * cosD };
      };
      const nw = rotPt(bounds.corners.nw);
      const ne = rotPt(bounds.corners.ne);
      const se = rotPt(bounds.corners.se);
      const sw = rotPt(bounds.corners.sw);
      const cx = (nw.x + ne.x + se.x + sw.x) / 4;
      const cy = (nw.y + ne.y + se.y + sw.y) / 4;
      const newRot = (bounds.rotation || 0) + deltaRad;
      const hw = Math.hypot(ne.x - nw.x, ne.y - nw.y) / 2;
      const hh = Math.hypot(sw.x - nw.x, sw.y - nw.y) / 2;
      return {
        minX: -hw, minY: -hh, maxX: hw, maxY: hh,
        rotation: newRot,
        origin: bounds.origin,
        center: { x: cx, y: cy },
        corners: { nw, ne, se, sw },
      };
    }

    screenToWorld(x, y) {
      return { x: (x - this.offsetX) / this.scale, y: (y - this.offsetY) / this.scale };
    }

    worldToScreen(x, y) {
      return { x: x * this.scale + this.offsetX, y: y * this.scale + this.offsetY };
    }

    transformPoint(pt, temp) {
      if (!temp) return pt;
      const origin = temp.origin || { x: 0, y: 0 };
      let x = (pt.x - origin.x) * temp.scaleX;
      let y = (pt.y - origin.y) * temp.scaleY;
      if (temp.rotation) {
        const rot = (temp.rotation * Math.PI) / 180;
        const cosR = Math.cos(rot);
        const sinR = Math.sin(rot);
        const rx = x * cosR - y * sinR;
        const ry = x * sinR + y * cosR;
        x = rx;
        y = ry;
      }
      return { x: x + origin.x + temp.dx, y: y + origin.y + temp.dy };
    }

    transformPath(path, temp) {
      if (!path) return path;
      return path.map((pt) => this.transformPoint(pt, temp));
    }

    // Delegate to PaintBucketOps so all callers (canvas drag, arrow keys,
    // align/distribute, numeric inputs) share one transformation path.
    transformLayerFillsByTemp(layer, temp) {
      window.Vectura?.PaintBucketOps?.transformLayerFills?.(layer, temp);
    }

    transformCircleMeta(meta, temp) {
      if (!temp || !meta) return meta;
      const center = this.transformPoint({ x: meta.cx ?? meta.x, y: meta.cy ?? meta.y }, temp);
      // Prefer rx/ry (already reflect the layer's committed scale) over r (raw, unscaled)
      // so that previewing tempTransform multiplies the *current displayed* radius.
      const baseRx = Number.isFinite(meta.rx) ? meta.rx : (Number.isFinite(meta.r) ? meta.r : 0);
      const baseRy = Number.isFinite(meta.ry) ? meta.ry : (Number.isFinite(meta.r) ? meta.r : 0);
      const rx = Math.abs(baseRx * temp.scaleX);
      const ry = Math.abs(baseRy * temp.scaleY);
      const rot = ((temp.rotation ?? 0) * Math.PI) / 180;
      return { ...meta, cx: center.x, cy: center.y, rx, ry, rotation: (meta.rotation ?? 0) + rot };
    }

    getLayerBaseOrigin(layer) {
      const prof = this.engine.currentProfile;
      return {
        x: layer.origin?.x ?? prof.width / 2,
        y: layer.origin?.y ?? prof.height / 2,
      };
    }

    getLayerTransformedOrigin(layer, temp = null) {
      const baseOrigin = this.getLayerBaseOrigin(layer);
      const translated = {
        x: baseOrigin.x + (layer?.params?.posX ?? 0),
        y: baseOrigin.y + (layer?.params?.posY ?? 0),
      };
      return temp ? this.transformPoint(translated, temp) : translated;
    }

    transformShapeSourcePoint(pt, layer, temp = null) {
      if (!pt || !layer) return pt;
      const origin = this.getLayerBaseOrigin(layer);
      const scaleX = layer?.params?.scaleX ?? 1;
      const scaleY = layer?.params?.scaleY ?? 1;
      const rotation = ((layer?.params?.rotation ?? 0) * Math.PI) / 180;
      const cosR = Math.cos(rotation);
      const sinR = Math.sin(rotation);
      const dx = (pt.x - origin.x) * scaleX;
      const dy = (pt.y - origin.y) * scaleY;
      const world = {
        x: dx * cosR - dy * sinR + origin.x + (layer?.params?.posX ?? 0),
        y: dx * sinR + dy * cosR + origin.y + (layer?.params?.posY ?? 0),
      };
      return temp ? this.transformPoint(world, temp) : world;
    }

    inverseTransformPoint(pt, temp = null) {
      if (!temp) return pt;
      const origin = temp.origin || { x: 0, y: 0 };
      const dx = pt.x - origin.x - (temp.dx ?? 0);
      const dy = pt.y - origin.y - (temp.dy ?? 0);
      const rot = (((temp.rotation ?? 0) * Math.PI) / 180) * -1;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const rx = dx * cosR - dy * sinR;
      const ry = dx * sinR + dy * cosR;
      return {
        x: origin.x + rx / (temp.scaleX || 1),
        y: origin.y + ry / (temp.scaleY || 1),
      };
    }

    inverseShapeSourcePoint(pt, layer, temp = null) {
      if (!pt || !layer) return pt;
      const world = temp ? this.inverseTransformPoint(pt, temp) : pt;
      const origin = this.getLayerBaseOrigin(layer);
      const translated = {
        x: world.x - (layer?.params?.posX ?? 0),
        y: world.y - (layer?.params?.posY ?? 0),
      };
      const rot = (((layer?.params?.rotation ?? 0) * Math.PI) / 180) * -1;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const dx = translated.x - origin.x;
      const dy = translated.y - origin.y;
      return {
        x: origin.x + (dx * cosR - dy * sinR) / (layer?.params?.scaleX || 1),
        y: origin.y + (dx * sinR + dy * cosR) / (layer?.params?.scaleY || 1),
      };
    }

    transformShapeDirection(descriptor, layer, temp = null) {
      if (!descriptor) return { x: 0, y: 0 };
      const handlePoint = getShapeCornerHandlePosition(descriptor, this.scale);
      const vertex = this.transformShapeSourcePoint(descriptor.vertex, layer, temp);
      const point = this.transformShapeSourcePoint(handlePoint, layer, temp);
      const dx = point.x - vertex.x;
      const dy = point.y - vertex.y;
      const length = Math.hypot(dx, dy) || 1;
      return { x: dx / length, y: dy / length };
    }

    getTransformedShapeVertices(layer, pathIndex = 0, temp = null) {
      const meta = this.getShapeMetaForLayer(layer, pathIndex);
      if (!meta?.shape) return [];
      return getShapeVertices(meta.shape).map((vertex) => this.transformShapeSourcePoint(vertex, layer, temp));
    }

    getPrimitiveShapeBounds(layer, temp = null) {
      const meta = this.getShapeMetaForLayer(layer, 0);
      if (!meta?.shape || (meta.shape.type !== 'rect' && meta.shape.type !== 'polygon')) return null;
      const vertices = this.getTransformedShapeVertices(layer, 0, temp);
      if (!vertices.length) return null;
      const baseRotation = ((layer?.params?.rotation ?? 0) * Math.PI) / 180;
      const tempRotation = (((temp?.rotation ?? 0) * Math.PI) / 180);
      const rotation = baseRotation + tempRotation;
      const origin = this.getLayerTransformedOrigin(layer, temp);
      return buildBoundsFromVertices(vertices, origin, rotation);
    }

    // Lane B interface (single-owner rule): apply per-layer stroke style
    // fields (extended lineCap, lineJoin, miterLimit) to the canvas context.
    // Defensive — fields may be absent on layers in this worktree; falls back
    // to the historical `round`/`round`/10 defaults. Lane B owns the model &
    // serialization; the renderer only mirrors the fields at draw time.
    _applyLayerStrokeCtx(layer) {
      // Canvas/SVG spell the extended "projecting" cap as "square".
      const capMap = { butt: 'butt', round: 'round', projecting: 'square', square: 'square' };
      const cap = layer && layer.lineCap;
      this.ctx.lineCap = capMap[cap] || cap || 'round';
      this.ctx.lineJoin = (layer && layer.lineJoin) || 'round';
      const miter = layer && Number(layer.miterLimit);
      this.ctx.miterLimit = Number.isFinite(miter) && miter > 0 ? miter : 10;
    }

    // Lane B interface: resolve a layer-level dash pattern to canvas-space
    // (world/mm) values. The `dash` field is {enabled, pattern:number[]} in
    // document units; convert each entry to mm so it matches the world-space
    // canvas transform. Returns null when no layer dash is active.
    _layerDashPattern(layer) {
      const dash = layer && layer.dash;
      if (!dash || dash.enabled !== true || !Array.isArray(dash.pattern) || !dash.pattern.length) return null;
      const settings = (window.Vectura && window.Vectura.SETTINGS) || SETTINGS || {};
      const units = normalizeDocumentUnits(settings.documentUnits);
      const toMm = typeof UnitUtils.documentUnitsToMm === 'function'
        ? (v) => UnitUtils.documentUnitsToMm(v, units)
        : (v) => v;
      const arr = dash.pattern
        .map((n) => toMm(Number(n)))
        .filter((n) => Number.isFinite(n) && n >= 0);
      return arr.length ? arr : null;
    }

    getPathStrokeDash(path) {
      const shared = window.Vectura?.Geometry3D?.getPathStrokeDash;
      if (typeof shared === 'function') return shared(path);
      const meta = path?.meta || {};
      if (Array.isArray(meta.strokeDash) && meta.strokeDash.length) {
        const dash = meta.strokeDash.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
        if (dash.length) return dash;
      }
      return meta.hiddenLine ? [3, 2] : null;
    }

    traceLayerPath(path, layer, temp = null, useCurves = Boolean(layer?.params?.curves)) {
      if (path && path.meta && path.meta.kind === 'circle') {
        const meta = temp ? this.transformCircleMeta(path.meta, temp) : path.meta;
        this.traceCircle(meta);
        return;
      }
      const next = temp ? this.transformPath(path, temp) : path;
      this.tracePath(next, useCurves);
    }

    tracePolygonPath(path, temp = null) {
      if (!Array.isArray(path) || path.length < 2) return;
      const next = temp ? this.transformPath(path, temp) : path;
      this.ctx.moveTo(next[0].x, next[0].y);
      for (let i = 1; i < next.length; i++) this.ctx.lineTo(next[i].x, next[i].y);
      this.ctx.closePath();
    }

    getMaskPreviewClipPolygons(layer = this.getMaskPreviewLayer(), temp = this.tempTransform) {
      if (!layer) return [];
      const bounds = this.engine.getBounds ? this.engine.getBounds() : this.engine.currentProfile;
      const polygons = getLayerSilhouette(layer, this.engine, bounds);
      return (polygons || [])
        .filter((polygon) => Array.isArray(polygon) && polygon.length >= 3)
        .map((polygon) => (temp ? this.transformPath(polygon, temp) : polygon));
    }

    drawMaskPreviewOverlay() {
      if (!this.maskPreview?.entries?.length || !this.tempTransform) return;
      const maskLayer = this.getMaskPreviewLayer();
      if (!maskLayer) return;
      const isChildDrag = Boolean(this.maskPreview.isChildDrag);
      // For child drag the mask is locked/fixed, so clip polygons don't move with tempTransform.
      // For the normal case the mask itself is dragging, so clip polygons transform with it.
      const clipPolygons = this.getMaskPreviewClipPolygons(maskLayer, isChildDrag ? null : this.tempTransform);
      if (!clipPolygons.length) return;

      this.maskPreview.entries.forEach((entry) => {
        const layer = this.engine.layers.find((candidate) => candidate.id === entry.layerId);
        if (!layer || !layer.visible) return;
        const pen = SETTINGS.pens?.find((candidate) => candidate.id === layer.penId) || null;
        const strokeWidth = pen?.width ?? layer.strokeWidth ?? SETTINGS.strokeWidth;
        const useCurves = Boolean(layer.params && layer.params.curves);
        const strokeStyle = pen?.color || layer.color;
        // For child drag the paths are source geometry; apply tempTransform when tracing so they
        // follow the cursor. For normal the paths are pre-computed at the destination position.
        const pathTemp = isChildDrag ? this.tempTransform : null;

        this.ctx.save();
        this.ctx.globalAlpha = MASK_PREVIEW_ALPHA;
        this.ctx.lineWidth = strokeWidth;
        this.ctx.lineCap = layer.lineCap || 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = strokeStyle;
        this.ctx.beginPath();
        (entry.paths || []).forEach((path) => this.traceLayerPath(path, layer, pathTemp, useCurves));
        this.ctx.stroke();
        this.ctx.restore();

        this.ctx.save();
        this.ctx.beginPath();
        clipPolygons.forEach((polygon) => this.tracePolygonPath(polygon));
        this.ctx.clip();
        this.ctx.globalAlpha = isChildDrag ? 0.5 : 1;
        this.ctx.lineWidth = strokeWidth;
        this.ctx.lineCap = layer.lineCap || 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = strokeStyle;
        this.ctx.beginPath();
        (entry.paths || []).forEach((path) => this.traceLayerPath(path, layer, pathTemp, useCurves));
        this.ctx.stroke();
        this.ctx.restore();
      });

      if (maskLayer.mask?.hideLayer) {
        this.ctx.save();
        this.ctx.lineWidth = 1 / this.scale;
        this.ctx.strokeStyle = getThemeToken('--render-guide-faint', 'rgba(248, 250, 252, 0.75)');
        this.ctx.setLineDash([4 / this.scale, 3 / this.scale]);
        this.ctx.beginPath();
        clipPolygons.forEach((polygon) => this.tracePolygonPath(polygon));
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.restore();
      }
    }

    getLayerBounds(layer, temp) {
      const primitiveBounds = this.getPrimitiveShapeBounds(layer, temp);
      if (primitiveBounds) return primitiveBounds;
      // A morph-consumed child renders nothing (getInteractionPaths -> []), so
      // bound its still-present source geometry directly. Primitive consumed
      // children were already handled above; this covers polyline children.
      if (layer?._morphConsumed) {
        const src = (layer.effectivePaths?.length ? layer.effectivePaths : layer.paths) || [];
        // During a live drag the child's paths are physically rewritten to the
        // dragged position (mirrorDragState), so applying temp on top double-counts
        // the offset and the selection box creeps away from the child at ~2×.
        // Bound the already-moved geometry without temp (mirrors the render path's
        // mirrorDragState guard).
        const t = this.mirrorDragState?.has(layer.id) ? null : temp;
        return src.length ? this._boundsFromPaths(src, t) : null;
      }
      // Group containers carry no params/paths of their own — their bounds are
      // the union of their descendants'. Without this guard, accessing
      // layer.params.posX below crashes draw() when a group is the sole
      // selection (e.g. user clicks the group folder during the tutorial),
      // which empties the canvas and reads as "zoomed in and locked."
      if (layer?.isGroup) {
        // A morph container's single-object bbox is the BLEND (morphedPaths),
        // not the union of its source children.
        if (layer.modifier?.type === 'morph' && Array.isArray(layer.morphedPaths) && layer.morphedPaths.length) {
          return this._boundsFromPaths(layer.morphedPaths, temp);
        }
        const children = this.engine.layers.filter((l) => l.parentId === layer.id);
        return children.length ? this.getSelectionBounds(children, temp) : null;
      }
      const basePaths = this.getInteractionPaths(layer);
      if (!layer || !Array.isArray(basePaths) || !layer.params) return null;
      const prof = this.engine.currentProfile;
      const baseOrigin = {
        x: (layer.origin?.x ?? prof.width / 2) + (layer.params.posX ?? 0),
        y: (layer.origin?.y ?? prof.height / 2) + (layer.params.posY ?? 0),
      };
      const origin = temp ? this.transformPoint(baseOrigin, temp) : baseOrigin;
      const baseRot = layer.params.rotation ?? 0;
      const tempRot = temp?.rotation ?? 0;
      const rot = ((baseRot + tempRot) * Math.PI) / 180;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const unrotate = (pt) => {
        const dx = pt.x - origin.x;
        const dy = pt.y - origin.y;
        return {
          x: dx * cosR + dy * sinR,
          y: -dx * sinR + dy * cosR,
        };
      };

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      const addPoint = (pt) => {
        const local = unrotate(pt);
        minX = Math.min(minX, local.x);
        minY = Math.min(minY, local.y);
        maxX = Math.max(maxX, local.x);
        maxY = Math.max(maxY, local.y);
      };

      basePaths.forEach((path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          const meta = temp ? this.transformCircleMeta(path.meta, temp) : path.meta;
          const cx = meta.cx ?? meta.x;
          const cy = meta.cy ?? meta.y;
          const rx = meta.rx ?? meta.r;
          const ry = meta.ry ?? meta.r;
          if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rx) || !Number.isFinite(ry)) return;
          addPoint({ x: cx - rx, y: cy });
          addPoint({ x: cx + rx, y: cy });
          addPoint({ x: cx, y: cy - ry });
          addPoint({ x: cx, y: cy + ry });
          return;
        }
        if (!Array.isArray(path)) return;
        path.forEach((pt) => {
          const next = temp ? this.transformPoint(pt, temp) : pt;
          addPoint(next);
        });
      });
      // While a text layer is being edited on canvas, fold its glyph em-boxes into
      // the bounds — including the zero-width caret anchors emitted for empty lines
      // — so the dotted editing outline grows to include a blank line the instant
      // Enter is pressed, before any glyph is typed there. Gated to the active edit
      // layer so committed-layer bounds (and their visual baselines) are unchanged.
      if (layer.type === 'text' && Array.isArray(layer.glyphs) && layer.glyphs.length) {
        const te = this.app && this.app.textEdit;
        if (te && te.getActiveLayer && te.getActiveLayer() === layer) {
          layer.glyphs.forEach((g) => {
            if (!g || !Array.isArray(g.quad)) return;
            g.quad.forEach((pt) => addPoint(temp ? this.transformPoint(pt, temp) : pt));
          });
        }
      }
      if (!Number.isFinite(minX)) return null;
      const toWorld = (local) => ({
        x: origin.x + local.x * cosR - local.y * sinR,
        y: origin.y + local.x * sinR + local.y * cosR,
      });
      const nw = toWorld({ x: minX, y: minY });
      const ne = toWorld({ x: maxX, y: minY });
      const se = toWorld({ x: maxX, y: maxY });
      const sw = toWorld({ x: minX, y: maxY });
      const centerLocal = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      const center = toWorld(centerLocal);
      return {
        minX,
        minY,
        maxX,
        maxY,
        rotation: rot,
        origin,
        center,
        corners: { nw, ne, se, sw },
      };
    }

    // Expand a transform selection into the concrete leaf layers to mutate.
    // A morph container is not itself transformable (its geometry is the blend
    // of its children), so a transform on the container fans out to every leaf
    // descendant; the morph then refolds. Other group kinds carry no own params
    // and are skipped (matching the historical `if (layer.isGroup) return;`).
    _expandTransformTargets(selectedLayers) {
      const targets = [];
      let expandedMorph = false;
      (selectedLayers || []).forEach((layer) => {
        if (layer.isGroup) {
          if (layer.modifier?.type === 'morph') {
            (this.engine.getLayerDescendants(layer.id) || []).forEach((leaf) => {
              if (!leaf.isGroup) targets.push(leaf);
            });
            expandedMorph = true;
          }
          return;
        }
        targets.push(layer);
      });
      return { targets, expandedMorph };
    }

    // Apply a committed move/resize/rotate to a single leaf layer. Factored out
    // of up() so the same math serves both a directly-selected leaf and the
    // per-leaf fan-out of a morph-container transform.
    _applyCommittedTransformToLeaf(layer, mode, ctx) {
      if (!layer || layer.isGroup || !layer.params) return;
      if (mode === 'move') {
        layer.params.posX += ctx.dx;
        layer.params.posY += ctx.dy;
        this.transformLayerFillsByTemp(layer, ctx.moveTemp);
        this.engine.generate(layer.id);
        return;
      }
      if (mode === 'resize') {
        const prof = ctx.prof;
        const originLocal = layer.origin || { x: prof.width / 2, y: prof.height / 2 };
        const baseOrigin = {
          x: originLocal.x + (layer.params.posX ?? 0),
          y: originLocal.y + (layer.params.posY ?? 0),
        };
        const resizeOrigin = this.tempTransform.origin || baseOrigin;
        layer.params.scaleX *= ctx.scaleX;
        layer.params.scaleY *= ctx.scaleY;
        layer.params.posX = (baseOrigin.x - resizeOrigin.x) * ctx.scaleX + resizeOrigin.x - originLocal.x;
        layer.params.posY = (baseOrigin.y - resizeOrigin.y) * ctx.scaleY + resizeOrigin.y - originLocal.y;
        this.transformLayerFillsByTemp(layer, { dx: 0, dy: 0, scaleX: ctx.scaleX, scaleY: ctx.scaleY, origin: resizeOrigin });
        this.engine.generate(layer.id);
        return;
      }
      if (mode === 'rotate') {
        const { delta, origin } = ctx;
        const baseOrigin = {
          x: (layer.origin?.x ?? 0) + (layer.params.posX ?? 0),
          y: (layer.origin?.y ?? 0) + (layer.params.posY ?? 0),
        };
        if (origin) {
          const rot = (delta * Math.PI) / 180;
          const cosR = Math.cos(rot);
          const sinR = Math.sin(rot);
          const dx = baseOrigin.x - origin.x;
          const dy = baseOrigin.y - origin.y;
          const rx = dx * cosR - dy * sinR;
          const ry = dx * sinR + dy * cosR;
          layer.params.posX = origin.x + rx - (layer.origin?.x ?? 0);
          layer.params.posY = origin.y + ry - (layer.origin?.y ?? 0);
        }
        layer.params.rotation = (layer.params.rotation ?? 0) + delta;
        if (origin) {
          this.transformLayerFillsByTemp(layer, { dx: 0, dy: 0, scaleX: 1, scaleY: 1, origin, rotation: delta });
        }
        this.engine.generate(layer.id);
      }
    }

    _refreshMorphGeometry() {
      this.onComputeDisplayGeometry
        ? this.onComputeDisplayGeometry()
        : this.engine.computeAllDisplayGeometry();
    }

    drawKeyObjectOutline(bounds) {
      if (!bounds || !bounds.corners) return;
      const { nw, ne, se, sw } = bounds.corners;
      this.ctx.save();
      this.ctx.strokeStyle = getThemeToken('--render-selection-handle-stroke', '#f8fafc');
      this.ctx.lineWidth = 2.25 / this.scale;
      this.ctx.setLineDash([]);
      this.ctx.beginPath();
      this.ctx.moveTo(nw.x, nw.y);
      this.ctx.lineTo(ne.x, ne.y);
      this.ctx.lineTo(se.x, se.y);
      this.ctx.lineTo(sw.x, sw.y);
      this.ctx.closePath();
      this.ctx.stroke();
      this.ctx.restore();
    }

    drawSelection(bounds, options = {}) {
      const { showHandles = true } = options;
      const handleSize = 6 / this.scale;
      const { nw, ne, se, sw } = bounds.corners;
      this.ctx.save();
      this.ctx.strokeStyle = getThemeToken('--render-selection-handle-stroke', '#f8fafc');
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      this.ctx.beginPath();
      this.ctx.moveTo(nw.x, nw.y);
      this.ctx.lineTo(ne.x, ne.y);
      this.ctx.lineTo(se.x, se.y);
      this.ctx.lineTo(sw.x, sw.y);
      this.ctx.closePath();
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.fillStyle = getThemeToken('--render-selection-handle-fill', '#111827');
      this.ctx.strokeStyle = getThemeToken('--render-selection-handle-stroke', '#f8fafc');
      if (showHandles) {
        const handles = this.getHandlePoints(bounds);
        handles.forEach((pt) => {
          this.ctx.beginPath();
          this.ctx.rect(pt.x - handleSize / 2, pt.y - handleSize / 2, handleSize, handleSize);
          this.ctx.fill();
          this.ctx.stroke();
        });
      }
      this.ctx.restore();
    }

    get3DRotationSpec(layer) {
      if (!layer || !layer.params) return null;
      // A scene3d GROUP (scene-tree container, isGroup:true) still owns the orbit
      // gizmo; every OTHER group (boolean, plain) has no 3D rotation spec.
      if (layer.isGroup && layer.type !== 'scene3d') return null;
      const spec = ROTATION_3D_SPECS[layer.type] || null;
      if (spec && typeof spec.appliesIf === 'function' && !spec.appliesIf(layer.params)) return null;
      return spec;
    }

    // BUG 3 — the orbit gizmo lives on the scene GROUP (its composed scenePaths
    // carry the anchor geometry + the camera). When a scene DESCENDANT
    // (object3d / booleanGroup3d / light / ground child) is the active layer,
    // resolve up to the owning scene3d group so the gizmo still shows and rotates
    // the camera (or the selected object's transform). Returns the scene3d layer
    // itself, or null for a non-scene layer (byte-identical for those).
    _sceneRotationOwner(layer) {
      if (!layer) return null;
      if (layer.type === 'scene3d') return layer;
      const kinds = ['object3d', 'booleanGroup3d', 'sceneLight3d', 'sceneGround3d'];
      if (kinds.indexOf(layer.type) === -1) return null;
      const getById = this.engine && this.engine.getLayerById
        ? (id) => this.engine.getLayerById(id) : null;
      if (getById) {
        const seen = new Set();
        let p = layer;
        while (p && !seen.has(p.id)) {
          seen.add(p.id);
          p = p.parentId ? getById(p.parentId) : null;
          if (p && p.type === 'scene3d') return p;
        }
      }
      // Fall back to the active scene selection's group (canvas-pick sets it).
      if (this.sceneSelection && getById) {
        const g = getById(this.sceneSelection.layerId);
        if (g && g.type === 'scene3d') return g;
      }
      return null;
    }

    // Nested-spec accessors (3D Scene Studio, Phase 1C). Flat specs keep the
    // original layer.params[spec.*Param] reads/writes byte-identically; specs
    // marked `nested: true` (scene3d) delegate to spec.get/set, which route to
    // params.camera or the selected scene object's transform (CONTRACT A/D).
    _read3DRotation(layer, spec) {
      if (spec.nested) {
        const rot = spec.get(layer, this) || {};
        return {
          yaw: rot.yaw ?? spec.yawDefault,
          pitch: finiteNumber(rot.pitch, spec.pitchDefault),
          roll: rot.roll ?? spec.rollDefault ?? 0,
          hasRoll: true,
        };
      }
      return {
        yaw: layer.params[spec.yawParam] ?? spec.yawDefault,
        pitch: finiteNumber(layer.params[spec.pitchParam], spec.pitchDefault),
        roll: spec.rollParam ? (layer.params[spec.rollParam] ?? spec.rollDefault) : 0,
        hasRoll: Boolean(spec.rollParam),
      };
    }

    _write3DRotation(layer, spec, patch) {
      if (spec.nested) {
        spec.set(layer, this, patch);
        return;
      }
      if (patch.yaw !== undefined) layer.params[spec.yawParam] = patch.yaw;
      if (patch.pitch !== undefined) layer.params[spec.pitchParam] = patch.pitch;
      if (patch.roll !== undefined && spec.rollParam) layer.params[spec.rollParam] = patch.roll;
    }

    get3DRotationControl(layer, bounds) {
      // BUG 3 — the gizmo lives on the scene group even when a scene descendant
      // is the active layer. The incoming bounds only needs its corners (the
      // scene anchor overrides center/target), so the child's bounds are fine.
      const owner = this._sceneRotationOwner(layer);
      if (owner && owner !== layer) layer = owner;
      const spec = this.get3DRotationSpec(layer);
      if (!spec) return null;
      // Scene layers anchor the gizmo to the SELECTED OBJECT's top-right (or the
      // whole scene's when orbiting the camera), not the layer's doc-corner
      // bounds — otherwise it floats far from what it rotates. BUG 3: a scene
      // GROUP's geometry lives in scenePaths, so getSelectionBounds yields no
      // corners; the anchor (from getInteractionPaths) supplies center/target on
      // its own, so a valid anchor is sufficient. Non-scene layers still require
      // real bounds.corners.
      const sceneAnchor = layer.type === 'scene3d' ? this._sceneGizmoAnchor(layer) : null;
      if (!sceneAnchor && !bounds?.corners) return null;
      const unit = 1 / Math.max(this.scale || 1, 0.001);
      const center = sceneAnchor ? sceneAnchor.center
        : (bounds.center || this.getBoundsCenter(bounds));
      const target = sceneAnchor ? sceneAnchor.ne
        : (bounds.corners.ne || center);
      const vx = target.x - center.x;
      const vy = target.y - center.y;
      const len = Math.hypot(vx, vy) || 1;
      const ux = vx / len;
      const uy = vy / len;
      const padRadius = 17 * unit;
      const ringRadius = 28 * unit;
      const yawRadiusX = padRadius * 0.72;
      const yawRadiusY = padRadius * 0.48;
      const pitchRadiusX = padRadius * 0.62;
      const controlCenter = {
        x: target.x + ux * 35 * unit,
        y: target.y + uy * 35 * unit,
      };
      const rot = this._read3DRotation(layer, spec);
      const yaw = normalizeDegrees(rot.yaw);
      const pitch = clamp(
        finiteNumber(rot.pitch, spec.pitchDefault),
        spec.pitchMin,
        spec.pitchMax
      );
      const yawRad = (yaw * Math.PI) / 180;
      const pitchSpan = Math.max(1, spec.pitchMax - spec.pitchMin);
      const pitchT = (pitch - spec.pitchMin) / pitchSpan;
      const yawMarker = {
        x: controlCenter.x + Math.sin(yawRad) * yawRadiusX,
        y: controlCenter.y + Math.cos(yawRad) * yawRadiusY,
      };
      const pitchMarker = {
        x: controlCenter.x - pitchRadiusX,
        y: controlCenter.y + (0.5 - pitchT) * padRadius * 1.28,
      };
      const roll = rot.hasRoll
        ? normalizeDegrees(rot.roll)
        : 0;
      const rollRad = ((roll - 90) * Math.PI) / 180;
      const rollHandle = rot.hasRoll
        ? {
            x: controlCenter.x + Math.cos(rollRad) * ringRadius,
            y: controlCenter.y + Math.sin(rollRad) * ringRadius,
          }
        : null;
      return {
        layer,
        spec,
        center: controlCenter,
        padRadius,
        ringRadius,
        yawRadiusX,
        yawRadiusY,
        pitchRadiusX,
        pitchTrackHeight: padRadius * 1.28,
        yawMarker,
        pitchMarker,
        rollHandle,
      };
    }

    draw3DRotationControl(layer, bounds) {
      const control = this.get3DRotationControl(layer, bounds);
      if (!control) return;
      const unit = 1 / Math.max(this.scale || 1, 0.001);
      const { center, padRadius, ringRadius, yawRadiusX, yawRadiusY, pitchRadiusX, yawMarker, pitchMarker, rollHandle } = control;
      const accent = getThemeToken('--render-selection-handle-stroke', '#f8fafc');
      const fill = getThemeToken('--render-selection-handle-fill', '#111827');
      // Axis palette deliberately avoids red and green: red/green rings clash
      // with common pen colors and collapse for red-green color-blind users.
      // X=amber, Y=violet, Z=cyan — three well-separated hues that stay
      // distinct over both light and dark canvases. The gizmo draws no backing
      // disc; rings sit directly over the artwork.
      const axisX = getThemeToken('--render-gizmo-x', '#fbbf24');
      const axisY = getThemeToken('--render-gizmo-y', '#a78bfa');
      const axisZ = getThemeToken('--render-gizmo-z', '#22d3ee');
      this.ctx.save();
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      this.ctx.lineWidth = 1.1 * unit;
      this.ctx.globalAlpha = 0.78;
      this.ctx.strokeStyle = axisY;
      this.ctx.beginPath();
      this.ctx.ellipse(center.x, center.y, yawRadiusX, yawRadiusY, 0, 0, TAU);
      this.ctx.stroke();
      this.ctx.strokeStyle = axisX;
      this.ctx.beginPath();
      this.ctx.ellipse(center.x, center.y, pitchRadiusX, padRadius, 0, 0, TAU);
      this.ctx.stroke();

      this.ctx.globalAlpha = 0.92;
      this.ctx.beginPath();
      this.ctx.arc(center.x, center.y, 2.2 * unit, 0, TAU);
      this.ctx.fillStyle = accent;
      this.ctx.fill();

      this.ctx.fillStyle = fill;
      this.ctx.strokeStyle = axisY;
      this.ctx.lineWidth = 1 * unit;
      this.ctx.beginPath();
      this.ctx.arc(yawMarker.x, yawMarker.y, 3.4 * unit, 0, TAU);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(yawMarker.x - 4.6 * unit, yawMarker.y);
      this.ctx.lineTo(yawMarker.x - 7.2 * unit, yawMarker.y);
      this.ctx.moveTo(yawMarker.x + 4.6 * unit, yawMarker.y);
      this.ctx.lineTo(yawMarker.x + 7.2 * unit, yawMarker.y);
      this.ctx.stroke();

      this.ctx.strokeStyle = axisX;
      this.ctx.beginPath();
      this.ctx.arc(pitchMarker.x, pitchMarker.y, 3.4 * unit, 0, TAU);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.moveTo(pitchMarker.x, pitchMarker.y - 4.6 * unit);
      this.ctx.lineTo(pitchMarker.x, pitchMarker.y - 7.2 * unit);
      this.ctx.moveTo(pitchMarker.x, pitchMarker.y + 4.6 * unit);
      this.ctx.lineTo(pitchMarker.x, pitchMarker.y + 7.2 * unit);
      this.ctx.stroke();

      if (rollHandle) {
        this.ctx.strokeStyle = axisZ;
        this.ctx.globalAlpha = 0.62;
        this.ctx.setLineDash([2.4 * unit, 2.4 * unit]);
        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, ringRadius, 0, TAU);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        this.ctx.globalAlpha = 1;
        this.ctx.fillStyle = fill;
        this.ctx.beginPath();
        this.ctx.arc(rollHandle.x, rollHandle.y, 4.4 * unit, 0, TAU);
        this.ctx.fill();
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    drawSelectionRect(rect) {
      if (!rect) return;
      this.ctx.save();
      this.ctx.strokeStyle = getThemeToken('--render-marquee-stroke', 'rgba(148, 163, 184, 0.7)');
      this.ctx.fillStyle = getThemeToken('--render-marquee-fill', 'rgba(148, 163, 184, 0.12)');
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      this.ctx.beginPath();
      this.ctx.rect(rect.x, rect.y, rect.w, rect.h);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    }

    drawAlgoDraftRect(draft) {
      if (!draft) return;
      const x = Math.min(draft.start.x, draft.end.x);
      const y = Math.min(draft.start.y, draft.end.y);
      const w = Math.abs(draft.end.x - draft.start.x);
      const h = Math.abs(draft.end.y - draft.start.y);
      this.ctx.save();
      const accentColor = getThemeToken('--ui-accent', '#63b3ed');
      this.ctx.strokeStyle = accentColor;
      this.ctx.globalAlpha = 0.85;
      this.ctx.lineWidth = 1.5 / this.scale;
      this.ctx.setLineDash([5 / this.scale, 4 / this.scale]);
      this.ctx.beginPath();
      this.ctx.rect(x, y, w, h);
      this.ctx.stroke();
      this.ctx.globalAlpha = 0.08;
      this.ctx.fillStyle = accentColor;
      this.ctx.fill();
      this.ctx.restore();
    }

    drawSelectionPath(path) {
      if (!Array.isArray(path) || path.length < 2) return;
      this.ctx.save();
      this.ctx.strokeStyle = getThemeToken('--render-marquee-stroke', 'rgba(148, 163, 184, 0.7)');
      this.ctx.fillStyle = getThemeToken('--render-marquee-fill', 'rgba(148, 163, 184, 0.12)');
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      this.ctx.beginPath();
      this.ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) this.ctx.lineTo(path[i].x, path[i].y);
      this.ctx.closePath();
      this.ctx.stroke();
      this.ctx.fill();
      this.ctx.setLineDash([]);
      this.ctx.restore();
    }

    _drawSelectionGeometry(sel, worldAnchors) {
      if (!worldAnchors || !worldAnchors.length) return;
      this.ctx.strokeStyle = getThemeToken('--render-direct-stroke', '#22d3ee');
      this.ctx.lineWidth = 1.1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 3 / this.scale]);
      this.ctx.beginPath();
      // Trace the editable outline as native cubic beziers when any segment
      // carries handles — keeps the dashed overlay perfectly smooth at any
      // zoom (the sampled buildPenPathFromAnchors polyline used to facet
      // here at high zoom on segments with short chord + long handles).
      if (worldAnchors.length >= 1) {
        this.ctx.moveTo(worldAnchors[0].x, worldAnchors[0].y);
        const segCount = sel.closed ? worldAnchors.length : worldAnchors.length - 1;
        for (let i = 0; i < segCount; i++) {
          const a = worldAnchors[i];
          const b = worldAnchors[(i + 1) % worldAnchors.length];
          if (a.out || b.in) {
            const c1 = a.out || a;
            const c2 = b.in || b;
            this.ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
          } else {
            this.ctx.lineTo(b.x, b.y);
          }
        }
        if (sel.closed) this.ctx.closePath();
      }
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      const anchorR = 3.2 / this.scale;
      const handleR = 2.2 / this.scale;
      const selectedSet = sel.selectedIndices || new Set();
      worldAnchors.forEach((anchor, i) => {
        const isSelected = selectedSet.has(i);
        if (anchor.in) {
          this.ctx.strokeStyle = getThemeToken('--render-direct-handle-line', 'rgba(34, 211, 238, 0.65)');
          this.ctx.beginPath();
          this.ctx.moveTo(anchor.x, anchor.y);
          this.ctx.lineTo(anchor.in.x, anchor.in.y);
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.fillStyle = getThemeToken('--render-direct-handle-fill', '#0f172a');
          this.ctx.strokeStyle = getThemeToken('--render-direct-stroke', '#22d3ee');
          this.ctx.arc(anchor.in.x, anchor.in.y, handleR, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.stroke();
        }
        if (anchor.out) {
          this.ctx.strokeStyle = getThemeToken('--render-direct-handle-line', 'rgba(34, 211, 238, 0.65)');
          this.ctx.beginPath();
          this.ctx.moveTo(anchor.x, anchor.y);
          this.ctx.lineTo(anchor.out.x, anchor.out.y);
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.fillStyle = getThemeToken('--render-direct-handle-fill', '#0f172a');
          this.ctx.strokeStyle = getThemeToken('--render-direct-stroke', '#22d3ee');
          this.ctx.arc(anchor.out.x, anchor.out.y, handleR, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.stroke();
        }
        this.ctx.beginPath();
        this.ctx.fillStyle = isSelected
          ? getThemeToken('--render-direct-stroke', '#22d3ee')
          : getThemeToken('--render-direct-handle-fill', '#0f172a');
        this.ctx.strokeStyle = getThemeToken('--render-direct-stroke', '#22d3ee');
        this.ctx.arc(anchor.x, anchor.y, anchorR, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();

      });
    }

    drawDirectSelection() {
      this.ctx.save();
      if (this.directSelection) {
        const data = this.getDirectSelectionWorldAnchors();
        if (data) this._drawSelectionGeometry(this.directSelection, data.anchors);
        if (this.directDrag?.mergeTarget != null && data) {
          const wa = data.anchors[this.directDrag.mergeTarget];
          if (wa) {
            const r = 3.2 / this.scale;
            this.ctx.strokeStyle = getThemeToken('--render-direct-stroke', '#22d3ee');
            this.ctx.lineWidth = 1.1 / this.scale;
            this.ctx.setLineDash([]);
            this.ctx.beginPath();
            this.ctx.arc(wa.x, wa.y, r * 2.2, 0, Math.PI * 2);
            this.ctx.stroke();
          }
        }
        if (this.directDrag?.endpointSnapTarget) {
          const sw = this.directDrag.endpointSnapTarget.world;
          const r = 3.2 / this.scale;
          this.ctx.strokeStyle = getThemeToken('--render-direct-stroke', '#22d3ee');
          this.ctx.lineWidth = 1.1 / this.scale;
          this.ctx.setLineDash([3 / this.scale, 3 / this.scale]);
          this.ctx.beginPath();
          this.ctx.arc(sw.x, sw.y, r * 2.2, 0, Math.PI * 2);
          this.ctx.stroke();
          this.ctx.setLineDash([]);
        }
      }
      for (const auxSel of this.directAuxSelections || []) {
        const data = this._selectionWorldAnchors(auxSel);
        if (data) this._drawSelectionGeometry(auxSel, data.anchors);
      }
      const layer = this.getDirectSelectionLayer();
      if (layer && this.directSelection?.meta?.shape) {
        this.drawShapeCornerHandles(layer, this.directSelection.pathIndex, 'single');
      }
      if (layer && !this.directSelection?.meta?.shape) {
        const freeHandles = this._getFreeformCornerHandles();
        if (freeHandles.length) {
          this.ctx.save();
          const strokeColor = getThemeToken('--render-direct-stroke', '#22d3ee');
          const fillColor = getThemeToken('--render-direct-handle-fill', '#0f172a');
          this.ctx.strokeStyle = strokeColor;
          this.ctx.fillStyle = fillColor;
          this.ctx.lineWidth = 1 / this.scale;
          const r = 3.2 / this.scale;
          const rd = r * 0.38;
          freeHandles.forEach((h) => {
            // Bullseye outer ring
            this.ctx.beginPath();
            this.ctx.fillStyle = fillColor;
            this.ctx.strokeStyle = strokeColor;
            this.ctx.arc(h.worldPoint.x, h.worldPoint.y, r, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            // Bullseye inner dot
            this.ctx.beginPath();
            this.ctx.fillStyle = strokeColor;
            this.ctx.arc(h.worldPoint.x, h.worldPoint.y, rd, 0, Math.PI * 2);
            this.ctx.fill();
          });
          this.ctx.restore();
        }
        if (this.freeformCornerDrag?.maxArcs?.length) {
          this.drawCornerMaxArcOverlay(this.freeformCornerDrag.maxArcs, (pt) => this.sourceToWorldPoint(layer, pt));
        }
      }
      this.ctx.restore();
    }

    // industry-parity "hit the geometric limit" cue: while actively
    // dragging a corner handle past its max radius, stroke the clamped
    // fillet arc(s) in red on top of the normal path.
    drawCornerMaxArcOverlay(arcs, toWorld) {
      if (!arcs?.length) return;
      this.ctx.save();
      this.ctx.strokeStyle = getThemeToken('--render-corner-max-radius', '#ef4444');
      this.ctx.lineWidth = 2.4 / this.scale;
      this.ctx.lineCap = 'round';
      this.ctx.setLineDash([]);
      arcs.forEach((arc) => {
        const p0 = toWorld(arc.start);
        const p3 = toWorld(arc.end);
        this.ctx.beginPath();
        this.ctx.moveTo(p0.x, p0.y);
        if (arc.startOut && arc.endIn) {
          const c1 = toWorld(arc.startOut);
          const c2 = toWorld(arc.endIn);
          this.ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y);
        } else {
          // Chamfer corners have no handles — the clamped cut is a straight line.
          this.ctx.lineTo(p3.x, p3.y);
        }
        this.ctx.stroke();
      });
      this.ctx.restore();
    }

    drawShapeCornerHandles(layer, pathIndex = 0, scope = 'all', temp = null) {
      const handles = this.getShapeCornerHandles(layer, pathIndex, temp);
      if (!handles.length) return;
      this.ctx.save();
      this.ctx.lineWidth = 1 / this.scale;
      const strokeColor = scope === 'all'
        ? getThemeToken('--render-selection-handle-stroke', '#f8fafc')
        : getThemeToken('--render-direct-stroke', '#22d3ee');
      const fillColor = getThemeToken('--render-direct-handle-fill', '#0f172a');
      this.ctx.strokeStyle = strokeColor;
      this.ctx.fillStyle = fillColor;
      const r = 3.2 / this.scale;
      const rd = r * 0.38;
      handles.forEach((handle) => {
        // Bullseye outer ring
        this.ctx.beginPath();
        this.ctx.fillStyle = fillColor;
        this.ctx.strokeStyle = strokeColor;
        this.ctx.arc(handle.point.x, handle.point.y, r, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        // Bullseye inner dot
        this.ctx.beginPath();
        this.ctx.fillStyle = strokeColor;
        this.ctx.arc(handle.point.x, handle.point.y, rd, 0, Math.PI * 2);
        this.ctx.fill();
      });
      this.ctx.restore();
      if (this.shapeCornerDrag?.maxArcs?.length) {
        this.drawCornerMaxArcOverlay(this.shapeCornerDrag.maxArcs, (pt) => this.transformShapeSourcePoint(pt, layer, temp));
      }
    }

    drawPenPreview() {
      const anchors = this.penDraft?.anchors || [];
      if (!anchors.length) return;
      const last = anchors[anchors.length - 1];
      const previewAnchors =
        this.penPreview && !this.isPenDragging ? anchors.concat([this.createAnchor(this.penPreview)]) : anchors.slice();
      this.ctx.save();
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      this.ctx.beginPath();
      if (previewAnchors.length >= 2) {
        this.ctx.moveTo(previewAnchors[0].x, previewAnchors[0].y);
        for (let i = 1; i < previewAnchors.length; i++) {
          const a = previewAnchors[i - 1];
          const b = previewAnchors[i];
          const c1 = a.out || a;
          const c2 = b.in || b;
          this.ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
        }
        if (this.penDraft?.closed && previewAnchors.length >= 2) {
          const a = previewAnchors[previewAnchors.length - 1];
          const b = previewAnchors[0];
          this.ctx.bezierCurveTo((a.out || a).x, (a.out || a).y, (b.in || b).x, (b.in || b).y, b.x, b.y);
        }
      }
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.fillStyle = getThemeToken('--render-direct-handle-fill', '#0f172a');
      this.ctx.strokeStyle = '#38bdf8';
      const r = 3 / this.scale;
      anchors.forEach((anchor, idx) => {
        if (anchor.in) {
          this.ctx.beginPath();
          this.ctx.moveTo(anchor.x, anchor.y);
          this.ctx.lineTo(anchor.in.x, anchor.in.y);
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.arc(anchor.in.x, anchor.in.y, r * 0.75, 0, Math.PI * 2);
          this.ctx.stroke();
        }
        if (anchor.out) {
          this.ctx.beginPath();
          this.ctx.moveTo(anchor.x, anchor.y);
          this.ctx.lineTo(anchor.out.x, anchor.out.y);
          this.ctx.stroke();
          this.ctx.beginPath();
          this.ctx.arc(anchor.out.x, anchor.out.y, r * 0.75, 0, Math.PI * 2);
          this.ctx.stroke();
        }
        this.ctx.beginPath();
        this.ctx.arc(anchor.x, anchor.y, r, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        if (idx === 0) {
          this.ctx.beginPath();
          this.ctx.arc(anchor.x, anchor.y, r * 1.5, 0, Math.PI * 2);
          this.ctx.stroke();
          if (this.penSnapToOrigin) {
            this.ctx.beginPath();
            this.ctx.arc(anchor.x, anchor.y, r * 2.5, 0, Math.PI * 2);
            this.ctx.stroke();
          }
        }
      });
      if (last) {
        this.ctx.beginPath();
        this.ctx.arc(last.x, last.y, r * 1.2, 0, Math.PI * 2);
        this.ctx.stroke();
      }
      if (this.penPreview) {
        this.ctx.beginPath();
        this.ctx.arc(this.penPreview.x, this.penPreview.y, r * 0.9, 0, Math.PI * 2);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    drawShapePreview() {
      const shape = this.getDraftShape();
      const path = shape ? this.buildShapePath(shape) : null;
      if (!path || path.length < 2) return;
      const closed = path.meta?.closed !== false;
      this.ctx.save();
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      this.ctx.beginPath();
      this.ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) this.ctx.lineTo(path[i].x, path[i].y);
      if (closed) this.ctx.closePath();
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.restore();
    }

    drawScissorPreview() {
      if (!this.scissorStart || !this.scissorEnd) return;
      const a = this.scissorStart;
      const b = this.scissorEnd;
      this.ctx.save();
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.setLineDash([6 / this.scale, 4 / this.scale]);
      if (this.scissorMode === 'rect') {
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        this.ctx.strokeRect(x, y, w, h);
      } else if (this.scissorMode === 'circle') {
        const r = Math.hypot(b.x - a.x, b.y - a.y);
        this.ctx.beginPath();
        this.ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        this.ctx.stroke();
      } else {
        this.ctx.beginPath();
        this.ctx.moveTo(a.x, a.y);
        this.ctx.lineTo(b.x, b.y);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    drawLightSource() {
      if (!this.lightSource) return;
      const r = 6 / this.scale;
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.fillStyle = '#facc15';
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 1 / this.scale;
      this.ctx.arc(this.lightSource.x, this.lightSource.y, r, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      if (this.lightSourceSelected) {
        this.ctx.beginPath();
        this.ctx.strokeStyle = 'rgba(250, 204, 21, 0.7)';
        this.ctx.lineWidth = 1.5 / this.scale;
        this.ctx.arc(this.lightSource.x, this.lightSource.y, r * 1.8, 0, Math.PI * 2);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    getHandlePoints(bounds) {
      return [
        { key: 'nw', ...bounds.corners.nw },
        { key: 'ne', ...bounds.corners.ne },
        { key: 'se', ...bounds.corners.se },
        { key: 'sw', ...bounds.corners.sw },
        // SEL-1: edge-midpoint handles, derived from the corners so they stay
        // correct for rotated bounds.
        { key: 'n', ...this._edgeMidpoint(bounds, 'n') },
        { key: 'e', ...this._edgeMidpoint(bounds, 'e') },
        { key: 's', ...this._edgeMidpoint(bounds, 's') },
        { key: 'w', ...this._edgeMidpoint(bounds, 'w') },
      ];
    }

    _edgeMidpoint(bounds, edge) {
      const { nw, ne, se, sw } = bounds.corners;
      const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      switch (edge) {
        case 'n': return mid(nw, ne);
        case 'e': return mid(ne, se);
        case 's': return mid(sw, se);
        case 'w': return mid(nw, sw);
        default: return { x: bounds.center.x, y: bounds.center.y };
      }
    }

    getRotateHandlePoint(bounds) {
      const offset = 18 / this.scale;
      const center = bounds.center;
      const target = bounds.corners.ne;
      const vx = target.x - center.x;
      const vy = target.y - center.y;
      const len = Math.hypot(vx, vy) || 1;
      return { key: 'rotate', x: target.x + (vx / len) * offset, y: target.y + (vy / len) * offset };
    }

    getHandlePoint(handle, bounds) {
      const map = {
        nw: bounds.corners.nw,
        ne: bounds.corners.ne,
        se: bounds.corners.se,
        sw: bounds.corners.sw,
        n: this._edgeMidpoint(bounds, 'n'),
        e: this._edgeMidpoint(bounds, 'e'),
        s: this._edgeMidpoint(bounds, 's'),
        w: this._edgeMidpoint(bounds, 'w'),
      };
      return map[handle] || bounds.corners.se;
    }

    getResizeAnchor(handle, bounds) {
      const map = {
        nw: bounds.corners.se,
        ne: bounds.corners.sw,
        se: bounds.corners.nw,
        sw: bounds.corners.ne,
        // SEL-1: edge drags anchor on the opposite edge midpoint.
        n: this._edgeMidpoint(bounds, 's'),
        e: this._edgeMidpoint(bounds, 'w'),
        s: this._edgeMidpoint(bounds, 'n'),
        w: this._edgeMidpoint(bounds, 'e'),
      };
      return map[handle] || bounds.center;
    }

    // SEL-3: Flip Horizontal / Vertical command wrapper. Thin invoker only —
    // the geometry op lives in Lane C's window.Vectura.PathEditOps.flipLayers
    // (feature-detected; no-ops with a warning until it lands). ALL flip math
    // — path mirroring AND generative-layer scale negation — is the op's job,
    // keeping geometry out of renderer.js per the SPEC ownership note.
    //
    // FLIP-1/2 reconciliation (integration): flipLayers OWNS the single undo
    // checkpoint (app.pushHistory) + regen when given the app, and computes its
    // OWN selection-bounds center — so the renderer must NOT push its own
    // history (that produced a double undo step, violating SEL-3's "one undo
    // step") and must NOT pass a pivot. It reads the returned {changed} object
    // rather than testing `!== false` (the op never returns a bare boolean).
    flipSelection(axis) {
      const layers = this.getSelectedLayers();
      if (!layers.length) return false;
      const ops = window.Vectura && window.Vectura.PathEditOps;
      if (!ops || typeof ops.flipLayers !== 'function') {
        console.warn('[Renderer] flipSelection: Vectura.PathEditOps.flipLayers unavailable — flip skipped.');
        return false;
      }
      const ids = layers.map((l) => l.id);
      let changed = false;
      try {
        const res = ops.flipLayers(ids, axis, { app: this.app, engine: this.engine });
        changed = !!(res && res.changed);
      } catch (err) {
        console.warn('[Renderer] flipSelection: PathEditOps.flipLayers threw', err);
        return false;
      }
      if (this.onComputeDisplayGeometry) this.onComputeDisplayGeometry();
      else this.engine.computeAllDisplayGeometry?.();
      const primary = this.getSelectedLayer();
      if (primary) this.updateTransformInputs?.(primary);
      this.draw();
      return changed;
    }

    hitHandle(sx, sy, bounds) {
      const RESIZE_R = 10;
      const ROTATE_R = 28;
      const corners = [
        { key: 'nw', ...bounds.corners.nw },
        { key: 'ne', ...bounds.corners.ne },
        { key: 'se', ...bounds.corners.se },
        { key: 'sw', ...bounds.corners.sw },
      ];
      // Corners win over edge midpoints when the zones overlap (small boxes).
      for (const c of corners) {
        const sc = this.worldToScreen(c.x, c.y);
        if (Math.hypot(sx - sc.x, sy - sc.y) <= RESIZE_R) return c.key;
      }
      // SEL-1: edge-midpoint resize zones.
      for (const edge of ['n', 'e', 's', 'w']) {
        const pt = this._edgeMidpoint(bounds, edge);
        const sc = this.worldToScreen(pt.x, pt.y);
        if (Math.hypot(sx - sc.x, sy - sc.y) <= RESIZE_R) return edge;
      }
      let world = null;
      for (const c of corners) {
        const sc = this.worldToScreen(c.x, c.y);
        if (Math.hypot(sx - sc.x, sy - sc.y) <= ROTATE_R) {
          if (!world) world = this.screenToWorld(sx, sy);
          if (!this.pointInBounds(world, bounds)) return `rotate-${c.key}`;
        }
      }
      return null;
    }

    hit3DRotationControl(sx, sy, layer = null, bounds = null) {
      const targetLayer = layer || this.getSelectedLayer();
      const targetBounds = bounds || (targetLayer ? this.getSelectionBounds([targetLayer]) : null);
      const control = this.get3DRotationControl(targetLayer, targetBounds);
      if (!control) return null;
      // BUG 3 — the drag must write to the scene GROUP (nested camera / selected-
      // object spec), so return the owner group as hit.layer when a scene
      // descendant is active. Non-scene layers resolve to themselves.
      const hitLayer = this._sceneRotationOwner(targetLayer) || targetLayer;
      const unit = 1 / Math.max(this.scale || 1, 0.001);
      const world = this.screenToWorld(sx, sy);
      const centerDist = Math.hypot(world.x - control.center.x, world.y - control.center.y);
      if (centerDist <= 5 * unit) {
        return { type: 'orbit', layer: hitLayer, spec: control.spec, control };
      }
      const yawDist = Math.hypot(world.x - control.yawMarker.x, world.y - control.yawMarker.y);
      const pitchDist = Math.hypot(world.x - control.pitchMarker.x, world.y - control.pitchMarker.y);
      const markerHits = [];
      if (yawDist <= 9 * unit) markerHits.push({ distance: yawDist, type: 'yaw' });
      if (pitchDist <= 9 * unit) markerHits.push({ distance: pitchDist, type: 'pitch' });
      if (markerHits.length) {
        markerHits.sort((a, b) => a.distance - b.distance);
        return { type: markerHits[0].type, layer: hitLayer, spec: control.spec, control };
      }
      if (control.rollHandle) {
        const rollDist = Math.hypot(world.x - control.rollHandle.x, world.y - control.rollHandle.y);
        if (rollDist <= 9 * unit) {
          return { type: 'roll', layer: hitLayer, spec: control.spec, control };
        }
        if (Math.abs(centerDist - control.ringRadius) <= 5 * unit) {
          return { type: 'roll', layer: hitLayer, spec: control.spec, control };
        }
      }
      if (centerDist <= control.padRadius + 7 * unit) {
        return { type: 'orbit', layer: hitLayer, spec: control.spec, control };
      }
      return null;
    }

    begin3DRotationDrag(hit, event) {
      if (!hit?.layer || !hit.spec) return false;
      const { layer, spec, control } = hit;
      const rect = this.canvas.getBoundingClientRect();
      const startWorld = this.screenToWorld(
        (event?.clientX ?? 0) - rect.left,
        (event?.clientY ?? 0) - rect.top
      );
      const rollAngle = Math.atan2(startWorld.y - control.center.y, startWorld.x - control.center.x);
      const startRot = this._read3DRotation(layer, spec);
      this.rotation3DDrag = {
        type: hit.type,
        layerId: layer.id,
        spec,
        center: { ...control.center },
        yawRadiusX: control.yawRadiusX,
        yawRadiusY: control.yawRadiusY,
        pitchTrackHeight: control.pitchTrackHeight,
        startClient: { x: event?.clientX ?? 0, y: event?.clientY ?? 0 },
        startYaw: normalizeDegrees(startRot.yaw),
        startPitch: clamp(
          finiteNumber(startRot.pitch, spec.pitchDefault),
          spec.pitchMin,
          spec.pitchMax
        ),
        startRoll: startRot.hasRoll ? normalizeDegrees(startRot.roll) : 0,
        startRollAngle: rollAngle,
        historyPushed: false,
        moved: false,
      };
      this.setCanvasCursor('grabbing', 'rotate-3d');
      return true;
    }

    apply3DRotationDrag(event = {}) {
      const drag = this.rotation3DDrag;
      if (!drag) return false;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (!layer?.params) return false;
      const modifiers = this.getModifierState(event);
      const dx = (event.clientX ?? drag.startClient.x) - drag.startClient.x;
      const dy = (event.clientY ?? drag.startClient.y) - drag.startClient.y;
      if (!drag.moved && Math.hypot(dx, dy) < 1) return true;
      if (!drag.historyPushed) {
        if (this.app?.pushHistory) this.app.pushHistory();
        else if (this.onCommitTransform) this.onCommitTransform();
        drag.historyPushed = true;
      }
      drag.moved = true;

      if (drag.type === 'roll' && (drag.spec.rollParam || drag.spec.nested)) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = (event.clientX ?? drag.startClient.x) - rect.left;
        const sy = (event.clientY ?? drag.startClient.y) - rect.top;
        const world = this.screenToWorld(sx, sy);
        const angle = Math.atan2(world.y - drag.center.y, world.x - drag.center.x);
        let delta = ((angle - drag.startRollAngle) * 180) / Math.PI;
        if (modifiers.shift) delta = Math.round(delta / 15) * 15;
        this._write3DRotation(layer, drag.spec, { roll: tidyDegrees(normalizeDegrees(drag.startRoll + delta)) });
      } else if (drag.type === 'yaw') {
        const rect = this.canvas.getBoundingClientRect();
        const sx = (event.clientX ?? drag.startClient.x) - rect.left;
        const sy = (event.clientY ?? drag.startClient.y) - rect.top;
        const world = this.screenToWorld(sx, sy);
        const nx = (world.x - drag.center.x) / Math.max(1e-6, drag.yawRadiusX || 1);
        const ny = (world.y - drag.center.y) / Math.max(1e-6, drag.yawRadiusY || 1);
        let nextYaw = normalizeDegrees((Math.atan2(nx, ny) * 180) / Math.PI);
        if (modifiers.shift) nextYaw = Math.round(nextYaw / 15) * 15;
        this._write3DRotation(layer, drag.spec, { yaw: tidyDegrees(normalizeDegrees(nextYaw)) });
      } else if (drag.type === 'pitch') {
        const rect = this.canvas.getBoundingClientRect();
        const sy = (event.clientY ?? drag.startClient.y) - rect.top;
        const world = this.screenToWorld(0, sy);
        const pitchSpan = Math.max(1, drag.spec.pitchMax - drag.spec.pitchMin);
        const pitchT = clamp(0.5 - ((world.y - drag.center.y) / Math.max(1e-6, drag.pitchTrackHeight || 1)), 0, 1);
        let nextPitch = drag.spec.pitchMin + pitchT * pitchSpan;
        if (modifiers.shift) nextPitch = Math.round(nextPitch / 15) * 15;
        this._write3DRotation(layer, drag.spec, { pitch: tidyDegrees(clamp(nextPitch, drag.spec.pitchMin, drag.spec.pitchMax)) });
      } else {
        const sensitivity = modifiers.alt ? 0.18 : 0.45;
        let nextYaw = normalizeDegrees(drag.startYaw + dx * sensitivity);
        let nextPitch = clamp(drag.startPitch - dy * sensitivity, drag.spec.pitchMin, drag.spec.pitchMax);
        if (modifiers.shift) {
          nextYaw = Math.round(nextYaw / 15) * 15;
          nextPitch = Math.round(nextPitch / 15) * 15;
        }
        this._write3DRotation(layer, drag.spec, {
          yaw: tidyDegrees(normalizeDegrees(nextYaw)),
          pitch: tidyDegrees(clamp(nextPitch, drag.spec.pitchMin, drag.spec.pitchMax)),
        });
      }

      // scene3d: coalesce on rAF at DRAFT detail (same path as the ground-drag
      // regen). An uncoalesced per-move synchronous full-quality regen stalls the
      // orbit and drops frames, so objects/shadows flicker and vanish mid-drag.
      // Other 3D layers (polyhedron/topoform/…) keep the cheap synchronous
      // preview regen — their meshes are light enough not to stall.
      if (layer.type === 'scene3d') {
        this._scheduleSceneDragRegen(layer.id);
      } else {
        this.engine.generate(layer.id, { preview: true });
        this.draw();
      }
      this.app?.ui?.updateFormula?.();
      this.app?.ui?._activePresetGalleryRefresh?.();
      this.show3DRotationDragTooltip(layer, drag, event);
      return true;
    }

    show3DRotationDragTooltip(layer, drag, event = {}) {
      if (!layer?.params || !drag?.spec) return;
      // Axis naming matches the panel sliders: X = pitch/tilt, Y = yaw/rotate,
      // Z = roll (the standard Photoshop/After Effects/Blender convention).
      const rot = this._read3DRotation(layer, drag.spec);
      const rotY = Math.round(rot.yaw ?? 0);
      const rotX = Math.round(rot.pitch ?? 0);
      if (drag.type === 'roll' && rot.hasRoll) {
        this.showDragTooltip(`Z ${Math.round(rot.roll ?? 0)}°`, event.clientX ?? 0, event.clientY ?? 0);
        return;
      }
      if (drag.type === 'yaw') {
        this.showDragTooltip(`Y ${rotY}°`, event.clientX ?? 0, event.clientY ?? 0);
        return;
      }
      if (drag.type === 'pitch') {
        this.showDragTooltip(`X ${rotX}°`, event.clientX ?? 0, event.clientY ?? 0);
        return;
      }
      this.showDragTooltip(`X ${rotX}°  Y ${rotY}°`, event.clientX ?? 0, event.clientY ?? 0);
    }

    end3DRotationDrag() {
      const drag = this.rotation3DDrag;
      this.rotation3DDrag = null;
      this.hideDragTooltip();
      if (!drag) return;
      // Cancel any coalesced draft regen still queued from the last move so it
      // can't fire after — and clobber — the full-quality release regen below.
      if (this._sceneDragRegenRaf != null) {
        const cancel = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
        cancel(this._sceneDragRegenRaf);
        this._sceneDragRegenRaf = null;
      }
      this._sceneDragRegenLayerId = null;
      const layer = this.engine.layers.find((l) => l.id === drag.layerId);
      if (layer && drag.historyPushed) {
        this.engine.generate(layer.id);
        this.app?.ui?.buildControls?.();
        this.app?.ui?.updateFormula?.();
        this.app?.ui?._activePresetGalleryRefresh?.();
      }
      this.updateCursor();
      this.draw();
    }

    getHandleVector(handle, bounds) {
      const center = bounds.center;
      const pt = this.getHandlePoint(handle, bounds);
      if (!pt) return { x: 1, y: 1 };
      return { x: pt.x - center.x, y: pt.y - center.y };
    }

    getBoundsCenter(bounds) {
      return bounds.center || { x: 0, y: 0 };
    }

    pointInBounds(pt, bounds) {
      const dx = pt.x - bounds.origin.x;
      const dy = pt.y - bounds.origin.y;
      const cosR = Math.cos(bounds.rotation);
      const sinR = Math.sin(bounds.rotation);
      const localX = dx * cosR + dy * sinR;
      const localY = -dx * sinR + dy * cosR;
      return localX >= bounds.minX && localX <= bounds.maxX && localY >= bounds.minY && localY <= bounds.maxY;
    }

    rectContainsPoint(rect, pt) {
      return pt.x >= rect.x && pt.x <= rect.x + rect.w && pt.y >= rect.y && pt.y <= rect.y + rect.h;
    }

    segmentsIntersect(a, b, c, d) {
      const cross = (p1, p2, p3) => (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
      const d1 = cross(a, b, c);
      const d2 = cross(a, b, d);
      const d3 = cross(c, d, a);
      const d4 = cross(c, d, b);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
      const onSegment = (p1, p2, p3) =>
        Math.min(p1.x, p2.x) <= p3.x &&
        p3.x <= Math.max(p1.x, p2.x) &&
        Math.min(p1.y, p2.y) <= p3.y &&
        p3.y <= Math.max(p1.y, p2.y);
      if (d1 === 0 && onSegment(a, b, c)) return true;
      if (d2 === 0 && onSegment(a, b, d)) return true;
      if (d3 === 0 && onSegment(c, d, a)) return true;
      if (d4 === 0 && onSegment(c, d, b)) return true;
      return false;
    }

    segmentIntersectsRect(a, b, rect) {
      if (this.rectContainsPoint(rect, a) || this.rectContainsPoint(rect, b)) return true;
      const r1 = { x: rect.x, y: rect.y };
      const r2 = { x: rect.x + rect.w, y: rect.y };
      const r3 = { x: rect.x + rect.w, y: rect.y + rect.h };
      const r4 = { x: rect.x, y: rect.y + rect.h };
      return (
        this.segmentsIntersect(a, b, r1, r2) ||
        this.segmentsIntersect(a, b, r2, r3) ||
        this.segmentsIntersect(a, b, r3, r4) ||
        this.segmentsIntersect(a, b, r4, r1)
      );
    }

    pathIntersectsRect(path, rect) {
      if (!Array.isArray(path) || path.length < 2) return false;
      for (let i = 0; i < path.length - 1; i++) {
        if (this.segmentIntersectsRect(path[i], path[i + 1], rect)) return true;
      }
      return false;
    }

    pointInPoly(point, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x;
        const yi = poly[i].y;
        const xj = poly[j].x;
        const yj = poly[j].y;
        const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-9) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    }

    segmentIntersectsPoly(a, b, poly) {
      if (this.pointInPoly(a, poly) || this.pointInPoly(b, poly)) return true;
      for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];
        if (this.segmentsIntersect(a, b, p1, p2)) return true;
      }
      return false;
    }

    pathIntersectsPoly(path, poly) {
      if (!Array.isArray(path) || path.length < 2) return false;
      for (let i = 0; i < path.length - 1; i++) {
        if (this.segmentIntersectsPoly(path[i], path[i + 1], poly)) return true;
      }
      return false;
    }

    distancePointToSegment(p, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
      const proj = { x: a.x + t * dx, y: a.y + t * dy };
      return Math.hypot(p.x - proj.x, p.y - proj.y);
    }

    circleIntersectsPoly(meta, poly) {
      const cx = meta.cx ?? meta.x;
      const cy = meta.cy ?? meta.y;
      const r = meta.r ?? Math.max(meta.rx ?? 0, meta.ry ?? 0);
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r)) return false;
      const center = { x: cx, y: cy };
      if (this.pointInPoly(center, poly)) return true;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        if (this.distancePointToSegment(center, a, b) <= r) return true;
      }
      return false;
    }

    layerIntersectsPoly(layer, poly) {
      if (!layer || !layer.visible) return false;
      return this.getInteractionPaths(layer).some((path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          return this.circleIntersectsPoly(path.meta, poly);
        }
        return this.pathIntersectsPoly(path, poly);
      });
    }

    _expandGroupSelection(layers) {
      if (this.groupEditMode) {
        return layers.filter((l) => l.parentId === this.groupEditMode.groupId);
      }
      const expandedIds = new Set();
      for (const layer of layers) {
        if (layer.parentId) {
          const parent = this.engine.layers.find((l) => l.id === layer.parentId);
          if (parent?.isGroup && parent.groupType === 'group') {
            const siblings = this.engine.getLayerChildren(layer.parentId)
              .filter((l) => l.visible && !this.isLayerLocked?.(l.id));
            siblings.forEach((s) => expandedIds.add(s.id));
            continue;
          }
        }
        expandedIds.add(layer.id);
      }
      return this.engine.layers.filter((l) => expandedIds.has(l.id));
    }

    selectLayersByPolygon(poly) {
      if (!poly || poly.length < 3) return;
      const selected = this.engine.layers.filter((layer) => this.layerIntersectsPoly(layer, poly));
      const toSelect = this._expandGroupSelection(selected);
      if (toSelect.length) {
        this.setSelection(
          toSelect.map((layer) => layer.id),
          toSelect[toSelect.length - 1].id
        );
      }
    }

    ellipseToPoly(rect, steps = 36) {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const rx = rect.w / 2;
      const ry = rect.h / 2;
      const pts = [];
      for (let i = 0; i < steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        pts.push({ x: cx + Math.cos(t) * rx, y: cy + Math.sin(t) * ry });
      }
      return pts;
    }

    circleIntersectsRect(meta, rect) {
      const cx = meta.cx ?? meta.x;
      const cy = meta.cy ?? meta.y;
      const r = meta.r ?? Math.max(meta.rx ?? 0, meta.ry ?? 0);
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r)) return false;
      if (this.rectContainsPoint(rect, { x: cx, y: cy })) return true;
      const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
      const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
      const dx = cx - closestX;
      const dy = cy - closestY;
      return dx * dx + dy * dy <= r * r;
    }

    layerIntersectsRect(layer, rect) {
      if (!layer || !layer.visible) return false;
      return this.getInteractionPaths(layer).some((path) => {
        if (path && path.meta && path.meta.kind === 'circle') {
          return this.circleIntersectsRect(path.meta, rect);
        }
        return this.pathIntersectsRect(path, rect);
      });
    }

    handleCursor(handle, bounds = null) {
      if (handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw') {
        const corner = bounds?.corners?.[handle];
        const center = bounds?.center;
        const fallback = (handle === 'nw' || handle === 'se') ? 'nwse-resize' : 'nesw-resize';
        if (!corner || !center) return fallback;
        const angleDeg = Math.atan2(corner.y - center.y, corner.x - center.x) * 180 / Math.PI;
        return this.cursorDataUrl('resize', 12, 12, fallback, angleDeg);
      }
      // SEL-1: edge-midpoint handles resize along one axis.
      if (handle === 'n' || handle === 'e' || handle === 's' || handle === 'w') {
        const fallback = (handle === 'n' || handle === 's') ? 'ns-resize' : 'ew-resize';
        const center = bounds?.center;
        if (!bounds?.corners || !center) return fallback;
        const pt = this._edgeMidpoint(bounds, handle);
        const angleDeg = Math.atan2(pt.y - center.y, pt.x - center.x) * 180 / Math.PI;
        return this.cursorDataUrl('resize', 12, 12, fallback, angleDeg);
      }
      if (typeof handle === 'string' && handle.startsWith('rotate-')) {
        const cornerKey = handle.slice('rotate-'.length);
        const corner = bounds?.corners?.[cornerKey];
        const center = bounds?.center;
        let angleDeg = -90;
        if (corner && center) {
          angleDeg = Math.atan2(corner.y - center.y, corner.x - center.x) * 180 / Math.PI;
        }
        return this.cursorDataUrl('rotate', 12, 12, 'crosshair', angleDeg);
      }
      return 'default';
    }

    // Returns true and applies the cursor if a modifier-key override is active
    // (Alt over Select → copy-plus, CMD over fill → microscope). Callers should
    // bail when this returns true.
    _applyModifierCursorOverride(e = null) {
      if (!this.canvas) return false;
      // _modState is authoritative — it's always updated by keydown/keyup before
      // this runs. Falling back to e.metaKey would read a stale value from
      // _lastPointerEvent when CMD is released (that event still has metaKey:true).
      const altHeld = this._modState ? Boolean(this._modState.alt) : Boolean(e?.altKey);
      const metaHeld = this._modState ? Boolean(this._modState.meta) : Boolean(e?.metaKey || e?.ctrlKey);
      // Arch-5: delegate to recomputeCursor for the override decision so all
      // cursor logic lives in one place. We only commit the write when the
      // result is one of the modifier-override sentinels.
      const result = this.recomputeCursor({
        tool: this.activeTool,
        isPan: this.isPan,
        isLayerDrag: this.isLayerDrag,
        isSelecting: this.isSelecting,
        modState: { alt: altHeld, meta: metaHeld },
      });
      if (result.mode === 'select-copy' || result.mode === 'fill-pickup') {
        this.setCanvasCursor(result.cursor, result.mode);
        return true;
      }
      return false;
    }

    updateHoverCursor(e) {
      if (!this.canvas) return;
      const modifiers = this.getModifierState(e);
      if (this._applyModifierCursorOverride(e)) return;
      if (this.activeTool === 'hand') {
        this.setCanvasCursor(this.isPan ? 'grabbing' : 'grab');
        return;
      }
      if (this.activeTool === 'pen' && !modifiers.meta && this.penMode === 'draw') {
        this.setCanvasCursor('crosshair');
        return;
      }
      if (`${this.activeTool}`.startsWith('shape-')) {
        this.setCanvasCursor(makeShapeReticleCursor(getThemeToken('--render-cursor-stroke', 'white')), 'shape-reticle');
        return;
      }
      if (this.activeTool === 'scissor' || this.activeTool === 'lasso') {
        this.setCanvasCursor('crosshair');
        return;
      }
      if (this.activeTool === 'type') {
        // I-beam for both contexts (over-text = edit, empty = create). Without
        // this branch a real hover falls through to the crosshair default.
        this.setCanvasCursor('text', 'type');
        return;
      }
      if (this.activeTool === 'fill' || this.activeTool === 'fill-erase' ||
          this.activeTool === 'fill-pattern' || this.activeTool === 'fill-pattern-erase') {
        return;
      }
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.screenToWorld(sx, sy);
      if (this.activeTool === 'direct') {
        const selectedShape = this.getSelectedShapeLayer();
        if (selectedShape) {
          const cornerHit = this.hitShapeCornerHandle(world, selectedShape, 0);
          if (cornerHit) {
            // Style-specific corner cursor only — the radius label is shown
            // while dragging, never on hover.
            this.setCanvasCursor(this.cursorDataUrl('cornerRadius', 4, 4, 'pointer', cornerHit.cornerType));
            return;
          }
        }
        if (!selectedShape && this.directSelection && !this.directSelection.meta?.shape) {
          const freeHit = this.hitFreeformCornerHandle(world);
          if (freeHit) {
            this.setCanvasCursor(this.cursorDataUrl('cornerRadius', 4, 4, 'pointer', freeHit.cornerType));
            return;
          }
        }
        const control = this.hitDirectControl(world);
        if (control) {
          this.setCanvasCursor(control.type === 'anchor' ? 'move' : 'pointer');
          return;
        }
        const hit = this.findPathHitAtPoint(world);
        if (hit) {
          this.setCanvasCursor('move');
        } else {
          this.setCanvasCursor(this.cursorDataUrl('outline', 4, 4, 'auto'), 'direct');
        }
        return;
      }
      if (this.activeTool === 'pen' && this.penMode !== 'draw' && !modifiers.meta) {
        const control = this.hitDirectControl(world);
        if (control) {
          this.setCanvasCursor(this.penMode === 'delete' ? 'not-allowed' : 'pointer');
          return;
        }
        this.findPathHitAtPoint(world, {
          restrictToLayerId: this.directSelection?.layerId || null,
        });
        this.setCanvasCursor('crosshair');
        return;
      }
      if (this.hitLightSource(world)) {
        this.setCanvasCursor(this.isLightDrag ? 'grabbing' : 'move');
        return;
      }
      if (this.activeTool === 'select' && this.getActiveModifierLayer()) {
        const hitGuide = this.hitModifierGuide(world);
        if (hitGuide) {
          if (hitGuide.type === 'rotate') {
            this.setCanvasCursor('grab');
            return;
          }
          this.setCanvasCursor(
            hitGuide.guide.locked ? 'not-allowed' :
            hitGuide.type === 'flip' ? 'pointer' :
            (hitGuide.type === 'latticeA' || hitGuide.type === 'latticeB' || hitGuide.type === 'wallpaperRotate') ? 'crosshair' :
            'move'
          );
          return;
        }
      }
      const activeLayers = this.getSelectedLayers();
      if (!activeLayers.length) {
        if (this.activeTool === 'select') {
          this.setCanvasCursor(this.cursorDataUrl('filled', 4, 4, 'auto'), 'select');
        } else {
          this.setCanvasCursor('crosshair');
        }
        return;
      }
      if (this.activeTool === 'select' && activeLayers.length === 1) {
        const shapeLayer = this.getSelectedShapeLayer();
        if (shapeLayer) {
          const cornerHit = this.hitShapeCornerHandle(world, shapeLayer, 0);
          if (cornerHit) {
            this.setCanvasCursor(this.cursorDataUrl('cornerRadius', 4, 4, 'pointer', cornerHit.cornerType));
            return;
          }
        }
      }
      const bounds = this.getSelectionBounds(activeLayers, this.tempTransform);
      // BUG 3 (hover half) — the orbit gizmo draws and hit-tests without 2D
      // bounds on a scene layer (its geometry lives in scenePaths), so its
      // cursor affordance must be resolved BEFORE the no-bounds early return.
      // Behind that return the gizmo gave zero hover feedback on a scene tree.
      // get3DRotationControl still returns null for a non-scene layer without
      // bounds.corners, so 2D layers keep the original cursor behavior.
      if (this.activeTool === 'select' && activeLayers.length === 1 && !this.isLayerLocked?.(activeLayers[0].id)) {
        const rotation3DHit = this.hit3DRotationControl(sx, sy, activeLayers[0], bounds || null);
        if (rotation3DHit) {
          this.setCanvasCursor('grab', 'rotate-3d');
          return;
        }
      }
      if (!bounds) {
        if (this.activeTool === 'select') {
          this.setCanvasCursor(this.cursorDataUrl('filled', 4, 4, 'auto'), 'select');
        }
        return;
      }
      const handle = this.hitHandle(sx, sy, bounds);
      if (handle) {
        const mode = handle.startsWith('rotate') ? 'rotate' : 'resize';
        this.setCanvasCursor(this.handleCursor(handle, bounds), mode);
        return;
      }
      if (this.pointInBounds(world, bounds)) {
        this.setCanvasCursor(activeLayers.length > 1 ? 'grab' : 'move');
        return;
      }
      if (this.activeTool === 'select') {
        this.setCanvasCursor(this.cursorDataUrl('filled', 4, 4, 'auto'), 'select');
      } else {
        this.setCanvasCursor('crosshair');
      }
    }

    updateTransformInputs(layer) {
      const posX = document.getElementById('inp-pos-x');
      const posY = document.getElementById('inp-pos-y');
      const scaleX = document.getElementById('inp-scale-x');
      const scaleY = document.getElementById('inp-scale-y');
      const rotation = document.getElementById('inp-rotation');
      const UU = (window.Vectura && window.Vectura.UnitUtils) || {};
      const settings = (window.Vectura && window.Vectura.SETTINGS) || {};
      const units = UU.normalizeDocumentUnits ? UU.normalizeDocumentUnits(settings.documentUnits) : 'metric';
      const formatLen = (v) => {
        if (!UU.formatDocumentLength) return v;
        return UU.formatDocumentLength(v, units, { includeUnit: false, trimTrailingZeros: true });
      };
      if (posX) posX.value = formatLen(layer.params.posX);
      if (posY) posY.value = formatLen(layer.params.posY);
      if (scaleX) scaleX.value = layer.params.scaleX;
      if (scaleY) scaleY.value = layer.params.scaleY;
      if (rotation) rotation.value = layer.params.rotation;
    }
  }

  // Drawing-order reveal: turn raw per-layer draw records into the plot TIMELINE
  // a plotter (and the SVG export window) actually traces, so the draw-order
  // slider tracks real plot time — pen-down draw time plus pen-up travel time —
  // in true print order rather than raw layer-stack vertex count.
  //
  // Ordering mirrors UI.getExportSnapshot: group by pen (first-appearance order),
  // then — when a group's paths carry pen/combined line-sort metadata — interleave
  // them by lineSortOrder (tie-broken by layer order, then path index). The flat
  // print sequence is then walked once to accumulate time: each path contributes
  // travel time from the previous path's end to its start (gap ÷ travelSpeed),
  // then draw time (length ÷ drawSpeed).
  //
  // Returns { info: Map(path → { drawStart, penDownTime, length }), total, threshold }
  // where total is the whole-document plot time and threshold = total × drawProgress.
  // Pure and reference-keyed so the caller can decouple the reveal from its
  // layer-by-layer draw loop. Each record is
  // { path, penKey, layerSeq, pathIndex, length, start, end, lineSortOrder, lineSortGrouping, optimized }.
  // THE plot order. Single source of truth for "what order does the pen visit
  // these paths" — the draw-order colour preview, the draw-order playback reveal
  // and the SVG export all order through this one function, so the three can no
  // longer disagree about what will actually be plotted (a bug the user saw as
  // "the colours say top-to-bottom but playback starts at the bottom").
  //
  // Pen grouping is the OUTER key and legitimately outranks the line-sort
  // direction: a plotter must finish a pen before it can be swapped, so a
  // "Combined" line sort can only interleave WITHIN a pen group, never across
  // pens. `records` are the { path, penKey, layerSeq, pathIndex, lineSortOrder,
  // lineSortGrouping, optimized, ... } records buildPlotRecords produces.
  // Returns a new flat array; the input array is not mutated.
  Renderer.buildPlotSequence = function buildPlotSequence(records) {
    const groupOrder = [];
    const groups = new Map();
    (records || []).forEach((rec) => {
      const penKey = rec.penKey || 'default';
      if (!groups.has(penKey)) {
        groups.set(penKey, []);
        groupOrder.push(penKey);
      }
      groups.get(penKey).push(rec);
    });
    const seq = [];
    groupOrder.forEach((penKey) => {
      const items = groups.get(penKey);
      const interleave = items.some((it) => it.optimized
        && (it.lineSortGrouping === 'pen' || it.lineSortGrouping === 'combined'));
      if (interleave) {
        items.sort((a, b) => {
          const ao = Number.isFinite(a.lineSortOrder) ? a.lineSortOrder : Number.MAX_SAFE_INTEGER;
          const bo = Number.isFinite(b.lineSortOrder) ? b.lineSortOrder : Number.MAX_SAFE_INTEGER;
          if (ao !== bo) return ao - bo;
          if (a.layerSeq !== b.layerSeq) return a.layerSeq - b.layerSeq;
          return a.pathIndex - b.pathIndex;
        });
      }
      items.forEach((it) => seq.push(it));
    });
    return seq;
  };

  Renderer.computePlotRevealOrder = function computePlotRevealOrder(records, opts) {
    const o = opts || {};
    const drawSpeed = o.drawSpeed > 0 ? o.drawSpeed : 1;
    const travelSpeed = o.travelSpeed > 0 ? o.travelSpeed : drawSpeed;
    // Flatten the pen groups into one print-order sequence.
    const seq = Renderer.buildPlotSequence(records);
    // Walk the sequence to build the time line: pen-up travel, then pen-down draw.
    const info = new Map();
    let cursor = 0;
    let prevEnd = null;
    seq.forEach((it) => {
      if (prevEnd && it.start) {
        const dx = it.start.x - prevEnd.x;
        const dy = it.start.y - prevEnd.y;
        cursor += Math.hypot(dx, dy) / travelSpeed;
      }
      const drawStart = cursor;
      const penDownTime = (it.length || 0) / drawSpeed;
      cursor += penDownTime;
      info.set(it.path, { drawStart, penDownTime, length: it.length || 0 });
      prevEnd = it.end || prevEnd;
    });
    const total = cursor;
    const frac = Number.isFinite(o.drawProgress) ? o.drawProgress : 1;
    return { info, total, threshold: total * frac };
  };

  // Truncate a path to `revealLen` arc length for the draw-order reveal,
  // interpolating the segment the cutoff lands inside. Returns the truncated
  // point array (carrying a COPY of the source meta), or null when the slice
  // would be too short to draw.
  //
  // Native-cubic outlines (text glyphs, morph rings) store their TRUE curve in
  // meta.anchors; the point array is only a sparse chord cache. Slicing that
  // cache produced a visibly FACETED in-progress tip that did not match the
  // smooth displayed curve. So when the path carries real bezier handles we
  // first densely flatten it into the exact polyline tracePath would render via
  // bezierCurveTo (GeometryUtils.flattenSmoothedPath), then truncate THAT dense
  // polyline. finalizeFlattened tags the result meta.straight and drops its
  // anchors/forceCurves, so the tip still reveals progressively as a truncated
  // polyline — a curved glyph can NOT pop in whole. Plain polylines (no handles)
  // slice exactly as before. The source path is never mutated.
  Renderer.sliceRevealPath = function sliceRevealPath(path, revealLen) {
    if (!Array.isArray(path) || path.length <= 1) return path;
    const flatten = window.Vectura?.GeometryUtils?.flattenSmoothedPath;
    const anchors = path.meta?.anchors;
    const hasHandles = Array.isArray(anchors) && anchors.length >= 2
      && anchors.some((a) => a && (a.in || a.out));
    const src = (flatten && hasHandles && path.meta?.kind !== 'circle' && !path.meta?.straight)
      ? flatten(path)
      : path;
    if (!Array.isArray(src) || src.length <= 1) return src;
    const sliced = [src[0]];
    if (revealLen > 0) {
      let acc = 0;
      for (let i = 1; i < src.length; i++) {
        const a = src[i - 1]; const b = src[i];
        const seg = Math.hypot(b.x - a.x, b.y - a.y);
        if (acc + seg >= revealLen) {
          const t = seg > 0 ? (revealLen - acc) / seg : 0;
          sliced.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
          acc = -1;
          break;
        }
        sliced.push(b);
        acc += seg;
      }
      // Cutoff never reached (revealLen ≥ full length): the whole polyline draws.
      if (acc >= 0) return src;
    }
    if (sliced.length < 2) return null;
    if (src.meta) {
      const meta = { ...src.meta };
      delete meta.anchors;
      delete meta.forceCurves;
      sliced.meta = meta;
    }
    return sliced;
  };

  // Arc length used to PACE the draw-order reveal. Native-cubic outlines (text
  // glyphs, morph rings) are truncated along their DENSE flattened arc in
  // sliceRevealPath; that arc is slightly longer than the sparse chord cache that
  // OptimizationUtils.pathLength measures. Pacing the pen-reach window against the
  // SAME dense arc keeps the reveal cutoff aligned with the arc the in-progress
  // tip is sliced along — otherwise the final few percent of a curved glyph
  // "pops" in at the fully-drawn transition. Plain polylines / circles / already
  // -flattened paths fall through to the plain chord length.
  Renderer.revealPathLength = function revealPathLength(path) {
    const PU = window.Vectura?.OptimizationUtils;
    const chordLen = PU?.pathLength ? PU.pathLength(path) : 0;
    const flatten = window.Vectura?.GeometryUtils?.flattenSmoothedPath;
    const anchors = path && path.meta ? path.meta.anchors : null;
    const hasHandles = Array.isArray(anchors) && anchors.length >= 2
      && anchors.some((a) => a && (a.in || a.out));
    if (flatten && hasHandles && path.meta.kind !== 'circle' && !path.meta.straight) {
      const flat = flatten(path);
      return PU?.pathLength ? PU.pathLength(flat) : chordLen;
    }
    return chordLen;
  };

  // Draw-Order overlay gradient: colour is keyed on where each path sits among
  // its siblings (index/total). That works well for algorithms that emit many
  // short strokes (flowfield, boids, hyphae — hundreds/thousands of paths), but
  // single-stroke algorithms (Pendula/Harmonograph, Attractor) emit their ENTIRE
  // drawing as one (however long) optimized path — index/total then collapses
  // to a single flat colour and the gradient's far stop never appears. Splitting
  // each path into point-count-sized runs gives the gradient somewhere to sweep
  // across even when there's only one source path, while leaving the common
  // case (many short paths) at ~1 chunk per path, unchanged.
  //
  // Native-cubic paths (real bezier handles) are densely flattened first — the
  // same GeometryUtils.flattenSmoothedPath helper Renderer.sliceRevealPath uses
  // to truncate the in-progress reveal tip — then chunked like any other
  // polyline. Leaving them whole used to be "fine" for multi-path layers, but
  // Harmonograph/Pendula default to curves:true AND emit a single anchored
  // path: left whole, that lone path became the only chunk, collapsing the
  // WHOLE drawing to the gradient's flat midpoint colour (t=0.5) the moment
  // drawProgress reached 1 (the raw anchored path, not yet stripped/truncated
  // by sliceRevealPath, finally reached the overlay unflattened). Circle points
  // still don't chunk — there's no polyline to sweep across.
  Renderer.buildLineSortGradientChunks = function buildLineSortGradientChunks(items, opts = {}) {
    const pointsPerChunk = Math.max(4, opts.pointsPerChunk || 40);
    const chunks = [];
    let totalWeight = 0;
    const flatten = window.Vectura?.GeometryUtils?.flattenSmoothedPath;
    (items || []).forEach((item) => {
      const isCircle = Boolean(item.path && item.path.meta && item.path.meta.kind === 'circle');
      let path = item.path;
      if (!isCircle && Array.isArray(path)) {
        const anchors = path.meta ? path.meta.anchors : null;
        const hasHandles = Array.isArray(anchors) && anchors.some((a) => a && (a.in || a.out));
        if (hasHandles && flatten) {
          const flat = flatten(path);
          if (Array.isArray(flat) && flat.length >= 2) path = flat;
        }
      }
      if (!Array.isArray(path) || isCircle || path.length <= 2) {
        chunks.push({ ...item, path, weight: 1 });
        totalWeight += 1;
        return;
      }
      const segs = path.length - 1;
      const chunkCount = Math.max(1, Math.round(segs / pointsPerChunk));
      const step = segs / chunkCount;
      for (let c = 0; c < chunkCount; c++) {
        const from = Math.round(c * step);
        const to = c === chunkCount - 1 ? segs : Math.round((c + 1) * step);
        if (to <= from) continue;
        const slice = path.slice(from, to + 1);
        if (slice.length < 2) continue;
        const weight = slice.length - 1;
        chunks.push({ ...item, path: slice, weight });
        totalWeight += weight;
      }
    });
    const total = Math.max(1, totalWeight);
    let cursor = 0;
    return chunks.map(({ weight, ...rest }) => {
      const t = (cursor + weight / 2) / total;
      cursor += weight;
      return { ...rest, t };
    });
  };

  const Vectura = (window.Vectura = window.Vectura || {});
  Vectura.Renderer = Renderer;
  // Test-only surface: lets unit tests poke the token cache without standing
  // up a full Renderer instance. Production code should keep calling the
  // closure-local `getThemeToken` directly.
  Renderer.__tokenCache = {
    get: getThemeToken,
    invalidate: invalidateThemeTokenCache,
  };
  // Test-only surface (Arch-6, audit-2026-05-20): the legacy
  // `window.Vectura.ShapeUtils` namespace looked like a public API but had
  // no production consumers — only unit tests reach in for white-box
  // geometry checks. Re-expose those helpers under a clearly-marked
  // test-only handle so the dead public-API surface stops being
  // advertised.
  Renderer.__shapeUtils = {
    buildRectangleVertices,
    buildPolygonVertices,
    getShapeVertices,
    getCornerDescriptors,
    buildShapeAnchors,
  };
})();
