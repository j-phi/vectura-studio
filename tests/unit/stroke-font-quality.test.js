/*
 * Vectura stroke-font quality punch-list (RGR coverage for the typography fixes).
 *
 * Each test encodes the judge's Acceptance assertion for one in-scope punch-list
 * item (F-01…F-29) as an executable check against Vectura.StrokeFont. These were
 * authored RED (they fail against the pre-fix glyph table) and pass GREEN once the
 * corrected coordinates / metrics / weight helper land.
 *
 * Coordinate space (font units, y-DOWN): cap top = 0, x-height top = 6,
 * baseline = 14, descender bottom = 19.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Stroke-font quality punch-list', () => {
  let runtime;
  let V;
  let SF;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    SF = V.StrokeFont;
  });

  afterAll(() => runtime.cleanup());

  // ── geometry helpers ────────────────────────────────────────────────────────
  const g = (ch) => SF.glyph(ch);
  const strokePts = (ch, i) => g(ch).s[i];
  const allPts = (ch) => [].concat(...g(ch).s);
  const minX = (pts) => pts.reduce((m, p) => Math.min(m, p[0]), Infinity);
  const maxX = (pts) => pts.reduce((m, p) => Math.max(m, p[0]), -Infinity);
  const minY = (pts) => pts.reduce((m, p) => Math.min(m, p[1]), Infinity);
  const maxY = (pts) => pts.reduce((m, p) => Math.max(m, p[1]), -Infinity);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  // point-to-segment distance (segment A→B), points as [x,y].
  const ptSeg = (p, A, B) => {
    const vx = B[0] - A[0]; const vy = B[1] - A[1];
    const wx = p[0] - A[0]; const wy = p[1] - A[1];
    const L2 = vx * vx + vy * vy || 1e-9;
    let t = (wx * vx + wy * vy) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (A[0] + t * vx), p[1] - (A[1] + t * vy));
  };
  // nearest distance from point p to a polyline (as a set of vertices).
  const nearestVertex = (p, pts) => pts.reduce((m, q) => Math.min(m, dist(p, [q[0], q[1]])), Infinity);
  // rx of a bowl stroke: cx (x at the top/min-y vertex) minus the left extreme.
  const bowlRx = (pts) => {
    let top = pts[0];
    for (const q of pts) if (q[1] < top[1]) top = q;
    return top[0] - minX(pts);
  };
  const bowlRy = (pts) => (maxY(pts) - minY(pts)) / 2;
  // interior-x line intersection of a segment at height y.
  const xAtY = (A, B, y) => A[0] + (B[0] - A[0]) * ((y - A[1]) / (B[1] - A[1]));

  // ── F-01 · capital K leg reconnected ────────────────────────────────────────
  test('F-01 K leg[0] lies on the upper arm (9.2,0)→(2,8) within 0.05u', () => {
    const leg = strokePts('K', 2);
    expect(ptSeg(leg[0], [9.2, 0], [2, 8])).toBeLessThanOrEqual(0.05);
  });

  // lowercase k junction MUST stay correct (strength to preserve).
  test('F-01 guard: lowercase k junction stays on the arm (unchanged)', () => {
    const leg = strokePts('k', 2);
    expect(ptSeg(leg[0], [7.4, 6], [2, 10.4])).toBeLessThanOrEqual(0.05);
  });

  // ── F-02 · lowercase f hook is a spline, not a caret ─────────────────────────
  test('F-02 f hook is spline-generated (dense) with no sharp caret above y=2', () => {
    const hook = strokePts('f', 0);
    expect(hook.length).toBeGreaterThan(6); // raw caret was 4 anchors
    // No interior vertex above y=2 forms an angle < 90°.
    for (let i = 1; i < hook.length - 1; i++) {
      const P = hook[i];
      if (P[1] > 2) continue;
      const a = hook[i - 1]; const b = hook[i + 1];
      const u = [a[0] - P[0], a[1] - P[1]];
      const v = [b[0] - P[0], b[1] - P[1]];
      const cos = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1e-9);
      const ang = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
      expect(ang).toBeGreaterThanOrEqual(90);
    }
  });

  // ── F-03 / F-04 · weightMetrics pure helper ──────────────────────────────────
  test('F-03/F-04 weightMetrics: Bold widens advance and clamps thickness at small size', () => {
    const penW = 0.35;
    const boldPasses = SF.weightPasses('Bold');
    const big = SF.weightMetrics(boldPasses, 40, penW);
    const small = SF.weightMetrics(boldPasses, 6, penW);
    expect(big.extraTrackingMM).toBeGreaterThan(0);          // F-03: advance grows
    expect(small.extraTrackingMM).toBeGreaterThan(0);
    expect(small.clampedThickness).toBeLessThan(big.clampedThickness); // F-04: clamp
    expect(big.clampedThickness).toBe(1 + boldPasses);       // unclamped at big cap
    // Regular is a pure no-op: no extra tracking, thickness == 1.
    const reg = SF.weightMetrics(SF.weightPasses('Regular'), 40, penW);
    expect(reg.extraTrackingMM).toBe(0);
    expect(reg.clampedThickness).toBe(1);
  });

  test("F-03 weightMetrics→layout (narrow): feeding extraTrackingMM widens 'nnnn'", () => {
    // NARROW unit check, NOT integration coverage: it feeds weightMetrics.
    // extraTrackingMM into SF.layout by hand, so it would still pass even if the
    // text.js `builtinTracking` wiring were reverted. The REAL text-pipeline
    // guard (which DOES go red on that revert) lives in
    // tests/integration/text-weight-optical.test.js.
    const em = SF.weightMetrics(SF.weightPasses('Bold'), 40, 0.35).extraTrackingMM;
    expect(em).toBeGreaterThan(0);
    const reg = SF.layout('nnnn', { size: 40, tracking: 0 });
    const bold = SF.layout('nnnn', { size: 40, tracking: em });
    expect(bold.width).toBeGreaterThan(reg.width);
  });

  // ── F-05 · digit 1 tabular + RSB ─────────────────────────────────────────────
  test('F-05 digit 1 is tabular (w=10) with RSB ≥ 1', () => {
    expect(g('1').w).toBe(10);
    expect(maxX(allPts('1'))).toBeLessThanOrEqual(9); // RSB ≥ 1
  });

  // ── F-06 · capital I sidebearings ────────────────────────────────────────────
  test('F-06 capital I is w=6 with inset serifs (LSB ≥ 1, RSB ≥ 1)', () => {
    expect(g('I').w).toBe(6);
    expect(minX(allPts('I'))).toBeGreaterThanOrEqual(1);
    expect(maxX(allPts('I'))).toBeLessThanOrEqual(5);
  });

  // ── F-07 · A crossbar reaches the diagonals ──────────────────────────────────
  test('F-07 A crossbar endpoints reach both diagonals at y=8.7', () => {
    const bar = strokePts('A', 1);
    const apex = strokePts('A', 0)[1]; // (6,-0.2)
    const leftX = xAtY(apex, [1.5, 14], 8.7);
    const rightX = xAtY(apex, [10.5, 14], 8.7);
    expect(bar[0][0]).toBeLessThanOrEqual(leftX + 0.05);
    expect(bar[1][0]).toBeGreaterThanOrEqual(rightX - 0.05);
    // absolute thresholds from the punch-list (original-apex diagonals)
    expect(bar[0][0]).toBeLessThanOrEqual(3.204);
    expect(bar[1][0]).toBeGreaterThanOrEqual(8.796);
  });

  // ── F-08 · overshoot family ──────────────────────────────────────────────────
  test('F-08 cap/ascender round tops overshoot ≤ -0.10', () => {
    for (const ch of ['O', 'Q', 'C', 'G', 'D', 'S', '0']) {
      expect(minY(allPts(ch))).toBeLessThanOrEqual(-0.10);
    }
  });

  test('F-08 round-bowl bottoms overshoot ≥ 14.10', () => {
    for (const ch of ['C', 'D', 'G', 'O', 'Q', 'U', 'S', 'J', '0']) {
      expect(maxY(allPts(ch))).toBeGreaterThanOrEqual(14.10);
    }
    // lowercase: measure the specific bowl stroke (not the descender/stem).
    const bowlIdx = { o: 0, c: 0, e: 0, g: 0, b: 1, d: 1, p: 1, q: 1 };
    for (const ch of Object.keys(bowlIdx)) {
      expect(maxY(strokePts(ch, bowlIdx[ch]))).toBeGreaterThanOrEqual(14.10);
    }
  });

  test('F-08 pointed apexes overshoot past the line', () => {
    expect(minY(allPts('A'))).toBeLessThanOrEqual(-0.15);
    expect(minY(allPts('M'))).toBeLessThanOrEqual(-0.15);
    expect(maxY(allPts('V'))).toBeGreaterThanOrEqual(14.15);
    expect(maxY(allPts('W'))).toBeGreaterThanOrEqual(14.15);
    expect(maxY(allPts('v'))).toBeGreaterThanOrEqual(14.15);
    expect(maxY(allPts('w'))).toBeGreaterThanOrEqual(14.15);
    expect(maxY(allPts('x'))).toBeGreaterThanOrEqual(14.15);
    expect(minY(allPts('x'))).toBeLessThanOrEqual(5.85);
  });

  test('F-08 N pointed convergences overshoot (springs/lands past the lines)', () => {
    // Stroke order: [ left-stem-bottom, top-left apex, bottom-right apex, right-stem-top ].
    // The diagonal springs from the top-left apex (2,0) and lands at the bottom-
    // right apex (10,14) — those are the pointed convergences, so they overshoot
    // like the M tops. (2,14) and (10,0) are flat stem terminals (H/T), kept flush.
    const s = strokePts('N', 0);
    expect(s[1]).toEqual([2, -0.2]);   // top apex: diagonal springs from the overshoot
    expect(s[2]).toEqual([10, 14.2]);  // bottom apex: diagonal lands on the overshoot
    expect(s[0]).toEqual([2, 14]);     // left stem terminal stays flush
    expect(s[3]).toEqual([10, 0]);     // right stem terminal stays flush
    // Diagonal endpoints ARE the apex corners (s[1], s[2]) — it never detaches.
    // Family-consistent overshoot magnitude (matches A/M).
    expect(minY(allPts('N'))).toBeLessThanOrEqual(-0.15);
    expect(maxY(allPts('N'))).toBeGreaterThanOrEqual(14.15);
  });

  test('F-08 digit bottoms no longer ride high (≥ 13.95)', () => {
    for (const ch of ['2', '3', '5', '6', '9']) {
      expect(maxY(allPts(ch))).toBeGreaterThanOrEqual(13.95);
    }
    expect(maxY(allPts('8'))).toBeGreaterThanOrEqual(14.05);
  });

  // ── F-09 · unified lowercase round width ─────────────────────────────────────
  test('F-09 o/c/b/d/p/q bowl rx equal within 0.05; g within 0.15', () => {
    // Full-ellipse bowls: rx = half the horizontal span (both cardinal points are
    // sampled exactly). c is an open arc that never samples its right cardinal
    // point, so its rx is verified by its exact left reach (cx − rx) instead.
    const rxFull = (ch, i) => (maxX(strokePts(ch, i)) - minX(strokePts(ch, i))) / 2;
    const rounds = {
      o: rxFull('o', 0), b: rxFull('b', 1), d: rxFull('d', 1),
      p: rxFull('p', 1), q: rxFull('q', 1),
    };
    const vals = Object.values(rounds);
    expect(Math.max(...vals) - Math.min(...vals)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(rxFull('g', 0) - rounds.o)).toBeLessThanOrEqual(0.15);
    // c (cx=5.2) shares the family rx=3.6 → its leftmost ink reaches ~1.6.
    expect(Math.abs(minX(strokePts('c', 0)) - 1.6)).toBeLessThanOrEqual(0.05);
  });

  // ── F-10 · lowercase a bowl raised ───────────────────────────────────────────
  test('F-10 a bowl crown rises to ≤ 7.2 (short bare neck)', () => {
    const bowl = strokePts('a', 1);
    const crownY = minY(bowl);
    expect(crownY).toBeLessThanOrEqual(7.2);
    expect(crownY - 6).toBeLessThanOrEqual(1.2); // bare stem above crown
  });

  // ── F-11 · lowercase s sits on the baseline ──────────────────────────────────
  test('F-11 lowercase s lowest ink y ≥ 14.0', () => {
    expect(maxY(allPts('s'))).toBeGreaterThanOrEqual(14.0);
  });

  // ── F-12 · j clears the origin ───────────────────────────────────────────────
  test('F-12 j LSB ≥ 0.5 and w=6', () => {
    expect(g('j').w).toBe(6);
    expect(minX(allPts('j'))).toBeGreaterThanOrEqual(0.5);
  });

  // ── F-13 · L foot RSB ────────────────────────────────────────────────────────
  test('F-13 L foot max x ≤ 8.0 (RSB ≥ 1)', () => {
    expect(maxX(allPts('L'))).toBeLessThanOrEqual(8.0);
  });

  // ── F-14 · tight-right cluster t/a/l/f ───────────────────────────────────────
  test('F-14 RSB (w − max ink x) ≥ 1.0 for t, a, l, f', () => {
    for (const ch of ['t', 'a', 'l', 'f']) {
      expect(g(ch).w - maxX(allPts(ch))).toBeGreaterThanOrEqual(1.0);
    }
  });

  // ── F-17 · honest oblique label, id preserved ────────────────────────────────
  test('F-17 forward slant labelled Oblique with id:italic preserved', () => {
    const styles = SF.styles;
    const fwd = styles.find((s) => s.id === 'italic');
    expect(fwd).toBeTruthy();
    expect(fwd.label).toBe('Oblique');
    expect(SF.isStyle('italic')).toBe(true); // saved-file ids still resolve
  });

  // ── F-19 · centering + b/d mirror ────────────────────────────────────────────
  test('F-19 o centred; b/d mirrored about x=5 with balanced sidebearings', () => {
    const oPts = allPts('o');
    const oLSB = minX(oPts); const oRSB = g('o').w - maxX(oPts);
    expect(Math.abs(oLSB - oRSB)).toBeLessThanOrEqual(0.15);

    for (const ch of ['b', 'd']) {
      const lsb = minX(allPts(ch)); const rsb = g(ch).w - maxX(allPts(ch));
      expect(Math.abs(lsb - rsb)).toBeLessThanOrEqual(0.4);
    }
    // exact mirror: reflect b about x=5 → must match d as a point multiset.
    const key = (p) => `${(10 - p[0]).toFixed(2)},${p[1].toFixed(2)}`;
    const keyD = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
    const bSet = allPts('b').map(key).sort();
    const dSet = allPts('d').map(keyD).sort();
    expect(bSet).toEqual(dSet);
  });

  // ── F-20 · misc sidebearings ─────────────────────────────────────────────────
  test('F-20 E/F/Z RSB ≥ 1.2 and m w ≤ 13', () => {
    for (const ch of ['E', 'F', 'Z']) {
      expect(g(ch).w - maxX(allPts(ch))).toBeGreaterThanOrEqual(1.2);
    }
    expect(g('m').w).toBeLessThanOrEqual(13);
  });

  // ── F-21 · word space ────────────────────────────────────────────────────────
  test('F-21 space advance ≥ 8', () => {
    expect(g(' ').w).toBeGreaterThanOrEqual(8);
  });

  // ── F-22 · lowercase g stem attaches to bowl ─────────────────────────────────
  test('F-22 g descender top vertex lies within 0.3u of the bowl outline', () => {
    const bowl = strokePts('g', 0);
    const stemTop = strokePts('g', 1)[0];
    expect(nearestVertex(stemTop, bowl)).toBeLessThanOrEqual(0.3);
  });

  // ── F-23 · h/m/n arch crowns ─────────────────────────────────────────────────
  test('F-23 h/m/n arch crowns reach x-height (min-y ≤ 6.0)', () => {
    expect(minY(strokePts('h', 1))).toBeLessThanOrEqual(6.0);
    expect(minY(strokePts('n', 1))).toBeLessThanOrEqual(6.0);
    expect(Math.min(minY(strokePts('m', 1)), minY(strokePts('m', 2)))).toBeLessThanOrEqual(6.0);
  });

  // ── F-24 · j descender depth ─────────────────────────────────────────────────
  test('F-24 j lowest ink y ≥ 18.8', () => {
    expect(maxY(allPts('j'))).toBeGreaterThanOrEqual(18.8);
  });

  // ── F-25 · R leg/bowl junction ───────────────────────────────────────────────
  test('F-25 R leg[0] within 0.05u of the bowl endpoint', () => {
    const leg0 = strokePts('R', 2)[0];
    expect(nearestVertex(leg0, strokePts('R', 1))).toBeLessThanOrEqual(0.05);
  });

  // ── F-26 · round degree ring and % circles ───────────────────────────────────
  test('F-26 ° and % small circles are round (|rx − ry| ≤ 0.1)', () => {
    const deg = strokePts('°', 0);
    expect(Math.abs(bowlRx(deg) - bowlRy(deg))).toBeLessThanOrEqual(0.1);
    for (const i of [0, 1]) {
      const c = strokePts('%', i);
      expect(Math.abs(bowlRx(c) - bowlRy(c))).toBeLessThanOrEqual(0.1);
    }
  });

  // ── F-29 · G spur bar reaches centre ─────────────────────────────────────────
  test('F-29 G spur bar inner x ≤ 6.2', () => {
    expect(minX(strokePts('G', 1))).toBeLessThanOrEqual(6.2);
  });
});
