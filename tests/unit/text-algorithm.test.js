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
    // A/V are all-straight glyphs — no curve strokes, so they stay faithful.
    expect(paths.every((p) => p.meta && p.meta.straight === true)).toBe(true);
  });

  test('built-in stroke-font curve strokes render as native béziers, not faceted chords', () => {
    // Regression: bowls/arcs/splines (e.g. the 'o' ellipse) are stored as dense
    // sampled polylines. They must be emitted as native cubic béziers (forceCurves
    // + real handles) so they read as true curves at any size — independent of the
    // layer Curves toggle. Before the fix they were straight chords (visible facets).
    const paths = gen({ text: 'o', font: 'sans', fitToFrame: false, fontSize: 40, curves: false, smoothing: 0 });
    expect(paths.length).toBeGreaterThan(0);
    const curved = paths.filter((pth) => pth.meta && pth.meta.straight === false);
    expect(curved.length).toBeGreaterThan(0);
    curved.forEach((pth) => {
      expect(pth.meta.forceCurves).toBe(true);
      expect(Array.isArray(pth.meta.anchors)).toBe(true);
      // At least one anchor carries a real bezier handle (else the renderer would
      // fall back to drawing straight segments).
      expect(pth.meta.anchors.some((a) => a && (a.in || a.out))).toBe(true);
    });
  });

  test('built-in stroke-font straight strokes stay crisp polylines with curve glyphs present', () => {
    // 'A' and 'V' carry only straight strokes; even though curve glyphs now
    // bezierize by default, the pointed apex/stem strokes must NOT be smoothed
    // (sharp corners preserved). Guards against blanket-smoothing regressions.
    const paths = gen({ text: 'AV', font: 'sans', fitToFrame: false, fontSize: 40, curves: false, smoothing: 0 });
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((pth) => pth.meta && pth.meta.straight === true)).toBe(true);
  });

  test('Vectura is one family with selectable styles + weights', () => {
    const font = V.StrokeFont;
    expect(font.family && font.family.id).toBe('vectura');
    const styleIds = font.styles.map((s) => s.id);
    // The slant/width variants are styles of the one family, not separate fonts.
    ['sans', 'italic', 'condensed', 'wide', 'oblique'].forEach((id) => expect(styleIds).toContain(id));
    expect(font.weights.map((w) => w.label)).toEqual(['Regular', 'Medium', 'Semibold', 'Bold']);
    // Heavier weights add pen passes; Regular adds none.
    expect(font.weightPasses('Regular')).toBe(0);
    expect(font.weightPasses('Bold')).toBeGreaterThan(font.weightPasses('Semibold'));
    expect(font.weightPasses('Semibold')).toBeGreaterThan(font.weightPasses('Medium'));
  });

  test('built-in Bold weight wraps extra pen passes per stroke (thicker than Regular)', () => {
    const base = { text: 'VECTURA', font: 'wide', fitToFrame: true, outlineStroke: true, outlineThickness: 1 };
    const reg = gen({ ...base, fontWeight: 'Regular' });
    const bold = gen({ ...base, fontWeight: 'Bold' });
    // Each stroke is re-drawn as several parallel offset passes → many more paths.
    expect(bold.length).toBeGreaterThan(reg.length * 3);
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

  describe('Curves convert corners to bezier handles scaled by Smoothing', () => {
    const hasHandles = (p) =>
      Array.isArray(p.meta && p.meta.anchors)
      && p.meta.anchors.some((a) => a && (a.in || a.out));

    test('curves ON + smoothing 0 is a no-op vs Curves OFF (toggle adds nothing)', () => {
      const off = gen({ text: 'VECTURA', curves: false, smoothing: 0 });
      const on0 = gen({ text: 'VECTURA', curves: true, smoothing: 0 });
      // The Curves toggle at Smoothing 0 changes NO geometry: built-in font curve
      // strokes (the C/R/U bowls & arcs) already bezierize by default, and the
      // straight stem/serif/diagonal strokes stay sharp regardless of the toggle.
      expect(JSON.stringify(on0)).toBe(JSON.stringify(off));
      // The straight strokes remain faithful polylines with no bezier handles.
      const straight = on0.filter((p) => p.meta && p.meta.straight === true);
      expect(straight.length).toBeGreaterThan(0);
      expect(straight.some(hasHandles)).toBe(false);
    });

    test('curves ON + smoothing 1 widens handles into real bezier curves', () => {
      const on1 = gen({ text: 'VECTURA', curves: true, smoothing: 1 });
      // At least the multi-corner glyph strokes now carry cubic handles.
      const curved = on1.filter(hasHandles);
      expect(curved.length).toBeGreaterThan(0);
      curved.forEach((p) => {
        expect(p.meta.straight).toBe(false);
        expect(p.meta.forceCurves).toBe(true);
      });
    });

    test('larger smoothing produces wider handles than smaller smoothing', () => {
      const reach = (paths) => {
        let sum = 0;
        let count = 0;
        for (const p of paths) {
          const anchors = p.meta && p.meta.anchors;
          if (!Array.isArray(anchors)) continue;
          for (const a of anchors) {
            if (a && a.out) {
              sum += Math.hypot(a.out.x - a.x, a.out.y - a.y);
              count += 1;
            }
          }
        }
        return count ? sum / count : 0;
      };
      const small = reach(gen({ text: 'VECTURA', curves: true, smoothing: 0.3 }));
      const large = reach(gen({ text: 'VECTURA', curves: true, smoothing: 1 }));
      expect(large).toBeGreaterThan(small);
    });
  });
});
