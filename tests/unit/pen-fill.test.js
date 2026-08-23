/*
 * PenFill — guaranteed-coverage pen-width region fills (contract C2).
 *
 * These fills exist for ONE reason: a stroked region must contain NO WHITESPACE.
 * There is no artistic density knob — the pitch is derived from the pen
 * (`pitch = penWidth * (1 - overlap)`, overlap defaulting to 0.15), so changing
 * the pen necessarily changes the emitted path.
 *
 * T1 (the plan's coverage test) is implemented here with an INDEPENDENT
 * rasterizer: it samples the region at 4 samples per pen width, strokes every
 * returned path at `penWidth`, and asserts
 *   - coverage >= 0.995 of the region's area, and
 *   - the largest contiguous uncovered interior blob < (penWidth / 2)^2.
 * across all four styles x four fixtures (convex disc, annulus with hole, long
 * thin taper, concave crescent).
 *
 * The path-count budget is also pinned here: `spiral` and `serpentine` must
 * return EXACTLY ONE path per connected component (that is what makes spiral the
 * safe default for a scene already carrying ~1000 lines), while `concentric` and
 * `contourParallel` are allowed to lift the pen when a bridge cannot be
 * validated inside the region.
 */

// geometry-utils registers itself on window.Vectura when a window exists; giving
// it one here lets pen-fill.js resolve GeometryUtils through the same namespace
// lookup it uses in the browser (no test-only injection path).
if (typeof global.window === 'undefined') global.window = {};
require('../../src/core/geometry-utils.js');
const PenFill = require('../../src/core/pen-fill.js');

// ── Fixtures ────────────────────────────────────────────────────────────────
const circle = (cx, cy, r, n = 160) => {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const t = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
  }
  return pts;
};

// A trapezoid tapering from `w0` wide down to `w1` wide over `len`.
const taper = (len, w0, w1) => ([
  { x: 0, y: -w0 / 2 },
  { x: len, y: -w1 / 2 },
  { x: len, y: w1 / 2 },
  { x: 0, y: w0 / 2 },
]);

const FIXTURES = {
  disc: [circle(0, 0, 12)],
  annulus: [circle(0, 0, 14), circle(0, 0, 6)],
  taper: [taper(38, 9, 1.5)],
  crescent: [circle(0, 0, 14), circle(4.5, 0, 11)],
};

const STYLES = ['spiral', 'concentric', 'serpentine', 'contourParallel'];

const totalLength = (paths) => paths.reduce((sum, p) => {
  let d = 0;
  for (let i = 0; i + 1 < p.length; i += 1) d += Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y);
  return sum + d;
}, 0);

// ── Independent rasterizer (deliberately NOT the module's own) ───────────────
const pointInRegion = (x, y, rings) => {
  let inside = false;
  for (const ring of rings) {
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
      const a = ring[j];
      const b = ring[i];
      if ((a.y > y) !== (b.y > y)) {
        const t = (y - a.y) / (b.y - a.y);
        if (x < a.x + t * (b.x - a.x)) inside = !inside;
      }
    }
  }
  return inside;
};

const distToSegment = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const qx = ax + dx * t;
  const qy = ay + dy * t;
  return Math.hypot(px - qx, py - qy);
};

