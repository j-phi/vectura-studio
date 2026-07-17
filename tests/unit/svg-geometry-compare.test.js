/*
 * Trust tests for the loosened SVG comparator (tests/helpers/svg-geometry-compare.js).
 *
 * The curve baselines switched from byte-exact string equality to geometric
 * equality within a tolerance, because the curve fitter places float-sensitive
 * anchors that differ between macOS and CI's Linux for the SAME visual curve. A
 * tolerant comparator is only safe if it still FAILS on a real regression — these
 * tests pin both directions so the loosening can't quietly become a rubber stamp.
 */
const { compareSvgGeometry, flattenPathData, resample } = require('../helpers/svg-geometry-compare');

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">\n${body}\n</svg>\n`;
const CURVE = svg('<path d="M 20.000 100.000 C 40.000 40.000 160.000 40.000 180.000 100.000" />');

// Nudge every number in a path by up to `mag` units — simulates the cross-platform
// float drift the tolerance exists to absorb.
const jitter = (s, mag) => {
  let i = 0;
  return s.replace(/(\d+\.\d+)/g, (t) => {
    i++;
    const sign = i % 2 ? 1 : -1;
    return (parseFloat(t) + sign * mag).toFixed(3);
  });
};

describe('svg geometry comparator — tolerates float drift', () => {
  test('identical SVGs compare equal', () => {
    expect(compareSvgGeometry(CURVE, CURVE).ok).toBe(true);
  });

  test('sub-unit anchor drift (the cross-platform case) compares equal', () => {
    const drifted = jitter(CURVE, 0.9);
    expect(compareSvgGeometry(drifted, CURVE).ok).toBe(true);
  });

  test('a differently-anchored but same-shape curve compares equal', () => {
    // The same arc, expressed as ONE cubic vs TWO — what the fitter's corner/RDP
    // thresholds actually produce differently across platforms.
    const oneCubic = svg('<path d="M 20.000 100.000 C 40.000 40.000 160.000 40.000 180.000 100.000" />');
    const twoCubics = svg(
      '<path d="M 20.000 100.000 C 30.000 70.000 55.000 55.000 100.000 55.000 '
      + 'C 145.000 55.000 170.000 70.000 180.000 100.000" />'
    );
    // These trace nearly the same shallow arch; within tolerance they are "the same".
    expect(compareSvgGeometry(twoCubics, oneCubic, { absTol: 6 }).ok).toBe(true);
  });
});

describe('svg geometry comparator — still catches real regressions', () => {
  test('a removed path fails (element count)', () => {
    const two = svg('<path d="M 0 0 L 10 10" />\n<path d="M 20 20 L 30 30" />');
    const one = svg('<path d="M 0 0 L 10 10" />');
    expect(compareSvgGeometry(one, two).ok).toBe(false);
  });

  test('an element type change fails (path vs circle)', () => {
    const asPath = svg('<path d="M 20 100 C 40 40 160 40 180 100" />');
    const asCircle = svg('<circle cx="100" cy="100" r="80" />');
    expect(compareSvgGeometry(asCircle, asPath).ok).toBe(false);
  });

  test('a curve flattened to a straight chord fails (mid-curve deviation)', () => {
    const curved = svg('<path d="M 20.000 100.000 C 40.000 40.000 160.000 40.000 180.000 100.000" />');
    const straight = svg('<path d="M 20.000 100.000 L 180.000 100.000" />');
    // The arch bows ~45 units off the chord at its middle — far beyond tolerance.
    expect(compareSvgGeometry(straight, curved).ok).toBe(false);
  });

  test('geometry shifted well beyond float noise fails', () => {
    const shifted = jitter(CURVE, 25);
    expect(compareSvgGeometry(shifted, CURVE).ok).toBe(false);
  });

  test('a genuinely different shape fails', () => {
    const arch = svg('<path d="M 20 100 C 40 40 160 40 180 100" />');
    const wave = svg('<path d="M 20 100 C 60 180 140 20 180 100" />');
    expect(compareSvgGeometry(wave, arch).ok).toBe(false);
  });
});

describe('svg geometry comparator — internals', () => {
  test('flattenPathData samples curves into a dense polyline', () => {
    const pts = flattenPathData('M 0 0 C 0 10 10 10 10 0');
    expect(pts.length).toBeGreaterThan(2);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 10, y: 0 });
  });

  test('resample returns exactly n points along the arc', () => {
    const r = resample([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], 5);
    expect(r).toHaveLength(5);
    expect(r[0].x).toBeCloseTo(0, 5);
    expect(r[4].x).toBeCloseTo(20, 5);
    expect(r[2].x).toBeCloseTo(10, 5);
  });
});
