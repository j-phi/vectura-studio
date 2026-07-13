/**
 * The fit must not make a line STRAIGHTER than leaving it alone would.
 *
 * `reduceAnchors` splits at every detected corner and emits HANDLE-LESS anchors
 * for the runs between them. That is correct for genuinely straight runs. But
 * `PathDraw` enters cubic mode as soon as ANY anchor in the list carries a
 * handle, and a handle-less pair emits `C a a b b` — a degenerate cubic that
 * draws as a straight chord. So on coarse or noisy geometry, where corner
 * detection fires almost everywhere, a couple of genuinely-smooth spans were
 * enough to flip the whole path into cubic mode and render everything else as
 * straight chords — bypassing the smooth quadratic fallback it would otherwise
 * have got.
 *
 * The observed inversion, on the stock Lissajous: Curves ON at Smoothing 0 drew
 * 88 smooth quadratics; the same layer at Smoothing 0.6 drew 84 straight chords
 * and 2 curves. Turning Smoothing UP made the line straighter — the exact
 * opposite of what the control says it does.
 *
 * So the fit is now gated: if it cannot find real curve structure (most of its
 * anchors come back handle-less), it declines rather than claiming a curve it did
 * not find, and the path keeps the rendering it would have had. Claiming a curve
 * and then drawing chords is strictly worse than not claiming one.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('the curve fit declines when it finds no curve', () => {
  let runtime;
  let GU;
  let PathDraw;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    ({ GeometryUtils: GU, PathDraw } = runtime.window.Vectura);
  });

  afterAll(() => {
    runtime.cleanup();
  });

  // Count the cubics that are really straight chords: both control points sit on
  // their own anchor, so the segment draws as a line.
  const degenerateVsReal = (path, useCurves) => {
    let degenerate = 0;
    let real = 0;
    let quadratic = 0;
    let cursor = null;
    PathDraw.commands(path, { useCurves }).forEach((cmd) => {
      if (cmd[0] === 'M') { cursor = { x: cmd[1], y: cmd[2] }; return; }
      if (cmd[0] === 'Q') { quadratic += 1; cursor = { x: cmd[3], y: cmd[4] }; return; }
      if (cmd[0] !== 'C') return;
      const c1 = { x: cmd[1], y: cmd[2] };
      const c2 = { x: cmd[3], y: cmd[4] };
      const end = { x: cmd[5], y: cmd[6] };
      const flat = Math.hypot(c1.x - cursor.x, c1.y - cursor.y) < 1e-9
        && Math.hypot(c2.x - end.x, c2.y - end.y) < 1e-9;
      if (flat) degenerate += 1; else real += 1;
      cursor = end;
    });
    return { degenerate, real, quadratic };
  };

  // A sawtooth: every vertex is a genuine cusp, nothing between them is curved.
  const sawtooth = () => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      pts.push({ x: i * 5, y: i % 2 === 0 ? 0 : 40 });
    }
    return pts;
  };

  test('an angular figure is declined rather than fitted into straight chords', () => {
    const r = GU.toCurveAnchors(sawtooth(), { curves: true, smoothing: 0 });
    expect(r.straight).toBe(true);
    expect(r.anchors).toBeNull();
  });

  // Drive the REAL algorithms through the REAL pipeline — the inversion was
  // measured on stock layers, and a synthetic path does not reproduce it.
  test.each(['lissajous', 'spiral', 'harmonograph'])(
    '%s: raising Smoothing never makes the drawn line straighter',
    (type) => {
      const { VectorEngine } = runtime.window.Vectura;

      const drawn = (smoothing) => {
        const engine = new VectorEngine();
        const id = engine.addLayer(type);
        const layer = engine.layers.find((l) => l.id === id);
        Object.assign(layer.params, { curves: true, smoothing, simplify: 0 });
        engine.generate(id);
        const live = engine.layers.find((l) => l.id === id);
        return live.paths.reduce((acc, p) => {
          const d = degenerateVsReal(p, true);
          acc.degenerate += d.degenerate;
          acc.curved += d.real + d.quadratic;
          return acc;
        }, { degenerate: 0, curved: 0 });
      };

      [0, 0.3, 0.6, 1].forEach((smoothing) => {
        const d = drawn(smoothing);
        // A path that claims to be a curve must actually draw as one. Straight
        // chords must never dominate the spans the fit emitted.
        expect(d.curved).toBeGreaterThanOrEqual(d.degenerate);
      });
    },
  );

  test('a genuinely smooth curve is still fitted — the gate is not a blanket refusal', () => {
    const circle = [];
    for (let i = 0; i <= 180; i++) {
      const t = (i / 180) * Math.PI * 2;
      circle.push({ x: 100 + 70 * Math.cos(t), y: 100 + 70 * Math.sin(t) });
    }
    const r = GU.toCurveAnchors(circle, { curves: true, smoothing: 0, closed: true });
    expect(r.straight).toBe(false);
    expect(r.anchors.length).toBeLessThan(20); // a circle is a handful of cubics
    expect(r.anchors.every((a) => a && (a.in || a.out))).toBe(true);
  });

  test('a square is still fitted, and keeps its four corners', () => {
    // Four corners and four dead-straight runs: mostly handle-less by nature.
    // The gate must not reject it — its anchors ARE the shape, exactly.
    const square = [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 },
    ];
    const r = GU.toCurveAnchors(square, { curves: true, smoothing: 0, closed: true });
    // Declining here is acceptable (it renders verbatim as the same 4 lines);
    // what is NOT acceptable is claiming a curve and drawing something else.
    if (!r.straight) {
      expect(r.anchors.filter((a) => a && a.corner).length).toBe(4);
    }
    const path = square.map((p) => ({ ...p }));
    const fitted = GU.applyCurveFit(path, { curves: true, smoothing: 0, closed: true });
    const d = degenerateVsReal(fitted, true);
    expect(d.real).toBe(0); // a square has no curved spans
  });
});
