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

  test("junction glyph 't' Bold: crossing passes eliminated (legacy engine: many)", () => {
    const banded = strokesOf(gen(params(), null, null, bounds));
    expect(banded.length).toBeGreaterThan(0);
    // Concentric rings nest, so crossings vanish — up to a stray hairline where
    // a junction-pocket ring kisses the closing contour, buried inside solid
    // ink. The legacy engine drew a visible LATTICE (dozens of crossings).
    expect(countCrossings(banded)).toBeLessThanOrEqual(2);
    // Legacy demonstration on the SAME skeleton — this is what the old bold
    // plotted and why the junction showed a lattice of doubled ink.
    const reg = strokesOf(gen(params({ fontWeight: 'Regular' }), null, null, bounds));
    const legacy = GU.thickenPathsUniform(
      reg.map((p) => p.map((q) => ({ x: q.x, y: q.y }))),
      { width: 8, spacing: PEN }
    );
    expect(countCrossings(legacy)).toBeGreaterThan(10);
  });

  test('Bold band is gapless: TRUE pen coverage of the whole band region', () => {
    // A scanline test has a blind spot — a missing pass reads as a "gap ≥
    // 2·penW" and gets excused as a counter-crossing (exactly how the
    // erosion-dies-early bug shipped and hollowed the band in-app), and
    // oblique crossings inflate spacing by 1/sinθ. The honest criterion:
    // EVERY point of the intended band region lies within pen reach of drawn
    // ink. 'e' is the hardest case — a curved bowl, a junction pocket deeper
    // than the uniform half-width (which fooled the spine bookkeeping), and a
    // near-collapse spine. RED against the erosion-loss / junction-pocket
    // bugs (3.6% of the band uncovered, holes up to 0.93mm).
    const GUx = V.GeometryUtils;
    const FB = V.FillBoolean;
    // 'e' = curved bowl + junction pocket + near-collapse spine; 'u' = the
    // needle-acute spur whose pocket ring the flat sliver filter used to drop.
    for (const glyph of ['e', 'u']) {
    const reg = strokesOf(gen(params({ text: glyph, fontWeight: 'Regular' }), null, null, bounds));
    // Band the same contour the pipeline bands: curve strokes flatten their
    // emitted native anchors; straight strokes stay raw polylines.
    const strokes = reg.map((p) => {
      if (p.meta && Array.isArray(p.meta.anchors) && GUx.buildPolylineFromAnchors) {
        const poly = GUx.buildPolylineFromAnchors(p.meta.anchors, !!p.meta.closed);
        if (poly && poly.length >= 2) return poly;
      }
      return p.map((q) => ({ x: q.x, y: q.y }));
    });
    const band = GUx.strokeRingsToBand(strokes, 8 * PEN, { boolean: FB });
    expect(band.length).toBeGreaterThan(0);
    const rings = band.flatMap((poly) => poly.map((r) => r));
    const out = strokesOf(gen(params({ text: glyph }), null, null, bounds));
    const inBand = (x, y) => {
      let w = 0;
      for (const r of rings) {
        for (let i = 1; i < r.length; i += 1) {
          const ax = r[i - 1][0]; const ay = r[i - 1][1]; const bx = r[i][0]; const by = r[i][1];
          if (ay <= y) { if (by > y && (bx - ax) * (y - ay) - (by - ay) * (x - ax) > 0) w += 1; }
          else if (by <= y && (bx - ax) * (y - ay) - (by - ay) * (x - ax) < 0) w -= 1;
        }
      }
      return w !== 0;
    };
    const distSq = (x, y) => {
      let d = Infinity;
      for (const p of out) {
        for (let i = 1; i < p.length; i += 1) {
          const ax = p[i - 1].x; const ay = p[i - 1].y; const bx = p[i].x; const by = p[i].y;
          const dx = bx - ax; const dy = by - ay; const l2 = dx * dx + dy * dy;
          let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = x - (ax + t * dx); const ey = y - (ay + t * dy);
          const dd = ex * ex + ey * ey;
          if (dd < d) d = dd;
        }
      }
      return d;
    };
    let mnx = Infinity; let mny = Infinity; let mxx = -Infinity; let mxy = -Infinity;
    rings.forEach((r) => r.forEach(([x, y]) => {
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
    }));
    // Reach = pen radius + tolerance slack (RDP simplify, boolean facets, µm
    // snap). The band is a disk sweep, so in exact geometry NOTHING is out of
    // pen reach (a union of R-disks is fully coverable by any pen ≤ R —
    // including sharp weld corners, which the outer erosion contour rolls
    // into). Residuals are pure discretization; allow a whisker of them but
    // bound their depth hard.
    const REACH_SQ = (PEN / 2 + 0.06) ** 2;
    const HARD_SQ = (PEN / 2 + 0.25) ** 2;
    let samples = 0; let uncovered = 0; let hard = 0;
    for (let y = mny; y <= mxy; y += 0.2) {
      for (let x = mnx; x <= mxx; x += 0.2) {
        if (!inBand(x, y)) continue;
        samples += 1;
        const d = distSq(x, y);
        if (d > REACH_SQ) uncovered += 1;
        if (d > HARD_SQ) hard += 1;
      }
    }
    expect(samples).toBeGreaterThan(2000);
    expect(uncovered / samples).toBeLessThanOrEqual(0.002); // ≤0.2% whisker outliers
    expect(hard).toBe(0); // and never a real hole
    }
  });

  test('engine passes the layer pen width into algorithm bounds', () => {
    // The whole point of inkOverlap is spacing tied to the PHYSICAL pen. The
    // engine's generate() bounds historically omitted penWidth, silently
    // pinning every in-app band to the 0.35 fallback. RED without the
    // engine.js bounds plumbing.
    const eng = new V.VectorEngine();
    V.SETTINGS.pens[0].width = 0.7;
    try {
      const id = eng.addLayer('text');
      const l = eng.getLayerById(id);
      Object.assign(l.params, params({ text: 'l' }));
      eng.generate(id);
      const paths = (l.paths || []).filter((p) => Array.isArray(p) && p.length >= 2);
      expect(paths.length).toBeGreaterThan(0);
      // Horizontal scan through the stem: adjacent pass centrelines must be
      // spaced by pen·(1−overlap) = 0.7·0.85 = 0.595, not 0.35·0.85.
      let mny = Infinity; let mxy = -Infinity;
      paths.forEach((p) => p.forEach((q) => { if (q.y < mny) mny = q.y; if (q.y > mxy) mxy = q.y; }));
      const Y = (mny + mxy) / 2;
      const hits = [];
      for (const p of paths) {
        for (let i = 1; i < p.length; i += 1) {
          const a = p[i - 1]; const b = p[i];
          if ((a.y <= Y) === (b.y <= Y)) continue;
          hits.push(a.x + ((Y - a.y) / (b.y - a.y)) * (b.x - a.x));
        }
      }
      hits.sort((u, v) => u - v);
      expect(hits.length).toBeGreaterThan(2);
      const gaps = hits.slice(1).map((h, i) => h - hits[i]).filter((g) => g > 0.1 && g < 1.2);
      expect(gaps.length).toBeGreaterThan(0);
      // The dominant inter-pass gap must be the 0.7-pen spacing (0.7·0.85 =
      // 0.595); with the 0.35 fallback the largest gap would sit ≈0.30.
      expect(Math.max(...gaps)).toBeGreaterThan(0.5);
    } finally {
      V.SETTINGS.pens[0].width = 0.3;
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
