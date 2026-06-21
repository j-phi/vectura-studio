/*
 * Text algorithm + single-line stroke font (RGR coverage).
 *
 * The Text algorithm sets a string in window.Vectura.StrokeFont and fits it to the
 * document frame as single-stroke, pen-ready polylines. These tests pin the font's
 * glyph coverage and the algorithm's layout / fit / determinism contract.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Text algorithm + stroke font', () => {
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

  test('stroke font covers the printable ASCII set as single-stroke polylines', () => {
    const font = V.StrokeFont;
    expect(font).toBeTruthy();
    const set = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,:;!?\'"-()/+=';
    for (const ch of set) {
      expect(font.has(ch)).toBe(true);
      const g = font.glyph(ch);
      expect(g).toBeTruthy();
      // Every stroke is an open polyline of [x,y] points (space is the lone empty).
      g.s.forEach((stroke) => expect(stroke.length).toBeGreaterThanOrEqual(2));
    }
    // A space advances the pen but draws nothing.
    expect(font.glyph(' ').s.length).toBe(0);
  });

  test('renders glyph strokes for a non-empty string', () => {
    const paths = gen({ text: 'AV', fitToFrame: false, fontSize: 40 });
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((p) => expect(p.length).toBeGreaterThanOrEqual(2));
    // Letterforms stay faithful (no curve smoothing) unless Curves is on.
    expect(paths.every((p) => p.meta && p.meta.straight === true)).toBe(true);
  });

  test('empty / whitespace text yields nothing to plot', () => {
    expect(gen({ text: '' }).length).toBe(0);
    expect(gen({ text: '   \n  ' }).length).toBe(0);
  });

  test('fit-to-frame scales the block inside the display area and centres it', () => {
    const paths = gen({ text: 'VECTURA', fitToFrame: true, fillRatio: 0.9 });
    const b = bbox(paths);
    // Inside the margins.
    expect(b.minX).toBeGreaterThanOrEqual(bounds.m - 1);
    expect(b.maxX).toBeLessThanOrEqual(bounds.m + bounds.dW + 1);
    expect(b.minY).toBeGreaterThanOrEqual(bounds.m - 1);
    expect(b.maxY).toBeLessThanOrEqual(bounds.m + bounds.dH + 1);
    // Centred on the display centre.
    const cx = bounds.m + bounds.dW / 2;
    const cy = bounds.m + bounds.dH / 2;
    expect(Math.abs((b.minX + b.maxX) / 2 - cx)).toBeLessThan(1);
    expect(Math.abs((b.minY + b.maxY) / 2 - cy)).toBeLessThan(1);
  });

  test('multi-line text stacks lines (taller block than a single line)', () => {
    const one = bbox(gen({ text: 'AB', fitToFrame: false, fontSize: 30 }));
    const two = bbox(gen({ text: 'AB\nAB', fitToFrame: false, fontSize: 30 }));
    expect(two.h).toBeGreaterThan(one.h * 1.5);
  });

  test('is deterministic for fixed params (and jitter is seed-stable)', () => {
    const a = gen({ text: 'Hello', jitter: 1.5 });
    const b = gen({ text: 'Hello', jitter: 1.5 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
