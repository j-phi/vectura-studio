/*
 * P0-B — StrokeDivide core primitive (src/core/stroke-divide.js).
 *
 * Divides polylines by arc length (document units ARE mm) into ordered
 * fragments per a repeating class cycle:
 *   sanitizeDivisions(cfg) -> { enabled, phaseMm, classes:[{lenMm, penId|null, gap}] }
 *   cycleLengthMm(cycle)   -> number
 *   divideStroke(path, cycle, opts)  -> Array<Path>  (one polyline)
 *   divideChain(paths, cycle, opts)  -> Array<Path>  (one continuous domain)
 *
 * Gap classes emit nothing. Fragments carry meta = shallow-copied parent meta
 * minus anchors/forceCurves, plus meta.penId (class override only) and
 * meta.parentGeom — the parent's RAW geometry (point-copy, or {circle,...}),
 * shared by reference across all fragments of one parent, keyed downstream via
 * StrokeDivide.parentKeyFromGeom at each consumer's own tolerance (Fix-A).
 */
const path = require('path');
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

const ROOT = path.resolve(__dirname, '../..');
const StrokeDivide = require(path.join(ROOT, 'src/core/stroke-divide.js'));

const line = (x0, y0, x1, y1) => {
  const p = [
    { x: x0, y: y0 },
    { x: x1, y: y1 },
  ];
  return p;
};

const fragLen = (frag) => {
  let len = 0;
  for (let i = 1; i < frag.length; i++) {
    len += Math.hypot(frag[i].x - frag[i - 1].x, frag[i].y - frag[i - 1].y);
  }
  return len;
};

const totalLen = (frags) => frags.reduce((s, f) => s + fragLen(f), 0);

const cycleAB = (aLen, gapLen, penId = 'pen-a') => ({
  enabled: true,
  phaseMm: 0,
  classes: [
    { lenMm: aLen, penId },
    { lenMm: gapLen, gap: true },
  ],
});

describe('StrokeDivide.sanitizeDivisions', () => {
  test('null/garbage input normalizes to a disabled empty config', () => {
    expect(StrokeDivide.sanitizeDivisions(null)).toEqual({ enabled: false, phaseMm: 0, classes: [] });
    expect(StrokeDivide.sanitizeDivisions('nope')).toEqual({ enabled: false, phaseMm: 0, classes: [] });
    expect(StrokeDivide.sanitizeDivisions({})).toEqual({ enabled: false, phaseMm: 0, classes: [] });
  });

  test('clamps negative lenMm to 0 and drops malformed classes', () => {
    const out = StrokeDivide.sanitizeDivisions({
      enabled: true,
      phaseMm: 2,
      classes: [
        { lenMm: -5, penId: 'a' },
        null,
        'junk',
        { lenMm: NaN },
        {},
        { lenMm: 4, gap: 1 },
      ],
    });
    expect(out.enabled).toBe(true);
    expect(out.phaseMm).toBe(2);
    expect(out.classes).toEqual([
      { lenMm: 0, penId: 'a', gap: false },
      { lenMm: 4, penId: null, gap: true },
    ]);
  });

  test('non-finite phase resets to 0; finite (incl. negative) is preserved', () => {
    expect(StrokeDivide.sanitizeDivisions({ phaseMm: Infinity }).phaseMm).toBe(0);
    expect(StrokeDivide.sanitizeDivisions({ phaseMm: 'x' }).phaseMm).toBe(0);
    expect(StrokeDivide.sanitizeDivisions({ phaseMm: -3.5 }).phaseMm).toBe(-3.5);
  });

  test('penId keeps non-empty strings only; everything else becomes null', () => {
    const out = StrokeDivide.sanitizeDivisions({
      classes: [
        { lenMm: 1, penId: 'pen-x' },
        { lenMm: 1, penId: '' },
        { lenMm: 1, penId: 42 },
      ],
    });
    expect(out.classes.map((c) => c.penId)).toEqual(['pen-x', null, null]);
  });
});

describe('StrokeDivide.cycleLengthMm', () => {
  test('sums class lengths from a sanitized config or a bare class array', () => {
    expect(StrokeDivide.cycleLengthMm(cycleAB(10, 5))).toBe(15);
    expect(StrokeDivide.cycleLengthMm([{ lenMm: 3 }, { lenMm: 2, gap: true }])).toBe(5);
    expect(StrokeDivide.cycleLengthMm({ classes: [] })).toBe(0);
    expect(StrokeDivide.cycleLengthMm(null)).toBe(0);
  });
});

