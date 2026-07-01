/*
 * M1 foundational seam — per-character `cells` from the layout engines (RGR).
 *
 * Both StrokeFont.layout and GoogleFonts.layout gain an additive `cells` array:
 * one entry PER CHARACTER CELL (including spaces and zero-stroke glyphs), built
 * from the internal per-line advance data. The contract:
 *   cells: [{ sourceIndex, lineIndex, x0, x1, baselineY, advance, isSpace }]
 *   - sourceIndex is the absolute 0-based offset into the RAW input string
 *     (newlines consume an index but produce no cell);
 *   - x1 - x0 === advance, and cells within a line tile contiguously;
 *   - the historical { paths, meta, width, height } keys are unchanged.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Text layout cells (M1 seam)', () => {
  let runtime, V, GF, SF;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    GF = V.GoogleFonts;
    SF = V.StrokeFont;
  });
  afterAll(() => runtime.cleanup());

  const assertContiguous = (cells) => {
    const byLine = new Map();
    for (const c of cells) {
      if (!byLine.has(c.lineIndex)) byLine.set(c.lineIndex, []);
      byLine.get(c.lineIndex).push(c);
    }
    byLine.forEach((line) => {
      line.sort((a, b) => a.x0 - b.x0);
      for (let i = 0; i < line.length; i++) {
        expect(line[i].x1 - line[i].x0).toBeCloseTo(line[i].advance, 6);
        if (i > 0) expect(line[i].x0).toBeCloseTo(line[i - 1].x1, 6);
      }
    });
  };

  describe('StrokeFont.layout', () => {
    test('old return keys are unchanged and cells is additive', () => {
      const out = SF.layout('Ag', { size: 20 });
      expect(Array.isArray(out.paths)).toBe(true);
      expect(Array.isArray(out.meta)).toBe(true);
      expect(Number.isFinite(out.width)).toBe(true);
      expect(Number.isFinite(out.height)).toBe(true);
      expect(out.meta.length).toBe(out.paths.length);
      expect(Array.isArray(out.cells)).toBe(true);
    });

    test('cells are dense over the source string including spaces', () => {
      const str = 'Hi there';
      const out = SF.layout(str, { size: 20 });
      expect(out.cells.length).toBe(str.length); // 8 incl. the space
      out.cells.forEach((c, i) => {
        expect(c.sourceIndex).toBe(i);
        expect(c.lineIndex).toBe(0);
        expect(Number.isFinite(c.baselineY)).toBe(true);
      });
      // The space (index 3 in 'Hi there') is a real, zero-stroke cell.
      const space = out.cells[5];
      expect(out.cells[2].isSpace).toBe(true);
      expect(space.isSpace).toBe(false);
    });

    test('cells tile contiguously per line (no gaps / overlaps)', () => {
      const out = SF.layout('AWAY home', { size: 18 });
      assertContiguous(out.cells);
    });

    test('sourceIndex maps across a multi-line string with \\n', () => {
      const out = SF.layout('AB\nCD', { size: 20 });
      const idx = out.cells.map((c) => c.sourceIndex);
      // 'AB\nCD': A=0 B=1 \n=2 C=3 D=4
      expect(idx).toEqual([0, 1, 3, 4]);
      const lines = out.cells.map((c) => c.lineIndex);
      expect(lines).toEqual([0, 0, 1, 1]);
    });

    // ── Contiguity STRESS matrix (M1 close-out) ────────────────────────────
    // The single most load-bearing invariant of the seam is that cells tile
    // gap-free with x1-x0===advance. Exercise it under every layout knob that
    // perturbs advance/origin, not just the default path.
    test('cells tile contiguously under tracking', () => {
      assertContiguous(SF.layout('AWAY home', { size: 18, tracking: 5 }).cells);
    });

    test('cells tile contiguously under justify-all', () => {
      assertContiguous(SF.layout('AB CD EF', { size: 18, align: 'justify-all', wrapWidth: 200 }).cells);
    });

    test('cells tile contiguously under hScale stretch', () => {
      assertContiguous(SF.layout('AWAY home', { size: 18, hScale: 160 }).cells);
    });

    test('cells tile contiguously under kerning', () => {
      assertContiguous(SF.layout('AWAY home', { size: 18, kerning: 4 }).cells);
    });
  });

  describe('GoogleFonts.layout', () => {
    const ID = '__cells-web__';
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

    test('cells dense over the source string incl. spaces; old keys intact', () => {
      const out = GF.layout('A B', { id: ID, size: 14, align: 'left' });
      expect(Array.isArray(out.paths)).toBe(true);
      expect(Array.isArray(out.meta)).toBe(true);
      expect(Array.isArray(out.cells)).toBe(true);
      expect(out.cells.length).toBe(3); // A, space, B
      expect(out.cells.map((c) => c.sourceIndex)).toEqual([0, 1, 2]);
      expect(out.cells[1].isSpace).toBe(true);
    });

    test('cells tile contiguously per line', () => {
      const out = GF.layout('ABCD', { id: ID, size: 14, align: 'left' });
      assertContiguous(out.cells);
    });

    test('sourceIndex maps across \\n', () => {
      const out = GF.layout('AB\nCD', { id: ID, size: 14, align: 'left' });
      expect(out.cells.map((c) => c.sourceIndex)).toEqual([0, 1, 3, 4]);
      expect(out.cells.map((c) => c.lineIndex)).toEqual([0, 0, 1, 1]);
    });

    test('returns empty cells when the font is unparsed', () => {
      const out = GF.layout('AB', { id: '__no-such-font__', size: 14 });
      expect(out.cells).toEqual([]);
    });
  });
});
