/*
 * RGR — A SELF-CROSSING CENTRELINE MUST NOT COLLAPSE INTO A SOLID SLAB.
 *
 * Contract C1 defines a ribbon as the region SWEPT by a pen of varying width
 * along a centreline. Where the centreline crosses itself the swept region
 * genuinely overlaps — but the area ENCLOSED by the loop was never swept, and
 * must stay unfilled.
 *
 * WHAT WENT WRONG (judge C, 2026-08-29). `buildRibbonRing` resolved the
 * self-overlap by unioning the outline with itself and then keeping only
 * `largestShell(result)` — polygon[0] of the biggest polygon. polygon-clipping
 * had already computed the loop interiors CORRECTLY, as holes; taking the shell
 * alone threw every one of them away. `erode` + `PenFill` then painted the
 * swallowed area solid. Five of the twelve variable-width laws (`onePenDown`,
 * `trochoidLoop`, `interlockWeave`, `weaveDepth`, `ampSpacing`) rendered as a
 * slab with a hollow black lens instead of a ribbon; `onePenDown`'s measured
 * mid-band coverage fell 0.629 -> 0.147 while both flanks saturated.
 *
 * The lemniscate below is the smallest fixture that reproduces it: one crossing,
 * two loops, both loops far wider than the ribbon. A build that keeps only the
 * shell fills 197 mm² where the true swept area is 118 mm², and reports the two
 * loop centres as inked.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const RibbonGeometry = require('../../src/core/scene3d/ribbon-geometry.js');

describe('RibbonGeometry — self-crossing centrelines keep their loop interiors', () => {
  let runtime;
  let deps;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    deps = {
      boolean: runtime.window.Vectura.FillBoolean,
      geometry: runtime.window.Vectura.GeometryUtils,
    };
  }, 120000);

  afterAll(() => runtime.cleanup());

  // ── fixtures ────────────────────────────────────────────────────────────────
  // Lemniscate of Gerono: x = a sin t, y = a sin t cos t. One crossing at the
  // origin, two symmetric loops, each reaching x = ±a.
  const lemniscate = (n, a, half) => {
    const centerline = [];
    const halfWidths = [];
    for (let i = 0; i < n; i += 1) {
      const t = (i / (n - 1)) * Math.PI * 2;
      centerline.push({ x: a * Math.sin(t), y: a * Math.sin(t) * Math.cos(t) });
      halfWidths.push(half);
    }
    return { centerline, halfWidths };
  };

  const ringSignedArea = (ring) => {
    let s = 0;
    for (let i = 0, n = ring.length; i < n; i += 1) {
      const p = ring[i];
      const q = ring[(i + 1) % n];
      s += p.x * q.y - q.x * p.y;
    }
    return s / 2;
  };

  // Net area of a ring SET where shells and holes carry opposite winding: the
  // absolute value of the summed signed areas.
  const netArea = (rings) => Math.abs(rings.reduce((acc, r) => acc + ringSignedArea(r), 0));

  const grossShellArea = (rings) => rings.reduce(
    (acc, r) => acc + Math.max(0, Math.abs(ringSignedArea(r))), 0,
  );

  // Even-odd point test over a flat ring set: a point inside an odd number of
  // rings is inked, inside an even number (shell + its hole) is not.
  const inkedAt = (rings, p) => {
    let inside = false;
    for (const ring of rings) {
      let hit = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const a = ring[i];
        const b = ring[j];
        if ((a.y > p.y) !== (b.y > p.y)
          && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
      }
      if (hit) inside = !inside;
    }
    return inside;
  };

  const A = 10;
  const HALF = 1;

  it('exposes buildRibbonRings — one ring cannot express a loop interior', () => {
    expect(typeof RibbonGeometry.buildRibbonRings).toBe('function');
  });

  it('returns a hole per loop rather than one filled shell', () => {
    const { centerline, halfWidths } = lemniscate(600, A, HALF);
    const rings = RibbonGeometry.buildRibbonRings(centerline, halfWidths, { ...deps });
    expect(Array.isArray(rings)).toBe(true);
    // One shell + two holes. A shell-only build returns exactly one ring.
    expect(rings.length).toBeGreaterThanOrEqual(3);
    const holes = rings.filter((r) => Math.abs(ringSignedArea(r)) > 1 && ringSignedArea(r) < 0);
    const shells = rings.filter((r) => ringSignedArea(r) > 1);
    expect(shells.length).toBe(1);
    expect(holes.length).toBe(2);
  });

  it('nets the true swept area, not the area of the outer shell', () => {
    const { centerline, halfWidths } = lemniscate(600, A, HALF);
    const rings = RibbonGeometry.buildRibbonRings(centerline, halfWidths, { ...deps });
    const net = netArea(rings);
    const gross = grossShellArea(rings.filter((r) => ringSignedArea(r) > 0));
    // Swept area ≈ arc length × 2·half, minus the double-counted crossing.
    let arc = 0;
    for (let i = 1; i < centerline.length; i += 1) {
      arc += Math.hypot(centerline[i].x - centerline[i - 1].x, centerline[i].y - centerline[i - 1].y);
    }
    const swept = arc * 2 * HALF;
    expect(net).toBeLessThan(gross * 0.75);
    expect(net).toBeGreaterThan(swept * 0.7);
    expect(net).toBeLessThan(swept * 1.05);
  });

  it('leaves the centre of each loop uninked', () => {
    const { centerline, halfWidths } = lemniscate(600, A, HALF);
    const rings = RibbonGeometry.buildRibbonRings(centerline, halfWidths, { ...deps });
    // (±6, 0) sits deep inside a loop and more than a half-width from the band.
    expect(inkedAt(rings, { x: 6, y: 0 })).toBe(false);
    expect(inkedAt(rings, { x: -6, y: 0 })).toBe(false);
    // The band itself is still inked — the crossing point and the loop apex.
    expect(inkedAt(rings, { x: 0, y: 0 })).toBe(true);
    expect(inkedAt(rings, { x: A, y: 0 })).toBe(true);
  });

  it('keeps the holes through the region clip', () => {
    const { centerline, halfWidths } = lemniscate(600, A, HALF);
    const rings = RibbonGeometry.buildRibbonRings(centerline, halfWidths, { ...deps });
    const clip = [[
      { x: -40, y: -40 }, { x: 40, y: -40 }, { x: 40, y: 40 }, { x: -40, y: 40 },
    ]];
    expect(typeof RibbonGeometry.clipRingsToRegion).toBe('function');
    const clipped = RibbonGeometry.clipRingsToRegion(rings, clip, { ...deps });
    expect(clipped.length).toBeGreaterThanOrEqual(3);
    expect(inkedAt(clipped, { x: 6, y: 0 })).toBe(false);
    expect(inkedAt(clipped, { x: -6, y: 0 })).toBe(false);
    expect(netArea(clipped)).toBeLessThan(netArea(rings) * 1.02);
  });

  it('still returns a single simple ring when the centreline never crosses', () => {
    const centerline = [];
    const halfWidths = [];
    for (let i = 0; i < 200; i += 1) {
      centerline.push({ x: i * 0.2, y: Math.sin(i * 0.02) * 2 });
      halfWidths.push(0.6);
    }
    const rings = RibbonGeometry.buildRibbonRings(centerline, halfWidths, { ...deps });
    expect(rings.length).toBe(1);
    expect(ringSignedArea(rings[0])).not.toBe(0);
  });
});
