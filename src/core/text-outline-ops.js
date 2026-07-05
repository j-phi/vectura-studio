/**
 * Vectura Text Outline operations (TXT-1/TXT-2).
 *
 * "Outline the text": converts a live Text layer into a plain group of static
 * per-glyph shape layers — Illustrator's Type → Create Outlines, plotter-native.
 *
 *   window.Vectura.TextOutlineOps.outlineText(layerId[, ctx])
 *
 * Semantics:
 *   - The Text layer's ALREADY-RENDERED world-space geometry (layer.paths — the
 *     exact curves engine.generate() produced via the text algorithm, including
 *     native cubic anchors, weight bands, fills and decorations) is partitioned
 *     per glyph and baked into ordinary 'shape' layers named for their character
 *     ("p"). No geometry is regenerated or re-fit, so the render before and after
 *     is identical.
 *   - A glyph whose ink forms MULTIPLE detached elements (e.g. "i" = stem +
 *     tittle, or an accented letter) becomes a per-letter sub-group (named for
 *     the character) holding one shape layer per element; a single-element glyph
 *     stays one shape layer directly under the top group. Elements are found by
 *     spatially clustering the glyph's paths (clusterGlyphElements).
 *   - Glyph ↔ path assignment keys off the text algorithm's editor glyph cells
 *     (layer.glyphs — world-space quads carrying sourceIndex/lineIndex/isSpace,
 *     the same sidecar the on-canvas editor hit-tests). Each path goes to the
 *     cell nearest its ink centroid (inside-quad wins; ties break on quad
 *     centre), so multi-line text keeps per-glyph positions and whitespace
 *     produces no layer.
 *   - The group uses the standard group machinery (isGroup + groupType:'group'),
 *     takes the Text layer's stack slot and parentId, and becomes the active
 *     selection — double-click isolation and the Layers panel work unchanged
 *     (TXT-2: each row shows the glyph's character via layer.name).
 *   - Undo: when called with an app context (default: window.app) the op wraps
 *     itself in ONE app.pushHistory() snapshot — undo restores the live Text
 *     layer with params intact. Engine-only callers (tests/headless) bracket
 *     history themselves, mirroring PathfinderOps.
 *
 * Self-contained IIFE; every dependency (Layer, generateId, SETTINGS, app) is
 * resolved at call time so the module tolerates any load order.
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = (G.Vectura = G.Vectura || {});

  // ── helpers ────────────────────────────────────────────────────────────────

  const clonePath = (path) => {
    if (!Array.isArray(path)) return path;
    const copy = path.map((pt) => ({ ...pt }));
    if (path.meta) copy.meta = JSON.parse(JSON.stringify(path.meta));
    return copy;
  };

  const pathCentroid = (path) => {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const pt of path) {
      if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
      sx += pt.x;
      sy += pt.y;
      n += 1;
    }
    return n ? { x: sx / n, y: sy / n } : null;
  };

  const pointInQuad = (px, py, quad) => {
    let inside = false;
    for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
      const xi = quad[i].x;
      const yi = quad[i].y;
      const xj = quad[j].x;
      const yj = quad[j].y;
      if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-12) + xi) {
        inside = !inside;
      }
    }
    return inside;
  };

  const segDistSq = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px - (ax + t * dx);
    const ey = py - (ay + t * dy);
    return ex * ex + ey * ey;
  };

  const quadEdgeDistSq = (px, py, quad) => {
    let best = Infinity;
    for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
      const d = segDistSq(px, py, quad[j].x, quad[j].y, quad[i].x, quad[i].y);
      if (d < best) best = d;
    }
    return best;
  };

  const quadCenter = (quad) => {
    let sx = 0;
    let sy = 0;
    for (const pt of quad) {
      sx += pt.x;
      sy += pt.y;
    }
    return { x: sx / quad.length, y: sy / quad.length };
  };

  // Non-whitespace glyph cells in layout (reading) order, each with the
  // character it renders — resolved from the source string via the cell's
  // sourceIndex, honoring the allCaps display transform.
  const glyphCells = (layer) => {
    const raw = layer && layer.params && layer.params.text != null ? String(layer.params.text) : '';
    const cells = [];
    (Array.isArray(layer && layer.glyphs) ? layer.glyphs : []).forEach((g) => {
      if (!g || g.isSpace === true) return;
      if (!Array.isArray(g.quad) || g.quad.length !== 4) return;
      let ch = Number.isFinite(g.sourceIndex) ? raw[g.sourceIndex] : undefined;
      if (ch != null && /\s/.test(ch)) return;
      if (ch != null && layer.params && layer.params.allCaps === true) ch = ch.toUpperCase();
      cells.push({ char: ch, quad: g.quad, center: quadCenter(g.quad) });
    });
    return cells;
  };

  // Partition the layer's world-space paths across the glyph cells. Every path
  // lands on exactly one cell (nearest by ink centroid), so the union of the
  // buckets is the exact original path set. Line-level decorations (underline/
  // strikethrough) and welded kern clusters follow their nearest glyph.
  const partitionPaths = (paths, cells) => {
    const buckets = cells.map(() => []);
    (paths || []).forEach((path) => {
      if (!Array.isArray(path) || !path.length) return;
      const c = pathCentroid(path);
      if (!c) return;
      let bestIdx = -1;
      let bestEdge = Infinity;
      let bestCenter = Infinity;
      cells.forEach((cell, i) => {
        const edge = pointInQuad(c.x, c.y, cell.quad) ? 0 : quadEdgeDistSq(c.x, c.y, cell.quad);
        const center = (c.x - cell.center.x) ** 2 + (c.y - cell.center.y) ** 2;
        if (edge < bestEdge - 1e-9 || (Math.abs(edge - bestEdge) <= 1e-9 && center < bestCenter)) {
          bestIdx = i;
          bestEdge = edge;
          bestCenter = center;
        }
      });
      if (bestIdx >= 0) buckets[bestIdx].push(path);
    });
    return buckets;
  };

  // Axis-aligned bounding box of a single path.
  const pathBBox = (path) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of path) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
    return { minX, minY, maxX, maxY };
  };

  // Minimum gap between two AABBs (0 when they overlap or touch).
  const bboxGap = (a, b) => {
    const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
    const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
    return Math.sqrt(dx * dx + dy * dy);
  };

  // A glyph cell's world-space size (larger of its quad-bbox width/height) — the
  // reference length for the clustering gap band below.
  const cellSpan = (quad) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of (quad || [])) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return Math.max(maxX - minX, maxY - minY) || 0;
  };

  // Partition ONE glyph's paths into spatially-connected elements — e.g. the
  // stem and the detached tittle of an "i", or a base letter and its accent.
  // Single-linkage clustering over AABB gaps: the threshold adapts to the
  // glyph's own path spacing (so hatch-fill lines inside one stroke merge) but
  // is clamped to a band of the cell size (so a detached dot/accent, separated
  // by a gap larger than ~12% of the cell, always stays its own element).
  // Returns element path-arrays ordered top-to-bottom then left-to-right, giving
  // a deterministic child-layer order (tittle before stem for "i").
  const clusterGlyphElements = (paths, cellSize) => {
    const n = paths.length;
    if (n <= 1) return n === 1 ? [paths.slice()] : [];
    const boxes = paths.map(pathBBox);
    // Nearest-neighbour gap per path → adaptive threshold.
    const nnGaps = [];
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const g = bboxGap(boxes[i], boxes[j]);
        if (g < best) best = g;
      }
      nnGaps.push(best);
    }
    nnGaps.sort((a, b) => a - b);
    const med = nnGaps[Math.floor(nnGaps.length / 2)] || 0;
    const floor = cellSize * 0.02;
    const ceil = cellSize * 0.12;
    let thr = med * 1.5;
    if (thr < floor) thr = floor;
    if (thr > ceil) thr = ceil;
    // Union-find over the "gap ≤ threshold" graph.
    const parent = new Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (bboxGap(boxes[i], boxes[j]) <= thr) { const a = find(i); const b = find(j); if (a !== b) parent[a] = b; }
      }
    }
    const groups = new Map();
    for (let i = 0; i < n; i++) {
      const r = find(i);
      let arr = groups.get(r);
      if (!arr) { arr = []; groups.set(r, arr); }
      arr.push(i);
    }
    const comps = [];
    groups.forEach((idxs) => {
      let minX = Infinity, minY = Infinity;
      idxs.forEach((i) => { if (boxes[i].minX < minX) minX = boxes[i].minX; if (boxes[i].minY < minY) minY = boxes[i].minY; });
      comps.push({ idxs, minX, minY });
    });
    comps.sort((a, b) => (a.minY - b.minY) || (a.minX - b.minX));
    return comps.map((c) => c.idxs.map((i) => paths[i]));
  };

  const nextLayerId = (engine) => {
    const SETTINGS = Vectura.SETTINGS || {};
    SETTINGS.globalLayerCount = (SETTINGS.globalLayerCount || engine._layerCounter || 0) + 1;
    if (typeof engine._layerCounter === 'number') engine._layerCounter += 1;
    return Vectura.generateId();
  };

  // ── public API ─────────────────────────────────────────────────────────────

  const canOutline = (layer) => Boolean(
    layer
    && !layer.isGroup
    && layer.type === 'text'
    && Array.isArray(layer.paths)
  );

  /**
   * Replace a Text layer with a group of per-glyph static shape layers.
   *
   * @param {string} layerId  id of the Text layer to outline.
   * @param {object} [ctx]    { app?, engine?, renderer? } — defaults to the
   *                          running app (window.app). Pass { engine } alone
   *                          for headless use (caller brackets history).
   * @returns {null | { groupId: string, glyphLayerIds: string[] }}
   */
  const outlineText = (layerId, ctx = {}) => {
    const app = ctx.app !== undefined ? ctx.app : (G.app && G.app.engine ? G.app : null);
    const engine = ctx.engine || (app && app.engine);
    const renderer = ctx.renderer !== undefined ? ctx.renderer : (app && app.renderer);
    const Layer = Vectura.Layer;
    if (!engine || !Layer || typeof Vectura.generateId !== 'function') return null;

    const layer = (engine.layers || []).find((l) => l && l.id === layerId);
    if (!canOutline(layer)) return null;

    // Make sure the rendered geometry + glyph cells are current before baking.
    if (!layer.paths.length || !Array.isArray(layer.glyphs) || !layer.glyphs.length) {
      engine.generate(layer.id);
    }
    if (!Array.isArray(layer.paths) || !layer.paths.length) return null;

    const cells = glyphCells(layer);
    if (!cells.length) return null;
    const buckets = partitionPaths(layer.paths, cells);
    // No glyph received any geometry (every bucket empty) — a true no-op. Bail
    // BEFORE pushing history so a rejected call never leaves a phantom
    // do-nothing undo step on the stack.
    if (!buckets.some((bucket) => bucket.length)) return null;

    // Everything computable failed-fast above — mutate from here on, as ONE
    // undo step (push-before-change, same as every other op). Counter
    // increments (nextLayerId) live inside this snapshot window so undo
    // restores the pre-op layer counter too.
    if (app && typeof app.pushHistory === 'function') app.pushHistory();

    const groupId = nextLayerId(engine);
    const group = new Layer(groupId, 'group', `${layer.name} Outlines`);
    group.isGroup = true;
    group.groupType = 'group';
    group.groupCollapsed = false;
    group.parentId = layer.parentId ?? null;
    group.visible = layer.visible;
    group.penId = layer.penId;
    group.color = layer.color;
    group.strokeWidth = layer.strokeWidth;
    group.lineCap = layer.lineCap;

    // Build one static outline shape layer from a set of paths.
    const makeShapeLayer = (name, elemPaths, parentIdVal) => {
      const child = new Layer(nextLayerId(engine), 'shape', name);
      child.parentId = parentIdVal;
      child.sourcePaths = elemPaths.map(clonePath);
      child.params.seed = 0;
      child.params.posX = 0;
      child.params.posY = 0;
      child.params.scaleX = 1;
      child.params.scaleY = 1;
      child.params.rotation = 0;
      child.params.curves = false;
      child.params.smoothing = 0;
      child.params.simplify = 0;
      child.penId = layer.penId;
      child.color = layer.color;
      child.strokeWidth = layer.strokeWidth;
      child.lineCap = layer.lineCap;
      child.visible = true;
      if (layer.optimization) {
        child.optimization = JSON.parse(JSON.stringify(layer.optimization));
      }
      return child;
    };
    // A per-letter sub-group holding the glyph's disjoint element shapes.
    const makeLetterGroup = (name, parentIdVal) => {
      const g = new Layer(nextLayerId(engine), 'group', name);
      g.isGroup = true;
      g.groupType = 'group';
      g.groupCollapsed = false;
      g.parentId = parentIdVal;
      g.visible = true;
      g.penId = layer.penId;
      g.color = layer.color;
      g.strokeWidth = layer.strokeWidth;
      g.lineCap = layer.lineCap;
      return g;
    };

    // Flat splice payload (after the top group), and the leaf shapes to generate.
    // A glyph whose ink forms multiple detached elements (e.g. "i" = stem +
    // tittle) becomes its own letter group with one shape child per element; a
    // single-element glyph stays one shape layer directly under the top group.
    const newLayers = [];
    const leafShapes = [];
    cells.forEach((cell, i) => {
      const bucket = buckets[i];
      if (!bucket.length) return; // glyph whose ink welded into a neighbor cluster
      const name = cell.char != null && cell.char !== '' ? cell.char : `Glyph ${i + 1}`;
      const elements = clusterGlyphElements(bucket, cellSpan(cell.quad));
      if (elements.length <= 1) {
        const child = makeShapeLayer(name, elements.length ? elements[0] : bucket, groupId);
        newLayers.push(child);
        leafShapes.push(child);
      } else {
        const letterGroup = makeLetterGroup(name, groupId);
        newLayers.push(letterGroup);
        elements.forEach((elemPaths) => {
          const child = makeShapeLayer(name, elemPaths, letterGroup.id);
          newLayers.push(child);
          leafShapes.push(child);
        });
      }
    });
    if (!leafShapes.length) return null;

    // Swap the text layer for the group + glyph descendants in one splice so the
    // stack slot (and panel position) is preserved exactly.
    const idx = engine.layers.indexOf(layer);
    engine.layers.splice(idx, 1, group, ...newLayers);

    leafShapes.forEach((child) => engine.generate(child.id));
    engine.activeLayerId = groupId;
    if (typeof engine.computeAllDisplayGeometry === 'function') engine.computeAllDisplayGeometry();

    // Selection + render tail runs AFTER the history snapshot, so a throw here
    // (e.g. a Phase-2 caller's renderer in an odd state) must NOT propagate
    // uncaught: the engine mutation is already complete and undo-recoverable,
    // and the op's return contract stays intact. Swallow-and-log instead.
    try {
      // Result selected as a group (renderer optional for headless callers).
      if (renderer && typeof renderer.setSelection === 'function') {
        renderer.setSelection([groupId], groupId);
      }
      if (app) {
        if (typeof app.render === 'function') app.render();
        if (app.ui && typeof app.ui.renderLayers === 'function') app.ui.renderLayers();
      }
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[TextOutlineOps] post-mutation render tail failed (state is undo-recoverable):', err);
      }
    }

    return { groupId, glyphLayerIds: leafShapes.map((c) => c.id) };
  };

  const api = {
    canOutline,
    outlineText,
    // Internal-but-useful for tests (mirrors PathfinderOps convention).
    _glyphCells: glyphCells,
    _partitionPaths: partitionPaths,
  };

  Vectura.TextOutlineOps = { ...(Vectura.TextOutlineOps || {}), ...api };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
