/*
 * Stroke-font weight system — REAL text-pipeline integration coverage (RGR).
 *
 * Round-1 landed the built-in monoline weight system in two source lines that the
 * `stroke-font-quality` unit suite only exercised in ISOLATION (it fed a
 * pre-computed tracking straight into SF.layout, so it stayed green even if the
 * text.js wiring were reverted). This suite closes that gap by driving the REAL
 * `Vectura.AlgorithmRegistry.text.generate(params, rng, noise, bounds)` end to end
 * and asserting on its emitted geometry — so it FAILS if the wiring regresses.
 *
 * The two guarded source lines (src/core/algorithms/text.js):
 *   F-03 advance compensation — `builtinTracking = tracking + wMetrics.extraTrackingMM`
 *   F-04 optical-size clamp   — `clampedPass = ...weightMetrics(...).clampedThickness`
 *
 * RGR-red proof (verified 2026-07-01 by temporarily reverting each line):
 *   • Revert F-03 to `builtinTracking = tracking` → Bold 'nnnnn' advance span
 *     collapses to EXACTLY the Regular span (142.857 == 142.857) → the F-03
 *     `toBeGreaterThan` assertion goes RED.
 *   • Revert F-04 to `clampedPass = 1 + weightPasses` → Bold@6mm emits the SAME
 *     pass count as Bold@40mm (8 == 8) → the F-04 `toBeLessThan` assertion goes RED.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

describe('Stroke-font weight system — real text pipeline (F-03 / F-04)', () => {
  let runtime;
  let V;
  let SF;
  let gen;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    V = runtime.window.Vectura;
    SF = V.StrokeFont;
    gen = V.AlgorithmRegistry.text.generate;
  });

  afterAll(() => runtime.cleanup());

  // Display bounds mirror what VectorEngine.generate() hands the algorithm; penWidth
  // defaults to 0.35 in text.js so we leave it implicit (matches the unit suite).
  const bounds = { width: 220, height: 220, m: 10, dW: 200, dH: 200, penWidth: 0.35 };

  // Absolute-size ('fitToFrame:false') so a heavier weight is NOT rescaled to fill
  // the frame — that's what lets a widened advance actually widen the output. align
  // 'left' anchors the block so the measurement is stable.
  const params = (over) => Object.assign({
    text: 'nnnnn', font: 'sans', fitToFrame: false, fontSize: 40,
    jitter: 0, align: 'left', fontWeight: 'Regular',
  }, over);

  // Total laid-out ADVANCE width, read from the editor glyph-cell quads (pen boxes,
  // not the inked stroke bbox). Reading the cell quads isolates the F-03 tracking
  // fix from stroke thickening — the quad box is the pen advance, so it moves ONLY
  // when the advance widens, never when passes fatten the ink.
  const advanceSpan = (out) => {
    let mn = Infinity; let mx = -Infinity;
    for (const g of out.glyphs) {
      for (const c of g.quad) { if (c.x < mn) mn = c.x; if (c.x > mx) mx = c.x; }
    }
    return mx - mn;
  };

  // ── F-03 · Bold widens the real laid-out advance ────────────────────────────
  test("F-03 real pipeline: Bold 'nnnnn' advance is strictly wider than Regular", () => {
    const reg = gen(params({ fontWeight: 'Regular' }), null, null, bounds);
    const bold = gen(params({ fontWeight: 'Bold' }), null, null, bounds);
    expect(Array.isArray(reg.glyphs)).toBe(true);
    expect(reg.glyphs.length).toBeGreaterThan(0);
    const regSpan = advanceSpan(reg);
    const boldSpan = advanceSpan(bold);
    // RED if text.js reverts `builtinTracking` to plain `tracking` (spans equalise).
    expect(boldSpan).toBeGreaterThan(regSpan);
    // And the widening is the weightMetrics tracking summed over the 5 advances
    // (sanity: not some unrelated bbox drift). 5 cells → 5 × extraTrackingMM.
    const em = SF.weightMetrics(SF.weightPasses('Bold'), 40, 0.35).extraTrackingMM;
    expect(boldSpan - regSpan).toBeCloseTo(5 * em, 5);
  });

  // ── F-04 · optical-size clamp reduces Bold's passes at small cap ─────────────
  test('F-04 real pipeline: Bold@6mm emits fewer thickening passes than Bold@40mm', () => {
    const glyphParams = (size) => ({
      text: 'o', font: 'sans', fitToFrame: false, fontSize: size,
      jitter: 0, align: 'left', fontWeight: 'Bold',
    });
    const big = gen(glyphParams(40), null, null, bounds);
    const small = gen(glyphParams(6), null, null, bounds);
    expect(big.length).toBeGreaterThan(0);
    expect(small.length).toBeGreaterThan(0);
    // The monoline face thickens Bold into parallel pen passes; the clamp caps the
    // pass count at small optical size, so 'o' emits STRICTLY fewer paths at 6mm.
    // RED if text.js reverts `clampedPass` to the unclamped `1 + weightPasses`.
    expect(small.length).toBeLessThan(big.length);
  });

  // ── F-04 · the pure helper the clamp reads from ─────────────────────────────
  test('F-04 helper: weightMetrics clamps Bold thickness at 6mm below 40mm', () => {
    const smallT = SF.weightMetrics(SF.weightPasses('Bold'), 6, 0.35).clampedThickness;
    const bigT = SF.weightMetrics(SF.weightPasses('Bold'), 40, 0.35).clampedThickness;
    expect(smallT).toBeLessThan(bigT);
  });
});
