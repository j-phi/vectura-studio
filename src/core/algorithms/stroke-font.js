/**
 * Vectura single-line stroke font.
 *
 * A self-contained monoline (single-stroke) vector font for plotter-native text.
 * Unlike an outline font, each glyph is a set of open polylines drawn by ONE pen
 * pass — exactly what a pen plotter wants — so there is no fill, no double-traced
 * outline, and no third-party font dependency.
 *
 * Coordinate space (font units, y increases DOWNWARD):
 *   cap / ascender top = 0   baseline = 14   descender bottom = 19
 *   lowercase x-height top = 6   (x-height body spans 6 → 14)
 * Each glyph carries an advance width `w`; layout() scales the whole grid so the
 * cap height (14 units) maps to the requested font size in mm.
 */
(() => {
  const Vectura = (window.Vectura = window.Vectura || {});

  const CAP = 14; // cap-height in font units (the layout scale reference)
  const DESCENT = 19;

  // Sample an elliptical arc into a polyline (y-down space). a0/a1 in radians.
  const arc = (cx, cy, rx, ry, a0, a1, steps = 14) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return pts;
  };
  const ellipse = (cx, cy, rx, ry, steps = 18) => arc(cx, cy, rx, ry, 0, Math.PI * 2, steps);
  const TAU = Math.PI * 2;

  // Glyph table: char → { w, s:[ stroke, … ] }, stroke = [ [x,y], … ].
  const G = {};
  const def = (ch, w, s) => { G[ch] = { w, s }; };

  def(' ', 7, []);

  // ── Uppercase ───────────────────────────────────────────────────────────────
  def('A', 12, [[[1, 14], [6, 0], [11, 14]], [[3, 9], [9, 9]]]);
  def('B', 11, [
    [[2, 0], [2, 14]],
    [[2, 0], [7, 0], [10, 2.5], [7, 7], [2, 7]],
    [[2, 7], [8, 7], [11, 10.5], [8, 14], [2, 14]],
  ]);
  def('C', 11, [[[10, 3], [7, 0], [3, 2], [1, 7], [3, 12], [7, 14], [10, 11]]]);
  def('D', 11, [[[2, 0], [2, 14]], [[2, 0], [6, 0], [10, 4], [10, 10], [6, 14], [2, 14]]]);
  def('E', 10, [[[9, 0], [2, 0], [2, 14], [9, 14]], [[2, 7], [7, 7]]]);
  def('F', 10, [[[9, 0], [2, 0], [2, 14]], [[2, 7], [7, 7]]]);
  def('G', 11, [[[10, 3], [7, 0], [3, 2], [1, 7], [3, 12], [7, 14], [10, 11], [10, 8], [7, 8]]]);
  def('H', 11, [[[2, 0], [2, 14]], [[9, 0], [9, 14]], [[2, 7], [9, 7]]]);
  def('I', 4, [[[0, 0], [4, 0]], [[2, 0], [2, 14]], [[0, 14], [4, 14]]]);
  def('J', 9, [[[8, 0], [8, 11], [6, 14], [3, 14], [1, 11]]]);
  def('K', 11, [[[2, 0], [2, 14]], [[9, 0], [2, 8]], [[4, 6], [10, 14]]]);
  def('L', 9, [[[2, 0], [2, 14], [9, 14]]]);
  def('M', 13, [[[2, 14], [2, 0], [6.5, 8], [11, 0], [11, 14]]]);
  def('N', 12, [[[2, 14], [2, 0], [10, 14], [10, 0]]]);
  def('O', 12, [arc(6, 7, 5, 7, -Math.PI / 2, Math.PI * 1.5, 18)]);
  def('P', 11, [[[2, 0], [2, 14]], [[2, 0], [7, 0], [10, 3], [7, 7], [2, 7]]]);
  def('Q', 12, [arc(6, 7, 5, 7, -Math.PI / 2, Math.PI * 1.5, 18), [[7, 10], [12, 16]]]);
  def('R', 11, [[[2, 0], [2, 14]], [[2, 0], [7, 0], [10, 3], [7, 7], [2, 7]], [[6, 7], [10, 14]]]);
  def('S', 10, [[[9, 3], [6, 0], [3, 1], [2, 4], [4, 6], [7, 8], [9, 10], [8, 13], [5, 14], [2, 12]]]);
  def('T', 10, [[[1, 0], [9, 0]], [[5, 0], [5, 14]]]);
  def('U', 11, [[[2, 0], [2, 10], [3.5, 13], [6, 14], [8.5, 13], [10, 10], [10, 0]]]);
  def('V', 12, [[[1, 0], [6, 14], [11, 0]]]);
  def('W', 16, [[[1, 0], [4, 14], [8, 4], [12, 14], [15, 0]]]);
  def('X', 11, [[[2, 0], [10, 14]], [[10, 0], [2, 14]]]);
  def('Y', 11, [[[2, 0], [6, 7], [10, 0]], [[6, 7], [6, 14]]]);
  def('Z', 10, [[[2, 0], [9, 0], [2, 14], [9, 14]]]);

  // ── Lowercase ─────────────────────────────────────────────────────────────
  def('a', 10, [[[8, 8], [5, 6], [2, 8], [2, 12], [5, 14], [8, 12]], [[8, 6], [8, 14]]]);
  def('b', 10, [[[2, 0], [2, 14]], [[2, 8], [5, 6], [8, 8], [8, 12], [5, 14], [2, 12]]]);
  def('c', 9, [[[8, 8], [5, 6], [2, 9], [2, 11], [5, 14], [8, 12]]]);
  def('d', 10, [[[8, 0], [8, 14]], [[8, 8], [5, 6], [2, 8], [2, 12], [5, 14], [8, 12]]]);
  def('e', 9, [[[2, 11], [8, 11], [7.5, 8], [5, 6], [2, 9], [2, 12], [5, 14], [8, 12.5]]]);
  def('f', 7, [[[6, 1], [4, 0], [3, 2], [3, 14]], [[1, 6], [5, 6]]]);
  def('g', 10, [[[8, 8], [5, 6], [2, 8], [2, 12], [5, 14], [8, 12]], [[8, 6], [8, 16], [5, 19], [2, 18]]]);
  def('h', 10, [[[2, 0], [2, 14]], [[2, 8], [5, 6], [8, 8], [8, 14]]]);
  def('i', 4, [[[2, 3], [2, 4]], [[2, 6], [2, 14]]]);
  def('j', 6, [[[4, 3], [4, 4]], [[4, 6], [4, 16], [3, 18.5], [1, 18]]]);
  def('k', 9, [[[2, 0], [2, 14]], [[7, 6], [2, 10]], [[4, 9], [8, 14]]]);
  def('l', 4, [[[2, 0], [2, 12], [3, 14]]]);
  def('m', 14, [[[2, 6], [2, 14]], [[2, 8], [4, 6], [6, 8], [6, 14]], [[6, 8], [9, 6], [11, 8], [11, 14]]]);
  def('n', 10, [[[2, 6], [2, 14]], [[2, 8], [5, 6], [8, 8], [8, 14]]]);
  def('o', 10, [arc(5, 10, 3.3, 4, -Math.PI / 2, Math.PI * 1.5, 16)]);
  def('p', 10, [[[2, 6], [2, 19]], [[2, 8], [5, 6], [8, 8], [8, 12], [5, 14], [2, 12]]]);
  def('q', 10, [[[8, 6], [8, 19]], [[8, 8], [5, 6], [2, 8], [2, 12], [5, 14], [8, 12]]]);
  def('r', 7, [[[2, 6], [2, 14]], [[2, 8], [4, 6], [6, 6.5]]]);
  def('s', 8, [[[7, 7], [4, 6], [2, 8], [4, 10], [6, 11], [5, 13.5], [2, 13]]]);
  def('t', 6, [[[3, 2], [3, 12], [5, 14]], [[1, 6], [5, 6]]]);
  def('u', 10, [[[2, 6], [2, 12], [4, 14], [7, 14], [8, 12]], [[8, 6], [8, 14]]]);
  def('v', 9, [[[2, 6], [5, 14], [8, 6]]]);
  def('w', 13, [[[2, 6], [4, 14], [6.5, 8], [9, 14], [11, 6]]]);
  def('x', 9, [[[2, 6], [8, 14]], [[8, 6], [2, 14]]]);
  def('y', 9, [[[2, 6], [5, 14]], [[8, 6], [5, 14], [2, 19]]]);
  def('z', 8, [[[2, 6], [7, 6], [2, 14], [7, 14]]]);

  // ── Digits ──────────────────────────────────────────────────────────────────
  def('0', 10, [arc(5, 7, 4, 7, -Math.PI / 2, Math.PI * 1.5, 16), [[3, 11], [7, 3]]]);
  def('1', 8, [[[2, 2], [5, 0], [5, 14]], [[2, 14], [8, 14]]]);
  def('2', 10, [[[2, 3], [5, 0], [8, 2], [8, 5], [2, 14], [9, 14]]]);
  def('3', 10, [[[2, 2], [5, 0], [8, 2], [6, 7], [8, 10], [5, 14], [2, 12]]]);
  def('4', 10, [[[7, 0], [1, 10], [9, 10]], [[7, 4], [7, 14]]]);
  def('5', 10, [[[8, 0], [3, 0], [2, 6], [5, 5], [8, 8], [7, 13], [4, 14], [1, 12]]]);
  def('6', 10, [[[8, 2], [5, 0], [2, 5], [2, 11], [5, 14], [8, 11], [6, 7], [2, 8]]]);
  def('7', 10, [[[2, 0], [9, 0], [4, 14]]]);
  def('8', 10, [arc(5, 4, 3.2, 3.6, -Math.PI / 2, Math.PI * 1.5, 14), arc(5, 11, 3.8, 3.4, -Math.PI / 2, Math.PI * 1.5, 14)]);
  def('9', 10, [[[2, 12], [5, 14], [8, 9], [8, 3], [5, 0], [2, 3], [4, 7], [8, 6]]]);

  // ── Punctuation ───────────────────────────────────────────────────────────
  def('.', 5, [[[2, 13], [2, 14]]]);
  def(',', 5, [[[3, 13], [2, 16.5]]]);
  def(':', 5, [[[2, 7], [2, 8]], [[2, 13], [2, 14]]]);
  def(';', 5, [[[3, 7], [3, 8]], [[3, 13], [2, 16.5]]]);
  def('!', 4, [[[2, 0], [2, 9]], [[2, 13], [2, 14]]]);
  def('?', 9, [[[2, 3], [5, 0], [8, 3], [5, 7], [5, 9]], [[5, 13], [5, 14]]]);
  def("'", 4, [[[2, 0], [2, 4]]]);
  def('"', 6, [[[2, 0], [2, 4]], [[4, 0], [4, 4]]]);
  def('`', 5, [[[2, 0], [4, 3]]]);
  def('-', 9, [[[2, 7], [7, 7]]]);
  def('–', 10, [[[1, 7], [9, 7]]]);
  def('_', 10, [[[1, 15], [9, 15]]]);
  def('(', 6, [[[5, 0], [2, 4], [2, 10], [5, 14]]]);
  def(')', 6, [[[1, 0], [4, 4], [4, 10], [1, 14]]]);
  def('[', 6, [[[5, 0], [2, 0], [2, 14], [5, 14]]]);
  def(']', 6, [[[1, 0], [4, 0], [4, 14], [1, 14]]]);
  def('{', 7, [[[5, 0], [3, 1], [3, 6], [1, 7], [3, 8], [3, 13], [5, 14]]]);
  def('}', 7, [[[2, 0], [4, 1], [4, 6], [6, 7], [4, 8], [4, 13], [2, 14]]]);
  def('/', 9, [[[2, 14], [7, 0]]]);
  def('\\', 9, [[[2, 0], [7, 14]]]);
  def('|', 4, [[[2, 0], [2, 16]]]);
  def('+', 9, [[[4, 4], [4, 11]], [[1, 7.5], [8, 7.5]]]);
  def('=', 9, [[[2, 5], [8, 5]], [[2, 9], [8, 9]]]);
  def('*', 8, [[[4, 1], [4, 7]], [[1, 2.5], [7, 5.5]], [[7, 2.5], [1, 5.5]]]);
  def('<', 9, [[[7, 3], [2, 7.5], [7, 12]]]);
  def('>', 9, [[[2, 3], [7, 7.5], [2, 12]]]);
  def('#', 10, [[[4, 1], [2, 14]], [[8, 1], [6, 14]], [[1, 5], [9, 5]], [[1, 10], [9, 10]]]);
  def('%', 12, [ellipse(3, 3, 2, 2.5, 12), ellipse(9, 11, 2, 2.5, 12), [[10, 1], [2, 14]]]);
  def('&', 12, [[[10, 14], [4, 4], [3, 2], [5, 0], [7, 2], [5, 5], [2, 9], [3, 13], [6, 14], [9, 10]]]);
  def('@', 14, [arc(6, 8, 2.6, 2.6, 0, TAU, 12), [[8.6, 8], [8.6, 11], [11, 10]], arc(7, 8, 6, 6, -0.3, TAU * 0.78, 16)]);
  def('°', 7, [ellipse(3, 2.5, 2, 2.5, 12)]);

  const glyph = (ch) => G[ch] || null;

  // ── Font styles ─────────────────────────────────────────────────────────────
  // The base glyph set is one monoline "Sans". Distinct typefaces are derived from
  // it by cheap, honest affine transforms — an x-scale (advance + glyph width) and a
  // shear about the baseline (italic / backslant). Single-line "weight" is the pen,
  // not the geometry, so we vary proportion and slant rather than stroke count.
  // Each entry: { id, label, scaleX, shear }. Drop-in authored glyph maps can be
  // added later by giving an entry its own `glyphs` table.
  const FONTS = [
    { id: 'sans', label: 'Vectura Sans', scaleX: 1, shear: 0 },
    { id: 'italic', label: 'Vectura Italic', scaleX: 1, shear: 0.22 },
    { id: 'condensed', label: 'Condensed', scaleX: 0.72, shear: 0 },
    { id: 'wide', label: 'Wide', scaleX: 1.32, shear: 0 },
    { id: 'oblique', label: 'Backslant', scaleX: 1, shear: -0.18 },
  ];
  const FONT_BY_ID = {};
  FONTS.forEach((f) => { FONT_BY_ID[f.id] = f; });
  const resolveFont = (id) => FONT_BY_ID[id] || FONTS[0];

  /**
   * Lay text out into positioned polylines.
   *
   * @param {string} text   — supports '\n' line breaks.
   * @param {object} opt
   *   size        cap height in mm (default 14)
   *   tracking    extra letter spacing in mm (default 0)
   *   lineHeight  line advance as a multiple of size (default 1.4)
   *   align       'left' | 'center' | 'right' (default 'left')
   * @returns {{ paths: Array<Array<{x,y}>>, width, height }} in mm, origin top-left.
   */
  const layout = (text, opt = {}) => {
    const size = Math.max(0.1, Number(opt.size) || 14);
    const scale = size / CAP;
    const tracking = (Number(opt.tracking) || 0) / scale; // back to font units
    const lineHeight = (Number(opt.lineHeight) || 1.4) * CAP;
    const align = opt.align || 'left';
    const font = resolveFont(opt.font);
    const sx = font.scaleX || 1;
    const shear = font.shear || 0;
    const advance = (g) => g.w * sx; // x-scaled advance keeps spacing proportional
    const rawLines = String(text == null ? '' : text).split('\n');

    // Measure each line's advance (font units) for alignment.
    const lineWidth = (line) => {
      let w = 0;
      for (const ch of line) {
        const g = glyph(ch) || G[' '];
        w += advance(g) + tracking;
      }
      return Math.max(0, w - tracking);
    };
    const widths = rawLines.map(lineWidth);
    const maxW = widths.reduce((m, w) => Math.max(m, w), 0);

    const paths = [];
    rawLines.forEach((line, li) => {
      const offset = align === 'center' ? (maxW - widths[li]) / 2
        : align === 'right' ? (maxW - widths[li]) : 0;
      let penX = offset;
      const penY = li * lineHeight;
      for (const ch of line) {
        const g = glyph(ch) || G[' '];
        g.s.forEach((stroke) => {
          // x-scale, then shear about the baseline (italic leans the cap line right).
          const path = stroke.map(([x, y]) => ({
            x: (penX + x * sx + shear * (CAP - y)) * scale,
            y: (penY + y) * scale,
          }));
          if (path.length >= 2) paths.push(path);
        });
        penX += advance(g) + tracking;
      }
    });

    const height = (rawLines.length - 1) * lineHeight + DESCENT;
    return { paths, width: maxW * scale, height: height * scale };
  };

  Vectura.StrokeFont = {
    CAP,
    DESCENT,
    glyph,
    has: (ch) => Object.prototype.hasOwnProperty.call(G, ch),
    fonts: FONTS.map((f) => ({ id: f.id, label: f.label })),
    layout,
  };
})();
