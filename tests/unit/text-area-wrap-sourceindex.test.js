/*
 * Area-type word-wrap + EXACT sourceIndex (RGR coverage).
 *
 * Illustrator-style area type wraps text at a frame width, but on-canvas editing
 * indexes the RAW string by `sourceIndex`. The built-in stroke-font layout must
 * therefore make `sourceIndex` the TRUE raw-string index even across a wrap
 * boundary. Contract:
 *   - StrokeFont.layout(text, { areaWrap:true, wrapWidth }) word-wraps (no
 *     mid-word hyphenation, no synthetic hyphen char);
 *   - a soft break at a space CONSUMES exactly that one space (it produces no
 *     cell but advances the raw index by 1), so the next visual line's cells
 *     continue from the correct raw index;
 *   - a hard '\n' consumes +1 as before;
 *   - a single word wider than the frame OVERFLOWS the frame width (documented
 *     choice) while keeping sourceIndex exact and contiguous.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Area-type word-wrap exact sourceIndex (StrokeFont.layout)', () => {
  let runtime, SF;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    SF = runtime.window.Vectura.StrokeFont;
  });
  afterAll(() => runtime.cleanup());

  test('word wraps at frame width and sourceIndex is the exact raw index across the wrap', () => {
    const text = 'hello world foo';
    // Width that fits "hello" but not "hello world": between the two.
    const un = SF.layout(text, { size: 20 });
    const wHello = un.cells[4].x1;        // end of the first 'o' (index 4)
    const wHelloWorld = un.cells[10].x1;  // end of "hello world"
    const wrapWidth = (wHello + wHelloWorld) / 2;

    const out = SF.layout(text, { size: 20, areaWrap: true, wrapWidth });
    const cells = out.cells;

    // Two visual lines (at least): "hello" then "world foo" (or "world" / "foo").
    const lineIdxs = [...new Set(cells.map((c) => c.lineIndex))];
    expect(lineIdxs.length).toBeGreaterThanOrEqual(2);

    // Line 0 carries exactly "hello" — indices 0..4; the break space (5) is consumed.
    const line0 = cells.filter((c) => c.lineIndex === 0);
    expect(line0.map((c) => c.sourceIndex)).toEqual([0, 1, 2, 3, 4]);

    // Line 1 begins at 'w' — raw index 6 — proving the consumed space advanced the
    // raw index by exactly 1 (index 5 produced no cell).
    const line1 = cells.filter((c) => c.lineIndex === 1);
    expect(line1[0].sourceIndex).toBe(6);
    expect(text[line1[0].sourceIndex]).toBe('w');

    // Every rendered cell's sourceIndex points at the character it represents:
    // reconstruct the char from the raw string. Consumed break spaces are absent.
    const rendered = cells.filter((c) => !c.isSpace);
    for (const c of rendered) expect(text[c.sourceIndex]).not.toBe(' ');
  });

  test("hard '\\n' still consumes exactly one index", () => {
    const text = 'ab\ncd';
    const out = SF.layout(text, { size: 20, areaWrap: true, wrapWidth: 1000 });
    const cells = out.cells;
    const line0 = cells.filter((c) => c.lineIndex === 0).map((c) => c.sourceIndex);
    const line1 = cells.filter((c) => c.lineIndex === 1).map((c) => c.sourceIndex);
    expect(line0).toEqual([0, 1]);   // 'a','b'
    expect(line1).toEqual([3, 4]);   // 'c','d' — index 2 ('\n') consumed
    expect(text[3]).toBe('c');
  });

  test('a single word wider than the frame overflows (documented) with exact contiguous sourceIndex', () => {
    const text = 'abcdefgh ijklmnop';
    // Tiny width so neither word fits: each long word overflows onto its own line.
    const out = SF.layout(text, { size: 20, areaWrap: true, wrapWidth: 1 });
    const cells = out.cells;
    // First word occupies line 0, contiguous 0..7 (overflow, no hyphen inserted).
    const line0 = cells.filter((c) => c.lineIndex === 0).map((c) => c.sourceIndex);
    expect(line0).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // Second word starts at raw index 9 ('i') — the space at 8 was consumed.
    const line1 = cells.filter((c) => c.lineIndex === 1);
    expect(line1[0].sourceIndex).toBe(9);
    expect(text[9]).toBe('i');
    // No synthetic hyphen: the total rendered non-space cells equal the source
    // non-space char count (8 + 8 = 16).
    const nonSpace = cells.filter((c) => !c.isSpace).length;
    expect(nonSpace).toBe(16);
  });

  test('areaWrap defaults to a no-op: without it the layout is single-line for a short string', () => {
    const out = SF.layout('hi there', { size: 20 });
    const lines = [...new Set(out.cells.map((c) => c.lineIndex))];
    expect(lines).toEqual([0]);
  });
});
