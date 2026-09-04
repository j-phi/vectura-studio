/*
 * Phase 4A Inc-3 — deferred division grammar (weighted-random pen + phaseMode +
 * arc-length continuity across divideChain seams).
 *
 * Schema additions (all default to NO-OP):
 *   division:  penMode 'cycle'|'weighted' (default 'cycle'),
 *              phaseMode 'fixed'|'perPath'|'jitter' (default 'fixed'),
 *              seed number (default 0)
 *   class:     weight number (default 1)
 *
 * Determinism (contract A-17): weighted pen + jitter offsets come from a
 * deterministic seeded hash of (seed, pathIndex, fragIndex) — NO Math.random /
 * Date.now. Same document -> identical plot on every run.
 */
const path = require('path');
const StrokeDivide = require(path.resolve(__dirname, '../..', 'src/core/stroke-divide.js'));

const line = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y1 }];
const fragLen = (frag) => {
  let len = 0;
  for (let i = 1; i < frag.length; i++) len += Math.hypot(frag[i].x - frag[i - 1].x, frag[i].y - frag[i - 1].y);
  return len;
};
const totalLen = (frags) => frags.reduce((s, f) => s + fragLen(f), 0);
const coords = (frags) => frags.map((f) => f.map((p) => [p.x, p.y]));
const pens = (frags) => frags.map((f) => (f.meta ? f.meta.penId : undefined));

describe('Inc-3 sanitizeDivisions — new fields accepted + defaulted (no-op)', () => {
  test('an old bag gains penMode:cycle, phaseMode:fixed, seed:0, weight:1', () => {
    const s = StrokeDivide.sanitizeDivisions({
      enabled: true,
      phaseMm: 0,
      classes: [{ lenMm: 10, penId: 'pen-a' }, { lenMm: 5, gap: true }],
    });
    expect(s.penMode).toBe('cycle');
    expect(s.phaseMode).toBe('fixed');
    expect(s.seed).toBe(0);
    expect(s.classes.map((c) => c.weight)).toEqual([1, 1]);
  });

  test('unknown modes fall back to the safe default; weight clamps non-finite/negative to 1', () => {
    const s = StrokeDivide.sanitizeDivisions({
      enabled: true,
      penMode: 'bogus',
      phaseMode: 'nope',
      seed: 3.9,
      classes: [
        { lenMm: 1, weight: 4 },
        { lenMm: 1, weight: -2 },
        { lenMm: 1, weight: NaN },
      ],
    });
    expect(s.penMode).toBe('cycle');
    expect(s.phaseMode).toBe('fixed');
    expect(s.seed).toBe(3); // truncated to an integer
    expect(s.classes.map((c) => c.weight)).toEqual([4, 1, 1]);
  });

  test('valid modes survive normalization', () => {
    const s = StrokeDivide.sanitizeDivisions({ penMode: 'weighted', phaseMode: 'jitter', seed: 7 });
    expect(s.penMode).toBe('weighted');
    expect(s.phaseMode).toBe('jitter');
    expect(s.seed).toBe(7);
  });
});

describe('Inc-3 no-op default pin — cycle+fixed output byte-identical', () => {
  test('adding the grammar fields does not change a cycle+fixed divide', () => {
    const oldBag = {
      enabled: true, phaseMm: 0,
      classes: [{ lenMm: 10, penId: 'pen-a' }, { lenMm: 5, gap: true }],
    };
    const explicitBag = {
      enabled: true, phaseMm: 0, penMode: 'cycle', phaseMode: 'fixed', seed: 0,
      classes: [{ lenMm: 10, penId: 'pen-a', weight: 1 }, { lenMm: 5, gap: true, weight: 1 }],
    };
    const a = StrokeDivide.divideChain([line(0, 0, 100, 0)], oldBag);
    const b = StrokeDivide.divideChain([line(0, 0, 100, 0)], explicitBag);
    expect(coords(a)).toEqual(coords(b));
    expect(pens(a)).toEqual(pens(b));
    // Golden: 7 draw fragments of 10mm on pen-a at x = i*15.
    expect(a).toHaveLength(7);
    a.forEach((f, i) => {
      expect(f[0].x).toBeCloseTo(i * 15, 6);
      expect(fragLen(f)).toBeCloseTo(10, 6);
      expect(f.meta.penId).toBe('pen-a');
    });
  });
});

