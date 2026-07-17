const { loadVecturaRuntime } = require('../../helpers/load-vectura-runtime');

// REGRESSION: single-stroke algorithms (Pendula/Harmonograph, Attractor) emit
// their entire drawing as ONE optimized path. The Draw-Order overlay gradient
// used to key its colour purely on a path's INDEX among sibling optimized
// paths (index/total), gated behind `overlayItems.length > 1` — so a layer
// with exactly one (however long) optimized path always fell back to a flat
// single colour and never reached the gradient's far ("blue") stop. Multi-path
// algorithms (flowfield, boids, hyphae — hundreds/thousands of short strokes)
// were unaffected, which is why the bug looked algorithm-specific rather than
// universal. Renderer.buildLineSortGradientChunks fixes this by chunking each
// path by POINT COUNT so the gradient sweeps across a single long path too.
describe('Renderer.buildLineSortGradientChunks — draw-order gradient spans single long paths', () => {
  let runtime;
  let buildLineSortGradientChunks;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeRenderer: true });
    buildLineSortGradientChunks = runtime.window.Vectura.Renderer.buildLineSortGradientChunks;
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const longPath = (n) => {
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push({ x: i, y: 0 });
    return pts;
  };

  it('is exposed on Renderer', () => {
    expect(typeof buildLineSortGradientChunks).toBe('function');
  });

  it('splits a single long path (e.g. a 6000-point harmonograph/attractor trace) into multiple gradient stops', () => {
    const items = [{ id: 'only', path: longPath(6000) }];
    const chunks = buildLineSortGradientChunks(items);
    expect(chunks.length).toBeGreaterThan(1);
    const ts = chunks.map((c) => c.t);
    expect(Math.min(...ts)).toBeLessThan(0.05);
    expect(Math.max(...ts)).toBeGreaterThan(0.95);
    // Every chunk keeps whatever extra fields the caller attached (e.g. the
    // originating layer) so the overlay can still draw with the right pen/temp.
    chunks.forEach((c) => expect(c.id).toBe('only'));
  });

  it('leaves short multi-path layers effectively unchanged (one chunk per path)', () => {
    const items = [
      { id: 'a', path: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
      { id: 'b', path: [{ x: 0, y: 1 }, { x: 1, y: 1 }] },
      { id: 'c', path: [{ x: 0, y: 2 }, { x: 1, y: 2 }] },
    ];
    const chunks = buildLineSortGradientChunks(items);
    expect(chunks.length).toBe(3);
    expect(chunks[0].t).toBeLessThan(chunks[1].t);
    expect(chunks[1].t).toBeLessThan(chunks[2].t);
  });

  it('does not chunk circle points (left whole)', () => {
    const circle = [];
    circle.meta = { kind: 'circle', cx: 0, cy: 0, r: 1 };
    const items = [{ id: 'circle', path: circle }];
    const chunks = buildLineSortGradientChunks(items);
    expect(chunks.length).toBe(1);
    expect(chunks[0].path).toBe(circle);
  });

  // REGRESSION: Harmonograph/Pendula default to curves:true, so their single
  // long optimized path carries real bezier handles (meta.anchors). The old
  // code left ANY anchored path whole (see the stale comment this replaces),
  // which is fine for multi-path layers but collapses a single-path layer to
  // exactly one chunk — t = (0 + 1/2) / 1 = 0.5 — i.e. the gradient's flat
  // MIDPOINT colour for the entire drawing, every time drawProgress reaches
  // 1 and the raw (still-anchored) path reaches the overlay unflattened. Below
  // 100%, Renderer.sliceRevealPath happens to flatten+strip the anchors while
  // truncating, which accidentally routed the in-progress path through the
  // chunking branch and hid the bug until the very last percent. The fix
  // densely flattens anchored paths the same way (GeometryUtils.flattenSmoothedPath)
  // before chunking, so a single anchored path sweeps the gradient too.
  it('chunks a single native-cubic (bezier-anchor) path instead of collapsing to one flat colour', () => {
    const bezier = longPath(500);
    bezier.meta = {
      anchors: bezier.map((p, i) => ({
        x: p.x, y: p.y,
        in: i === 0 ? null : { x: p.x - 0.4, y: 0 },
        out: i === bezier.length - 1 ? null : { x: p.x + 0.4, y: 0 },
      })),
    };
    const items = [{ id: 'only', path: bezier }];
    const chunks = buildLineSortGradientChunks(items);
    expect(chunks.length).toBeGreaterThan(1);
    const ts = chunks.map((c) => c.t);
    expect(Math.min(...ts)).toBeLessThan(0.05);
    expect(Math.max(...ts)).toBeGreaterThan(0.95);
    chunks.forEach((c) => expect(c.id).toBe('only'));
  });
});
