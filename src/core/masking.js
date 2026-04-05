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

  const classifyHorizonRows = (paths = []) => {
    const taggedRows = (paths || [])
      .filter((path) => Array.isArray(path) && path.length >= 2 && path.meta?.horizonRole === 'row')
      .map((path) => {
        const xs = path.map((pt) => pt?.x).filter(Number.isFinite);
        const ys = path.map((pt) => pt?.y).filter(Number.isFinite);
        const minX = xs.length ? Math.min(...xs) : Number.NaN;
        const maxX = xs.length ? Math.max(...xs) : Number.NaN;
        return {
          path,
          minX,
          maxX,
          avgY: ys.length ? ys.reduce((sum, value) => sum + value, 0) / ys.length : Number.NaN,
          rangeX: xs.length ? maxX - minX : 0,
          rangeY: ys.length ? Math.max(...ys) - Math.min(...ys) : 0,
        };
      })
      .sort((a, b) => {
        const rowDelta = (a.path.meta?.horizonRowIndex ?? 0) - (b.path.meta?.horizonRowIndex ?? 0);
        return rowDelta || a.avgY - b.avgY;
      });
    if (taggedRows.length) return taggedRows;

    const rows = (paths || [])
      .filter((path) => Array.isArray(path) && path.length >= 2)
      .map((path) => {
        const xs = path.map((pt) => pt?.x).filter(Number.isFinite);
        const ys = path.map((pt) => pt?.y).filter(Number.isFinite);
        const minX = xs.length ? Math.min(...xs) : Number.NaN;
        const maxX = xs.length ? Math.max(...xs) : Number.NaN;
        const minY = ys.length ? Math.min(...ys) : Number.NaN;
        const maxY = ys.length ? Math.max(...ys) : Number.NaN;
        return {
          path,
          minX,
          maxX,
          avgY: ys.length ? ys.reduce((sum, value) => sum + value, 0) / ys.length : Number.NaN,
          rangeX: xs.length ? maxX - minX : 0,
          rangeY: ys.length ? maxY - minY : 0,
        };
      })
      .filter((entry) => entry.rangeX >= entry.rangeY && Number.isFinite(entry.avgY))
      .sort((a, b) => a.avgY - b.avgY);
    return rows;
  };

  const samplePathYAtX = (path = [], x) => {
    if (!Array.isArray(path) || path.length < 2 || !Number.isFinite(x)) return Number.NaN;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      if (!a || !b) continue;
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      if (x < minX || x > maxX) continue;
      if (Math.abs(b.x - a.x) < 1e-6) return Math.min(a.y, b.y);
      const t = (x - a.x) / (b.x - a.x);
      return a.y + (b.y - a.y) * t;
    }
    return Number.NaN;
  };

  const buildHorizonEnvelope = (path = [], bounds) => {
    if (!Array.isArray(path) || path.length < 2) return [];
    const xs = path.map((point) => point?.x).filter(Number.isFinite);
    if (!xs.length) return [];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX - minX < 1e-6) return [];
    const sampleCount = Math.max(64, Math.round((maxX - minX) / 4));
    const envelope = [];
    for (let index = 0; index <= sampleCount; index++) {
      const x = minX + ((maxX - minX) * index) / sampleCount;
      const y = samplePathYAtX(path, x);
      if (!Number.isFinite(y)) continue;
      const prev = envelope[envelope.length - 1];
      if (prev && Math.abs(prev.x - x) < 1e-6 && Math.abs(prev.y - y) < 1e-6) continue;
      envelope.push({ x, y });
    }
    if (!envelope.length) return [];

    const bottomY = bounds?.truncate ? bounds.height - bounds.m : bounds.height;
    return closePolygonIfNeeded([
      ...envelope,
      { x: envelope[envelope.length - 1].x, y: bottomY },
      { x: envelope[0].x, y: bottomY },
      { x: envelope[0].x, y: envelope[0].y },
    ]);
  };

  const buildHorizonSilhouette = (layer, bounds) => {
    if (layer?.params?.lineStructure === 'horizon-3d') {
      const explicitPolygons = normalizePolygons(clonePaths(layer?.maskPolygons || []));
      if (explicitPolygons.length) return unionPolygons(explicitPolygons);
    }
    const rows = classifyHorizonRows(layer?.displayPaths?.length ? layer.displayPaths : layer?.paths);
    if (!rows.length) return [];
    const polygon = buildHorizonEnvelope(rows[0].path, bounds);
    return polygon.length >= 4 ? [polygon] : [];
  };

  const buildClosedPathSilhouettes = (layer) => {
    const source = layer?.displayPaths?.length ? layer.displayPaths : layer?.paths;
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
    if (
      layer.type === 'wavetable'
      && (
        layer.params?.lineStructure === 'horizon'
        || layer.params?.lineStructure === 'horizontal-vanishing-point'
        || layer.params?.lineStructure === 'horizon-3d'
      )
    ) {
      return buildHorizonSilhouette(layer, bounds);
    }
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
    if (
      layer.type === 'wavetable'
      && (
        layer.params?.lineStructure === 'horizon'
        || layer.params?.lineStructure === 'horizontal-vanishing-point'
        || layer.params?.lineStructure === 'horizon-3d'
      )
    ) {
      return { canSource: true, reason: '', sourceType: 'terrain-envelope' };
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

  const applyMaskToPaths = (paths, maskPolygons, options = {}) => {
    const polygons = normalizePolygons(maskPolygons);
    if (!polygons.length) return clonePaths(paths || []);
    const out = [];
    (paths || []).forEach((path) => {
      if (!Array.isArray(path) || path.length < 2) return;
      const isLoop = Boolean(path.meta?.kind === 'circle' || isClosedPath(path));
      const segments = segmentPathByPolygons(path, polygons, { invert: options.invert, closed: isLoop });
      segments.forEach((segment) => out.push(segment));
    });
    return out;
  };

  const api = {
    expandCircle,
    pathToPolygon,
    samplePathYAtX,
    getLayerMaskCapabilities,
    getLayerSilhouette,
    getGroupSilhouette,
    buildMaskUnion,
    applyMaskToPaths,
  };

  window.Vectura = window.Vectura || {};
  window.Vectura.Masking = {
    ...(window.Vectura.Masking || {}),
    ...api,
  };
})();
