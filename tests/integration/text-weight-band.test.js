/*
 * Built-in banded bold (v1.2.27) — REAL text-pipeline integration coverage.
 *
 * The monoline face's heavy weights used to draw N independent parallel offset
 * copies of every stroke, so junctions (a t crossbar, the e bar/bowl) drew a
 * lattice of crossing, doubled-ink passes and open terminals splayed uncapped.
 * The banded bold sweeps each glyph's strokes into ONE boolean band of width
 * thickness·penW, fills it with concentric erosion passes spaced
 * penW·(1 − inkOverlap), and stitches them into continuous snakes.
 *
 * RGR red/green is demonstrated IN-SUITE: the same skeleton thickened with the
 * legacy engine (GU.thickenPathsUniform — still the styleMode/headless fallback)
 * must show crossings at the junction, while the shipped pipeline shows none.
 * The spine-coverage test goes RED if the deepest near-collapse pass is trusted
 * for coverage again (the reliableInset fix), and the inkOverlap test goes RED
 * if the param stops driving pass spacing.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Built-in banded bold — real text pipeline', () => {
  let runtime;
  let V;
  let GU;
  let gen;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    GU = V.GeometryUtils;
    gen = V.AlgorithmRegistry.text.generate;
  });

  afterAll(() => runtime.cleanup());

  const PEN = 0.35;
  const bounds = { width: 220, height: 220, m: 10, dW: 200, dH: 200, penWidth: PEN };
  const params = (over) => Object.assign({
    text: 't', font: 'sans', fitToFrame: false, fontSize: 40,
    jitter: 0, align: 'left', fontWeight: 'Bold',
  }, over);
  const strokesOf = (out) => out.filter((p) => Array.isArray(p) && p.length >= 2);

  // Proper segment crossing (shared endpoints / touches excluded).
  const segCross = (ax, ay, bx, by, cx, cy, dx, dy) => {
    const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
    const s1 = o(ax, ay, bx, by, cx, cy);
    const s2 = o(ax, ay, bx, by, dx, dy);
    const s3 = o(cx, cy, dx, dy, ax, ay);
    const s4 = o(cx, cy, dx, dy, bx, by);
    return s1 !== s2 && s3 !== s4 && s1 !== 0 && s2 !== 0 && s3 !== 0 && s4 !== 0;
  };
  const countCrossings = (paths) => {
    let n = 0;
    for (let a = 0; a < paths.length; a += 1) {
      for (let b = a; b < paths.length; b += 1) {
        const A = paths[a]; const B = paths[b];
        for (let i = 1; i < A.length; i += 1) {
          for (let j = (a === b ? i + 2 : 1); j < B.length; j += 1) {
            if (segCross(A[i - 1].x, A[i - 1].y, A[i].x, A[i].y, B[j - 1].x, B[j - 1].y, B[j].x, B[j].y)) n += 1;
          }
        }
      }
    }
    return n;
  };

  // Sorted y-crossings of a vertical scanline with every path.
  const scan = (paths, X) => {
    const hits = [];
    for (const p of paths) {
      for (let i = 1; i < p.length; i += 1) {
        const a = p[i - 1]; const b = p[i];
        if ((a.x <= X) === (b.x <= X)) continue;
        hits.push(a.y + ((X - a.x) / (b.x - a.x)) * (b.y - a.y));
      }
    }
    return hits.sort((u, v) => u - v);
  };

  test("junction glyph 't' Bold: zero crossing passes (legacy engine: many)", () => {
    const banded = strokesOf(gen(params(), null, null, bounds));
    expect(banded.length).toBeGreaterThan(0);
    expect(countCrossings(banded)).toBe(0);
    // Legacy demonstration on the SAME skeleton — this is what the old bold
    // plotted and why the junction showed a lattice of doubled ink.
    const reg = strokesOf(gen(params({ fontWeight: 'Regular' }), null, null, bounds));
    const legacy = GU.thickenPathsUniform(
      reg.map((p) => p.map((q) => ({ x: q.x, y: q.y }))),
      { width: 8, spacing: PEN }
    );
    expect(countCrossings(legacy)).toBeGreaterThan(10);
  });

  test('Bold band is gapless: no adjacent-pass centreline gap exceeds the pen width', () => {
    // 'e' exercises the hardest case — bowls, a junction, and the near-collapse
    // spine (RED without the reliableInset skeleton fix: gap ≈ 2× spacing).
    const paths = strokesOf(gen(params({ text: 'e' }), null, null, bounds));
    let mnx = Infinity; let mxx = -Infinity; let mny = Infinity; let mxy = -Infinity;
    paths.forEach((p) => p.forEach((q) => {
      if (q.x < mnx) mnx = q.x; if (q.x > mxx) mxx = q.x;
      if (q.y < mny) mny = q.y; if (q.y > mxy) mxy = q.y;
    }));
    // Sample several verticals through the glyph body; within each inked band
    // (crossings closer than 2·penW group together), adjacent centrelines must
    // sit within penW + slack of each other for the pen to fully tile the band.
    const SLACK = PEN * 0.35; // simplify tol + boolean facets, well under a visible gap
    for (const fx of [0.3, 0.4, 0.5, 0.6, 0.7]) {
      const hits = scan(paths, mnx + (mxx - mnx) * fx);
      expect(hits.length).toBeGreaterThan(1);
      for (let i = 1; i < hits.length; i += 1) {
        const gap = hits[i] - hits[i - 1];
        if (gap >= 2 * PEN) continue; // crossed into another band / the counter
        expect(gap).toBeLessThanOrEqual(PEN + SLACK);
      }
    }
  });

  test('inkOverlap drives pass spacing: tighter overlap → more passes', () => {
    const loose = strokesOf(gen(params({ text: 'l', inkOverlap: 0 }), null, null, bounds));
    const dense = strokesOf(gen(params({ text: 'l', inkOverlap: 50 }), null, null, bounds));
    let mnxL = Infinity; let mxxL = -Infinity;
    loose.forEach((p) => p.forEach((q) => { if (q.x < mnxL) mnxL = q.x; if (q.x > mxxL) mxxL = q.x; }));
    const mid = (mnxL + mxxL) / 2;
    // Horizontal scanline through the stem: dense spacing crosses more lines.
    const hscan = (paths, Y) => {
      let n = 0;
      for (const p of paths) {
        for (let i = 1; i < p.length; i += 1) {
          if ((p[i - 1].y <= Y) !== (p[i].y <= Y)) n += 1;
        }
      }
      return n;
    };
    let mnyL = Infinity; let mxyL = -Infinity;
    loose.forEach((p) => p.forEach((q) => { if (q.y < mnyL) mnyL = q.y; if (q.y > mxyL) mxyL = q.y; }));
    const Y = (mnyL + mxyL) / 2;
    expect(hscan(dense, Y)).toBeGreaterThan(hscan(loose, Y));
    expect(mid).toBeGreaterThan(0); // silence unused-var lint intent
  });

  test('snake stitching: Bold stem emits a handful of continuous paths, not 8 copies', () => {
    const paths = strokesOf(gen(params({ text: 'l' }), null, null, bounds));
    // Legacy emitted `thickness` (8) parallel copies per stroke; the banded
    // snake stitches concentric rings into very few continuous polylines.
    expect(paths.length).toBeLessThan(6);
    const total = paths.reduce((s, p) => s + p.length, 0);
    const longest = Math.max(...paths.map((p) => p.length));
    expect(longest / total).toBeGreaterThan(0.5); // one dominant snake carries most ink
  });

  test('deterministic and cache-transparent: repeated generates are identical', () => {
    const a = strokesOf(gen(params({ text: 'ee' }), null, null, bounds));
    const b = strokesOf(gen(params({ text: 'ee' }), null, null, bounds));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    // Both 'e' instances are the same letterform translated: their path sets
    // must match point-for-point under translation (catches cache-translation
    // bugs). Split by the midpoint between the glyph advances.
    let mnx = Infinity; let mxx = -Infinity;
    a.forEach((p) => p.forEach((q) => { if (q.x < mnx) mnx = q.x; if (q.x > mxx) mxx = q.x; }));
    const midX = (mnx + mxx) / 2;
    const left = a.filter((p) => p.every((q) => q.x < midX));
    const right = a.filter((p) => p.every((q) => q.x >= midX));
    expect(left.length).toBe(right.length);
    const norm = (paths) => {
      let bx = Infinity; let by = Infinity;
      paths.forEach((p) => p.forEach((q) => { if (q.x < bx) bx = q.x; if (q.y < by) by = q.y; }));
      return paths
        .map((p) => p.map((q) => `${(q.x - bx).toFixed(4)},${(q.y - by).toFixed(4)}`).join(' '))
        .sort()
        .join('|');
    };
    expect(norm(right)).toBe(norm(left));
  });
});
