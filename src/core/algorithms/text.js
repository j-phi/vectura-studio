/**
 * text algorithm — plotter-native single-line typography.
 *
 * Lays a string out with the built-in monoline stroke font (window.Vectura
 * .StrokeFont) and fits the result into the document frame. Because the font is
 * single-stroke, the output is pen-ready vector line art (no fills, no doubled
 * outlines). Supports multi-line text, alignment, tracking, frame-fit or absolute
 * sizing, manual offset, and an optional hand-drawn jitter.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});
  window.Vectura.AlgorithmRegistry = window.Vectura.AlgorithmRegistry || {};

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const finite = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

  // Catmull-Rom tension used to bezierize the built-in stroke-font's designed curve
  // strokes (bowls/arcs/splines). 1 is standard uniform Catmull-Rom — the same
  // spline the font sampler uses — so the native cubics reproduce the intended
  // contour exactly while removing the sampled polyline's visible facets.
  const STROKE_CURVE_SMOOTHING = 1;

  // Banded-bold result cache. The concentric erosion fill costs tens of ms per
  // glyph, but its output is a PURE function of the glyph's stroke geometry
  // (translation-normalized), the pass count and the pen/spacing — so repeated
  // letters, and every re-render while typing, hit this instead of recomputing.
  // Values store chains in bbox-origin space; hits translate them back. Cleared
  // wholesale when it grows past the cap (jittered text never caches — see call
  // site). Deterministic: keys are geometry, values are pure derivations.
  const BAND_FILL_CACHE = new Map();
  const BAND_FILL_CACHE_MAX = 512;

  // Proper segment crossing (shared endpoints / collinear touches excluded) — the
  // signal that two glyph outlines genuinely cross, used to decide whether a pair
  // of glyphs must be welded by the merge-overlaps union.
  const segCross = (ax, ay, bx, by, cx, cy, dx, dy) => {
    const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
    const s1 = o(ax, ay, bx, by, cx, cy);
    const s2 = o(ax, ay, bx, by, dx, dy);
    const s3 = o(cx, cy, dx, dy, ax, ay);
    const s4 = o(cx, cy, dx, dy, bx, by);
    return s1 !== s2 && s3 !== s4 && s1 !== 0 && s2 !== 0 && s3 !== 0 && s4 !== 0;
  };

  // Even-odd point membership across a glyph's full ring set (shells + counters),
  // so containment — one glyph nesting inside another's ink (connected scripts) —
  // also registers as overlap.
  const ptInGlyph = (px, py, ringList) => {
    let inside = false;
    for (const ring of ringList) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i].x; const yi = ring[i].y;
        const xj = ring[j].x; const yj = ring[j].y;
        if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-9) + xi) inside = !inside;
      }
    }
    return inside;
  };

  const _signedArea = (poly) => {
    let a = 0;
    for (let i = 0, n = poly.length; i < n; i += 1) {
      const p = poly[i]; const q = poly[(i + 1) % n];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  };

  const _bbox = (poly) => {
    let mnx = Infinity; let mny = Infinity; let mxx = -Infinity; let mxy = -Infinity;
    for (const p of poly) {
      if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x;
      if (p.y < mny) mny = p.y; if (p.y > mxy) mxy = p.y;
    }
    return { mnx, mny, mxx, mxy };
  };

  const _pointInPoly = (poly, px, py) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x; const yi = poly[i].y; const xj = poly[j].x; const yj = poly[j].y;
      if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-9) + xi) inside = !inside;
    }
    return inside;
  };

  // Nonzero winding membership across a set of loops — the ink predicate the fill
  // engine uses. A point in a carved counter (outer +1, counter −1) sums to 0.
  // Optional per-loop bboxes skip loops the point lies outside of: a closed loop
  // contributes 0 winding to any point beyond its bbox, so the reject is exact and
  // collapses an O(all-contours) test to the point's own glyph.
  const _inkNonzero = (regions, px, py, bxs) => {
    let w = 0;
    for (let ri = 0; ri < regions.length; ri += 1) {
      if (bxs) { const b = bxs[ri]; if (px < b.mnx || px > b.mxx || py < b.mny || py > b.mxy) continue; }
      const poly = regions[ri];
      for (let i = 0, n = poly.length; i < n; i += 1) {
        const a = poly[i]; const b = poly[(i + 1) % n];
        if (a.y <= py) {
          if (b.y > py && (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x) > 0) w += 1;
        } else if (b.y <= py && (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x) < 0) w -= 1;
      }
    }
    return w !== 0;
  };

  // Squared distance from point (px,py) to segment a→b.
  const _segDistSq = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax; const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px - (ax + t * dx); const ey = py - (ay + t * dy);
    return ex * ex + ey * ey;
  };

  // Is loop C PROPERLY nested inside loop D? True when every vertex of C is inside D
  // OR within `eps` of D's boundary. This distinguishes a real counter (fully
  // contained by its shell) from two OVERLAPPING same-winding subpaths (a script
  // ball terminal poking out of the body), where neither contains the other. The
  // eps band matters because both loops are CHORD approximations of their béziers
  // (flatten tol): a convex shell's chords bow inward by up to the sagitta, so a
  // genuine counter vertex on a thin wall can fall a hair OUTSIDE the shell polygon
  // — without tolerance it would be misread as a sibling and the counter would
  // flood. Real siblings poke out by far more than eps, so the sibling fix holds.
  const _properlyInside = (C, D, eps) => {
    if (!C.length) return false;
    const e2 = eps * eps;
    for (let v = 0; v < C.length; v += 1) {
      const px = C[v].x; const py = C[v].y;
      if (_pointInPoly(D, px, py)) continue;
      let near = false;
      for (let i = 0, n = D.length, j = n - 1; i < n; j = i++) {
        if (_segDistSq(px, py, D[j].x, D[j].y, D[i].x, D[i].y) <= e2) { near = true; break; }
      }
      if (!near) return false;
    }
    return true;
  };

  // Canonicalize contour winding by containment DEPTH so the pattern engine's
  // area-signed inset (insetPolygon keys direction off polyArea's sign) always
  // erodes ink INWARD, whatever winding the font authored. TrueType winds its
  // outer contours opposite to CFF/OTF, and opentype's y-flip flips it again, so
  // keying the safety inset off absolute polyArea would DILATE a CW-authored outer
  // straight past the outline (the exact peek this guards against). Even nesting
  // depth (outer) → positive area; odd (counter) → negative. Depth counts only
  // PROPER containment (eps-tolerant), so overlapping same-winding siblings both
  // stay outer and keep a consistent winding (nonzero then unions them — no weld
  // void). Mutates in place, so callers must pass arrays not shared with the
  // outline geometry.
  const canonicalizeFillWinding = (regions, eps = 0) => {
    const bxs = regions.map(_bbox);
    for (let i = 0; i < regions.length; i += 1) {
      const bc = bxs[i];
      let depth = 0;
      for (let k = 0; k < regions.length; k += 1) {
        if (k === i) continue;
        const bd = bxs[k];
        // Necessary condition for C ⊂ D: C's bbox sits within D's (eps-expanded) bbox.
        if (bc.mnx < bd.mnx - eps || bc.mxx > bd.mxx + eps || bc.mny < bd.mny - eps || bc.mxy > bd.mxy + eps) continue;
        if (_properlyInside(regions[i], regions[k], eps)) depth += 1;
      }
      const wantPositive = (depth % 2 === 0);
      if ((_signedArea(regions[i]) > 0) !== wantPositive) regions[i].reverse();
    }
    return regions;
  };

  window.Vectura.AlgorithmRegistry.text = {
    generate: (p, rng, noise, bounds) => {
      const Font = Vectura.StrokeFont;
      if (!Font) return [];
      const raw = p.text == null ? '' : String(p.text);
      // Area type (Illustrator-style): text word-wraps inside a fixed frame. The
      // frame (mm, local space) drives the layout wrap width and is emitted as a
      // sidecar so the renderer can draw it — even for an EMPTY box (so a freshly
      // dragged area frame is visible with just a caret). Point type is unchanged.
      const frameW = Math.max(0, finite(p.frameWidth, 0));
      const frameH = Math.max(0, finite(p.frameHeight, 0));
      const isArea = p.textMode === 'area' && frameW > 0;
      // An all-empty string yields nothing to plot — except an area box, which
      // still emits its frame + (empty) glyph sidecar.
      if (!isArea && !raw.replace(/\n/g, '').trim()) return [];
      // allCaps uppercases the whole string before layout (independent of the
      // synthesized smallCaps option, which lowercases-as-small-uppercase).
      const str = p.allCaps === true ? raw.toUpperCase() : raw;

      const size = clamp(finite(p.fontSize, 40), 1, 1000);
      const tracking = finite(p.tracking, 0);
      // Built-in monoline "weight" is drawn as extra parallel pen passes. Those
      // passes both (F-03) spread ink sideways — so the advance must widen to keep
      // stems from merging — and (F-04) must be optically clamped at small cap
      // sizes so counters don't clog. StrokeFont.weightMetrics is the single pure
      // source for both numbers; penW is the plotter pen width (mm).
      const penW = Math.max(1e-3, finite(bounds && bounds.penWidth, 0.35));
      const builtinPasses = Font.weightPasses ? Font.weightPasses(p.fontWeight) : 0;
      const wMetrics = Font.weightMetrics
        ? Font.weightMetrics(builtinPasses, size, penW)
        : { clampedThickness: 1 + builtinPasses, extraTrackingMM: 0 };
      // F-03: widen advance for heavier built-in weights (web faces carry real
      // weighted outlines, so they keep the plain tracking).
      const builtinTracking = tracking + wMetrics.extraTrackingMM;
      const lineHeight = clamp(finite(p.lineHeight, 1.4), 0.5, 5);
      // 'left'/'right' explicit; the four justify variants pass straight through;
      // anything else (including the historical default) stays 'center'.
      const ALIGN_OK = { left: 1, right: 1, 'justify-left': 1, 'justify-center': 1, 'justify-right': 1, 'justify-all': 1 };
      const align = ALIGN_OK[p.align] ? p.align : 'center';
      const jitter = Math.max(0, finite(p.jitter, 0));
      const smoothing = Math.max(0, finite(p.smoothing, 0));
      // Synthesis / paragraph / OpenType opts forwarded verbatim to the layout
      // engine. Each defaults to a no-op in BOTH faces, so with the panel at
      // factory values the laid-out geometry is byte-identical to before.
      const synOpts = {
        fontWeight: p.fontWeight,
        vScale: p.vScale,
        hScale: p.hScale,
        kernPairs: p.kernPairs,
        baselineShift: p.baselineShift,
        indentLeft: p.indentLeft,
        indentRight: p.indentRight,
        indentFirst: p.indentFirst,
        spaceBefore: p.spaceBefore,
        spaceAfter: p.spaceAfter,
        // allCaps and smallCaps are mutually exclusive (allCaps wins); likewise
        // superscript and subscript (superscript wins). The panel enforces this
        // on toggle, but guarding here keeps legacy/serialized files consistent.
        smallCaps: p.allCaps === true ? false : p.smallCaps,
        superscript: p.superscript,
        subscript: p.superscript === true ? false : p.subscript,
        otLigatures: p.otLigatures,
        otContextual: p.otContextual,
        otDiscretionary: p.otDiscretionary,
        otSwash: p.otSwash,
        otStylistic: p.otStylistic,
        otFractions: p.otFractions,
        otFigures: p.otFigures,
        otPosition: p.otPosition,
        hyphenate: p.hyphenate,
      };
      // Native bezier output and pattern fills only make sense for outline (web)
      // faces — the built-in stroke fonts are single-pass monoline polylines with
      // no enclosed interior. Both are off unless a parsed web face is in use.
      const wantBezier = p.bezierOutline === true && jitter === 0;

      // A `google:<slug>` font selects a web typeface; its glyph *outlines* are
      // traced. The parsed face loads asynchronously, so the first pass falls back
      // to the built-in stroke font and the loader re-renders the layer once the
      // real letterforms arrive (mirrors how picture layers decode).
      const Web = Vectura.GoogleFonts;
      let laid = null;
      let isOutline = false;
      if (Web && Web.isWebFontKey(p.font)) {
        const id = Web.keyToId(p.font);
        if (Web.getParsed(id)) {
          // Area type drives the wrap width from the frame; areaWrap keeps
          // sourceIndex exact (word-level break, no synthetic hyphen) so wrapped
          // web-font text is editable when ligatures are off (the editor's state).
          laid = Web.layout(str, {
            id, size, tracking, lineHeight, align, smoothing, bezier: wantBezier,
            wrapWidth: isArea ? frameW : 0, areaWrap: isArea,
            ...synOpts,
          });
          isOutline = true;
        } else {
          if (Web.getFontStatus(id) === 'idle') Web.ensureFont(id).catch(() => {});
          // Stroke-font placeholder while the web face parses. It must honour the
          // area frame too (wrapWidth/areaWrap) so the pre-parse flash wraps to the
          // box instead of overflowing as one long line; the loader re-renders with
          // the real outlines once they arrive.
          laid = Font.layout(str, {
            size, tracking: builtinTracking, lineHeight, align, font: 'sans',
            wrapWidth: isArea ? frameW : 0, areaWrap: isArea,
            ...synOpts,
          });
        }
      } else {
        laid = Font.layout(str, {
          size, tracking: builtinTracking, lineHeight, align, font: p.font || 'sans',
          // Area type drives the wrap width from the frame; areaWrap keeps
          // sourceIndex exact (word-level break, no synthetic hyphen).
          wrapWidth: isArea ? frameW : 0, areaWrap: isArea,
          ...synOpts,
        });
      }
      const paths = laid.paths;
      const laidAnchors = isOutline && wantBezier ? laid.anchors : null;
      // Empty area boxes have no paths but must still emit their frame + glyph
      // sidecars, so only bail early for non-area layers.
      if (!paths.length && !isArea) return [];

      // Block reference box (mm). Point type centres on the rendered-stroke bbox
      // so it re-centres as text changes. AREA type instead anchors to the FIXED
      // frame (centred on the frame rect, top-left at layout 0,0), so the text
      // stays top-left-anchored in the frame regardless of how much is typed — and
      // an empty box (no strokes) still has a well-defined placement.
      let blockW; let blockH; let blockCx; let blockCy;
      if (isArea) {
        blockW = Math.max(1e-3, frameW);
        blockH = Math.max(1e-3, frameH);
        blockCx = frameW / 2;
        blockCy = frameH / 2;
      } else {
        let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
        for (const path of paths) {
          for (const pt of path) {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
          }
        }
        blockW = Math.max(1e-3, maxX - minX);
        blockH = Math.max(1e-3, maxY - minY);
        blockCy = (minY + maxY) / 2;
        blockCx = (minX + maxX) / 2;
        // Absolute-size point text anchors on its ALIGNMENT edge (Illustrator-
        // style): the on-canvas Type tool creates layers with align:'left',
        // fitToFrame:false, so pinning the block's LEFT edge to the display
        // reference keeps that edge fixed as text is typed — the string grows
        // rightward and never shoves earlier glyphs left. Right/justify-right pin
        // the RIGHT edge (grows leftward). Fit-to-frame text stays CENTRED (it is
        // scaled to fill the frame, so re-centring is the intended behaviour), as
        // does the historical centre default. Vertical anchor stays centred so a
        // single line matches the empty-box caret's vertical midpoint.
        //
        // The edge is taken from the LAYOUT CELL box (pen advance), not the ink
        // bbox: cell.x0 of the first slot is the pen origin — exactly where the
        // empty-box caret sits — so the caret and first glyph stay continuous, and
        // the anchor is immune to per-glyph side bearings (a changing first/last
        // character would drift an ink-bbox anchor). Falls back to the ink centre
        // when a face emits no cells (headless monoline).
        const anchorLeft = align === 'left' || align === 'justify-left';
        const anchorRight = align === 'right' || align === 'justify-right';
        const cellsForAnchor = Array.isArray(laid.cells) ? laid.cells : [];
        if (p.fitToFrame === false && (anchorLeft || anchorRight) && cellsForAnchor.length) {
          let edge = anchorLeft ? Infinity : -Infinity;
          for (const c of cellsForAnchor) {
            if (anchorLeft) { if (c.x0 < edge) edge = c.x0; }
            else if (c.x1 > edge) edge = c.x1;
          }
          if (Number.isFinite(edge)) blockCx = edge;
        }
      }

      const { m, dW, dH } = bounds;
      // Fit-to-frame scales the whole block to the display area (the fontSize
      // slider then only sets relative proportions); absolute mode keeps mm size.
      // Area type is ALWAYS absolute (constant point size — the frame wraps, it
      // does not rescale the glyphs).
      let scale = 1;
      if (!isArea && p.fitToFrame !== false) {
        const fillR = clamp(finite(p.fillRatio, 0.9), 0.1, 1);
        scale = (Math.min(dW / blockW, dH / blockH) || 1) * fillR;
      }

      const cx = m + dW / 2 + finite(p.offsetX, 0);
      const cy = m + dH / 2 + finite(p.offsetY, 0);
      const wobble = () => (rng && jitter > 0 ? (rng.nextFloat() - 0.5) * 2 * jitter : 0);
      const txPt = (pt) => ({ x: cx + (pt.x - blockCx) * scale, y: cy + (pt.y - blockCy) * scale });

      // ── Per-character rotation ──────────────────────────────────────────────
      // Spin every contour of a glyph about THAT glyph's own centroid, in layout
      // space, BEFORE the shared display transform. Because the transform is a
      // uniform scale + translation it commutes with rotation, so the on-screen
      // result is a true per-glyph spin while the jitter rng stream stays
      // untouched (rotation is identity at 0°, so output is byte-for-byte). meta
      // is index-aligned with paths; lineIndex+glyphIndex is the unique glyph key
      // (glyphIndex restarts each line).
      const meta = Array.isArray(laid.meta) ? laid.meta : [];
      const charRot = finite(p.charRotation, 0);
      const glyphKey = (i) => { const mi = meta[i]; return mi ? mi.lineIndex + ':' + mi.glyphIndex : 'p' + i; };
      let glyphCentroid = null;
      if (charRot !== 0) {
        const acc = new Map();
        paths.forEach((path, i) => {
          const k = glyphKey(i);
          let e = acc.get(k);
          if (!e) { e = { sx: 0, sy: 0, n: 0 }; acc.set(k, e); }
          for (const pt of path) { e.sx += pt.x; e.sy += pt.y; e.n += 1; }
        });
        glyphCentroid = new Map();
        acc.forEach((e, k) => glyphCentroid.set(k, { x: e.sx / e.n, y: e.sy / e.n }));
      }
      const rotCos = Math.cos((charRot * Math.PI) / 180);
      const rotSin = Math.sin((charRot * Math.PI) / 180);
      const rotPt = (pt, i) => {
        if (!glyphCentroid) return pt;
        const c = glyphCentroid.get(glyphKey(i));
        if (!c) return pt;
        const dx = pt.x - c.x; const dy = pt.y - c.y;
        return { x: c.x + dx * rotCos - dy * rotSin, y: c.y + dx * rotSin + dy * rotCos };
      };
      // Layout point → display space, applying the per-glyph rotation first
      // (used by the native-bezier anchor outline, which bypasses `contours`).
      const txPtRot = (h, i) => (h ? txPt(rotPt(h, i)) : null);

      // Finely flatten a glyph contour's NATIVE cubic anchors straight into display
      // space. The outline is rendered from these same béziers, so a fill clipped
      // to this polygon hugs the visible border exactly. `contours` (below) are the
      // font's LAYOUT-space polylines, flattened at a Smoothing-scaled tolerance —
      // coarse enough that on a convex curve the chords fall inside the true edge
      // (white gap) and on a concave one they bulge past it (hatch peeks outside).
      // Re-flattening the anchors here at a tight display-space tolerance removes
      // both artifacts. Returns null when a glyph carries no usable anchors
      // (monoline face / headless without bézier data) → caller falls back to the
      // coarse contour, which is still self-consistent for straight-edged faces.
      const FILL_FLATTEN_TOL = 0.08; // display-space (≈ mm) max chord deviation
      const flattenAnchorsForFill = (anchors, ci) => {
        if (!Array.isArray(anchors) || anchors.length < 2) return null;
        const P = anchors.map((a) => ({
          p: txPtRot(a, ci),
          out: a.out ? txPtRot(a.out, ci) : null,
          in: a.in ? txPtRot(a.in, ci) : null,
        }));
        const tolSq = FILL_FLATTEN_TOL * FILL_FLATTEN_TOL;
        const out = [{ x: P[0].p.x, y: P[0].p.y }];
        const cubic = (p0, c1, c2, p1, depth) => {
          const dx = p1.x - p0.x, dy = p1.y - p0.y;
          const chordSq = dx * dx + dy * dy;
          if (depth >= 14 || chordSq < tolSq) { out.push({ x: p1.x, y: p1.y }); return; }
          const d1 = (c1.x - p0.x) * dy - (c1.y - p0.y) * dx;
          const d2 = (c2.x - p0.x) * dy - (c2.y - p0.y) * dx;
          const thresh = tolSq * chordSq;
          if (d1 * d1 <= thresh && d2 * d2 <= thresh) { out.push({ x: p1.x, y: p1.y }); return; }
          const m01x = (p0.x + c1.x) * 0.5, m01y = (p0.y + c1.y) * 0.5;
          const m12x = (c1.x + c2.x) * 0.5, m12y = (c1.y + c2.y) * 0.5;
          const m23x = (c2.x + p1.x) * 0.5, m23y = (c2.y + p1.y) * 0.5;
          const a012x = (m01x + m12x) * 0.5, a012y = (m01y + m12y) * 0.5;
          const a123x = (m12x + m23x) * 0.5, a123y = (m12y + m23y) * 0.5;
          const midx = (a012x + a123x) * 0.5, midy = (a012y + a123y) * 0.5;
          cubic(p0, { x: m01x, y: m01y }, { x: a012x, y: a012y }, { x: midx, y: midy }, depth + 1);
          cubic({ x: midx, y: midy }, { x: a123x, y: a123y }, { x: m23x, y: m23y }, p1, depth + 1);
        };
        const n = P.length;
        for (let i = 0; i < n; i += 1) {
          const A = P[i], B = P[(i + 1) % n];
          if (A.out || B.in) cubic(A.p, A.out || A.p, B.in || B.p, B.p, 0);
          else out.push({ x: B.p.x, y: B.p.y });
        }
        return out.length >= 3 ? out : null;
      };

      // Transform every contour into display space (jitter, when set, wobbles each
      // point — two rng draws per point, preserving the historical stream). These
      // closed point arrays double as the fill regions so fills hug the outline.
      const contours = paths.map((path, i) => path.map((pt) => {
        const r = rotPt(pt, i);
        return {
          x: cx + (r.x - blockCx) * scale + wobble(),
          y: cy + (r.y - blockCy) * scale + wobble(),
        };
      }));

      // ── On-canvas editor glyph cells (M1 seam) ──────────────────────────────
      // Project each layout cell (incl. spaces) into display space as a quad so an
      // editor can hit-test clicks and place a caret. Quad corner order is
      // [topLeft, topRight, bottomRight, bottomLeft]; the cell box spans cap-top
      // (baselineY - size) to the baseline. Hit-testing is only valid when
      // jitter===0 — jitter wobbles the ink off these pre-jitter quads (the quads
      // themselves are always the clean pre-jitter geometry). Under per-glyph
      // charRotation the quad is spun about the glyph's ink centroid (same pivot
      // the paths use), falling back to the cell centre for zero-stroke cells.
      const laidCells = Array.isArray(laid.cells) ? laid.cells : [];
      const glyphs = [];
      if (laidCells.length) {
        const lineCounters = new Map();
        for (const cell of laidCells) {
          const li = cell.lineIndex;
          const idxInLine = lineCounters.get(li) || 0;
          lineCounters.set(li, idxInLine + 1);
          const top = cell.baselineY - size; // cap-top in layout space
          const bot = cell.baselineY;        // baseline
          let corners = [
            { x: cell.x0, y: top },
            { x: cell.x1, y: top },
            { x: cell.x1, y: bot },
            { x: cell.x0, y: bot },
          ];
          if (charRot !== 0) {
            const c = glyphCentroid && glyphCentroid.get(li + ':' + idxInLine);
            const pivot = c || { x: (cell.x0 + cell.x1) / 2, y: (top + bot) / 2 };
            corners = corners.map((pt) => {
              const dx = pt.x - pivot.x; const dy = pt.y - pivot.y;
              return { x: pivot.x + dx * rotCos - dy * rotSin, y: pivot.y + dx * rotSin + dy * rotCos };
            });
          }
          glyphs.push({
            sourceIndex: cell.sourceIndex,
            lineIndex: li,
            isSpace: cell.isSpace === true,
            quad: corners.map((pt) => txPt(pt)),
          });
        }
      }

      const out = [];

      // ── Fill ──────────────────────────────────────────────────────────────
      // Outline glyph contours are closed, so the shared pattern-fill engine can
      // hatch/dot/spiral their interiors. Passing every contour as `regions` lets
      // its even-odd rule carve holes (O, A, e, B) out automatically.
      const genFill = Vectura.AlgorithmRegistry._generatePatternFillPaths;
      const PB = Vectura.PaintBucketOps;
      if (p.fillEnabled && isOutline && genFill && PB && p.fillType && p.fillType !== 'none') {
        // Prefer the anchor-flattened outline for each contour so the fill clips
        // to the SAME geometry the border is drawn from; fall back to the coarse
        // display contour (index-aligned with laidAnchors) when a glyph has none.
        const fillRegions = [];
        const fillKeys = [];
        let anyCoarse = false;
        contours.forEach((c, ci) => {
          if (!c || c.length < 3) return;
          const a = laidAnchors ? laidAnchors[ci] : null;
          const fine = (a && a.length >= 2) ? flattenAnchorsForFill(a, ci) : null;
          if (!fine) anyCoarse = true;
          // The coarse fallback shares the outline's contour array — copy it so the
          // winding canonicalization below can't reorder the drawn outline.
          fillRegions.push(fine || c.slice());
          fillKeys.push(glyphKey(ci));
        });
        // Force outer→positive / counter→negative winding by nesting depth so the
        // engine's safety inset erodes ink inward for every font winding. Depth is
        // only a sound outer/counter signal WITHIN a single glyph (its shells never
        // overlap and its counters truly nest); across glyphs, connected-script /
        // kerned outlines overlap, so a block-wide pass would mis-read a neighbour's
        // ink as nesting and flip an outer negative (weld void + dilated peek).
        // Group by glyph and canonicalize each set independently.
        const byGlyph = new Map();
        fillRegions.forEach((r, i) => {
          let arr = byGlyph.get(fillKeys[i]);
          if (!arr) { arr = []; byGlyph.set(fillKeys[i], arr); }
          arr.push(r);
        });
        // Winding-canonicalization eps must absorb a thin-wall counter vertex that
        // sits just outside its shell's inward-bowed chords. The bound is 2× the
        // chord sagitta, which equals the flatten tolerance of whichever geometry
        // the fill used: FILL_FLATTEN_TOL (display) for the anchor path, but the
        // COARSE fallback is flattened in layout space at laid.flattenTol, whose
        // DISPLAY sagitta = flattenTol·scale GROWS with size — so a large glyph
        // rendered without bézier anchors (bezierOutline off / jitter / small-caps)
        // needs a bigger eps or its counters would flood. Real overlapping siblings
        // poke out by far more than this, so the sibling fix is preserved.
        const coarseSag = anyCoarse ? (finite(laid.flattenTol, 0) * scale) : 0;
        const winEps = 2 * Math.max(FILL_FLATTEN_TOL, coarseSag);
        byGlyph.forEach((group) => canonicalizeFillWinding(group, winEps));
        if (fillRegions.length) {
          const insetOn = p.fillInsetEnabled === true;
          // Fill Offset is a literal mm translation of the fill WINDOW: slide the
          // region polygons (the outline stays put), mirroring the specimen
          // preview. Feeding it into the engine's hatch shift only re-phases the
          // scanlines — the clip region never moves and the X axis is a no-op at
          // angle 0 — so we translate the geometry instead.
          const offX = clamp(finite(p.fillOffsetX, 0), -200, 200);
          const offY = clamp(finite(p.fillOffsetY, 0), -200, 200);
          const placed = (offX || offY)
            ? fillRegions.map((r) => r.map((pt) => ({ x: pt.x + offX, y: pt.y + offY })))
            : fillRegions;
          // Always erode the fill by at least the flattening tolerance so the hatch
          // is PROVABLY inside the true (bézier) outline: the chord polygon can
          // otherwise bulge up to FILL_FLATTEN_TOL past a concave edge or into a
          // counter (o/e/a bowls). A larger user inset wins. Padding is signed per
          // region by the engine (outer shrinks, counters grow), so counters stay
          // carved.
          const userInset = insetOn ? Math.max(0, finite(p.fillInset, 1.5)) : 0;
          // Fill Angle is authored on the AngleDial (0° up, clockwise-positive:
          // needle direction = (sin d, -cos d)). The shared pattern-fill engine
          // measures its hatch angle from the +x axis (line direction
          // (cos a, sin a)), so a raw dial value draws lines PERPENDICULAR to the
          // needle (a "/" pick renders "\"). Subtract 90° so the hatch runs
          // parallel to what the dial shows.
          const dialAngle = finite(p.fillAngle, 0) - 90;
          const fillParams = Object.assign({}, p, { fillAngle: dialAngle, fillPadding: Math.max(userInset, FILL_FLATTEN_TOL) });
          const rec = PB.buildFillRecord({ polygon: placed[0], innerPolygon: null, loopId: 'text', isDocBounds: false }, fillParams);
          rec.regions = placed;
          // Glyph outlines are authored for the NONZERO fill rule (outer and
          // counter wound oppositely). Nonzero unions overlapping connected-script
          // glyphs while still carving counters; for non-overlapping faces it is
          // identical to even-odd, so this only changes scripts like Pacifico.
          rec.windingRule = 'nonzero';
          delete rec.region;
          delete rec.innerRegion;
          let fills = [];
          try { fills = genFill(rec) || []; } catch (_) { fills = []; }
          // Hard no-peek guard. Two ways the engine can re-ink past the border: a
          // large user inset on a thin wall (the dilated counter crosses the eroded
          // outer), or a winding mis-flip on a self-overlapping glyph (a dilated
          // subpath). Drop any fill segment with a vertex outside the original
          // (un-inset) ink 'placed' — the fill may thin out or vanish, but it must
          // never cross the outline. The bbox reject makes this ~free, so it runs
          // whenever fill is enabled, not only when an inset is set.
          const inkBoxes = placed.map(_bbox);
          fills = fills.filter((fp) => Array.isArray(fp) && fp.every((pt) => _inkNonzero(placed, pt.x, pt.y, inkBoxes)));
          for (const fp of fills) {
            if (!Array.isArray(fp) || fp.length < 2) continue;
            // Most fills are plain polylines; bezier-smoothed contour rings arrive
            // with native cubic handles (meta.anchors) that must survive tagging.
            const prev = fp.meta;
            fp.meta = prev && prev.anchors
              ? { ...prev, algorithm: 'text', textFill: true }
              : { algorithm: 'text', straight: true, textFill: true };
            out.push(fp);
          }
        }
      }

      // ── Stroke outline ────────────────────────────────────────────────────
      // The outline can be turned off entirely for fill-only typography. When the
      // pen weight is > 1 the stroke is thickened into parallel offset passes
      // (shared GeometryUtils engine) — those are plain polylines, so the native
      // bezier handles are intentionally dropped for the heavier look.
      if (p.outlineStroke !== false) {
        const GU = Vectura.GeometryUtils;
        const FB = Vectura.FillBoolean;
        // Built-in monoline "weight" is the pen: a heavier Style (Medium/Semibold/
        // Bold) wraps extra parallel pen passes around every stroke via thickenPaths.
        // Web faces carry real weighted outlines, so they add no passes here.
        const weightPasses = (!isOutline && Font.weightPasses) ? Font.weightPasses(p.fontWeight) : 0;
        // F-04: clamp the pen-pass contribution by optical size so small text keeps
        // open counters (StrokeFont.weightMetrics.clampedThickness == 1 + passes at
        // large caps, fewer as the cap size shrinks). Any user outlineThickness > 1
        // is preserved additively.
        const clampedPass = Font.weightMetrics
          ? Font.weightMetrics(weightPasses, size, penW).clampedThickness
          : 1 + weightPasses;
        const thickness = Math.max(1, Math.round(finite(p.outlineThickness, 1)) - 1 + clampedPass);

        // ── Merge Overlaps ──────────────────────────────────────────────────
        // Weld kerned pairs (RA, AV, LT…) and connected scripts so they never draw
        // crossing contour lines through each other — but ONLY the glyphs whose ink
        // genuinely overlaps. Every glyph is clustered by real ink overlap (proper
        // edge crossing or containment); a cluster of touching glyphs is flattened
        // by the nonzero union (counters carve, no anchors), while every glyph that
        // touches nothing — the common case for ordinary text — keeps its native
        // cubic outline. So "merge overlaps" and full bezier accuracy now coexist
        // by default instead of the union flattening the whole string.
        //
        // strokeItems carry { pts, idx }: idx >= 0 is an original glyph contour
        // (native anchors in laidAnchors[idx] survive), idx === -1 is a welded
        // ring. Falls back to per-contour passthrough when the boolean lib is
        // unavailable (headless without polygon-clipping).
        let strokeItems;
        const canMerge = p.mergeOverlaps !== false && isOutline && FB && FB.nonZeroUnionByContainment;
        if (canMerge) {
          // Group contour indices by their owning glyph, tracking each glyph bbox.
          const byGlyph = new Map();
          contours.forEach((c, i) => {
            if (c.length < 3) return;
            const k = glyphKey(i);
            let e = byGlyph.get(k);
            if (!e) { e = { idxs: [], minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }; byGlyph.set(k, e); }
            e.idxs.push(i);
            for (const pt of c) {
              if (pt.x < e.minX) e.minX = pt.x;
              if (pt.x > e.maxX) e.maxX = pt.x;
              if (pt.y < e.minY) e.minY = pt.y;
              if (pt.y > e.maxY) e.maxY = pt.y;
            }
          });
          const mergeGlyphs = [...byGlyph.values()];
          // Union-find glyphs that overlap: cheap bbox reject, then proper edge
          // crossing or containment. Only overlapping clusters get flattened.
          // (Named `mergeGlyphs` to avoid shadowing the editor `glyphs` sidecar.)
          const parent = mergeGlyphs.map((_, i) => i);
          const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
          const ringsOf = (g) => g.idxs.map((i) => contours[i]);
          const overlap = (a, b) => {
            if (a.minX > b.maxX || b.minX > a.maxX || a.minY > b.maxY || b.minY > a.maxY) return false;
            const ra = ringsOf(a); const rb = ringsOf(b);
            for (const A of ra) for (const B of rb) {
              for (let m = 1; m < A.length; m += 1) for (let n = 1; n < B.length; n += 1) {
                if (segCross(A[m - 1].x, A[m - 1].y, A[m].x, A[m].y, B[n - 1].x, B[n - 1].y, B[n].x, B[n].y)) return true;
              }
            }
            return ptInGlyph(ra[0][0].x, ra[0][0].y, rb) || ptInGlyph(rb[0][0].x, rb[0][0].y, ra);
          };
          for (let a = 0; a < mergeGlyphs.length; a += 1) {
            for (let b = a + 1; b < mergeGlyphs.length; b += 1) {
              if (find(a) === find(b)) continue;
              if (overlap(mergeGlyphs[a], mergeGlyphs[b])) parent[find(a)] = find(b);
            }
          }
          const clusters = new Map();
          mergeGlyphs.forEach((g, i) => {
            const r = find(i);
            let arr = clusters.get(r);
            if (!arr) { arr = []; clusters.set(r, arr); }
            arr.push(g);
          });
          strokeItems = [];
          let clusterSeq = 0;
          clusters.forEach((cluster) => {
            // gid groups the contours that must be banded/welded together when the
            // outline is thickened: every contour of one glyph (shell + counters),
            // or every welded ring of a kerned cluster.
            if (cluster.length === 1) {
              for (const i of cluster[0].idxs) strokeItems.push({ pts: contours[i], idx: i, gid: glyphKey(i) });
              return;
            }
            const gid = 'c' + (clusterSeq += 1);
            const rings = [];
            for (const g of cluster) for (const i of g.idxs) rings.push(contours[i]);
            const mp = FB.nonZeroUnionByContainment(rings);
            const welded = FB.multiPolygonToPaths ? FB.multiPolygonToPaths(mp) : [];
            if (welded.length) {
              for (const r of welded) {
                // The union only ever sees flat points, so it carries no font
                // anchor map — re-trace the welded boundary into a fresh bezier
                // fit (same GU.reduceAnchors used for un-merged glyphs) so a
                // connected script run stays smooth instead of faceting at
                // every point the boolean lib emitted. cornerAngleDeg is raised
                // well above the font-anchor default (30): a clipped ring has no
                // handles, so corner detection falls back to raw chord angles
                // between consecutive points, and the clipper packs a few extra
                // near-duplicate vertices right at each true intersection — that
                // irregular local density reads as several small (30-70deg) false
                // corners in a row. A real corner here (the two glyphs' outlines
                // actually crossing) is always a sharp, near-perpendicular turn,
                // so a high threshold only lets those through.
                let anchors = null;
                if (wantBezier && GU && typeof GU.reduceAnchors === 'function' && Array.isArray(r) && r.length >= 4) {
                  anchors = GU.reduceAnchors(r.map((pt) => ({ x: pt.x, y: pt.y, in: null, out: null })), true, { cornerAngleDeg: 75 });
                }
                strokeItems.push({ pts: r, idx: -1, gid, anchors });
              }
            } else for (const g of cluster) for (const i of g.idxs) strokeItems.push({ pts: contours[i], idx: i, gid });
          });
        } else {
          strokeItems = contours.map((c, i) => ({ pts: c, idx: i, gid: glyphKey(i) }));
        }

        // ── Heavy outline = concentric outward offsets ────────────────────────
        // The faithful glyph outline is ALWAYS drawn (pass 0, below). When the pen
        // weight is > 1 on an outline face, that outline is repeated as concentric
        // copies offset OUTWARD in steps of one pen width, each identical in shape
        // to the original — just further out. So the widening tracks the pen size
        // and, because adjacent passes abut, plots as one continuous heavier stroke.
        // Each pass is a true MITER offset (GU.miterOffsetClosedRing) of the clean,
        // faithfully-flattened glyph outline — so sharp corners stay sharp (never
        // rounded), curves stay smooth, and it mirrors the letterform exactly. See
        // the concentric block below for the full method. The legacy parallel-pass
        // thicken stays as the monoline / headless fallback.
        const canConcentric = thickness > 1 && isOutline && FB && typeof FB.union === 'function'
          && typeof FB.multiPolygonToPaths === 'function' && typeof FB.nonZeroUnionByContainment === 'function'
          && GU && typeof GU.miterOffsetClosedRing === 'function';
        // Sinusoidal / snake are deliberately hand-drawn / boustrophedon styles —
        // they keep the per-point offset engine (and its rng-driven wave phase).
        // Parallel (the default) is the "clean bold" intent.
        const styleMode = p.thickeningMode === 'sinusoidal' || p.thickeningMode === 'snake';
        // ── Built-in heavy weight = banded concentric snake fill ──────────────
        // The monoline face's old bold drew N INDEPENDENT parallel offset copies
        // of every stroke, so wherever two strokes meet (a t crossbar, the e bar/
        // bowl junction) the two bundles simply crossed — a lattice of doubled ink
        // — and open terminals splayed into an uncapped fan. The clean model is
        // region-first: sweep the glyph's strokes into ONE boolean band of total
        // width thickness·penW (strokeRingsToBand — junctions weld, terminals get
        // round caps), then fill that band with concentric inward passes and
        // stitch them into a single snaking pen path. Pass spacing is tied to the
        // pen: penW·(1 − inkOverlap), so adjacent passes overlap by exactly the
        // requested ink fraction and the plot is gapless at the physical pen width.
        const canBand = thickness > 1 && !isOutline && !styleMode && FB
          && typeof FB.union === 'function' && typeof FB.difference === 'function'
          && GU && typeof GU.strokeRingsToBand === 'function'
          && typeof GU.insetMultiPolygon === 'function'
          && typeof GU.stitchConcentricRings === 'function';
        const useLegacyThicken = thickness > 1 && !canBand && !canConcentric && GU && GU.thickenPaths;

        if (canBand) {
          const inkOverlap = clamp(finite(p.inkOverlap, 15), 0, 60) / 100;
          const passSpacing = penW * (1 - inkOverlap);
          const bandW = thickness * penW;
          // Sliver floor for erosion output. Only true boolean crumbs (sub-dot
          // specks) are dropped: a SMALL ring can be legitimate coverage — the
          // deep ring of a needle-acute junction pocket is a roundish blob well
          // under one pen-square, and filtering it at penW² left the pocket
          // interior up to ~0.4mm from any ink. Thin interior slivers that
          // survive the lower floor draw as short strokes buried in solid ink —
          // harmless. (The band region is a disk sweep, so with faithful
          // contours the pen reaches EVERYTHING — residuals are discretization,
          // and this floor was the largest discretization error.)
          const MIN_AREA = penW * penW;
          // Join-disk arc resolution for the erosion cuts. Corner arcs in the
          // eroded contours inherit these facets; 16 sides keeps the arc sagitta
          // (and thus the corner-coverage shortfall) under 2% of the inset.
          // Cheap since joinSkipAngle already skips the disks along gentle
          // curvature — only real corners pay.
          const JOIN_SIDES = 16;
          // polygon-clipping output rings are dense with micro/collinear vertices;
          // every erosion pass sweeps a disk along every boundary vertex, so ring
          // point count is THE cost driver. RDP at 5% of a pen width collapses
          // them harmlessly: the shave is common-mode across adjacent passes at
          // a corner (each starts from the previous pass's pulled-in boundary),
          // so INTER-PASS spacing — what gaplessness depends on — is preserved.
          const SIMP_TOL = penW * 0.05;
          // Emergency complexity valve: past RING_CAP vertices the tolerance
          // escalates (at most twice — escalating further would open visible
          // gaps between passes, since inter-pass coverage slack is only
          // penW·inkOverlap). Normal glyphs never hit this; it exists so one
          // pathological ring can't stall the whole render.
          const RING_CAP = 400;
          const simplifyRing = (pts) => {
            if (!GU.simplifyPath || pts.length < 8) return pts;
            let tol = SIMP_TOL;
            let s = GU.simplifyPath(pts, tol);
            for (let e = 0; e < 2 && s.length > RING_CAP; e += 1) {
              tol *= 2;
              s = GU.simplifyPath(pts, tol);
            }
            return (s && s.length >= 4) ? s : pts;
          };
          const simplifyMp = (mp) => mp.map((poly) => poly.map((ring) => {
            const pts = ring.map((q) => (Array.isArray(q) ? { x: q[0], y: q[1] } : { x: q.x, y: q.y }));
            return simplifyRing(pts).map((q) => [q.x, q.y]);
          }));
          // Legacy engine as the per-glyph escape hatch (degenerate band, boolean
          // failure) so a glyph never silently loses its weight.
          const legacyHeavy = (strokes) => {
            const stroked = strokes.map((s) => {
              const seg = s.slice();
              seg.meta = { algorithm: 'text', straight: true };
              return seg;
            });
            const heavy = GU.thickenPathsUniform
              ? GU.thickenPathsUniform(stroked, { width: thickness, spacing: penW })
              : GU.thickenPaths(stroked, { width: thickness, spacing: penW });
            for (const seg of heavy) out.push(seg);
          };
          // The faithful (thickness 1) outline renders the font's designed curve
          // strokes as native cubics (meta.curve → Catmull-Rom at
          // STROKE_CURVE_SMOOTHING; the Curves toggle opts the rest in). The band
          // must be swept along that SAME smooth contour — banding the raw
          // sampled polyline would leave Bold faceted while Regular reads smooth.
          // Mirror the emission's bezierization, then flatten it densely.
          const OUb = Vectura.OptimizationUtils;
          const smoothStroke = (it) => {
            const pts = it.pts;
            const fontCurve = it.idx >= 0 && meta[it.idx] && meta[it.idx].curve === true;
            const toggleSmooth = p.curves === true && smoothing > 0;
            if (!(fontCurve || toggleSmooth) || pts.length < 3
              || !GU.rebuildShapeAnchors || !GU.buildPolylineFromAnchors) return pts;
            const closed = !!(OUb && OUb.isClosedPath && OUb.isClosedPath(pts));
            let base = pts;
            if (closed && pts.length >= 2) {
              const a = pts[0]; const b = pts[pts.length - 1];
              if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) base = pts.slice(0, -1);
            }
            const effSmoothing = fontCurve ? Math.max(smoothing, STROKE_CURVE_SMOOTHING) : smoothing;
            const built = GU.rebuildShapeAnchors(base.map((q) => ({ x: q.x, y: q.y })), { smoothing: effSmoothing, closed });
            if (!built || !Array.isArray(built.anchors) || built.anchors.length < 2) return pts;
            const poly = GU.buildPolylineFromAnchors(built.anchors, closed);
            return (Array.isArray(poly) && poly.length >= 2) ? poly : pts;
          };
          // Band per GLYPH (gid groups a glyph's strokes) — junction welding is an
          // intra-glyph concern for the monoline face, and small per-glyph unions
          // keep every polygon-clipping call bounded.
          const groups = new Map();
          strokeItems.forEach((it, i) => {
            const key = it.gid != null ? it.gid : ('p' + i);
            let arr = groups.get(key);
            if (!arr) { arr = []; groups.set(key, arr); }
            if (it.pts && it.pts.length >= 2) arr.push(smoothStroke(it));
          });
          groups.forEach((strokes) => {
            if (!strokes.length) return;
            // Cache hit: identical glyph geometry (translation removed, µm-
            // quantized) under the same pen/weight/spacing reuses the computed
            // fill wholesale. Jittered text is per-point randomized, so it would
            // only pollute the cache — skip it.
            let mnx = Infinity;
            let mny = Infinity;
            for (const s of strokes) {
              for (const q of s) {
                if (q.x < mnx) mnx = q.x;
                if (q.y < mny) mny = q.y;
              }
            }
            const emitChains = (chains, emitSkeleton) => {
              for (const chain of chains) {
                if (!Array.isArray(chain) || chain.length < 2) continue;
                chain.meta = { algorithm: 'text', straight: true };
                out.push(chain);
              }
              // Medial remainder: when the deepest surviving ring still leaves
              // more than a kiss of spine uncovered (pass spacing can overshoot
              // the collapse depth), run the original skeleton — for a uniform
              // stroke it IS the medial axis, so the closing pass lands dead
              // centre, invisible inside the band.
              if (emitSkeleton) {
                for (const s of strokes) {
                  const seg = s.map((q) => ({ x: q.x, y: q.y }));
                  seg.meta = { algorithm: 'text', straight: true };
                  out.push(seg);
                }
              }
            };
            const cacheKey = jitter === 0
              ? thickness + '|' + penW + '|' + passSpacing + '|'
                + strokes.map((s) => s.map((q) => (q.x - mnx).toFixed(2) + ',' + (q.y - mny).toFixed(2)).join(';')).join('|')
              : null;
            if (cacheKey) {
              const hit = BAND_FILL_CACHE.get(cacheKey);
              if (hit) {
                emitChains(hit.chains.map((c) => c.map((q) => ({ x: q.x + mnx, y: q.y + mny }))), hit.emitSkeleton);
                return;
              }
            }
            let band = null;
            // Join-disk resolution must scale with the band RADIUS: an 8-gon
            // chord at radius bandW/2 dips R·(1−cos π/8) ≈ 0.076·R inside the
            // true circle — at Bold widths that is a visible ~0.1mm NOTCH in the
            // letterform silhouette at every gentle convex skeleton vertex
            // (boundary = quad edge → chord → quad edge). Choose the side count
            // so the sagitta stays under the simplify tolerance.
            const bandJoinSides = Math.min(48, Math.max(8,
              Math.ceil(Math.PI / Math.acos(Math.max(0.5, 1 - SIMP_TOL / (bandW / 2))))));
            try { band = GU.strokeRingsToBand(strokes, bandW, { boolean: FB, joinSides: bandJoinSides }); }
            catch (_) { band = null; }
            if (!band || !band.length) { legacyHeavy(strokes); return; }
            band = simplifyMp(band);
            // Concentric passes: the OUTER pass centreline sits penW/2 inside the
            // band edge (the pen's own radius), so the drawn ink edge lands
            // exactly on the intended letterform boundary; each deeper pass steps
            // in by the overlap-adjusted spacing. Erosion is INCREMENTAL — pass k
            // erodes pass k−1's region by one spacing, exact by the morphological
            // identity erode(R, a+b) = erode(erode(R, a), b). (Chaining is safe
            // here because each step is a subtraction of a well-formed thin
            // Minkowski band, unlike the chained miter DILATION unions that
            // crashed polygon-clipping — and thin cuts with small join disks are
            // an order of magnitude cheaper than one deep cut.) The loop runs
            // until the region is consumed — junction cores are deeper than the
            // uniform bandW/2, and their extra rings are exactly what inks them
            // without doubling.
            const passes = [];
            let lastInset = 0;
            // Deepest pass that covers the WHOLE band reliably. lastInset alone
            // is a trap: junction pockets run deeper than the uniform bandW/2,
            // keeping the loop alive past the stroke spine's collapse — the last
            // surviving pass then only exists inside the pocket while the bowl
            // spine sits bare. Reliable = comfortably above collapse everywhere.
            let reliableInset = 0;
            let region = band;
            for (let k = 0; k < 64; k += 1) {
              const step = k === 0 ? penW / 2 : passSpacing;
              let mp = [];
              try { mp = GU.insetMultiPolygon(region, step, { boolean: FB, minArea: MIN_AREA, joinSides: JOIN_SIDES }); }
              catch (_) { mp = []; }
              if ((!mp || !mp.length) && k > 0) {
                // The incremental step can fail on a boolean pathology of the
                // PREVIOUS pass's boundary, not a true collapse — losing every
                // deeper pass and hollowing the band (a ~3-spacing white ring the
                // skeleton can't bridge). The base band is far simpler geometry:
                // retry this depth as one single-shot erosion from it before
                // concluding the region is consumed.
                try { mp = GU.insetMultiPolygon(band, penW / 2 + k * passSpacing, { boolean: FB, minArea: MIN_AREA, joinSides: JOIN_SIDES }); }
                catch (_) { mp = []; }
              }
              if (!mp || !mp.length) break;
              // Simplify each pass's rings once: they are both the emitted pen
              // path AND the next erosion's boundary (keeps every cut cheap).
              region = simplifyMp(mp);
              const rings = [];
              for (const poly of region) {
                for (const ring of poly) {
                  if (!Array.isArray(ring) || ring.length < 4) continue;
                  rings.push(ring.map((q) => ({ x: q[0], y: q[1] })));
                }
              }
              if (!rings.length) break;
              passes.push(rings);
              lastInset = penW / 2 + k * passSpacing;
              if (lastInset <= bandW / 2 - passSpacing) reliableInset = lastInset;
            }
            // Closing contour: the pass whose centreline sits at (bandW − penW)/2
            // tiles a uniform band exactly to its spine. The stepped loop's own
            // deeper passes can't be trusted for this — near collapse a ring
            // pinches off locally (and junction pockets keep the loop alive past
            // the spine's collapse) — so whenever the RELIABLE depth falls short,
            // run the exact closing depth as one single-shot erosion from the
            // clean base band, and lay the skeleton down as spine insurance
            // (for a uniform stroke it IS the medial axis; the closing ring and
            // skeleton overlap harmlessly inside solid ink).
            const finalInset = (bandW - penW) / 2;
            let emitSkeleton = false;
            if (passes.length && bandW / 2 - (reliableInset + penW / 2) > penW * 0.05) {
              // Prefer the ring: reliable passes + the closing contour tile the
              // uniform band completely, and the ring NESTS with every other
              // pass. The skeleton is the fallback of last resort only — its
              // full-length strokes slash across the junction pockets' deep
              // rings (visible hairline crossings), so it draws only when the
              // closing erosion itself failed.
              let closed = false;
              if (finalInset > reliableInset + penW * 0.05) {
                let mp = [];
                try { mp = GU.insetMultiPolygon(band, finalInset, { boolean: FB, minArea: MIN_AREA, joinSides: JOIN_SIDES }); }
                catch (_) { mp = []; }
                if (mp && mp.length) {
                  const rings = [];
                  for (const poly of simplifyMp(mp)) {
                    for (const ring of poly) {
                      if (Array.isArray(ring) && ring.length >= 4) rings.push(ring.map((q) => ({ x: q[0], y: q[1] })));
                    }
                  }
                  if (rings.length) { passes.push(rings); closed = true; }
                }
              }
              emitSkeleton = !closed;
            }
            if (!passes.length) { legacyHeavy(strokes); return; }
            // One continuous snake per band region: graft each ring onto the
            // nearest chain end (join tolerance ~ one pass spacing — the hop stays
            // buried in ink, never streaking across a counter).
            const chains = GU.stitchConcentricRings(passes, Math.max(penW, passSpacing * 2))
              .filter((c) => Array.isArray(c) && c.length >= 2);
            if (cacheKey) {
              if (BAND_FILL_CACHE.size >= BAND_FILL_CACHE_MAX) BAND_FILL_CACHE.clear();
              BAND_FILL_CACHE.set(cacheKey, {
                chains: chains.map((c) => c.map((q) => ({ x: q.x - mnx, y: q.y - mny }))),
                emitSkeleton,
              });
            }
            emitChains(chains, emitSkeleton);
          });
        } else if (useLegacyThicken) {
          const stroked = strokeItems.map((it) => {
            const seg = it.pts.slice();
            seg.meta = { algorithm: 'text', straight: true };
            return seg;
          });
          // Thicken with MITER joins so the weight stays UNIFORM through sharp
          // corners (a V apex, A, W) instead of pinching thin at the vertex,
          // while keeping the single-stroke identity (distinct pen passes, no
          // fill).
          const heavy = (!styleMode && GU.thickenPathsUniform)
            ? GU.thickenPathsUniform(stroked, { width: thickness, spacing: penW })
            : GU.thickenPaths(stroked, {
              width: thickness,
              mode: p.thickeningMode,
              spacing: penW,
              rng,
            });
          for (const seg of heavy) out.push(seg);
        } else {
          strokeItems.forEach((it) => {
            const seg = it.pts;
            // Welded rings (idx -1) carry their own re-fit anchors (see above),
            // already in DISPLAY space (fit from the post-transform union ring) —
            // un-merged glyph contours look theirs up in laidAnchors by index,
            // where they're still in LAYOUT space and need txPtRot to place them.
            const anch = it.anchors || ((it.idx >= 0 && laidAnchors) ? laidAnchors[it.idx] : null);
            if (anch) {
              // Native cubic outline: forceCurves renders the glyph's real beziers
              // regardless of the layer's Curves toggle; `closed` joins the final
              // segment back to the start. `anch` is the minimal-anchor re-trace
              // (Illustrator "Create Outlines" parity) produced in GoogleFonts.layout;
              // each anchor carries a `corner` flag for the node editor's affordance.
              seg.meta = { algorithm: 'text', straight: false, closed: true, forceCurves: true,
                anchors: it.anchors
                  ? anch.map((a) => ({ x: a.x, y: a.y, in: a.in ? { x: a.in.x, y: a.in.y } : null, out: a.out ? { x: a.out.x, y: a.out.y } : null, corner: a.corner === true }))
                  : anch.map((a) => { const ra = txPtRot(a, it.idx); return { x: ra.x, y: ra.y, in: txPtRot(a.in, it.idx), out: txPtRot(a.out, it.idx), corner: a.corner === true }; }) };
            } else {
              // Two ways a built-in stroke becomes native béziers instead of
              // faceted chords:
              //   1. FONT CURVES — the Vectura stroke-font marks its bowl/arc/
              //      spline strokes (meta.curve). Those are dense sampled polylines
              //      of a designed curve, so we ALWAYS bezierize them (independent
              //      of the layer Curves toggle) at STROKE_CURVE_SMOOTHING = 1, the
              //      Catmull-Rom tension that reproduces the exact sampled contour —
              //      the sharp-cornered stems/serifs/diagonals stay flagged false
              //      and render as faithful straight polylines.
              //   2. CURVES TOGGLE — with Curves ON + Smoothing > 0 the user opts
              //      every stroke's corners into cubic handles (0 = sharp no-op,
              //      1 = very smooth), mirroring the web-font outline branch above.
              // Both build handles via Catmull-Rom-to-bezier on the display-space
              // points and render as native cubics via meta.anchors; forceCurves
              // keeps them smooth even inside a curves-off group.
              const OU = Vectura.OptimizationUtils;
              let anchors = null;
              let closed = false;
              const fontCurve = it.idx >= 0 && meta[it.idx] && meta[it.idx].curve === true;
              const toggleSmooth = p.curves === true && smoothing > 0;
              if ((fontCurve || toggleSmooth) && GU && GU.rebuildShapeAnchors && seg.length >= 3) {
                closed = !!(OU && OU.isClosedPath && OU.isClosedPath(seg));
                // A closed glyph (O, D…) repeats its first point as its last —
                // drop the duplicate so the Catmull-Rom wrap-around isn't degenerate.
                let pts = seg;
                if (closed && seg.length >= 2) {
                  const a = seg[0]; const b = seg[seg.length - 1];
                  if (Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6) pts = seg.slice(0, -1);
                }
                // Font curves get full Catmull-Rom (1); the user Smoothing slider can
                // only push a designed curve rounder, never flatten it below faithful.
                const effSmoothing = fontCurve ? Math.max(smoothing, STROKE_CURVE_SMOOTHING) : smoothing;
                const built = GU.rebuildShapeAnchors(pts.map((q) => ({ x: q.x, y: q.y })), { smoothing: effSmoothing, closed });
                if (built && Array.isArray(built.anchors) && built.anchors.length >= 2
                  && built.anchors.some((a) => a && (a.in || a.out))) {
                  anchors = built.anchors;
                }
              }
              if (anchors) {
                seg.meta = { algorithm: 'text', straight: false, closed, forceCurves: true, anchors };
              } else {
                seg.meta = { algorithm: 'text', straight: true };
              }
            }
            out.push(seg);
          });
        }

        // ── Concentric outward widening (miter offset of the faithful outline) ──
        if (canConcentric) {
          // Pass 0 (the faithful outline) is already emitted above. Here each pass
          // k = 1..(thickness-1) is an INDEPENDENT true-miter offset of the CLEAN
          // base glyph outline by k*penW — never a chained/re-unioned dilation (that
          // is what crashed polygon-clipping). The base is a dense, FAITHFUL flatten
          // of the glyph's native cubic anchors (straight segments keep their corner
          // vertex exactly; curves sample smooth), so sharp letter corners stay
          // MITER-sharp and curves stay smooth. Shells grow outward, counters shrink
          // inward (containment-parity), so the letter BOLDS. A single per-ring
          // FB.union dissolves tight-feature self-crossings WITHOUT rounding the
          // miters; every boolean is try/caught so a bad pass is skipped, never
          // thrown. Deterministic (no Math.random / Date). Graceful without helpers.
          const passes = Math.min(Math.max(0, thickness - 1), 60); // cap runaway sweeps
          let totalPts = 0;
          for (const it of strokeItems) totalPts += (it.pts ? it.pts.length : 0);
          const canMiter = GU && typeof GU.miterOffsetClosedRing === 'function';
          if (passes >= 1 && totalPts <= 8000 && canMiter) {
            // Flatten tolerance in display space (tracks pen so it scales sanely):
            // tight enough that curves show no facets at normal zoom.
            const FLATTEN_TOL = Math.max(0.02, Math.min(0.08, penW * 0.4));
            const ringArea = (pts) => {
              let s = 0;
              const n = pts.length;
              for (let i = 0; i < n; i += 1) {
                const a = pts[i];
                const b = pts[(i + 1) % n];
                s += a.x * b.y - b.x * a.y;
              }
              return s * 0.5;
            };
            // Even-odd point-in-polygon on {x,y}[] rings (winding-independent), used
            // to classify shell vs counter by containment depth.
            const pointInPoly = (px, py, pts) => {
              let inside = false;
              const n = pts.length;
              for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
                const xi = pts[i].x, yi = pts[i].y;
                const xj = pts[j].x, yj = pts[j].y;
                const dyj = (yj - yi) || 1e-12;
                if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / dyj + xi)) inside = !inside;
              }
              return inside;
            };
            // Group contours that widen together: a glyph's shell + counters, or a
            // welded kern cluster (idx===-1), share a gid — keeps junctions
            // (t-crossbar, +) and kern welds connected because siblings grow into
            // each other and the shell/hole role is decided per glyph.
            const groups = new Map();
            strokeItems.forEach((it, i) => {
              const key = it.gid != null ? it.gid : ('p' + i);
              let arr = groups.get(key);
              if (!arr) { arr = []; groups.set(key, arr); }
              // Faithful base ring: flatten native cubics (corners preserved) when
              // anchors exist; else fall back to the already-dense display polyline
              // (welded rings / bezier-outline-off carry no anchors).
              let ring = null;
              const anch = (it.idx >= 0 && laidAnchors) ? laidAnchors[it.idx] : null;
              if (anch && anch.length >= 2 && typeof GU.flattenAnchorRing === 'function') {
                const disp = anch.map((a) => {
                  const ra = txPtRot(a, it.idx);
                  return { x: ra.x, y: ra.y, in: txPtRot(a.in, it.idx), out: txPtRot(a.out, it.idx) };
                });
                ring = GU.flattenAnchorRing(disp, FLATTEN_TOL);
              }
              if ((!ring || ring.length < 3) && it.pts && it.pts.length >= 3) {
                ring = it.pts.map((q) => ({ x: q.x, y: q.y }));
              }
              if (ring && ring.length >= 3) {
                // Drop a trailing closing duplicate for clean area / containment.
                const f = ring[0];
                const l = ring[ring.length - 1];
                if (Math.abs(f.x - l.x) < 1e-9 && Math.abs(f.y - l.y) < 1e-9) ring.pop();
                if (ring.length >= 3) {
                  const area = ringArea(ring);
                  if (Number.isFinite(area) && Math.abs(area) > 1e-9) arr.push({ pts: ring, area });
                }
              }
            });
            groups.forEach((rings) => {
              if (!rings.length) return;
              // Classify shell vs counter by containment-depth parity (winding-
              // independent, matches FB.nonZeroUnionByContainment): even depth =
              // shell (grow, delta>0), odd = counter/hole (shrink, delta<0).
              for (let i = 0; i < rings.length; i += 1) {
                const probe = rings[i].pts[0];
                let depth = 0;
                for (let j = 0; j < rings.length; j += 1) {
                  if (j !== i && pointInPoly(probe.x, probe.y, rings[j].pts)) depth += 1;
                }
                rings[i].isHole = (depth % 2) === 1;
              }
              // Drop micro slivers the boolean can spit out at collapsing features
              // (a spur tip merging into a stem) — they read as stairstep/tangle.
              const areaFloor = Math.max(1e-4, penW * penW);
              for (let k = 1; k <= passes; k += 1) {
                const dist = k * penW;
                // Offset EVERY ring of the glyph this pass, then resolve them
                // TOGETHER: shells grow (delta>0), counters shrink (delta<0), and a
                // single containment-aware nonzero union both dissolves a shell's
                // own self-crossings (a spur folding into its stem) AND carves the
                // counters. Doing it per-glyph — not per-ring — is what keeps the
                // spur/stem junction from tangling into stairsteps. miterLimit 6 keeps
                // real letter corners razor-sharp (90°→1.41, 60°→2.0, a ~30° V apex→
                // 3.86, all < 6 ⇒ sharp MITER); round:true turns ONLY a beyond-limit
                // needle-acute feature (the 'u' spur, ratio ≫ 6) into a concentric
                // ROUND arc of radius=dist on the GAP side, so consecutive passes abut
                // penW apart with no gap/stairstep and no inward spike; concave
                // junctions keep the bevel and the union dissolves them. arcTol =
                // FLATTEN_TOL so the arcs read smooth at normal zoom.
                const offRings = [];
                let anyRaw = false;
                for (const r of rings) {
                  const delta = r.isHole ? -dist : dist;
                  let off = null;
                  try { off = GU.miterOffsetClosedRing(r.pts, delta, { miterLimit: 6, round: true, arcTol: FLATTEN_TOL }); }
                  catch (_) { off = null; }
                  if (!off || off.length < 4) continue;
                  const oa = ringArea(off);
                  if (!Number.isFinite(oa) || Math.abs(oa) < 1e-6) continue; // collapsed
                  // A counter that over-shrinks inverts (signed-area sign flips) —
                  // treat it as closed at this weight and drop it.
                  if (r.isHole && (oa >= 0) !== (r.area >= 0)) continue;
                  offRings.push(off);
                }
                if (!offRings.length) continue;
                // Resolve the whole glyph's offset rings in one nonzero union so
                // shell self-crossings dissolve and counters carve. Independent of
                // the base each pass (no chained union → no polygon-clipping crash).
                let outRings = null;
                try {
                  const mp = FB.nonZeroUnionByContainment(offRings.map((o) => o.map((q) => ({ x: q.x, y: q.y }))));
                  if (mp && mp.length && FB.multiPolygonToPaths) outRings = FB.multiPolygonToPaths(mp);
                } catch (_) { outRings = null; }
                if (!outRings || !outRings.length) { outRings = offRings; anyRaw = true; }
                for (const rg of outRings) {
                  if (!Array.isArray(rg) || rg.length < 4) continue;
                  const seg = rg.map((q) => (Array.isArray(q) ? { x: q[0], y: q[1] } : { x: q.x, y: q.y }));
                  if (!anyRaw && Math.abs(ringArea(seg)) < areaFloor) continue; // micro sliver
                  // Dense faithful miter polyline already traces the offset curve and
                  // corners — emit straight (no cubic re-fit, which overshoots on
                  // dense points and re-introduces kinks, a documented failure).
                  seg.meta = { algorithm: 'text', straight: true };
                  out.push(seg);
                }
              }
            });
          }
        }
      }

      // ── Underline / strikethrough ───────────────────────────────────────────
      // One horizontal rule per text line spanning that line's measured extent
      // (meta x0..x1, layout space). Strikethrough rides the typeface's optical
      // midpoint (centre of the x-height) so it crosses the visual mass of the
      // line regardless of face; underline sits just below the baseline. Each
      // decoration accepts a position offset (mm), a pen weight, a thickening
      // mechanism (parallel / sinusoidal / snake offset passes, or a hatch /
      // cross-hatch ribbon), and a line style (solid / dashed / dotted / dash-dot
      // / long-dash / dense-dot). The underline also supports descender tail
      // breaks — a padded gap centred on each glyph's below-underline ink.
      // Endpoints ride the shared display transform (no per-glyph rotation —
      // these are line-level rules) without jitter, so the rng stream is
      // untouched. Both decorations are off by default.
      if ((p.underline === true || p.strikethrough === true) && meta.length) {
        const GU = Vectura.GeometryUtils;
        const lines = new Map();
        for (const mi of meta) {
          if (!mi) continue;
          let e = lines.get(mi.lineIndex);
          if (!e) { e = { x0: Infinity, x1: -Infinity, base: mi.baselineY }; lines.set(mi.lineIndex, e); }
          if (mi.x0 < e.x0) e.x0 = mi.x0;
          if (mi.x1 > e.x1) e.x1 = mi.x1;
          e.base = mi.baselineY;
        }
        // Optical midpoint = centre of the x-height above the baseline (layout
        // space). xHeightFrac is x-height ÷ cap-height (cap-height maps to size).
        const xhFrac = Number.isFinite(laid.xHeightFrac) ? laid.xHeightFrac : 0.5;
        const strikeMid = size * xhFrac * 0.5;
        const strikeOff = finite(p.strikethroughOffset, 0); // mm, + raises
        const ulOff = finite(p.underlineOffset, 0);          // mm, + lowers
        const ulThick = Math.max(1, Math.round(finite(p.underlineThickness, 1)));
        const stThick = Math.max(1, Math.round(finite(p.strikethroughThickness, 1)));
        const ulMode = p.underlineThickenMode || 'parallel';
        const stMode = p.strikethroughThickenMode || 'parallel';
        const breakPad = Math.max(0, finite(p.underlineBreakGap, 1.5)); // mm
        const breakOn = p.underlineBreak === true;
        const SPACING = 0.35; // display mm between thickening passes (matches outline)
        // Dash pattern in display space (after the fit transform), scaled to the
        // rendered cap height so the cadence reads consistently at any size.
        const capPx = size * scale;
        const dashFor = (style) => {
          switch (style) {
            case 'dashed': return [capPx * 0.12, capPx * 0.07];
            case 'dotted': return [capPx * 0.02, capPx * 0.08];
            case 'dash-dot': return [capPx * 0.12, capPx * 0.06, capPx * 0.02, capPx * 0.06];
            case 'long-dash': return [capPx * 0.26, capPx * 0.10];
            case 'dense-dot': return [capPx * 0.02, capPx * 0.045];
            default: return null;
          }
        };
        const pushSeg = (pts, dash) => {
          pts.meta = dash ? { algorithm: 'text', straight: true, strokeDash: dash } : { algorithm: 'text', straight: true };
          out.push(pts);
        };
        // Hatch / cross-hatch a horizontal band (display space) with diagonal
        // ticks clipped to the rule's x-span, plus top/bottom rails. The band
        // half-height matches what the parallel passes would span at this weight.
        const hatchBand = (A, B, bandHalf, cross) => {
          const yTop = A.y - bandHalf; const yBot = A.y + bandHalf;
          const xL = A.x; const xR = B.x;
          pushSeg([{ x: xL, y: yTop }, { x: xR, y: yTop }], null);
          pushSeg([{ x: xL, y: yBot }, { x: xR, y: yBot }], null);
          const H = bandHalf * 2;
          if (H <= 1e-6) return;
          const pitch = Math.max(H, 1.2);
          const tick = (downhill) => {
            for (let s = xL - H; s < xR; s += pitch) {
              const t0 = (xL - s) / H; const t1 = (xR - s) / H;
              const ta = Math.max(0, t0); const tb = Math.min(1, t1);
              if (tb <= ta) continue;
              const yA = downhill ? yTop : yBot; const yB = downhill ? yBot : yTop;
              pushSeg([
                { x: s + H * ta, y: yA + (yB - yA) * ta },
                { x: s + H * tb, y: yA + (yB - yA) * tb },
              ], null);
            }
          };
          tick(true);
          if (cross) tick(false);
        };
        const emit = (x0, x1, y, dash, thick, mode) => {
          if (!(x1 > x0)) return;
          const A = txPt({ x: x0, y }); const B = txPt({ x: x1, y });
          if (thick <= 1) { pushSeg([A, B], dash); return; }
          if (mode === 'hatch' || mode === 'cross') {
            hatchBand(A, B, (thick - 1) * SPACING / 2, mode === 'cross');
            return;
          }
          if (GU && GU.thickenPaths) {
            const src = [A, B];
            src.meta = { algorithm: 'text', straight: true };
            const heavy = GU.thickenPaths([src], { width: thick, mode, spacing: SPACING, rng });
            for (const h of heavy) pushSeg(h, dash);
            return;
          }
          pushSeg([A, B], dash);
        };
        const ulDash = dashFor(p.underlineStyle);
        const stDash = dashFor(p.strikethroughStyle);
        lines.forEach((e, lineIndex) => {
          if (!(e.x1 > e.x0)) return;
          if (p.strikethrough === true) emit(e.x0, e.x1, e.base - strikeMid - strikeOff, stDash, stThick, stMode);
          if (p.underline !== true) return;
          const uy = e.base + size * 0.12 + ulOff;
          if (!breakOn) { emit(e.x0, e.x1, uy, ulDash, ulThick, ulMode); return; }
          // Descender breaks: cut a padded gap centred on each glyph's ink that
          // dips below the underline (g, j, p, q, y, commas…). The gap spans the
          // below-underline ink extent (crossing-aware, so it follows where the
          // tail actually meets the rule) padded equally on both sides, then the
          // surviving runs are drawn. All measured in pre-transform layout space.
          const below = (pt) => pt.y > uy + 1e-6;
          const descByGlyph = new Map();
          for (let i = 0; i < meta.length; i += 1) {
            const mi = meta[i];
            if (!mi || mi.lineIndex !== lineIndex) continue;
            const gp = paths[i];
            if (!gp || !gp.length) continue;
            let lo = Infinity; let hi = -Infinity;
            const acc = (x) => { if (x < lo) lo = x; if (x > hi) hi = x; };
            for (let j = 0; j < gp.length; j += 1) {
              const a = gp[j];
              if (below(a)) acc(a.x);
              const b = gp[j + 1];
              if (b && below(a) !== below(b)) {
                const t = (uy - a.y) / (b.y - a.y);
                acc(a.x + (b.x - a.x) * t);
              }
            }
            if (hi >= lo) {
              const k = mi.lineIndex + ':' + mi.glyphIndex;
              let g = descByGlyph.get(k);
              if (!g) { g = { lo: Infinity, hi: -Infinity }; descByGlyph.set(k, g); }
              if (lo < g.lo) g.lo = lo;
              if (hi > g.hi) g.hi = hi;
            }
          }
          const cuts = [];
          descByGlyph.forEach((g) => cuts.push([g.lo - breakPad, g.hi + breakPad]));
          cuts.sort((a, b) => a[0] - b[0]);
          let cursor = e.x0;
          for (const [c0, c1] of cuts) {
            const a = Math.max(e.x0, c0);
            const b = Math.min(e.x1, c1);
            if (b <= cursor) continue;
            if (a > cursor) emit(cursor, a, uy, ulDash, ulThick, ulMode);
            cursor = Math.max(cursor, b);
          }
          if (cursor < e.x1) emit(cursor, e.x1, uy, ulDash, ulThick, ulMode);
        });
      }

      // Area frame outline (mm, layout space → display space via txPt): a thin
      // rectangle [0,0]–[frameW,frameH] carried as a sidecar so the engine
      // transforms it to world space alongside the glyphs and the renderer can
      // draw it. Emitted for every area box, including an empty one.
      const textFrame = isArea
        ? [
            { x: 0, y: 0 },
            { x: frameW, y: 0 },
            { x: frameW, y: frameH },
            { x: 0, y: frameH },
          ].map((c) => txPt(c))
        : null;

      // Overset: the laid text (all wrapped lines) is taller than the frame, so
      // some text is clipped/hidden — Illustrator marks this with a red "+" out
      // port. laid.height is the full multi-line block height in mm (display
      // space, same scale the frame uses since area type is always absolute).
      const textOverset = isArea && Number.isFinite(laid.height) && laid.height > frameH + 1e-6;

      // The editor glyph cells + area frame ride as sidecars on the returned array
      // (mirrors out.helpers / out.maskPolygons elsewhere). The plot-order resort
      // below builds a fresh array, so re-attach the sidecars to whatever returns.
      const attachGlyphs = (arr) => {
        arr.glyphs = glyphs;
        if (textFrame) arr.textFrame = textFrame;
        arr.textOverset = textOverset;
        return arr;
      };

      // An empty area box (frame + caret, no ink) still returns its sidecars so the
      // frame draws; every other empty result plots nothing.
      if (!out.length) return isArea ? attachGlyphs(out) : [];

      // ── Plot order ────────────────────────────────────────────────────────
      // Default to drawing left-to-right so the pen advances across the line with
      // minimal travel. A stable sort keeps already-ordered single-line text (and
      // its baselines) byte-identical; 'natural' preserves layout/fill order.
      if (p.plotOrder !== 'natural') {
        const minXOf = (path) => { let mn = Infinity; for (const pt of path) if (pt.x < mn) mn = pt.x; return mn; };
        return attachGlyphs(out
          .map((path, i) => [path, minXOf(path), i])
          .sort((a, b) => (a[1] - b[1]) || (a[2] - b[2]))
          .map((e) => e[0]));
      }
      return attachGlyphs(out);
    },
    formula: (p) => {
      const t = (p && p.text != null ? String(p.text) : '').split('\n')[0].slice(0, 24);
      return `glyphs("${t}") → single-stroke paths`;
    },
  };
})();
