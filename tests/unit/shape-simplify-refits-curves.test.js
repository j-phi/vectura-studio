/**
 * Simplify on a shape layer must RE-FIT the curve, not decimate it into chords.
 *
 * This is the bug Jay reported: expand a spiral, then drag the Post-Processing
 * Lab's Simplify. The line collapses into an ugly handful of straight chords that
 * visibly leave the curve — while the contextual toolbar's Simplify, on the very
 * same path, lands a couple of anchors that trace it perfectly.
 *
 * Two causes, stacked:
 *
 *   1. `rebuildShapeAnchors` only ever wrote bezier handles inside its
 *      `if (smoothing > 0)` branch. Expand sets Smoothing to 0, so it STRIPPED the
 *      handles its input arrived with and emitted a raw decimated polyline. There
 *      was no curve fit in that path at all.
 *
 *   2. Delegating it to `toCurveAnchors` — the engine's fit — does not help,
 *      because that fit DECLINES this input. A shape layer's source path is a
 *      dense flattened outline (4000 points for an expanded spiral, and the stock
 *      spiral carries a turbulence noise), and `reduceAnchors`' windowed corner
 *      detection over-fires on dense input, so the quality gate rejects it and the
 *      old chord path runs anyway.
 *
 * The right fit for this regime is the one the TOOLBAR already uses:
 * `fitBezierAnchors` — Schneider least-squares with immediate-neighbour corner
 * detection, which is exact on dense flattened outlines (and is the wrong choice
 * for coarse algorithm output, which is why the engine keeps `toCurveAnchors`).
 * Same core, different corner policy, chosen per regime.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const curvedAnchors = (list) => (list || []).filter((a) => a && (a.in || a.out)).length;

describe('shape-layer Simplify re-fits the curve', () => {
  let runtime;
  let GU;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ GeometryUtils: GU } = runtime.window.Vectura);
  });

  afterAll(() => {
    runtime.cleanup();
  });

  // The real thing Expand hands a shape layer: the dense flattened display curve
  // of a stock spiral, turbulence noise and all.
  const expandedSpiralPath = () => {
    const { VectorEngine } = runtime.window.Vectura;
    const engine = new VectorEngine();
    const id = engine.addLayer('spiral');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, { curves: true, smoothing: 0, simplify: 0 });
    engine.generate(id);
    return engine.layers.find((l) => l.id === id).paths[0];
  };

  const asAnchors = (path) => path.map((p) => ({ x: p.x, y: p.y, in: null, out: null }));

  test('Simplify on an expanded spiral yields CURVED anchors, not chords', () => {
    const src = asAnchors(expandedSpiralPath());
    const bounds = { dW: 279, dH: 216 };

    const out = GU.rebuildShapeAnchors(src, {
      curves: true, smoothing: 0, simplify: 0.5, closed: false, bounds,
    });

    expect(out.anchors.length).toBeGreaterThanOrEqual(2);
    expect(out.anchors.length).toBeLessThan(src.length); // it actually simplified
    // The whole complaint: every anchor came back handle-less, so the "curve" was
    // a chain of straight chords.
    expect(curvedAnchors(out.anchors)).toBeGreaterThan(0);
  });

  test('Simplify reduces the anchor count monotonically, and never de-curves', () => {
    const src = asAnchors(expandedSpiralPath());
    const bounds = { dW: 279, dH: 216 };

    let previous = Infinity;
    [0.1, 0.25, 0.5, 0.75, 1].forEach((simplify) => {
      const out = GU.rebuildShapeAnchors(src, {
        curves: true, smoothing: 0, simplify, closed: false, bounds,
      });
      const count = out.anchors.length;
      expect(count).toBeLessThanOrEqual(previous); // never ADDS anchors as you drag right
      expect(curvedAnchors(out.anchors)).toBeGreaterThan(0); // never drops to chords
      previous = count;
    });
  });

  test('the re-fit stays on the original curve', () => {
    const path = expandedSpiralPath();
    const src = asAnchors(path);
    const out = GU.rebuildShapeAnchors(src, {
      curves: true, smoothing: 0, simplify: 0.5, closed: false, bounds: { dW: 279, dH: 216 },
    });

    const drawn = GU.buildPolylineFromAnchors(out.anchors, false);
    const nearest = (p) => drawn.reduce(
      (best, q) => Math.min(best, Math.hypot(q.x - p.x, q.y - p.y)),
      Infinity,
    );
    const worst = path.reduce((m, p) => Math.max(m, nearest(p)), 0);

    // The old chord path deviated by 83.9mm on this input. Anything in that range
    // is "visibly a different shape", which is exactly what Jay saw.
    expect(worst).toBeLessThan(12);
  });

  // The curves-OFF branch is load-bearing: a pen-drawn polygon has no curve to
  // fit, and re-fitting one would round its corners. Simplify must still work
  // there, as plain decimation.
  test('a hand-drawn polygon with Curves OFF still decimates, and is not rounded', () => {
    const polygon = [];
    for (let i = 0; i < 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      const r = 60 + (i % 2 ? 0 : 0.4); // a near-polygon with slight jitter
      polygon.push({ x: 100 + r * Math.cos(t), y: 100 + r * Math.sin(t), in: null, out: null });
    }
    const out = GU.rebuildShapeAnchors(polygon, {
      curves: false, smoothing: 0, simplify: 0.8, closed: true, bounds: { dW: 279, dH: 216 },
    });
    expect(out.anchors.length).toBeLessThan(polygon.length);
    expect(curvedAnchors(out.anchors)).toBe(0); // no handles invented
  });
});
