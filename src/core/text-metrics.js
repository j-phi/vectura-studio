/**
 * Text metrics — pure, DOM-free helpers for on-canvas text editing (M1 seam).
 *
 * These operate on WORLD-space `layer.glyphs`: an array of cell quads produced by
 * the text algorithm and transformed by the engine. Each glyph is:
 *   { sourceIndex, lineIndex, isSpace, quad: [tl, tr, br, bl] }
 * where the quad corners are top-left, top-right, bottom-right, bottom-left in
 * world space (axis-aligned when charRotation === 0). `sourceIndex` is the cell's
 * 0-based offset into the source string; caret indices are insertion positions
 * into that same string.
 *
 * Everything here is deterministic and side-effect-free so it can be unit-tested
 * directly with fixtures (no engine, no canvas).
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  // Cell geometry derived from a quad [tl, tr, br, bl]: left/right edge midpoints,
  // centre, and a normalized horizontal axis (left→right).
  const cellGeom = (quad) => {
    const tl = quad[0]; const tr = quad[1]; const br = quad[2]; const bl = quad[3];
    const left = mid(tl, bl);
    const right = mid(tr, br);
    const center = mid(left, right);
    const ux = right.x - left.x; const uy = right.y - left.y;
    const len = Math.hypot(ux, uy) || 1e-9;
    return { tl, tr, br, bl, left, right, center, axis: { x: ux / len, y: uy / len }, width: len };
  };

  // Vertical band + centre of a glyph quad (axis-aligned bbox in y).
  const quadYBand = (quad) => {
    let minY = Infinity; let maxY = -Infinity; let sy = 0;
    for (const p of quad) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; sy += p.y; }
    return { minY, maxY, cy: sy / quad.length };
  };

  /**
   * Nearest caret position for a world-space click.
   * Prefers the line whose vertical band contains wy (else the nearest line by
   * centre), then the nearest cell within that line. If the click falls past the
   * cell's horizontal midpoint the caret lands AFTER the cell.
   *
   * @returns {{ sourceIndex, caretIndex }} — caretIndex is an insertion index.
   *   For empty glyphs returns { sourceIndex: null, caretIndex: 0 }.
   */
  const pointToCaretIndex = (glyphs, wx, wy) => {
    if (!Array.isArray(glyphs) || glyphs.length === 0) {
      return { sourceIndex: null, caretIndex: 0 };
    }
    // Group by line and pick the best line for wy.
    const lines = new Map();
    for (const g of glyphs) {
      const li = g.lineIndex;
      if (!lines.has(li)) lines.set(li, []);
      lines.get(li).push(g);
    }
    let bestLine = null; let bestLineScore = Infinity;
    lines.forEach((cells, li) => {
      let minY = Infinity; let maxY = -Infinity; let sy = 0; let n = 0;
      for (const g of cells) {
        const b = quadYBand(g.quad);
        if (b.minY < minY) minY = b.minY;
        if (b.maxY > maxY) maxY = b.maxY;
        sy += b.cy; n += 1;
      }
      const cy = sy / Math.max(1, n);
      // Inside the band scores 0; otherwise distance to the band centre.
      const inside = wy >= minY && wy <= maxY;
      const score = inside ? 0 : Math.abs(wy - cy);
      if (score < bestLineScore || (score === bestLineScore && bestLine !== null && li < bestLine)) {
        bestLineScore = score; bestLine = li;
      }
    });
    const cells = lines.get(bestLine);

    // Nearest cell within the line by horizontal projection onto its axis.
    let best = null; let bestDist = Infinity; let bestT = 0;
    for (const g of cells) {
      const cg = cellGeom(g.quad);
      const t = ((wx - cg.left.x) * cg.axis.x + (wy - cg.left.y) * cg.axis.y) / cg.width;
      const clamped = Math.max(0, Math.min(1, t));
      const px = cg.left.x + cg.axis.x * cg.width * clamped;
      const py = cg.left.y + cg.axis.y * cg.width * clamped;
      const dist = Math.hypot(wx - px, wy - py);
      if (dist < bestDist) { bestDist = dist; best = g; bestT = t; }
    }
    if (!best) return { sourceIndex: null, caretIndex: 0 };
    const after = bestT > 0.5;
    return { sourceIndex: best.sourceIndex, caretIndex: after ? best.sourceIndex + 1 : best.sourceIndex };
  };

  /**
   * World-space caret line segment (top → bottom) for an insertion index.
   * The caret sits on the LEFT edge of the cell whose sourceIndex === caretIndex,
   * or on the RIGHT edge of the cell at caretIndex - 1 (end of line / string).
   *
   * @returns {{ x0, y0, x1, y1 }} or null when there are no glyphs.
   */
  const caretIndexToWorldSegment = (glyphs, caretIndex) => {
    if (!Array.isArray(glyphs) || glyphs.length === 0) return null;
    const seg = (top, bottom) => ({ x0: top.x, y0: top.y, x1: bottom.x, y1: bottom.y });

    const before = glyphs.find((g) => g.sourceIndex === caretIndex);
    if (before) { const q = before.quad; return seg(q[0], q[3]); } // left edge tl→bl

    const after = glyphs.find((g) => g.sourceIndex === caretIndex - 1);
    if (after) { const q = after.quad; return seg(q[1], q[2]); } // right edge tr→br

    // Fallback: clamp to the nearest cell by sourceIndex.
    let lower = null; let higher = null;
    for (const g of glyphs) {
      if (g.sourceIndex < caretIndex && (!lower || g.sourceIndex > lower.sourceIndex)) lower = g;
      if (g.sourceIndex >= caretIndex && (!higher || g.sourceIndex < higher.sourceIndex)) higher = g;
    }
    if (lower) { const q = lower.quad; return seg(q[1], q[2]); }
    if (higher) { const q = higher.quad; return seg(q[0], q[3]); }
    return null;
  };

  const isWs = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';

  /**
   * Whitespace-delimited word range containing `sourceIndex`. If the index sits on
   * whitespace, the contiguous whitespace run is returned instead.
   * @returns {{ start, end }} half-open [start, end).
   */
  const wordRangeAt = (text, sourceIndex) => {
    const s = String(text == null ? '' : text);
    if (s.length === 0) return { start: 0, end: 0 };
    let i = Math.max(0, Math.min(s.length - 1, sourceIndex | 0));
    const wsRun = isWs(s[i]);
    const match = (ch) => isWs(ch) === wsRun && ch !== '\n';
    // A newline is its own boundary — never span across it.
    if (s[i] === '\n') return { start: i, end: i };
    let start = i; let end = i + 1;
    while (start > 0 && match(s[start - 1])) start -= 1;
    while (end < s.length && match(s[end])) end += 1;
    return { start, end };
  };

  /**
   * Paragraph range containing `sourceIndex`, bounded by '\n' (exclusive).
   * @returns {{ start, end }} half-open [start, end); end is the next '\n' index
   *   or text length.
   */
  const paragraphRangeAt = (text, sourceIndex) => {
    const s = String(text == null ? '' : text);
    const idx = Math.max(0, Math.min(s.length, sourceIndex | 0));
    let start = idx;
    while (start > 0 && s[start - 1] !== '\n') start -= 1;
    let end = idx;
    while (end < s.length && s[end] !== '\n') end += 1;
    return { start, end };
  };

  Vectura.TextMetrics = {
    pointToCaretIndex,
    caretIndexToWorldSegment,
    wordRangeAt,
    paragraphRangeAt,
  };
})();
