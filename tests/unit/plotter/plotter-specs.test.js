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
    expect(byId('uunatek-3-a3').limits).toMatchObject({ maxFeedXY: 11000, maxFeedZ: 5000 });
  });
});
