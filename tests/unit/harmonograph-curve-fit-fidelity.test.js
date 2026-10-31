/**
 * A fitted Harmonograph must draw the figure it sampled — no stray arcs.
 *
 * Harmonograph emits its whole drawing as ONE long open path (thousands of
 * samples), and with Curves on the engine fits it to cubic anchors via
 * GeometryUtils.reduceAnchors → _fitCubic. _fitCubic splits at the point of
 * worst error and recurses; on a self-crossing figure those splits are
 * lopsided, so nesting depth grows with path length, not log(length). It used
 * to stop at a hard `depth > 48` backstop and emit whatever un-fitted cubic it
 * had — on the Trinodal preset that was a 5 mm stray arc looping outside the
 * lobes ("one line came loose"), which vanished during a drag because the drag
 * preview draws differently and reappeared on mouse-up.
 *
 * Every split is strictly interior, so the fit always terminates; the fix makes
 * it iterative with no depth cap. This drives the real preset through the real
 * engine and checks every drawn cubic stays on the sampled polyline.
 */
const fs = require('fs');
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const PRESET = path.join(__dirname, '../../user-presets/harmonograph/trinodal.vectura');

// Distance from q to the nearest segment of `poly`, bucketed so the scan is local.
const buildSegmentIndex = (poly, cell) => {
  const grid = new Map();
  const key = (cx, cy) => `${cx},${cy}`;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1];
    const b = poly[i];
    const x0 = Math.floor(Math.min(a.x, b.x) / cell);
    const x1 = Math.floor(Math.max(a.x, b.x) / cell);
    const y0 = Math.floor(Math.min(a.y, b.y) / cell);
    const y1 = Math.floor(Math.max(a.y, b.y) / cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = key(cx, cy);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push([a, b]);
      }
    }
  }
  const segDist = (q, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2));
    return Math.hypot(a.x + dx * t - q.x, a.y + dy * t - q.y);
  };
  return (q) => {
    const cx = Math.floor(q.x / cell);
    const cy = Math.floor(q.y / cell);
    let best = Infinity;
    for (let r = 0; r <= 3; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          (grid.get(key(cx + dx, cy + dy)) || []).forEach(([a, b]) => {
            best = Math.min(best, segDist(q, a, b));
          });
        }
      }
      if (best <= r * cell) break;
    }
    return best;
  };
};

const cubicAt = (a, c1, c2, b, t) => {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  };
};

describe('harmonograph curve fit fidelity', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test.each([
    ['committed', {}],
    ['drag preview', { fastPreview: true }],
  ])('Trinodal preset (%s): every fitted cubic stays on the sampled figure', (_label, opts) => {
    const { VectorEngine } = runtime.window.Vectura;
    const preset = JSON.parse(fs.readFileSync(PRESET, 'utf8'));
    const engine = new VectorEngine();
    const id = engine.addLayer('harmonograph');
    const layer = engine.layers.find((l) => l.id === id);
    Object.assign(layer.params, JSON.parse(JSON.stringify(preset.layers[0].params)), {
      curves: true,
      smoothing: 0,
      simplify: 0,
    });
    engine.generate(id, opts);

    const [drawn] = layer.paths;
    const anchors = drawn.meta && drawn.meta.anchors;
    expect(Array.isArray(anchors) && anchors.length > 2).toBe(true);

    const distToFigure = buildSegmentIndex(drawn, 4);
    let worst = 0;
    let worstSpan = -1;
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      const c1 = a.out || a;
      const c2 = b.in || b;
      for (let k = 1; k < 24; k++) {
        const d = distToFigure(cubicAt(a, c1, c2, b, k / 24));
        if (d > worst) { worst = d; worstSpan = i; }
      }
    }
    // The fit tolerance is ~0.002 of the diagonal (≈0.4 mm here; ×3 for the
    // drag preview). The stray arc measured ~5 mm. 1.5 mm separates them cleanly.
    expect({ worst: +worst.toFixed(2), worstSpan, below: worst < 1.5 })
      .toEqual(expect.objectContaining({ below: true }));
  });
});
