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
  const XHEIGHT_TOP = 6; // lowercase x-height top (baseline = CAP)
  // x-height as a fraction of cap height — the optical-midpoint reference a
  // strikethrough rule rides on (shared with the web outline face).
  const X_HEIGHT_FRAC = (CAP - XHEIGHT_TOP) / CAP;

  // ── Construction toolkit (y-down font-unit space) ───────────────────────────
  // Reference lines: cap/ascender top = 0 · x-height top = XHEIGHT_TOP · baseline
  // = 14 · descender bottom = 19. The font is an original geometric "architect's
  // draft" skeleton — tall x-height, open apertures, true-circle bowls and
  // Catmull-Rom curves rather than faceted polylines — drawn in a single pen pass
  // so it stays plotter-native.
  const PI = Math.PI;
  const TAU = PI * 2;

  // Mark a point array as a CURVE stroke (vs. a straight-segment stroke). The flag
  // is a non-enumerable, non-index property so it survives on the raw glyph-def
  // array (which layout() inspects) without polluting `.map`/`forEach` over points.
  // Renderers use it to draw the sampled polyline as native cubic béziers instead
  // of faceted chords — the stem/serif/diagonal strokes stay flagged false so their
  // sharp corners are preserved. See text.js (fontCurve branch).
  const asCurve = (pts) => { pts.curve = true; return pts; };

  // Sample an elliptical arc into a polyline. a0/a1 in radians; a0>a1 sweeps the
  // other way (the divisor keeps the step pitch even in either direction).
  const arc = (cx, cy, rx, ry, a0, a1, steps = 16) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return asCurve(pts);
  };
  // Closed ellipse, started at 12 o'clock so round glyphs open/close cleanly.
  const ellipse = (cx, cy, rx, ry, steps = 22) => arc(cx, cy, rx, ry, -PI / 2, PI * 1.5, steps);

  // Right-bulging bowl anchored on a stem at x0: a half-ellipse from (x0,yTop)
  // out to (xMax, mid) and back to (x0,yBot). Builds B/D/P/R bowls off the stem.
  const rbowl = (x0, yTop, yBot, xMax, steps = 12) =>
    arc(x0, (yTop + yBot) / 2, xMax - x0, (yBot - yTop) / 2, -PI / 2, PI / 2, steps);

  // Catmull-Rom → dense polyline through the anchor points (endpoints clamped for
  // an open curve). This is how the S-curve and humanist letters get smooth,
  // original contours without hand-authored per-glyph trig.
  const spline = (anchors, stepsPer = 6, closed = false) => {
    const P = anchors.map((p) => ({ x: p[0], y: p[1] }));
    const n = P.length;
    if (n < 3) return asCurve(anchors.map((p) => [p[0], p[1]]));
    const at = (i) => P[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
    const out = [];
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = at(i - 1); const p1 = at(i); const p2 = at(i + 1); const p3 = at(i + 2);
      for (let s = 0; s < stepsPer; s++) {
        const t = s / stepsPer; const t2 = t * t; const t3 = t2 * t;
        const cr = (a, b, c, d) =>
          0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([cr(p0.x, p1.x, p2.x, p3.x), cr(p0.y, p1.y, p2.y, p3.y)]);
      }
    }
    if (!closed) out.push([P[n - 1].x, P[n - 1].y]);
    return asCurve(out);
  };
  // Concatenate point arrays into one stroke (joins a curve to a straight leg).
  // A joined stroke is a curve if ANY part is a curve — the collinear straight
  // legs stay straight under Catmull-Rom smoothing, so only the curve→straight
  // junction rounds (the intended pen behaviour). See asCurve.
  const join = (...parts) => {
    const out = [].concat(...parts);
    if (parts.some((p) => p && p.curve)) out.curve = true;
    return out;
  };

  // Glyph table: char → { w, s:[ stroke, … ] }, stroke = [ [x,y], … ].
  const G = {};
  const def = (ch, w, s) => { G[ch] = { w, s }; };

  def(' ', 8, []);

  // ── Uppercase (cap 0 → 14) ───────────────────────────────────────────────────
  def('A', 12, [[[1.5, 14], [6, -0.2], [10.5, 14]], [[3.15, 8.7], [8.85, 8.7]]]);
  def('B', 11, [
    [[2, 0], [2, 14]],
    join([[2, 0]], rbowl(6.1, 0, 7, 9.6, 9), [[2, 7]]),
    join([[2, 7]], rbowl(6.3, 7, 14, 10.4, 9), [[2, 14]]),
  ]);
  def('C', 11, [arc(6, 7, 5, 7.2, 0.2 * PI, 1.8 * PI, 22)]);
  def('D', 11.5, [[[2, 0], [2, 14]], arc(2, 7, 8.6, 7.2, -PI / 2, PI / 2, 18)]);
  def('E', 10, [[[8.7, 0], [2, 0], [2, 14], [8.7, 14]], [[2, 7], [7.4, 7]]]);
  def('F', 9.8, [[[8.5, 0], [2, 0], [2, 14]], [[2, 7], [7.4, 7]]]);
  def('G', 11.5, [
    arc(6, 7, 5, 7.2, 0.2 * PI, 1.8 * PI, 22),
    [[10.05, 11.1], [10.05, 7.6], [6, 7.6]],
  ]);
  def('H', 11, [[[2, 0], [2, 14]], [[9, 0], [9, 14]], [[2, 7], [9, 7]]]);
  def('I', 6, [[[1, 0], [5, 0]], [[3, 0], [3, 14]], [[1, 14], [5, 14]]]);
  def('J', 8.5, [join([[8, 0], [8, 10.8]], arc(5, 10.8, 3, 3.4, 0, PI, 9))]);
  def('K', 11, [[[2, 0], [2, 14]], [[9.2, 0], [2, 8]], [[2.9, 7], [9.7, 14]]]);
  def('L', 9, [[[2, 0], [2, 14], [8, 14]]]);
  def('M', 13, [[[2, 14], [2, -0.2], [6.5, 9], [11, -0.2], [11, 14]]]);
  // Pointed convergences overshoot like the M tops (F-08): (2,0) is the top-left
  // apex where the diagonal springs off the left stem, (10,14) the bottom-right
  // apex where it lands on the right stem — push those past the cap/baseline.
  // (2,14) and (10,0) are flat stem terminals (like H/T) — kept flush.
  def('N', 12, [[[2, 14], [2, -0.2], [10, 14.2], [10, 0]]]);
  def('O', 12.5, [ellipse(6.25, 7, 5.2, 7.2, 26)]);
  def('P', 11, [[[2, 0], [2, 14]], join([[2, 0]], rbowl(6.2, 0, 7.6, 10.2, 9), [[2, 7.6]])]);
  def('Q', 12.5, [ellipse(6.25, 7, 5.2, 7.2, 26), [[7.6, 9.6], [11.6, 14.8]]]);
  def('R', 11, [
    [[2, 0], [2, 14]],
    join([[2, 0]], rbowl(6.2, 0, 7.4, 10, 9), [[2, 7.4]]),
    [[6.2, 7.4], [10.2, 14]],
  ]);
  def('S', 10.5, [spline([[9.2, 2.9], [8, 0.9], [5, -0.2], [2.5, 1.9], [2.4, 4.4], [4.8, 5.9], [7.3, 7.4], [9, 9.2], [8.7, 12], [5.9, 14.2], [2.9, 13.5], [1.5, 11.4]], 5)]);
  def('T', 10, [[[1, 0], [9, 0]], [[5, 0], [5, 14]]]);
  def('U', 11.5, [join([[2, 0]], arc(6, 9, 4, 5.2, PI, 0, 16), [[10, 0]])]);
  def('V', 12, [[[1, 0], [6, 14.2], [11, 0]]]);
  def('W', 16, [[[1, 0], [4, 14.2], [8, 4], [12, 14.2], [15, 0]]]);
  def('X', 11, [[[2, 0], [10, 14]], [[10, 0], [2, 14]]]);
  def('Y', 11, [[[2, 0], [6, 7.5], [10, 0]], [[6, 7.5], [6, 14]]]);
  def('Z', 10, [[[2, 0], [8.7, 0], [2, 14], [8.7, 14]]]);

  // ── Lowercase (x-height top 6 → baseline 14) ────────────────────────────────
  def('a', 10.5, [
    [[8.2, 6], [8.2, 13], [9.5, 14.2]],
    spline([[8.2, 8.6], [5.5, 7], [3.4, 8.2], [2.2, 10.4], [2.4, 12.7], [4.4, 14.2], [6.8, 13.6], [8.2, 11.6]], 5),
  ]);
  def('b', 10, [[[1.6, 0], [1.6, 14]], ellipse(5, 10, 3.6, 4.1, 20)]);
  def('c', 9, [arc(5.2, 10, 3.6, 4.15, 0.22 * PI, 1.78 * PI, 18)]);
  def('d', 10, [[[8.4, 0], [8.4, 14]], ellipse(5, 10, 3.6, 4.1, 20)]);
  def('e', 9, [spline([[2.1, 10.2], [8, 10.2], [7.6, 7.6], [5, 6], [2.4, 7.6], [2, 10.1], [2.6, 12.5], [5.2, 14.2], [8, 12.8]], 5)]);
  def('f', 8, [join(spline([[6.4, 2.3], [5.4, 0.7], [3.9, 0.5], [3.2, 2.1]], 6), [[3.2, 14]]), [[1.2, 6.6], [5.7, 6.6]]]);
  def('g', 10, [
    ellipse(5.2, 10, 3.5, 4.1, 20),
    join(spline([[7.5, 6.7], [8.5, 8.4], [8.6, 12], [8.6, 15.8]], 4), spline([[8.6, 15.8], [7.6, 18.5], [4.8, 19], [2.6, 17.6]], 4)),
  ]);
  def('h', 10, [[[2, 0], [2, 14]], join(spline([[2, 8.2], [3.6, 6.4], [6, 5.95], [7.8, 7.9], [8, 10]], 5), [[8, 14]])]);
  def('i', 4, [[[2, 2.4], [2, 3.6]], [[2, 6], [2, 14]]]);
  def('j', 6, [[[4.4, 2.4], [4.4, 3.6]], join([[4.4, 6], [4.4, 16]], spline([[4.4, 16], [3.8, 18.4], [2, 18.9], [1, 17.7]], 4))]);
  def('k', 9, [[[2, 0], [2, 14]], [[7.4, 6], [2, 10.4]], [[4, 8.8], [8, 14]]]);
  def('l', 5, [[[2, 0], [2, 12.2], [3.4, 14]]]);
  def('m', 13, [
    [[2, 6], [2, 14]],
    join(spline([[2, 8.2], [3.2, 6.4], [4.9, 5.95], [6.3, 7.8], [6.5, 10]], 4), [[6.5, 14]]),
    join(spline([[6.5, 8.2], [7.7, 6.4], [9.5, 5.95], [10.9, 7.8], [11.1, 10]], 4), [[11.1, 14]]),
  ]);
  def('n', 10, [[[2, 6], [2, 14]], join(spline([[2, 8.2], [3.6, 6.4], [6, 5.95], [7.8, 7.9], [8, 10]], 5), [[8, 14]])]);
  def('o', 10, [ellipse(5, 10, 3.6, 4.1, 20)]);
  def('p', 10, [[[1.6, 6], [1.6, 19]], ellipse(5, 10, 3.6, 4.1, 20)]);
  def('q', 10, [[[8.4, 6], [8.4, 19]], ellipse(5, 10, 3.6, 4.1, 20)]);
  def('r', 7, [[[2, 6], [2, 14]], spline([[2, 8.2], [3.6, 6.3], [6, 6.1]], 4)]);
  def('s', 8, [spline([[7, 7.4], [5.6, 6], [3, 6.2], [2.2, 7.9], [3.8, 9.1], [6, 9.9], [6.6, 11.6], [5.6, 13.9], [2.9, 14.05], [1.4, 12.4]], 5)]);
  def('t', 7, [[[3.2, 1.8], [3.2, 12], [5.2, 14]], [[1.2, 6.6], [5.6, 6.6]]]);
  def('u', 10, [join([[2, 6], [2, 11]], arc(5, 11, 3, 3, PI, 0, 12)), [[8, 6], [8, 14]]]);
  def('v', 9, [[[2, 6], [5, 14.3], [8, 6]]]);
  def('w', 13, [[[2, 6], [4, 14.3], [6.5, 8], [9, 14.3], [11, 6]]]);
  def('x', 9, [[[2, 5.8], [8, 14.2]], [[8, 5.8], [2, 14.2]]]);
  def('y', 9, [[[2, 6], [5, 13.4]], [[8, 6], [5, 13.4], [2.4, 19]]]);
  def('z', 8, [[[2, 6], [7, 6], [2, 14], [7, 14]]]);

  // ── Digits (0 → 14) ──────────────────────────────────────────────────────────
  def('0', 10, [ellipse(5, 7, 4, 7.2, 22), [[3, 11], [7, 3]]]);
  def('1', 10, [[[3.4, 2.4], [6, 0.6], [6, 14]], [[3, 14], [9, 14]]]);
  def('2', 10, [
    spline([[2.2, 3], [3.6, 0.6], [6.6, 0.6], [8.4, 2.8], [7.6, 5.4], [4.6, 8.2], [2, 11], [2, 14]], 5),
    [[2, 14], [9, 14]],
  ]);
  def('3', 10, [spline([[2.2, 2.6], [4.2, 0.6], [7, 1], [8.2, 3.4], [6, 6.6], [8.4, 8.2], [8.6, 11], [6.4, 13.6], [3.2, 14.1], [1.6, 11.8]], 5)]);
  def('4', 10, [[[7, 0], [1.2, 10], [9, 10]], [[7, 4], [7, 14]]]);
  def('5', 10, [join([[8, 0.6], [3, 0.6], [2.4, 6]], spline([[2.4, 6], [5, 4.8], [7.8, 6.4], [8, 9.6], [6.4, 13.4], [3.4, 14.1], [1.4, 12.2]], 5))]);
  def('6', 10, [spline([[8, 2.2], [5.6, 0.4], [3, 2.2], [2, 6.6], [2.1, 10.8], [4.2, 14.1], [6.8, 13.4], [8, 11], [7.2, 8.4], [4.6, 7.2], [2.4, 8.6]], 5)]);
  def('7', 10, [[[2, 0], [9, 0], [4, 14]]]);
  def('8', 10, [ellipse(5, 4, 3, 3.4, 16), ellipse(5, 10.65, 3.7, 3.5, 16)]);
  def('9', 10, [spline([[2, 11.8], [4.4, 14.05], [7, 11.8], [8, 7.4], [7.9, 3.2], [5.8, 0.4], [3.2, 0.8], [2, 3.4], [2.8, 5.8], [5.4, 7], [7.6, 5.4]], 5)]);

  // ── Punctuation ───────────────────────────────────────────────────────────
  def('.', 5, [[[2, 13], [2, 14]]]);
  def(',', 5, [[[2.6, 13], [2, 16.5]]]);
  def(':', 5, [[[2, 7.5], [2, 8.5]], [[2, 13], [2, 14]]]);
  def(';', 5, [[[2.6, 7.5], [2.6, 8.5]], [[2.6, 13], [2, 16.5]]]);
  def('!', 4, [[[2, 0], [2, 9]], [[2, 13], [2, 14]]]);
  def('?', 9, [join(spline([[2, 3], [3.4, 0.6], [6.4, 0.6], [7.6, 3], [5.6, 5.4], [4.6, 7], [4.6, 9]], 4)), [[4.6, 13], [4.6, 14]]]);
  def("'", 4, [[[2, 0], [2, 4]]]);
  def('"', 6, [[[2, 0], [2, 4]], [[4, 0], [4, 4]]]);
  def('`', 5, [[[2, 0], [4, 3]]]);
  def('-', 9, [[[2, 7.5], [7, 7.5]]]);
  def('–', 10, [[[1, 7.5], [9, 7.5]]]);
  def('_', 10, [[[1, 15], [9, 15]]]);
  def('(', 6, [arc(6, 7, 4.4, 7.6, 0.7 * PI, 1.3 * PI, 12)]);
  def(')', 6, [arc(0, 7, 4.4, 7.6, 1.7 * PI, 2.3 * PI, 12)]);
  def('[', 6, [[[5, 0], [2, 0], [2, 14], [5, 14]]]);
  def(']', 6, [[[1, 0], [4, 0], [4, 14], [1, 14]]]);
  def('{', 7, [[[5, 0], [3, 1], [3, 6], [1, 7], [3, 8], [3, 13], [5, 14]]]);
  def('}', 7, [[[2, 0], [4, 1], [4, 6], [6, 7], [4, 8], [4, 13], [2, 14]]]);
  def('/', 9, [[[2, 14], [7, 0]]]);
  def('\\', 9, [[[2, 0], [7, 14]]]);
  def('|', 4, [[[2, 0], [2, 16]]]);
  def('+', 9, [[[4.5, 4], [4.5, 11]], [[1, 7.5], [8, 7.5]]]);
  def('=', 9, [[[2, 5.5], [8, 5.5]], [[2, 9.5], [8, 9.5]]]);
  def('*', 8, [[[4, 1], [4, 7]], [[1, 2.5], [7, 5.5]], [[7, 2.5], [1, 5.5]]]);
  def('<', 9, [[[7, 3], [2, 7.5], [7, 12]]]);
  def('>', 9, [[[2, 3], [7, 7.5], [2, 12]]]);
  def('#', 10, [[[4, 1], [2, 14]], [[8, 1], [6, 14]], [[1, 5], [9, 5]], [[1, 10], [9, 10]]]);
  def('%', 12, [ellipse(3, 3, 2, 2, 12), ellipse(9, 11, 2, 2, 12), [[10, 1], [2, 14]]]);
  def('&', 12, [spline([[10.4, 14], [6.6, 9.6], [4, 6.6], [3.4, 3.6], [5, 1], [7.2, 2], [6.6, 4.8], [3.6, 7.4], [2.4, 10.4], [4, 13.4], [7, 14], [9.4, 11.2], [10.6, 9.4]], 4)]);
  def('@', 14, [arc(6, 8, 2.6, 2.6, 0, TAU, 14), [[8.6, 8], [8.6, 11], [11, 10]], arc(7, 8, 6, 6, -0.3, TAU * 0.78, 18)]);
  def('°', 7, [ellipse(3, 2.5, 2, 2, 12)]);

  const glyph = (ch) => G[ch] || null;

  // ── One family, many styles ─────────────────────────────────────────────────
  // Vectura is a SINGLE typeface. Its slant/width "styles" are derived from the one
  // monoline skeleton by cheap, honest affine transforms — an x-scale (advance +
  // glyph width) and a shear about the baseline (italic / backslant). Each entry:
  // { id, label, scaleX, shear }. `id` is the value carried in layer.params.font.
  const FONTS = [
    { id: 'sans', label: 'Regular', scaleX: 1, shear: 0 },
    { id: 'italic', label: 'Oblique', scaleX: 1, shear: 0.22 },
    { id: 'condensed', label: 'Condensed', scaleX: 0.72, shear: 0 },
    { id: 'wide', label: 'Wide', scaleX: 1.32, shear: 0 },
    { id: 'oblique', label: 'Backslant', scaleX: 1, shear: -0.18 },
  ];
  const FONT_BY_ID = {};
  FONTS.forEach((f) => { FONT_BY_ID[f.id] = f; });
  const resolveFont = (id) => FONT_BY_ID[id] || FONTS[0];
  const FAMILY = { id: 'vectura', label: 'Vectura' };

  // Single-stroke "weight" is the PEN, not the skeleton: a heavier weight is drawn
  // as extra parallel pen passes wrapped around each stroke (text.js feeds this into
  // GeometryUtils.thickenPaths). weightPasses() returns how many EXTRA passes a
  // weight adds on top of the base outline weight, so Bold visibly fattens.
  const WEIGHTS = [
    { id: 'Regular', label: 'Regular', passes: 0 },
    { id: 'Medium', label: 'Medium', passes: 2 },
    { id: 'Semibold', label: 'Semibold', passes: 4 },
    { id: 'Bold', label: 'Bold', passes: 7 },
  ];
  const WEIGHT_BY_ID = {};
  WEIGHTS.forEach((w) => { WEIGHT_BY_ID[w.id] = w; });
  const weightPasses = (label) => (WEIGHT_BY_ID[label] ? WEIGHT_BY_ID[label].passes : 0);

  // Weight → {clampedThickness, extraTrackingMM}. A PURE helper (no globals) so the
  // weight-consumption math is unit-testable in isolation. Two jobs:
  //   • F-04 optical-size clamp: a heavier pen adds parallel passes, but at small
  //     cap size those passes close the counters. Cap the pass count so the band
  //     never exceeds what fits across a bowl — xHeight(mm) / (2·penW) is roughly
  //     how many pen widths span half a bowl, so that's the ceiling.
  //   • F-03 advance compensation: each extra pass spreads ink sideways ~penW/2
  //     per side, so widen the advance (via extra tracking, mm) to keep stems from
  //     merging. k≈0.6 pen-widths of extra sidebearing per pass.
  const weightMetrics = (passes, capMM, penW) => {
    const p = Math.max(0, Number(passes) || 0);
    const cap = Math.max(0.1, Number(capMM) || 0);
    const pw = Math.max(1e-3, Number(penW) || 0.35);
    const sizeCap = Math.max(1, Math.floor((cap * X_HEIGHT_FRAC) / (2 * pw)));
    const clampedThickness = Math.min(1 + p, sizeCap);
    const extraTrackingMM = p * pw * 0.6;
    return { clampedThickness, extraTrackingMM };
  };

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
   *     kernPairs   sparse per-pair kern map keyed by caret index (the gap
   *                 between char c-1 and char c) → extra advance for THAT gap
   *                 only, in FONT UNITS. No global uniform kern.
   *     baselineShift  mm; raises the whole block (y up).
   *     indentLeft/indentRight/indentFirst  mm; per-line / paragraph-head indents.
   *     spaceBefore/spaceAfter  mm; vertical gap before/after each paragraph.
   *     smallCaps   render lowercase as the (reduced) uppercase letterform.
   *     superscript/subscript  shrink + raise / lower each glyph.
   *     ot*         OpenType opts — IGNORED by the built-in monoline face.
   *     hyphenate + wrapWidth  soft-wrap (see GoogleFonts.layout note); the built-in
   *                 face honours wrapWidth-gated wrapping with a simple heuristic.
   * @returns {{ paths, meta, width, height, cells }} mm, origin top-left. `meta`
   *   runs parallel to `paths`: { glyphIndex, charIndex, lineIndex, baselineY,
   *   x0, x1 }. `cells` is dense over the source string (one per char incl.
   *   spaces): { sourceIndex, lineIndex, x0, x1, baselineY, advance, isSpace }.
   */
  const layout = (text, opt = {}) => {
    const size = Math.max(0.1, Number(opt.size) || 14);
    const scale = size / CAP;
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const tracking = (Number(opt.tracking) || 0) / scale; // back to font units
    // Per-pair kern (font units), keyed by caret index (the gap between char
    // c-1 and char c). kernAfter(s) is the kern applied AFTER the char at source
    // index s — i.e. the gap at caret index s+1.
    const kernPairs = (opt.kernPairs && typeof opt.kernPairs === 'object') ? opt.kernPairs : null;
    const kernAfter = (srcIdx) => {
      if (!kernPairs) return 0;
      const v = Number(kernPairs[srcIdx + 1]);
      return Number.isFinite(v) ? v : 0;
    };
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

    // A char's laid-out advance in FONT UNITS (used by wrap measurement + below).
    const advFU = (ch) => {
      const r = resolveChar(ch);
      return r.g.w * sx * hScale * r.cScaleX + tracking;
    };

    // Tokenise the input into lines. Two wrap modes are mutually exclusive:
    //   • AREA type (areaWrap): word-level wrap at the frame width with EXACT raw
    //     sourceIndex tracking (no synthetic hyphen), so on-canvas editing indexes
    //     the raw string correctly across every wrap boundary. `areaStart[i]` is
    //     the raw-string index of the first character rendered on visual line i.
    //   • legacy soft-wrap (hyphenate + wrapWidth): greedy break with a mid-word
    //     hyphen; reflow breaks the raw→cell mapping, so it stays non-editable.
    let rawLines = String(text == null ? '' : text).split('\n');
    let areaStart = null;
    if (opt.areaWrap === true && wrapWidthFU > 0) {
      const wrapped = areaWrap(String(text == null ? '' : text), wrapWidthFU - indentLeft - indentRight, advFU);
      rawLines = wrapped.lines;
      areaStart = wrapped.starts;
    } else if (opt.hyphenate === true && wrapWidthFU > 0) {
      rawLines = softWrap(rawLines, wrapWidthFU - indentLeft - indentRight, advFU);
    }

    // A char's laid-out advance (font units). Per-pair kern is added at the gap
    // during positioning (below), not folded into every char's advance.
    const charAdvance = (r) => r.g.w * sx * hScale * r.cScaleX + tracking;
    const lineCells = rawLines.map((line) => Array.from(line).map((ch) => {
      const r = resolveChar(ch);
      return { ch, r, adv: charAdvance(r) };
    }));
    // Raw-string offset of each visual line's first char (full semantics in the
    // note by the positioning loop). Computed here so per-pair kern can fold into
    // each cell's advance BEFORE width and alignment are measured.
    const lineStart = [];
    if (areaStart) {
      for (let i = 0; i < lineCells.length; i++) lineStart[i] = areaStart[i] || 0;
    } else {
      let accIdx = 0;
      for (let i = 0; i < lineCells.length; i++) {
        lineStart[i] = accIdx;
        accIdx += lineCells[i].length + 1; // +1 for the consumed newline
      }
    }
    // Fold each glyph's per-pair kern (toward the next glyph on its line) into its
    // advance, so width, alignment slack and pen positioning stay consistent.
    lineCells.forEach((cells, li) => {
      for (let ci = 0; ci < cells.length - 1; ci++) cells[ci].adv += kernAfter(lineStart[li] + ci);
    });
    const lineWidth = (cells) => Math.max(0, cells.reduce((w, c) => w + c.adv, 0) - tracking);
    const widths = lineCells.map(lineWidth);
    const maxW = widths.reduce((m, w) => Math.max(m, w), 0);

    // Paragraph membership (split on blank lines) for indentFirst + spacing.
    const blank = rawLines.map((l) => l.trim().length === 0);
    const firstOfPara = rawLines.map((_, i) => !blank[i] && (i === 0 || blank[i - 1]));
    const lastOfPara = rawLines.map((_, i) => !blank[i] && (i === rawLines.length - 1 || blank[i + 1]));

    const colWidth = wrapWidthFU > 0 ? wrapWidthFU : (maxW + indentLeft + indentRight);

    // Per-character cell source offsets (M1 seam) were computed above (as
    // `lineStart`) so per-pair kern could fold into advances before measurement.
    // `cells` runs dense over the RAW input string (one entry per char incl.
    // spaces / zero-stroke glyphs); sourceIndex accounts for the '\n' between
    // lines. For AREA type (areaStart present) the exact raw-string index of each
    // visual line's first char is used, so `sourceIndex` stays exact across every
    // soft-wrap boundary. NOTE: the legacy hyphenate+wrapWidth soft-wrap reflows
    // lines, so sourceIndex degrades to the post-wrap layout offset there — a
    // known hit-testing edge case (area type is exact).
    const paths = [];
    const meta = [];
    const cellOut = [];
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
      // Empty line (a bare '\n' with no glyphs) still gets a zero-width caret
      // anchor at the line start, so an editor can place a blinking caret on the
      // new line and grow the text box the instant Enter is pressed — before any
      // glyph is typed there. Skipped for a lone empty line (rawLines.length === 1)
      // so a brand-new, glyph-less box keeps its origin-anchored caret fallback.
      if (cells.length === 0 && rawLines.length > 1) {
        cellOut.push({
          sourceIndex: lineStart[li],
          lineIndex: li,
          x0: penX * scale,
          x1: penX * scale,
          baselineY: (penY + CAP) * scale - baselineShift,
          advance: 0,
          isSpace: true,
          caretAnchor: true,
        });
      }
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
              // Curve strokes (bowls/arcs/splines) render as native béziers so they
              // read as true curves; stems/serifs/diagonals stay straight chords.
              curve: stroke.curve === true,
            });
            drewMeta = true;
          }
        });
        void drewMeta;
        // Effective advance includes the justify perGap so cells tile contiguously
        // (per-pair kern is already folded into cell.adv above).
        const eff = cell.adv + (cell.r.isSpace ? perGap : 0);
        cellOut.push({
          sourceIndex: lineStart[li] + ci,
          lineIndex: li,
          x0,
          x1: (penX + eff) * scale,
          baselineY: (penY + CAP) * scale - baselineShift,
          advance: eff * scale,
          isSpace: cell.r.isSpace === true,
        });
        penX += eff;
      });

      penY += lineHeight;
      if (lastOfPara[li]) penY += spaceAfter;
    });

    const height = penY - lineHeight + DESCENT;
    return { paths, meta, width: colWidth * scale, height: height * scale, cells: cellOut, xHeightFrac: X_HEIGHT_FRAC };
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

  // Area-type word-wrap with EXACT raw sourceIndex tracking. Greedy line-fill by
  // word: a soft break happens at the last space that fits, and that ONE space is
  // consumed (dropped from both lines) so each visual line is a CONTIGUOUS slice
  // of the source — the property that keeps `lineStart[li] + ci` an exact raw
  // index. A hard '\n' ends the line and is consumed (+1). A single word wider
  // than the column has no break candidate, so it OVERFLOWS the column width
  // (documented choice) rather than inserting a synthetic hyphen char (which is
  // absent from the source and would desync sourceIndex). Returns
  //   { lines: string[], starts: number[] }  where starts[i] is the raw
  // code-point index of lines[i]'s first character.
  const areaWrap = (text, maxFU, advOf) => {
    const chars = Array.from(String(text == null ? '' : text));
    const n = chars.length;
    const lines = [];
    const starts = [];
    let lineStart = 0;   // code-point index of the current line's first char
    let i = 0;
    let width = 0;       // measured advance of the current line so far
    let lastSpace = -1;  // code-point index of the most recent space on the line
    const emit = (endExclusive) => {
      lines.push(chars.slice(lineStart, endExclusive).join(''));
      starts.push(lineStart);
    };
    while (i < n) {
      const ch = chars[i];
      if (ch === '\n') {           // hard break: end the line, consume the newline
        emit(i);
        lineStart = i + 1; i = i + 1; width = 0; lastSpace = -1;
        continue;
      }
      const adv = advOf(ch);
      if (width + adv > maxFU && i > lineStart && lastSpace > lineStart) {
        // Overflow with a break candidate: wrap at the last space, consume it, and
        // re-flow everything after it onto the next line.
        emit(lastSpace);
        lineStart = lastSpace + 1; i = lineStart; width = 0; lastSpace = -1;
        continue;
      }
      // No break candidate (single long word) → let it overflow; keep advancing.
      if (ch === ' ' || ch === '\t') lastSpace = i;
      width += adv;
      i += 1;
    }
    emit(n); // final (possibly empty) line
    return { lines, starts };
  };

  Vectura.StrokeFont = {
    CAP,
    DESCENT,
    xHeightFrac: X_HEIGHT_FRAC,
    glyph,
    has: (ch) => Object.prototype.hasOwnProperty.call(G, ch),
    // One family with selectable styles (slant/width) and weights (pen passes).
    family: FAMILY,
    styles: FONTS.map((f) => ({ id: f.id, label: f.label })),
    weights: WEIGHTS.map((w) => ({ id: w.id, label: w.label })),
    weightPasses,
    weightMetrics,
    isStyle: (id) => Object.prototype.hasOwnProperty.call(FONT_BY_ID, id),
    // Back-compat alias: callers that listed "fonts" still get the style list.
    fonts: FONTS.map((f) => ({ id: f.id, label: f.label })),
    layout,
  };
})();
