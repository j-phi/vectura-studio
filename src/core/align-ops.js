/**
 * Vectura align/distribute math.
 *
 * Pure functions: given layers, a bbox accessor, and an Align-To mode,
 * return a `{ [layerId]: { dx, dy } }` delta map. No DOM, no renderer
 * coupling — testable headless.
 *
 * Bbox accessor contract: `boundsFor(layer) -> { minX, maxX, minY, maxY, centerX, centerY }`
 * in world (artboard mm) coordinates. The panel wraps renderer.getLayerBounds
 * and projects its 4 corners into an axis-aligned world rect.
 *
 * Reference-rect modes:
 *   - 'selection': aggregate AABB of all eligible layers
 *   - 'artboard':  artboard rect (0..width, 0..height)
 *   - 'key':       AABB of the key object
 *
 * All operations are translate-only — they mutate posX/posY at apply time.
 */
(() => {
  const root = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = root.Vectura = root.Vectura || {};

  const isEligible = (layer) => {
    if (!layer) return false;
    if (layer.visible === false) return false;
    if (layer.locked === true) return false;
    return true;
  };

  function worldRectFromBounds(b) {
    if (!b) return null;
    if (b.corners) {
      const xs = [b.corners.nw.x, b.corners.ne.x, b.corners.se.x, b.corners.sw.x];
      const ys = [b.corners.nw.y, b.corners.ne.y, b.corners.se.y, b.corners.sw.y];
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      return { minX, maxX, minY, maxY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
    }
    if ([b.minX, b.maxX, b.minY, b.maxY].every(Number.isFinite)) {
      return { minX: b.minX, maxX: b.maxX, minY: b.minY, maxY: b.maxY,
        centerX: (b.minX + b.maxX) / 2, centerY: (b.minY + b.maxY) / 2 };
    }
    return null;
  }

  function eligibleLayerRects(layers, boundsFor) {
    const out = [];
    layers.forEach((layer) => {
      if (!isEligible(layer)) return;
      const rect = worldRectFromBounds(boundsFor(layer));
      if (rect) out.push({ layer, rect });
    });
    return out;
  }

  function aggregateRect(items) {
    if (!items.length) return null;
    let minX = Infinity; let maxX = -Infinity;
    let minY = Infinity; let maxY = -Infinity;
    items.forEach(({ rect }) => {
      if (rect.minX < minX) minX = rect.minX;
      if (rect.maxX > maxX) maxX = rect.maxX;
      if (rect.minY < minY) minY = rect.minY;
      if (rect.maxY > maxY) maxY = rect.maxY;
    });
    if (!Number.isFinite(minX)) return null;
    return { minX, maxX, minY, maxY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
  }

  function getReferenceRect(mode, items, opts = {}) {
    if (mode === 'artboard') {
      const w = opts.artboard?.width;
      const h = opts.artboard?.height;
      if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
      return { minX: 0, maxX: w, minY: 0, maxY: h, centerX: w / 2, centerY: h / 2 };
    }
    if (mode === 'key') {
      const keyId = opts.keyId;
      const found = items.find((it) => it.layer.id === keyId);
      return found ? found.rect : aggregateRect(items);
    }
    return aggregateRect(items);
  }

  // -- Align ops --

  const ALIGN_OPS = {
    alignLeft:    (R, r) => ({ dx: R.minX    - r.minX,    dy: 0 }),
    alignCenterH: (R, r) => ({ dx: R.centerX - r.centerX, dy: 0 }),
    alignRight:   (R, r) => ({ dx: R.maxX    - r.maxX,    dy: 0 }),
    alignTop:     (R, r) => ({ dx: 0, dy: R.minY    - r.minY }),
    alignCenterV: (R, r) => ({ dx: 0, dy: R.centerY - r.centerY }),
    alignBottom:  (R, r) => ({ dx: 0, dy: R.maxY    - r.maxY }),
    // MSC-2 — compound Horizontal & Vertical Align Center: one op that moves
    // each layer on BOTH axes so a single apply (one undo step) snaps the
    // selection concentric to the reference center (video f0191–192).
    alignCenterBoth: (R, r) => ({ dx: R.centerX - r.centerX, dy: R.centerY - r.centerY }),
  };

  function align(op, layers, boundsFor, opts = {}) {
    const fn = ALIGN_OPS[op];
    if (!fn) throw new Error(`align: unknown op "${op}"`);
    const items = eligibleLayerRects(layers, boundsFor);
    const mode = opts.mode || 'selection';
    const R = getReferenceRect(mode, items, opts);
    if (!R) return {};
    const deltas = {};
    items.forEach(({ layer, rect }) => {
      if (mode === 'key' && opts.keyId === layer.id) return; // never move the key
      const { dx, dy } = fn(R, rect);
      if (dx !== 0 || dy !== 0) deltas[layer.id] = { dx, dy };
    });
    return deltas;
  }

  // -- Distribute Objects --

  // For Selection mode: pin outermost two on the axis; for the rest, place the
  // chosen anchor at evenly spaced intervals between them.
  // For Artboard / Key modes: anchors span R.min..R.max on the axis.

  const AXIS_X = {
    minOf: (r) => r.minX,
    maxOf: (r) => r.maxX,
    centerOf: (r) => r.centerX,
    delta: (target, anchorValue) => ({ dx: target - anchorValue, dy: 0 }),
  };

  const AXIS_Y = {
    minOf: (r) => r.minY,
    maxOf: (r) => r.maxY,
    centerOf: (r) => r.centerY,
    delta: (target, anchorValue) => ({ dx: 0, dy: target - anchorValue }),
  };

  function distributeAxis(items, axis, anchorPick, opts) {
    if (items.length < 2) return {};
    const mode = opts.mode || 'selection';
    // Sort by anchor position
    const sorted = items.slice().sort((a, b) => anchorPick(a.rect) - anchorPick(b.rect));

    let minA; let maxA;
    if (mode === 'selection') {
      minA = anchorPick(sorted[0].rect);
      maxA = anchorPick(sorted[sorted.length - 1].rect);
    } else if (mode === 'artboard') {
      const w = opts.artboard?.width;
      const h = opts.artboard?.height;
      // Use the artboard edge that corresponds to the anchor:
      //   minEdge anchor (left/top)     → range = [0, artboardSize]
      //   maxEdge anchor (right/bottom) → range = [0, artboardSize]
      //   center anchor                 → range = [0, artboardSize] (anchors centered between)
      const size = (axis === AXIS_X) ? w : h;
      if (!Number.isFinite(size)) return {};
      minA = 0;
      maxA = size;
    } else if (mode === 'key') {
      const key = items.find((it) => it.layer.id === opts.keyId);
      if (!key) return {};
      minA = axis.minOf(key.rect);
      maxA = axis.maxOf(key.rect);
    } else {
      return {};
    }

    const n = sorted.length;
    if (n < 2) return {};
    const step = (maxA - minA) / (n - 1);
    const deltas = {};
    sorted.forEach((item, i) => {
      // In 'selection' mode the endpoints are pinned to the existing outermost
      // layers; no need to move them.
      if (mode === 'selection' && (i === 0 || i === n - 1)) return;
      // In key mode, don't move the key itself.
      if (mode === 'key' && item.layer.id === opts.keyId) return;
      const target = minA + step * i;
      const current = anchorPick(item.rect);
      const { dx, dy } = axis.delta(target, current);
      if (dx !== 0 || dy !== 0) deltas[item.layer.id] = { dx, dy };
    });
    return deltas;
  }

  function distribute(op, layers, boundsFor, opts = {}) {
    const items = eligibleLayerRects(layers, boundsFor);
    switch (op) {
      case 'distributeLeft':    return distributeAxis(items, AXIS_X, AXIS_X.minOf,    opts);
      case 'distributeCenterH': return distributeAxis(items, AXIS_X, AXIS_X.centerOf, opts);
      case 'distributeRight':   return distributeAxis(items, AXIS_X, AXIS_X.maxOf,    opts);
      case 'distributeTop':     return distributeAxis(items, AXIS_Y, AXIS_Y.minOf,    opts);
      case 'distributeCenterV': return distributeAxis(items, AXIS_Y, AXIS_Y.centerOf, opts);
      case 'distributeBottom':  return distributeAxis(items, AXIS_Y, AXIS_Y.maxOf,    opts);
      default: throw new Error(`distribute: unknown op "${op}"`);
    }
  }

  // -- Distribute Spacing (equal gaps, key-object anchored) --

  function distributeSpacingAxis(items, axis, spacing, opts) {
    if (items.length < 2) return {};
    if (!opts.keyId) return {}; // spacing requires a key object
    const sorted = items.slice().sort((a, b) => axis.minOf(a.rect) - axis.minOf(b.rect));
    const keyIdx = sorted.findIndex((it) => it.layer.id === opts.keyId);
    if (keyIdx < 0) return {};
    const deltas = {};
    // Walk outward from the key: each neighbor is placed at prevMax + spacing
    // (or prevMin - spacing - thisSize when walking backwards).
    let prev = sorted[keyIdx];
    for (let i = keyIdx + 1; i < sorted.length; i++) {
      const cur = sorted[i];
      const curSize = axis.maxOf(cur.rect) - axis.minOf(cur.rect);
      const targetMin = axis.maxOf(prev.rect) + spacing;
      const currentMin = axis.minOf(cur.rect);
      const delta = targetMin - currentMin;
      const { dx, dy } = axis.delta(delta, 0); // we want a translation by `delta`, not snapping
      const realDelta = axis.delta(targetMin, currentMin); // dx/dy = targetMin - currentMin
      // Apply the delta so subsequent neighbors see the shifted rect
      const shifted = {
        ...cur.rect,
        minX: cur.rect.minX + realDelta.dx, maxX: cur.rect.maxX + realDelta.dx,
        minY: cur.rect.minY + realDelta.dy, maxY: cur.rect.maxY + realDelta.dy,
        centerX: cur.rect.centerX + realDelta.dx, centerY: cur.rect.centerY + realDelta.dy,
      };
      if (realDelta.dx !== 0 || realDelta.dy !== 0) deltas[cur.layer.id] = realDelta;
      prev = { ...cur, rect: shifted };
      void dx; void dy; void curSize; // tagged-unused; reserved for future symmetry
    }
    prev = sorted[keyIdx];
    for (let i = keyIdx - 1; i >= 0; i--) {
      const cur = sorted[i];
      const curSize = axis.maxOf(cur.rect) - axis.minOf(cur.rect);
      const targetMax = axis.minOf(prev.rect) - spacing;
      const targetMin = targetMax - curSize;
      const currentMin = axis.minOf(cur.rect);
      const realDelta = axis.delta(targetMin, currentMin);
      const shifted = {
        ...cur.rect,
        minX: cur.rect.minX + realDelta.dx, maxX: cur.rect.maxX + realDelta.dx,
        minY: cur.rect.minY + realDelta.dy, maxY: cur.rect.maxY + realDelta.dy,
        centerX: cur.rect.centerX + realDelta.dx, centerY: cur.rect.centerY + realDelta.dy,
      };
      if (realDelta.dx !== 0 || realDelta.dy !== 0) deltas[cur.layer.id] = realDelta;
      prev = { ...cur, rect: shifted };
    }
    return deltas;
  }

  function distributeSpacing(op, layers, boundsFor, opts = {}) {
    const items = eligibleLayerRects(layers, boundsFor);
    const spacing = Number(opts.spacing) || 0;
    switch (op) {
      case 'distributeSpacingH': return distributeSpacingAxis(items, AXIS_X, spacing, opts);
      case 'distributeSpacingV': return distributeSpacingAxis(items, AXIS_Y, spacing, opts);
      default: throw new Error(`distributeSpacing: unknown op "${op}"`);
    }
  }

  Vectura.AlignOps = {
    worldRectFromBounds,
    eligibleLayerRects,
    aggregateRect,
    getReferenceRect,
    align,
    distribute,
    distributeSpacing,
    _internal: { ALIGN_OPS, AXIS_X, AXIS_Y, distributeAxis, distributeSpacingAxis },
  };
})();