describe('StrokeDivide.divideStroke', () => {
  test('divides a 100mm line into draw fragments; gap classes emit nothing', () => {
    const src = line(0, 0, 100, 0);
    const frags = StrokeDivide.divideStroke(src, cycleAB(10, 5));
    // Draw windows: [0,10],[15,25],...,[90,100] — 7 fragments of 10mm.
    expect(frags).toHaveLength(7);
    frags.forEach((f, i) => {
      expect(fragLen(f)).toBeCloseTo(10, 6);
      expect(f[0].x).toBeCloseTo(i * 15, 6);
      expect(f[f.length - 1].x).toBeCloseTo(i * 15 + 10, 6);
      expect(f.meta.penId).toBe('pen-a');
      // Every fragment carries a stable 0-based index within its parent.
      expect(f.meta.fragIndex).toBe(i);
    });
    expect(totalLen(frags)).toBeCloseTo(70, 6);
    // GAPPED cycle: fragments cover only part of the parent, so they must NOT
    // claim it — no parentGeom is stamped (a coincident solid inks the gaps).
    frags.forEach((f) => expect(f.meta.parentGeom).toBeUndefined());
  });

  test('a leading gap class shifts the first fragment inward', () => {
    const cycle = {
      enabled: true,
      phaseMm: 0,
      classes: [
        { lenMm: 5, gap: true },
        { lenMm: 5, penId: 'b' },
      ],
    };
    const frags = StrokeDivide.divideStroke(line(0, 0, 20, 0), cycle);
    expect(frags).toHaveLength(2);
    expect(frags[0][0].x).toBeCloseTo(5, 6);
    expect(frags[0][frags[0].length - 1].x).toBeCloseTo(10, 6);
    expect(frags[1][0].x).toBeCloseTo(15, 6);
    expect(frags[1][frags[1].length - 1].x).toBeCloseTo(20, 6);
  });

  test('adjacent draw classes butt-join: fragments share the cut endpoint exactly', () => {
    const cycle = {
      enabled: true,
      phaseMm: 0,
      classes: [
        { lenMm: 5, penId: 'a' },
        { lenMm: 5, penId: 'b' },
      ],
    };
    const frags = StrokeDivide.divideStroke(line(0, 0, 10, 0), cycle);
    expect(frags).toHaveLength(2);
    const endA = frags[0][frags[0].length - 1];
    const startB = frags[1][0];
    expect(startB.x).toBe(endA.x);
    expect(startB.y).toBe(endA.y);
    expect(frags[0].meta.penId).toBe('a');
    expect(frags[1].meta.penId).toBe('b');
  });

  test('null class penId inherits: meta.penId is not written by the divider', () => {
    const src = line(0, 0, 10, 0);
    const frags = StrokeDivide.divideStroke(src, {
      enabled: true,
      classes: [{ lenMm: 4, penId: null }, { lenMm: 2, gap: true }],
    });
    expect(frags.length).toBeGreaterThan(0);
    frags.forEach((f) => {
      expect(f.meta.penId).toBeUndefined();
    });
  });

  test('parent meta is shallow-copied minus anchors/forceCurves; other keys survive', () => {
    const src = line(0, 0, 10, 0);
    src.meta = {
      anchors: [{ x: 0, y: 0, in: null, out: { x: 1, y: 0 } }],
      forceCurves: true,
      penId: 'parent-pen',
      custom: 'kept',
    };
    const frags = StrokeDivide.divideStroke(src, cycleAB(4, 2, null));
    expect(frags.length).toBeGreaterThan(0);
    frags.forEach((f) => {
      expect(f.meta.anchors).toBeUndefined();
      expect(f.meta.forceCurves).toBeUndefined();
      expect(f.meta.custom).toBe('kept');
      // Inherit (class penId null): the parent's own meta.penId is retained.
      expect(f.meta.penId).toBe('parent-pen');
    });
  });

  test('disabled config returns the input unchanged (same reference)', () => {
    const src = line(0, 0, 10, 0);
    const out = StrokeDivide.divideStroke(src, { enabled: false, classes: [{ lenMm: 2 }] });
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(src);
  });

  test('total cycle length below epsilon returns the input unchanged', () => {
    const src = line(0, 0, 10, 0);
    const out = StrokeDivide.divideStroke(src, { enabled: true, classes: [{ lenMm: 0 }, { lenMm: 0, gap: true }] });
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(src);
  });

  test('zero-length classes are skipped without a divide-by-zero', () => {
    const withZero = StrokeDivide.divideStroke(line(0, 0, 30, 0), {
      enabled: true,
      classes: [{ lenMm: 0, penId: 'z' }, { lenMm: 10, penId: 'a' }, { lenMm: 5, gap: true }],
    });
    const without = StrokeDivide.divideStroke(line(0, 0, 30, 0), cycleAB(10, 5));
    expect(withZero.map((f) => f.map((p) => [p.x, p.y]))).toEqual(
      without.map((f) => f.map((p) => [p.x, p.y]))
    );
  });

  test('phase offsets the cycle; negative phase normalizes into [0, cycleLen)', () => {
    // Cycle 15 (draw 10 / gap 5), phase 5: starts 5mm INTO the draw class.
    const shifted = StrokeDivide.divideStroke(line(0, 0, 40, 0), {
      enabled: true,
      phaseMm: 5,
      classes: [{ lenMm: 10, penId: 'a' }, { lenMm: 5, gap: true }],
    });
    expect(shifted[0][0].x).toBeCloseTo(0, 6);
    expect(shifted[0][shifted[0].length - 1].x).toBeCloseTo(5, 6);
    expect(shifted[1][0].x).toBeCloseTo(10, 6);
    expect(shifted[1][shifted[1].length - 1].x).toBeCloseTo(20, 6);

    const negative = StrokeDivide.divideStroke(line(0, 0, 40, 0), {
      enabled: true,
      phaseMm: -10, // ≡ +5 mod 15
      classes: [{ lenMm: 10, penId: 'a' }, { lenMm: 5, gap: true }],
    });
    expect(negative).toEqual(shifted);
  });

  test('path shorter than the first class yields a single truncated fragment', () => {
    const frags = StrokeDivide.divideStroke(line(0, 0, 5, 0), cycleAB(10, 5));
    expect(frags).toHaveLength(1);
    expect(fragLen(frags[0])).toBeCloseTo(5, 6);
    expect(frags[0].meta.penId).toBe('pen-a');
  });

  test('closed path wraps once with a butt-join at the seam', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
    ];
    square.meta = { closed: true };
    // Perimeter 40, draw 15 / gap 5: draws [0,15] and [20,35].
    const frags = StrokeDivide.divideStroke(square, cycleAB(15, 5));
    expect(frags).toHaveLength(2);
    expect(frags[0][0]).toEqual({ x: 0, y: 0 });
    const endA = frags[0][frags[0].length - 1];
    expect(endA.x).toBeCloseTo(10, 6);
    expect(endA.y).toBeCloseTo(5, 6);
    const endB = frags[1][frags[1].length - 1];
    expect(endB.x).toBeCloseTo(0, 6);
    expect(endB.y).toBeCloseTo(5, 6);
    // Fragments are open spans — the parent's closed flag must not survive,
    // or renderers would seam-close each fragment.
    frags.forEach((f) => expect(f.meta.closed).toBeUndefined());
  });

  test('circle-meta paths flatten to a polygon and divide along the circumference', () => {
    const circle = [];
    circle.meta = { kind: 'circle', cx: 0, cy: 0, r: 10 };
    // Circumference ≈ 62.83; draw 10 / gap 10 → 4 draw windows (last truncated).
    const frags = StrokeDivide.divideStroke(circle, cycleAB(10, 10));
    expect(frags).toHaveLength(4);
    frags.forEach((f) => {
      expect(f.length).toBeGreaterThanOrEqual(2);
      expect(f.meta.kind).toBeUndefined();
      // Every fragment point sits on the radius-10 circle.
      f.forEach((p) => expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 2));
    });
    expect(totalLen(frags)).toBeCloseTo(10 + 10 + 10 + (62.83 - 60), 0);
  });

  test('determinism: two runs produce deep-equal output', () => {
    const mk = () => {
      const p = line(3, 7, 90, 41);
      p.meta = { penId: 'p1' };
      return p;
    };
    const a = StrokeDivide.divideStroke(mk(), cycleAB(7.3, 2.1));
    const b = StrokeDivide.divideStroke(mk(), cycleAB(7.3, 2.1));
    expect(a).toEqual(b);
  });

  test('parentGeom keys direction-agnostically: a reversed parent keys identically', () => {
    // Gapless single-pen cycle -> the fragments claim the parent (parentGeom).
    const gapless = { enabled: true, phaseMm: 0, classes: [{ lenMm: 10, penId: 'a' }] };
    const fwd = line(0, 0, 50, 0);
    const rev = line(50, 0, 0, 0);
    const a = StrokeDivide.divideStroke(fwd, gapless);
    const b = StrokeDivide.divideStroke(rev, gapless);
    expect(Array.isArray(a[0].meta.parentGeom)).toBe(true);
    const keyA = StrokeDivide.parentKeyFromGeom(a[0].meta.parentGeom);
    const keyB = StrokeDivide.parentKeyFromGeom(b[0].meta.parentGeom);
    expect(keyA).toBe(keyB);
  });

  test('gapless single-pen cycle stamps parentGeom (claiming) on every fragment', () => {
    const gapless = { enabled: true, phaseMm: 0, classes: [{ lenMm: 10, penId: 'a' }] };
    const frags = StrokeDivide.divideStroke(line(0, 0, 50, 0), gapless);
    expect(frags).toHaveLength(5);
    frags.forEach((f, i) => {
      expect(f.meta.fragIndex).toBe(i);
      expect(Array.isArray(f.meta.parentGeom)).toBe(true);
    });
    // One shared parent-geometry reference across all claiming siblings.
    expect(new Set(frags.map((f) => f.meta.parentGeom)).size).toBe(1);
  });

  test('multi-pen gapless cycle does NOT claim (fragments split across pens)', () => {
    const multiPen = {
      enabled: true,
      phaseMm: 0,
      classes: [
        { lenMm: 10, penId: 'a' },
        { lenMm: 10, penId: 'b' },
      ],
    };
    const frags = StrokeDivide.divideStroke(line(0, 0, 40, 0), multiPen);
    // 4 fragments alternating pen a/b — gapless but multi-pen, so no claim.
    expect(frags.length).toBeGreaterThan(1);
    frags.forEach((f) => expect(f.meta.parentGeom).toBeUndefined());
  });

  test('out-and-back parent: both retracing siblings get distinct indices', () => {
    const gapless = { enabled: true, phaseMm: 0, classes: [{ lenMm: 10, penId: 'a' }] };
    // (0,0)->(10,0)->(0,0): two 10mm fragments with identical (reversed) geometry.
    const frags = StrokeDivide.divideStroke([
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 },
    ], gapless);
    expect(frags).toHaveLength(2);
    expect(frags[0].meta.fragIndex).toBe(0);
    expect(frags[1].meta.fragIndex).toBe(1);
    // Same parent key (both claim), distinct indices keep both alive downstream.
    const k0 = StrokeDivide.parentKeyFromGeom(frags[0].meta.parentGeom);
    const k1 = StrokeDivide.parentKeyFromGeom(frags[1].meta.parentGeom);
    expect(k0).toBe(k1);
    expect(frags[0].meta.fragIndex).not.toBe(frags[1].meta.fragIndex);
  });

  test('pathological tiny classes hit the fragment cap instead of hanging', () => {
    const src = line(0, 0, 1000, 0);
    const frags = StrokeDivide.divideStroke(src, {
      enabled: true,
      classes: [{ lenMm: 0.001, penId: 'a' }],
    });
    expect(frags.length).toBeLessThanOrEqual(100001);
    // The full geometry still comes out — nothing is silently dropped.
    expect(totalLen(frags)).toBeCloseTo(1000, 3);
  });
});

