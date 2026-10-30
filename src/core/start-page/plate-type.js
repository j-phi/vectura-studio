/**
 * Start Page plate type math — window.Vectura.StartPagePlateType.
 *
 * Pure helpers for the plate layouts (src/ui/start-page/plates/layouts.js): the 16 layout ids, the real ink box of a
 * display word (so descenders and overshoots are never clipped, the same idea as StartPageArtGeometry.wordInkBox),
 * fit and rotation of that box, crop windows, shape-aware art frames, and a plate's color variables (every text color
 * is contrast checked against its ground). No DOM, no storage.
 *
 * A word box is measured at font-size 100 (FONT, LETTER_SPACING) and returned in that coordinate system:
 *   wordBox(metrics) -> { width, height, x, y }  (x,y = text origin inside the box; viewBox is "0 0 width height")
 */
(() => {
  const G = (typeof window !== 'undefined' ? window : globalThis);
  const Vectura = G.Vectura = G.Vectura || {};

  const LAYOUTS = Object.freeze([
    { id: 'vertical-word', name: 'Vertical word' },
    { id: 'spec-sheet', name: 'Spec sheet' },
    { id: 'text-wrap', name: 'Text wrap' },
    { id: 'waterfall', name: 'Waterfall' },
    { id: 'knockout', name: 'Knockout' },
    { id: 'full-sheet', name: 'Full sheet' },
    { id: 'full-bleed-band', name: 'Full bleed + band' },
    { id: 'diptych', name: 'Diptych' },
    { id: 'specimen-frame', name: 'Specimen frame' },
    { id: 'big-numeral', name: 'Big numeral' },
    { id: 'words-both-sides', name: 'Words both sides' },
    { id: 'plot-stages', name: 'Plot stages' },
    { id: 'knockout-title', name: 'Knockout title' },
    { id: 'detail-full', name: 'Detail + full' },
    { id: 'four-crops', name: 'Four crops' },
    { id: 'pull-quote', name: 'Pull quote' },
  ].map((l) => Object.freeze(l)));

  const FONT_FAMILY = '"Space Grotesk", system-ui, sans-serif';
  const FONT_WEIGHT = 700;
  const FONT = `${FONT_WEIGHT} 100px ${FONT_FAMILY}`;
  const LETTER_SPACING = -5; // px at font-size 100 (-0.05em)
  const PAD = 4;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const num = (v, d) => (Number.isFinite(+v) && v !== null && v !== '' && v !== undefined ? +v : d);
  const pad2 = (n) => String(n).padStart(2, '0');

  /* ------------------------------------------------------------------ words */
  /* Stand-in for TextMetrics when no canvas can measure (jsdom, a font that has not loaded). Generous on purpose. */
  const estimateMetrics = (word) => {
    const w = String(word == null ? '' : word);
    let width = 0;
    for (const ch of w) {
      let c = 0.6;
      if (/[il.,'!|:;]/.test(ch)) c = 0.3; else if (/[ftrj]/.test(ch)) c = 0.42; else if (/[mwMW]/.test(ch)) c = 0.9; else if (/[A-Z0-9]/.test(ch)) c = 0.66;
      width += c * 100 + LETTER_SPACING;
    }
    return {
      width,
      actualBoundingBoxLeft: 2,
      actualBoundingBoxRight: Math.max(1, width - 1),
      actualBoundingBoxAscent: /[A-Zbdfhklt0-9]/.test(w) ? 74 : 56,
      actualBoundingBoxDescent: /[gjpqy,;]/.test(w) ? 22 : 0,
    };
  };

  /* The word's ink box from TextMetrics (measured at FONT, LETTER_SPACING). */
  const wordBox = (m, o) => {
    const pad = num(o && o.pad, PAD);
    const Lf = Math.max(0, num(m.actualBoundingBoxLeft, 0));
    const R = Math.max(1, num(m.actualBoundingBoxRight, num(m.width, 1)) || num(m.width, 1));
    const A = Math.max(1, num(m.actualBoundingBoxAscent, 72));
    const D = Math.max(0, num(m.actualBoundingBoxDescent, 0));
    return { width: Lf + R + pad * 2, height: A + D + pad * 2, x: Lf + pad, y: A + pad, ascent: A, descent: D };
  };

  /* Largest size of a box that fits maxW x maxH, keeping its aspect. */
  const fitBox = (box, maxW, maxH) => {
    const s = Math.min(num(maxW, box.width) / box.width, num(maxH, box.height) / box.height);
    return { scale: s, width: box.width * s, height: box.height * s };
  };

  /* The same word turned a quarter turn: reads bottom-to-top (down = false) or top-to-bottom (down = true). */
  const verticalBox = (b, down) => {
    const f = (v) => +v.toFixed(2);
    const transform = down
      ? `translate(${f(b.descent + PAD)} ${f(b.x)}) rotate(90)`
      : `translate(${f(b.ascent + PAD)} ${f(b.width - b.x)}) rotate(-90)`;
    return { width: b.height, height: b.width, transform };
  };

  /* ------------------------------------------------------------------ crops and frames */
  /* A layer zoomed by z inside a clipping window, centered on (x, y) in 0..1; percentages of the window. */
  const cropStyle = (z, x, y) => {
    const zz = Math.max(1, num(z, 1));
    const min = -(zz - 1) * 100;
    return { width: zz * 100, height: zz * 100, left: clamp(50 - num(x, 0.5) * zz * 100, min, 0), top: clamp(50 - num(y, 0.5) * zz * 100, min, 0) };
  };
  /* The marker on the full view for a crop: a box of 1/z of the plate, centered on (x, y) (CSS vars in %). */
  const cropMark = (z, x, y) => {
    const zz = Math.max(1, num(z, 1));
    return { size: 100 / zz, left: (num(x, 0.5) - 0.5 / zz) * 100, top: (num(y, 0.5) - 0.5 / zz) * 100 };
  };

  /* Shape-aware cover frame. The art runtime already crops to the box's aspect, so the shapes differ only where the
     frame throws away corners: a circle shows 78.5 % of its square, so it zooms in a touch to keep ink to the rim. */
  const SHAPES = Object.freeze(['rect', 'circle', 'square', 'portrait', 'band']);
  const frameFor = (shape, user) => {
    const base = { z: shape === 'circle' ? 1.06 : 1, cx: null, cy: null };
    if (user && typeof user === 'object') {
      if (Number.isFinite(+user.z)) base.z = +user.z;
      if (user.cx != null && user.cy != null) { base.cx = +user.cx; base.cy = +user.cy; }
    }
    return base;
  };
  const ASPECT = { portrait: '3/4', square: '1/1', landscape: '4/3', '3d': '1/1' };
  const aspectOf = (orientation) => ASPECT[orientation] || ASPECT.landscape;

  /* ------------------------------------------------------------------ colors */
  const hx = (h) => {
    let s = String(h || '#000000').replace('#', '');
    if (s.length === 3) s = s.replace(/./g, '$&$&');
    const n = parseInt(s, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const toHex = (a) => '#' + a.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = (h) => { const [r, g, b] = hx(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
  const contrast = (a, b) => { const A = lum(a); const B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
  const mix = (a, b, t) => { const A = hx(a); const B = hx(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
  /* Nudge a color towards black or white until it clears `min` on `ground`. */
  const ensure = (color, ground, min) => {
    const src = toHex(hx(color));
    if (contrast(src, ground) >= min) return src;
    const darkerFirst = lum(ground) >= lum(src);
    for (const dir of darkerFirst ? ['#0a0a0b', '#ffffff'] : ['#ffffff', '#0a0a0b']) {
      for (let t = 0.04; t <= 1.0001; t += 0.04) { const c = mix(src, dir, t); if (contrast(c, ground) >= min) return c; }
    }
    return lum(ground) > 0.18 ? '#0a0a0b' : '#ffffff';
  };

  /* CSS variables of a plate for a placed colorway ({ ground | paper, ink, accent, textInk?, class?, exactInk?, exactText? }).
   exactInk / exactText (set for manual picks) skip the contrast nudge. */
  const plateVars = (cw) => {
    const paper = toHex(hx(cw.ground || cw.paper || '#ffffff'));
    const ink = toHex(hx(cw.ink || '#111111'));
    const dark = cw.class ? cw.class === 'dark' : lum(paper) < 0.18;
    // a color the user picked by hand is shown exactly (colors.js warns about its contrast instead of adjusting it)
    const text = cw.exactText ? toHex(hx(cw.textInk || ink)) : ensure(cw.textInk || ink, paper, 4.6);
    const acc = ensure(cw.accent || cw.ink2 || ink, paper, 4.6);
    return {
      '--spl-paper': paper,
      '--spl-ink': ink,
      '--spl-art': cw.exactInk ? ink : ensure(ink, paper, 3.2),
      '--spl-text': text,
      '--spl-acc': acc,
      '--spl-mute': ensure(mix(text, paper, 0.32), paper, 4.5),
      '--spl-line': mix(paper, text, 0.22),
      '--spl-disc': mix(paper, ink, dark ? 0.085 : 0.06),
      '--spl-inv': ensure(paper, ink, 4.6),
    };
  };

  /* ------------------------------------------------------------------ copy and tables */
  const firstSentence = (s) => { const t = String(s == null ? '' : s).trim(); return (t.match(/^.*?[.!?](\s|$)/) || [t])[0].trim(); };
  const normSpecs = (list) => (Array.isArray(list) ? list : []).map((s) => {
    if (Array.isArray(s) && s.length >= 2) return { label: String(s[0]), value: String(s[1]) };
    if (s && typeof s === 'object' && 'label' in s && 'value' in s) return { label: String(s.label), value: String(s.value) };
    return null;
  }).filter(Boolean);

  const WATERFALL = Object.freeze([[1, 18], [0.62, 38], [0.4, 60], [0.235, 82], [0.14, 100]].map(([scale, pen]) => Object.freeze({ scale, pen })));
  const STAGES = Object.freeze([0.25, 0.5, 0.75]);
  const CROPS_4 = Object.freeze([[0.28, 0.3], [0.72, 0.32], [0.3, 0.72], [0.7, 0.7]].map(([x, y]) => Object.freeze({ z: 2.4, x, y })));
  const DETAIL = Object.freeze({ z: 2.6, x: 0.46, y: 0.46 });

  Vectura.StartPagePlateType = {
    LAYOUTS, SHAPES, FONT, FONT_FAMILY, FONT_WEIGHT, LETTER_SPACING, PAD, WATERFALL, STAGES, CROPS_4, DETAIL,
    estimateMetrics, wordBox, fitBox, verticalBox, cropStyle, cropMark, frameFor, aspectOf, plateVars, contrast, ensure, mix,
    firstSentence, normSpecs, pad2,
  };
})();
