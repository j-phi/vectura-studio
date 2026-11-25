const { PLOTTER_PROFILES } = require('../../../src/config/plotters.js');

const byId = (id) => PLOTTER_PROFILES.find((p) => p.id === id);
const UUNA = ['uunatek-3-a3', 'uunatek-3-a2', 'uunatek-3-a1', 'uunatek-3-a0'];

describe('manufacturer specs on the UUNATEK profiles', () => {
  test.each(UUNA)('%s has deeply frozen specs with source and a vendor-claims note', (id) => {
    const s = byId(id).specs;
    expect(s).toBeTruthy();
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.speedModes)).toBe(true);
    expect(Object.isFrozen(s.speedModes[0].axes.x)).toBe(true);
    expect(s.source).toBe('Manufacturer product page');
    expect(s.note).toMatch(/manufacturer/i);
  });

  test('per-model physical data', () => {
    const want = {
      'uunatek-3-a3': [[420, 297], 'A3 & US Ledger', [575, 450, 194], [610, 500], [630, 520, 240], 11],
      'uunatek-3-a2': [[594, 420], 'A2 & ANSI C', [758, 580, 194], [860, 650], [890, 680, 280], 17.5],
      'uunatek-3-a1': [[841, 594], 'A1 & ANSI D', [1018, 785, 205], [1120, 850], [1150, 880, 350], 32],
      'uunatek-3-a0': [[1189, 841], 'A0 & ANSI E', [1366, 1030, 205], [1450, 1100], [1480, 1130, 350], 48],
    };
    Object.entries(want).forEach(([id, [area, paper, prod, table, pkg, kg]]) => {
      const p = byId(id).specs.physical;
      expect([p.writingAreaMm.width, p.writingAreaMm.height]).toEqual(area);
      expect(p.paperEquivalents).toBe(paper);
      expect([p.productMm.l, p.productMm.w, p.productMm.h]).toEqual(prod);
      expect([p.tableMm.l, p.tableMm.w]).toEqual(table);
      expect([p.packageMm.l, p.packageMm.w, p.packageMm.h]).toEqual(pkg);
      expect(p.netWeightKg).toBe(kg);
      expect(byId(id).workArea).toEqual({ width: area[0], height: area[1] });
    });
  });

  test('common specs', () => {
    const s = byId('uunatek-3-a3').specs;
    expect(s.tool.maxWritingThicknessMm).toBe(30);
    expect(s.tool.penDiameterMaxMm).toBe(17.5);
    expect(s.electronics.ratedPowerW).toBe(20);
    expect(s.electronics.operatingTempC).toEqual({ min: -20, max: 55 });
    expect(s.performance.repeatAccuracy.map((r) => r.mm)).toEqual([0.02, 0.05, 0.1]);
    expect(s.software.fileFormats).toEqual(['SVG', 'DXF', 'JPG', 'PNG', 'BMP', 'PDF']);
  });

  test('speed modes carry the exact vendor numbers, in order', () => {
    UUNA.forEach((id) => {
      const m = byId(id).specs.speedModes;
      expect(m.map((x) => x.id)).toEqual(['high-speed', 'standard', 'drawing', 'silence']);
      const num = (x) => ['x', 'y', 'z'].map((a) => [x.axes[a].maxFeed, x.axes[a].maxAccel]);
      expect(num(m[0])).toEqual([[20000, 6000], [20000, 2000], [20000, 4000]]);
      expect(num(m[1])).toEqual([[15000, 2000], [15000, 2000], [8000, 2000]]);
      expect(num(m[2])).toEqual([[12000, 500], [12000, 500], [12000, 2000]]);
      expect(num(m[3])).toEqual([[10000, 1000], [10000, 1000], [8000, 1000]]);
      expect(m[2].note).toMatch(/reduces vibration and noise/);
    });
  });

  test('the generic profile has no specs and profile limits are unchanged', () => {
    expect(byId('generic-grbl-servo').specs).toBeUndefined();
    expect(byId('uunatek-3-a3').limits).toMatchObject({ maxFeedXY: 15000, maxFeedZ: 8000 });
  });
});

// ---- Speed range (spec §13), folded in to keep the unweighted shard roster within budget ----
const safety = require('../../../src/core/plotter/plot-safety.js');
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
