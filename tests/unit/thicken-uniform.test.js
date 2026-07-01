const geometry = require('../../src/core/geometry-utils.js');

/**
 * thickenPathsUniform — uniform-width parallel thickening for single-stroke fonts.
 *
 * The built-in Vectura monoline "weight" (Bold etc.) fakes a heavier pen by
 * drawing N parallel offset passes. The legacy thickenPaths offsets each vertex
 * along its averaged tangent normal at magnitude 1, which PINCHES at a sharp
 * corner (a V apex): there the offset falls short of the miter, so the band's
 * width perpendicular to each arm collapses toward the vertex. thickenPathsUniform
 * offsets along the true miter vector (length 1/cos(phi/2)) so every pass stays at
 * a constant perpendicular distance from both arms — uniform weight through the
 * corner.
 */
describe('thickenPathsUniform', () => {
  // Symmetric V: two straight arms meeting at a sharp bottom apex.
  const V = [{ x: 0, y: 0 }, { x: 10, y: 40 }, { x: 20, y: 0 }];
  const SPACING = 2;
  const WIDTH = 5; // offsets -4, -2, 0, +2, +4

  // Perpendicular distance from point p to the infinite line through a→b.
  const perpDist = (p, a, b) => {
    const dx = b.x - a.x; const dy = b.y - a.y;
    const mag = Math.hypot(dx, dy);
    return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / mag;
  };

  test('emits exactly `width` passes, each mirroring the skeleton vertex count', () => {
    const out = geometry.thickenPathsUniform([V.map((p) => ({ ...p }))], { width: WIDTH, spacing: SPACING });
    expect(out).toHaveLength(WIDTH);
    out.forEach((pass) => expect(pass).toHaveLength(V.length));
  });

  test('holds a uniform perpendicular width through a sharp corner (no pinch)', () => {
    const src = V.map((p) => ({ ...p }));
    const out = geometry.thickenPathsUniform([src], { width: WIDTH, spacing: SPACING });
    // Outermost pass sits at |offset| = 4 from the skeleton everywhere.
    const outer = out[out.length - 1];
    const half = (WIDTH - 1) / 2; // 2 steps → 4 units
    const expected = half * SPACING;
    // Along the left arm (mid-point vertex is the apex; check the apex specifically).
    const apex = outer[1];
    const distToLeftArm = perpDist(apex, V[0], V[1]);
    const distToRightArm = perpDist(apex, V[1], V[2]);
    expect(distToLeftArm).toBeCloseTo(expected, 4);
    expect(distToRightArm).toBeCloseTo(expected, 4);
  });

  test('improves on thickenPaths, which pinches the corner width', () => {
    const src = V.map((p) => ({ ...p }));
    const half = (WIDTH - 1) / 2;
    const expected = half * SPACING;
    const legacy = geometry.thickenPaths([src.map((p) => ({ ...p }))], { width: WIDTH, spacing: SPACING, mode: 'parallel' });
    const legacyApex = legacy[legacy.length - 1][1];
    const legacyDist = perpDist(legacyApex, V[0], V[1]);
    // Legacy collapses below the true half-width at the apex (the reported bug)…
    expect(legacyDist).toBeLessThan(expected - 0.5);
    // …while the uniform variant holds it.
    const uni = geometry.thickenPathsUniform([src.map((p) => ({ ...p }))], { width: WIDTH, spacing: SPACING });
    const uniDist = perpDist(uni[uni.length - 1][1], V[0], V[1]);
    expect(uniDist).toBeCloseTo(expected, 4);
  });

  test('width <= 1 is a no-op; meta is carried onto every pass', () => {
    const src = V.map((p) => ({ ...p }));
    src.meta = { algorithm: 'text', straight: true };
    // width 1 returns the input untouched (no extra passes).
    const one = geometry.thickenPathsUniform([src], { width: 1, spacing: SPACING });
    expect(one).toEqual([src]);
    const many = geometry.thickenPathsUniform([src], { width: WIDTH, spacing: SPACING });
    many.forEach((pass) => expect(pass.meta).toEqual({ algorithm: 'text', straight: true }));
  });

  test('a straight (corner-free) segment keeps evenly spaced parallel passes', () => {
    const seg = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const out = geometry.thickenPathsUniform([seg], { width: 3, spacing: SPACING });
    // Offsets -2, 0, +2 → y = -2, 0, +2 along the vertical normal.
    const ys = out.map((pass) => pass[0].y).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(-SPACING, 6);
    expect(ys[1]).toBeCloseTo(0, 6);
    expect(ys[2]).toBeCloseTo(SPACING, 6);
  });
});
