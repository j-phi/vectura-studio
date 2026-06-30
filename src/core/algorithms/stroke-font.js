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

  // Synthesis constants (fractions of CAP / scale factors), shared with the web
  // outline path so smallCaps / super- / sub-script look consistent across sources.
  const SMALL_CAPS_SCALE = 0.78; // cap glyph reduced toward x-height
  const SUPSUB_SCALE = 0.62;     // super/subscript size relative to full cap
  const SUP_DY = -0.42;          // raise (fraction of CAP, y-up is negative)
  const SUB_DY = 0.18;           // lower (fraction of CAP)

  /**
   * Lay text out into positioned polylines.
   *
   * @param {string} text   — supports '\n' line breaks.
   * @param {object} opt
   *   size        cap height in mm (default 14)
   *   tracking    extra letter spacing in mm (default 0)
   *   lineHeight  line advance as a multiple of size (default 1.4)
   *   align       'left' | 'center' | 'right' | 'justify-left' |
   *               'justify-center' | 'justify-right' | 'justify-all' (default 'left')
   *
   *   New optional opts (each a no-op at its default → historical output unchanged):
   *     fontWeight  ignored by the built-in face (single weight).
   *     vScale/hScale  percent (100 = unchanged); scale glyph geometry about the
   *                    glyph baseline origin. hScale also scales the advance.
   *     kerning     extra advance added to EVERY glyph, in FONT UNITS.
   *     baselineShift  mm; raises the whole block (y up).
   *     indentLeft/indentRight/indentFirst  mm; per-line / paragraph-head indents.
   *     spaceBefore/spaceAfter  mm; vertical gap before/after each paragraph.
   *     smallCaps   render lowercase as the (reduced) uppercase letterform.
   *     superscript/subscript  shrink + raise / lower each glyph.
   *     ot*         OpenType opts — IGNORED by the built-in monoline face.
   *     hyphenate + wrapWidth  soft-wrap (see GoogleFonts.layout note); the built-in
   *                 face honours wrapWidth-gated wrapping with a simple heuristic.
   * @returns {{ paths, meta, width, height }} mm, origin top-left. `meta` runs
   *   parallel to `paths`: { glyphIndex, charIndex, lineIndex, baselineY, x0, x1 }.
   */
  const layout = (text, opt = {}) => {
    const size = Math.max(0.1, Number(opt.size) || 14);
    const scale = size / CAP;
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const tracking = (Number(opt.tracking) || 0) / scale; // back to font units
    const kerning = num(opt.kerning, 0); // font units, per the layout contract
    const lineHeight = (Number(opt.lineHeight) || 1.4) * CAP;
    const vScale = num(opt.vScale, 100) / 100;
    const hScale = num(opt.hScale, 100) / 100;
    const baselineShift = num(opt.baselineShift, 0); // mm
    const smallCaps = opt.smallCaps === true;
    const superscript = opt.superscript === true;
    const subscript = opt.subscript === true;
    // mm indents/spacing → font units (internal math is font units, scaled at end)
    const indentLeft = num(opt.indentLeft, 0) / scale;
    const indentRight = num(opt.indentRight, 0) / scale;
    const indentFirst = num(opt.indentFirst, 0) / scale;
    const spaceBefore = num(opt.spaceBefore, 0) / scale;
    const spaceAfter = num(opt.spaceAfter, 0) / scale;
    const wrapWidthFU = num(opt.wrapWidth, 0) > 0 ? num(opt.wrapWidth, 0) / scale : 0;

    const rawAlign = opt.align || 'left';
    const justify = typeof rawAlign === 'string' && rawAlign.indexOf('justify') === 0;
    const justifySuffix = justify ? (rawAlign.slice('justify-'.length) || 'left') : '';
    const baseAlign = justify
      ? (justifySuffix === 'all' ? 'left' : justifySuffix)
      : (rawAlign === 'center' || rawAlign === 'right' ? rawAlign : 'left');

    const font = resolveFont(opt.font);
    const sx = font.scaleX || 1;
    const shear = font.shear || 0;

    // Per-character resolution: pick the drawn glyph plus its synthesis transform
    // (x/y scale about the baseline origin, vertical offset in font units).
    const resolveChar = (ch) => {
      let g = glyph(ch) || G[' '];
      let cScaleX = 1, cScaleY = 1, cDY = 0;
      if (smallCaps && ch >= 'a' && ch <= 'z') {
        const up = glyph(ch.toUpperCase());
        if (up) { g = up; cScaleX = SMALL_CAPS_SCALE; cScaleY = SMALL_CAPS_SCALE; }
      }
      if (superscript) { cScaleX *= SUPSUB_SCALE; cScaleY *= SUPSUB_SCALE; cDY += SUP_DY * CAP; }
      else if (subscript) { cScaleX *= SUPSUB_SCALE; cScaleY *= SUPSUB_SCALE; cDY += SUB_DY * CAP; }
      return { g, cScaleX, cScaleY, cDY, isSpace: ch === ' ' };
    };

    // Tokenise the input into lines, applying wrapWidth-gated hyphenation/soft-wrap.
    let rawLines = String(text == null ? '' : text).split('\n');
    if (opt.hyphenate === true && wrapWidthFU > 0) {
      rawLines = softWrap(rawLines, wrapWidthFU - indentLeft - indentRight, (ch) => {
        const r = resolveChar(ch);
        return r.g.w * sx * hScale * r.cScaleX + tracking + kerning;
      });
    }

    // A char's laid-out advance (font units).
    const charAdvance = (r) => r.g.w * sx * hScale * r.cScaleX + tracking + kerning;
    const lineCells = rawLines.map((line) => Array.from(line).map((ch) => {
      const r = resolveChar(ch);
      return { ch, r, adv: charAdvance(r) };
    }));
    const lineWidth = (cells) => Math.max(0, cells.reduce((w, c) => w + c.adv, 0) - tracking);
    const widths = lineCells.map(lineWidth);
    const maxW = widths.reduce((m, w) => Math.max(m, w), 0);

    // Paragraph membership (split on blank lines) for indentFirst + spacing.
    const blank = rawLines.map((l) => l.trim().length === 0);
    const firstOfPara = rawLines.map((_, i) => !blank[i] && (i === 0 || blank[i - 1]));
    const lastOfPara = rawLines.map((_, i) => !blank[i] && (i === rawLines.length - 1 || blank[i + 1]));

    const colWidth = wrapWidthFU > 0 ? wrapWidthFU : (maxW + indentLeft + indentRight);

    const paths = [];
    const meta = [];
    let penY = 0;
    rawLines.forEach((line, li) => {
      if (firstOfPara[li]) penY += spaceBefore;
      const cells = lineCells[li];
      const lineW = widths[li];
      const avail = colWidth - indentLeft - indentRight - (firstOfPara[li] ? indentFirst : 0);
      const slack = Math.max(0, avail - lineW);

      // Justify: distribute slack across inter-word gaps unless this is the final
      // line of the paragraph (kept ragged) — except 'justify-all' which fills it.
      const gaps = cells.filter((c) => c.r.isSpace).length;
      const doJustify = justify && gaps > 0 && slack > 1e-6 &&
        (justifySuffix === 'all' || !lastOfPara[li]);
      const perGap = doJustify ? slack / gaps : 0;

      // Non-justified slack handling: left 0, center half, right full.
      const alignOffset = doJustify ? 0
        : baseAlign === 'center' ? slack / 2
        : baseAlign === 'right' ? slack : 0;

      let penX = indentLeft + (firstOfPara[li] ? indentFirst : 0) + alignOffset;
      cells.forEach((cell, ci) => {
        const { g, cScaleX, cScaleY, cDY } = cell.r;
        const x0 = penX * scale;
        let drewMeta = false;
        g.s.forEach((stroke) => {
          const path = stroke.map(([x, y]) => {
            const yRel = (y - CAP) * vScale * cScaleY;
            const yfu = CAP + yRel + cDY;
            const xLocal = x * sx * hScale * cScaleX;
            const shearOff = shear * (CAP - yfu);
            return {
              x: (penX + xLocal + shearOff) * scale,
              y: (penY + yfu) * scale - baselineShift,
            };
          });
          if (path.length >= 2) {
            paths.push(path);
            meta.push({
              glyphIndex: ci,
              charIndex: ci,
              lineIndex: li,
              baselineY: (penY + CAP) * scale - baselineShift,
              x0,
              x1: (penX + cell.adv) * scale,
            });
            drewMeta = true;
          }
        });
        void drewMeta;
        penX += cell.adv + (cell.r.isSpace ? perGap : 0);
      });

      penY += lineHeight;
      if (lastOfPara[li]) penY += spaceAfter;
    });

    const height = penY - lineHeight + DESCENT;
    return { paths, meta, width: colWidth * scale, height: height * scale };
  };

  // Minimal dependency-free soft-wrap. Splits each input line into words on spaces
  // and re-flows so each output line's measured advance stays within `maxFU` (font
  // units). When a single word is itself wider than the column it is broken on a
  // simple character-count heuristic with a hyphen. LIMITATIONS: this is a greedy,
  // language-agnostic break — it has no dictionary, no Knuth-Plass, and inserts a
  // hyphen at an arbitrary mid-word character rather than a true syllable boundary.
  const softWrap = (lines, maxFU, advOf) => {
    if (!(maxFU > 0)) return lines;
    const spaceAdv = advOf(' ');
    const out = [];
    for (const line of lines) {
      if (line.trim().length === 0) { out.push(line); continue; }
      const words = line.split(/(\s+)/).filter((w) => w.length && w.trim().length);
      let cur = '';
      let curW = 0;
      const wordW = (w) => Array.from(w).reduce((s, ch) => s + advOf(ch), 0);
      const flush = () => { if (cur.length) { out.push(cur); cur = ''; curW = 0; } };
      for (let w of words) {
        let ww = wordW(w);
        // Word longer than the column: hard-break it with a hyphen.
        while (ww > maxFU && Array.from(w).length > 1) {
          flush();
          let piece = '';
          let pieceW = 0;
          const chars = Array.from(w);
          let k = 0;
          for (; k < chars.length - 1; k++) {
            const aw = advOf(chars[k]);
            if (pieceW + aw + advOf('-') > maxFU && piece.length) break;
            piece += chars[k];
            pieceW += aw;
          }
          out.push(piece + '-');
          w = chars.slice(k).join('');
          ww = wordW(w);
        }
        const add = (cur.length ? spaceAdv : 0) + ww;
        if (curW + add > maxFU && cur.length) { flush(); cur = w; curW = ww; }
        else { cur = cur.length ? cur + ' ' + w : w; curW += add; }
      }
      flush();
    }
    return out;
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
