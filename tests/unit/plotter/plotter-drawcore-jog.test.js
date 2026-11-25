const { connected, wireLabels, until, assertAllSafe, PlotterController } = require('./plotter-test-helpers.js');

afterEach(() => PlotterController.resetOwnership());

// DrawCore reports MPos only ($10=1) and WCO only every 10th report or right after G92.
const DC = { sim: { statusMode: 'mpos', wcoReportsZero: true, initialPosition: { x: 0, y: 0, z: 0 } } };

const settle = (s) => until(s.clock, () => s.ctrl.state === 'idle', 20000);

describe('DrawCore status mode ($10=1, MPos only)', () => {
  test('single clicks move exactly the step along the clicked axis only', async () => {
    const s = await connected(DC);
    await s.run(s.ctrl.setOrigin());
    await s.run(s.ctrl.jog(120, 80));
    await settle(s);
    await s.run(s.ctrl.setOrigin()); // origin away from machine zero
    for (const step of [1, 10, 50]) {
      const before = s.sim.getPosition().mpos;
      const r = await s.run(s.ctrl.jog(-step, 0));
      expect(r.sent).toBe(true);
      await settle(s);
      const after = s.sim.getPosition().mpos;
      expect(before.x - after.x).toBeCloseTo(step, 2);
      expect(after.y).toBeCloseTo(before.y, 2);
      await s.run(s.ctrl.jog(step, 0));
      await settle(s);
    }
    expect(assertAllSafe(s.sim)).toEqual([]);
  });

  test('single jogs are relative ($J=G21G91) and never exceed the step', async () => {
    const s = await connected(DC);
    await s.run(s.ctrl.setOrigin());
    await s.run(s.ctrl.jog(30, 20));
    await settle(s);
    await s.run(s.ctrl.setOrigin());
    await s.run(s.ctrl.jog(5, 0));
    await settle(s);
    const jogs = wireLabels(s.sim).filter((l) => /^\$J=/.test(l));
    jogs.forEach((j) => {
      expect(j).toMatch(/^\$J=G21G91/);
      const x = Math.abs(parseFloat((/X([-\d.]+)/.exec(j) || [0, 0])[1]));
      const y = Math.abs(parseFloat((/Y([-\d.]+)/.exec(j) || [0, 0])[1]));
      expect(Math.hypot(x, y)).toBeLessThanOrEqual(30 * Math.hypot(1, 20 / 30) + 1e-6);
    });
    expect(jogs[jogs.length - 1]).toMatch(/G91X5/);
  });

  test('refuses to jog when the position estimate is untrusted (stale status)', async () => {
    const s = await connected(DC);
    await s.run(s.ctrl.setOrigin());
    s.ctrl._lastStatusAt = -100000;
    s.ctrl._refreshStatus = () => Promise.resolve(Object.assign({}, s.ctrl.status, { wpos: { x: NaN, y: 0, z: 0 } }));
    await expect(s.run(s.ctrl.jog(5, 0))).rejects.toMatchObject({ code: 'position-untrusted' });
    expect(wireLabels(s.sim).filter((l) => /^\$J=/.test(l)).length).toBe(0);
  });

  test('WCO is tracked from G92 immediately and cross-checked with $#', async () => {
    const s = await connected(DC);
    await s.run(s.ctrl.jog(40, 25));
    await settle(s);
    await s.run(s.ctrl.setOrigin());
    expect(s.ctrl.wco.x).toBeCloseTo(40, 2);
    expect(s.ctrl.wco.y).toBeCloseTo(25, 2);
    expect(wireLabels(s.sim)).toContain('$#');
    expect(s.ctrl.wcoVerified).toBe(true);
  });

  test('a disagreeing $# blocks motion until resolved', async () => {
    const s = await connected(DC);
    await s.run(s.ctrl.jog(40, 25));
    await settle(s);
    s.sim.wcoSkew = { x: 1.0 }; // device reports an offset 1 mm different from what we set
    await s.run(s.ctrl.setOrigin());
    expect(s.ctrl.wcoVerified).toBe(false);
    await expect(s.run(s.ctrl.jog(5, 0))).rejects.toMatchObject({ code: 'position-untrusted' });
  });
});
