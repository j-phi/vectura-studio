const safety = require('../../../src/core/plotter/plot-safety.js');
const { PLOTTER_PROFILES } = require('../../../src/config/plotters.js');
const { connected } = require('./plotter-test-helpers.js');

const a3 = PLOTTER_PROFILES.find((p) => p.id === 'uunatek-3-a3');
const hs = Object.assign({}, a3, { highSpeed: true });
const fw = (xy, z) => ({ 110: xy, 111: xy, 112: z === undefined ? 8000 : z });

describe('speed range (spec 13)', () => {
  test('UUNATEK limits, tiers and defaults', () => {
    PLOTTER_PROFILES.filter((p) => p.vendor === 'UUNATEK').forEach((p) => {
      expect(p.limits).toMatchObject({ maxFeedXY: 15000, maxFeedZ: 8000, maxJogFeed: 6000, highSpeedXY: 20000 });
      expect(p.speedTiers).toEqual({ drawQuality: 6000, travelStepLoss: 12000 });
      expect(p.motion).toMatchObject({ drawFeed: 4000, travelFeed: 10000 });
      expect(p.pen.zFeed).toBe(5000);
    });
  });

  test('without the high-speed flag XY is capped at 15000 even when the firmware allows more', () => {
    expect(safety.clampFeedXY(20000, a3, fw(20000))).toBe(15000);
  });

  test('high-speed raises the cap to 20000 only when the firmware allows it', () => {
    expect(safety.clampFeedXY(20000, hs, fw(20000))).toBe(20000);
    expect(safety.clampFeedXY(20000, hs, fw(15000))).toBe(15000);
    expect(safety.clampFeedXY(20000, hs, { 110: 20000, 111: 12000, 112: 8000 })).toBe(12000);
  });

  test('high-speed with an unknown firmware does not raise the cap', () => {
    expect(safety.clampFeedXY(20000, hs, {})).toBe(15000);
    expect(safety.clampFeedXY(20000, hs, null)).toBe(15000);
  });

  test('Z stays at 8000 in high-speed mode', () => {
    expect(safety.clampFeedZ(20000, hs, fw(20000, 20000))).toBe(8000);
  });

  test('feedCapInfo names the cap source', () => {
    expect(safety.feedCapInfo(a3, fw(20000))).toEqual({ cap: 15000, source: 'profile' });
    expect(safety.feedCapInfo(a3, fw(12000))).toEqual({ cap: 12000, source: 'firmware' });
    expect(safety.feedCapInfo(hs, fw(20000))).toEqual({ cap: 20000, source: 'high-speed' });
    expect(safety.feedCapInfo(hs, fw(15000))).toEqual({ cap: 15000, source: 'firmware' });
  });

  test('the controller limits honor the flag only with firmware that allows it', async () => {
    const fast = await connected({ sim: { settings: { 110: 20000, 111: 20000 } } });
    fast.ctrl.profile = hs;
    expect(fast.ctrl._limits().xyCap).toBe(20000);
    fast.ctrl.profile = a3;
    expect(fast.ctrl._limits().xyCap).toBe(15000);
    await fast.run(fast.ctrl.disconnect());
    const slow = await connected({ sim: { settings: { 110: 15000, 111: 15000 } } });
    slow.ctrl.profile = hs;
    expect(slow.ctrl._limits().xyCap).toBe(15000);
  });
});
