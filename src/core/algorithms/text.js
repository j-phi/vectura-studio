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

  window.Vectura.AlgorithmRegistry.text = {
    generate: (p, rng, noise, bounds) => {
      const Font = Vectura.StrokeFont;
      if (!Font) return [];
      const raw = p.text == null ? '' : String(p.text);
      // An all-empty string yields nothing to plot.
      if (!raw.replace(/\n/g, '').trim()) return [];
      // allCaps uppercases the whole string before layout (independent of the
      // synthesized smallCaps option, which lowercases-as-small-uppercase).
      const str = p.allCaps === true ? raw.toUpperCase() : raw;

      const size = clamp(finite(p.fontSize, 40), 1, 1000);
      const tracking = finite(p.tracking, 0);
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
        kerning: p.kerning,
        baselineShift: p.baselineShift,
        indentLeft: p.indentLeft,
        indentRight: p.indentRight,
        indentFirst: p.indentFirst,
        spaceBefore: p.spaceBefore,
        spaceAfter: p.spaceAfter,
        smallCaps: p.smallCaps,
        superscript: p.superscript,
        subscript: p.subscript,
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
          laid = Web.layout(str, { id, size, tracking, lineHeight, align, smoothing, bezier: wantBezier, ...synOpts });
          isOutline = true;
        } else {
          if (Web.getFontStatus(id) === 'idle') Web.ensureFont(id).catch(() => {});
          laid = Font.layout(str, { size, tracking, lineHeight, align, font: 'sans', ...synOpts });
        }
      } else {
        laid = Font.layout(str, { size, tracking, lineHeight, align, font: p.font || 'sans', ...synOpts });
      }
      const paths = laid.paths;
      const laidAnchors = isOutline && wantBezier ? laid.anchors : null;
      if (!paths.length) return [];

      // True bounding box of the rendered strokes (mm).
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      for (const path of paths) {
        for (const pt of path) {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
      }
      const blockW = Math.max(1e-3, maxX - minX);
      const blockH = Math.max(1e-3, maxY - minY);
      const blockCx = (minX + maxX) / 2;
      const blockCy = (minY + maxY) / 2;

      const { m, dW, dH } = bounds;
      // Fit-to-frame scales the whole block to the display area (the fontSize
      // slider then only sets relative proportions); absolute mode keeps mm size.
      let scale = 1;
      if (p.fitToFrame !== false) {
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

      const out = [];

      // ── Fill ──────────────────────────────────────────────────────────────
      // Outline glyph contours are closed, so the shared pattern-fill engine can
      // hatch/dot/spiral their interiors. Passing every contour as `regions` lets
      // its even-odd rule carve holes (O, A, e, B) out automatically.
      const genFill = Vectura.AlgorithmRegistry._generatePatternFillPaths;
      const PB = Vectura.PaintBucketOps;
      if (p.fillEnabled && isOutline && genFill && PB && p.fillType && p.fillType !== 'none') {
        const regions = contours.filter((c) => c.length >= 3);
        if (regions.length) {
          // Fill placement: fillInset erodes the region inward (padding, mm);
          // fillOffsetX/Y are normalized (-1..1) and scale by the glyph-block
          // extent (display mm) into the engine's fillShiftX/Y so the fill window
          // translates while the outline stays put. When inset is off and both
          // offsets are 0 the params object is `p` unchanged → byte-for-byte.
          const insetOn = p.fillInsetEnabled === true;
          const offX = clamp(finite(p.fillOffsetX, 0), -1, 1) * (blockW * scale);
          const offY = clamp(finite(p.fillOffsetY, 0), -1, 1) * (blockH * scale);
          const fillParams = (insetOn || offX !== 0 || offY !== 0)
            ? Object.assign({}, p, {
              fillShiftX: finite(p.fillShiftX, 0) + offX,
              fillShiftY: finite(p.fillShiftY, 0) + offY,
            }, insetOn ? { fillPadding: finite(p.fillInset, 1.5) } : {})
            : p;
          const rec = PB.buildFillRecord({ polygon: regions[0], innerPolygon: null, loopId: 'text', isDocBounds: false }, fillParams);
          rec.regions = regions;
          // Glyph outlines are authored for the NONZERO fill rule (outer and
          // counter wound oppositely). Nonzero unions overlapping connected-script
          // glyphs while still carving counters; for non-overlapping faces it is
          // identical to even-odd, so this only changes scripts like Pacifico.
          rec.windingRule = 'nonzero';
          delete rec.region;
          delete rec.innerRegion;
          let fills = [];
          try { fills = genFill(rec) || []; } catch (_) { fills = []; }
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
        const thickness = Math.max(1, Math.round(finite(p.outlineThickness, 1)));

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
          const glyphs = [...byGlyph.values()];
          // Union-find glyphs that overlap: cheap bbox reject, then proper edge
          // crossing or containment. Only overlapping clusters get flattened.
          const parent = glyphs.map((_, i) => i);
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
          for (let a = 0; a < glyphs.length; a += 1) {
            for (let b = a + 1; b < glyphs.length; b += 1) {
              if (find(a) === find(b)) continue;
              if (overlap(glyphs[a], glyphs[b])) parent[find(a)] = find(b);
            }
          }
          const clusters = new Map();
          glyphs.forEach((g, i) => {
            const r = find(i);
            let arr = clusters.get(r);
            if (!arr) { arr = []; clusters.set(r, arr); }
            arr.push(g);
          });
          strokeItems = [];
          clusters.forEach((cluster) => {
            if (cluster.length === 1) {
              for (const i of cluster[0].idxs) strokeItems.push({ pts: contours[i], idx: i });
              return;
            }
            const rings = [];
            for (const g of cluster) for (const i of g.idxs) rings.push(contours[i]);
            const mp = FB.nonZeroUnionByContainment(rings);
            const welded = FB.multiPolygonToPaths ? FB.multiPolygonToPaths(mp) : [];
            if (welded.length) for (const r of welded) strokeItems.push({ pts: r, idx: -1 });
            else for (const g of cluster) for (const i of g.idxs) strokeItems.push({ pts: contours[i], idx: i });
          });
        } else {
          strokeItems = contours.map((c, i) => ({ pts: c, idx: i }));
        }

        if (thickness > 1 && GU && GU.thickenPaths) {
          const stroked = strokeItems.map((it) => {
            const seg = it.pts.slice();
            seg.meta = { algorithm: 'text', straight: true };
            return seg;
          });
          const heavy = GU.thickenPaths(stroked, {
            width: thickness,
            mode: p.thickeningMode,
            spacing: 0.35,
            rng,
          });
          for (const seg of heavy) out.push(seg);
        } else {
          strokeItems.forEach((it) => {
            const seg = it.pts;
            // Welded rings (idx -1) are fresh point arrays with no anchor map, so
            // native beziers only apply to the kept un-welded glyph contours.
            const anch = (it.idx >= 0 && laidAnchors) ? laidAnchors[it.idx] : null;
            if (anch) {
              // Native cubic outline: forceCurves renders the glyph's real beziers
              // regardless of the layer's Curves toggle; `closed` joins the final
              // segment back to the start.
              seg.meta = { algorithm: 'text', straight: false, closed: true, forceCurves: true,
                anchors: anch.map((a) => { const ra = txPtRot(a, it.idx); return { x: ra.x, y: ra.y, in: txPtRot(a.in, it.idx), out: txPtRot(a.out, it.idx) }; }) };
            } else {
              // Faithful polylines — letterforms must not be curve-smoothed into
              // mush (sharp corners on A/E/M would round off). The Curves toggle is
              // still honoured by the engine for a softened, looser hand.
              seg.meta = { algorithm: 'text', straight: p.curves !== true };
            }
            out.push(seg);
          });
        }
      }

      // ── Underline / strikethrough ───────────────────────────────────────────
      // One horizontal rule per text line spanning that line's measured extent
      // (meta x0..x1, layout space). Underline sits just below the baseline;
      // strikethrough crosses the x-height. Endpoints ride the shared display
      // transform (no per-glyph rotation — these are line-level rules) without
      // jitter, so the rng stream is untouched. Both are off by default.
      if ((p.underline === true || p.strikethrough === true) && meta.length) {
        const lines = new Map();
        for (const mi of meta) {
          if (!mi) continue;
          let e = lines.get(mi.lineIndex);
          if (!e) { e = { x0: Infinity, x1: -Infinity, base: mi.baselineY }; lines.set(mi.lineIndex, e); }
          if (mi.x0 < e.x0) e.x0 = mi.x0;
          if (mi.x1 > e.x1) e.x1 = mi.x1;
          e.base = mi.baselineY;
        }
        const rule = (x0, x1, y) => {
          const seg = [txPt({ x: x0, y }), txPt({ x: x1, y })];
          seg.meta = { algorithm: 'text', straight: true };
          out.push(seg);
        };
        lines.forEach((e) => {
          if (!(e.x1 > e.x0)) return;
          if (p.strikethrough === true) rule(e.x0, e.x1, e.base - size * 0.30);
          if (p.underline === true) rule(e.x0, e.x1, e.base + size * 0.12);
        });
      }

      if (!out.length) return [];

      // ── Plot order ────────────────────────────────────────────────────────
      // Default to drawing left-to-right so the pen advances across the line with
      // minimal travel. A stable sort keeps already-ordered single-line text (and
      // its baselines) byte-identical; 'natural' preserves layout/fill order.
      if (p.plotOrder !== 'natural') {
        const minXOf = (path) => { let mn = Infinity; for (const pt of path) if (pt.x < mn) mn = pt.x; return mn; };
        return out
          .map((path, i) => [path, minXOf(path), i])
          .sort((a, b) => (a[1] - b[1]) || (a[2] - b[2]))
          .map((e) => e[0]);
      }
      return out;
    },
    formula: (p) => {
      const t = (p && p.text != null ? String(p.text) : '').split('\n')[0].slice(0, 24);
      return `glyphs("${t}") → single-stroke paths`;
    },
  };
})();
