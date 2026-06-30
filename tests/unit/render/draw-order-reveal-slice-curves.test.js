const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

// The draw-order slider truncates the path the plot cutoff lands inside by arc
// length (Renderer.sliceRevealPath). Native-cubic paths (text Bézier outlines,
// morph rings) carry meta.anchors + meta.forceCurves so tracePath renders them
// as complete bezierCurveTo runs — which would IGNORE the truncation and pop the
// whole glyph in the instant the pen reaches it, while the straight glyphs beside
// it reveal progressively. The slice must therefore drop those native-cubic
// handles so every glyph reveals in lock-step as the flattened polyline it is.
describe('Renderer.sliceRevealPath — draw-order truncation of curved paths', () => {
  let runtime;
  let sliceRevealPath;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    sliceRevealPath = runtime.window.Vectura.Renderer.sliceRevealPath;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  // A dense horizontal polyline (flattened curve) carrying native-cubic meta.
  const curvyPath = () => {
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push({ x: i, y: 0 });
    pts.meta = {
      algorithm: 'text',
      straight: false,
      closed: true,
      forceCurves: true,
      anchors: [{ x: 0, y: 0, in: null, out: { x: 1, y: 1 } }, { x: 10, y: 0, in: { x: 9, y: 1 }, out: null }],
    };
    return pts;
  };

  it('truncates by arc length, interpolating the cutoff segment', () => {
    const sliced = sliceRevealPath(curvyPath(), 3.5);
    expect(sliced).not.toBeNull();
    // points 0..3 kept, plus the interpolated cutoff at x=3.5
    expect(sliced[sliced.length - 1].x).toBeCloseTo(3.5);
    expect(sliced.length).toBe(5);
  });

  it('drops native-cubic handles (anchors + forceCurves) on the truncated slice', () => {
    const sliced = sliceRevealPath(curvyPath(), 3.5);
    expect(sliced.meta).toBeDefined();
    expect(sliced.meta.anchors).toBeUndefined();
    expect(sliced.meta.forceCurves).toBeUndefined();
    // unrelated meta survives so pen routing / dedupe still work
    expect(sliced.meta.algorithm).toBe('text');
  });

  it('does not mutate the source path meta (copy, not in-place delete)', () => {
    const src = curvyPath();
    sliceRevealPath(src, 3.5);
    expect(Array.isArray(src.meta.anchors)).toBe(true);
    expect(src.meta.forceCurves).toBe(true);
  });

  it('returns null when the slice would be shorter than a drawable segment', () => {
    expect(sliceRevealPath(curvyPath(), 0)).toBeNull();
  });
});
