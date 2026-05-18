/**
 * Vectura Pathfinder operations.
 *
 * Wraps polygon-clipping (via FillBoolean) with Illustrator-style Shape Mode
 * semantics over Vectura's layer model. Each operation:
 *
 *   1. Extracts a multipolygon "silhouette" for every selected layer.
 *      - 'silhouette' mode: every visible layer contributes its outline
 *        (closed shapes use Masking.getLayerSilhouette; generative layers
 *        fall back to their display bounding rect).
 *      - 'shape-only' mode: only oval/rect/polygon/closed-pen/shape qualify;
 *        everything else is ignored with a structured eligibility reason.
 *   2. Routes through FillBoolean primitives (union/difference/intersection/xor).
 *   3. Returns either a multipolygon (pure) or, via createCompound/expand,
 *      mutates the engine to produce a non-destructive compound layer.
 *
 * The compound layer model:
 *   layer.type === 'compound'
 *   layer.compound = { childIds, opType, sourceMode, cache }
 *     childIds:   ordered list of contributing layer ids (back → front)
 *     opType:     'unite' | 'minusFront' | 'intersect' | 'exclude'
 *     sourceMode: 'silhouette' | 'shape-only'
 *     cache:      { signature, multiPolygon } — runtime only, not serialized
 *
 * recomputeCompound() rebuilds layer.paths from the cached multipolygon when
 * the signature (children + their transforms + opType + mode) changes.
 *
 * expand() bakes a compound into a plain 'shape' layer and removes the
 * underlying child layers — matching Illustrator's "Expand Compound Shape".
 *
 * All mutating helpers expect callers to bracket with app.pushHistory().
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const SHAPE_ONLY_TYPES = new Set(['oval', 'rect', 'polygon', 'shape']);
  const SHAPE_MODE_OPS = new Set(['unite', 'minusFront', 'intersect', 'exclude']);

  const isPenClosed = (layer) => {
    if (!layer || layer.type !== 'pen') return false;
    const paths = layer.displayPaths?.length ? layer.displayPaths : layer.paths || [];
    return paths.some((path) => path?.meta?.closed === true);
  };

  const shapeOnlyEligibility = (layer) => {
    if (!layer) return { ok: false, reason: 'no layer' };
    if (layer.visible === false) return { ok: false, reason: 'hidden' };
    if (layer.isGroup && layer.containerRole !== 'compound') return { ok: false, reason: 'group' };
    if (layer.type === 'compound') return { ok: true, reason: '' };
    if (SHAPE_ONLY_TYPES.has(layer.type)) return { ok: true, reason: '' };
    if (layer.type === 'pen' && isPenClosed(layer)) return { ok: true, reason: '' };
    return { ok: false, reason: `${layer.type} is not a closed shape` };
  };

  const polygonsToMultiPolygon = (polygons) => {
    const FB = Vectura.FillBoolean;
    if (!FB || !polygons || !polygons.length) return [];
    // FillBoolean.ringToMultiPolygon expects {x,y} objects (see normalizeRing
    // in fill-boolean.js). Don't pre-flatten to tuples here.
    const geoms = polygons
      .map((polygon) => FB.ringToMultiPolygon(polygon || []))
      .filter((geom) => geom.length);
    if (!geoms.length) return [];
    if (geoms.length === 1) return geoms[0];
    return FB.union(...geoms);
  };

  const boundingRectMultiPolygon = (layer) => {
    const FB = Vectura.FillBoolean;
    const paths = layer?.displayPaths?.length ? layer.displayPaths : layer?.paths || [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    paths.forEach((path) => {
      if (!Array.isArray(path)) return;
      path.forEach((pt) => {
        if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return;
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      });
    });
    if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return [];
    return FB.rectToMultiPolygon(minX, minY, maxX, maxY);
  };

  // Returns a polygon-clipping multipolygon for a single layer, given mode.
  const geometryFor = (layer, mode, engine) => {
    if (!layer || layer.visible === false) return [];
    // Compounds expose their already-baked paths as closed rings.
    if (layer.type === 'compound' && layer.compound?.cache?.multiPolygon?.length) {
      return layer.compound.cache.multiPolygon;
    }
    const Masking = Vectura.Masking;
    if (mode === 'shape-only') {
      if (!shapeOnlyEligibility(layer).ok) return [];
      const polygons = Masking?.getLayerSilhouette?.(layer, engine, null) || [];
      return polygonsToMultiPolygon(polygons);
    }
    // silhouette mode: closed-path silhouette first, fall back to bounding rect.
    const polygons = Masking?.getLayerSilhouette?.(layer, engine, null) || [];
    const mp = polygonsToMultiPolygon(polygons);
    if (mp.length) return mp;
    return boundingRectMultiPolygon(layer);
  };

  const filterEmpty = (geoms) => geoms.filter((g) => Array.isArray(g) && g.length);

  // Front = last in array (paints last → on top). Order layers by their z-stack.
  const sortBackToFront = (layers, engine) => {
    if (!engine?.layers) return layers.slice();
    const index = new Map();
    engine.layers.forEach((l, i) => index.set(l.id, i));
    return layers.slice().sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
  };

  const opUnion = (geoms) => {
    const filtered = filterEmpty(geoms);
    if (!filtered.length) return [];
    if (filtered.length === 1) return filtered[0];
    return Vectura.FillBoolean.union(...filtered);
  };
  const opMinusFront = (geoms) => {
    const filtered = filterEmpty(geoms);
    if (filtered.length < 2) return filtered[0] || [];
    // Vectura's layer panel renders engine.layers in natural index order, so
    // the TOP of the panel is engine.layers[0] (= filtered[0] after
    // sortBackToFront) and the BOTTOM of the panel is engine.layers[last].
    // Users read "Minus Front" the Illustrator way: the visually higher layer
    // gets subtracted from the visually lower one, leaving the lower layer's
    // silhouette with bites taken out. So the BOTTOM-of-panel layer survives
    // and everything stacked above it is subtracted away.
    const survivor = filtered[filtered.length - 1];
    const subtractors = filtered.slice(0, -1);
    return Vectura.FillBoolean.difference(survivor, ...subtractors);
  };
  const opIntersect  = (geoms) => Vectura.FillBoolean.intersection(...filterEmpty(geoms));
  const opExclude    = (geoms) => Vectura.FillBoolean.xor(...filterEmpty(geoms));

  const opDispatch = {
    unite: opUnion,
    minusFront: opMinusFront,
    intersect: opIntersect,
    exclude: opExclude,
  };

  const computeOp = (opType, layers, mode, engine) => {
    if (!SHAPE_MODE_OPS.has(opType)) return [];
    const ordered = sortBackToFront(layers, engine);
    const geoms = ordered.map((layer) => geometryFor(layer, mode, engine));
    return (opDispatch[opType] || (() => []))(geoms);
  };

  // ── Compound lifecycle ────────────────────────────────────────────────────

  const cacheSignature = (compoundLayer, engine) => {
    const { opType, sourceMode, childIds = [] } = compoundLayer.compound || {};
    const parts = [opType || '', sourceMode || ''];
    childIds.forEach((id) => {
      const child = engine.layers.find((l) => l.id === id);
      if (!child) { parts.push(`${id}::missing`); return; }
      const p = child.params || {};
      // For nested compounds, fold the child's own cache signature into ours
      // so that changes deep in the tree (e.g., a grandchild moves but the
      // immediate child's path-count stays the same) still invalidate us.
      const nested = child.type === 'compound' ? (child.compound?.cache?.signature || '') : '';
      parts.push([
        id,
        child.visible !== false ? '1' : '0',
        Number(p.posX || 0).toFixed(4),
        Number(p.posY || 0).toFixed(4),
        Number(p.scaleX || 1).toFixed(4),
        Number(p.scaleY || 1).toFixed(4),
        Number(p.rotation || 0).toFixed(4),
        Number(p.seed || 0),
        child.type,
        (child.displayPaths?.length || child.paths?.length || 0),
        nested,
      ].join('|'));
    });
    return parts.join('//');
  };

  const writePathsToCompound = (compound, paths) => {
    compound.paths = paths;
    compound.displayPaths = paths.map((p) => p);
    // effectivePaths is what getRenderablePaths prefers — populate it so the
    // compound (a group container) still renders its baked silhouette.
    compound.effectivePaths = paths.map((p) => p);
    compound.displayStats = null;
    compound.effectiveStats = paths.length ? { lines: paths.length, points: paths.reduce((n, p) => n + p.length, 0) } : null;
  };

  // Pull the live child order from engine (parentId-based) so reparenting via
  // drag/drop in the Layers panel auto-updates the compound's inputs.
  const resolveChildren = (layer, engine) => {
    if (!layer || !engine?.layers) return [];
    const children = engine.layers.filter((l) => l.parentId === layer.id);
    if (children.length) {
      // Sync compound.childIds to reflect the current tree order. The compound
      // metadata stays canonical for serialization; we just refresh ordering.
      layer.compound.childIds = children.map((c) => c.id);
      return children;
    }
    // Fall back to compound.childIds if the engine has dropped children (e.g.
    // mid-import before reparenting). Filter to entries still present.
    return (layer.compound.childIds || [])
      .map((id) => engine.layers.find((l) => l.id === id))
      .filter(Boolean);
  };

  const recomputeCompound = (layer, engine) => {
    if (!layer || layer.type !== 'compound' || !engine) return;
    layer.compound = layer.compound || { childIds: [], opType: 'unite', sourceMode: 'silhouette', cache: { signature: null, multiPolygon: null } };
    layer.compound.cache = layer.compound.cache || { signature: null, multiPolygon: null };
    const childLayers = resolveChildren(layer, engine);
    const sig = cacheSignature(layer, engine);
    if (layer.compound.cache.signature === sig && layer.compound.cache.multiPolygon) {
      writePathsToCompound(layer, multiPolygonToPaths(layer.compound.cache.multiPolygon));
      return;
    }
    const mp = computeOp(layer.compound.opType, childLayers, layer.compound.sourceMode, engine);
    layer.compound.cache.signature = sig;
    layer.compound.cache.multiPolygon = mp;
    writePathsToCompound(layer, multiPolygonToPaths(mp));
  };

  const multiPolygonToPaths = (mp) => {
    const FB = Vectura.FillBoolean;
    if (!mp || !mp.length || !FB?.multiPolygonToPaths) return [];
    return FB.multiPolygonToPaths(mp).map((ring) => {
      const path = ring.map((pt) => ({ x: pt.x, y: pt.y }));
      path.meta = { kind: 'polygon', closed: true, source: 'pathfinder' };
      return path;
    });
  };

  const generateCompoundName = (engine, opType) => {
    const labels = {
      unite: 'Unite',
      minusFront: 'Minus Front',
      intersect: 'Intersect',
      exclude: 'Exclude',
    };
    const base = `${labels[opType] || 'Compound'} Shape`;
    const taken = new Set((engine.layers || []).map((l) => l.name));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base} ${n}`)) n += 1;
    return `${base} ${n}`;
  };

  // Mutates engine: wraps `childLayers` inside a new compound group container.
  // The children get reparented to the new compound (parentId = compound.id)
  // and the compound carries the baked silhouette; the renderer hides any
  // layer with a compound ancestor so only the unified result is visible.
  const createCompound = (engine, childLayers, opType, sourceMode) => {
    if (!engine || !Array.isArray(childLayers) || childLayers.length < 2) return null;
    if (!SHAPE_MODE_OPS.has(opType)) return null;
    const Layer = Vectura.Layer;
    if (!Layer) return null;

    const SETTINGS = Vectura.SETTINGS || {};
    const newId = Math.random().toString(36).slice(2, 11);
    SETTINGS.globalLayerCount = (SETTINGS.globalLayerCount || engine._layerCounter || 0) + 1;
    if (typeof engine._layerCounter === 'number') engine._layerCounter += 1;
    const ordered = sortBackToFront(childLayers, engine);
    const compound = new Layer(newId, 'shape', generateCompoundName(engine, opType));
    // Override Layer ctor's defaults: this is a group container, not a shape.
    compound.type = 'compound';
    compound.isGroup = true;
    compound.containerRole = 'compound';
    compound.groupType = 'compound';
    compound.groupCollapsed = false;
    compound.params = { seed: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    compound.paramStates = {};
    compound.sourcePaths = null;
    compound.compound = {
      childIds: ordered.map((l) => l.id),
      opType,
      sourceMode: sourceMode === 'shape-only' ? 'shape-only' : 'silhouette',
      cache: { signature: null, multiPolygon: null },
    };
    // Inherit appearance from the front layer (matches Illustrator for
    // unite/intersect/exclude). For minusFront the surviving silhouette is
    // the bottom-of-panel layer (engine-front), so we inherit from there too.
    const inheritFrom = ordered[ordered.length - 1];
    if (inheritFrom) {
      compound.penId = inheritFrom.penId;
      compound.color = inheritFrom.color;
      compound.strokeWidth = inheritFrom.strokeWidth;
      compound.lineCap = inheritFrom.lineCap;
    }

    // Insert the compound at the position of the frontmost child (so the
    // resulting layer sits where the user's selection visually was).
    const indices = ordered.map((l) => engine.layers.indexOf(l)).filter((i) => i >= 0);
    const insertAt = Math.max(...indices) + 1;
    engine.layers.splice(insertAt, 0, compound);

    // Reparent children — they become nested under the compound.
    ordered.forEach((child) => {
      child.parentId = compound.id;
    });

    engine.activeLayerId = compound.id;
    recomputeCompound(compound, engine);
    return compound.id;
  };

  // Walk every descendant of `rootId` via parentId edges. Used by expand() so a
  // nested compound chain (outer wraps inner wraps primitives) is fully torn
  // down — otherwise grandchildren survive as orphans referencing a parent
  // that no longer exists.
  const collectDescendantIds = (engine, rootId) => {
    const out = new Set();
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop();
      engine.layers.forEach((l) => {
        if (l.parentId === id && !out.has(l.id)) {
          out.add(l.id);
          stack.push(l.id);
        }
      });
    }
    return out;
  };

  // Mutates engine: bakes the compound's silhouette and removes its children.
  // The compound itself becomes a plain 'shape' layer at the same position.
  const expand = (engine, compoundLayer) => {
    if (!engine || !compoundLayer || compoundLayer.type !== 'compound') return null;
    // Make sure cache is current before we throw the children away.
    recomputeCompound(compoundLayer, engine);
    const baked = (compoundLayer.paths || []).map((path) => {
      const next = path.map((pt) => ({ x: pt.x, y: pt.y }));
      next.meta = { kind: 'polygon', closed: true, source: 'pathfinder-baked' };
      return next;
    });
    const childIds = collectDescendantIds(engine, compoundLayer.id);
    (compoundLayer.compound?.childIds || []).forEach((id) => childIds.add(id));
    engine.layers = engine.layers.filter((l) => !childIds.has(l.id));
    // Convert the compound (group) back to a flat shape layer.
    compoundLayer.type = 'shape';
    compoundLayer.isGroup = false;
    compoundLayer.containerRole = null;
    compoundLayer.groupType = null;
    compoundLayer.compound = null;
    compoundLayer.sourcePaths = baked;
    compoundLayer.paths = baked.map((p) => p);
    compoundLayer.displayPaths = baked.map((p) => p);
    compoundLayer.effectivePaths = baked.map((p) => p);
    return compoundLayer.id;
  };

  // Walks engine.layers once and recomputes every compound's cache.
  // Called from engine.computeAllDisplayGeometry() after primitive geometry
  // has been generated.
  const refreshAllCompounds = (engine) => {
    if (!engine?.layers) return;
    engine.layers.forEach((layer) => {
      if (layer && layer.type === 'compound') recomputeCompound(layer, engine);
    });
  };

  const api = {
    SHAPE_MODE_OPS,
    SHAPE_ONLY_TYPES,
    shapeOnlyEligibility,
    geometryFor,
    computeOp,
    createCompound,
    expand,
    recomputeCompound,
    refreshAllCompounds,
    // Internal-but-useful for tests.
    _multiPolygonToPaths: multiPolygonToPaths,
    _polygonsToMultiPolygon: polygonsToMultiPolygon,
    _sortBackToFront: sortBackToFront,
  };

  Vectura.PathfinderOps = { ...(Vectura.PathfinderOps || {}), ...api };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
