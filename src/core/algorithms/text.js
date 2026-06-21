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

      const laid = Font.layout(raw, {
        size: clamp(finite(p.fontSize, 40), 1, 1000),
        tracking: finite(p.tracking, 0),
        lineHeight: clamp(finite(p.lineHeight, 1.4), 0.5, 5),
        align: p.align === 'left' || p.align === 'right' ? p.align : 'center',
        font: p.font || 'sans',
      });
      let paths = laid.paths;
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
        const fill = clamp(finite(p.fillRatio, 0.9), 0.1, 1);
        scale = (Math.min(dW / blockW, dH / blockH) || 1) * fill;
      }

      const cx = m + dW / 2 + finite(p.offsetX, 0);
      const cy = m + dH / 2 + finite(p.offsetY, 0);
      const jitter = Math.max(0, finite(p.jitter, 0));
      const wobble = () => (rng && jitter > 0 ? (rng.nextFloat() - 0.5) * 2 * jitter : 0);

      paths = paths.map((path) => {
        const out = path.map((pt) => ({
          x: cx + (pt.x - blockCx) * scale + wobble(),
          y: cy + (pt.y - blockCy) * scale + wobble(),
        }));
        // Faithful polylines — letterforms must not be curve-smoothed into mush
        // (sharp corners on A/E/M would round off). The Curves toggle is still
        // honoured by the engine for users who want a softened, looser hand.
        out.meta = { algorithm: 'text', straight: p.curves !== true };
        return out;
      });
      return paths;
    },
    formula: (p) => {
      const t = (p && p.text != null ? String(p.text) : '').split('\n')[0].slice(0, 24);
      return `glyphs("${t}") → single-stroke paths`;
    },
  };
})();