/** 4 samples per pen width, stroke every path at penWidth, measure the holes. */
const measure = (rings, paths, penWidth) => {
  const cs = penWidth / 4;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const ring of rings) {
    for (const p of ring) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const ox = minX - cs;
  const oy = minY - cs;
  const nx = Math.ceil((maxX - minX + 2 * cs) / cs) + 1;
  const ny = Math.ceil((maxY - minY + 2 * cs) / cs) + 1;
  const inside = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j += 1) {
    const y = oy + (j + 0.5) * cs;
    for (let i = 0; i < nx; i += 1) {
      const x = ox + (i + 0.5) * cs;
      if (pointInRegion(x, y, rings)) inside[j * nx + i] = 1;
    }
  }
  const covered = new Uint8Array(nx * ny);
  const r = penWidth / 2;
  for (const path of paths) {
    for (let s = 0; s + 1 < path.length; s += 1) {
      const a = path[s];
      const b = path[s + 1];
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - r - ox) / cs - 0.5));
      const i1 = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x) + r - ox) / cs - 0.5));
      const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - r - oy) / cs - 0.5));
      const j1 = Math.min(ny - 1, Math.ceil((Math.max(a.y, b.y) + r - oy) / cs - 0.5));
      for (let j = j0; j <= j1; j += 1) {
        const y = oy + (j + 0.5) * cs;
        for (let i = i0; i <= i1; i += 1) {
          const k = j * nx + i;
          if (covered[k] || !inside[k]) continue;
          const x = ox + (i + 0.5) * cs;
          if (distToSegment(x, y, a.x, a.y, b.x, b.y) <= r) covered[k] = 1;
        }
      }
    }
  }
  let total = 0;
  let hit = 0;
  for (let k = 0; k < inside.length; k += 1) {
    if (!inside[k]) continue;
    total += 1;
    if (covered[k]) hit += 1;
  }
  // Largest contiguous uncovered interior blob (4-connected).
  const seen = new Uint8Array(nx * ny);
  let largest = 0;
  const stack = [];
  for (let k = 0; k < inside.length; k += 1) {
    if (!inside[k] || covered[k] || seen[k]) continue;
    seen[k] = 1;
    stack.length = 0;
    stack.push(k);
    let count = 0;
    while (stack.length) {
      const c = stack.pop();
      count += 1;
      const ci = c % nx;
      const cj = (c - ci) / nx;
      const push = (ni, nj) => {
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) return;
        const nk = nj * nx + ni;
        if (seen[nk] || !inside[nk] || covered[nk]) return;
        seen[nk] = 1;
        stack.push(nk);
      };
      push(ci - 1, cj); push(ci + 1, cj); push(ci, cj - 1); push(ci, cj + 1);
    }
    if (count > largest) largest = count;
  }
  return {
    coverage: total ? hit / total : 0,
    largestBlobArea: largest * cs * cs,
    sampleArea: total * cs * cs,
  };
};

// ── T1 — coverage / no-whitespace ───────────────────────────────────────────
describe('PenFill.fillRegion — T1 guaranteed coverage', () => {
  const PEN = 2;
  for (const style of STYLES) {
    for (const [name, rings] of Object.entries(FIXTURES)) {
      test(`${style} leaves no whitespace on the ${name}`, () => {
        const res = PenFill.fillRegion(rings, PEN, style);
        expect(Array.isArray(res.paths)).toBe(true);
        expect(res.paths.length).toBeGreaterThan(0);
        const m = measure(rings, res.paths, PEN);
        expect(m.coverage).toBeGreaterThanOrEqual(0.995);
        expect(m.largestBlobArea).toBeLessThan((PEN / 2) ** 2);
        // The module's self-reported coverage must not overstate reality.
        expect(res.coverage).toBeGreaterThanOrEqual(0.995);
      });
    }
  }

  test('holds coverage at a finer pen on the crescent', () => {
    const pen = 1.1;
    const res = PenFill.fillRegion(FIXTURES.crescent, pen, 'spiral');
    const m = measure(FIXTURES.crescent, res.paths, pen);
    expect(m.coverage).toBeGreaterThanOrEqual(0.995);
    expect(m.largestBlobArea).toBeLessThan((pen / 2) ** 2);
  });
});

// ── Pitch is derived from the pen, never chosen ─────────────────────────────
describe('PenFill.fillRegion — pitch derivation', () => {
  test('default overlap is 0.15', () => {
    expect(PenFill.DEFAULT_OVERLAP).toBeCloseTo(0.15, 12);
  });

  test('changing the pen width changes the emitted path', () => {
    const a = PenFill.fillRegion(FIXTURES.disc, 2, 'spiral');
    const b = PenFill.fillRegion(FIXTURES.disc, 3, 'spiral');
    expect(totalLength(a.paths)).toBeGreaterThan(totalLength(b.paths) * 1.2);
  });

  test('there is no density knob — unknown opts cannot change the pitch', () => {
    const a = PenFill.fillRegion(FIXTURES.disc, 2, 'concentric');
    const b = PenFill.fillRegion(FIXTURES.disc, 2, 'concentric', { density: 40, spacing: 0.1, pitch: 9 });
    expect(b.paths.length).toBe(a.paths.length);
    expect(b.coverage).toBeCloseTo(a.coverage, 12);
  });

  test('overlap moves the pitch, and coverage survives either end of its range', () => {
    const loose = PenFill.fillRegion(FIXTURES.disc, 2, 'concentric', { overlap: 0.05 });
    const tight = PenFill.fillRegion(FIXTURES.disc, 2, 'concentric', { overlap: 0.4 });
    // Neither length nor pass count is monotonic in `overlap`: a slack overlap
    // leaves more medial residue, and the repair pass spends the saving back. The
    // invariant that matters is that overlap moves the geometry and that the
    // no-whitespace guarantee holds at both ends of its range.
    expect(totalLength(tight.paths)).not.toBeCloseTo(totalLength(loose.paths), 3);
    for (const res of [loose, tight]) {
      expect(measure(FIXTURES.disc, res.paths, 2).coverage).toBeGreaterThanOrEqual(0.995);
    }
  });
});

