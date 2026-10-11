const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/**
 * Live defect (Jay, 2026-10-10): an angled hatch on a capsule bent at each
 * barrel/cap seam — "the lines suddenly angle and get closer together at the
 * end of each cap".
 *
 * `Charts.topoCapsule` splits its along-axis coordinate by HEIGHT, so a cap's
 * quarter arc (r*pi/2) is squeezed into the parameter share a straight run of
 * length r would get. The surface speed |dP/da| jumped ~1.57x at the seam, and
 * a helix (constant da/db) changed slope and pitch there. The fill's chart must
 * place the seam by ARC LENGTH, so the speed is continuous across it.
 */
describe('Scene3D.SurfaceFill — capsule chart is arc-length even across the cap seam', () => {
  let runtime; let SF;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    SF = runtime.window.Vectura.Scene3D.SurfaceFill;
  });
  afterAll(() => runtime.cleanup());

  // Meridian speed |dP/da| at `a`, on the b = 0 meridian.
  const speedAt = (chart, a) => {
    const h = 1e-4;
    const p = chart(a - h, 0); const q = chart(a + h, 0);
    return Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) / (2 * h);
  };

  test.each([
    [{ sx: 30, sy: 75, sz: 30 }],
    [{ sx: 14, sy: 16, sz: 14 }],
    [{ sx: 20, sy: 120, sz: 20 }],
  ])('speed is constant along the whole meridian %o', (sizes) => {
    const chart = SF.chartFor('capsule', sizes);
    expect(typeof chart).toBe('function');
    const speeds = [];
    for (let i = 1; i < 200; i++) speeds.push(speedAt(chart, i / 200));
    const lo = Math.min(...speeds); const hi = Math.max(...speeds);
    expect(hi / lo).toBeLessThan(1.02);
  });

  test('the chart still spans pole to pole and the barrel keeps its radius', () => {
    const sizes = { sx: 30, sy: 75, sz: 30 };
    const chart = SF.chartFor('capsule', sizes);
    expect(chart(0, 0.3).y).toBeCloseTo(-75, 6);
    expect(chart(1, 0.3).y).toBeCloseTo(75, 6);
    const mid = chart(0.5, 0);
    expect(Math.hypot(mid.x, mid.z)).toBeCloseTo(30, 6);
    expect(mid.y).toBeCloseTo(0, 6);
  });
});
