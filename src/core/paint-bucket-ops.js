/**
 * Paint bucket operations — cross-layer region detection, fill-record
 * authoring, and geometry expansion for `layer.fills[]`.
 *
 * Public API on window.Vectura.PaintBucketOps:
 *   - findFillTargetStack(engine, worldX, worldY)
 *   - applyFillAtPoint(engine, app, worldX, worldY, options)
 *   - buildFillRecord(targetEntry, fillParams)
 *   - generateGeometryForLayer(layer)
 *
 * Hover, click, and drag-pour live in the renderer; this module is the
 * geometry-and-data layer beneath them.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const polyContainsPoint = (poly, px, py) => {
    const fn = Vectura.AlgorithmRegistry?._polyContainsPoint;
    if (typeof fn === 'function') return fn(poly, px, py);
    if (!Array.isArray(poly) || poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x;
      const yi = poly[i].y;
      const xj = poly[j].x;
      const yj = poly[j].y;
      const intersect =
        ((yi > py) !== (yj > py)) &&
        (px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const isClosedRing = (path) => {
    if (!Array.isArray(path) || path.length < 3) return false;
    const first = path[0];
    const last = path[path.length - 1];
    if (!first || !last) return false;
    return Math.hypot((first.x ?? 0) - (last.x ?? 0), (first.y ?? 0) - (last.y ?? 0)) <= 0.5;
  };

  const shoelaceArea = (poly) => {
    if (!Array.isArray(poly) || poly.length < 3) return 0;
    let area = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      area += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
    }
    return Math.abs(area) / 2;
  };

  const clonePolygon = (poly) => poly.map((pt) => ({ x: pt.x, y: pt.y }));

  // Stable hash for the (layer + polygon) pair so drag-pour can detect
  // "did the cursor leave this region?" without keeping references to the
  // exact path object (which may be replaced on geometry recompute).
  const loopIdFor = (layerId, poly) => {
    if (!Array.isArray(poly) || !poly.length) return `${layerId}:empty`;
    const a = poly[0];
    const b = poly[Math.floor(poly.length / 2)] || a;
    const c = poly[poly.length - 1];
    return `${layerId}:${a.x.toFixed(2)},${a.y.toFixed(2)}:${b.x.toFixed(2)},${b.y.toFixed(2)}:${c.x.toFixed(2)},${c.y.toFixed(2)}`;
  };

  const docBoundsPolygon = (engine) => {
    const w = Number.isFinite(engine?.docW) ? engine.docW
      : Number.isFinite(engine?.currentProfile?.width) ? engine.currentProfile.width
        : Number.isFinite(Vectura.SETTINGS?.paperWidth) ? Vectura.SETTINGS.paperWidth
          : 297;
    const h = Number.isFinite(engine?.docH) ? engine.docH
      : Number.isFinite(engine?.currentProfile?.height) ? engine.currentProfile.height
        : Number.isFinite(Vectura.SETTINGS?.paperHeight) ? Vectura.SETTINGS.paperHeight
          : 210;
    return [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: h },
      { x: 0, y: h },
      { x: 0, y: 0 },
    ];
  };

  const getLayerPaths = (engine, layer) => {
    if (typeof engine?.getDisplayPaths === 'function') {
      const dp = engine.getDisplayPaths(layer);
      if (Array.isArray(dp) && dp.length) return dp;
    }
    return layer.displayPaths || layer.paths || [];
  };

  const isLayerEligible = (layer) => {
    if (!layer) return false;
    if (layer.visible === false) return false;
    if (layer.isGroup && layer.containerRole !== 'compound') return false;
    if (layer.locked) return false;
    if (layer.mask?.enabled && layer.mask?.hideLayer) return false;
    return true;
  };

  // Returns the smallest-area fill record whose region contains the point,
  // along with its layer and index in the layer's fills[]. Mirrors the
  // "Alt-click selects what you see" rule used by erase: nested fills surface
  // the innermost one. CMD+click adoption uses this to pick a fill to edit.
  const findFillAtPoint = (engine, worldX, worldY) => {
    if (!engine?.layers) return null;
    let best = null;
    for (const layer of engine.layers) {
      if (!isLayerEligible(layer)) continue;
      if (!Array.isArray(layer.fills) || !layer.fills.length) continue;
      for (let i = 0; i < layer.fills.length; i += 1) {
        const rec = layer.fills[i];
        if (!rec?.region) continue;
        if (!polyContainsPoint(rec.region, worldX, worldY)) continue;
        const area = shoelaceArea(rec.region);
        if (!best || area < best.area) {
          best = { layer, index: i, rec, area };
        }
      }
    }
    return best;
  };

  const findFillTargetStack = (engine, worldX, worldY) => {
    const entries = [];
    if (engine?.layers) {
      for (const layer of engine.layers) {
        if (!isLayerEligible(layer)) continue;
        const paths = getLayerPaths(engine, layer);
        for (const p of paths) {
          if (!isClosedRing(p)) continue;
          if (!polyContainsPoint(p, worldX, worldY)) continue;
          const polygon = clonePolygon(p);
          entries.push({
            layer,
            polygon,
            area: shoelaceArea(polygon),
            loopId: loopIdFor(layer.id, polygon),
            isDocBounds: false,
          });
        }
      }
    }
    entries.sort((a, b) => a.area - b.area);

    const docPoly = docBoundsPolygon(engine);
    const activeLayer = engine?.getActiveLayer?.() || engine?.layers?.[0] || null;
    entries.push({
      layer: activeLayer,
      polygon: docPoly,
      area: shoelaceArea(docPoly),
      loopId: '__doc-bounds__',
      isDocBounds: true,
    });

    return { stack: entries, includesDocBounds: true };
  };

  const newFillId = () => `fill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const buildFillRecord = (targetEntry, fillParams = {}) => ({
    id: newFillId(),
    fillType: fillParams.fillMode ?? fillParams.fillType ?? 'hatch',
    density: fillParams.fillDensity ?? 4,
    angle: fillParams.fillAngle ?? 0,
    amplitude: fillParams.fillAmplitude ?? 1.0,
    dotSize: fillParams.fillDotSize ?? 0.6,
    padding: fillParams.fillPadding ?? 0,
    shiftX: fillParams.fillShiftX ?? 0,
    shiftY: fillParams.fillShiftY ?? 0,
    dotPattern: fillParams.fillDotPattern ?? 'brick',
    axes: fillParams.fillAxes ?? 3,
    polyTile: fillParams.fillPolyTile ?? 'grid',
    centralDensity: fillParams.fillRadialCentralDensity ?? 1.0,
    outerDiameter: fillParams.fillRadialOuterDiameter ?? 1.0,
    sensitivity: fillParams.fillSensitivity ?? 5,
    penId: fillParams.penId ?? null,
    region: clonePolygon(targetEntry.polygon),
    loopId: targetEntry.loopId,
    isDocBounds: Boolean(targetEntry.isDocBounds),
    createdAt: Date.now(),
  });

  const applyFillAtPoint = (engine, app, worldX, worldY, options = {}) => {
    if (!engine) return null;
    const { scopeIndex = 0, mode = 'pour', fillParams = {} } = options;

    if (mode === 'erase') {
      // Find the fill record whose region (a) contains the point and (b) has
      // the smallest area — that matches what's highlighted under the cursor
      // when hovering, so Alt-click removes "what you see."
      let best = null;
      for (const layer of (engine.layers || [])) {
        if (!isLayerEligible(layer)) continue;
        if (!Array.isArray(layer.fills) || !layer.fills.length) continue;
        for (let i = 0; i < layer.fills.length; i += 1) {
          const rec = layer.fills[i];
          if (!rec?.region) continue;
          if (!polyContainsPoint(rec.region, worldX, worldY)) continue;
          const area = shoelaceArea(rec.region);
          if (!best || area < best.area) {
            best = { layer, index: i, rec, area };
          }
        }
      }
      if (!best) return null;
      app?.pushHistory?.();
      best.layer.fills.splice(best.index, 1);
      engine.computeAllDisplayGeometry?.();
      return { mode: 'erase', layerId: best.layer.id, fillId: best.rec.id, loopId: best.rec.loopId };
    }

    const { stack } = findFillTargetStack(engine, worldX, worldY);
    if (!stack.length) return null;
    const idx = Math.max(0, Math.min(scopeIndex, stack.length - 1));
    const target = stack[idx];
    const targetLayer = target.layer;
    if (!targetLayer) return null;

    if (!Array.isArray(targetLayer.fills)) targetLayer.fills = [];
    const record = buildFillRecord(target, fillParams);
    app?.pushHistory?.();
    targetLayer.fills.push(record);
    engine.computeAllDisplayGeometry?.();
    return { mode: 'pour', layerId: targetLayer.id, fillId: record.id, loopId: target.loopId };
  };

  const generateGeometryForLayer = (layer) => {
    if (!layer || !Array.isArray(layer.fills) || !layer.fills.length) return [];
    const gen = Vectura.AlgorithmRegistry?._generatePatternFillPaths;
    if (typeof gen !== 'function') return [];
    const all = [];
    for (const rec of layer.fills) {
      if (!rec || !rec.region || rec.fillType === 'none') continue;
      const fillArg = {
        regions: [rec.region],
        region: rec.region,
        fillType: rec.fillType,
        density: rec.density,
        angle: rec.angle,
        amplitude: rec.amplitude,
        dotSize: rec.dotSize,
        padding: rec.padding,
        shiftX: rec.shiftX,
        shiftY: rec.shiftY,
        dotPattern: rec.dotPattern,
        axes: rec.axes,
        polyTile: rec.polyTile,
        centralDensity: rec.centralDensity,
        outerDiameter: rec.outerDiameter,
      };
      let paths;
      try {
        paths = gen(fillArg) || [];
      } catch (err) {
        if (typeof console !== 'undefined') console.warn('[PaintBucketOps] fill generator failed', err);
        paths = [];
      }
      for (const p of paths) {
        if (Array.isArray(p) && p.length >= 2) {
          if (!p.meta) p.meta = {};
          p.meta.paintBucketFillId = rec.id;
          all.push(p);
        }
      }
    }
    return all;
  };

  Vectura.PaintBucketOps = {
    findFillTargetStack,
    findFillAtPoint,
    applyFillAtPoint,
    buildFillRecord,
    generateGeometryForLayer,
  };
})();
