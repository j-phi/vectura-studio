/**
 * Scene3D.RayTorus unit tests — closed-form ray/torus intersection.
 *
 * The module is required directly (node environment, module.exports guard) —
 * no DOM, no runtime loader, no dependency on the rest of the app. Every
 * expected root below is computed BY HAND from the torus's own implicit
 * definition
 *
 *   (x² + y² + z² + R² − r²)² = 4R²(x² + y²)     (axis +z, major R, minor r)
 *
 * not cross-checked against any other part of this solver, so a bug shared
 * between the module and its test cannot hide here. R=20, r=6 throughout.
 *
 * Two independent GENERAL (non-hand-derivable) checks are also included:
 * a dense random fuzz against a brute-force sign-change/bisection root
 * finder on the raw implicit function, and a grazing-ray sweep over the
 * torus's own surface that reproduced the exact numerical blow-up (roots on
 * the order of 1e69, residual 1e278) this module's design note documents —
 * the regression this task exists to fix.
 */
const RayTorus = require('../../src/core/scene3d/ray-torus.js');

const R = 20;
const r = 6;
const TOL = 1e-6;

const implicitF = (pt, majorR, minorR) => {
  const s = (pt.x * pt.x) + (pt.y * pt.y) + (pt.z * pt.z) + (majorR * majorR) - (minorR * minorR);
  return (s * s) - (4 * majorR * majorR * ((pt.x * pt.x) + (pt.y * pt.y)));
};

const bruteForceRoots = (origin, dir, majorR, minorR, tMin, tMax, steps) => {
  const dl = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const D = { x: dir.x / dl, y: dir.y / dl, z: dir.z / dl };
  const at = (t) => ({ x: origin.x + (D.x * t), y: origin.y + (D.y * t), z: origin.z + (D.z * t) });
  const f = (t) => implicitF(at(t), majorR, minorR);
  const roots = [];
  const dt = (tMax - tMin) / steps;
  let prevT = tMin;
  let prevF = f(tMin);
  for (let i = 1; i <= steps; i++) {
    const t = tMin + (i * dt);
    const fv = f(t);
    if ((prevF < 0) !== (fv < 0)) {
      let lo = prevT;
      let hi = t;
      let flo = prevF;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        const fm = f(mid);
        if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
      }
      roots.push((lo + hi) / 2);
    }
    prevT = t;
    prevF = fv;
  }
  return roots;
};

const seededRandom = (seed) => {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
};