describe('Inc-3 weighted penMode — deterministic weighted pen assignment', () => {
  const longStroke = () => line(0, 0, 1000, 0);
  const weightedBag = (wa, wb, seed = 0) => ({
    enabled: true, phaseMm: 0, penMode: 'weighted', seed,
    classes: [
      { lenMm: 10, penId: 'pen-a', weight: wa },
      { lenMm: 10, penId: 'pen-b', weight: wb },
    ],
  });
  const countPens = (frags) => frags.reduce((acc, f) => {
    const p = f.meta.penId; acc[p] = (acc[p] || 0) + 1; return acc;
  }, {});

  test('fragments spread across BOTH pens (not the strict class cycle)', () => {
    const frags = StrokeDivide.divideChain([longStroke()], weightedBag(1, 3));
    const c = countPens(frags);
    expect(c['pen-a']).toBeGreaterThan(0);
    expect(c['pen-b']).toBeGreaterThan(0);
    // 100 fragments over a 1000mm stroke (cycle 20mm).
    expect(frags.length).toBe(100);
  });

  test('a heavier weight wins more fragments over a long stroke', () => {
    const c = ((frags) => frags.reduce((a, f) => { const p = f.meta.penId; a[p] = (a[p] || 0) + 1; return a; }, {}))(
      StrokeDivide.divideChain([longStroke()], weightedBag(1, 3))
    );
    expect(c['pen-b']).toBeGreaterThan(c['pen-a']);
    // Flipping the weights flips the majority.
    const c2 = ((frags) => frags.reduce((a, f) => { const p = f.meta.penId; a[p] = (a[p] || 0) + 1; return a; }, {}))(
      StrokeDivide.divideChain([longStroke()], weightedBag(3, 1))
    );
    expect(c2['pen-a']).toBeGreaterThan(c2['pen-b']);
  });

  test('DETERMINISTIC: two runs produce an identical pen sequence', () => {
    const a = pens(StrokeDivide.divideChain([longStroke()], weightedBag(1, 3)));
    const b = pens(StrokeDivide.divideChain([longStroke()], weightedBag(1, 3)));
    expect(a).toEqual(b);
  });

  test('the seed changes the sequence deterministically', () => {
    const a = pens(StrokeDivide.divideChain([longStroke()], weightedBag(1, 3, 0)));
    const b = pens(StrokeDivide.divideChain([longStroke()], weightedBag(1, 3, 999)));
    expect(a).not.toEqual(b);
    // ...but each seed is itself reproducible.
    const b2 = pens(StrokeDivide.divideChain([longStroke()], weightedBag(1, 3, 999)));
    expect(b).toEqual(b2);
  });

  test('weighted fragments are multi-pen -> they do NOT claim the parent (no parentGeom)', () => {
    // Gapless single-cycle weighted over a stroke that lands on >1 pen.
    const frags = StrokeDivide.divideChain([longStroke()], weightedBag(1, 1));
    const distinctPens = new Set(frags.map((f) => f.meta.penId));
    expect(distinctPens.size).toBeGreaterThan(1);
    frags.forEach((f) => expect(f.meta.parentGeom).toBeUndefined());
  });
});

describe('Inc-3 phaseMode — fixed vs perPath vs jitter', () => {
  // Two 10mm sub-paths; cycle draw15 / gap5 (cycle 20mm).
  const twoPaths = () => [line(0, 0, 10, 0), line(10, 0, 20, 0)];
  const bag = (phaseMode, seed = 0) => ({
    enabled: true, phaseMm: 0, phaseMode, seed,
    classes: [{ lenMm: 15, penId: 'pen-a' }, { lenMm: 5, gap: true }],
  });

  test('fixed: the ruler runs continuously across the seam (drawn = 15mm)', () => {
    const frags = StrokeDivide.divideChain(twoPaths(), bag('fixed'));
    // draw[0,15] -> path1 [0,10] + path2 [10,15]; gap[15,20] emits nothing.
    expect(totalLen(frags)).toBeCloseTo(15, 6);
  });

  test('perPath: each sub-path restarts the ruler (drawn = 20mm, differs from fixed)', () => {
    const fixed = StrokeDivide.divideChain(twoPaths(), bag('fixed'));
    const perPath = StrokeDivide.divideChain(twoPaths(), bag('perPath'));
    // Each 10mm path draws entirely (draw class 15 > 10): 10 + 10 = 20mm.
    expect(totalLen(perPath)).toBeCloseTo(20, 6);
    expect(coords(perPath)).not.toEqual(coords(fixed));
    // Deterministic.
    expect(coords(perPath)).toEqual(coords(StrokeDivide.divideChain(twoPaths(), bag('perPath'))));
  });

  test('jitter: a deterministic per-path offset, differs from fixed, reproducible', () => {
    const fixed = StrokeDivide.divideChain(twoPaths(), bag('fixed'));
    const jitter = StrokeDivide.divideChain(twoPaths(), bag('jitter', 5));
    expect(coords(jitter)).not.toEqual(coords(fixed));
    // Same seed -> identical.
    expect(coords(jitter)).toEqual(coords(StrokeDivide.divideChain(twoPaths(), bag('jitter', 5))));
    // Different seed -> (generally) different offsets.
    const jitter2 = StrokeDivide.divideChain(twoPaths(), bag('jitter', 41));
    expect(coords(jitter2)).toEqual(coords(StrokeDivide.divideChain(twoPaths(), bag('jitter', 41))));
  });
});

describe('Inc-3 arc-length continuity across a divideChain seam (fixed)', () => {
  test('a stroke split into sub-paths dashes as ONE continuous ruler', () => {
    // 4 x 10mm sub-paths; draw10 / gap10 -> draws [0,10],[20,30] across the
    // 40mm chain, i.e. sub-path 0 fully, sub-path 2 fully, 1 and 3 blanked.
    const paths = [line(0, 0, 10, 0), line(10, 0, 20, 0), line(20, 0, 30, 0), line(30, 0, 40, 0)];
    const frags = StrokeDivide.divideChain(paths, {
      enabled: true, phaseMm: 0, phaseMode: 'fixed',
      classes: [{ lenMm: 10, penId: 'pen-a' }, { lenMm: 10, gap: true }],
    });
    // Only two draw windows survive (continuous ruler), not one-per-subpath.
    expect(frags).toHaveLength(2);
    expect(frags[0][0].x).toBeCloseTo(0, 6);
    expect(frags[0][frags[0].length - 1].x).toBeCloseTo(10, 6);
    expect(frags[1][0].x).toBeCloseTo(20, 6);
    expect(frags[1][frags[1].length - 1].x).toBeCloseTo(30, 6);
  });
});
