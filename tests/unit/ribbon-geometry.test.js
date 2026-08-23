/*
 * RibbonGeometry (contract C1) — variable-width ribbon outline for the scene3d
 * pen-width outline+fill work.
 *
 * These tests exist to kill two named defects:
 *
 *   D1 STAIRSTEPPING — the old path delivered a variable-width ruling as abutting
 *   CONSTANT-width pieces, with the width quantized to 0.12 buckets. T3 below feeds
 *   a smooth monotonic ramp and asserts the ring's densely-sampled local width is
 *   monotonic, jumps by less than penWidth*0.05, and takes a distinct value at
 *   nearly every station. A bucketed implementation fails all three.
 *
 *   D2 PROTRUSION — round caps and parallel offset copies put ink outside the form
 *   at the limb. T2 below asserts a HARD ZERO (1e-6, the boolean snap grid, not a
 *   tuned tolerance): no clipped vertex and no point sampled along a clipped edge
 *   may lie outside the clip region. A companion test pins BUTT caps by exact bbox.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const RibbonGeometry = require('../../src/core/scene3d/ribbon-geometry.js');

describe('RibbonGeometry', () => {
  let runtime;
  let deps;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    deps = {
      boolean: runtime.window.Vectura.FillBoolean,
      geometry: runtime.window.Vectura.GeometryUtils,
    };
  });

  afterAll(() => runtime.cleanup());

  // ── fixtures ────────────────────────────────────────────────────────────────
  const smoothstep = (t) => t * t * (3 - 2 * t);

  const straightRamp = (n, len, h0, h1) => {
    const centerline = [];
    const halfWidths = [];
    for (let i = 0; i < n; i += 1) {
      const t = i / (n - 1);
      centerline.push({ x: t * len, y: 0 });
      halfWidths.push(h0 + (h1 - h0) * smoothstep(t));
    }
    return { centerline, halfWidths };
  };

  const grid = (v) => Math.round(v * 1e6) / 1e6;

  const discRing = (cx, cy, r, n) => {
    const ring = [];
    for (let i = 0; i < n; i += 1) {
      const a = (2 * Math.PI * i) / n;
      ring.push({ x: grid(cx + r * Math.cos(a)), y: grid(cy + r * Math.sin(a)) });
    }
    return ring;
  };

  // ── measurement helpers ─────────────────────────────────────────────────────
  // Vertical extent of a closed ring on the line x = X. For a ribbon built on a
  // horizontal centerline this IS the local ribbon width.
  const spanAt = (ring, X) => {
    let lo = Infinity;
    let hi = -Infinity;
    const note = (y) => { if (y < lo) lo = y; if (y > hi) hi = y; };
    for (let i = 0, n = ring.length; i < n; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      const xMin = Math.min(a.x, b.x);
      const xMax = Math.max(a.x, b.x);
      if (X < xMin || X > xMax) continue;
      const dx = b.x - a.x;
      if (Math.abs(dx) < 1e-12) { note(a.y); note(b.y); continue; }
      note(a.y + ((X - a.x) / dx) * (b.y - a.y));
    }
    return hi >= lo ? hi - lo : 0;
  };

  const bbox = (ring) => ring.reduce((acc, p) => ({
    minX: Math.min(acc.minX, p.x),
    minY: Math.min(acc.minY, p.y),
    maxX: Math.max(acc.maxX, p.x),
    maxY: Math.max(acc.maxY, p.y),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });

  const ringArea = (ring) => {
    let s = 0;
    for (let i = 0, n = ring.length; i < n; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      s += a.x * b.y - b.x * a.y;
    }
    return Math.abs(s / 2);
  };

  const pointInRing = (p, ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const a = ring[i];
      const b = ring[j];
      if ((a.y > p.y) !== (b.y > p.y)
        && p.x < ((b.x - a.x) * (p.y - a.y)) / ((b.y - a.y) || 1e-18) + a.x) inside = !inside;
    }
    return inside;
  };

  const distToSegment = (p, a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  };

  const distToRing = (p, ring) => {
    let best = Infinity;
    for (let i = 0, n = ring.length; i < n; i += 1) {
      const d = distToSegment(p, ring[i], ring[(i + 1) % n]);
      if (d < best) best = d;
    }
    return best;
  };

  // How far OUTSIDE the region (outer ring minus holes) the point lies. 0 when in.
  const outsideDistance = (p, outer, holes) => {
    if (!pointInRing(p, outer)) return distToRing(p, outer);
    for (const hole of holes) if (pointInRing(p, hole)) return distToRing(p, hole);
    return 0;
  };

  // Every vertex plus densely-sampled points along every edge.
  const densePoints = (ring, per = 16) => {
    const out = [];
    for (let i = 0, n = ring.length; i < n; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      for (let k = 0; k < per; k += 1) {
        const t = k / per;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    return out;
  };

  const properlyCrosses = (p1, p2, p3, p4) => {
    const side = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const d1 = side(p3, p4, p1);
    const d2 = side(p3, p4, p2);
    const d3 = side(p1, p2, p3);
    const d4 = side(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
      && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };

  const hasSelfIntersection = (ring) => {
    const n = ring.length;
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        if (j === i + 1 || (i === 0 && j === n - 1)) continue;
        if (properlyCrosses(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return true;
      }
    }
    return false;
  };

  // ── T3 — no stairstep ───────────────────────────────────────────────────────
  describe('T3 — no stairstep', () => {
    const PEN = 0.35;

    test('a smooth width ramp produces a continuous, monotonic, unquantized ribbon', () => {
      const { centerline, halfWidths } = straightRamp(400, 40, 0.05, 0.9);
      const ring = RibbonGeometry.buildRibbonRing(centerline, halfWidths, {
        cap: 'butt', joinLimit: 4, minHalfWidth: 1e-4, ...deps,
      });
      expect(Array.isArray(ring)).toBe(true);
      expect(ring.length).toBeGreaterThan(100);

      const SAMPLES = 300;
      const widths = [];
      for (let k = 0; k < SAMPLES; k += 1) {
        widths.push(spanAt(ring, 0.05 + (39.9 * k) / (SAMPLES - 1)));
      }

      // The profile is reproduced, not approximated by tiers.
      expect(widths[0]).toBeCloseTo(0.1, 2);
      expect(widths[SAMPLES - 1]).toBeCloseTo(1.8, 2);

      // Monotonic in, monotonic out.
      for (let k = 1; k < SAMPLES; k += 1) {
        expect(widths[k]).toBeGreaterThanOrEqual(widths[k - 1] - 1e-9);
      }

      // No jump anywhere: the first difference is bounded by 5% of a pen width.
      let maxJump = 0;
      for (let k = 1; k < SAMPLES; k += 1) {
        maxJump = Math.max(maxJump, Math.abs(widths[k] - widths[k - 1]));
      }
      expect(maxJump).toBeLessThan(PEN * 0.05);

      // No quantization: a bucketed width yields a handful of distinct values.
      const distinct = new Set(widths.map((w) => w.toFixed(6))).size;
      expect(distinct).toBeGreaterThan(SAMPLES * 0.9);
    });

    test('the ramp survives a curved centerline (bisector normals, not per-segment)', () => {
      const centerline = [];
      const halfWidths = [];
      const N = 400;
      for (let i = 0; i < N; i += 1) {
        const t = i / (N - 1);
        const a = -Math.PI / 2 + t * Math.PI; // half turn of a radius-12 arc
        centerline.push({ x: 12 * Math.cos(a), y: 12 * Math.sin(a) });
        halfWidths.push(0.05 + 0.85 * smoothstep(t));
      }
      const ring = RibbonGeometry.buildRibbonRing(centerline, halfWidths, {
        cap: 'butt', joinLimit: 4, minHalfWidth: 1e-4, ...deps,
      });
      expect(Array.isArray(ring)).toBe(true);
      // On an arc the ribbon boundary is two concentric arcs: measure the width
      // radially at each station and require the same continuity.
      const widths = [];
      for (let i = 1; i < N - 1; i += 1) {
        const c = centerline[i];
        const r = Math.hypot(c.x, c.y);
        // nearest ring vertex on each radial side
        let inner = Infinity;
        let outer = -Infinity;
        for (const p of ring) {
          const along = (p.x * c.x + p.y * c.y) / r;
          const across = Math.abs((p.x * -c.y + p.y * c.x) / r);
          if (across > 0.08) continue; // only vertices on this radial line
          if (along < inner) inner = along;
          if (along > outer) outer = along;
        }
        if (inner === Infinity) continue;
        widths.push(outer - inner);
      }
      expect(widths.length).toBeGreaterThan(50);
      let maxJump = 0;
      for (let k = 1; k < widths.length; k += 1) {
        maxJump = Math.max(maxJump, Math.abs(widths[k] - widths[k - 1]));
      }
      expect(maxJump).toBeLessThan(PEN * 0.05);
    });
  });

  // ── T2 — no protrusion ──────────────────────────────────────────────────────
  describe('T2 — no protrusion', () => {
    const TOL = 1e-6; // the boolean snap grid. A hard bound, not a tuned tolerance.

    const wavyRibbon = () => {
      const centerline = [];
      const halfWidths = [];
      const N = 600;
      for (let i = 0; i < N; i += 1) {
        const t = i / (N - 1);
        const x = -18 + 36 * t;
        centerline.push({ x, y: 3 * Math.sin(x / 4) });
        halfWidths.push(0.1 + 0.25 * (1 + Math.sin(x / 3)));
      }
      return { centerline, halfWidths };
    };

    test('a ribbon clipped to a disc puts ZERO ink outside it', () => {
      const { centerline, halfWidths } = wavyRibbon();
      const ring = RibbonGeometry.buildRibbonRing(centerline, halfWidths, {
        cap: 'butt', joinLimit: 4, minHalfWidth: 1e-4, ...deps,
      });
      expect(Array.isArray(ring)).toBe(true);

      const disc = discRing(0, 0, 10, 256);
      // The test has teeth only if the UNCLIPPED ribbon really does protrude.
      expect(ring.some((p) => outsideDistance(p, disc, []) > 0.5)).toBe(true);

      const clipped = RibbonGeometry.clipRingToRegion(ring, [disc], deps);
      expect(Array.isArray(clipped)).toBe(true);
      expect(clipped.length).toBeGreaterThanOrEqual(1);

      let worst = 0;
      for (const piece of clipped) {
        for (const p of densePoints(piece)) {
          worst = Math.max(worst, outsideDistance(p, disc, []));
        }
      }
      expect(worst).toBeLessThanOrEqual(TOL);
    });

    test('a hole in the region is honoured — the ribbon is split, never bridged', () => {
      const { centerline, halfWidths } = wavyRibbon();
      const ring = RibbonGeometry.buildRibbonRing(centerline, halfWidths, {
        cap: 'butt', joinLimit: 4, minHalfWidth: 1e-4, ...deps,
      });
      const disc = discRing(0, 0, 10, 256);
      const hole = discRing(0, 0, 3, 192);

      const clipped = RibbonGeometry.clipRingToRegion(ring, [disc, hole], deps);
      expect(clipped.length).toBeGreaterThanOrEqual(2); // cut in two by the hole

      let worst = 0;
      for (const piece of clipped) {
        for (const p of densePoints(piece)) {
          worst = Math.max(worst, outsideDistance(p, disc, [hole]));
        }
      }
      expect(worst).toBeLessThanOrEqual(TOL);
    });

    test('caps are BUTT — the ring never overshoots the centerline endpoints', () => {
      const centerline = [];
      const halfWidths = [];
      for (let i = 0; i < 50; i += 1) {
        centerline.push({ x: (10 * i) / 49, y: 0 });
        halfWidths.push(0.6);
      }
      const ring = RibbonGeometry.buildRibbonRing(centerline, halfWidths, {
        cap: 'butt', joinLimit: 4, minHalfWidth: 1e-4, ...deps,
      });
      const b = bbox(ring);
      // A round cap would push minX to -0.6 and maxX to 10.6.
      expect(b.minX).toBeCloseTo(0, 9);
      expect(b.maxX).toBeCloseTo(10, 9);
      expect(b.minY).toBeCloseTo(-0.6, 9);
      expect(b.maxY).toBeCloseTo(0.6, 9);
    });

    test('no clip rings means no clip (the caller decides)', () => {
      const { centerline, halfWidths } = straightRamp(20, 5, 0.2, 0.4);
      const ring = RibbonGeometry.buildRibbonRing(centerline, halfWidths, { ...deps });
      expect(RibbonGeometry.clipRingToRegion(ring, [], deps)).toHaveLength(1);
      expect(RibbonGeometry.clipRingToRegion(ring, null, deps)).toHaveLength(1);
    });
  });

  // ── self-intersection resolution ────────────────────────────────────────────
  describe('tight concave turns', () => {
    test('a hairpin wider than its turn radius resolves to a SIMPLE ring', () => {
      const centerline = [];
      const halfWidths = [];
      const push = (x, y) => { centerline.push({ x, y }); halfWidths.push(0.5); };
      for (let i = 0; i <= 100; i += 1) push((5 * i) / 100, 0);
      for (let i = 1; i < 24; i += 1) {
        const a = -Math.PI / 2 + (Math.PI * i) / 24;
        push(5 + 0.2 * Math.cos(a), 0.2 + 0.2 * Math.sin(a));
      }
      for (let i = 0; i <= 100; i += 1) push(5 - (5 * i) / 100, 0.4);

      const ring = RibbonGeometry.buildRibbonRing(centerline, halfWidths, {
        cap: 'butt', joinLimit: 4, minHalfWidth: 1e-4, ...deps,
      });
      expect(Array.isArray(ring)).toBe(true);
      expect(hasSelfIntersection(ring)).toBe(false);
      // Overlap was MERGED, not double-counted. The exact union area is known:
      // two 5x1 arms overlapping in a 5x0.6 band (5 + 5 - 3 = 7) plus the x>5
      // half of the turn's radius-0.7 outer disc (pi*0.49/2 = 0.7697) = 7.7697.
      // Double-counting the overlap instead gives arc-length * width = 10.628,
      // which is what an un-unioned ring measures.
      expect(ringArea(ring)).toBeCloseTo(7.7697, 2);
    });
  });

  // ── degenerate input ────────────────────────────────────────────────────────
  describe('degenerate input', () => {
    test('returns null rather than throwing', () => {
      expect(RibbonGeometry.buildRibbonRing(null, null, deps)).toBeNull();
      expect(RibbonGeometry.buildRibbonRing([{ x: 0, y: 0 }], [0.5], deps)).toBeNull();
      expect(RibbonGeometry.buildRibbonRing(
        [{ x: 0, y: 0 }, { x: 1, y: 0 }], [0.5], deps
      )).toBeNull();
      expect(RibbonGeometry.buildRibbonRing(
        [{ x: 0, y: 0 }, { x: 0, y: 0 }], [0.5, 0.5], deps
      )).toBeNull();
      expect(RibbonGeometry.buildRibbonRing(
        [{ x: 0, y: 0 }, { x: NaN, y: 0 }, { x: 2, y: 0 }], [0.5, 0.5, 0.5], deps
      )).not.toBeNull();
      expect(RibbonGeometry.clipRingToRegion(null, [discRing(0, 0, 5, 32)], deps)).toEqual([]);
    });

    test('a zero half-width is floored at minHalfWidth, never inverted', () => {
      const centerline = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }];
      const ring = RibbonGeometry.buildRibbonRing(centerline, [0, 0.5, 0], {
        cap: 'butt', joinLimit: 4, minHalfWidth: 0.01, ...deps,
      });
      expect(Array.isArray(ring)).toBe(true);
      expect(spanAt(ring, 0.001)).toBeGreaterThanOrEqual(0.02 - 1e-9);
      expect(spanAt(ring, 5)).toBeCloseTo(1.0, 6);
    });
  });
});
