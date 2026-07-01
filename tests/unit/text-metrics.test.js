/*
 * M1 foundational seam — Vectura.TextMetrics (pure, DOM-free) (RGR).
 *
 * Operates on WORLD-space `layer.glyphs` (cells projected to display space as
 * quads). Quad corner order is [topLeft, topRight, bottomRight, bottomLeft].
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('TextMetrics (M1 seam)', () => {
  let runtime, TM;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    TM = runtime.window.Vectura.TextMetrics;
  });
  afterAll(() => runtime.cleanup());

  // Two contiguous axis-aligned cells: [0,10] and [10,20] in x, [0,20] in y.
  const glyphs = [
    { sourceIndex: 0, lineIndex: 0, isSpace: false, quad: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }] },
    { sourceIndex: 1, lineIndex: 0, isSpace: false, quad: [{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 10, y: 20 }] },
  ];

  test('TextMetrics is registered on Vectura', () => {
    expect(TM).toBeTruthy();
    expect(typeof TM.pointToCaretIndex).toBe('function');
    expect(typeof TM.caretIndexToWorldSegment).toBe('function');
    expect(typeof TM.wordRangeAt).toBe('function');
    expect(typeof TM.paragraphRangeAt).toBe('function');
  });

  describe('pointToCaretIndex', () => {
    test('before the cell midpoint → caret BEFORE the cell', () => {
      const r = TM.pointToCaretIndex(glyphs, 3, 10);
      expect(r.sourceIndex).toBe(0);
      expect(r.caretIndex).toBe(0);
    });
    test('past the cell midpoint → caret AFTER the cell', () => {
      const r = TM.pointToCaretIndex(glyphs, 7, 10);
      expect(r.caretIndex).toBe(1);
    });
    test('past the last cell → caret at end', () => {
      const r = TM.pointToCaretIndex(glyphs, 100, 10);
      expect(r.caretIndex).toBe(2);
    });
    test('empty glyphs → caretIndex 0', () => {
      const r = TM.pointToCaretIndex([], 5, 5);
      expect(r.caretIndex).toBe(0);
    });
  });

  describe('caretIndexToWorldSegment', () => {
    test('caret at index 0 sits on the left edge of cell 0', () => {
      const s = TM.caretIndexToWorldSegment(glyphs, 0);
      expect(s.x0).toBeCloseTo(0, 6);
      expect(s.x1).toBeCloseTo(0, 6);
      expect(s.y0).toBeCloseTo(0, 6);
      expect(s.y1).toBeCloseTo(20, 6);
    });
    test('caret at end sits on the right edge of the last cell', () => {
      const s = TM.caretIndexToWorldSegment(glyphs, 2);
      expect(s.x0).toBeCloseTo(20, 6);
      expect(s.x1).toBeCloseTo(20, 6);
    });
    test('round-trips with pointToCaretIndex (stable)', () => {
      const s = TM.caretIndexToWorldSegment(glyphs, 1);
      const midY = (s.y0 + s.y1) / 2;
      const r = TM.pointToCaretIndex(glyphs, s.x0 + 1e-3, midY);
      expect(r.caretIndex).toBe(1);
    });
    test('empty glyphs → null', () => {
      expect(TM.caretIndexToWorldSegment([], 0)).toBeNull();
    });
  });

  describe('wordRangeAt / paragraphRangeAt', () => {
    test('wordRangeAt selects the whitespace-delimited word', () => {
      expect(TM.wordRangeAt('hello world', 1)).toEqual({ start: 0, end: 5 });
      expect(TM.wordRangeAt('hello world', 8)).toEqual({ start: 6, end: 11 });
    });
    test('wordRangeAt works across newlines', () => {
      const t = 'foo\nbar baz';
      expect(TM.wordRangeAt(t, 9)).toEqual({ start: 8, end: 11 });
    });
    test('paragraphRangeAt finds \\n boundaries', () => {
      expect(TM.paragraphRangeAt('ab\ncd', 4)).toEqual({ start: 3, end: 5 });
      expect(TM.paragraphRangeAt('ab\ncd', 1)).toEqual({ start: 0, end: 2 });
    });
    test('paragraphRangeAt on a multiline middle paragraph', () => {
      const t = 'aa\nbbb\ncccc';
      expect(TM.paragraphRangeAt(t, 4)).toEqual({ start: 3, end: 6 });
    });
  });
});