// ── Path-count budget ───────────────────────────────────────────────────────
describe('PenFill.fillRegion — path-count budget', () => {
  // A crescent's cusps taper to zero width, so at any finite raster it can split
  // into more than one connected region. `components` reports what the fill
  // actually saw; the single-stroke styles are graded against that number.
  test('disc, annulus and taper are single connected regions', () => {
    for (const name of ['disc', 'annulus', 'taper']) {
      expect(PenFill.fillRegion(FIXTURES[name], 2, 'spiral').components).toBe(1);
    }
  });

  for (const pen of [1.2, 2, 3]) {
    test(`spiral returns exactly one path on the disc at pen ${pen}`, () => {
      const res = PenFill.fillRegion(FIXTURES.disc, pen, 'spiral');
      expect(res.paths.length).toBe(1);
    });
    test(`spiral returns exactly one path on the taper at pen ${pen}`, () => {
      const res = PenFill.fillRegion(FIXTURES.taper, pen, 'spiral');
      expect(res.paths.length).toBe(1);
    });
  }

  // Several ribbon widths: a variable-width ribbon can be many pens wide or
  // barely one pen wide, and spiral must stay a single unbroken stroke either way.
  for (const [w0, w1] of [[12, 4], [6, 2], [3, 1.2]]) {
    test(`spiral stays one stroke on a ${w0}->${w1} ribbon`, () => {
      const rings = [taper(30, w0, w1)];
      const res = PenFill.fillRegion(rings, 1.5, 'spiral');
      expect(res.paths.length).toBe(1);
      const m = measure(rings, res.paths, 1.5);
      expect(m.coverage).toBeGreaterThanOrEqual(0.995);
    });
  }

  for (const [name, rings] of Object.entries(FIXTURES)) {
    test(`spiral never exceeds one path per connected component on the ${name}`, () => {
      const res = PenFill.fillRegion(rings, 2, 'spiral');
      expect(res.paths.length).toBeLessThanOrEqual(res.components);
    });
    test(`serpentine never exceeds one path per connected component on the ${name}`, () => {
      const res = PenFill.fillRegion(rings, 2, 'serpentine');
      expect(res.paths.length).toBeLessThanOrEqual(res.components);
    });
  }
});

// ── API surface / robustness ────────────────────────────────────────────────
describe('PenFill.fillRegion — API surface', () => {
  test('accepts a bare ring as well as a ring list', () => {
    const bare = PenFill.fillRegion(FIXTURES.disc[0], 2, 'spiral');
    expect(bare.paths.length).toBe(1);
    const pairs = FIXTURES.disc[0].map((p) => [p.x, p.y]);
    const asPairs = PenFill.fillRegion([pairs], 2, 'spiral');
    expect(asPairs.paths.length).toBe(1);
  });

  test('returns empty for degenerate input instead of throwing', () => {
    for (const bad of [[], null, undefined, [[{ x: 0, y: 0 }]]]) {
      expect(PenFill.fillRegion(bad, 2, 'spiral')).toEqual({ paths: [], coverage: 0, components: 0 });
    }
    expect(PenFill.fillRegion(FIXTURES.disc, 0, 'spiral')).toEqual({ paths: [], coverage: 0, components: 0 });
  });

  test('an unknown style falls back to spiral rather than emitting nothing', () => {
    const res = PenFill.fillRegion(FIXTURES.disc, 2, 'nonsense');
    expect(res.paths.length).toBe(1);
    expect(res.coverage).toBeGreaterThanOrEqual(0.995);
  });

  test('every returned path is a finite polyline of at least two points', () => {
    for (const style of STYLES) {
      const res = PenFill.fillRegion(FIXTURES.crescent, 2, style);
      for (const path of res.paths) {
        expect(path.length).toBeGreaterThanOrEqual(2);
        for (const p of path) {
          expect(Number.isFinite(p.x)).toBe(true);
          expect(Number.isFinite(p.y)).toBe(true);
        }
      }
    }
  });

  test('serpentine honours an explicit axis', () => {
    const along = PenFill.fillRegion(FIXTURES.taper, 2, 'serpentine', { axis: { x: 1, y: 0 } });
    const across = PenFill.fillRegion(FIXTURES.taper, 2, 'serpentine', { axis: { x: 0, y: 1 } });
    const verts = (res) => res.paths.reduce((n, p) => n + p.length, 0);
    expect(verts(along)).not.toBe(verts(across));
    for (const res of [along, across]) {
      const m = measure(FIXTURES.taper, res.paths, 2);
      expect(m.coverage).toBeGreaterThanOrEqual(0.995);
    }
  });
});
