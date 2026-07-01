/*
 * Text synthesis features (Unit B — text.js orchestration, RGR coverage).
 *
 * The Text algorithm now forwards the bespoke synthesis-panel params into the
 * font layout engine and adds three display-space transforms it owns directly:
 *   - allCaps          uppercases the string before layout
 *   - charRotation     spins every glyph about its own centroid (deterministic)
 *   - underline/strike emits a horizontal rule per line (meta.straight)
 *   - fillInset/Offset erodes / translates the fill window (real outline face)
 *
 * Back-compat contract: with every new param at its factory default the output
 * is byte-identical to before. Each behavioural test below is RED before the
 * wiring lands (the param is silently ignored) and GREEN after.
 *
 * Fills are exercised through the REAL text.generate + a synthetic parsed web
 * face (per the project memory: never test Type fills via the fill engine in
 * isolation), so the outline → contour → buildFillRecord → pattern path runs.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Text synthesis features (Unit B — text.js)', () => {
  let runtime;
  let V;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
  });

  afterAll(() => runtime.cleanup());

  const bounds = { width: 400, height: 300, m: 20, dW: 360, dH: 260 };
  const gen = (extra) =>
    V.AlgorithmRegistry.text.generate(
      { ...V.ALGO_DEFAULTS.text, ...extra },
      new V.SeededRNG(1),
      new V.SimpleNoise(1),
      bounds,
    );

  const bbox = (paths) => {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const p of paths) for (const pt of p) {
      minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
    }
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  };

  // ── Back-compat ───────────────────────────────────────────────────────────
  test('every new synthesis param at its default is a byte-for-byte no-op', () => {
    const a = gen({ text: 'VAO', fitToFrame: false });
    const b = gen({
      text: 'VAO', fitToFrame: false,
      charRotation: 0, allCaps: false, smallCaps: false, superscript: false,
      subscript: false, underline: false, strikethrough: false,
      fillInsetEnabled: false, fillInset: 1.5, fillOffsetX: 0, fillOffsetY: 0,
      vScale: 100, hScale: 100, kerning: 0, baselineShift: 0,
      indentLeft: 0, indentRight: 0, indentFirst: 0, spaceBefore: 0, spaceAfter: 0,
      fontWeight: 'Regular', hyphenate: false,
    });
    expect(a.length).toBeGreaterThan(0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Default Text is single-stroke polylines (no fill, no curves).
    expect(a.every((p) => p.meta && p.meta.straight === true)).toBe(true);
  });

  // ── allCaps ────────────────────────────────────────────────────────────────
  test('allCaps uppercases the string before layout', () => {
    const lower = gen({ text: 'i', fitToFrame: false });
    const upper = gen({ text: 'I', fitToFrame: false });
    const capped = gen({ text: 'i', allCaps: true, fitToFrame: false });
    // sanity: 'i' and 'I' are genuinely different letterforms
    expect(JSON.stringify(lower)).not.toBe(JSON.stringify(upper));
    // allCaps makes lowercase 'i' render as the uppercase glyph
    expect(JSON.stringify(capped)).toBe(JSON.stringify(upper));
  });

  // ── charRotation ─────────────────────────────────────────────────────────
  test('charRotation spins each glyph (a tall I turns wide at 90°)', () => {
    const base = bbox(gen({ text: 'I', charRotation: 0, fitToFrame: false }));
    const spun = bbox(gen({ text: 'I', charRotation: 90, fitToFrame: false }));
    expect(spun.w).toBeGreaterThan(base.w * 1.5);
    expect(spun.h).toBeLessThan(base.h * 0.8);
  });

  test('charRotation is deterministic and changes the geometry', () => {
    const a = gen({ text: 'VAO', charRotation: 27, fitToFrame: false });
    const b = gen({ text: 'VAO', charRotation: 27, fitToFrame: false });
    const none = gen({ text: 'VAO', charRotation: 0, fitToFrame: false });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(none));
  });

  // ── underline / strikethrough ──────────────────────────────────────────────
  // A horizontal rule = a 2-point path whose endpoints share a y and span an x
  // range. 'O' (an arc polyline) never produces one on its own.
  const isHRule = (p) => p.length === 2 &&
    Math.abs(p[0].y - p[1].y) < 1e-6 && Math.abs(p[1].x - p[0].x) > 1;

  test('underline adds one horizontal rule per line', () => {
    const plain = gen({ text: 'OO', fitToFrame: false });
    const under = gen({ text: 'OO', underline: true, fitToFrame: false });
    expect(plain.filter(isHRule).length).toBe(0);
    const rules = under.filter(isHRule);
    expect(rules.length).toBe(1);
    expect(rules.every((r) => r.meta && r.meta.algorithm === 'text' && r.meta.straight === true)).toBe(true);
  });

  test('strikethrough rides above the underline; both can coexist', () => {
    const strike = gen({ text: 'OO', strikethrough: true, fitToFrame: false }).filter(isHRule);
    const under = gen({ text: 'OO', underline: true, fitToFrame: false }).filter(isHRule);
    const both = gen({ text: 'OO', underline: true, strikethrough: true, fitToFrame: false }).filter(isHRule);
    expect(strike.length).toBe(1);
    expect(both.length).toBe(2);
    // y increases downward → strikethrough (through the x-height) sits above
    expect(strike[0][0].y).toBeLessThan(under[0][0].y);
  });

  test('two lines yield two underline rules', () => {
    const rules = gen({ text: 'O\nO', underline: true, fitToFrame: false }).filter(isHRule);
    expect(rules.length).toBe(2);
  });

  // ── decoration: optical midpoint, offsets, weight, style, tail breaks ───────
  test('strikethroughOffset raises the rule (+ = up, y decreases)', () => {
    const base = gen({ text: 'oo', font: 'sans', strikethrough: true, fitToFrame: false }).filter(isHRule);
    const up = gen({ text: 'oo', font: 'sans', strikethrough: true, strikethroughOffset: 6, fitToFrame: false }).filter(isHRule);
    expect(base.length).toBe(1);
    expect(up[0][0].y).toBeLessThan(base[0][0].y);
  });

  test('underlineOffset lowers the rule (+ = down, y increases)', () => {
    const base = gen({ text: 'oo', font: 'sans', underline: true, fitToFrame: false }).filter(isHRule);
    const down = gen({ text: 'oo', font: 'sans', underline: true, underlineOffset: 6, fitToFrame: false }).filter(isHRule);
    expect(down[0][0].y).toBeGreaterThan(base[0][0].y);
  });

  test('underline weight > 1 thickens the rule into parallel passes', () => {
    const thin = gen({ text: 'oo', font: 'sans', underline: true, fitToFrame: false }).filter(isHRule);
    const thick = gen({ text: 'oo', font: 'sans', underline: true, underlineThickness: 6, fitToFrame: false }).filter(isHRule);
    expect(thin.length).toBe(1);
    expect(thick.length).toBeGreaterThan(1);
  });

  test('underline line style tags a stroke dash (dashed/dotted only; dotted is finer)', () => {
    const solid = gen({ text: 'oo', font: 'sans', underline: true, underlineStyle: 'solid', fitToFrame: false }).filter(isHRule);
    const dashed = gen({ text: 'oo', font: 'sans', underline: true, underlineStyle: 'dashed', fitToFrame: false }).filter(isHRule);
    const dotted = gen({ text: 'oo', font: 'sans', underline: true, underlineStyle: 'dotted', fitToFrame: false }).filter(isHRule);
    expect(solid[0].meta.strokeDash).toBeUndefined();
    expect(Array.isArray(dashed[0].meta.strokeDash)).toBe(true);
    expect(Array.isArray(dotted[0].meta.strokeDash)).toBe(true);
    expect(dotted[0].meta.strokeDash[0]).toBeLessThan(dashed[0].meta.strokeDash[0]);
  });

  test('descender breaks split the underline around letter tails when enabled', () => {
    // 'aya' — the middle 'y' tail dips below the underline, carving a padded gap
    // that splits one continuous rule into two surviving runs ('a' has no tail).
    const whole = gen({ text: 'aya', font: 'sans', underline: true, fitToFrame: false }).filter(isHRule);
    const broken = gen({ text: 'aya', font: 'sans', underline: true, underlineBreak: true, underlineBreakGap: 1.5, fitToFrame: false }).filter(isHRule);
    expect(whole.length).toBe(1);
    expect(broken.length).toBe(2);
  });

  test('descender break gap is centred on the tail ink, not the glyph cell', () => {
    // 'y' leans left — its tail dips below the underline on the left of its
    // advance cell. The gap must straddle that ink (so equal padding on each
    // side of the descender), NOT the cell centre, which sits far to the right.
    const breakGap = 2;
    const out = gen({ text: 'iyi', font: 'sans', underline: true, underlineBreak: true, underlineBreakGap: breakGap, fitToFrame: false });
    const rules = out.filter(isHRule).sort((a, b) => a[0].x - b[0].x);
    expect(rules.length).toBe(2);
    const gapLeft = Math.max(rules[0][0].x, rules[0][1].x);
    const gapRight = Math.min(rules[1][0].x, rules[1][1].x);
    const gapCenter = (gapLeft + gapRight) / 2;
    // Lowest ink point = the tail tip.
    let tipX = 0; let maxY = -Infinity;
    for (const path of out) {
      if (isHRule(path)) continue;
      for (const pt of path) { if (pt.y > maxY) { maxY = pt.y; tipX = pt.x; } }
    }
    // The gap centre hugs the tail (cell-centred padding would put it ~6mm right).
    expect(Math.abs(gapCenter - tipX)).toBeLessThan(4);
  });

  // ── more line styles ────────────────────────────────────────────────────────
  test('extended line styles map to distinct dash patterns', () => {
    const dashed = gen({ text: 'oo', font: 'sans', underline: true, underlineStyle: 'dashed', fitToFrame: false }).filter(isHRule);
    const dashDot = gen({ text: 'oo', font: 'sans', underline: true, underlineStyle: 'dash-dot', fitToFrame: false }).filter(isHRule);
    const longDash = gen({ text: 'oo', font: 'sans', underline: true, underlineStyle: 'long-dash', fitToFrame: false }).filter(isHRule);
    expect(dashDot[0].meta.strokeDash.length).toBe(4);
    expect(longDash[0].meta.strokeDash[0]).toBeGreaterThan(dashed[0].meta.strokeDash[0]);
  });

  // ── thickening mechanisms ─────────────────────────────────────────────────
  test('thickening modes change the rule geometry (parallel vs sinusoidal vs snake)', () => {
    const opts = { text: 'oo', font: 'sans', underline: true, underlineThickness: 8, fitToFrame: false };
    const par = gen({ ...opts, underlineThickenMode: 'parallel' });
    const sin = gen({ ...opts, underlineThickenMode: 'sinusoidal' });
    const snake = gen({ ...opts, underlineThickenMode: 'snake' });
    expect(JSON.stringify(par)).not.toBe(JSON.stringify(sin));
    expect(JSON.stringify(par)).not.toBe(JSON.stringify(snake));
  });

  test('hatch thickening draws diagonal ticks across the band', () => {
    const hatched = gen({ text: 'oo', font: 'sans', underline: true, underlineThickness: 10, underlineThickenMode: 'hatch', fitToFrame: false });
    // Decoration ticks are 2-point text paths; glyph 'o' strokes are longer arcs.
    const twoPt = hatched.filter((p) => p.meta && p.meta.algorithm === 'text' && p.length === 2);
    const diagonals = twoPt.filter((p) => Math.abs(p[0].y - p[1].y) > 1e-6);
    expect(diagonals.length).toBeGreaterThan(0);
  });

  // ── strikethrough parity (weight) ──────────────────────────────────────────
  test('strikethrough weight > 1 thickens the rule like the underline', () => {
    const thin = gen({ text: 'oo', font: 'sans', strikethrough: true, fitToFrame: false }).filter(isHRule);
    const thick = gen({ text: 'oo', font: 'sans', strikethrough: true, strikethroughThickness: 6, fitToFrame: false }).filter(isHRule);
    expect(thin.length).toBe(1);
    expect(thick.length).toBeGreaterThan(1);
  });

  // ── fill inset / offset (real outline face) ────────────────────────────────
  describe('fill placement via a synthetic parsed web face', () => {
    const ID = '__textsynth-web__';
    // Square glyph: spans x[0,0.4em] y[-0.5em,0] relative to the pen/baseline —
    // a closed contour the pattern-fill engine can hatch.
    const makeFont = () => ({
      unitsPerEm: 1000,
      tables: { os2: { sCapHeight: 700 } },
      getKerningValue: () => 0,
      stringToGlyphs: (s) => Array.from(String(s)).map((ch) => ({
        unicode: ch.charCodeAt(0),
        advanceWidth: 600,
        getPath: (x, y, em) => ({ commands: [
          { type: 'M', x, y: y - em * 0.5 },
          { type: 'L', x: x + em * 0.5, y: y - em * 0.5 },
          { type: 'L', x: x + em * 0.5, y },
          { type: 'L', x, y },
          { type: 'Z' },
        ] }),
      })),
    });

    beforeEach(() => { V.WEBFONT_GLYPHS[ID] = makeFont(); });
    afterEach(() => { delete V.WEBFONT_GLYPHS[ID]; });

    const fillsOf = (paths) => paths.filter((p) => p.meta && p.meta.textFill);
    const fillGen = (extra) => gen({
      text: 'AA', font: 'google:' + ID, fitToFrame: false,
      fillEnabled: true, fillType: 'hatch', fillDensity: 6, outlineStroke: false,
      bezierOutline: false, ...extra,
    });

    test('an outline face emits hatch fill geometry through text.generate', () => {
      const f = fillsOf(fillGen({}));
      expect(f.length).toBeGreaterThan(0);
    });

    test('fillInset erodes the fill region (output differs from un-inset)', () => {
      const base = fillsOf(fillGen({}));
      const inset = fillsOf(fillGen({ fillInsetEnabled: true, fillInset: 4 }));
      expect(base.length).toBeGreaterThan(0);
      expect(JSON.stringify(inset)).not.toBe(JSON.stringify(base));
    });

    const meanOf = (fills) => {
      const pts = fills.flat();
      let sx = 0; let sy = 0;
      for (const q of pts) { sx += q.x; sy += q.y; }
      return { x: sx / pts.length, y: sy / pts.length, n: pts.length };
    };

    // fillOffset is now a LITERAL millimetre translation of the fill window: it
    // slides the region polygons, so the fill's centroid shifts by exactly the mm
    // offset (was a normalized -1..1 fraction of the glyph block; and feeding it
    // into the hatch phase left the X axis a no-op at angle 0).
    test('fillOffset slides the fill window by the given millimetres', () => {
      const mmGen = (extra) => fillsOf(fillGen({ fillDensity: 8, fillAngle: 0, ...extra }));
      const base = meanOf(mmGen({}));
      const shifted = meanOf(mmGen({ fillOffsetX: 6, fillOffsetY: -4 }));
      expect(base.n).toBeGreaterThan(0);
      expect(shifted.x - base.x).toBeCloseTo(6, 1);
      expect(shifted.y - base.y).toBeCloseTo(-4, 1);
    });

    test('a zero fillOffset leaves the fill window centred (no drift)', () => {
      const base = meanOf(fillsOf(fillGen({ fillDensity: 8, fillAngle: 0 })));
      const zero = meanOf(fillsOf(fillGen({ fillDensity: 8, fillAngle: 0, fillOffsetX: 0, fillOffsetY: 0 })));
      expect(zero.x - base.x).toBeCloseTo(0, 6);
      expect(zero.y - base.y).toBeCloseTo(0, 6);
    });
  });

  // ── fill clips to the bézier outline, not the coarse contour ────────────────
  describe('fill geometry on a curved glyph', () => {
    const ID = '__textsynth-circle__';
    // One circle contour built from four cubic béziers (kappa). The native anchors
    // describe a smooth circle; the layout-space `flattenCommands` polyline is a
    // coarse inscribed polygon. Fill must clip to the former.
    // A circle from four cubic béziers. `dir:'cw'` reverses the sweep so an inner
    // ring winds opposite the outer shell (the nonzero rule then carves a counter).
    const circleCmds = (cx, cy, r, dir) => {
      const k = 0.5522847498307936 * r;
      const cw = [
        { type: 'M', x: cx + r, y: cy },
        { type: 'C', x1: cx + r, y1: cy + k, x2: cx + k, y2: cy + r, x: cx, y: cy + r },
        { type: 'C', x1: cx - k, y1: cy + r, x2: cx - r, y2: cy + k, x: cx - r, y: cy },
        { type: 'C', x1: cx - r, y1: cy - k, x2: cx - k, y2: cy - r, x: cx, y: cy - r },
        { type: 'C', x1: cx + k, y1: cy - r, x2: cx + r, y2: cy - k, x: cx + r, y: cy },
        { type: 'Z' },
      ];
      if (dir !== 'cw') return cw;
      return [
        { type: 'M', x: cx + r, y: cy },
        { type: 'C', x1: cx + r, y1: cy - k, x2: cx + k, y2: cy - r, x: cx, y: cy - r },
        { type: 'C', x1: cx - k, y1: cy - r, x2: cx - r, y2: cy - k, x: cx - r, y: cy },
        { type: 'C', x1: cx - r, y1: cy + k, x2: cx - k, y2: cy + r, x: cx, y: cy + r },
        { type: 'C', x1: cx + k, y1: cy + r, x2: cx + r, y2: cy + k, x: cx + r, y: cy },
        { type: 'Z' },
      ];
    };
    // Glyph geometry (em units): disk radius 0.3em, ring outer 0.34 / inner 0.17,
    // both centred at (+0.35em, -0.35em) from the pen origin.
    const R = 0.3; const RO = 0.34; const RI = 0.17; const CXE = 0.35; const CYE = 0.35;
    const makeFont = (ring, outerDir = 'ccw') => ({
      unitsPerEm: 1000,
      tables: { os2: { sCapHeight: 700 } },
      getKerningValue: () => 0,
      stringToGlyphs: (s) => Array.from(String(s)).map((ch) => ({
        unicode: ch.charCodeAt(0),
        advanceWidth: 800,
        getPath: (x, y, em) => ({ commands: ring
          ? circleCmds(x + em * CXE, y - em * CYE, em * RO, outerDir)
            .concat(circleCmds(x + em * CXE, y - em * CYE, em * RI, outerDir === 'ccw' ? 'cw' : 'ccw'))
          : circleCmds(x + em * CXE, y - em * CYE, em * R, outerDir) }),
      })),
    });
    afterEach(() => { delete V.WEBFONT_GLYPHS[ID]; });

    const fillsOf = (paths) => paths.filter((p) => p.meta && p.meta.textFill);
    const flat = (fills) => fills.flat();
    const gen2 = (extra) => gen({
      text: 'O', font: 'google:' + ID, fitToFrame: false, fontSize: 40,
      fillEnabled: true, fillType: 'hatch', fillDensity: 10, fillAngle: 0,
      ...extra,
    });
    // The rendered outline is emitted as native-cubic rings (meta.anchors). Sample
    // each ring finely so containment is measured against the SAME curve the fill
    // is supposed to hug — not the mathematical circle, which the cardinal-anchor
    // refit deliberately deviates from.
    const outlineRings = (paths) => paths
      .filter((pp) => pp.meta && pp.meta.algorithm === 'text' && !pp.meta.textFill && Array.isArray(pp.meta.anchors))
      .map((pp) => {
        const A = pp.meta.anchors; const poly = []; const S = 96;
        for (let i = 0; i < A.length; i += 1) {
          const a = A[i]; const b = A[(i + 1) % A.length];
          const c1 = a.out || a; const c2 = b.in || b;
          for (let s = 0; s < S; s += 1) {
            const t = s / S; const u = 1 - t;
            poly.push({
              x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
              y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
            });
          }
        }
        return poly;
      });
    // Even-odd point membership across every outline ring → the ink region (an
    // annulus for a counter glyph). True ⇒ the point is inside the border.
    const insideInk = (rings, px, py) => {
      let inside = false;
      for (const poly of rings) {
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = poly[i].x; const yi = poly[i].y; const xj = poly[j].x; const yj = poly[j].y;
          if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
      }
      return inside;
    };
    const pointInPoly = (poly, px, py) => {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x; const yi = poly[i].y; const xj = poly[j].x; const yj = poly[j].y;
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    const centroidMaxR = (fills) => {
      const pts = flat(fills); if (!pts.length) return 0;
      let sx = 0; let sy = 0; for (const q of pts) { sx += q.x; sy += q.y; }
      const cx = sx / pts.length; const cy = sy / pts.length;
      let mr = 0; for (const q of pts) { const d = Math.hypot(q.x - cx, q.y - cy); if (d > mr) mr = d; }
      return mr;
    };

    test('bézier-outline fill differs from the coarse contour fill and reaches nearer the true edge', () => {
      V.WEBFONT_GLYPHS[ID] = makeFont(false);
      const coarse = fillsOf(gen2({ bezierOutline: false, outlineStroke: false }));
      const fine = fillsOf(gen2({ bezierOutline: true, jitter: 0, outlineStroke: false }));
      expect(coarse.length).toBeGreaterThan(0);
      expect(fine.length).toBeGreaterThan(0);
      // Before the fix both paths clipped to the same coarse contour → identical.
      expect(JSON.stringify(fine)).not.toBe(JSON.stringify(coarse));
      expect(centroidMaxR(fine)).toBeGreaterThan(centroidMaxR(coarse));
    });

    test('fill NEVER peeks outside the rendered bézier outline (convex glyph)', () => {
      V.WEBFONT_GLYPHS[ID] = makeFont(false);
      const out = gen2({ bezierOutline: true, jitter: 0, outlineStroke: true });
      const rings = outlineRings(out);
      const pts = flat(fillsOf(out));
      expect(rings.length).toBeGreaterThan(0);
      expect(pts.length).toBeGreaterThan(0);
      const escaped = pts.filter((q) => !insideInk(rings, q.x, q.y));
      expect(escaped).toEqual([]);
    });

    test('fill NEVER intrudes into a carved counter (ring glyph, nonzero)', () => {
      V.WEBFONT_GLYPHS[ID] = makeFont(true);
      const out = gen2({ bezierOutline: true, jitter: 0, outlineStroke: true, fillDensity: 14 });
      const rings = outlineRings(out);
      const pts = flat(fillsOf(out));
      // Two rings → the counter is a genuine hole in the ink region.
      expect(rings.length).toBeGreaterThanOrEqual(2);
      expect(pts.length).toBeGreaterThan(0);
      // No fill vertex may leave the annulus — neither outside the outer edge nor
      // inside the counter (the exact peeking the screenshots showed).
      const escaped = pts.filter((q) => !insideInk(rings, q.x, q.y));
      expect(escaped).toEqual([]);
    });

    // The safety inset is signed off contour winding by the engine; a CW-authored
    // outer (CFF/OTF wind their outer opposite to TrueType, and opentype's y-flip
    // flips it again) must be eroded INWARD, not dilated outward. Winding is
    // canonicalized by nesting depth so both authorings behave identically.
    test('fill NEVER peeks when the outer contour is authored clockwise (CFF/OTF winding)', () => {
      V.WEBFONT_GLYPHS[ID] = makeFont(false, 'cw');
      const out = gen2({ bezierOutline: true, jitter: 0, outlineStroke: true, fillInsetEnabled: true, fillInset: 6 });
      const rings = outlineRings(out);
      const pts = flat(fillsOf(out));
      expect(rings.length).toBeGreaterThan(0);
      expect(pts.length).toBeGreaterThan(0);
      const escaped = pts.filter((q) => !insideInk(rings, q.x, q.y));
      expect(escaped).toEqual([]);
    });

    test('a CW-authored ring glyph carves its counter identically (no counter flood)', () => {
      V.WEBFONT_GLYPHS[ID] = makeFont(true, 'cw');
      const out = gen2({ bezierOutline: true, jitter: 0, outlineStroke: true, fillDensity: 14 });
      const rings = outlineRings(out);
      const pts = flat(fillsOf(out));
      expect(rings.length).toBeGreaterThanOrEqual(2);
      expect(pts.length).toBeGreaterThan(0);
      const escaped = pts.filter((q) => !insideInk(rings, q.x, q.y));
      expect(escaped).toEqual([]);
    });

    // Two overlapping SAME-winding outer disks (kerned/connected-script overlap,
    // the case nonzero was added to weld). Winding must be canonicalized PER GLYPH
    // — a block-wide depth pass would read the neighbour's ink as nesting and flip
    // one disk negative, which both punches a white void in the weld lens (nonzero
    // +1−1=0) and dilates that disk outward past its border. Heavy negative tracking
    // forces the overlap; merge is off so each disk keeps its own outline ring.
    test('overlapping same-winding glyphs fill the weld solid and never peek', () => {
      V.WEBFONT_GLYPHS[ID] = makeFont(false);
      const out = gen({
        text: 'OO', font: 'google:' + ID, fitToFrame: false, fontSize: 40,
        tracking: -34, mergeOverlaps: false,
        fillEnabled: true, fillType: 'hatch', fillDensity: 12, fillAngle: 0,
        bezierOutline: true, jitter: 0, outlineStroke: true,
      });
      const rings = outlineRings(out);
      const segs = fillsOf(out).filter((s) => s.length >= 2);
      const pts = flat(segs);
      expect(rings.length).toBe(2);
      expect(pts.length).toBeGreaterThan(0);
      // No peek: every fill vertex lies inside the union of the two disks.
      const inUnion = (q) => rings.some((r) => pointInPoly(r, q.x, q.y));
      expect(pts.filter((q) => !inUnion(q))).toEqual([]);
      // No weld void: a hatch line must cross the overlap lens. If one disk were
      // flipped negative, nonzero cancels there and the lens is a hole — no fill
      // segment would span its centre. (Endpoints sit on the union edge, so we test
      // that a segment's span brackets the lens centre, not that a vertex is in it.)
      const centroid = (r) => ({ x: r.reduce((a, q) => a + q.x, 0) / r.length, y: r.reduce((a, q) => a + q.y, 0) / r.length });
      const c0 = centroid(rings[0]); const c1 = centroid(rings[1]);
      const Cx = (c0.x + c1.x) / 2; const Cy = (c0.y + c1.y) / 2;
      const crossesLens = segs.some((s) => {
        const xs = s.map((q) => q.x); const ys = s.map((q) => q.y);
        return Math.min(...ys) <= Cy + 3 && Math.max(...ys) >= Cy - 3 && Math.min(...xs) <= Cx && Math.max(...xs) >= Cx;
      });
      expect(crossesLens).toBe(true);
    });

    // Thin-walled ring at the maximum Fill Inset: the engine insets each contour
    // independently, so the dilated counter crosses the eroded outer and nonzero
    // re-inks past the border. The un-inset-ink post-filter must drop every escaped
    // segment so the fill thins/vanishes but NEVER peeks (hard bar).
    test('thin-walled ring at max Fill Inset never peeks outside the border', () => {
      const thinRing = () => ({
        unitsPerEm: 1000, tables: { os2: { sCapHeight: 700 } }, getKerningValue: () => 0,
        stringToGlyphs: (s) => Array.from(String(s)).map((ch) => ({
          unicode: ch.charCodeAt(0), advanceWidth: 800,
          getPath: (x, y, em) => ({ commands: circleCmds(x + em * CXE, y - em * CYE, em * 0.34, 'ccw')
            .concat(circleCmds(x + em * CXE, y - em * CYE, em * 0.30, 'cw')) }),
        })),
      });
      V.WEBFONT_GLYPHS[ID] = thinRing();
      const out = gen2({ bezierOutline: true, jitter: 0, outlineStroke: true, fillDensity: 20, fillInsetEnabled: true, fillInset: 8 });
      const rings = outlineRings(out);
      const pts = flat(fillsOf(out));
      expect(rings.length).toBeGreaterThanOrEqual(2);
      // Whatever survives must be inside the annulus — zero escaped vertices.
      const escaped = pts.filter((q) => !insideInk(rings, q.x, q.y));
      expect(escaped).toEqual([]);
    });

    // INTRA-glyph overlapping same-winding subpaths (a script ball terminal poking
    // out of the body). Per-glyph grouping alone doesn't help — both subpaths are
    // one glyph. Proper-containment depth keeps them both outer (no flip → no weld
    // void), and the always-on peek filter is the backstop. This runs on the
    // DEFAULT path (no user inset), the case a naive depth test peeked ~0.1mm on.
    test('a self-overlapping glyph (body + poking terminal) fills solid and never peeks', () => {
      const blob = () => ({
        unitsPerEm: 1000, tables: { os2: { sCapHeight: 700 } }, getKerningValue: () => 0,
        stringToGlyphs: (s) => Array.from(String(s)).map((ch) => ({
          unicode: ch.charCodeAt(0), advanceWidth: 900,
          getPath: (x, y, em) => ({ commands: circleCmds(x + em * 0.32, y - em * 0.35, em * 0.28, 'ccw')
            .concat(circleCmds(x + em * 0.60, y - em * 0.20, em * 0.12, 'ccw')) }),
        })),
      });
      V.WEBFONT_GLYPHS[ID] = blob();
      const out = gen2({ bezierOutline: true, jitter: 0, outlineStroke: true, fillDensity: 16, fillAngle: 20 });
      const rings = outlineRings(out);
      const segs = fillsOf(out).filter((s) => s.length >= 2);
      const pts = flat(segs);
      expect(rings.length).toBe(2);
      expect(pts.length).toBeGreaterThan(0);
      // No peek: every fill vertex is inside the union of the two subpaths.
      const inUnion = (q) => rings.some((r) => pointInPoly(r, q.x, q.y));
      expect(pts.filter((q) => !inUnion(q))).toEqual([]);
      // No weld void: locate a point inside BOTH subpaths (the overlap lens) and
      // assert a hatch line crosses it — if the terminal were flipped negative the
      // lens would cancel to a hole.
      const centroid = (r) => ({ x: r.reduce((a, q) => a + q.x, 0) / r.length, y: r.reduce((a, q) => a + q.y, 0) / r.length });
      const c0 = centroid(rings[0]); const c1 = centroid(rings[1]);
      let lens = null;
      for (let t = 0; t <= 1 && !lens; t += 0.02) {
        const x = c0.x + t * (c1.x - c0.x); const y = c0.y + t * (c1.y - c0.y);
        if (pointInPoly(rings[0], x, y) && pointInPoly(rings[1], x, y)) lens = { x, y };
      }
      expect(lens).not.toBeNull();
      const crosses = segs.some((s) => {
        const xs = s.map((q) => q.x); const ys = s.map((q) => q.y);
        return Math.min(...ys) <= lens.y + 3 && Math.max(...ys) >= lens.y - 3 && Math.min(...xs) <= lens.x && Math.max(...xs) >= lens.x;
      });
      expect(crosses).toBe(true);
    });

    // A genuine counter whose WALL is thinner than the flatten sagitta (~0.08mm):
    // the shell's chord polygon bows inward past the counter's true-curve vertices,
    // so a strict all-vertices containment test would misread the counter as a
    // sibling, flip it positive, and FLOOD it solid (an inward flood the peek filter
    // can't catch). The eps-tolerant containment must still classify it as a counter
    // and carve it. Small font size makes the wall sub-sagitta in absolute mm.
    test('a hairline-wall counter stays carved (not flooded) at small size', () => {
      // Straight-edged (no-subdivide) counter polygon whose vertices don't align
      // with the finely-flattened shell's chords, so with a thin wall many counter
      // vertices land in the shell's inward chord-bows — the strict (eps 0) test
      // then mis-flips and floods; the eps-tolerant test keeps it carved.
      const polyCmds = (cx, cy, r, sides, dir) => {
        const c = [];
        for (let i = 0; i <= sides; i += 1) {
          const t = (dir === 'cw' ? -1 : 1) * ((2 * Math.PI * i) / sides) + 0.13;
          c.push({ type: i === 0 ? 'M' : 'L', x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) });
        }
        c.push({ type: 'Z' });
        return c;
      };
      const RO2 = 0.34; const RI2 = 0.338; // wall 0.002·em ≈ 0.034mm at fontSize 12 (< 0.08 sagitta)
      const hairline = () => ({
        unitsPerEm: 1000, tables: { os2: { sCapHeight: 700 } }, getKerningValue: () => 0,
        stringToGlyphs: (s) => Array.from(String(s)).map((ch) => ({
          unicode: ch.charCodeAt(0), advanceWidth: 800,
          getPath: (x, y, em) => ({ commands: circleCmds(x + em * CXE, y - em * CYE, em * RO2, 'ccw')
            .concat(polyCmds(x + em * CXE, y - em * CYE, em * RI2, 13, 'cw')) }),
        })),
      });
      V.WEBFONT_GLYPHS[ID] = hairline();
      // At this tiny size the annulus wall (~0.03mm) is far below the safety inset,
      // so the correctly-carved ring erodes to (almost) nothing. If the counter is
      // mis-flipped positive it becomes a SOLID DISC and the safety inset leaves a
      // fat filled body instead — a flood. So a near-empty fill is the pass signal.
      const out = gen({
        text: 'O', font: 'google:' + ID, fitToFrame: false, fontSize: 8, smoothing: 0,
        fillEnabled: true, fillType: 'hatch', fillDensity: 30, fillAngle: 0,
        bezierOutline: true, jitter: 0, outlineStroke: true,
      });
      const fills = fillsOf(out);
      // Carved: the hairline ring can't hold fill → empty. Flooded (strict eps 0):
      // dozens of hatch lines across the disc body.
      expect(fills.length).toBeLessThanOrEqual(2);
    });
  });
});
