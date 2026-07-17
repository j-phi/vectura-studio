const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Parameter-space morphing (same-algorithm pairs).
 *
 * When both children of a morph pair carry a morphSource ({type, params}) of
 * the SAME algorithm type plus a regen(params) callback, the morph modifier
 * interpolates the params per step and regenerates real geometry instead of
 * blending baked polylines. This is what makes a rotated/resized polyhedron
 * copy morph through true intermediate rotations/sizes, and a one-param-changed
 * child morph through stepped increments of that parameter — instead of the
 * merge-centroid mush / index-match tangles the geometry blend produced.
 */
describe('morph modifier — parameter-space morph', () => {
  let runtime;
  let M;
  const bounds = { x: 0, y: 0, width: 500, height: 500 };

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    M = runtime.window.Vectura.Modifiers;
  });

  afterAll(() => runtime.cleanup());

  const ring = (cx, cy, r, n = 16) => {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    out.push({ ...out[0] });
    out.meta = { closed: true };
    return out;
  };

  const bboxOf = (paths) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    paths.forEach((p) => (Array.isArray(p) ? p : []).forEach((pt) => {
      minX = Math.min(minX, pt.x); maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y); maxY = Math.max(maxY, pt.y);
    }));
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  };

  // A fake "algorithm child": circle whose center/radius come straight from
  // params, so the expected intermediate geometry is exactly computable.
  const fakeChild = (params, penId) => ({
    outline: [ring(params.cx, params.cy, params.r)],
    fillPaths: [],
    fills: [],
    penId,
    morphSource: { type: 'fakecircle', params: { ...params } },
    regen: (p) => [ring(p.cx, p.cy, p.r)],
  });

  const morph = (over = {}) => ({
    type: 'morph', enabled: true, steps: 4, easing: 'linear',
    emitSources: false, fillMode: 'off', ...over,
  });

  test('lerpMorphParams: numbers lerp, seed thresholds, strings/bools threshold at 0.5', () => {
    const a = { r: 10, count: 4, seed: 111, mode: 'alpha', flag: false, nested: { k: 0 } };
    const b = { r: 20, count: 8, seed: 999, mode: 'beta', flag: true, nested: { k: 10 } };
    const q = M.lerpMorphParams(a, b, 0.25);
    expect(q.r).toBeCloseTo(12.5);
    expect(q.count).toBeCloseTo(5); // discrete stepping comes from algorithms flooring counts
    expect(q.seed).toBe(111); // seed never lerps — threshold switch
    expect(q.mode).toBe('alpha');
    expect(q.flag).toBe(false);
    expect(q.nested.k).toBeCloseTo(2.5);
    const h = M.lerpMorphParams(a, b, 0.75);
    expect(h.seed).toBe(999);
    expect(h.mode).toBe('beta');
    expect(h.flag).toBe(true);
  });

  test('same-type pair regenerates stepped intermediates from interpolated params', () => {
    const A = fakeChild({ cx: 100, cy: 100, r: 20, seed: 1 }, 'penA');
    const B = fakeChild({ cx: 400, cy: 100, r: 60, seed: 1 }, 'penB');
    const out = M.applyMorphModifierToPaths([A, B], morph(), bounds);
    expect(out.length).toBe(4);
    for (let i = 0; i < 4; i += 1) {
      const t = (i + 1) / 5;
      const b = bboxOf([out[i]]);
      expect(b.cx).toBeCloseTo(100 + 300 * t, 0);
      expect(b.w / 2).toBeCloseTo(20 + 40 * t, 0);
    }
    // Pen switches at the visual midpoint.
    expect(out[0].meta.penId).toBe('penA');
    expect(out[3].meta.penId).toBe('penB');
  });

  test('easing applies to the interpolation parameter', () => {
    const A = fakeChild({ cx: 0, cy: 0, r: 10, seed: 1 }, null);
    const B = fakeChild({ cx: 100, cy: 0, r: 10, seed: 1 }, null);
    const out = M.applyMorphModifierToPaths([A, B], morph({ steps: 1, easing: 'ease-in' }), bounds);
    expect(out.length).toBe(1);
    const b = bboxOf([out[0]]);
    // t=0.5 eased in → 0.25
    expect(b.cx).toBeCloseTo(25, 0);
  });

  test('paramMorph:false forces the geometry blend path', () => {
    const A = fakeChild({ cx: 100, cy: 100, r: 20, seed: 1 }, null);
    const B = fakeChild({ cx: 400, cy: 100, r: 60, seed: 1 }, null);
    let regenCalls = 0;
    A.regen = B.regen = () => { regenCalls += 1; return [ring(0, 0, 5)]; };
    const out = M.applyMorphModifierToPaths([A, B], morph({ paramMorph: false }), bounds);
    expect(regenCalls).toBe(0);
    expect(out.length).toBeGreaterThan(0);
  });

  test('mismatched types fall back to geometry blend', () => {
    const A = fakeChild({ cx: 100, cy: 100, r: 20, seed: 1 }, null);
    const B = fakeChild({ cx: 400, cy: 100, r: 60, seed: 1 }, null);
    B.morphSource.type = 'otherthing';
    let regenCalls = 0;
    A.regen = B.regen = () => { regenCalls += 1; return []; };
    const out = M.applyMorphModifierToPaths([A, B], morph(), bounds);
    expect(regenCalls).toBe(0);
    expect(out.length).toBeGreaterThan(0);
  });

  test('regen returning nothing falls back to geometry blend', () => {
    const A = fakeChild({ cx: 100, cy: 100, r: 20, seed: 1 }, null);
    const B = fakeChild({ cx: 400, cy: 100, r: 60, seed: 1 }, null);
    A.regen = () => [];
    const out = M.applyMorphModifierToPaths([A, B], morph(), bounds);
    // Geometry fallback still produces the 4 blend rings.
    expect(out.length).toBe(4);
    const b = bboxOf(out);
    expect(b.w).toBeGreaterThan(100); // spans between the two sources
  });

  test('multi-path children regen every path per step', () => {
    const mk = (cx) => ({
      outline: [ring(cx, 100, 10), ring(cx, 200, 10)],
      fillPaths: [], fills: [], penId: null,
      morphSource: { type: 'fakepair', params: { cx, seed: 2 } },
      regen: (p) => [ring(p.cx, 100, 10), ring(p.cx, 200, 10)],
    });
    const out = M.applyMorphModifierToPaths([mk(100), mk(300)], morph({ steps: 3 }), bounds);
    expect(out.length).toBe(6); // 3 steps × 2 paths
  });
});
