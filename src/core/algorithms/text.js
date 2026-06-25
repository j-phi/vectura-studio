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

  window.Vectura.AlgorithmRegistry.text = {
    generate: (p, rng, noise, bounds) => {
      const Font = Vectura.StrokeFont;
      if (!Font) return [];
      const raw = p.text == null ? '' : String(p.text);
      // An all-empty string yields nothing to plot.
      if (!raw.replace(/\n/g, '').trim()) return [];

      const size = clamp(finite(p.fontSize, 40), 1, 1000);
      const tracking = finite(p.tracking, 0);
      const lineHeight = clamp(finite(p.lineHeight, 1.4), 0.5, 5);
      const align = p.align === 'left' || p.align === 'right' ? p.align : 'center';
      const jitter = Math.max(0, finite(p.jitter, 0));
      const smoothing = Math.max(0, finite(p.smoothing, 0));
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
          laid = Web.layout(raw, { id, size, tracking, lineHeight, align, smoothing, bezier: wantBezier });
          isOutline = true;
        } else {
          if (Web.getFontStatus(id) === 'idle') Web.ensureFont(id).catch(() => {});
          laid = Font.layout(raw, { size, tracking, lineHeight, align, font: 'sans' });
        }
      } else {
        laid = Font.layout(raw, { size, tracking, lineHeight, align, font: p.font || 'sans' });
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
      const txHandle = (h) => (h ? txPt(h) : null);

      // Transform every contour into display space (jitter, when set, wobbles each
      // point — two rng draws per point, preserving the historical stream). These
      // closed point arrays double as the fill regions so fills hug the outline.
      const contours = paths.map((path) => path.map((pt) => ({
        x: cx + (pt.x - blockCx) * scale + wobble(),
        y: cy + (pt.y - blockCy) * scale + wobble(),
      })));

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
          const rec = PB.buildFillRecord({ polygon: regions[0], innerPolygon: null, loopId: 'text', isDocBounds: false }, p);
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
            fp.meta = { algorithm: 'text', straight: true, textFill: true };
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
        const thickness = Math.max(1, Math.round(finite(p.outlineThickness, 1)));
        if (thickness > 1 && GU && GU.thickenPaths) {
          const stroked = contours.map((c) => {
            const seg = c.slice();
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
          contours.forEach((c, i) => {
            const seg = c;
            const anch = laidAnchors ? laidAnchors[i] : null;
            if (anch) {
              // Native cubic outline: forceCurves renders the glyph's real beziers
              // regardless of the layer's Curves toggle; `closed` joins the final
              // segment back to the start.
              seg.meta = { algorithm: 'text', straight: false, closed: true, forceCurves: true,
                anchors: anch.map((a) => ({ x: txPt(a).x, y: txPt(a).y, in: txHandle(a.in), out: txHandle(a.out) })) };
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
