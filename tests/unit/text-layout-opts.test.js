/*
 * Unit A — FONT LAYOUT ENGINE opts (RGR coverage).
 *
 * Vectura.StrokeFont.layout (built-in monoline) and Vectura.GoogleFonts.layout
 * (web outline) gain ~20 optional typographic opts plus an index-aligned `meta`
 * array. The contract:
 *   - every new opt DEFAULTS to a no-op: with none set the paths/width/height are
 *     byte-identical to the historical output (only the additive `meta` appears);
 *   - layout() returns a parallel `meta` array, meta[i] describing the glyph that
 *     produced paths[i]: { glyphIndex, charIndex, lineIndex, baselineY, x0, x1 };
 *   - vScale/hScale scale glyph geometry about the glyph baseline origin; kerning
 *     adds to every advance; baselineShift raises the block; indents/spacing/
 *     justify operate per line/paragraph; smallCaps/super/subscript are synthesized;
 *     built-in faces ignore all OpenType opts (and never throw).
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const bbox = (paths) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of paths) for (const pt of p) {
    if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
};

describe('Text layout opts (Unit A — font layout engine)', () => {
  let runtime, V, GF, SF;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    GF = V.GoogleFonts;
    SF = V.StrokeFont;
  });
  afterAll(() => runtime.cleanup());

  // ── Built-in stroke font ─────────────────────────────────────────────────
  describe('StrokeFont.layout', () => {
    test('default-unset output is unchanged and meta is index-aligned', () => {
      const out = SF.layout('Ag', { size: 20 });
      expect(Array.isArray(out.paths)).toBe(true);
      expect(out.paths.length).toBeGreaterThan(0);
      expect(Array.isArray(out.meta)).toBe(true);
      expect(out.meta.length).toBe(out.paths.length);
      out.meta.forEach((m) => {
        expect(Number.isFinite(m.glyphIndex)).toBe(true);
        expect(Number.isFinite(m.charIndex)).toBe(true);
        expect(m.lineIndex).toBe(0);
        expect(Number.isFinite(m.baselineY)).toBe(true);
        expect(Number.isFinite(m.x0)).toBe(true);
        expect(Number.isFinite(m.x1)).toBe(true);
        expect(m.x1).toBeGreaterThanOrEqual(m.x0);
      });
    });

    test('meta lineIndex tracks line breaks; baselineY grows per line', () => {
      const out = SF.layout('A\nB', { size: 20 });
      const lines = [...new Set(out.meta.map((m) => m.lineIndex))].sort();
      expect(lines).toEqual([0, 1]);
      const b0 = out.meta.find((m) => m.lineIndex === 0).baselineY;
      const b1 = out.meta.find((m) => m.lineIndex === 1).baselineY;
      expect(b1).toBeGreaterThan(b0);
    });

    test('vScale stretches glyph height about the baseline', () => {
      const base = bbox(SF.layout('A', { size: 20 }).paths);
      const tall = bbox(SF.layout('A', { size: 20, vScale: 200 }).paths);
      expect(tall.h).toBeGreaterThan(base.h * 1.8);
      // about the baseline → bottom (baseline) stays put, top rises
      expect(tall.maxY).toBeCloseTo(base.maxY, 3);
      expect(tall.minY).toBeLessThan(base.minY);
    });

    test('hScale widens glyph geometry and advance', () => {
      const base = SF.layout('AB', { size: 20 });
      const wide = SF.layout('AB', { size: 20, hScale: 200 });
      expect(wide.width).toBeGreaterThan(base.width * 1.8);
      expect(bbox(wide.paths).w).toBeGreaterThan(bbox(base.paths).w * 1.8);
    });

    test('per-pair kern widens ONLY the targeted gap (built-in)', () => {
      const x0 = (r, si) => r.cells.find((c) => c.sourceIndex === si).x0;
      const base = SF.layout('AAA', { size: 20 });
      const g1 = SF.layout('AAA', { size: 20, kernPairs: { 1: 6 } }); // gap A0|A1
      const g2 = SF.layout('AAA', { size: 20, kernPairs: { 2: 6 } }); // gap A1|A2
      const both = SF.layout('AAA', { size: 20, kernPairs: { 1: 6, 2: 6 } });
      // Gap 1 shifts A1 and A2 right; A0 stays put.
      expect(x0(g1, 0)).toBeCloseTo(x0(base, 0), 6);
      expect(x0(g1, 1)).toBeGreaterThan(x0(base, 1));
      expect(x0(g1, 2)).toBeGreaterThan(x0(base, 2));
      // Gap 2 shifts ONLY A2; A1 unchanged — proves it is not global.
      expect(x0(g2, 1)).toBeCloseTo(x0(base, 1), 6);
      expect(x0(g2, 2)).toBeGreaterThan(x0(base, 2));
      // Width grows per applied gap.
      expect(g1.width).toBeGreaterThan(base.width);
      expect(both.width).toBeGreaterThan(g1.width);
    });

    test('the removed global `kerning` opt no longer affects layout (built-in)', () => {
      const base = SF.layout('AAA', { size: 20 });
      const legacy = SF.layout('AAA', { size: 20, kerning: 6 });
      expect(legacy.width).toBeCloseTo(base.width, 6);
    });

    test('baselineShift raises the whole block (mm)', () => {
      const base = bbox(SF.layout('A', { size: 20 }).paths);
      const up = bbox(SF.layout('A', { size: 20, baselineShift: 5 }).paths);
      expect(up.minY).toBeCloseTo(base.minY - 5, 3);
      expect(up.maxY).toBeCloseTo(base.maxY - 5, 3);
    });

    test('indentLeft shifts every line right; indentFirst only the paragraph head', () => {
      const base = bbox(SF.layout('A\nA', { size: 20, align: 'left' }).paths);
      const ind = bbox(SF.layout('A\nA', { size: 20, align: 'left', indentLeft: 10 }).paths);
      expect(ind.minX).toBeCloseTo(base.minX + 10, 2);

      const out = SF.layout('A\nA', { size: 20, align: 'left', indentFirst: 12 });
      const x0line0 = Math.min(...out.meta.filter((m) => m.lineIndex === 0).map((m) => m.x0));
      const x0line1 = Math.min(...out.meta.filter((m) => m.lineIndex === 1).map((m) => m.x0));
      expect(x0line0).toBeGreaterThan(x0line1 + 5);
    });

    test('spaceBefore/spaceAfter add vertical gap between paragraphs', () => {
      const tight = bbox(SF.layout('A\n\nB', { size: 20 }).paths);
      const spaced = bbox(SF.layout('A\n\nB', { size: 20, spaceBefore: 8, spaceAfter: 8 }).paths);
      expect(spaced.h).toBeGreaterThan(tight.h + 5);
    });

    test('justify-left stretches inner lines to the column but leaves the last line', () => {
      const opt = { size: 16, align: 'justify-left' };
      const out = SF.layout('A A A A\nA A', opt);
      const line0 = out.meta.filter((m) => m.lineIndex === 0);
      const line1 = out.meta.filter((m) => m.lineIndex === 1);
      const w0 = Math.max(...line0.map((m) => m.x1)) - Math.min(...line0.map((m) => m.x0));
      const w1 = Math.max(...line1.map((m) => m.x1)) - Math.min(...line1.map((m) => m.x0));
      // line 0 (not last) fills the full column; line 1 (last) keeps natural width
      const ragged = SF.layout('A A A A\nA A', { size: 16, align: 'left' });
      const r1 = ragged.meta.filter((m) => m.lineIndex === 1);
      const rw1 = Math.max(...r1.map((m) => m.x1)) - Math.min(...r1.map((m) => m.x0));
      expect(w0).toBeGreaterThan(w1 + 5);
      expect(w1).toBeCloseTo(rw1, 1); // last line unchanged vs ragged-left
    });

    test('justify-all also stretches the final line', () => {
      const all = SF.layout('A A A A\nA A', { size: 16, align: 'justify-all' });
      const left = SF.layout('A A A A\nA A', { size: 16, align: 'left' });
      const lastAll = all.meta.filter((m) => m.lineIndex === 1);
      const lastLeft = left.meta.filter((m) => m.lineIndex === 1);
      const wAll = Math.max(...lastAll.map((m) => m.x1)) - Math.min(...lastAll.map((m) => m.x0));
      const wLeft = Math.max(...lastLeft.map((m) => m.x1)) - Math.min(...lastLeft.map((m) => m.x0));
      expect(wAll).toBeGreaterThan(wLeft + 5);
    });

    test('smallCaps renders lowercase as the (taller) uppercase letterform', () => {
      const lower = bbox(SF.layout('a', { size: 20 }).paths);
      const sc = bbox(SF.layout('a', { size: 20, smallCaps: true }).paths);
      // x-height 'a' is shorter than a scaled cap 'A'
      expect(sc.h).toBeGreaterThan(lower.h * 1.2);
    });

    test('superscript raises and shrinks; subscript lowers and shrinks', () => {
      const norm = bbox(SF.layout('A', { size: 20 }).paths);
      const sup = bbox(SF.layout('A', { size: 20, superscript: true }).paths);
      const sub = bbox(SF.layout('A', { size: 20, subscript: true }).paths);
      const cy = (b) => (b.minY + b.maxY) / 2;
      expect(sup.h).toBeLessThan(norm.h); // smaller
      expect(sub.h).toBeLessThan(norm.h);
      expect(cy(sup)).toBeLessThan(cy(norm)); // raised
      expect(cy(sub)).toBeGreaterThan(cy(norm)); // lowered
    });

    test('built-in faces ignore all OpenType opts and never throw', () => {
      const plain = SF.layout('Affix', { size: 20 });
      let withOt;
      expect(() => {
        withOt = SF.layout('Affix', {
          size: 20, otLigatures: false, otContextual: true, otDiscretionary: true,
          otSwash: true, otStylistic: true, otFractions: true, otFigures: 'oldstyle',
          otPosition: 'super',
        });
      }).not.toThrow();
      expect(JSON.stringify(withOt.paths)).toBe(JSON.stringify(plain.paths));
    });

    test('fontWeight is accepted and ignored by the built-in face', () => {
      const a = SF.layout('A', { size: 20 });
      const b = SF.layout('A', { size: 20, fontWeight: 'Bold' });
      expect(JSON.stringify(b.paths)).toBe(JSON.stringify(a.paths));
    });
  });

  // ── Web outline font (synthetic parsed font) ─────────────────────────────
  describe('GoogleFonts.layout', () => {
    const ID = '__layout-opts-web__';
    // Square glyph: spans x[0,0.4em] y[-0.5em,0] relative to the pen/baseline.
    const makeFont = () => ({
      unitsPerEm: 1000,
      tables: { os2: { sCapHeight: 700 } },
      getKerningValue: () => 0,
      stringToGlyphs: (s) => Array.from(String(s)).map((ch) => ({
        unicode: ch.charCodeAt(0),
        advanceWidth: 500,
        getPath: (x, y, em) => ({ commands: [
          { type: 'M', x, y: y - em * 0.5 },
          { type: 'L', x: x + em * 0.4, y: y - em * 0.5 },
          { type: 'L', x: x + em * 0.4, y },
          { type: 'L', x, y },
          { type: 'Z' },
        ] }),
      })),
    });
    beforeEach(() => { V.WEBFONT_GLYPHS[ID] = makeFont(); });
    afterEach(() => { delete V.WEBFONT_GLYPHS[ID]; });

    test('default-unset output unchanged and meta index-aligned', () => {
      const out = GF.layout('AB', { id: ID, size: 14, align: 'left' });
      expect(out.paths.length).toBe(2);
      expect(out.width).toBeCloseTo(20, 5);
      expect(Array.isArray(out.meta)).toBe(true);
      expect(out.meta.length).toBe(out.paths.length);
      out.meta.forEach((m) => {
        expect(Number.isFinite(m.glyphIndex)).toBe(true);
        expect(Number.isFinite(m.baselineY)).toBe(true);
        expect(m.x1).toBeGreaterThan(m.x0);
        expect(m.lineIndex).toBe(0);
      });
    });

    test('vScale scales contour height about the baseline', () => {
      const base = bbox(GF.layout('A', { id: ID, size: 14 }).paths);
      const tall = bbox(GF.layout('A', { id: ID, size: 14, vScale: 200 }).paths);
      expect(tall.h).toBeGreaterThan(base.h * 1.8);
      expect(tall.maxY).toBeCloseTo(base.maxY, 3); // baseline fixed
    });

    test('hScale scales contour width and advance', () => {
      const base = GF.layout('AB', { id: ID, size: 14 });
      const wide = GF.layout('AB', { id: ID, size: 14, hScale: 200 });
      expect(wide.width).toBeGreaterThan(base.width * 1.8);
    });

    test('per-pair kern widens ONLY the targeted gap (web)', () => {
      const x0 = (r, si) => r.cells.find((c) => c.sourceIndex === si).x0;
      const base = GF.layout('AAA', { id: ID, size: 14 });
      const g1 = GF.layout('AAA', { id: ID, size: 14, kernPairs: { 1: 4 } });
      const both = GF.layout('AAA', { id: ID, size: 14, kernPairs: { 1: 4, 2: 4 } });
      expect(x0(g1, 0)).toBeCloseTo(x0(base, 0), 6);
      expect(x0(g1, 2)).toBeGreaterThan(x0(base, 2));
      expect(g1.width).toBeGreaterThan(base.width);
      expect(both.width).toBeGreaterThan(g1.width);
    });

    test('the removed global `kerning` opt no longer affects the web layout', () => {
      const base = GF.layout('AAA', { id: ID, size: 14 });
      const legacy = GF.layout('AAA', { id: ID, size: 14, kerning: 4 });
      expect(legacy.width).toBeCloseTo(base.width, 6);
    });

    test('baselineShift raises the block (mm)', () => {
      const base = bbox(GF.layout('A', { id: ID, size: 14 }).paths);
      const up = bbox(GF.layout('A', { id: ID, size: 14, baselineShift: 5 }).paths);
      expect(up.minY).toBeCloseTo(base.minY - 5, 3);
    });

    test('indentLeft shifts the line right', () => {
      const base = bbox(GF.layout('A', { id: ID, size: 14, align: 'left' }).paths);
      const ind = bbox(GF.layout('A', { id: ID, size: 14, align: 'left', indentLeft: 8 }).paths);
      expect(ind.minX).toBeCloseTo(base.minX + 8, 2);
    });

    test('justify-left stretches inner line, leaves the last', () => {
      const out = GF.layout('A A A\nA A', { id: ID, size: 14, align: 'justify-left' });
      const w = (li) => {
        const m = out.meta.filter((x) => x.lineIndex === li);
        return Math.max(...m.map((x) => x.x1)) - Math.min(...m.map((x) => x.x0));
      };
      expect(w(0)).toBeGreaterThan(w(1) + 2);
    });

    test('smallCaps shrinks glyph geometry (synthesized)', () => {
      const base = bbox(GF.layout('a', { id: ID, size: 14 }).paths);
      const sc = bbox(GF.layout('a', { id: ID, size: 14, smallCaps: true }).paths);
      expect(sc.h).toBeLessThan(base.h);
    });

    test('superscript raises and shrinks; subscript lowers and shrinks', () => {
      const norm = bbox(GF.layout('A', { id: ID, size: 14 }).paths);
      const sup = bbox(GF.layout('A', { id: ID, size: 14, superscript: true }).paths);
      const sub = bbox(GF.layout('A', { id: ID, size: 14, subscript: true }).paths);
      const cy = (b) => (b.minY + b.maxY) / 2;
      expect(sup.h).toBeLessThan(norm.h);
      expect(cy(sup)).toBeLessThan(cy(norm));
      expect(cy(sub)).toBeGreaterThan(cy(norm));
    });

    test('OpenType opts are accepted and never throw (synthetic font)', () => {
      expect(() => GF.layout('Affix 1/2', {
        id: ID, size: 14, otLigatures: false, otContextual: true, otDiscretionary: true,
        otFractions: true, otFigures: 'tabular', otPosition: 'sub',
      })).not.toThrow();
    });

    test('fontWeight falls back to the base face when no weighted face is parsed', () => {
      const a = GF.layout('A', { id: ID, size: 14 });
      const b = GF.layout('A', { id: ID, size: 14, fontWeight: 'Bold' });
      // no parsed bold face exists → identical geometry (graceful fallback)
      expect(JSON.stringify(b.paths)).toBe(JSON.stringify(a.paths));
    });
  });
});
