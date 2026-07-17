const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * 'pair' multi-path strategy — nearest-normalized-centroid path pairing.
 *
 * Regression for the "tiny squiggle" failure: with differing path counts the
 * old auto strategy resolved to merge-centroid, which AVERAGES all of a
 * child's paths into one blob (a 6-petal flower averaged into a ~30-unit ring
 * near its center), so the intermediates collapsed to little marks. Pairing
 * morphs each path of the busier child against its spatially-corresponding
 * path in the other child, preserving the full structure of both sources.
 */
describe('morph modifier — pair multi-path strategy', () => {
  let runtime;
  let M;
  const bounds = { x: 0, y: 0, width: 500, height: 500 };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    M = runtime.window.Vectura.Modifiers;
  });

  afterAll(() => runtime.cleanup());

  const ring = (cx, cy, r, n = 24) => {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    out.push({ ...out[0] });
    out.meta = { closed: true };
    return out;
  };

  // 6 petals around a center + core ring = 7 paths, ~96 units wide.
  const flower = (cx, cy) => {
    const paths = [];
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      paths.push(ring(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30, 18));
    }
    paths.push(ring(cx, cy, 8));
    return paths;
  };

  // Same flower + 24 extra swirl rings = 31 paths (a param-changed variant).
  const flowerB = (cx, cy) => {
    const paths = flower(cx, cy);
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      paths.push(ring(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12, 6));
    }
    return paths;
  };

  const unionBBox = (paths) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    paths.forEach((p) => (Array.isArray(p) ? p : []).forEach((pt) => {
      minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
    }));
    return { w: maxX - minX, h: maxY - minY };
  };

  const morph = (over = {}) => ({
    type: 'morph', enabled: true, steps: 6, easing: 'linear',
    emitSources: false, fillMode: 'off', ...over,
  });

  test('auto resolves to pairing when path counts differ: intermediates keep full structure', () => {
    const A = flower(100, 100);
    const B = flowerB(400, 400);
    const out = M.applyMorphModifierToPaths([A, B], morph(), bounds);
    // Every path of the busier child participates: 6 steps × 31 pairs.
    expect(out.length).toBe(6 * 31);
    // Each step's union bbox must be flower-scale, not a collapsed blob.
    for (let s = 0; s < 6; s += 1) {
      const stepPaths = out.filter((_, i) => i % 6 === s);
      const b = unionBBox(stepPaths);
      expect(b.w).toBeGreaterThan(60);
      expect(b.h).toBeGreaterThan(60);
    }
  });

  test('explicit pair strategy works with equal counts too', () => {
    const A = flower(100, 100);
    const B = flower(400, 400);
    const out = M.applyMorphModifierToPaths(
      [A, B], morph({ multiPathStrategy: 'pair', steps: 2 }), bounds
    );
    expect(out.length).toBe(2 * 7);
    const b = unionBBox(out);
    expect(b.w).toBeGreaterThan(60);
  });

  test('auto keeps index-match for equal path counts', () => {
    const A = [ring(100, 100, 10), ring(200, 100, 10)];
    const B = [ring(100, 300, 10), ring(200, 300, 10)];
    const out = M.applyMorphModifierToPaths([A, B], morph({ steps: 1 }), bounds);
    expect(out.length).toBe(2);
  });

  test('auto keeps merge-longest for 1-vs-many', () => {
    const A = [ring(100, 100, 40)];
    const B = flowerB(400, 400);
    const out = M.applyMorphModifierToPaths([A, B], morph({ steps: 3 }), bounds);
    expect(out.length).toBe(3); // one representative pair
  });

  test('pairing maps spatially: left petal pairs with left petal, not by index order', () => {
    // A: two rings, left then right. B: three rings listed right-to-left —
    // index-match would cross them; pairing must not.
    const A = [ring(100, 100, 10), ring(300, 100, 10)];
    const B = [ring(300, 200, 10), ring(200, 200, 10), ring(100, 200, 10)];
    const out = M.applyMorphModifierToPaths(
      [A, B], morph({ steps: 1, multiPathStrategy: 'pair' }), bounds
    );
    expect(out.length).toBe(3);
    // At t=0.5 each blended ring's center x should sit halfway between its
    // pair's endpoints. Spatial pairing keeps every midpoint within the
    // horizontal span of its nearer endpoints — crossing pairs would put a
    // ring at x=200 (100↔300 crossed) twice and none near 100 or 300.
    const centers = out.map((p) => {
      const b = unionBBox([p]);
      let minX = Infinity, maxX = -Infinity;
      p.forEach((pt) => { minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x); });
      return (minX + maxX) / 2;
    }).sort((a, b) => a - b);
    // Expected pairs: A[100]↔B[100] → 100, A[200-ish extra]→ nearest, A[300]↔B[300] → 300.
    expect(centers[0]).toBeLessThan(140);
    expect(centers[centers.length - 1]).toBeGreaterThan(260);
  });
});
