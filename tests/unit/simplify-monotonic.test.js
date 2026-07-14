/**
 * Dragging Simplify UP must never give you more geometry, or fewer curves.
 *
 * The quality gate in `toCurveAnchors` (decline when most spans come back
 * straight) has the right intent — it exists because a fit that finds no curve
 * used to emit degenerate cubics that draw as straight chords. But it declined to
 * the WRONG THING: the raw, *already decimated* polyline, at whatever decimation
 * level the Simplify slider happened to reach.
 *
 * So the control inverted. Simplify coarsens the path before fitting; a coarser
 * path trips corner detection harder; the gate then declines; and the path pops
 * back to polyline mode — with MORE points than the fitted version it replaced,
 * and no curve. Measured on a stock flowfield: 6,622 points at Simplify 0.5,
 * 7,102 at Simplify 1.0, with ~30% of paths silently losing their curves along
 * the way.
 *
 * The fix is to fall back to the last GOOD FIT — retry with less decimation —
 * rather than to the polyline. Only geometry that cannot be fitted at zero
 * decimation is genuinely angular and honestly declined.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Simplify is monotonic and never de-curves', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  const sweep = (type) => {
    const { VectorEngine } = runtime.window.Vectura;
    const rows = [];
    [0, 0.25, 0.5, 0.75, 1].forEach((simplify) => {
      const engine = new VectorEngine();
      const id = engine.addLayer(type);
      const layer = engine.layers.find((l) => l.id === id);
      Object.assign(layer.params, { seed: 101, curves: true, smoothing: 0, simplify });
      engine.generate(id);
      const live = engine.layers.find((l) => l.id === id);
      const curved = (live.paths || []).filter((p) => {
        const a = p.meta && p.meta.anchors;
        return Array.isArray(a) && a.some((x) => x && (x.in || x.out));
      }).length;
      rows.push({ simplify, points: live.stats.simplifiedPoints, curved });
    });
    return rows;
  };

  test.each(['flowfield', 'rings'])('%s: point count never rises as Simplify rises', (type) => {
    const rows = sweep(type);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].points).toBeLessThanOrEqual(rows[i - 1].points);
    }
  });

  test.each(['flowfield', 'rings'])('%s: curved paths never drop as Simplify rises', (type) => {
    const rows = sweep(type);
    for (let i = 1; i < rows.length; i++) {
      // Asking for MORE simplification must not silently turn the curves off.
      expect(rows[i].curved).toBeGreaterThanOrEqual(rows[i - 1].curved);
    }
  });
});