describe('Scene3D.RayTorus.intersect — hand-computed known-answer cases (R=20, r=6)', () => {
  test('ray straight down the hole axis misses entirely (0 real roots)', () => {
    // Line x=0,y=0: distance from any point on the torus's centre circle
    // (radius R in the z=0 plane) to (0,0,z) is sqrt(R²+z²) >= R > r for
    // every z, so the axis never reaches the tube. By hand: 0 roots.
    const roots = RayTorus.intersect({ x: 0, y: 0, z: -100 }, { x: 0, y: 0, z: 1 }, R, r);
    expect(roots).toEqual([]);
  });

  test('ray through the hole off-axis but still inside it misses (0 real roots)', () => {
    // (5, 0, z): distance from the centre circle is sqrt((R-5)² + z²)
    // (nearest ring point at radius R, same azimuth) which is >= R-5 = 15 > r
    // for every z — still entirely inside the hole, by hand: 0 roots.
    const roots = RayTorus.intersect({ x: 5, y: 0, z: -100 }, { x: 0, y: 0, z: 1 }, R, r);
    expect(roots).toEqual([]);
  });

  test('ray hitting near and far sheet of the SAME tube cross-section — both roots, in order', () => {
    // At (R, 0, z), the point (R,0,0) is exactly the tube's own centre, so
    // the implicit equation reduces to (z²)² = 0 shifted by ±r: solving
    // (2R²-r²+z²)² = 4R⁴ by hand gives z² = r² exactly (the other sign,
    // z² = r²-4R², is negative and has no real solution since r<2R).
    // Roots: z=-r (near/enter) and z=+r (far/exit), t = z+100.
    const roots = RayTorus.intersect({ x: R, y: 0, z: -100 }, { x: 0, y: 0, z: 1 }, R, r);
    expect(roots.length).toBe(2);
    expect(roots[0]).toBeCloseTo(100 - r, 6); // near sheet, smaller t
    expect(roots[1]).toBeCloseTo(100 + r, 6); // far sheet, larger t
    expect(roots[0]).toBeLessThan(roots[1]); // explicit ordering assertion
  });

  test('ray originating INSIDE the tube — one root ahead (forward), one behind', () => {
    // Same line as above, but the ray now STARTS at the tube's exact centre
    // (R,0,0) — by hand, still z=±r, i.e. t=-r (behind the origin) and
    // t=+r (ahead). The solver returns the full line's roots unfiltered by
    // sign (see module header); a caller wanting ray semantics filters t>=0
    // itself — asserted here explicitly.
    const roots = RayTorus.intersect({ x: R, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, R, r);
    expect(roots.length).toBe(2);
    expect(roots[0]).toBeCloseTo(-r, 6);
    expect(roots[1]).toBeCloseTo(r, 6);
    const forward = roots.filter((t) => t >= 0);
    expect(forward.length).toBe(1);
    expect(forward[0]).toBeCloseTo(r, 6);
  });

  test('ray through BOTH sides of the donut — 4 real roots, near+far on each side', () => {
    // Along y=0,z=0: the classic four crossings, hand-derived from
    // x²+R²-r² = ±2Rx ⇒ (x∓R)²=r² ⇒ x = ±R±r.
    const roots = RayTorus.intersect({ x: -1000, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, R, r);
    const expected = [
      1000 - (R + r),
      1000 - (R - r),
      1000 + (R - r),
      1000 + (R + r),
    ];
    expect(roots.length).toBe(4);
    roots.forEach((t, i) => expect(t).toBeCloseTo(expected[i], 6));
    for (let i = 1; i < roots.length; i++) expect(roots[i]).toBeGreaterThan(roots[i - 1]);
  });

  test('near-tangent grazing ray at the outer rim — exact double root, no spurious extras', () => {
    // The line x=R+r, z=0, y variable is tangent to the torus at its
    // OUTERMOST equator point (R+r, 0, 0). By hand: f(y) is EVEN in y
    // (the line's implicit function only involves y², so f'(0)=0
    // automatically whenever f(0)=0 — a guaranteed double root at y=0), and
    // expanding f(y) = y²(y² + 4Rr) exactly — so the ONLY real root is the
    // double root at y=0; the other factor (y² = -4Rr) is strictly complex.
    // This is precisely the class of ray ("near-tangent... at the outer
    // rim") that broke the previous grid-sampled attempt.
    const roots = RayTorus.intersect({ x: R + r, y: -50, z: 0 }, { x: 0, y: 1, z: 0 }, R, r);
    // At least one root must land within tight tolerance of the exact
    // tangent point (t=50); no root may be a wild outlier (the numerical
    // failure mode this module's header documents: ~1e69 blow-ups).
    expect(roots.length).toBeGreaterThanOrEqual(1);
    roots.forEach((t) => {
      expect(Number.isFinite(t)).toBe(true);
      expect(Math.abs(t)).toBeLessThan(1000); // no blow-up
      expect(t).toBeCloseTo(50, 4); // every returned root IS the tangent point
    });
    // The tangent point itself must actually satisfy the implicit surface
    // equation to tight tolerance — confirms this isn't a coincidentally
    // "small" garbage root.
    const pt = RayTorus.pointAt({ x: R + r, y: -50, z: 0 }, { x: 0, y: 1, z: 0 }, roots[0]);
    expect(Math.abs(implicitF(pt, R, r))).toBeLessThan(1e-3);
  });

  test('total miss — a ray nowhere near the torus returns no real roots', () => {
    const roots = RayTorus.intersect({ x: 0, y: 0, z: 500 }, { x: 1, y: 0, z: 0 }, R, r);
    expect(roots).toEqual([]);
  });

  test('direction need not be pre-normalized — same roots as the unit-length equivalent', () => {
    const unit = RayTorus.intersect({ x: R, y: 0, z: -100 }, { x: 0, y: 0, z: 1 }, R, r);
    const scaled = RayTorus.intersect({ x: R, y: 0, z: -100 }, { x: 0, y: 0, z: 37.5 }, R, r);
    expect(scaled.length).toBe(unit.length);
    scaled.forEach((t, i) => expect(t).toBeCloseTo(unit[i], 6));
  });
});

describe('Scene3D.RayTorus.intersect — general cross-checks against an independent brute-force root finder', () => {
  test('an oblique ray with no symmetry (genuinely exercises the general Ferrari branch)', () => {
    const origin = { x: -60, y: 40, z: 30 };
    const dir = { x: 1, y: -0.6, z: -0.35 };
    const closed = RayTorus.intersect(origin, dir, R, r);
    const brute = bruteForceRoots(origin, dir, R, r, -20, 220, 200000);
    expect(closed.length).toBe(brute.length);
    closed.forEach((t, i) => expect(t).toBeCloseTo(brute[i], 5));
  });

  test('3000 random rays across scale/R/r variety match brute force with no missed/extra/garbage roots', () => {
    const rnd = seededRandom(42);
    const combos = [[R, r], [5, 1], [100, 40], [8, 7.5], [50, 2]];
    let total = 0;
    combos.forEach(([majorR, minorR]) => {
      for (let i = 0; i < 600; i++) {
        const scale = 50 + (rnd() * 2000);
        const origin = {
          x: (rnd() - 0.5) * scale, y: (rnd() - 0.5) * scale, z: (rnd() - 0.5) * scale,
        };
        const dir = { x: rnd() - 0.5, y: rnd() - 0.5, z: rnd() - 0.5 };
        if (Math.hypot(dir.x, dir.y, dir.z) < 1e-6) continue;
        const closed = RayTorus.intersect(origin, dir, majorR, minorR);
        const brute = bruteForceRoots(origin, dir, majorR, minorR, -(scale * 2) - 500, (scale * 2) + 500, 6000);
        expect(closed.length).toBe(brute.length);
        closed.forEach((t, k) => expect(Math.abs(t - brute[k])).toBeLessThan(0.1));
        // Every returned root must genuinely satisfy the implicit surface —
        // the guard against silent garbage roots.
        closed.forEach((t) => {
          const pt = RayTorus.pointAt(origin, dir, t);
          expect(Math.abs(implicitF(pt, majorR, minorR))).toBeLessThan(1e-2);
        });
        total += 1;
      }
    });
    expect(total).toBeGreaterThan(2500);
  });

  test('REGRESSION: dense grazing-ray sweep over the torus surface — the exact failure this module fixes', () => {
    // Reproduces the numerical blow-up found while building this solver: a
    // near-tangent ray constructed from the torus's own tangent plane at a
    // dense grid of (u, v) surface points drove an earlier, naive Ferrari
    // implementation to roots around 1e69 with a residual around 1e278 at
    // (u,v) = (0.45, 0.375) — caused by an ABSOLUTE (not scale-aware) cutoff
    // on the depressed quartic's `q` coefficient routing a near-zero-but-
    // nonzero `q` into the general branch, then dividing it by a resolvent
    // `m` that itself rounded to ~0. Every root returned below must be
    // finite, bounded, and a genuine root of the implicit surface — no
    // exceptions, across a full dense sweep.
    const TAU = Math.PI * 2;
    const surfPt = (u, v) => {
      const a = u * TAU;
      const b = v * TAU;
      const ringR = R + (Math.cos(b) * r);
      return { x: Math.cos(a) * ringR, y: Math.sin(b) * r, z: Math.sin(a) * ringR };
    };
    const surfNormal = (u, v) => {
      const a = u * TAU;
      const b = v * TAU;
      return { x: Math.cos(a) * Math.cos(b), y: Math.sin(b), z: Math.sin(a) * Math.cos(b) };
    };
    const cross = (a, b) => ({
      x: (a.y * b.z) - (a.z * b.y),
      y: (a.z * b.x) - (a.x * b.z),
      z: (a.x * b.y) - (a.y * b.x),
    });
    const norm = (a) => {
      const l = Math.hypot(a.x, a.y, a.z) || 1;
      return { x: a.x / l, y: a.y / l, z: a.z / l };
    };
    let checked = 0;
    let garbage = 0;
    for (let iu = 0; iu < 80; iu++) {
      for (let iv = 0; iv < 80; iv++) {
        const u = iu / 80;
        const v = iv / 80;
        const p = surfPt(u, v);
        const n = norm(surfNormal(u, v));
        const ref = Math.abs(n.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
        const t1 = norm(cross(n, ref));
        const dir = norm({
          x: (t1.x * 0.9999) + (n.x * 1e-6),
          y: (t1.y * 0.9999) + (n.y * 1e-6),
          z: (t1.z * 0.9999) + (n.z * 1e-6),
        });
        const origin = { x: p.x - (dir.x * 80), y: p.y - (dir.y * 80), z: p.z - (dir.z * 80) };
        const roots = RayTorus.intersect(origin, dir, R, r);
        checked += 1;
        roots.forEach((t) => {
          if (!Number.isFinite(t) || Math.abs(t) > 1e4) { garbage += 1; return; }
          const pt = RayTorus.pointAt(origin, dir, t);
          const res = Math.abs(implicitF(pt, R, r));
          if (res > 1) garbage += 1;
        });
      }
    }
    expect(checked).toBe(6400);
    expect(garbage).toBe(0);
  });
});

describe('Scene3D.RayTorus.pointAt', () => {
  test('reconstructs the exact surface point for a hand-computed root', () => {
    const origin = { x: R, y: 0, z: -100 };
    const dir = { x: 0, y: 0, z: 1 };
    const roots = RayTorus.intersect(origin, dir, R, r);
    const near = RayTorus.pointAt(origin, dir, roots[0]);
    expect(near.x).toBeCloseTo(R, 6);
    expect(near.y).toBeCloseTo(0, 6);
    expect(near.z).toBeCloseTo(-r, 6);
  });
});
