/*
 * RGR — F4: A SUB-2-PEN RIBBON MUST NEVER RENDER AS A HOLLOW DOUBLED HAIRLINE.
 *
 * Judge B's finding (`~/.claude/plans/stroke-fill-plan.md`, F4): "A ribbon
 * about one pen wide emits its OUTLINE with no fill, so it renders as a
 * hollow DOUBLED HAIRLINE rather than one solid stroke." This breaches
 * contract C2 (coverage >= 0.995) and contradicts C3 step 5, which requires a
 * ribbon narrower than the pen to degenerate to a SINGLE centreline pass —
 * never a sub-pen stroke, never a doubled line.
 *
 * `weightSmoothstep` and `nibAngle` are named in the fix's own worked example
 * as the measured offenders: a CONSTANT 1.58-pen `weightSmoothstep` ribbon
 * (pre-fix) eroded into three fragments (coverage 0.824, a 4.59 mm² hole);
 * `nibAngle` is the per-sample-profile sibling of the same 1-2 pen band.
 *
 * This measures the SAME ring-fill-rate T1 uses (see
 * `tests/helpers/scene3d-ring-coverage.js`), but the point of THIS file is
 * narrower than the wall-coverage suite: it pins the two laws the defect was
 * originally measured on, on BOTH sphere and torus, so a future change to the
 * WALLS class cannot regress the exact repro without failing here first.
 *
 * RED against `1b157bc6`, reproducibly: run this file with `VECTURA_PRE_WIP=1`
 * and all 6 assertions fail. The pre-fix binary classifier ran these
 * widths through `erode(region, pen/2)` twice (outline, then fill), which is
 * unreliable under ~2 pens; `ringFillRate` measured below 0.995 there.
 */
const { loadVecturaRuntime } = require('../helpers/load-vectura-runtime');
const { preWipRuntimeOptions } = require('../helpers/pre-wip-surface-fill');
const { captureClipGroups, measureRingFillRate } = require('../helpers/scene3d-ring-coverage');

const LAWS = ['weightSmoothstep', 'nibAngle'];
const PRIMITIVES = ['sphere', 'torus'];
const PEN_WIDTH = 0.3;

describe('SurfaceFill — F4 sub-2-pen ribbons are not hollow doubled hairlines', () => {
  let runtime;
  let V;
  const results = {};

  beforeAll(async () => {
    runtime = await loadVecturaRuntime({ includeUi: true, ...preWipRuntimeOptions() });
    V = runtime.window.Vectura;

    PRIMITIVES.forEach((primitive) => {
      results[primitive] = {};
      LAWS.forEach((toneLaw) => {
        const engine = new V.VectorEngine();
        const groupId = engine.addLayer('scene3d');
        const group = engine.layers.find((l) => l.id === groupId);
        const obj = engine.getLayerDescendants(groupId)
          .filter((l) => l && l.type === 'object3d')[0];
        obj.params.primitive = primitive;
        obj.params.style = obj.params.style || { penId: null, mapper: 'hatch', params: {} };
        obj.params.style.params = { ...(obj.params.style.params || {}), toneLaw };

        const cap = captureClipGroups(V);
        engine.computeAllDisplayGeometry();
        cap.restore();

        const stats = { ...(V.Scene3D.SurfaceFill.lastRibbonStats || {}) };
        const ink = (group.scenePaths || []).filter((p) => p && p.meta && p.meta.kind === 'sceneFill');
        const coverage = measureRingFillRate(cap.groups, ink, PEN_WIDTH);
        results[primitive][toneLaw] = { stats, coverage, groupCount: cap.groups.length };
      });
    });
  }, 300000);

  afterAll(() => runtime && runtime.cleanup());

  test.each(PRIMITIVES)('%s — walls fire for both named offenders', (primitive) => {
    LAWS.forEach((law) => {
      expect(results[primitive][law].stats.wallRings).toBeGreaterThan(0);
    });
  });

  test.each(PRIMITIVES)('%s — no hollow doubled hairline (ring-fill-rate >= 0.995)', (primitive) => {
    LAWS.forEach((law) => {
      const { coverage, groupCount } = results[primitive][law];
      expect(groupCount).toBeGreaterThan(0);
      expect(coverage.ringFillRate).not.toBeNull();
      expect(coverage.ringFillRate).toBeGreaterThanOrEqual(0.995);
    });
  });

  // C3 rule 5, the narrow half of the same rule: a stretch that DOES collapse
  // all the way to a centreline (<= 1 pen) must still be counted as exactly
  // that — `narrow` — never folded silently into a wide/walls refusal that
  // would hide a second, unwanted pass on top of it.
  test.each(PRIMITIVES)('%s — every stretch lands in exactly one width class', (primitive) => {
    LAWS.forEach((law) => {
      const s = results[primitive][law].stats;
      // `noRing` (a stretch classified WALLS/RIBBON but the ribbon module was
      // unavailable) is included defensively — it never fires in this test's
      // runtime (RibbonGeometry loads normally) but belongs in the partition
      // if it ever did.
      expect(s.narrow + s.walls + s.wide + s.noRing).toBe(s.stretches);
    });
  });
});
