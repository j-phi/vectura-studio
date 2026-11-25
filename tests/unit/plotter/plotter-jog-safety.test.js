const { connectedWithOrigin, wireLabels, until, assertAllSafe, PlotterController } = require('./plotter-test-helpers.js');

afterEach(() => PlotterController.resetOwnership());

const cancels = (s) => wireLabels(s.sim).filter((l) => l === '0x85').length;

describe('single jog: one in flight', () => {
  test('repeated jog() calls while one is executing are dropped', async () => {
    const s = await connectedWithOrigin();
    const rs = await s.run(Promise.all([s.ctrl.jog(10, 0), s.ctrl.jog(10, 0), s.ctrl.jog(10, 0)]));
    expect(rs.filter((r) => r.sent).length).toBe(1);
    rs.filter((r) => !r.sent).forEach((r) => expect(r.reason).toBe('busy'));
    await until(s.clock, () => s.ctrl.state === 'idle');
    expect(s.sim.getPosition().wpos.x).toBeCloseTo(10, 2);
    const again = await s.run(s.ctrl.jog(10, 0));
    expect(again.sent).toBe(true);
  });

  test('auto-repeat while the first jog is still moving is dropped', async () => {
    const s = await connectedWithOrigin();
    await s.run(s.ctrl.jog(50, 0, 600));
    await s.clock.advance(200);
    const r = await s.run(s.ctrl.jog(50, 0, 600));
    expect(r).toMatchObject({ sent: false, reason: 'busy' });
  });
});

describe('continuous jog lead limit', () => {
  test('commanded target never leads the real position by more than 0.3 s of travel', async () => {
    const s = await connectedWithOrigin();
    const feed = 3000;
    const h = await s.run(s.ctrl.jogContinuousStart({ x: 1, y: 0 }, feed));
    const mmPerS = feed / 60;
    let maxLead = 0;
    for (let i = 0; i < 120; i += 1) {
      await s.clock.advance(25);
      h.keepAlive();
      const loop = s.ctrl._jogLoop;
      if (!loop) break;
      maxLead = Math.max(maxLead, (loop.target.x - s.sim.getPosition().wpos.x) / mmPerS);
    }
    expect(maxLead).toBeLessThanOrEqual(0.3 + 0.02);
    expect(s.sim.getPosition().wpos.x).toBeGreaterThan(50);
    await s.run(s.ctrl.jogContinuousStop());
  });

  test('each jog segment is at most 0.15 s of travel', async () => {
    const s = await connectedWithOrigin();
    const h = await s.run(s.ctrl.jogContinuousStart({ x: 1, y: 0 }, 3000));
    for (let i = 0; i < 40; i += 1) { await s.clock.advance(50); h.keepAlive(); }
    await s.run(s.ctrl.jogContinuousStop());
    const xs = wireLabels(s.sim).filter((l) => /^\$J=/.test(l)).map((l) => parseFloat(/X([-\d.]+)/.exec(l)[1]));
    expect(xs.length).toBeGreaterThan(5);
    xs.forEach((x, i) => expect(x - (i ? xs[i - 1] : 0)).toBeLessThanOrEqual(7.5 + 1e-6));
  });

  test('status is polled at 100 ms or faster while jogging', async () => {
    const s = await connectedWithOrigin();
    const h = await s.run(s.ctrl.jogContinuousStart({ x: 1, y: 0 }, 3000));
    s.sim.clearLog();
    for (let i = 0; i < 10; i += 1) { await s.clock.advance(100); h.keepAlive(); }
    const polls = wireLabels(s.sim).filter((l) => l === '?').length;
    await s.run(s.ctrl.jogContinuousStop());
    expect(polls).toBeGreaterThanOrEqual(9);
  });
});

describe('continuous jog deadman', () => {
  test('without keepAlive the hold is cancelled within 350 ms', async () => {
    const s = await connectedWithOrigin();
    await s.run(s.ctrl.jogContinuousStart({ x: 1, y: 0 }, 3000));
    let t = 0;
    while (!cancels(s) && t < 2000) { await s.clock.advance(10); t += 10; }
    expect(cancels(s)).toBeGreaterThan(0);
    expect(t).toBeLessThanOrEqual(350);
    await until(s.clock, () => s.ctrl.state === 'idle');
    expect(s.sim.getPosition().wpos.x).toBeLessThan(40);
    expect(assertAllSafe(s.sim)).toEqual([]);
  });

  test('keepAlive keeps the hold going; the hard max is 8 s', async () => {
    const s = await connectedWithOrigin();
    const h = await s.run(s.ctrl.jogContinuousStart({ x: 1, y: 0 }, 1200));
    const stops = [];
    s.ctrl.on('jogstop', (p) => stops.push(p.reason));
    let t = 0;
    while (!cancels(s) && t < 12000) { await s.clock.advance(100); h.keepAlive(); t += 100; }
    expect(t).toBeGreaterThan(7000);
    expect(t).toBeLessThanOrEqual(8200);
    expect(stops).toEqual(['max-hold']);
  });
});

// ---- DrawCore jog runaway (relative jogs, trusted position), folded in to keep the unweighted
// shard roster within budget; block-scoped so its top-level names stay local. ----
{
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
}
