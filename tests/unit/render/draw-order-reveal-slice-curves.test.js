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

  const arcLength = (arr) => {
    let s = 0;
    for (let i = 1; i < arr.length; i++) s += Math.hypot(arr[i].x - arr[i - 1].x, arr[i].y - arr[i - 1].y);
    return s;
  };

  it('truncates by arc length along the densely-flattened curve', () => {
    const sliced = sliceRevealPath(curvyPath(), 3.5);
    expect(sliced).not.toBeNull();
    // A path carrying real bezier handles is first densely flattened into the
    // exact polyline tracePath would render (so the cyan draw-order tip matches
    // the smooth displayed curve — no faceting), THEN truncated by arc length.
    // The returned slice therefore measures ~3.5 units of the SMOOTH curve, not
    // of the raw chord cache, and is a dense polyline tagged straight.
    expect(arcLength(sliced)).toBeCloseTo(3.5, 2);
    expect(sliced.length).toBeGreaterThanOrEqual(2);
    expect(sliced.meta.straight).toBe(true);
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
