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
 *     childIds:   ordered list of contributing layer ids (panel top → bottom;
 *                 i.e. the user-visible "front-to-back" of the stack)
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

  // Pathfinder semantics treat the TOP of the layer panel as the "front" of
  // the stack (Illustrator convention). Vectura's panel renders engine.layers
  // in natural order — engine.layers[0] is the panel TOP, engine.layers[last]
  // is the panel BOTTOM. So under panel-top-as-front:
  //   ordered[0]            = panel-TOP    = front of the stack
  //   ordered[ordered.len-1] = panel-BOTTOM = back of the stack
  // (Note: this is the *opposite* of Vectura's canvas paint order, where the
  // last engine entry is painted last and therefore appears on top of the
  // canvas. Pathfinder semantics follow the user-visible panel order, not the
  // canvas paint order.)
  const sortFrontToBack = (layers, engine) => {
    if (!engine?.layers) return layers.slice();
    const index = new Map();
    engine.layers.forEach((l, i) => index.set(l.id, i));
    return layers.slice().sort((a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
  };
  // Back-compat alias for any out-of-tree callers — the underlying ordering
  // (engine-index ascending) is unchanged; only the naming reflects the
  // panel-top-as-front semantics.
  const sortBackToFront = sortFrontToBack;

  const opUnion = (geoms) => {
    const filtered = filterEmpty(geoms);
    if (!filtered.length) return [];
    if (filtered.length === 1) return filtered[0];
    return Vectura.FillBoolean.union(...filtered);
  };
  const opMinusFront = (geoms) => {
    const filtered = filterEmpty(geoms);
    if (filtered.length < 2) return filtered[0] || [];
    // Panel-top = front: subtract the panel-top layer(s) from the panel-bottom
    // layer. After sortFrontToBack the panel-TOP is filtered[0] and the
    // panel-BOTTOM is filtered[last]. "Minus Front" keeps the panel-bottom
    // (the back) and removes everything stacked above it.
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
    const ordered = sortFrontToBack(layers, engine);
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
        (child.effectivePaths || child.displayPaths || child.paths || [])
          .reduce((sum, p) => sum + (p?.length || 0), 0),
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

  const clipAndWriteToCompound = (layer, childLayers, mp) => {
    const PB = Vectura.PathBoolean;
    const isClosedPath = Vectura.OptimizationUtils?.isClosedPath || (() => false);

    // The boolean result outline is always the base — handles unfilled shapes.
    const outlinePaths = multiPolygonToPaths(mp);

    // Convert outer rings to {x,y} for clipping child fill (open) paths.
    const clipPolygons = (mp || [])
      .map((polygon) => (polygon[0] || []).map((pt) => ({ x: pt[0], y: pt[1] })))
      .filter((ring) => ring.length >= 3);

    const clippedFillPaths = [];
    if (clipPolygons.length && PB?.segmentPathByPolygons) {
      childLayers.forEach((child) => {
        const srcPaths = child.effectivePaths?.length ? child.effectivePaths : child.paths || [];
        srcPaths.forEach((path) => {
          if (!Array.isArray(path) || path.length < 2) return;
          // Skip closed/outline paths — the boolean result outline above already
          // represents the shape boundary. Only clip open fill/hatch lines.
          const isOutline = path.meta?.closed || path.meta?.kind === 'circle' || isClosedPath(path);
          if (isOutline) return;
          const segs = PB.segmentPathByPolygons(path, clipPolygons, { invert: true, closed: false });
          segs.forEach((seg) => {
            if (seg.length >= 2) clippedFillPaths.push(seg);
          });
        });
      });
    }
    writePathsToCompound(layer, outlinePaths.concat(clippedFillPaths));
  };

  const recomputeCompound = (layer, engine) => {
    if (!layer || layer.type !== 'compound' || !engine) return;
    layer.compound = layer.compound || { childIds: [], opType: 'unite', sourceMode: 'silhouette', cache: { signature: null, multiPolygon: null } };
    layer.compound.cache = layer.compound.cache || { signature: null, multiPolygon: null };
    const childLayers = resolveChildren(layer, engine);
    const sig = cacheSignature(layer, engine);
    if (layer.compound.cache.signature === sig && layer.compound.cache.multiPolygon) {
      clipAndWriteToCompound(layer, childLayers, layer.compound.cache.multiPolygon);
      return;
    }
    const mp = computeOp(layer.compound.opType, childLayers, layer.compound.sourceMode, engine);
    layer.compound.cache.signature = sig;
    layer.compound.cache.multiPolygon = mp;
    clipAndWriteToCompound(layer, childLayers, mp);
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
    const ordered = sortFrontToBack(childLayers, engine);
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
    // Inherit appearance from the layer whose silhouette dominates the result
    // (Illustrator convention). For unite/intersect/exclude that's the top of
    // the panel — the "front" of the stack — which is ordered[0] under
    // sortFrontToBack. For minusFront the survivor is the panel-BOTTOM layer
    // (everything above it gets subtracted away), so inheritance comes from
    // ordered[last].
    const inheritFrom = opType === 'minusFront'
      ? ordered[ordered.length - 1]
      : ordered[0];
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

  // ── Pathfinder-row (destructive) ops ──────────────────────────────────────
  //
  // Unlike Shape Modes (Unite/MinusFront/Intersect/Exclude) which produce a
  // live `type:'compound'` container, Pathfinder-row ops are destructive:
  //   - Source layers are removed.
  //   - Outputs are flat `type:'shape'` (or `type:'pen'` for outline-style
  //     open paths) layers wrapped in a plain group container with
  //     groupType = 'pathfinder'.
  //   - Minus Back is the exception — it produces a single layer at the
  //     front's z-index, not a group.
  //
  // applyPathfinder() mutates engine.layers and returns:
  //   null                                  → empty result (no mutation)
  //   { groupId, layerIds }                 → success
  //   { error: 'too-many-layers' | 'front-ineligible-for-crop'
  //          | 'front-ineligible-for-minusBack' } → known failure
  //
  // The function does NOT push history or trigger render — callers
  // (the UI track) wrap with pushHistory / computeAllDisplayGeometry / render.

  const DIVIDE_MAX_LAYERS = 8;
  const PATHFINDER_OPS = new Set(['divide', 'trim', 'merge', 'crop', 'outline', 'minusBack']);

  const OP_LABELS = {
    divide: 'Divide',
    trim: 'Trim',
    merge: 'Merge',
    crop: 'Crop',
    outline: 'Outline',
    minusBack: 'Minus Back',
  };

  const generatePathfinderName = (engine, opType) => {
    const base = `${OP_LABELS[opType] || 'Pathfinder'} Result`;
    const taken = new Set((engine.layers || []).map((l) => l.name));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base} ${n}`)) n += 1;
    return `${base} ${n}`;
  };

  const nextLayerId = (engine) => {
    const SETTINGS = Vectura.SETTINGS || {};
    SETTINGS.globalLayerCount = (SETTINGS.globalLayerCount || engine._layerCounter || 0) + 1;
    if (typeof engine._layerCounter === 'number') engine._layerCounter += 1;
    return Math.random().toString(36).slice(2, 11);
  };

  const copyAppearance = (target, source, { stripStroke = false } = {}) => {
    if (!source) return;
    target.penId = source.penId;
    target.color = source.color;
    target.strokeWidth = stripStroke ? 0 : source.strokeWidth;
    target.lineCap = source.lineCap;
  };

  // Convert a FillBoolean multipolygon into a list of Vectura path arrays.
  // The pathfinder-ops local helper above (`multiPolygonToPaths`) tags every
  // ring with `source: 'pathfinder'`; here we let callers override the tag.
  const mpToPaths = (mp, sourceTag = 'pathfinder', closed = true) => {
    const FB = Vectura.FillBoolean;
    if (!mp || !mp.length || !FB?.multiPolygonToPaths) return [];
    return FB.multiPolygonToPaths(mp).map((ring) => {
      const path = ring.map((pt) => ({ x: pt.x, y: pt.y }));
      path.meta = { kind: closed ? 'polygon' : 'polyline', closed, source: sourceTag };
      return path;
    });
  };

  // Build a shape layer carrying the given paths and appearance.
  const makeShapeLayer = (engine, name, paths, source, opts = {}) => {
    const Layer = Vectura.Layer;
    const id = nextLayerId(engine);
    const layer = new Layer(id, 'shape', name);
    copyAppearance(layer, source, { stripStroke: !!opts.stripStroke });
    layer.paths = paths.map((p) => p);
    layer.displayPaths = paths.map((p) => p);
    layer.effectivePaths = paths.map((p) => p);
    layer.sourcePaths = paths.map((p) => p);
    return layer;
  };

  // Wrap a list of output layers in a Pathfinder group container.
  const makePathfinderGroup = (engine, opType) => {
    const Layer = Vectura.Layer;
    const id = nextLayerId(engine);
    const group = new Layer(id, 'shape', generatePathfinderName(engine, opType));
    group.type = 'shape';
    group.isGroup = true;
    group.containerRole = null;
    group.groupType = 'pathfinder';
    group.groupCollapsed = false;
    group.params = { seed: 0, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    group.paramStates = {};
    group.sourcePaths = null;
    group.paths = [];
    group.displayPaths = [];
    group.effectivePaths = [];
    return group;
  };

  // Splice source layers out and insert new layers at the frontmost source's
  // original z-index. Returns the inserted layer ids.
  const replaceLayers = (engine, sources, newLayers, opts = {}) => {
    const sourceIds = new Set(sources.map((l) => l.id));
    const indices = sources.map((l) => engine.layers.indexOf(l)).filter((i) => i >= 0);
    const insertAt = indices.length ? Math.max(...indices) + 1 : engine.layers.length;
    // Remove sources (also any descendants whose parent is being removed —
    // but pathfinder sources are flat layers so this is a simple filter).
    engine.layers = engine.layers.filter((l) => !sourceIds.has(l.id));
    // Recompute insertion point after removal; we want the new content where
    // the front source used to be (after removals, this is the index of the
    // first non-removed layer that was originally just after the front source).
    // Simpler: count surviving layers that originally sat strictly behind the
    // frontmost source — that's the new insertion index.
    const frontIdxOriginal = Math.max(...indices);
    let survivorsBeforeFront = 0;
    let original = 0;
    // We need to recompute via the pre-removal order — but we don't have it
    // anymore. Use the saved set of sourceIds against engine.layers' original
    // indices: a survivor was at original index < frontIdxOriginal iff it
    // sits before the front source's slot. We saved indices but not the full
    // array. Reconstruct via the sources' original order:
    //   pre-removal: insertAt = frontIdx + 1
    //   post-removal: insertAt -= count(sources removed whose original index < insertAt)
    let removedBefore = 0;
    indices.forEach((idx) => { if (idx < insertAt) removedBefore += 1; });
    const adjustedInsertAt = insertAt - removedBefore;
    void original; void survivorsBeforeFront; // (vars retained for readability above)
    engine.layers.splice(adjustedInsertAt, 0, ...newLayers);
    if (opts.activateId) engine.activeLayerId = opts.activateId;
    return newLayers.map((l) => l.id);
  };

  // ── Op: Minus Back ─────────────────────────────────────────────────────────
  // F − union(others). Single output layer at front's z-index. Strokes preserved.
  // Panel-top = front: the panel-TOP source survives; everything below it in
  // the panel is subtracted away.
  const applyMinusBack = (engine, layers, mode) => {
    const FB = Vectura.FillBoolean;
    const ordered = sortFrontToBack(layers, engine);
    if (ordered.length < 2) return null;
    const front = ordered[0];
    const backs = ordered.slice(1);

    if (mode === 'shape-only' && !shapeOnlyEligibility(front).ok) {
      return { error: 'front-ineligible-for-minusBack' };
    }

    const frontGeom = geometryFor(front, mode, engine);
    if (!frontGeom || !frontGeom.length) return null;
    const backGeoms = backs.map((l) => geometryFor(l, mode, engine)).filter((g) => g && g.length);
    const result = backGeoms.length
      ? FB.difference(frontGeom, ...backGeoms)
      : frontGeom;
    if (!result || !result.length) return null;

    const paths = mpToPaths(result, 'pathfinder-minusBack', true);
    if (!paths.length) return null;
    const layer = makeShapeLayer(engine, front.name, paths, front, { stripStroke: false });
    const layerIds = replaceLayers(engine, ordered, [layer], { activateId: layer.id });
    return { groupId: null, layerIds };
  };

  // ── Op: Trim ───────────────────────────────────────────────────────────────
  // For each Pi (front→back): Pi − union(Pj for j < i in panel order). Strokes
  // stripped. Panel-top = front: the panel-TOP layer (i = 0) has nothing above
  // it and stays whole; each lower layer loses the regions covered by every
  // higher-in-panel layer.
  const applyTrim = (engine, layers, mode) => {
    const FB = Vectura.FillBoolean;
    const ordered = sortFrontToBack(layers, engine);
    if (ordered.length < 2) return null;
    const geoms = ordered.map((l) => geometryFor(l, mode, engine));
    const outputs = [];
    for (let i = 0; i < ordered.length; i += 1) {
      const above = geoms.slice(0, i).filter((g) => g && g.length);
      const myGeom = geoms[i];
      if (!myGeom || !myGeom.length) continue;
      const trimmed = above.length ? FB.difference(myGeom, ...above) : myGeom;
      if (!trimmed || !trimmed.length) continue;
      const paths = mpToPaths(trimmed, 'pathfinder-trim', true);
      if (!paths.length) continue;
      outputs.push({ paths, source: ordered[i] });
    }
    if (!outputs.length) return null;
    return finalizeGroup(engine, ordered, outputs, 'trim', { stripStroke: true });
  };

  // ── Op: Divide ─────────────────────────────────────────────────────────────
  // Arrangement cells: for every non-empty subset S of inputs,
  //   cell(S) = intersection(Pi for i ∈ S) − union(Pj for j ∉ S)
  // Cell appearance inherits from the topmost-in-panel layer in S (the
  // smallest i under sortFrontToBack). Strokes preserved.
  const applyDivide = (engine, layers, mode) => {
    const FB = Vectura.FillBoolean;
    const ordered = sortFrontToBack(layers, engine);
    if (ordered.length < 2) return null;
    if (ordered.length > DIVIDE_MAX_LAYERS) return { error: 'too-many-layers' };
    const n = ordered.length;
    const geoms = ordered.map((l) => geometryFor(l, mode, engine));
    const outputs = [];
    const total = 1 << n;
    for (let mask = 1; mask < total; mask += 1) {
      const inside = [];
      const outside = [];
      let topIdx = -1;  // smallest i in `inside` = panel-top-most contributor
      for (let i = 0; i < n; i += 1) {
        const g = geoms[i];
        if (!g || !g.length) {
          if (mask & (1 << i)) { inside.length = 0; break; }
          continue;
        }
        if (mask & (1 << i)) {
          inside.push(g);
          if (topIdx === -1) topIdx = i;
        }
        else outside.push(g);
      }
      if (!inside.length) continue;
      const inter = inside.length === 1 ? inside[0] : FB.intersection(...inside);
      if (!inter || !inter.length) continue;
      const cell = outside.length ? FB.difference(inter, ...outside) : inter;
      if (!cell || !cell.length) continue;
      const paths = mpToPaths(cell, 'pathfinder-divide', true);
      if (!paths.length) continue;
      outputs.push({ paths, source: ordered[topIdx], z: topIdx });
    }
    if (!outputs.length) return null;
    // Stable panel order inside the group: panel-top contributors come first
    // (smallest z) so the group's panel display matches the source's z-stack.
    outputs.sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    return finalizeGroup(engine, ordered, outputs, 'divide', { stripStroke: false });
  };

  // ── Op: Crop ───────────────────────────────────────────────────────────────
  // Front is the cookie cutter. For each back layer Lj: Lj ∩ F. Front consumed.
  // Strokes stripped. Front must be eligible in shape-only mode. Panel-top =
  // front: the panel-TOP source is the cookie cutter; every panel-lower
  // source gets clipped to it.
  const applyCrop = (engine, layers, mode) => {
    const FB = Vectura.FillBoolean;
    const ordered = sortFrontToBack(layers, engine);
    if (ordered.length < 2) return null;
    const front = ordered[0];
    const backs = ordered.slice(1);

    if (mode === 'shape-only' && !shapeOnlyEligibility(front).ok) {
      return { error: 'front-ineligible-for-crop' };
    }

    const frontGeom = geometryFor(front, mode, engine);
    if (!frontGeom || !frontGeom.length) return null;

    const outputs = [];
    backs.forEach((layer) => {
      const g = geometryFor(layer, mode, engine);
      if (!g || !g.length) return;
      const clipped = FB.intersection(g, frontGeom);
      if (!clipped || !clipped.length) return;
      const paths = mpToPaths(clipped, 'pathfinder-crop', true);
      if (paths.length) outputs.push({ paths, source: layer });
    });
    if (!outputs.length) return null;
    return finalizeGroup(engine, ordered, outputs, 'crop', { stripStroke: true });
  };

  // ── Op: Merge ──────────────────────────────────────────────────────────────
  // Trim, then union per fill identity (penId or color). Strokes stripped.
  // Panel-top = front: the panel-TOP layer (i = 0) stays whole; each lower
  // layer loses the regions covered by every higher-in-panel layer before
  // same-fill fragments are unioned together.
  const applyMerge = (engine, layers, mode) => {
    const FB = Vectura.FillBoolean;
    const ordered = sortFrontToBack(layers, engine);
    if (ordered.length < 2) return null;
    const geoms = ordered.map((l) => geometryFor(l, mode, engine));

    // Build trim fragments aligned with ordered[].
    const fragments = []; // { mp, source, key }
    for (let i = 0; i < ordered.length; i += 1) {
      const above = geoms.slice(0, i).filter((g) => g && g.length);
      const myGeom = geoms[i];
      if (!myGeom || !myGeom.length) continue;
      const trimmed = above.length ? FB.difference(myGeom, ...above) : myGeom;
      if (!trimmed || !trimmed.length) continue;
      const src = ordered[i];
      const key = src.penId ? `pen:${src.penId}` : `color:${(src.color || '').toLowerCase()}`;
      fragments.push({ mp: trimmed, source: src, key });
    }
    if (!fragments.length) return null;

    // Group fragments by fill identity, in first-encounter order.
    const buckets = new Map();
    const order = [];
    fragments.forEach((f) => {
      if (!buckets.has(f.key)) {
        buckets.set(f.key, { mps: [], source: f.source });
        order.push(f.key);
      }
      buckets.get(f.key).mps.push(f.mp);
    });

    const outputs = [];
    order.forEach((key) => {
      const bucket = buckets.get(key);
      const merged = bucket.mps.length === 1 ? bucket.mps[0] : FB.union(...bucket.mps);
      if (!merged || !merged.length) return;
      const paths = mpToPaths(merged, 'pathfinder-merge', true);
      if (paths.length) outputs.push({ paths, source: bucket.source });
    });
    if (!outputs.length) return null;
    return finalizeGroup(engine, ordered, outputs, 'merge', { stripStroke: true });
  };

  // ── Op: Outline ────────────────────────────────────────────────────────────
  // Split each input's ring(s) at intersections with every OTHER input's
  // ring(s). Output: open polyline layers. Stroke color = source fill color;
  // strokeWidth = source strokeWidth (Vectura divergence vs Illustrator's 0pt).
  //
  // Implementation note (per PRD §4.5): we take the simpler ring-by-ring
  // approach. Each input ring is treated as a polyline; we split it at every
  // intersection point with every other input's ring polylines using
  // Vectura.PathBoolean.segmentIntersectSegment. Open inputs participate as
  // their literal polyline (no chord closure).
  const ringsForOutline = (layer, mode, engine) => {
    if (!layer || layer.visible === false) return [];
    const source = layer.displayPaths?.length ? layer.displayPaths : layer.paths || [];
    const rings = [];
    source.forEach((path) => {
      if (!Array.isArray(path) || path.length < 2) return;
      const pts = path.map((pt) => ({ x: pt.x, y: pt.y }));
      const meta = path.meta || {};
      const closed = meta.closed === true || meta.kind === 'polygon' || meta.kind === 'circle';
      rings.push({ pts, closed });
    });
    return rings;
  };

  const splitPolylineAtPoints = (pts, closed, otherRings) => {
    const PB = Vectura.PathBoolean;
    if (!PB?.segmentIntersectSegment || pts.length < 2) return [pts.slice()];
    const breakpoints = []; // [{ i, t, x, y }] — i is segment index in pts
    const segCount = closed ? pts.length - (pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y ? 1 : 0) : pts.length - 1;
    for (let i = 0; i < segCount; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      otherRings.forEach((other) => {
        const otherPts = other.pts;
        const otherSegCount = other.closed ? otherPts.length - (otherPts[0].x === otherPts[otherPts.length - 1].x && otherPts[0].y === otherPts[otherPts.length - 1].y ? 1 : 0) : otherPts.length - 1;
        for (let j = 0; j < otherSegCount; j += 1) {
          const c = otherPts[j];
          const d = otherPts[(j + 1) % otherPts.length];
          const hit = PB.segmentIntersectSegment(a, b, c, d);
          if (!hit) continue;
          // Skip "intersections" that fall exactly on the segment endpoints —
          // shared vertices between adjacent segments of the same input
          // produce these and we don't want spurious splits.
          if (hit.t < 1e-5 || hit.t > 1 - 1e-5) continue;
          breakpoints.push({ i, t: hit.t, x: hit.x, y: hit.y });
        }
      });
    }
    if (!breakpoints.length) return [pts.slice()];

    breakpoints.sort((a, b) => (a.i - b.i) || (a.t - b.t));

    // Walk the polyline emitting segments split at every breakpoint.
    const segments = [];
    let current = [];
    const pushPoint = (pt) => {
      const last = current[current.length - 1];
      if (last && Math.abs(last.x - pt.x) < 1e-9 && Math.abs(last.y - pt.y) < 1e-9) return;
      current.push(pt);
    };
    const flush = () => {
      if (current.length >= 2) segments.push(current);
      current = [];
    };
    let bpIdx = 0;
    for (let i = 0; i < segCount; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      pushPoint({ x: a.x, y: a.y });
      while (bpIdx < breakpoints.length && breakpoints[bpIdx].i === i) {
        const bp = breakpoints[bpIdx];
        pushPoint({ x: bp.x, y: bp.y });
        flush();
        current.push({ x: bp.x, y: bp.y });
        bpIdx += 1;
      }
      // End of segment: place the endpoint only if we're at the last segment
      // of an open polyline (otherwise the next iteration will push it as the
      // start of its segment).
      if (i === segCount - 1) pushPoint({ x: b.x, y: b.y });
    }
    // Closed-ring case: if the last accumulated piece dangles past the wrap
    // point and the first segment was unbroken, join it back to the start of
    // the very first piece so a fully-uncut ring stays as one polyline.
    if (closed && segments.length === 0 && current.length >= 2) {
      segments.push(current);
      current = [];
    } else if (closed && current.length >= 1 && segments.length) {
      // Splice the dangling tail onto the front of the first segment so
      // that walking the ring continues across the seam.
      const first = segments[0];
      // The tail ends with the first vertex; the first segment starts at it.
      // Stitch: tail (minus its last point if equal to first[0]) + first.
      const tail = current.slice();
      if (tail.length && first.length) {
        const tEnd = tail[tail.length - 1];
        const fStart = first[0];
        if (Math.abs(tEnd.x - fStart.x) < 1e-9 && Math.abs(tEnd.y - fStart.y) < 1e-9) tail.pop();
        segments[0] = tail.concat(first);
      }
      current = [];
    } else {
      flush();
    }
    return segments.length ? segments : [pts.slice()];
  };

  const applyOutline = (engine, layers, mode) => {
    const ordered = sortFrontToBack(layers, engine);
    if (ordered.length < 2) return null;

    // Collect rings per layer.
    const allRingsByLayer = ordered.map((l) => ringsForOutline(l, mode, engine));

    const outputs = [];
    for (let i = 0; i < ordered.length; i += 1) {
      const myRings = allRingsByLayer[i];
      if (!myRings.length) continue;
      // Build the set of "other" rings from all other layers.
      const others = [];
      for (let j = 0; j < ordered.length; j += 1) {
        if (j === i) continue;
        allRingsByLayer[j].forEach((r) => others.push(r));
      }
      myRings.forEach((ring) => {
        const segments = others.length
          ? splitPolylineAtPoints(ring.pts, ring.closed, others)
          : [ring.pts.slice()];
        segments.forEach((segPts) => {
          if (!segPts || segPts.length < 2) return;
          const path = segPts.map((pt) => ({ x: pt.x, y: pt.y }));
          path.meta = { kind: 'polyline', closed: false, source: 'pathfinder-outline' };
          const src = ordered[i];
          const layer = makeShapeLayer(engine, src.name, [path], src, { stripStroke: false });
          // Stroke width preserved from source (Vectura divergence vs Illustrator).
          outputs.push({ paths: [path], source: src, prebuilt: layer });
        });
      });
    }
    if (!outputs.length) return null;
    return finalizeGroupPrebuilt(engine, ordered, outputs, 'outline');
  };

  // Wrap outputs into a Pathfinder group, splice out sources, return ids.
  const finalizeGroup = (engine, sources, outputs, opType, opts = {}) => {
    if (!outputs.length) return null;
    const group = makePathfinderGroup(engine, opType);
    const children = outputs.map(({ paths, source }) => {
      const layer = makeShapeLayer(engine, source.name, paths, source, { stripStroke: !!opts.stripStroke });
      layer.parentId = group.id;
      return layer;
    });
    const inserted = [group, ...children];
    const layerIds = replaceLayers(engine, sources, inserted, { activateId: group.id });
    return { groupId: group.id, layerIds };
  };

  // Outline path: outputs already carry prebuilt layers (one path per layer).
  const finalizeGroupPrebuilt = (engine, sources, outputs, opType) => {
    if (!outputs.length) return null;
    const group = makePathfinderGroup(engine, opType);
    const children = outputs.map(({ prebuilt }) => {
      prebuilt.parentId = group.id;
      return prebuilt;
    });
    const inserted = [group, ...children];
    const layerIds = replaceLayers(engine, sources, inserted, { activateId: group.id });
    return { groupId: group.id, layerIds };
  };

  /**
   * Apply a destructive Pathfinder-row op to a selection.
   * @param {object} engine  engine with `.layers` array and (optional) `_layerCounter`.
   * @param {Array}  layers  selected layers (any order); will be sorted back→front.
   * @param {string} op      one of 'divide'|'trim'|'merge'|'crop'|'outline'|'minusBack'.
   * @param {string} mode    'silhouette' | 'shape-only'.
   * @returns {null | {groupId, layerIds} | {error}}
   */
  const applyPathfinder = (engine, layers, op, mode) => {
    if (!engine || !Array.isArray(layers) || !PATHFINDER_OPS.has(op)) return null;
    if (layers.length < 2) return null;
    switch (op) {
      case 'minusBack': return applyMinusBack(engine, layers, mode);
      case 'trim':      return applyTrim(engine, layers, mode);
      case 'divide':    return applyDivide(engine, layers, mode);
      case 'crop':      return applyCrop(engine, layers, mode);
      case 'merge':     return applyMerge(engine, layers, mode);
      case 'outline':   return applyOutline(engine, layers, mode);
      default:          return null;
    }
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
    applyPathfinder,
    PATHFINDER_OPS,
    DIVIDE_MAX_LAYERS,
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