describe('StrokeDivide.divideChain', () => {
  test('the cycle continues across joins — no reset per path', () => {
    // Two 10mm paths, draw 15 / gap 5 over a 20mm chain domain:
    // draw [0,15] spans path1 fully + 5mm of path2; gap [15,20].
    const p1 = line(0, 0, 10, 0);
    const p2 = line(10, 0, 20, 0);
    const frags = StrokeDivide.divideChain([p1, p2], cycleAB(15, 5));
    expect(frags).toHaveLength(2);
    expect(fragLen(frags[0])).toBeCloseTo(10, 6);
    expect(fragLen(frags[1])).toBeCloseTo(5, 6);
    // Fragments never span a join (butt-join, no overlap).
    expect(frags[0][frags[0].length - 1].x).toBeCloseTo(10, 6);
    expect(frags[1][0].x).toBeCloseTo(10, 6);
    // fragIndex is per-parent (0-based), so each fragment restarts at its own
    // parent — both are the first fragment of their respective source path.
    expect(frags[0].meta.fragIndex).toBe(0);
    expect(frags[1].meta.fragIndex).toBe(0);
  });

  test('disabled or empty cycle returns the input array unchanged', () => {
    const paths = [line(0, 0, 10, 0)];
    expect(StrokeDivide.divideChain(paths, { enabled: false, classes: [{ lenMm: 1 }] })).toBe(paths);
    expect(StrokeDivide.divideChain(paths, { enabled: true, classes: [] })).toBe(paths);
  });

  test('degenerate (single-point) paths pass through and do not advance the cycle', () => {
    const dot = [{ x: 5, y: 5 }];
    const p2 = line(0, 0, 10, 0);
    const frags = StrokeDivide.divideChain([dot, p2], cycleAB(6, 4));
    expect(frags[0]).toBe(dot);
    // p2 still divides from cycle position 0: draw [0,6].
    expect(fragLen(frags[1])).toBeCloseTo(6, 6);
  });
});

