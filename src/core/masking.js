/**
 * Layer masking helpers and silhouette providers.
 */
(() => {
  const OptimizationUtils = window.Vectura?.OptimizationUtils || {};
  const GeometryUtils = window.Vectura?.GeometryUtils || {};
  const PathBoolean = window.Vectura?.PathBoolean || {};

  const isClosedPath = OptimizationUtils.isClosedPath || (() => false);
  const clonePaths = GeometryUtils.clonePaths || ((paths) => (paths || []).map((path) => path));
  const closePolygonIfNeeded = PathBoolean.closePolygonIfNeeded || ((polygon) => polygon);
  const normalizePolygons = PathBoolean.normalizePolygons || ((polygons) => polygons);
  const segmentPathByPolygons = PathBoolean.segmentPathByPolygons || ((path) => [path]);
  const unionPolygons = PathBoolean.unionPolygons || ((polygons) => polygons);

  const expandCircle = (meta, segments = 72) => {
    if (!meta) return [];
    const cx = meta.cx ?? meta.x ?? 0;
    const cy = meta.cy ?? meta.y ?? 0;
    const rx = meta.rx ?? meta.r ?? 0;
    const ry = meta.ry ?? meta.r ?? rx;
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) {
      return [];
    }
    const polygon = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      polygon.push({
        x: cx + Math.cos(theta) * rx,
        y: cy + Math.sin(theta) * ry,
      });
    }
    return closePolygonIfNeeded(polygon);
  };

  const pathToPolygon = (path) => {
    if (path?.meta?.kind === 'circle') return expandCircle(path.meta);
    if (!Array.isArray(path) || path.length < 3) return [];
    if (path.meta?.kind === 'polygon' || isClosedPath(path)) {
      return closePolygonIfNeeded(path);
    }
    if (path.meta?.anchors?.length >= 3 && path.meta?.closed) {
      return closePolygonIfNeeded(path);
    }
    return [];
  };

  const buildClosedPathSilhouettes = (layer) => {
    const source = layer?.displayPaths?.length ? layer.displayPaths : layer?.effectivePaths?.length ? layer.effectivePaths : layer?.paths;
    const polygons = [];
    (source || []).forEach((path) => {
      const polygon = pathToPolygon(path);
      if (polygon.length >= 4) polygons.push(polygon);
    });
    return polygons;
  };

  const getLayerSilhouette = (layer, engine, bounds) => {
    if (!layer || layer.visible === false) return [];
    if (layer.isGroup) return getGroupSilhouette(layer, engine, bounds);
    return buildClosedPathSilhouettes(layer);
  };

  const getGroupSilhouette = (groupLayer, engine, bounds) => {
    if (!groupLayer || !engine?.layers) return [];
    const polygons = [];
    engine.layers.forEach((layer) => {
      if (layer.parentId !== groupLayer.id || layer.visible === false) return;
      const next = layer.isGroup ? getGroupSilhouette(layer, engine, bounds) : getLayerSilhouette(layer, engine, bounds);
      next.forEach((polygon) => polygons.push(polygon));
    });
    return unionPolygons(polygons);
  };

  const getLayerMaskCapabilities = (layer, engine, bounds) => {
    if (!layer) return { canSource: false, reason: 'Missing layer', sourceType: null };
    if (layer.isGroup) {
      const polygons = getGroupSilhouette(layer, engine, bounds);
      return polygons.length
        ? { canSource: true, reason: '', sourceType: 'group-union' }
        : { canSource: false, reason: 'No visible silhouette-capable descendants', sourceType: null };
    }
    const polygons = buildClosedPathSilhouettes(layer);
    return polygons.length
      ? { canSource: true, reason: '', sourceType: 'closed-shape' }
      : { canSource: false, reason: 'This layer has no closed silhouette yet', sourceType: null };
  };

  const buildMaskUnion = (sourceIds = [], engine, bounds) => {
    const polygons = [];
    const ids = new Set(sourceIds || []);
    (engine?.layers || []).forEach((layer) => {
      if (!ids.has(layer.id) || layer.visible === false) return;
      const next = getLayerSilhouette(layer, engine, bounds);
      next.forEach((polygon) => polygons.push(polygon));
    });
    return unionPolygons(polygons);
  };

  const getMaskingAncestors = (layer, engine, options = {}) => {
    if (!layer || !engine?.layers) return [];
    const excludedMaskLayerId = options.excludeMaskLayerId || null;
    const out = [];
    let current = layer;
    while (current?.parentId) {
      const parent = engine.layers.find((entry) => entry.id === current.parentId);
      if (!parent) break;
      if (
        parent.id !== excludedMaskLayerId
        && parent?.mask?.enabled
        && parent.maskCapabilities?.canSource
      ) {
        out.push(parent);
      }
      current = parent;
    }
    return out.reverse();
  };

  const buildLayerMaskedPaths = (layer, engine, bounds, options = {}) => {
    if (!layer) return [];
    const sourcePaths = clonePaths(
      options.sourcePaths
      || (Array.isArray(layer.effectivePaths) && layer.effectivePaths.length ? layer.effectivePaths : layer.paths || [])
    );
    const ancestorMasks = getMaskingAncestors(layer, engine, options);
    if (!ancestorMasks.length) return sourcePaths;
    let currentPaths = clonePaths(sourcePaths);
    ancestorMasks.forEach((maskLayer) => {
      const maskPolygons = getLayerSilhouette(maskLayer, engine, bounds);
      if (!maskPolygons.length) return;
      currentPaths = applyMaskToPaths(currentPaths, maskPolygons, { invert: true });
    });
    return currentPaths;
  };

  const applyMaskToPaths = (paths, maskPolygons, options = {}) => {
    const polygons = normalizePolygons(maskPolygons);
    if (!polygons.length) return clonePaths(paths || []);
    const out = [];
    (paths || []).forEach((path) => {
      if (!Array.isArray(path)) return;
      let workingPath = path;
      if (path.meta?.kind === 'circle' && path.length < 2) {
        const expanded = expandCircle(path.meta);
        if (!expanded.length) return;
        expanded.meta = { ...path.meta };
        delete expanded.meta.kind;
        workingPath = expanded;
      } else if (workingPath.meta?.kind === 'circle') {
        // Multi-point circle (e.g. shapepack) — clone with kind stripped so
        // clipped arc segments are treated as polygon paths, not full circles.
        const pts = workingPath.map((pt) => ({ x: pt.x, y: pt.y }));
        pts.meta = { ...workingPath.meta };
        delete pts.meta.kind;
        workingPath = pts;
      }
      if (workingPath.length < 2) return;
      const isLoop = Boolean(workingPath.meta?.kind === 'circle' || isClosedPath(workingPath));
      if (options.invert) {
        polygons.forEach((polygon) => {
          const segments = segmentPathByPolygons(workingPath, [polygon], { invert: true, closed: isLoop });
          segments.forEach((segment) => out.push(segment));
        });
        return;
      }
      const segments = segmentPathByPolygons(workingPath, polygons, { invert: false, closed: isLoop });
      segments.forEach((segment) => out.push(segment));
    });
    return out;
  };

  const api = {
    expandCircle,
    pathToPolygon,
    getLayerMaskCapabilities,
    getLayerSilhouette,
    getGroupSilhouette,
    buildMaskUnion,
    getMaskingAncestors,
    buildLayerMaskedPaths,
    applyMaskToPaths,
  };

  window.Vectura = window.Vectura || {};
  window.Vectura.Masking = {
    ...(window.Vectura.Masking || {}),
    ...api,
  };
})();
