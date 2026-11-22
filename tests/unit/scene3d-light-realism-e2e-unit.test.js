const LR = require('../helpers/light-realism');
const { dragEqualsExport } = require('../helpers/surface-lock-scene');

// Light realism H2 (compositor wiring), driven through engine.addLayer: the owner's config (sphere, Hatch, Duty Cycle · Constant,
// angle 45, density 50) under the default front-key light shows PAPER at the glint in both mark spaces; a side light shows a graded
// half; Level S still engages; drag == export. RED before H2: Level F ignored the v2 light (Level S != Level F), the pose path was
// legacy-lit (lit floor, no glint paper) and the light-blind laws showed no gradient.
describe('light realism e2e (H2)', () => {
  let rt; let V;
  beforeAll(async () => { rt = await LR.loadRuntime(); V = rt.V; }, 120000);
  afterAll(() => rt && rt.cleanup());
  const owner = (markSpace, extra = {}) => LR.buildCase(V, { law: 'dutyConst', mapper: 'hatch', markSpace, density: 50, angle: 45, ...extra });

  ['surface', 'pose'].forEach((ms) => {
    it(`${ms}: default light shows paper at the glint`, () => {
      const s = owner(ms);
      const prof = LR.measure(s, { model: 'v2' });
      expect(LR.topFractionCoverage(prof, 'S', 0.01)).toBeLessThanOrEqual(0.01);
      expect(LR.m1Monotone(prof, {}).maxRise).toBeLessThanOrEqual(0.06);
    }, 120000);
    it(`${ms}: a side light shows a graded half`, () => {
      const s = owner(ms);
      LR.setLightCam(s, LR.LIGHTS.side);
      const prof = LR.measure(s, { model: 'v2' });
      const m1 = LR.m1Monotone(prof, {});
      expect(m1.rho).toBeLessThanOrEqual(-0.85);
      expect(LR.m3Range(prof, 50).value).toBeGreaterThanOrEqual(0.25);
    }, 120000);
  });

  it('Level S engages for the owner config and drag equals export', () => {
    const s = owner('surface');
    const sl = V.Scene3D.SurfaceLock; sl.resetStats();
    s.composeFull();
    expect(sl.stats.sceneFrames).toBeGreaterThan(0);
    dragEqualsExport(s, undefined, {}).forEach((r) => expect(r.equal, JSON.stringify(r.pose)).toBe(true));
  }, 120000);

  it('Level F (Level S off) equals Level S for the default v2 ladder', () => {
    const s = LR.buildCase(V, { law: 'ladder', mapper: 'hatch', markSpace: 'surface' });
    const A = s.composeFull();
    const sl = V.Scene3D.SurfaceLock; const real = sl.frameable; sl.frameable = () => false;
    let B; try { B = s.composeFull(); } finally { sl.frameable = real; }
    const tot = (ps) => ps.filter((p) => p.meta && p.meta.kind === 'sceneFill').reduce((a, p) => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return a + l; }, 0);
    expect(Math.abs(tot(A) / tot(B) - 1)).toBeLessThan(0.01);
  }, 120000);

  it('metrics M1-M8 across Default, dutyConst, mezzo, endShorten (side light) are reported and graded', () => {
    const out = {};
    [['default', 'ladder'], ['dutyConst', 'dutyConst'], ['mezzo', 'mezzoRegion'], ['endShorten', 'endShorten']].forEach(([name, law]) => {
      const s = LR.buildCase(V, { law, mapper: 'hatch', markSpace: 'surface' });
      LR.setLightCam(s, LR.LIGHTS.side);
      const prof = LR.measure(s, { model: 'v2' });
      out[name] = { m1: LR.m1Monotone(prof, {}), m3: LR.m3Range(prof, 50), m7: LR.m7LimbCentre(prof, {}) };
      expect(out[name].m1.rho, name).toBeLessThanOrEqual(-0.85);
      expect(out[name].m3.value, name).toBeGreaterThanOrEqual(0.2);
    });
    console.log('H2 METRICS', JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { rise: +v.m1.maxRise.toFixed(3), rho: +v.m1.rho.toFixed(2), range: +v.m3.value.toFixed(3), m7: +v.m7.worst.toFixed(3) }]))));
  }, 240000);
});
