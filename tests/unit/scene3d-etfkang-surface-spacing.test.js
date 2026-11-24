/*
 * RGR — etfKang strokes follow the SURFACE: spacing is even in surface distance, so on screen
 * the gap compresses toward the limb by the foreshortening |N.V| (a surface pattern in
 * perspective). Before: the separation test ran at even SCREEN spacing, so the gap-to-pitch
 * ratio was ~1 everywhere. Measured on a sphere: nearest-other-stroke distance / the tone
 * pitch at that point, median in the centre band vs the limb band.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('etfKang surface-distance spacing', () => {
  let runtime; let V;
  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: false });
    V = runtime.window.Vectura;
    V.SETTINGS.scenePoseWarp = false;
  }, 300000);
  afterAll(() => runtime && runtime.cleanup && runtime.cleanup());

  // ETF config variants: TODAY = even screen spacing (K 0), A = full surface spacing (K 1), B = partial (K 0.5) with the ink floor.
  const VARIANT = { today: { SURFACE_K: 0, GAP_FLOOR_X: 0 }, A: { SURFACE_K: 1, GAP_FLOOR_X: 0 }, B: { SURFACE_K: 0.5, GAP_FLOOR_X: 1 } };
  const run = (variant = 'A') => {
    const orig = V.SCENE3D_SURFACE_LOCK;
    V.SCENE3D_SURFACE_LOCK = { ...orig, ETF: { ...orig.ETF, ...VARIANT[variant] } };
    runtime.window.__MONO_TRACE = true;
    try {
      const engine = new V.VectorEngine();
      const gid = engine.addLayer('scene3d');
      const group = engine.layers.find((l) => l.id === gid);
      group.params.tone = { ...(group.params.tone || {}), model: 'v2' };
      const child = engine.getLayerDescendants(gid).find((l) => l && l.type === 'object3d');
      child.params.primitive = 'sphere';
      child.params.style = { penId: null, mapper: 'hatch', params: { fillCurves: true, toneLaw: 'etfKang' } };
      child.params.transform.yaw = 33; child.params.transform.pitch = 0; child.params.transform.roll = 0;
      engine.computeAllDisplayGeometry();
      const C = runtime.window.__MONO_CTX;
      expect(C).toBeTruthy();
      const paths = (group.scenePaths || []).filter(Array.isArray);
      const cx = (C.minX + C.maxX) / 2; const cy = (C.minY + C.maxY) / 2;
      const Rr = Math.max(C.W, C.H) / 2;
      const pts = [];
      paths.forEach((p, pi) => p.forEach((q, i) => { if (i % 2 === 0) pts.push({ x: q.x, y: q.y, pi }); }));
      const band = (lo, hi) => {
        const ratios = [];
        pts.forEach((q, n) => {
          const r = Math.hypot(q.x - cx, q.y - cy) / Rr;
          if (r < lo || r >= hi || n % 3) return;
          const s = C.inv(q.x, q.y);
          if (!s || C.paper(s)) return;
          let best = Infinity;
          for (let k = 0; k < pts.length; k++) {
            if (pts[k].pi === q.pi) continue;
            const d = Math.hypot(pts[k].x - q.x, pts[k].y - q.y);
            if (d < best) best = d;
          }
          if (Number.isFinite(best)) ratios.push(best / C.pitchOf(s));
        });
        ratios.sort((a, b) => a - b);
        return { n: ratios.length, med: ratios[Math.floor(ratios.length / 2)] };
      };
      return { centre: band(0, 0.35), limb: band(0.78, 0.92) };
    } finally { V.SCENE3D_SURFACE_LOCK = orig; delete runtime.window.__MONO_TRACE; delete runtime.window.__MONO_CTX; }
  };

  test('variant A (K = 1): gap/pitch compresses toward the limb (tracks |N.V|), centre stays ~1', () => {
    const { centre, limb } = run('A');
    expect(centre.n).toBeGreaterThan(15);
    expect(limb.n).toBeGreaterThan(15);
    // |N.V| at r/R = 0.85 is ~0.53: the limb gap must be well under the centre gap.
    expect(limb.med / centre.med).toBeLessThan(0.75);
  }, 180000);

  test('variant B (K = 0.5 + ink floor) compresses less than A and more than the old even-screen spacing', () => {
    const r = {};
    ['today', 'A', 'B'].forEach((v) => { const m = run(v); r[v] = m.limb.med / m.centre.med; });
    expect(r.A).toBeLessThan(r.B);
    expect(r.B).toBeLessThan(r.today);
  }, 300000);
});
