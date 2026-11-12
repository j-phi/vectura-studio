const LR = require('../helpers/light-realism');

// Pins the harness against the strategist's probe numbers (light-plan.md section 1b, legacy model) so later units can trust it.
// Two composes only (surface + pose, default sphere, default light/camera); everything else is arithmetic on those profiles.
describe('light-realism harness (legacy reference numbers)', () => {
  let rt; let V; let surf; let pose; let front;
  beforeAll(async () => {
    rt = await LR.loadRuntime(); V = rt.V;
    // The strategist's reference numbers are for the PRE-v7 default sun (az 135 / el 45): pin it explicitly.
    surf = LR.measure(LR.buildCase(V, { law: 'dutyConst', markSpace: 'surface', azimuth: 135, elevation: 45, tone: { model: 'legacy' } }));
    pose = LR.measure(LR.buildCase(V, { law: 'dutyConst', markSpace: 'pose', azimuth: 135, elevation: 45, tone: { model: 'legacy' } }));
    const f = LR.buildCase(V, { markSpace: 'surface', tone: { model: 'legacy' } }); LR.setLightCam(f, LR.LIGHTS.front);
    front = LR.measure(f);
  }, 120000);
  afterAll(() => rt && rt.cleanup());

  it('the pre-v7 default light (az 135 / el 45) is side lighting, 86 degrees off the view axis (camera-space 0.68, 0.73, 0.07)', () => {
    const c = surf.lightCam;
    expect(c.x).toBeCloseTo(0.68, 2); expect(c.y).toBeCloseTo(0.73, 2); expect(c.z).toBeCloseTo(0.07, 2);
  });

  it('most of the visible disc is unlit at the pre-v7 default light (I = 0 area >> half)', () => {
    const b = LR.bins(surf, 'L', { minArea: 0 });
    const dark = b[0].area; const total = b.reduce((a, x) => a + x.area, 0);
    expect(dark / total).toBeGreaterThan(0.5);
  });

  it('legacy ladder under a front light has a lit floor: coverage ~0.08 at L* >= 0.9, no paper highlight', () => {
    const c = LR.covAt(front, 'L', 0.9, 1.0001);
    expect(c).toBeGreaterThan(0.05); expect(c).toBeLessThan(0.12);
    expect(LR.m2Highlight(front, { specular: false }).pass).toBe(false);
  });

  it('pose and surface dutyConst profiles are comparable and the metric API returns well-formed results', () => {
    const m6 = LR.m6PoseSurface(surf, pose);
    expect(Number.isFinite(m6.worst)).toBe(true);
    const m1 = LR.m1Monotone(surf); expect(m1.bins).toBeGreaterThan(2);
    expect(LR.m3Range(surf, 50)).toHaveProperty('value');
    expect(LR.m4Terminator(surf)).toHaveProperty('steepestAt');
    expect(LR.m7LimbCentre(front)).toHaveProperty('worst');
    expect(LR.m9Widget(V, { azimuth: 135, elevation: 45 }, { yaw: -30, pitch: 20 }).expected.behind).toBe(false);
  });
});
