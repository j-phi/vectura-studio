const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const center = (pts) => {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  pts.forEach((p) => { a = Math.min(a, p.x); b = Math.min(b, p.y); c = Math.max(c, p.x); d = Math.max(d, p.y); });
  return { cx: (a + c) / 2, cy: (b + d) / 2 };
};

// Regression: an oval shape stores its bezier outline in path.meta (kind:'shape'
// with `anchors` + `shape` cx/cy). Renderer.tracePath draws the visible curve
// from path.meta.anchors. engine.generate() must translate those anchors by
// posX/posY so the drawn outline tracks the moved shape — otherwise the outline
// renders at the original position while the fill/points move (visible desync).
describe('engine.generate transforms shape meta (anchors + shape) with posX/posY', () => {
  let runtime;
  afterEach(() => { runtime?.cleanup?.(); runtime = null; });

  test('meta.anchors and meta.shape translate by the layer posX/posY', async () => {
    runtime = await loadVecturaRuntime();
    const { window } = runtime;
    const { VectorEngine, Layer } = window.Vectura;

    const engine = new VectorEngine();
    engine.layers = [];

    const cx = 120, cy = 110, r = 50;
    const poly = Array.from({ length: 49 }, (_, i) => {
      const a = (i / 48) * Math.PI * 2;
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    });
    poly[48] = { ...poly[0] };
    poly.meta = {
      kind: 'shape',
      closed: true,
      shape: { type: 'oval', cx, cy, rx: r, ry: r },
      anchors: [
        { x: cx, y: cy - r, in: { x: cx - r, y: cy - r }, out: { x: cx + r, y: cy - r } },
        { x: cx + r, y: cy, in: { x: cx + r, y: cy - r }, out: { x: cx + r, y: cy + r } },
      ],
    };

    const layer = new Layer('oval', 'shape', 'Oval');
    layer.sourcePaths = [poly];
    layer.params = { ...layer.params, posX: 0, posY: 0, scaleX: 1, scaleY: 1, rotation: 0 };
    engine.layers.push(layer);

    const dx = 60, dy = 25;
    layer.params.posX = dx;
    layer.params.posY = dy;
    engine.generate(layer.id);

    const path = layer.paths[0];
    const ptsCenter = center(path);
    // The sampled points must have moved by (dx, dy)
    expect(ptsCenter.cx).toBeCloseTo(cx + dx, 0);
    expect(ptsCenter.cy).toBeCloseTo(cy + dy, 0);

    // The meta the renderer traces from must move in lockstep.
    expect(path.meta.kind).toBe('shape');
    expect(path.meta.shape.cx).toBeCloseTo(cx + dx, 0);
    expect(path.meta.shape.cy).toBeCloseTo(cy + dy, 0);
    expect(path.meta.anchors[0].x).toBeCloseTo(cx + dx, 0);
    expect(path.meta.anchors[0].y).toBeCloseTo(cy - r + dy, 0);
    // Handle points move too
    expect(path.meta.anchors[0].out.x).toBeCloseTo(cx + r + dx, 0);
    expect(path.meta.anchors[0].in.y).toBeCloseTo(cy - r + dy, 0);
  });
});
