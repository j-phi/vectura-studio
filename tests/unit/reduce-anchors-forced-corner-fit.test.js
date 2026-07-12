/*
 * Regression (RGR) — the bezier fit around FORCED corners must not hook.
 *
 * Welded text rings mark clipper-created intersection vertices as
 * `forceCorner` (true tangent discontinuities at glyph junctions). At a real
 * junction the boundary arrives at that corner via a tiny (~0.1-0.3mm)
 * clipper noise chord pointing far off the run's true direction; the fit
 * took its endpoint tangents from that SINGLE adjacent chord, and because
 * _computeMaxError only measures at the sparse sample points, the mis-aimed
 * cubic hooked ~1mm off the boundary BETWEEN samples and was accepted —
 * visible loops/teeth at every connected-script letter join (Dancing
 * Script). Forced-corner run endpoints now take a windowed chord over the
 * run itself, clamped to the run's arc length.
 *
 * Fixture: a real welded Dancing Script "srasxy" shell ring captured from the
 * app (world mm), with the clipper-created junction vertices flagged.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const RING = require('../fixtures/welded-script-ring.json');

describe('reduceAnchors forced-corner run fit', () => {
  let runtime, V, GU;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    GU = V.GeometryUtils;
  });
  afterAll(() => runtime.cleanup());

  const distToRing = (pt, ring) => {
    let best = Infinity;
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const abx = b.x - a.x; const aby = b.y - a.y;
      const L2 = abx * abx + aby * aby;
      let t = L2 > 0 ? ((pt.x - a.x) * abx + (pt.y - a.y) * aby) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(pt.x - (a.x + abx * t), pt.y - (a.y + aby * t));
      if (d < best) best = d;
    }
    return best;
  };

  const cubicAt = (a, c1, c2, b, t) => {
    const mt = 1 - t;
    return {
      x: mt * mt * mt * a.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * b.x,
      y: mt * mt * mt * a.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * b.y,
    };
  };

  test('welded script ring fit stays on the source boundary at junctions', () => {
    const ring = RING.map(([x, y, fc]) => ({ x, y, in: null, out: null, forceCorner: fc === 1 }));
    // Same opts the text weld passes at fontSize 40 (see text.js weldFitOpts).
    // cornerAngleDeg 40 also guards the real-elbow detection: at the historical
    // 75 the fit S-wiggled ~0.55mm at the 's' bowl-to-exit turn.
    const anchors = GU.reduceAnchors(ring, true, {
      cornerAngleDeg: 40,
      tolerance: 0.13333333333333333,
      mergeEps: 0.044444444444444446,
      windowDist: 1.9444444444444446,
    });
    expect(anchors.length).toBeGreaterThan(20);

    let worst = 0;
    let worstAt = null;
    for (let i = 0; i < anchors.length; i += 1) {
      const a = anchors[i];
      const b = anchors[(i + 1) % anchors.length];
      const c1 = a.out || a;
      const c2 = b.in || b;
      for (let k = 1; k < 16; k += 1) {
        const p = cubicAt(a, c1, c2, b, k / 16);
        const d = distToRing(p, ring);
        if (d > worst) { worst = d; worstAt = p; }
      }
    }
    // Pre-fix: hooks up to ~1mm+ at the letter junctions (garbage forced-corner
    // tangents accepted between sparse samples). Post-fix the whole fit stays
    // within ~3x the 0.133mm fit tolerance everywhere.
    expect(worst, `worst deviation ${worst.toFixed(3)}mm at (${worstAt && worstAt.x.toFixed(2)}, ${worstAt && worstAt.y.toFixed(2)})`).toBeLessThan(0.4);
  });
});
