const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');

/*
 * Job 1 (fs-d1-engine) — fillDensity 100-200 rescale.
 *
 * UI sliders were raised to a max of 200 (sibling branches), but the engine's
 * density -> hatch spacing mapping (`hatchSpacing` in scene3d.js) still
 * clamped to [0, 100] and already floored at spacing=1mm by d=100 — so
 * 100-200 was a silent no-op: every d in that range produced identical
 * (floored) output.
 *
 * Hard requirement: for every integer d in [0, 100], the new mapping must
 * return a spacing IDENTICAL (to the last bit) to the old formula
 * `Math.max(1, 14 - 0.13 * clamp(d, 0, 100))`. Existing user artwork must not
 * change appearance. Only (100, 200] is new territory, and must continue
 * decreasing monotonically to a sane floor.
 *
 * The mapping is exercised through the published test seam
 * `__hatchSpacingForTest` (mirrors the existing `__plotFloorForTest` seam,
 * §4.2) rather than by measuring projected geometry, so every one of the 101
 * integer samples is checked exactly rather than approximately.
 */

const OLD_FORMULA = (d) => Math.max(1, 14 - 0.13 * Math.min(100, Math.max(0, d)));

describe('scene3d fillDensity -> hatch spacing rescale (100-200)', () => {
  let runtime; let algo;

  beforeAll(async () => {
    runtime = await loadVecturaRuntime();
    algo = runtime.window.Vectura.AlgorithmRegistry.scene3d;
  });
  afterAll(() => runtime.cleanup());

  test('test seam is published', () => {
    expect(typeof algo.__hatchSpacingForTest).toBe('function');
  });

  test('BACKWARD COMPAT: every integer density 0-100 is byte-identical to the old formula', () => {
    for (let d = 0; d <= 100; d++) {
      expect(algo.__hatchSpacingForTest(d)).toBe(OLD_FORMULA(d));
    }
  });

  test('BACKWARD COMPAT: fractional densities 0-100 also match the old formula', () => {
    [0.5, 12.25, 49.9, 50.1, 99.999].forEach((d) => {
      expect(algo.__hatchSpacingForTest(d)).toBe(OLD_FORMULA(d));
    });
  });

  test('density 100 no longer sits at the floor: 100-200 keeps decreasing', () => {
    const s100 = algo.__hatchSpacingForTest(100);
    const s150 = algo.__hatchSpacingForTest(150);
    const s200 = algo.__hatchSpacingForTest(200);
    expect(s100).toBe(1); // unchanged boundary value
    expect(s150).toBeLessThan(s100);
    expect(s200).toBeLessThan(s150);
  });

  test('100-200 is monotonic (denser input never yields wider spacing)', () => {
    let prev = algo.__hatchSpacingForTest(100);
    for (let d = 101; d <= 200; d++) {
      const cur = algo.__hatchSpacingForTest(d);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });

  test('density 200 floors at a sane, non-zero, plotter-safe spacing (>= 0.25mm, < 1mm)', () => {
    const s200 = algo.__hatchSpacingForTest(200);
    expect(s200).toBeGreaterThanOrEqual(0.25);
    expect(s200).toBeLessThan(1);
  });

  test('values above 200 clamp to the density-200 floor (upper clamp raised from 100 to 200)', () => {
    const s200 = algo.__hatchSpacingForTest(200);
    expect(algo.__hatchSpacingForTest(300)).toBe(s200);
    expect(algo.__hatchSpacingForTest(9999)).toBe(s200);
  });

  test('negative / non-finite density still falls back safely (no NaN, no negative spacing)', () => {
    expect(Number.isFinite(algo.__hatchSpacingForTest(-50))).toBe(true);
    expect(algo.__hatchSpacingForTest(-50)).toBeGreaterThan(0);
    expect(Number.isFinite(algo.__hatchSpacingForTest(NaN))).toBe(true);
    expect(algo.__hatchSpacingForTest(NaN)).toBeGreaterThan(0);
  });
});
