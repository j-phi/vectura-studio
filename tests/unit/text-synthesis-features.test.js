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

    test('fillOffset translates the fill window while the outline stays put', () => {
      const base = fillsOf(fillGen({}));
      const off = fillsOf(fillGen({ fillOffsetX: 0.6, fillOffsetY: -0.4 }));
      expect(base.length).toBeGreaterThan(0);
      expect(JSON.stringify(off)).not.toBe(JSON.stringify(base));
    });
  });
});
