/*
 * RGR — F7: NO ZERO-COVERAGE SEAM BETWEEN A WIDE RIBBON'S OUTLINE AND ITS
 * FIRST FILL PASS.
 *
 * `~/.claude/plans/stroke-fill-plan.md`, F7 / the WIP's own second fix. For a
 * genuinely wide (> 2 pen, CLS_RIBBON) stretch, `ribbonize` erodes the clipped
 * ribbon by `penWidth / 2` for the OUTLINE, then erodes AGAIN for the FILL
 * region PenFill lays its first pass into. Before this WIP the second erosion
 * was a further `penWidth / 2` — putting the fill boundary exactly one pen in
 * from the outline's own edge, with ZERO designed overlap between the
 * outline's ink ([0, p] from the edge) and the first fill pass's ([p, 2p]).
 * Measured on the torus: coverage 0.997-0.9994 with contiguous voids up to
 * 0.144 mm2 — thin dark streaks running the LENGTH of wide bands (this is F7
 * as reported: "thin dark streaks running lengthwise inside the band").
 *
 * The fix backs the second erosion off by the same 15% overlap every other
 * fill pass gets (`penWidth * (0.5 - RIBBON_OVERLAP)`), making the outline the
 * ladder's first pass instead of a separate, non-overlapping ring.
 *
 * This test targets laws/primitives measured to produce GENUINELY wide
 * (CLS_RIBBON, `wide > 0`) stretches on the torus — `ampSpacing` and
 * `weaveDepth` — and applies contract C2's T1 coverage method (4 samples per
 * pen width, independent rasterizer) to the REAL clip + erosion output.
 *
 * RED against `1b157bc6` (verified manually via `scriptOverrides`; see the
 * session report) — the pre-fix `erode(outlineMP, penWidth / 2)` fill depth
 * measured a ring-fill-rate at or near the numbers in F7's own report,
 * comfortably under the 0.995 bar this file enforces.
 *
 * NOTE ON SCOPE: F1 (self-crossing slab collapse) affects some of these same
 * laws' MID-BAND coverage for an unrelated reason (loop interiors swallowed by
 * the self-union) and is explicitly OUT OF SCOPE for this fix — see
 * `onePenDown` / `trochoidLoop` / `interlockWeave` / `weaveDepth` /
 * `ampSpacing` in the plan's open findings. `ampSpacing` and `weaveDepth` are
 * used here anyway because they are the torus laws measured to reach
 * CLS_RIBBON at all; the residual F1 streaking (reported separately in this
 * session's summary) is a DIFFERENT, already-known defect this file does not
 * claim to fix and does not assert against beyond the coarse 0.995 floor.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { preWipRuntimeOptions } = require('../helpers/pre-wip-surface-fill');
const { captureClipGroups, measureRingFillRate } = require('../helpers/scene3d-ring-coverage');

const LAWS = ['ampSpacing', 'weaveDepth'];
const PEN_WIDTH = 0.3;

describe('SurfaceFill — F7 wide-ribbon outline/fill seam, torus', () => {
  let runtime;
  let V;
  const results = {};

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true, ...preWipRuntimeOptions() });
    V = runtime.window.Vectura;

    LAWS.forEach((toneLaw) => {
      const engine = new V.VectorEngine();
      const groupId = engine.addLayer('scene3d');
      const group = engine.layers.find((l) => l.id === groupId);
      const obj = engine.getLayerDescendants(groupId)
        .filter((l) => l && l.type === 'object3d')[0];
      obj.params.primitive = 'torus';
      obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
      obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw };

      const cap = captureClipGroups(V);
      engine.computeAllDisplayGeometry();
      cap.restore();

      const stats = { ...(V.Scene3D.SurfaceFill.lastRibbonStats || {}) };
      const ink = (group.scenePaths || []).filter((p) => p && p.meta && p.meta.kind === 'sceneFill');
      const coverage = measureRingFillRate(cap.groups, ink, PEN_WIDTH);
      results[toneLaw] = { stats, coverage, groupCount: cap.groups.length };
    });
  }, 300000);

  afterAll(() => runtime && runtime.cleanup());

  test.each(LAWS)('%s — genuinely reaches the CLS_RIBBON (>2 pen) class on a torus', (law) => {
    // Guard the guard: this file is only meaningful if the fixture actually
    // exercises the erosion-depth code path the fix changed.
    expect(results[law].stats.wide).toBeGreaterThan(0);
  });

  test.each(LAWS)('%s — no zero-coverage seam between outline and first fill pass', (law) => {
    const { coverage, groupCount } = results[law];
    expect(groupCount).toBeGreaterThan(0);
    expect(coverage.ringFillRate).not.toBeNull();
    expect(coverage.ringFillRate).toBeGreaterThanOrEqual(0.995);
  });
});