describe('StrokeDivide runtime registration', () => {
  let runtime;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
  });

  afterAll(() => {
    runtime.cleanup();
  });

  test('index.html loads the module onto window.Vectura.StrokeDivide before the engine', () => {
    const SD = runtime.window.Vectura.StrokeDivide;
    expect(SD).toBeTruthy();
    expect(typeof SD.sanitizeDivisions).toBe('function');
    expect(typeof SD.cycleLengthMm).toBe('function');
    expect(typeof SD.divideStroke).toBe('function');
    expect(typeof SD.divideChain).toBe('function');
  });

  test('anchor-carrying paths flatten before measuring: fragments drop anchors', () => {
    const SD = runtime.window.Vectura.StrokeDivide;
    // A gentle bezier arch — the point array is a sparse cache; the anchors
    // are the true geometry. Division must flatten first (project rule).
    const src = [
      { x: 0, y: 0 },
      { x: 25, y: 10 },
      { x: 50, y: 0 },
    ];
    src.meta = {
      anchors: [
        { x: 0, y: 0, in: null, out: { x: 10, y: 8 } },
        { x: 25, y: 10, in: { x: 18, y: 10 }, out: { x: 32, y: 10 } },
        { x: 50, y: 0, in: { x: 40, y: 8 }, out: null },
      ],
    };
    const frags = SD.divideStroke(src, cycleAB(8, 4));
    expect(frags.length).toBeGreaterThan(1);
    frags.forEach((f) => {
      expect(f.meta.anchors).toBeUndefined();
      expect(f.length).toBeGreaterThanOrEqual(2);
    });
    // Flattened arc is denser than the 3-point cache — draw fragments follow it.
    expect(totalLen(frags)).toBeGreaterThan(30);
  });

  // Third flattened source class: plain sparse polylines on curves-on layers.
  // The renderer smooths these at draw time (no anchors), so the divider must
  // measure along the smoothed curve and pin fragments straight — otherwise
  // class lengths shortchange the drawn curve and each fragment re-smooths
  // independently with mismatched tangents at the cuts.
  const wavyPolyline = () => {
    const src = [
      { x: 0, y: 0 },
      { x: 10, y: 14 },
      { x: 20, y: -14 },
      { x: 30, y: 14 },
      { x: 40, y: 0 },
    ];
    src.meta = {};
    return src;
  };
  const chordLenOf = (pts) => {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return len;
  };

  test('curves-on layers: plain polylines flatten before measuring, fragments pinned straight', () => {
    const SD = runtime.window.Vectura.StrokeDivide;
    const frags = SD.divideChain([wavyPolyline()], cycleAB(9, 3), { useCurves: true });
    expect(frags.length).toBeGreaterThan(1);
    frags.forEach((f) => {
      expect(f.meta.straight).toBe(true);
    });
    // The smoothed curve's length differs from the raw chords — flattened
    // measurement must track the drawn curve, not the chord domain.
    const chordLen = chordLenOf(wavyPolyline());
    const chordFrags = SD.divideChain([wavyPolyline()], cycleAB(9, 3));
    expect(totalLen(frags)).not.toBeCloseTo(totalLen(chordFrags), 0);
    const drawnRatio = totalLen(frags) / chordLen;
    expect(Math.abs(drawnRatio - (9 / 12))).toBeLessThan(0.25);
  });

  test('curves-off layers: plain polylines measure along chords, no straight tag', () => {
    const SD = runtime.window.Vectura.StrokeDivide;
    const frags = SD.divideChain([wavyPolyline()], cycleAB(9, 3));
    expect(frags.length).toBeGreaterThan(1);
    frags.forEach((f) => {
      expect(f.meta.straight).toBeUndefined();
    });
    // Non-gap coverage tracks 9/12 of the chord domain (last window truncates).
    const chordLen = chordLenOf(wavyPolyline());
    const drawn = totalLen(frags);
    expect(Math.abs(drawn / chordLen - (9 / 12))).toBeLessThan(0.05);
  });
});
